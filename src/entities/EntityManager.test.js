/**
 * EntityManager Tests
 *
 * Tests entity lifecycle behaviors: how entities appear/disappear from the game world,
 * and how removal affects game behavior (e.g., removed creatures stop singing).
 * Uses global ctx from setupTests.js.
 */

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
      expect(testEntityManager.getAll()).toContain(creature);

      testEntityManager.remove(creatureId);

      expect(testEntityManager.getAll()).not.toContain(creature);
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
      const initialCount = testEntityManager.getAll().length;

      testEntityManager.remove('non-existent-id');

      expect(testEntityManager.getAll().length).toBe(initialCount);
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

  describe('getAll()', () => {
    it('lists all entities present in game world', () => {
      ctx.loadPuzzle('recording-two-creatures');
      const testEntityManager = ctx.getEntityManager();

      const allEntities = testEntityManager.getAll();

      expect(Array.isArray(allEntities)).toBe(true);
      expect(allEntities.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty list when game world has no entities', () => {
      const testEntityManager = ctx.getEntityManager();
      const allEntities = testEntityManager.getAll();

      expect(Array.isArray(allEntities)).toBe(true);
      expect(allEntities.length).toBe(0);
    });

    it('loading puzzle populates game world with entities', () => {
      // Loading a puzzle replaces the world's active area (and its entity
      // manager), so re-query the manager after loading
      expect(ctx.getEntityManager().getAll().length).toBe(0);

      ctx.loadPuzzle('recording-two-creatures');

      expect(ctx.getEntityManager().getAll().length).toBeGreaterThanOrEqual(2);
    });

    it('entity count decreases when creature is removed', () => {
      ctx.loadPuzzle('recording-basic');
      const testEntityManager = ctx.getEntityManager();
      const creatures = ctx.getCreatures();
      const initialCount = testEntityManager.getAll().length;

      testEntityManager.remove(creatures[0].id);

      expect(testEntityManager.getAll().length).toBe(initialCount - 1);
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

      expect(testEntityManager.getAll().length).toBeGreaterThan(0);

      testEntityManager.clear();

      expect(testEntityManager.getAll().length).toBe(0);
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
