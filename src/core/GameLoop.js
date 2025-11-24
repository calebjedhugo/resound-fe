class GameLoop {
  constructor(updateFn, renderFn) {
    this.update = updateFn;
    this.render = renderFn;
    this.running = false;
    this.lastTime = 0;
    this.deltaTime = 0;
    this.frameId = null;
    this.targetFPS = 60;
    this.frameInterval = 1000 / this.targetFPS;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  loop = () => {
    if (!this.running) return;

    const currentTime = performance.now();
    this.deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    // Update game logic
    if (this.update) {
      this.update(this.deltaTime);
    }

    // Render
    if (this.render) {
      this.render();
    }

    this.frameId = requestAnimationFrame(this.loop);
  };
}

export default GameLoop;
