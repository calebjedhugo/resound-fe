/**
 * WorldOverview
 *
 * Sidebar "World Map" button + modal map of the whole world: every manifest
 * puzzle is a node, every gate link an edge, derived live by io/worldGraph
 * (nothing is stored). Shows the shape of the world, makes orphaned areas
 * obvious, flags one-way/dangling links (undo can desync a pair), and
 * clicking a node opens that puzzle via the PuzzlePicker load path.
 */
import { buildWorldGraph, LINK_OK, LINK_ONE_WAY, LINK_DANGLING } from 'editor/io/worldGraph';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 900;
const VIEW_H = 540;
const NODE_R = 16;

const EDGE_COLORS = {
  [LINK_OK]: '#44ff88',
  [LINK_ONE_WAY]: '#ffaa44',
  [LINK_DANGLING]: '#ff4444',
};

/**
 * Deterministic force layout (Fruchterman–Reingold seeded from a circle in
 * manifest order — no randomness, same graph always lands the same way).
 * @returns {Map<string, {x: number, y: number}>} node id -> position
 */
function layoutNodes(nodes, edges) {
  const count = Math.max(nodes.length, 1);
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const seedRadius = Math.min(VIEW_W, VIEW_H) / 2 - 70;
  const pos = new Map(
    nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      return [
        node.id,
        { x: cx + seedRadius * Math.cos(angle), y: cy + seedRadius * Math.sin(angle) },
      ];
    })
  );

  const k = Math.sqrt((VIEW_W * VIEW_H) / count) * 0.7;
  const springs = edges
    .map((e) => [e.from.puzzleId, e.to.puzzleId])
    .filter(([a, b]) => a !== b && pos.has(a) && pos.has(b));

  const ITERATIONS = 150;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const temp = 40 * (1 - iter / ITERATIONS);
    const disp = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id);
        const b = pos.get(nodes[j].id);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const force = (k * k) / d;
        const da = disp.get(nodes[i].id);
        const db = disp.get(nodes[j].id);
        da.x += (dx / d) * force;
        da.y += (dy / d) * force;
        db.x -= (dx / d) * force;
        db.y -= (dy / d) * force;
      }
    }
    for (const [aId, bId] of springs) {
      const a = pos.get(aId);
      const b = pos.get(bId);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const force = (d * d) / k;
      const da = disp.get(aId);
      const db = disp.get(bId);
      da.x -= (dx / d) * force;
      da.y -= (dy / d) * force;
      db.x += (dx / d) * force;
      db.y += (dy / d) * force;
    }
    for (const node of nodes) {
      const p = pos.get(node.id);
      const d = disp.get(node.id);
      const len = Math.hypot(d.x, d.y) || 0.01;
      const step = Math.min(len, temp);
      p.x = Math.min(VIEW_W - 90, Math.max(90, p.x + (d.x / len) * step));
      p.y = Math.min(VIEW_H - 50, Math.max(50, p.y + (d.y / len) * step));
    }
  }
  return pos;
}

