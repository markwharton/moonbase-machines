// The screen's painters, on a colour monitor and on a monochrome one, from made-up bytes.
//
//   node --test packages/apple2e/test/screen.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintHires, paintText, paint, screen, textRow, PHOSPHORS } from '../screen.js';

const GREEN = PHOSPHORS.green, BLACK = [0, 0, 0];
const rgba = () => new Uint8ClampedArray(560 * 384 * 4);
const at = (px, x, y) => [...px.subarray((y * 560 + x) * 4, (y * 560 + x) * 4 + 3)];
// The first row of a hi-res page holding these bytes, painted, as one string of the row's first pixels: # lit, . dark.
const hiresRow = (bytes, ink, n = 28) => {
  const page = new Uint8Array(0x2000); page.set(bytes);
  const px = paintHires(rgba(), page, ink);
  return Array.from({ length: n }, (_, x) => at(px, x, 0).some(v => v) ? '#' : '.').join('');
};

test('a colour monitor shows a lone dot in an even column violet, as before', () => {
  const page = new Uint8Array(0x2000); page[0] = 0x01;
  assert.deepEqual(at(paintHires(rgba(), page), 0, 0), [255, 68, 253]);
});

test('a monochrome monitor shows a lit dot in its phosphor colour and a dark dot black', () => {
  const page = new Uint8Array(0x2000); page[0] = 0x01;
  const px = paintHires(rgba(), page, GREEN);
  assert.deepEqual(at(px, 0, 0), GREEN);
  assert.deepEqual(at(px, 1, 1), GREEN);
  assert.deepEqual(at(px, 2, 0), BLACK);
});

test('a monochrome monitor shows a byte with its high bit set one pixel to the right', () => {
  assert.equal(hiresRow([0x01], GREEN, 4), '##..');
  assert.equal(hiresRow([0x81], GREEN, 4), '.##.');
});

test('a delayed byte after an undelayed one: the undelayed byte\'s last dot is held one pixel longer', () => {
  // (bit 6 lit in the first byte, its last dot at pixels 12 and 13; the second byte delayed, with no dot of its own)
  assert.equal(hiresRow([0x40, 0x80], GREEN, 16), '............###.');
});

test('an undelayed byte after a delayed one: the delayed byte\'s last dot is cut to one pixel', () => {
  // (bit 6 lit in the delayed first byte, its last dot at pixels 13 and 14; the second byte starts on time at 14)
  assert.equal(hiresRow([0xc0, 0x00], GREEN, 16), '.............#..');
});

test('the text screen shows its letters in the phosphor colour on a monochrome monitor, and white on colour', () => {
  const mem = new Uint8Array(0x10000); mem[textRow(0)] = 0x20;   // (an inverse space: every dot of its cell lit)
  assert.deepEqual(at(paintText(rgba(), mem, mem, false, [0, 1]), 0, 0), [255, 255, 255]);
  assert.deepEqual(at(paintText(rgba(), mem, mem, false, [0, 1], GREEN), 0, 0), GREEN);
});

test('double hi-res on a monochrome monitor shows each of a colour\'s four dots lit or dark', () => {
  const cols = new Uint8Array(140 * 192); cols[0] = 0b1010;
  const px = paint(cols, rgba(), null, GREEN);
  assert.deepEqual([0, 1, 2, 3].map(x => at(px, x, 0)), [GREEN, BLACK, GREEN, BLACK]);
});

test('screen() paints every mode for the monitor it is given', () => {
  const mem = new Uint8Array(0x10000); mem[textRow(0)] = 0x20;
  const m = { main: mem, aux: mem, sw: { text: true, mixed: false, dhires: false, col80: false }, screen: () => ({ main: mem.subarray(0x2000, 0x4000), aux: mem }) };
  assert.deepEqual(at(screen(m, rgba(), { ink: GREEN }), 0, 0), GREEN);
  m.sw.text = false; mem[0x2000] = 0x81;
  assert.equal(at(screen(m, rgba(), { ink: GREEN }), 0, 0).some(v => v), false);
  assert.deepEqual(at(screen(m, rgba(), { ink: GREEN }), 1, 0), GREEN);
});
