/**
 * Main notation renderer.
 * Converts musical data to SVG staff notation.
 */

import { createSvgElement, createGroup, createLine, createEllipse } from 'notation/lib/svgHelpers';
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
const HEAD_RX = 6;
const HEAD_RY = 5;
const STEM_LENGTH = 35;

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
    this._noteData = [];
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
      let beatPosition = 0;

      // Notes
      for (let i = 0; i < voice.notes.length; i++) {
        const element = voice.notes[i];

        if (Array.isArray(element)) {
          const chordNotes = element.filter((n) => n.pitch);
          if (chordNotes.length === 0) {
            beatPosition += 0;
          } else {
            const chordLength = chordNotes[0].length;
            const info = getDurationInfo(chordLength);
            const yPositions = chordNotes.map((n) => pitchToStaffY(n.pitch, clef));

            // Stem direction: note furthest from middle line
            const distances = yPositions.map((y) => Math.abs(y - MIDDLE_LINE_Y));
            const maxDistIdx = distances.indexOf(Math.max(...distances));
            const stemDown = yPositions[maxDistIdx] <= MIDDLE_LINE_Y;

            const chordGroup = createGroup(`chord note ${info.cssClass}`, {
              transform: `translate(${cursorX}, 0)`,
            });

            const currentBeatChord = beatPosition;
            chordGroup.setAttribute('data-beat', String(currentBeatChord));

            // Note heads
            for (const noteY of yPositions) {
              const fill = info.filledHead ? 'currentColor' : 'none';
              chordGroup.appendChild(
                createEllipse(0, noteY, HEAD_RX, HEAD_RY, {
                  class: 'note-head',
                  fill,
                  stroke: 'currentColor',
                })
              );
            }

            // Single shared stem
            if (info.hasStem) {
              const minY = Math.min(...yPositions);
              const maxY = Math.max(...yPositions);
              const stemX = stemDown ? -HEAD_RX : HEAD_RX;
              const stemY1 = stemDown ? minY : maxY;
              const stemY2 = stemDown ? maxY + STEM_LENGTH : minY - STEM_LENGTH;

              chordGroup.appendChild(
                createLine(stemX, stemY1, stemX, stemY2, {
                  class: 'note-stem',
                  stroke: 'currentColor',
                })
              );
            }

            staffGroup.appendChild(chordGroup);

            // Accidentals (on staffGroup with absolute coords)
            for (let j = 0; j < chordNotes.length; j += 1) {
              const { accidental } = parsePitch(chordNotes[j].pitch);
              const accidentalType = ACCIDENTAL_TYPE_MAP[accidental];
              if (accidentalType) {
                const accGroup = createAccidental(accidentalType);
                accGroup.setAttribute(
                  'transform',
                  `translate(${cursorX - ACCIDENTAL_OFFSET}, ${yPositions[j]})`
                );
                staffGroup.appendChild(accGroup);
              }
            }

            // Ledger lines for each note (on staffGroup with absolute coords)
            for (const noteY of yPositions) {
              const ledgerGroup = createLedgerLines({ x: cursorX, y: noteY });
              if (ledgerGroup) {
                staffGroup.appendChild(ledgerGroup);
              }
            }

            // Record positions for ties
            noteXPositions.set(i, cursorX);

            // Store note data for playback
            const chordBeats = fractionToBeats(chordLength) * (chordNotes[0].dotted ? 1.5 : 1);
            this._noteData.push({
              element: chordGroup,
              beat: currentBeatChord,
              duration: chordBeats,
              x: cursorX,
              voiceId: voice.id,
            });

            cursorX += info.spacing;
            const chordElementBeats = fractionToBeats(chordLength);
            beatPosition += chordNotes[0].dotted ? chordElementBeats * 1.5 : chordElementBeats;

            // Bar line insertion for chords
            if (measureLength && chordElementBeats > 0) {
              const adjustedBeats = chordNotes[0].dotted
                ? chordElementBeats * 1.5
                : chordElementBeats;
              cumulativeBeats += adjustedBeats;
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
          // eslint-disable-next-line no-continue
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

        const currentBeat = beatPosition;
        let elementBeats = 0;

        if (element.position !== undefined) {
          // Percussion note (position-based, X notehead)
          const noteY = 100 - element.position * 10;
          const info = getDurationInfo(element.length);

          const noteGroup = createGroup(`note ${info.cssClass}`, {
            transform: `translate(${cursorX}, ${noteY})`,
          });
          noteGroup.setAttribute('data-beat', String(currentBeat));

          // X-shaped notehead
          const xSize = 5;
          const xHead = createGroup('note-head-x');
          xHead.appendChild(
            createLine(-xSize, -xSize, xSize, xSize, {
              stroke: 'currentColor',
              'stroke-width': 2,
            })
          );
          xHead.appendChild(
            createLine(-xSize, xSize, xSize, -xSize, {
              stroke: 'currentColor',
              'stroke-width': 2,
            })
          );
          noteGroup.appendChild(xHead);

          // Stem
          if (info.hasStem) {
            const stemDown = noteY <= MIDDLE_LINE_Y;
            const stemX = stemDown ? -HEAD_RX : HEAD_RX;
            const stemY2 = stemDown ? STEM_LENGTH : -STEM_LENGTH;

            noteGroup.appendChild(
              createLine(stemX, 0, stemX, stemY2, {
                class: 'note-stem',
                stroke: 'currentColor',
              })
            );
          }

          target.appendChild(noteGroup);

          this._noteData.push({
            element: noteGroup,
            beat: currentBeat,
            duration: fractionToBeats(element.length) * (element.dotted ? 1.5 : 1),
            x: cursorX,
            voiceId: voice.id,
          });

          cursorX += info.spacing;
          elementBeats = fractionToBeats(element.length);
          if (element.dotted) elementBeats *= 1.5;
        } else if (!element.pitch) {
          // Rest (no pitch, has length)
          if (element.length) {
            const restGroup = createRest({ length: element.length, x: cursorX });
            restGroup.setAttribute('data-beat', String(currentBeat));
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
          noteGroup.setAttribute('data-beat', String(currentBeat));
          target.appendChild(noteGroup);

          // Store note data for playback position
          this._noteData.push({
            element: noteGroup,
            beat: currentBeat,
            duration: fractionToBeats(element.length) * (element.dotted ? 1.5 : 1),
            x: cursorX,
            voiceId: voice.id,
          });

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

        beatPosition += elementBeats;

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
   * Set the playback position, highlighting the current note.
   * @param {number|null} beat - Current beat position (null to clear)
   * @param {Object} [options]
   * @param {string} [options.voiceId] - Voice ID to highlight (all if omitted)
   */
  setPlaybackPosition(beat, options = {}) {
    if (!this._svg) return;

    // Remove existing highlights and cursor
    this._svg.querySelectorAll('.note-active').forEach((el) => {
      el.classList.remove('note-active');
    });
    const existingCursor = this._svg.querySelector('.playback-cursor');
    if (existingCursor) existingCursor.remove();

    if (beat === null || beat === undefined) return;

    const candidates = options.voiceId
      ? this._noteData.filter((d) => d.voiceId === options.voiceId)
      : this._noteData;

    // Find the note whose beat range contains the given beat
    for (let i = candidates.length - 1; i >= 0; i--) {
      const d = candidates[i];
      if (beat >= d.beat && beat < d.beat + d.duration) {
        d.element.classList.add('note-active');

        // Add cursor line
        const staff = d.element.closest('.staff') || this._svg;
        staff.appendChild(
          createLine(d.x, 10, d.x, 90, {
            class: 'playback-cursor',
            stroke: 'currentColor',
            'stroke-width': 1,
          })
        );
        break;
      }
    }
  }

  /**
   * Remove the SVG and reset state.
   */
  clear() {
    if (this._svg && this._svg.parentNode) {
      this._svg.parentNode.removeChild(this._svg);
    }
    this._svg = null;
    this._noteData = [];
  }

  /**
   * Get the current SVG element.
   * @returns {SVGElement|null}
   */
  getSvgElement() {
    return this._svg;
  }
}
