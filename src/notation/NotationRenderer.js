/**
 * Main notation renderer.
 * Converts musical data to SVG staff notation.
 */

import { createSvgElement, createGroup } from 'notation/lib/svgHelpers';
import { parseNoteData } from 'notation/lib/dataParser';
import { inferClef } from 'notation/lib/clefInference';
import { getDurationInfo, fractionToBeats } from 'notation/lib/durationSymbols';
import { pitchToStaffY, parsePitch } from 'notation/lib/notePositions';
import { createStaffLines } from 'notation/components/Staff';
import { createNote } from 'notation/components/Note';
import { createClef } from 'notation/components/Clef';
import { createRest } from 'notation/components/Rest';
import { createLedgerLines } from 'notation/components/LedgerLine';
import { createAccidental } from 'notation/components/Accidental';
import { createKeySignature } from 'notation/components/KeySignature';
import { createBarLine } from 'notation/components/BarLine';
import { createTimeSignature } from 'notation/components/TimeSignature';
import { getKeySignature } from 'notation/lib/keySignatures';
import { computeBeamGroups } from 'notation/lib/beaming';
import { createBeams } from 'notation/components/Beam';
import { resolveTies } from 'notation/lib/tieResolver';
import { createTieArc } from 'notation/components/Tie';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 200;
const STAFF_START_X = 20;
const STAFF_TOP_OFFSET = 10;
const CLEF_WIDTH = 30;
const VOICE_HEIGHT = 200;
const VOICE_GAP = 40;
const ACCIDENTAL_OFFSET = 14;
const KEY_SIG_ACCIDENTAL_WIDTH = 10;
const TIME_SIG_WIDTH = 25;
const BAR_LINE_PADDING = 5;
const MIDDLE_LINE_Y = 50;

const ACCIDENTAL_TYPE_MAP = {
  '#': 'sharp',
  b: 'flat',
};

export class NotationRenderer {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - DOM element to append SVG to
   * @param {number} [options.width] - SVG width
   * @param {number} [options.height] - SVG height
   * @param {number} [options.scale] - Scaling factor
   */
  constructor({ container, width, height, scale } = {}) {
    this._container = container || null;
    this._width = width || DEFAULT_WIDTH;
    this._height = height || DEFAULT_HEIGHT;
    this._scale = scale || 1.0;
    this._svg = null;
  }

