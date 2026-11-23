/**
 * PadFocus — a controller's way through a panel of DOM controls (the sidebar,
 * the world map), as the game's menus are played (ui/Menu): up/down move a
 * visible focus between the controls in page order, wrapping at the ends;
 * Cross chooses; Circle backs out (the caller decides to what).
 *
 * What "choose" and left/right mean follows the control, since a pad can't
 * type: a button is clicked; a dropdown steps through its options with
 * left/right and Cross commits the one shown (so scrolling the puzzle list
 * doesn't open every puzzle on the way); a number field steps by its step
 * (or 1) with left/right, each step committed as a typed edit would be; a
 * checkbox toggles; a text field takes the keyboard's focus (the pad has no
 * letters). Anything else clickable in the panel (an SVG node with
 * `data-pad-focus`) is clicked.
 */
const CONTROLS = 'button, select, input, textarea, [data-pad-focus]';
export const FOCUS_CLASS = 'pad-focus';

function visible(el) {
  if (el.disabled || el.type === 'hidden') return false;
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (node.hidden) return false;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(node) : node.style;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

function fire(el, type) {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

export default class PadFocus {
  /**
   * @param {() => ?Element} getContainer - the panel the focus moves through
   */
  constructor(getContainer) {
    this._getContainer = getContainer;
    this._current = null;
  }

  /** The controls the focus moves through, in page order. */
  items() {
    const container = this._getContainer();
    if (!container) return [];
    return [...container.querySelectorAll(CONTROLS)].filter(visible);
  }

  /** The control the focus is on (null: none, or it left the page). */
  get current() {
    if (this._current && !this._current.isConnected) this._current = null;
    return this._current;
  }

  /**
   * Put the focus on `el`, or on the first control matching `selector`, or
   * else the first control.
   */
  enter(target = null) {
    const items = this.items();
    let el = null;
    if (target instanceof Element) el = target;
    else if (typeof target === 'string') el = items.find((item) => item.matches(target)) || null;
    this._focus(el || items[0] || null);
  }

  /** Take the focus away (back to the viewport). */
  leave() {
    this._revertPending();
    if (this._current) {
      this._current.classList.remove(FOCUS_CLASS);
      if (typeof this._current.blur === 'function') this._current.blur();
    }
    this._current = null;
  }

  /** Up (-1) or down (+1) to the previous / next control, wrapping. */
  move(step) {
    const items = this.items();
    if (items.length === 0) return;
    const at = items.indexOf(this.current);
    const from = at < 0 && step < 0 ? 0 : at;
    this._focus(items[(from + step + items.length) % items.length]);
  }

  /** Left (-1) / right (+1): step the focused control's value. */
  adjust(step) {
    const el = this.current;
    if (!el) return;
    if (el.tagName === 'SELECT') {
      const options = [...el.options];
      let i = el.selectedIndex;
      do {
        i = (i + step + options.length) % options.length;
      } while (options[i].disabled && i !== el.selectedIndex);
      // What it was before stepping: put back unless Cross commits the new one
      if (el.dataset.padCommitted === undefined) el.dataset.padCommitted = String(el.selectedIndex);
      el.selectedIndex = i; // shown; Cross commits it
    } else if (el.tagName === 'INPUT' && el.type === 'number') {
      const by = Number(el.step) > 0 ? Number(el.step) : 1;
      let value = (Number(el.value) || 0) + step * by;
      if (el.min !== '' && el.min !== undefined) value = Math.max(Number(el.min), value);
      if (el.max !== '' && el.max !== undefined) value = Math.min(Number(el.max), value);
      el.value = String(value);
      fire(el, 'input');
      fire(el, 'change');
    }
  }

  /** Cross: choose the focused control. */
  activate() {
    const el = this.current;
    if (!el) return;
    if (el.tagName === 'SELECT') {
      delete el.dataset.padCommitted;
      fire(el, 'change');
    } else if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      el.click();
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.focus(); // typed on the keyboard
    } else if (typeof el.click === 'function') {
      el.click();
    } else {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }

  /** A dropdown stepped through but never confirmed shows what it holds again. */
  _revertPending() {
    const el = this._current;
    if (el && el.tagName === 'SELECT' && el.dataset.padCommitted !== undefined) {
      el.selectedIndex = Number(el.dataset.padCommitted);
      delete el.dataset.padCommitted;
    }
  }

  _focus(el) {
    this._revertPending();
    if (this._current) this._current.classList.remove(FOCUS_CLASS);
    this._current = el;
    if (!el) return;
    el.classList.add(FOCUS_CLASS);
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }
}
