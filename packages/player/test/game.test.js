// A game on its machine (remake/game.js): the machine runs the game's own code, and the observer gives its events, as
// the engine the player drives. A small game of each kind stands in for a title's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '@moonbase-machines/mos6502/asm.js';
import { Game } from '../remake/game.js';
import { Clock, FRAME } from '../remake/clock.js';

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

// A card game for time, which starts at the entry given. The unpack routine runs for about 63 ms and reads no keys.
// The take routine waits for a key and gives it. The scene's own loop at `owns` waits for keys with no routine.
const timed = entry => assemble(`
*= $2000
          JMP ${entry}
longs:    JSR long
          JSR take
takes:    JSR take
          JSR take
owns:     LDA $C000
          BPL owns
          STA $C010
          JMP owns
long:     LDY #50
long1:    LDX #0
long2:    DEX
          BNE long2
          DEY
          BNE long1
          RTS
take:     LDA $C000
          BPL take
          STA $C010
          AND #$7F
          RTS
`);
const CYCLES_PER_MS = 1020.484;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} and ${b}`);
// The same, to within the poll of the keyboard (4 cycles) that finds the wait and ends the run.
const nearWait = (a, b) => assert.ok(Math.abs(a - b) <= 4 / CYCLES_PER_MS + 1e-9, `${a} and ${b}`);
const timedGame = (entry, { clock, warp } = {}) => {
  const program = timed(entry), a = name => program.symbols.get(name);
  const map = { routines: { [a('long')]: 'unpack', [a('take')]: 'take' } };
  const game = new Game({ engine: 'card', disk: disk(program.bytes), map, warp }, clock ? { clock } : {});
  const events = [];
  game.on(e => events.push(e));
  return { game, events };
};
// A clock at the original's speed, owed one frame.
const aFrame = () => { const c = new Clock(); c.tick(FRAME); return c; };

test('with no clock given, a run never stops for a frame', () => {
  const { game } = timedGame('longs');
  assert.equal(game.run(), 'idle');
  let arrived = false;
  game.m.reading = { at: game.cycles + 30615, arrive: () => { arrived = true; } };
  assert.equal(game.run(), 'idle');
  assert.ok(arrived, 'a read from the disk arrives at once');
});

test('a run stops when the time owed is spent, and the next run goes on counting the polls', () => {
  const clock = new Clock(), { game } = timedGame('owns', { clock });
  const results = [];
  for (let i = 0; i < 10 && results.at(-1) !== 'idle'; i++) { clock.tick(5); results.push(game.run()); }
  assert.ok(results.filter(r => r === 'frame').length >= 2, `a wait found over several frames: ${results}`);
  assert.equal(results.at(-1), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['read-key'] });
});

test('a step the title warps spends nothing of the time owed, and its cycles are untimed', () => {
  const clock = aFrame(), { game, events } = timedGame('longs', { clock, warp: step => step.step === 'unpack' });
  const start = game.cycles;
  assert.equal(game.run(), 'idle', 'through a step longer than a frame');
  const [from, to] = game.untimed[0];
  assert.equal((to - from) / CYCLES_PER_MS, game.took.get(events[0]));
  // every cycle but the warped step's is spent, the wait's polls among them
  nearWait(clock.owed, FRAME - ((game.cycles - start) - (to - from)) / CYCLES_PER_MS);
});

test('a step the title does not warp spends its cycles at the original\'s speed', () => {
  const clock = aFrame(), { game } = timedGame('longs', { clock, warp: () => false });
  const from = game.cycles;
  assert.equal(game.run(), 'frame');
  assert.equal(game.observer.running, 'unpack');
  assert.ok(clock.owed <= 0);
  near(clock.owed, FRAME - (game.cycles - from) / CYCLES_PER_MS);
});

test('a card game\'s routine that waits spends the clock like any other code', () => {
  const clock = aFrame(), { game } = timedGame('takes', { clock });
  const start = game.cycles;
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['take'] });
  nearWait(clock.owed, FRAME - (game.cycles - start) / CYCLES_PER_MS);
});

// A card game whose scene's own loop takes a turn at `turn`, while the scene is in memory at $AD00, and then waits.
const TURN = assemble(`
*= $2000
turn:     LDA $C000
          STA $C010
          LDY #2
          JSR take
${QUIT}
take:     LDA $C000
          BPL take
          STA $C010
          AND #$7F
          RTS
`);
const SCENE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

test('a card game stops at a turn of its own loop, and goes on with no key', () => {
  const a = name => TURN.symbols.get(name);
  const files = { SCENE: { type: 'BIN', aux: 0xad00, size: SCENE.length, data: b64(SCENE) } };
  const map = { routines: { [a('take')]: 'take' }, ticks: [{ at: a('turn'), scene: 'SCENE' }] };
  const game = new Game({ engine: 'card', disk: disk(TURN.bytes, files), map });
  game.m.main.set(SCENE, 0xad00);
  const events = [];
  game.on(e => events.push(e));
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['tick'] });
  assert.deepEqual(events, [{ step: 'tick' }]);
  game.press(-1);
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['take'] });
  assert.deepEqual(events, [{ step: 'tick' }, { step: 'take', y: 2 }]);
});

// A card game that calls the Monitor's WAIT, which Moonbase's ROM answers with a hook that counts its cycles, then
// waits for a key.
const PAUSE = assemble(`
*= $2000
          LDA #$40
          JSR $FCA8
          LDY #2
          JSR take
