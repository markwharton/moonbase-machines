// The speaker (audio.js): a run of the machine's cycles as a wave, the clicks toggling it, the spans that took no time
// left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Speaker } from '../audio.js';

// a speaker whose worklet keeps what it is given, at a rate of a sample every 10 cycles
const speaker = () => {
  const s = new Speaker(), waves = [];
  s.node = { port: { postMessage: w => waves.push([...w]) } };
  s.rate = 1020484 / 10;
  return { s, waves };
};

test('a run of cycles is a sample every 10 cycles, a click turning the level over', () => {
  const { s, waves } = speaker();
  s.feed([], 0);
  s.feed([25], 50);
  assert.deepEqual(waves, [[0, 0, 0.25, 0.25, 0.25]]);
});

test('a span of cycles that took no time is left out of the wave', () => {
  const { s, waves } = speaker();
  s.feed([], 0);
  s.feed([15], 1050, [[20, 1020]]);
  assert.deepEqual(waves, [[0, 0.25, 0.25, 0.25, 0.25]], 'the 20 cycles before the span and the 30 after it');
});

test('a span that ended before the last call leaves nothing out', () => {
  const { s, waves } = speaker();
  s.feed([], 100);
  s.feed([], 150, [[20, 80]]);
  assert.equal(waves[0].length, 5);
});
