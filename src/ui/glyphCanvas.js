/**
 * glyphCanvas - a key hint's glyph (core/inputGlyphs) drawn on a 2D canvas,
 * in the hints' one style: a dark cap, a white rim, the mark in gold. A key
 * is a rounded keycap with its letter; a controller's face button a round
 * cap with its family's mark (PlayStation's cross, circle, square and
 * triangle drawn as shapes; a letter for Xbox and Switch) or, for a pad of
 * no known family, the diamond of four with the button's position lit; a
 * stick a round cap with its thumb ring and four arrows; a shoulder button
 * a bumper with its label. No button colours: gold is the hints' colour,
 * and red or green floating over a creature would read as the world's own
 * colours (DESIGN.md "Entity look": colour only for meaning).
 *
 * Callers draw each glyph once and keep the canvas (KeyHints caches one per
 * hint per family): nothing here runs per frame.
 */
const CAP = 'rgba(16, 20, 32, 0.92)';
const RIM = 'rgba(255, 255, 255, 0.9)';
const DIM_RIM = 'rgba(255, 255, 255, 0.4)';
const MARK = '#ffd97a';

// A glyph's canvas width per unit of its height
const ASPECT = { key: 1, space: 320 / 112, face: 1, stick: 1, shoulder: 1.5 };

/** Trace a rounded rectangle: `top` and `bottom` are the corner radii. */
function roundedRect(c, x, y, w, h, top, bottom = top) {
  c.beginPath();
  c.moveTo(x + top, y);
  c.arcTo(x + w, y, x + w, y + h, top);
  c.arcTo(x + w, y + h, x, y + h, bottom);
  c.arcTo(x, y + h, x, y, bottom);
  c.arcTo(x, y, x + w, y, top);
  c.closePath();
}

/** Fill the traced path as a cap and stroke its rim. */
function cap(c, h) {
  c.fillStyle = CAP;
  c.fill();
  c.lineWidth = Math.max(3, h * 0.05);
  c.strokeStyle = RIM;
  c.stroke();
}

function circle(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}

function label(c, text, x, y, size) {
  c.fillStyle = MARK;
  c.font = `bold ${Math.floor(size)}px monospace`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y + size * 0.06);
}

/** PlayStation's face marks, drawn as gold strokes on the cap. */
function drawShape(c, shape, x, y, r) {
  c.strokeStyle = MARK;
  c.lineWidth = r * 0.17;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  if (shape === 'Cross') {
    const k = r * 0.38;
    c.moveTo(x - k, y - k);
    c.lineTo(x + k, y + k);
    c.moveTo(x + k, y - k);
    c.lineTo(x - k, y + k);
  } else if (shape === 'Circle') {
    c.arc(x, y, r * 0.42, 0, Math.PI * 2);
  } else if (shape === 'Square') {
    const k = r * 0.37;
    c.rect(x - k, y - k, k * 2, k * 2);
  } else {
    // Triangle, its centroid on the cap's centre
    const k = r * 0.5;
    for (let i = 0; i < 3; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      const px = x + k * Math.cos(angle);
      const py = y + k * Math.sin(angle) + r * 0.04;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  }
  c.stroke();
}

const PS_SHAPES = ['Cross', 'Circle', 'Square', 'Triangle'];
const DIAMOND = { bottom: [0, 1], right: [1, 0], left: [-1, 0], top: [0, -1] };

function drawFace(c, glyph, w, h, m) {
  const x = w / 2;
  const y = h / 2;
  const r = h / 2 - m;
  circle(c, x, y, r);
  cap(c, h);
  if (glyph.mark && PS_SHAPES.includes(glyph.mark)) {
    drawShape(c, glyph.mark, x, y, r);
  } else if (glyph.mark) {
    label(c, glyph.mark, x, y, h * 0.5);
  } else {
    // No family: the diamond, this button's position lit
    const spread = r * 0.5;
    const dot = r * 0.26;
    Object.entries(DIAMOND).forEach(([position, [dx, dy]]) => {
      circle(c, x + dx * spread, y + dy * spread, dot);
      if (position === glyph.position) {
        c.fillStyle = MARK;
        c.fill();
      } else {
        c.lineWidth = Math.max(2, h * 0.03);
        c.strokeStyle = DIM_RIM;
        c.stroke();
      }
    });
  }
}

function drawStick(c, glyph, w, h, m) {
  const x = w / 2;
  const y = h / 2;
  const r = h / 2 - m;
  circle(c, x, y, r);
  cap(c, h);
  circle(c, x, y, r * 0.5);
  c.lineWidth = Math.max(2, h * 0.035);
  c.strokeStyle = MARK;
  c.stroke();
  // An arrow each way the stick tilts
  c.fillStyle = MARK;
  for (let i = 0; i < 4; i += 1) {
    const angle = (i * Math.PI) / 2;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const tip = r * 0.9;
    const base = r * 0.68;
    const half = r * 0.13;
    c.beginPath();
    c.moveTo(x + ux * tip, y + uy * tip);
    c.lineTo(x + ux * base - uy * half, y + uy * base + ux * half);
    c.lineTo(x + ux * base + uy * half, y + uy * base - ux * half);
    c.closePath();
    c.fill();
  }
  label(c, glyph.label, x, y, h * (glyph.label.length > 1 ? 0.24 : 0.3));
}

/**
 * Draw `glyph` filling a w x h canvas context.
 * @param {CanvasRenderingContext2D} c
 * @param {object} glyph - from core/inputGlyphs
 */
export function drawGlyph(c, glyph, w, h) {
  const m = Math.round(h / 16);
  if (glyph.kind === 'face') drawFace(c, glyph, w, h, m);
  else if (glyph.kind === 'stick') drawStick(c, glyph, w, h, m);
  else if (glyph.kind === 'shoulder') {
    roundedRect(c, m, m, w - 2 * m, h - 2 * m, h * 0.36, h * 0.12);
    cap(c, h);
    label(c, glyph.label, w / 2, h / 2, h * 0.46);
  } else {
    // A key (or the spacebar, unlabelled)
    roundedRect(c, m, m, w - 2 * m, h - 2 * m, Math.min(w, h) * 0.16);
    cap(c, h);
    if (glyph.label) label(c, glyph.label, w / 2, h / 2, h * 0.5);
  }
}

/**
 * A new canvas showing `glyph`, `height` pixels tall (as wide as its kind
 * is), named for what it shows (`data-glyph`, `aria-label`).
 */
export function makeGlyphCanvas(glyph, height) {
  const canvas = document.createElement('canvas');
  canvas.height = height;
  canvas.width = Math.round(height * (ASPECT[glyph.kind] || 1));
  canvas.dataset.glyph = glyph.name;
  canvas.setAttribute('aria-label', glyph.name);
  drawGlyph(canvas.getContext('2d'), glyph, canvas.width, canvas.height);
  return canvas;
}

/**
 * A glyph for the HUD (DOM): `cssHeight` px tall on the page, drawn at
 * twice that for sharp edges on a high-density screen.
 */
export function makeGlyphElement(glyph, cssHeight) {
  const canvas = makeGlyphCanvas(glyph, cssHeight * 2);
  canvas.style.height = `${cssHeight}px`;
  canvas.style.width = `${canvas.width / 2}px`;
  canvas.style.display = 'block';
  return canvas;
}
