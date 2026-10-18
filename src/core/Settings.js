/**
 * Settings - the player's preferences, remembered across visits. Storage
 * that can't be read or written (a private window, blocked site data) leaves
 * the defaults in place for this visit.
 */
class Settings {
  static KEY = 'resound-settings';

  static DEFAULTS = {
    // Pushing the right stick or the mouse up looks down (the I/K keys are
    // named for their direction, so they never flip)
    invertLookY: false,
  };

  static _values = null;

  static get(name) {
    if (!this._values) this._values = { ...this.DEFAULTS, ...this._load() };
    return this._values[name];
  }

  static set(name, value) {
    this.get(name);
    this._values[name] = value;
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this._values));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  static _load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || {};
    } catch (error) {
      return {};
    }
  }
}

export default Settings;
