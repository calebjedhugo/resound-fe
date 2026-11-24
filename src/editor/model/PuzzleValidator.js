/**
 * PuzzleValidator
 *
 * Validates an EditorPuzzleModel and returns errors/warnings.
 * Errors block export; warnings flag issues for review.
 */
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import SongMatcher from 'core/SongMatcher';
import { GATE_FACINGS, isValidGateId } from 'editor/util/gateIds';

const VALID_PITCH = /^[A-G][#b]?\d$/;
const VALID_LENGTH = /^1\/\d+$/;

const SONG_ENTITY_TYPES = ['creature', 'gate', 'fountain'];

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * The distinct pitches a song contains (flattening voices and chords). Used to
 * check solvability: creatures are the only sound sources (the player sings
 * nothing; they carry creatures with the pole and release them elsewhere), so
 * every pitch a gate/fountain requires must be sung by some creature.
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

// A ramp's high end leads onto the cell this way (its `direction`)
const RAMP_UP = {
  north: { dx: 0, dz: -1 },
  east: { dx: 1, dz: 0 },
  south: { dx: 0, dz: 1 },
  west: { dx: -1, dz: 0 },
};

/**
 * Validate a puzzle model.
 * @param {EditorPuzzleModel} model
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validatePuzzle(model) {
  const errors = [];
  const warnings = [];
  const entities = model.getEntities();
  const hasFloorAt = (x, z, y) => model.hasTile(x, y, z);

  // --- Errors ---

  // 1. No player spawn, or one with no floor under it
  const spawn = model.getPlayerSpawn();
  if (!spawn) {
    errors.push('No player spawn defined');
  } else if (!hasFloorAt(spawn.x, spawn.z, spawn.y)) {
    errors.push(`Player spawn at (${spawn.x}, ${spawn.z}) E${spawn.y} has no floor under it`);
  }

  for (const entity of entities) {
    // 2. Every entity stands on a floor tile (the editor builds one under
    // anything placed; the floor is only what the designer built)
    if (!hasFloorAt(entity.x, entity.z, entity.y)) {
      errors.push(
        `Entity (${entity.type} id=${entity.id}) at (${entity.x}, ${entity.z}) E${entity.y} has no floor under it`
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

  // 10. Gate identity + link shape (cross-file link validity — target puzzle/
  // gate existence, reciprocity, tempo match — is checked asynchronously by
  // the portal link UI, not here; this validator is sync and single-file).
  const gateIdCounts = new Map();
  for (const gate of entities.filter((e) => e.type === 'gate')) {
    const { gateId, facing, link } = gate.data || {};
    if (!isValidGateId(gateId)) {
      // Not an error: import/placement auto-assign ids, so this only occurs
      // in hand-built models — and an id-less gate is fine until linked to.
      warnings.push(`Gate (id=${gate.id}) has no stable gate id (auto-assigned on import)`);
    } else {
      gateIdCounts.set(gateId, (gateIdCounts.get(gateId) || 0) + 1);
    }
    if (facing && !GATE_FACINGS.includes(facing)) {
      errors.push(`Gate (id=${gate.id}) has invalid facing "${facing}"`);
    }
    if (link && (!link.puzzleId || !isValidGateId(link.gateId))) {
      errors.push(`Gate (id=${gate.id}) has a malformed link (needs puzzleId and gateId)`);
    }
  }
  for (const [gateId, count] of gateIdCounts) {
    if (count > 1) {
      errors.push(`Duplicate gate id "${gateId}" (${count} gates) — links need unique ids`);
    }
  }

  // 10b. SAME-puzzle links (in-level teleport doors) are fully checkable
  // here, no cross-file trip: the target gate must exist and must not be
  // the gate itself. (Skipped for an unsaved puzzle — no id to match yet.)
  const puzzleId = model.getMetadata().id;
  if (puzzleId) {
    for (const gate of entities.filter((e) => e.type === 'gate')) {
      const { gateId, link } = gate.data || {};
      if (!link || link.puzzleId !== puzzleId) continue;
      if (link.gateId === gateId) {
        errors.push(`Gate "${gateId}" links to itself`);
      } else if (!gateIdCounts.has(link.gateId)) {
        errors.push(
          `Gate "${gateId}" links to "${link.gateId}", which does not exist in this puzzle`
        );
      } else {
        const partner = entities.find(
          (e) => e.type === 'gate' && e.data && e.data.gateId === link.gateId
        );
        const partnerLink = partner && partner.data.link;
        if (!partnerLink || partnerLink.puzzleId !== puzzleId || partnerLink.gateId !== gateId) {
          // Links are bidirectional by design; one-way pairs come from undoing
          // half of a link edit (use Clear Link / relink to repair)
          errors.push(
            `Gate "${gateId}" links to "${link.gateId}", but "${link.gateId}" does not link back`
          );
        } else if (
          JSON.stringify(gate.data.song) !== JSON.stringify(partner.data.song) &&
          gateId < link.gateId // reciprocal pair: report once
        ) {
          // Linked gates are ONE DOOR and must share one song (the pair
          // mirrors its open state at runtime)
          errors.push(
            `Linked gates "${gateId}" and "${link.gateId}" have different songs — ` +
              'a linked pair is one door and must share one song (relink to unify)'
          );
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

  // 1. Nothing to solve. (Fountains are parked — the levels are a chain of
  // gates and doors — so a level without a fountain is normal; one with
  // neither has nothing for its creatures to open.)
  if (gatesAndFountains.length === 0) {
    warnings.push('Nothing to solve: no gate in this puzzle');
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

  // 3b. Creature that, WHERE IT STARTS, sings a target's exact song within
  // hearing: that gate opens on its own before the player does anything.
  // Legal by design (creatures CAN open targets) and sometimes intended —
  // the player can always carry the creature away with the pole — but more
  // often a layout slip, so it is still flagged.
  for (const creature of creatures) {
    const creatureSong = creature.data?.song;
    const creatureSings = creatureSong && creatureSong.length > 0;
    for (const target of creatureSings ? gatesAndFountains : []) {
      const targetSong = target.data?.song;
      const targetEmpty =
        !targetSong || (Array.isArray(targetSong) ? targetSong.length === 0 : !targetSong.voices);
      if (!targetEmpty) {
        const dx = (creature.x - target.x) * WORLD_SCALE;
        const dy = (creature.y - target.y) * ELEVATION_HEIGHT;
        const dz = (creature.z - target.z) * WORLD_SCALE;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const range = creature.data?.audibleRange ?? 0;
        let selfSolves = false;
        try {
          selfSolves = distance <= range && SongMatcher.songsMatch(creatureSong, targetSong);
        } catch {
          // A malformed song can't self-solve; other checks will flag it.
        }
        if (selfSolves) {
          warnings.push(
            `${capitalize(target.type)} (id=${target.id}) hears creature (id=${
              creature.id
            }) singing its exact song from where it starts — it opens on its own ` +
              'before the player moves anything (fine if intended)'
          );
        }
      }
    }
  }

  // (No "creature's range reaches no gate" warning any more: the player
  // carries creatures to where they are needed, so a creature placed far
  // from every gate is the usual layout, not a mistake.)

  // 6. Gate/fountain target requires a pitch no creature sings. Creatures are
  // the only sound sources (the player carries and releases them, never
  // sings), so an uncovered pitch can never be produced — a strong
  // (harmony-safe) signal the target is unsolvable.
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
        }) needs pitch(es) no creature sings (${missing.join(', ')}) — ` +
          'creatures are the only singers, so it may be unsolvable'
      );
    }
  }

  // 4. Ramp checks: its high end must lead onto floor one storey up (its
  // own cell's floor is checked with every entity's)
  for (const ramp of ramps) {
    const upperElevation = ramp.y + 1;
    const up = RAMP_UP[ramp.data && ramp.data.direction] || RAMP_UP.north;
    const hx = ramp.x + up.dx;
    const hz = ramp.z + up.dz;
    if (!hasFloorAt(hx, hz, upperElevation)) {
      warnings.push(
        `Ramp (id=${ramp.id}) at (${ramp.x}, ${ramp.z}) leads onto (${hx}, ${hz}), which has no floor at elevation ${upperElevation}`
      );
    }
  }

  return { errors, warnings };
}