  /**
   * Render notation from song data. Replaces any previous output.
   * @param {Array|Object} songData - Level 1, 2, or 3 input
   * @returns {SVGElement}
   */
  render(songData) {
    this.clear();

    const parsed = parseNoteData(songData);
    const voiceCount = parsed.voices.length;
    const totalHeight =
      voiceCount > 1 ? voiceCount * VOICE_HEIGHT + (voiceCount - 1) * VOICE_GAP : this._height;

    this._svg = createSvgElement('svg', {
      class: 'notation',
      width: this._width,
      height: totalHeight,
      viewBox: `0 0 ${this._width} ${totalHeight}`,
    });

    parsed.voices.forEach((voice, index) => {
      const clef = voice.clef || inferClef(voice.notes);
      const voiceY = index * (VOICE_HEIGHT + VOICE_GAP);

      const staffGroup = createGroup(`staff staff-${index}`, {
        'data-voice-id': voice.id,
        'data-clef': clef,
        transform: `translate(0, ${voiceY})`,
      });

      // Staff lines
      const lines = createStaffLines(this._width);
      lines.setAttribute('transform', `translate(0, ${STAFF_TOP_OFFSET})`);
      staffGroup.appendChild(lines);

      // Clef
      const clefGroup = createClef(clef);
      clefGroup.setAttribute('transform', `translate(${STAFF_START_X}, 0)`);
      staffGroup.appendChild(clefGroup);

      let cursorX = STAFF_START_X + CLEF_WIDTH;

      // Key signature
      const keySignature = voice.keySignature || 'C';
      const keySigGroup = createKeySignature(keySignature, clef);
      if (keySigGroup) {
        keySigGroup.setAttribute('transform', `translate(${cursorX}, 0)`);
        staffGroup.appendChild(keySigGroup);
        const keyInfo = getKeySignature(keySignature);
        cursorX += keyInfo.count * KEY_SIG_ACCIDENTAL_WIDTH;
      }

      // Time signature
      const timeSignature = voice.timeSignature;
      if (timeSignature) {
        const timeSigGroup = createTimeSignature(timeSignature);
        timeSigGroup.setAttribute('transform', `translate(${cursorX}, 0)`);
        staffGroup.appendChild(timeSigGroup);
        cursorX += TIME_SIG_WIDTH;
      }

      // Beat tracking for bar lines
      const measureLength = timeSignature ? timeSignature[0] * (4 / timeSignature[1]) : null;
      let cumulativeBeats = 0;

      // Pre-compute beam groups
      const beamGroups = timeSignature ? computeBeamGroups(voice.notes, timeSignature) : [];
      const beamLookup = new Map();
      beamGroups.forEach((group, gi) => {
        group.forEach((noteIdx, posInGroup) => {
          beamLookup.set(noteIdx, {
            groupIndex: gi,
            isFirst: posInGroup === 0,
            isLast: posInGroup === group.length - 1,
          });
        });
      });

      // Pre-compute stem direction for each beam group
      const beamGroupStemDown = beamGroups.map((group) => {
        const yValues = group.map((idx) => {
          const el = voice.notes[idx];
          return el.pitch ? pitchToStaffY(el.pitch, clef) : MIDDLE_LINE_Y;
        });
        const avgY = yValues.reduce((a, b) => a + b, 0) / yValues.length;
        return avgY <= MIDDLE_LINE_Y;
      });

      let activeBeamGroupEl = null;
      let activeBeamNoteData = [];
      let activeBeamGroupIdx = -1;

      // Track note X positions for tie rendering
      const noteXPositions = new Map();

      // Notes
      for (let i = 0; i < voice.notes.length; i++) {
        const element = voice.notes[i];

        if (Array.isArray(element)) {
          // Chord — skip for now
          continue;
        }

        const beamInfo = beamLookup.get(i);
        const isBeamed = !!beamInfo;

        // Start new beam group
        if (beamInfo && beamInfo.isFirst) {
          activeBeamGroupEl = createGroup('beam-group');
          activeBeamNoteData = [];
          activeBeamGroupIdx = beamInfo.groupIndex;
        }

        const target = activeBeamGroupEl || staffGroup;
        const beamStemDown = isBeamed ? beamGroupStemDown[beamInfo.groupIndex] : undefined;

        // Record position for tie rendering
        noteXPositions.set(i, cursorX);

        let elementBeats = 0;

        if (!element.pitch) {
          // Rest (no pitch, has length)
          if (element.length) {
            const restGroup = createRest({ length: element.length, x: cursorX });
            target.appendChild(restGroup);
            const info = getDurationInfo(element.length);
            cursorX += info.spacing;
            elementBeats = fractionToBeats(element.length);
            if (element.dotted) elementBeats *= 1.5;
          }
        } else {
          const noteY = pitchToStaffY(element.pitch, clef);

          // Accidental (render before note, to the left)
          const { accidental } = parsePitch(element.pitch);
          const accidentalType = ACCIDENTAL_TYPE_MAP[accidental];
          if (accidentalType) {
            const accGroup = createAccidental(accidentalType);
            accGroup.setAttribute(
              'transform',
              `translate(${cursorX - ACCIDENTAL_OFFSET}, ${noteY})`
            );
            target.appendChild(accGroup);
          }

          const noteGroup = createNote({
            pitch: element.pitch,
            length: element.length,
            x: cursorX,
            clef,
            beamed: isBeamed,
            stemDown: beamStemDown,
          });
          target.appendChild(noteGroup);

          // Track position for beam rendering
          if (isBeamed) {
            const info = getDurationInfo(element.length);
            activeBeamNoteData.push({
              x: cursorX,
              y: noteY,
              beams: info.beams,
            });
          }

          // Ledger lines for notes outside the staff
          const ledgerGroup = createLedgerLines({ x: cursorX, y: noteY });
          if (ledgerGroup) {
            target.appendChild(ledgerGroup);
          }

          const info = getDurationInfo(element.length);
          cursorX += info.spacing;
          elementBeats = fractionToBeats(element.length);
          if (element.dotted) elementBeats *= 1.5;
        }

        // Close beam group
        if (beamInfo && beamInfo.isLast && activeBeamGroupEl) {
          const beamPaths = createBeams({
            notes: activeBeamNoteData,
            stemDown: beamGroupStemDown[activeBeamGroupIdx],
          });
          activeBeamGroupEl.appendChild(beamPaths);
          staffGroup.appendChild(activeBeamGroupEl);
          activeBeamGroupEl = null;
          activeBeamNoteData = [];
          activeBeamGroupIdx = -1;
        }

        // Bar line insertion
        if (measureLength && elementBeats > 0) {
          cumulativeBeats += elementBeats;
          while (cumulativeBeats >= measureLength - 0.001) {
            cursorX += BAR_LINE_PADDING;
            staffGroup.appendChild(createBarLine(cursorX));
            cursorX += BAR_LINE_PADDING;
            cumulativeBeats -= measureLength;
          }
          if (Math.abs(cumulativeBeats) < 0.001) {
            cumulativeBeats = 0;
          }
        }
      }

      // Tie rendering pass (after all notes so ties draw on top)
      const tiePairs = resolveTies(voice.notes);
      if (tiePairs.length > 0) {
        const tiesGroup = createGroup('ties');
        for (const pair of tiePairs) {
          const startX = noteXPositions.get(pair.startIndex);
          const endX = noteXPositions.get(pair.endIndex);
          if (startX === undefined || endX === undefined) continue;

          const noteY = pitchToStaffY(pair.pitch, clef);
          const beamInfoStart = beamLookup.get(pair.startIndex);
          const stemDown = beamInfoStart
            ? beamGroupStemDown[beamInfoStart.groupIndex]
            : noteY <= MIDDLE_LINE_Y;
          const direction = stemDown ? 'above' : 'below';

          tiesGroup.appendChild(
            createTieArc({
              x1: startX,
              y1: noteY,
              x2: endX,
              y2: noteY,
              direction,
            })
          );
        }
        staffGroup.appendChild(tiesGroup);
      }

      this._svg.appendChild(staffGroup);
    });

    if (this._container) {
      this._container.appendChild(this._svg);
    }

    return this._svg;
  }

  /**
   * Remove the SVG and reset state.
   */
  clear() {
    if (this._svg && this._svg.parentNode) {
      this._svg.parentNode.removeChild(this._svg);
    }
    this._svg = null;
  }

  /**
   * Get the current SVG element.
   * @returns {SVGElement|null}
   */
  getSvgElement() {
    return this._svg;
  }
}
