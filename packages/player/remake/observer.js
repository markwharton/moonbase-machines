// A game, observed. The game runs on its machine, and each call it makes into a routine of its map becomes an event,
// as the routine's step is defined (events.js `describe`). A routine's result becomes an event at its return
// (`result`). Two runs are the same when their events are. The observer is given the machine, the title's map and the
// game's data. It reads no files, so it runs in a page as well as in the pilots. It reads what part a routine plays
// from its step's definition, and knows no step by its name.
//
//   const o = observe(m, map, { toolkit, game, seed, mine, started, emit, view, enter, leave, tap })
//     toolkit    the title's toolkit, where it has one (its title.js `toolkit`, below), whose rules follow the game;
//                a title with none has the plain rules (below)
//     game       the game's data, for the routines that are there only while their file is in memory
//     seed       the random seed, or a function that gives it; the rules say where it goes. With none, the game's
//                random numbers are its own
//     mine       c => whether the call being made is the game's own; every call is, if not given
//     started    () => whether the game has started; it has from the first, if not given
//     emit       event => {}, given each event in order
//     view       true to be given the view's own events too, each marked `inside`: they are no steps of the
//                transcript, and a view draws them. They are the steps the map's `view` names (below), and the calls
//                the rules give the view
//     enter      (event, span) => {}, given a routine's event as it starts: the outermost routine's, and with `view`
//                each routine given to the view inside it, and a view's step that runs for a while. `span` is true
//                for the last: a stretch of the game's own code that the map names as one step
//     leave      event => {}, given the same event as the routine or the step ends
//     left       () => {}, called when the game leaves every routine without returning
//     tap        (name, c) => {}, given every call of the game's own into a routine of the map, however deep
//   o.depth      how deep the game is in the toolkit's routines
//   o.running    the outermost routine running, or null
//   o.waits()    with the machine idle, whether the game waits for a key; if not, it is busy and the run goes on
//   o.ticking()  the step of the turn of the game's own loop that the run has stopped for, to be given a key or none;
//                null while it has not
//   o.mark(), o.time(), o.since(), o.problem(n)
//                what a toolkit's rules give beside these, passed on as they give them, or undefined: a run's start,
//                a key's time in cycles, the cycle at which the routine running began to wait for a key, and whether
//                problem n is in memory
//
// A toolkit is what a title's title.js names as its `toolkit`: an object of these parts, each of them optional.
//   steps              its steps' definitions, by the names a title's map gives its routines (`stepsOf`)
//   rules(core)        how to follow a game built on it: when it is in memory, which calls are the game's, and when the
//                      game waits. Given the core (below), it gives `routines`, `call`, `ended`, `waits` and
//                      `ticking`, as the plain rules do (`plain`), and may give `left` and more, as `time`
//   game(game)         the memory the game runs in, and what it adds to the game (game.js)
//   view(svg, options) its view; `text`, true when that view draws the words itself (../engines/scenes.js)
//   overlay(m, layer)  its drawing over the machine's own screen, on the Original (../engines/original.js)
//
// The core is where a toolkit's rules plug in. It is the observer's own state, what it does and its helpers, so that a
// toolkit needs nothing of the player's. The rules may change its depth, running, event and era.
//   m, map, game, mine, started, emit, options    the machine, the title's map, the game's data, and the observer's
//                                                 options (above); the rules call `options.enter` and `options.leave`
//   view, tap, step(name), seed()                 whether the view's events are wanted, the tap, a routine's step as
//                                                 it is defined, and the seed
//   depth, running, event, era                    how deep the game is in the toolkit's routines, the outermost routine
//                                                 running and its event, and the era, which leaving every routine ends
//   returned(at, f), inside(), begin(name, event), end(), returns(), leaveAll()
//                                                 a hook for a routine's return; whether a routine runs; the outermost
//                                                 routine starts, ends and returns; the game leaves every routine
//   chain, once, returnTo, called, keyed          the helpers below
//   describe, result                              a call's event and a result's (events.js)
//
// The map's `view` names places in the game's code that are steps of the view's, by the file the code is in. Such a
// place changes the screen with no routine of the map called, as a part's own code scrolls a picture. Each is an
// event for the view when the game reaches it while its file is in memory. An entry is a step's name, or an event's
// fields. A step that runs for a while gives `until`, the address where it is done. It is one event, however many
// times its code passes its own address, and `enter` and `leave` are given it as it starts and ends. The file is in
// the map's `volume`, or else in the first volume that has it, and it is in memory where the map's `loads` says, or
// else where the disk's catalog loads it. The observer follows these places for every title, on any rules.
//
// A hook is a function the processor runs when it reaches an address (`m.cpu.hooks`). It returns false to let the
// code there run, 'wait' to be run again at the next step, and anything else to return as RTS does.
import { STEPS as APPLE } from '@moonbase-machines/apple2e/steps.js';
import { describe, result } from './events.js';

