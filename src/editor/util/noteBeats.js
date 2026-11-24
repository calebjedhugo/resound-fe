/**
 * A note's length in quarter-note beats ('1/4' -> 1, '1/8' -> 0.5; a dotted
 * note half as long again, a double-dotted one three quarters). An
 * unreadable length counts as one beat. The game's one copy of the
 * arithmetic lives in core/noteBeats.
 * @param {{length?: string, dotted?: boolean|number}} note
 * @returns {number}
 */
import noteBeats from 'core/noteBeats';

export default noteBeats;
