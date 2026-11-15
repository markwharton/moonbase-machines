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
// without returning, and the menu resets the stack. The show routine calls back into the scene, and the flash routine
// ends by jumping to the multiply routine. The title's own routines are a problem's file at $6000. The scroll at
// $7000 is a file of the title's that draws with no routine of the map.
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
backs:    JSR show
          JMP done
callback: LDA #6
          LDX #7
          JSR multiply
          RTS
owns:     JSR shut
          JSR opened
          JMP done
tails:    JSR flash
          LDA #1
          JSR jumper
          JMP done
scrolls:  JSR scroll
          JSR scroll
          JMP done
randoms:  JSR random
          JMP done
ticks:    JSR tick
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
show:     JSR rect
          JSR callback
          RTS
flash:    JMP multiply
random:   LDA #7
          RTS
tick:     LDA $10
          RTS
kitend:

*= $6000
shut:     LDA #6
          LDX #7
          JSR multiply
          RTS
opened:   LDA #6
          LDX #7
          JSR multiply
          RTS
jumper:   LDA #6
          LDX #7
          JMP multiply

*= $7000
scroll:   LDX #3
loop:     DEX
          BNE loop
loopend:  RTS
`);
const at = (program, name) => program.symbols.get(name);
// The title's map: the toolkit's routines, the title's own in problem 1 (two of them open to the view), the scroll's
// two view steps, where the random routine's seed goes, and the steps the title defines itself: the turn of its own
// loop and the jump. `steps` puts other definitions over those.
const vectorTitle = ({ steps = {}, ...options } = {}) => {
  const m = machine(VECTOR), a = name => at(VECTOR, name), file = (from, to) => ({ data: b64(m.mem.slice(from, to)) });
  const game = { volumes: { TEST: { PART0: file(0x4000, a('kitend')), PROB1: file(0x6000, 0x6020), SCROLL: { aux: 0x7000, ...file(0x7000, 0x7010) } } } };
  const map = {
    volume: 'TEST', vars: { zero: 0 }, menu: a('menu'), loads: { PROB: 0x6000 }, seed: { at: 0x20, used: 0x22 },
    routines: {
      [a('box')]: 'box', [a('rect')]: 'rectangle', [a('multiply')]: 'multiply', [a('text')]: 'text', [a('readkey')]: 'read-key', [a('wait')]: 'wait',
      [a('show')]: 'show', [a('flash')]: 'flash', [a('random')]: 'random', [a('tick')]: 'tick',
    },
    problems: { 1: { [a('shut')]: 'demo', [a('opened')]: 'edges', [a('jumper')]: 'jump' } },
    steps: { tick: { gives: 'a', turn: true }, jump: { takes: 'a' }, ...steps },
    open: ['edges', 'jump'],
    view: { SCROLL: { [a('scroll')]: 'shift-down', [a('loop')]: { step: 'scroll', until: a('loopend') } } },
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

const inside = events => events.filter(e => e.inside);

test('for the view, a call the title\'s code makes inside a toolkit routine is an event marked inside, and its result too', () => {
  const { m, events, a } = vectorTitle({ view: true });
  run(m, a('backs'), a('done'));
  assert.deepEqual(events, [{ step: 'show' }, { step: 'multiply', a: 6, x: 7, inside: true }, { result: 'multiply', a: 42, x: 5, inside: true }]);
});

test('the calls the toolkit makes for itself are not the view\'s', () => {
  const { m, events, a } = vectorTitle({ view: true });
  run(m, a('calls'), a('done'));
  assert.deepEqual(inside(events), []);
  assert.ok(!events.some(e => e.step === 'rectangle'));
});

test('without the view, a call the title\'s code makes inside a routine is no event', () => {
  const { m, events, a } = vectorTitle();
  run(m, a('backs'), a('done'));
  assert.deepEqual(events, [{ step: 'show' }]);
});

test('a title\'s own routine hides the calls it makes, unless the map opens it', () => {
  const { m, events, a } = vectorTitle({ view: true });
  run(m, a('owns'), a('done'));
  assert.deepEqual(events, [{ step: 'demo' }, { step: 'edges' }, { step: 'multiply', a: 6, x: 7, inside: true }, { result: 'multiply', a: 42, x: 5, inside: true }]);
});

// The flash routine's jump leaves the scene's return on the stack, so its call of the multiply routine returns to the
// scene. The jump routine is the title's own and open, and it ends by jumping too.
test('a routine that ends by jumping to another makes that call itself', () => {
  const { m, events, a } = vectorTitle({ view: true });
  run(m, a('tails'), a('done'));
  assert.deepEqual(events, [{ step: 'flash' }, { step: 'jump', a: 1 }, { step: 'multiply', a: 6, x: 7, inside: true }, { result: 'multiply', a: 42, x: 5, inside: true }]);
});

test('a view step is an event when the game reaches it with its file in memory; a loop is one event each time it runs', () => {
  const { m, events, a } = vectorTitle({ view: true });
  run(m, a('scrolls'), a('done'));
  const steps = [{ step: 'shift-down', inside: true }, { step: 'scroll', inside: true }];
  assert.deepEqual(events, [...steps, ...steps]);
  m.mem[0x700f] = 0xff;
  run(m, a('scrolls'), a('done'));
  assert.equal(events.length, 4, 'the file is not in memory');
});

test('without the view, the view\'s steps are no events', () => {
  const { m, events, a } = vectorTitle();
  run(m, a('scrolls'), a('done'));
  assert.deepEqual(events, []);
});

test('tap is given every call, however deep', () => {
  const tapped = [];
  const { m, a } = vectorTitle({ tap: (name, c) => tapped.push([name, c.a]) });
  run(m, a('calls'), a('done'));
  assert.deepEqual(tapped, [['box', 1], ['rectangle', 1], ['multiply', 6], ['text', 42]]);
});

test('a seed that is a function is read at the random routine\'s call', () => {
  let seed = 1;
  const { m, a } = vectorTitle({ seed: () => seed });
  seed = 0x1234;
  m.mem[0x22] = 0xff;
  run(m, a('randoms'), a('done'));
  assert.deepEqual([m.mem[0x20], m.mem[0x21]], [0x34, 0x12]);
});

test('with no seed, the random routine\'s seed is the game\'s own', () => {
  const { m, a } = vectorTitle();
  m.mem[0x22] = 0xff;
  run(m, a('randoms'), a('done'));
  assert.deepEqual([m.mem[0x20], m.mem[0x21]], [0, 0]);
});

test('a vector title is ticking while a turn of its own loop runs', () => {
  const { m, o, a } = vectorTitle();
  assert.equal(o.ticking(), null);
  m.cpu.pc = a('ticks'); m.cpu.sp = 0xff;
  until(m, a('tick') + 2);
  assert.equal(o.ticking(), 'tick');
  until(m, a('done'));
  assert.equal(o.ticking(), null);
});

test('a call with a value of A its routine does nothing for is no step', () => {
  const { m, events, a } = vectorTitle({ steps: { multiply: { takes: 'ax', gives: 'ax', nothing: 6 } } });
  run(m, a('calls'), a('done'));
  assert.deepEqual(events, [{ step: 'box', a: 1, x: 2, y: 3 }, { step: 'text', words: 'HI' }]);
});

test('a routine that polls for a key and gives it only with the carry set is no step with the carry clear', () => {
  const { m, events, a } = vectorTitle({ steps: { 'read-key': { gives: 'a', polls: true, carry: true } } });
  m.mem[0x10] = 0x41;
  run(m, a('polls'), a('done'));
  assert.deepEqual(events, []);
});

test('a routine that runs the game\'s own code is no routine running: the calls made while it runs are steps', () => {
  const { m, o, events, a } = vectorTitle({ steps: { show: { runs: true } } });
  m.cpu.pc = a('backs'); m.cpu.sp = 0xff;
  until(m, a('callback'));
  assert.equal(o.depth, 0);
  until(m, a('done'));
  assert.deepEqual(events.map(e => e.step ?? e.result), ['show', 'rectangle', 'multiply', 'multiply']);
});

test('a routine that has called the one that draws the space bar\'s button waits for the key', () => {
  const { m, o, a } = vectorTitle({ steps: { rectangle: { button: true } } });
  m.cpu.pc = a('calls'); m.cpu.sp = 0xff;
  until(m, a('rect'));
  m.cpu.step();
  assert.equal(o.running, 'box');
  assert.ok(o.waits());
});

// A card title's scene and toolkit. The print routine returns past its text, which ends in a zero. The drop routine
// calls the restart, which goes on as the game and never returns. The key reader gives a key at once. The wipe calls
// the take. The arrow runs on into the effect. The action cards call an entry of a table of jumps, which goes on to
// the routine's own code. The text card jumps to an entry of another library's table, and the picture jumps to that
// library's routine itself. The stir calls the take. A turn of the scene's own loop stops at `turn`, while the scene's
// first bytes are at $AD00.
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
keys:     JSR readkey
          JMP done
done:     JMP done
readkey:  LDA #$C1
          RTS
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
wipes:    JSR wipe
          JMP done
wipe:     LDY #5
          JSR take
          RTS
arrows:   JSR arrow
          JMP done
arrow:    LDA #2
effect:   RTS
cards:    JSR actions
          JMP done
actions:  LDA #7
          JSR entry
          RTS
entry:    JMP body
body:     RTS
texts:    JSR textcard
          JMP done
textcard: LDA #9
          JMP entry2
pictures: JSR picture
          JMP done
picture:  LDA #9
          JMP body2
entry2:   JMP body2
body2:    RTS
stirs:    LDY #4
          JSR take
stirdone: JMP done
turn:     LDA #1
          JMP done

*= $AD00
scene:    .byte 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
`);
// The key reader counts its wait at $4E and $4F, where the seed goes. The title defines the steps of its toolkit: the
// cout and outport routines are the Monitor's, and the Apple's own.
const print = (read, at) => { let s = '', i = at; for (;;) { const c = read(i++); if (!c) break; s += String.fromCharCode(c & 0x7f); } return { length: i - at, value: s }; };
const CARD_STEPS = {
  print: { takes: 'axyc', inline: print, text: true }, take: { takes: 'y', gives: 'a', waits: true }, drop: { takes: 'y', gives: 'a', waits: true },
  restart: { leaves: true }, 'read-key': { gives: 'a', waits: true, seed: true }, 'wipe-rows': { takes: 'a' }, arrow: { takes: 'a' },
  effect: { takes: 'a' }, 'action-cards': { takes: 'a' }, 'text-card': { takes: 'a' }, 'load-picture': { takes: 'a' },
};
const cardTitle = (options = {}) => {
  const m = machine(CARD), a = name => at(CARD, name), events = [];
  const map = {
    seed: 0x4e,
    routines: {
      [a('print')]: 'print', [a('take')]: 'take', [a('drop')]: 'drop', [a('restart')]: 'restart', [a('readkey')]: 'read-key',
      [a('wipe')]: 'wipe-rows', [a('arrow')]: 'arrow', [a('effect')]: 'effect', [a('actions')]: 'action-cards',
      [a('entry')]: 'cout', [a('body')]: 'cout', [a('textcard')]: 'text-card', [a('picture')]: 'load-picture',
      [a('entry2')]: 'outport', [a('body2')]: 'outport',
    },
    steps: CARD_STEPS,
    stir: { from: a('stirs'), to: a('stirdone') - 1, done: a('stirdone'), counts: [] },
    ticks: [{ at: a('turn'), scene: 'SCENE', step: 'tick' }],
  };
  const game = { volumes: { DISK: { SCENE: { data: b64(m.mem.slice(0xad00, 0xad10)) } } } };
  const o = observe(m, map, { kind: 'card', game, emit: e => events.push(e), ...options });
  return { m, o, events, a };
};

