import { WildBus } from '../src/wildbus.js';
import { buildTree, renderTree } from './tree-viz.js';

// ── sequencer config ──

const STEPS = 16;
const WATERFALL_SIZE = 8;

interface Track {
  topic: string;
  label: string;
  color: string;
  steps: boolean[];
  payload: string;
}

const TRACKS: Track[] = [
  { topic: 'drums/kick',            label: 'kick',     color: 'var(--red)',    steps: [], payload: 'boom' },
  { topic: 'drums/snare',           label: 'snare',    color: 'var(--orange)', steps: [], payload: 'clap' },
  { topic: 'drums/hihat',           label: 'hihat',    color: 'var(--yellow)', steps: [], payload: 'tss' },
  { topic: 'drums/kick/velocity',   label: 'vel',      color: 'var(--pink)',   steps: [], payload: '127' },
  { topic: 'bass/note',             label: 'bass',     color: 'var(--cyan)',   steps: [], payload: 'C2' },
  { topic: 'lead/synth',            label: 'synth',    color: 'var(--accent)', steps: [], payload: 'saw' },
  { topic: 'lead/pad',              label: 'pad',      color: 'var(--purple)', steps: [], payload: 'warm' },
];

for (const t of TRACKS) {
  t.steps = new Array(STEPS).fill(false);
}

interface SubDef {
  topic: string;
  color: string;
}

const SUBS: SubDef[] = [
  { topic: 'drums/+',   color: 'var(--red)' },
  { topic: 'drums/#',   color: 'var(--orange)' },
  { topic: 'bass/#',    color: 'var(--cyan)' },
  { topic: 'lead/#',    color: 'var(--accent)' },
  { topic: '#',         color: 'var(--purple)' },
];

// ── state ──

const bus = new WildBus();
const topicSet = new Set<string>();
let currentStep = 0;
let playing = false;
let timer: ReturnType<typeof setInterval> | null = null;
let bpm = 120;
let totalMessages = 0;
const trackCounts = new Array(TRACKS.length).fill(0);
const subCounts = new Array(SUBS.length).fill(0);
const treeHitCounts = new Map<string, number>();

interface WaterfallEntry {
  src: string;
  payload: string;
  time: number;
}
const subWaterfalls: WaterfallEntry[][] = SUBS.map(() => []);
const colPayloads: string[] = new Array(STEPS).fill('').map((_, i) => String(i + 1));

// ── DOM refs ──

const treeContainer = document.getElementById('tree-container')!;
const rowLabels = document.getElementById('row-labels')!;
const stepNumbers = document.getElementById('step-numbers')!;
const grid = document.getElementById('grid')!;
const subList = document.getElementById('subscriber-list')!;
const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear')!;
const btnRandom = document.getElementById('btn-random')!;
const bpmInput = document.getElementById('bpm-input') as HTMLInputElement;
const stepIndicator = document.getElementById('step-indicator')!;

// ── build UI ──

function buildRowLabels() {
  rowLabels.innerHTML = TRACKS.map((t, i) =>
    `<div class="row-label row-${i}" data-row="${i}">
      <span class="dot" style="background:${t.color}"></span>
      <span class="row-label-text">${t.label}</span>
      <input class="row-payload" id="row-payload-${i}" value="${t.payload.replace(/"/g, '&quot;')}" title="payload" spellcheck="false" />
      <span class="row-count" id="row-count-${i}">0</span>
    </div>`
  ).join('');

  // wire payload inputs
  rowLabels.querySelectorAll('.row-payload').forEach(inp => {
    inp.addEventListener('input', () => {
      const ri = Number((inp as HTMLElement).dataset.row);
      TRACKS[ri]!.payload = (inp as HTMLInputElement).value;
    });
    inp.addEventListener('click', (e) => e.stopPropagation());
  });
}

function buildStepNumbers() {
  stepNumbers.innerHTML = new Array(STEPS).fill(0).map((_, i) =>
    `<div class="step-col" data-step="${i}">
      <input class="col-payload" id="col-payload-${i}" value="${colPayloads[i]}" title="column payload" spellcheck="false" />
      <div class="step-num">${i + 1}</div>
    </div>`
  ).join('');

  // wire column payload inputs
  stepNumbers.querySelectorAll('.col-payload').forEach(inp => {
    inp.addEventListener('input', () => {
      const ci = Number((inp as HTMLElement).dataset.step);
      colPayloads[ci] = (inp as HTMLInputElement).value;
    });
    inp.addEventListener('click', (e) => e.stopPropagation());
  });
}

