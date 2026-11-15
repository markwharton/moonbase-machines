// The Commodore 64's KERNAL as steps: its jump table by address, as a title's map names the routines it calls, and
// what each routine takes and gives as a step. kernal.js answers each routine in JavaScript. The player's
// remake/events.js says what each field of a definition means.

// The jump table at $FFxx, each entry by the name of its step: the routines a game calls through it. A title that
// calls more names them in its own map, beside these. UDTIM ($FFEA) is not here: only an interrupt routine calls it,
// and the calls an interrupt makes are no steps.
export const KERNAL = {
  0xffd2: 'chrout', 0xffe4: 'getin', 0xfff0: 'plot', 0xffcc: 'clrchn', 0xffe1: 'stop', 0xffb7: 'readst',
  0xffba: 'setlfs', 0xffbd: 'setnam', 0xffd5: 'load', 0xffd8: 'save',
  0xffb1: 'listen', 0xff93: 'second', 0xffa8: 'ciout', 0xffae: 'unlsn', 0xffb4: 'talk', 0xff96: 'tksa', 0xffa5: 'acptr', 0xffab: 'untlk',
  0xffdb: 'settim', 0xffde: 'rdtim', 0xff90: 'setmsg',
};

// Each step's definition. CLRCHN, STOP, OPEN, UNLSN, UNTLK, SETTIM and RDTIM are steps with no registers, and have
// none.
export const STEPS = {
  // CHROUT, a character out, in A; GETIN, a key, given in A, 0 for none; CHRIN, a character in, given in A
  chrout: { takes: 'a' },
  getin: { gives: 'a' },
  chrin: { gives: 'a' },
  // PLOT, the cursor's row and column in X and Y, set with the carry clear
  plot: { takes: 'xyc' },
  // READST, the status, given in A
  readst: { gives: 'a' },
  // a file: SETLFS its number, device and secondary address in A, X and Y; SETNAM its name's length in A and its
  // place in X and Y; CLOSE the file in A; CHKIN and CHKOUT the file in X
  setlfs: { takes: 'axy' },
  setnam: { takes: 'axy' },
  close: { takes: 'a' },
  chkin: { takes: 'x' },
  chkout: { takes: 'x' },
  // LOAD, A 0 to load and 1 to verify, X and Y where to; it gives the carry set for an error, and X and Y the end
  load: { takes: 'axy', gives: 'cxy' },
  // SAVE, A the zero page address of the start, X and Y the end
  save: { takes: 'axy' },
  // the serial bus: LISTEN and TALK, the device in A; SECOND and TKSA, the secondary address in A; CIOUT, a byte out
  // in A; and ACPTR, a byte in, given in A
  listen: { takes: 'a' },
  talk: { takes: 'a' },
  second: { takes: 'a' },
  tksa: { takes: 'a' },
  ciout: { takes: 'a' },
  acptr: { gives: 'a' },
  // SETMSG, which messages the KERNAL prints, in A
  setmsg: { takes: 'a' },
};