test('a card title\'s key reader has the seed written where it counts its wait, and none without a seed', () => {
  const seeded = cardTitle({ seed: () => 0x0102 });
  run(seeded.m, seeded.a('keys'), seeded.a('done'));
  assert.deepEqual([seeded.m.mem[0x4e], seeded.m.mem[0x4f]], [2, 1]);
  assert.deepEqual(seeded.events, [{ step: 'read-key' }, { result: 'read-key', a: 0xc1 }]);
  const own = cardTitle();
  run(own.m, own.a('keys'), own.a('done'));
  assert.deepEqual([own.m.mem[0x4e], own.m.mem[0x4f]], [0, 0]);
});

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

// Runs the card title from `entry` to its end, and gives its events.
const cardRun = (entry, options) => { const { m, events, a } = cardTitle(options); run(m, a(entry), a('done')); return events; };

test('for the view, a card routine\'s call of another by JSR is an event marked inside, with its result', () => {
  assert.deepEqual(cardRun('wipes', { view: true }), [{ step: 'wipe-rows', a: 0 }, { step: 'take', y: 5, inside: true }, { result: 'take', a: 3, inside: true }]);
});

test('a card routine reached by running on from the one before it gives the view nothing', () => {
  assert.deepEqual(cardRun('arrows', { view: true }), [{ step: 'arrow', a: 0 }]);
});

