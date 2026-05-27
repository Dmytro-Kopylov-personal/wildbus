type Listener = (payload: unknown, topic: string) => void;

interface TrieNode {
  children: Map<string, TrieNode>;
  plus: TrieNode | null; // '+' single-level wildcard
  hash: TrieNode | null; // '#' multi-level wildcard
  listeners: Set<Listener>;
}

function emptyNode(): TrieNode {
  return { children: new Map(), plus: null, hash: null, listeners: new Set() };
}

const SPLIT = /\//;

/** Topic trie with MQTT-style `+` and `#` wildcards. */
export class TopicTrie {
  private root = emptyNode();

  add(topic: string, listener: Listener): void {
    const node = this.ensure(topic);
    node.listeners.add(listener);
  }

  remove(topic: string, listener: Listener): boolean {
    const node = this.find(topic);
    if (!node) return false;
    return node.listeners.delete(listener);
  }

  /** Remove a listener from ALL topics it's subscribed to (O(n) scan). */
  removeListener(listener: Listener): void {
    const stack: TrieNode[] = [this.root];
    while (stack.length) {
      const node = stack.pop()!;
      node.listeners.delete(listener);
      stack.push(...node.children.values());
      if (node.plus) stack.push(node.plus);
      if (node.hash) stack.push(node.hash);
    }
  }

  /** Collect all listeners matching a concrete topic (no wildcards in the topic itself). */
  collect(topic: string): Set<Listener> {
    const parts = topic.split(SPLIT);
    const result = new Set<Listener>();
    this.collectRecursive(this.root, parts, 0, result);
    return result;
  }

  get size(): number {
    let count = 0;
    const stack: TrieNode[] = [this.root];
    while (stack.length) {
      const node = stack.pop()!;
      count += node.listeners.size;
      stack.push(...node.children.values());
      if (node.plus) stack.push(node.plus);
      if (node.hash) stack.push(node.hash);
    }
    return count;
  }

  clear(): void {
    this.root = emptyNode();
  }

  // ── internals ──

  private ensure(topic: string): TrieNode {
    const parts = topic.split(SPLIT);
    let node = this.root;
    for (const part of parts) {
      node = this.ensureChild(node, part);
    }
    return node;
  }

  private ensureChild(parent: TrieNode, part: string): TrieNode {
    if (part === '+') {
      if (!parent.plus) parent.plus = emptyNode();
      return parent.plus;
    }
    if (part === '#') {
      if (!parent.hash) parent.hash = emptyNode();
      return parent.hash;
    }
    let child = parent.children.get(part);
    if (!child) {
      child = emptyNode();
      parent.children.set(part, child);
    }
    return child;
  }

  private find(topic: string): TrieNode | null {
    const parts = topic.split(SPLIT);
    let node: TrieNode | undefined = this.root;
    for (const part of parts) {
      node = this.findChild(node, part);
      if (!node) return null;
    }
    return node;
  }

  private findChild(parent: TrieNode, part: string): TrieNode | undefined {
    if (part === '+') return parent.plus ?? undefined;
    if (part === '#') return parent.hash ?? undefined;
    return parent.children.get(part);
  }

  private collectRecursive(
    node: TrieNode,
    parts: readonly string[],
    index: number,
    result: Set<Listener>,
  ): void {
    if (index >= parts.length) {
      for (const l of node.listeners) result.add(l);
      // # matches zero remaining levels
      if (node.hash) {
        for (const l of node.hash.listeners) result.add(l);
      }
      return;
    }

    const part = parts[index]!;

    // Exact match
    const exact = node.children.get(part);
    if (exact) {
      this.collectRecursive(exact, parts, index + 1, result);
    }

    // '+' matches exactly one level
    if (node.plus) {
      this.collectRecursive(node.plus, parts, index + 1, result);
    }

    // '#' matches zero or more remaining levels — consume rest
    if (node.hash) {
      for (const l of node.hash.listeners) result.add(l);
      // also recurse: # can match this level AND continue
      this.collectRecursive(node.hash, parts, index + 1, result);
    }
  }
}
