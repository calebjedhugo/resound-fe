import * as THREE from 'three';
import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import CollisionDetector from 'core/CollisionDetector';
import { getFloorY, getEffectiveElevation, canTraverse } from 'core/ElevationMovement';

const fixedYPosition = 1.8; // Player height in meters
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.y = fixedYPosition;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const baseSpeed = 0.067; // 4 units/sec ÷ 60 fps = 0.067 units/frame
const runMultiplier = 2; // Running is 2x walk speed (8 units/sec)
const playerRadius = 0.4; // Player collision radius

const getSpeed = () => {
  const { running } = gameState.input.keys;
  return running ? baseSpeed * runMultiplier : baseSpeed;
};

// Guaranteed distance for a discrete key tap (a tap shorter than one frame
// would otherwise move ~0). Held keys move continuously and clear impulses.
const IMPULSE_STEP = 0.35;

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

  const cameraSide = new THREE.Vector3();
  cameraSide.crossVectors(camera.up, cameraDirection).normalize();

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

  // Create quaternions for each rotation
  const horizantal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), viewX);
  const vertical = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), viewY);

  const mousePosRotation = horizantal.multiply(vertical);

  // Apply the rotation to the camera
  camera.setRotationFromQuaternion(mousePosRotation);
};

const updateMotion = () => {
  const cameraDirection = new THREE.Vector3();
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

  // Elevation check
  const { elevationGrid } = gameState;
  if (elevationGrid) {
    const oldGrid = elevationGrid.worldToGrid(oldX, oldZ);
    const newGrid = elevationGrid.worldToGrid(camera.position.x, camera.position.z);

    if (oldGrid.x !== newGrid.x || oldGrid.z !== newGrid.z) {
      const oldElevation = getEffectiveElevation(oldX, oldZ, oldGrid, elevationGrid);
      const newElevation = getEffectiveElevation(
        camera.position.x,
        camera.position.z,
        newGrid,
        elevationGrid
      );

      if (!canTraverse(oldGrid, newGrid, oldElevation, newElevation, elevationGrid)) {
        camera.position.x = oldX;
        camera.position.z = oldZ;
      }
    }

    // Update Y and elevation based on current position
    const currentGrid = elevationGrid.worldToGrid(camera.position.x, camera.position.z);
    gameState.player.elevation = getEffectiveElevation(
      camera.position.x,
      camera.position.z,
      currentGrid,
      elevationGrid
    );
    const floorY = getFloorY(camera.position.x, camera.position.z, elevationGrid);
    camera.position.y = floorY + fixedYPosition;
  }

  // Check collision at new position
  const newPosition = {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
  };

  if (CollisionDetector.checkCollision(newPosition, playerRadius)) {
    // Collision detected - revert to old position
    camera.position.x = oldX;
    camera.position.z = oldZ;
  }

  updateCameraDirection();
};

const motion = (scene) => {
  updateMotion();

  // Sync gameState.player.position with camera position
  gameState.player.position.x = camera.position.x;
  gameState.player.position.z = camera.position.z;
  gameState.player.position.y = camera.position.y;

  renderer.render(scene, camera);
};

const syncCameraToPlayer = (position) => {
  camera.position.x = position.x;
  camera.position.z = position.z;
  camera.position.y = position.y || fixedYPosition;
};

export { camera, syncCameraToPlayer };
export default motion;
