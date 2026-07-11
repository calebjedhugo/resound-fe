/**
 * Tiny dependency-free bus for wordless slot feedback. Core modules
 * (PlaybackManager, RecordingManager) publish flashes; RecordingUI renders
 * them and KeyHints reads them for teachable moments. Two visual verbs only
 * (DESIGN.md "Design philosophy"):
 *   'miss'   - red pulse: a performance was judged and failed
 *   'silent' - grey pulse: nothing heard you / nothing to play or record
 */
const handlers = [];

export const onSlotFlash = (fn) => {
  handlers.push(fn);
  return () => {
    const i = handlers.indexOf(fn);
    if (i !== -1) handlers.splice(i, 1);
  };
};

const flashSlot = (kind) => {
  handlers.forEach((fn) => fn(kind));
};

export default flashSlot;
