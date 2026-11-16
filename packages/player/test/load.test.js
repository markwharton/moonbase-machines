// A title loaded from its folder, as a page gives the player its address: its title.js with what it imports, the
// modules it names and its game's data; a title whose engine is its own, its module loaded and no data read. From
// files the tests write.
//
//   node --test test/*.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadTitle } from '@moonbase-machines/player/remake/load.js';

// a title's folder and its data, written: each file a name and its text
function folder(files) {
  const at = mkdtempSync(join(tmpdir(), 'title-'));
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(at, name, '..'), { recursive: true }); writeFileSync(join(at, name), text); }
  return pathToFileURL(at + '/');
}

test('a title from its folder: its title.js with what it imports, its modules and its data, and no file it does not name', async () => {
  const at = folder({
    'title/title.js': "import drawing from './view.js'; export default { slug: 'one', engine: 'card', modules: ['problems'], drawing, map: { routines: { 0x800: 'char' } } };",
    'title/problems.js': 'export default { 1: "the first" };',
    'title/view.js': 'export default { char() {} };',
    'title/other.js': 'export default { other: true };',
    'one.json': JSON.stringify({ kind: 'dos33', saves: { volume: 'DISK', dos: 'dos33' }, volumes: { DISK: {} } }),
  });
  const { title, disk, folder: from } = await loadTitle(new URL('title/', at), { data: new URL('one.json', at) });
  assert.equal(title.slug, 'one');
  assert.deepEqual(title.map.routines, { 0x800: 'char' }, 'its map, its own');
  assert.deepEqual(title.problems, { 1: 'the first' });
  assert.equal(typeof title.drawing.char, 'function', 'its own drawing, which its title.js imports');
  assert.deepEqual(Object.keys(title).sort(), ['drawing', 'engine', 'map', 'modules', 'problems', 'slug'], 'nothing beside what its title.js says');
  assert.deepEqual(disk.saves, { volume: 'DISK', dos: 'dos33' }, 'its data, its saves with it');
  assert.equal(from.href, new URL('title/', at).href, 'its folder');
});

test('a title whose engine is its own: its module loaded, to play it, and no data read', async () => {
  const at = folder({
    'title/title.js': "export default { slug: 'three', engine: 'game', style: 'three.css' };",
    'title/game.js': 'export async function play(game) { game.played = true; }',
  });
  const { title, disk } = await loadTitle(new URL('title/', at), { data: new URL('data/', at) });
  assert.equal(typeof title.own.play, 'function');
  assert.equal(disk, null);
});
