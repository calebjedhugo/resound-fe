import store from 'reduxStore';
import * as THREE from 'three';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const clock = new THREE.Clock();

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new FirstPersonControls(camera, renderer.domElement);
controls.movementSpeed = 15;
controls.lookSpeed = 0.1;

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
};

export { camera, controls };
export default motion;