function buildGrid() {
  grid.innerHTML = TRACKS.map((t, ri) =>
    `<div class="grid-row row-${ri}" data-row="${ri}">
      ${t.steps.map((on, ci) =>
        `<div class="grid-cell${on ? ' on' : ''}" data-row="${ri}" data-step="${ci}"></div>`
      ).join('')}
    </div>`
  ).join('');
}

function buildSubChips() {
  subList.innerHTML = SUBS.map((s, i) =>
    `<div class="sub-chip sub-${i}" data-topic="${s.topic.replace(/"/g, '&quot;')}">
      <div class="chip-dot-row">
        <span class="dot" style="background:${s.color}"></span>
        <span class="chip-topic">${s.topic}</span>
        <span class="chip-count" id="sub-count-${i}">0</span>
      </div>
      <div class="waterfall" id="waterfall-${i}"></div>
    </div>`
  ).join('');
}

function renderWaterfall(subIndex: number) {
  const container = document.getElementById(`waterfall-${subIndex}`);
  if (!container) return;
  const entries = subWaterfalls[subIndex]!;
  container.innerHTML = entries
    .slice(0, WATERFALL_SIZE)
    .map((e, j) =>
      `<div class="wf-entry${j === 0 ? ' wf-fresh' : ''}" style="opacity:${1 - j * 0.1}">
        <span class="wf-src">${e.src}</span>
        <span class="wf-payload">${e.payload}</span>
      </div>`
    ).join('');
}

function updateTopicSet() {
  topicSet.clear();
  for (const t of TRACKS) topicSet.add(t.topic);
  for (const s of SUBS) topicSet.add(s.topic);
}

// ── tree ──

function updateTree() {
  const root = buildTree(topicSet);
  renderTree(treeContainer, root, treeHitCounts);
}

function flashTreeNodes(publishedTopic: string) {
  const parts = publishedTopic.split('/');
  for (let i = 0; i <= parts.length; i++) {
    const path = parts.slice(0, i).join('/') || 'root';
    treeHitCounts.set(path, (treeHitCounts.get(path) ?? 0) + 1);
  }
  updateTree();
  for (let i = 0; i <= parts.length; i++) {
    const path = parts.slice(0, i).join('/') || 'root';
    const node = document.querySelector(`.tree-node[data-path="${CSS.escape(path)}"]`);
    if (node) {
      node.classList.add('active');
      setTimeout(() => node.classList.remove('active'), 600);
    }
  }
}

// ── subscribers ──

function flashSub(topic: string, srcTopic: string, payload: string, subIndex: number) {
  subCounts[subIndex]++;

  // push to waterfall
  const wf = subWaterfalls[subIndex]!;
  wf.unshift({
    src: srcTopic.split('/').pop() || srcTopic,
    payload,
    time: Date.now(),
  });
  if (wf.length > WATERFALL_SIZE * 2) wf.length = WATERFALL_SIZE * 2;

  // update count
  const countEl = document.getElementById(`sub-count-${subIndex}`);
  if (countEl) countEl.textContent = String(subCounts[subIndex]);

  // re-render waterfall
  renderWaterfall(subIndex);

  // flash
  const chip = document.querySelector(`.sub-chip[data-topic="${CSS.escape(topic)}"]`);
  if (chip) {
    chip.classList.add('flash');
    setTimeout(() => chip.classList.remove('flash'), 250);
  }
}

// ── counters ──

function updateTrackCounter(ri: number) {
  const el = document.getElementById(`row-count-${ri}`);
  if (el) el.textContent = String(trackCounts[ri]);
}

function updateTotalCounter() {
  stepIndicator.textContent = `msgs ${totalMessages} · step ${currentStep + 1} / ${STEPS}`;
}

// ── row labels ──

function flashRowLabel(ri: number) {
  const label = document.querySelector(`.row-label[data-row="${ri}"]`);
  if (!label) return;
  label.classList.add('firing');
  setTimeout(() => label.classList.remove('firing'), 100);
}

// ── playhead ──

function movePlayhead(step: number, advance: boolean) {
  grid.querySelectorAll('.grid-cell.playhead').forEach(c => c.classList.remove('playhead'));
  document.querySelectorAll('.step-num.active').forEach(n => n.classList.remove('active'));

  const cells = grid.querySelectorAll(`.grid-cell[data-step="${step}"]`);
  cells.forEach(c => {
    c.classList.add('playhead');
    if (advance) {
      c.classList.add('playhead-advance');
      setTimeout(() => c.classList.remove('playhead-advance'), 100);
    }
  });

  const num = document.querySelector(`.step-num[data-step="${step}"]`);
  if (num) num.classList.add('active');
}

