import store from 'reduxStore';
import * as THREE from 'three';

const fixedYPosition = 4;
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = fixedYPosition;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const vectorSpeed = 0.6;

const updateBackForthPosition = (cameraDirection) => {
  const { backward, forward } = store.getState().playerControls.motion;
  if (backward && forward) return; // do nothing if moving in both directions.

  if (backward) {
    camera.position.addScaledVector(cameraDirection, -vectorSpeed);
  }
  if (forward) {
    camera.position.addScaledVector(cameraDirection, vectorSpeed);
  }
};

const updateLateralPosition = (cameraDirection) => {
  const { latLeft, latRight } = store.getState().playerControls.motion;

  if (latLeft && latRight) return; // do nothing if moving in both directions.

  const cameraSide = new THREE.Vector3();
  cameraSide.crossVectors(camera.up, cameraDirection).normalize();

  if (latLeft) {
    camera.position.addScaledVector(cameraSide, vectorSpeed);
  }
  if (latRight) {
    camera.position.addScaledVector(cameraSide, -vectorSpeed);
  }
};

const updateReduxMotion = () => {
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);

  updateLateralPosition(cameraDirection);
  updateBackForthPosition(cameraDirection);
};

const motion = (scene) => {
  updateReduxMotion();
  renderer.render(scene, camera);
  camera.position.y = fixedYPosition;
};

export { camera };
export default motion;
