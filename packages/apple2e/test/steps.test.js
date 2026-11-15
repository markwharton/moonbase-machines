// The ROM's routines and ProDOS's call as steps (steps.js): what each takes, and the data after a call read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, bytes } from '@moonbase-machines/apple2e/steps.js';

test('each step takes registers, A, X and Y, or data after its call', () => {
  for (const [name, step] of Object.entries(STEPS)) {
    if (step.takes !== undefined) assert.match(step.takes, /^[axy]+$/, name);
    assert.ok(step.takes !== undefined || step.inline, name);
  }
});

test('ProDOS\'s call: its number and its parameters\' address, three bytes after the JSR, in hexadecimal', () => {
  const mem = [0x20, 0x00, 0xbf, 0xc8, 0x10, 0x03];
  assert.deepEqual(STEPS.prodos.inline(a => mem[a], 3), { length: 3, value: 'c8 10 3' });
  assert.deepEqual(bytes(2)(a => mem[a], 0), { length: 2, value: '20 0' });
});
