/**
 * The schematic look's floor: the same slabs and edge lines as the game's
 * Floor (entities/Floor buildTileGeometry), coloured flat per storey —
 * subfloors included — with the edge lines pale. Read from the scene graph
 * (the shared three mock stands in for WebGL).
 */
import * as THREE from 'three';
import TileSlabs, { storeyColor } from 'editor/viewport/TileSlabs';
import { buildTileGeometry } from 'entities/Floor';

const TILES = [
  { x: 0, y: -1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 2, y: 2, z: 0 },
];

let scene;
let slabs;

beforeEach(() => {
  scene = new THREE.Scene();
  slabs = new TileSlabs(scene);
});

afterEach(() => slabs.dispose());

/** The colour (r, g, b) of each vertex. */
const vertexColors = (geometry) => {
  const c = geometry.attributes.color.array;
  const out = [];
  for (let i = 0; i < c.length; i += 3) out.push([c[i], c[i + 1], c[i + 2]]);
  return out;
};

it("draws exactly the game floor's slabs and edge lines, half a cell over (the editor's cells)", () => {
  slabs.sync(TILES);
  const { mesh } = slabs;
  expect(mesh.geometry.attributes.position.array).toEqual(
    buildTileGeometry(TILES).attributes.position.array
  );
  expect(mesh.position).toMatchObject({ x: 1.5, z: 1.5 });
});

it('colours each storey its own (a subfloor too), and every edge line pale', () => {
  slabs.sync(TILES);
  const { geometry } = slabs.mesh;
  const colors = vertexColors(geometry);
  const edges = geometry.attributes.aEdge.array;
  const ys = geometry.attributes.position.array;
  const pale = colors[Array.from(edges).findIndex((e) => e > 0.5)];
  const seen = new Map();
  colors.forEach((rgb, i) => {
    if (edges[i] > 0.5) {
      expect(rgb).toEqual(pale);
    } else {
      // A vertex of a slab lies at its storey's top or down its thickness
      const storey = Math.round((ys[i * 3 + 1] + 0.2) / 3);
      const want = storeyColor(storey);
      [want.r, want.g, want.b].forEach((v, k) => expect(rgb[k]).toBeCloseTo(v, 5));
      seen.set(storey, rgb.join());
    }
  });
  expect([...seen.keys()].sort()).toEqual([-1, 0, 2]);
  expect(new Set(seen.values()).size).toBe(3);
});

it('rebuilds only when the tiles change, draws nothing for none, and hides with the game look', () => {
  slabs.sync(TILES);
  const first = slabs.mesh;
  slabs.sync([...TILES]);
  expect(slabs.mesh).toBe(first);
  slabs.setVisible(false);
  slabs.sync(TILES.slice(1));
  expect(slabs.mesh).not.toBe(first);
  expect(slabs.mesh.visible).toBe(false);
  slabs.sync([]);
  expect(slabs.mesh).toBeNull();
});
