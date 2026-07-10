import * as THREE from 'three';
import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import resolveSlide from 'core/SlideResolver';
import { getFloorY, getEffectiveElevation } from 'core/ElevationMovement';
import { PLAYER_COLLISION_RADIUS } from 'core/constants';

const fixedYPosition = 1.8; // Player height in meters
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.y = fixedYPosition;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const baseSpeed = 0.067; // 4 units/sec ÷ 60 fps = 0.067 units/frame
const runMultiplier = 2; // Running is 2x walk speed (8 units/sec)
const playerRadius = PLAYER_COLLISION_RADIUS;

const getSpeed = () => {
  const { running } = gameState.input.keys;
  return running ? baseSpeed * runMultiplier : baseSpeed;
};

// Guaranteed distance for a discrete key tap (a tap shorter than one frame
// would otherwise move ~0). Held keys move continuously and clear impulses.
const IMPULSE_STEP = 0.35;

// Scratch objects reused every frame — each helper fully overwrites the ones
// it uses, so nothing carries over between frames.
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const scratchDirection = new THREE.Vector3();
const scratchSide = new THREE.Vector3();
const scratchYaw = new THREE.Quaternion();
const scratchPitch = new THREE.Quaternion();

// Consume ALL queued impulses for a direction, returning how many steps to
// apply this frame. Draining fully (not one per frame) keeps burst taps and
// background-throttled tabs responsive. While the key is held, leave the
// queue intact — clearing it destroyed taps whose successor's key-down
// straddled a frame (rapid taps landed at half rate).
const consumeImpulse = (name) => {
  const { keys, impulses } = gameState.input;
  if (!impulses || keys[name]) return 0;
  const count = impulses[name];
  impulses[name] = 0;
  return count;
};

const updateBackForthPosition = (cameraDirection) => {
  const { backward, forward } = gameState.input.keys;

  camera.position.addScaledVector(cameraDirection, IMPULSE_STEP * consumeImpulse('forward'));
  camera.position.addScaledVector(cameraDirection, -IMPULSE_STEP * consumeImpulse('backward'));

  if (backward && forward) return; // do nothing if moving in both directions.

  const speed = getSpeed();

  if (backward) {
    camera.position.addScaledVector(cameraDirection, -speed);
  }
  if (forward) {
    camera.position.addScaledVector(cameraDirection, speed);
  }
};

const updateLateralPosition = (cameraDirection) => {
  const { latLeft, latRight } = gameState.input.keys;

  const cameraSide = scratchSide.crossVectors(camera.up, cameraDirection).normalize();

  camera.position.addScaledVector(cameraSide, IMPULSE_STEP * consumeImpulse('latLeft'));
  camera.position.addScaledVector(cameraSide, -IMPULSE_STEP * consumeImpulse('latRight'));

  if (latLeft && latRight) return; // do nothing if moving in both directions.

  const speed = getSpeed();

  if (latLeft) {
    camera.position.addScaledVector(cameraSide, speed);
  }
  if (latRight) {
    camera.position.addScaledVector(cameraSide, -speed);
  }
};

const updateCameraDirection = () => {
  const { centered: mouseCentered } = gameState.input.mouse;

  CameraController.applyKeyboardLook(gameState);

  // Condition here is for performance.
  if (!mouseCentered) {
    CameraController.updateViewCenter(gameState);
  }

  const [viewX, viewY] = CameraController.getView(gameState);

  const horizontal = scratchYaw.setFromAxisAngle(Y_AXIS, viewX);
  const vertical = scratchPitch.setFromAxisAngle(X_AXIS, viewY);

  const mousePosRotation = horizontal.multiply(vertical);

  // Apply the rotation to the camera
  camera.setRotationFromQuaternion(mousePosRotation);
};

const updateMotion = () => {
  const cameraDirection = scratchDirection;
  camera.getWorldDirection(cameraDirection);

  // Walking is ground-based: flatten the view direction so looking up/down
  // never slows (or zeroes) movement.
  cameraDirection.y = 0;
  if (cameraDirection.lengthSq() < 1e-6) {
    // Looking straight up/down — derive forward from yaw instead
    const [viewX] = CameraController.getView(gameState);
    cameraDirection.set(-Math.sin(viewX), 0, -Math.cos(viewX));
  } else {
    cameraDirection.normalize();
  }

  // Store old position for collision checking
  const oldX = camera.position.x;
  const oldZ = camera.position.z;

  updateLateralPosition(cameraDirection);
  updateBackForthPosition(cameraDirection);

  // Resolve the move with elevation-aware, axis-separated collision response
  // (wall/cliff sliding): walking into a wall or cliff edge at an angle slides
  // ALONG it instead of stopping dead. The mover carries its current layer so
  // it stays on its own level in walk-under cells. See core/SlideResolver.
  const { elevationGrid } = gameState;
  const priorLevel = gameState.player.elevation;
  const resolved = resolveSlide(
    { x: oldX, z: oldZ },
    { x: camera.position.x, z: camera.position.z },
    {
      radius: playerRadius,
      ignoreId: null,
      priorLevel,
      grid: elevationGrid || null,
      y: camera.position.y,
    }
  );
  camera.position.x = resolved.x;
  camera.position.z = resolved.z;

  // Re-derive elevation + floor height from the resolved position.
  if (elevationGrid) {
    const currentGrid = elevationGrid.worldToGrid(camera.position.x, camera.position.z);
    gameState.player.elevation = getEffectiveElevation(
      camera.position.x,
      camera.position.z,
      currentGrid,
      elevationGrid,
      priorLevel
    );
    const floorY = getFloorY(camera.position.x, camera.position.z, elevationGrid, priorLevel);
    camera.position.y = floorY + fixedYPosition;
  }

  updateCameraDirection();
};

const motion = (scene, beforeRender) => {
  updateMotion();

  // Sync gameState.player.position with camera position
  gameState.player.position.x = camera.position.x;
  gameState.player.position.z = camera.position.z;
  gameState.player.position.y = camera.position.y;

  // Extra render passes (portal doorway views) run after the camera settles
  // but before the main scene draws, so their textures are current for this
  // frame.
  if (beforeRender) beforeRender(renderer, camera);

  renderer.render(scene, camera);
};

const syncCameraToPlayer = (position) => {
  camera.position.x = position.x;
  camera.position.z = position.z;
  camera.position.y = position.y || fixedYPosition;
};

export { camera, syncCameraToPlayer };
export default motion;
