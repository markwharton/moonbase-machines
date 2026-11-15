// A vector title's toolkit, on the Original's machine (@moonbase-machines/apple2e/machine.js): the Apple booted with
// the game's own disk, its loader run up to PART0 as the Original runs it. The game runs in auxiliary memory, with the
// alternate zero page and the language card's second bank, so the Remake's memory is the machine's auxiliary 64K,
// with that bank shown in its top: what a scene's lifted line reads or writes, the machine reads or writes.
//
// Each routine of the toolkit that a scene calls runs on the machine's 6502, from the call to its return past the
// data it takes inline. Its registers and flags, what it does to memory, its cycles, its speaker's clicks and the time
// the disk takes are the game's own. A routine that waits for a key polls for it as on the original, until the
// pilots' observer of the original would give one, and stops there; it goes on with the key. The polls are the
// player's time, so the routine's own ends at its first poll that finds no key. A busy one, which reads the keyboard
// as it goes, goes on with none. A routine that calls back into code the title's scripts have (its `entries`, as the
// ask calls a problem's own drawing) runs that code there, inside itself, and goes on as it returns.
//
//   const kit = new Toolkit(game, entries)   the machine, booted to where the scenes start, or to the loader's key
//   kit.mem                                  the engine's memory
//   kit.call(e, step, { to, back })          a routine from `to`, called by the JSR at the step's address and back at
//                                            `back`, past its inline data: 'wait' while it waits for a key
//   kit.span(e, until, { at, stops })        the code from `at`, or from where the machine is, until the PC reaches
//                                            `until` or one of `stops`
import { Machine } from '@moonbase-machines/apple2e/machine.js';

const CYCLES_PER_MS = 1020.484;
// polls of the keyboard with no key that are a wait, as the machine's own run counts them (machine.js `idle`)
export const IDLE = 2000;
const REGS = ['pc', 'sp', 'a', 'x', 'y', 'n', 'v', 'd', 'i', 'z', 'c'];
// whether the instruction at `pc` reads the keyboard, $C000 to $C010, by its address: LDA, LDX, LDY, BIT or CMP
const READS = new Set([0xad, 0xae, 0xac, 0x2c, 0xcd]);
const keyboard = (m, pc) => READS.has(m.read(pc)) && m.read((pc + 2) & 0xffff) === 0xc0 && m.read((pc + 1) & 0xffff) <= 0x10;

export class Toolkit {
  // `entries`: the addresses of the scenes' own code, each [script, label] (the title's `entries`); `menu`, the Main
  // Menu's, which the key reader jumps to on control-E
  constructor(game, entries = {}, menu) {
    this.menu = menu;
    const m = this.m = new Machine(game, { log: () => {} });
    m.lc.aux[1] = m.aux.subarray(0xd000, 0xe000); m.lc.aux[2] = m.aux.subarray(0xe000);
    // (a read's time, which the Remake waits as a delay, as the Original's page has the disk take it)
    m.diskTime = true;
    this.entries = new Map(Object.entries(entries).map(([at, to]) => [parseInt(at.slice(1), 16), to]));
    this.paused = new Map();   // each step whose routine waits for a key: its 6502's state
  }
  get mem() { return this.m.aux; }
  regs() { const c = this.m.cpu, r = {}; for (const k of REGS) r[k] = c[k]; return r; }
  set(r) { Object.assign(this.m.cpu, r); }

  // The loader, from the machine's start until the PC reaches `at` in auxiliary memory, where the scenes start, or
  // the loader waits for a key (Nature Park's TITLE). The cycles and the disk's time are the engine's first delay.
  boot(e, at) {
    const m = this.m, cpu = m.cpu;
    for (let n = 0; n < 5e7; n++) {
      if (m.reading) { e.delay += Math.max(0, m.reading.at - cpu.cycles) / CYCLES_PER_MS; m.reading.arrive(); m.reading = null; }
      if (cpu.pc === at && m.sw.ramrd) break;
      if (m.idle > IDLE) break;
      cpu.step();
    }
    e.delay += cpu.cycles / CYCLES_PER_MS; e.cycles = cpu.cycles; m.clicks.length = 0;
  }

