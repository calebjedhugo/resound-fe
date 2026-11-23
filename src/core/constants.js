// World scale: 1 grid unit = 3 world units
// This allows grid coordinates (0-64) to map to comfortable world space (0-192)
export const WORLD_SCALE = 3;

// Absorb range as a fraction of a creature's audible range: the pole reaches
// a creature within this share of how far it carries (the old recording
// range, ruled 2026-11-23 — R absorbs where it used to record)
export const ABSORB_RANGE_PERCENTAGE = 0.5;

// The slot TAPE (ruled 2026-07-11; holds CREATURES since 2026-11-23): slots
// appear one at a time (ArrowRight past a filled last slot appends a new
// empty one, and absorbing with the cursor on a held creature appends one
// for the new creature), up to the cap. No per-slot delete.
export const TAPE_SLOT_CAP = 16;

// Creature movement constants
// Default max speed matches player running speed (8 units/sec)
export const DEFAULT_CREATURE_MAX_SPEED = 8.0;

// Default creature size (radius in world units)
export const DEFAULT_CREATURE_SIZE = 0.9;

// The creature's ball-lightning VISUAL floats this far above resting on its
// floor (world units; entities/CreatureLook adds a gentle bob on top).
// Visual only: physics position, collision and elevation never see it.
export const CREATURE_HOVER_HEIGHT = 0.35;

// Player size (radius in world units, for force calculations)
export const PLAYER_SIZE = 0.5;

// Player collision radius for movement (world units) — shared by motion.js,
// the test harness's movement integrator, and Gate's occupant check (a door
// may not close while the player's body still overlaps its box)
export const PLAYER_COLLISION_RADIUS = 0.4;

// How deep INTO an open doorway cell the player must step before the
// crossing commits (world units, inset from the cell edge). Hysteresis:
// jitter on the cell boundary must never flicker the world back and forth —
// committing needs a real step in, and re-arming needs a full step out.
export const DOORWAY_COMMIT_DEPTH = 0.3;

// Deceleration factor applied each physics pass (0-1)
// Lower = faster deceleration. Applied as: velocity *= factor
export const CREATURE_DECELERATION = 0.85;

// A coasting creature's velocity component below this (units/sec) is spent:
// the pass zeroes it, so the creature comes to REST (left alone, the decay
// sticks at ~1.5e-323 and never reaches 0). What the rest of the coast would
// have moved it is under 6 × this × deltaTime: < 1e-10 units at 60 fps
export const CREATURE_REST_VELOCITY = 1e-9;

// Creature physics runs this many force+integration passes per frame, each
// with the full frame deltaTime. The game loop historically updated entities
// twice per frame; every playtested movement value (max speed, deceleration,
// force strengths) was tuned under that cadence, so the double pass is kept
// deliberately. Changing this changes creature feel — designer ruling + retune
// required (see DESIGN.md "Creature movement integration").
export const CREATURE_PHYSICS_PASSES = 2;

// Force strength for attraction/repulsion (units/sec per consonant/dissonant source)
// Applied continuously every frame while harmonies exist
export const ATTRACTION_FORCE_STRENGTH = 15.0;
export const REPULSION_FORCE_STRENGTH = 15.0;

// Clap constants
// Fixed range for clap effect (world units)
// Matches the typical absorb range (50% of a 15-unit audible range)
export const CLAP_RANGE = 7.5;

// Default displacement when creature is clapped (fraction of whole note)
// 1/16 = sixteenth note, 1/8 = eighth note, etc. (can be overridden per puzzle/creature)
export const DEFAULT_CLAP_DISPLACEMENT = 0.0625;

// Visual feedback duration for clap effect (seconds)
export const CLAP_VISUAL_FADE_DURATION = 0.3;

// Doorway sound model (cross-area gate links, portal stage 3)
// Sound crossing a linked-gate seam travels listener -> gate plus
// partner-gate -> source, respecting the SOURCE's audible range. A CLOSED
// door still leaks, muffled: this many extra world units of effective
// distance are added to the path. Tuned so a source one cell from the door
// (~3 units) still reaches a listener near the other face (3 + 6 = 9 < the
// default 15-unit range) — completing a song by singing on BOTH sides of a
// closed door is a designed puzzle element.
export const CLOSED_DOOR_LEAK_DISTANCE = 6.0;

// Height of one elevation level in world units
// Equal to WORLD_SCALE so one elevation step = one grid cell vertically
export const ELEVATION_HEIGHT = 3.0;

// Maximum elevation difference (in levels) at which entities still collide
// Entities more than this apart vertically are on different floors and pass through each other
export const ELEVATION_COLLISION_THRESHOLD = 0.5;

// The pole (core/AbsorbManager, entities/PoleLook; ruled 2026-11-23): R
// absorbs a creature into the cursor slot, Space releases the cursor slot's
// creature this far ahead along the camera heading (world units).
export const RELEASE_DISTANCE = 2.5;

// Puzzle JSON entity types that were renamed: the old string still loads
// (POC levels and saved levels keep it), and the editor writes the new one.
// The cleanser became the WAYSTONE (2026-11-23: it no longer cleans anything).
export const ENTITY_TYPE_ALIASES = Object.freeze({ cleanser: 'waystone' });

/** A puzzle entity's type under its current name (ENTITY_TYPE_ALIASES). */
export const entityTypeOf = (type) => ENTITY_TYPE_ALIASES[type] || type;
