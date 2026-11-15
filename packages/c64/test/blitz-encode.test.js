// Blitz!'s code written back from statements (blitz-encode.js). A small Blitz! program is built by hand here, laid
// out as Blitz! lays one out. Each test edits its statements, encodes them, and reads the new image back with
// blitz.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { header, program, statements, variables, render } from '@moonbase-machines/c64/blitz.js';
import { encode } from '@moonbase-machines/c64/blitz-encode.js';

const hex = (v, w = 4) => v.toString(16).toUpperCase().padStart(w, '0');

// The program's start: DIM Z*%(9), the array that keeps the other arrays' offsets, then DIM T$(10), whose offset
// is kept at 7 in it. Then the jump to the main code.
const START = [0xb9, 0x10, 1, 0xda, 0xaa, 0, 0, 0xba, 0x10, 1, 0x54, 0x80, 0, 7, 0x16];
// The DATA, then the RUN the program starts with, in the byte before the main code.
const DATA = [3, 0xc1, 0xc2, 0xc3, 0xff, 0x15];
// The main code. A string is a label. { to } is a jump's target in two bytes, and { by } a short IF's, in one.
const MAIN = [
  'main', 0xb1, 0xc1,                                     // B% = 1
  'top', 0xea, 0x48, 0x49, 0x3c,                          // PRINT "HI";
  0x80, 0xa8, 0x80, 0, 0, 0, 0, 0x07, 0xc0,               // A = A + 0.5
  0x81, 0xb2, 0x02, 0x1f, { by: 'skip' },                 // IF B% = 2 ELSE skip
  0x1a, { to: 'sub' },                                    // GOSUB sub
  'skip', 0x81, 0x1b, 6, { to: 'top' }, { to: 'sub' },    // ON B% GOTO top, sub
  0x80, 0xb3, 0x01, 0x52, { to: 'top' },                  // IF A > 3 GOTO top
  0xa0, 33, 0xa7, 0x01, 0x2c, 0x07, 0xe0, 32,             // YC = YD + 300
  0xb3, 0x82, 0xe4, 7,                                    // T$(3) = C$
  0x82, 0x46,                                             // GET C$
  0xb1, 0xc3,                                             // I = 1
  0xba, 0xa0, 3, 0x11,                                    // FOR I TO 10
  0x13,                                                   // NEXT
  0xb0, 0xa8, 0x90, 0x50, 0x20, 0, 0, 0x17,               // POKE 53280, 0
  0xa8, 0x90, 0, 0, 0, 0, 0xbf, 0x07, 0x18, 0x2c, 0x35, 0x3a,   // SYS 32768 + 15,5
  0x80, 0xb1, 0x02, 0x1f, { by: 'far' },                  // IF A = 1 ELSE far
  0xe7, 240, ...Array(240).fill(0x41), 0x3c,              // PRINT a string of 240 characters;
  'far', 0x4f,                                            // END
  'sub', 0x82, 0x2f, 0x3e,                                // PRINT LEN(C$)
  0x1d,                                                   // RETURN
];
// The variables: A, B%, C$, I, XA to XZ, then YA to YD, which are 30 to 33.
const NAMES = [[0x41, 0], [0xc2, 0x80], [0x43, 0x80], [0x49, 0], ...Array.from({ length: 26 }, (_, k) => [0x58, 0x41 + k]),
  ...Array.from({ length: 4 }, (_, k) => [0x59, 0x41 + k])];

// The program in a 64K image, its header at $1F93, and the address of each label.
function build() {
  const mem = new Uint8Array(0x10000), labels = {}, targets = [];
  let a = 0x1f9f;
  const put = items => {
    for (const x of items) {
      if (typeof x === 'string') labels[x] = a;
      else if (typeof x === 'number') mem[a++] = x;
      else { targets.push({ at: a, ...x }); a += x.to ? 2 : 1; }
    }
  };
  put(START); const data = a; put(DATA); const main = a; put(MAIN); const vars = a;
  for (const t of targets) {
    if (t.to) { mem[t.at] = labels[t.to] >> 8; mem[t.at + 1] = labels[t.to] & 255; } else mem[t.at] = labels[t.by] - (t.at - 1);
  }
  NAMES.forEach((n, k) => mem.set(n, vars + 7 * k));
  const end = vars + 7 * NAMES.length;
  [vars, end, end, 0x1f9f, data, main - 1].forEach((w, k) => { mem[0x1f93 + 2 * k] = w & 255; mem[0x1f94 + 2 * k] = w >> 8; });
  return { mem, labels };
}

