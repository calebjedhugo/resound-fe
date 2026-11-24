/**
 * PlayPreview — the editor's Play in one tab (core/playLink has the
 * game's side).
 *
 *   idle ──start──▶ entering ──(landed + game ready, cross-fade)──▶ playing
 *     ▲                │ Esc / the game failed / it never came           │
 *     │                ▼                                                 │
 *     └──(landed home)── returning ◀──────────── Back to Editor ─────────┘
 *
 * entering: the sidebar and the pad legend slide away while the editor's
 * camera glides (GLIDE_MS, eased) from where it is to the player's eye at
 * the spawn — the game's position, heading and lens (core/playerView,
 * core/constants), so the editor's last frame is the game's first. Under
 * it the game loads, unseen, in an iframe over the window (same origin,
 * so the same main thread: it builds its world only once told the camera
 * has LANDED and holds still, where a stall shows nothing); it says READY
 * once it has drawn its first frame at the spawn (its start gate veiled).
 * Glide landed and game ready, in either order (the camera holds at the eye
 * with a small loading ring while the game is slower), the iframe fades in
 * (CROSS_FADE_MS) and gets the keyboard and the controller (GO).
 *
 * playing: the editor draws nothing and hears nothing (EditorApp suspends
 * its keys and its controller polling for the whole preview).
 *
 * returning: Back to Editor tells where the player's eye is and which area
 * they are in. The editor draws that view (the spawn's, if they walked into
 * another level), the game fades out over it and is torn down (its audio,
 * frames and pad polling go with its document), and the camera glides home
 * to exactly where it was before Play while the sidebar slides back.
 *
 * Through the preview the canvas covers the whole window and the camera's
 * view offset keeps the picture centred on the part the sidebar doesn't
 * cover (`_frame`): no canvas resize per frame, and with the sidebar gone
 * the view is the game's full window.
 */
import { VIEW_FOV, VIEW_NEAR, VIEW_FAR } from 'core/constants';
import { spawnEye, viewQuaternion, START_YAW, START_PITCH } from 'core/playerView';
import {
  playUrl,
  PREVIEW_WAITING,
  PREVIEW_LANDED,
  PREVIEW_READY,
  PREVIEW_FAILED,
  PREVIEW_GO,
  BACK_TO_EDITOR,
} from 'core/playLink';
import { gameToEditor } from 'editor/viewport/gridUtils';
import { poseAt, samePose, easeInOutCubic } from 'editor/play/glide';
import { environmentClock, setEnvironmentClock } from 'entities/EnvironmentLook';

// The glide down to the eye, and back home
export const GLIDE_MS = 1000;
// Editor <-> game, both ways
export const CROSS_FADE_MS = 150;
// A late correction, when the game's first frame isn't quite where the
// editor landed (it reports its own eye)
const SETTLE_MS = 250;
// The sidebar and legend slide over this share of a glide (the first part
// going in, the last part coming back)
const CHROME_SHARE = 0.4;
// The across-then-down path (editor/play/glide poseAt)
const ACROSS = 0.15;
// The most a glide moves on in one frame (two frames' worth at 60 Hz)
const MAX_STEP_MS = 34;
// The glide starts once the game's code has loaded (it says WAITING): its
// loading shares this thread and would pause a glide already under way.
// Past this long without word, the glide goes anyway.
export const CODE_WAIT_MS = 2000;
// A hold this long shows the loading ring (a usual load, ~0.3 s, doesn't)
const HOLD_RING_MS = 500;
// A game that hasn't said READY this long after the camera landed isn't coming
const READY_TIMEOUT_MS = 20000;

/** A game pose (playLink: arrays, game coordinates) as an editor pose. */
function editorPose(gamePose) {
  const [x, y, z] = gamePose.position;
  const [qx, qy, qz, qw] = gamePose.quaternion;
  return {
    position: gameToEditor({ x, y, z }),
    quaternion: { x: qx, y: qy, z: qz, w: qw },
    fov: gamePose.fov || VIEW_FOV,
    far: VIEW_FAR,
  };
}

export default class PlayPreview {
  /**
   * @param {object} host
   * @param {THREE.PerspectiveCamera} host.camera
   * @param {THREE.WebGLRenderer} host.renderer
   * @param {OrbitControls} host.controls
   * @param {() => void} host.requestFrame - ask for an editor frame
   * @param {() => void} host.suspend - the editor stands aside (input, cues)
   * @param {() => void} host.resume - and comes back, as it was
   * @param {(message: string) => void} host.toast
   * @param {() => void} host.fitView - size the canvas to the viewport again
   */
  constructor(host) {
    this._host = host;
    this._state = 'idle';
    this._onMessage = (event) => this._message(event);
    this._onResize = () => this._measure();
  }

