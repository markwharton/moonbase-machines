// Clean text for a card title. If the title's title.js has `text`, the words on the screen are found, their dots are
// painted over with the background colour, and they are drawn again as text in the faces of faces.js. The picture is
// not changed. `text` is one of:
//   { font }              The title draws characters on the 40 by 24 grid from a font of 8 bytes a character,
//                         indexed by ASCII code, at `font`. Every cell that matches a character is text
//                         (@moonbase-machines/apple2e/hires-text.js).
//   { shapes, widths }    The toolkit's `print` draws words from an Applesoft shape table at `shapes`, moving on by
//                         a width from the table at `widths`. The printed words are kept (`apply`), and each is drawn
//                         wherever its dots are on the screen. The cursor stays as dots.
// The text screen, and the four text rows of the mixed screen, are drawn as text too.
//
//   const clean = new CleanText(engine, text)
//   clean.apply(event)              keeps a printed word
//   clean.find(screen, page, px)    the words on the screen now; their backgrounds are painted onto px
//   clean.draw(g, words)            draws the words into the SVG group g
import { textRow, textChar } from '@moonbase-machines/apple2e/screen.js';
import { walk, shapeAt } from '@moonbase-machines/apple2e/shapes.js';
import { reader, dot } from '@moonbase-machines/apple2e/hires-text.js';
import { WORDS, gridText, fit } from './faces.js';

const NS = 'http://www.w3.org/2000/svg';
const KEPT = 200;   // how many printed words are kept
const SAME_PLACE = 2;   // a word printed within this many dots of another, on the same row, replaces it
const CONTRAST = 0.6;   // the share of the dots around a word that must be the other colour for it to show
// The shape font's words: the size that matches its capitals, and the baseline below the top it is drawn from.
const WORDS_SIZE = 27, WORDS_WEIGHT = 500, WORDS_BASELINE = 13;

export class CleanText {
  constructor(engine, text) {
    this.mem = engine.mem;
    this.text = text;
    this.read = text.font !== undefined ? reader(engine.mem, { font: text.font }) : null;
    this.prints = [];
  }

  // A print event gives the word's x in X (low) and Y (high), and its top in A (events.js `print: 'axyc'`).
  apply(e) {
    if (e.step !== 'print' || this.text.shapes === undefined) return;
    if (e.c || e.words === '#') return;   // the cursor: drawn with XDRAW, or the font's #, a solid block
    const x = e.x | e.y << 8, y = e.a, words = e.words.trimEnd();
    this.prints = this.prints.filter(p => !(p.y === y && Math.abs(p.x - x) < SAME_PLACE));
    this.prints.push({ x, y, words });
    if (this.prints.length > KEPT) this.prints.shift();
  }

  // All backgrounds are painted before any word is drawn, so a word's tail is not covered by the line below.
  find(screen, page, px) {
    const words = [];
    const cell = (c, r, ch, inverse) => {
      if (ch === ' ' && !inverse) return;
      words.push({ grid: true, x: c * 14, y: r * 16, w: 14, h: 16, ch, ink: inverse ? '#000' : '#fff', paper: inverse ? [255, 255, 255] : [0, 0, 0] });
    };
    const textRows = screen.text ? [0, 24] : screen.mixed ? [20, 24] : null;
    if (textRows) {
      for (let r = textRows[0]; r < textRows[1]; r++) {
        for (let c = 0; c < 40; c++) { const { ch, inverse } = textChar(this.mem[textRow(r) + c]); cell(c, r, ch, inverse); }
      }
    }
    if (!screen.text && this.read?.ready()) {
      for (let r = 0; r < (screen.mixed ? 20 : 24); r++) {
        for (let c = 0; c < 40; c++) { const hit = this.read.cell(page, c, r); if (hit) cell(c, r, hit[0], hit[1]); }
      }
    }
    if (!screen.text && this.text.shapes !== undefined) words.push(...this.printed(page, px, screen.mixed ? 160 : 192));
    for (const w of words) fill(px, w.x, w.y, w.w, w.h, w.paper);
    return words;
  }

  // The printed words on the screen now. A word counts as on the screen when all its dots are there in one colour and
  // most of the dots around it are the other colour. A word that is not on the screen is still kept: the toolkit draws
  // on the hidden page before showing it, so a word may appear later.
  printed(page, px, rows) {
    const mem = this.mem, read = a => mem[a], { shapes, widths } = this.text;
    const bit = (x, y) => x >= 0 && x < 280 && y >= 0 && y < rows ? dot(mem, page, x, y) : -1;
    const words = [];
    for (const p of this.prints) {
      const dots = this.dotsOf(p, read, shapes, widths);
      if (!dots || !dots.length) continue;
      const ink = bit(...dots[0]);
      if (ink < 0 || dots.some(([x, y]) => bit(x, y) !== ink)) continue;
      const xs = dots.map(d => d[0]), ys = dots.map(d => d[1]), mine = new Set(dots.map(([x, y]) => x + ',' + y));
      const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
      const around = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!mine.has(x + ',' + y) && bit(x, y) >= 0) around.push([x, y]);
      if (around.filter(([x, y]) => bit(x, y) !== ink).length < CONTRAST * around.length) continue;   // black on black
      words.push({
        grid: false, x: x0 * 2, y: y0 * 2, w: (x1 - x0 + 1) * 2, h: (y1 - y0 + 1) * 2, ch: p.words,
        base: (p.y + WORDS_BASELINE) * 2, ink: `rgb(${commonest(px, dots)})`, paper: commonest(px, around),
      });
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

  // A grid character is centred in its cell; a printed word is stretched to the width its dots took.
  draw(g, words) {
    g.replaceChildren();
    for (const w of words) {
      if (!w.ch.trim()) continue;   // an inverse space: background only
      const at = w.grid ? gridText(w.x, w.y, w.ink)
        : { y: w.base, fill: w.ink, 'font-family': WORDS, 'font-size': WORDS_SIZE, 'font-weight': WORDS_WEIGHT, 'data-x': w.x + 2, 'data-width': w.w - 4 };
      const t = document.createElementNS(NS, 'text');
      for (const [k, v] of Object.entries(at)) t.setAttribute(k, v);
      t.textContent = w.ch;
      g.append(t);
    }
    fit(g);
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

// fills a box of the 560 by 384 pixels with one colour
function fill(px, x, y, w, h, [r, g, b]) {
  for (let j = Math.max(0, y); j < Math.min(384, y + h); j++) {
    for (let i = Math.max(0, x); i < Math.min(560, x + w); i++) { const o = (j * 560 + i) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; }
  }
}
