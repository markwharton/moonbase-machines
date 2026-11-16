// The Remake's engine for an Apple title (engines/scenes.js): the view a game is drawn by, the driver's own before its
// toolkit's, and what a view is given: the stage, a key to give the game as a person gives one, the settings and a
// place on the options line; and the keys a view takes before the game does. A small card game stands in for a title's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '@moonbase-machines/mos6502/asm.js';
import { play } from '../engines/scenes.js';

const b64 = bytes => btoa(String.fromCharCode(...bytes));
// A ProDOS game that waits for a key, again and again.
const GAME = assemble(`
*= $2000
start:    JSR take
          JMP start
take:     LDA $C000
          BPL take
          STA $C010
          RTS
`);
const disk = { kind: 'prodos', system: 'GAME.SYSTEM', volumes: { GAME: { 'GAME.SYSTEM': { type: 'SYS', aux: 0x2000, size: GAME.bytes.length, data: b64(GAME.bytes) } } } };
const map = { routines: { [GAME.symbols.get('take')]: 'take' }, steps: { take: { gives: 'a', waits: true } } };

// (a browser's audio, as much of it as the speaker asks for when a key starts it)
globalThis.AudioContext ??= class { constructor() { Object.assign(this, { audioWorklet: { addModule: async () => {} }, sampleRate: 48000, state: 'running', destination: {} }); } };
globalThis.AudioWorkletNode ??= class { connect() {} };

// The engine given a driver's title, as play.js gives it one: the stage, the game's data and its saves, each setting
// at its default, and the options line.
const engine = title => {
  const stage = { stage: true }, control = () => {}, setting = def => ({ value: def.default, on() { return this; } });
  const g = { title: { map, ...title }, game: disk, stage, saves: { data: disk, keep() {} }, say() {}, fail: err => { throw err; }, setting, control, mini: null, pace: () => 1 };
  return { stage, control, setting, handle: play(g) };
};
const keydown = { type: 'keydown', repeat: false, preventDefault() {} };

test('a driver\'s view is used before its toolkit\'s, and is given the stage, the game, a key to give it, the settings and the options line', async () => {
  const made = [];
  const toolkit = { view: () => { made.push('the toolkit\'s'); return {}; } };
  const { stage, control, setting, handle } = engine({ toolkit, view: (on, options) => { made.push({ on, options }); return {}; } });
  const { engine: game } = await handle;
  assert.equal(made.length, 1);
  const [{ on, options }] = made;
  assert.equal(on, stage, 'the stage');
  assert.equal(options.engine, game);
  assert.equal(options.disk, disk);
  assert.equal(typeof options.press, 'function');
  assert.equal(options.setting, setting);
  assert.equal(options.control, control);
  assert.equal(typeof options.svg, 'function', 'the SVG the plain view draws on, made only when asked for');
  assert.equal(options.inset, null, 'the mini view is the plain view\'s');
  const kit = engine({ toolkit });
  await kit.handle;
  assert.deepEqual(made.slice(1), ['the toolkit\'s'], 'with no view of the driver\'s own, the toolkit\'s');
});

test('a view\'s claim takes a key before the game does, and its press gives the game one', async () => {
  let press = null;
  const claimed = [];
  const { handle } = engine({ view: (stage, options) => { press = options.press; return { claim: k => { claimed.push(k); return k === 0x51; } }; } });
  const { engine: game, key } = await handle;
  key(keydown, 0x51);
  assert.deepEqual(game.keys, [], 'Q taken by the view');
  key(keydown, 0x41);
  key({ ...keydown, type: 'keyup' }, 0x41);
  key({ ...keydown, repeat: true }, 0x41);
  assert.deepEqual(game.keys, [0x41], 'A the game\'s, once');
  assert.deepEqual(claimed, [0x51, 0x41], 'the view asked for each key pressed, and for no key let go or held');
  press(0x42);
  assert.deepEqual(game.keys, [0x41, 0x42], 'B given by the view');
});

test('the Speed setting says whether the title is asked what warps: Turbo asks, Original does not', async () => {
  const { SPEED } = await import('../declared.js');
  let change = null;
  const stage = { stage: true }, control = () => {};
  const setting = def => ({ value: def.default, on(f) { if (def === SPEED) change = f; return this; } });
  const g = { title: { map, warp: () => true, view: () => ({}) }, game: disk, stage, saves: { data: disk, keep() {} }, say() {}, fail: err => { throw err; }, setting, control, mini: null, pace: () => 1 };
  const { engine: game } = await play(g);
  assert.equal(SPEED.default, 'turbo');
  assert.equal(game.turbo, true, 'Turbo to begin with');
  change('original');
  assert.equal(game.turbo, false);
  assert.equal(game.warps({ step: 'take' }), false, 'on Original no step warps');
  change('turbo');
  assert.equal(game.warps({ step: 'take' }), true);
});

test('a monochrome monitor is a filter over a view that does not paint it, and the view that paints it has none', async () => {
  const { monitorMatrix } = await import('../engines/scenes.js');
  const { MONITOR } = await import('../declared.js');
  // (white: every colour its brightness, the same in red, green and blue)
  assert.equal(monitorMatrix([255, 255, 255]), '0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0');
  // (a stage with as much of a page as the filter asks for, and the Monitor setting on Green)
  const stageOf = () => { const stage = { style: {}, held: [], querySelector: () => stage.held[0] ?? null, append(el) { stage.held.push(el); } }; return stage; };
  globalThis.document = { createElementNS: () => ({ attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) };
  const green = def => ({ value: def === MONITOR ? 'green' : def.default, on() { return this; } });
  const playOn = (stage, title) => play({ title: { map, ...title }, game: disk, stage, saves: { data: disk, keep() {} }, say() {}, fail: err => { throw err; }, setting: green, control() {}, mini: null, pace: () => 1 });
  const own = stageOf();
  await playOn(own, { view: () => ({}) });
  assert.equal(own.style.filter, 'url(#monitor-green)');
  assert.equal(own.held.length, 1, 'the filters, kept in the stage');
  for (const name of Object.keys(MONITOR.phosphors)) assert.ok(own.held[0].innerHTML.includes(`<filter id="monitor-${name}"`), name);
  const painted = stageOf();
  let view = null;
  await playOn(painted, { view: () => (view = { paintsMonitor: true }) });
  assert.equal(painted.style.filter, undefined, 'no filter over a view that paints the monitor');
  assert.equal(view.monitor, 'green', 'the view is given the monitor to paint');
  delete globalThis.document;
});
