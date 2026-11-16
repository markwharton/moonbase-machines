// A title's game on its machine, as the engine the player drives. The machine runs the game's own code from its
// disk. The observer (observer.js) turns each call into the toolkit into an event, by the title's map. Nothing of the
// game is written again here: the registers, the memory, the stack and the time are the machine's own.
//
// It has the surface the page's runner, the views and the pilots drive:
//
//   const game = new Game(title, { clock })   title.disk the game's data, title.map its map, title.toolkit its
//                                             toolkit where it has one (observer.js), title.seed a route's seed;
//                                             the clock (clock.js), or none to run without one
//   game.run()          runs until the game waits for a key ('idle'), ends ('end'), or has run the time its clock
//                       owes it ('frame')
//   game.press(key)     a key, as a character code; -1 is none, for a turn that passes with no key
//   game.on(event => ...)              each event: a step of the transcript, or one of the view's own (`inside`)
//   game.onKey(key => ...)             each key as it goes to the game; returns a function that stops it
//   game.mem            the memory the game runs in
//   game.switches       the machine's soft switches, which say what screen it shows (`text`, `mixed`, `page2`)
//   game.steps          the title's steps, each by its name with its definition (observer.js `stepsOf`, events.js)
//   game.waitingOn      the step the game waits in, as { words: [its name] }, with `turn` true for a turn of the
//                       game's own loop; or null
//   game.cycles, game.clicks           the machine's time, and the cycle of each click of its speaker
//   game.took           each outermost step's event to the time its routine took, in milliseconds
//   game.untimed        the stretches of cycles that ran at warp, for the speaker to leave out
//   game.turning        whether the game is in a loop that takes a key each turn without waiting
//   game.turbo          whether the engine asks the title which steps warp at all: true unless it is set false, as the
//                       player's Speed setting sets it for Original
//   game.observer       the observer: its depth, the routine running, a key's time
//
// Time. The machine counts the game's time in cycles. The clock says how much of it the page owes, and the run
// spends that as the machine goes. While the clock warps the machine runs flat out and spends nothing. The engine asks
// the title whether a step warps (its title.js `warp(step, game)`), and asks about three kinds of step:
// - A routine of the map, and a stretch of the map's `view`, is asked about as the outermost one starts. Its answer
//   is the warp until it ends.
// - A read from the disk is a step named `disk`. At warp it arrives at once, and otherwise the page waits the time
//   the drive took.
// - The game's own code, which runs while no routine or stretch does, is a step named `game`. The engine asks about
//   it as each run starts and as each outermost step ends.
// The engine asks none of this while `game.turbo` is false: then nothing warps, and the game runs at the original's
// speed throughout.
// A title that warps the game's own code is still asked about each routine afresh, so a routine it does not warp keeps
// its time, a sound or a pause among them. A title with no `warp` plays at the original's speed throughout. The cycles
// that run at warp are untimed (`untimed`), and the speaker leaves them out.
//
// A game may pace itself by its drawing: a loop that draws two pictures in turn moves at the speed they are drawn. The
// title's map names such a stretch of the game's code as a step of the view's (its `view`, with `until`), and the title
// does not warp that step. While it runs nothing warps, so the stretch takes the original's time. This holds for a
// title with a toolkit and for one without (observer.js).
//
// A wait for a key is the player's time. A routine that the title's toolkit frees (its game's `frees`, below) runs flat
// out while it waits for a key, so that what it draws to ask is shown at once and its sound plays out while the player
// decides. When it returns, the time it took since its last key is owed: the game is going on, and that time is the
// game's. A title's own routine that waits keeps its time, as a loop of the game's own does: it may blink or draw
// between its reads of the keyboard.
import { Machine } from '@moonbase-machines/apple2e/machine.js';
import { observe, returnTo, stepsOf } from './observer.js';
import { Clock } from './clock.js';

// the Apple's clock, its cycles in a millisecond
const CYCLES_PER_MS = 1020.484;
// The polls of the keyboard with no key that make a wait, as the machine's own run counts them (machine.js `run`).
const IDLE = 2000;
// The most cycles a run goes on at warp before it stops for the page to draw.
const WARP = 4e6;

// What a game with no toolkit gets: it runs in main memory. A title's toolkit gives its own (its `game(game)`,
// observer.js). It gives `mem`, the memory the game runs in, and it may give `enter(event)` and `leave(event)`, called
// as each step starts and ends; `tap(name, c)`, the observer's `tap`; `frees(event)`, whether a routine runs flat out
// while it waits for a key; and `splash`, whether the game's loader waits for a key before the toolkit is in memory.
function plain(game) {
  return { mem: game.m.main };
}

