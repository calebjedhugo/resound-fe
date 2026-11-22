/**
 * Menu - a full-screen DOM menu, played with the mouse, the keyboard or a
 * controller.
 *
 * Its entries (its buttons, and anything else given a tabIndex) take the
 * focus in turn: arrow up/down move it, wrapping around at the ends; Enter or
 * Space chooses the focused entry (its click); C backs out (back: resume,
 * from pause). A controller presses those same keys (core/Gamepad: d-pad or
 * left stick up/down, Cross = Space, Circle = C), so the menu needs no
 * controller of its own. The world's actions don't answer outside play
 * (createEventListeners), so a key the menu takes does nothing behind it.
 * The focus starts on the first entry each time the menu opens, and follows
 * the mouse.
 */
const ENTRIES = 'button, [tabindex]';

class Menu {
  constructor(id) {
    this.element = document.createElement('div');
    this.element.id = id;
    this.element.className = 'menu';
    this.visible = false;

    this._onKeyDown = (event) => this._navigate(event);
    // A keyboard's Space clicks a focused button on its keyup: the menu
    // chose it on the keydown already
    this._onKeyUp = (event) => {
      if (event.code === 'Space') event.preventDefault();
    };
    this.element.addEventListener('mouseover', (event) => {
      const entry = event.target.closest(ENTRIES);
      if (entry) entry.focus({ preventScroll: true });
    });
  }

  show() {
    if (this.visible) return;
    this.render();
    document.body.appendChild(this.element);
    this.visible = true;
    const [first] = this.entries();
    if (first) first.focus();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  hide() {
    if (!this.visible) return;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.visible = false;
  }

  clear() {
    this.element.innerHTML = '';
  }

  /** What backing out of this menu does (C, a controller's Circle): nothing here. */
  back() {}

  /** The entries the focus moves through, in order. */
  entries() {
    return [...this.element.querySelectorAll(ENTRIES)];
  }

  _navigate(event) {
    const entries = this.entries();
    const at = entries.indexOf(document.activeElement);
    switch (event.code) {
      case 'ArrowUp':
      case 'ArrowDown': {
        if (entries.length === 0) return;
        const step = event.code === 'ArrowDown' ? 1 : -1;
        // Nothing focused (a click on the backdrop): down lands on the first
        // entry, up on the last
        const from = at < 0 && step < 0 ? 0 : at;
        entries[(from + step + entries.length) % entries.length].focus();
        break;
      }
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        if (at >= 0 && !event.repeat) entries[at].click();
        break;
      case 'KeyC':
        if (!event.repeat) this.back();
        break;
      default:
        return;
    }
    // A keyboard's arrows would scroll the list, its Enter click the button
    // a second time
    event.preventDefault();
  }
}

export default Menu;
