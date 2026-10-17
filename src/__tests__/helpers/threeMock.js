/**
 * Mock THREE.js module for testing
 */

// three's side constants (three/src/constants.js): FrontSide=0, BackSide=1, DoubleSide=2
const FrontSide = 0;
const BackSide = 1;
const DoubleSide = 2;
// three's blending constants (three/src/constants.js)
const NormalBlending = 1;
const AdditiveBlending = 2;
// Colour-space names (three's values): the pass context tags scene targets
const SRGBColorSpace = 'srgb';

class Vector3 {
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

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  applyQuaternion() {
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
    return new Vector3(this.x, this.y, this.z);
  }
}

class Quaternion {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.w = 1;
  }

  setFromAxisAngle() {
    return this;
  }

  setFromUnitVectors() {
    return this;
  }

  multiply() {
    return this;
  }
}

class Matrix4 {
  set() {
    return this;
  }

  copy() {
    return this;
  }

  invert() {
    return this;
  }

  makeTranslation() {
    return this;
  }
}

class Plane {
  // Like three: normal·p + constant is the signed distance (default normal +x)
  constructor(normal = new Vector3(1, 0, 0), constant = 0) {
    this.normal = normal;
    this.constant = constant;
  }

  setFromNormalAndCoplanarPoint(normal, point) {
    this.normal.copy(normal);
    this.constant = -(normal.x * point.x + normal.y * point.y + normal.z * point.z);
    return this;
  }
}

class WebGLRenderTarget {
  constructor(width = 1, height = 1) {
    this.width = width;
    this.height = height;
    this.texture = { dispose() {} };
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
  }

  dispose() {}
}

class Color {
  constructor(color = 0xffffff) {
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

class Material {
  constructor(opts = {}) {
    this.type = 'Material'; // like three: a built-in's type picks its shader
    this.opacity = opts.opacity !== undefined ? opts.opacity : 1;
    this.transparent = opts.transparent || false;
    this.depthWrite = opts.depthWrite !== undefined ? opts.depthWrite : true;
    // three's default render side is FrontSide (0). Preserve an explicit
    // side so tests can assert single- vs double-sided rendering.
    this.side = opts.side !== undefined ? opts.side : FrontSide;
    this.color = opts.color !== undefined ? new Color(opts.color) : new Color();
    this.map = opts.map || null;
    this.blending = opts.blending !== undefined ? opts.blending : NormalBlending;
    this.emissive = new Color(0x000000);
    this.emissiveIntensity = 0;
    this.roughness = 0.5;
    this.metalness = 0.5;
    this.userData = {}; // like three: Entity.dispose reads userData.shared
    this.visible = true; // like three: a hidden material is left out of the draw
    this.version = 0;
  }

  // Like three: flagging an update bumps the version, which makes the
  // renderer re-derive the material's shader program at its next draw
  set needsUpdate(value) {
    if (value === true) this.version += 1;
  }

  // three's default hook: none (passContext.showStoredTexels sets one)
  // eslint-disable-next-line class-methods-use-this
  onBeforeCompile() {}

  // three calls this once per program re-derivation (FrameProfiler counts
  // it); like three, it is the onBeforeCompile hook's source
  customProgramCacheKey() {
    return this.onBeforeCompile.toString();
  }

  dispose() {}
}

// The built-in materials three picks a shader program for by `type`
class MeshStandardMaterial extends Material {
  constructor(opts) {
    super(opts);
    this.type = 'MeshStandardMaterial';
  }
}

class MeshBasicMaterial extends Material {
  constructor(opts) {
    super(opts);
    this.type = 'MeshBasicMaterial';
  }
}

class SpriteMaterial extends Material {
  constructor(opts = {}) {
    super({ transparent: true, ...opts }); // three's sprite default
    this.type = 'SpriteMaterial';
    this.sizeAttenuation = true;
  }
}

// Custom-shader material: keeps its uniforms (per-material, like three) so
// shader-driven looks can run their per-frame uniform writes under test
class ShaderMaterial extends Material {
  constructor(opts = {}) {
    super(opts);
    this.type = 'ShaderMaterial';
    this.uniforms = opts.uniforms || {};
    this.vertexShader = opts.vertexShader || '';
    this.fragmentShader = opts.fragmentShader || '';
    this.clipping = opts.clipping || false;
  }
}

class Geometry {
  constructor() {
    this.userData = {}; // like three: Entity.dispose reads userData.shared
  }

  // three calls this once per program re-derivation (FrameProfiler counts it)
  // eslint-disable-next-line class-methods-use-this
  customProgramCacheKey() {
    return '';
  }

  dispose() {}
}

class RingGeometry extends Geometry {
  constructor(innerRadius = 0.5, outerRadius = 1, thetaSegments = 32) {
    super();
    this.parameters = { innerRadius, outerRadius, thetaSegments };
  }
}

class BufferGeometry {
  constructor() {
    this.attributes = {};
    this.index = null;
    this.userData = {};
  }

  setAttribute(name, attribute) {
    this.attributes[name] = attribute;
    return this;
  }

  setIndex(index) {
    this.index = index;
    return this;
  }

  computeVertexNormals() {}
  dispose() {}
}

class Float32BufferAttribute {
  constructor(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
  }
}

class Mesh {
  constructor(geometry, material) {
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1, set: () => {} };
    this.visible = true;
    this.material = material || new Material();
    this.geometry = geometry || new Geometry();
    this.up = new Vector3(0, 1, 0);
    this.children = [];
    this.userData = {};
  }

  add(child) {
    this.children.push(child);
  }

  remove(child) {
    const idx = this.children.indexOf(child);
    if (idx > -1) this.children.splice(idx, 1);
  }

  getWorldDirection(target) {
    target.set(0, 0, -1);
    return target;
  }

  setRotationFromQuaternion() {}

  // Like three: the clone SHARES geometry and material with the original
  clone() {
    const copy = new Mesh(this.geometry, this.material);
    copy.position.copy(this.position);
    copy.rotation = { ...this.rotation };
    copy.visible = this.visible;
    return copy;
  }
}

// A camera-facing quad (three draws every sprite with one shared quad)
class Sprite {
  constructor(material = new SpriteMaterial()) {
    this.isSprite = true;
    this.material = material;
    this.position = new Vector3();
    this.scale = new Vector3(1, 1, 1);
    this.visible = true;
    this.renderOrder = 0;
    this.children = [];
    this.userData = {};
  }
}

class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.isInstancedMesh = true;
    this.count = count;
    this.instanceMatrix = { needsUpdate: false };
    this.boundingSphere = null;
  }

  setMatrixAt() {}

  computeBoundingSphere() {}

  dispose() {}
}