// A title's steps, each by its name with its definition (events.js): its machine's, the Apple's ROM's and ProDOS's;
// its toolkit's over them; and its map's own over those.
export const stepsOf = title => ({ ...APPLE, ...title.toolkit?.steps, ...title.map.steps });
const NONE = {};

// Where a subroutine returns to, as RTS takes it from the stack.
export const returnTo = c => ((c.read(0x100 + ((c.sp + 1) & 0xff)) | c.read(0x100 + ((c.sp + 2) & 0xff)) << 8) + 1) & 0xffff;

// Sets a hook at `at` that keeps the hook already there. The earlier hook runs after `f` when `f` returns false and
// has left the processor where it was.
export function chain(m, at, f) {
  const own = m.cpu.hooks.get(at);
  m.cpu.hooks.set(at, c => { const pc = c.pc, r = f(c); return r === false && own && c.pc === pc ? own(c) : r; });
}

// Sets a hook at `at` that runs `f` once. It then puts back the hook that was there before, and runs it.
export function once(m, at, f) {
  const before = m.cpu.hooks.get(at);
  m.cpu.hooks.set(at, c => {
    if (before) m.cpu.hooks.set(at, before); else m.cpu.hooks.delete(at);
    f(c);
    return before ? before(c) : false;
  });
}

const bytes = data => Uint8Array.from(atob(data), ch => ch.charCodeAt(0));

export function observe(m, map, options) {
  const { toolkit, game, mine = () => true, started = () => true, emit = () => {} } = options;
  const steps = stepsOf({ toolkit, map });
  // the core (above)
  const s = {
    m, map, game, mine, started, emit, options, view: !!options.view, tap: options.tap ?? (() => {}),
    chain, once, returnTo, called, keyed, describe, result,
    // A routine's step as it is defined, or with nothing defined.
    step: name => steps[name] ?? NONE,
    // The seed, read when it is wanted: a page may be given a route's seed after the game has started.
    seed: () => typeof options.seed === 'function' ? options.seed() : options.seed,
    // How deep the game is in the toolkit's routines, the outermost routine running, and the event of its call.
    depth: 0, running: null, event: null,
    // A jump that leaves every routine without its return starts a new era.
    era: 0, eras: 0,
  };

  // A hook for one routine's return. It does nothing if the era has changed since the call, or once the function it
  // gives back has been called.
  s.returned = (at, f) => {
    const when = s.era;
    let dropped = false;
    once(m, at, c => { if (when === s.era && !dropped) f(c); });
    return () => { dropped = true; };
  };

  // (a) A routine called while another runs is part of the routine running. It makes no event of its own.
  s.inside = () => s.depth > 0;

  // (b) The outermost routine starts at a call made while no routine runs. It ends at its return, or when the game
  // leaves it without returning.
  s.begin = (name, event) => { s.running = name; s.event = event; options.enter?.(event); };
  s.end = () => {
    const event = s.event;
    s.running = null; s.event = null;
    rules.ended();
    if (event) options.leave?.(event);
  };
  // A routine returns, and the game is one routine less deep.
  s.returns = () => { if (--s.depth === 0) s.end(); };
  // The game leaves every routine without returning, as a jump to the Main Menu does. A step of the view's that is
  // still running is over then.
  s.leaveAll = () => { s.depth = 0; s.end(); s.era = ++s.eras; spans.end(); rules.left?.(); options.left?.(); };

  // The map's own steps of the view's (above), then the toolkit's rules, or the plain rules for a title with no toolkit.
  const spans = viewSteps(s);
  const rules = (toolkit?.rules ?? plain)(s);
  // A hook at each routine of the map. A call is the game's own when the routine is in memory and `mine` says so.
  for (const { at, full, present } of rules.routines) {
    const [name, ...fixed] = full.split(' ');
    chain(m, at, c => { rules.call(c, name, fixed, present(at) && mine(c)); return false; });
  }
  return {
    get depth() { return s.depth; },
    get running() { return s.running; },
    waits: rules.waits, ticking: rules.ticking, mark: rules.mark, time: rules.time, since: rules.since, problem: rules.problem,
  };
}

