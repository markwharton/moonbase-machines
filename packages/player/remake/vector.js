// The routines of a vector engine title, for the remake engine, as its title.js `map` names them: what each step of a
// scene does. Each gives the event the original's routine gives (events.js) and paints the original's screen for the
// view; the routine itself runs on the Original's machine (toolkit.js), which leaves the registers, the flags, the
// memory, the time and the speaker's clicks as the game's own code does. What is kept here is what the view shows: the
// screen dot for dot, the text screen, the pen, and what an ask has been given.
import { describe, result, TAKES, GIVES, POLLS, WAITS, nothing } from './events.js';
import { tables } from '@moonbase-machines/vector/objects.js';
import { pictures } from '@moonbase-machines/vector/pictures.js';
import { width, useFont } from '@moonbase-machines/vector/font.js';
import { Raster } from './raster.js';
import { label16 } from './engine.js';
import { Toolkit } from './toolkit.js';
import { INLINE } from '@moonbase-machines/vector/inline.js';
import { layout, resolve, PANELS, textLayout, textPen, textPage } from './layout.js';

// A vector title's map (its title.js `map`): `volume`, its disk's volume; `objects`, the routine that sets the table
// of objects; `seed` ({ at, used }), where the random routine keeps its seed and the byte that is $FF until its first
// call; `menu`, the Main Menu, which the key reader jumps to on control-E; `visit` ({ at, kept, back }), a way to its
// menus instead, the screen kept and put back (Nature Park's); `keyPanel`, the arrows' panel; `vars`, where the
// engine keeps what the remake reads (`zero`, how far up the zero page its routines' inputs are; the screen's
// layout; the difficulty; practice; repeats; the sound flag, on with its `soundOn` bit); `loads`, where its code
// files load when its catalog has lost it; `modern`, characters a modern font draws otherwise; `routines`, its
// engine's routines by address, each the name of its step; `problems`, each problem's own routines, by the problem's
// number.

// A game's code files, PART0, the parts and the problems, each with the address it loads at: the map's `loads`, by
// the file's name or its name without the digit, or else the catalog's
export function codeFiles(map, volume) {
  const loads = map?.loads ?? {};
  return Object.entries(volume).filter(([n]) => /^(PART|PROB)\d$/.test(n))
    .map(([name, f]) => ({ name, bytes: Uint8Array.from(atob(f.data), c => c.charCodeAt(0)), origin: loads[name] ?? loads[name.slice(0, -1)] ?? f.aux }));
}

const KEY = { escape: 27, space: 32, return: 13, delete: 127, left: 8, right: 21, down: 10, up: 11, menu: 5 };

// the inputs of a step: numbers, a register's name, or an address for the table of objects
function inputs(e, name, args) {
  const takes = TAKES[name] || '', fixed = [];
  let k = 0;
  if (name === 'panel') fixed.push(args[k++]);
  const regs = { a: e.a, x: e.x, y: e.y };
  if (name === 'objects' && args[0]?.startsWith?.('$')) { const t = parseInt(args[k++].slice(1), 16); regs.x = t & 0xff; regs.y = t >> 8; }
  else for (const r of takes) {
    const v = args[k++];
    if (v === undefined || v === r) continue;
    regs[r] = typeof v === 'object' ? v.string.charCodeAt(0) | 0x80 : v.startsWith('$') ? e.mem[parseInt(v.slice(1), 16)] : +v;
  }
  e.a = regs.a & 0xff; e.x = regs.x & 0xff; e.y = regs.y & 0xff;
  return { fixed, rest: args.slice(k) };
}

// The disk's objects, by the address of their table, for the screen model.
// `title.disk` is the title's disk from its game's data.
function objectsOf(title) {
  if (title.objectTables || !title.disk) return title.objectTables;
  const files = codeFiles(title.map, Object.values(title.disk.volumes)[0]);
  return title.objectTables = new Map(tables(files, title.map.objects).map(t => [t.address, t.objects]));
}

// The disk's pictures, by name: each one's shapes, for the screen model, and its bytes after its name and length,
// which the loader copies to $E000
function picturesOf(title) {
  if (title.pictures || !title.disk) return title.pictures;
  const volume = Object.values(title.disk.volumes)[0], map = new Map();
  for (const [name, f] of Object.entries(volume)) if (/^PICS\d$/.test(name)) {
    const bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
    for (const p of pictures(bytes)) map.set(p.name, { shapes: p.shapes, bytes: bytes.subarray(p.at + 16, p.at + p.length) });
  }
  return title.pictures = map;
}
const pictureOf = (title, name) => picturesOf(title)?.get(name.toUpperCase().replace(/_/g, ' '));

