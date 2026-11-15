// The lifter (remake/lift.js): a file's 6502 walked into a listing, a step or a statement to a line.
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

test('a byte of a call\'s data that the code writes is named by its address', () => {
  const code = [
    0xa9, 0xbf, 0x8d, 0x09, 0x08,   // $0800 LDA #$BF  STA $0809: the text's second character
    0x20, 0x00, 0x60, 0xc1, 0xbf, 0x80,   // $0805 JSR $6000, the text "A?" at $0808
    0xa9, 0x01, 0x9d, 0x16, 0x08,   // $080B LDA #1  STA $0816,X: the sound's fourth byte, or a later one
    0x20, 0x00, 0x70, 1, 2, 3, 4, 5,   // $0810 JSR $7000, the sound's five bytes at $0813
    0x60,
  ];
  assert.deepEqual(lines(code, { 0x6000: 'text', 0x7000: 'sound' }).filter(l => /text|sound/.test(l)), ['0805  text "A{$0809}"', '0810  sound 1 2 3 $0816 $0817']);
});

test('a routine in the file, reached by a jump or by running on into it, is its step and a return there', () => {
  // $0800 LDA #1  JMP $0806  $0805 RTS  $0806 the routine's code, DEX  RTS
  assert.deepEqual(lines([0xa9, 1, 0x4c, 0x06, 0x08, 0x60, 0xca, 0x60], { 0x0806: 'jump' }), ['0800  a = 1', '0802  goto L0806', '0806  jump a', '0806  return']);
});

test('a key cap\'s character is quoted with its high bit set, and else its number', () => {
  // LDA #$C1  JSR $7000  LDA #$0D  JSR $7000  RTS
  assert.deepEqual(lines([0xa9, 0xc1, 0x20, 0x00, 0x70, 0xa9, 0x0d, 0x20, 0x00, 0x70, 0x60], { 0x7000: 'key' }).filter(l => /key/.test(l)), ['0802  key "A"', '0807  key 13']);
});

test('a jump out of the file to code that is no routine stays a jump into the engine', () => {
  assert.deepEqual(lines([0x4c, 0x00, 0x60], { 0x500c: 'dot' }), ['0800  goto-engine $6000']);
});
