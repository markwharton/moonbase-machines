// Clean text for a card title: its words drawn in the game's own letters, each dot in one colour, as a monochrome
// monitor showed them.
//
// The Apple's hi-res screen has no colour of its own. A colour monitor makes colour from the pattern of dots: a lit
// dot alone shows violet, green, blue or orange by its column and its byte's high bit, and a dark dot between two lit
// dots takes their colour. Much of a letter is one dot wide, so on a colour monitor its edges show green and violet.
// That is the colour fringe. A monochrome monitor showed each lit dot lit and each dark dot dark.
//
// If the title's title.js has `text`, the words on the screen are found and painted again over the screen's pixels:
// each lit dot white and each dark dot black. The pictures are not changed. `text` is one of:
//   { font }              The title draws characters on the 40 by 24 grid from a font of 8 bytes a character,
//                         indexed by ASCII code, at `font`. A cell that matches a character of the font is text
//                         (@moonbase-machines/apple2e/hires-text.js), and its own dots are painted again.
//   { shapes, widths }    The toolkit's routine that prints (its step's `prints`, events.js) draws words from an
//                         Applesoft shape table at `shapes`, moving on by a width from the table at `widths`. The
//                         printed words are kept (`apply`), and each is painted again wherever all its dots are on
//                         the screen: its box in the colour around it, then its dots. The cursor stays as it is.
// The text screen, and the four text rows of the mixed screen, already have no fringe, so they are left as they are.
//
//   const clean = new CleanText(engine, text)   `engine` the game (game.js): its memory and its steps
//   clean.apply(event)              keeps a printed word
//   clean.paint(screen, page, px)   paints the words on the hi-res page at `page` onto px, the screen's 560 by 384
//                                   pixels as paintHires painted them
import { rowStart } from '@moonbase-machines/apple2e/screen.js';
import { walk, shapeAt } from '@moonbase-machines/apple2e/shapes.js';
import { reader, dot } from '@moonbase-machines/apple2e/hires-text.js';

const KEPT = 200;   // how many printed words are kept
const SAME_PLACE = 2;   // a word printed within this many dots of another, on the same row, replaces it
const CONTRAST = 0.6;   // the share of the dots around a word that must be the other colour for it to show
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

export class CleanText {
  constructor(engine, text) {
    this.mem = engine.mem; this.steps = engine.steps ?? {};
    this.text = text;
    this.read = text.font !== undefined ? reader(engine.mem, { font: text.font }) : null;
    this.prints = [];
  }

  // A print event gives the word's x in X (low) and Y (high), and its top in A (its step's `takes`, 'axyc').
  apply(e) {
    if (!this.steps[e.step]?.prints || this.text.shapes === undefined) return;
    if (e.c || e.words === '#') return;   // the cursor: drawn with XDRAW, or the font's #, a solid block
    const x = e.x | e.y << 8, y = e.a, words = e.words.trimEnd();
    this.prints = this.prints.filter(p => !(p.y === y && Math.abs(p.x - x) < SAME_PLACE));
    this.prints.push({ x, y, words });
    if (this.prints.length > KEPT) this.prints.shift();
  }

  paint(screen, page, px) {
    if (screen.text) return;
    const rows = screen.mixed ? 20 : 24;
    // The grid's characters: each cell's own dots, lit white and dark black.
    if (this.read?.ready()) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 40; c++) {
          if (!this.read.cell(page, c, r)) continue;
          for (let y = r * 8; y < r * 8 + 8; y++) {
            const byte = this.mem[page + rowStart(y) + c];
            for (let i = 0; i < 7; i++) square(px, c * 7 + i, y, byte >> i & 1 ? WHITE : BLACK);
          }
        }
      }
    }
    // The printed words: every word's box first, then every word's dots, so that no box covers another word's tail.
    if (this.text.shapes !== undefined) {
      const words = this.printed(page, px, rows * 8);
      for (const w of words) for (let y = w.y0; y <= w.y1; y++) for (let x = w.x0; x <= w.x1; x++) square(px, x, y, w.paper);
      for (const w of words) for (const [x, y] of w.dots) square(px, x, y, w.ink);
    }
  }

  // The printed words on the screen now. A word counts as on the screen when all its dots are there, all lit or all
  // dark, and most of the dots around it are the other way. A word that is not on the screen is still kept: the
  // toolkit draws on the hidden page before showing it, so a word may appear later.
  printed(page, px, rows) {
    const mem = this.mem, read = a => mem[a], { shapes, widths } = this.text;
    const bit = (x, y) => x >= 0 && x < 280 && y >= 0 && y < rows ? dot(mem, page, x, y) : -1;
    const words = [];
    for (const p of this.prints) {
      const dots = this.dotsOf(p, read, shapes, widths);
      if (!dots || !dots.length) continue;
      const lit = bit(...dots[0]);
      if (lit < 0 || dots.some(([x, y]) => bit(x, y) !== lit)) continue;
      const xs = dots.map(d => d[0]), ys = dots.map(d => d[1]), mine = new Set(dots.map(([x, y]) => x + ',' + y));
      const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
      const around = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!mine.has(x + ',' + y) && bit(x, y) >= 0) around.push([x, y]);
      if (!around.length) continue;
      if (around.filter(([x, y]) => bit(x, y) !== lit).length < CONTRAST * around.length) continue;   // black on black
      words.push({ x0, y0, x1: Math.min(x1, 279), y1: Math.min(y1, rows - 1), dots, ink: lit ? WHITE : BLACK, paper: commonest(px, around) });
    }
    return words;
  }

  // a printed word's dots, as the toolkit's `print` walks them; null if a character has no shape in the font
  dotsOf(p, read, shapes, widths) {
    const dots = [];
    let pen = p.x;
    for (const ch of p.words) {
      const n = ch.charCodeAt(0) - 0x1f;   // the font's first shape is the space, $20
      if (n < 1 || n > read(shapes)) return null;
      walk(read, shapeAt(read, shapes, n), { x: pen, y: p.y, scale: read(0xe7) || 1, dot: (x, y) => dots.push([x, y]) });
      pen += read(widths + n);
    }
    return dots;
  }
}

// the commonest colour among some dots, on the 560 by 384 pixels (two pixels a dot)
function commonest(px, dots) {
  const count = new Map();
  for (const [x, y] of dots) {
    const i = (y * 2 * 560 + x * 2) * 4, key = `${px[i]},${px[i + 1]},${px[i + 2]}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
}

// paints one dot, x 0 to 279 and y 0 to 191, as its two by two pixels
function square(px, x, y, [r, g, b]) {
  if (x < 0 || x >= 280 || y < 0 || y >= 192) return;
  for (let j = y * 2; j < y * 2 + 2; j++) {
    for (let i = x * 2; i < x * 2 + 2; i++) { const o = (j * 560 + i) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; }
  }
}
