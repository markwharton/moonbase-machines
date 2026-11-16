// The vector toolkit, as a title made with it brings it to the player. The title's driver, its title.js, names it:
//
//   import { toolkit } from '@moonbase-machines/vector/toolkit.js';
//   export default { slug, engine: 'vector', toolkit, map: { ... } };
//
// The player asks a toolkit for these parts (@moonbase-machines/player/remake/observer.js, `core`):
//   steps              each routine's step, by the name a title's map gives it (steps.js)
//   rules(core)        how the observer follows a game built on the toolkit (rules.js)
//   game(game)         the memory the game runs in, and what the view reads of an ask, as the player's game starts
//   view(stage, options)  the view, which draws the game's events as SVG (view.js), on the SVG the player makes for
//                      it (`options.svg()`); the other options it takes are the engine, the game's data (`disk`) and
//                      `press`, which gives the game a key
//   text               true: the view draws the words itself, so the setting Clean text applies to it
//   overlay(m, layer)  the pictures drawn as SVG over the machine's own screen, for the setting Draw the pictures as
//                      vectors
import { STEPS } from './steps.js';
import { rules } from './rules.js';
import { View } from './view.js';
import { shapes } from './pictures.js';
import { elements } from './svg.js';

export const toolkit = {
  steps: STEPS,
  rules,

  // A game on the toolkit runs in auxiliary memory, with the language card's second bank at $D000. The card's banks
  // are placed in the top of the auxiliary 64K, so that one array holds everything the game reads and writes.
  game(game) {
    const m = game.m;
    m.lc.aux[1] = m.aux.subarray(0xd000, 0xe000); m.lc.aux[2] = m.aux.subarray(0xe000);
    // An ask (its step's `ask`) takes a key, then waits for RETURN to confirm it or DELETE to take it back. The view
    // shows which: `askMode` is the ask's mode, its A as it starts, and `asked` the place of the key chosen, or null
    // while none is. The ask draws the caps of the keys it wants itself. It draws RETURN's cap only once a key is
    // chosen, so its own call of the routine that draws a cap (`cap`) says a choice has been made. The key is the last
    // one pressed.
    const ARROWS = [8, 21, 10, 11];
    // the title's own routines, by name: those of its problems
    const own = new Set(Object.values(game.title.map.problems ?? {}).flatMap(r => Object.values(r)).map(full => full.split(' ')[0]));
    const place = (mode, k) => mode === 0x80 ? ARROWS.indexOf(k) : mode >= 0xb1 && mode < 0xba ? k - 0x31 : (k & 0x5f) - 0x41;
    // the ask running, by its event
    let asking = null;
    game.askMode = 0; game.asked = null;
    return {
      mem: m.aux,
      enter(event) { if (game.steps[event.step]?.ask) { asking = event; game.askMode = event.a; game.asked = null; } },
      leave(event) { if (event === asking) { asking = null; game.asked = null; } },
      tap(name, c) { if (asking && game.steps[name]?.cap && c.a !== 0x7f) game.asked = c.a === 0x0d ? { place: place(game.askMode, game.key) } : null; },
      // The toolkit's routines that wait for a key run flat out (@moonbase-machines/player/remake/game.js).
      frees: event => !!game.steps[event.step]?.waits && !own.has(event.step),
      // Before the toolkit is in memory the game's loader waits for a key, with its splash on the screen.
      splash: !!game.title.map.splash,
    };
  },

  // The view draws on the SVG the player makes, from the first volume of the game's data.
  view: (stage, { svg, disk, engine, press }) => new View(svg(), { disk, engine, press, volume: Object.keys(disk.volumes)[0] }),
  text: true,

  // The pictures over the machine's own screen. `overlay(m, layer)` gives a function the player calls at each frame
  // until it returns true: it looks for the toolkit's routines, and hooks them once PART0 is loaded. The pictures go
  // into `layer`, an SVG 140 by 192, and the machine marks each byte of the screen a picture wrote (`m.marking`,
  // `m.owner`).
  //
  // Where the engine is hooked, found in PART0 once it is loaded, in whichever bank the game runs
  // in. The picture routine's loop draws the shapes the loader has put at $E000 one by one, so on
  // its first shape the whole picture is read for the SVG, and from there to the routine's exit,
  // which sets X to 0 and Y to $E0, the machine marks every screen byte written as the picture's.
  // The box routine, which clears the picture window, starts by keeping its three colors, and
  // there the SVG and the marks are cleared, and the window's color, in A, is kept to go under
  // the next pictures' polygons.
  overlay(m, layer) {
    let window_ = 0;
    return () => {
      const find = (bytes, code) => { outer: for (let a = 0x4000; a < 0x8000 - bytes.length; a++) { for (let i = 0; i < bytes.length; i++) if (bytes[i] !== null && code[a + i] !== bytes[i]) continue outer; return a; } return -1; };
      for (const code of [m.aux, m.main]) {
        const shape = find([0x20, null, null, 0x20, null, null, 0xee, null, null, 0x4c], code);   // JSR fill; JSR outline; INC count; JMP loop
        const exit = find([0xa2, 0x00, 0xa0, 0xe0, 0x18, 0x60], code);   // LDX #0; LDY #$E0; CLC; RTS
        const box = find([0x8d, null, null, 0x8e, null, null, 0x8c, null, null, 0xad, null, null, 0xc9, 0x80, 0xf0], code);
        if (shape < 0 || exit < 0 || box < 0) continue;
        m.cpu.hooks.set(shape, c => { if (c.read16(0x60) === 0xe000) { layer.insertAdjacentHTML('beforeend', elements(shapes(a => m.read(a), 0xe000), { background: window_ })); m.marking = 1; } return false; });
        m.cpu.hooks.set(exit, () => { m.marking = 0; return false; });
        m.cpu.hooks.set(box, c => { if (c.a !== 0x80) window_ = c.a & 15; layer.innerHTML = ''; m.owner.fill(0); return false; });
        return true;
      }
      return false;
    };
  },
};
