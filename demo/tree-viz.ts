export interface TreeNode {
  segment: string;
  wildcard: '+' | '#' | null;
  subscriberCount: number;
  children: Map<string, TreeNode>;
}

export interface SubInfo {
  pattern: string;
  color: string;
}

export function buildTree(topics: Set<string>): TreeNode {
  const root: TreeNode = { segment: 'root', wildcard: null, subscriberCount: 0, children: new Map() };

  for (const topic of topics) {
    const parts = topic.split('/');
    let node = root;
    for (const part of parts) {
      let child = node.children.get(part);
      if (!child) {
        const isPlus = part === '+';
        const isHash = part === '#';
        child = {
          segment: part,
          wildcard: isPlus ? '+' : isHash ? '#' : null,
          subscriberCount: 0,
          children: new Map(),
        };
        node.children.set(part, child);
      }
      node = child;
    }
    node.subscriberCount++;
  }

  return root;
}

function topicMatchesPattern(topic: string, pattern: string): boolean {
  const tp = topic.split('/');
  const pp = pattern.split('/');

  for (let i = 0; i < pp.length; i++) {
    const p = pp[i]!;
    if (p === '#') return true;
    if (i >= tp.length) return false;
    if (p === '+') continue;
    if (p !== tp[i]) return false;
  }

  return tp.length === pp.length;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderTree(
  container: HTMLElement,
  root: TreeNode,
  hitCounts?: Map<string, number>,
  subs?: SubInfo[],
) {
  container.innerHTML = '';
  renderNode(container, root, 0, '', hitCounts, subs);
}

function renderNode(
  parent: HTMLElement,
  node: TreeNode,
  depth: number,
  path: string,
  hitCounts?: Map<string, number>,
  subs?: SubInfo[],
) {
  const hits = hitCounts?.get(path) ?? 0;

  if (depth > 0) {
    const div = document.createElement('div');
    div.className = 'tree-node';
    div.dataset.path = path;

    const label = document.createElement('div');
    label.className = 'tree-label';

    const indent = '  '.repeat(depth - 1);
    let segClass = 'segment';
    let segText = node.segment;

    if (node.wildcard === '+') {
      segClass = 'segment wildcard-plus';
    } else if (node.wildcard === '#') {
      segClass = 'segment wildcard-hash';
    }

    label.innerHTML = `<span style="color:var(--text-dim)">${indent}</span><span class="${segClass}">${escapeHtml(segText)}</span>`;

    if (node.subscriberCount > 0) {
      const count = document.createElement('span');
      count.className = 'sub-count';
      count.textContent = `${node.subscriberCount} sub`;
      label.appendChild(count);
    }

    // subscriber coverage dots
    if (subs && subs.length > 0) {
      const dots = document.createElement('span');
      dots.className = 'sub-dots';
      let matched = 0;
      for (const sub of subs) {
        if (topicMatchesPattern(path, sub.pattern)) {
          const dot = document.createElement('span');
          dot.className = 'sub-dot';
          dot.style.backgroundColor = sub.color;
          dot.title = sub.pattern;
          dots.appendChild(dot);
          matched++;
        }
      }
      if (matched > 0) label.appendChild(dots);
    }

    if (hits > 0) {
      const hit = document.createElement('span');
      hit.className = 'hit-count';
      hit.textContent = String(hits);
      label.appendChild(hit);
    }

    div.appendChild(label);
    parent.appendChild(div);
    parent = div;
  }

  const sorted = [...node.children.values()].sort((a, b) => {
    if (a.wildcard === '#') return 1;
    if (b.wildcard === '#') return -1;
    if (a.wildcard === '+') return 1;
    if (b.wildcard === '+') return -1;
    return a.segment.localeCompare(b.segment);
  });

  for (const child of sorted) {
    renderNode(parent, child, depth + 1, path ? `${path}/${child.segment}` : child.segment, hitCounts, subs);
  }
}
