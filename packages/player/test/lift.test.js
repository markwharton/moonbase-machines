// The lifter (remake/lift.js): a file's 6502 walked into a scene script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lift, script } from '../remake/lift.js';

const lines = (code, routines, options) => {
  const bytes = Uint8Array.from(code);
  return script(lift(bytes, 0x0800, [0x0800], routines), bytes, 0x0800, options).split('\n').filter(l => /^[0-9A-F]{4} /.test(l));
};

test('a jump to a routine is its step, and a return at the jump', () => {
  // LDA #15  LDX #5  JMP $500C
  assert.deepEqual(lines([0xa9, 15, 0xa2, 5, 0x4c, 0x0c, 0x50], { 0x500c: 'dot' }), ['0804  dot 15 5 y', '0804  return']);
});

test('a jump out of the file to code that is no routine stays a jump into the engine', () => {
  assert.deepEqual(lines([0x4c, 0x00, 0x60], { 0x500c: 'dot' }), ['0800  goto-engine $6000']);
});
