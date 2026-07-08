/**
 * Portal Links
 *
 * Gate links (portals): a gate links to another gate — in a different
 * puzzle (a door between two areas) or in the SAME puzzle (an in-level
 * teleport door). Links are BIDIRECTIONAL — creating/clearing/renaming one
 * side always updates the partner too, so the pair never drifts one-way.
 *
 * The local side of every operation goes through the UndoManager (so it
 * autosaves and is undoable); a CROSS-PUZZLE partner is edited in its raw
 * JSON via the dev save endpoint. NOTE: undoing a cross-puzzle link edit
 * does NOT rewind the partner file — use the panel's Link/Clear buttons
 * rather than undo for link changes. A same-puzzle partner lives in the
 * open model, so both sides of its edits are undoable (as separate steps).
 */
import { listRepoPuzzles, loadRepoPuzzle, savePuzzleJsonToRepo } from 'editor/io/repoPersistence';
import { isValidGateId, nextGateId } from 'editor/util/gateIds';

/** Find a gate entity in raw puzzle JSON by its stable gate id. */
function findGateInJson(json, gateId) {
  return (json.entities || []).find((e) => e.type === 'gate' && e.id === gateId);
}

/** Find a gate entity in the OPEN model by its stable gate id. */
function findLocalGate(undoManager, gateId) {
  return undoManager
    .getEntities()
    .find((e) => e.type === 'gate' && e.data && e.data.gateId === gateId);
}

/** True if `link` points at the given puzzle+gate. */
function linksTo(link, puzzleId, gateId) {
  return Boolean(link && link.puzzleId === puzzleId && link.gateId === gateId);
}

/** True if a gate song holds any notes (flat array or voices form). */
function hasSong(song) {
  if (Array.isArray(song)) return song.length > 0;
  if (song && Array.isArray(song.voices)) return song.voices.some((v) => v.notes.length > 0);
  return false;
}

function songsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Linked gates are ONE DOOR and must share one song (the runtime mirrors a
 * pair's open state, so differing songs are ill-defined). Decide which song
 * the pair keeps: the INITIATING gate's song wins; a gate without a song
 * adopts its partner's. When both sides have different songs, the caller's
 * `confirmSongReplace()` must approve deleting the target's song.
 *
 * @param {object} ourData - initiating gate's model data
 * @param {{song, staffGroups}} theirs - target gate's song fields
 * @param {() => boolean|Promise<boolean>} confirmSongReplace
 * @returns {Promise<{song, staffGroups}|null>} the unified song fields, or
 *   null when the caller declined the replacement
 */
async function unifiedSong(ourData, theirs, confirmSongReplace) {
  const oursHas = hasSong(ourData.song);
  const theirsHas = hasSong(theirs.song);
  if (oursHas && theirsHas && !songsEqual(ourData.song, theirs.song)) {
    const approved = confirmSongReplace ? await confirmSongReplace() : false;
    if (!approved) return null;
  }
  const winner =
    !oursHas && theirsHas
      ? { song: theirs.song, staffGroups: theirs.staffGroups }
      : { song: ourData.song, staffGroups: ourData.staffGroups };
  return { song: winner.song || [], staffGroups: winner.staffGroups };
}

/** Apply unified song fields to a model-entity data object (immutably). */
function withSong(data, unified) {
  const next = { ...data, song: unified.song };
  if (unified.staffGroups && unified.staffGroups.length > 0) {
    next.staffGroups = unified.staffGroups;
  } else {
    delete next.staffGroups;
  }
  return next;
}

/**
 * Parse the "Link by id" input: `gate-2` targets the OPEN puzzle,
 * `other-puzzle/gate-1` targets another puzzle.
 * @param {string} input
 * @param {string} currentPuzzleId
 * @returns {{puzzleId: string, gateId: string}}
 * @throws {Error} on malformed input
 */
export function parseLinkTarget(input, currentPuzzleId) {
  const trimmed = (input || '').trim();
  const parts = trimmed.split('/').map((p) => p.trim());
  if (parts.length === 1 && isValidGateId(parts[0])) {
    return { puzzleId: currentPuzzleId, gateId: parts[0] };
  }
  if (parts.length === 2 && isValidGateId(parts[0]) && isValidGateId(parts[1])) {
    return { puzzleId: parts[0], gateId: parts[1] };
  }
  throw new Error('Enter a gate id ("gate-2") or puzzle/gate ("the-lure/gate-1")');
}

/**
 * Puzzles that can host a link target: everything in the manifest,
 * INCLUDING the one being edited (same-puzzle doors are in-level
 * teleporters). Callers label the current puzzle; its gates come from the
 * live model via localTargetGates, not from disk.
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function fetchLinkTargets() {
  return listRepoPuzzles();
}

/**
 * The linkable gates of the OPEN puzzle (same-puzzle doors) — read from the
 * live model rather than the repo file, so just-placed gates are listed and
 * nothing is written on read. Excludes the gate being linked: a gate can't
 * link to itself.
 * @param {UndoManager} undoManager
 * @param {number} excludeEntityId - local entity id of the gate being linked
 * @returns {Array<{gateId: string, facing: string, position: object, link: object|null}>}
 */
export function localTargetGates(undoManager, excludeEntityId) {
  return undoManager
    .getEntities()
    .filter((e) => e.type === 'gate' && e.id !== excludeEntityId && isValidGateId(e.data.gateId))
    .map((e) => ({
      gateId: e.data.gateId,
      facing: e.data.facing || 'north',
      position: { x: e.x, y: e.y, z: e.z },
      link: e.data.link || null,
    }));
}

/**
 * The linkable gates of a target puzzle, with enough context to label them
 * and grey out ones already claimed by another portal.
 *
 * Materializes missing stable ids: a puzzle that has never been re-saved by
 * the editor has id-less gates on disk, which can't be linked to. Listing it
 * as a link target assigns `gate-N` ids to those gates and writes the file
 * back — same ids the editor would assign on open, just without the trip.
 * @param {string} puzzleId
 * @returns {Promise<Array<{gateId: string, facing: string, position: object, link: object|null}>>}
 */
export async function fetchTargetGates(puzzleId) {
  const json = await loadRepoPuzzle(puzzleId);
  const gates = (json.entities || []).filter((e) => e.type === 'gate');

  const used = new Set(gates.map((e) => e.id).filter(isValidGateId));
  const seen = new Set();
  let assigned = false;
  for (const gate of gates) {
    if (!gate.facing) {
      gate.facing = 'north';
      assigned = true;
    }
    // Keep the first occurrence of a valid id; reassign duplicates + missing
    if (isValidGateId(gate.id) && !seen.has(gate.id)) {
      seen.add(gate.id);
      continue;
    }
    gate.id = nextGateId(used);
    used.add(gate.id);
    seen.add(gate.id);
    assigned = true;
  }
  if (assigned) await savePuzzleJsonToRepo(json);

  return gates.map((e) => ({
    gateId: e.id,
    facing: e.facing || 'north',
    position: e.position,
    link: e.link || null,
  }));
}

/**
 * Compare musical metadata of the current puzzle against a target's JSON.
 * Linked areas are live simultaneously and share the musical clock, so
 * mismatches are playable-but-chaotic — warn, don't block.
 * @returns {string[]} human-readable warnings (empty when compatible)
 */
export function musicalMismatchWarnings(currentMetadata, targetJson) {
  const warnings = [];
  if (currentMetadata.tempo !== targetJson.tempo) {
    warnings.push(
      `Tempo mismatch: this puzzle is ${currentMetadata.tempo} BPM, ` +
        `"${targetJson.id}" is ${targetJson.tempo} BPM — linked areas share one clock`
    );
  }
  const currentKey = currentMetadata.keySignature || 'C';
  const targetKey = targetJson.keySignature || 'C';
  if (currentKey !== targetKey) {
    warnings.push(
      `Key mismatch: this puzzle is in ${currentKey}, "${targetJson.id}" is in ${targetKey}`
    );
  }
  return warnings;
}

/**
 * Remove the partner's back-link, if it still points at us. A same-puzzle
 * partner lives in the open model (edited via the UndoManager — writing the
 * file would race the model's autosave); a cross-puzzle partner is edited
 * in its repo file. Quietly succeeds when the partner is already gone.
 * @returns {Promise<void>}
 */
async function clearPartnerBackLink(undoManager, partnerLink, ourPuzzleId, ourGateId) {
  if (partnerLink.puzzleId === ourPuzzleId) {
    const partner = findLocalGate(undoManager, partnerLink.gateId);
    if (!partner || !linksTo(partner.data.link, ourPuzzleId, ourGateId)) return;
    const data = { ...partner.data };
    delete data.link;
    undoManager.updateEntity(partner.id, { data });
    return;
  }
  let json;
  try {
    json = await loadRepoPuzzle(partnerLink.puzzleId);
  } catch {
    return; // partner puzzle deleted — nothing to clean
  }
  const gate = findGateInJson(json, partnerLink.gateId);
  if (!gate || !linksTo(gate.link, ourPuzzleId, ourGateId)) return;
  delete gate.link;
  await savePuzzleJsonToRepo(json);
}

/**
 * Link two gates of the OPEN puzzle to each other (an in-level teleport
 * door). Both sides live in the model, so both edits go through the
 * UndoManager — no file round-trip, fully undoable.
 */
async function createLocalLink(undoManager, entityId, gate, ourPuzzleId, ourGateId, options) {
  const { targetGateId, confirmSongReplace } = options;
  if (targetGateId === ourGateId) {
    throw new Error("A gate can't link to itself — pick a different gate");
  }
  const target = findLocalGate(undoManager, targetGateId);
  if (!target) throw new Error(`Gate "${targetGateId}" not found in this puzzle`);
  if (target.data.link && !linksTo(target.data.link, ourPuzzleId, ourGateId)) {
    throw new Error(
      `Gate "${targetGateId}" is already linked to ` +
        `${target.data.link.puzzleId}/${target.data.link.gateId}`
    );
  }

  // One door, one song: unify before touching anything
  const unified = await unifiedSong(gate.data, target.data, confirmSongReplace);
  if (!unified) return { cancelled: true, warnings: [] };

  // Relinking: release our previous partner (local or remote) only now that
  // the new target has validated — a failed link must not desync the old pair
  const oldLink = gate.data.link;
  if (oldLink && !linksTo(oldLink, ourPuzzleId, targetGateId)) {
    await clearPartnerBackLink(undoManager, oldLink, ourPuzzleId, ourGateId);
  }

  undoManager.updateEntity(target.id, {
    data: withSong({ ...target.data, link: { puzzleId: ourPuzzleId, gateId: ourGateId } }, unified),
  });
  undoManager.updateEntity(entityId, {
    data: withSong(
      { ...gate.data, link: { puzzleId: ourPuzzleId, gateId: targetGateId } },
      unified
    ),
  });
  return { warnings: [] }; // same puzzle — tempo and key always match
}

/**
 * Link a local gate to a gate in another puzzle — or in THIS puzzle
 * (both directions either way). Linked gates are one door and share one
 * song: the initiating gate's song wins; a song-less side adopts the
 * other's; replacing a real song on the target requires the caller's
 * `confirmSongReplace()` approval (declining cancels the link).
 *
 * @param {UndoManager} undoManager - wraps the OPEN puzzle's model
 * @param {number} entityId - local (ephemeral) entity id of the gate
 * @param {string} targetPuzzleId
 * @param {string} targetGateId
 * @param {{confirmSongReplace?: () => boolean|Promise<boolean>}} [options]
 * @returns {Promise<{warnings: string[], cancelled?: boolean}>}
 * @throws {Error} when either side can't be linked
 */
export async function createLink(
  undoManager,
  entityId,
  targetPuzzleId,
  targetGateId,
  options = {}
) {
  const { confirmSongReplace } = options;
  const metadata = undoManager.getMetadata();
  const ourPuzzleId = metadata.id;
  if (!ourPuzzleId) {
    throw new Error('Save this puzzle first (add a name) — links need a puzzle id');
  }
  const gate = undoManager.getEntity(entityId);
  if (!gate || gate.type !== 'gate') throw new Error('Selected entity is not a gate');
  const ourGateId = gate.data.gateId;
  if (!isValidGateId(ourGateId)) throw new Error('This gate has no stable id');

  if (targetPuzzleId === ourPuzzleId) {
    return createLocalLink(undoManager, entityId, gate, ourPuzzleId, ourGateId, {
      targetGateId,
      confirmSongReplace,
    });
  }

  // Target side: must exist and be unclaimed (or already ours)
  const targetJson = await loadRepoPuzzle(targetPuzzleId);
  const targetGate = findGateInJson(targetJson, targetGateId);
  if (!targetGate) {
    throw new Error(`Gate "${targetGateId}" not found in puzzle "${targetPuzzleId}"`);
  }
  if (targetGate.link && !linksTo(targetGate.link, ourPuzzleId, ourGateId)) {
    throw new Error(
      `Gate "${targetGateId}" is already linked to ` +
        `${targetGate.link.puzzleId}/${targetGate.link.gateId}`
    );
  }

  // One door, one song (raw gate JSON keeps song fields at the gate root)
  const unified = await unifiedSong(gate.data, targetGate, confirmSongReplace);
  if (!unified) return { cancelled: true, warnings: [] };

  // Relinking: release our previous partner first (it may be local or remote)
  const oldLink = gate.data.link;
  if (oldLink && !linksTo(oldLink, targetPuzzleId, targetGateId)) {
    await clearPartnerBackLink(undoManager, oldLink, ourPuzzleId, ourGateId);
  }

  // Write the far side, then the near side (near side goes through the
  // UndoManager so it autosaves the open puzzle)
  targetGate.link = { puzzleId: ourPuzzleId, gateId: ourGateId };
  targetGate.song = unified.song;
  if (unified.staffGroups && unified.staffGroups.length > 0) {
    targetGate.staffGroups = unified.staffGroups;
  } else {
    delete targetGate.staffGroups;
  }
  await savePuzzleJsonToRepo(targetJson);
  undoManager.updateEntity(entityId, {
    data: withSong(
      { ...gate.data, link: { puzzleId: targetPuzzleId, gateId: targetGateId } },
      unified
    ),
  });

  return { warnings: musicalMismatchWarnings(metadata, targetJson) };
}

/**
 * Clear a local gate's link (both directions).
 * @param {UndoManager} undoManager
 * @param {number} entityId
 * @returns {Promise<void>}
 */
export async function clearLink(undoManager, entityId) {
  const gate = undoManager.getEntity(entityId);
  if (!gate || !gate.data.link) return;
  const ourPuzzleId = undoManager.getMetadata().id;
  await clearPartnerBackLink(undoManager, gate.data.link, ourPuzzleId, gate.data.gateId);
  const data = { ...undoManager.getEntity(entityId).data };
  delete data.link;
  undoManager.updateEntity(entityId, { data });
}

/**
 * Rename a gate's stable id, keeping a linked partner's back-link in sync.
 * @param {UndoManager} undoManager
 * @param {number} entityId
 * @param {string} newGateId
 * @returns {Promise<void>}
 * @throws {Error} on invalid/duplicate id
 */
export async function renameGateId(undoManager, entityId, newGateId) {
  if (!isValidGateId(newGateId)) {
    throw new Error('Gate id must use only letters, numbers, "-" and "_"');
  }
  const gate = undoManager.getEntity(entityId);
  if (!gate || gate.type !== 'gate') throw new Error('Selected entity is not a gate');
  if (gate.data.gateId === newGateId) return;
  const taken = undoManager
    .getEntities()
    .some((e) => e.type === 'gate' && e.id !== entityId && e.data.gateId === newGateId);
  if (taken) throw new Error(`Gate id "${newGateId}" is already used in this puzzle`);

  // Partner's back-link must follow the rename (same-puzzle partner lives
  // in the open model; cross-puzzle partner in its repo file)
  if (gate.data.link) {
    const ourPuzzleId = undoManager.getMetadata().id;
    if (gate.data.link.puzzleId === ourPuzzleId) {
      const partner = findLocalGate(undoManager, gate.data.link.gateId);
      if (partner && linksTo(partner.data.link, ourPuzzleId, gate.data.gateId)) {
        undoManager.updateEntity(partner.id, {
          data: { ...partner.data, link: { ...partner.data.link, gateId: newGateId } },
        });
      }
    } else {
      const json = await loadRepoPuzzle(gate.data.link.puzzleId);
      const partner = findGateInJson(json, gate.data.link.gateId);
      if (partner && linksTo(partner.link, ourPuzzleId, gate.data.gateId)) {
        partner.link = { ...partner.link, gateId: newGateId };
        await savePuzzleJsonToRepo(json);
      }
    }
  }

  undoManager.updateEntity(entityId, { data: { ...gate.data, gateId: newGateId } });
}

/**
 * Best-effort cleanup before a linked gate is deleted: release the partner's
 * back-link so the far side doesn't dangle. Local deletion proceeds regardless.
 * @param {UndoManager} undoManager
 * @param {number} entityId
 * @returns {Promise<void>}
 */
export async function releaseLinkBeforeDelete(undoManager, entityId) {
  const gate = undoManager.getEntity(entityId);
  if (!gate || gate.type !== 'gate' || !gate.data.link) return;
  const ourPuzzleId = undoManager.getMetadata().id;
  await clearPartnerBackLink(undoManager, gate.data.link, ourPuzzleId, gate.data.gateId);
}
