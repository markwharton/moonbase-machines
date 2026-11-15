// A title's game on its machine, as the engine the player drives. The machine runs the game's own code from its
// disk. The observer (observer.js) turns each call into the toolkit into an event, by the title's map. Nothing of the
// game is written again here: the registers, the memory, the stack and the time are the machine's own.
//
// It has the surface the page's runner, the views and the pilots drive:
//
//   const game = new Game(title, { clock })   title.disk the game's data, title.map its map, title.seed a route's
//                                             seed; the clock (clock.js), or none to run without one
//   game.run()          runs until the game waits for a key ('idle'), ends ('end'), or has run the time its clock
//                       owes it ('frame')
//   game.press(key)     a key, as a character code; -1 is none, for a turn that passes with no key
//   game.on(event => ...)              each event: a step of the transcript, or one of the view's own (`inside`)
//   game.onKey(key => ...)             each key as it goes to the game; returns a function that stops it
//   game.mem            the memory the game runs in
//   game.waitingOn      the step the game waits in, as { words: [its name] }, or null
//   game.cycles, game.clicks           the machine's time, and the cycle of each click of its speaker
//   game.took           each outermost step's event to the time its routine took, in milliseconds
//   game.untimed        the stretches of cycles that ran at warp, for the speaker to leave out
//   game.turning        whether the game is in a loop that takes a key each turn without waiting
//   game.observer       the observer: its depth, the routine running, a key's time
//
// Time. The machine counts the game's time in cycles. The clock says how much of it the page owes, and the run
// spends that as the machine goes. While the clock warps the machine runs flat out and spends nothing. The engine sets
// the warp as the outermost routine starts, by asking the title (its title.js `warp(step, game)`), and clears it as
// the routine ends. A title with no `warp` plays at the original's speed throughout. A read from the disk is a step
// named `disk`: at warp it arrives at once, and otherwise the page waits the time the drive took.
//
// A wait for a key is the player's time. A routine of the toolkit's that waits for a key runs flat out, so that what it
// draws to ask is shown at once and its sound plays out while the player decides. When it returns, the time it took
// since its last key is owed: the game is going on, and that time is the game's. A title's own routine that waits
// keeps its time, as a loop of the game's own does: it may blink or draw between its reads of the keyboard.
import { Machine } from '@moonbase-machines/apple2e/machine.js';
import { observe, returnTo } from './observer.js';
import { Clock } from './clock.js';
import { WAITS } from './events.js';

// the Apple's clock, its cycles in a millisecond
const CYCLES_PER_MS = 1020.484;
// The polls of the keyboard with no key that make a wait, as the machine's own run counts them (machine.js `run`).
const IDLE = 2000;
// The most cycles a run goes on at warp before it stops for the page to draw.
const WARP = 4e6;

// What each kind of title adds, by its title.js `engine`: the memory the game runs in, and what its view reads of
// the game beside the events.
const KINDS = {
  // A vector title runs in auxiliary memory, with the language card's second bank at $D000. The card's banks are
  // placed in the top of the auxiliary 64K, so that one array holds everything the game reads and writes.
  vector(game) {
    const m = game.m;
    m.lc.aux[1] = m.aux.subarray(0xd000, 0xe000); m.lc.aux[2] = m.aux.subarray(0xe000);
    // The ask ($641B in one title) takes a key, then waits for RETURN to confirm it or DELETE to take it back. The
    // view shows which: `askMode` is the ask's mode, its A as it starts, and `asked` the place of the key chosen, or
    // null while none is. The ask draws the caps of the keys it wants itself. It draws RETURN's cap only once a key is
    // chosen, so its own call to the key routine says a choice has been made. The key is the last one pressed.
    const ASKS = new Set(['ask', 'ask-mode', 'ask-escape']), ARROWS = [8, 21, 10, 11];
    // the title's own routines, by name: those of its problems
    const own = new Set(Object.values(game.title.map.problems ?? {}).flatMap(r => Object.values(r)).map(full => full.split(' ')[0]));
    const place = (mode, k) => mode === 0x80 ? ARROWS.indexOf(k) : mode >= 0xb1 && mode < 0xba ? k - 0x31 : (k & 0x5f) - 0x41;
    // the ask running, by its event
    let asking = null;
    game.askMode = 0; game.asked = null;
    return {
      mem: m.aux,
      enter(event) { if (ASKS.has(event.step)) { asking = event; game.askMode = event.a; game.asked = null; } },
      leave(event) { if (event === asking) { asking = null; game.asked = null; } },
      tap(name, c) { if (asking && name === 'key' && c.a !== 0x7f) game.asked = c.a === 0x0d ? { place: place(game.askMode, game.key) } : null; },
      // The toolkit's routines that wait for a key run flat out (above). A turn of the game's loop is no wait.
      frees: event => WAITS.has(event.step) && event.step !== 'tick' && !own.has(event.step),
      // Before the toolkit is in memory the game's loader waits for a key, with its splash on the screen.
      splash: !!game.title.map.splash,
    };
  },
  // A card title runs in main memory. Its view paints the page the soft switches show.
  card(game) {
    game.title.screen = game.m.sw;
    return { mem: game.m.main };
  },
};

