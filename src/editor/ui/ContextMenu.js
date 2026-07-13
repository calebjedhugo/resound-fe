/**
 * ContextMenu - lightweight right-click context menu for viewport entities.
 *
 * Positioned absolutely within a viewport container. Supports menu items
 * with labels, action callbacks, and optional disabled state.
 *
 * @example
 *   const menu = new ContextMenu(viewportContainer);
 *   menu.show(event.offsetX, event.offsetY, [
 *     { label: 'Edit Song', action: () => openSongEditor(entity) },
 *     { label: 'Delete', action: () => deleteEntity(entity) },
 *   ]);
 */
export default class ContextMenu {
  /**
   * @param {HTMLElement} viewportContainer - The container element (must have position: relative).
   */
  constructor(viewportContainer) {
    this._container = viewportContainer;
    this._menuEl = null;
    // Enabled items (buttons + actions) for keyboard navigation, and the index
    // of the currently highlighted one.
    this._navItems = [];
    this._activeIndex = -1;

    // Bound handlers so we can add/remove them cleanly
    this._onDocumentMouseDown = this._handleDocumentMouseDown.bind(this);
    this._onDocumentKeyDown = this._handleDocumentKeyDown.bind(this);

    document.addEventListener('mousedown', this._onDocumentMouseDown);
    document.addEventListener('keydown', this._onDocumentKeyDown);
  }

  /** True while a menu is on screen. */
  get isOpen() {
    return this._menuEl !== null;
  }

  /**
   * Show the context menu at the given pixel coordinates with the specified items.
   * Replaces any existing open menu.
   *
   * @param {number} x - Pixel X position within the viewport container.
   * @param {number} y - Pixel Y position within the viewport container.
   * @param {Array<{label: string, action: () => void, disabled?: boolean}>} items
   */
  show(x, y, items) {
    // Remove any existing menu first
    this._removeMenuElement();

    const menuEl = document.createElement('div');
    menuEl.className = 'context-menu';

    this._navItems = [];
    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'context-menu-item';
      btn.textContent = item.label;

      if (item.disabled) {
        btn.disabled = true;
      } else {
        const activate = (e) => {
          // Menu clicks must not bubble into the viewport's click handler —
          // an action that arms a click mode (e.g. teleport-pick) would be
          // instantly cancelled by its own menu click
          if (e) e.stopPropagation();
          item.action();
          this.hide();
        };
        btn.addEventListener('click', activate);
        const navIndex = this._navItems.length;
        // Hovering also sets the keyboard highlight, so mouse and keyboard agree.
        btn.addEventListener('mouseenter', () => this._setActive(navIndex));
        this._navItems.push({ btn, activate });
      }

      menuEl.appendChild(btn);
    }

    // Position initially at the requested coordinates
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;

    this._container.appendChild(menuEl);
    this._menuEl = menuEl;

    // Highlight the first enabled item so Enter has a target immediately.
    this._activeIndex = -1;
    if (this._navItems.length > 0) this._setActive(0);

    // Clamp to viewport bounds now that the element is in the DOM
    this._clampPosition(x, y);
  }

  /**
   * Hide and remove the context menu from the DOM.
   */
  hide() {
    this._removeMenuElement();
  }

  /**
   * Clean up all DOM elements and event listeners. Call when the menu is
   * no longer needed (e.g. when the editor is torn down).
   */
  dispose() {
    this._removeMenuElement();
    document.removeEventListener('mousedown', this._onDocumentMouseDown);
    document.removeEventListener('keydown', this._onDocumentKeyDown);
  }

  // -- Private ----------------------------------------------------------------

  /**
   * Clamp the menu position so it stays within the viewport container bounds.
   */
  _clampPosition(requestedX, requestedY) {
    if (!this._menuEl) return;

    const menuWidth = this._menuEl.offsetWidth;
    const menuHeight = this._menuEl.offsetHeight;
    const viewportWidth = this._container.offsetWidth;
    const viewportHeight = this._container.offsetHeight;

    const clampedX = Math.min(requestedX, viewportWidth - menuWidth);
    const clampedY = Math.min(requestedY, viewportHeight - menuHeight);

    this._menuEl.style.left = `${clampedX}px`;
    this._menuEl.style.top = `${clampedY}px`;
  }

  /**
   * Remove the menu element from the DOM if it exists.
   */
  _removeMenuElement() {
    if (this._menuEl && this._menuEl.parentNode) {
      this._menuEl.parentNode.removeChild(this._menuEl);
    }
    this._menuEl = null;
    this._navItems = [];
    this._activeIndex = -1;
  }

  /** Highlight the enabled item at navIndex (arrow-key / hover selection). */
  _setActive(navIndex) {
    if (navIndex < 0 || navIndex >= this._navItems.length) return;
    if (this._activeIndex >= 0 && this._navItems[this._activeIndex]) {
      this._navItems[this._activeIndex].btn.classList.remove('active');
    }
    this._activeIndex = navIndex;
    this._navItems[navIndex].btn.classList.add('active');
  }

  /** Move the highlight by delta, wrapping around the enabled items. */
  _moveActive(delta) {
    if (this._navItems.length === 0) return;
    const n = this._navItems.length;
    const next = (this._activeIndex + delta + n) % n;
    this._setActive(next);
  }

  /**
   * Handle mousedown on the document -- dismiss the menu if the click
   * was outside the menu element.
   */
  _handleDocumentMouseDown(event) {
    if (!this._menuEl) return;
    if (this._menuEl.contains(event.target)) return;
    this.hide();
  }

  /**
   * Handle keydown on the document while the menu is open: arrow keys move the
   * highlight, Enter activates it, Escape dismisses. The menu owns these keys so
   * they don't leak into the viewport's grid navigation.
   */
  _handleDocumentKeyDown(event) {
    if (!this._menuEl) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.hide();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this._moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._moveActive(-1);
        break;
      case 'Enter':
        event.preventDefault();
        if (this._activeIndex >= 0 && this._navItems[this._activeIndex]) {
          this._navItems[this._activeIndex].activate();
        }
        break;
      default:
        break;
    }
  }
}
