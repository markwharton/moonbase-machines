// A step as an event (remake/events.js): its name and the inputs its step's definition says it takes, and its result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, result } from '../remake/events.js';

const regs = { a: 0xc1, x: 0x5a, y: 0x68, c: 1 };

test('a step is its name, any fixed input, and the registers its definition takes, in order', () => {
  assert.deepEqual(describe('panel', { takes: 'ya' }, ['3'], regs), { step: 'panel', n: [3], y: 0x68, a: 0xc1 });
  assert.deepEqual(describe('show', undefined, [], regs), { step: 'show' });
});

test('a table\'s address in X and Y, a character in A, and A alone where the routine puts back what it kept', () => {
  assert.deepEqual(describe('objects', { takes: 'xy', table: true }, [], regs), { step: 'objects', table: '$685A' });
  assert.deepEqual(describe('key', { takes: 'a', character: true }, [], regs), { step: 'key', a: 'A' });
  assert.deepEqual(describe('object', { takes: 'axy', restores: true }, [], { ...regs, a: 1 }), { step: 'object', a: 1 });
  assert.deepEqual(describe('object', { takes: 'axy', restores: true }, [], { ...regs, a: 2 }), { step: 'object', a: 2, x: 0x5a, y: 0x68 });
});

test('the inputs from the zero page and from memory, then the data inline, after the registers', () => {
  const read = at => at + 1, peek = at => at & 0xff, step = { takes: 'a', zero: { x0: 0, color: 0x11 }, memory: { shape: 0x0e15 } };
  assert.deepEqual(describe('line', step, [], regs, 'HI', read, peek), { step: 'line', a: 0xc1, x0: 1, color: 0x12, shape: 0x15, words: 'HI' });
  assert.deepEqual(describe('line', step, [], regs), { step: 'line', a: 0xc1 }, 'with nothing to read them through, none');
});

test('a result is the registers its definition gives', () => {
  assert.deepEqual(result('ask', { gives: 'axc' }, regs), { result: 'ask', a: 0xc1, x: 0x5a, c: 1 });
});
