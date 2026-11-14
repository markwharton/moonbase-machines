// The view of a card toolkit title (card.js): the screen as the remake's memory holds
// it, the hi-res page the soft switches show, or the text screen, painted dot for dot as the
// machine's page paints it (@moonbase-machines/apple2e/screen.js), 560 by 384. The toolkit's pictures are bitmaps,
// and this is them as they are; drawing them sharper is for later.
//
// Its words drawn clean (Mark, 14 November 2026), for a title that says how its text is drawn (its title.js `text`),
// unless the person's Old style text is on (`oldStyle`, set by engines/scenes.js): each word found on the screen has
// its dots painted over in the paper round it, and is drawn again over the picture in a face of today (faces.js), so
// nothing of the picture changes but the words. A title's text is one of:
//   { font }              a font of its own on the 40 by 24 grid, 8 bytes a character by ASCII code (Pieces of
//                         Eight's at $9400): every cell that reads as a character of it (text-reader.js)
//   { shapes, widths }    a proportional font drawn by the toolkit's `print`, an Applesoft shape table (Detect-A-
//                         Pet's at $A3E1) and its widths, a byte a character from the space (at $728C): every print the
//                         view has been given (`apply`) whose dots all still stand on the screen, in one ink, with the
//                         dots round them mostly the other way; one printed again in the same place (a name as it is
//                         typed), the last alone; the cursor (XDRAW, or the font's # drawn, a block in that font) left
//                         as dots
// and either way the text screen's characters, and the mixed screen's four rows, on the grid.
//
// `inset` (a title's, its title.js), when set on: the screen's band at the top, where it is (its rows above
// `top` all white), its dots `move` moved `by`, to make room for a mini view; `banded`, whether the band was there
// at the last painting.
import { paintHires, paintText, rowStart, textRow } from '@moonbase-machines/apple2e/screen.js';
import { walk, shapeAt } from '@moonbase-machines/apple2e/shapes.js';
import { reader } from './text-reader.js';
import { WORDS, GRID } from './faces.js';

const NS = 'http://www.w3.org/2000/svg';
const KEPT = 200;   // (the prints kept to look for, the latest)

