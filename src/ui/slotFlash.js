/**
 * Tiny dependency-free bus for wordless slot feedback. Core modules
 * (core/AbsorbManager) publish flashes; InventoryUI renders them. One visual
 * verb (DESIGN.md "Design philosophy"):
 *   'silent' - grey pulse: nothing there — no creature in reach of R, no
 *              room on the strip, nothing to release or nowhere to put it
 * (The red 'miss' pulse went with tape playback, 2026-11-23.)
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