// ── sequencer tick ──

let lastTickTime = 0;

function tick(step: number) {
  const now = performance.now();
  const advance = lastTickTime > 0;
  lastTickTime = now;

  currentStep = step;
  movePlayhead(step, advance);

  for (let ri = 0; ri < TRACKS.length; ri++) {
    const track = TRACKS[ri]!;
    if (track.steps[step]) {
      totalMessages++;
      trackCounts[ri]++;
      const payload = `${track.payload} ${colPayloads[step]}`;
      bus.publish(track.topic, payload);
      flashTreeNodes(track.topic);
      flashRowLabel(ri);
      updateTrackCounter(ri);
    }
  }
  updateTotalCounter();

  currentStep = (step + 1) % STEPS;
}

// ── transport ──

function stepIntervalMs(): number {
  return (60000 / bpm) / 4;
}

function start() {
  if (playing) return;
  playing = true;
  btnPlay.classList.add('playing');
  btnPlay.textContent = '❚❚';
  lastTickTime = 0;
  tick(currentStep);
  timer = setInterval(() => tick(currentStep), stepIntervalMs());
}

function stop() {
  if (!playing) return;
  playing = false;
  btnPlay.classList.remove('playing');
  btnPlay.textContent = '▶';
  if (timer) { clearInterval(timer); timer = null; }
  movePlayhead(-1, false);
  stepIndicator.textContent = `msgs ${totalMessages} · stopped`;
  document.querySelectorAll('.grid-cell.playhead').forEach(c => c.classList.remove('playhead'));
  document.querySelectorAll('.step-num.active').forEach(n => n.classList.remove('active'));
}

function restartTimer() {
  if (!playing) return;
  if (timer) clearInterval(timer);
  timer = setInterval(() => tick(currentStep), stepIntervalMs());
}

// ── grid actions ──

function clearGrid() {
  for (const t of TRACKS) t.steps.fill(false);
  buildGrid();
}

function randomGrid() {
  const density = 0.3;
  for (const t of TRACKS) {
    for (let i = 0; i < STEPS; i++) {
      t.steps[i] = Math.random() < density;
    }
  }
  buildGrid();
}

// ── events ──

btnPlay.addEventListener('click', () => {
  if (playing) stop(); else start();
});

btnStop.addEventListener('click', stop);

btnClear.addEventListener('click', () => {
  if (playing) stop();
  clearGrid();
});

btnRandom.addEventListener('click', () => {
  if (playing) stop();
  randomGrid();
});

bpmInput.addEventListener('change', () => {
  bpm = Math.max(40, Math.min(300, Number(bpmInput.value) || 120));
  bpmInput.value = String(bpm);
  restartTimer();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (playing) stop(); else start();
  }
});

// ── subscribe ──

SUBS.forEach((sub, i) => {
  bus.subscribe(sub.topic, (payload: unknown, srcTopic: string) => {
    flashSub(sub.topic, srcTopic, String(payload), i);
  });
});

// ── grid click delegation ──

grid.addEventListener('click', (e) => {
  const cell = (e.target as HTMLElement).closest('.grid-cell') as HTMLElement | null;
  if (!cell) return;
  const ri = Number(cell.dataset.row);
  const ci = Number(cell.dataset.step);
  if (isNaN(ri) || isNaN(ci)) return;
  TRACKS[ri]!.steps[ci] = !TRACKS[ri]!.steps[ci];
  cell.classList.toggle('on');
});

// ── init ──

updateTopicSet();
buildRowLabels();
buildStepNumbers();
buildGrid();
buildSubChips();
updateTree();

const DEFAULT_GROOVE: boolean[][] = [
  [true,false,false,false, true,false,false,false, true,false,false,false, true,false,false,false],
  [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,false],
  [true,false,true,false, true,false,true,false, true,false,true,false, true,false,true,false],
  [false,false,false,false, false,false,false,false, true,false,false,false, false,false,false,false],
  [true,false,false,true, false,false,true,false, true,false,false,true, false,false,false,false],
  [false,false,false,false, true,false,false,false, false,false,false,false, true,false,false,true],
  [false,false,false,false, false,false,false,false, false,false,true,false, false,false,false,false],
];
for (let ri = 0; ri < DEFAULT_GROOVE.length && ri < TRACKS.length; ri++) {
  TRACKS[ri]!.steps = [...DEFAULT_GROOVE[ri]!];
}
buildGrid();
