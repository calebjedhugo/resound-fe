class StateMachine {
  constructor(gameState) {
    this.gameState = gameState;
    this.currentState = null;
    this.states = new Map();
  }

  registerState(name, state) {
    this.states.set(name, state);
  }

  setState(name) {
    // Exit current state
    if (this.currentState) {
      this.currentState.exit();
    }

    // Get new state
    const newState = this.states.get(name);
    if (!newState) {
      console.error(`State ${name} not found`);
      return;
    }

    // Enter new state
    this.currentState = newState;
    this.gameState.mode = name;
    this.currentState.enter();
  }

  update(deltaTime) {
    if (this.currentState && this.currentState.update) {
      this.currentState.update(deltaTime);
    }
  }

  render() {
    if (this.currentState && this.currentState.render) {
      this.currentState.render();
    }
  }
}

export default StateMachine;
