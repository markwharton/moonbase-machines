# Moonbase's machines

The machines Mark Wharton's titles of 1985 to 1995 run on again, in the browser and in Node, as
[moonbase.au](https://moonbase.au) has them:

| Package | What it is |
|---|---|
| [`@moonbase-machines/mos6502`](packages/mos6502) | The 6502: its documented instructions, an assembler and a disassembler. |
| [`@moonbase-machines/vector`](packages/vector) | Mark Wharton's vector graphics engine for the Apple IIe (Animal Rescue and Nature Park Adventure, 1989): its pictures, objects and font read, and drawn dot for dot. |
| [`@moonbase-machines/player`](packages/player) | The player: a title's Original, its own disk on these machines, and its Remake, the game's code on these machines with a view of its own where it has one; the player's disk of saves in the browser. |
| [`@moonbase-machines/files`](packages/files) | The formats the machines' files come in and go out as, in Node: PNG written and read, and zip read. |
| [`@moonbase-machines/charset`](packages/charset) | Moonbase's own character set for the Commodore 64, and the 5 by 7 font it and the Apple IIe's text screen are drawn from. |
| [`@moonbase-machines/c64`](packages/c64) | A Commodore 64 as far as the games use it: the VIC-II, the SID, a 1541, a printer, and Moonbase's own KERNAL and BASIC in place of Commodore's ROMs. |
| [`@moonbase-machines/apple2e`](packages/apple2e) | An Apple IIe with 128K as far as the games use it: double hi-res, the Disk II, ProDOS, and Moonbase's own ROM routines in place of Apple's. |

Each runs on Moonbase's own ROM routines and characters, so nothing of Commodore's or Apple's is
needed or kept here. Every module opens with a comment saying what it is and what it covers.

[The four layers](docs/layers.md) explains the four ways a title runs: on the real machine, then as the
Original, the Replica and the Remake.

```js
import { C64 } from '@moonbase-machines/c64/machine.js';
import { CPU } from '@moonbase-machines/mos6502/cpu.js';
```

`npm install` links the packages to each other; `npm test` runs their tests; `npm run build`
makes each package one file, `packages/<name>/dist/moonbase-<name>.js`, minified, with its source
map: the others it uses imported by name (`@moonbase-machines/mos6502`), so a page maps each name to its file.
Each package makes its own when it is packed or published, so the file published is its own code and version:

```html
<script type="importmap">{"imports": {"@moonbase-machines/mos6502": "/lib/moonbase-mos6502.js", "@moonbase-machines/charset": "/lib/moonbase-charset.js", "@moonbase-machines/c64": "/lib/moonbase-c64.js"}}</script>
<script type="module">import { machine } from '@moonbase-machines/c64';</script>
```

## Releasing

A release puts out every package at one version. It is made on the `develop` branch, with everything committed.

1. `npm test`. Every test must pass.
2. `pk changelog --dry-run`. It prints the release's version and its changelog, one line for each commit since the
   last release. Read the lines before going on. A line that is wrong is fixed by rewording its commit, which can
   be done only while the commit is not pushed.
3. `pk ship`. It writes `CHANGELOG.md` and sets the version in `package.json` and in each package's own. It sets
   each package's dependencies on the others to the same version (`tools/package-versions.mjs`). Then it tags the
   release, moves `main` up to it, and pushes `main`, `develop` and the tag.
4. `npm run publish-packages` (`tools/publish.mjs`), in a terminal where npm is signed in (`npm login`). It
   publishes each package that the registry does not have at this version, in the order of the workspaces in
   `package.json`, and stops at the first that fails. A run can be repeated: it skips the packages already
   published. If npm asks for a one-time code, run it again with `-- --otp=<code>`.

The registry can take a minute to show a new version (`npm view @moonbase-machines/player version`). A project
that uses the packages can move to the new version once all seven show it.

## Licence

MIT, (c) 2026 Mark Wharton: see LICENSE, and each package's own. The titles, their disks and
their pictures are not here and are not under this licence.
