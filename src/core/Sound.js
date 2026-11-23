import { audioContextManager } from 'resound-sound';
import Settings from 'core/Settings';

/**
 * Sound - the game's sound on/off (mute), remembered across visits
 * (core/Settings 'muted'). Off fades resound-sound's master output to
 * silence; the audio context keeps running, so the musical clock, the
 * creatures' songs and every judgment carry on exactly as with sound on.
 * Toggled from the pause menu's "Sound" entry, the P key or a controller's
 * Share button, in play and in menus (createEventListeners). The saved
 * setting is in force as soon as the game loads this module (main.js
 * imports it, through createEventListeners, before anything can sound).
 */
class Sound {
  static _listeners = new Set();

  /** Put the saved setting in force (done once, on load). */
  static apply() {
    audioContextManager.setMuted(Settings.get('muted'));
  }

  static isOn() {
    return !Settings.get('muted');
  }

  /**
   * Turn sound on or off, remember it, and tell every onChange listener.
   * @returns {boolean} whether sound is now on
   */
  static toggle() {
    const on = !this.isOn();
    Settings.set('muted', !on);
    audioContextManager.setMuted(!on);
    this._listeners.forEach((listener) => listener(on));
    return on;
  }

  /**
   * Call `listener(on)` after every toggle (a menu showing the setting).
   * @returns {Function} stops listening
   */
  static onChange(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}

Sound.apply();

export default Sound;
