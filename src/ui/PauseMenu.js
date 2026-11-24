import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import Settings from 'core/Settings';
import Sound from 'core/Sound';
import Menu from 'ui/Menu';

class PauseMenu extends Menu {
  /**
   * @param {Function} onContinue
   * @param {Function} onExit
   * @param {Function} onNextPuzzle
   * @param {?Function} [onBackToEditor] - given when the editor's Play
   *   launched this game (core/playLink), or in a dev build (editor mode):
   *   the menu offers it as `editorLabel`
   * @param {string} [editorLabel]
   */
  constructor(
    onContinue,
    onExit,
    onNextPuzzle,
    onBackToEditor = null,
    editorLabel = 'Back to Editor'
  ) {
    super('pause-menu');
    this.onContinue = onContinue;
    this.onExit = onExit;
    this.onNextPuzzle = onNextPuzzle;
    this.onBackToEditor = onBackToEditor;
    this.editorLabel = editorLabel;
    this.soundButton = null;
    // Sound toggled by its key (P, Share) while paused: the entry follows
    Sound.onChange(() => this._labelSound());
  }

  _labelSound() {
    if (this.soundButton) this.soundButton.textContent = `Sound: ${Sound.isOn() ? 'On' : 'Off'}`;
  }

  /** Backing out of pause resumes. */
  back() {
    if (this.onContinue) {
      this.onContinue();
    }
  }

  render() {
    this.clear();

    // Complete = every fountain in THIS session is activated. (Persistent
    // progress would title a fresh replay of an already-beaten puzzle
    // "Puzzle Complete!" the moment you pause.)
    const fountains = gameState.entities.filter((e) => e.type === 'fountain');
    const isPuzzleComplete = fountains.length > 0 && fountains.every((f) => f.isActivated);

    // Title
    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.textContent = isPuzzleComplete ? 'Puzzle Complete!' : 'Paused';
    this.element.appendChild(title);

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';

    // Continue button
    const continueButton = document.createElement('button');
    continueButton.className = 'menu-button';
    continueButton.textContent = 'Resume';
    continueButton.addEventListener('click', () => {
      if (this.onContinue) {
        this.onContinue();
      }
    });
    buttonContainer.appendChild(continueButton);

    // Next Puzzle button (only if puzzle is complete)
    if (isPuzzleComplete) {
      const nextButton = document.createElement('button');
      nextButton.className = 'menu-button';
      nextButton.textContent = 'Next Puzzle';
      nextButton.addEventListener('click', () => {
        if (this.onNextPuzzle) {
          this.onNextPuzzle();
        }
      });
      buttonContainer.appendChild(nextButton);
    }

    // Launched by the editor's Play: straight back to it, on the same level
    if (this.onBackToEditor) {
      const editorButton = document.createElement('button');
      editorButton.className = 'menu-button';
      editorButton.textContent = this.editorLabel;
      editorButton.addEventListener('click', () => this.onBackToEditor());
      buttonContainer.appendChild(editorButton);
    }

    // Invert look: the right stick and the mouse look down when pushed up
    const invertButton = document.createElement('button');
    invertButton.className = 'menu-button';
    const labelInvert = () => {
      invertButton.textContent = `Invert Look: ${Settings.get('invertLookY') ? 'On' : 'Off'}`;
    };
    labelInvert();
    invertButton.addEventListener('click', () => {
      // The mouse's offset flips with it: move the view's center to match,
      // so the view resumes where it was
      const before = CameraController.getView(gameState)[1];
      Settings.set('invertLookY', !Settings.get('invertLookY'));
      const [x, y] = gameState.camera.viewCenter;
      gameState.camera.viewCenter = [x, y + before - CameraController.getView(gameState)[1]];
      labelInvert();
    });
    buttonContainer.appendChild(invertButton);

    // Sound on/off: time runs on either way (core/Sound)
    this.soundButton = document.createElement('button');
    this.soundButton.className = 'menu-button';
    this._labelSound();
    this.soundButton.addEventListener('click', () => Sound.toggle());
    buttonContainer.appendChild(this.soundButton);

    // Exit button
    const exitButton = document.createElement('button');
    exitButton.className = 'menu-button';
    exitButton.textContent = 'Main Menu';
    exitButton.addEventListener('click', () => {
      if (this.onExit) {
        this.onExit();
      }
    });
    buttonContainer.appendChild(exitButton);

    this.element.appendChild(buttonContainer);
  }
}

export default PauseMenu;
