// The player's parts that every way to play shares (play.js): the keys as each machine takes them (keys.js), the
// saves on the player's disk (saves.js), a write the disk's backend cannot store (disk/disk.js); the settings store
// typed against its declarations (settings.js) and the provider giving a page its disks and settings on one backend
// (provider.js); the package knowing nothing of an address and keeping nothing in the browser itself; and no
// title named in the packages' code, only in their comments, as examples.
//
//   node --test test/*.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { code, named, typing } from '@moonbase-machines/player/keys.js';
import { gameData } from '@moonbase-machines/player/data.js';
import { savesFor } from '@moonbase-machines/player/saves.js';
import { openDisk } from '@moonbase-machines/player/disk/disk.js';
import { memory } from '@moonbase-machines/player/disk/memory.js';
import { settingsStore, check } from '@moonbase-machines/player/settings.js';
import { provider, settingsDisk } from '@moonbase-machines/player/provider.js';
import { Drive } from '@moonbase-machines/c64/drive.js';
import { make } from '@moonbase-machines/c64/d64.js';

const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

test('a key is the Apple\'s code or the Commodore 64\'s, by the machine\'s kind', () => {
  assert.equal(code(key('ArrowLeft'), 'prodos'), 8);
  assert.equal(code(key('ArrowLeft'), 'c64'), 157);
  assert.equal(code(key('Tab'), 'dos33'), 9);
  assert.equal(code(key('a'), 'prodos'), 97, 'the Apple a small letter as typed');
  assert.equal(code(key('a'), 'c64'), 65, 'the 64 its capital');
  assert.equal(code(key('e', { ctrlKey: true }), 'prodos'), 5, 'control-E');
  assert.equal(code(key('a', { metaKey: true }), 'prodos'), undefined, 'the browser\'s own');
  assert.equal(code(key('a'), undefined), undefined, 'a title of its own engine has no table');
  assert.equal(code(key('Shift'), 'prodos'), undefined);
  assert.deepEqual(['space', 'left', 'A'].map(n => named(n, 'prodos')), [32, 8, 65]);
  assert.deepEqual(['left', 'delete'].map(n => named(n, 'c64')), [157, 20]);
});

test('a demonstration\'s steps as typed: the 64\'s own keys by name, its text in capitals; a step of another shape refused', () => {
  assert.deepEqual(['f1', 'f4', 'f8', 'return', 'stop', 'clr', 'pound'].map(n => named(n, 'c64')), [133, 138, 140, 13, 3, 147, 92]);
  assert.equal(typing([{ key: 'return' }, { key: 'f4' }, { type: '1 Pistons' }, { key: 'return' }, { key: 'f8' }], 'c64'), '\r\x8a1 PISTONS\r\x8c');
  assert.equal(typing([{ type: 'run' }, { key: 'return' }], 'prodos'), 'run\r', 'an Apple\'s text as typed');
  for (const [bad, kind] of [[[], 'c64'], [[{}], 'c64'], [[{ key: 'f4', type: 'x' }], 'c64'], [[{ key: 'none' }], 'c64'], [[{ type: '' }], 'c64'], [[{ press: 'a' }], 'c64'], [[{ key: 'f4' }], 'prodos'], ['f4', 'c64']])
    assert.throws(() => typing(bad, kind), JSON.stringify(bad));
});

test('a game\'s data carries its demonstrations, each step checked; a game of another kind refused one', () => {
  const disk = make({ name: 'DISK', id: 'MB', files: [] }), steps = [{ key: 'return' }, { key: 'f8' }];
  const c64 = more => ({ title: 'GAME', kind: 'c64', disks: [disk], start: 'GAME', ...more });
  assert.deepEqual(gameData('game', c64({ demonstrations: [{ name: 'Frames', steps }] })).data.demonstrations, [{ name: 'Frames', steps }]);
  assert.equal(gameData('game', c64({})).data.demonstrations, undefined);
  assert.throws(() => gameData('game', c64({ demonstrations: [{ name: 'Frames', steps: [{ key: 'f9' }] }] })), /no key named f9/);
  assert.throws(() => gameData('game', c64({ demonstrations: [{ steps }] })), /has a name/);
  assert.throws(() => gameData('game', { title: 'GAME', kind: 'dos33', disks: [], demonstrations: [{ name: 'Frames', steps }] }), /C64 game only/);
});

