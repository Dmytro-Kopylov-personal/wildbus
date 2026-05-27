export interface TreeNode {
  segment: string;
  wildcard: '+' | '#' | null;
  subscriberCount: number;
  children: Map<string, TreeNode>;
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

export function renderTree(container: HTMLElement, root: TreeNode, hitCounts?: Map<string, number>) {
  container.innerHTML = '';
  renderNode(container, root, 0, 'root', hitCounts);
}

function renderNode(
  parent: HTMLElement,
  node: TreeNode,
  depth: number,
  path: string,
  hitCounts?: Map<string, number>,
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

    label.innerHTML = `<span style="color:var(--text-dim)">${indent}</span><span class="${segClass}">${segText}</span>`;

    if (node.subscriberCount > 0) {
      const count = document.createElement('span');
      count.className = 'sub-count';
      count.textContent = `${node.subscriberCount} sub`;
      label.appendChild(count);
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

  // Sort children: literals first, then +, then #
  const sorted = [...node.children.values()].sort((a, b) => {
    if (a.wildcard === '#') return 1;
    if (b.wildcard === '#') return -1;
    if (a.wildcard === '+') return 1;
    if (b.wildcard === '+') return -1;
    return a.segment.localeCompare(b.segment);
  });

  for (const child of sorted) {
    renderNode(parent, child, depth + 1, path ? `${path}/${child.segment}` : child.segment, hitCounts);
  }
}