export default class WorldOverview {
  /**
   * @param {HTMLElement} container - #world-panel
   * @param {object} callbacks
   * @param {(id: string) => void} callbacks.onOpenPuzzle - load a puzzle (PuzzlePicker path)
   * @param {() => string} callbacks.getCurrentPuzzleId - id of the open puzzle
   */
  constructor(container, { onOpenPuzzle, getCurrentPuzzleId }) {
    this._onOpenPuzzle = onOpenPuzzle;
    this._getCurrentPuzzleId = getCurrentPuzzleId;
    this._backdropEl = null;
    this._isOpen = false;
    this._handleKeyDown = (e) => {
      if (e.key === 'Escape') this.close();
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'panel-section';
    this._openBtn = document.createElement('button');
    this._openBtn.className = 'editor-btn world-map-btn';
    this._openBtn.textContent = 'World Map';
    this._openBtn.title = 'All puzzles and the gate links (portals) between them';
    this._openBtn.onclick = () => this.open();
    wrapper.appendChild(this._openBtn);
    container.appendChild(wrapper);
  }

  get isOpen() {
    return this._isOpen;
  }

  /** Open the modal and (re)derive the graph from the repo files. */
  async open() {
    if (this._isOpen) return;
    this._isOpen = true;

    this._backdropEl = document.createElement('div');
    this._backdropEl.className = 'song-modal-backdrop';
    this._backdropEl.addEventListener('mousedown', (e) => {
      if (e.target === this._backdropEl) this.close();
    });

    const modalEl = document.createElement('div');
    modalEl.className = 'song-modal world-modal';

    const headerEl = document.createElement('div');
    headerEl.className = 'song-modal-header';
    const titleEl = document.createElement('span');
    titleEl.className = 'song-modal-title';
    titleEl.textContent = 'World Overview';
    headerEl.appendChild(titleEl);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'song-modal-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close (Esc)';
    closeBtn.onclick = () => this.close();
    headerEl.appendChild(closeBtn);
    modalEl.appendChild(headerEl);

    this._bodyEl = document.createElement('div');
    this._bodyEl.className = 'song-modal-body world-map-body';
    this._bodyEl.textContent = 'Reading puzzle files…';
    modalEl.appendChild(this._bodyEl);

    this._backdropEl.appendChild(modalEl);
    document.body.appendChild(this._backdropEl);
    document.addEventListener('keydown', this._handleKeyDown);

    try {
      const graph = await buildWorldGraph();
      if (this._isOpen) this._renderGraph(graph);
    } catch (err) {
      if (this._isOpen) {
        this._bodyEl.textContent = '';
        const errEl = document.createElement('div');
        errEl.className = 'import-status import-error';
        errEl.textContent = `Couldn't build the world graph: ${err.message}`;
        this._bodyEl.appendChild(errEl);
      }
    }
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    document.removeEventListener('keydown', this._handleKeyDown);
    if (this._backdropEl) {
      this._backdropEl.remove();
      this._backdropEl = null;
    }
    this._bodyEl = null;
  }

  dispose() {
    this.close();
  }

  _nodeClicked(id) {
    // Opening the already-open puzzle would re-import from disk and could
    // outrun a pending autosave — just close.
    if (id !== this._getCurrentPuzzleId()) this._onOpenPuzzle(id);
    this.close();
  }

  _renderGraph({ nodes, edges }) {
    this._bodyEl.textContent = '';
    if (nodes.length === 0) {
      this._bodyEl.textContent = 'No puzzles in the manifest.';
      return;
    }

    const linked = new Set();
    for (const e of edges) {
      linked.add(e.from.puzzleId);
      linked.add(e.to.puzzleId);
    }
    const pos = layoutNodes(nodes, edges);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    svg.setAttribute('class', 'world-map-svg');

    // Edges first (under the nodes). Parallel doors between the same two
    // puzzles get a perpendicular offset so both stay visible.
    const byPair = new Map();
    for (const edge of edges) {
      const key = [edge.from.puzzleId, edge.to.puzzleId].sort().join(' ');
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key).push(edge);
    }
    for (const group of byPair.values()) {
      group.forEach((edge, i) => {
        const a = pos.get(edge.from.puzzleId);
        const b = pos.get(edge.to.puzzleId) || a; // dangling target may be off-graph
        if (!a) return;
        // A same-puzzle door (in-level teleporter) draws as a loop on its node
        if (edge.from.puzzleId === edge.to.puzzleId) {
          svg.appendChild(this._selfLoop(edge, a, i));
          return;
        }
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const off = (i - (group.length - 1) / 2) * 7;
        const ox = (-(b.y - a.y) / d) * off;
        const oy = ((b.x - a.x) / d) * off;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', a.x + ox);
        line.setAttribute('y1', a.y + oy);
        line.setAttribute('x2', b.x + ox);
        line.setAttribute('y2', b.y + oy);
        line.setAttribute('stroke', EDGE_COLORS[edge.status]);
        line.setAttribute('stroke-width', '2');
        if (edge.status !== LINK_OK) line.setAttribute('stroke-dasharray', '6 4');
        line.setAttribute('data-edge-status', edge.status);
        const title = document.createElementNS(SVG_NS, 'title');
        const detail = edge.detail ? ` — ${edge.detail}` : '';
        title.textContent =
          `${edge.from.puzzleId}/${edge.from.gateId} ↔ ` +
          `${edge.to.puzzleId}/${edge.to.gateId}${detail}`;
        line.appendChild(title);
        svg.appendChild(line);
      });
    }

    const currentId = this._getCurrentPuzzleId();
    for (const node of nodes) {
      const p = pos.get(node.id);
      const g = document.createElementNS(SVG_NS, 'g');
      let cls = 'world-node';
      if (node.id === currentId) cls += ' world-node-current';
      if (!linked.has(node.id)) cls += ' world-node-orphan';
      if (node.loadError) cls += ' world-node-error';
      g.setAttribute('class', cls);
      g.setAttribute('data-puzzle-id', node.id);
      g.addEventListener('click', () => this._nodeClicked(node.id));

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', NODE_R);
      g.appendChild(circle);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', p.x);
      label.setAttribute('y', p.y + NODE_R + 14);
      label.textContent = node.name;
      g.appendChild(label);

      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = node.loadError
        ? `${node.id} — file could not be read`
        : `${node.id} — ${node.gateCount} gate(s), ${node.linkedGateCount} linked. Click to open.`;
      g.appendChild(title);
      svg.appendChild(g);
    }
    this._bodyEl.appendChild(svg);

    const legend = document.createElement('div');
    legend.className = 'world-legend';
    const orphanCount = nodes.filter((n) => !linked.has(n.id)).length;
    legend.append(
      this._legendSwatch(EDGE_COLORS[LINK_OK], 'linked both ways'),
      this._legendSwatch(EDGE_COLORS[LINK_ONE_WAY], 'one-way (no back-link)'),
      this._legendSwatch(EDGE_COLORS[LINK_DANGLING], 'dangling (target missing)')
    );
    const summary = document.createElement('span');
    summary.className = 'world-summary';
    summary.textContent = `${nodes.length} area(s) · ${edges.length} door(s) · ${orphanCount} orphaned`;
    legend.appendChild(summary);
    this._bodyEl.appendChild(legend);

    const issues = edges.filter((e) => e.status !== LINK_OK);
    if (issues.length > 0) {
      const list = document.createElement('div');
      list.className = 'world-issues';
      for (const edge of issues) {
        const row = document.createElement('div');
        row.className = `world-issue world-issue-${edge.status}`;
        row.textContent =
          `${edge.from.puzzleId}/${edge.from.gateId} → ` +
          `${edge.to.puzzleId}/${edge.to.gateId} — ${edge.detail}`;
        list.appendChild(row);
      }
      this._bodyEl.appendChild(list);
    }
  }

