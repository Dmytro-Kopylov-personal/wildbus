import { describe, it, expect, vi } from 'vitest';
import { WildBus } from '../src/wildbus.js';

describe('WildBus', () => {
  describe('publish / subscribe', () => {
    it('delivers to an exact match', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('sensors/kitchen/temp', fn);
      bus.publish('sensors/kitchen/temp', 42);
      expect(fn).toHaveBeenCalledWith(42, 'sensors/kitchen/temp');
    });

    it('does not deliver to non-matching topics', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('sensors/kitchen/temp', fn);
      bus.publish('sensors/bathroom/temp', 42);
      expect(fn).not.toHaveBeenCalled();
    });

    it('returns unsubscribe that works', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      const unsub = bus.subscribe('foo', fn);
      unsub();
      bus.publish('foo', 1);
      expect(fn).not.toHaveBeenCalled();
    });

    it('unsubscribe is idempotent', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      const unsub = bus.subscribe('foo', fn);
      unsub();
      unsub(); // second call should not throw
      bus.publish('foo', 1);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('+ wildcard (single-level)', () => {
    it('matches any single level', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('sensors/+/temp', fn);
      bus.publish('sensors/kitchen/temp', 100);
      expect(fn).toHaveBeenCalledWith(100, 'sensors/kitchen/temp');
    });

    it('does not match multiple levels', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('sensors/+/temp', fn);
      bus.publish('sensors/floor1/kitchen/temp', 100);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('# wildcard (multi-level)', () => {
    it('matches zero additional levels', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('sensors/#', fn);
      bus.publish('sensors', 1);
      expect(fn).toHaveBeenCalledWith(1, 'sensors');
    });

    it('matches one additional level', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('sensors/#', fn);
      bus.publish('sensors/kitchen', 1);
      expect(fn).toHaveBeenCalledWith(1, 'sensors/kitchen');
    });

    it('matches many additional levels', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('sensors/#', fn);
      bus.publish('sensors/floor1/kitchen/temp', 1);
      expect(fn).toHaveBeenCalledWith(1, 'sensors/floor1/kitchen/temp');
    });

    it('bare # matches everything', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('#', fn);
      bus.publish('anything/at/all', 'data');
      expect(fn).toHaveBeenCalledWith('data', 'anything/at/all');
    });
  });

  describe('multiple subscribers', () => {
    it('delivers to all matching subscriptions', () => {
      const bus = new WildBus();
      const a = vi.fn();
      const b = vi.fn();
      const c = vi.fn();

      bus.subscribe('sensors/+/temp', a);
      bus.subscribe('sensors/kitchen/temp', b);
      bus.subscribe('sensors/#', c);

      bus.publish('sensors/kitchen/temp', 42);

      expect(a).toHaveBeenCalledWith(42, 'sensors/kitchen/temp');
      expect(b).toHaveBeenCalledWith(42, 'sensors/kitchen/temp');
      expect(c).toHaveBeenCalledWith(42, 'sensors/kitchen/temp');
    });

    it('deduplicates when same listener is subscribed multiple times', () => {
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe('sensors/+', fn);
      bus.subscribe('sensors/#', fn);

      bus.publish('sensors/kitchen', 1);
      // fn appears twice but both match — Set deduplicates
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('typing', () => {
    it('supports typed payloads', () => {
      interface User { id: number; name: string }
      const bus = new WildBus();
      const fn = vi.fn();
      bus.subscribe<User>('users/+', fn);
      bus.publish<User>('users/42', { id: 42, name: 'Alice' });
      expect(fn).toHaveBeenCalledWith({ id: 42, name: 'Alice' }, 'users/42');
    });
  });

  describe('error handling', () => {
    it('continues delivery after a listener throws', () => {
      const bus = new WildBus();
      const bad = () => { throw new Error('boom'); };
      const good = vi.fn();

      bus.subscribe('foo', bad);
      bus.subscribe('foo', good);
      bus.publish('foo', 1);

      expect(good).toHaveBeenCalled();
    });

    it('calls onError when a listener throws', () => {
      const bus = new WildBus();
      const errorHandler = vi.fn();
      bus.onError(errorHandler);

      const err = new Error('boom');
      const bad = () => { throw err; };
      bus.subscribe('foo', bad);
      bus.publish('foo', 1);

      expect(errorHandler).toHaveBeenCalledWith(err, 'foo', expect.any(Function));
    });
  });

  describe('listenerCount', () => {
    it('tracks the number of listener registrations', () => {
      const bus = new WildBus();
      expect(bus.listenerCount).toBe(0);

      const a = vi.fn();
      const b = vi.fn();
      bus.subscribe('a', a);
      bus.subscribe('b', b);
      expect(bus.listenerCount).toBe(2);

      bus.unsubscribe('a', a);
      expect(bus.listenerCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all subscriptions', () => {
      const bus = new WildBus();
      bus.subscribe('foo', vi.fn());
      bus.subscribe('bar/+', vi.fn());
      bus.clear();
      expect(bus.listenerCount).toBe(0);
    });
  });
});
