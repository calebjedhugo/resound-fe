import { PlaneGeometry, ShaderMaterial, Mesh, TextureLoader } from 'three';
// Create a floor geometry
const floorGeometry = new PlaneGeometry(1000, 1000, 10, 10);
floorGeometry.rotateX(-Math.PI / 2);

const textureLoader = new TextureLoader();
const texture = textureLoader.load('/jpg/shadeGrass.jpeg');

// Create a custom shader material for the floor
var floorMaterial = new ShaderMaterial({
	vertexShader: `
    varying vec2 vUv;
    varying float vOffset;

    void main() {
      vUv = uv;
      vOffset = position.y * 0.5; // Adjust the factor to control the amount of vertical variation
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
	fragmentShader: `
    varying vec2 vUv;
    varying float vOffset;
    uniform sampler2D textureMap;

    void main() {
      vec2 offsetUv = vUv + vec2(0.0, vOffset);
      vec3 color = texture2D(textureMap, offsetUv).rgb;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
	uniforms: {
		textureMap: { value: texture },
	},
});

// Create a floor mesh
const earthyGrass = new Mesh(floorGeometry, floorMaterial);

export default earthyGrass;
