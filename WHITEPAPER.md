# How WildBus works: from `subscribe` to `publish`

## The data structure

WildBus is a single trie. Every node has four fields:

```
node
  children: Map<literal-segment, node>   // exact match edges
  plus:     node | null                   // + wildcard (one level)
  hash:     node | null                   // # wildcard (zero or more)
  listeners: Set<fn>                      // subscriber callbacks
```

There is one root node. Wildcard edges are stored as dedicated pointers — not as literal `+` or `#` keys in the children map. This is the central design decision: wildcard traversal is a pointer chase, not a string comparison.

## Subscribe

When you call `bus.subscribe('drums/+', fn)`:

1. Split `'drums/+'` on `/` → `['drums', '+']`
2. Walk from the root:
   - `'drums'` — look in `children.get('drums')`. Missing? Create a node, add it to children.
   - `'+'` — set `node.plus = emptyNode()`. Create a fresh node specifically in the plus slot.
3. Stuff `fn` into the final node's `listeners` set. If `fn` was already in the set (duplicate subscription), this is a no-op — Sets deduplicate.

The return value is an `Unsubscribe` closure. It wraps `trie.remove(topic, fn)` behind a `unsubscribed` boolean flag so calling it twice is harmless. The topic string is captured by the closure, so the caller doesn't need to remember it.

What about `#`? Same logic — `'log/#'` splits to `['log', '#']`, creates `log` in children, then sets `node.hash = emptyNode()`. The `#` node lives in a dedicated slot, not in the children map.

**Listener storage.** A node holds a `Set<Listener>`, not a single listener. This means five different subscribers can listen on `drums/+` and they all live in the same node. The Set guarantees no duplicate calls when a listener subscribes to overlapping patterns.

**Counting.** The trie maintains `_size` as a simple integer. On `add()`, if the Set grew (listener wasn't already there), increment. On `remove()`, if the Set shrunk, decrement. `listenerCount` is O(1) — it reads `_size`.

## Publish

When you call `bus.publish('drums/kick', payload)`:

1. Split `'drums/kick'` on `/` → `['drums', 'kick']`
2. Pop a `Set<Listener>` from the pool (or allocate one if empty)
3. Recursive fan-out from the root, index 0

The recursion works like this:

```
collectRecursive(node, parts, index, result):
  if index >= parts.length:              // end of topic
    result.addAll(node.listeners)         // collect terminal listeners
    if node.hash: result.addAll(...)      // # matches zero remaining levels
    return

  // 3 branches, all explored:

  exact = node.children.get(parts[index])
  if exact: recurse(exact, index + 1)    // literal match, advance

  if node.plus: recurse(node.plus, index + 1)  // + consumes one level

  if node.hash:
    result.addAll(node.hash.listeners)    // # matches zero levels now
    recurse(node.hash, index + 1)         // # can also consume more
```

For `drums/kick` with the demo's subscriptions, the traversal hits:

| Branch | Path | Collects |
|---|---|---|
| exact | root → drums → kick | (none subscribed here) |
| `+` at drums | root → drums → + | `drums/+` subscriber |
| `#` at root | root → # | catch-all subscriber |
| `#` at drums | root → drums → # | `drums/#` subscriber |

Four listeners collected into one Set. A listener subscribed to both `drums/+` and `drums/#` appears once — the Set deduplicates.

**Delivery.** The bus iterates the collected Set. Each listener runs inside a try/catch. If one throws, the error goes to the `onError` handler if configured, otherwise `console.error`. The loop continues — one broken listener doesn't kill the rest.

**Cleanup.** After iteration, the Set clears and returns to the pool. The pool is a plain array used as a stack: pop on entry, push on exit. If a listener re-entrantly calls `publish()`, the inner publish pops (or allocates) its own Set — it never touches the outer one.

## Unsubscribe

Three paths:

**Targeted unsubscribe** — `bus.unsubscribe('drums/+', fn)` walks the trie to the exact node (using `find()`, which follows the same split-and-traverse logic), then calls `listeners.delete(fn)`. Returns `true` if the listener was actually removed. The node itself stays — future publishes still traverse through it.

**Returned Unsubscribe** — `const unsub = bus.subscribe(...)` returns a closure. Call `unsub()` and it does the same targeted removal, then sets a flag so repeat calls are no-ops. This is the primary cleanup mechanism — you never need to hold the topic string.

**RemoveListener** — `bus.removeListener(fn)` does an O(n) scan of every node in the trie, deleting `fn` from any listener set it appears in. Use this when a component unmounts and you want to rip out all its subscriptions in one call without tracking individual unsubscribe handles.

## clear

`bus.clear()` replaces the root with a fresh empty node and sets `_size` to 0. All subscriptions drop. The old trie is garbage-collected by the JS engine. Simpler than walking and deleting — one pointer swap.

## What happens to empty nodes

Nothing. When the last listener is removed from a node, the node stays in the trie. Future publishes still traverse through it, find no listeners, and move on. The overhead is a pointer check. Nodes are only destroyed on `clear()` (full reset) or GC.

For a UI bus with hundreds of topics, the dead-node accumulation is irrelevant. If you had a pathological subscribe/unsubscribe loop creating millions of unique topic patterns, you'd notice — but that's not the use case.

## The type story

The trie is untyped — `Listener<unknown>`. The bus does a cast at the boundary:

```ts
// subscribe: user says Listener<User>, bus casts to Listener<unknown>
subscribe<User>(topic, fn) → trie.add(topic, fn as Listener)

// publish: bus casts back to Listener<User>
publish<User>(topic, payload) → (listener as Listener<User>)(payload, topic)
```

This keeps the trie zero-overhead (no generics on collection) while giving callers typed payloads. The type safety depends on the caller getting `subscribe<Foo>` and `publish<Foo>` to agree — there's no runtime validation. This is the standard TypeScript pattern for event emitters.

## Edge cases

**`#` in the middle of a pattern.** `foo/#/bar` is accepted by the trie — it creates a hash child under `foo`, then a literal `bar` under that. But `#` matches zero or more levels, so `bar` is unreachable. Subscribe to it and nothing will ever fire. Worth validating at the API level, but currently left to the caller.

**Empty topic segments.** `foo//bar` creates an empty-string segment. The trie treats it as a literal — `children.get('')`. `+` and `#` both match it. Weird but deterministic.

**Re-entrant publish.** A listener that calls `publish()` during delivery works correctly. The pooled Set approach means the inner publish gets its own Set. The outer iteration is undisturbed.

**Concurrent publish.** There's no concurrency — JavaScript is single-threaded. `publish()` is synchronous. No locks, no queues, no async.
