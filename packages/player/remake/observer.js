// A game, observed. The game runs on its machine, and each call it makes into its toolkit's routines becomes an
// event (events.js `describe`). A routine's result becomes an event at its return (`result`). Two runs are the same
// when their events are. The observer is given the machine, the title's map and the game's data. It reads no files,
// so it runs in a page as well as in the pilots.
//
//   const o = observe(m, map, { kind, game, seed, mine, started, emit, view, enter, leave, tap })
//     kind       'vector' or 'card': the title's toolkit, which picks its rules (below)
//     game       the game's data, for the routines that are there only while their file is in memory
//     seed       the random seed, or a function that gives it; each toolkit's rules say where it goes. With none,
//                the game's random numbers are its own
//     mine       c => whether the call being made is the game's own; every call is, if not given
//     started    () => whether the game has started; it has from the first, if not given
//     emit       event => {}, given each event in order
//     view       true to be given the view's own events too, each marked `inside`: they are no steps of the
//                transcript, and a view draws them (the vector toolkit's rules say which they are)
//     enter      event => {}, given the outermost routine's event as it starts, and a view's step that runs for a
//                while as it starts
//     leave      event => {}, given the same event as the routine or the step ends
//     left       () => {}, called when the game leaves every routine without returning
//     tap        (name, c) => {}, given every call of the game's own into a routine of the map, however deep
//   o.depth      how deep the game is in the toolkit's routines
//   o.running    the outermost routine running, or null
//   o.waits()    with the machine idle, whether the game waits for a key; if not, it is busy and the run goes on
//   o.mark()     for a vector title: a run starts, and with it the time of the key just pressed
//   o.time()     for a vector title: the last key's time, in cycles
//   o.problem(n) for a vector title: whether problem n is in memory
//
// A hook is a function the processor runs when it reaches an address (`m.cpu.hooks`). It returns false to let the
// code there run, 'wait' to be run again at the next step, and anything else to return as RTS does.
import { INLINE as VECTOR_INLINE } from '@moonbase-machines/vector/inline.js';
import { INLINE as CARD_INLINE } from './cards.js';
import { describe, result, GIVES, POLLS, WAITS, nothing } from './events.js';

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
  const { kind, game, mine = () => true, started = () => true, emit = () => {} } = options;
  const s = {
    m, map, game, mine, started, emit, options, view: !!options.view, tap: options.tap ?? (() => {}),
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
  // The game leaves every routine without returning, as a jump to the Main Menu does.
  s.leaveAll = () => { s.depth = 0; s.end(); s.era = ++s.eras; rules.left?.(); options.left?.(); };

  const rules = (kind === 'vector' ? vector : card)(s);
  // A hook at each routine of the map. A call is the game's own when the routine is in memory and `mine` says so.
  for (const { at, full, present } of rules.routines) {
    const [name, ...fixed] = full.split(' ');
    chain(m, at, c => { rules.call(c, name, fixed, present(at) && mine(c)); return false; });
  }
  return {
    get depth() { return s.depth; },
    get running() { return s.running; },
    waits: rules.waits, mark: rules.mark, time: rules.time, problem: rules.problem,
  };
}

// A call's event, with the data the routine takes inline after its call, and the address it returns to past that data.
function called(c, name, fixed, regs, inline, zero) {
  const after = returnTo(c), reader = inline[name], data = reader ? reader(a => c.read(a), after) : null;
  return { event: describe(name, fixed, regs, data?.value, zero, a => c.read(a)), after, back: after + (data ? data.length : 0), inline: !!reader };
}

// The vector toolkit's routines that run scene code of their own. The problem routine runs a problem and returns; the
// part routine loads a part and never returns. The calls made while either runs are events.
const VECTOR_THROUGH = new Set(['problem', 'part']);

