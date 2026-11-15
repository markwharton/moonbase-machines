// The toolkit on the machine (remake/toolkit.js): a game's routines run on the Apple's 6502 for a vector title's
// Remake, its registers, its memory, its cycles and its clicks the game's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Toolkit } from '../remake/toolkit.js';

const b64 = bytes => btoa(String.fromCharCode(...bytes));
// A system file that does what the vector titles' loaders do before PART0: auxiliary memory for reading and writing
// and the alternate zero page, then a jump to $4000. It is in both banks, so that the 6502 goes on after the switch
// as the loaders' code does.
const SYSTEM = [0x8d, 0x09, 0xc0, 0x8d, 0x03, 0xc0, 0x8d, 0x05, 0xc0, 0x4c, 0x00, 0x40];
const game = { kind: 'prodos', system: 'GAME.SYSTEM', volumes: { GAME: { 'GAME.SYSTEM': { type: 'SYS', aux: 0x2000, size: SYSTEM.length, data: b64(SYSTEM) } } } };
// an engine, as much of one as the toolkit uses
const engine = () => ({ a: 0, x: 0, y: 0, n: 0, z: 0, c: 0, v: 0, d: 0, cycles: 0, delay: 0, clicks: [], inside: [], runInside(script, label) { this.inside.push([script, label]); this.a = 5; this.cycles += 100; } });
// the toolkit booted to $4000, with `code` at its address in auxiliary memory, and a step whose JSR is at $0300
const make = entries => { const kit = new Toolkit(game, entries); kit.mem.set(SYSTEM, 0x2000); return kit; };
const booted = (code, entries) => {
  const kit = make(entries), e = engine();
  kit.boot(e, 0x4000);
  for (const [at, bytes] of Object.entries(code)) kit.mem.set(bytes, +at);
  e.cycles = 1000; e.delay = 0;
  return { kit, e, step: { at: 0x0300 } };
};

test('the boot runs the loader to where the scenes start, and memory is the machine\'s auxiliary memory', () => {
  const kit = make(), e = engine();
  kit.boot(e, 0x4000);
  assert.equal(kit.m.cpu.pc, 0x4000);
  assert.equal(kit.mem, kit.m.aux);
  assert.ok(e.cycles > 0 && e.delay > 0);
});

test('a routine leaves its registers and its flags, and takes its own cycles', () => {
  // LDA #$42  LDX #7  SEC  RTS: 2 + 2 + 2 + 6 cycles
  const { kit, e, step } = booted({ 0x5000: [0xa9, 0x42, 0xa2, 0x07, 0x38, 0x60] });
  const sp = kit.m.cpu.sp;
  assert.equal(kit.call(e, step, { to: 0x5000, back: 0x0303 }), undefined);
  assert.deepEqual([e.a, e.x, e.c, e.n, e.z], [0x42, 7, 1, 0, 0]);
  assert.equal(e.cycles, 1012);
  assert.equal(e.delay, 12 / 1020.484);
  assert.equal(kit.m.cpu.sp, sp, 'the stack as it was');
});

test('a routine finds its data after the call, and comes back past it', () => {
  // the byte after the call into A, and back past it: PLA  STA $00  PLA  STA $01  LDY #1  LDA ($00),Y  TAX  INC $00
  // INC $00  JMP ($0000)
  const { kit, e, step } = booted({ 0x5000: [0x68, 0x85, 0x00, 0x68, 0x85, 0x01, 0xa0, 0x01, 0xb1, 0x00, 0xaa, 0xe6, 0x00, 0xe6, 0x00, 0x6c, 0x00, 0x00], 0x0303: [0x99] });
  assert.equal(kit.call(e, step, { to: 0x5000, back: 0x0304 }), undefined);
  assert.equal(e.x, 0x99);
});

test('the speaker\'s clicks come at their cycle on the engine\'s clock', () => {
  // NOP  LDA $C030  RTS
  const { kit, e, step } = booted({ 0x5000: [0xea, 0xad, 0x30, 0xc0, 0x60] });
  kit.call(e, step, { to: 0x5000, back: 0x0303 });
  assert.deepEqual(e.clicks, [1006]);
});

test('a routine that waits for a key stops at its first poll with none, and goes on with the key', () => {
  // LDA $C000  BPL (again)  STA $C010  RTS
  const { kit, e, step } = booted({ 0x5000: [0xad, 0x00, 0xc0, 0x10, 0xfb, 0x8d, 0x10, 0xc0, 0x60] });
  assert.equal(kit.call(e, step, { to: 0x5000, back: 0x0303 }), 'wait');
  assert.equal(e.cycles, 1000, 'its time to the poll, which it has not made');
  assert.ok(kit.waits(step));
  kit.press(0x41);
  assert.equal(kit.call(e, step, { to: 0x5000, back: 0x0303 }), undefined);
  assert.equal(e.a, 0xc1);
  assert.ok(!kit.waits(step));
});

test('a JSR into the scenes\' own code runs it there, inside the routine, and the routine goes on as it returns', () => {
  // JSR $6000  ADC #4  RTS, with $6000 an entry of the title's
  const { kit, e, step } = booted({ 0x5000: [0x20, 0x00, 0x60, 0x69, 0x04, 0x60] }, { $6000: ['prob2', 'L6000'] });
  const sp = kit.m.cpu.sp;
  kit.call(e, step, { to: 0x5000, back: 0x0303 });
  assert.deepEqual(e.inside, [['prob2', 'L6000']]);
  assert.equal(e.a, 9, 'the code\'s A, 5, and 4');
  assert.equal(kit.m.cpu.sp, sp);
});

test('a span runs the code from an address until the PC reaches the next line\'s', () => {
  // LDA #1  LDA #2  LDA #3
  const { kit, e } = booted({ 0x5000: [0xa9, 0x01, 0xa9, 0x02, 0xa9, 0x03] });
  assert.equal(kit.span(e, 0x5004, { at: 0x5000 }), undefined);
  assert.equal(e.a, 2);
});
