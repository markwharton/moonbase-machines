// Reads the characters on a hi-res screen, for a title that draws text from its own font on the 40 by 24 grid. Each
// 7 by 8 cell is compared with the font, normal and inverse, ignoring the colour bit. A cell that matches no character
// is picture. So is a solid cell, all dark or all lit: a space and an inverse space look the same as a picture's
// solid parts.
//
//   const read = reader(mem, { font })
//     read.ready()            looks for the font in memory, once a painting; true when it is loaded (more than 40
//                             distinct characters). Call it before reading cells.
//     read.cell(page, c, r)   the cell at column c (0 to 39) and row r (0 to 23) of the page at `page`:
//                             [character, inverse], or null for picture or a solid cell
import { rowStart } from '@moonbase-machines/apple2e/screen.js';

export function reader(mem, { font }) {
  let glyphs = null;
  const load = () => {
    const m = new Map();
    for (let a = 32; a < 127; a++) {
      const g = [...mem.subarray(font + a * 8, font + a * 8 + 8)].map(b => b & 0x7f);
      if (!m.has(g.join())) m.set(g.join(), [String.fromCharCode(a), false]);
      const inv = g.map(b => b ^ 0x7f).join(); if (!m.has(inv)) m.set(inv, [String.fromCharCode(a), true]);
    }
    return m.size > 40 ? m : null;
  };
  return {
    ready: () => !!(glyphs ??= load()),
    cell(page, c, r) {
      if (!glyphs) return null;
      const bytes = [];
      for (let k = 0; k < 8; k++) bytes.push(mem[page + rowStart(r * 8 + k) + c] & 0x7f);
      if (bytes.every(b => b === 0) || bytes.every(b => b === 0x7f)) return null;
      return glyphs.get(bytes.join()) ?? null;
    },
  };
}
