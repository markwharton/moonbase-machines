// A game on its machine (remake/game.js): the machine runs the game's own code, and the observer gives its events, as
// the engine the player drives. A small game of each kind stands in for a title's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '@moonbase-machines/mos6502/asm.js';
import { Game } from '../remake/game.js';

const b64 = bytes => btoa(String.fromCharCode(...bytes));
// A ProDOS game whose system file is `system`, with the other files given.
const disk = (system, files = {}) => ({
  kind: 'prodos', system: 'GAME.SYSTEM',
  volumes: { GAME: { 'GAME.SYSTEM': { type: 'SYS', aux: 0x2000, size: system.length, data: b64(system) }, ...files } },
});
// ProDOS's QUIT, as a game calls it, with its four parameters.
const QUIT = `
          JSR $BF00
          .byte $65
          .word params
params:   .byte 4, 0, 0, 0, 0, 0, 0`;

// A card game, all of it in its system file. The arrow routine takes ten cycles. The unpack routine is busy, and polls
// the keyboard 2,560 times as it works. The take routine waits for a key and gives it.
const CARD = assemble(`
*= $2000
start:    LDA #1
          JSR arrow
          LDY #4
          JSR unpack
          LDY #2
          JSR take
${QUIT}
arrow:    LDX #2
          LDY #3
          RTS
unpack:   LDY #10
outer:    LDX #0
inner:    LDA $C000
          DEX
          BNE inner
          DEY
          BNE outer
          RTS
take:     LDA $C000
          BPL take
          STA $C010
          AND #$7F
          RTS
`);
const cardGame = () => {
  const a = name => CARD.symbols.get(name);
  const game = new Game({ engine: 'card', disk: disk(CARD.bytes), map: { routines: { [a('arrow')]: 'arrow', [a('unpack')]: 'unpack', [a('take')]: 'take' } } });
  const events = [];
  game.on(e => events.push(e));
  return { game, events };
};

test('a run gives the events and stops where the game waits for a key, in the routine that waits', () => {
  const { game, events } = cardGame();
  assert.equal(game.run(), 'idle');
  assert.deepEqual(events, [{ step: 'arrow', a: 1 }, { step: 'unpack', y: 4 }, { step: 'take', y: 2 }]);
  assert.deepEqual(game.waitingOn, { words: ['take'] });
});

test('a routine busy polling the keyboard does not stop the run', () => {
  const { game, events } = cardGame();
  game.run();
  assert.equal(events.at(-1).step, 'take', 'the run went on through the unpack routine');
});

test('a key pressed goes to the game at the next run, and onKey hears it', () => {
  const { game, events } = cardGame(), heard = [];
  game.onKey(k => heard.push(k));
  game.run();
  game.press(0x43);
  game.run();
  assert.deepEqual(heard, [0x43]);
  assert.deepEqual(events.at(-1), { result: 'take', a: 0x43 });
});

test('took holds the time of the outermost step, in milliseconds', () => {
  const { game, events } = cardGame();
  game.run();
  assert.equal(game.took.get(events[0]), 10 / 1020.484);
});

test('ProDOS\'s QUIT ends the game', () => {
  const { game } = cardGame();
  game.run();
  game.press(0x43);
  assert.equal(game.run(), 'end');
  assert.equal(game.ended, true);
  assert.equal(game.run(), 'end');
});

// A vector game. Its system file turns on auxiliary memory and the alternate zero page, then jumps to the toolkit at
// $4000; with `splash` it waits for a key first. The toolkit begins with a jump to the scene. The ask draws the cap of
// a key it wants, waits for the choice, draws RETURN's cap, and waits for RETURN.
const vectorSource = splash => `
*= $2000
${splash ? `loader:   LDA $C000
          BPL loader
          STA $C010` : ''}
          STA $C009
          STA $C003
          STA $C005
          JMP $4000
sysend:

*= $0800
start:    LDA #0
          JSR ask
${QUIT}
sceneend:

*= $4000
          JMP start
          JMP ask
          JMP key
ask:      LDA #$C1
          JSR key
choose:   LDA $C000
          BPL choose
          STA $C010
          LDA #$0D
          JSR key
confirm:  LDA $C000
          BPL confirm
          STA $C010
          AND #$7F
          LDX #0
          RTS
key:      RTS
kitend:
`;
const vectorGame = ({ splash = false } = {}) => {
  const program = assemble(vectorSource(splash)), a = name => program.symbols.get(name);
  const image = new Uint8Array(0x10000);
  image.set(program.bytes, program.origin);
  const part0 = image.slice(0x4000, a('kitend'));
  const files = { PART0: { type: 'BIN', aux: 0x4000, size: part0.length, data: b64(part0) } };
  const map = { volume: 'GAME', vars: { zero: 0 }, routines: { [a('ask')]: 'ask', [a('key')]: 'key' }, ...splash ? { splash: true } : {} };
  const game = new Game({ engine: 'vector', disk: disk(image.slice(0x2000, a('sysend')), files), map });
  // The scene and the toolkit go into auxiliary memory, as the game's loader puts them there. The system file is there
  // too, so that the processor goes on after the switch.
  const load = () => { for (const [from, to] of [[0x0800, a('sceneend')], [0x2000, a('sysend')], [0x4000, a('kitend')]]) game.m.aux.set(image.subarray(from, to), from); };
  const events = [];
  game.on(e => events.push(e));
  return { game, events, load };
};

test('a vector game runs in auxiliary memory', () => {
  const { game, events, load } = vectorGame();
  load();
  assert.equal(game.mem, game.m.aux);
  assert.equal(game.run(), 'idle');
  assert.deepEqual(events, [{ step: 'ask', a: 0 }]);
  assert.deepEqual(game.waitingOn, { words: ['ask'] });
});

test('the ask\'s mode is its A, and the key chosen is asked once the ask draws RETURN\'s cap', () => {
  const { game, events, load } = vectorGame();
  load();
  game.run();
  assert.equal(game.askMode, 0);
  assert.equal(game.asked, null, 'no key chosen yet');
  game.press(0x43);
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.asked, { place: 2 });
  game.press(0x0d);
  assert.equal(game.run(), 'end');
  assert.equal(game.asked, null, 'the ask is over');
  assert.deepEqual(events.at(-1), { result: 'ask', a: 0x0d, x: 0 });
});

test('a wait before the toolkit is in memory is the splash, given once', () => {
  const { game, events, load } = vectorGame({ splash: true });
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['splash'] });
  assert.equal(game.run(), 'idle');
  assert.deepEqual(events, [{ step: 'splash', inside: true }]);
  load();
  game.press(0x20);
  assert.equal(game.run(), 'idle');
  assert.deepEqual(events, [{ step: 'splash', inside: true }, { step: 'ask', a: 0 }]);
  assert.deepEqual(game.waitingOn, { words: ['ask'] });
});
