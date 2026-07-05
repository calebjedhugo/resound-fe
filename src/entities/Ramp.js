import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import Entity from './Entity';

class Ramp extends Entity {
  constructor(position, data = {}) {
    super('ramp', position, data);
    this.direction = data.direction || 'north';
    this.elevation = Math.round(position.y / ELEVATION_HEIGHT);
    this.createMesh();
  }

  createMesh() {
    const geometry = this.createWedgeGeometry();
    // DoubleSide: the wedge must read from EVERY angle (it used to vanish
    // when viewed against its culled faces), and the glow keeps it findable
    // when scanning a ledge for the way down.
    const material = new THREE.MeshStandardMaterial({
      color: 0x66dd88,
      roughness: 0.6,
      metalness: 0.1,
      emissive: 0x115522,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);

    const baseY = this.elevation * ELEVATION_HEIGHT;
    this.mesh.position.set(this.position.x, baseY, this.position.z);

    const rotations = {
      north: 0,
      east: Math.PI / 2,
      south: Math.PI,
      west: -Math.PI / 2,
    };
    this.mesh.rotation.y = rotations[this.direction] || 0;

    // Marker posts at the TOP corners: visible from up on the ledge, so a
    // player looking for the descent can spot the ramp without hanging over
    // the edge. Local space: high edge is at -Z before rotation.
    const hw = WORLD_SCALE / 2;
    const postGeometry = new THREE.BoxGeometry(0.22, 1.1, 0.22);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x66dd88,
      emissive: 0x22aa44,
      emissiveIntensity: 0.9,
    });
    [-hw + 0.15, hw - 0.15].forEach((x) => {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(x, ELEVATION_HEIGHT + 0.55, -hw + 0.15);
      this.mesh.add(post);
    });
  }

  createWedgeGeometry() {
    const hw = WORLD_SCALE / 2;
    const hd = WORLD_SCALE / 2;
    const h = ELEVATION_HEIGHT;

    // Wedge: low edge at +Z (local), high edge at -Z (local)
    // Rotation handles direction mapping
    //
    // Vertices (before direction rotation):
    //   Bottom face (Y=0): 4 corners
    //   Top face: only 2 corners at -Z edge (Y=h)
    const vertices = new Float32Array([
      // Bottom face - 4 corners
      -hw,
      0,
      -hd, // 0: back-left bottom
      hw,
      0,
      -hd, // 1: back-right bottom
      hw,
      0,
      hd, // 2: front-right bottom
      -hw,
      0,
      hd, // 3: front-left bottom
      // Top edge - 2 corners at -Z (high end)
      -hw,
      h,
      -hd, // 4: back-left top
      hw,
      h,
      -hd, // 5: back-right top
    ]);

    // Triangle indices (6 faces)
    const indices = [
      // Bottom face
      0, 2, 1, 0, 3, 2,
      // Slope face (from front-bottom to back-top)
      3, 4, 5, 3, 5, 2,
      // Back face (vertical, high end)
      0, 1, 5, 0, 5, 4,
      // Left face (triangle)
      0, 4, 3,
      // Right face (triangle)
      1, 2, 5,
    ];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Calculate the Y position for a world-space point on this ramp.
   * Returns null if the point is not on this ramp.
   */
  getYAtPosition(worldX, worldZ) {
    const hw = WORLD_SCALE / 2;
    const localX = worldX - this.position.x;
    const localZ = worldZ - this.position.z;

    if (Math.abs(localX) > hw || Math.abs(localZ) > hw) {
      return null;
    }

    let progress;
    switch (this.direction) {
      case 'north':
        progress = (hw - localZ) / WORLD_SCALE;
        break;
      case 'south':
        progress = (hw + localZ) / WORLD_SCALE;
        break;
      case 'east':
        progress = (hw + localX) / WORLD_SCALE;
        break;
      case 'west':
        progress = (hw - localX) / WORLD_SCALE;
        break;
      default:
        progress = 0;
    }

    progress = Math.max(0, Math.min(1, progress));
    const baseY = this.elevation * ELEVATION_HEIGHT;
    return baseY + progress * ELEVATION_HEIGHT;
  }
}

export default Ramp;
