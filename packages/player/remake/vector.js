// The routines of a vector engine title, for the remake engine, as its title.js `map` names them: what each step
// of a scene does. Each gives the event the original's routine gives
// (events.js), does what the original did to the registers, the flags and the memory that the
// scenes read, and paints the original's screen for the scenes that read it back. The rules for
// the keys, the random numbers and the waits are the original's, from PART0 (docs in
// @moonbase-machines/vector's README).
import { describe, result, TAKES, GIVES, POLLS, WAITS, nothing } from './events.js';
import { helpers } from './problems.js';
import { tables, carry } from '@moonbase-machines/vector/objects.js';
import { pictures, shapes } from '@moonbase-machines/vector/pictures.js';
import { inside } from '@moonbase-machines/vector/draw.js';
import { width, useFont } from '@moonbase-machines/vector/font.js';
import { Raster } from './raster.js';
import { label16 } from './engine.js';
import { Files } from '@moonbase-machines/apple2e/mli.js';
import { layout, resolve, PANELS, textLayout, textPen, textPage } from './layout.js';

// A vector title's map (its title.js `map`): `volume`, its disk's volume; `objects`, the routine that sets the table
// of objects; `seed` ({ at, used }), where the random routine keeps its seed and the byte that is $FF until its first
// call; `menu`, the Main Menu, which the key reader jumps to on control-E; `visit` ({ at, kept, back }), a way to its
// menus instead, the screen kept and put back (Nature Park's); `keyPanel`, the arrows' panel; `vars`, where the
// engine keeps what the remake reads (`zero`, how far up the zero page its routines' inputs are; the screen's
// layout; the difficulty; practice; repeats; the sound flag, on with its `soundOn` bit); `loads`, where its code
// files load when its catalog has lost it; `askClearsCarry`, `countInX`; `modern`, characters a modern font draws
// otherwise; `routines`, its engine's routines by address, each the name of its step; `problems`, each problem's own
// routines that draw, by the problem's number; `askCalls`, the problem's own routines the ask calls in its arrow mode
// as a choice is made (`chose`) and taken back (`undo`), by address.

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

// A step that takes a key: its event once, then it waits until a key comes. Control-E, at any
// key the original read, went to the Main Menu and dropped everything called.
function waiting(e, step, name, fixed, words, take) {
  if (e.waitingOn !== step) { e.emit(describe(name, fixed, e, words)); e.waitingOn = step; e.asked = null; }
  for (;;) {
    const k = e.key();
    if (k === undefined) return 'wait';
    if (k === KEY.menu && e.title.menu) e.leave(...e.title.menu);
    if (e.title.visit?.[k]) { e.visit(k); return 'wait'; }
    if (take(k)) { e.waitingOn = null; return; }
  }
}

// $6415 calls the problem's own routines as a choice is made and taken back ($F729 and $F74B,
// then $F776 and $F6CE, in PROB2): drawing that happens inside the ask. A problem written by hand
// gives them as generators in e.askHooks, which run to their end here, inside, so they are drawn
// and no step.
function quietly(e, run) {
  if (!run) return;
  e.inside++;
  try { for (let r = run.next(); !r.done; r = run.next()) if (r.value === 'wait') throw new Error('a choice drawn inside the ask cannot wait'); }
  finally { e.inside--; }
}