test('a game\'s data carries its fire key, Option alone, for a C64 game; another key or kind refused', () => {
  const disk = make({ name: 'DISK', id: 'MB', files: [] });
  const c64 = more => ({ title: 'GAME', kind: 'c64', disks: [disk], start: 'GAME', ...more });
  assert.equal(gameData('game', c64({ fire: 'Alt' })).data.fire, 'Alt');
  assert.equal(gameData('game', c64({})).data.fire, undefined);
  assert.throws(() => gameData('game', c64({ fire: 'Control' })), /cannot be the fire/);
  assert.throws(() => gameData('game', { title: 'GAME', kind: 'dos33', disks: [], fire: 'Alt' }), /C64 game's only/);
});

test('the saves: a game\'s volume given what is kept, and a change to its files kept', async () => {
  const disk = await openDisk('title/one', { backend: memory() });
  disk.write('KEPT', [1, 2], { type: 'BIN', aux: 0x2000 });
  const game = { kind: 'prodos', volumes: { GAME: {} }, saves: { volume: 'SAVES', dos: 'prodos' } };
  const saves = savesFor(game, disk);
  assert.deepEqual(Object.keys(saves.data.volumes), ['GAME', 'SAVES']);
  assert.equal(saves.data.volumes.SAVES.KEPT.type, 'BIN');
  // a Commodore 64's drive: what it saves is kept on the disk
  const drive = new Drive(make({ name: 'DISK', id: 'MB', files: [] }));
  savesFor({ kind: 'c64' }, disk).drive(drive);
  drive.keep('SAVED', Uint8Array.of(1, 8, 9));
  await disk.written();
  assert.deepEqual([...disk.read('SAVED')], [1, 8, 9]);
});

test('a write the backend cannot store is said, and the writes after it are stored', async () => {
  const backend = memory(), put = backend.put;
  let refuse = true;
  backend.put = (d, f) => refuse && f.name === 'BAD' ? Promise.reject(new Error('full')) : put.call(backend, d, f);
  const disk = await openDisk('title/two', { backend }), said = [];
  disk.failed = err => said.push(err.message);
  await assert.rejects(disk.write('BAD', [1]), /full/);
  await disk.write('GOOD', [2]);
  await disk.written();
  assert.deepEqual(said, ['full']);
  refuse = false;
  assert.deepEqual([...(await openDisk('title/two', { backend })).read('GOOD')], [2]);
});

// (what the console is told, for the tests of what is refused)
const warned = async f => { const said = [], warn = console.warn; console.warn = m => said.push(m); try { await f(); } finally { console.warn = warn; } return said; };

test('a setting\'s type: on or off, or one of fixed values', () => {
  assert.ok(check('boolean', false) && !check('boolean', 'off') && check(['a', 'b'], 'a') && !check(['a', 'b'], 'c'));
  assert.throws(() => check('text', 'x'), /no such type/);
});

const SOUND = { name: 'sound', type: 'boolean', default: true, owner: 'person', words: 'Sound' };
const MINI = { name: 'mini', type: ['', 'live', 'pictures'], default: '', owner: 'person', words: 'Mini view', labels: ['Off', 'Live', 'Pictures'] };
const OLD = { name: 'old-style', type: 'boolean', default: false, owner: 'person', words: 'Old style text' };
const FIXED = { name: 'fixed', type: 'boolean', default: false, owner: 'person', words: 'Bugs fixed' };

test('a setting by its declaration: the page\'s fixed value, else the visit\'s, else the kept one, else its default; offered unless hidden or fixed', async () => {
  const backend = memory(), person = () => openDisk(settingsDisk('person'), { backend });
  const first = settingsStore({ disks: { person: await person() } });
  assert.equal(first.get(SOUND), true, 'its default');
  await first.set(SOUND, false); await first.set(MINI, 'pictures');
  const visit = def => ({ 'old-style': true, mini: 'live', sound: false })[def.name];
  const again = settingsStore({ disks: { person: await person() }, visit, fixed: { fixed: true }, hidden: ['mini'] });
  assert.equal(again.get(SOUND), false, 'the visit\'s, and kept');
  assert.equal(again.get(MINI), 'live', 'the visit\'s over the kept');
  assert.equal(again.get(OLD), true, 'the visit\'s on');
  assert.equal(again.get(FIXED), true, 'the page\'s fixed value over all');
  assert.deepEqual([SOUND, MINI, FIXED].map(again.offered), [true, false, false]);
  assert.deepEqual(JSON.parse(new TextDecoder().decode((await person()).read('settings'))), { sound: false, mini: 'pictures' }, 'the visit\'s values never kept');
});

test('a setting\'s value is checked: a visit\'s value not of the type refused and said once, a kept value not of the type its default, a set of the wrong type thrown', async () => {
  const backend = memory(), disk = await openDisk(settingsDisk('person'), { backend });
  disk.write('settings', new TextEncoder().encode(JSON.stringify({ sound: 'loud', mini: 'live' })));
  const store = settingsStore({ disks: { person: disk }, visit: def => ({ mini: 'huge', 'old-style': 'maybe' })[def.name] });
  const said = await warned(() => { assert.equal(store.get(SOUND), true, 'the kept value refused: its default'); assert.equal(store.get(MINI), 'live', 'huge refused: the kept'); store.get(MINI); assert.equal(store.get(OLD), false); });
  assert.deepEqual(said, ['sound: the kept "loud" is not on or off; its default used', 'mini: "huge" for this visit refused: not one of nothing, live, pictures', 'old-style: "maybe" for this visit refused: not on or off']);
  assert.throws(() => store.set(SOUND, 'off'), /sound cannot be "off": not on or off/);
  assert.throws(() => store.set(MINI, 'big'), /not one of nothing, live, pictures/);
  assert.throws(() => store.get({ ...SOUND, owner: 'teacher' }), /no store for the owner teacher/);
  assert.throws(() => store.get({ name: 'bad', type: 'boolean', default: 'on', owner: 'person' }), /default "on" is not on or off/);
  assert.throws(() => settingsStore({ disks: { person: disk }, fixed: { sound: 'off' } }).get(SOUND), /fixed at "off"/);
});

test('the provider: every disk on the one backend it is given, and the settings kept there too', async () => {
  const backend = memory();
  const { disk, settings } = await provider({ backend, visit: def => def.name === 'sound' ? false : undefined, hidden: ['vectors'] });
  const title = await disk('title/one');
  await title.write('SAVED', [1]);
  await settings.set(MINI, 'live');
  assert.deepEqual((await backend.load('title/one')).map(f => f.name), ['SAVED']);
  assert.deepEqual((await backend.load('settings/person')).map(f => f.name), ['settings']);
  assert.equal(settings.get(SOUND), false);
  assert.equal(settings.offered({ name: 'vectors', type: 'boolean', default: false, owner: 'person' }), false);
});

// the package's own code knows nothing of an address and keeps nothing in the browser: the page gives it everything
// (bin/moonbase-play.mjs is a page of its own, the one place an address is read, by that page)
test('the player, its engines, its settings and its provider know no address and no browser storage; the player opens no disk', () => {
  const own = ['play.js', 'settings.js', 'provider.js', 'engines/original.js', 'engines/scenes.js', 'saves.js', 'keys.js', 'parts.js', 'disk/disk.js', 'disk/dialogs.js'];
  const found = [];
  for (const f of own) {
    const lines = readFileSync(join(packages, 'player', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, '')).split('\n');
    lines.forEach((l, i) => {
      const c = l.replace(/(^|\s)\/\/.*$/, '');
      if (/location\.(search|hash|href)|URLSearchParams|localStorage|sessionStorage/.test(c)) found.push(`${f}:${i + 1}`);
      if (/openDisk/.test(c) && !['provider.js', 'disk/disk.js'].includes(f)) found.push(`${f}:${i + 1} opens a disk`);
      if (/\blocal\(/.test(c) && f !== 'provider.js') found.push(`${f}:${i + 1} chooses a backend`);
    });
  }
  assert.deepEqual(found, []);
});

// the titles, by name and by address; the packages' code, their comments taken out
const TITLES = /pieces[ -]of[ -]eight|detect-a-pet|goldfields|zoopak|nature[ -]park|animal[ -]rescue|aztlan|crayon|po8/i;
const packages = new URL('../../', import.meta.url).pathname;
const sources = dir => readdirSync(dir).flatMap(n => {
  const f = join(dir, n);
  if (['node_modules', 'dist', 'test'].includes(n)) return [];
  return statSync(f).isDirectory() ? sources(f) : /\.m?js$/.test(n) ? [f] : [];
});

test('no title is named in the packages\' code, only in their comments', () => {
  const found = [];
  for (const f of sources(packages)) {
    const lines = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, '')).split('\n');
    lines.forEach((l, i) => { const c = l.replace(/(^|\s)\/\/.*$/, ''); if (TITLES.test(c)) found.push(`${f.slice(packages.length)}:${i + 1}`); });
  }
  assert.deepEqual(found, []);
});

