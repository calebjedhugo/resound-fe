/**
 * EntityManager Tests
 *
 * Tests entity lifecycle behaviors: how entities appear/disappear from the game world,
 * and how removal affects game behavior (e.g., removed creatures stop singing).
 * Uses global ctx from setupTests.js.
 */
import gameState from 'core/GameState';

describe('EntityManager', () => {
  describe('remove(entityId)', () => {
    it('removed creature no longer appears in game world', () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const creatureId = creature.id;

      const testEntityManager = ctx.getEntityManager();
      expect(testEntityManager.get(creatureId)).toBe(creature);

      testEntityManager.remove(creatureId);

      expect(testEntityManager.get(creatureId)).toBeUndefined();
    });

    it('removed creature is excluded from world entity list', () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const creatureId = creature.id;

      const testEntityManager = ctx.getEntityManager();
      expect(gameState.entities).toContain(creature);

      testEntityManager.remove(creatureId);

      expect(gameState.entities).not.toContain(creature);
    });

    it('removed creature is excluded from creature queries', () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const creatureId = creature.id;

      const testEntityManager = ctx.getEntityManager();
      expect(testEntityManager.getByType('creature')).toContain(creature);

      testEntityManager.remove(creatureId);

      expect(testEntityManager.getByType('creature')).not.toContain(creature);
    });

    it('removing non-existent entity leaves game world unchanged', () => {
      ctx.loadPuzzle('recording-basic');
      const testEntityManager = ctx.getEntityManager();
      const initialCount = gameState.entities.length;

      testEntityManager.remove('non-existent-id');

      expect(gameState.entities.length).toBe(initialCount);
    });
  });

  describe('get(entityId)', () => {
    it('retrieves creature by its unique identifier', () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      const retrieved = ctx.getEntityManager().get(creature.id);
      expect(retrieved).toBe(creature);
    });

    it('returns undefined when querying for non-existent entity', () => {
      ctx.loadPuzzle('recording-basic');
      const retrieved = ctx.getEntityManager().get('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getByType(type)', () => {
    it('queries all creatures in the game world', () => {
      ctx.loadPuzzle('recording-two-creatures');
      const testEntityManager = ctx.getEntityManager();

      const creatures = testEntityManager.getByType('creature');

      expect(creatures.length).toBeGreaterThanOrEqual(2);
      creatures.forEach((entity) => {
        expect(entity.type).toBe('creature');
      });
    });

    it('returns empty list when no gates exist in puzzle', () => {
      ctx.loadPuzzle('recording-basic');
      const testEntityManager = ctx.getEntityManager();

      const gates = testEntityManager.getByType('gate');

      expect(Array.isArray(gates)).toBe(true);
      expect(gates.length).toBe(0);
    });
  });

  describe('the world entity list (gameState.entities)', () => {
    it('lists all entities present in game world', () => {
      ctx.loadPuzzle('recording-two-creatures');

      expect(gameState.entities.length).toBeGreaterThanOrEqual(2);
    });

    it('is empty when game world has no entities', () => {
      expect(gameState.entities).toEqual([]);
    });

    it('loading puzzle populates game world with entities', () => {
      // Loading a puzzle replaces the world's active area; the world's list
      // is always the active area's
      expect(gameState.entities.length).toBe(0);

      ctx.loadPuzzle('recording-two-creatures');

      expect(gameState.entities.length).toBeGreaterThanOrEqual(2);
    });

    it('entity count decreases when creature is removed', () => {
      ctx.loadPuzzle('recording-basic');
      const testEntityManager = ctx.getEntityManager();
      const creatures = ctx.getCreatures();
      const initialCount = gameState.entities.length;

      testEntityManager.remove(creatures[0].id);

      expect(gameState.entities.length).toBe(initialCount - 1);
    });
  });

  describe('update(deltaTime)', () => {
    it('removed creatures no longer emit notes during update', async () => {
      ctx.loadPuzzle('creature-singing-timing');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const testEntityManager = ctx.getEntityManager();

      // Place player in audible range to hear the creature
      ctx.setPlayerPosition({ x: creature.position.x, z: creature.position.z + 5 });

      // Remove the creature from the entity manager
      testEntityManager.remove(creature.id);

      // Clear any notes emitted during setup
      ctx.clearEmittedNotes();

      // Advance time past the sing interval - creature would normally sing
      await ctx.advanceBeats(creature.interval + 1);

      // Removed creature should not emit any notes
      const emittedNotes = ctx.getEmittedNotes();
      expect(emittedNotes.length).toBe(0);
    });

    it('active creatures emit notes when updated over time', async () => {
      ctx.loadPuzzle('creature-singing-timing');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      // Place player in audible range to hear the creature
      ctx.setPlayerPosition({ x: creature.position.x, z: creature.position.z + 5 });

      // Clear any notes emitted during setup
      ctx.clearEmittedNotes();

      // Advance time past the sing interval - creature should sing
      await ctx.advanceBeats(creature.interval + 1);

      // Creature should have emitted notes
      const emittedNotes = ctx.getEmittedNotes();
      expect(emittedNotes.length).toBeGreaterThan(0);
      expect(emittedNotes[0].pitch).toBe('D4');
    });
  });

  describe('clear()', () => {
    it('clearing removes all entities from game world', () => {
      ctx.loadPuzzle('recording-two-creatures');
      const testEntityManager = ctx.getEntityManager();

      expect(gameState.entities.length).toBeGreaterThan(0);

      testEntityManager.clear();

      expect(gameState.entities.length).toBe(0);
    });

    it('cleared entities are no longer retrievable by id', () => {
      ctx.loadPuzzle('recording-two-creatures');
      const testEntityManager = ctx.getEntityManager();
      const creatures = ctx.getCreatures();
      const creatureIds = creatures.map((c) => c.id);

      testEntityManager.clear();

      creatureIds.forEach((id) => {
        expect(testEntityManager.get(id)).toBeUndefined();
      });
    });

    it('cleared game world has no creatures to query', () => {
      ctx.loadPuzzle('recording-two-creatures');
      const testEntityManager = ctx.getEntityManager();

      // Verify creatures exist before clear
      expect(testEntityManager.getByType('creature').length).toBeGreaterThan(0);

      testEntityManager.clear();

      expect(testEntityManager.getByType('creature').length).toBe(0);
    });
  });
});

/*
 * Leaving an area frees every GPU resource its entities own — the whole mesh
 * tree, not just the root (a Group root or child meshes used to leak on every
 * area unload: Floor's planes/slabs, Ramp's marker posts) — and never the
 * module-wide resources shared across instances.
 */
/* eslint-disable import/first -- section header for the suite below; imports
   are hoisted by babel-jest so the placement is cosmetic */
import Wall from 'entities/Wall';
import Gate from 'entities/Gate';
/* eslint-enable import/first */

describe('Freeing GPU resources when entities go away', () => {
  // Every geometry/material in an entity's mesh tree, each paired with a
  // dispose spy
  const resourcesOf = (entity) => {
    const found = [];
    const visit = (object) => {
      [object.geometry, object.material].forEach((resource) => {
        if (resource && !found.some((f) => f.resource === resource)) {
          found.push({ resource, dispose: jest.spyOn(resource, 'dispose') });
        }
      });
      (object.children || []).forEach(visit);
    };
    visit(entity.mesh);
    return found;
  };

  it('frees raised floors and ramp marker posts when the world moves on', () => {
    ctx.loadPuzzle('elevation-ramp');
    const floor = ctx.getEntityManager().getByType('floor')[0];
    const ramp = ctx.getEntityManager().getByType('ramp')[0];
    const floorResources = resourcesOf(floor);
    const rampResources = resourcesOf(ramp);
    // Ground plane + one raised slab, each with geometry + material; the
    // ramp's wedge plus its (shared-between-posts) post geometry + material
    expect(floorResources).toHaveLength(4);
    expect(rampResources).toHaveLength(4);

    ctx.loadPuzzle('recording-basic'); // tears the old world down

    [...floorResources, ...rampResources].forEach(({ dispose }) => {
      expect(dispose).toHaveBeenCalledTimes(1);
    });
  });

  it('never frees the wall box every wall shares', () => {
    ctx.loadPuzzle('recording-basic');
    const geometryDispose = jest.spyOn(Wall.GEOMETRY, 'dispose');
    const wall = new Wall({ x: 3, y: 0, z: 3 });
    ctx.getEntityManager().add(wall);
    const materialDispose = jest.spyOn(wall.mesh.material, 'dispose');

    ctx.getEntityManager().remove(wall.id);

    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('never frees the box every gate shares, but frees each gate its own material', () => {
    ctx.loadPuzzle('recording-basic');
    const song = [{ pitch: 'C4', length: '1/4' }];
    const gates = [3, 6].map((x) => ctx.addGate({ position: { x, y: 0, z: 3 }, song }));
    expect(gates[0].mesh.geometry).toBe(Gate.GEOMETRY);
    expect(gates[1].mesh.geometry).toBe(Gate.GEOMETRY);
    const geometryDispose = jest.spyOn(Gate.GEOMETRY, 'dispose');
    const materialDisposes = gates.map((gate) => jest.spyOn(gate.mesh.material, 'dispose'));

    ctx.getEntityManager().remove(gates[0].id);
    expect(materialDisposes[0]).toHaveBeenCalledTimes(1);
    ctx.loadPuzzle('listening-gate-basic'); // the rest go with the world

    expect(materialDisposes[1]).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled();
  });
});