// The vector toolkit's rules. The toolkit is PART0, at $4000 in auxiliary memory. Each problem is a file with routines
// of its own, loaded where the map's `loads` says.
function vector(s) {
  const { m, map, game, started, emit } = s;
  const volume = game.volumes[map.volume], part0 = bytes(volume.PART0.data);
  // The toolkit is in memory while PART0's first sixteen bytes, its jumps and its start, are at $4000. Its routines
  // can't be checked one by one, since some of them write into their own code.
  const isIn = () => { for (let i = 0; i < 16; i++) if (m.aux[0x4000 + i] !== part0[i]) return false; return true; };
  // A problem's routines are there while that problem is in memory.
  const load = map.loads?.PROB ?? 0xf000;
  const problems = Object.fromEntries(Object.keys(map.problems ?? {}).map(n => [n, bytes(volume['PROB' + n].data)]));
  const problemIn = (n, a) => { const b = problems[n]; for (let i = 0; i < 8 && a - load + i < b.length; i++) if (m.read(a + i) !== b[a - load + i]) return false; return true; };
  // Whether the routine running has drawn the space bar's button. A routine that has is about to wait for the key.
  let buttoned = false;

  // The view's own events (`view`). A view draws most routines itself, whole, from the routine's event alone. Some
  // of a title's own routines it has no drawing for: such a routine draws by calling the toolkit, and the view draws
  // those calls. The map's `open` names these routines. A call made while a routine runs is the view's when the
  // title's own code makes it, and the routine it is made in is the toolkit's or an open one. So the calls the
  // toolkit makes for itself stay hidden, and so do the calls made inside a routine the view draws whole.
  // `shown` is the routines running that the view has been given, the outermost first, each with the address it
  // returns to. A routine that ends by jumping to another makes that call itself: the call returns where the routine
  // would have.
  const toolkit = a => a >= 0x4000 && a < 0x4000 + part0.length;
  const own = new Set(Object.values(map.problems ?? {}).flatMap(r => Object.values(r)).map(full => full.split(' ')[0]));
  const open = new Set(map.open ?? []);
  let shown = [];
  const views = c => {
    if (!s.view) return false;
    const inner = shown.at(-1), to = returnTo(c), titles = own.has(inner.name);
    const byTitle = to === inner.to ? titles : !toolkit(to);
    return byTitle && (!titles || open.has(inner.name));
  };
  const inside = event => { const given = { ...event, inside: true }; emit(given); return given; };
  const within = (c, name, fixed) => {
    shown.push({ name, to: returnTo(c) });
    const left = () => { shown.pop(); };
    if (name.startsWith('.')) { s.returned(returnTo(c), left); return; }
    if (POLLS.has(name)) { s.returned(returnTo(c), r => { left(); if (r.a && (name !== 'blink-key' || r.c)) inside(result(name, r)); }); return; }
    const { event, back } = called(c, name, fixed, { a: c.a, x: c.x, y: c.y }, VECTOR_INLINE, z => c.read(z + map.vars.zero));
    inside(event);
    s.returned(back, r => { left(); if (GIVES[name]) inside(result(name, r)); });
  };

  // The view's steps (the map's `view`, by the file they are in): places in the game's code where the screen
  // changes with no routine of the map called, as a part's own code scrolls a picture. Each is an event for the view
  // when the game reaches it, while its file is in memory. An entry is a step's name, or an event's fields. A step
  // that runs for a while gives `until`, the address where it is done. It is one event, however many times its code
  // passes its own address, and `enter` and `leave` are given it as it starts and ends.
  const origin = name => map.loads?.[name] ?? map.loads?.[name.replace(/\d$/, '')] ?? volume[name].aux;
  const running = new Set();
  for (const [name, steps] of s.view ? Object.entries(map.view ?? {}) : []) {
    const head = bytes(volume[name].data).subarray(0, 16), from = origin(name);
    const there = () => started() && head.every((v, i) => m.read(from + i) === v);
    for (const [at, step] of Object.entries(steps)) {
      const { until, ...event } = typeof step === 'string' ? { step } : step;
      let given = null;
      const done = () => { if (!given) return; const e = given; given = null; running.delete(done); s.options.leave?.(e); };
      chain(m, +at, () => {
        if (!there() || given) return false;
        const e = inside(event);
        if (until !== undefined) { given = e; running.add(done); s.options.enter?.(e); }
        return false;
      });
      if (until !== undefined) chain(m, until, () => { done(); return false; });
    }
  }

  // The jump to the Main Menu (control-E) resets the stack and leaves every routine.
  if (map.menu !== undefined) chain(m, map.menu, () => { if (started() && isIn()) s.leaveAll(); return false; });
  // A visit to the menus (the map's `visit`) leaves every routine, and keeps what the game was in until the menus go
  // back to it. A visit made from inside the menus, with the game kept already (`kept`), keeps what was kept first.
  if (map.visit) {
    const { at, kept, back } = map.visit;
    let visited = null;
    chain(m, at, () => {
      if (started() && isIn()) {
        if (!m.read(kept) || !visited) visited = { depth: s.depth, running: s.running, event: s.event, buttoned, era: s.era, shown };
        s.leaveAll();
      }
      return false;
    });
    chain(m, back, () => {
      if (started() && isIn() && visited) {
        const v = visited;
        visited = null;
        s.end();
        s.depth = v.depth; s.era = v.era; buttoned = v.buttoned; shown = v.shown;
        if (v.event) s.begin(v.running, v.event);
      }
      return false;
    });
  }

  const routines = Object.entries(map.routines).map(([at, full]) => ({ at: +at, full, present: () => isIn() }));
  for (const [n, own] of Object.entries(map.problems ?? {})) for (const [at, full] of Object.entries(own)) routines.push({ at: +at, full, present: a => problemIn(n, a) });

  // A key's time, for the pilots to hold the Remake's to. It runs from the read of the keyboard that takes the key, or
  // from the run's start, to the first read that finds no key in a wait. A turn's start (`tick`) also ends it.
  const time = { from: null, to: null, start: 0, turn: null };
  // Whether the routine running waits for a key: it is one that waits or polls for a key, or it has drawn the space
  // bar's button.
  const waiting = () => WAITS.has(s.running) || POLLS.has(s.running) || buttoned;

  // A call into the toolkit. A call to the button routine is noted while a routine runs, whoever makes it.
  const call = (c, name, fixed, ours) => {
    if (name === 'button' && s.depth > 0) buttoned = true;
    if (!ours || nothing(name, c.a)) return;
    s.tap(name, c);
    if (s.inside()) { if (views(c)) within(c, name, fixed); return; }
    shown = [{ name, to: returnTo(c) }];
    // A routine whose name starts with a dot is no step. It makes no event, and the calls it makes are hidden.
    if (name.startsWith('.')) { s.depth++; s.returned(returnTo(c), s.returns); return; }
    // The random routine takes the seed at its first call. The game grows the seed at each poll of the keyboard
    // until then, so without this the seed would depend on how long the machine ran.
    if (name === 'random' && m.read(map.seed.used) === 0xff) {
      const seed = s.seed();
      if (seed !== undefined) { m.write(map.seed.at, seed & 0xff); m.write(map.seed.at + 1, seed >> 8); }
    }
    // A routine that polls the keyboard is a step only when it gives a key. The blink-key routine gives one only
    // with the carry set.
    if (POLLS.has(name)) {
      s.depth++; s.begin(name, { step: name });
      s.returned(returnTo(c), r => { s.returns(); if (r.a && (name !== 'blink-key' || r.c)) emit(result(name, r)); });
      return;
    }
    const { event, back } = called(c, name, fixed, { a: c.a, x: c.x, y: c.y }, VECTOR_INLINE, z => c.read(z + map.vars.zero));
    emit(event);
    if (name === 'part') return;
    // A turn of the game's own loop reads the keyboard without waiting. The run stops here, for the pilot to give it a
    // key or none.
    if (name === 'tick') { m.idle = Infinity; time.to ??= m.cpu.cycles; time.turn = m.cpu.cycles; }
    const through = VECTOR_THROUGH.has(name);
    if (!through) { s.depth++; s.begin(name, event); }
    s.returned(back, r => { if (!through) s.returns(); if (GIVES[name]) emit(result(name, r)); });
  };

  // Each instruction is watched for a read of the keyboard. The first read that finds a key starts the key's time. The
  // first read in a wait that finds no key ends it, before the read. A read made by a scene, or by a turn of the
  // game's loop, is no wait.
  const READS = new Set([0xad, 0xae, 0xac, 0x2c, 0xcd]), step = m.cpu.step.bind(m.cpu);
  m.cpu.step = () => {
    const pc = m.cpu.pc, reads = READS.has(m.read(pc)) && m.read((pc + 2) & 0xffff) === 0xc0 && m.read((pc + 1) & 0xffff) <= 0x10;
    if (reads && !(m.key & 0x80) && s.depth > 0 && s.running !== 'tick' && waiting() && started()) time.to ??= m.cpu.cycles;
    const had = !!(m.key & 0x80), cycles = step();
    if (reads && had && time.from === null && time.to === null) time.from = m.cpu.cycles;
    return cycles;
  };

  return {
    routines, call,
    ended: () => { buttoned = false; shown = []; },
    // a view's step still running when the game leaves every routine is over
    left: () => { for (const done of [...running]) done(); },
    waits: () => s.depth === 0 || waiting(),
    // After a turn, the next key's time runs from the turn's start. The run stopped one instruction past it.
    mark: () => { Object.assign(time, { from: null, to: null, start: time.turn ?? m.cpu.cycles, turn: null }); },
    time: () => (time.to ?? m.cpu.cycles) - (time.from ?? time.start),
    problem: n => { const b = problems[n]; if (!b) return false; for (let i = 0; i < 16; i++) if (m.read(load + i) !== b[i]) return false; return true; },
  };
}