  /** 'idle' | 'entering' | 'playing' | 'returning' */
  get state() {
    return this._state;
  }

  /** Whether a preview is under way (the editor stands aside). */
  get active() {
    return this._state !== 'idle';
  }

  /** The game's iframe while there is one (tests, the browser check). */
  get frameElement() {
    return this._frame || null;
  }

  /** Entering: the camera has reached the eye. */
  get landed() {
    return this._state === 'entering' && this._landed;
  }

  /** Entering: the game has drawn its first frame. */
  get gameReady() {
    return this._state === 'entering' && this._ready !== null;
  }

  /**
   * Play `puzzleId` from its spawn (its file is saved already).
   * @param {{puzzleId: string, playerStart: {x, y, z}}} level
   * @returns {boolean} whether it started (not while one is under way)
   */
  start({ puzzleId, playerStart }) {
    if (this.active) return false;
    const { camera, controls } = this._host;
    this._puzzleId = puzzleId;
    this._home = {
      ...this._currentPose(),
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      near: camera.near,
    };
    const q = viewQuaternion(START_YAW, START_PITCH);
    this._spawn = {
      position: gameToEditor(spawnEye(playerStart)),
      quaternion: q,
      fov: VIEW_FOV,
      far: VIEW_FAR,
    };
    this._from = this._currentPose();
    this._to = this._spawn;
    this._glideMs = GLIDE_MS;
    this._glideStart = null;
    this._holdSince = null;
    this._landed = false;
    this._gameWaiting = false;
    this._landedSent = false;
    this._ready = null;
    this._readyTimer = null;
    this._fading = false;
    this._state = 'entering';
    this._chrome = 0;

    this._host.suspend();
    camera.near = VIEW_NEAR; // the game's lens (the editor's is the same today)
    this._layOut();
    this._frame = this._makeFrame(puzzleId);
    window.addEventListener('message', this._onMessage);
    window.addEventListener('resize', this._onResize);
    this._host.requestFrame();
    return true;
  }

  /** Esc while gliding in: back to the editor, no game. */
  cancel() {
    if (this._state === 'entering') this._abandon(null);
  }

  /**
   * One editor frame (EditorApp._renderFrame, before it draws): place the
   * camera, the chrome and the view for `now`.
   * @param {number} now - the frame's timestamp (ms)
   * @returns {{draw: boolean, more: boolean, still?: boolean}} whether the
   *   editor's view is drawn this frame, whether the preview wants another,
   *   and whether the look holds still (not animated) this frame
   */
  frame(now) {
    if (this._state === 'entering') return this._enterFrame(now);
    if (this._state === 'returning') return this._returnFrame(now);
    return { draw: false, more: false }; // playing: the game is the view
  }

  /** A window resize under way: the canvas still covers the window. */
  onResize() {
    this._measure();
  }

  /** The editor goes away mid-preview: nothing of it is left behind. */
  dispose() {
    clearTimeout(this._readyTimer);
    clearTimeout(this._fadeTimer);
    this._removeFrame();
    if (this._shield) this._shield.remove();
    if (this._loading) this._loading.remove();
    window.removeEventListener('message', this._onMessage);
    window.removeEventListener('resize', this._onResize);
    this._state = 'idle';
  }

  // ---- Entering -----------------------------------------------------------

  _enterFrame(now) {
    // Hold still until the game's code has loaded (see CODE_WAIT_MS)
    if (!this._gameWaiting && this._glideStart === null) {
      if (this._holdSince === null) this._holdSince = now;
      const held = now - this._holdSince;
      if (held < CODE_WAIT_MS) {
        if (this._loading) this._loading.hidden = held < HOLD_RING_MS;
        return { draw: true, more: true };
      }
    }
    const t = this._glided(now) / this._glideMs;
    const across = this._glideMs === GLIDE_MS ? ACROSS : 0;
    this._apply(poseAt(this._from, this._to, t, across));
    this._chrome = Math.max(this._chrome, easeInOutCubic(t / CHROME_SHARE));
    this._layOutChrome();
    if (t >= 1 && !this._landed) {
      this._landed = true;
      this._apply(this._to);
      this._tellLanded();
      if (!this._readyTimer) {
        this._readyTimer = setTimeout(() => {
          if (this._state === 'entering' && !this._ready) this._abandon("The game didn't start");
        }, READY_TIMEOUT_MS);
      }
    }
    if (this._landed && this._ready && !this._fading) {
      if (!samePose(this._to, this._ready)) {
        // The game's eye isn't where the editor landed: settle onto it
        this._from = this._currentPose();
        this._to = this._ready;
        this._glideMs = SETTLE_MS;
        this._glideStart = null;
        this._landed = false;
      } else {
        this._fadeIn();
      }
    }
    if (this._loading) this._loading.hidden = !(this._landed && !this._ready);
    // Landed, the look holds still (sky, creatures) until the game takes over
    return { draw: true, more: this._state === 'entering', still: this._landedSent };
  }

