import { deserializePuzzle } from 'editor/model/serialization';
import { validatePuzzle } from 'editor/model/PuzzleValidator';

export function importPuzzle(json) {
  const model = deserializePuzzle(json);
  const { errors, warnings } = validatePuzzle(model);
  return { model, errors, warnings };
}
