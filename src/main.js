import * as THREE from 'three';
import WebGL from 'isWebGLAvailable';
import motion from 'resoundModules/playerControls/motion/motion';
import earthyGrass from 'resoundModules/textures/earthyGrass';
import createEventListeners from './createEventListeners';

const scene = new THREE.Scene();

const geometry = new THREE.BoxGeometry(0.1, 3, 3);
const material = new THREE.MeshBasicMaterial({ color: '#c27a7a' });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
scene.add(earthyGrass);

function animate() {
  motion(scene);
  requestAnimationFrame(animate);
}

if (WebGL.isWebGLAvailable()) {
  animate();
  createEventListeners();
} else {
  const warning = WebGL.getWebGLErrorMessage();
  document.getElementById('container').appendChild(warning);
}
