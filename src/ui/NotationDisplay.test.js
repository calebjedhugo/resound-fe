/** @jest-environment jsdom */

import * as THREE from 'three';
import { NotationRenderer } from 'resound-notation/NotationRenderer';
import NotationDisplay from 'ui/NotationDisplay';
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
      const geometrySpy = jest.spyOn(notationChildren[0].geometry, 'dispose');
      const materialSpies = notationChildren.map((c) => jest.spyOn(c.material, 'dispose'));

      gate.dispose();

      for (const spy of materialSpies) {
        expect(spy).toHaveBeenCalled();
      }
      // The plane quad is every gate's: never freed with one of them
      expect(geometrySpy).not.toHaveBeenCalled();
      geometrySpy.mockRestore();
    });

    it('notation meshes are disposed when fountain is disposed', () => {
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });
      const notationChildren = fountain.mesh.children.filter((c) => c._isNotationMesh);

      const geometrySpy = jest.spyOn(notationChildren[0].geometry, 'dispose');
      const materialSpies = notationChildren.map((c) => jest.spyOn(c.material, 'dispose'));

      fountain.dispose();

      for (const spy of materialSpies) {
        expect(spy).toHaveBeenCalled();
      }
      expect(geometrySpy).not.toHaveBeenCalled();
      geometrySpy.mockRestore();
    });

    it("every gate's staff planes share one quad, flagged shared (fountains share theirs)", () => {
      const planesOf = (entity) => entity.mesh.children.filter((c) => c._isNotationMesh);
      const [a, b] = [1, 2].map(() => new Gate({ x: 0, y: 0, z: 0 }, { song: singleNoteSong }));
      const fountain = new Fountain({ x: 0, y: 0, z: 0 }, { song: singleNoteSong });

      const gateQuads = new Set([...planesOf(a), ...planesOf(b)].map((c) => c.geometry));
      expect(gateQuads.size).toBe(1);
      expect([...gateQuads][0].userData.shared).toBe(true);
      expect(planesOf(fountain)[0].geometry).not.toBe([...gateQuads][0]); // a smaller box
      expect(new Set(planesOf(fountain).map((c) => c.geometry)).size).toBe(1);
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

  describe('shared engravings (one texture per distinct staff)', () => {
    // jsdom can't load an SVG as an image or draw on a canvas, so those two
    // browser APIs are stood in for: an image "loads" on the next timer and
    // a canvas records what was drawn on it. Each test uses its own songs —
    // engravings are shared module-wide, and earlier tests' gates live on.
    let renderSpy;
    let drawn;
    const originalImage = global.Image;
    // Every gate/fountain a test builds is disposed after it, so no staff
    // outlives its test (staves are shared by whatever still shows them)
    const built = [];
    const track = (entity) => {
      built.push(entity);
      return entity;
    };
    const gateWith = (data) => track(new Gate({ x: 0, y: 0, z: 0 }, data));
    const fountainWith = (data) => track(new Fountain({ x: 0, y: 0, z: 0 }, data));

    beforeEach(() => {
      renderSpy = jest.spyOn(NotationRenderer.prototype, 'render');
      drawn = [];
      URL.createObjectURL = jest.fn(() => 'blob:staff');
      URL.revokeObjectURL = jest.fn();
      global.Image = class {
        set src(url) {
          setTimeout(() => this.onload(), 0);
        }
      };
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function context() {
        return {
          clearRect() {},
          drawImage: () => drawn.push(this),
        };
      });
    });

    afterEach(() => {
      jest.runAllTimers(); // pending image loads land on the stand-ins
      for (const entity of built.splice(0)) entity.dispose();
      jest.restoreAllMocks();
      global.Image = originalImage;
      delete URL.createObjectURL;
      delete URL.revokeObjectURL;
    });

    const song = (...pitches) => pitches.map((pitch) => ({ pitch, length: '1/4' }));
    const planes = (entity) => entity.mesh.children.filter((c) => c._isNotationMesh);
    const shownTexture = (entity) => planes(entity)[0].material.map;

    it('gates showing the same song engrave it ONCE', () => {
      // Separate arrays with equal content: the staff is the song, not the object
      const gates = [1, 2, 3].map(() =>
        gateWith({ song: song('D4', 'F4'), timeSignature: [4, 4] })
      );

      expect(gates).toHaveLength(3);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('a gate and a fountain with the same staff share it', () => {
      const gate = gateWith({ song: song('D4', 'G4') });
      const fountain = fountainWith({ song: song('D4', 'G4') });
      jest.runAllTimers();

      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(shownTexture(fountain)).toBe(shownTexture(gate));
    });

    it('a different song, meter or key is a different staff', () => {
      const tune = song('E4', 'A4');
      gateWith({ song: tune });
      gateWith({ song: song('E4', 'B4') });
      gateWith({ song: tune, timeSignature: [3, 4] });
      gateWith({ song: tune, keySignature: 'G' });
      jest.runAllTimers();

      expect(renderSpy).toHaveBeenCalledTimes(4);
      const inputs = renderSpy.mock.calls.map(([input]) => input);
      expect(inputs.map((input) => input.voices[0].notes[1].pitch)).toEqual([
        'A4',
        'B4',
        'A4',
        'A4',
      ]);
      expect(inputs[2].timeSignature).toEqual([3, 4]);
      expect(inputs[3].keySignature).toBe('G');
    });

    it('every display of a staff shows the same texture, fitted the same way', () => {
      const first = gateWith({ song: song('F4', 'A4', 'C5') });
      const second = gateWith({ song: song('F4', 'A4', 'C5') });
      expect(shownTexture(first)).toBeFalsy(); // nothing until the image loads

      jest.runAllTimers();
      // A gate built once the staff exists shows it at once, without engraving
      const late = gateWith({ song: song('F4', 'A4', 'C5') });

      expect(drawn).toHaveLength(1);
      const texture = shownTexture(first);
      expect(texture).toBeInstanceOf(THREE.CanvasTexture);
      expect(texture.image).toBe(drawn[0]);
      for (const gate of [first, second, late]) {
        for (const plane of planes(gate)) {
          expect(plane.material.map).toBe(texture);
          expect(plane._notationOpacity).toBe(1);
          expect(plane.scale).toEqual(planes(first)[0].scale);
        }
      }
      // The plane adopts the staff's own aspect (canvas height / width)
      const { x, y } = planes(first)[0].scale;
      expect((y * 1.5) / (x * 2.8)).toBeCloseTo(drawn[0].height / drawn[0].width);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('disposing a gate keeps the texture other gates show; the last one frees it', () => {
      const keep = gateWith({ song: song('G4', 'B4') });
      const drop = gateWith({ song: song('G4', 'B4') });
      jest.runAllTimers();
      const texture = shownTexture(keep);
      const freed = jest.spyOn(texture, 'dispose');

      drop.dispose();
      expect(freed).not.toHaveBeenCalled();
      expect(shownTexture(keep)).toBe(texture);

      keep.dispose();
      expect(freed).toHaveBeenCalledTimes(1);
    });

    it('a staff nobody shows any more is engraved afresh for the next gate', () => {
      const gone = gateWith({ song: song('A4', 'C5') });
      jest.runAllTimers();
      const oldTexture = shownTexture(gone);
      gone.dispose();

      const next = gateWith({ song: song('A4', 'C5') });
      jest.runAllTimers();

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(shownTexture(next)).toBeInstanceOf(THREE.CanvasTexture);
      expect(shownTexture(next)).not.toBe(oldTexture);
    });

    it('a staff whose every gate is gone before its image loads is never drawn', () => {
      const gate = gateWith({ song: song('B4', 'D5') });
      gate.dispose();
      jest.runAllTimers();

      expect(drawn).toHaveLength(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:staff');
    });

    it('a full 4/4 measure too wide for 400 px is drawn whole, at its widened aspect', () => {
      // Four quarters lay out at ~546 px: the renderer overflows the 400 px
      // request (warning that it does) and widens the SVG to fit; the canvas
      // must follow it
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const gate = gateWith({ song: song('D4', 'A4', 'D4', 'A4') });
      jest.runAllTimers();

      const svg = renderSpy.mock.results[0].value;
      const [, , vbWidth, vbHeight] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
      expect(vbWidth).toBeGreaterThan(400);
      expect(drawn).toHaveLength(1);
      expect(drawn[0].width).toBe(vbWidth > 500 ? 1024 : 512);
      expect(drawn[0].height / drawn[0].width).toBeCloseTo(vbHeight / vbWidth, 2);
      expect(shownTexture(gate)).toBeInstanceOf(THREE.CanvasTexture);
    });

    it('a staff that failed to engrave is tried again by the next gate', () => {
      // As each gate used to engrave its own: a failure is never shared
      const { createObjectURL } = URL;
      delete URL.createObjectURL; // the image can't be made
      const failed = gateWith({ song: song('E5', 'G5') });
      URL.createObjectURL = createObjectURL;

      const next = gateWith({ song: song('E5', 'G5') });
      jest.runAllTimers();

      expect(renderSpy).toHaveBeenCalledTimes(2);
      expect(shownTexture(next)).toBeInstanceOf(THREE.CanvasTexture);
      expect(shownTexture(failed)).toBeFalsy();
      failed.dispose(); // releasing the failed one leaves the good one alone
      const after = gateWith({ song: song('E5', 'G5') });
      expect(shownTexture(after)).toBe(shownTexture(next));
    });

    it('a staff whose image loads at once is shown all the same', () => {
      global.Image = class {
        set src(url) {
          this.onload(); // no wait at all
        }
      };

      const gate = gateWith({ song: song('F5', 'A5') });

      expect(shownTexture(gate)).toBeInstanceOf(THREE.CanvasTexture);
    });

    it('a staff prepared ahead is not engraved again by the gate built from it', () => {
      const release = NotationDisplay.prepare({ song: song('C5', 'E5') });
      const gate = gateWith({ song: song('C5', 'E5') });
      release();
      jest.runAllTimers();

      expect(renderSpy).toHaveBeenCalledTimes(1);
      // Released by the preparer, still held by the gate
      expect(shownTexture(gate)).toBeInstanceOf(THREE.CanvasTexture);
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
    // A song no live gate shows: engravings are shared per staff, so a staff
    // an earlier test already engraved would arrive at once
    const gate = new Gate({ ...GATE }, { song: [{ pitch: 'D4', length: '1/4' }] });
    scene.add(gate.mesh);
    updateMatrixWorld(scene);
    renderPass(scene, camera(30, 40));

    const drawn = renderPass(scene, camera(30, 40)).filter((object) => object._isNotationMesh);

    expect(drawn).toEqual([]);
  });
});