  /** Loop arc above a node for a same-puzzle door; stacked when parallel. */
  // eslint-disable-next-line class-methods-use-this
  _selfLoop(edge, p, index) {
    const r = 11 + index * 6;
    const loop = document.createElementNS(SVG_NS, 'circle');
    loop.setAttribute('cx', p.x);
    loop.setAttribute('cy', p.y - NODE_R - r + 5);
    loop.setAttribute('r', r);
    loop.setAttribute('fill', 'none');
    loop.setAttribute('stroke', EDGE_COLORS[edge.status]);
    loop.setAttribute('stroke-width', '2');
    if (edge.status !== LINK_OK) loop.setAttribute('stroke-dasharray', '6 4');
    loop.setAttribute('data-edge-status', edge.status);
    const title = document.createElementNS(SVG_NS, 'title');
    const detail = edge.detail ? ` — ${edge.detail}` : '';
    title.textContent =
      `${edge.from.puzzleId}/${edge.from.gateId} ↔ ` +
      `${edge.to.puzzleId}/${edge.to.gateId} (same puzzle)${detail}`;
    loop.appendChild(title);
    return loop;
  }

  _legendSwatch(color, text) {
    const item = document.createElement('span');
    item.className = 'world-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'world-legend-swatch';
    swatch.style.background = color;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(text));
    return item;
  }
}
