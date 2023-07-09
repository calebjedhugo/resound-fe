import store from 'reduxStore';
import * as THREE from 'three';
import { getNextViewCenter, getView } from './selectors';
import { motionActions } from './stateSlice';

const { getState } = store;

const fixedYPosition = 4;
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = fixedYPosition;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const vectorSpeed = 0.6;

const updateBackForthPosition = (cameraDirection) => {
  const { backward, forward } = getState().playerControls.motion;
  if (backward && forward) return; // do nothing if moving in both directions.

  if (backward) {
    camera.position.addScaledVector(cameraDirection, -vectorSpeed);
  }
  if (forward) {
    camera.position.addScaledVector(cameraDirection, vectorSpeed);
  }
};

const updateLateralPosition = (cameraDirection) => {
  const { latLeft, latRight } = getState().playerControls.motion;

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

const updateCameraDirection = () => {
  const { mouseCentered } = getState().playerControls.motion;

  // Condition here is for performance.
  if (!mouseCentered) {
    store.dispatch(motionActions.setViewCenter(getNextViewCenter(getState())));
  }

  const [viewX, viewY] = getView(getState());

  // Create quaternions for each rotation
  const horizantal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), viewX);
  const vertical = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), viewY);

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
