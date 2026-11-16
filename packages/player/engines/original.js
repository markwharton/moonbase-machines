// The Original's engine (play.js hands it the game): the game's disk in the machine it was made for, its screen on a
// canvas on the stage, and, where the title's toolkit has an overlay (its `overlay`, remake/observer.js), its pictures
// also drawn as SVG over the canvas. Each game's machine is loaded when its game asks for it, the Commodore 64
// (@moonbase-machines/c64) or the Apple IIe (@moonbase-machines/apple2e), and not the other; on moonbase's own ROMs,
// which need nothing of the makers'.
//
// The Remake of a Commodore 64 title is played here too (engines/scenes.js hands it over, `remake`): the same machine
// on moonbase's ROMs, with the title's fixes made to its program on the disk when the player's Bugs fixed setting is
// on (remake/fixes.js).
//
// Of the player's `game` it reads: the game's data (`game`), its saves (`saves`), the title (`title`, where the page
// gives its folder) for its toolkit's overlay, the stage, the status, and what only a workshop has (play.js): `roms`,
// the makers' ROMs this machine has, an Apple game's line 1, Apple's own booting its disks, { apple: { system, disk2 },
// image: async name => its disk image's bytes }, a Commodore 64 game's Commodore's, { choice ('commodore' or
// 'moonbase-petscii', @moonbase-machines/c64/start.js), load: async name => a ROM's bytes }; and `studies`, files of its
// own for a Commodore 64 game's disk, a name to its bytes in base64, in the drive, not kept.
import { Speaker } from '../audio.js';
import { typing as typingOf } from '../keys.js';
import { pace } from '@moonbase-machines/mos6502/pace.js';

// The settings this engine acts on (play.js `setting`): the monitor the screen is shown on, and an Apple game's
// pictures drawn as vectors over the screen. Both take effect at the next frame.
import { MONITOR, VECTORS } from '../declared.js';

// The settings this engine acts on for a game (play.js `using`): the monitor, and an Apple game's pictures drawn as
// vectors where its title's toolkit has an overlay.
export const uses = ({ title, game }) => [MONITOR, ...(game.kind !== 'c64' && title?.toolkit?.overlay ? [VECTORS] : [])];

export async function play(g, { remake = false } = {}) {
  g.stage.innerHTML = '<svg id="vector" viewBox="0 0 140 192" preserveAspectRatio="none"></svg><canvas id="screen" width="560" height="384" tabindex="0"></canvas>';
  const canvas = g.stage.querySelector('canvas'), ctx = canvas.getContext('2d'), layer = g.stage.querySelector('#vector');
  return g.game.kind === 'c64' ? c64(g, { canvas, layer, speaker: new Speaker(), remake }) : apple(g, { canvas, ctx, layer, speaker: new Speaker() });
}

