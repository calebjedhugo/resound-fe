import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import Random from 'audio/instruments/Random';
import RecordingManager from 'core/RecordingManager';
import PlaybackManager from 'core/PlaybackManager';

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
      // Playback from active inventory slot
      if (value) {
        PlaybackManager.playActiveSlot();
      }
      break;
    case 'KeyR':
      // Recording toggle
      if (value && !RecordingManager.isRecording()) {
        // Keydown - start recording
        RecordingManager.startRecording();
      } else if (!value && RecordingManager.isRecording()) {
        // Keyup - stop recording
        RecordingManager.stopRecording();
      }
      break;
    case 'ArrowLeft':
      // Cycle inventory slot left
      if (value) {
        gameState.player.activeSlot =
          (gameState.player.activeSlot - 1 + gameState.player.maxInventorySize) %
          gameState.player.maxInventorySize;
      }
      break;
    case 'ArrowRight':
      // Cycle inventory slot right
      if (value) {
        gameState.player.activeSlot =
          (gameState.player.activeSlot + 1) % gameState.player.maxInventorySize;
      }
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
