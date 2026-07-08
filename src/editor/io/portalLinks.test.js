/**
 * portalLinks Tests
 *
 * Cross-puzzle gate links are BIDIRECTIONAL: every operation on the open
 * puzzle's gate must keep the partner puzzle's file in sync. These tests run
 * the service against an in-memory "repo" of puzzle JSONs behind a mocked
 * fetch (the dev read/write endpoints), asserting on both sides of the link.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import UndoManager from 'editor/model/UndoManager';
import {
  fetchLinkTargets,
  fetchTargetGates,
  localTargetGates,
  createLink,
  clearLink,
  renameGateId,
  releaseLinkBeforeDelete,
  musicalMismatchWarnings,
  parseLinkTarget,
} from 'editor/io/portalLinks';

/** Minimal valid puzzle JSON with the given gates (raw file format). */
function puzzleJson(id, gates, overrides = {}) {
  return {
    id,
    name: id,
    difficulty: 1,
    gridSize: 10,
    tempo: 120,
    keySignature: 'C',
    playerStart: { x: 0, y: 0, z: 0 },
    entities: gates.map((g) => ({
      type: 'gate',
      position: g.position || { x: 1, y: 0, z: 1 },
      id: g.id,
      facing: g.facing || 'north',
      ...(g.link ? { link: g.link } : {}),
      song: [{ pitch: 'C4', length: '1/4' }],
    })),
    ...overrides,
  };
}