// An Apple II game: the machine, the canvas, the keys, and the toolkit's overlay where it has one. With Apple's
// ROMs and the game's disk images, where the page gives them (`roms`), it is line 1, the Apple itself booting the
// disks; without them, moonbase's (line 2), the game started at once.
async function apple({ title, game, saves, roms: makers, say, setting }, { canvas, ctx, layer, speaker }) {
const [{ Machine }, { placed }, { screen }] = await Promise.all([
  import('@moonbase-machines/apple2e/machine.js'), import('@moonbase-machines/apple2e/prodos.js'),
  import('@moonbase-machines/apple2e/screen.js')]);
const monitor = setting(MONITOR), vectors = title?.toolkit?.overlay ? setting(VECTORS) : { value: false };
// the title's saves on its own volume, the player's disk's (play.js `saves`): on line 2 the machine's files; on line 1
// written onto that volume's disk before it boots, and kept as the title's DOS writes it
const saving = saves.data;
let roms = null, disks = null;
if (makers?.apple) try {
  roms = makers.apple;
  disks = saves.disks(placed(saving, new Map(await Promise.all(game.images.map(async n => [n, await makers.image(n)])))));
} catch { roms = null; }
const m = new Machine(saving, { log: (...a) => console.log(...a), ...roms ? { roms, disks } : {} });
console.log(roms ? "line 1: Apple's ROMs, the disks booted" : "line 2: moonbase's machine");
saves.keep(roms ? saves.driveFiles(m, disks) : m.disk);
m.diskTime = true;   // reads from the disk take the time a disk took, as the games' loading screens expect

// The toolkit's overlay (its `overlay`): a function, called at each frame until it has found where to hook the
// toolkit's drawing, that draws its pictures into the layer over the canvas and marks the screen's bytes they cover
// (`m.owner`). A title with no overlay has none to find.
const overlay = title?.toolkit?.overlay?.(m, layer);
let hooked = !overlay;

const rgba = new Uint8ClampedArray(560 * 384 * 4);
const image = new ImageData(rgba, 560, 384);
const cols = new Uint8Array(140 * 192);
let mode = '';
// the Apple's frames, 60 a second against the clock (@moonbase-machines/mos6502/pace.js), the screen painted each
// animation frame
const frame = () => { if (!m.halted) m.runCycles(17030); };   // a frame's worth of the Apple's clock
function after() {
  const now = `text ${m.sw.text} page2 ${m.sw.page2} hires ${m.sw.hires} dhires ${m.sw.dhires}`;
  if (now !== mode) { console.log('screen:', now, 'at pc $' + m.cpu.pc.toString(16), 'cycles', m.cpu.cycles); mode = now; }
  speaker.feed(sound ? m.clicks : [], m.cpu.cycles); m.clicks.length = 0;
  if (!hooked) hooked = overlay();
  const text = m.sw.text;
  screen(m, rgba, { cols, owner: vectors.value && layer.innerHTML ? m.owner : null, ink: MONITOR.phosphors[monitor.value] });
  ctx.putImageData(image, 0, 0);
  layer.style.visibility = vectors.value && !text ? 'visible' : 'hidden';
  if (m.halted) say('The game has stopped: ' + m.halted + '.', { error: true });
  else say(m.idle > 2000 ? 'Waiting for a key.' : 'Running.');
}
canvas.addEventListener('pointerdown', () => canvas.focus());
// (the keys, the Apple's codes, given by the player: play.js, keys.js)
let sound = true;
return {
  run() { canvas.focus(); pace(frame, 60, { after }); },
  press(k) { console.log('key', k, 'at pc $' + m.cpu.pc.toString(16)); m.press(k); },
  start() { speaker.start(); },
  sound(on) { sound = on; },
  engine: m,
};
}

