/**
 * The editor camera on a controller's sticks: it orbits, zooms and pans
 * around OrbitControls' target as the mouse would, within sane limits.
 */
import * as THREE from 'three';
import { orbit, zoom, pan, glideToward } from 'editor/viewport/cameraMoves';

let camera;
let controls;
const offset = () => camera.position.clone().sub(controls.target);

beforeEach(() => {
  camera = { position: new THREE.Vector3(0, 30, 30) };
  controls = { target: new THREE.Vector3(0, 0, 0) };
});

it('orbiting keeps the distance to the target, and turns round it', () => {
  const before = offset().length();
  orbit(camera, controls, Math.PI / 2, 0);
  expect(offset().length()).toBeCloseTo(before);
  expect(camera.position.x).toBeCloseTo(before * Math.sin(Math.PI / 4));
  expect(camera.position.z).toBeCloseTo(0);
});

it('never tilts past straight down or below the horizon', () => {
  orbit(camera, controls, 0, 10);
  expect(camera.position.y).toBeLessThan(offset().length());
  expect(Math.hypot(camera.position.x, camera.position.z)).toBeGreaterThan(0);
  orbit(camera, controls, 0, -10);
  expect(camera.position.y).toBeGreaterThan(0);
});

it('zooms along the line to the target, within limits', () => {
  zoom(camera, controls, 0.5);
  expect(offset().length()).toBeCloseTo(Math.hypot(30, 30) / 2);
  zoom(camera, controls, 1e-6);
  expect(offset().length()).toBeGreaterThan(5);
});

it('pans the view over the ground: forward is away from the camera', () => {
  pan(camera, controls, 0, 3);
  expect(controls.target.z).toBeCloseTo(-3);
  expect(camera.position.z).toBeCloseTo(27);
  pan(camera, controls, 2, 0);
  expect(controls.target.x).toBeCloseTo(2); // the camera looks down -z: right is +x
});

it('glides toward a point a share at a time', () => {
  const left = glideToward(camera, controls, { x: 10, y: 0, z: 0 }, 0.5);
  expect(controls.target.x).toBeCloseTo(5);
  expect(left).toBeCloseTo(5);
});
