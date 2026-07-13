/**
 * @jest-environment jsdom
 */

/**
 * ContextMenu Tests
 *
 * Tests the lightweight right-click context menu for viewport entities.
 * Uses jsdom with a mock container to simulate viewport bounds.
 */
import ContextMenu from 'editor/ui/ContextMenu';

function createContainer(width = 800, height = 600) {
  const container = document.createElement('div');
  container.style.position = 'relative';
  Object.defineProperty(container, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'offsetHeight', { value: height, configurable: true });
  document.body.appendChild(container);
  return container;
}

describe('ContextMenu', () => {
  let container;
  let menu;

  beforeEach(() => {
    container = createContainer();
    menu = new ContextMenu(container);
  });

  afterEach(() => {
    menu.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  // -- show and hide --------------------------------------------------------

  describe('show and hide', () => {
    it('appends a menu element to the container when show is called', () => {
      menu.show(100, 50, [{ label: 'Edit Song', action: () => {} }]);

      const el = container.querySelector('.context-menu');
      expect(el).not.toBeNull();
    });

    it('positions the menu at the specified x/y coordinates', () => {
      menu.show(120, 80, [{ label: 'Edit Song', action: () => {} }]);

      const el = container.querySelector('.context-menu');
      expect(el.style.left).toBe('120px');
      expect(el.style.top).toBe('80px');
    });

    it('renders one button per menu item', () => {
      const items = [
        { label: 'Edit Song', action: () => {} },
        { label: 'Delete', action: () => {} },
        { label: 'Properties', action: () => {} },
      ];
      menu.show(10, 10, items);

      const buttons = container.querySelectorAll('.context-menu-item');
      expect(buttons.length).toBe(3);
      expect(buttons[0].textContent).toBe('Edit Song');
      expect(buttons[1].textContent).toBe('Delete');
      expect(buttons[2].textContent).toBe('Properties');
    });

    it('hides the menu when hide is called', () => {
      menu.show(10, 10, [{ label: 'Edit Song', action: () => {} }]);
      menu.hide();

      const el = container.querySelector('.context-menu');
      expect(el).toBeNull();
    });

    it('removes the menu DOM element on hide', () => {
      menu.show(10, 10, [{ label: 'Edit Song', action: () => {} }]);

      const elBefore = container.querySelector('.context-menu');
      expect(elBefore).not.toBeNull();

      menu.hide();

      expect(container.querySelector('.context-menu')).toBeNull();
      expect(container.contains(elBefore)).toBe(false);
    });

    it('replaces any existing menu when show is called again', () => {
      menu.show(10, 10, [{ label: 'First', action: () => {} }]);
      menu.show(50, 50, [{ label: 'Second', action: () => {} }]);

      const menus = container.querySelectorAll('.context-menu');
      expect(menus.length).toBe(1);

      const button = container.querySelector('.context-menu-item');
      expect(button.textContent).toBe('Second');
    });
  });

  // -- item actions ---------------------------------------------------------

  describe('item actions', () => {
    it('calls the item action callback when a menu item is clicked', () => {
      const action = jest.fn();
      menu.show(10, 10, [{ label: 'Edit Song', action }]);

      const button = container.querySelector('.context-menu-item');
      button.click();

      expect(action).toHaveBeenCalledTimes(1);
    });

    it('hides the menu after an item is clicked', () => {
      menu.show(10, 10, [{ label: 'Edit Song', action: () => {} }]);

      const button = container.querySelector('.context-menu-item');
      button.click();

      expect(container.querySelector('.context-menu')).toBeNull();
    });

    it('does not call action for disabled items', () => {
      const action = jest.fn();
      menu.show(10, 10, [{ label: 'Edit Song', action, disabled: true }]);

      const button = container.querySelector('.context-menu-item');
      button.click();

      expect(action).not.toHaveBeenCalled();
    });
  });

  // -- dismissal ------------------------------------------------------------

  describe('dismissal', () => {
    it('hides the menu when clicking outside it', () => {
      menu.show(10, 10, [{ label: 'Edit Song', action: () => {} }]);

      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      expect(container.querySelector('.context-menu')).toBeNull();
    });

    it('hides the menu when Escape is pressed', () => {
      menu.show(10, 10, [{ label: 'Edit Song', action: () => {} }]);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(container.querySelector('.context-menu')).toBeNull();
    });
  });

  // -- keyboard navigation --------------------------------------------------

  describe('keyboard navigation', () => {
    const press = (key) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    const activeLabel = () => {
      const el = container.querySelector('.context-menu-item.active');
      return el ? el.textContent : null;
    };

    it('reports isOpen while a menu is shown', () => {
      expect(menu.isOpen).toBe(false);
      menu.show(10, 10, [{ label: 'A', action: () => {} }]);
      expect(menu.isOpen).toBe(true);
      menu.hide();
      expect(menu.isOpen).toBe(false);
    });

    it('highlights the first enabled item on show', () => {
      menu.show(10, 10, [
        { label: 'A', action: () => {} },
        { label: 'B', action: () => {} },
      ]);
      expect(activeLabel()).toBe('A');
    });

    it('moves the highlight with arrow keys, wrapping around', () => {
      menu.show(10, 10, [
        { label: 'A', action: () => {} },
        { label: 'B', action: () => {} },
        { label: 'C', action: () => {} },
      ]);
      press('ArrowDown');
      expect(activeLabel()).toBe('B');
      press('ArrowDown');
      expect(activeLabel()).toBe('C');
      press('ArrowDown'); // wrap to first
      expect(activeLabel()).toBe('A');
      press('ArrowUp'); // wrap to last
      expect(activeLabel()).toBe('C');
    });

    it('activates the highlighted item on Enter and hides', () => {
      const a = jest.fn();
      const b = jest.fn();
      menu.show(10, 10, [
        { label: 'A', action: a },
        { label: 'B', action: b },
      ]);
      press('ArrowDown'); // highlight B
      press('Enter');
      expect(b).toHaveBeenCalledTimes(1);
      expect(a).not.toHaveBeenCalled();
      expect(menu.isOpen).toBe(false);
    });

    it('skips disabled items when navigating', () => {
      menu.show(10, 10, [
        { label: 'Header', action: () => {}, disabled: true },
        { label: 'A', action: () => {} },
        { label: 'B', action: () => {} },
      ]);
      // First *enabled* item is highlighted, not the disabled header
      expect(activeLabel()).toBe('A');
      press('ArrowDown');
      expect(activeLabel()).toBe('B');
    });
  });

  // -- dispose --------------------------------------------------------------

  describe('dispose', () => {
    it('removes all DOM elements and event listeners', () => {
      menu.show(10, 10, [{ label: 'Edit Song', action: () => {} }]);
      menu.dispose();

      // Menu element should be removed
      expect(container.querySelector('.context-menu')).toBeNull();

      // Clicking outside after dispose should not throw
      expect(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }).not.toThrow();

      // Pressing Escape after dispose should not throw
      expect(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }).not.toThrow();
    });
  });
});
