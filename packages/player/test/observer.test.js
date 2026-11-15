// The observer (remake/observer.js): a game's calls into its toolkit's routines, on its machine, as events. A small
// program of its own stands in for a game, with a map of its routines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPU } from '@moonbase-machines/mos6502/cpu.js';
import { assemble } from '@moonbase-machines/mos6502/asm.js';
import { observe, returnTo, chain, once } from '../remake/observer.js';

const b64 = bytes => btoa(String.fromCharCode(...bytes));
// As much of a machine as the observer uses: 64K of memory, which is also the auxiliary memory the vector toolkit
// runs in, the keyboard, the count of polls, the language card's switch, and a 6502.
const machine = ({ origin, bytes }) => {
  const mem = new Uint8Array(0x10000);
  mem.set(bytes, origin);
  const m = { mem, aux: mem, key: 0, idle: 0, sw: { lcRead: 0 }, read: a => mem[a], write: (a, v) => { mem[a] = v; } };
  m.cpu = new CPU(m);
  return m;
};
// Runs from `from` until the processor reaches `to`.
const until = (m, to) => { for (let i = 0; i < 10000 && m.cpu.pc !== to; i++) m.cpu.step(); assert.equal(m.cpu.pc, to, 'the program reaches its end'); };
const run = (m, from, to) => { m.cpu.pc = from; m.cpu.sp = 0xff; until(m, to); };

// A scene that calls the toolkit, and the toolkit at $4000, which begins with its jumps. The text routine returns past
// the three bytes after its call. The key reader gives the key at $10, or 0 for none. The wait leaves for the menu
// without returning, and the menu resets the stack.
const VECTOR = assemble(`
*= $0300
calls:    LDA #1
          LDX #2
          LDY #3
          JSR box
          LDA #6
          LDX #7
          JSR multiply
          JSR text
          .byte $C8, $C9, $80
          JMP done
polls:    JSR readkey
          BEQ polls
          JMP done
leaves:   JSR wait
          JMP done
done:     JMP done

*= $4000
          JMP box
          JMP multiply
          JMP text
          JMP readkey
          JMP wait
          JMP rect
box:      JSR rect
          RTS
rect:     RTS
multiply: LDA #42
          LDX #5
          RTS
text:     PLA
          CLC
          ADC #3
          TAY
          PLA
          ADC #0
          PHA
          TYA
          PHA
          RTS
readkey:  LDA $10
          RTS
wait:     JMP menu
menu:     LDX #$FF
          TXS
          LDA #9
          LDX #8
          LDY #7
          JSR box
          JMP done
`);
const at = (program, name) => program.symbols.get(name);
const vectorTitle = (options = {}) => {
  const m = machine(VECTOR), a = name => at(VECTOR, name);
  const game = { volumes: { TEST: { PART0: { data: b64(m.mem.slice(0x4000, VECTOR.origin + VECTOR.bytes.length)) } } } };
  const map = {
    volume: 'TEST', vars: { zero: 0 }, menu: a('menu'),
    routines: { [a('box')]: 'box', [a('rect')]: 'rectangle', [a('multiply')]: 'multiply', [a('text')]: 'text', [a('readkey')]: 'read-key', [a('wait')]: 'wait' },
  };
  const events = [];
  const o = observe(m, map, { kind: 'vector', game, emit: e => events.push(e), ...options });
  return { m, o, events, a };
};

test('a call is an event with the registers its routine takes, and its result comes at its return', () => {
  const { m, events, a } = vectorTitle();
  run(m, a('calls'), a('done'));
  assert.deepEqual(events.slice(0, 3), [{ step: 'box', a: 1, x: 2, y: 3 }, { step: 'multiply', a: 6, x: 7 }, { result: 'multiply', a: 42, x: 5 }]);
});

test('a routine called from inside another is part of it, and no event', () => {
  const { m, o, events, a } = vectorTitle();
  m.cpu.pc = a('calls'); m.cpu.sp = 0xff;
  until(m, a('rect'));
  assert.equal(o.depth, 1);
  assert.equal(o.running, 'box');
  until(m, a('done'));
  assert.ok(!events.some(e => e.step === 'rectangle'));
});

test('a routine with data inline after its call has the data in its event, and returns past it', () => {
  const { m, o, events, a } = vectorTitle();
  run(m, a('calls'), a('done'));
  assert.deepEqual(events.slice(3), [{ step: 'text', words: 'HI' }]);
  assert.equal(o.depth, 0, 'out of every routine');
  assert.equal(o.running, null);
});

test('a routine that polls the keyboard is an event only when it gives a key', () => {
  const { m, o, events, a } = vectorTitle();
  m.cpu.pc = a('polls'); m.cpu.sp = 0xff;
  for (let i = 0; i < 300; i++) m.cpu.step();
  assert.deepEqual(events, []);
  assert.ok(o.waits(), 'polling for a key is a wait');
  m.mem[0x10] = 0x41;
  until(m, a('done'));
  assert.deepEqual(events, [{ result: 'read-key', a: 0x41 }]);
});

