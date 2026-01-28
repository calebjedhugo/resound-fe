/**
 * Mock THREE.js module for testing
 */

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

  multiply() {
    return this;
  }
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
  constructor() {
    this.opacity = 1;
    this.transparent = false;
    this.color = new Color();
    this.emissive = new Color(0x000000);
    this.emissiveIntensity = 0;
    this.roughness = 0.5;
    this.metalness = 0.5;
  }

  dispose() {}
}

class Geometry {
  dispose() {}
}

class Mesh {
  constructor() {
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1, set: () => {} };
    this.visible = true;
    this.material = new Material();
    this.geometry = new Geometry();
    this.up = new Vector3(0, 1, 0);
    this.children = [];
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
}

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
  constructor() {
    super();
    this.position = new Vector3(0, 1.8, 0);
  }
}

class WebGLRenderer {
  constructor() {
    this.domElement = {
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }

  setSize() {}
  render() {}
  dispose() {}
}

class CanvasTexture {
  constructor(canvas) {
    this.image = canvas;
    this.needsUpdate = false;
  }

  dispose() {}
}

const DoubleSide = 2;

module.exports = {
  Vector3,
  Quaternion,
  Color,
  Scene,
  Mesh,
  PerspectiveCamera,
  WebGLRenderer,
  SphereGeometry: Geometry,
  BoxGeometry: Geometry,
  PlaneGeometry: Geometry,
  CylinderGeometry: Geometry,
  MeshStandardMaterial: Material,
  MeshBasicMaterial: Material,
  CanvasTexture,
  DoubleSide,
  AmbientLight: Mesh,
  DirectionalLight: Mesh,
};
