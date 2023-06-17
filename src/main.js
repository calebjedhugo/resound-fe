import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import createEventListeners from './createEventListeners';
import motion, { camera } from 'resoundModules/playerControls/motion/motion';

const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.BoxGeometry(0.1, 3, 3);
const material = new THREE.MeshBasicMaterial({ color: '#c27a7a' });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

function animate() {
	requestAnimationFrame(animate);
	cube.rotation.x += 0.01;
	cube.rotation.y += 0.01;
	motion();
	renderer.render(scene, camera);
}

if (WebGL.isWebGLAvailable()) {
	animate();
	createEventListeners();
} else {
	const warning = WebGL.getWebGLErrorMessage();
	document.getElementById('container').appendChild(warning);
}
