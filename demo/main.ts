import { WildBus } from '../src/wildbus.js';
import { buildTree, renderTree } from './tree-viz.js';
import type { Subscriber } from './subscribers.js';

// ── icons for auto-assignment ──

const ICONS = ['🖥', '🌡', '📡', '🚨', '📋', '🌐', '🔥', '🧠', '💾', '📶', '👤', '🔔', '⚙️', '📊', '🗄', '🔐', '💬', '🕐'];

function randomIcon(): string {
  return ICONS[Math.floor(Math.random() * ICONS.length)]!;
}

// ── state ──

const bus = new WildBus();
let messageCount = 0;
const subs: Subscriber[] = [];
const topicSet = new Set<string>();
const unsubFns = new Map<string, () => void>();

let autoTimer: ReturnType<typeof setInterval> | null = null;
let autoSpeed = 800; // ms between publishes

// ── auto-mode data ──

const AUTO_TOPICS = [
  'system/cpu', 'system/memory', 'system/disk', 'system/network',
  'sensors/kitchen/temp', 'sensors/kitchen/humidity',
  'sensors/living/temp', 'sensors/living/humidity',
  'sensors/bedroom/temp', 'sensors/bedroom/humidity',
  'sensors/bathroom/temp', 'sensors/bathroom/humidity',
  'logs/info/db', 'logs/info/http', 'logs/info/auth',
  'logs/warn/db', 'logs/warn/cache',
  'logs/error/db', 'logs/error/http', 'logs/error/auth',
  'users/1/activity', 'users/2/activity', 'users/3/activity',
  'users/1/status', 'users/2/status',
  'notifications/email', 'notifications/sms', 'notifications/push',
];

function randomPayload(topic: string): string {
  if (topic.startsWith('system/cpu')) return `${20 + Math.floor(Math.random() * 80)}%`;
  if (topic.startsWith('system/memory')) return `${(Math.random() * 16).toFixed(1)} GB`;
  if (topic.startsWith('system/disk')) return `${(Math.random() * 500).toFixed(0)} GB free`;
  if (topic.startsWith('system/network')) return `${(Math.random() * 1000).toFixed(0)} Mbps`;
  if (topic.includes('/temp')) return `${(15 + Math.random() * 15).toFixed(1)}°C`;
  if (topic.includes('/humidity')) return `${(30 + Math.random() * 50).toFixed(0)}%`;
  if (topic.startsWith('logs/error')) return ['timeout', 'connection refused', 'quota exceeded', 'invalid token', 'deadlock detected'][Math.floor(Math.random() * 5)]!;
  if (topic.startsWith('logs/warn')) return ['slow query', 'cache miss', 'retry 3/5', 'memory pressure', 'gc pause'][Math.floor(Math.random() * 5)]!;
  if (topic.startsWith('logs/info')) return ['GET 200', 'POST 201', 'connected', 'sync complete', 'health OK'][Math.floor(Math.random() * 5)]!;
  if (topic.startsWith('users/') && topic.endsWith('/activity')) return ['login', 'logout', 'pageview', 'click', 'scroll'][Math.floor(Math.random() * 5)]!;
  if (topic.startsWith('users/') && topic.endsWith('/status')) return ['online', 'idle', 'offline'][Math.floor(Math.random() * 3)]!;
  if (topic.startsWith('notifications')) return ['sent', 'delivered', 'read', 'bounced'][Math.floor(Math.random() * 4)]!;
  return 'OK';
}

// ── DOM ──

const treeContainer = document.getElementById('tree-container')!;
const subGrid = document.getElementById('subscriber-grid')!;
const statListeners = document.getElementById('stat-listeners')!;
const statMessages = document.getElementById('stat-messages')!;
const statTopic = document.getElementById('stat-topic')!;
const pubTopic = document.getElementById('pub-topic') as HTMLInputElement;
const pubPayload = document.getElementById('pub-payload') as HTMLInputElement;
const pubBtn = document.getElementById('pub-btn')!;
const addBtn = document.getElementById('add-sub-btn')!;
const addRow = document.getElementById('add-sub-row')!;
const addTopic = document.getElementById('add-sub-topic') as HTMLInputElement;
const addIcon = document.getElementById('add-sub-icon') as HTMLInputElement;
const addConfirm = document.getElementById('add-sub-confirm')!;
const addCancel = document.getElementById('add-sub-cancel')!;
const autoBtn = document.getElementById('auto-btn')!;
const autoSpeedInput = document.getElementById('auto-speed') as HTMLInputElement;

