/**
 * worldGraph Tests
 *
 * The world overview is DERIVED from the repo's puzzle files: manifest
 * puzzles become nodes, gate `link`s become edges, and each pair is
 * classified (ok / one-way / dangling) because undo can desync a pair.
 * These tests run the derivation against an in-memory repo behind a
 * mocked fetch, mirroring portalLinks.test.js.
 */
import { buildWorldGraph, LINK_OK, LINK_ONE_WAY, LINK_DANGLING } from 'editor/io/worldGraph';

/** Minimal puzzle JSON with the given gates (raw file format). */
function puzzleJson(id, gates = []) {
  return {
    id,
    name: `Name of ${id}`,
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
      song: [{ pitch: 'C4', length: '1/4' }],
    })),
  };
}

describe('buildWorldGraph', () => {
  let repo; // id -> puzzle JSON (the fake on-disk state)
  let unreadable; // ids whose file reads fail

  beforeEach(() => {
    repo = {};
    unreadable = new Set();
    global.fetch = jest.fn((url) => {
      const respond = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
      const notFound = Promise.resolve({
        ok: false,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'not found' }),
      });
      if (url === '/puzzles/manifest.json') {
        return respond({
          puzzles: Object.values(repo).map((p) => ({ id: p.id, name: p.name })),
        });
      }
      const read = url.match(/^\/puzzles\/([a-zA-Z0-9_-]+)\.json$/);
      if (read && repo[read[1]] && !unreadable.has(read[1])) {
        return respond(JSON.parse(JSON.stringify(repo[read[1]])));
      }
      return notFound;
    });
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('lists every manifest puzzle as a node with its gate counts', async () => {
    repo.a = puzzleJson('a', [
      { id: 'gate-1' },
      { id: 'gate-2', link: { puzzleId: 'b', gateId: 'gate-1' } },
    ]);
    repo.b = puzzleJson('b', [{ id: 'gate-1', link: { puzzleId: 'a', gateId: 'gate-2' } }]);
    repo.lonely = puzzleJson('lonely', []);

    const { nodes } = await buildWorldGraph();

    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'lonely']);
    const a = nodes.find((n) => n.id === 'a');
    expect(a.name).toBe('Name of a');
    expect(a.gateCount).toBe(2);
    expect(a.linkedGateCount).toBe(1);
    expect(nodes.find((n) => n.id === 'lonely').gateCount).toBe(0);
  });

  it('collapses a reciprocal pair into one ok edge', async () => {
    repo.a = puzzleJson('a', [{ id: 'door', link: { puzzleId: 'b', gateId: 'door' } }]);
    repo.b = puzzleJson('b', [{ id: 'door', link: { puzzleId: 'a', gateId: 'door' } }]);

    const { edges } = await buildWorldGraph();

    expect(edges).toHaveLength(1);
    expect(edges[0].status).toBe(LINK_OK);
    expect(edges[0].detail).toBeNull();
    const endpoints = [edges[0].from.puzzleId, edges[0].to.puzzleId].sort();
    expect(endpoints).toEqual(['a', 'b']);
  });

  it('flags a link whose partner gate has no back-link as one-way', async () => {
    repo.a = puzzleJson('a', [{ id: 'door', link: { puzzleId: 'b', gateId: 'door' } }]);
    repo.b = puzzleJson('b', [{ id: 'door' }]); // back-link lost (e.g. via undo)

    const { edges } = await buildWorldGraph();

    expect(edges).toHaveLength(1);
    expect(edges[0].status).toBe(LINK_ONE_WAY);
    expect(edges[0].from).toEqual({ puzzleId: 'a', gateId: 'door' });
    expect(edges[0].to).toEqual({ puzzleId: 'b', gateId: 'door' });
    expect(edges[0].detail).toMatch(/no back-link/);
  });

  it('flags a link whose partner points elsewhere as one-way (both edges shown)', async () => {
    repo.a = puzzleJson('a', [{ id: 'door', link: { puzzleId: 'b', gateId: 'door' } }]);
    repo.b = puzzleJson('b', [{ id: 'door', link: { puzzleId: 'c', gateId: 'door' } }]);
    repo.c = puzzleJson('c', [{ id: 'door', link: { puzzleId: 'b', gateId: 'door' } }]);

    const { edges } = await buildWorldGraph();

    const ab = edges.find((e) => e.from.puzzleId === 'a');
    expect(ab.status).toBe(LINK_ONE_WAY);
    expect(ab.detail).toMatch(/links elsewhere/);
    const bc = edges.find((e) => [e.from.puzzleId, e.to.puzzleId].sort().join('') === 'bc');
    expect(bc.status).toBe(LINK_OK);
    expect(edges).toHaveLength(2);
  });

  it('flags a link to a missing gate or missing puzzle as dangling', async () => {
    repo.a = puzzleJson('a', [
      { id: 'to-ghost-gate', link: { puzzleId: 'b', gateId: 'no-such-door' } },
      { id: 'to-ghost-puzzle', link: { puzzleId: 'deleted', gateId: 'door' } },
    ]);
    repo.b = puzzleJson('b', [{ id: 'door' }]);

    const { edges } = await buildWorldGraph();

    const ghostGate = edges.find((e) => e.from.gateId === 'to-ghost-gate');
    expect(ghostGate.status).toBe(LINK_DANGLING);
    expect(ghostGate.detail).toMatch(/does not exist/);
    const ghostPuzzle = edges.find((e) => e.from.gateId === 'to-ghost-puzzle');
    expect(ghostPuzzle.status).toBe(LINK_DANGLING);
    expect(ghostPuzzle.detail).toMatch(/not in the manifest/);
  });

  it('keeps an unreadable puzzle as a flagged node and dangles links into it', async () => {
    repo.a = puzzleJson('a', [{ id: 'door', link: { puzzleId: 'broken', gateId: 'door' } }]);
    repo.broken = puzzleJson('broken', [{ id: 'door' }]);
    unreadable.add('broken');

    const { nodes, edges } = await buildWorldGraph();

    const broken = nodes.find((n) => n.id === 'broken');
    expect(broken.loadError).toBe(true);
    expect(broken.gateCount).toBe(0);
    expect(edges).toHaveLength(1);
    expect(edges[0].status).toBe(LINK_DANGLING);
    expect(edges[0].detail).toMatch(/could not be read/);
  });

  it('collapses a same-puzzle pair (in-level teleport door) into one ok self-edge', async () => {
    repo.a = puzzleJson('a', [
      { id: 'door-a', link: { puzzleId: 'a', gateId: 'door-b' } },
      { id: 'door-b', link: { puzzleId: 'a', gateId: 'door-a' } },
    ]);

    const { edges } = await buildWorldGraph();

    expect(edges).toHaveLength(1);
    expect(edges[0].status).toBe(LINK_OK);
    expect(edges[0].from.puzzleId).toBe('a');
    expect(edges[0].to.puzzleId).toBe('a');
  });

  it('returns no edges for a world without links', async () => {
    repo.a = puzzleJson('a', [{ id: 'door' }]);
    repo.b = puzzleJson('b', []);

    const { edges } = await buildWorldGraph();

    expect(edges).toEqual([]);
  });
});