  /** The camera holds still at the eye: the game may build and draw now. */
  _tellLanded() {
    if (this._landedSent || !this._gameWaiting || !this._landed) return;
    this._landedSent = true;
    // The sky as the editor shows it now: the game's first frame shows the
    // same clouds (the editor's look holds still from here, as the game's
    // world does behind its veiled gate)
    this._post({ type: PREVIEW_LANDED, sky: environmentClock() });
  }

  _post(message) {
    const win = this._frame && this._frame.contentWindow;
    if (win) win.postMessage(message, window.location.origin);
  }

  /**
   * How far into the glide (ms) at frame time `now`. A frame that comes late
   * (the game's code loading on this thread) moves it on by at most
   * MAX_STEP_MS: the camera pauses there rather than jumping.
   */
  _glided(now) {
    if (this._glideStart === null) {
      this._glideStart = now;
      this._glideAt = now;
      this._glideMsDone = 0;
    }
    this._glideMsDone += Math.min(Math.max(0, now - this._glideAt), MAX_STEP_MS);
    this._glideAt = now;
    return this._glideMsDone;
  }

  _fadeIn() {
    this._fading = true;
    if (this._loading) this._loading.hidden = true;
    this._frame.classList.add('shown');
    this._fadeTimer = setTimeout(() => this._handOver(), CROSS_FADE_MS);
  }

  /** The game is on screen: it takes the keyboard and the controller. */
  _handOver() {
    this._state = 'playing';
    clearTimeout(this._readyTimer);
    this._frame.classList.add('playing');
    const win = this._frame.contentWindow;
    try {
      this._frame.focus();
      if (win) win.focus();
    } catch {
      // nothing to focus (it went away meanwhile)
    }
    this._post({ type: PREVIEW_GO });
  }

  // ---- Returning ----------------------------------------------------------

  /**
   * Back to Editor: start from where the player's eye is (the spawn's, if
   * they walked into another level: the editor draws only this one).
   */
  _back({ areaId, pose, sky }) {
    const here = areaId === this._puzzleId && pose ? editorPose(pose) : this._spawn;
    if (sky) setEnvironmentClock(sky); // the game's clouds, where it left them
    this._state = 'returning';
    this._phase = 'place';
    this._from = here;
    this._apply(here);
    this._frame.classList.remove('playing');
    window.focus();
    this._host.requestFrame();
  }

  /** Back from wherever the camera is now, the game never shown. */
  _abandon(message) {
    clearTimeout(this._fadeTimer);
    this._removeFrame();
    this._state = 'returning';
    this._phase = 'glide';
    this._from = this._currentPose();
    this._glideStart = null;
    if (message) this._host.toast(message);
    this._host.requestFrame();
  }

  _returnFrame(now) {
    if (this._phase === 'place') {
      // This frame draws the player's view under the game: now it fades
      this._apply(this._from);
      this._phase = 'fade';
      this._frame.classList.remove('shown');
      this._fadeTimer = setTimeout(() => {
        this._removeFrame();
        this._phase = 'glide';
        this._glideStart = null;
        this._host.requestFrame();
      }, CROSS_FADE_MS);
      return { draw: true, more: false };
    }
    if (this._phase === 'fade') {
      this._apply(this._from);
      return { draw: true, more: false };
    }
    const t = this._glided(now) / GLIDE_MS;
    this._apply(poseAt(this._from, this._home, t, -ACROSS));
    const chromeBack = easeInOutCubic((t - (1 - CHROME_SHARE)) / CHROME_SHARE);
    this._chrome = Math.min(this._chrome, 1 - chromeBack);
    this._layOutChrome();
    if (t < 1) return { draw: true, more: true };
    this._finish();
    return { draw: true, more: false };
  }

  /** Home: exactly the camera, view and editor as they were before Play. */
  _finish() {
    const { camera, controls, renderer } = this._host;
    this._apply(this._home);
    camera.near = this._home.near;
    controls.target.set(this._home.target.x, this._home.target.y, this._home.target.z);
    this._chrome = 0;
    this._layOutChrome();
    if (camera.clearViewOffset) camera.clearViewOffset();
    renderer.domElement.classList.remove('play-canvas');
    this._shield.remove();
    this._shield = null;
    if (this._loading) this._loading.remove();
    this._loading = null;
    document.getElementById('editor-root').classList.remove('previewing');
    window.removeEventListener('message', this._onMessage);
    window.removeEventListener('resize', this._onResize);
    clearTimeout(this._readyTimer);
    this._state = 'idle';
    this._host.fitView();
    this._host.resume();
  }

