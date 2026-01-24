/**
 * Browser API mocks for testing
 * These replace Web Audio API, localStorage, and Three.js rendering
 */

/**
 * Mock GainNode
 */
class MockGainNode {
  constructor() {
    this.gain = {
      value: 1,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    };
  }

  connect() {
    return this;
  }

  disconnect() {}
}

/**
 * Mock OscillatorNode
 */
class MockOscillatorNode {
  constructor() {
    this.frequency = {
      value: 440,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    };
    this.detune = {
      value: 0,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    };
    this.type = 'sine';
    this.onended = null;
  }

  connect() {
    return this;
  }

  disconnect() {}
  start() {}
  stop() {
    // Trigger onended callback if set
    if (this.onended) {
      setTimeout(() => this.onended(), 0);
    }
  }
}

/**
 * Mock BiquadFilterNode
 */
class MockBiquadFilterNode {
  constructor() {
    this.type = 'lowpass';
    this.frequency = {
      value: 350,
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    };
    this.Q = {
      value: 1,
      setValueAtTime: jest.fn(),
    };
    this.gain = {
      value: 0,
      setValueAtTime: jest.fn(),
    };
  }

  connect() {
    return this;
  }

  disconnect() {}
}

/**
 * Mock AudioContext
 */
class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
    this.state = 'running';
    this.sampleRate = 44100;
  }

  createOscillator() {
    return new MockOscillatorNode();
  }

  createGain() {
    return new MockGainNode();
  }

  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }

  createBuffer(channels, length, sampleRate) {
    const channelData = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate: sampleRate || this.sampleRate,
      getChannelData: () => channelData,
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      connect: jest.fn(() => ({ connect: jest.fn() })),
      start: jest.fn(),
      stop: jest.fn(),
      onended: null,
    };
  }

  resume() {
    return Promise.resolve();
  }

  suspend() {
    return Promise.resolve();
  }
}

/**
 * Mock localStorage
 */
class MockLocalStorage {
  constructor() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }

  get length() {
    return Object.keys(this.store).length;
  }

  key(index) {
    return Object.keys(this.store)[index] || null;
  }
}

/**
 * Mock Three.js Vector3
 */
class MockVector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  normalize() {
    const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    if (len > 0) {
      this.x /= len;
      this.y /= len;
      this.z /= len;
    }
    return this;
  }

  crossVectors(a, b) {
    this.x = a.y * b.z - a.z * b.y;
    this.y = a.z * b.x - a.x * b.z;
    this.z = a.x * b.y - a.y * b.x;
    return this;
  }

  clone() {
    return new MockVector3(this.x, this.y, this.z);
  }
}

/**
 * Mock Three.js Quaternion
 */
class MockQuaternion {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
  }

  setFromAxisAngle() {
    return this;
  }

  multiply() {
    return this;
  }
}

/**
 * Mock Three.js Color
 */
class MockColor {
  constructor(color) {
    this.value = color;
  }

  set(color) {
    this.value = color;
  }

  getHex() {
    return this.value;
  }

  setHex(hex) {
    this.value = hex;
  }
}

/**
 * Mock Three.js Material
 */
class MockMaterial {
  constructor() {
    this.opacity = 1;
    this.transparent = false;
    this.color = new MockColor(0xffffff);
    this.emissive = new MockColor(0x000000);
    this.emissiveIntensity = 0;
  }

  dispose() {}
}

/**
 * Mock Three.js Geometry
 */
class MockGeometry {
  dispose() {}
}

/**
 * Mock Three.js mesh
 */
class MockMesh {
  constructor() {
    this.position = new MockVector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1, set: jest.fn() };
    this.visible = true;
    this.material = new MockMaterial();
    this.geometry = new MockGeometry();
    this.up = new MockVector3(0, 1, 0);
  }

  getWorldDirection(target) {
    target.set(0, 0, -1);
    return target;
  }

  setRotationFromQuaternion() {}
}

/**
 * Mock Three.js scene
 */
class MockScene {
  constructor() {
    this.children = [];
  }

  add(obj) {
    this.children.push(obj);
  }

  remove(obj) {
    const idx = this.children.indexOf(obj);
    if (idx > -1) this.children.splice(idx, 1);
  }
}

/**
 * Mock Three.js Camera
 */
class MockCamera extends MockMesh {
  constructor() {
    super();
    this.position = new MockVector3(0, 1.8, 0);
  }
}

/**
 * Mock Three.js Renderer
 */
class MockRenderer {
  constructor() {
    this.domElement = {
      style: {},
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
  }

  setSize() {}
  render() {}
  dispose() {}
}

/**
 * Mock THREE module
 */
const mockThree = {
  Vector3: MockVector3,
  Quaternion: MockQuaternion,
  Color: MockColor,
  Scene: MockScene,
  Mesh: MockMesh,
  PerspectiveCamera: MockCamera,
  WebGLRenderer: MockRenderer,
  SphereGeometry: MockGeometry,
  BoxGeometry: MockGeometry,
  PlaneGeometry: MockGeometry,
  CylinderGeometry: MockGeometry,
  MeshStandardMaterial: MockMaterial,
  MeshBasicMaterial: MockMaterial,
  AmbientLight: MockMesh,
  DirectionalLight: MockMesh,
};

/**
 * Install all mocks globally
 */
function installMocks() {
  // Mock window first
  if (typeof window === 'undefined') {
    global.window = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
  }

  global.AudioContext = MockAudioContext;
  global.webkitAudioContext = MockAudioContext;
  global.localStorage = new MockLocalStorage();
  global.performance = { now: jest.fn(() => Date.now()) };
  global.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 16));
  global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

  // Assign to window as well
  global.window.AudioContext = MockAudioContext;
  global.window.webkitAudioContext = MockAudioContext;
  global.window.localStorage = global.localStorage;

  // Mock document for renderer
  global.document = {
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn(),
    },
    createElement: jest.fn(() => ({
      style: {},
      getContext: jest.fn(),
    })),
  };
}

/**
 * Reset mocks between tests
 */
function resetMocks() {
  if (global.localStorage) {
    global.localStorage.clear();
  }
}

// Auto-install mocks on import
installMocks();

export {
  MockAudioContext,
  MockGainNode,
  MockOscillatorNode,
  MockLocalStorage,
  MockMesh,
  MockScene,
  MockVector3,
  MockCamera,
  MockRenderer,
  mockThree,
  installMocks,
  resetMocks,
};