  // The 6502 from where it is until `done()`, on the engine's clock. A disk's read takes the time it takes, as a
  // delay. A JSR into the scenes' own code runs it there, inside the step (Engine.runInside), and goes on as it
  // returns. With `waits`, 'wait' where the machine has seen as many polls with no key as are a wait (`IDLE`), its
  // time to the first; 'quit' when the game quits, 'menu' at the Main Menu. `first` is the cycle of the first read
  // of the keyboard that found no key, before it was made, and `picked` the cycle after the first that found one,
  // for the pilots, which time a key from there to the next wait.
  // The machine counts the polls with no key from the start of the engine's run (Engine.run sets the count to 0),
  // across every routine the run calls. A routine that neither waits nor polls for a key is busy: its polls are no
  // wait, and the count starts again when it passes `IDLE`, as the original's observer starts it again. With `polls`,
  // the routine polls for a key and the step decides whether the count is a wait.
  go(e, done, { waits = false, polls = false } = {}) {
    const m = this.m, cpu = m.cpu;
    cpu.cycles = e.cycles; this.jsr = false; this.first = null;
    let r, n = 0;
    for (;; n++) {
      if (done()) break;
      if (n > 1e8) throw new Error('the toolkit runs on without end at $' + cpu.pc.toString(16));
      if (m.reading) { e.delay += Math.max(0, m.reading.at - cpu.cycles) / CYCLES_PER_MS; m.reading.arrive(); m.reading = null; }
      if (m.halted) { r = m.halted; m.halted = false; break; }
      if (cpu.pc === this.menu) { r = 'menu'; break; }
      const to = this.entries.get(cpu.pc);
      if (to && this.jsr) { this.inside(e, to); continue; }
      const none = !(m.key & 0x80), reads = keyboard(m, cpu.pc);
      if (reads && none) this.first ??= cpu.cycles;
      this.jsr = m.read(cpu.pc) === 0x20;
      cpu.step();
      if (reads && !none) this.picked ??= cpu.cycles;
      if (m.idle > IDLE) {
        if (waits) { r = 'wait'; break; }
        if (!polls) m.idle = 0;
      }
    }
    // (a wait's polls are the player's time: the routine's ends at its first poll that finds no key)
    const at = r === 'wait' ? this.first ?? cpu.cycles : cpu.cycles;
    e.delay += (at - e.cycles) / CYCLES_PER_MS; e.cycles = at;
    for (const k of m.clicks) e.clicks.push(k);
    m.clicks.length = 0;
    return r;
  }
  // a JSR into the scenes' own code: run there, with the 6502's registers, and back by its RTS
  inside(e, [script, label]) {
    const m = this.m, cpu = m.cpu, outer = this.regs();
    e.a = cpu.a; e.x = cpu.x; e.y = cpu.y; e.n = cpu.n; e.z = cpu.z; e.c = cpu.c; e.v = cpu.v; e.d = cpu.d;
    e.delay += (cpu.cycles - e.cycles) / CYCLES_PER_MS; e.cycles = cpu.cycles;
    for (const k of m.clicks) e.clicks.push(k);
    m.clicks.length = 0;
    e.runInside(script, label);
    this.set({ ...outer, a: e.a, x: e.x, y: e.y, n: e.n, z: e.z, c: e.c, v: e.v, d: e.d });
    const lo = this.m.read(0x100 | (cpu.sp + 1) & 0xff), hi = this.m.read(0x100 | (cpu.sp + 2) & 0xff);
    // (its RTS: the script's return, whose cycles the engine has counted)
    cpu.sp = (cpu.sp + 2) & 0xff; cpu.pc = ((hi << 8 | lo) + 1) & 0xffff;
    cpu.cycles = e.cycles;
    this.jsr = false;
  }

