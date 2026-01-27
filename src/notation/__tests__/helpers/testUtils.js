/**
 * Test context helper for notation renderer tests.
 * Provides a renderer instance, container, query helpers, and cleanup.
 */

import { NotationRenderer } from 'notation/NotationRenderer';

export function createNotationContext() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const renderer = new NotationRenderer({ container });

  return {
    renderer,
    container,

    // Render helper
    render(song) {
      return renderer.render(song);
    },

    // Query helpers
    getSvg() {
      return container.querySelector('svg');
    },
    getNotes() {
      return container.querySelectorAll('.note');
    },
    getRests() {
      return container.querySelectorAll('.rest');
    },
    getActiveNote() {
      return container.querySelector('.note-active');
    },
    getClef() {
      return container.querySelector('.clef');
    },
    getKeySignature() {
      return container.querySelector('.key-signature');
    },
    getTimeSignature() {
      return container.querySelector('.time-signature');
    },
    getBarLines() {
      return container.querySelectorAll('.bar-line');
    },
    getBeamGroups() {
      return container.querySelectorAll('.beam-group');
    },
    getLedgerLines() {
      return container.querySelectorAll('.ledger-line');
    },
    getTies() {
      return container.querySelectorAll('.tie');
    },

    // Cleanup
    destroy() {
      renderer.clear();
      container.remove();
    },
  };
}
