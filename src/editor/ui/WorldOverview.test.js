/**
 * @jest-environment jsdom
 */

/**
 * WorldOverview Tests
 *
 * The world map modal derives its graph live from the repo files (mocked
 * fetch, like portalLinks.test.js) and navigates via the PuzzlePicker load
 * path. Tests cover: nodes render per manifest puzzle, clicking a node opens
 * that puzzle and closes the modal, link-health issues are listed, and the
 * current/orphaned puzzles are marked.
 */
import WorldOverview from 'editor/ui/WorldOverview';

function puzzleJson(id, gates = []) {
  return {
    id,
    name: id,
    difficulty: 1,
    gridSize: 10,
    tempo: 120,
    playerStart: { x: 0, y: 0, z: 0 },
    entities: gates.map((g) => ({
      type: 'gate',
      position: { x: 1, y: 0, z: 1 },
      id: g.id,
      facing: 'north',
      ...(g.link ? { link: g.link } : {}),
      song: [],
    })),
  };
}

describe('WorldOverview', () => {
  let repo;
  let overview;
  let onOpenPuzzle;
  let currentPuzzleId;

  beforeEach(() => {
    document.body.innerHTML = '<div id="world-panel"></div>';
    repo = {
      a: puzzleJson('a', [{ id: 'door', link: { puzzleId: 'b', gateId: 'door' } }]),
      b: puzzleJson('b', [{ id: 'door', link: { puzzleId: 'a', gateId: 'door' } }]),
      lonely: puzzleJson('lonely'),
    };
    global.fetch = jest.fn((url) => {
      const respond = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      if (url === '/puzzles/manifest.json') {
        return respond({
          puzzles: Object.values(repo).map((p) => ({ id: p.id, name: p.name })),
        });
      }
      const read = url.match(/^\/puzzles\/([a-zA-Z0-9_-]+)\.json$/);
      if (read && repo[read[1]]) return respond(JSON.parse(JSON.stringify(repo[read[1]])));
      return Promise.resolve({
        ok: false,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      });
    });

    currentPuzzleId = 'a';
    onOpenPuzzle = jest.fn();
    overview = new WorldOverview(document.getElementById('world-panel'), {
      onOpenPuzzle,
      getCurrentPuzzleId: () => currentPuzzleId,
    });
  });

  afterEach(() => {
    overview.dispose();
    document.body.innerHTML = '';
    delete global.fetch;
  });

  it('renders a sidebar World Map button', () => {
    const btn = document.querySelector('#world-panel .world-map-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('World Map');
  });

  it('opens a modal with one clickable node per manifest puzzle', async () => {
    await overview.open();

    expect(overview.isOpen).toBe(true);
    const ids = Array.from(document.querySelectorAll('[data-puzzle-id]')).map((el) =>
      el.getAttribute('data-puzzle-id')
    );
    expect(ids.sort()).toEqual(['a', 'b', 'lonely']);
  });

  it('clicking a node opens that puzzle and closes the modal', async () => {
    await overview.open();

    document
      .querySelector('[data-puzzle-id="b"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenPuzzle).toHaveBeenCalledWith('b');
    expect(overview.isOpen).toBe(false);
    expect(document.querySelector('.world-modal')).toBeNull();
  });

  it('clicking the current puzzle just closes (no reload over pending autosave)', async () => {
    await overview.open();

    document
      .querySelector('[data-puzzle-id="a"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onOpenPuzzle).not.toHaveBeenCalled();
    expect(overview.isOpen).toBe(false);
  });

  it('marks the current puzzle and orphaned areas', async () => {
    await overview.open();

    expect(document.querySelector('[data-puzzle-id="a"]').getAttribute('class')).toContain(
      'world-node-current'
    );
    expect(document.querySelector('[data-puzzle-id="lonely"]').getAttribute('class')).toContain(
      'world-node-orphan'
    );
    expect(document.querySelector('[data-puzzle-id="b"]').getAttribute('class')).not.toContain(
      'world-node-orphan'
    );
  });

  it('draws a healthy link as an ok edge with no issue rows', async () => {
    await overview.open();

    const edges = document.querySelectorAll('[data-edge-status]');
    expect(edges).toHaveLength(1);
    expect(edges[0].getAttribute('data-edge-status')).toBe('ok');
    expect(document.querySelector('.world-issue')).toBeNull();
  });

  it('lists a one-way link (missing back-link) as an issue', async () => {
    delete repo.b.entities[0].link; // desync the pair

    await overview.open();

    const edge = document.querySelector('[data-edge-status]');
    expect(edge.getAttribute('data-edge-status')).toBe('one-way');
    const issue = document.querySelector('.world-issue');
    expect(issue).not.toBeNull();
    expect(issue.textContent).toContain('a/door');
    expect(issue.textContent).toContain('no back-link');
  });

  it('lists a dangling link (target puzzle gone) as an issue', async () => {
    repo.a.entities[0].link = { puzzleId: 'deleted', gateId: 'door' };
    delete repo.b.entities[0].link;

    await overview.open();

    const issue = document.querySelector('.world-issue-dangling');
    expect(issue).not.toBeNull();
    expect(issue.textContent).toContain('deleted');
  });

  it('draws a same-puzzle door as a loop on its node (not an orphan)', async () => {
    repo.lonely = puzzleJson('lonely', [
      { id: 'door-a', link: { puzzleId: 'lonely', gateId: 'door-b' } },
      { id: 'door-b', link: { puzzleId: 'lonely', gateId: 'door-a' } },
    ]);

    await overview.open();

    const loops = Array.from(document.querySelectorAll('circle[data-edge-status]'));
    expect(loops).toHaveLength(1);
    expect(loops[0].getAttribute('data-edge-status')).toBe('ok');
    expect(document.querySelector('[data-puzzle-id="lonely"]').getAttribute('class')).not.toContain(
      'world-node-orphan'
    );
  });

  it('Escape closes the modal', async () => {
    await overview.open();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(overview.isOpen).toBe(false);
    expect(document.querySelector('.world-modal')).toBeNull();
  });
});
