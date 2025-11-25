class Menu {
  constructor(id) {
    this.element = document.createElement('div');
    this.element.id = id;
    this.element.className = 'menu';
    this.visible = false;
  }

  show() {
    if (this.visible) return;
    this.render();
    document.body.appendChild(this.element);
    this.visible = true;
  }

  hide() {
    if (!this.visible) return;
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.visible = false;
  }

  clear() {
    this.element.innerHTML = '';
  }
}

export default Menu;
