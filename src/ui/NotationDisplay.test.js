/** @jest-environment jsdom */

import * as THREE from 'three';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';
import { drawnObjects, renderPass, updateMatrixWorld } from '../__tests__/helpers/drawList';

describe('NotationDisplay on Gates and Fountains', () => {
  const singleNoteSong = [{ pitch: 'C4', length: '1/4' }];
  const multiNoteSong = [
    { pitch: 'C4', length: '1/4' },
    { pitch: 'E4', length: '1/4' },
    { pitch: 'G4', length: '1/4' },
  ];

  describe('notation display creation', () => {
    it('gate has a notationDisplay property after construction', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      expect(gate.notationDisplay).toBeDefined();
    });

    it('gate notationDisplay song matches its requiredSong', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      expect(gate.notationDisplay.song).toBe(gate.requiredSong);
    });

    it('fountain has a notationDisplay property after construction', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      expect(fountain.notationDisplay).toBeDefined();
    });

    it('fountain notationDisplay song matches its requiredSong', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      expect(fountain.notationDisplay.song).toBe(fountain.requiredSong);
    });
  });

  describe('render input (measure barlines need a time signature)', () => {
    it('wraps a flat song into voices form carrying the time/key signature', () => {
      const fountain = new Fountain(
        { x: 0, y: 0, z: 0 },
        { song: multiNoteSong, timeSignature: [3, 4], keySignature: 'G' }
      );
      const input = fountain.notationDisplay._renderInput();
      expect(input.timeSignature).toEqual([3, 4]);
      expect(input.keySignature).toBe('G');
      expect(input.voices).toHaveLength(1);
      expect(input.voices[0].notes).toBe(multiNoteSong);
    });

    it('defaults to 4/4 when the puzzle gives no time signature', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: multiNoteSong });
      const input = gate.notationDisplay._renderInput();
      expect(input.timeSignature).toEqual([4, 4]);
      expect(input.voices[0].notes).toBe(multiNoteSong);
    });

    it('injects meter/key into a song already in voices form', () => {
      const voicesSong = { voices: [{ id: 'treble', clef: 'treble', notes: singleNoteSong }] };
      const gate = new Gate(
        { x: 0, y: 0, z: 0 },
        { song: voicesSong, timeSignature: [4, 4], keySignature: 'C' }
      );
      const input = gate.notationDisplay._renderInput();
      expect(input.timeSignature).toEqual([4, 4]);
      expect(input.keySignature).toBe('C');
      expect(input.voices).toBe(voicesSong.voices);
    });
  });

  describe('mesh integration', () => {
    it('gate mesh has notation child meshes after construction', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);
      expect(notationChildren.length).toBeGreaterThan(0);
    });

    it('gate has 4 notation meshes (one per face)', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);
      expect(notationChildren).toHaveLength(4);
    });

    it('fountain has 4 notation meshes (one per face around cylinder)', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = fountain.mesh.children.filter((c) => c._isNotationMesh);
      expect(notationChildren).toHaveLength(4);
    });

    it('notation meshes are vertically centered (y=0 relative to parent)', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);
      for (const child of notationChildren) {
        expect(child.position.y).toBe(0);
      }
    });

    it('notation meshes are positioned flush with gate faces', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);
      // Each should have one axis at +/-1.52 (half of 3 + 0.02 offset)
      const offset = 1.52;
      const positions = notationChildren.map((c) => ({
        x: c.position.x,
        z: c.position.z,
      }));
      // Expect faces at +z, -z, +x, -x
      expect(positions).toContainEqual(expect.objectContaining({ x: 0, z: offset }));
      expect(positions).toContainEqual(expect.objectContaining({ x: 0, z: -offset }));
      expect(positions).toContainEqual(expect.objectContaining({ x: offset, z: 0 }));
      expect(positions).toContainEqual(expect.objectContaining({ x: -offset, z: 0 }));
    });
  });

  describe('one-sided rendering (no backwards notation from inside the gate)', () => {
    // Standing inside an open gate, you must never see the notation from
    // behind — it renders mirror-reversed. Each face's plane is rendered
    // SINGLE-sided (FrontSide) with its front facing outward, so the inside
    // view is culled. Rendering DoubleSide is what showed the backwards
    // staff. (That FrontSide is the *outward* side — not BackSide, which
    // would cull the readable outside view instead — is a geometric fact of
    // real three.js quaternion math that the three mock can't exercise; it's
    // covered by the in-browser verification, not this unit test.)
    it('gate notation meshes are single-sided FrontSide, never DoubleSide', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);
      expect(notationChildren.length).toBeGreaterThan(0);
      for (const child of notationChildren) {
        expect(child.material.side).toBe(THREE.FrontSide);
        expect(child.material.side).not.toBe(THREE.DoubleSide);
      }
    });

    it('fountain notation meshes are single-sided FrontSide, never DoubleSide', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = fountain.mesh.children.filter((c) => c._isNotationMesh);
      expect(notationChildren.length).toBeGreaterThan(0);
      for (const child of notationChildren) {
        expect(child.material.side).toBe(THREE.FrontSide);
        expect(child.material.side).not.toBe(THREE.DoubleSide);
      }
    });
  });

  describe('activation behavior', () => {
    it('gate notation stays visible while the gate is held open (play-to-pass)', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);

      // Initially visible
      for (const child of notationChildren) {
        expect(child.visible).toBe(true);
      }

      gate.open();

      // Gates never latch: the song stays part of the world
      for (const child of notationChildren) {
        expect(child.visible).toBe(true);
      }
    });

    it('fountain notation meshes become invisible after fountain activation', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = fountain.mesh.children.filter((c) => c._isNotationMesh);

      // Initially visible
      for (const child of notationChildren) {
        expect(child.visible).toBe(true);
      }

      // Fountain.activate() is async but notation hiding is synchronous
      // and happens at the start. We call it without awaiting to test
      // the synchronous portion.
      fountain.activate();

      for (const child of notationChildren) {
        expect(child.visible).toBe(false);
      }
    });
  });

  describe('cleanup', () => {
    it('notation meshes are disposed when gate is disposed', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);

      // Spy on dispose methods
      const geometrySpies = notationChildren.map((c) => jest.spyOn(c.geometry, 'dispose'));
      const materialSpies = notationChildren.map((c) => jest.spyOn(c.material, 'dispose'));

      gate.dispose();

      for (const spy of geometrySpies) {
        expect(spy).toHaveBeenCalled();
      }
      for (const spy of materialSpies) {
        expect(spy).toHaveBeenCalled();
      }
    });

    it('notation meshes are disposed when fountain is disposed', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = fountain.mesh.children.filter((c) => c._isNotationMesh);

      const geometrySpies = notationChildren.map((c) => jest.spyOn(c.geometry, 'dispose'));
      const materialSpies = notationChildren.map((c) => jest.spyOn(c.material, 'dispose'));

      fountain.dispose();

      for (const spy of geometrySpies) {
        expect(spy).toHaveBeenCalled();
      }
      for (const spy of materialSpies) {
        expect(spy).toHaveBeenCalled();
      }
    });
  });

  describe('voices format (grand staff)', () => {
    const voicesSong = {
      voices: [
        { id: 'treble', clef: 'treble', notes: [{ pitch: 'C5', length: '1/4' }] },
        { id: 'bass', clef: 'bass', notes: [{ pitch: 'C3', length: '1/4' }] },
      ],
      staffGroups: [{ type: 'brace', voiceIds: ['treble', 'bass'] }],
    };

    it('gate accepts voices-format song without throwing', () => {
      expect(() => new Gate({ x: 0, y: 0, z: 0 }, { song: voicesSong })).not.toThrow();
    });

    it('fountain accepts voices-format song without throwing', () => {
      expect(() => new Fountain({ x: 0, y: 0, z: 0 }, { song: voicesSong })).not.toThrow();
    });

    it('gate with voices-format song creates notation display', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: voicesSong });
      expect(gate.notationDisplay).toBeDefined();
      expect(gate.notationDisplay.song).toBe(gate.requiredSong);
    });

    it('fountain with voices-format song creates notation display', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: voicesSong });
      expect(fountain.notationDisplay).toBeDefined();
      expect(fountain.notationDisplay.song).toBe(fountain.requiredSong);
    });

    it('gate with voices-format song has 4 notation meshes', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: voicesSong });
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);
      expect(notationChildren).toHaveLength(4);
    });
  });

  describe('multi-note songs', () => {
    it('gate with multi-note song creates notation display successfully', () => {
      const gate = new Gate({ x: 0, y: 0, z: 0 }, { song: multiNoteSong });
      expect(gate.notationDisplay).toBeDefined();
      expect(gate.notationDisplay.song).toBe(gate.requiredSong);
      const notationChildren = gate.mesh.children.filter((c) => c._isNotationMesh);
      expect(notationChildren).toHaveLength(4);
    });

    it('fountain with multi-note song creates notation display successfully', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: multiNoteSong });
      expect(fountain.notationDisplay).toBeDefined();
      expect(fountain.notationDisplay.song).toBe(fountain.requiredSong);
      const notationChildren = fountain.mesh.children.filter((c) => c._isNotationMesh);
      expect(notationChildren).toHaveLength(4);
    });
  });
});

