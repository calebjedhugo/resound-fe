/**
 * PuzzleValidator
 *
 * Validates an EditorPuzzleModel and returns errors/warnings.
 * Errors block export; warnings flag issues for review.
 */
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import SongMatcher from 'core/SongMatcher';

const VALID_PITCH = /^[A-G][#b]?\d$/;
const VALID_LENGTH = /^1\/\d+$/;

const SONG_ENTITY_TYPES = ['creature', 'gate', 'fountain'];

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * The distinct pitches a song contains (flattening voices and chords). Used to
 * check solvability: a played song is a recording of creatures, so every pitch
 * a gate/fountain requires must be sung by some creature.
 */
function songPitches(song) {
  const pitches = new Set();
  for (const entry of SongMatcher.flattenSong(song)) {
    const notes = Array.isArray(entry) ? entry : [entry];
    for (const note of notes) {
      if (note && note.pitch) pitches.add(note.pitch);
    }
  }
  return pitches;
}

/**
 * Check whether any floor region covers the given cell at the given elevation.
 * Returns true if a floor region with that exact elevation includes (x, z).
 */
function hasFloorAt(floors, x, z, elevation) {
  return floors.some(
    (f) => f.elevation === elevation && x >= f.x1 && x <= f.x2 && z >= f.z1 && z <= f.z2
  );
}

/**
 * Validate a puzzle model.
 * @param {EditorPuzzleModel} model
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validatePuzzle(model) {
  const errors = [];
  const warnings = [];
  const { gridSize } = model.getMetadata();
  const entities = model.getEntities();
  const floors = model.getFloors();

  // --- Errors ---

  // 1. No player spawn
  if (!model.getPlayerSpawn()) {
    errors.push('No player spawn defined');
  }

  for (const entity of entities) {
    // 2. Entity outside grid bounds
    if (entity.x < 0 || entity.x >= gridSize || entity.z < 0 || entity.z >= gridSize) {
      errors.push(
        `Entity (${entity.type} id=${entity.id}) is outside grid bounds at (${entity.x}, ${entity.z})`
      );
    }

    // 3. Entity elevation doesn't match any floor region (y > 0)
    if (entity.y > 0 && !hasFloorAt(floors, entity.x, entity.z, entity.y)) {
      errors.push(
        `Entity (${entity.type} id=${entity.id}) at elevation ${entity.y} has no floor region at (${entity.x}, ${entity.z})`
      );
    }

    // 4-6. Creature / gate / fountain missing song
    if (SONG_ENTITY_TYPES.includes(entity.type)) {
      const { song } = entity.data || {};
      if (!song || !Array.isArray(song) || song.length === 0) {
        errors.push(`${capitalize(entity.type)} (id=${entity.id}) is missing a song`);
      } else {
        // 7. Invalid pitch
        for (const note of song) {
          if (!VALID_PITCH.test(note.pitch)) {
            errors.push(
              `${capitalize(entity.type)} (id=${entity.id}) song contains invalid pitch "${
                note.pitch
              }"`
            );
          }
          // 8. Invalid length
          if (!VALID_LENGTH.test(note.length)) {
            errors.push(
              `${capitalize(entity.type)} (id=${entity.id}) song contains invalid length "${
                note.length
              }"`
            );
          }
        }
      }
    }
  }

  // 9. Duplicate non-wall entities at same position
  const nonWallEntities = entities.filter((e) => e.type !== 'wall');
  const positionMap = new Map();
  for (const entity of nonWallEntities) {
    const key = `${entity.x},${entity.y},${entity.z}`;
    if (!positionMap.has(key)) {
      positionMap.set(key, []);
    }
    positionMap.get(key).push(entity);
  }
  for (const [key, group] of positionMap) {
    if (group.length > 1) {
      const types = group.map((e) => e.type).join(', ');
      errors.push(`Duplicate non-wall entities at same position (${key}): ${types}`);
    }
  }

  // --- Warnings ---

  const fountains = entities.filter((e) => e.type === 'fountain');
  const gates = entities.filter((e) => e.type === 'gate');
  const creatures = entities.filter((e) => e.type === 'creature');
  const walls = entities.filter((e) => e.type === 'wall');
  const ramps = entities.filter((e) => e.type === 'ramp');
  const gatesAndFountains = [...gates, ...fountains];

  // 1. No fountain defined
  if (fountains.length === 0) {
    warnings.push('No fountain defined (no win condition)');
  }

  // 2. Gate with no adjacent walls
  for (const gate of gates) {
    const hasAdjacentWall = walls.some(
      (w) =>
        w.y === gate.y &&
        ((Math.abs(w.x - gate.x) === 1 && w.z === gate.z) ||
          (Math.abs(w.z - gate.z) === 1 && w.x === gate.x))
    );
    if (!hasAdjacentWall) {
      warnings.push(`Gate (id=${gate.id}) has no adjacent wall at elevation ${gate.y}`);
    }
  }

  // 3. Creature audibleRange doesn't reach any gate/fountain
  for (const creature of creatures) {
    const range = creature.data?.audibleRange ?? 0;
    const reachesTarget = gatesAndFountains.some((target) => {
      const dx = (creature.x - target.x) * WORLD_SCALE;
      const dy = (creature.y - target.y) * ELEVATION_HEIGHT;
      const dz = (creature.z - target.z) * WORLD_SCALE;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return distance <= range;
    });
    if (!reachesTarget) {
      warnings.push(
        `Creature (id=${creature.id}) audible range (${range}) does not reach any gate or fountain`
      );
    }
  }

  // 6. Gate/fountain target requires a pitch no creature sings. A played song
  // is a recording of creatures, so an uncovered pitch can never be produced —
  // a strong (harmony-safe) signal the target is unsolvable.
  const creaturePitches = new Set();
  for (const creature of creatures) {
    songPitches(creature.data?.song).forEach((p) => creaturePitches.add(p));
  }
  for (const target of gatesAndFountains) {
    const needed = songPitches(target.data?.song);
    const missing = [...needed].filter((p) => !creaturePitches.has(p));
    if (needed.size > 0 && missing.length > 0) {
      warnings.push(
        `${capitalize(target.type)} (id=${
          target.id
        }) target uses pitch(es) no creature sings (${missing.join(', ')}) — may be unsolvable`
      );
    }
  }

  // 4-5. Ramp floor checks
  for (const ramp of ramps) {
    const upperElevation = ramp.y + 1;
    // 4. No floor at upper elevation
    if (!hasFloorAt(floors, ramp.x, ramp.z, upperElevation)) {
      warnings.push(
        `Ramp (id=${ramp.id}) at (${ramp.x}, ${ramp.z}) has no floor at upper elevation ${upperElevation}`
      );
    }

    // 5. No floor at lower elevation (y > 0 only; y=0 is base floor)
    if (ramp.y > 0 && !hasFloorAt(floors, ramp.x, ramp.z, ramp.y)) {
      warnings.push(
        `Ramp (id=${ramp.id}) at (${ramp.x}, ${ramp.z}) has no floor at lower elevation ${ramp.y}`
      );
    }
  }

  return { errors, warnings };
}
