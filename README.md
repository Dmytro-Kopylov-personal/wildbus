# wildbus

Typed topic-based pub/sub with MQTT-style wildcards for complex UIs. Zero dependencies.

```ts
import { WildBus } from 'wildbus';

const bus = new WildBus();

// Subscribe with + (single-level) and # (multi-level) wildcards
bus.subscribe<User>('users/+/status', (user, topic) => {
  console.log(`${user.name} changed status`);
});

bus.publish<User>('users/42/status', { id: 42, name: 'Alice' });
```

## Demo

The repo includes an interactive sequencer demo that visualizes topic routing in real time — think drum machine meets pub/sub.

**[Live demo →](https://dmytro-kopylov-personal.github.io/wildbus/)**

```
cd demo && npm install && npm run dev
```

![sequencer demo screenshot](demo/screenshot.png)

- **6 tracks × 16 steps** — each track publishes to a topic (`drums/kick`, `lead/synth`, …)
- **Wildcard subscribers** — watch `drums/+` vs `drums/#` diverge as nested topics fire
- **Live topic tree** — hit-count badges show which branches are hot, paths highlight on each message
- **Counters** — per-track and per-subscriber message tallies
- Click cells while playing, randomize the grid, adjust BPM, or hit spacebar to start/stop

The demo uses wildbus itself — same zero-dependency library, no framework.

## Install

```bash
npm install wildbus
```

## API

### `subscribe<T>(topic, listener) => Unsubscribe`

Register a listener for a topic pattern. Returns a function that unsubscribes when called.

**Wildcards:**
- `+` matches exactly one level (`users/+/status` matches `users/42/status`)
- `#` matches zero or more levels and must be the final segment (`log/#` matches `log`, `log/error`, `log/error/db`)

### `publish<T>(topic, payload)`

Send a payload to all listeners whose subscription matches the topic. If a listener throws, delivery continues to remaining listeners — the error goes to `onError` if configured, or `console.error`.

### `onError(handler)`

Register a handler for listener exceptions: `(err, topic, listener) => void`.

### `unsubscribe(topic, listener)`

Remove a specific listener from a specific topic.

### `removeListener(listener)`

Remove a listener from **all** topics it's subscribed to.

### `listenerCount`

Total number of registration entries.

### `clear()`

Remove all subscriptions.

## How it works

Wildbus stores subscriptions in a **topic trie**. Given these subscriptions:

| subscription | subscriber |
|---|---|
| `drums/+` | single-level wildcard |
| `drums/#` | multi-level wildcard |
| `bass/#` | catch bass subtree |
| `lead/#` | catch lead subtree |
| `#` | catch everything |

The trie looks like this (● = wildcard node with a listener attached):

```mermaid
graph TD
    root(( ))

    root --> drums["drums"]
    root --> bass["bass"]
    root --> lead["lead"]
    root --> all["● #"]

    drums --> dk["kick"]
    drums --> ds["snare"]
    drums --> dh["hihat"]
    drums --> dp["● +"]
    drums --> dh2["● #"]

    dk --> dkv["velocity"]

    bass --> bn["note"]
    bass --> bh["● #"]

    lead --> ls["synth"]
    lead --> lp["pad"]
    lead --> lh["● #"]

    style dp fill:#fbbf24,stroke:#fbbf24,color:#111
    style dh2 fill:#a78bfa,stroke:#a78bfa,color:#fff
    style bh fill:#a78bfa,stroke:#a78bfa,color:#fff
    style lh fill:#a78bfa,stroke:#a78bfa,color:#fff
    style all fill:#a78bfa,stroke:#a78bfa,color:#fff
```

On publish, the trie does a recursive fan-out. At each node it follows three paths:

1. **exact** — `children.get(segment)` if present, advance one level
2. **`+`** — if the node has a `plus` child, recurse into it consuming one level
3. **`#`** — if the node has a `hash` child, collect its listeners (matches zero levels) AND recurse (matches more)

Publishing `drums/kick` hits the exact path (`drums → kick`), the `+` wildcard (`drums → +`), the `drums/#` subscriber, and the root `#` — all in one traversal. Results land in a `Set`, so a listener subscribed to both `drums/+` and `drums/#` only fires once.

The bus wrapper adds type generics, error isolation (one broken listener can't kill delivery), and idempotent unsubscribe.

## Why not EventEmitter?

Wildbus routes by **topic pattern**, not channel name. One publish can hit subscribers on `exact/match`, `category/+`, and `root/#` — all in a single call. That composability is what makes it useful for complex UIs where components care about overlapping slices of the state tree.

## License

MIT
