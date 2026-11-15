// A title's game on its machine, as the engine the player drives. The machine runs the game's own code from its
// disk. The observer (observer.js) turns each call into the toolkit into an event, by the title's map. Nothing of the
// game is written again here: the registers, the memory, the stack and the time are the machine's own.
//
// It has the surface the page's runner, the views and the pilots drive:
//
//   const game = new Game(title)       title.disk the game's data, title.map its map, title.seed a route's seed
//   game.run()          runs until the game waits for a key ('idle') or ends ('end')
//   game.press(key)     a key, as a character code; -1 is none, for a turn that passes with no key
//   game.on(event => ...)              each event: a step of the transcript, or one of the view's own (`inside`)
//   game.onKey(key => ...)             each key as it goes to the game; returns a function that stops it
//   game.mem            the memory the game runs in
//   game.waitingOn      the step the game waits in, as { words: [its name] }, or null
//   game.cycles, game.clicks           the machine's time, and the cycle of each click of its speaker
//   game.took           each outermost step's event to the time its routine took, in milliseconds
//   game.observer       the observer: its depth, the routine running, a key's time
import { Machine } from '@moonbase-machines/apple2e/machine.js';
import { observe, returnTo } from './observer.js';

// the Apple's clock, its cycles in a millisecond
const CYCLES_PER_MS = 1020.484;
// The polls of the keyboard with no key that make a wait, as the machine's own run counts them (machine.js `run`).
const IDLE = 2000;

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
    const place = (mode, k) => mode === 0x80 ? ARROWS.indexOf(k) : mode >= 0xb1 && mode < 0xba ? k - 0x31 : (k & 0x5f) - 0x41;
    let asking = false;
    game.askMode = 0; game.asked = null;
    return {
      mem: m.aux,
      enter(event) { if (ASKS.has(event.step)) { asking = true; game.askMode = event.a; game.asked = null; } },
      leave() { asking = false; game.asked = null; },
      tap(name, c) { if (asking && name === 'key' && c.a !== 0x7f) game.asked = c.a === 0x0d ? { place: place(game.askMode, game.key) } : null; },
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
  constructor(title) {
    this.title = title;
    const m = this.m = new Machine(title.disk, { log: () => {} });
    this.listeners = []; this.takers = []; this.keys = [];
    this.ended = false; this.timed = true; this.waitingOn = null;
    // the last key pressed; whether the game has given an event yet; and whether its loader's splash has been shown
    this.key = null; this.begun = false; this.splashed = false;
    this.took = new WeakMap();
    // the game's files, for what it saves and for a disk taken out of its drive
    title.files = m.disk;
    const kind = this.kind = KINDS[title.engine](this);
    this.mem = kind.mem;
    let from = 0;
    this.observer = observe(m, title.map, {
      kind: title.engine, game: title.disk, seed: () => title.seed, view: true,
      emit: event => { this.begun = true; this.emit(event); },
      enter: event => { from = m.cpu.cycles; kind.enter?.(event); },
      leave: event => { this.took.set(event, (m.cpu.cycles - from) / CYCLES_PER_MS); kind.leave?.(event); },
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

  // Run the machine until the game waits for a key, or ends. The keys pressed since the last run go to the machine's
  // keyboard first. A routine that polls the keyboard while it is busy looks idle to the machine: the run goes on
  // through it, since a key pressed then would not be for the step that comes next (the observer's `waits`).
  run(limit = 2e8) {
    if (this.ended) return 'end';
    const m = this.m, o = this.observer;
    for (const k of this.keys.splice(0)) if (k >= 0) { m.press(k); this.key = k; for (const f of this.takers) f(k); }
    m.idle = 0; this.waitingOn = null;
    o.mark?.();
    // a read from the disk arrives at once
    if (m.reading) { m.reading.arrive(); m.reading = null; }
    for (let n = 0; n < limit && !m.halted; n++) {
      const pc = m.cpu.pc;
      if (pc >= 0xd000 && !m.sw.lcRead && !m.cpu.hooks.has(pc)) { m.halted = 'ROM $' + pc.toString(16); break; }
      m.cpu.step();
      if (m.idle > IDLE) {
        if (o.waits()) return this.waits();
        m.idle = 0;
      }
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
    this.waitingOn = { words: [o.depth > 0 ? o.running : splash ? 'splash' : 'read-key'] };
    return 'idle';
  }
}