test('the commands: --help says how each is used and starts nothing; a flag they do not have refused', async () => {
  const { execFileSync } = await import('node:child_process');
  const run = (name, ...args) => { try { return { out: execFileSync('node', [new URL(`../bin/${name}.mjs`, import.meta.url).pathname, ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 }), code: 0 }; } catch (e) { return { out: e.stderr, code: e.status }; } };
  for (const name of ['moonbase-play', 'moonbase-compile']) {
    for (const flag of ['--help', '-h']) { const r = run(name, flag); assert.equal(r.code, 0, `${name} ${flag}`); assert.match(r.out, new RegExp(`^${name} `), `${name} ${flag}: its usage`); }
    const r = run(name, '--nope'); assert.equal(r.code, 1, `${name} --nope`); assert.match(r.out, /no such flag, --nope/);
  }
});

test('a screen read back to its characters: a cell of the font as drawn, inverse, and a cell of picture', async () => {
  const { reader } = await import('@moonbase-machines/player/remake/text-reader.js');
  const { rowStart } = await import('@moonbase-machines/apple2e/screen.js');
  const mem = new Uint8Array(0x10000), font = 0x9400;
  // (a font of 95 characters, each its own 8 bytes, the colour bit set aside)
  for (let a = 32; a < 127; a++) for (let k = 0; k < 8; k++) mem[font + a * 8 + k] = (a * 7 + k * 13) & 0x7f;
  const put = (c, r, a, inverse) => { for (let k = 0; k < 8; k++) mem[0x4000 + rowStart(r * 8 + k) + c] = (inverse ? mem[font + a * 8 + k] ^ 0x7f : mem[font + a * 8 + k]) | 0x80; };
  put(0, 0, 65); put(1, 0, 66, true);
  for (let k = 0; k < 8; k++) mem[0x4000 + rowStart(16 + k) + 2] = [1, 2, 3, 4, 5, 6, 7, 8][k] * 11;
  const read = reader(mem, { font });
  assert.ok(read.ready());
  assert.deepEqual(read.cell(0x4000, 0, 0), ['A', false]);
  assert.deepEqual(read.cell(0x4000, 1, 0), ['B', true]);
  assert.equal(read.cell(0x4000, 2, 2), null, 'picture');
  for (let k = 0; k < 8; k++) { mem[0x4000 + rowStart(32 + k) + 3] = 0xff; mem[0x4000 + rowStart(40 + k) + 3] = 0x80; }
  assert.equal(read.cell(0x4000, 3, 4), null, 'a solid lit cell is picture, not an inverse space');
  assert.equal(read.cell(0x4000, 3, 5), null, 'a solid dark cell is picture, not a space');
  assert.equal(reader(new Uint8Array(0x10000), { font }).ready(), false, 'no font loaded yet');
});

