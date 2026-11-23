import * as THREE from 'three';
import { WORLD_SCALE, ELEVATION_HEIGHT } from 'core/constants';
import Entity from 'entities/Entity';
import { RAMP_GEOMETRY, RAMP_MATERIAL, bindRampLight } from 'entities/EntityLook';

class Ramp extends Entity {
  constructor(position, data = {}) {
    super('ramp', position, data);
    this.direction = data.direction || 'north';
    this.elevation = Math.round(position.y / ELEVATION_HEIGHT);
    this.createMesh();
  }

  createMesh() {
    // Every ramp shares ONE geometry (the wedge and its marker posts, so a
    // ramp is one draw) and ONE material (entities/EntityLook: slate,
    // chevrons crawling up the slope, pale side lines and posts). The posts
    // stand at the TOP corners: visible from up on the ledge, so a player
    // looking for the descent can spot the ramp without hanging over the
    // edge. The geometry's high edge is at local -Z; the turn faces it.
    this.mesh = new THREE.Mesh(RAMP_GEOMETRY, RAMP_MATERIAL);

    const baseY = this.elevation * ELEVATION_HEIGHT;
    this.mesh.position.set(this.position.x, baseY, this.position.z);

    const rotations = {
      north: 0,
      east: Math.PI / 2,
      south: Math.PI,
      west: -Math.PI / 2,
    };
    this.mesh.rotation.y = rotations[this.direction] || 0;
    // Lit by its own area's creatures (the material is shared)
    this.mesh.onBeforeRender = () => bindRampLight(this.area);
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
