import store from 'reduxStore';
import * as THREE from 'three';

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

camera.position.z = 5;

const motion = () => {
	const { latLeft, latRight } = store.getState().playerControls.motion;

	if (latLeft && latRight) return; // do nothing if moving in both directions.
	if (latLeft) {
		camera.position.x -= 0.1;
	}
	if (latRight) {
		camera.position.x += 0.1;
	}
};

export { camera };
export default motion;
