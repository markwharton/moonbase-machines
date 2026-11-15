// A title's Remake, loaded and made, for the player (play.js), a replay and Node (a pilot's observer). A title is its
// folder: its title.js, and the modules the title.js names. Its game's data is a file of its own, from where the page
// keeps it.
//
//   const title = await titleOf(folder)                 the title alone: its title.js and the modules it names
//   const { title, disk, folder } = await loadTitle(folder, { data })
//     folder   the title's folder, an absolute URL (its title.js and its own modules)
//     data     its game's data, an absolute URL (<slug>.json: its disks' files, its kind, its saves)
//   title.disk = disk; title.seed = 17                 (the caller's: a data disk, the seed)
//   const engine = makeEngine(title, { clock })
//
// A title whose title.js `engine` is 'card' or 'vector' runs its game on its machine: makeEngine gives the game
// (game.js), with the clock it is given (clock.js). A title whose engine is its own names a module in its folder as
// its `engine`. That module is loaded as `title.own`, with no game's data read here, and it plays the game itself
// (play.js).
import { Game } from './game.js';

// the engines a title's game can run on, by its title.js `engine`; any other engine is the title's own
const MACHINES = new Set(['card', 'vector']);

// A file is read by fetch in the browser, and from the disk in Node. Node's fs is asked of Node itself, so that the
// browser's files import nothing of Node's.
async function read(url, as) {
  if (url.protocol === 'file:') { const text = globalThis.process.getBuiltinModule('node:fs').readFileSync(url, 'utf8'); return as === 'json' ? JSON.parse(text) : text; }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.pathname}: ${r.status}`);
  return as === 'json' ? r.json() : r.text();
}
const defaultOf = async url => (await import(url.href)).default;

export async function titleOf(folder) {
  folder = new URL(folder);
  const title = { ...(await defaultOf(new URL('title.js', folder))) };
  // the modules the title's title.js names (`modules`), each by its name, and its view's own drawing (view.js), where
  // it says it has one (`view`)
  for (const name of title.modules ?? []) title[name] = await defaultOf(new URL(name + '.js', folder));
  if (title.view) title.viewSteps = await defaultOf(new URL('view.js', folder));
  return title;
}

export async function loadTitle(folder, { data } = {}) {
  folder = new URL(folder);
  const title = await titleOf(folder);
  if (!MACHINES.has(title.engine)) {
    title.own = await import(new URL(title.engine + '.js', folder).href);
    return { title, disk: null, folder };
  }
  const disk = await read(new URL(data), 'json');
  return { title, disk, folder };
}

export { read };

// The game on its machine. `clock` is the clock it runs on (clock.js); with none, it runs to each wait.
export function makeEngine(title, { clock } = {}) {
  return new Game(title, { clock });
}