// The map's steps of the view's (above), each hooked at its place in the game's code, with the view's events wanted.
// `end()` ends every one still running.
function viewSteps(s) {
  const { m, map, game, started, chain } = s;
  const running = new Set();
  for (const [name, steps] of s.view ? Object.entries(map.view ?? {}) : []) {
    const file = (map.volume ? game.volumes[map.volume] : Object.values(game.volumes).find(v => v[name]))[name];
    const from = map.loads?.[name] ?? map.loads?.[name.replace(/\d$/, '')] ?? file.aux, head = bytes(file.data).subarray(0, 16);
    const there = () => started() && head.every((v, i) => m.read(from + i) === v);
    for (const [at, step] of Object.entries(steps)) {
      const { until, ...event } = typeof step === 'string' ? { step } : step;
      let given = null;
      const done = () => { if (!given) return; const e = given; given = null; running.delete(done); s.options.leave?.(e); };
      chain(m, +at, () => {
        if (!there() || given) return false;
        const e = { ...event, inside: true };
        s.emit(e);
        if (until !== undefined) { given = e; running.add(done); s.options.enter?.(e, true); }
        return false;
      });
      if (until !== undefined) chain(m, until, () => { done(); return false; });
    }
  }
  return { end: () => { for (const done of [...running]) done(); } };
}

// A call's event, as its step is defined, with the data the routine takes inline after its call, and the address it
// returns to past that data.
function called(c, name, step, fixed, regs, zero) {
  const after = returnTo(c), data = step.inline ? step.inline(a => c.read(a), after) : null;
  return { event: describe(name, step, fixed, regs, data?.value, zero, a => c.read(a)), after, back: after + (data ? data.length : 0), inline: !!step.inline };
}
// Whether a routine that polls for a key gave one as it returned: a key in A, with the carry set for one that says so.
const keyed = (step, r) => r.a && (!step.carry || r.c);

// The Monitor's RDKEY, KEYIN and RDCHAR. The machine stays at one of them while it waits for a key.
const RDKEY = new Set([0xfd0c, 0xfd1b, 0xfd35]);
// Whether the machine is in the IIe's own ROM, which waits for a key in its keyboard routine at $C2DE.
const inRom = m => m.rom && m.cpu.pc >= 0xc100 && (m.cpu.pc < 0xd000 || !m.sw.lcRead);