// ── toast ──

function toast(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ── flash ──

function flashCard(subscriberTopic: string) {
  const card = document.querySelector(`.subscriber-card[data-topic="${CSS.escape(subscriberTopic)}"]`);
  if (!card) return;
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 350);
}

function flashTreeNodes(publishedTopic: string) {
  const parts = publishedTopic.split('/');
  document.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
  for (let i = 0; i <= parts.length; i++) {
    const path = parts.slice(0, i).join('/') || 'root';
    const node = document.querySelector(`.tree-node[data-path="${CSS.escape(path)}"]`);
    if (node) {
      node.classList.add('active');
      setTimeout(() => node.classList.remove('active'), 800);
    }
  }
}

// ── render ──

function updateTree() {
  const root = buildTree(topicSet);
  renderTree(treeContainer, root);
}

function updateSubscribers() {
  subGrid.innerHTML = subs
    .map(
      (s, i) => `
    <div class="subscriber-card" data-topic="${s.topic.replace(/"/g, '&quot;')}">
      <button class="card-remove" data-index="${i}" title="remove">×</button>
      <span class="card-icon">${s.icon}</span>
      <div class="card-topic">${s.topic}</div>
      <div class="card-last">waiting…</div>
    </div>`
    )
    .join('');

  // wire remove buttons
  subGrid.querySelectorAll('.card-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number((btn as HTMLElement).dataset.index);
      removeSubscriber(idx);
    });
  });
}

function updateStats(topic?: string) {
  statListeners.textContent = String(bus.listenerCount);
  statMessages.textContent = String(messageCount);
  if (topic) {
    statTopic.textContent = topic;
    statTopic.classList.add('hit');
    setTimeout(() => statTopic.classList.remove('hit'), 300);
  }
}

// ── subscriber management ──

function addSubscriber(topic: string, icon?: string) {
  topic = topic.trim();
  if (!topic || topicSet.has(topic)) return;

  const iconStr = icon || randomIcon();
  const unsub = bus.subscribe(topic, (_payload: unknown, srcTopic: string) => {
    flashCard(topic);
    const card = document.querySelector(`.subscriber-card[data-topic="${CSS.escape(topic)}"]`);
    if (card) {
      const lastEl = card.querySelector('.card-last');
      if (lastEl) {
        lastEl.innerHTML = `<span class="val">${typeof _payload === 'string' ? _payload : JSON.stringify(_payload)}</span> ← <span class="src">${srcTopic}</span>`;
      }
    }
  });

  unsubFns.set(topic, unsub);
  subs.push({ topic, icon: iconStr });
  topicSet.add(topic);
  updateTree();
  updateSubscribers();
  updateStats();
}

function removeSubscriber(index: number) {
  const sub = subs[index];
  if (!sub) return;
  unsubFns.get(sub.topic)?.();
  unsubFns.delete(sub.topic);
  subs.splice(index, 1);
  topicSet.delete(sub.topic);
  updateTree();
  updateSubscribers();
  updateStats();
}

function seedSubscribers(defs: Subscriber[]) {
  for (const def of defs) {
    if (topicSet.has(def.topic)) continue;
    const unsub = bus.subscribe(def.topic, (_payload: unknown, srcTopic: string) => {
      flashCard(def.topic);
      const card = document.querySelector(`.subscriber-card[data-topic="${CSS.escape(def.topic)}"]`);
      if (card) {
        const lastEl = card.querySelector('.card-last');
        if (lastEl) {
          lastEl.innerHTML = `<span class="val">${typeof _payload === 'string' ? _payload : JSON.stringify(_payload)}</span> ← <span class="src">${srcTopic}</span>`;
        }
      }
    });
    unsubFns.set(def.topic, unsub);
    subs.push(def);
    topicSet.add(def.topic);
  }
  updateTree();
  updateSubscribers();
  updateStats();
}