test('the status line: an error stays, and later ordinary text does not replace it', async () => {
  const { statusLine } = await import('@moonbase-machines/player/parts.js');
  const classes = new Set(), el = { textContent: '', classList: { contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) } };
  const say = statusLine(el);
  say('Running.');
  assert.equal(el.textContent, 'Running.'); assert.ok(!classes.has('error'));
  say('A file was not kept: full', { error: true });
  say('Running.');
  assert.equal(el.textContent, 'A file was not kept: full', 'the error stays');
  assert.ok(classes.has('error'));
});

test('clean words in the band\'s moved part move with its dots; the others stay', async () => {
  const { shiftWords } = await import('@moonbase-machines/player/remake/card-view.js');
  const inset = { top: 16, bottom: 63, move: [378, 546], by: -55 };
  const words = [{ x: 392, y: 32 }, { x: 0, y: 32 }, { x: 392, y: 80 }];
  shiftWords(words, inset);
  assert.deepEqual(words.map(w => w.x), [337, 0, 392]);
});

test('a setting\'s control: a change takes effect at once, and one that cannot be kept goes back and says why', async () => {
  const { control } = await import('@moonbase-machines/player/settings.js');
  // (just enough of a page for one checkbox)
  const made = [];
  globalThis.document = { createElement: tag => { const el = { tag, listeners: {}, append() {}, addEventListener(t, f) { this.listeners[t] = f; } }; made.push(el); return el; } };
  const def = { name: 'sound', type: 'boolean', default: true, owner: 'person', words: 'Sound' };
  let kept = true, told = [], why = null;
  const settings = { get: () => kept, set: (d, v) => v === false ? Promise.reject(new Error('offline')) : (kept = v, Promise.resolve()) };
  control(def, settings, v => told.push(v), err => { why = err.message; });
  const box = made.find(el => el.tag === 'input');
  box.checked = false;
  await box.listeners.change();
  assert.deepEqual(told, [false, true], 'the game hears the change at once, then the old value back');
  assert.equal(box.checked, true, 'the box back as it was');
  assert.equal(why, 'offline');
  delete globalThis.document;
});