// A tree without the addresses of its instructions or its SYS text, to compare a program with the one read back.
const bare = x => Array.isArray(x) ? x.map(bare) : x && typeof x === 'object'
  ? Object.fromEntries(Object.entries(x).filter(([k]) => !['at', 'op', 'text', 'end'].includes(k)).map(([k, v]) => [k, bare(v)])) : x;
// The statements whose `to` is an address: the jumps, and the jump to the main code, which names where it starts.
const JUMPS = ['goto', 'gosub', 'if-goto', 'unless', 'on', 'run-main'];
// The edited list's statements with each target moved to the statement it should land on now: the statement
// after the target's label, found at the same place in the list read back.
function landed(list, back) {
  const read = back.filter(s => s.label === undefined), map = new Map();
  let k = 0, waiting = [];
  for (const s of list) {
    if (s.label !== undefined) { waiting.push(parseInt(s.label.slice(1), 16)); continue; }
    for (const l of waiting) map.set(l, read[k].at);
    waiting = []; k++;
  }
  const moved = s => JUMPS.includes(s.k) ? { ...s, to: Array.isArray(s.to) ? s.to.map(t => map.get(t)) : map.get(s.to) } : s;
  return { expected: list.filter(s => s.label === undefined).map(moved), read };
}
// The list with the statement at `at` replaced by the statements f gives for it.
const edit = (list, at, f) => list.flatMap(s => s.label === undefined && s.at === at ? f(s) : [s]);
// The address of the statement that renders as `text`.
const at = (list, text) => list.find(s => s.label === undefined && render(s) === text).at;

test('a program with no edits comes back byte for byte', () => {
  const { mem } = build(), { out, problems } = statements(mem);
  assert.deepEqual(problems, []);
  const r = encode(mem, out);
  assert.deepEqual(r.mem, mem);
  assert.equal(r.end, header(mem).end);
});

test('an added statement moves what follows, in both stretches, and every jump lands on the same statement', () => {
  const { mem, labels } = build(), { out } = statements(mem), h = header(mem);
  let list = edit(out, labels.top, s => [{ k: 'let', at: s.at, t: { k: 'var', n: 'A' }, e: { k: 'num', v: 1000 } }, s]);
  list = edit(list, at(list, 'RUN-MAIN'), s => [{ k: 'let', at: s.at, t: { k: 'var', n: 'B%' }, e: { k: 'num', v: 5 } }, s]);
  const r = encode(mem, list), n = header(r.mem), back = statements(r.mem);
  assert.deepEqual(back.problems, []);
  assert.deepEqual([n.data, n.main, n.vars, n.arrays], [h.data + 2, h.main + 2, h.vars + 6, h.arrays + 6]);
  assert.deepEqual([...r.mem.subarray(n.data, n.main)], DATA, 'the DATA and the RUN before the main code, moved');
  const { expected, read } = landed(list, back.out);
  assert.deepEqual(read.map(bare), expected.map(bare));
  // (the jumps to the label before the added statement land on it)
  assert.equal(read.find(s => s.k === 'if-goto').to, labels.top + 2);
  assert.equal(render(read[read.findIndex(s => s.at === labels.top + 2)]), 'A = 1000');
});

test('a changed statement is encoded from its tree, each operand in its shortest form', () => {
  const { mem, labels } = build(), { out } = statements(mem);
  const num = v => ({ k: 'num', v }), plus = (a, b) => ({ k: 'op', o: '+', a, b });
  const changed = [];
  const change = (list, at, f) => edit(list, at, s => { const t = f(s); changed.push(t); return [t]; });
  let list = change(out, at(out, 'YC = YD + 300'), s => ({ ...s, e: [5, 20, 200, 1000, 40000, 1.5].map(num).reduce(plus) }));
  list = change(list, labels.top, s => ({ ...s, args: [plus({ k: 'str', s: 'ABC' }, { k: 'str', s: 'A LONGER ONE' })] }));
  list = change(list, at(list, 'GET C$'), s => ({ ...s, t: { k: 'var', n: 'B%' } }));
  list = change(list, at(list, 'FOR I TO 10'), s => ({ ...s, to: num(12) }));
  const r = encode(mem, list), back = statements(r.mem), ops = [...program(r.mem).values()];
  assert.deepEqual(back.problems, []);
  const { expected, read } = landed(list, back.out);
  assert.deepEqual(read.map(bare), expected.map(bare));
  const [sum, print, get, loop] = changed.map(s => read[expected.indexOf(s)]).map(s => ops.filter(i => i.at >= s.at && i.at <= s.op).map(i => i.op));
  assert.deepEqual(sum.filter(b => b > 0x80), [0xb5, 0xf4, 0xa6, 0xa7, 0xa8, 0xa8, 0xe0]);
  assert.deepEqual(print, [0xeb, 0xe7, 0x07, 0x3c]);
  // (a place that is a number takes the long form, which leaves the variable's address for GET and FOR)
  assert.deepEqual(get, [0xa0, 0x46]);
  assert.deepEqual(loop, [0xbc, 0xa0, 0x11]);
  // (0.1 rounded to BASIC's five bytes, as BASIC reads it)
  const tenth = at(out, 'A = A + 0.5'), t = encode(mem, edit(out, tenth, s => [{ ...s, e: num(0.1) }])).mem;
  assert.deepEqual([...t.subarray(tenth, tenth + 7)], [0xa8, 0x7d, 0x4c, 0xcc, 0xcc, 0xcd, 0xc0]);
});

