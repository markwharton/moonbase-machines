// The 64's colours on a monochrome monitor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, shades } from '../vic.js';

test('a monochrome monitor shows each of the 64\'s colours as its brightness in the phosphor\'s colour', () => {
  const white = shades([255, 255, 255]);
  assert.equal(white.length, PALETTE.length);
  assert.deepEqual(white[0], [0, 0, 0], 'black stays black');
  assert.deepEqual(white[1], [255, 255, 255], 'white is the phosphor at its brightest');
  for (const [r, g, b] of white) assert.ok(r === g && g === b, 'a white phosphor shows greys');
  // (yellow is brighter than blue, as it is on a black and white television)
  assert.ok(white[7][0] > white[6][0]);
  const green = shades([51, 255, 51]);
  assert.deepEqual(green[1], [51, 255, 51], 'white is the phosphor\'s own colour');
  assert.deepEqual(green[0], [0, 0, 0]);
});
