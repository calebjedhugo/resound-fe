import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import { Random } from 'resound-sound';
import RecordingManager from 'core/RecordingManager';
import PlaybackManager from 'core/PlaybackManager';
import ClapManager from 'core/ClapManager';
import Tape from 'core/Tape';
import showToast from 'ui/Toast';

const randomInstrument = new Random();

// When the current recording started — distinguishes a quick R tap (toggle
// mode: recording continues until the next R press) from a long hold
// (walkie-talkie mode: releasing R stops).
let recordStartedAt = 0;
const RECORD_HOLD_THRESHOLD_MS = 400;

// Per-key press timestamps for tap detection — only consulted while the
// (dev-only) tap-impulse affordance is enabled.
const keyPressedAt = {};
const TAP_THRESHOLD_MS = 250;

const dispatchKeyboardActions = ({ code, type, repeat }) => {
  let value;
  if (type === 'keydown') value = true;
  else if (type === 'keyup') value = false;
  else {
    console.error('A non-keyboard event was sent to dispatchKeyboardActions');
    return;
  }

  // Movement and look are driven purely by the held key flag: motion happens
  // every frame the key is down and stops exactly where it is on release —
  // a human never gets a post-release lurch. ONLY when the dev-only
  // tap-impulse affordance is on (`window.__resoundDebug.setTapImpulse(true)`)
  // does a quick tap queue one guaranteed step on release, so scripted
  // single-frame taps still register.
  const press = (name) => {
    gameState.input.keys[name] = value;
    if (!gameState.input.tapImpulseEnabled) return;
    if (value) {
      if (!repeat) keyPressedAt[name] = Date.now();
    } else if (Date.now() - (keyPressedAt[name] || 0) < TAP_THRESHOLD_MS) {
      gameState.input.impulses[name] += 1;
    }
  };

  switch (code) {
    case 'KeyA':
      press('latLeft');
      break;
    case 'KeyD':
      press('latRight');
      break;
    case 'KeyW':
      press('forward');
      break;
    case 'KeyS':
      press('backward');
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      gameState.input.keys.running = value;
      break;
    case 'KeyJ':
      press('lookLeft');
      break;
    case 'KeyL':
      press('lookRight');
      break;
    case 'KeyI':
      press('lookUp');
      break;
    case 'KeyK':
      press('lookDown');
      break;
    case 'KeyM':
      // Toggle mouse-look (keyboard look via IJKL always works)
      if (value) {
        const enabled = CameraController.toggleMouseLook(gameState);
        showToast(enabled ? 'Mouse look on' : 'Mouse look off — look with I/J/K/L', {
          duration: 3000,
        });
      }
      break;
    case 'Space':
      // Perform the whole tape (all filled slots, concatenated)
      if (value) {
        PlaybackManager.playTape();
      }
      break;
    case 'KeyR':
      // Hybrid recording control: a tap toggles recording on/off; a long
      // hold records while held and stops on release.
      if (value) {
        if (repeat) break;
        if (!RecordingManager.isRecording()) {
          RecordingManager.startRecording();
          recordStartedAt = Date.now();
        } else {
          RecordingManager.stopRecording();
        }
      } else if (
        RecordingManager.isRecording() &&
        Date.now() - recordStartedAt > RECORD_HOLD_THRESHOLD_MS
      ) {
        RecordingManager.stopRecording();
      }
      break;
    case 'ArrowLeft':
      // Tape cursor left
      if (value) {
        Tape.left();
      }
      break;
    case 'ArrowRight':
      // Tape cursor right; on a filled last slot this appends a new one
      if (value) {
        Tape.right();
      }
      break;
    case 'KeyC':
      // Clap (quantized to 16th notes)
      if (value) {
        ClapManager.requestClap();
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
