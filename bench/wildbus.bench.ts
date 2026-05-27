import { WildBus } from '../src/wildbus.js';

// ── helpers ──

function bench(name: string, fn: () => void, iterations = 100_000) {
  // Warmup
  for (let i = 0; i < iterations / 10; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;

  const opsPerSec = (iterations / elapsed * 1000).toFixed(0);
  const avgUs = (elapsed / iterations * 1000).toFixed(2);
  return { name, opsPerSec, avgUs, elapsed };
}

function report(r: ReturnType<typeof bench>) {
  console.log(`  ${r.name.padEnd(40)} ${r.opsPerSec.padStart(7)} ops/s  ${r.avgUs.padStart(6)} µs/op`);
}

// ── scenarios ──

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  settings: Record<string, unknown>;
}

console.log('\n=== publish: exact match ===\n');

{
  const bus = new WildBus();
  const noop = () => {};
  bus.subscribe('users/profile/update', noop);

  report(bench('exact match (1 sub)', () => {
    bus.publish('users/profile/update', { id: 1 });
  }));

  bus.subscribe('users/profile/update', noop);
  bus.subscribe('users/profile/update', noop);
  bus.subscribe('users/profile/update', noop);
  bus.subscribe('users/profile/update', noop);

  report(bench('exact match (5 subs)', () => {
    bus.publish('users/profile/update', { id: 1 });
  }));
}

console.log('\n=== publish: wildcard fan-out ===\n');

{
  const bus = new WildBus();
  const noop = () => {};

  // Simulate a realistic UI subscription set
  bus.subscribe('users/+/status', noop);       // single-level
  bus.subscribe('users/#', noop);               // multi-level
  bus.subscribe('#', noop);                     // catch-all
  bus.subscribe('notifications/+/alert', noop); // unrelated
  bus.subscribe('notifications/#', noop);       // unrelated

  report(bench('wildcard fan-out (5 pats, 1 exact)', () => {
    bus.publish('users/profile/status', { id: 1 });
  }));

  // More subscribers on overlapping patterns
  for (let i = 0; i < 20; i++) {
    bus.subscribe(`users/${i}/status`, noop);
    bus.subscribe('users/+/profile', noop);
  }

  report(bench('wildcard fan-out (45 subs, 3 levels)', () => {
    bus.publish('users/profile/status', { id: 1 });
  }));
}

console.log('\n=== publish: deep topic ===\n');

{
  const bus = new WildBus();
  const noop = () => {};
  bus.subscribe('a/b/c/d/e/f/g/h', noop);
  bus.subscribe('a/b/c/+/e/#', noop);
  bus.subscribe('#', noop);

  report(bench('deep topic (8 levels, 3 subs)', () => {
    bus.publish('a/b/c/d/e/f/g/h', { id: 1 });
  }));
}

console.log('\n=== subscribe / unsubscribe ===\n');

{
  const bus = new WildBus();
  report(bench('subscribe', () => {
    const unsub = bus.subscribe(`topic/${Math.random()}`, () => {});
    unsub(); // measure both subscribe + unsubscribe
  }, 10_000));
}

console.log('\n=== listenerCount (large tree) ===\n');

{
  const bus = new WildBus();
  const noop = () => {};
  // Build a busier tree
  for (const a of ['users', 'posts', 'comments', 'notifications', 'settings']) {
    for (const b of ['create', 'update', 'delete', 'read', 'list']) {
      bus.subscribe(`${a}/${b}`, noop);
      bus.subscribe(`${a}/+/${b}`, noop);
    }
  }
  bus.subscribe('#', noop);

  // listenerCount walks the whole trie
  let count = 0;
  report(bench('listenerCount (51 entries)', () => {
    count = bus.listenerCount;
  }, 10_000));
  console.log(`  (count = ${count})`);
}

console.log('\n=== typed payload ===\n');

{
  const bus = new WildBus();
  const payload: User = {
    id: 42,
    name: 'Alice',
    email: 'alice@example.com',
    role: 'admin',
    settings: { theme: 'dark', notifications: true, lang: 'en' },
  };

  bus.subscribe<User>('users/+', () => {});

  report(bench('typed publish (User payload)', () => {
    bus.publish<User>('users/42', payload);
  }));
}

console.log('\n=== GC pressure: many publishes with Set allocation ===\n');

{
  const bus = new WildBus();
  const noop = () => {};
  for (let i = 0; i < 20; i++) {
    bus.subscribe(`topic/${i}`, noop);
    bus.subscribe(`topic/+`, noop);
    bus.subscribe('#', noop);
  }

  report(bench('many pubs (10k, 60 subs)', () => {
    for (let i = 0; i < 10_000; i++) {
      bus.publish(`topic/${i % 20}`, i);
    }
  }, 10)); // 10 iterations of 10k each = 100k total
}

console.log('');
