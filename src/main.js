import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import createEventListeners from './createEventListeners';
import motion, { camera } from 'resoundModules/playerControls/motion/motion';

const scene = new THREE.Scene();

const geometry = new THREE.BoxGeometry(0.1, 3, 3);
const material = new THREE.MeshBasicMaterial({ color: '#c27a7a' });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

function animate() {
	requestAnimationFrame(animate);
	motion(scene);
}

if (WebGL.isWebGLAvailable()) {
	animate();
	createEventListeners();
} else {
	const warning = WebGL.getWebGLErrorMessage();
	document.getElementById('container').appendChild(warning);
}
