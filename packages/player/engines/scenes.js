// The Remake's engine for a title of scenes, 'card' or 'vector' (play.js hands it the game): its scripts on the
// remake's engine (remake/engine.js), its events drawn by the view on the stage, the view the machine's (an Apple's
// hi-res page for a card title, CardView; a Commodore 64's, C64View; a vector title's pictures and text, View); the
// settings it acts on (play.js `game.setting`): Clean text, where the view draws clean text (View, and CardView
// for a title with `text`); the monitor, where the view paints the Apple's screen (CardView); and the mini view,
// where the page gives one and the title has a place for it. It runs on the original's time, on one clock (below).
import { makeEngine } from '../remake/load.js';

// The settings this engine acts on (play.js `setting`): Clean text, the monitor and the mini view.
import { CLEAN_TEXT, MONITOR, MINI } from '../declared.js';
import { Speaker } from '../audio.js';
import { pace } from '@moonbase-machines/mos6502/pace.js';
import { clock, Clock, toWait } from '../remake/clock.js';
import { SID } from '@moonbase-machines/c64/sid.js';
import { matrixOf } from '@moonbase-machines/c64/kernal.js';
import { standIn } from '@moonbase-machines/c64/rom.js';
import { Drive } from '@moonbase-machines/c64/drive.js';
import { View } from '../remake/view.js';
import { CardView } from '../remake/card-view.js';
import { C64View } from '../remake/c64-view.js';

// The settings this engine acts on for a game (play.js `using`): Clean text where its view draws text of its own, the
// monitor for a card title's Apple screen, and the mini view where the page gives one and the title has a place for it.
export function uses({ title, game, mini }) {
  const drawn = game.kind === 'c64' ? 'c64' : title.engine === 'card' ? 'card' : 'vector';
  return [...(drawn === 'vector' || drawn === 'card' && title.text ? [CLEAN_TEXT] : []), ...(drawn === 'card' ? [MONITOR] : []), ...(title.inset && mini ? [MINI] : [])];
}