  // ---- Messages from the game -------------------------------------------

  _message(event) {
    const frame = this._frame;
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.origin !== window.location.origin) return;
    const { data } = event;
    if (!data || typeof data.type !== 'string') return;
    if (data.type === PREVIEW_WAITING && this._state === 'entering') {
      this._gameWaiting = true;
      this._tellLanded();
    } else if (data.type === PREVIEW_READY && this._state === 'entering' && !this._ready) {
      this._ready = data.pose ? editorPose(data.pose) : this._spawn;
      // Still gliding: land on the game's own eye (the same, to the digit)
      if (!this._landed) this._to = this._ready;
      this._host.requestFrame();
    } else if (data.type === PREVIEW_FAILED && this._state === 'entering') {
      this._abandon(data.message || "The game couldn't play this level");
    } else if (data.type === BACK_TO_EDITOR && this._state === 'playing') {
      this._back(data);
    }
  }

  // ---- The page -----------------------------------------------------------

  /** The game, loading unseen over everything (style: editor.css). */
  // eslint-disable-next-line class-methods-use-this
  _makeFrame(puzzleId) {
    const frame = document.createElement('iframe');
    frame.className = 'play-frame';
    frame.title = 'Resound';
    // Audio may start without its own gesture (the Play click/key counts
    // when the browser allows); the controller reads through it
    frame.allow = 'autoplay; gamepad';
    frame.src = playUrl(puzzleId);
    document.body.appendChild(frame);
    return frame;
  }

  _removeFrame() {
    if (!this._frame) return;
    // Its document goes, and with it its audio, its frames and its pad
    this._frame.remove();
    this._frame = null;
  }

  /** The canvas over the whole window, the chrome above it, the shield over all. */
  _layOut() {
    document.getElementById('editor-root').classList.add('previewing');
    this._host.renderer.domElement.classList.add('play-canvas');
    this._shield = document.createElement('div');
    this._shield.className = 'play-shield';
    document.body.appendChild(this._shield);
    this._loading = document.createElement('div');
    this._loading.className = 'play-loading';
    this._loading.hidden = true;
    document.body.appendChild(this._loading);
    this._measure();
  }

  /** The window and the viewport's place in it (the camera's view follows). */
  _measure() {
    const viewport = document.getElementById('editor-viewport');
    const rect = viewport.getBoundingClientRect();
    this._window = { width: window.innerWidth, height: window.innerHeight };
    this._viewport = {
      left: rect.left,
      top: rect.top,
      width: rect.width || this._window.width,
      height: rect.height || this._window.height,
    };
    this._host.renderer.setSize(this._window.width, this._window.height);
    this._layOutChrome();
  }

  /**
   * The chrome `this._chrome` of the way out (0 = all in), and the camera's
   * view centred on what it leaves uncovered: the viewport's rect grown to
   * the window's.
   */
  _layOutChrome() {
    const s = this._chrome;
    const sidebar = document.getElementById('editor-sidebar');
    if (sidebar) sidebar.style.transform = s > 0 ? `translateX(${-s * this._viewport.left}px)` : '';
    for (const el of document.querySelectorAll('.pad-legend, .viewport-hud, .song-modal')) {
      el.style.opacity = s > 0 ? String(1 - s) : '';
      el.style.visibility = s >= 1 ? 'hidden' : '';
    }
    const { camera } = this._host;
    const win = this._window;
    const view = this._viewport;
    const left = view.left * (1 - s);
    const top = view.top * (1 - s);
    const width = view.width + (win.width - view.width) * s;
    const height = view.height + (win.height - view.height) * s;
    camera.aspect = width / height;
    if (camera.setViewOffset)
      camera.setViewOffset(width, height, -left, -top, win.width, win.height);
    camera.updateProjectionMatrix();
  }

  _currentPose() {
    const { camera } = this._host;
    const { position: p, quaternion: q } = camera;
    return {
      position: { x: p.x, y: p.y, z: p.z },
      quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
      fov: camera.fov,
      far: camera.far,
    };
  }

  _apply(pose) {
    const { camera } = this._host;
    const { position: p, quaternion: q } = pose;
    camera.position.set(p.x, p.y, p.z);
    camera.quaternion.set(q.x, q.y, q.z, q.w);
    camera.fov = pose.fov;
    camera.far = pose.far;
    camera.updateProjectionMatrix();
  }
}
