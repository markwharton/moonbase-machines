// A game's code files: PART0, the parts and the problems, each with the address it loads at.
//
//   codeFiles(map, volume)   [{ name, bytes, origin }]: `map` is the title's map (its title.js `map`), and `volume`
//                            the volume of its disk in the game's data, each file's bytes in base64
//
// The address is the map's `loads`, by the file's name or by its name without the digit, or else the catalog's.
export function codeFiles(map, volume) {
  const loads = map?.loads ?? {};
  return Object.entries(volume).filter(([n]) => /^(PART|PROB)\d$/.test(n))
    .map(([name, f]) => ({ name, bytes: Uint8Array.from(atob(f.data), c => c.charCodeAt(0)), origin: loads[name] ?? loads[name.slice(0, -1)] ?? f.aux }));
}