// A staff plane fades by the eye's distance past its plane: from behind, or
// within FADE_NEAR of it, it draws at zero opacity — and so does a plane
// whose staff texture has not arrived. Such a plane paints nothing, so a
// pass leaves it out entirely; every other plane draws exactly as before.
describe('Staff planes a pass would paint invisibly are left out of it', () => {
  const song = [{ pitch: 'C4', length: '1/4' }];
  const GATE = { x: 30, y: 0, z: 30 };
  const camera = (x, z) => ({ position: new THREE.Vector3(x, 1.8, z) });
  // Around the gate: square on, at a corner (two faces), beside it (one),
  // edge-on to its +Z staff (within FADE_NEAR of the plane), part-faded
  // (between FADE_NEAR and FADE_FAR) and far off on a diagonal
  const EYES = [
    camera(30, 40),
    camera(36, 36),
    camera(40, 30),
    camera(33, 31.55),
    camera(30, 31.8),
    camera(-20, -5),
  ];
  const savedImage = global.Image;
  const savedGetContext = HTMLCanvasElement.prototype.getContext;

  // The staff texture arrives as in a browser: the rendered SVG loads as an
  // image and is drawn onto a canvas (jsdom loads no images, has no 2D
  // canvas and no object URLs, so those browser APIs are stood in for)
  beforeEach(() => {
    global.Image = class {
      set src(url) {
        this.onload();
      }
    };
    HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, drawImage() {} });
    URL.createObjectURL = () => 'blob:staff';
    URL.revokeObjectURL = () => {};
  });

  afterEach(() => {
    global.Image = savedImage;
    HTMLCanvasElement.prototype.getContext = savedGetContext;
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  /** A scene holding one gate whose staff has arrived, drawn once already. */
  function sceneWithGate() {
    const scene = new THREE.Scene();
    const gate = new Gate({ ...GATE }, { song });
    scene.add(gate.mesh);
    updateMatrixWorld(scene);
    renderPass(scene, EYES[0]);
    return { scene, planes: gate.notationDisplay.meshes };
  }

  it('from every eye, a pass draws exactly the planes it paints (each at the opacity it always had)', () => {
    const { scene, planes } = sceneWithGate();
    expect(planes.every((plane) => plane.material.map)).toBe(true); // the staff arrived

    for (const eye of EYES) {
      // What a pass painted with every plane drawn: each one's own fade
      const painted = new Map();
      for (const plane of planes) {
        plane.onBeforeRender({}, scene, eye);
        painted.set(plane, plane.material.opacity);
      }

      const drawn = renderPass(scene, eye).filter((object) => object._isNotationMesh);

      expect(drawn).toEqual(planes.filter((plane) => painted.get(plane) > 0));
      for (const plane of drawn) expect(plane.material.opacity).toBe(painted.get(plane));
    }
  });

  it('a gate seen from outside skips at least two of its four planes', () => {
    const { scene } = sceneWithGate();
    for (const eye of [EYES[0], EYES[1], EYES[2]]) {
      const drawn = renderPass(scene, eye).filter((object) => object._isNotationMesh);
      expect(drawn.length).toBeLessThanOrEqual(2);
    }
  });

  it('after a pass every plane is drawable again (another scene or eye decides for itself)', () => {
    const { scene, planes } = sceneWithGate();

    renderPass(scene, camera(30, 40));

    expect(drawnObjects(scene)).toEqual(expect.arrayContaining(planes));
  });

  it('the first pass over a scene draws every plane, as passes always did', () => {
    const scene = new THREE.Scene();
    const gate = new Gate({ ...GATE }, { song });
    scene.add(gate.mesh);
    updateMatrixWorld(scene);

    const drawn = renderPass(scene, camera(30, 40)).filter((object) => object._isNotationMesh);

    expect(drawn).toEqual(gate.notationDisplay.meshes);
  });

  it('a plane whose staff has not arrived is never drawn', () => {
    URL.createObjectURL = undefined; // the texture never arrives
    const scene = new THREE.Scene();
    const gate = new Gate({ ...GATE }, { song });
    scene.add(gate.mesh);
    updateMatrixWorld(scene);
    renderPass(scene, camera(30, 40));

    const drawn = renderPass(scene, camera(30, 40)).filter((object) => object._isNotationMesh);

    expect(drawn).toEqual([]);
  });
});
