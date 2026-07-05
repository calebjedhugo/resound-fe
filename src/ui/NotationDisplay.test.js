/** @jest-environment jsdom */

import * as THREE from 'three';
import Gate from 'entities/Gate';
import Fountain from 'entities/Fountain';

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
