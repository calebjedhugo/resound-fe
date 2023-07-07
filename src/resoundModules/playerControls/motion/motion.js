import store from 'reduxStore';
import * as THREE from 'three';
import { getHypotMax } from './selectors';

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

let incrementX = 0;
const updateCameraDirection = () => {
  const { screenCenter, mouseCentered, mousePosition } = store.getState().playerControls.motion;
  const hypotMax = getHypotMax(store.getState());

  if (!mouseCentered) {
    incrementX += (Math.PI / 200) * ((screenCenter[0] - mousePosition[0]) / hypotMax);
  }

  const angleX = (Math.PI / 2) * ((screenCenter[0] - mousePosition[0]) / hypotMax);
  const angleY = (Math.PI / 2) * ((screenCenter[1] - mousePosition[1]) / hypotMax);

  // Create quaternions for each rotation
  const horizantal = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    angleX + incrementX
  );
  const vertical = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angleY);

  const mousePosRotation = horizantal.multiply(vertical);

  // Apply the rotation to the camera
  camera.setRotationFromQuaternion(mousePosRotation);
  // camera.setRotationFromQuaternion(newCenterCameraDirection);
};

const updateReduxMotion = () => {
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);

  updateLateralPosition(cameraDirection);
  updateBackForthPosition(cameraDirection);
  updateCameraDirection(cameraDirection);
};

const motion = (scene) => {
  updateReduxMotion();
  renderer.render(scene, camera);
  camera.position.y = fixedYPosition;
};

export { camera };
export default motion;
