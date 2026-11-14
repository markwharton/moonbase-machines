#!/usr/bin/env node
// A title's scene scripts compiled (remake/compile.js), as the page compiles them when it loads the title: each
// <name>.scene in the title's folder, and any that does not compile said with its scene and its line, so that a
// title's own tests catch it before a page does. Nothing is written.
//
//   moonbase-compile <title folder> ...              every scene of each compiled; fails on the first that does not
//   moonbase-compile --print <title folder> <name>   one scene's JavaScript, to look at
//   moonbase-compile --help                           this; any other flag refused
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from '../remake/compile.js';

const USAGE = `moonbase-compile <title folder> ...
  Every scene of each title compiled, as the page compiles them; the first that does not, said with its scene and line.
moonbase-compile --print <title folder> <name>
  One scene's JavaScript, to look at.`;
const args = process.argv.slice(2);
if (args.some(a => a === '--help' || a === '-h')) { console.log(USAGE); process.exit(0); }
const flag = args.find(a => a.startsWith('-') && a !== '--print');
if (flag) { console.error(`moonbase-compile: no such flag, ${flag}\n\n${USAGE}`); process.exit(1); }
const print = args.includes('--print'), folders = args.filter(a => a !== '--print');
if (!folders.length || print && folders.length !== 2) { console.error(USAGE); process.exit(1); }
let compiled = 0, failed = 0;
for (const folder of print ? folders.slice(0, 1) : folders) {
  const dir = pathToFileURL(resolve(folder) + '/'), io = (await import(new URL('title.js', dir))).default.io;
  for (const f of readdirSync(dir).filter(f => f.endsWith('.scene') && (!print || f === folders[1] + '.scene'))) {
    const name = f.slice(0, -6);
    try {
      const js = compile(readFileSync(new URL(f, dir), 'utf8'), name, io ? { io } : undefined);
      if (print) process.stdout.write(js); else compiled++;
    } catch (err) { console.error(`${folder}/${f}: ${err.message}`); failed++; }
  }
}
if (failed) process.exit(1);
if (!print) console.log(`${compiled} compiled`);
