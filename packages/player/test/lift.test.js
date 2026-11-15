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

test('a table read as addresses is followed as code, unless data begins there', () => {
  // LDA $0810,X  STA $00  LDA $0811,X  STA $01  RTS, then the table at $0810: $0812, and an RTS at $0812
  const code = [0xbd, 0x10, 0x08, 0x85, 0x00, 0xbd, 0x11, 0x08, 0x85, 0x01, 0x60, 0, 0, 0, 0, 0, 0x12, 0x08, 0x60];
  const walked = data => { const b = Uint8Array.from(code); return lift(b, 0x0800, [0x0800], {}, new Set(data)).lines.has(0x0812); };
  assert.equal(walked([]), true);
  assert.equal(walked([0x0810]), false);
});

test('a jump out of the file to code that is no routine stays a jump into the engine', () => {
  assert.deepEqual(lines([0x4c, 0x00, 0x60], { 0x500c: 'dot' }), ['0800  goto-engine $6000']);
});
