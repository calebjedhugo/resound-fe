import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import Piano from 'audio/Piano';

const piano = new Piano();

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
    case 'Space':
      if (value)
        piano.play({
          tempo: 160,
          data: [
            { pitch: 'C4', length: '1/8' },
            { pitch: 'C4', length: '1/8' },
            { pitch: 'G4', length: '1/8' },
            { pitch: 'G4', length: '1/8' },
            { pitch: 'A4', length: '1/8' },
            { pitch: 'A4', length: '1/8' },
            { pitch: 'G4', length: '1/4' },
            { pitch: 'F4', length: '1/8' },
            { pitch: 'F4', length: '1/8' },
            { pitch: 'E4', length: '1/8' },
            { pitch: 'E4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'D4', length: '1/8' },
            { pitch: 'C4', length: '1/4' },
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

export default createEventListeners;