  // A routine of the toolkit's, called by the JSR at `step`'s address: from `to`, with the engine's registers, as the
  // call left them, and back at `back`, past the data it takes inline. 'wait' while it waits for a key, the 6502 kept
  // until the step runs again with one (`press`); 'quit' when the game quits; else the registers are the engine's.
  call(e, step, { to, back, stop, waits = true, polls = false }) {
    const m = this.m, cpu = m.cpu, outer = this.regs(), jsr = this.jsr;
    let p = this.paused.get(step);
    if (p) { this.paused.delete(step); this.set(p.regs); }
    else {
      Object.assign(cpu, { a: e.a, x: e.x, y: e.y, n: e.n, z: e.z, c: e.c, v: e.v, d: e.d });
      p = { sp: cpu.sp, back };
      const ret = (step.at + 2) & 0xffff;   // (as the JSR leaves it: its own last byte, before the data)
      m.write(0x100 | cpu.sp, ret >> 8); cpu.sp = (cpu.sp - 1) & 0xff;
      m.write(0x100 | cpu.sp, ret & 0xff); cpu.sp = (cpu.sp - 1) & 0xff;
      cpu.pc = to;
    }
    let stopped = false;
    const r = this.go(e, () => cpu.pc === p.back && cpu.sp === p.sp || stop !== undefined && cpu.pc === stop && (stopped = true), { waits, polls });
    // (the loader at the start of a problem's own code, which the problem's script runs: kept, to go on from its
    // JSR's return when the script returns, `resume`)
    if (stopped) { this.suspended = { ...p, regs: this.regs(), outer, jsr }; return 'lifted'; }
    if (r === 'wait') {
      // (what comes before the key, a visit to the menus, runs below the waiting routine on the stack)
      this.paused.set(step, { ...p, regs: this.regs() });
      this.set({ ...outer, sp: cpu.sp }); this.jsr = jsr;
      return 'wait';
    }
    e.a = cpu.a; e.x = cpu.x; e.y = cpu.y; e.n = cpu.n; e.z = cpu.z; e.c = cpu.c; e.v = cpu.v; e.d = cpu.d;
    this.set({ ...outer, sp: r ? cpu.sp : p.sp }); this.jsr = jsr;
    return r;
  }
  // The routine kept where it reached the scenes' own code (`call`'s `stop`), on from that code's RTS, with the
  // engine's registers as that code left them, back to its own caller.
  resume(e) {
    const m = this.m, cpu = m.cpu, p = this.suspended;
    this.suspended = null;
    this.set({ ...p.regs, a: e.a, x: e.x, y: e.y, n: e.n, z: e.z, c: e.c, v: e.v, d: e.d });
    const lo = m.read(0x100 | (cpu.sp + 1) & 0xff), hi = m.read(0x100 | (cpu.sp + 2) & 0xff);
    // (its RTS: the problem's return, whose cycles the engine has counted)
    cpu.sp = (cpu.sp + 2) & 0xff; cpu.pc = ((hi << 8 | lo) + 1) & 0xffff;
    const r = this.go(e, () => cpu.pc === p.back && cpu.sp === p.sp);
    e.a = cpu.a; e.x = cpu.x; e.y = cpu.y; e.n = cpu.n; e.z = cpu.z; e.c = cpu.c; e.v = cpu.v; e.d = cpu.d;
    this.set({ ...p.outer, sp: p.sp }); this.jsr = p.jsr;
    return r;
  }
  // whether `step`'s routine waits for a key now
  waits(step) { return this.paused.has(step); }
  // a key for a waiting routine, into the machine's keyboard; the next read that finds it is `picked`
  press(k) { this.m.press(k); this.picked = null; }
  // everything waiting dropped, as the original's jump to its Main Menu drops what was running and resets its stack
  drop() { this.paused.clear(); this.m.cpu.sp = 0xfe; }

  // The code from `at`, or from where the machine is (the loader at its key), until the PC reaches `until`: a span of
  // the game's code that a script has as one step of its own, as a delay counted out, the screen cleared or a part
  // loaded, which ends where the script's next line is. 'wait', 'quit', or the address in `stops` it stopped at, as
  // a part's or a problem's start, reached by the loader.
  span(e, until, { at, stops = [] } = {}) {
    const m = this.m, cpu = m.cpu, outer = this.regs();
    if (at !== undefined) Object.assign(cpu, { a: e.a, x: e.x, y: e.y, n: e.n, z: e.z, c: e.c, v: e.v, d: e.d, pc: at });
    let stop;
    const r = this.go(e, () => cpu.pc === until || stops.includes(cpu.pc) && (stop = cpu.pc, true));
    e.a = cpu.a; e.x = cpu.x; e.y = cpu.y; e.n = cpu.n; e.z = cpu.z; e.c = cpu.c; e.v = cpu.v; e.d = cpu.d;
    if (stop === undefined && !r) this.set({ ...outer, sp: cpu.sp });
    return r ?? stop;
  }
}