// a picture's shapes by its name, as the disk has them, for a problem that works with them
export const pictureShapes = (title, name) => pictureOf(title, name)?.shapes;

// A step's words with what the scene's code wrote into its own data before the call, read from memory now: a code's
// byte written {3:$63D8}, and a character {$4DA5}.
const filled = (words, mem) => words
  .replace(/\{([0-9a-f]+):([^}]*)\}/g, (all, code, bytes) => '{' + code + ':' + bytes.split(',').map(b => b.startsWith('$') ? mem[parseInt(b.slice(1), 16)].toString(16) : b).join(',') + '}')
  .replace(/\{\$([0-9A-Fa-f]{4})\}/g, (all, at) => String.fromCharCode(mem[parseInt(at, 16)] & 0x7f));

export function vectorRoutines(title) {
  // where this engine keeps its variables, and its routines' inputs in the zero page
  const V = title.map.vars, Z = z => V.zero + z;
  // a code file of the game's, PART0 to PART3 and PROB1 to PROB8, with the address it loads at (`codeFiles`)
  const codeFile = name => title.disk && (title.codeFiles ??= codeFiles(title.map, Object.values(title.disk.volumes)[0])).find(f => f.name === name);
  useFont(title.font);
  // The original's screen, dot for dot (raster.js), which each step paints as the original's routine painted, for
  // the view; and the text state that lasts from text to text.
  const raster = title.raster ??= new Raster();
  const pen = title.pen ??= { x: 0, y: 0, margin: 0, centre: false, spacing: 1, gap: 0, ink: 15, paper: 10 };
  // The text screen, where the menus are: its characters, its pen, and whether it is showing.
  // `show` ($5BA9) puts the graphics back.
  title.text ??= { showing: false, pen: textPen(), page: textPage() };
  const objectOf = (e, n) => objectsOf(title)?.get(e.objectTable)?.find(o => o.number === n);
  const drawObject = (e, how) => { if (e.a < 2) return raster.restore(); const o = objectOf(e, e.a); if (o) raster.object(o, e.x, e.y, how); };
  // a key cap at the pen, as $76F3 draws it: outlined in color 13 and filled with 1, four dots
  // wider than the glyph or than four, and the glyph in 15 from a dot on, after a spacer that
  // brings a narrow glyph to the cap's right; the pen is left two dots past the text's end
  const cap = ch => {
    const w = width(ch), x = pen.x, spacer = (w < 4 ? 4 - w : 0) + 1;
    raster.rectangle(1, x, pen.y - 2, Math.max(4, w) + 4, 11); raster.outline(13, x, pen.y - 2, Math.max(4, w) + 4, 11);   // ($5C83)
    raster.glyph(ch, x + 1 + spacer, pen.y, 15, 1, 1, 8);   // its text's lines are 8 high
    pen.x = x + 1 + spacer + w + 1 + 2;
  };
  // the arrows' panel, all four caps (n 0) or the nth, as the ask draws it in its arrow mode
  const keyPanel = n => {
    const k = title.map.keyPanel;
    if (!k) return;
    const c = raster.get(2, 2), { x, y } = pen;
    for (let r = k.top; r < k.top + k.rows; r++) raster.span(c, k.left, k.right, r);
    k.caps.forEach(([cx, cy, ch], i) => { if (!n || n === i + 1) { pen.x = cx; pen.y = cy; cap(String.fromCharCode(ch & 0x7f)); } });
    Object.assign(pen, { x, y });
  };
  // a text on the graphics screen, as $6CE2 paints it
  const print = (e, words) => { for (const line of layout(resolve(words, e.mem), pen)) for (const c of line.chars) raster.glyph(c.ch, c.x, line.top, c.ink ?? line.ink, line.paper, line.tall ? 2 : 1, line.height, pen.spacing); };
  // object n of the table set last, put as `how` ('whole', 'keep' or 'clear')
  const put = (e, n, x, y, how) => { const o = objectOf(e, n); if (o) raster.object(o, x, y, how); };
  // what a title's painters (titles/<title>/paint.js) paint the model with
  title.model = { raster, pen, cap, keyPanel, print, put };

  // The toolkit runs on the Original's machine (toolkit.js), made as the engine starts (`setup`). A step's routine
  // starts at its own address, for a step there (the lifter's, for a routine reached by a jump or by running on
  // into it), or else where the JSR or the JMP at the step's address goes; it comes back past the data a JSR's
  // routine takes inline.
  // (a problem's own routines are where that problem's file is, so they count only while its script runs)
  let kit = null;
  const map = new Set(Object.keys(title.map.routines).map(Number));
  const owned = Object.fromEntries(Object.entries(title.map.problems ?? {}).map(([n, r]) => ['prob' + n, new Set(Object.keys(r).map(Number))]));
  const own = (e, at) => map.has(at) || !!owned[e.name]?.has(at);
  const routineAt = (e, step) => { const m = kit.mem, op = m[step.at]; return own(e, step.at) || (op !== 0x20 && op !== 0x4c) ? step.at : m[step.at + 1] | m[step.at + 2] << 8; };
  const inline = (e, step) => INLINE[step.words[0]] && e.mem[step.at] === 0x20 && !own(e, step.at) ? INLINE[step.words[0]](a => e.mem[a & 0xffff], step.at + 3).length : 0;
  const backOf = (e, step) => (step.at + 3 + inline(e, step)) & 0xffff;
  // the address of the script's next line, where a span of code that is one step ends
  const nextAt = (e, step) => e.program.steps[step.index + 1]?.at;
  // A key for a routine that waits for one, into the machine's keyboard, whose key reader jumps to the Main Menu on
  // control-E (`menu`, below); Nature Park's keys for its menus visit them. Gives the key, or undefined while there
  // is none.
  const keyFor = (e, step) => {
    const k = e.key();
    if (k === undefined) return;
    if (title.visit?.[k]) { e.visit(k); return; }
    if (k >= 0) kit.press(k);
    return k;
  };
  // the machine's key reader at the Main Menu: what was running is dropped, as the original's jump drops it
  const menu = e => { kit.drop(); e.leave(...title.menu); };

  // A routine of the toolkit's: the step's inputs and its event, the view's drawing (`draw`, from the inputs), then
  // the routine on the machine, which leaves the registers, the memory, the time and the speaker's clicks; then what
  // the view draws from what it left (`after`), and its result (events.js `GIVES`). One that waits for a key stops
  // there, and its step runs again with each key (`keys`, for what the view shows of it). A name that starts with a
  // dot is no step.
  const routine = (name, { draw, after, words, keys } = {}) => (e, args, step) => {
    // (called by the engine itself, with no step, as a visit to the menus shows the graphics again: its event and its
    // drawing only)
    if (!step) { inputs(e, name, args); e.emit(describe(name, [], e)); draw?.(e, [], []); return; }
    if (!kit.waits(step)) {
      const { fixed, rest } = inputs(e, name, args);
      const regs = [e.a, e.x, e.y, e.n, e.z, e.c, e.v];
      if (!name.startsWith('.') && !(name === 'beep' && nothing('beep', e.a))) e.emit(describe(name, fixed, e, words ? words(e, rest) : rest.length ? rest.map(r => r.string ?? r).join(' ') : undefined, z => e.mem[Z(z)], a => e.mem[a]));
      draw?.(e, fixed, rest.map(r => r.string ?? r));
      [e.a, e.x, e.y, e.n, e.z, e.c, e.v] = regs;   // (a painter's own use of them)
    } else {
      const k = keyFor(e, step);
      if (k === undefined) return 'wait';
      keys?.(e, k);
    }
    const r = kit.call(e, step, { to: routineAt(e, step), back: backOf(e, step) });
    if (r === 'wait') { e.waitingOn = step; return 'wait'; }
    e.waitingOn = null;
    if (r === 'menu') return menu(e);
    if (r === 'quit') { e.ended = true; return; }
    after?.(e);
    if (GIVES[name] && !POLLS.has(name)) e.emit(result(name, e));
  };
  // A span of the game's code that a script has as one step, from the step's address to the script's next line: its
  // drawing for the view, which is no step of the transcript.
  const span = (name, draw) => (e, args, step) => {
    draw?.(e, args);
    if (name) { e.inside++; e.emit({ step: name }); e.inside--; }
    const r = kit.span(e, nextAt(e, step), { at: step.at });
    if (r === 'quit') e.ended = true;
  };

  // $641B: A $80 asks for an arrow, $B1 to $B9 a digit from 1, any other a letter from A, and the key chosen is
  // confirmed with return or taken back with delete or the left arrow. The machine asks; what the view shows of it,
  // the mode and the key chosen so far, is kept here as the keys go in.
  const asking = name => routine(name, {
    draw: e => { e.askMode = e.a; e.asked = null; if (e.a === 0x80) keyPanel(0); },
    keys: (e, k) => {
      const mode = e.askMode, arrows = [KEY.left, KEY.right, KEY.down, KEY.up];
      if (name === 'ask-escape' && k === KEY.escape) { e.asked = null; return; }
      if (e.asked === null) {
        let place = -1, key = k;
        if (mode === 0x80) { place = arrows.indexOf(k); key = 0xdb + place; if (place >= 0) keyPanel(place + 1); }
        else if (mode >= 0xb1 && mode < 0xba) { if (k >= 0x31 && k <= (mode & 0x7f)) place = k - 0x31; }
        else { key = k & 0x5f; if (key >= 0x41 && key <= (mode & 0x5f & 0x7f)) { place = key - 0x41; key |= 0x80; } }
        if (place >= 0) e.asked = { place, key };
        return;
      }
      if (k === KEY.delete || k === KEY.left) { if (mode === 0x80) keyPanel(0); e.asked = null; }
      if (k === KEY.return) e.asked = null;
    },
  });

  const routines = {
    // graphics shown, which the view draws
    show: routine('show', { draw: () => { title.text.showing = false; } }),
    // $573D: the text screen cleared ($7645) and shown ($5BCB), which the view draws and is no step
    'text-screen': span('text-screen', () => Object.assign(title.text, { showing: true, page: textPage() })),
    // A picture by its name, which a scene may finish as it runs, as PROB1 writes its pattern's digit ({$0C48}): the
    // view draws its shapes.
    picture: routine('picture', {
      words: (e, rest) => filled(rest.map(r => r.string ?? r).join(' '), e.mem),
      draw: (e, f, rest) => { const p = pictureOf(title, filled(rest.join(' '), e.mem)); if (p) raster.picture(p.shapes); },
    }),
    box: routine('box', { draw: e => raster.box(e.mem[V.layout], e.a, e.x, e.y) }),
    // a panel's rows, its colours and its pen, as the original's panels set them ($6299 and the rest)
    panel: routine('panel', {
      draw: (e, [n]) => {
        const p = PANELS[n];
        if (!p) return;
        raster.panel(p.rows[0], p.rows[1], p.fill);
        for (const y of p.more ?? []) raster.whiteLines(y);
        Object.assign(pen, { paper: p.paper, ink: p.ink, centre: true, spacing: 1, gap: p.gap, y: p.y });
      },
    }),
    // A text, with the bytes the scene's code writes into it before printing it read from memory when it is shown
    // (`filled`). On the text screen the text goes into its characters, and the graphics stay as they are.
    text: routine('text', {
      words: (e, rest) => filled(rest[0].string, e.mem),
      draw: (e, f, [words]) => {
        words = filled(words, e.mem);
        if (title.text.showing) { for (const c of textLayout(resolve(words, e.mem), title.text.pen)) if (title.text.page[c.row]?.[c.col]) title.text.page[c.row][c.col] = { ch: c.ch, inverse: c.inverse }; return; }
        print(e, words);
      },
    }),
    objects: routine('objects', { draw: e => { e.objectTable = e.x | e.y << 8; } }),
    object: routine('object', { draw: e => drawObject(e, 'whole') }),
    'object-keep': routine('object-keep', { draw: e => drawObject(e, 'keep') }),
    // $6863: the clear color shows the ground, from a buffer of its own, and no ground is kept
    'object-mode': routine('object-mode', { draw: e => drawObject(e, 'clear') }),
    // $76ED sets the pen to X and Y, and goes on into $76F3
    'key-at': routine('key-at', { draw: e => { pen.x = e.x; pen.y = e.y; cap(String.fromCharCode(e.a & 0x7f)); } }),
    key: routine('key', { draw: e => cap(String.fromCharCode(e.a & 0x7f)) }),
    'white-lines': routine('white-lines', { draw: e => raster.whiteLines(e.y) }),
    'fill-rows': routine('fill-rows', { draw: e => raster.rows(e.a, e.x, e.y, e.c) }),
    span: routine('span', { draw: e => raster.span(e.a, e.x, e.y, e.mem[Z(0x02)]) }),
    dot: routine('dot', { draw: e => raster.set(e.x, e.y, e.a) }),
    line: routine('line', { draw: e => raster.line(e.mem[Z(0x11)], e.mem[Z(0x00)], e.mem[Z(0x02)], e.mem[Z(0x01)], e.mem[Z(0x03)]) }),
    // $67B9 fills columns x to x + $0E, both ends, down $0F rows; $677E's four lines go from x to
    // x + $0E and from y to y + $0F
    rectangle: routine('rectangle', { draw: e => raster.rectangle(e.a, e.x, e.y, e.mem[Z(0x0e)] + 1, e.mem[Z(0x0f)]) }),
    'rectangle-outline': routine('rectangle-outline', { draw: e => raster.outline(e.a, e.x, e.y, e.mem[Z(0x0e)] + 1, e.mem[Z(0x0f)] + 1) }),
    flash: routine('flash'),
    'read-dot': routine('read-dot'),
    inside: routine('inside'),
    'key-panel': routine('key-panel', { draw: e => keyPanel(e.a) }),
    'keep-span': routine('keep-span'), 'put-span': routine('put-span'), 'invert-span': routine('invert-span'),
    // the space bar's button, which a busy routine draws as it is about to wait for the space bar
    button: routine('button', { draw: e => { if (e.inside) e.busy = null; } }),
    // a beep of 0 does nothing, and is no step (events.js)
    beep: routine('beep'),
    // a sound's five bytes; a byte may be an address, for one the scene's code writes before it plays
    sound: routine('sound', { words: (e, rest) => rest.map(b => b.startsWith('$') ? e.mem[parseInt(b.slice(1), 16)].toString(16) : b).join(' ') }),
    // PART3's own code, written at $E000, moves the picture a step to the left: drawn, and no step
    scroll: span('scroll', () => raster.scroll()),
    // Nature Park's PART3 at $9796: the dots from `left` to `right` of rows `top` to `bottom` copied
    // `by` rows down, from the bottom row up, so the rows at the top stay to be copied again:
    // drawing, and no step
    'shift-down': (e, args, step) => {
      const [left, right, top, bottom, by] = args.map(Number);
      for (let r = bottom; r >= top; r--) for (let x = left; x <= right; x++) raster.set(x, r + by, raster.get(x, r));
      e.inside++; e.emit({ step: 'shift-down', left, right, top, bottom, by }); e.inside--;
      kit.span(e, nextAt(e, step), { at: step.at });
    },
    // a part's title marks where the original's loader starts a part, as the stack is set afresh ($4035): a step, and
    // its code on the machine to the script's next line
    part: (e, args, step) => {
      const { fixed } = inputs(e, 'part', args); e.emit(describe('part', fixed, e));
      kit.span(e, nextAt(e, step), { at: step.at });
    },

    // the waits, $5C23, $5C08 and $5C20: the space bar, or for the last escape too; the second then fills its
    // button's rows ($5C08): eleven from row $B2 with the layout's first window, else from $AA
    wait: routine('wait'),
    'wait-erase': routine('wait-erase', { after: e => raster.rows(5, 11, (e.mem[V.layout] & 0x0f) === 1 ? 0xb2 : 0xaa, 1) }),
    'wait-or-escape': routine('wait-or-escape'),

    // $641B, the ask for a key, above, and $6415, the same, whose choices the problem draws as they are made
    ask: asking('ask'),
    'ask-mode': asking('ask-mode'),
    'ask-escape': asking('ask-escape'),

    // $60C2: a random number below A. Its seed is at $6131 and $6130 says whether it is in use; a pilot sets it at
    // the first call, as it does on the original.
    random: routine('random', {
      draw: () => {
        const { at, used } = title.map.seed, m = kit.mem;
        if (m[used] === 0xff && title.seed !== undefined) { m[at] = title.seed & 0xff; m[at + 1] = title.seed >> 8; }
      },
    }),
    multiply: routine('multiply'),
    divide: routine('divide'),

    // A problem, as the original's loader loads and calls it ($4DC3 in Nature Park, $57CA in Animal Rescue), on the
    // machine until it calls the problem's file at its start; the problem is the title's script probN, lifted from
    // its file, which runs from there, and as it returns the loader goes on, back to the scene.
    problem: (e, args, step) => {
      inputs(e, 'problem', args); e.emit(describe('problem', [], e));
      const n = e.a, file = codeFile('PROB' + n), lifted = 'prob' + n;
      if (!file || e.sources[lifted] === undefined) throw new Error('problem ' + n + ' is not lifted yet');
      const r = kit.call(e, step, { to: routineAt(e, step), back: backOf(e, step), stop: file.origin });
      if (r !== 'lifted') throw new Error('the loader did not call problem ' + n);
      e.stack.push({ name: e.name, pc: e.pc, after: e => { kit.resume(e); e.emit(result('problem', e)); } });
      e.enter(lifted, label16(file.origin));
    },

    // $5D66 and $5DA9: a key, as the title's own loops read it; A the key, the carry set for escape. With no key it
    // waits for one, unless a routine of a problem's own that is busy (`e.busy`, as its demonstration animates by the
    // polls) is running it, which goes on with none, as on the original. A step only when it gives a key.
    'read-key': (e, args, step) => {
      if (e.waitingOn !== step) { e.waitingOn = step; e.asked = null; }
      if (keyFor(e, step) === undefined && !(e.busy && e.inside)) return 'wait';
      e.waitingOn = null;
      if (kit.call(e, step, { to: routineAt(e, step), back: backOf(e, step) }) === 'menu') return menu(e);
      if (e.a) e.emit(result('read-key', e));
    },

    // A turn of a game's own loop that reads the keyboard without waiting for a key, as Nature Park's truck does
    // ($1382): the key down then, or none, which the page gives as time passes and the pilots one at a time, -1 for
    // none; and then the turn's own code, on the machine.
    tick: (e, args, step) => {
      if (e.waitingOn !== step) { e.waitingOn = step; e.emit(describe('tick', [], e)); }
      if (keyFor(e, step) === undefined) return 'wait';
      e.waitingOn = null;
      if (kit.call(e, step, { to: routineAt(e, step), back: backOf(e, step) }) === 'menu') return menu(e);
      e.emit(result('tick', e));
    },

    // The loader's splash, before PART0 runs: TITLE, a double hi-res picture, until a key, which the view draws and
    // is no step; then the loader on, on the machine, to where the script's next line is.
    splash: (e, args, step) => {
      if (e.waitingOn !== step) { e.inside++; e.emit({ step: 'splash' }); e.inside--; e.waitingOn = step; }
      if (keyFor(e, step) === undefined) return 'wait';
      e.waitingOn = null;
      kit.span(e, nextAt(e, step));
    },
    // Nature Park's $4C00: both halves of the graphics screen cleared to black, which is no step
    'clear-screen': span('clear-screen', () => { for (const row of raster.dots) row.fill(0); }),
    // A delay the original counts out with X and Y, on the machine: no step.
    pause: span(),

    // End, on the Main Menu: ProDOS's quit, through $0200, and the title is over
    quit: span(),

    // a part of the title not written yet: the run stops here and says which
    unwritten: (e, [what]) => { throw new Error('not written yet: ' + (what?.string ?? what)); },

    // A jump or a call into code outside the script: the title's own code, which its scripts have where its
    // `entries` say; a call to any other, the toolkit's or the loader's, runs that code on the machine, as no step.
    'goto-engine': (e, [at]) => { const to = title.entries?.[at]; if (!to) throw new Error('no script for ' + at); e.enter(...to); },
    'call-engine': (e, [at], step) => {
      const to = title.entries?.[at];
      if (to) { e.stack.push({ name: e.name, pc: e.pc }); e.enter(...to); return; }
      const r = kit.call(e, step, { to: parseInt(at.slice(1), 16), back: (step.at + 3) & 0xffff });
      if (r === 'quit') e.ended = true;
      if (r === 'wait') { e.waitingOn = step; return 'wait'; }
    },

    // The jump into a part the loader has read, on the machine, to the part's start, where its script starts: the
    // part whose file's first bytes are in memory there.
    'load-part': (e, args, step) => {
      const parts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => codeFile('PART' + n)).filter(Boolean);
      const r = kit.span(e, nextAt(e, step), { at: step.at, stops: [...new Set(parts.map(f => f.origin))] });
      const file = parts.find(f => f.origin === r && f.bytes.subarray(0, 16).every((b, i) => e.mem[f.origin + i] === b));
      if (!file) throw new Error('the loader did not start a part');
      e.stack = []; e.enter(file.name.toLowerCase(), undefined, true);
    },

    // Nature Park's settings written to its own disk through the loader ($08E9), on the machine, whose ProDOS
    // answers as the disk is: the write-protect error ($2B) with the tab on, no volume ($45) with the disk out of its
    // drive, and the carry set for either
    'write-settings': span(),
  };
  // A problem's own routine (the map's `problems`): its step, as the original's transcript has it as the routine
  // starts, the title's painter for it (paint.js), which paints it into the model of the original's screen, and the
  // routine on the machine. A routine whose own code is lifted with the problem (probN, its address one of the
  // lift's entries) runs that code inside the step instead, as a routine that reads keys does, and gives its result
  // as it returns; one only drawn has its address in the script as its own step and a return, or not at all. A
  // routine that polls for a key is a step only when it gives one (events.js `POLLS`), and one whose name starts
  // with a dot is no step at all, as the original's transcript hides it.
  for (const [n, owned] of Object.entries(title.map.problems ?? {})) for (const [at, name] of Object.entries(owned)) {
    if (routines[name]) continue;
    const quiet = name.startsWith('.'), polls = POLLS.has(name), gives = e => !quiet && GIVES[name] && (!polls || e.a && (name !== 'blink-key' || e.c));
    const script = 'prob' + n, label = label16(+at);
    const lifted = e => { if (e.sources[script] === undefined) return false; const p = e.script(script), k = p.labels[label]; return k !== undefined && p.steps[k].words[0] !== name; };
    const drawn = routine(name, { draw: e => title.paint?.[name]?.(title.model, e) });
    routines[name] = (e, args, step) => {
      if (!lifted(e)) return drawn(e, args, step);
      inputs(e, name, args);
      if (!polls && !quiet) e.emit(describe(name, [], e, undefined, z => e.mem[Z(z)], a => e.mem[a]));
      title.paint?.[name]?.(title.model, e);
      // The routine that runs its code from a scene's step is busy until it draws the space bar's button, unless it
      // waits for keys or polls for one itself, as the original's observer has it (events.js `WAITS`, `POLLS`).
      if (!e.inside) e.busy = !WAITS.has(name) && !polls ? name : null;
      e.callInside(script, label, e => { if (!e.inside) e.busy = null; if (gives(e)) e.emit(result(name, e)); });
    };
  }
  // and any routine of the map's the Remake has nothing of its own for, as the line stepping, which is no step
  for (const name of new Set(Object.values(title.map.routines))) { const [n] = name.split(' '); routines[n] ??= routine(n); }

  // The machine, booted to where the scenes start (or to the loader's key, before PART0), whose memory is the
  // engine's; the engine's own reads and writes of the I/O page go to it, on the engine's clock, and its lines are
  // timed by their instructions, as the original's are (Engine.time). Its disk is the one a route takes out and puts
  // back.
  routines.setup = e => {
    kit = e.kit = new Toolkit(title.disk, title.entries, title.menu && title.map.menu);
    e.mem = kit.mem;
    title.files = kit.m.disk;
    kit.boot(e, e.script(title.start).steps[0]?.at ?? 0x4000);
    e.io = (at, v) => {
      const m = kit.m; m.cpu.cycles = e.cycles;
      const r = m.io(at, v);
      for (const k of m.clicks) e.clicks.push(k);
      m.clicks.length = 0;
      return r;
    };
  };
  routines.timed = true;
  routines.inline = inline;
  // a step whose code runs on the machine from its own address, whose instructions the machine counts: a span of
  // code that is one step, and a routine reached at its own address
  const SPANS = new Set(['text-screen', 'scroll', 'shift-down', 'clear-screen', 'pause', 'quit', 'load-part', 'write-settings', 'splash', 'part']);
  routines.native = (e, step) => SPANS.has(step.words[0]) || own(e, step.at);
  return routines;
}
