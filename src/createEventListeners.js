import gameState from 'core/GameState';
import CameraController from 'core/CameraController';
import { Random } from 'resound-sound';
import AbsorbManager from 'core/AbsorbManager';
import ClapManager from 'core/ClapManager';
import DeployManager from 'core/DeployManager';
import Tape from 'core/Tape';
import Sound from 'core/Sound';
import InputDevice from 'core/InputDevice';
import { nameFor } from 'core/inputGlyphs';
import showToast from 'ui/Toast';

const randomInstrument = new Random();

// Per-key press timestamps for tap detection — only consulted while the
// (dev-only) tap-impulse affordance is enabled.
const keyPressedAt = {};
const TAP_THRESHOLD_MS = 250;

const dispatchKeyboardActions = (event) => {
  const { code, type, repeat } = event;
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

  // The world's actions answer only in play: in a menu (paused, the main
  // menu) Space and C are the menu's, to choose and to back out (ui/Menu),
  // and nothing should act behind it. Held keys still track, so a key let
  // go of in a menu is up when play resumes.
  const acting = value && gameState.mode === 'PLAYING';

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
    case 'KeyP':
      // Sound on/off (a controller's Share), in play and in menus alike.
      // Behind the start gate it never gets here: the gate swallows every
      // key (a press there only wakes it).
      if (value && !repeat) {
        const on = Sound.toggle();
        // The key that was pressed, by name: P, or the pad's own (Share,
        // Create, View...)
        const key = nameFor('sound', InputDevice.familyOf(event), InputDevice.padId);
        showToast(on ? 'Sound on' : `Sound off — ${key} to turn it on`, { duration: 3000 });
      }
      break;
    case 'Space':
      // The pole releases the cursor slot's creature ahead (core/AbsorbManager)
      if (acting && !repeat) {
        AbsorbManager.release();
      }
      break;
    case 'KeyR':
      // The pole absorbs the nearest creature in reach into the tape
      if (acting && !repeat) {
        AbsorbManager.absorb();
      }
      break;
    case 'ArrowLeft':
      // Tape cursor left
      if (acting) {
        Tape.left();
      }
      break;
    case 'ArrowRight':
      // Tape cursor right; on a filled last slot this appends a new one
      if (acting) {
        Tape.right();
      }
      break;
    case 'KeyC':
      // Clap (quantized to 16th notes)
      if (acting) {
        ClapManager.requestClap();
      }
      break;
    case 'KeyG':
      // Deployable cleanser gate: aim -> deploy -> remove (core/DeployManager)
      if (acting && !repeat) {
        DeployManager.toggle();
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
  window.addEventListener('resize', () => gameState.updateScreenCenter());
};

export { randomInstrument };
export default createEventListeners;
