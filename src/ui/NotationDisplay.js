import * as THREE from 'three';
import { NotationRenderer } from 'notation/NotationRenderer';

/**
 * Renders musical notation as in-world textures on entity surfaces.
 *
 * Pipeline: song data -> NotationRenderer (SVG) -> Canvas -> CanvasTexture -> PlaneGeometry meshes
 *
 * Meshes are returned synchronously with a placeholder transparent material.
 * The real texture is applied asynchronously once the SVG-to-Canvas conversion completes.
 *
 * Graceful degradation: if document.createElementNS is unavailable (node test env without jsdom),
 * the display is created but with no meshes.
 */
class NotationDisplay {
  /**
   * @param {Object} options
   * @param {Array} options.song - Song data array (game format)
   * @param {string} options.entityType - 'gate' or 'fountain'
   */
  constructor({ song, entityType }) {
    this.song = song;
    this.entityType = entityType;
    this.meshes = [];

    this._createMeshes();
    this._renderTexture();
  }

  /**
   * Create PlaneGeometry meshes positioned around the entity surface.
   */
  _createMeshes() {
    const layouts =
      this.entityType === 'gate' ? NotationDisplay.GATE_LAYOUT : NotationDisplay.FOUNTAIN_LAYOUT;

    for (const layout of layouts) {
      const { width, height } = layout;
      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(layout.x, layout.y, layout.z);

      // Rotate to face outward from the entity
      if (layout.rotationY !== undefined) {
        mesh.rotation.y = layout.rotationY;
      }

      // Tag for identification in tests and disposal
      mesh._isNotationMesh = true;

      this.meshes.push(mesh);
    }
  }

  /**
   * Render the song to SVG, convert to canvas texture, and apply to meshes.
   * This is async but we don't block construction on it.
   */
  _renderTexture() {
    // Guard: skip if no DOM (node env without jsdom)
    if (typeof document === 'undefined' || !document.createElementNS) {
      return;
    }

    try {
      const container = document.createElement('div');
      const renderer = new NotationRenderer({
        container,
        width: 400,
        height: 150,
      });

      const svg = renderer.render(this.song);
      if (!svg) return;

      // Serialize SVG to a data URL and draw on canvas
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 192;
        const ctx = canvas.getContext('2d');

        // Transparent background (entity color shows through)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw SVG scaled to fit canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(url);

        // Create texture and apply to all meshes
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        for (const mesh of this.meshes) {
          mesh.material.map = texture;
          mesh.material.opacity = 1;
          mesh.material.needsUpdate = true;
        }

        // Clean up renderer
        renderer.clear();
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        renderer.clear();
      };

      img.src = url;
    } catch (e) {
      // Graceful degradation - notation just won't appear
    }
  }

  /**
   * Hide all notation meshes (e.g., when entity is activated).
   */
  hide() {
    for (const mesh of this.meshes) {
      mesh.visible = false;
    }
  }

  /**
   * Show all notation meshes.
   */
  show() {
    for (const mesh of this.meshes) {
      mesh.visible = true;
    }
  }

  /**
   * Dispose of all notation meshes and their resources.
   */
  dispose() {
    for (const mesh of this.meshes) {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
    }
    this.meshes = [];
  }
}

/**
 * Gate: 4 faces of a 3x3x3 box, offset 0.02 outside each face.
 * PlaneGeometry dimensions: 2.8 x 1.5
 */
NotationDisplay.GATE_LAYOUT = [
  { x: 0, y: 0, z: 1.52, width: 2.8, height: 1.5, rotationY: 0 }, // +Z face
  { x: 0, y: 0, z: -1.52, width: 2.8, height: 1.5, rotationY: Math.PI }, // -Z face
  { x: 1.52, y: 0, z: 0, width: 2.8, height: 1.5, rotationY: Math.PI / 2 }, // +X face
  { x: -1.52, y: 0, z: 0, width: 2.8, height: 1.5, rotationY: -Math.PI / 2 }, // -X face
];

/**
 * Fountain: 4 faces around a cylinder (radius 1.5), offset 0.02 outside.
 * PlaneGeometry dimensions: 2.0 x 1.2
 */
NotationDisplay.FOUNTAIN_LAYOUT = [
  { x: 0, y: 0, z: 1.52, width: 2.0, height: 1.2, rotationY: 0 }, // +Z
  { x: 0, y: 0, z: -1.52, width: 2.0, height: 1.2, rotationY: Math.PI }, // -Z
  { x: 1.52, y: 0, z: 0, width: 2.0, height: 1.2, rotationY: Math.PI / 2 }, // +X
  { x: -1.52, y: 0, z: 0, width: 2.0, height: 1.2, rotationY: -Math.PI / 2 }, // -X
];

export default NotationDisplay;
