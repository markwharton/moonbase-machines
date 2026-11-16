// The Remake's engine for an Apple title (play.js hands it the game). The game runs on its machine (remake/game.js),
// and a view on the stage draws its events: the view of the title's toolkit, where it has one (its `view`,
// remake/observer.js), or the plain view, CardView, which paints the machine's screen. A Commodore 64 title's Remake is
// the 64 itself, which the Original's engine plays (engines/original.js).
//
// The settings it acts on (play.js `game.setting`) are Clean text, where the view draws clean text (a toolkit's view
// that says `text`, and CardView for a title with `text`); the monitor, where the view paints the Apple's screen
// (CardView); and the mini view, where the page gives one and the title has a place for it. The game runs on the
// original's time, on one clock (below).
import { makeEngine } from '../remake/load.js';

// The settings this engine acts on (play.js `setting`): Clean text, the monitor and the mini view.
import { CLEAN_TEXT, MONITOR, MINI } from '../declared.js';
import { Speaker } from '../audio.js';
import { pace } from '@moonbase-machines/mos6502/pace.js';
import { clock, Clock, toWait } from '../remake/clock.js';
import { CardView } from '../remake/card-view.js';

// The settings this engine acts on for a game (play.js `using`): Clean text where its view draws text of its own, the
// monitor for the plain view's Apple screen, and the mini view where the page gives one and the title has a place for
// it. A Commodore 64 title's Remake is played by the Original's engine, which acts on none of these.
export function uses({ title, game, mini }) {
  if (game.kind === 'c64') return [];
  const plain = !title.toolkit?.view;
  return [...(title.toolkit?.text || title.text ? [CLEAN_TEXT] : []), ...(plain ? [MONITOR] : []), ...(title.inset && mini ? [MINI] : [])];
}

export async function play(g) {
  const { title, game: disk, stage, say, fail, saves, $ } = g;
  if (disk.kind === 'c64') return (await import('./original.js')).play(g, { remake: true });
  stage.innerHTML = `<svg id="screen" preserveAspectRatio="xMidYMid meet" tabindex="0" aria-label="The game's screen"></svg>`;
  // the toolkit's view, or the plain view where the title has no toolkit or its toolkit no view
  const svg = $('screen'), plain = !title.toolkit?.view;

  // its view's own drawing, for a title that has one (its title.js `view`, load.js)
  const extra = title.viewSteps ?? {};
  // what the game saves: its data disk, on the player's disk (play.js `saves`)
  title.disk = saves.data;
  const engine = makeEngine(title, { clock: new Clock() });
  if (title.files) saves.keep(title.files);
  const queue = [];
  // The view, and every event it has drawn. When Clean text is turned on or off, the events are drawn again from
  // the start. The setting is offered only where the view draws text of its own: a toolkit's view that says `text`, or
  // the plain view for a title whose title.js has `text` (CardView). The other views draw the machine's own screen.
  const history = [];
  const cleanText = title.toolkit?.text || title.text ? g.setting(CLEAN_TEXT) : { value: false, on() { return this; } };
  // The monitor, offered where the view paints the Apple's screen (CardView). A change paints the screen again at once.
  const monitor = plain ? g.setting(MONITOR) : { value: MONITOR.default, on() { return this; } };
  let onView = null;   // (the mini view's, given each view made)
  // (each view is given the engine, the game's data, the title's own drawing and the mini view's place, and takes what
  // it uses of them)
  const options = { engine, disk, extra, inset: g.mini ? title.inset : null };
  const makeView = () => { svg.replaceChildren(); const v = plain ? new CardView(svg, options) : title.toolkit.view(svg, options); v.cleanText = cleanText.value; v.monitor = monitor.value; onView?.(v); return v; };
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

  // The sound: the machine counts the original's time, and its speaker's clicks come at their cycles, as the
  // original's did, played as the emulator plays them (audio.js). A vector title clicks its speaker where the game's
  // own sound flag is on, the teacher's setting in the game. The player's Sound setting (play.js) is the speaker, on
  // or off. At a pace other than the original's nothing is heard. The cycles that ran at warp, as a vector title's
  // drawing does, are left out of the sound (the game's `untimed`).
  const speaker = engine.timed ? new Speaker() : null;
  let sounding = true;
  engine.untimed = [];
  const hear = heard => {
    if (heard) speaker?.feed(sounding ? engine.clicks : [], engine.cycles, engine.untimed); else speaker?.skip(engine.cycles);
    engine.clicks.length = 0; engine.untimed.length = 0;
  };

  // An event drawn: as the view snapshot it when it happened, with the time its step took on the original, at the
  // page's pace, for a view that shows the step for as long (`ms`, from the game's `took`: remake/game.js)
  const draw = ([source, e]) => { const ms = engine.took?.get(source); if (ms !== undefined) e.ms = ms * g.pace(); history.push(e); view.apply(e); };

  // One clock for the Remake, as for the Original (@moonbase-machines/mos6502/pace.js): sixty frames a second against
  // the page's clock, a short hitch caught up and a long pause dropped. Each frame runs the game for a frame of the
  // original's time at the page's pace (remake/clock.js); then what it did is drawn and its clicks are played, at
  // pace 1 only. The computer's own time to do that comes out of the frame, so that the game keeps the original's time
  // on a fast computer and a slow one alike.
  const time = clock(engine, { pace: g.pace });
  let stopped = false, said = null;
  const status = s => { if (s !== said) say(said = s); };
  function frame() {
    if (stopped || engine.ended) return;
    try {
      const { ran, heard } = time.frame();
      if (!ran) return;
      hear(heard);
      for (const q of queue.splice(0)) draw(q);
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
      status('Playing.');
      pace(frame, 60);
    },
    // the keys the player gives (play.js): a turn's key while the game ticks, else pressed
    key(e, k) {
      if (e.type === 'keyup') { time.keys.held = null; return; }
      if (k === undefined) return;
      e.preventDefault();
      if (time.ticking()) { time.keys.tapped = time.keys.held = k; return; }
      if (!e.repeat) press(k);
    },
    // the page's keys at the start (play.js `keys`), pressed
    keys(list) { for (const k of list) press(k); },
    start() { speaker?.start(); },
    sound(on) { sounding = on; },   // (the player's speaker: play.js)
    // A route the page gives (`route`, a workshop's pilots' route), played first as the pilots play it, each key when
    // the game waits for one, off the clock, so that it goes where it went on both sides; then the game goes on as
    // usual
    route({ route, name, keys: { expand, give } }) {
      title.seed = route.seed;   // (the random numbers from the route's seed, as the pilots have them)
      say('Playing the route ' + name + '.');
      const side = { press: k => engine.press(k) };
      const go = () => { toWait(engine); for (const q of queue.splice(0)) draw(q); };
      go();
      for (const [k] of expand(route.keys)) { give(side, k); go(); }
      view.prompts();
      hear(false);   // (the route's sounds, played off the clock, unheard)
    },
  };
}
