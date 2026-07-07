/**
 * Session Persistence Tests
 *
 * Tests for saving/loading editor state to/from localStorage.
 * Covers round-trip fidelity, clearing state, and graceful error handling.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import { saveSession, loadSession, clearSession } from 'editor/io/sessionPersistence';

describe('Session Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('serializes to localStorage and deserializes back with matching model state', () => {
    const model = new EditorPuzzleModel();
    model.setMetadata({
      id: 'session-test',
      name: 'Session Test Puzzle',
      difficulty: 3,
      tempo: 140,
      gridSize: 20,
    });
    model.setPlayerSpawn(5, 1, 10);
    model.addFloor(1, 0, 0, 10, 10);
    model.addEntity('creature', 3, 1, 5, {
      song: [{ pitch: 'C4', length: '1/4' }],
      interval: 4,
      audibleRange: 10,
    });
    model.addEntity('gate', 7, 0, 3, {
      song: [{ pitch: 'D4', length: '1/2' }],
      gateId: 'gate-1',
      facing: 'north',
    });
    model.addEntity('wall', 2, 1, 6, {});
    model.addEntity('ramp', 5, 0, 8, { direction: 'north' });

    saveSession(model);
    const restored = loadSession();

    expect(restored).not.toBeNull();
    expect(restored.getMetadata()).toEqual(model.getMetadata());
    expect(restored.getPlayerSpawn()).toEqual(model.getPlayerSpawn());
    expect(restored.getFloors()).toEqual(model.getFloors());

    const originalEntities = model.getEntities();
    const restoredEntities = restored.getEntities();
    expect(restoredEntities.length).toBe(originalEntities.length);

    for (let i = 0; i < originalEntities.length; i++) {
      expect(restoredEntities[i].type).toBe(originalEntities[i].type);
      expect(restoredEntities[i].x).toBe(originalEntities[i].x);
      expect(restoredEntities[i].y).toBe(originalEntities[i].y);
      expect(restoredEntities[i].z).toBe(originalEntities[i].z);
      expect(restoredEntities[i].data).toEqual(originalEntities[i].data);
    }
  });

  it('clearSession removes stored state so loadSession returns null', () => {
    const model = new EditorPuzzleModel();
    model.setMetadata({ id: 'clear-test', name: 'Will Be Cleared' });
    model.setPlayerSpawn(0, 0, 0);

    saveSession(model);
    expect(loadSession()).not.toBeNull();

    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('returns null gracefully for missing or corrupt localStorage data', () => {
    // Missing data — nothing stored yet
    expect(loadSession()).toBeNull();

    // Corrupt (unparseable) JSON string
    localStorage.setItem('resound-editor-session', 'not valid json {{{');
    expect(loadSession()).toBeNull();

    // Parseable JSON but causes deserialization error (entity with no position)
    localStorage.setItem(
      'resound-editor-session',
      JSON.stringify({ entities: [{ type: 'wall' }] })
    );
    expect(loadSession()).toBeNull();
  });
});