test('an entry of a table of jumps, called, is one event for the view; the routine it goes on to gives nothing', () => {
  assert.deepEqual(cardRun('cards', { view: true }), [{ step: 'action-cards', a: 0 }, { step: 'cout', a: 7, inside: true }]);
});

test('a jump to an entry of another library\'s table is an event for the view; a jump to a routine\'s own code is not', () => {
  assert.deepEqual(cardRun('texts', { view: true }), [{ step: 'text-card', a: 0 }, { step: 'outport', a: 9, inside: true }]);
  assert.deepEqual(cardRun('pictures', { view: true }), [{ step: 'load-picture', a: 0 }]);
});

test('a call a stir makes is an event for the view, with no result', () => {
  assert.deepEqual(cardRun('stirs', { view: true }), [{ step: 'take', y: 4, inside: true }]);
});

test('without the view, a card title gives none of the calls made inside a routine or by a stir', () => {
  assert.deepEqual(cardRun('wipes'), [{ step: 'wipe-rows', a: 0 }]);
  assert.deepEqual(cardRun('cards'), [{ step: 'action-cards', a: 0 }]);
  assert.deepEqual(cardRun('texts'), [{ step: 'text-card', a: 0 }]);
  assert.deepEqual(cardRun('stirs'), []);
});

test('a card title\'s tick stops the processor, and it is ticking until the run goes on', () => {
  const { m, o, events, a } = cardTitle();
  m.cpu.pc = a('turn');
  m.cpu.step();
  assert.deepEqual(events, [{ step: 'tick' }]);
  assert.equal(m.cpu.pc, a('turn'), 'the read waits');
  assert.equal(o.ticking(), 'tick');
  m.cpu.step();
  assert.equal(o.ticking(), null);
  assert.equal(m.cpu.pc, a('turn') + 2, 'the read goes on');
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