export async function play(g) {
  const { title, scripts, game: disk, stage, say, fail, saves, $ } = g;
  const c64 = disk.kind === 'c64';
  // A Commodore 64 title that runs on its machine is the 64 itself, as the Original's engine runs it.
  if (c64 && title.machine) return (await import('./original.js')).play(g, { remake: true });
  stage.innerHTML = `<svg id="screen" preserveAspectRatio="xMidYMid meet" tabindex="0" aria-label="The game's screen"></svg>`;
  const svg = $('screen'), drawn = c64 ? 'c64' : title.engine === 'card' ? 'card' : 'vector';

  // its view's own drawing, for a title that has one (its title.js `view`, load.js)
  const extra = title.viewSteps ?? {};
  // a Commodore 64's character ROM, for its view and the printer's paper: Commodore's where the page gives them
  // (`roms`), else moonbase's own
  const chargen = g.chargen = c64 ? g.roms?.chargen ?? standIn().chargen : null;
  // a Commodore 64 title's printer on device 4, the player's (play.js), on the bus card.js makes
  if (g.printer) title.printer = g.printer;
  // what the game saves, on the player's disk (play.js `saves`): an Apple title's data disk, a Commodore 64 title's
  // drive (the drive card.js puts on the bus)
  title.disk = saves.data;
  if (c64) saves.drive(title.drive = new Drive(Uint8Array.from(atob(disk.image), ch => ch.charCodeAt(0))));
  const engine = makeEngine(title, scripts, { clock: new Clock() });
  if (title.files) saves.keep(title.files);
  const queue = [];
  // The view, and every event it has drawn. When Clean text is turned on or off, the events are drawn again from
  // the start. The setting is offered only where the view draws text of its own: a vector title (View), or a card
  // title whose title.js has `text` (CardView). The other views draw the machine's own screen.
  const history = [];
  const cleanText = drawn === 'vector' || drawn === 'card' && title.text ? g.setting(CLEAN_TEXT) : { value: false, on() { return this; } };
  // The monitor, offered where the view paints the Apple's screen (CardView). A change paints the screen again at once.
  const monitor = drawn === 'card' ? g.setting(MONITOR) : { value: MONITOR.default, on() { return this; } };
  let onView = null;   // (the mini view's, given each view made)
  const makeView = () => { svg.replaceChildren(); const v = drawn === 'c64' ? new C64View(svg, { engine, chargen }) : drawn === 'card' ? new CardView(svg, { engine, inset: g.mini ? title.inset : null }) : new View(svg, { disk, volume: Object.keys(disk.volumes)[0], engine, extra }); v.cleanText = cleanText.value; v.monitor = monitor.value; onView?.(v); return v; };
  let view = makeView();
  monitor.on(value => { view.monitor = value; view.prompts(); });
  engine.on(e => queue.push([e, view.snapshot({ ...e })]));
  // The mini view, where the page gives one (`mini`) and the title has a place for it (its title.js `inset`): Off,
  // Live or Pictures, a setting; shown in the band at the top of the screen while the band is there. A picture only:
  // the game's screen otherwise as it is
  if (title.inset && g.mini) {
    const choice = g.setting(MINI);
    const { top, bottom, view: [left, right] } = title.inset, at = document.createElement('div');
    at.className = 'mini'; at.hidden = true;
    Object.assign(at.style, { left: `${left / 5.6}%`, top: `${top / 3.84}%`, width: `${(right - left) / 5.6}%`, height: `${(bottom - top + 1) / 3.84}%` });
    svg.parentElement.append(at);
    const mini = await g.mini(at, { memory: () => engine.mem });
    // (each view's painting followed by the mini view shown or not, as the band is there or not)
    onView = v => { v.insetOn = !!choice.value; const prompts = v.prompts.bind(v); v.prompts = () => { prompts(); at.hidden = !(choice.value && v.banded); }; };
    onView(view);
    const show = () => { view.insetOn = !!choice.value; mini.mode(choice.value); view.prompts(); };
    choice.on(show);
    show();
  }
  cleanText.on(() => {
    view = makeView();
    for (const e of history) view.apply(e);
    view.prompts();
  });

  // The sound: every Remake keeps the original's time (Engine.time), and its speaker's clicks come at their cycles, as
  // the original's did, played as the emulator plays them (audio.js). A vector title's routines click it on the
  // original's machine (remake/toolkit.js), where its own sound flag is on, the teacher's setting in the game. The
  // player's Sound setting (play.js) is the speaker, on or off. At a pace other than the original's nothing is heard.
  // The cycles that took no time, as a vector title's drawing (remake/vector.js), are left out of the sound.
  const speaker = engine.timed ? new Speaker() : null;
  let sounding = true;
  engine.untimed = [];
  const hear = heard => {
    if (!c64) { if (heard) speaker?.feed(sounding ? engine.clicks : [], engine.cycles, engine.untimed); else speaker?.skip(engine.cycles); }
    engine.clicks.length = 0; engine.untimed.length = 0;
  };
  // A Commodore 64's SID, its writes of a frame played a frame at a time, as the emulator plays them
  // (engines/original.js), from the page's clock: after a pause, a tab in the background, the sound goes on from now, a
  // quarter of a second at most, and no wave the length of the pause is made.
  let sid = null, from = null, sent = 0;
  const playSid = heard => {
    if (speaker?.node && sounding && heard) {
      sid ??= new SID(speaker.rate); from ??= performance.now();
      let n = Math.floor((performance.now() - from) / 1000 * speaker.rate) - sent;
      const most = Math.floor(speaker.rate / 4);
      if (n > most) { sent += n - most; n = most; }
      if (n > 0) { const wave = sid.render(n, engine.sid.map(([, r, v]) => [0, r, v])); sent += n; speaker.node.port.postMessage(wave, [wave.buffer]); }
    }
    engine.sid.length = 0;
  };

  // An event drawn: as the view snapshot it when it happened, with the time its step took on the original, at the
  // page's pace, for a view that shows the step for as long (`ms`, from the engine's `took`: remake/vector.js)
  const draw = ([source, e]) => { const ms = engine.took?.get(source); if (ms !== undefined) e.ms = ms * g.pace(); history.push(e); view.apply(e); };

  // One clock for the Remake, as for the Original (@moonbase-machines/mos6502/pace.js): sixty frames a second against
  // the page's clock, a short hitch caught up and a long pause dropped. Each frame runs the engine for a frame of the
  // original's time at the page's pace (remake/clock.js); then what it did is drawn and its clicks are played, at
  // pace 1 only. The computer's own time to do that comes out of the frame, so that the game keeps the original's time
  // on a fast computer and a slow one alike. A Commodore 64 title's game goes on as it waits, on the clock, as the
  // original's did: its raster and its interrupt at the time they come (card.js), the screen painted from its memory
  // each frame.
  const time = clock(engine, { pace: g.pace, goesOn: c64 });
  let stopped = false, said = null;
  const status = s => { if (s !== said) say(said = s); };
  function frame() {
    if (stopped || engine.ended) return;
    try {
      // a key of ?keys when a Commodore 64 game waits for one, two seconds at least after the last, as a player
      // would press them
      if (c64 && engine.clock.ahead.length && engine.idle > (engine.routines.polls ?? 200) && !engine.keys.length && ++engine.clock.since > 120) { engine.press(engine.clock.ahead.shift()); engine.clock.since = 0; }
      const { ran, heard } = time.frame();
      if (!ran) return;
      hear(heard);
      if (c64) { queue.length = 0; playSid(heard); } else for (const q of queue.splice(0)) draw(q);
      view.prompts();
      status(engine.ended ? 'The end.' : time.waiting ? 'Waiting for a key.' : 'Playing.');
    } catch (err) { stopped = true; fail(err); }
  }

  const press = k => { engine.press(k); speaker?.start(); };
  svg.addEventListener('click', e => { const key = e.target.closest('.key')?.dataset.key; if (key) press(+key); });

  return {
    engine, press,
    run() {
      svg.focus();
      if (c64) { engine.sid = []; engine.clock = { irq: 0, ahead: [], since: 0 }; }
      status('Playing.');
      pace(frame, 60);
    },
    // the keys the player gives (play.js): a turn's key while the game ticks; a Commodore 64's held in its keyboard's
    // matrix, which its KERNAL scans and repeats as long as it is held, as the original's did
    // (@moonbase-machines/c64/kernal.js), a character typed only with shift into the buffer; else pressed
    key(e, k) {
      if (e.type === 'keyup') {
        time.keys.held = null;
        const h = engine.clock?.held;
        if (h?.key === e.key) { if (h.seen) engine.clock.held = null; else h.up = true; }
        return;
      }
      if (k === undefined) return;
      e.preventDefault();
      if (time.ticking()) { time.keys.tapped = time.keys.held = k; return; }
      const m = c64 && !e.ctrlKey && matrixOf(k);
      if (m) { if (!e.repeat) { engine.clock.held = { ...m, key: e.key }; speaker?.start(); } return; }
      if (!e.repeat) press(k);
    },
    // ?keys at the start: a Commodore 64's into the KERNAL's buffer on the clock, as a player would press them; else
    // pressed
    keys(list) { if (c64) engine.clock.ahead.push(...list); else for (const k of list) press(k); },
    start() { speaker?.start(); },
    sound(on) { sounding = on; },   // (the player's speaker: play.js)
    // A route the page gives (`route`, a workshop's pilots' route), played first as the pilots play it, each key when
    // the game waits for one, off the clock, so that it goes where it went on both sides; then the game goes on as
    // usual
    route({ route, name, keys: { expand, give, petscii, pollsAt } }) {
      title.seed = route.seed;   // (the random numbers from the route's seed, as the pilots have them)
      if (route.printer && title.printer) { title.printer.on = true; const box = $('printer'); if (box) box.checked = true; }
      say('Playing the route ' + name + '.');
      // (on a Commodore 64 a key behind the one pressed goes into the KERNAL's buffer, as the pilots hold a key)
      const side = { press: k => engine.press(k), also: k => { const m = engine.mem, put = v => { if (m[0xc6] < 10) { m[0x277 + m[0xc6]] = v; m[0xc6]++; } }; if (engine.keys.length) put(engine.keys.shift()); put(k); } };
      const go = () => { toWait(engine); if (c64) queue.length = 0; else for (const q of queue.splice(0)) draw(q); };
      go();
      for (const [i, [k]] of expand(route.keys).entries()) { give(side, k, c64 ? petscii : undefined); engine.polls = pollsAt(route, i + 1) ?? undefined; go(); }
      engine.polls = undefined; view.prompts();
      hear(false);   // (the route's sounds, played off the clock, unheard)
    },
  };
}
