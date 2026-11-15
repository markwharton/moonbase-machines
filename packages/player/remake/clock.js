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

export function clock(engine, { pace = () => 1, goesOn = false } = {}) {
  const keys = { held: null, tapped: null };
  const ticking = () => engine.waitingOn?.words?.[0] === 'tick';
  const turn = () => { engine.press(keys.tapped ?? keys.held ?? -1); keys.tapped = null; };
  let waiting = false;
  return {
    keys, ticking,
    get waiting() { return waiting; },
    frame() {
      const p = pace();
      if (ticking() && !engine.keys.length) turn();
      if (waiting && !engine.keys.length) return { ran: false, heard: p === 1 };
      waiting = false;
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
