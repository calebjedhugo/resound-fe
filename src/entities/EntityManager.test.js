/**
 * EntityManager Tests
 *
 * Tests entity lifecycle management: add, remove, get, getByType, getAll, update, clear
 * These are integration tests that verify EntityManager behavior using the global ctx.
 */

import gameState from 'core/GameState';

describe('EntityManager', () => {
  // Uses global ctx from setupTests.js - no local entityManager needed

  describe('remove(entityId)', () => {
    it('removes entity from scene when entity has a mesh', () => {
      // Add a creature (which has a mesh)
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const creatureId = creature.id;

      // Verify creature is in scene
      const testEntityManager = ctx.getEntityManager();
      expect(testEntityManager.get(creatureId)).toBe(creature);

      // Remove the creature
      testEntityManager.remove(creatureId);

      // Verify creature is no longer accessible
      expect(testEntityManager.get(creatureId)).toBeUndefined();
    });

    it('calls dispose on the entity when removed', () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const creatureId = creature.id;

      // Spy on dispose
      const disposeSpy = jest.spyOn(creature, 'dispose');

      // Remove the creature
      ctx.getEntityManager().remove(creatureId);

      // Verify dispose was called
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('removes entity from gameState.entities when removed', () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];
      const creatureId = creature.id;

      // Verify creature is in gameState.entities
      expect(gameState.entities).toContain(creature);

      // Remove the creature
      ctx.getEntityManager().remove(creatureId);

      // Verify creature is no longer in gameState.entities
      expect(gameState.entities).not.toContain(creature);
    });

    it('does nothing when removing non-existent entity', () => {
      ctx.loadPuzzle('recording-basic');
      const testEntityManager = ctx.getEntityManager();
      const initialCount = testEntityManager.getAll().length;

      // Remove a non-existent entity - should not throw
      testEntityManager.remove('non-existent-id');

      // Verify entity count unchanged
      expect(testEntityManager.getAll().length).toBe(initialCount);
    });

    it('handles removing entity without mesh', () => {
      const testEntityManager = ctx.getEntityManager();

      // Create a minimal entity without a mesh
      const entityWithoutMesh = {
        id: 'test-entity-no-mesh',
        type: 'test',
        active: true,
        mesh: null,
        dispose: jest.fn(),
      };

      // Add it manually
      testEntityManager.add(entityWithoutMesh);
      expect(testEntityManager.get('test-entity-no-mesh')).toBe(entityWithoutMesh);

      // Remove it - should not throw even without mesh
      testEntityManager.remove('test-entity-no-mesh');

      // Verify entity is removed and dispose was called
      expect(testEntityManager.get('test-entity-no-mesh')).toBeUndefined();
      expect(entityWithoutMesh.dispose).toHaveBeenCalled();
    });
  });

  describe('get(entityId)', () => {
    it('returns entity by id', () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      const retrieved = ctx.getEntityManager().get(creature.id);
      expect(retrieved).toBe(creature);
    });

    it('returns undefined for non-existent id', () => {
      ctx.loadPuzzle('recording-basic');
      const retrieved = ctx.getEntityManager().get('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    it('returns all entities as an array', () => {
      ctx.loadPuzzle('recording-two-creatures');
      const testEntityManager = ctx.getEntityManager();

      const allEntities = testEntityManager.getAll();

      // Should return an array
      expect(Array.isArray(allEntities)).toBe(true);
      // Should contain all creatures from the puzzle
      expect(allEntities.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array when no entities exist', () => {
      // Fresh ctx entity manager with no puzzle loaded = no entities
      const testEntityManager = ctx.getEntityManager();
      const allEntities = testEntityManager.getAll();

      expect(Array.isArray(allEntities)).toBe(true);
      expect(allEntities.length).toBe(0);
    });

    it('reflects current state after add/remove operations', () => {
      ctx.loadPuzzle('recording-basic');
      const testEntityManager = ctx.getEntityManager();
      const initialCount = testEntityManager.getAll().length;

      // Add a minimal entity
      const newEntity = {
        id: 'new-entity',
        type: 'test',
        active: true,
        mesh: null,
        dispose: jest.fn(),
      };
      testEntityManager.add(newEntity);

      expect(testEntityManager.getAll().length).toBe(initialCount + 1);

      // Remove it
      testEntityManager.remove('new-entity');

      expect(testEntityManager.getAll().length).toBe(initialCount);
    });
  });

  describe('update(deltaTime)', () => {
    it('updates only active entities', async () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      // Deactivate the creature
      creature.active = false;

      // Spy on update
      const updateSpy = jest.spyOn(creature, 'update');

      // Run entity manager update
      ctx.getEntityManager().update(0.016);

      // Verify update was NOT called on inactive entity
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('updates active entities with deltaTime', async () => {
      ctx.loadPuzzle('recording-basic');
      const creatures = ctx.getCreatures();
      const creature = creatures[0];

      // Spy on update
      const updateSpy = jest.spyOn(creature, 'update');

      // Run entity manager update
      ctx.getEntityManager().update(0.016);

      // Verify update was called with deltaTime
      expect(updateSpy).toHaveBeenCalledWith(0.016);
    });

    it('handles entities without update method gracefully', () => {
      const testEntityManager = ctx.getEntityManager();

      // Add an entity without update method
      const entityWithoutUpdate = {
        id: 'no-update-entity',
        type: 'test',
        active: true,
        mesh: null,
        dispose: jest.fn(),
        // No update method
      };

      testEntityManager.add(entityWithoutUpdate);

      // Should not throw
      expect(() => testEntityManager.update(0.016)).not.toThrow();
    });
  });

  describe('clear()', () => {
    it('removes all entities from the manager', () => {
      ctx.loadPuzzle('recording-two-creatures');
      const testEntityManager = ctx.getEntityManager();

      expect(testEntityManager.getAll().length).toBeGreaterThan(0);

      testEntityManager.clear();

      expect(testEntityManager.getAll().length).toBe(0);
    });

    it('disposes all entities when clearing', () => {
      ctx.loadPuzzle('recording-basic');
      const testEntityManager = ctx.getEntityManager();
      const creatures = ctx.getCreatures();
      const disposeSpy = jest.spyOn(creatures[0], 'dispose');

      testEntityManager.clear();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('clears gameState.entities when clearing', () => {
      ctx.loadPuzzle('recording-basic');
      const testEntityManager = ctx.getEntityManager();

      expect(gameState.entities.length).toBeGreaterThan(0);

      testEntityManager.clear();

      expect(gameState.entities.length).toBe(0);
    });
  });
});