test('a routine that is busy is no wait', () => {
  const { m, o, a } = vectorTitle();
  m.cpu.pc = a('calls'); m.cpu.sp = 0xff;
  until(m, a('rect'));
  assert.equal(o.waits(), false);
});

test('a jump to the menu drops the routine running, and the menu\'s calls are events', () => {
  const { m, o, events, a } = vectorTitle();
  m.cpu.pc = a('leaves'); m.cpu.sp = 0xff;
  until(m, a('menu') + 3);
  assert.equal(o.depth, 0);
  assert.equal(o.running, null);
  until(m, a('done'));
  assert.deepEqual(events, [{ step: 'wait' }, { step: 'box', a: 9, x: 8, y: 7 }]);
});

test('the outermost routine is told as it starts and as it ends', () => {
  const told = [];
  const { m, a } = vectorTitle({ enter: e => told.push(['enter', e.step]), leave: e => told.push(['leave', e.step]) });
  run(m, a('calls'), a('done'));
  assert.deepEqual(told, [['enter', 'box'], ['leave', 'box'], ['enter', 'multiply'], ['leave', 'multiply'], ['enter', 'text'], ['leave', 'text']]);
});

// Here the call of the box is not the game's own, and nor is any call the toolkit makes.
test('a call that is not the game\'s own is no event', () => {
  const { m, events, a } = vectorTitle({ mine: c => returnTo(c) < 0x4000 && returnTo(c) !== a('calls') + 9 });
  run(m, a('calls'), a('done'));
  assert.equal(events[0].step, 'multiply');
});

// A card title's scene and toolkit. The print routine returns past its text, which ends in a zero. The drop routine
// calls the restart, which goes on as the game and never returns.
const CARD = assemble(`
*= $0300
calls:    LDA #4
          LDX #5
          LDY #6
          SEC
          JSR print
          .byte 'H', 'I', 0
          LDY #2
          JSR take
          JMP done
leaves:   LDY #1
          JSR drop
          JMP done
done:     JMP done
print:    PLA
          CLC
          ADC #3
          TAY
          PLA
          ADC #0
          PHA
          TYA
          PHA
          RTS
take:     LDA #3
          RTS
drop:     JSR restart
          RTS
restart:  LDX #$FF
          TXS
          LDY #2
          JSR take
          JMP done
`);
const cardTitle = () => {
  const m = machine(CARD), a = name => at(CARD, name), events = [];
  const map = { routines: { [a('print')]: 'print', [a('take')]: 'take', [a('drop')]: 'drop', [a('restart')]: 'restart' } };
  const o = observe(m, map, { kind: 'card', game: { volumes: {} }, emit: e => events.push(e) });
  return { m, o, events, a };
};

test('a card title\'s call gives the carry too, and its text inline', () => {
  const { m, o, events, a } = cardTitle();
  run(m, a('calls'), a('done'));
  assert.deepEqual(events, [{ step: 'print', a: 4, x: 5, y: 6, c: 1, words: 'HI' }, { step: 'take', y: 2 }, { result: 'take', a: 3 }]);
  assert.equal(o.depth, 0);
});

test('a card title\'s restart leaves every routine, and goes on as the game', () => {
  const { m, o, events, a } = cardTitle();
  run(m, a('leaves'), a('done'));
  assert.deepEqual(events, [{ step: 'drop', y: 1 }, { step: 'restart' }, { step: 'take', y: 2 }, { result: 'take', a: 3 }]);
  assert.equal(o.depth, 0);
  assert.equal(o.running, null);
});

// A few instructions for the hooks to sit on: two NOPs and a JSR to a routine that returns at once.
const NOPS = assemble(`
*= $0300
          NOP
          NOP
          JSR back
          NOP
back:     RTS
`);

test('a chained hook runs before the one already there, which runs when the code is let run', () => {
  const m = machine(NOPS), seen = [];
  m.cpu.hooks.set(0x0300, () => { seen.push('there'); return false; });
  chain(m, 0x0300, () => { seen.push('chained'); return false; });
  m.cpu.pc = 0x0300; m.cpu.step();
  assert.deepEqual(seen, ['chained', 'there']);
  chain(m, 0x0301, () => 'wait');
  m.cpu.step();
  assert.equal(m.cpu.pc, 0x0301, 'a hook that waits keeps the processor there');
});

test('a hook for once runs once, then the one that was there', () => {
  const m = machine(NOPS), seen = [];
  const there = () => { seen.push('there'); return false; };
  m.cpu.hooks.set(0x0300, there);
  once(m, 0x0300, () => seen.push('once'));
  m.cpu.pc = 0x0300; m.cpu.step();
  assert.deepEqual(seen, ['once', 'there']);
  assert.equal(m.cpu.hooks.get(0x0300), there);
});

test('a routine returns to the instruction after its call', () => {
  const m = machine(NOPS), back = at(NOPS, 'back');
  let to = null;
  m.cpu.hooks.set(back, c => { to = returnTo(c); return false; });
  run(m, 0x0302, 0x0305);
  assert.equal(to, 0x0305);
});