${QUIT}
take:     LDA $C000
          BPL take
          STA $C010
          AND #$7F
          RTS
`);

test('a routine answered by a hook that counts its own cycles spends all of its time', () => {
  const map = { routines: { 0xfca8: 'pause', [PAUSE.symbols.get('take')]: 'take' } };
  const clock = new Clock();
  clock.tick(50);
  const game = new Game({ engine: 'card', disk: disk(PAUSE.bytes), map }, { clock });
  const events = [];
  game.on(e => events.push(e));
  const start = game.cycles;
  assert.equal(game.run(), 'idle');
  assert.deepEqual(events[0], { step: 'pause', a: 0x40 });
  // WAIT with A = $40 takes 11,117 cycles with its JSR and RTS; the routine's own time is all but the JSR's 6
  assert.equal(Math.round(game.took.get(events[0]) * CYCLES_PER_MS), 11117 - 6);
  nearWait(clock.owed, 50 - (game.cycles - start) / CYCLES_PER_MS);
});

// A vector game. Its system file turns on auxiliary memory and the alternate zero page, then jumps to the toolkit at
// $4000; with `splash` it waits for a key first. The toolkit begins with a jump to the scene. The ask draws the cap of
// a key it wants, waits for the choice, draws RETURN's cap, and waits for RETURN. The tick is a turn of the game's own
// loop, which reads the keyboard without waiting. The wait waits for a key, and the fill draws for a while. The title's
// own routines are a problem's file at $6000: `edges` calls the fill and then works on its own, and `which-box` waits
// for a key. The map opens `edges` to the view.
const ASKS = `
          LDA #0
          JSR ask
${QUIT}`;
const vectorSource = ({ splash, scene }) => `
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
start:
${scene}
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
tick:     LDA $C000
          STA $C010
          RTS
box:      RTS
wait:     LDA $C000
          BPL wait
          STA $C010
          RTS
fill:     LDX #200
fill1:    DEX
          BNE fill1
          RTS
kitend:

*= $6000
edges:    JSR fill
          LDY #200
edges1:   DEY
          BNE edges1
          RTS
whichbox: LDA $C000
          BPL whichbox
          STA $C010
          RTS
`;
const vectorGame = ({ splash = false, scene = ASKS, warp, clock } = {}) => {
  const program = assemble(vectorSource({ splash, scene })), a = name => program.symbols.get(name);
  const image = new Uint8Array(0x10000);
  image.set(program.bytes, program.origin);
  const file = (from, to) => { const body = image.slice(from, to); return { type: 'BIN', aux: from, size: body.length, data: b64(body) }; };
  const files = { PART0: file(0x4000, a('kitend')), PROB1: file(0x6000, 0x6020) };
  const routines = { [a('ask')]: 'ask', [a('key')]: 'key', [a('tick')]: 'tick', [a('box')]: 'box', [a('wait')]: 'wait', [a('fill')]: 'fill-rows' };
  const map = {
    volume: 'GAME', vars: { zero: 0 }, routines, loads: { PROB: 0x6000 },
    problems: { 1: { [a('edges')]: 'edges', [a('whichbox')]: 'which-box' } }, open: ['edges'],
    ...splash ? { splash: true } : {},
  };
  const game = new Game({ engine: 'vector', disk: disk(image.slice(0x2000, a('sysend')), files), map, warp }, clock ? { clock } : {});
  // The scene, the toolkit and the problem go into auxiliary memory, as the game's loader puts them there. The system
  // file is there too, so that the processor goes on after the switch.
  const load = () => { for (const [from, to] of [[0x0800, a('sceneend')], [0x2000, a('sysend')], [0x4000, a('kitend')], [0x6000, 0x6020]]) game.m.aux.set(image.subarray(from, to), from); };
  const events = [];
  game.on(e => events.push(e));
  return { game, events, load };
};
// The cycle at which each event of the given step is emitted, which is its routine's start.
const startsOf = (game, step) => { const at = []; game.on(e => { if (e.step === step) at.push(game.cycles); }); return at; };

// Two waits of the toolkit's for a key.
const WAITS2 = `
          JSR wait
          JSR wait
