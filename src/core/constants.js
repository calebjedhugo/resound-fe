// World scale: 1 grid unit = 3 world units
// This allows grid coordinates (0-64) to map to comfortable world space (0-192)
export const WORLD_SCALE = 3;

// Recording range as percentage of audible range
// E.g., 0.5 means you must be within 50% of the audible range to record
export const RECORDING_RANGE_PERCENTAGE = 0.5;

// Playback beat tolerance in milliseconds
// If spacebar pressed within this time after a beat, playback starts immediately
// Otherwise, playback waits for the next beat
export const PLAYBACK_BEAT_TOLERANCE = 50;

// Creature movement constants
// Default max speed matches player running speed (8 units/sec)
export const DEFAULT_CREATURE_MAX_SPEED = 8.0;

// Default creature size (radius in world units)
export const DEFAULT_CREATURE_SIZE = 0.9;

// Player size (radius in world units, for force calculations)
export const PLAYER_SIZE = 0.5;

// Deceleration factor applied each physics pass (0-1)
// Lower = faster deceleration. Applied as: velocity *= factor
export const CREATURE_DECELERATION = 0.85;

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

// Harmony timing: notes must fall on same subdivision to be considered simultaneous
// 16 = sixteenth notes, 8 = eighth notes, etc.
export const HARMONY_TIMING_SUBDIVISION = 16;

// Clap constants
// Fixed range for clap effect (world units)
// Matches typical recording range (50% of 15-unit audible range)
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
