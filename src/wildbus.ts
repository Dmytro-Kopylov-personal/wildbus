import { TopicTrie } from './trie.js';

type Listener<T = unknown> = (payload: T, topic: string) => void;
type Unsubscribe = () => void;

/** Typed topic-based pub/sub with MQTT-style `+` and `#` wildcards. */
export class WildBus {
  private trie = new TopicTrie();

  /**
   * Subscribe to a topic with wildcards.
   *
   * - `+` matches exactly one level (e.g. `users/+/status`)
   * - `#` matches zero or more levels, must be the final segment (e.g. `users/#`)
   *
   * Returns an unsubscribe function. Unsubscribe is idempotent.
   */
  subscribe<T>(topic: string, listener: Listener<T>): Unsubscribe {
    const fn = listener as Listener;
    this.trie.add(topic, fn);
    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.trie.remove(topic, fn);
    };
  }

  /**
   * Publish a payload to all listeners whose subscription matches `topic`.
   * Generic `T` lets callers type the expected payload.
   * If a listener throws, the error is caught and sent to `onError` — delivery continues.
   */
  publish<T>(topic: string, payload: T): void {
    const listeners = this.trie.collect(topic);
    for (const listener of listeners) {
      try {
        (listener as Listener<T>)(payload, topic);
      } catch (err) {
        if (this._onError) {
          this._onError(err, topic, listener);
        } else {
          // Best-effort: don't let one broken listener break the bus
          console.error(`[wildbus] unhandled error in listener for "${topic}":`, err);
        }
      }
    }
  }

  private _onError: ((err: unknown, topic: string, listener: Listener) => void) | null = null;

  /** Register an error handler for listener exceptions. Replaces any previous handler. */
  onError(handler: (err: unknown, topic: string, listener: Listener) => void): void {
    this._onError = handler;
  }

  /** Remove a specific listener from a specific topic subscription. */
  unsubscribe(topic: string, listener: Listener): boolean {
    return this.trie.remove(topic, listener as Listener);
  }

  /** Remove a listener from ALL topics it's subscribed to. */
  removeListener(listener: Listener): void {
    this.trie.removeListener(listener as Listener);
  }

  /** Total number of listener registrations (not unique listeners). */
  get listenerCount(): number {
    return this.trie.size;
  }

  /** Remove all subscriptions. */
  clear(): void {
    this.trie.clear();
  }
}
