/**
 * RangeIndicator — the selected creature's audible/recordable spheres.
 *
 * EditorApp re-shows them on every model change while a creature is
 * selected, so the same range must move the spheres it has, and any other
 * range must build exactly the spheres a fresh show would.
 */
import RangeIndicator from 'editor/viewport/RangeIndicator';
import { ABSORB_RANGE_PERCENTAGE } from 'core/constants';

// The shared three mock, plus what three's real classes have and the mock
// lacks: Object3D.traverse, and a sphere's construction parameters.
jest.mock('three', () => {
  const three = jest.requireActual('three');
  class Group extends three.Group {
    traverse(fn) {
      fn(this);
      this.children.forEach((child) => fn(child));
    }
  }
  class SphereGeometry extends three.SphereGeometry {
    constructor(radius) {
      super();
      this.parameters = { radius };
    }
  }
  return { ...three, Group, SphereGeometry };
});

describe('RangeIndicator', () => {
  let scene;
  let indicator;
  const creature = (audibleRange) => ({ type: 'creature', data: { audibleRange } });
  const shown = () => scene.children[0];
  const radii = () => shown().children.map((m) => m.geometry.parameters.radius);

  beforeEach(() => {
    const children = [];
    scene = {
      children,
      add: (obj) => children.push(obj),
      remove: (obj) => children.splice(children.indexOf(obj), 1),
    };
    indicator = new RangeIndicator(scene);
  });

  it('draws the audible and recordable spheres around the creature', () => {
    indicator.show(creature(12), { x: 1, y: 2, z: 3 });

    expect(scene.children).toHaveLength(1);
    expect(radii()).toEqual([12, 12 * ABSORB_RANGE_PERCENTAGE]);
    expect(shown().position).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('moves the spheres it has when the creature moves or anything else changes', () => {
    indicator.show(creature(12), { x: 1, y: 2, z: 3 });
    const [group] = scene.children;
    const spheres = [...group.children];
    const freed = jest.spyOn(spheres[0].geometry, 'dispose');

    indicator.show(creature(12), { x: 7, y: 2, z: 9 });

    expect(scene.children).toEqual([group]);
    expect(group.children).toEqual(spheres);
    expect(group.position).toMatchObject({ x: 7, y: 2, z: 9 });
    expect(freed).not.toHaveBeenCalled();
  });

  it('rebuilds the spheres, freeing the old ones, when the range changes', () => {
    indicator.show(creature(12), { x: 1, y: 2, z: 3 });
    const [oldGroup] = scene.children;
    const freed = jest.spyOn(oldGroup.children[0].geometry, 'dispose');

    indicator.show(creature(20), { x: 1, y: 2, z: 3 });

    expect(scene.children).toHaveLength(1);
    expect(shown()).not.toBe(oldGroup);
    expect(radii()).toEqual([20, 20 * ABSORB_RANGE_PERCENTAGE]);
    expect(freed).toHaveBeenCalled();
  });

  it('shows nothing for a creature that cannot be heard, or after hide', () => {
    indicator.show(creature(12), { x: 1, y: 2, z: 3 });
    indicator.show(creature(0), { x: 1, y: 2, z: 3 });
    expect(scene.children).toHaveLength(0);

    indicator.show(creature(12), { x: 1, y: 2, z: 3 });
    indicator.hide();
    indicator.show(creature(12), { x: 4, y: 5, z: 6 });
    expect(scene.children).toHaveLength(1);
    expect(shown().position).toMatchObject({ x: 4, y: 5, z: 6 });
  });
});
