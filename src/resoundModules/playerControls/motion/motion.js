import * as THREE from 'three';
import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import CollisionDetector from 'core/CollisionDetector';

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

const updateBackForthPosition = (cameraDirection) => {
  const { backward, forward } = gameState.input.keys;
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

  if (latLeft && latRight) return; // do nothing if moving in both directions.

  const speed = getSpeed();
  const cameraSide = new THREE.Vector3();
  cameraSide.crossVectors(camera.up, cameraDirection).normalize();

  if (latLeft) {
    camera.position.addScaledVector(cameraSide, speed);
  }
  if (latRight) {
    camera.position.addScaledVector(cameraSide, -speed);
  }
};

const updateCameraDirection = () => {
  const { centered: mouseCentered } = gameState.input.mouse;

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

  // Store old position for collision checking
  const oldX = camera.position.x;
  const oldZ = camera.position.z;

  updateLateralPosition(cameraDirection);
  updateBackForthPosition(cameraDirection);

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
  gameState.player.position.y = fixedYPosition;

  renderer.render(scene, camera);
  camera.position.y = fixedYPosition;
};

const syncCameraToPlayer = (position) => {
  camera.position.x = position.x;
  camera.position.z = position.z;
  camera.position.y = fixedYPosition;
};

export { camera, syncCameraToPlayer };
export default motion;
