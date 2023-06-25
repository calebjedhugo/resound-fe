import store from 'reduxStore';
import * as THREE from 'three';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';

const fixedYPosition = 4;
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = fixedYPosition;
const clock = new THREE.Clock();

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const vectorSpeed = 0.6;

const controls = new FirstPersonControls(camera, renderer.domElement);
controls.movementSpeed = 6;
controls.lookSpeed = vectorSpeed;
controls.noFly = true;

const updateBackForthPosition = cameraDirection => {
	const { backward, forward } = store.getState().playerControls.motion;
	if (backward && forward) return; // do nothing if moving in both directions.

	if (backward) {
		camera.position.addScaledVector(cameraDirection, -vectorSpeed);
	}
	if (forward) {
		camera.position.addScaledVector(cameraDirection, vectorSpeed);
	}
};

const updateLateralPosition = cameraDirection => {
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

const motion = scene => {
	updateReduxMotion();
	controls.update(clock.getDelta());
	renderer.render(scene, camera);
	camera.position.y = fixedYPosition;
};

export { camera, controls };
export default motion;
