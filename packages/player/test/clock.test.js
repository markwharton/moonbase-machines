// The Remake's clock (remake/clock.js): a frame of the original's time at a time, at the page's pace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock } from '../remake/clock.js';

// An engine that runs a millisecond of the original's time a step, as Engine.run does: it stops a frame ahead
// ('frame'), or after as many steps as a run takes at most ('steps'), and waits for a key where `waits` says, or at a
// turn of its own loop every `turns` milliseconds, which takes the key down or none.
const engine = ({ waits = [], turns = 0 } = {}) => ({
  delay: 0, time: 0, keys: [], waitingOn: null, taken: [],
  press(k) { this.keys.push(k); },
  run() {
    for (let n = 0; n < 1e5; n++) {
      if (this.waitingOn) { if (!this.keys.length) return 'idle'; this.taken.push(this.keys.shift()); this.waitingOn = null; }
      this.time++; this.delay++;
      if (waits.includes(this.time)) { this.waitingOn = { words: ['wait'] }; return 'idle'; }
      if (turns && this.time % turns === 0) { this.waitingOn = { words: ['tick'] }; return 'idle'; }
      if (this.delay >= 16) return 'frame';
    }
    return 'steps';
  },
});
const frames = (c, n) => { for (let i = 0; i < n; i++) c.frame(); };

test('at pace 1 each frame runs a sixtieth of a second of the original\'s time', () => {
  const e = engine(), c = clock(e);
  frames(c, 60);
  assert.ok(e.time >= 1000 && e.time <= 1017, `a second and a frame ahead at most: ${e.time} ms`);
});

test('at a pace of a half each frame runs twice as much', () => {
  const e = engine(), c = clock(e, { pace: () => 0.5 });
  frames(c, 60);
  assert.ok(e.time >= 2000 && e.time <= 2017, `${e.time} ms`);
});

test('at pace 0 the game runs until it waits', () => {
  const e = engine({ waits: [5000] }), c = clock(e, { pace: () => 0 });
  c.frame();
  assert.equal(e.time, 5000);
  assert.ok(c.waiting);
});

test('a wait is the player\'s time: nothing runs until the key, and the frame after it runs a frame\'s worth', () => {
  const e = engine({ waits: [100] }), c = clock(e);
  frames(c, 10);
  assert.equal(e.time, 100);
  assert.ok(c.waiting);
  frames(c, 600);
  assert.equal(e.time, 100, 'ten seconds with no key');
  e.press(32);
  c.frame();
  assert.ok(e.time > 100 && e.time <= 117, `a frame from the key, not ten seconds caught up: ${e.time} ms`);
  assert.ok(!c.waiting);
});

test('what the engine did is heard at pace 1 only', () => {
  let p = 1;
  const c = clock(engine(), { pace: () => p });
  assert.equal(c.frame().heard, true);
  p = 0.5; assert.equal(c.frame().heard, false);
  p = 0; assert.equal(c.frame().heard, false);
});

test('a game\'s own loop turns to the frame\'s end, each turn with the key tapped, the key held or none', () => {
  const e = engine({ turns: 4 }), c = clock(e);
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
  const e = engine({ turns: 4 }), c = clock(e, { pace: () => 0 });
  frames(c, 3);
  assert.deepEqual(e.taken, [-1, -1]);
});

test('a game that goes on as it waits is never waiting', () => {
  const e = engine({ waits: [10] }), c = clock(e, { goesOn: true });
  frames(c, 2);
  assert.ok(!c.waiting);
});
