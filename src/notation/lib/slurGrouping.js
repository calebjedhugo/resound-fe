/**
 * Parses slur start/stop markers from a notes array into span groups.
 * Stack-based: start pushes, stop pops (supports nesting).
 *
 * @param {Array} notes - Voice note array
 * @returns {Array<{ startIndex: number, stopIndex: number, depth: number }>}
 */
export function resolveSlurs(notes) {
  const stack = [];
  const slurs = [];

  for (let i = 0; i < notes.length; i += 1) {
    const element = notes[i];
    if (Array.isArray(element)) {
      // Check chord notes for slur properties
      for (const cn of element) {
        if (cn.slur === 'start') {
          stack.push({ startIndex: i, depth: stack.length });
        }
        if (cn.slur === 'stop' && stack.length > 0) {
          const start = stack.pop();
          slurs.push({
            startIndex: start.startIndex,
            stopIndex: i,
            depth: start.depth,
          });
        }
      }
    } else if (element.slur === 'start') {
      stack.push({ startIndex: i, depth: stack.length });
    } else if (element.slur === 'stop' && stack.length > 0) {
      const start = stack.pop();
      slurs.push({
        startIndex: start.startIndex,
        stopIndex: i,
        depth: start.depth,
      });
    }
  }

  return slurs;
}