// The disk's objects, by the address of their table, for the carry the object routine leaves.
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
  // what an object's routine leaves: the carry, and in the row its rows were counted in (zero
  // page $02 from the engine's), the row past the object's bottom, which a span after it may take
  const objectCarry = e => {
    if (e.a < 2) return;   // putting ground back ends another way; no scene is known to use its carry
    const o = objectsOf(title)?.get(e.objectTable)?.find(o => o.number === e.a);
    if (o) { e.c = carry(o, e.x); e.mem[Z(0x02)] = (e.y + o.height) & 0xff; }
  };
  // The original's screen, dot for dot (raster.js), which each step paints as the original's
  // routine painted, for read-dot; and the text state that lasts from text to text.
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
  // A text on the graphics screen, as $6CE2 paints it. The original's line drawer keeps the row of each line it
  // draws at 2 in the zero page ($6F5B in Animal Rescue, $643C in Nature Park), and a scene may read it there.
  const print = (e, words) => {
    for (const line of layout(resolve(words, e.mem), pen)) {
      e.mem[Z(0x02)] = line.top;
      for (const c of line.chars) raster.glyph(c.ch, c.x, line.top, c.ink ?? line.ink, line.paper, line.tall ? 2 : 1, line.height, pen.spacing);
    }
  };
  // $5F4B ($549C in Nature Park): rows of the screen from Y filled in colour A, X of them, white at the ends with the
  // carry set, stopping at the screen's bottom. It leaves at 2 in the zero page and in A the row after the last it
  // filled, at 15 the rows it did not reach, at 0 $00 for edges or $FF, at 5 the colour times four and at 6 1; X the
  // colour's place in its table and 2, Y 40, and the carry set only if it stopped at row 192 ($5FA0).
  const fillRows = (e, c, count, first, edges) => {
    let y = first, n = count, bottom;
    for (;;) { raster.rows(c, 1, y, edges); y = (y + 1) & 0xff; if ((bottom = y >= 0xc0)) break; n = (n - 1) & 0xff; if (!n) break; }
    const m = e.mem; m[Z(2)] = y; m[Z(0x0f)] = n; m[Z(0)] = edges ? 0 : 0xff; m[Z(5)] = c << 2 & 0xff; m[Z(6)] = 1;
    e.x = (c << 2) + 2 & 0xff; e.y = 40; e.a = y; e.compare(y, 0xc0); e.c = bottom ? 1 : 0;
  };
  // object n of the table set last, put as `how` ('whole', 'keep' or 'clear')
  const put = (e, n, x, y, how) => { const o = objectOf(e, n); if (o) raster.object(o, x, y, how); };
  // what a title's painters (titles/<title>/paint.js) paint the model with
  title.model = { raster, pen, cap, keyPanel, print, put };
  const simple = (name, draw) => (e, args, step) => {
    let { fixed, rest } = inputs(e, name, args);
    const words = rest.map(r => typeof r === 'object' ? r.string : r).join(' ');
    e.emit(describe(name, fixed, e, rest.length ? words : undefined, z => e.mem[Z(z)]));
    rest = rest.map(r => typeof r === 'object' ? r.string : r);
    draw?.(e, fixed, rest);
  };
  // $641B: A $80 asks for an arrow, $B1 to $B9 a digit from 1, any other a letter from A. The
  // key chosen is then confirmed with return, or taken back with delete or the left arrow.
  // Gives X the key's place from 0, Y twice that, and A the key, its high bit set from 'A' up.
  // Animal Rescue's leaves the carry set for a letter ($6572); Nature Park's clears it ($5A56).
  // Nature Park's $58DA, ask-escape, also takes escape, at either key, and gives A 27 and the
  // carry set, and X the keyboard's byte for it, $9B, as the key read left it ($5A58, a jump into
  // the middle of a BIT that leaves only SEC and RTS).
  const letterCarry = !title.map.askClearsCarry;
  // The problem's own routines the ask calls as a choice is made and taken back, by the map (`askCalls`, by address,
  // where the title's `entries` say they are in its lifted code), each with A the choice's place and 2 ($64E6), run
  // inside the ask; or a problem's written by hand, from e.askHooks.
  const calls = (e, kind, place) => {
    const at = title.map.askCalls?.[kind];
    if (!at) return quietly(e, e.askHooks?.[kind]?.(place));
    for (const a of at) { e.a = (place + 2) & 0xff; e.runInside(...title.entries['$' + a.toString(16).toUpperCase().padStart(4, '0')]); }
  };
  const asking = name => (e, args, step) => {
    if (e.waitingOn !== step) inputs(e, name, args);
    const mode = e.waitingOn === step ? e.askMode : e.a;
    e.askMode = mode;
    const arrows = [KEY.left, KEY.right, KEY.down, KEY.up];
    if (mode === 0x80 && e.waitingOn !== step) keyPanel(0);
    const r = waiting(e, step, name, [], undefined, k => {
      if (name === 'ask-escape' && k === KEY.escape) { e.a = e.flags(27); e.x = 0x9b; e.c = 1; e.asked = null; return true; }
      if (e.asked === null) {
        let place = -1, key = k;
        if (mode === 0x80) { place = arrows.indexOf(k); key = 0xdb + place; if (place >= 0) keyPanel(place + 1); }
        else if (mode >= 0xb1 && mode < 0xba) { if (k >= 0x31 && k <= (mode & 0x7f)) place = k - 0x31; }
        else { key = k & 0x5f; if (key >= 0x41 && key <= (mode & 0x5f & 0x7f)) { place = key - 0x41; key |= 0x80; } }
        if (place >= 0) { e.asked = { place, key }; if (name === 'ask-mode') calls(e, 'chose', place); }
        return false;
      }
      if (k === KEY.return) { e.x = e.asked.place; e.y = 2 * e.x; e.a = e.asked.key; e.c = letterCarry && e.a >= 0xc1 ? 1 : 0; return true; }
      if (k === KEY.delete || k === KEY.left) { if (name === 'ask-mode') calls(e, 'undo', e.asked.place); if (mode === 0x80) keyPanel(0); e.asked = null; }
      return false;
    });
    if (r !== 'wait') { e.mem[V.layout] = 0x22; e.emit(result(name, e)); }   // $655E: panel 6, which sets $22
    return r;
  };

  const routines = {
    // graphics shown: $C01D reads with its high bit set, as a scene may test before it shows them
    show: simple('show', e => { title.text.showing = false; e.mem[0xc01d] = 0x80; }),
    // $573D: the text screen cleared ($7645) and shown ($5BCB), which the view draws and is no step
    'text-screen': e => {
      Object.assign(title.text, { showing: true, page: textPage() });
      e.mem[0xc01d] = 0;
      e.inside++; e.emit({ step: 'text-screen' }); e.inside--;
    },
    // A picture by its name, which a scene may finish as it runs, as PROB1 writes its pattern's digit ({$0C48}). The
    // loader copies the picture's shapes to $E000 and the routine draws them from there, so a scene can read them.
    // It returns the number of shapes it drew in A, and their address in X and Y, the carry clear ($7B94 in Animal
    // Rescue, $7084 in Nature Park).
    picture: (e, args) => {
      inputs(e, 'picture', args);
      const name = filled(args.map(a => typeof a === 'object' ? a.string : a).join(' '), e.mem);
      e.emit(describe('picture', [], e, name, z => e.mem[Z(z)]));
      const p = pictureOf(title, name);
      if (!p) return;
      e.mem.set(p.bytes, 0xe000);
      raster.picture(p.shapes);
      e.a = p.shapes.length & 0xff; e.x = 0; e.y = e.flags(0xe0); e.c = 0;
    },
    box: simple('box', e => raster.box(e.mem[V.layout], e.a, e.x, e.y)),
    // A panel sets the layout it clears to, as the original's panels do ($6299 and the rest). Its own text sets the
    // pen and draws one line at the pen's row, which the line drawer keeps at 2 in the zero page, as for any text.
    panel: simple('panel', (e, [n]) => {
      const p = PANELS[n];
      if (!p) return;
      e.mem[V.layout] = p.layout;
      raster.panel(p.rows[0], p.rows[1], p.fill);
      for (const y of p.more ?? []) raster.whiteLines(y);
      Object.assign(pen, { paper: p.paper, ink: p.ink, centre: true, spacing: 1, gap: p.gap, y: p.y });
      e.mem[Z(0x02)] = p.y;
    }),
    // A text, with the bytes the scene's code writes into it before printing it read from memory when it is shown
    // (`filled`). On the text screen the text goes into its characters, and the graphics stay as they are.
    text: (e, args) => {
      const words = filled(args[0].string, e.mem);
      e.emit(describe('text', [], e, words));
      if (title.text.showing) { for (const c of textLayout(resolve(words, e.mem), title.text.pen)) if (title.text.page[c.row]?.[c.col]) title.text.page[c.row][c.col] = { ch: c.ch, inverse: c.inverse }; return; }
      print(e, words);
    },
    objects: simple('objects', e => { e.objectTable = e.x | e.y << 8; }),
    // an object drawn leaves the carry the original's routine left ($6B0F), which a scene may add in
    object: simple('object', e => { drawObject(e, 'whole'); objectCarry(e); }),
    'object-keep': simple('object-keep', e => { drawObject(e, 'keep'); objectCarry(e); }),
    // $6863: the clear color shows the ground, from a buffer of its own, and no ground is kept
    'object-mode': simple('object-mode', e => drawObject(e, 'clear')),
    // $76ED sets the pen to X and Y, and goes on into $76F3
    'key-at': simple('key-at', e => { pen.x = e.x; pen.y = e.y; cap(String.fromCharCode(e.a & 0x7f)); }),
    key: simple('key', e => cap(String.fromCharCode(e.a & 0x7f))),
    'white-lines': simple('white-lines', e => raster.whiteLines(e.y)),
    'fill-rows': simple('fill-rows', e => fillRows(e, e.a, e.x, e.y, e.c)),
    span: simple('span', e => raster.span(e.a, e.x, e.y, e.mem[Z(0x02)])),
    // a dot, which returns with A its place in its group of seven times 16, and its color ($5B45)
    dot: simple('dot', e => { raster.set(e.x, e.y, e.a); e.a = (e.x % 7) << 4 | e.a & 15; }),
    line: simple('line', e => raster.line(e.mem[Z(0x11)], e.mem[Z(0x00)], e.mem[Z(0x02)], e.mem[Z(0x01)], e.mem[Z(0x03)])),
    // $67B9 fills columns x to x + $0E, both ends, down $0F rows; $677E's four lines go from x to
    // x + $0E and from y to y + $0F
    rectangle: simple('rectangle', e => raster.rectangle(e.a, e.x, e.y, e.mem[Z(0x0e)] + 1, e.mem[Z(0x0f)])),
    'rectangle-outline': simple('rectangle-outline', e => raster.outline(e.a, e.x, e.y, e.mem[Z(0x0e)] + 1, e.mem[Z(0x0f)] + 1)),
    flash: simple('flash'),
    // $5B4C: the color of a dot of the original's screen, from the screen model
    'read-dot': (e, args) => { inputs(e, 'read-dot', args); e.emit(describe('read-dot', [], e)); e.a = e.flags(raster.get(e.x, e.y)); e.emit(result('read-dot', e)); },
    // the point test ($7144 in Nature Park): whether the dot at X and Y is inside the shape whose bytes start at the
    // address kept at $60, in A as the engine gives it (draw.js `inside`)
    inside: (e, args) => { inputs(e, 'inside', args); e.emit(describe('inside', [], e)); e.a = e.flags(inside(shapes(a => e.mem[a], e.mem[0x60] | e.mem[0x61] << 8)[0], e.x, e.y)); e.emit(result('inside', e)); },
    'key-panel': simple('key-panel', e => keyPanel(e.a)), 'keep-span': simple('keep-span'), 'put-span': simple('put-span'), 'invert-span': simple('invert-span'),
    // the space bar's button, which a busy routine draws as it is about to wait for the space bar
    button: simple('button', e => { if (e.inside) e.busy = null; }),
    // a beep of 0 does nothing, and is no step (events.js)
    beep: (e, args) => { inputs(e, 'beep', args); if (!nothing('beep', e.a)) e.emit(describe('beep', [], e)); },
    // a sound's five bytes; a byte may be an address, for one the scene's code writes before it plays
    sound: (e, args) => e.emit(describe('sound', [], e, args.map(b => b.startsWith('$') ? e.mem[parseInt(b.slice(1), 16)].toString(16) : b).join(' '))),
    // PART3's own code, written at $E000, moves the picture a step to the left: drawn, and no step
    scroll: e => { raster.scroll(); e.inside++; e.emit({ step: 'scroll' }); e.inside--; },
    // Nature Park's PART3 at $9796: the dots from `left` to `right` of rows `top` to `bottom` copied
    // `by` rows down, from the bottom row up, so the rows at the top stay to be copied again:
    // drawing, and no step
    'shift-down': (e, args) => {
      const [left, right, top, bottom, by] = args.map(Number);
      for (let r = bottom; r >= top; r--) for (let x = left; x <= right; x++) raster.set(x, r + by, raster.get(x, r));
      e.inside++; e.emit({ step: 'shift-down', left, right, top, bottom, by }); e.inside--;
    },
    // a part's title marks where the original's loader starts a part
    part: simple('part'),

    // the waits, $5C23, $5C08 and $5C20: the space bar, or for the last escape too, which it
    // returns with the carry set
    wait: (e, args, step) => waiting(e, step, 'wait', [], undefined, k => k === KEY.space && (e.a = 32, e.c = 0, true)),
    'wait-erase': (e, args, step) => waiting(e, step, 'wait-erase', [], undefined, k => k === KEY.space),
    'wait-or-escape': (e, args, step) => {
      const r = waiting(e, step, 'wait-or-escape', [], undefined, k => (k === KEY.space || k === KEY.escape) && (e.c = k === KEY.escape ? 1 : 0, e.a = k, true));
      if (r !== 'wait') e.emit(result('wait-or-escape', e));
      return r;
    },

    // $641B, the ask for a key, above
    ask: asking('ask'),
    // $6415: the same, and the problem draws the choice as it is made, which is left to the view
    'ask-mode': asking('ask-mode'),
    'ask-escape': asking('ask-escape'),

    // $60C2: the seed times 259, divided by 65535 over n. The seed is at $6131 and $6130 says it is
    // in use; a pilot sets it at the first call, as it does on the original.
    random: (e, args) => {
      const { fixed } = inputs(e, 'random', args);
      e.emit(describe('random', fixed, e));
      const n = e.a;
      const { at, used } = title.map.seed;
      if (e.mem[used] === 0xff && title.seed !== undefined) { e.mem[at] = title.seed & 0xff; e.mem[at + 1] = title.seed >> 8; }
      let seed = e.mem[at] | e.mem[at + 1] << 8;
      seed = (seed * 259) & 0xffff;
      e.mem[at] = seed & 0xff; e.mem[at + 1] = seed >> 8; e.mem[used] = n;
      const q = n ? Math.floor(0xffff / n) : 0xffff;
      e.a = Math.floor(seed / q) & 0xff; e.c = 0;
      e.emit(result('random', e));
    },

    multiply: (e, args) => { inputs(e, 'multiply', args); e.emit(describe('multiply', [], e)); const p = e.a * e.x; e.a = p & 0xff; e.x = p >> 8; e.emit(result('multiply', e)); },
    divide: (e, args) => { inputs(e, 'divide', args); e.emit(describe('divide', [], e)); const d = e.x | e.y << 8, n = e.a || 1; e.a = Math.floor(d / n) & 0xff; e.x = d % n; e.emit(result('divide', e)); },

    // A problem, loaded and called as the original's loader does it ($4DC3 in Nature Park, $57CA in Animal Rescue):
    // the carry says whether it is practice, the file goes where the loader puts it, and the problem runs from the
    // file's start. Nature Park's loader takes the number of times from X for a problem from the Problems menu, in
    // place of the teacher's, and puts the teacher's back after. The carry comes back clear.
    // A problem lifted from its file (its title's script probN) is called there, and returns here. A problem written
    // by hand for the remake (its title's problems.js) runs as a function, until it is done.
    problem: (e, args, step) => {
      if (!e.problem) {
        inputs(e, 'problem', args); e.emit(describe('problem', [], e)); e.mem[V.practice] = e.c ? 0x80 : 0;
        e.repeats = e.mem[V.repeats];
        if (title.map.countInX && e.c) e.mem[V.repeats] = e.x;
        const file = codeFile('PROB' + e.a);
        if (file) e.mem.set(file.bytes, file.origin);
        const lifted = 'prob' + e.a;
        if (e.sources[lifted] !== undefined) {
          const repeats = e.repeats;
          e.stack.push({ name: e.name, pc: e.pc, after: e => { e.c = 0; if (title.map.countInX) e.mem[V.repeats] = repeats; e.emit(result('problem', e)); } });
          e.enter(lifted, label16(file.origin));
          return;
        }
        const run = title.problems?.[e.a];
        if (!run) throw new Error('problem ' + e.a + ' is not written yet');
        e.problem = run(helpers(e, routines));
      }
      if (!e.problem.next().done) return 'wait';
      e.problem = null; e.c = 0; e.mem[V.repeats] = e.repeats; e.emit(result('problem', e));
    },

    // $5D66 and $5DA9: a key, as the title's own loops read it; A the key, the carry set for escape
    // With no key, inside a routine of a problem's own that is busy (`e.busy`, as its demonstration animates by the
    // polls), it gives none, A, X and Y 0, and the routine goes on, as on the original; anywhere else it waits for one.
    'read-key': (e, args, step) => {
      if (e.waitingOn !== step) { e.waitingOn = step; e.asked = null; }
      const k = e.key();
      if (k === undefined && e.busy && e.inside) { e.waitingOn = null; e.a = e.flags(0); e.x = 0; e.y = 0; e.c = 0; return; }
      if (k === undefined) return 'wait';
      if (title.visit?.[k]) { e.visit(k); return 'wait'; }
      e.waitingOn = null;
      if (k === KEY.menu && title.menu) e.leave(...title.menu);
      e.a = e.flags(k & 0x7f); e.c = k === KEY.escape ? 1 : 0;
      e.emit(result('read-key', e));
    },

    // PART0's line stepping, which its line routine uses ($6F35 in Nature Park) and a problem may call itself, as the
    // clock does: sums on the zero page, no steps. From the point at 0 and 2 to the one at 1 and 3 ($6F43), the
    // longer side's length at 4 and the shorter's at 5, an error and the two sums that step it at 6 to 11 (twice the
    // shorter side, less the longer, and less it again), X and Y the first point, and at 4 the number of points. The
    // original writes the steps it will take into its own code; the Remake keeps them with the engine.
    '.line-start': e => {
      const m = e.mem, side = (a, b) => { const d = (m[Z(b)] - m[Z(a)]) & 0xff; return m[Z(b)] >= m[Z(a)] ? [d, 1] : [(-d) & 0xff, -1]; };
      const [dx, sx] = side(0, 1), [dy, sy] = side(2, 3), across = dx >= dy;
      const long = across ? dx : dy, short = across ? dy : dx;
      e.lineSteps = { one: across ? [sx, 0] : [0, sy], both: [sx, sy] };
      const word = (at, v) => { m[Z(at)] = v & 0xff; m[Z(at + 1)] = v >> 8 & 0xff; };
      word(8, short * 2); word(6, short * 2 - long); word(10, short * 2 - 2 * long);
      m[Z(5)] = short; m[Z(4)] = (long + 1) & 0xff;
      e.x = m[Z(0)]; e.y = m[Z(2)]; e.flags(m[Z(4)]);
    },
    // A point on along the line ($6FB7): with the error not negative, a step on both sides and the error stepped by
    // the sum at 10; else a step on the longer side only, by the sum at 8. Then the count at 4 down, zero at the end.
    '.line-step': e => {
      const m = e.mem, ok = !(m[Z(7)] & 0x80), [ax, ay] = ok ? e.lineSteps.both : e.lineSteps.one, by = ok ? 10 : 8;
      e.x = (e.x + ax) & 0xff; e.y = (e.y + ay) & 0xff;
      const lo = m[Z(6)] + m[Z(by)], hi = m[Z(7)] + m[Z(by + 1)] + (lo >> 8);
      e.v = ~(m[Z(7)] ^ m[Z(by + 1)]) & (m[Z(7)] ^ hi) & 0x80 ? 1 : 0; e.c = hi >> 8 & 1;
      m[Z(6)] = lo & 0xff; m[Z(7)] = hi & 0xff;
      m[Z(4)] = (m[Z(4)] - 1) & 0xff; e.flags(m[Z(4)]);
    },

    // A turn of a game's own loop that reads the keyboard without waiting for a key, as Nature Park's truck does
    // ($1382, through PART0's key poll $5283): A the key down then, the carry set for escape, and X and Y 0. With no
    // key it gives 0; only a joystick, which the Remake has none of, gives it anything else. The page gives a key or
    // none as time passes, and the pilots one at a time, -1 for none.
    tick: (e, args, step) => {
      if (e.waitingOn !== step) { e.waitingOn = step; e.emit(describe('tick', [], e)); }
      const k = e.key();
      if (k === undefined) return 'wait';
      if (title.visit?.[k]) { e.visit(k); return 'wait'; }
      e.waitingOn = null;
      if (k === KEY.menu && title.menu) e.leave(...title.menu);
      e.a = e.flags(k >= 0 ? k & 0x7f : 0); e.c = k === KEY.escape ? 1 : 0; e.x = 0; e.y = 0;
      e.emit(result('tick', e));
    },

    // The loader's splash, before PART0 runs: TITLE, a double hi-res picture, until a key. The
    // original's engine is not in yet, so it is no step; the view draws it.
    splash: (e, args, step) => {
      if (e.waitingOn !== step) { e.inside++; e.emit({ step: 'splash' }); e.inside--; e.waitingOn = step; }
      if (e.key() === undefined) return 'wait';
      e.waitingOn = null;
    },
    // Nature Park's $4C00: both halves of the graphics screen cleared to black, which is no step
    'clear-screen': e => {
      for (const row of raster.dots) row.fill(0);
      e.inside++; e.emit({ step: 'clear-screen' }); e.inside--;
    },

    // A delay the original made by counting X and Y down, given as the milliseconds it took: no
    // step, and nothing changes but the registers, both 0 when the count is done. The page waits.
    pause: (e, [ms]) => { e.x = 0; e.y = 0; e.flags(0); e.inside++; e.emit({ step: 'pause', ms: +ms }); e.inside--; },

    // End, on the Main Menu: ProDOS's quit, through $0200, and the title is over
    quit: e => { e.ended = true; },

    // a part of the title not written yet: the run stops here and says which
    unwritten: (e, [what]) => { throw new Error('not written yet: ' + (what?.string ?? what)); },

    // a jump or a call into PART0's own code, which the title's scripts have: the title's
    // `entries` say where each address is
    'goto-engine': (e, [at]) => { const to = title.entries?.[at]; if (!to) throw new Error('no script for ' + at); e.enter(...to); },
    'call-engine': (e, [at]) => { const to = title.entries?.[at]; if (!to) throw new Error('no script for ' + at); e.stack.push({ name: e.name, pc: e.pc }); e.enter(...to); },

    // the loader: part A's script, from its start, after the title has shown it
    // (and, with the disk out of its drive, it comes back, as the loader's read does with its error)
    'load-part': (e) => {
      const volume = Object.keys(title.disk?.volumes ?? {})[0]?.toUpperCase();
      if (title.files?.out?.has(volume)) { e.a = e.flags(0x45); e.c = 1; return; }
      const file = codeFile('PART' + e.a);
      if (file) e.mem.set(file.bytes, file.origin);
      e.stack = []; e.enter('part' + e.a, undefined, true);
    },

    // Nature Park's settings written to its own disk through the loader ($08E9): ProDOS's
    // SET_FILE_INFO, answered from the disks as @moonbase-machines/apple2e/mli.js answers the original's call: the
    // write-protect error ($2B) with the tab on, no volume ($45) with the disk out of its drive,
    // and the carry set for either; clear when it goes through
    'write-settings': e => {
      const files = title.files ??= new Files(title.disk), volume = Object.keys(title.disk.volumes)[0].toUpperCase();
      const err = files.out?.has(volume) ? 0x45 : files.disks[volume] === 'protected' ? 0x2b : 0;
      e.a = e.flags(err); e.c = err ? 1 : 0;
    },
  };
  // A problem's own routine (the map's `problems`): its step, as the original's transcript has it as the routine
  // starts, and the title's painter for it (paint.js), which paints it into the model of the original's screen and
  // does what it does to memory. A routine whose own code is lifted with the problem (probN, its address one of the
  // lift's entries) then runs that code inside the step, as a routine that reads keys does, and gives its result as
  // it returns; one only drawn has its address in the script as its own step and a return, or not at all. A routine
  // that polls for a key is a step only when it gives one (events.js `POLLS`), and one whose name starts with a dot
  // is no step at all, as the original's transcript hides it.
  for (const [n, own] of Object.entries(title.map.problems ?? {})) for (const [at, name] of Object.entries(own)) {
    if (routines[name]) continue;
    const quiet = name.startsWith('.'), polls = POLLS.has(name), gives = e => !quiet && GIVES[name] && (!polls || e.a && (name !== 'blink-key' || e.c));
    const script = 'prob' + n, label = label16(+at);
    const lifted = e => { if (e.sources[script] === undefined) return false; const p = e.script(script), k = p.labels[label]; return k !== undefined && p.steps[k].words[0] !== name; };
    routines[name] = (e, args) => {
      inputs(e, name, args);
      if (!polls && !quiet) e.emit(describe(name, [], e, undefined, z => e.mem[Z(z)], a => e.mem[a]));
      title.paint?.[name]?.(title.model, e);
      if (!lifted(e)) return;
      // The routine that runs its code from a scene's step is busy until it draws the space bar's button, unless it
      // waits for keys or polls for one itself, as the original's observer has it (events.js `WAITS`, `POLLS`).
      if (!e.inside) e.busy = !WAITS.has(name) && !polls ? name : null;
      e.callInside(script, label, e => { if (!e.inside) e.busy = null; if (gives(e)) e.emit(result(name, e)); });
    };
  }
  // The game's code in memory where its loader puts it, as the scenes read bytes of it: PART0 from the start, as the
  // panels' rows are read from it, and each part and problem as it is loaded.
  routines.setup = e => { const file = codeFile('PART0'); if (file) e.mem.set(file.bytes, file.origin); };
  return routines;
}
