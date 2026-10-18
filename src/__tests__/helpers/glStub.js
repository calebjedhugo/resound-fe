/**
 * A WebGL2 context stand-in, so three's REAL WebGLRenderer runs in node:
 * every call is a no-op that succeeds (shaders compile, programs link with
 * no active uniforms or attributes, framebuffers are complete). Tests that
 * care what three DRAWS — its traversal, culling, sorting and draw order —
 * get the real thing; nothing reaches a GPU.
 *
 * Use with the real three (`jest.requireActual('three/src/Three.js')`).
 */

// WebGL constants three compares against real values
const REAL = { FRAMEBUFFER_COMPLETE: 0x8cd5 };

class WebGL2RenderingContext {}

/**
 * @param {number} width - drawing-buffer size
 * @param {number} height
 * @returns {{ canvas: object, gl: WebGL2RenderingContext }}
 */
export function createGLStub(width, height) {
  // three's capability check names the context's class
  global.WebGL2RenderingContext = WebGL2RenderingContext;
  global.WebGLRenderingContext = global.WebGLRenderingContext || class WebGLRenderingContext {};
  const constants = new Map();
  const constant = (name) => {
    if (!constants.has(name)) constants.set(name, REAL[name] ?? 0x20000 + constants.size);
    return constants.get(name);
  };
  const is = (value, name) => value === constant(name);
  const noop = () => {};
  const canvas = {
    width,
    height,
    style: {},
    addEventListener: noop,
    removeEventListener: noop,
    setAttribute: noop,
  };
  const calls = {
    canvas,
    drawingBufferWidth: width,
    drawingBufferHeight: height,
    getContextAttributes: () => ({ alpha: false, antialias: false, depth: true, stencil: true }),
    getExtension: () => ({}),
    getSupportedExtensions: () => [],
    isContextLost: () => false,
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getParameter: (p) => {
      if (is(p, 'VERSION')) return 'WebGL 2.0 (stub)';
      if (is(p, 'SHADING_LANGUAGE_VERSION')) return 'WebGL GLSL ES 3.00 (stub)';
      if (is(p, 'VIEWPORT') || is(p, 'SCISSOR_BOX')) return new Int32Array([0, 0, width, height]);
      return 16384;
    },
    getProgramParameter: (program, p) =>
      is(p, 'ACTIVE_UNIFORMS') || is(p, 'ACTIVE_ATTRIBUTES') ? 0 : true,
    getShaderParameter: () => true,
    getProgramInfoLog: () => '',
    getShaderInfoLog: () => '',
    getAttribLocation: () => -1,
    checkFramebufferStatus: () => REAL.FRAMEBUFFER_COMPLETE,
    createTexture: () => ({}),
    createBuffer: () => ({}),
    createFramebuffer: () => ({}),
    createRenderbuffer: () => ({}),
    createVertexArray: () => ({}),
    createProgram: () => ({}),
    createShader: () => ({}),
  };
  const gl = new Proxy(calls, {
    get(target, name) {
      if (name === 'constructor') return WebGL2RenderingContext;
      if (name in target) return target[name];
      if (typeof name === 'string' && /^[A-Z][A-Z0-9_]*$/.test(name)) return constant(name);
      return noop;
    },
  });
  canvas.getContext = () => gl;
  return { canvas, gl };
}

export default createGLStub;
