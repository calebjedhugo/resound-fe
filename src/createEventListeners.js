import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import Random from 'audio/instruments/Random';

const randomInstrument = new Random();

const dispatchKeyboardActions = ({ code, type }) => {
  let value;
  if (type === 'keydown') value = true;
  else if (type === 'keyup') value = false;
  else {
    console.error('A non-keyboard event was sent to dispatchKeyboardActions');
    return;
  }

  switch (code) {
    case 'KeyA':
      gameState.input.keys.latLeft = value;
      break;
    case 'KeyD':
      gameState.input.keys.latRight = value;
      break;
    case 'KeyW':
      gameState.input.keys.forward = value;
      break;
    case 'KeyS':
      gameState.input.keys.backward = value;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      gameState.input.keys.running = value;
      break;
    case 'Space':
      if (value)
        randomInstrument.play({
          tempo: 160,
          data: [
            // MEASURE 1: "Twinkle twinkle little star"
            [
              { pitch: 'C4', length: '1/8' },
              { pitch: 'C2', length: '1/4' },
            ],
            { pitch: 'C4', length: '1/8' },
            [
              { pitch: 'G4', length: '1/8' },
              { pitch: 'G2', length: '1/4' },
            ],
            { pitch: 'G4', length: '1/8' },
            [
              { pitch: 'A4', length: '1/8' },
              { pitch: 'F2', length: '1/4' },
            ],
            { pitch: 'A4', length: '1/8' },
            [
              { pitch: 'G4', length: '1/4' },
              { pitch: 'C2', length: '1/4' },
            ],

            // REST: Pause between measures
            { pitch: undefined, length: '1/4' },

            // MEASURE 2: "How I wonder what you are"
            [
              { pitch: 'F4', length: '1/8' },
              { pitch: 'F2', length: '1/4' },
            ],
            { pitch: 'F4', length: '1/8' },
            [
              { pitch: 'E4', length: '1/8' },
              { pitch: 'C2', length: '1/4' },
            ],
            { pitch: 'E4', length: '1/8' },
            [
              { pitch: 'D4', length: '1/8' },
              { pitch: 'G2', length: '1/4' },
            ],
            { pitch: 'D4', length: '1/8' },
            [
              { pitch: 'C4', length: '1/4' },
              { pitch: 'C2', length: '1/4' },
            ],
          ],
        });
      break;
    default:
  }
};

const dispatchMouseActions = ({ screenX, screenY }) => {
  gameState.input.mouse.position = [screenX, screenY];
  const { centered: mouseCentered, screenCenter } = gameState.input.mouse;

  const xFixedRange = CameraController.getXFixedRange(screenCenter);
  const yFixedRange = CameraController.getYFixedRange(screenCenter);

  if (
    Math.abs(screenX - screenCenter[0]) > xFixedRange ||
    Math.abs(screenY - screenCenter[1]) > yFixedRange
  ) {
    if (mouseCentered) {
      gameState.input.mouse.centered = false;
    }
  } else if (!mouseCentered) {
    gameState.input.mouse.centered = true;
  }
};

const createEventListeners = () => {
  window.addEventListener('keydown', dispatchKeyboardActions);
  window.addEventListener('keyup', dispatchKeyboardActions);
  window.addEventListener('mousemove', dispatchMouseActions);
};

// Export the instrument instance so other modules can control playback
export { randomInstrument };
export default createEventListeners;
