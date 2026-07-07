import * as THREE from 'three';

export default class SelectionManager {
  constructor(camera, entityPlacer) {
    this._camera = camera;
    this._entityPlacer = entityPlacer;
    this._raycaster = new THREE.Raycaster();
    this._selectedId = null;
    this._originalColor = null;
    this._onSelectionChange = null; // callback
  }

  set onSelectionChange(fn) {
    this._onSelectionChange = fn;
  }

  get selectedId() {
    return this._selectedId;
  }

  select(entityId) {
    this.deselect();
    const mesh = this._entityPlacer.getMeshById(entityId);
    if (!mesh) return;
    this._selectedId = entityId;
    this._originalColor = mesh.material.color.getHex();
    mesh.material.emissive = new THREE.Color(0x333333);
    if (this._onSelectionChange) this._onSelectionChange(entityId);
  }

  deselect() {
    if (this._selectedId !== null) {
      const mesh = this._entityPlacer.getMeshById(this._selectedId);
      if (mesh) {
        mesh.material.emissive = new THREE.Color(0x000000);
      }
      // Linked gates carry a persistent emissive badge — reapply it now that
      // the selection highlight (also emissive-based) is gone.
      this._entityPlacer.refreshLinkBadge(this._selectedId);
      this._selectedId = null;
      if (this._onSelectionChange) this._onSelectionChange(null);
    }
  }

  handleClick(mouseX, mouseY) {
    // mouseX, mouseY are normalized device coordinates (-1 to 1)
    const mouse = new THREE.Vector2(mouseX, mouseY);
    this._raycaster.setFromCamera(mouse, this._camera);

    const meshes = this._entityPlacer.getAllMeshes();
    if (this._entityPlacer._playerSpawnMesh) {
      meshes.push(this._entityPlacer._playerSpawnMesh);
    }

    const hits = this._raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
      const hitMesh = hits[0].object;
      const entityId = this._entityPlacer.getEntityIdFromMesh(hitMesh);
      if (entityId !== null) {
        this.select(entityId);
        return true;
      }
    }

    this.deselect();
    return false;
  }

  deleteSelected() {
    if (this._selectedId === null) return;
    const id = this._selectedId;
    this.deselect();
    this._entityPlacer.removeEntityById(id);
  }
}
