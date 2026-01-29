/**
 * exportPuzzle Tests
 *
 * Tests the puzzle export pipeline: validation then serialization.
 * exportPuzzle(model) returns { json, errors, warnings }.
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import { exportPuzzle, getManifestEntry } from 'editor/io/exportPuzzle';

describe('exportPuzzle', () => {
  let model;

  /**
   * Build a valid model with player spawn, creature, gate, wall, and fountain.
   * This passes validation with zero errors and zero warnings.
   */
  function buildValidModel() {
    model.setMetadata({ id: 'test-puzzle', name: 'Test Puzzle', difficulty: 2 });
    model.setPlayerSpawn(5, 0, 5);
    model.addEntity('creature', 7, 0, 7, {
      song: [{ pitch: 'C4', length: '1/4' }],
      interval: 8,
      audibleRange: 30,
    });
    model.addEntity('gate', 8, 0, 8, {
      song: [{ pitch: 'C4', length: '1/4' }],
    });
    model.addEntity('wall', 8, 0, 7, {});
    model.addEntity('fountain', 9, 0, 9, {
      song: [{ pitch: 'C4', length: '1/4' }],
    });
  }

  beforeEach(() => {
    model = new EditorPuzzleModel();
  });

  it('returns null JSON when validation has errors', () => {
    // No player spawn => validation error
    const result = exportPuzzle(model);

    expect(result.json).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('produces valid JSON when validation has only warnings', () => {
    // Player spawn set but no fountain => warning only (no fountain / no win condition)
    model.setMetadata({ id: 'warn-puzzle', name: 'Warning Puzzle', difficulty: 1 });
    model.setPlayerSpawn(5, 0, 5);
    model.addEntity('wall', 3, 0, 3, {});

    const result = exportPuzzle(model);

    expect(result.json).not.toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('produces JSON conforming to puzzle schema structure', () => {
    buildValidModel();

    const result = exportPuzzle(model);

    expect(result.json).not.toBeNull();
    expect(result.errors).toEqual([]);

    // Top-level schema fields
    expect(result.json).toHaveProperty('id', 'test-puzzle');
    expect(result.json).toHaveProperty('name', 'Test Puzzle');
    expect(result.json).toHaveProperty('difficulty', 2);
    expect(result.json).toHaveProperty('gridSize');
    expect(result.json).toHaveProperty('tempo');
    expect(result.json).toHaveProperty('playerStart');
    expect(result.json.playerStart).toEqual({ x: 5, y: 0, z: 5 });
    expect(result.json).toHaveProperty('entities');
    expect(Array.isArray(result.json.entities)).toBe(true);
    expect(result.json.entities.length).toBe(4);
  });

  describe('getManifestEntry', () => {
    it('extracts id, name, and difficulty from exported JSON', () => {
      buildValidModel();
      const { json } = exportPuzzle(model);
      const entry = getManifestEntry(json);

      expect(entry).toEqual({
        id: 'test-puzzle',
        name: 'Test Puzzle',
        difficulty: 2,
      });
    });
  });
});
