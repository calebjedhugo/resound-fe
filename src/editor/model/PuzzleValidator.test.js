/**
 * PuzzleValidator Tests
 *
 * Tests the validation logic for puzzles being edited.
 * validatePuzzle(model) returns { errors: string[], warnings: string[] }
 */
import EditorPuzzleModel from 'editor/model/EditorPuzzleModel';
import { validatePuzzle } from 'editor/model/PuzzleValidator';
import { cellsOfRects } from 'core/floorTiles';

describe('PuzzleValidator', () => {
  let model;

  beforeEach(() => {
    model = new EditorPuzzleModel();
    // A built 15x15 room at the ground storey (cells 0..14)
    model.addTiles(cellsOfRects([{ elevation: 0, x1: 0, z1: 0, x2: 14, z2: 14 }]));
  });

  // -- Error tests --

  describe('errors', () => {
    it('reports error when no player spawn is defined', () => {
      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /player spawn/i.test(e))).toBe(true);
    });

    it('reports error when an entity stands where no floor was built (anywhere: no grid)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('wall', 15, 0, 5, {});
      model.addEntity('creature', -1, 0, 5, { song: [{ pitch: 'C4', length: '1/4' }] });

      const { errors } = validatePuzzle(model);

      expect(errors.filter((e) => /has no floor under it/.test(e))).toHaveLength(2);
      expect(errors.some((e) => /bounds/i.test(e))).toBe(false);
    });

    it('accepts entities on floor built at negative cells', () => {
      model.addTiles([{ x: -6, y: 0, z: -3 }]);
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('wall', -6, 0, -3, {});

      expect(validatePuzzle(model).errors.some((e) => /floor/.test(e))).toBe(false);
    });

    it('accepts a subfloor: the spawn and entities on tiles below the ground, a ramp up out of it', () => {
      model.addTiles([
        { x: 20, y: -1, z: 0 },
        { x: 21, y: -1, z: 0 },
      ]);
      model.setPlayerSpawn(20, -1, 0);
      // Rising east from E-1 at (21, 0) onto the ground floor... which is not
      // built at (22, 0): only that warning
      model.addEntity('ramp', 21, -1, 0, { direction: 'east' });
      let { errors, warnings } = validatePuzzle(model);
      expect(errors.some((e) => /floor/.test(e))).toBe(false);
      expect(warnings.some((w) => /\(22, 0\).*elevation 0/.test(w))).toBe(true);

      model.addTiles([{ x: 22, y: 0, z: 0 }]);
      ({ errors, warnings } = validatePuzzle(model));
      expect(warnings.some((w) => /ramp/i.test(w))).toBe(false);
    });

    it("counts a wall's top as floor: entities and the spawn may stand on it", () => {
      model.addEntity('wall', 3, 0, 3, {});
      model.setPlayerSpawn(3, 1, 3);
      model.addEntity('creature', 3, 1, 3, { song: [{ pitch: 'C4', length: '1/4' }] });
      model.addEntity('wall', 3, 2, 3, {}); // nothing under it: a storey too high

      const { errors } = validatePuzzle(model);

      expect(errors.filter((e) => /no floor/.test(e))).toEqual([
        expect.stringMatching(/wall .* E2/),
      ]);
    });

    it('reports error when the player spawn has no floor under it', () => {
      model.setPlayerSpawn(30, 0, 30);

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /spawn/i.test(e) && /no floor/.test(e))).toBe(true);
    });

    it('reports error when entity is at elevation with no floor region', () => {
      model.setPlayerSpawn(5, 0, 5);
      // Entity at y=1 but no floor at elevation 1 covers cell (5, 5)
      model.addEntity('wall', 5, 1, 5, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /elevation/i.test(e) || /floor/i.test(e))).toBe(true);
    });

    it('does not report elevation error for entities at y=0 (base floor)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('wall', 5, 0, 5, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /elevation/i.test(e) && /floor/i.test(e))).toBe(false);
    });

    it('reports error when creature has no song', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, { interval: 8, audibleRange: 15 });

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /creature/i.test(e) && /song/i.test(e))).toBe(true);
    });

    it('reports error when gate has no song', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 7, 0, 7, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /gate/i.test(e) && /song/i.test(e))).toBe(true);
    });

    it('reports error when fountain has no song', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('fountain', 7, 0, 7, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /fountain/i.test(e) && /song/i.test(e))).toBe(true);
    });

    it('reports error when song contains invalid pitch values', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'X4', length: '1/4' }],
        interval: 8,
        audibleRange: 15,
      });

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /pitch/i.test(e))).toBe(true);
    });

    it('reports error when song contains invalid length values', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: 'quarter' }],
        interval: 8,
        audibleRange: 15,
      });

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /length/i.test(e))).toBe(true);
    });

    it('reports error when duplicate non-wall entities occupy same position', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 15,
      });
      model.addEntity('gate', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /duplicate/i.test(e) || /same position/i.test(e))).toBe(true);
    });

    it('does not report duplicate error when two walls share same position', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('wall', 7, 0, 7, {});
      model.addEntity('wall', 7, 0, 7, {});

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /duplicate/i.test(e) || /same position/i.test(e))).toBe(false);
    });
  });

  // -- Warning tests --

  describe('warnings', () => {
    it('warns when the puzzle has nothing to solve (no gate)', () => {
      model.setPlayerSpawn(5, 0, 5);

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /nothing to solve/i.test(w))).toBe(true);
    });

    it('does not ask for a fountain: a level of gates is complete', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 7, 0, 7, { song: [{ pitch: 'C4', length: '1/4' }] });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /fountain|nothing to solve/i.test(w))).toBe(false);
    });

    it('warns when gate has no adjacent walls', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /gate/i.test(w) && /wall/i.test(w))).toBe(true);
    });

    it('does not warn about adjacent walls when gate has adjacent wall', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });
      // Wall at (8, 0, 7) is one cell east of gate at (7, 0, 7)
      model.addEntity('wall', 8, 0, 7, {});

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /gate/i.test(w) && /wall/i.test(w))).toBe(false);
    });

    it('does not warn about a creature whose range reaches no gate (the player carries it)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 0, 0, 0, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 1,
      });
      model.addEntity('gate', 14, 0, 14, {
        song: [{ pitch: 'C4', length: '1/4' }],
      });
      model.addEntity('wall', 14, 0, 13, {}); // wall adjacent to gate

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /creature/i.test(w) && /range/i.test(w))).toBe(false);
    });

    it('warns, softly, when a creature sings a gate its exact song from where it starts', () => {
      model.setPlayerSpawn(5, 0, 5);
      const song = [{ pitch: 'C4', length: '1/4' }];
      model.addEntity('creature', 7, 0, 7, { song, interval: 8, audibleRange: 30 });
      model.addEntity('gate', 8, 0, 8, { song, gateId: 'gate-1' });
      model.addEntity('wall', 8, 0, 7, {});

      const { warnings } = validatePuzzle(model);

      const selfSolve = warnings.find((w) => /exact song/.test(w));
      expect(selfSolve).toMatch(/from where it starts/);
      expect(selfSolve).toMatch(/opens on its own/);
      expect(selfSolve).toMatch(/fine if intended/);
      // ...a warning, never an error: creatures may open gates by design
      expect(validatePuzzle(model).errors).toEqual([]);
    });

    it('does not warn about self-solving when the singer is out of hearing', () => {
      model.setPlayerSpawn(5, 0, 5);
      const song = [{ pitch: 'C4', length: '1/4' }];
      model.addEntity('creature', 0, 0, 0, { song, interval: 8, audibleRange: 3 });
      model.addEntity('gate', 14, 0, 14, { song, gateId: 'gate-1' });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /exact song/.test(w))).toBe(false);
    });

    it('warns when a ramp leads onto no floor one storey up', () => {
      model.setPlayerSpawn(5, 0, 5);
      // Ramp at y=0 rising north: its high end is (5, 4) at elevation 1
      model.addEntity('ramp', 5, 0, 5, { direction: 'north' });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /ramp/i.test(w) && /\(5, 4\)/.test(w))).toBe(true);
    });

    it('does not warn when the ramp leads onto floor one storey up', () => {
      model.setPlayerSpawn(5, 0, 6);
      model.addTiles([{ x: 5, y: 1, z: 4 }]);
      model.addEntity('ramp', 5, 0, 5, { direction: 'north' });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /ramp/i.test(w))).toBe(false);
    });

    it('a ramp above the ground needs floor under it too (an error, like any entity)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addTiles([{ x: 5, y: 3, z: 4 }]); // the high end exists
      model.addEntity('ramp', 5, 2, 5, { direction: 'north' });

      const { errors, warnings } = validatePuzzle(model);

      expect(errors.some((e) => /ramp/.test(e) && /no floor/.test(e))).toBe(true);
      expect(warnings.some((w) => /ramp/i.test(w))).toBe(false);
    });

    it('warns when a gate target uses a pitch no creature sings', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 30,
      });
      model.addEntity('gate', 8, 0, 8, { song: [{ pitch: 'G5', length: '1/4' }] });
      model.addEntity('wall', 8, 0, 7, {});

      const { warnings } = validatePuzzle(model);

      const unsolvable = warnings.find((w) => /unsolvable/i.test(w));
      expect(unsolvable).toMatch(/G5/);
      // Said in today's terms: creatures are the only singers (no recording)
      expect(unsolvable).toMatch(/creatures are the only singers/);
      expect(unsolvable).not.toMatch(/record/i);
    });

    it('does not warn about solvability when creatures cover the target pitches', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'E4', length: '1/4' },
        ],
        interval: 8,
        audibleRange: 30,
      });
      // Different rhythm than the creature, but the pitch (E4) is covered.
      model.addEntity('fountain', 9, 0, 9, { song: [{ pitch: 'E4', length: '1/2' }] });

      const { warnings } = validatePuzzle(model);

      expect(warnings.some((w) => /unsolvable/i.test(w))).toBe(false);
    });
  });

  // -- General tests --

  describe('general', () => {
    it('returns zero errors and zero warnings for a valid puzzle', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('creature', 7, 0, 7, {
        song: [{ pitch: 'C4', length: '1/4' }],
        interval: 8,
        audibleRange: 30,
      });
      // Targets use covered pitches but are NOT the creature's exact song
      // (an exact in-range match would correctly warn about self-solving).
      model.addEntity('gate', 8, 0, 8, {
        song: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'C4', length: '1/4' },
        ],
        gateId: 'gate-1',
        facing: 'north',
      });
      model.addEntity('wall', 8, 0, 7, {}); // wall adjacent to gate
      model.addEntity('fountain', 9, 0, 9, {
        song: [
          { pitch: 'C4', length: '1/4' },
          { pitch: 'C4', length: '1/4' },
        ],
      });

      const { errors, warnings } = validatePuzzle(model);

      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
    });

    it('reports multiple errors on the same puzzle', () => {
      // No player spawn, creature without song, entity out of bounds
      model.addEntity('creature', 20, 0, 0, { interval: 8, audibleRange: 15 });

      const { errors } = validatePuzzle(model);

      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps warnings and errors in separate arrays', () => {
      // No player spawn (error) and nothing to solve (warning)
      const result = validatePuzzle(model);

      // Should have at least one error (no player spawn)
      expect(result.errors.some((e) => /player spawn/i.test(e))).toBe(true);
      // Should have at least one warning (nothing to solve)
      expect(result.warnings.some((w) => /nothing to solve/i.test(w))).toBe(true);

      // Errors should not appear in warnings and vice versa
      expect(result.warnings.some((w) => /player spawn/i.test(w))).toBe(false);
      expect(result.errors.some((e) => e === result.warnings[0])).toBe(false);
    });
  });

  // -- Gate identity + portal link tests --

  describe('gate ids and links', () => {
    const gateData = (extra) => ({
      song: [{ pitch: 'C4', length: '1/4' }],
      facing: 'north',
      ...extra,
    });

    it('reports error for duplicate gate ids', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 3, 0, 3, gateData({ gateId: 'door' }));
      model.addEntity('gate', 7, 0, 7, gateData({ gateId: 'door' }));

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /duplicate gate id "door"/i.test(e))).toBe(true);
    });

    it('reports error for malformed link', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 3, 0, 3, gateData({ gateId: 'door', link: { puzzleId: 'other' } }));

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /malformed link/i.test(e))).toBe(true);
    });

    it('reports error for invalid facing', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 3, 0, 3, gateData({ gateId: 'door', facing: 'up' }));

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /invalid facing "up"/i.test(e))).toBe(true);
    });

    it('reports error for a gate that links to itself', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.setMetadata({ id: 'here' });
      model.addEntity(
        'gate',
        3,
        0,
        3,
        gateData({ gateId: 'door', link: { puzzleId: 'here', gateId: 'door' } })
      );

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /links to itself/i.test(e))).toBe(true);
    });

    it('reports error for a same-puzzle link whose target gate does not exist', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.setMetadata({ id: 'here' });
      model.addEntity(
        'gate',
        3,
        0,
        3,
        gateData({ gateId: 'door', link: { puzzleId: 'here', gateId: 'ghost' } })
      );

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /does not exist in this puzzle/i.test(e))).toBe(true);
    });

    it('accepts a reciprocal same-puzzle pair (in-level teleport door)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.setMetadata({ id: 'here' });
      model.addEntity(
        'gate',
        3,
        0,
        3,
        gateData({ gateId: 'door-a', link: { puzzleId: 'here', gateId: 'door-b' } })
      );
      model.addEntity(
        'gate',
        7,
        0,
        7,
        gateData({ gateId: 'door-b', link: { puzzleId: 'here', gateId: 'door-a' } })
      );

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /link/i.test(e))).toBe(false);
    });

    it('reports error for a one-way same-puzzle link (partner does not link back)', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.setMetadata({ id: 'here' });
      model.addEntity(
        'gate',
        3,
        0,
        3,
        gateData({ gateId: 'door-a', link: { puzzleId: 'here', gateId: 'door-b' } })
      );
      model.addEntity('gate', 7, 0, 7, gateData({ gateId: 'door-b' })); // no back-link

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /does not link back/i.test(e))).toBe(true);
    });

    it('reports error when a linked same-puzzle pair has different songs', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.setMetadata({ id: 'here' });
      model.addEntity(
        'gate',
        3,
        0,
        3,
        gateData({ gateId: 'door-a', link: { puzzleId: 'here', gateId: 'door-b' } })
      );
      model.addEntity(
        'gate',
        7,
        0,
        7,
        gateData({
          gateId: 'door-b',
          link: { puzzleId: 'here', gateId: 'door-a' },
          song: [{ pitch: 'G4', length: '1/2' }],
        })
      );

      const { errors } = validatePuzzle(model);

      const songErrors = errors.filter((e) => /must share one song/i.test(e));
      expect(songErrors).toHaveLength(1); // reported once per pair, not per side
    });

    it('warns (not errors) for a gate without a stable id', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity('gate', 3, 0, 3, { song: [{ pitch: 'C4', length: '1/4' }] });

      const { errors, warnings } = validatePuzzle(model);

      expect(errors.some((e) => /gate id/i.test(e))).toBe(false);
      expect(warnings.some((w) => /no stable gate id/i.test(w))).toBe(true);
    });

    it('accepts a well-formed link without errors', () => {
      model.setPlayerSpawn(5, 0, 5);
      model.addEntity(
        'gate',
        3,
        0,
        3,
        gateData({ gateId: 'door', link: { puzzleId: 'other', gateId: 'their-door' } })
      );

      const { errors } = validatePuzzle(model);

      expect(errors.some((e) => /link|gate id|facing/i.test(e))).toBe(false);
    });
  });
});
