// The Remake's clock (remake/clock.js): a frame of the original's time at a time, at the page's pace, on the game's
// own `Clock`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock, Clock, toWait } from '../remake/clock.js';

const frames = (c, n) => { for (let i = 0; i < n; i++) c.frame(); };

test('a tick owes the frame\'s time divided by the scale', () => {
  const at1 = new Clock(), atHalf = new Clock({ scale: 0.5 });
  at1.tick(10); atHalf.tick(10);
  assert.equal(at1.owed, 10);
  assert.equal(atHalf.owed, 20);
});

test('a clock never leaves more than two frames owed', () => {
  const c = new Clock();
  for (let i = 0; i < 5; i++) c.tick(10);
  assert.equal(c.owed, 20);
});

test('at scale 0 a clock owes nothing, and the machine runs free', () => {
  const c = new Clock({ scale: 0 });
  c.tick(10);
  assert.equal(c.owed, 0);
  assert.ok(c.free);
});

test('a clock that warps runs free', () => {
  const c = new Clock();
  assert.ok(!c.free);
  c.warp = true;
  assert.ok(c.free);
});

// A game on its machine, as much of one as the frames use: it runs a millisecond of the original's time a step and
// spends it from its clock, unless the clock runs free. It stops when the time owed is spent ('frame'), and waits for
// a key where `waits` says, or at a turn of its own loop every `turns` milliseconds, which takes the key down or none.
const game = ({ waits = [], turns = 0 } = {}) => ({
  clock: new Clock(), time: 0, keys: [], waitingOn: null, taken: [],
  press(k) { this.keys.push(k); },
  run() {
    for (let n = 0; n < 1e5; n++) {
      if (this.waitingOn) { if (!this.keys.length) return 'idle'; this.taken.push(this.keys.shift()); this.waitingOn = null; }
      this.time++;
      if (!this.clock.free) this.clock.owed -= 1;
      if (waits.includes(this.time)) { this.waitingOn = { words: ['wait'] }; return 'idle'; }
      if (turns && this.time % turns === 0) { this.waitingOn = { words: ['tick'] }; return 'idle'; }
      if (!this.clock.free && this.clock.owed <= 0) return 'frame';
    }
    return 'steps';
  },
});

test('a frame ticks the clock and runs the game while time is owed', () => {
  const e = game(), c = clock(e);
  c.frame();
  assert.equal(e.time, 17, 'a frame\'s 16.7 ms, to the millisecond that spends it');
  frames(c, 59);
  assert.ok(e.time >= 1000 && e.time <= 1001, `a second: ${e.time} ms`);
});

test('at a pace of a half each frame runs twice as much', () => {
  const e = game(), c = clock(e, { pace: () => 0.5 });
  frames(c, 60);
  assert.ok(e.time >= 2000 && e.time <= 2001, `two seconds: ${e.time} ms`);
});

test('a wait stops the frames until a key and leaves nothing owed', () => {
  const e = game({ waits: [5] }), c = clock(e);
  c.frame();
  assert.equal(e.time, 5);
  assert.ok(c.waiting);
  assert.equal(e.clock.owed, 0);
  assert.equal(c.frame().ran, false);
  e.press(32);
  c.frame();
  assert.deepEqual(e.taken, [32]);
  assert.equal(e.time, 5 + 17, 'a frame from the key');
});

test('at pace 0 the game runs until it waits', () => {
  const e = game({ waits: [5000] }), c = clock(e, { pace: () => 0 });
  c.frame();
  assert.equal(e.time, 5000);
  assert.ok(c.waiting);
});

test('what the game did is heard at pace 1 only', () => {
  let p = 1;
  const c = clock(game(), { pace: () => p });
  assert.equal(c.frame().heard, true);
  p = 0.5; assert.equal(c.frame().heard, false);
  p = 0; assert.equal(c.frame().heard, false);
});

test('a game\'s own loop turns with the key tapped, the key held or none', () => {
  const e = game({ turns: 4 }), c = clock(e);
  c.keys.held = 21;
  frames(c, 2);
  const n = e.taken.length;
  assert.ok(n >= 8 && e.taken.every(k => k === 21), `a turn every 4 ms to the frame's end, the key held: ${e.taken}`);
  c.keys.held = null; c.keys.tapped = 8;
  c.frame();
  assert.deepEqual(e.taken.slice(n), [8, -1, -1, -1], 'a frame\'s four turns, the tapped key and then none');
  assert.ok(!c.waiting);
});

test('at pace 0 a game\'s own loop turns once a frame', () => {
  const e = game({ turns: 4 }), c = clock(e, { pace: () => 0 });
  frames(c, 3);
  assert.deepEqual(e.taken, [-1, -1]);
});

test('toWait runs a game to its wait whatever its clock\'s scale, and puts the scale back', () => {
  const e = game({ waits: [3000] });
  e.clock.scale = 0.5;
  assert.equal(toWait(e), 'idle');
  assert.equal(e.time, 3000);
  assert.equal(e.clock.owed, 0, 'the game ran free, spending nothing');
  assert.equal(e.clock.scale, 0.5);
});