test('a short IF that no longer reaches its target throws', () => {
  const { mem, labels } = build(), { out } = statements(mem);
  const far = out.find(s => s.k === 'unless' && s.to === labels.far);
  const long = out[out.indexOf(far) + 1].at, quarter = { k: 'let', at: long, t: { k: 'var', n: 'A' }, e: { k: 'num', v: 0.25 } };
  assert.doesNotThrow(() => encode(mem, edit(out, long, s => [quarter, s])), 'seven bytes more: 252');
  assert.throws(() => encode(mem, edit(out, long, s => [quarter, quarter, s])), /short IF at \$[0-9A-F]{4}.* would jump 259 bytes/);
});

test('a statement or expression with no encoding throws, naming it', () => {
  const { mem, labels } = build(), { out } = statements(mem);
  const before = x => edit(out, labels.far, t => [{ ...x, at: t.at }, t]);
  assert.throws(() => encode(mem, before({ k: 'basic-text', args: [] })), /no encoding for the statement basic-text/);
  assert.throws(() => encode(mem, before({ k: 'let', t: { k: 'var', n: 'A' }, e: { k: 'mystery' } })), /no encoding for the expression mystery/);
  assert.throws(() => encode(mem, before({ k: 'for', v: 'I', to: { k: 'num', v: 3 }, step: { k: 'num', v: 2 } })), /for with a step/);
  assert.throws(() => encode(mem, before({ k: 'let', t: { k: 'elem', n: 'Q$', i: [{ k: 'num', v: 1 }] }, e: { k: 'str', s: '' } })), /no DIM gives the array Q\$/);
});

test('a variable the program does not have is added to the end of its variable area', () => {
  const { mem, labels } = build(), { out } = statements(mem), h = header(mem);
  const list = edit(out, labels.far, s => [{ k: 'let', at: s.at, t: { k: 'var', n: 'NV%' }, e: { k: 'num', v: 7 } }, s]);
  const r = encode(mem, list), n = header(r.mem);
  assert.equal(n.arrays - n.vars, 7 * 35);
  assert.equal(n.vars, h.vars + 3, 'the program grows by three bytes: $B7, then $E0 $22');
  assert.deepEqual(variables(r.mem).slice(-2), ['YD', 'NV%']);
  assert.deepEqual([...r.mem.subarray(n.arrays - 7, n.arrays)], [0xce, 0xd6, 0, 0, 0, 0, 0]);
  assert.ok(statements(r.mem).out.some(s => s.label === undefined && render(s) === 'NV% = 7'));
});

test('the room: the arrays the DIMs make, and what is left below the top for strings', () => {
  const { mem } = build(), { out } = statements(mem), end = header(mem).end;
  // Z*%(9): 5 + 2 + 2 × 10 bytes; T$(10): 5 + 2 + 3 × 11
  assert.deepEqual(encode(mem, out, { top: 0x8000 }).room, { top: 0x8000, arrays: 27 + 40, strings: 0x8000 - end - 67, unsized: [] });
  assert.deepEqual(encode(mem, out).room, { top: undefined, arrays: 67, strings: null, unsized: [] });
  const sized = edit(out, at(out, 'DIM T$(10)'), s => [{ ...s, sizes: [{ k: 'var', n: 'B%' }] }]);
  assert.deepEqual(encode(mem, sized, { top: 0x8000 }).room, { top: 0x8000, arrays: 27, strings: 0x8000 - end - 27, unsized: ['T$'] });
  assert.throws(() => encode(mem, out, { top: end - 1 }), /file ends at .* top of memory/);
  assert.throws(() => encode(mem, out, { top: end + 66 }), /arrays end 1 bytes past the top/);
});
