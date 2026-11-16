// The view of a card title: the screen as the game's memory holds it, the hi-res page the soft switches show, or the
// text screen, painted dot for dot as the machine's page paints it (@moonbase-machines/apple2e/screen.js), 560 by
// 384. The toolkit's pictures are bitmaps, and this is them as they are; drawing them sharper is for later.
//
// The screen is painted for the monitor the Monitor setting names (`monitor`, set by engines/scenes.js): a colour
// monitor, or a monochrome one in its phosphor's colour. The view says it paints the monitor itself (`paintsMonitor`),
// so the engine puts no filter over it.
//
// If the title's title.js has `text`, its words are painted again in one colour, without the colour fringes
// (clean-text.js), while Clean text is on (`cleanText`, set by engines/scenes.js). A monochrome monitor shows no
// fringes, so the words are not painted again on one.
//
// `inset` (a title's, its title.js), when set on: the screen's band at the top, where it is (its rows above
// `top` all lit), its dots `move` moved `by`, to make room for a mini view; `banded`, whether the band was there
// at the last painting.
import { paintHires, paintText } from '@moonbase-machines/apple2e/screen.js';
import { MONITOR } from '../declared.js';
import { CleanText } from './clean-text.js';

const NS = 'http://www.w3.org/2000/svg', WHITE = [255, 255, 255];

export class CardView {
  constructor(svg, { engine, inset = null }) {
    this.svg = svg; this.engine = engine; this.inset = inset; this.insetOn = false; this.banded = false; this.cleanText = true; this.monitor = 'colour'; this.paintsMonitor = true;
    svg.setAttribute('viewBox', '0 0 560 384');
    this.canvas = document.createElement('canvas'); this.canvas.width = 560; this.canvas.height = 384;
    this.image = document.createElementNS(NS, 'image');
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: 560, height: 384, preserveAspectRatio: 'none', style: 'image-rendering: pixelated' })) this.image.setAttribute(k, v);
    svg.append(this.image);
    this.clean = engine.title.text ? new CleanText(engine, engine.title.text) : null;
  }
  snapshot(e) { return e; }
  apply(e) { this.clean?.apply(e); }
  // the screen, when a run has gone as far as it goes
  prompts() {
    const mem = this.engine.mem, s = this.engine.switches, ctx = this.canvas.getContext('2d');
    const pixels = ctx.createImageData(560, 384), page = s.page2 ? 0x4000 : 0x2000;
    const ink = MONITOR.phosphors[this.monitor], lit = ink ?? WHITE;   // (a monochrome monitor's phosphor, or none on colour)
    if (s.text) paintText(pixels.data, mem, mem, false, [0, 24], lit);
    else {
      paintHires(pixels.data, mem.subarray(page, page + 0x2000), ink);
      if (s.mixed) paintText(pixels.data, mem, mem, false, [20, 24], lit);
    }
    // (the band is looked for before the words are painted again, which could make text there look like band. The
    // words are painted before the band is moved, so they move with it.)
    this.banded = this.insetOn && !!this.inset && band(pixels.data, this.inset, lit);
    if (this.clean && this.cleanText && !ink) this.clean.paint(s, page, pixels.data);
    if (this.banded) shift(pixels.data, this.inset, lit);
    ctx.putImageData(pixels, 0, 0);
    this.image.setAttribute('href', this.canvas.toDataURL());
  }
}

// (whether the band is on the screen: its rows above `top` lit, in the colour `lit`, the whole width)
function band(px, { top }, lit) {
  for (let y = 0; y < top; y++) for (let x = 0; x < 560; x++) { const i = (y * 560 + x) * 4; if (px[i] !== lit[0] || px[i + 1] !== lit[1] || px[i + 2] !== lit[2]) return false; }
  return true;
}
// (the band's rows `top` to `bottom`: the dots `move` moved `by`, lit in the colour `lit` where they were)
function shift(px, { top, bottom, move: [from, to], by }, lit) {
  const fill = (start, end) => { for (let i = start; i < end; i += 4) { px[i] = lit[0]; px[i + 1] = lit[1]; px[i + 2] = lit[2]; px[i + 3] = 255; } };
  for (let y = top; y <= bottom; y++) {
    const row = y * 560 * 4;
    px.copyWithin(row + (from + by) * 4, row + from * 4, row + to * 4);
    if (by < 0) fill(row + (to + by) * 4, row + to * 4); else fill(row + from * 4, row + (from + by) * 4);
  }
}
