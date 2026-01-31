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
import { renderDynamic } from 'notation/components/Dynamic';
import { renderHairpin } from 'notation/components/Hairpin';
import { renderArticulations } from 'notation/components/Articulation';
import { resolveSlurs } from 'notation/lib/slurGrouping';
import { createSlurArc } from 'notation/components/Slur';
import { getTupletNoteDuration } from 'notation/lib/tuplets';
import { renderTupletBracket } from 'notation/components/TupletBracket';
import { renderGraceNotes } from 'notation/components/GraceNote';
import { renderRepeatBarline } from 'notation/components/RepeatBarline';
import { renderEnding } from 'notation/components/Ending';
import { renderNavigationMarker } from 'notation/components/NavigationMarker';
import { renderTempoMarking, renderTempoChange } from 'notation/components/TempoMarking';
import { renderExpressionText } from 'notation/components/ExpressionText';
import { renderRehearsalMark } from 'notation/components/RehearsalMark';
import { renderLyric, renderMelisma } from 'notation/components/Lyric';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 200;
const STAFF_START_X = 20;
const STAFF_TOP_OFFSET = 10;
const CLEF_WIDTH = 45;
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
const DYNAMICS_Y = 110;
const STAFF_CENTER_Y = STAFF_TOP_OFFSET + 40; // midpoint of 5-line staff

/**
 * Check if an element is a non-note marker (dynamic, hairpin, barline, etc.).
 * Returns the marker type string, or null if it's a note/rest/chord.
 */