describe('portal links', () => {
  let repo; // id -> puzzle JSON, the fake on-disk state
  let undoManager;
  let localGateEntityId;

  /** fetch mock covering the manifest, puzzle reads, and dev writes. */
  function installFetchMock() {
    global.fetch = jest.fn((url, opts = {}) => {
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
      if (read) {
        const json = repo[read[1]];
        // Deep-copy so service-side mutations only land via an explicit POST
        return json ? respond(JSON.parse(JSON.stringify(json))) : notFound;
      }
      const write = url.match(/^\/api\/puzzles\/([a-zA-Z0-9_-]+)$/);
      if (write && opts.method === 'POST') {
        repo[write[1]] = JSON.parse(opts.body);
        return respond({ ok: true });
      }
      return notFound;
    });
  }

  beforeEach(() => {
    repo = {
      remote: puzzleJson('remote', [{ id: 'their-door' }, { id: 'busy-door' }]),
      other: puzzleJson('other', [{ id: 'other-door' }]),
    };
    // busy-door is already claimed by a third puzzle
    repo.remote.entities[1].link = { puzzleId: 'elsewhere', gateId: 'x' };

    const model = new EditorPuzzleModel();
    model.setMetadata({ id: 'local', name: 'Local', tempo: 120, keySignature: 'C' });
    undoManager = new UndoManager(model);
    localGateEntityId = undoManager.addEntity('gate', 2, 0, 2, {
      song: [{ pitch: 'C4', length: '1/4' }],
      gateId: 'my-door',
      facing: 'east',
    });

    installFetchMock();
  });

  afterEach(() => {
    delete global.fetch;
  });

  const localGateData = () => undoManager.getEntity(localGateEntityId).data;
  const remoteGate = (puzzleId, gateId) => repo[puzzleId].entities.find((e) => e.id === gateId);

  describe('createLink', () => {
    it('links both sides: local model and the target file', async () => {
      await createLink(undoManager, localGateEntityId, 'remote', 'their-door');

      expect(localGateData().link).toEqual({ puzzleId: 'remote', gateId: 'their-door' });
      expect(remoteGate('remote', 'their-door').link).toEqual({
        puzzleId: 'local',
        gateId: 'my-door',
      });
    });

    it('refuses a target gate already linked to a third puzzle', async () => {
      await expect(
        createLink(undoManager, localGateEntityId, 'remote', 'busy-door')
      ).rejects.toThrow(/already linked/);

      expect(localGateData().link).toBeUndefined();
      expect(remoteGate('remote', 'busy-door').link).toEqual({
        puzzleId: 'elsewhere',
        gateId: 'x',
      });
    });

    it('refuses a target gate that does not exist', async () => {
      await expect(
        createLink(undoManager, localGateEntityId, 'remote', 'no-such-door')
      ).rejects.toThrow(/not found/);
    });

    it('relinking releases the previous partner first', async () => {
      await createLink(undoManager, localGateEntityId, 'remote', 'their-door');
      await createLink(undoManager, localGateEntityId, 'other', 'other-door');

      expect(remoteGate('remote', 'their-door').link).toBeUndefined();
      expect(remoteGate('other', 'other-door').link).toEqual({
        puzzleId: 'local',
        gateId: 'my-door',
      });
      expect(localGateData().link).toEqual({ puzzleId: 'other', gateId: 'other-door' });
    });

    it('warns on tempo and key mismatch (but still links)', async () => {
      repo.remote.tempo = 90;
      repo.remote.keySignature = 'G';

      const { warnings } = await createLink(undoManager, localGateEntityId, 'remote', 'their-door');

      expect(warnings.some((w) => /tempo/i.test(w))).toBe(true);
      expect(warnings.some((w) => /key/i.test(w))).toBe(true);
      expect(localGateData().link).toEqual({ puzzleId: 'remote', gateId: 'their-door' });
    });

    it('requires the open puzzle to have an id', async () => {
      undoManager.setMetadata({ id: '' });

      await expect(
        createLink(undoManager, localGateEntityId, 'remote', 'their-door')
      ).rejects.toThrow(/save this puzzle/i);
    });
  });

  describe('clearLink', () => {
    it('clears both sides', async () => {
      await createLink(undoManager, localGateEntityId, 'remote', 'their-door');

      await clearLink(undoManager, localGateEntityId);

      expect(localGateData().link).toBeUndefined();
      expect(remoteGate('remote', 'their-door').link).toBeUndefined();
    });

    it('leaves a partner alone if its back-link points elsewhere', async () => {
      await createLink(undoManager, localGateEntityId, 'remote', 'their-door');
      // Simulate drift: the partner now points at a third puzzle
      remoteGate('remote', 'their-door').link = { puzzleId: 'elsewhere', gateId: 'x' };

      await clearLink(undoManager, localGateEntityId);

      expect(localGateData().link).toBeUndefined();
      expect(remoteGate('remote', 'their-door').link).toEqual({
        puzzleId: 'elsewhere',
        gateId: 'x',
      });
    });
  });

  describe('renameGateId', () => {
    it('renames locally and updates the partner back-link', async () => {
      await createLink(undoManager, localGateEntityId, 'remote', 'their-door');

      await renameGateId(undoManager, localGateEntityId, 'front-door');

      expect(localGateData().gateId).toBe('front-door');
      expect(remoteGate('remote', 'their-door').link).toEqual({
        puzzleId: 'local',
        gateId: 'front-door',
      });
    });

    it('rejects an id already used by another gate in this puzzle', async () => {
      undoManager.addEntity('gate', 5, 0, 5, { song: [], gateId: 'taken', facing: 'north' });

      await expect(renameGateId(undoManager, localGateEntityId, 'taken')).rejects.toThrow(
        /already used/
      );
      expect(localGateData().gateId).toBe('my-door');
    });

    it('rejects an invalid id', async () => {
      await expect(renameGateId(undoManager, localGateEntityId, 'bad id!')).rejects.toThrow(
        /letters, numbers/
      );
    });
  });

  describe('releaseLinkBeforeDelete', () => {
    it('clears the partner back-link so deletion never leaves a dangling far side', async () => {
      await createLink(undoManager, localGateEntityId, 'remote', 'their-door');

      await releaseLinkBeforeDelete(undoManager, localGateEntityId);

      expect(remoteGate('remote', 'their-door').link).toBeUndefined();
    });

    it('is a no-op for unlinked gates (no writes)', async () => {
      const writesBefore = fetch.mock.calls.filter(([, o]) => o && o.method === 'POST').length;

      await releaseLinkBeforeDelete(undoManager, localGateEntityId);

      const writesAfter = fetch.mock.calls.filter(([, o]) => o && o.method === 'POST').length;
      expect(writesAfter).toBe(writesBefore);
    });
  });

  describe('song unification (one door, one song)', () => {
    const OUR_SONG = [{ pitch: 'C4', length: '1/4' }]; // fixture default
    const THEIR_SONG = [{ pitch: 'G4', length: '1/2' }];

    it('same songs link without asking', async () => {
      const confirmSongReplace = jest.fn();

      const result = await createLink(undoManager, localGateEntityId, 'remote', 'their-door', {
        confirmSongReplace,
      });

      expect(result.cancelled).toBeUndefined();
      expect(confirmSongReplace).not.toHaveBeenCalled();
    });

    it('differing songs: approval replaces the TARGET song with the initiator’s', async () => {
      remoteGate('remote', 'their-door').song = THEIR_SONG;

      const result = await createLink(undoManager, localGateEntityId, 'remote', 'their-door', {
        confirmSongReplace: () => true,
      });

      expect(result.cancelled).toBeUndefined();
      expect(remoteGate('remote', 'their-door').song).toEqual(OUR_SONG);
      expect(localGateData().song).toEqual(OUR_SONG);
      expect(remoteGate('remote', 'their-door').link).toEqual({
        puzzleId: 'local',
        gateId: 'my-door',
      });
    });

    it('differing songs: declining cancels the link and keeps both songs', async () => {
      remoteGate('remote', 'their-door').song = THEIR_SONG;

      const result = await createLink(undoManager, localGateEntityId, 'remote', 'their-door', {
        confirmSongReplace: () => false,
      });

      expect(result.cancelled).toBe(true);
      expect(localGateData().link).toBeUndefined();
      expect(remoteGate('remote', 'their-door').link).toBeUndefined();
      expect(remoteGate('remote', 'their-door').song).toEqual(THEIR_SONG);
      expect(localGateData().song).toEqual(OUR_SONG);
    });

    it('differing songs with no confirm callback: cancels (never silently deletes)', async () => {
      remoteGate('remote', 'their-door').song = THEIR_SONG;

      const result = await createLink(undoManager, localGateEntityId, 'remote', 'their-door');

      expect(result.cancelled).toBe(true);
      expect(remoteGate('remote', 'their-door').song).toEqual(THEIR_SONG);
    });

    it('a song-less initiator adopts the target’s song (and staffGroups)', async () => {
      undoManager.updateEntity(localGateEntityId, {
        data: { ...localGateData(), song: [] },
      });
      const target = remoteGate('remote', 'their-door');
      target.song = THEIR_SONG;
      target.staffGroups = [{ type: 'brace', voiceIds: ['treble', 'bass'] }];
      const confirmSongReplace = jest.fn();

      await createLink(undoManager, localGateEntityId, 'remote', 'their-door', {
        confirmSongReplace,
      });

      expect(confirmSongReplace).not.toHaveBeenCalled();
      expect(localGateData().song).toEqual(THEIR_SONG);
      expect(localGateData().staffGroups).toEqual([
        { type: 'brace', voiceIds: ['treble', 'bass'] },
      ]);
    });

    it('a song-less target adopts the initiator’s song', async () => {
      remoteGate('remote', 'their-door').song = [];
      const confirmSongReplace = jest.fn();

      await createLink(undoManager, localGateEntityId, 'remote', 'their-door', {
        confirmSongReplace,
      });

      expect(confirmSongReplace).not.toHaveBeenCalled();
      expect(remoteGate('remote', 'their-door').song).toEqual(OUR_SONG);
    });

    it('same-puzzle teleport link unifies songs the same way', async () => {
      const secondGateId = undoManager.addEntity('gate', 5, 0, 5, {
        song: THEIR_SONG,
        gateId: 'second-door',
        facing: 'west',
      });

      const result = await createLink(undoManager, localGateEntityId, 'local', 'second-door', {
        confirmSongReplace: () => true,
      });

      expect(result.cancelled).toBeUndefined();
      const second = undoManager.getEntity(secondGateId).data;
      expect(second.song).toEqual(OUR_SONG);
      expect(second.link).toEqual({ puzzleId: 'local', gateId: 'my-door' });
      expect(localGateData().link).toEqual({ puzzleId: 'local', gateId: 'second-door' });
    });

    it('same-puzzle teleport link: declining leaves both gates untouched', async () => {
      const secondGateId = undoManager.addEntity('gate', 5, 0, 5, {
        song: THEIR_SONG,
        gateId: 'second-door',
        facing: 'west',
      });

      const result = await createLink(undoManager, localGateEntityId, 'local', 'second-door', {
        confirmSongReplace: () => false,
      });

      expect(result.cancelled).toBe(true);
      expect(undoManager.getEntity(secondGateId).data.song).toEqual(THEIR_SONG);
      expect(undoManager.getEntity(secondGateId).data.link).toBeUndefined();
      expect(localGateData().link).toBeUndefined();
    });
  });

  describe('parseLinkTarget', () => {
    it('a bare gate id targets the open puzzle', () => {
      expect(parseLinkTarget('gate-2', 'teleport')).toEqual({
        puzzleId: 'teleport',
        gateId: 'gate-2',
      });
    });

    it('puzzle/gate targets another puzzle', () => {
      expect(parseLinkTarget('the-lure/gate-1', 'teleport')).toEqual({
        puzzleId: 'the-lure',
        gateId: 'gate-1',
      });
    });

    it('tolerates surrounding whitespace', () => {
      expect(parseLinkTarget('  the-lure / gate-1 ', 'teleport')).toEqual({
        puzzleId: 'the-lure',
        gateId: 'gate-1',
      });
    });

    it('rejects malformed input', () => {
      expect(() => parseLinkTarget('a/b/c', 'teleport')).toThrow(/gate id/i);
      expect(() => parseLinkTarget('bad id!', 'teleport')).toThrow(/gate id/i);
      expect(() => parseLinkTarget('', 'teleport')).toThrow(/gate id/i);
    });
  });

  describe('pickers', () => {
    it('fetchLinkTargets includes the open puzzle (same-puzzle doors)', async () => {
      repo.local = puzzleJson('local', []);

      const targets = await fetchLinkTargets();

      expect(targets.map((t) => t.id).sort()).toEqual(['local', 'other', 'remote']);
    });

    it('localTargetGates lists model gates, excluding the gate being linked', () => {
      undoManager.addEntity('gate', 7, 0, 7, { song: [], gateId: 'back-door', facing: 'west' });

      const gates = localTargetGates(undoManager, localGateEntityId);

      expect(gates).toEqual([
        {
          gateId: 'back-door',
          facing: 'west',
          position: { x: 7, y: 0, z: 7 },
          link: null,
        },
      ]);
    });

    it('fetchTargetGates reports gates with their claim state', async () => {
      const gates = await fetchTargetGates('remote');

      expect(gates.map((g) => g.gateId)).toEqual(['their-door', 'busy-door']);
      expect(gates[0].link).toBeNull();
      expect(gates[1].link).toEqual({ puzzleId: 'elsewhere', gateId: 'x' });
    });

    it('fetchTargetGates materializes missing ids into the target file', async () => {
      // A never-resaved puzzle: gates exist but carry no stable ids
      repo.legacy = puzzleJson('legacy', [{ id: 'kept' }]);
      repo.legacy.entities.push(
        { type: 'gate', position: { x: 3, y: 0, z: 3 }, song: [] },
        { type: 'gate', position: { x: 4, y: 0, z: 4 }, song: [], id: 'kept' } // duplicate
      );

      const gates = await fetchTargetGates('legacy');

      const ids = gates.map((g) => g.gateId);
      expect(new Set(ids).size).toBe(3);
      expect(ids[0]).toBe('kept');
      // ...and the assignment was persisted, so linking can rely on it
      expect(repo.legacy.entities.map((e) => e.id)).toEqual(ids);
    });
  });

  describe('same-puzzle links (in-level teleport doors)', () => {
    let backDoorEntityId;

    const postWrites = () => fetch.mock.calls.filter(([, o]) => o && o.method === 'POST').length;

    beforeEach(() => {
      backDoorEntityId = undoManager.addEntity('gate', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
        gateId: 'back-door',
        facing: 'west',
      });
    });

    const backDoorData = () => undoManager.getEntity(backDoorEntityId).data;

    it('links both local gates through the model with no file writes', async () => {
      const { warnings } = await createLink(undoManager, localGateEntityId, 'local', 'back-door');

      expect(localGateData().link).toEqual({ puzzleId: 'local', gateId: 'back-door' });
      expect(backDoorData().link).toEqual({ puzzleId: 'local', gateId: 'my-door' });
      expect(warnings).toEqual([]); // same puzzle: tempo/key always match
      expect(postWrites()).toBe(0);
    });

    it('refuses to link a gate to itself', async () => {
      await expect(createLink(undoManager, localGateEntityId, 'local', 'my-door')).rejects.toThrow(
        /can't link to itself/
      );
      expect(localGateData().link).toBeUndefined();
    });

    it('refuses a local target gate that does not exist', async () => {
      await expect(
        createLink(undoManager, localGateEntityId, 'local', 'no-such-door')
      ).rejects.toThrow(/not found in this puzzle/);
    });

    it('refuses a local target gate already claimed by another puzzle', async () => {
      undoManager.updateEntity(backDoorEntityId, {
        data: { ...backDoorData(), link: { puzzleId: 'elsewhere', gateId: 'x' } },
      });

      await expect(
        createLink(undoManager, localGateEntityId, 'local', 'back-door')
      ).rejects.toThrow(/already linked/);
    });

    it('clearLink clears both local sides with no file writes', async () => {
      await createLink(undoManager, localGateEntityId, 'local', 'back-door');

      await clearLink(undoManager, localGateEntityId);

      expect(localGateData().link).toBeUndefined();
      expect(backDoorData().link).toBeUndefined();
      expect(postWrites()).toBe(0);
    });

    it('renameGateId updates the local partner back-link', async () => {
      await createLink(undoManager, localGateEntityId, 'local', 'back-door');

      await renameGateId(undoManager, localGateEntityId, 'front-door');

      expect(localGateData().gateId).toBe('front-door');
      expect(backDoorData().link).toEqual({ puzzleId: 'local', gateId: 'front-door' });
    });

    it('releaseLinkBeforeDelete clears the local partner back-link', async () => {
      await createLink(undoManager, localGateEntityId, 'local', 'back-door');

      await releaseLinkBeforeDelete(undoManager, localGateEntityId);

      expect(backDoorData().link).toBeUndefined();
    });

    it('relinking a local pair to a remote target releases the local partner', async () => {
      await createLink(undoManager, localGateEntityId, 'local', 'back-door');

      await createLink(undoManager, localGateEntityId, 'remote', 'their-door');

      expect(backDoorData().link).toBeUndefined();
      expect(localGateData().link).toEqual({ puzzleId: 'remote', gateId: 'their-door' });
      expect(remoteGate('remote', 'their-door').link).toEqual({
        puzzleId: 'local',
        gateId: 'my-door',
      });
    });

    it('a failed local link leaves an existing pair intact', async () => {
      await createLink(undoManager, localGateEntityId, 'local', 'back-door');

      await expect(
        createLink(undoManager, localGateEntityId, 'local', 'no-such-door')
      ).rejects.toThrow(/not found/);

      // The old pair must not desync on a failed relink
      expect(localGateData().link).toEqual({ puzzleId: 'local', gateId: 'back-door' });
      expect(backDoorData().link).toEqual({ puzzleId: 'local', gateId: 'my-door' });
    });
  });

  describe('musicalMismatchWarnings', () => {
    it('is empty when tempo and key match', () => {
      expect(musicalMismatchWarnings({ tempo: 120, keySignature: 'C' }, repo.remote)).toEqual([]);
    });
  });
});
