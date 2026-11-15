// The Remake's clock, a frame at a time (engines/scenes.js runs it sixty frames a second against the page's clock,
// on @moonbase-machines/mos6502/pace.js). Each frame owes the engine a sixtieth of a second of the original's time,
// at the page's pace: at 1 the original's, at a half twice as fast, at 0 none, when the game runs until it waits. The
// engine runs until it has run that time, its cycles and its disk's reads (Engine.run's 'frame'), or until the game
// waits for a key. A wait for a key is the player's time, which no frame owes: the next frame after the key runs a
// frame's worth from there. What the original took is heard only at pace 1.
//
// A game that goes on without waiting for keys, as Nature Park's truck, has each turn of its loop as a step `tick`,
// which takes the key pressed since the last turn (`keys.tapped`) or still held (`keys.held`), or none, as the
// Apple's keyboard told the game a key was down. The turns go on to the frame's end, each taking the time its own code
// takes; at pace 0, a turn a frame.
//
//   const c = clock(engine, { pace, goesOn })   `pace()`, the page's pace, read each frame; `goesOn`, a game that goes
//                                               on as it waits, as a Commodore 64's on its clock
//   c.frame()                                   a frame: { ran, heard }, whether the engine ran and whether what it
//                                               did is heard
//   c.waiting                                   whether the game waits for a key
//   c.keys                                      { held, tapped }, the turn's key
export const FRAME = 1000 / 60;
// the engine's stop: a run goes on until the original's time it has run is this far ahead (Engine.run)
const AHEAD = 16;

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

// Runs an engine until the game waits for a key or ends, off the clock, as a pilot, a replay or a route played
// first does.
export function toWait(engine) {
  const time = engine.clock instanceof Clock ? engine.clock : null, scale = time?.scale;
  if (time) time.scale = 0;
  let r;
  do { if (!time) engine.delay = 0; r = engine.run(); } while (r === 'frame');
  if (time) time.scale = scale;
  return r;
}

export function clock(engine, { pace = () => 1, goesOn = false } = {}) {
  const keys = { held: null, tapped: null };
  const ticking = () => engine.waitingOn?.words?.[0] === 'tick';
  const turn = () => { engine.press(keys.tapped ?? keys.held ?? -1); keys.tapped = null; };
  let waiting = false;
  // a game on its machine has a clock of its own; the script engine keeps the time it is ahead in its `delay`
  const time = engine.clock instanceof Clock ? engine.clock : null;
  return {
    keys, ticking,
    get waiting() { return waiting; },
    frame() {
      const p = pace();
      if (ticking() && !engine.keys.length) turn();
      if (waiting && !engine.keys.length) return { ran: false, heard: p === 1 };
      waiting = false;
      if (time) {
        time.scale = p; time.tick(FRAME);
        let r = 'frame';
        if (time.free || time.owed > 0) for (;;) {
          r = engine.run();
          if (r === 'idle' && ticking() && p && time.owed > 0) { turn(); continue; }
          break;
        }
        // (a wait is the player's time: the frame after the key owes a frame's worth, and no more)
        if (r === 'idle' && !goesOn && !ticking()) { waiting = true; time.owed = 0; }
        return { ran: true, heard: p === 1 };
      }
      engine.delay -= p ? FRAME / p : Infinity;
      let r = 'frame';
      if (engine.delay < AHEAD) for (;;) {
        r = engine.run();
        if (r === 'idle' && ticking() && p && engine.delay < AHEAD) { turn(); continue; }
        break;
      }
      // (at pace 0 nothing is owed after the frame, nor after a wait: the engine as far ahead as a run leaves it, so
      // that the next frame runs a frame's worth)
      if (!p) engine.delay = AHEAD;
      if (r === 'idle' && !goesOn && !ticking()) { waiting = true; engine.delay = AHEAD; }
      return { ran: true, heard: p === 1 };
    },
  };
}