class Group {
  constructor() {
    this.children = [];
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1, set: () => {} };
    this.visible = true;
  }

  add(obj) {
    this.children.push(obj);
  }

  remove(obj) {
    const idx = this.children.indexOf(obj);
    if (idx > -1) this.children.splice(idx, 1);
  }
}

// Lights draw nothing, but three keys programs by the scene's light counts
// (ShaderPrewarm mirrors the world's lights into its stand-in scene)
class Light extends Group {
  constructor(color = 0xffffff, intensity = 1) {
    super();
    this.isLight = true;
    this.color = new Color(color);
    this.intensity = intensity;
  }

  clone() {
    const copy = new this.constructor(this.color.getHex(), this.intensity);
    copy.position.copy(this.position);
    return copy;
  }
}

class AmbientLight extends Light {}

class DirectionalLight extends Light {}

class Scene {
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

class PerspectiveCamera extends Mesh {
  constructor(fov = 75, aspect = 1, near = 0.1, far = 2000) {
    super();
    this.position = new Vector3(0, 1.8, 0);
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.quaternion = new Quaternion();
    this.projectionMatrix = new Matrix4();
    this.projectionMatrixInverse = new Matrix4();
  }

  updateProjectionMatrix() {}
}

class OrthographicCamera extends Mesh {
  constructor(left = -1, right = 1, top = 1, bottom = -1, near = 0.1, far = 2000) {
    super();
    Object.assign(this, { left, right, top, bottom, near, far });
    this.isOrthographicCamera = true;
  }

  updateProjectionMatrix() {}
}

class WebGLRenderer {
  constructor() {
    this.domElement = {
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    this.width = 0;
    this.height = 0;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
  }

  getSize(target) {
    return target.set(this.width, this.height);
  }

  render() {}
  dispose() {}
}

class Texture {
  constructor(image) {
    this.image = image;
    this.needsUpdate = false;
  }

  dispose() {}
}

class CanvasTexture extends Texture {}

class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }
}

class Raycaster {
  constructor() {
    this.ray = { origin: new Vector3(), direction: new Vector3() };
  }

  setFromCamera() {}
  intersectObjects() {
    return [];
  }
  intersectObject() {
    return [];
  }
}

const MathUtils = {
  RAD2DEG: 180 / Math.PI,
  DEG2RAD: Math.PI / 180,
};

module.exports = {
  Vector3,
  Quaternion,
  Matrix4,
  Plane,
  Color,
  Group,
  Scene,
  Mesh,
  InstancedMesh,
  PerspectiveCamera,
  OrthographicCamera,
  WebGLRenderer,
  WebGLRenderTarget,
  MathUtils,
  SphereGeometry: Geometry,
  BoxGeometry: Geometry,
  PlaneGeometry: Geometry,
  CylinderGeometry: Geometry,
  ConeGeometry: Geometry,
  RingGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Material,
  MeshStandardMaterial,
  MeshBasicMaterial,
  SpriteMaterial,
  ShaderMaterial,
  Sprite,
  NormalBlending,
  AdditiveBlending,
  SRGBColorSpace,
  Texture,
  CanvasTexture,
  FrontSide,
  BackSide,
  DoubleSide,
  Vector2,
  Raycaster,
  AmbientLight,
  DirectionalLight,
};