// ── publish ──

function doPublish(topic: string, payload: string) {
  messageCount++;
  bus.publish(topic, payload);
  flashTreeNodes(topic);
  updateStats(topic);
}

// ── auto mode ──

function startAuto() {
  if (autoTimer) return;
  autoBtn.textContent = '⏸ stop auto';
  autoBtn.classList.add('running');
  autoTimer = setInterval(() => {
    const topic = AUTO_TOPICS[Math.floor(Math.random() * AUTO_TOPICS.length)]!;
    const payload = randomPayload(topic);
    doPublish(topic, payload);
  }, autoSpeed);
}

function stopAuto() {
  if (!autoTimer) return;
  clearInterval(autoTimer);
  autoTimer = null;
  autoBtn.textContent = '▶ auto mode';
  autoBtn.classList.remove('running');
}

function toggleAuto() {
  if (autoTimer) stopAuto();
  else startAuto();
}

// ── init ──

// seed with initial subscribers that demo wildcards well
seedSubscribers([
  { topic: 'system/+', icon: '🖥' },
  { topic: 'system/cpu', icon: '🔥' },
  { topic: 'system/memory', icon: '🧠' },
  { topic: 'sensors/+/temp', icon: '🌡' },
  { topic: 'sensors/#', icon: '📡' },
  { topic: 'logs/error/#', icon: '🚨' },
  { topic: 'logs/#', icon: '📋' },
  { topic: '#', icon: '🌐' },
]);

// ── events ──

pubBtn.addEventListener('click', () => {
  const topic = pubTopic.value.trim();
  const payload = pubPayload.value.trim();
  if (!topic || !payload) return;
  doPublish(topic, payload);
  pubTopic.select();
  pubPayload.select();
});

pubPayload.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pubBtn.click();
});

// add subscriber UI

addBtn.addEventListener('click', () => {
  addRow.style.display = 'flex';
  addTopic.focus();
});

addCancel.addEventListener('click', () => {
  addRow.style.display = 'none';
  addTopic.value = '';
  addIcon.value = '';
});

addConfirm.addEventListener('click', () => {
  const topic = addTopic.value.trim();
  if (!topic) return;
  addSubscriber(topic, addIcon.value.trim() || undefined);
  addTopic.value = '';
  addIcon.value = '';
  addRow.style.display = 'none';
});

addTopic.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addConfirm.click();
});

// auto mode

autoBtn.addEventListener('click', toggleAuto);

autoSpeedInput.addEventListener('change', () => {
  autoSpeed = Math.max(100, Number(autoSpeedInput.value) || 800);
  if (autoTimer) {
    stopAuto();
    startAuto();
  }
});

// presets

document.getElementById('presets')!.addEventListener('click', (e) => {
  const btn = e.target as HTMLButtonElement;
  if (btn.tagName !== 'BUTTON') return;

  if (btn.id === 'preset-burst') {
    const messages: [string, string][] = [
      ['system/cpu', '94%'],
      ['system/cpu', '97% spike'],
      ['system/memory', '7.1 GB'],
      ['sensors/kitchen/temp', '24.1°C'],
      ['sensors/living/temp', '21.5°C'],
      ['logs/error/db', 'pool exhausted'],
      ['logs/info/http', 'POST /api 201'],
      ['logs/error/db', 'retry failed'],
      ['system/cpu', '62%'],
    ];
    let delay = 0;
    for (const [topic, payload] of messages) {
      setTimeout(() => doPublish(topic!, payload!), delay);
      delay += 120;
    }
    return;
  }

  const topic = btn.dataset.topic!;
  const payload = btn.dataset.payload!;
  pubTopic.value = topic;
  pubPayload.value = payload;
  doPublish(topic, payload);
});
