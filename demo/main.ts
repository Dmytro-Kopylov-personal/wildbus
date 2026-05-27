import { WildBus } from '../src/wildbus.js';
import { buildTree, renderTree, type TreeNode } from './tree-viz.js';
import { setupSubscribers, type Subscriber } from './subscribers.js';

const bus = new WildBus();

// ── state ──

let messageCount = 0;
const subs: Subscriber[] = [];
const topicSet = new Set<string>();

// ── DOM ──

const treeContainer = document.getElementById('tree-container')!;
const subGrid = document.getElementById('subscriber-grid')!;
const statListeners = document.getElementById('stat-listeners')!;
const statMessages = document.getElementById('stat-messages')!;
const statTopic = document.getElementById('stat-topic')!;
const pubTopic = document.getElementById('pub-topic') as HTMLInputElement;
const pubPayload = document.getElementById('pub-payload') as HTMLInputElement;
const pubBtn = document.getElementById('pub-btn')!;

// ── toast ──

function toast(msg: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ── flash subscriber card ──

function flashCard(topic: string) {
  const card = document.querySelector(`.subscriber-card[data-topic="${CSS.escape(topic)}"]`);
  if (!card) return;
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 350);
}

// ── flash tree nodes ──

function flashTreeNodes(publishedTopic: string) {
  const parts = publishedTopic.split('/');
  const paths: string[] = [];
  for (let i = 0; i <= parts.length; i++) {
    paths.push(parts.slice(0, i).join('/') || 'root');
  }

  // First clear all active nodes
  document.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));

  // Highlight the matching path
  for (const path of paths) {
    const node = document.querySelector(`.tree-node[data-path="${CSS.escape(path)}"]`);
    if (node) {
      node.classList.add('active');
      setTimeout(() => node.classList.remove('active'), 800);
    }
  }
}

// ── render tree ──

function updateTree() {
  const root = buildTree(topicSet);
  renderTree(treeContainer, root);
}

// ── render subscribers ──

function updateSubscribers() {
  subGrid.innerHTML = subs
    .map(
      (s) => `
    <div class="subscriber-card" data-topic="${s.topic.replace(/"/g, '&quot;')}">
      <span class="card-icon">${s.icon}</span>
      <div class="card-topic">${s.topic}</div>
      <div class="card-last">waiting…</div>
    </div>`
    )
    .join('');
}

// ── update stats ──

function updateStats(topic?: string) {
  statListeners.textContent = String(bus.listenerCount);
  statMessages.textContent = String(messageCount);
  if (topic) {
    statTopic.textContent = topic;
    statTopic.classList.add('hit');
    setTimeout(() => statTopic.classList.remove('hit'), 300);
  }
}

// ── publish ──

function doPublish(topic: string, payload: string) {
  messageCount++;
  bus.publish(topic, payload);
  flashTreeNodes(topic);
  updateStats(topic);
  toast(`${topic} → ${payload}`);
}

// ── init ──

setupSubscribers(bus, subs, (topic) => flashCard(topic));
subs.forEach((s) => topicSet.add(s.topic));
updateTree();
updateSubscribers();
updateStats();

// ── events ──

pubBtn.addEventListener('click', () => {
  const topic = pubTopic.value.trim();
  const payload = pubPayload.value.trim();
  if (!topic || !payload) return;
  doPublish(topic, payload);
  pubPayload.value = '';
  pubPayload.focus();
});

pubPayload.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pubBtn.click();
});

document.getElementById('presets')!.addEventListener('click', (e) => {
  const btn = e.target as HTMLButtonElement;
  if (btn.tagName !== 'BUTTON') return;

  if (btn.id === 'preset-burst') {
    const messages = [
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
  pubPayload.focus();
});
