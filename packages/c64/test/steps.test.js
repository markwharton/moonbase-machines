// The KERNAL as steps (steps.js): its jump table by address, and what each routine takes and gives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KERNAL, STEPS } from '@moonbase-machines/c64/steps.js';

test('the jump table: each entry three bytes after the one before it, from $FF81, and each name once', () => {
  for (const at of Object.keys(KERNAL).map(Number)) assert.equal((at - 0xff81) % 3, 0, '$' + at.toString(16));
  const names = Object.values(KERNAL);
  assert.equal(new Set(names).size, names.length);
});

test('each step takes and gives registers, A, X and Y and the carry, and nothing else', () => {
  for (const [name, step] of Object.entries(STEPS)) {
    for (const [k, v] of Object.entries(step)) { assert.ok(k === 'takes' || k === 'gives', `${name}: ${k}`); assert.match(v, /^[axyc]+$/, `${name}: ${k}`); }
  }
  assert.deepEqual(STEPS.load, { takes: 'axy', gives: 'cxy' });
});