function getMarkerType(element) {
  if (Array.isArray(element)) return null;
  if (element.tuplet !== undefined) return 'tuplet';
  if (element.barline !== undefined) return 'barline';
  if (element.ending !== undefined) return 'ending';
  if (element.navigation !== undefined) return 'navigation';
  if (element.tempo !== undefined) return 'tempo';
  if (element.tempoChange !== undefined) return 'tempoChange';
  if (element.expression !== undefined) return 'expression';
  if (element.rehearsal !== undefined) return 'rehearsal';
  if (element.dynamic !== undefined) return 'dynamic';
  if (element.hairpin !== undefined) return 'hairpin';
  return null;
}

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
      const voiceHeight = voiceCount > 1 ? VOICE_HEIGHT : totalHeight;
      const voiceY = index * (VOICE_HEIGHT + VOICE_GAP) + (voiceHeight / 2 - STAFF_CENTER_Y);

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

      // Marker tracking for post-processing
      const pendingDynamics = [];
      const hairpinStarts = [];
      const completedHairpins = [];

      // Ending (volta) tracking
      const endingData = [];
      const activeEndings = new Map();

      // Lyric tracking
      const lyricData = [];

      // Notes
      for (let i = 0; i < voice.notes.length; i++) {
        const element = voice.notes[i];

        // Detect inline markers (dynamics, hairpins, etc.)
        const markerType = getMarkerType(element);
        if (markerType === 'dynamic') {
          pendingDynamics.push({ dynamic: element.dynamic, noteIndex: i });
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'hairpin') {
          if (element.start) {
            hairpinStarts.push({ type: element.hairpin, noteIndex: i });
          }
          if (element.stop && hairpinStarts.length > 0) {
            const start = hairpinStarts.pop();
            completedHairpins.push({
              type: start.type,
              startIndex: start.noteIndex,
              stopIndex: i,
              startX: start.startX,
            });
          }
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'tuplet') {
          // Render tuplet group inline
          const tupletRatio = element.tuplet;
          const tupletNotes = element.notes;
          const [actual, normal] = tupletRatio;

          const tupletGroup = createGroup('tuplet-group', {
            'data-tuplet': `${actual}:${normal}`,
          });

          const startX = cursorX;
          let allBeamable = true;
          let hasRest = false;
          const tupletNoteData = [];
          const tupletYPositions = [];

          for (let ti = 0; ti < tupletNotes.length; ti += 1) {
            const tEl = tupletNotes[ti];

            if (Array.isArray(tEl)) {
              // Chord inside tuplet
              allBeamable = false; // simplify: chords don't beam in tuplets
              const chordNotes = tEl.filter((n) => n.pitch);
              if (chordNotes.length > 0) {
                const chordLength = chordNotes[0].length;
                const info = getDurationInfo(chordLength);
                const yPositions = chordNotes.map((n) => pitchToStaffY(n.pitch, clef));
                const distances = yPositions.map((y) => Math.abs(y - MIDDLE_LINE_Y));
                const maxDistIdx = distances.indexOf(Math.max(...distances));
                const stemDown = yPositions[maxDistIdx] <= MIDDLE_LINE_Y;

                const chordGroup = createGroup(`chord note ${info.cssClass}`, {
                  transform: `translate(${cursorX}, 0)`,
                });
                chordGroup.setAttribute('data-beat', String(beatPosition));

                for (const noteY of yPositions) {
                  const fill = info.filledHead ? 'currentColor' : 'none';
                  chordGroup.appendChild(
                    createEllipse(0, noteY, HEAD_RX, HEAD_RY, {
                      class: 'note-head',
                      fill,
                      stroke: 'currentColor',
                    })
                  );
                  tupletYPositions.push(noteY);
                }

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

                tupletGroup.appendChild(chordGroup);

                const effectiveBeats = getTupletNoteDuration(
                  chordLength,
                  chordNotes[0].dotted || false,
                  tupletRatio
                );
                this._noteData.push({
                  element: chordGroup,
                  beat: beatPosition,
                  duration: effectiveBeats,
                  x: cursorX,
                  voiceId: voice.id,
                });
                beatPosition += effectiveBeats;
                cursorX += info.spacing * (normal / actual);
              }
            } else if (!tEl.pitch && tEl.length) {
              // Rest inside tuplet
              hasRest = true;
              allBeamable = false;
              const restGroup = createRest({ length: tEl.length, x: cursorX });
              restGroup.setAttribute('data-beat', String(beatPosition));
              tupletGroup.appendChild(restGroup);

              const info = getDurationInfo(tEl.length);
              const effectiveBeats = getTupletNoteDuration(
                tEl.length,
                tEl.dotted || false,
                tupletRatio
              );
              this._noteData.push({
                element: restGroup,
                beat: beatPosition,
                duration: effectiveBeats,
                x: cursorX,
                voiceId: voice.id,
              });
              beatPosition += effectiveBeats;
              cursorX += info.spacing * (normal / actual);
            } else if (tEl.pitch) {
              // Note inside tuplet
              const noteY = pitchToStaffY(tEl.pitch, clef);
              tupletYPositions.push(noteY);
              const info = getDurationInfo(tEl.length);

              // Check if beamable
              if (info.beams < 1) allBeamable = false;

              const noteGroup = createNote({
                pitch: tEl.pitch,
                length: tEl.length,
                x: cursorX,
                clef,
                beamed: allBeamable && !hasRest,
                stemDown: undefined,
              });
              noteGroup.setAttribute('data-beat', String(beatPosition));

              // Articulations
              if (tEl.articulation) {
                const noteStemDown = noteY <= MIDDLE_LINE_Y;
                const artGroup = renderArticulations({
                  articulation: tEl.articulation,
                  stemDown: noteStemDown,
                });
                if (artGroup) noteGroup.appendChild(artGroup);
              }

              tupletGroup.appendChild(noteGroup);
              tupletNoteData.push({ x: cursorX, y: noteY, beams: info.beams });

              // Ledger lines
              const ledgerGroup = createLedgerLines({ x: cursorX, y: noteY });
              if (ledgerGroup) tupletGroup.appendChild(ledgerGroup);

              const effectiveBeats = getTupletNoteDuration(
                tEl.length,
                tEl.dotted || false,
                tupletRatio
              );
              this._noteData.push({
                element: noteGroup,
                beat: beatPosition,
                duration: effectiveBeats,
                x: cursorX,
                voiceId: voice.id,
              });
              beatPosition += effectiveBeats;
              cursorX += info.spacing * (normal / actual);
            }
          }

          const endX = cursorX;
          const fullyBeamed = allBeamable && !hasRest && tupletNoteData.length >= 2;

          // Beam tuplet notes as a single group if fully beamable
          if (fullyBeamed && tupletNoteData.length >= 2) {
            const avgY = tupletYPositions.reduce((a, b) => a + b, 0) / tupletYPositions.length;
            const stemDown = avgY <= MIDDLE_LINE_Y;

            const beamPaths = createBeams({
              notes: tupletNoteData,
              stemDown,
            });
            tupletGroup.appendChild(beamPaths);
          }

          // Tuplet bracket and number
          const avgY =
            tupletYPositions.length > 0
              ? tupletYPositions.reduce((a, b) => a + b, 0) / tupletYPositions.length
              : MIDDLE_LINE_Y;
          const stemsDown = avgY <= MIDDLE_LINE_Y;
          const bracketY = stemsDown ? 110 : -10;
          const above = !stemsDown;

          tupletGroup.appendChild(
            renderTupletBracket({
              actual,
              startX,
              endX,
              y: bracketY,
              above,
              showBracket: !fullyBeamed,
            })
          );

          staffGroup.appendChild(tupletGroup);

          // Bar line tracking for tuplet
          if (measureLength) {
            const tupletBeats = tupletNotes.reduce((sum, tEl) => {
              if (Array.isArray(tEl)) {
                return (
                  sum + getTupletNoteDuration(tEl[0].length, tEl[0].dotted || false, tupletRatio)
                );
              }
              if (tEl.length) {
                return sum + getTupletNoteDuration(tEl.length, tEl.dotted || false, tupletRatio);
              }
              return sum;
            }, 0);
            cumulativeBeats += tupletBeats;
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

          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'barline') {
          cursorX += BAR_LINE_PADDING;
          staffGroup.appendChild(renderRepeatBarline({ type: element.barline, x: cursorX }));
          cursorX += element.barline === 'repeat-both' ? 20 : 15;
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'ending') {
          if (element.ending.type === 'start') {
            activeEndings.set(element.ending.number, { startX: cursorX });
          } else if (element.ending.type === 'stop') {
            const start = activeEndings.get(element.ending.number);
            if (start) {
              endingData.push({
                number: element.ending.number,
                startX: start.startX,
                endX: cursorX,
                isClosed: true,
              });
              activeEndings.delete(element.ending.number);
            }
          }
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'navigation') {
          staffGroup.appendChild(renderNavigationMarker({ type: element.navigation, x: cursorX }));
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'tempo') {
          staffGroup.appendChild(renderTempoMarking({ tempo: element.tempo, x: cursorX }));
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'tempoChange') {
          staffGroup.appendChild(renderTempoChange({ type: element.tempoChange, x: cursorX }));
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'expression') {
          staffGroup.appendChild(renderExpressionText({ text: element.expression, x: cursorX }));
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType === 'rehearsal') {
          staffGroup.appendChild(renderRehearsalMark({ label: element.rehearsal, x: cursorX }));
          // eslint-disable-next-line no-continue
          continue;
        }
        if (markerType) {
          // eslint-disable-next-line no-continue
          continue;
        }

        // Associate pending dynamics/hairpins with this note's x position
        for (const pd of pendingDynamics) {
          if (pd.x === undefined) pd.x = cursorX;
        }
        for (const hs of hairpinStarts) {
          if (hs.startX === undefined) hs.startX = cursorX;
        }
        for (const ch of completedHairpins) {
          if (ch.endX === undefined) ch.endX = cursorX;
        }

        if (Array.isArray(element)) {
          const chordNotes = element.filter((n) => n.pitch);
          if (chordNotes.length === 0) {
            beatPosition += 0;
          } else {
            const chordLength = chordNotes[0].length;
            const info = getDurationInfo(chordLength);
            const yPositions = chordNotes.map((n) => pitchToStaffY(n.pitch, clef));

            // Grace notes on chord (from first note that has grace property)
            const chordGrace = chordNotes.find((n) => n.grace);
            if (chordGrace) {
              const mainY = Math.min(...yPositions);
              const graceResult = renderGraceNotes({
                grace: chordGrace.grace,
                mainX: cursorX,
                mainY,
                clef,
              });
              staffGroup.appendChild(graceResult.element);
            }

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

            // Articulations on chord (from first note that has the property)
            const chordArticulation = chordNotes.find((n) => n.articulation);
            if (chordArticulation) {
              const artGroup = renderArticulations({
                articulation: chordArticulation.articulation,
                stemDown,
              });
              if (artGroup) {
                const artY = stemDown ? Math.min(...yPositions) : Math.max(...yPositions);
                artGroup.setAttribute('transform', `translate(0, ${artY})`);
                chordGroup.appendChild(artGroup);
              }
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

            // Fermata on rest
            if (element.articulation) {
              const artGroup = renderArticulations({
                articulation: element.articulation,
                stemDown: false,
                isRest: true,
              });
              if (artGroup) {
                artGroup.setAttribute('transform', `translate(${cursorX}, ${MIDDLE_LINE_Y})`);
                staffGroup.appendChild(artGroup);
              }
            }

            target.appendChild(restGroup);
            const info = getDurationInfo(element.length);
            cursorX += info.spacing;
            elementBeats = fractionToBeats(element.length);
            if (element.dotted) elementBeats *= 1.5;
          }
        } else {
          const noteY = pitchToStaffY(element.pitch, clef);

          // Grace notes (render before the main note)
          if (element.grace) {
            const graceResult = renderGraceNotes({
              grace: element.grace,
              mainX: cursorX,
              mainY: noteY,
              clef,
            });
            target.appendChild(graceResult.element);
          }

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

          // Articulations on note
          if (element.articulation) {
            const noteStemDown = beamStemDown !== undefined ? beamStemDown : noteY <= MIDDLE_LINE_Y;
            const artGroup = renderArticulations({
              articulation: element.articulation,
              stemDown: noteStemDown,
            });
            if (artGroup) noteGroup.appendChild(artGroup);
          }

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

          // Lyric tracking
          if (element.lyric !== undefined) {
            lyricData.push({ text: element.lyric, x: cursorX, noteIndex: i });
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

      // Slur rendering pass
      const slurPairs = resolveSlurs(voice.notes);
      if (slurPairs.length > 0) {
        const slursGroup = createGroup('slurs');
        for (const slurPair of slurPairs) {
          const startX = noteXPositions.get(slurPair.startIndex);
          const endX = noteXPositions.get(slurPair.stopIndex);
          if (startX === undefined || endX === undefined) continue;

          // Determine Y positions
          const startEl = voice.notes[slurPair.startIndex];
          const endEl = voice.notes[slurPair.stopIndex];
          const startPitch = Array.isArray(startEl) ? startEl[0].pitch : startEl.pitch;
          const endPitch = Array.isArray(endEl) ? endEl[0].pitch : endEl.pitch;
          const startNoteY = startPitch ? pitchToStaffY(startPitch, clef) : MIDDLE_LINE_Y;
          const endNoteY = endPitch ? pitchToStaffY(endPitch, clef) : MIDDLE_LINE_Y;

          // Determine direction based on stem directions of spanned notes
          let stemsDown = 0;
          let stemsUp = 0;
          for (let si = slurPair.startIndex; si <= slurPair.stopIndex; si += 1) {
            const el = voice.notes[si];
            if (!el || getMarkerType(el)) continue;
            const y = Array.isArray(el)
              ? pitchToStaffY(el[0].pitch, clef)
              : el.pitch
              ? pitchToStaffY(el.pitch, clef)
              : MIDDLE_LINE_Y;
            if (y <= MIDDLE_LINE_Y) stemsDown += 1;
            else stemsUp += 1;
          }
          // Slur curves away from stems (opposite side)
          const direction = stemsDown >= stemsUp ? 'above' : 'below';

          slursGroup.appendChild(
            createSlurArc({
              x1: startX,
              y1: startNoteY,
              x2: endX,
              y2: endNoteY,
              direction,
              depth: slurPair.depth,
            })
          );
        }
        staffGroup.appendChild(slursGroup);
      }

      // Dynamics rendering pass
      if (pendingDynamics.length > 0 || completedHairpins.length > 0) {
        const dynamicsGroup = createGroup('dynamics-layer');

        for (const pd of pendingDynamics) {
          if (pd.x !== undefined) {
            dynamicsGroup.appendChild(
              renderDynamic({ dynamic: pd.dynamic, x: pd.x, y: DYNAMICS_Y })
            );
          }
        }

        for (const hp of completedHairpins) {
          const startX = hp.startX !== undefined ? hp.startX : hp.endX;
          const endX = hp.endX !== undefined ? hp.endX : hp.startX;
          if (startX !== undefined && endX !== undefined) {
            dynamicsGroup.appendChild(
              renderHairpin({ type: hp.type, startX, endX, y: DYNAMICS_Y })
            );
          }
        }

        staffGroup.appendChild(dynamicsGroup);
      }

      // Ending (volta bracket) rendering pass
      // Close any open endings (last ending in group has no stop marker)
      for (const [number, data] of activeEndings) {
        endingData.push({
          number,
          startX: data.startX,
          endX: cursorX,
          isClosed: false,
        });
      }
      if (endingData.length > 0) {
        const endingsGroup = createGroup('endings-layer');
        for (const ed of endingData) {
          endingsGroup.appendChild(
            renderEnding({
              number: ed.number,
              startX: ed.startX,
              endX: ed.endX,
              open: !ed.isClosed,
            })
          );
        }
        staffGroup.appendChild(endingsGroup);
      }

      // Lyrics rendering pass
      if (lyricData.length > 0) {
        const lyricsGroup = createGroup('lyrics-layer');

        for (let li = 0; li < lyricData.length; li += 1) {
          const ld = lyricData[li];
          lyricsGroup.appendChild(renderLyric({ text: ld.text, x: ld.x }));

          // Detect melisma: if this lyric's note is followed by notes without lyrics
          // before the next note with a lyric (or end of piece)
          const nextLyricData = lyricData[li + 1];
          const nextLyricNoteIndex = nextLyricData ? nextLyricData.noteIndex : voice.notes.length;

          // Check if there are notes without lyrics between this note and the next lyric
          let melismaEndX = null;
          for (let mi = ld.noteIndex + 1; mi < nextLyricNoteIndex; mi += 1) {
            const mel = voice.notes[mi];
            if (mel && mel.pitch && mel.lyric === undefined) {
              const mx = noteXPositions.get(mi);
              if (mx !== undefined) melismaEndX = mx;
            }
          }

          if (melismaEndX !== null) {
            lyricsGroup.appendChild(renderMelisma({ startX: ld.x + 10, endX: melismaEndX }));
          }
        }

        staffGroup.appendChild(lyricsGroup);
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