// A C64 game: on moonbase's own ROMs (@moonbase-machines/c64/rom.js), as the site has it everywhere, or on
// Commodore's where the page gives them (`roms`) and asks for them; the machine autostarted
// with LOAD"name",8,1, and RUN for a BASIC program, typed into the KERNAL's buffer, the frame on a canvas of
// 384 by 272 doubled, the keys as the matrix, the arrows its cursor keys, and a gamepad the joystick. A demonstration
// (play.js `demonstrate`, the game's data's steps) is typed into the same buffer the same way, after the start, the game
// taking each key when it asks for one; the person's first key or push of the stick drops what is left of it.
async function c64(g, { canvas, layer, speaker, remake }) {
  const { game, saves, roms: makers, studies, say, printer } = g;
  const monitor = g.setting(MONITOR);
  const [{ C64 }, { keyboard, painter }, { SID }, { c64Roms, typed: startTyped }, { add }] = await Promise.all([
    import('@moonbase-machines/c64/machine.js'), import('@moonbase-machines/c64/browser.js'),
    import('@moonbase-machines/c64/sid.js'), import('@moonbase-machines/c64/start.js'), import('@moonbase-machines/c64/d64.js')]);
  // (a Remake's machine is on moonbase's ROMs, with the characters the page gives where it gives them)
  const roms = remake ? { ...await c64Roms(null), ...makers?.chargen ? { chargen: makers.chargen } : {} } : await c64Roms(makers?.choice ?? null, makers?.load);
  if (!roms) { say('Commodore\'s ROMs, asked for, are not here.', { error: true }); return null; }
  g.chargen = roms.chargen;   // (the printer's paper in the machine's characters: play.js)
  const m = new C64(game, roms, { log: (...a) => console.log(...a), printer });
  // What the game SAVEs to its disk, kept on the player's disk and given back to the drive the next time (play.js
  // `saves`)
  saves.drive(m.drive);
  // (a Remake with its bugs fixed: the title's fixes made to its program on the disk, before the game loads it)
  if (remake && g.fixed && g.title?.fixes) { const { fixFiles } = await import('../remake/fixes.js'); await fixFiles(g.title, m.drive, g.folder); }
  // (and, where the page gives them, `studies`, files of its own for the disk, a name to a file: in the drive, not
  // kept)
  const raw = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  for (const [file, data] of Object.entries(studies ?? {})) m.drive.saved.set(file, raw(data));
  layer.style.display = 'none';
  const draw = painter(canvas);
  let typing = null, typed = 0, sound = true, demo = null;
  // (the person at the keys or the stick: what is left of a demonstration is theirs to stop)
  const theirs = () => { demo = null; };
  // the keys as the 64's matrix (@moonbase-machines/c64/browser.js), given them by the player (play.js)
  const listeners = { keydown: [], keyup: [] };
  // A game played with the arrows and fire names its fire key in its data (data.js `fire`), for example Option.
  const keys = keyboard(m, { log: true, listen: (type, f) => listeners[type].push(f), fire: g.game.fire ?? null });
  // once BASIC is ready, the start typed in; the KERNAL's buffer takes ten characters at a time.
  // The C64 runs 50 frames a second against the clock (@moonbase-machines/mos6502/pace.js: a hitch caught up, a pause
  // dropped), the SID's frame rendered with each, and the screen painted each animation frame
  let frames = 0, sid = null;
  const frame = n => {
    frames = n;
    // A game may call a routine of the ROMs that moonbase has not written (machine.js `rom`). The game stops there,
    // and the page says which routine it was.
    try { m.runFrame(); } catch (err) { m.halted = err.message; console.error(err); }
    keys.frame();
    if (speaker.node && sound) {
      if (!sid) sid = new SID(speaker.rate);
      const n = Math.round(19656 / 985248 * speaker.rate), first = m.cpu.cycles - 19656;
      const wave = sid.render(n, m.sidWrites.map(([c, r, v]) => [Math.floor((c - first) / 19656 * n), r, v]));
      speaker.node.port.postMessage(wave, [wave.buffer]);
    }
    m.sidWrites.length = 0;
  };
  function after() {
    // (LOAD, and RUN for a BASIC program: @moonbase-machines/c64/start.js; then a demonstration, if one is asked for)
    if (frames >= 120 && typing === null && !typed) { typing = startTyped(m, game); typed = 1; }
    if (demo !== null && m.joystick) theirs();
    if (!m.ram[0xc6]) {
      if (typing !== null) { typing = m.type(typing); if (!typing.length) typing = null; }
      else if (demo !== null && typed) { demo = m.type(demo); if (!demo.length) demo = null; }
    }
    draw(m.vic.frame, MONITOR.phosphors[monitor.value]);
    if (m.halted) say('The game has stopped: ' + m.halted + '.', { error: true });
    else say('Running.');
  }
  return {
    run() { canvas.focus(); pace(frame, 50, { after }); },
    press(k) { m.type(String.fromCharCode(k)); },   // (into the KERNAL's buffer, as typed)
    key(e) { if (e.type === 'keydown' && !e.repeat) theirs(); for (const f of listeners[e.type]) f(e); },
    demonstrate(steps) { demo = typingOf(steps, 'c64'); },
    // the page's keys at the start, typed into the KERNAL's buffer after the game has started, as a demonstration is
    keys(list) { demo = String.fromCharCode(...list); },
    start() { speaker.start(); },
    sound(on) { sound = on; },
    engine: m,
    // the disk as it now stands, its own files and those saved: a .d64 that VICE or a real 64 can use
    // (@moonbase-machines/c64/d64.js `add`)
    diskImage: () => add(m.drive.image, [...m.drive.saved].map(([name, data]) => ({ name, data }))),
  };
}
