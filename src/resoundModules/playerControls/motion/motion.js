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

const controls = new FirstPersonControls(camera, renderer.domElement);
controls.movementSpeed = 6;
controls.lookSpeed = 0.3;
controls.noFly = true;

const motion = scene => {
	const { latLeft, latRight } = store.getState().playerControls.motion;

	if (latLeft && latRight) return; // do nothing if moving in both directions.
	if (latLeft) {
		camera.position.x -= 0.1;
	}
	if (latRight) {
		camera.position.x += 0.1;
	}

	controls.update(clock.getDelta());
	renderer.render(scene, camera);
	camera.position.y = fixedYPosition;
};

export { camera, controls };
export default motion;