export class Game {
  constructor(title, { clock = new Clock({ scale: 0 }) } = {}) {
    this.title = title; this.clock = clock;
    const m = this.m = new Machine(title.disk, { log: () => {} });
    // a read from the disk waits for the run to deliver it (below)
    m.diskTime = true;
    this.listeners = []; this.takers = []; this.keys = [];
    this.ended = false; this.timed = true; this.waitingOn = null;
    this.untimed = []; this.turning = false; this.framed = false; this.polled = null;
    // whether the title is asked which steps warp (the header's `game.turbo`)
    this.turbo = true;
    // the routine running that waits for a key, with the cycle of its start or of its last key
    this.waiter = null;
    // the view's step running that keeps its time: nothing inside it warps
    this.keeping = null;
    // the outermost step running, a routine of the map or a stretch of its `view`, or null while the game's own code
    // runs; and the cycle where the game's own code began to run at warp, or null
    this.outer = null; this.ownFrom = null;
    // the last key pressed; whether the game has given an event yet; and whether its loader's splash has been shown
    this.key = null; this.begun = false; this.splashed = false;
    this.took = new WeakMap();
    // the game's files, for what it saves and for a disk taken out of its drive
    title.files = m.disk;
    this.steps = stepsOf(title);
    // what the title's toolkit adds to the game, or the plain game's
    const kind = this.kind = (title.toolkit?.game ?? plain)(this);
    this.mem = kind.mem;
    // each step running: the cycle it started at, and whether the clock warped before it
    const starts = new WeakMap();
    this.observer = observe(m, title.map, {
      toolkit: title.toolkit, game: title.disk, seed: () => title.seed, view: true,
      emit: event => { this.begun = true; this.emit(event); },
      enter: (event, span) => {
        // The outermost step ends the game's own code, and the title is asked about it afresh: it does not warp with
        // the game's own code.
        const outer = this.outer === null;
        if (outer) { this.ownEnds(); this.outer = event; }
        const inherited = outer ? false : clock.warp;
        starts.set(event, { from: m.cpu.cycles, warp: inherited });
        // a routine that waits for a key ends the turns of a game's own loop
        if (this.steps[event.step]?.waits) this.turning = false;
        if (!this.waiter && kind.frees?.(event)) this.waiter = { event, from: m.cpu.cycles };
        // A step inside one that warps warps with it. A step of the view's own that does not warp keeps its time, and
        // so does every step inside it.
        const warps = this.warps(event);
        if (span && !warps && !inherited) this.keeping = event;
        clock.warp = inherited || warps && !this.keeping;
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
        if (this.keeping === event) this.keeping = null;
        // a turn has been taken: the game is in its own loop until it next waits for a key
        if (this.steps[event.step]?.turn) this.turning = true;
        kind.leave?.(event);
        // the outermost step is over: the game's own code goes on, and the title is asked about it again
        if (this.outer === event) { this.outer = null; this.own(); }
      },
      left: () => { this.turning = false; this.waiter = null; this.keeping = null; this.outer = null; this.own(); },
      tap: kind.tap,
    });
  }

  get switches() { return this.m.sw; }
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
  // whether a step runs at warp: the title says (its title.js `warp`), where it is asked at all (`turbo`)
  warps(step) { return this.turbo && !!this.title.warp?.(step, this); }
  // The game's own code: the code that runs while no step runs. The title says whether it warps, as a step named
  // `game`. While no step runs, the clock's warp is the title's answer. A stretch of it at warp is begun here.
  own() {
    if (this.outer) return;
    this.clock.warp = !this.keeping && this.warps({ step: 'game' });
    if (this.clock.warp) this.ownFrom ??= this.m.cpu.cycles;
  }
  // The game's own code at warp stops at a step's start, a wait, a frame's end and the run's end. The cycles it ran at
  // warp are untimed, so that the speaker leaves them out.
  ownEnds() {
    if (this.ownFrom !== null && this.m.cpu.cycles > this.ownFrom) this.untimed.push([this.ownFrom, this.m.cpu.cycles]);
    this.ownFrom = null;
  }

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
    // (the title asked about the game's own code, where no step runs: its answer may depend on the game)
    this.own();
    let warped = 0;
    const frame = () => { this.framed = true; this.ownEnds(); return 'frame'; };
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
    this.ownEnds();
    if (m.halted === 'quit') { this.ended = true; return 'end'; }
    if (m.halted) throw new Error('the game has stopped: ' + m.halted);
    return 'steps';
  }
  // The game waits for a key: at a turn of its own loop, in the routine running, in a loop of its own that polls the
  // keyboard, or, before any event, in its loader, with the splash on the screen. A wait in a loop of the game's own is
  // named read-key, and the loader's wait is named splash.
  waits() {
    const o = this.observer, splash = !this.begun && this.kind.splash;
    if (splash && !this.splashed) { this.splashed = true; this.emit({ step: 'splash', inside: true }); }
    // (a routine with no step of its own, one whose name starts with a dot, waits as a loop of the game's own does)
    const turn = o.ticking();
    const name = turn ?? (o.depth > 0 && o.running ? o.running : splash ? 'splash' : 'read-key');
    if (!turn) this.turning = false;
    // the polls that found the wait are no part of the game's sound, nor the game's own code at warp before them
    this.ownEnds();
    const from = o.since?.() ?? this.polled;
    if (from !== null) this.untimed.push([from, this.m.cpu.cycles]);
    this.waitingOn = turn ? { words: [name], turn: true } : { words: [name] };
    return 'idle';
  }
}