// The plain rules, for a title with no toolkit of its own: each routine of the title's map is a step, and the view
// shows the machine's screen.
function plain(s) {
  const { m, map, game, started, emit } = s;
  // The key reader counts how long it waits for a key, at the map's `seed`, and the random routine can take its seed
  // from that count. The count depends on how long the machine ran, so the seed is written there as the routine that
  // takes the seed (`seed`) is called and as it returns.
  const fix = () => { const seed = s.seed(); if (map.seed === undefined || seed === undefined) return; m.write(map.seed, seed & 0xff); m.write(map.seed + 1, seed >> 8); };

  // A turn of a scene's own loop (the map's `ticks`) stops the loop before it reads the keyboard, for the pilot to give
  // it a key or none. It is an event, the step the map names, and it stops only while its scene is in memory where it
  // loads (the tick's `loads`). When the run goes on, the read goes on. `ticking` is the step of the turn stopped at,
  // or null.
  let ticking = null;
  for (const t of map.ticks ?? []) {
    const head = bytes(Object.values(game.volumes).map(v => v[t.scene]).find(Boolean).data).subarray(0, 16);
    chain(m, t.at, () => {
      if (!started()) return false;
      if (ticking) ticking = null;
      else if (head.every((v, i) => m.read(t.loads + i) === v)) { emit({ step: t.step }); m.idle = Infinity; ticking = t.step; return 'wait'; }
      return false;
    });
  }
  // A stir is a loop that counts while it waits (the map's `stir`). The calls it makes are no events, and as it ends
  // the seed is written into its counts.
  const stir = map.stir;
  if (stir) chain(m, stir.done, () => { const seed = s.seed(); if (started() && seed !== undefined) for (const a of stir.counts) m.write(a, seed & 0xff); return false; });
  const stirring = c => stir && returnTo(c) > stir.from && returnTo(c) <= stir.to + 1;

  // The routine running ends without its return when the game drops that return from the stack and goes on
  // elsewhere, as DOS 3.3's error exit does from a command printed through COUT. The next call made at the routine's
  // own level of the stack, or above it, shows this: the return is no longer where the call left it. A jump into
  // another routine keeps the return there. A call made again from just before the first, as a disk error screen
  // makes to try again, is still inside. A routine that takes data inline pulls its return to read it, so it is not
  // watched this way. `left` holds the stack pointer after the call, the address the call pushed, and the function
  // that drops the hook for its return.
  let left = null;
  const gone = c => {
    const kept = c.read(0x100 | left.sp + 1 & 0xff) | c.read(0x100 | left.sp + 2 & 0xff) << 8;
    return c.sp >= left.sp && kept !== left.ret && !(kept <= left.ret && left.ret - kept <= 0x20);
  };

  // A routine at $D000 or above is the ROM's. While the language card is read, other code is at that address.
  const routines = Object.entries(map.routines).map(([at, full]) => ({ at: +at, full, present: a => !(a >= 0xd000 && m.sw.lcRead) }));

  // The view's own events (`view`). The plain view shows the machine's screen, and what draws words clean reads
  // every call that prints, whichever routine makes it. So each call made while a routine runs is given, marked
  // `inside`, with its result. A call made by a stir is given too, with no result.
  // Not every arrival at a routine's address is a call of its own. An entry in a toolkit's table of jumps goes on to
  // the routine itself, and one routine may run on into the next: both are still the call that came before. So a
  // call is given to the view when a JSR makes it, or when a jump arrives at an entry of a table, which is how one
  // library leaves for another's routine. `last` is the address of the instruction before the one now running.
  let last = 0;
  if (s.view) {
    const step = m.cpu.step.bind(m.cpu);
    m.cpu.step = () => { const pc = m.cpu.pc, cycles = step(); last = pc; return cycles; };
  }
  const JSR = 0x20, JUMPS = new Set([0x4c, 0x6c]);
  const calls = c => { const op = c.read(last); return op === JSR || JUMPS.has(op) && c.read(c.pc) === 0x4c; };
  const inside = event => emit({ ...event, inside: true });
  const within = (c, name, step, fixed, quiet) => {
    if (!calls(c)) return;
    const { event, back } = called(c, name, step, fixed, { a: c.a, x: c.x, y: c.y, c: c.c });
    inside(event);
    if (step.gives && !quiet) s.returned(back, r => inside(result(name, step, r)));
  };

  // A call into the toolkit. A routine that never returns (`leaves`) goes on as the game: it leaves every routine as it
  // is called.
  const call = (c, name, fixed, ours) => {
    if (!ours) return;
    const step = s.step(name);
    s.tap(name, c);
    if (step.seed) { fix(); s.returned(returnTo(c), fix); }
    if (step.leaves) s.leaveAll();
    if (s.depth > 0 && left && gone(c)) { left.drop(); s.depth = 0; s.end(); }
    if (s.inside() || stirring(c)) { if (s.view) within(c, name, step, fixed, stirring(c)); return; }
    const { event, after, back, inline } = called(c, name, step, fixed, { a: c.a, x: c.x, y: c.y, c: c.c });
    emit(event);
    if (step.leaves) return;
    s.depth++; s.begin(name, event);
    const drop = s.returned(back, r => { s.returns(); if (step.gives) emit(result(name, step, r)); });
    left = inline ? null : { sp: c.sp, ret: after - 1, drop };
  };

  return {
    routines, call,
    ended: () => { left = null; },
    // A routine that waits for keys is a wait. The Monitor's RDKEY waiting at its address is a wait inside whatever
    // routine called it.
    waits: () => s.depth === 0 || !!s.step(s.running).waits || RDKEY.has(m.cpu.pc) || inRom(m),
    ticking: () => ticking,
  };
}