${QUIT}`;

test('a toolkit routine that waits spends nothing until it returns, and then owes the time since its last key', () => {
  const clock = aFrame(), { game, load } = vectorGame({ scene: WAITS2, clock });
  const waits = startsOf(game, 'wait');
  load();
  const start = game.cycles;
  assert.equal(game.run(), 'idle');
  // the cycles up to the wait's start, and nothing of its polls
  near(clock.owed, FRAME - (waits[0] - start) / CYCLES_PER_MS);
  const owed = clock.owed;
  game.press(0x41);
  const key = game.cycles;
  assert.equal(game.run(), 'idle');
  // the time from the key to the return, and the JSR to the next wait
  near(clock.owed, owed - (waits[1] - key) / CYCLES_PER_MS);
});

// A title's own routine that waits for a key.
const OWN_WAIT = `
          JSR whichbox
${QUIT}`;

test('a title\'s own routine that waits keeps its time: its polls spend the clock', () => {
  const clock = aFrame(), { game, load } = vectorGame({ scene: OWN_WAIT, clock });
  load();
  const start = game.cycles;
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['which-box'] });
  nearWait(clock.owed, FRAME - (game.cycles - start) / CYCLES_PER_MS);
});

test('a read from the disk takes the clock\'s time, unless the title warps the disk', () => {
  const read = 30615;
  const clock = aFrame(), { game, load } = vectorGame({ scene: WAITS2, clock });
  load();
  game.run();
  let arrived = false;
  clock.owed = 0; clock.tick(FRAME);
  game.m.reading = { at: game.cycles + read, arrive: () => { arrived = true; } };
  assert.equal(game.run(), 'frame');
  assert.equal(arrived, false);
  assert.equal(clock.owed, 0);
  clock.tick(FRAME);
  assert.equal(game.run(), 'idle');
  assert.ok(arrived);
  near(clock.owed, 2 * FRAME - read / CYCLES_PER_MS);

  const warped = aFrame(), other = vectorGame({ scene: WAITS2, clock: warped, warp: step => step.step === 'disk' });
  other.load();
  other.game.run();
  const owed = warped.owed;
  let there = false;
  other.game.m.reading = { at: other.game.cycles + read, arrive: () => { there = true; } };
  assert.equal(other.game.run(), 'idle');
  assert.ok(there, 'it arrives at once');
  assert.equal(warped.owed, owed);
});

// The title's own open routine, then a wait of the toolkit's.
const NESTED = `
          JSR edges
          JSR wait
${QUIT}`;

test('inside a title\'s own routine, a toolkit routine the title warps is warped, and the warp ends with it', () => {
  const clock = aFrame(), { game, events, load } = vectorGame({ scene: NESTED, clock, warp: step => step.step === 'fill-rows' });
  const waits = startsOf(game, 'wait');
  load();
  const start = game.cycles;
  assert.equal(game.run(), 'idle');
  const fill = events.find(e => e.step === 'fill-rows');
  assert.equal(fill.inside, true);
  const [from, to] = game.untimed[0];
  assert.equal((to - from) / CYCLES_PER_MS, game.took.get(fill));
  assert.ok(to < waits[0], 'the stretch is the fill\'s');
  // the rest of the title's routine after the fill is spent, up to the wait's start
  near(clock.owed, FRAME - ((waits[0] - start) - (to - from)) / CYCLES_PER_MS);
  assert.equal(clock.warp, false);
});

test('a warped routine that calls another warped routine is one stretch at warp', () => {
  const warp = step => step.step === 'fill-rows' || step.step === 'edges';
  const clock = aFrame(), { game, events, load } = vectorGame({ scene: NESTED, clock, warp });
  const waits = startsOf(game, 'wait');
  load();
  const start = game.cycles;
  assert.equal(game.run(), 'idle');
  const warped = game.untimed.filter(([, to]) => to <= waits[0]);
  assert.equal(warped.length, 1);
  const [from, to] = warped[0];
  assert.equal((to - from) / CYCLES_PER_MS, game.took.get(events.find(e => e.step === 'edges')));
  near(clock.owed, FRAME - ((waits[0] - start) - (to - from)) / CYCLES_PER_MS);
});

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

// Two turns of the game's own loop, each drawing a box, then a wait for a key. The title warps a box unless the game
// is in a turn.
const TURNS = `
          JSR box
          JSR tick
          JSR box
          JSR tick
          JSR box
          JSR wait
${QUIT}`;

test('the game is turning from a turn\'s end until it waits, and a warp can read it', () => {
  const asked = [];
  const warp = (step, game) => { const w = step.step === 'box' && !game.turning; asked.push([step.step, w]); return w; };
  const { game, load } = vectorGame({ scene: TURNS, warp });
  load();
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['tick'] });
  assert.equal(game.turning, false, 'the first turn has not ended');
  game.press(-1);
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['tick'] });
  assert.equal(game.turning, true);
  game.press(-1);
  assert.equal(game.run(), 'idle');
  assert.deepEqual(game.waitingOn, { words: ['wait'] });
  assert.equal(game.turning, false);
  assert.deepEqual(asked, [['box', true], ['tick', false], ['box', false], ['tick', false], ['box', false], ['wait', false]]);
});
