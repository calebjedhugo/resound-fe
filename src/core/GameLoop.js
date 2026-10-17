class GameLoop {
  constructor(updateFn, renderFn) {
    this.update = updateFn;
    this.render = renderFn;
    this.running = false;
    this.lastTime = 0;
    this.deltaTime = 0;
    this.frameId = null;
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

    // Schedule first: one frame that throws must cost one frame, not the game.
    // start() runs the first frame synchronously, so a throw there used to
    // reject game init before any frame was ever scheduled — frozen for good.
    this.frameId = requestAnimationFrame(this.loop);

    const currentTime = performance.now();
    this.deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    try {
      // Update game logic
      if (this.update) {
        this.update(this.deltaTime);
      }

      // Render
      if (this.render) {
        this.render();
      }
    } catch (error) {
      console.error('Frame failed:', error);
    }
  };
}

export default GameLoop;