export class Game {
  constructor(title, { clock = new Clock({ scale: 0 }) } = {}) {
    this.title = title; this.clock = clock;
    const m = this.m = new Machine(title.disk, { log: () => {} });
    // a read from the disk waits for the run to deliver it (below)
    m.diskTime = true;
    this.listeners = []; this.takers = []; this.keys = [];
    this.ended = false; this.timed = true; this.waitingOn = null;
    this.untimed = []; this.turning = false; this.framed = false; this.polled = null;
    // the routine running that waits for a key, with the cycle of its start or of its last key
    this.waiter = null;
    // the last key pressed; whether the game has given an event yet; and whether its loader's splash has been shown
    this.key = null; this.begun = false; this.splashed = false;
    this.took = new WeakMap();
    // the game's files, for what it saves and for a disk taken out of its drive
    title.files = m.disk;
    const kind = this.kind = KINDS[title.engine](this);
    this.mem = kind.mem;
    // each step running: the cycle it started at, and whether the clock warped before it
    const starts = new WeakMap();
    this.observer = observe(m, title.map, {
      kind: title.engine, game: title.disk, seed: () => title.seed, view: true,
      emit: event => { this.begun = true; this.emit(event); },
      enter: event => {
        starts.set(event, { from: m.cpu.cycles, warp: clock.warp });
        // a routine that waits for a key ends the turns of a game's own loop
        if (WAITS.has(event.step) && event.step !== 'tick') this.turning = false;
        if (!this.waiter && kind.frees?.(event)) this.waiter = { event, from: m.cpu.cycles };
        // a step inside one that warps warps with it
        clock.warp = clock.warp || this.warps(event);
        kind.enter?.(event);
      },
      leave: event => {
        const { from, warp } = starts.get(event);
        this.took.set(event, (m.cpu.cycles - from) / CYCLES_PER_MS);
        // the stretch that ran at warp is over when the step that began it ends
        if (clock.warp && !warp) this.untimed.push([from, m.cpu.cycles]);
        clock.warp = warp;
        // a routine that waited returns: the time since its last key is owed
        if (this.waiter?.event === event) {
          if (!clock.free) clock.owed -= (m.cpu.cycles - this.waiter.from) / CYCLES_PER_MS;
          this.waiter = null;
        }
        // a turn has been taken: the game is in its own loop until it next waits for a key
        if (event.step === 'tick') this.turning = true;
        kind.leave?.(event);
      },
      left: () => { this.turning = false; this.waiter = null; clock.warp = false; },
      tap: kind.tap,
    });
  }

  get cycles() { return this.m.cpu.cycles; }
  get clicks() { return this.m.clicks; }
  get idle() { return this.m.idle; }
  // where the game is, for a tool to say which call gave an event: the address the processor is at, and the address
  // the routine running returns to
  get where() { const c = this.m.cpu, hex = a => '$' + a.toString(16).toUpperCase().padStart(4, '0'); return hex(c.pc) + ' < ' + hex(returnTo(c)); }

