// A hi-res screen read back to its characters, for a title that draws its text from a font of its own on the 40 by 24
// grid (Pieces of Eight, its font at $9400, 8 bytes a character, by ASCII code): each 7 by 8 cell of the page, its 8
// bytes (their 7 dots, the colour bit set aside), against the font, as drawn and drawn inverse. A cell that is no
// character of the font is picture. Nothing else is read.
//
//   const read = reader(mem, { font })
//     read.ready()            whether the game has loaded its font (more than 40 characters there)
//     read.cell(page, c, r)   the cell at column c (0 to 39), row r (0 to 23) of the page at `page`: [character,
//                             inverse], or null (picture)
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
      glyphs ??= load(); if (!glyphs) return null;
      const key = []; for (let k = 0; k < 8; k++) key.push(mem[page + rowStart(r * 8 + k) + c] & 0x7f);
      return glyphs.get(key.join()) ?? null;
    },
  };
}
