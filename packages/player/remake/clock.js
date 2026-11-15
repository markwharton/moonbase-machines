// The Remake's clock. The page runs it sixty frames a second against its own clock (engines/scenes.js, on
// @moonbase-machines/mos6502/pace.js), and each frame ticks the game's clock (`Clock`, below) by a sixtieth of a
// second. The game runs on its machine until it has run the time its clock owes it, or until it waits for a key
// (game.js). The page's pace is the clock's scale: at 1 the game runs at the original's speed, at a half twice as
// fast, and at 0 it runs until it waits. A wait for a key is the player's time, which no frame owes: the frame after
// the key owes a frame's worth from there. What the game did is heard only at pace 1.
//
// A game that goes on without waiting for keys has each turn of its loop as a step, and waits at each turn
// (game.js `waitingOn`, with `turn`). A turn takes the key pressed since the last turn (`keys.tapped`) or the key still
// held (`keys.held`), or none, as the Apple's keyboard told the game a key was down. The turns go on to the frame's
// end, each taking the time its own code takes. At pace 0 there is one turn a frame.
//
//   const c = clock(engine, { pace })   `engine` the game (game.js); `pace()` the page's pace, read each frame
//   c.frame()                           a frame: { ran, heard }, whether the game ran and whether what it did is heard
//   c.waiting                           whether the game waits for a key
//   c.keys                              { held, tapped }, the turn's key
//   toWait(engine)                      runs the game until it waits for a key or ends, with nothing held back
export const FRAME = 1000 / 60;

// The clock a game on its machine is given (game.js). It is plain: it ticks, and it can warp. It holds no rule of
// when to do either. The page ticks it once a frame, and the engine sets its warp as a routine starts and ends.
//
//   clock.tick(ms)   a frame of the page's time has passed: the machine is owed that much of its own time
//   clock.owed       the machine's time still to run, in milliseconds; the engine spends it as the machine runs
//   clock.warp       while true the machine runs flat out: it spends none of the time owed, and is not heard
//   clock.scale      the page's pace: 1 the original's speed, a half twice as fast, 0 the machine never held back
//
// A tick never leaves more than two frames owed, so a long warp is not followed by a rush to catch up.
export class Clock {
  constructor({ scale = 1 } = {}) { this.owed = 0; this.warp = false; this.scale = scale; }
  tick(ms) { if (this.scale) this.owed = Math.min(this.owed + ms / this.scale, 2 * ms / this.scale); }
  // whether the machine runs without spending the time owed
  get free() { return this.warp || !this.scale; }
}

// Runs a game until it waits for a key or ends, off the clock, as a pilot, a replay or a route played first does. The
// clock's scale is 0 while it runs, and is put back after.
export function toWait(engine) {
  const time = engine.clock, scale = time.scale;
  time.scale = 0;
  let r;
  do r = engine.run(); while (r === 'frame');
  time.scale = scale;
  return r;
}

export function clock(engine, { pace = () => 1 } = {}) {
  const keys = { held: null, tapped: null };
  const ticking = () => !!engine.waitingOn?.turn;
  const turn = () => { engine.press(keys.tapped ?? keys.held ?? -1); keys.tapped = null; };
  const time = engine.clock;
  let waiting = false;
  return {
    keys, ticking,
    get waiting() { return waiting; },
    frame() {
      const p = pace();
      if (ticking() && !engine.keys.length) turn();
      if (waiting && !engine.keys.length) return { ran: false, heard: p === 1 };
      waiting = false;
      time.scale = p; time.tick(FRAME);
      let r = 'frame';
      if (time.free || time.owed > 0) for (;;) {
        r = engine.run();
        if (r === 'idle' && ticking() && p && time.owed > 0) { turn(); continue; }
        break;
      }
      // (a wait is the player's time: the frame after the key owes a frame's worth, and no more)
      if (r === 'idle' && !ticking()) { waiting = true; time.owed = 0; }
      return { ran: true, heard: p === 1 };
    },
  };
}