// The card toolkit's routines that go on as the game, with no return: the town's loop, a restart, and the escape
// into the game's save, load and quit screens. Each leaves every routine.
const CARD_THROUGH = new Set(['town', 'restart', 'escape']);
// The Monitor's RDKEY, KEYIN and RDCHAR. The machine stays at one of them while it waits for a key.
const RDKEY = new Set([0xfd0c, 0xfd1b, 0xfd35]);
// Whether the machine is in the IIe's own ROM, which waits for a key in its keyboard routine at $C2DE.
const inRom = m => m.rom && m.cpu.pc >= 0xc100 && (m.cpu.pc < 0xd000 || !m.sw.lcRead);

// The card toolkit's rules.
function card(s) {
  const { m, map, game, started, emit } = s;
  // The key reader counts how long it waits for a key, at the map's `seed`, and the random routine can take its seed
  // from that count. The count depends on how long the machine ran, so the seed is written there as each key is read
  // and as it comes.
  const fix = () => { const seed = s.seed(); if (map.seed === undefined || seed === undefined) return; m.write(map.seed, seed & 0xff); m.write(map.seed + 1, seed >> 8); };

  // A tick stops a scene's loop before it reads the keyboard, for the pilot to give it a key or none. It stops only
  // while the tick's scene is in memory at $AD00. When the run goes on, the read goes on.
  for (const t of map.ticks ?? []) {
    const head = bytes(Object.values(game.volumes).map(v => v[t.scene]).find(Boolean).data).subarray(0, 16);
    let ticking = false;
    chain(m, t.at, () => {
      if (!started()) return false;
      if (ticking) ticking = false;
      else if (head.every((v, i) => m.read(0xad00 + i) === v)) { emit({ step: 'tick' }); m.idle = Infinity; ticking = true; return 'wait'; }
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

  // A call into the toolkit.
  const call = (c, name, fixed, ours) => {
    if (!ours) return;
    s.tap(name, c);
    if (name === 'read-key') { fix(); s.returned(returnTo(c), fix); }
    if (CARD_THROUGH.has(name)) s.leaveAll();
    if (s.depth > 0 && left && gone(c)) { left.drop(); s.depth = 0; s.end(); }
    if (s.inside() || stirring(c)) return;
    const { event, after, back, inline } = called(c, name, fixed, { a: c.a, x: c.x, y: c.y, c: c.c }, CARD_INLINE);
    emit(event);
    if (CARD_THROUGH.has(name)) return;
    s.depth++; s.begin(name, event);
    const drop = s.returned(back, r => { s.returns(); if (GIVES[name]) emit(result(name, r)); });
    left = inline ? null : { sp: c.sp, ret: after - 1, drop };
  };

  return {
    routines, call,
    ended: () => { left = null; },
    // A routine that waits for keys is a wait, and so is the key reader. The Monitor's RDKEY waiting at its address is
    // a wait inside whatever routine called it.
    waits: () => s.depth === 0 || WAITS.has(s.running) || s.running === 'read-key' || RDKEY.has(m.cpu.pc) || inRom(m),
  };
}
