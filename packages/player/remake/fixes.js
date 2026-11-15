// A title's fixes, made to its program on the disk. The program is read as statements, the fixes are made to them,
// and the fixed statements are written back as the file's own code. The drive gives that file in place of the disk's.
//
// The title's title.js says which programs have a fixed version (`fixed`), the module that makes the fixes
// (`fixes`, a function `fixed(statements, render)`), and for each program its file and the top of the memory it runs
// in (`basic[name].program.file`, `basic[name].top`). A program Blitz! compiled is read by c64/blitz.js and written
// back by c64/blitz-encode.js, which stops when the fixed program no longer fits.
//
//   await fixFiles(title, drive, folder)   drive: the Commodore 64's (c64/drive.js); folder: the title's, a URL
import { statements, render } from '@moonbase-machines/c64/blitz.js';
import { encode } from '@moonbase-machines/c64/blitz-encode.js';

export async function fixFiles(title, drive, folder) {
  const { fixed } = await import(new URL(title.fixes + '.js', folder).href);
  for (const name of Object.keys(title.fixed ?? {})) {
    const basic = title.basic?.[name];
    if (!basic?.blitz) throw new Error(`${name}: its fixes can be made only to a program Blitz! compiled`);
    const file = basic.program.file, raw = drive.find(Uint8Array.from(file, c => c.charCodeAt(0)))?.raw;
    if (!raw) throw new Error(`no file ${file} on the disk`);
    // the file in memory where it loads, its first two bytes its address
    const at = raw[0] | raw[1] << 8, mem = new Uint8Array(0x10000);
    mem.set(raw.subarray(2), at);
    const { mem: made, end } = encode(mem, fixed(statements(mem).out, render), { top: basic.top });
    const out = new Uint8Array(2 + end - at);
    out.set(raw.subarray(0, 2)); out.set(made.subarray(at, end), 2);
    // (in the drive for this visit, shadowing the disk's file; it is no save of the player's, and is not kept)
    drive.saved.set(file, out);
  }
}
