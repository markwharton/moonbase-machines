// A title's fixes made to its program on the disk (remake/fixes.js), for a Commodore 64 game that runs on its machine.
// A small Blitz! program is built by hand, as Blitz! lays one out, and the title's fixes module is written to a
// folder of its own, since fixFiles imports it by its URL.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { statements, render } from '@moonbase-machines/c64/blitz.js';
import { fixFiles } from '../remake/fixes.js';

// The program: the jump to the main code, the RUN before it, then B% = 1 and END. Its variables are A and B%. The
// file loads at $1F00, so it holds bytes before the header at $1F93 too.
const LOAD = 0x1f00;
function file() {
  const mem = new Uint8Array(0x10000);
  for (let a = LOAD; a < 0x1f93; a++) mem[a] = a & 0xff;
  let a = 0x1f9f;
  const put = bytes => { mem.set(bytes, a); a += bytes.length; };
  const start = a; put([0x16]);
  const data = a; put([0xff, 0x15]);
  const main = a; put([0xb1, 0xc1, 0x4f]);
  const vars = a;
  [[0x41, 0], [0xc2, 0x80]].forEach((n, k) => mem.set(n, vars + 7 * k));
  const end = vars + 14;
  [vars, end, end, start, data, main - 1].forEach((w, k) => { mem[0x1f93 + 2 * k] = w & 255; mem[0x1f94 + 2 * k] = w >> 8; });
  return { raw: Uint8Array.from([LOAD & 255, LOAD >> 8, ...mem.subarray(LOAD, end)]), end };
}
// The statements of a file, as text, read where it loads.
const read = raw => {
  const mem = new Uint8Array(0x10000);
  mem.set(raw.subarray(2), raw[0] | raw[1] << 8);
  return statements(mem).out.filter(s => s.label === undefined).map(render);
};

// A drive as fixFiles uses one: it finds a file by its name in PETSCII, a file saved shadowing the disk's.
const drive = files => ({
  saved: new Map(),
  find(name) {
    const key = String.fromCharCode(...name);
    if (this.saved.has(key)) return { raw: this.saved.get(key), saved: true };
    return files[key] ? { raw: files[key] } : undefined;
  },
});

// The fixes modules: one makes B% 2, and one makes it 1000, which takes two bytes more.
const folder = mkdtempSync(join(tmpdir(), 'fixes-'));
after(() => rmSync(folder, { recursive: true, force: true }));
const set = v => `export function fixed(statements, render) {
  return statements.map(s => s.label === undefined && render(s) === 'B% = 1' ? { ...s, e: { k: 'num', v: ${v} } } : s);
}
`;
writeFileSync(join(folder, 'two.js'), set(2));
writeFileSync(join(folder, 'more.js'), set(1000));
const url = pathToFileURL(folder + '/');
const title = ({ fixes = 'two', blitz = true, top = 0xa000 } = {}) => ({ fixes, fixed: { GAME: true }, basic: { GAME: { blitz, top, program: { file: 'GAME' } } } });

test('the drive gives the fixed program in place of the disk\'s, where the disk\'s loads', async () => {
  const { raw } = file(), d = drive({ GAME: raw });
  assert.deepEqual(read(raw), ['RUN-MAIN', 'B% = 1', 'END']);
  await fixFiles(title(), d, url);
  const fixed = d.find(Uint8Array.from('GAME', c => c.charCodeAt(0)));
  assert.equal(fixed.saved, true);
  assert.deepEqual([...fixed.raw.subarray(0, 2)], [...raw.subarray(0, 2)]);
  assert.deepEqual([...fixed.raw.subarray(2, 2 + 0x93)], [...raw.subarray(2, 2 + 0x93)], 'the bytes before the header');
  assert.deepEqual(read(fixed.raw), ['RUN-MAIN', 'B% = 2', 'END']);
});

test('a program longer once fixed still loads where it did, and reads back fixed', async () => {
  const { raw } = file(), d = drive({ GAME: raw });
  await fixFiles(title({ fixes: 'more' }), d, url);
  const fixed = d.saved.get('GAME');
  assert.equal(fixed.length, raw.length + 2);
  assert.deepEqual(read(fixed), ['RUN-MAIN', 'B% = 1000', 'END']);
});

test('a program that is not Blitz!\'s throws, by its name', async () => {
  await assert.rejects(fixFiles(title({ blitz: false }), drive({ GAME: file().raw }), url), /GAME: its fixes can be made only to a program Blitz! compiled/);
});

test('a program not on the disk throws, by its name', async () => {
  await assert.rejects(fixFiles(title(), drive({}), url), /no file GAME on the disk/);
});

test('a fixed program that does not fit below the top of memory throws', async () => {
  const { raw, end } = file();
  await assert.doesNotReject(fixFiles(title({ fixes: 'more', top: end + 2 }), drive({ GAME: raw }), url));
  await assert.rejects(fixFiles(title({ fixes: 'more', top: end }), drive({ GAME: raw }), url), /at or past the top of memory/);
});
