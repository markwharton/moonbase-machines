// The page's keys (browser.js `keyboard`, keys.js). Each key is one key of the 64's and nothing else. The arrows are its
// cursor keys and never the joystick. Control is the Commodore key and never fire. Option is fire only for a game that
// names it as its fire key. Shift with Home is CLR, and Shift with DEL is INST. ` is the 64's ←, and \ is its £. Each
// test stands in for a key pressed on a page, and checks what the 64's matrix and joystick get from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboard } from '@moonbase-machines/c64/browser.js';

globalThis.window ??= { addEventListener() {} };
globalThis.document ??= { addEventListener() {}, hidden: false };

// a 64 that keeps what it is told: the matrix's keys down, and the joystick
function page(options = {}) {
  const m = { keys: new Uint8Array(8), joystick: 0, vic: { r: Object.assign(new Uint8Array(0x40), { 0x18: 0x15 }) },
    key(column, row, down) { if (down) this.keys[column] |= 1 << row; else this.keys[column] &= ~(1 << row); } };
  const on = { keydown: [], keyup: [] };
  keyboard(m, { listen: (type, f) => on[type].push(f), ...options });
  const event = (key, code, mods = {}) => ({ key, code, metaKey: false, repeat: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() {}, ...mods });
  const press = (key, code = key, mods) => { const e = event(key, code, mods); on.keydown.forEach(f => f(e)); };
  const lift = (key, code = key, mods) => { const e = event(key, code, mods); on.keyup.forEach(f => f(e)); };
  // the 64's keys down, as [column, row], in order
  const down = () => [...m.keys].flatMap((bits, column) => Array.from({ length: 8 }, (_, row) => bits & 1 << row ? [[column, row]] : []).flat());
  return { m, press, lift, down };
}
const SHIFT = [1, 7];

test('an arrow is a cursor key and nothing else: down and right as they are, up and left with Shift', () => {
  for (const [key, keys] of [['ArrowDown', [[0, 7]]], ['ArrowRight', [[0, 2]]], ['ArrowUp', [[0, 7], SHIFT]], ['ArrowLeft', [[0, 2], SHIFT]]]) {
    const { m, press, down } = page();
    press(key);
    assert.deepEqual(down(), keys, key);
    assert.equal(m.joystick, 0, `${key}: not the joystick`);
  }
});

test('Control is the Commodore key, Shift and Option nothing of their own, and none of them fire', () => {
  for (const [key, keys] of [['Control', [[7, 5]]], ['Shift', []], ['Alt', []]]) {
    const { m, press, down } = page();
    press(key, key + 'Left');
    assert.deepEqual(down(), keys, key);
    assert.equal(m.joystick, 0, `${key}: not fire`);
  }
});

test('Shift with Home is CLR, with DEL INST, with F1 F2; and Home, DEL and F1 alone as they are', () => {
  for (const [key, shift] of [['Home', true], ['Backspace', true], ['Delete', true], ['F1', true], ['Home', false], ['Backspace', false]]) {
    const { press, down } = page();
    press(key, key, { shiftKey: shift });
    assert.equal(down().some(([c, r]) => c === SHIFT[0] && r === SHIFT[1]), shift, `${shift ? 'Shift and ' : ''}${key}`);
  }
});

test('` is the 64\'s ←, \\ its £, and £ itself and _ still as they were, none with Shift', () => {
  for (const [key, code, at] of [['`', 'Backquote', [7, 1]], ['\\', 'Backslash', [6, 0]], ['£', 'Digit3', [6, 0]], ['_', 'Minus', [7, 1]]]) {
    const { press, down } = page();
    press(key, code);
    assert.deepEqual(down(), [at], key);
  }
});

test('a game that names Option its fire (CRAYON): Option held is the joystick\'s fire, the arrows with it the stick, and let go is fire let go', () => {
  const { m, press, lift, down } = page({ fire: 'Alt' });
  press('Alt', 'AltLeft');
  assert.equal(m.joystick, 16, 'fire');
  assert.deepEqual(down(), [], 'Option nothing else');
  press('ArrowDown', 'ArrowDown', { altKey: true });
  assert.deepEqual(down(), [], 'with Option held an arrow is the stick, not the cursor');
  assert.equal(m.joystick, 16 | 2, 'fire and down');
  lift('ArrowDown', 'ArrowDown', { altKey: true });
  assert.equal(m.joystick, 16, 'the stick back, fire held');
  lift('Alt', 'AltLeft');
  assert.equal(m.joystick, 0, 'fire let go');
  press('ArrowDown');
  assert.deepEqual(down(), [[0, 7]], 'without Option, the arrow the cursor key again');
  assert.equal(m.joystick, 0, 'and not the stick');
  assert.throws(() => page({ fire: 'Control' }), /cannot be the fire/, 'a key macOS takes with the arrows refused');
});