export class CardView {
  constructor(svg, { engine, inset = null }) {
    this.svg = svg; this.engine = engine; this.inset = inset; this.insetOn = false; this.banded = false; this.oldStyle = false;
    svg.setAttribute('viewBox', '0 0 560 384');
    this.canvas = document.createElement('canvas'); this.canvas.width = 560; this.canvas.height = 384;
    this.image = document.createElementNS(NS, 'image');
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: 560, height: 384, preserveAspectRatio: 'none', style: 'image-rendering: pixelated' })) this.image.setAttribute(k, v);
    svg.append(this.image);
    // the clean words, over the picture
    this.words = document.createElementNS(NS, 'g'); this.words.setAttribute('class', 'words'); svg.append(this.words);
    this.text = engine.title.text ?? null;
    this.read = this.text?.font !== undefined ? reader(engine.mem, { font: this.text.font }) : null;
    this.prints = [];
  }
  snapshot(e) { return e; }
  // each print, where the title's words are a proportional font: where and what, to look for at each painting
  apply(e) {
    if (e.step !== 'print' || this.text?.shapes === undefined || e.c || e.words === '#') return;
    const x = e.x | e.y << 8, y = e.a, words = e.words.trimEnd();
    this.prints = this.prints.filter(p => !(p.y === y && Math.abs(p.x - x) < 2));   // (printed again in the same place)
    this.prints.push({ x, y, words });
    if (this.prints.length > KEPT) this.prints.shift();
  }
  // the screen, when a run has gone as far as it goes
  prompts() {
    const mem = this.engine.mem, s = this.engine.title.screen, ctx = this.canvas.getContext('2d');
    const pixels = ctx.createImageData(560, 384), page = s.page2 ? 0x4000 : 0x2000;
    if (s.text) paintText(pixels.data, mem, mem, false, [0, 24]);
    else {
      paintHires(pixels.data, mem.subarray(page, page + 0x2000));
      if (s.mixed) paintText(pixels.data, mem, mem, false, [20, 24]);
    }
    const clean = this.text && !this.oldStyle ? this.found(mem, s, page, pixels.data) : [];
    this.banded = this.insetOn && !!this.inset && band(pixels.data, this.inset);
    if (this.banded) shift(pixels.data, this.inset);
    ctx.putImageData(pixels, 0, 0);
    this.image.setAttribute('href', this.canvas.toDataURL());
    this.draw(clean);
  }
  // The words on the screen: each its dots painted over in its paper on the pixels (every word's paper first, so a
  // word's tail is never covered by the word under it), and what to draw over them
  found(mem, s, page, px) {
    const out = [];
    const cell = (c, r, ch, inverse) => { if (ch === ' ' && !inverse) return; out.push({ grid: true, x: c * 14, y: r * 16, w: 14, h: 16, ch, ink: inverse ? '#000' : '#fff', paper: inverse ? [255, 255, 255] : [0, 0, 0] }); };
    const textRows = s.text ? [0, 24] : s.mixed ? [20, 24] : null;
    if (textRows) for (let r = textRows[0]; r < textRows[1]; r++) for (let c = 0; c < 40; c++) { const [ch, inverse] = textChar(mem[textRow(r) + c]); cell(c, r, ch, inverse); }
    if (!s.text && this.read) for (let r = 0; r < (s.mixed ? 20 : 24); r++) for (let c = 0; c < 40; c++) { const hit = this.read.cell(page, c, r); if (hit) cell(c, r, hit[0], hit[1]); }
    if (!s.text && this.text.shapes !== undefined) out.push(...this.standing(mem, page, px, s.mixed ? 160 : 192));
    for (const w of out) fill(px, w.x, w.y, w.w, w.h, w.paper);
    return out;
  }
  // each kept print still on the screen, every dot of its letters in one ink and the dots round them mostly the other
  // way. A print not on the screen now is kept all the same, as the latest KEPT are: the toolkit draws a screen on the
  // page not shown, copies pages and wipes rows, and a painting can fall between, so whether a print is there is asked
  // afresh at each painting, never decided once
  standing(mem, page, px, rows) {
    const { shapes, widths } = this.text, read = a => mem[a];
    const bit = (x, y) => x >= 0 && x < 280 && y >= 0 && y < rows ? (mem[page + rowStart(y) + ((x / 7) | 0)] >> (x % 7)) & 1 : -1;
    // (whether the letters' dots all stand on the page shown, in one ink)
    const stands = dots => { const lit = dots.filter(([x, y]) => bit(x, y) === 1).length; return lit ? lit === dots.length : dots.every(([x, y]) => bit(x, y) === 0); };
    // (the colour most of some dots are painted, on the 560 by 384 pixels, two a dot)
    const colour = pts => { const n = new Map(); for (const [x, y] of pts) { const i = (y * 2 * 560 + x * 2) * 4, k = `${px[i]},${px[i + 1]},${px[i + 2]}`; n.set(k, (n.get(k) ?? 0) + 1); } return [...n].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number); };
    const out = [], kept = [];
    for (const p of this.prints) {
      const dots = []; let pen = p.x, ok = true;
      for (const ch of p.words) {
        const n = ch.charCodeAt(0) - 0x1f;
        if (n < 1 || n > mem[shapes]) { ok = false; break; }
        walk(read, shapeAt(read, shapes, n), { x: pen, y: p.y, dot: (x, y) => dots.push([x, y]) });
        pen += mem[widths + n];
      }
      if (!ok) continue;
      if (!dots.length) { kept.push(p); continue; }
      kept.push(p);
      if (!stands(dots)) continue;
      const ink = bit(...dots[0]);
      const xs = dots.map(d => d[0]), ys = dots.map(d => d[1]), mine = new Set(dots.map(([x, y]) => x + ',' + y));
      const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1, round = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!mine.has(x + ',' + y) && bit(x, y) >= 0) round.push([x, y]);
      if (round.filter(([x, y]) => bit(x, y) !== ink).length < 0.6 * round.length) continue;   // (black on black: not a word that shows)
      out.push({ grid: false, x: x0 * 2, y: y0 * 2, w: (x1 - x0 + 1) * 2, h: (y1 - y0 + 1) * 2, ch: p.words, base: (p.y + 13) * 2, ink: `rgb(${colour(dots)})`, paper: colour(round) });
    }
    this.prints = kept;
    return out;
  }
  // the words over the picture: a grid's character centred in its cell, a print's words fitted to the width its dots took
  draw(clean) {
    this.words.replaceChildren();
    for (const w of clean) {
      if (!w.ch.trim()) continue;   // (an inverse space: its paper alone)
      const t = document.createElementNS(NS, 'text');
      const at = w.grid ? { x: w.x + 7, y: w.y + 15, fill: w.ink, 'font-family': GRID, 'font-size': 19, 'font-weight': 500, 'text-anchor': 'middle' }
        : { x: 0, y: w.base, fill: w.ink, 'font-family': WORDS, 'font-size': 27, 'font-weight': 500 };
      for (const [k, v] of Object.entries(at)) t.setAttribute(k, v);
      t.textContent = w.ch;
      this.words.append(t);
      // (fitted once on the page, as view.js `fit` does: a measured scale looks the same in every browser)
      if (!w.grid) { const natural = t.getComputedTextLength?.() ?? 0; t.setAttribute('transform', `translate(${w.x + 2} 0)${natural > 0 ? ` scale(${(w.w - 4) / natural} 1)` : ''}`); }
    }
  }
}

// a character of the text page: what it shows, and whether inverse (a code below $80; flashing taken as inverse)
function textChar(v) {
  const low = v & 0x3f, ch = (v & 0x7f) >= 0x60 ? String.fromCharCode(v & 0x7f) : String.fromCharCode(low < 32 ? low + 64 : low);
  return [ch, v < 0x80];
}
// (a box of the 560 by 384 pixels in one colour)
function fill(px, x, y, w, h, [r, g, b]) {
  for (let j = Math.max(0, y); j < Math.min(384, y + h); j++) for (let i = Math.max(0, x); i < Math.min(560, x + w); i++) { const o = (j * 560 + i) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; }
}
// (whether the band is on the screen: its rows above `top` white, the whole width)
function band(px, { top }) {
  for (let y = 0; y < top; y++) for (let x = 0; x < 560; x++) { const i = (y * 560 + x) * 4; if (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200) return false; }
  return true;
}
// (the band's rows `top` to `bottom`: the dots `move` moved `by`, white where they were)
function shift(px, { top, bottom, move: [from, to], by }) {
  for (let y = top; y <= bottom; y++) {
    const row = y * 560 * 4;
    px.copyWithin(row + (from + by) * 4, row + from * 4, row + to * 4);
    if (by < 0) px.fill(255, row + (to + by) * 4, row + to * 4); else px.fill(255, row + from * 4, row + (from + by) * 4);
  }
}