  on(f) { this.listeners.push(f); }
  emit(event) { for (const f of this.listeners) f(event); }
  onKey(f) { this.takers.push(f); return () => { this.takers = this.takers.filter(g => g !== f); }; }
  press(key) { this.keys.push(key); }
  // whether a step runs at warp: the title says (its title.js `warp`)
  warps(step) { return !!this.title.warp?.(step, this); }

  // Run the machine until the game waits for a key, or ends. The keys pressed since the last run go to the machine's
  // keyboard first. A routine that polls the keyboard while it is busy looks idle to the machine: the run goes on
  // through it, since a key pressed then would not be for the step that comes next (the observer's `waits`).
  run(limit = 2e8) {
    if (this.ended) return 'end';
    const m = this.m, o = this.observer, clock = this.clock;
    for (const k of this.keys.splice(0)) if (k >= 0) {
      m.press(k); this.key = k;
      if (this.waiter) this.waiter.from = m.cpu.cycles;
      for (const f of this.takers) f(k);
    }
    // (a run that goes on from a frame's stop goes on counting the polls with no key, as the machine's one run would)
    if (!this.framed) { m.idle = 0; this.polled = null; o.mark?.(); }
    this.framed = false; this.waitingOn = null;
    let warped = 0;
    const frame = () => { this.framed = true; return 'frame'; };
    for (let n = 0; n < limit && !m.halted; n++) {
      // A read from the disk still to come. At warp it arrives at once. Otherwise the machine stands still while the
      // page waits the time the drive took, which the clock owes like any other.
      if (m.reading) {
        const r = m.reading;
        if (!clock.free && !this.warps({ step: 'disk' })) {
          r.ms ??= Math.max(0, r.at - m.cpu.cycles) / CYCLES_PER_MS;
          const spent = Math.min(r.ms, Math.max(0, clock.owed));
          r.ms -= spent; clock.owed -= spent;
          if (r.ms > 0) return frame();
        }
        m.reading = null; r.arrive();
      }
      const pc = m.cpu.pc;
      if (pc >= 0xd000 && !m.sw.lcRead && !m.cpu.hooks.has(pc)) { m.halted = 'ROM $' + pc.toString(16); break; }
      // (the time the instruction took is the counter's change: a ROM routine answered by a hook counts its own time)
      const before = m.cpu.cycles;
      m.cpu.step();
      const cycles = m.cpu.cycles - before;
      // `polled` is the cycle of the first poll of the keyboard that found no key, while the polls go on.
      if (!m.idle) this.polled = null; else this.polled ??= m.cpu.cycles;
      if (m.idle > IDLE) {
        if (o.waits()) return this.waits();
        m.idle = 0;
      }
      // A routine that waits for a key is owed nothing while it runs. A loop of the game's own that polls the
      // keyboard keeps its time, since it may be drawing between its polls.
      const held = this.waiter !== null;
      if (clock.free || held) { if (clock.scale && (warped += cycles) > WARP) return frame(); }
      else if ((clock.owed -= cycles / CYCLES_PER_MS) <= 0) return frame();
    }
    if (m.halted === 'quit') { this.ended = true; return 'end'; }
    if (m.halted) throw new Error('the game has stopped: ' + m.halted);
    return 'steps';
  }
  // The game waits for a key: in the routine running, in a loop of its own that polls the keyboard, or, before any
  // event, in its loader, with the splash on the screen.
  waits() {
    const o = this.observer, splash = !this.begun && this.kind.splash;
    if (splash && !this.splashed) { this.splashed = true; this.emit({ step: 'splash', inside: true }); }
    // (a routine with no step of its own, one whose name starts with a dot, waits as a loop of the game's own does)
    const name = o.ticking() ? 'tick' : o.depth > 0 && o.running ? o.running : splash ? 'splash' : 'read-key';
    if (name !== 'tick') this.turning = false;
    // the polls that found the wait are no part of the game's sound
    const from = o.since?.() ?? this.polled;
    if (from !== null) this.untimed.push([from, this.m.cpu.cycles]);
    this.waitingOn = { words: [name] };
    return 'idle';
  }
}
