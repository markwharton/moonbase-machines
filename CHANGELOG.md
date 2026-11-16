# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [v0.22.0] - 2026-11-16

### Added

- blitz-encode.js encodes statements as Blitz! code (368290b)
- the observer reports each routine a game calls as an event (b6335e2)
- the observer reports calls made inside a routine (522c019)
- Game runs an Apple title's own code on the machine (cdb8ccb)
- the Remake's clock has a tick, a scale and warp (df7523c)
- Game runs a title with no toolkit (36053ef)
- a Commodore 64 Remake runs on the 64 with Moonbase's ROMs (9344ed2)
- code-files.js lists a game's code files and where each loads (6d7bd93)
- steps.js defines the vector toolkit's steps (9cf3059)
- steps.js defines the KERNAL's steps (38d196e)
- steps.js defines the Apple ROM's steps (611ac03)
- a stretch of code a title names keeps the original's time (90f4c85)
- any title can name a stretch of its game's code (a27dca4)
- a title's driver can supply its own view (0fa695c)
- a driver's warp can cover the game's own code (5487839)
- the player has a Speed setting, Original or Turbo (e5593ff)

### Fixed

- the vector view draws a title's own glyphs (8eee452)
- a 64 game stops with a message at an unwritten ROM routine (033a7bd)

### Changed

- steps.js lists the vector steps that only draw (34a9955)
- the script engine is removed (59fdafe)
- a step is defined by its toolkit, machine or driver (5138ccd)
- a driver supplies its toolkit (0d12694)

### Documentation

- the Speed section says immediately (98df984)

### Maintenance

- a test that fixes.js gives the drive the fixed program (a574cd2)
- moonbase-play maps every installed package (1220e59)
- package-lock.json matches the packages (ae81c04)

## [v0.21.0] - 2026-11-15

### Added

- a vector Remake reads from its disk at once (59f2803)
- a vector Remake draws at once, its drawing's time none of the clock's but in a game's own turns (b73c9dc)

## [v0.20.0] - 2026-11-15

### Added

- the lifter writes a jump to a routine as the routine's step and a return (3799278)
- a problem lifted from its file runs as the title's script, called as its loader calls it (869e1c2)
- a vector picture's name may hold a byte its scene writes, read from memory as it is drawn (4c4d3e3)
- a vector title's point test is a step, `inside`, answered as the engine answers it (958da6f)
- a problem's own routine that draws is a step, painted by its title's painter (64c256f)
- a turn of a game's loop that reads the keyboard without waiting is a step, tick (d6bf4b0)
- a vector title's line stepping is two routines with no steps, from PART0's code (1dc5059)
- the inline readers can name a byte by its address in place of its value (19a3f3f)
- the lifter names each byte of a call's data that the code writes, by its address (87d0e8e)
- the lifter writes a routine its walk reaches at the routine's own address as its step (a556e1c)
- the ask in its arrow mode runs a lifted problem's own code as a choice is made and taken back (1b4c7f3)
- a vector title's engine holds PART0 and each part in memory where its loader puts them (a33eed7)
- a problem's own routine whose code is lifted runs that code inside its step (517f9d0)
- a vector title's problems are its lifted scripts alone, with no helpers for problems written by hand (288780f)
- the Original's machine can run a vector title's toolkit for its Remake (3d0cbb7)
- a vector title's Remake runs its toolkit on the Original's machine, on one clock with its lines (59ce246)
- control-E in a vector Remake goes to the Main Menu by the game's own key reader (e5bf852)
- a vector Remake waits for a key where the Original waits, timed to before its first poll with none (c0fd95a)
- a key already typed goes into a vector Remake's waiting routine as it starts (15c73c2)
- the toolkit marks the cycle after the read that takes a key (d01cddf)
- a Remake runs on one clock, a frame of the original's time at a time, at the page's pace (1193340)
- a vector Remake's view can show a step for as long as it took on the original (24599cd)

### Fixed

- a key cap's clean label sits in the middle of the cap, whatever its size (3d9c130)
- a vector title's Remake plays each sound by the game's own sound routine (20d2fe0)
- the lifter follows no table of addresses that starts where data begins (f888f59)
- a vector title's text and panels leave each line's row in the zero page, as its line drawer does (b3e209e)
- a vector picture leaves its shapes at $E000, where its loader copies them (9d03a3d)
- a vector picture returns its routine's registers, the shapes drawn and their address (68a117c)
- the lifter writes a text's DEL as \u007f, so a lifted script is plain text (6a5d32c)
- a key poll inside a busy routine of a problem's own gives no key and goes on, as on the original (fa136db)
- a vector title's fill-rows leaves the row it stopped at and its registers, as its routine does (ddf776c)
- a vector title's random number sets N and Z, as its routine's PLA does (902c658)
- a vector title's wait-erase fills its button's rows after the space bar, as its routine does (d51f6cf)
- the lifter writes a key cap without its high bit as its number (0ebe929)
- the engine counts a second line at the same address as no cycles (f218f0f)
- the engine counts a jump through a table as its five instructions (34f8b9d)
- the engine counts every load the lifter left out before a line, however many (2796fa3)
- a step whose own code runs on the machine counts its first instruction once (ce7ee0d)
- a step that waited and runs again with its key counts its call once (ba01405)
- the toolkit counts a return from the scenes' own code once (84f4249)
- a vector title's part start runs its own code on the machine (d51d8c7)
- a vector Remake counts its polls with no key across a run, as its machine does (626313b)

### Changed

- the engine's stop at each frame of the original's time is 'frame' (e4f0718)

## [v0.19.0] - 2026-11-15

### Added

- the settings store tells every listener of a change, wherever it was made (a5d4ef1)
- a setting's control follows the store, so controls anywhere stay in step (c6493bf)
- play() tells the page which settings a game uses before it runs (2eead96)
- the player draws no settings' controls, and the page places them (3d46b09)

## [v0.18.0] - 2026-11-15

### Added

- clean text draws each word in the game's own letters, without colour fringes (2674c31)
- the screen can be painted as a monochrome monitor shows it (60b585c)
- the Clean text setting replaces Old style text, on by default (5e21859)
- the Monitor setting shows an Apple game on a colour or a monochrome monitor (9d4b40f)
- play() puts the settings' controls in an element the page gives (781a8e3)

### Fixed

- the 64 sees only the last arrow key pressed (8dc1484)

## [v0.17.1] - 2026-11-15

### Fixed

- clean text no longer misses words (257cbf5)
- pressing fire no longer sticks a held arrow key (af10b5d)
- an error on the status line stays until the game restarts (1ab38be)
- clean words in the mini view's band move with the band (a11540c)
- a setting that cannot be kept goes back to its old value and says why (60a466c)
- clean text leaves solid picture cells alone (f9a35e3)
- words are fitted again once Inter loads (c22b61a)
- publish-packages stops when npm cannot say whether a package is published (4e29eaf)

### Changed

- the text page's characters are decoded in one place (34b5701)
- reading characters off the hi-res screen is in the Apple package (05366b2)
- clean text has a module of its own (ff599e7)
- the fire key and the joystick's bits are in the key tables (30f66ba)

### Documentation

- plain-English comments (50d3e1a)
- the scenes engine's header says which views have Old style text (c3ff2ad)
- the README says how a release is made (8750a69)

### Maintenance

- plankit's marketplace updates itself (83b2636)

## [v0.17.0] - 2026-11-14

### Added

- moonbase-play and moonbase-compile say how they are used for --help, and refuse a flag they do not have (345e82e)
- a remake's clean text is drawn in Inter, and a grid of characters in JetBrains Mono, each falling back to the system's (c7981dd)
- a card title that says how its text is drawn has its words drawn clean, Old style text bringing back the dots (f9c6bc5)

## [v0.16.0] - 2026-11-14

### Added

- a game may name Option its joystick's fire, held with the arrows, in its data (fire: 'Alt') (6b597e5)
- with a game's fire key held, the arrows are its joystick, so fire held as it moves reaches the game (313e39b)

### Fixed

- a game that stopped, or ROMs not there, marks the status line an error, as a failure does (7619a34)

### Maintenance

- npm run publish-packages publishes each package npm lacks at its version, in order, and stops at the first that fails (3e7cce4)

## [v0.15.0] - 2026-11-14

### Added

- a person's settings are declared once, declared.js, and drawn by settings.js control for any page (6897b97)

### Fixed

- the keys that scroll a page are the game's on the play page, unless a box, button or menu has them (2698296)

### Documentation

- fixes are a list of edits by address, never a copy of the program (8f522ca)

## [v0.14.0] - 2026-10-27

### Added

- a title's scenes compiled as the page loads them, and a BASIC program made from the disk; Blitz!'s decoder in c64 (4567750)

## [v0.13.0] - 2026-10-26

### Added

- a button types a game's demonstration, declared in its data (b235123)

### Fixed

- a pause is dropped, not played back fast; the machines paced to the clock, the sound's queue bounded (060d601)

## [v0.12.0] - 2026-10-25

### Added

- each key one key of the 64's: the arrows its cursor keys, the joystick a gamepad; CLR, INST, ← and £ (028316c)

## [v0.11.1] - 2026-10-24

### Documentation

- the remake engine's README, its scenes, compiled scripts and fixed versions (f4e59d8)
- the four layers, the machine, the Original, the Replica and the Remake (f6a9d04)
- what the machine was, before the four layers (950156c)

## [v0.11.0] - 2026-10-19

### Added

- the provider gives every page its disks and typed settings (910daee)

## [v0.10.0] - 2026-10-19

### Added

- one way in for every title (2a7049a)

### Changed

- the ROM stand-in names no titles in code (fc8d258)

## [v0.9.1] - 2026-10-19

### Fixed

- a BLOAD of a file not there takes DOS's error exit (3b9fbe8)

## [v0.9.0] - 2026-10-19

### Added

- moonbase-play offers an Original for each game's data (6b06869)

## [v0.8.0] - 2026-10-19

### Added

- the player as a package, every title played one way (b027b67)

### Changed

- saves, fonts and ROMs from a game's own data, not its name (756abc3)

## [v0.7.0] - 2026-10-19

### Added

- saves kept on Apple's ROMs too, written onto and read off the drive's disk (533b728)

## [v0.6.1] - 2026-10-18

### Fixed

- each package's own file built when it is published (9141d18)

## [v0.6.0] - 2026-10-18

### Added

- Applesoft shapes and the VIC-II's pictures for tools (e73659a)
- the vector engine as a package (7efbce8)

## [v0.5.1] - 2026-10-18

### Fixed

- hi-res pictures written as RGB, as the games' always were (8f7d45b)

## [v0.5.0] - 2026-10-18

### Added

- the 6502 package named @moonbase-machines/mos6502 (41640d8)

## [v0.4.1] - 2026-10-18

### Fixed

- the files package versioned with the others (2a614f1)

## [v0.4.0] - 2026-10-18

### Added

- the tools that take a title's disks apart, and the files package (cce5871)

## [v0.3.0] - 2026-10-18

### Added

- the machines from moonbase-workshop (1086cdd)
- the packages named @moonbase-machines (32f3013)

## [v0.2.0] - 2026-10-18

### Added

- one file per package, npm run build (93f9260)

## [v0.1.0] - 2026-10-12

### Added

- the machines, @moonbase/6502, charset, c64 and apple2e (f4552a5)

### Maintenance

- configure plankit (ddcca4d)

[v0.1.0]: https://github.com/markwharton/moonbase/commits/v0.1.0
[v0.2.0]: https://github.com/markwharton/moonbase/compare/v0.1.0...v0.2.0
[v0.3.0]: https://github.com/markwharton/moonbase/compare/v0.2.0...v0.3.0
[v0.4.0]: https://github.com/markwharton/moonbase/compare/v0.3.0...v0.4.0
[v0.4.1]: https://github.com/markwharton/moonbase/compare/v0.4.0...v0.4.1
[v0.5.0]: https://github.com/markwharton/moonbase/compare/v0.4.1...v0.5.0
[v0.5.1]: https://github.com/markwharton/moonbase/compare/v0.5.0...v0.5.1
[v0.6.0]: https://github.com/markwharton/moonbase/compare/v0.5.1...v0.6.0
[v0.6.1]: https://github.com/markwharton/moonbase/compare/v0.6.0...v0.6.1
[v0.7.0]: https://github.com/markwharton/moonbase/compare/v0.6.1...v0.7.0
[v0.8.0]: https://github.com/markwharton/moonbase/compare/v0.7.0...v0.8.0
[v0.9.0]: https://github.com/markwharton/moonbase/compare/v0.8.0...v0.9.0
[v0.9.1]: https://github.com/markwharton/moonbase/compare/v0.9.0...v0.9.1
[v0.10.0]: https://github.com/markwharton/moonbase/compare/v0.9.1...v0.10.0
[v0.11.0]: https://github.com/markwharton/moonbase/compare/v0.10.0...v0.11.0
[v0.11.1]: https://github.com/markwharton/moonbase/compare/v0.11.0...v0.11.1
[v0.12.0]: https://github.com/markwharton/moonbase/compare/v0.11.1...v0.12.0
[v0.13.0]: https://github.com/markwharton/moonbase/compare/v0.12.0...v0.13.0
[v0.14.0]: https://github.com/markwharton/moonbase/compare/v0.13.0...v0.14.0
[v0.15.0]: https://github.com/markwharton/moonbase/compare/v0.14.0...v0.15.0
[v0.16.0]: https://github.com/markwharton/moonbase/compare/v0.15.0...v0.16.0
[v0.17.0]: https://github.com/markwharton/moonbase/compare/v0.16.0...v0.17.0
[v0.17.1]: https://github.com/markwharton/moonbase/compare/v0.17.0...v0.17.1
[v0.18.0]: https://github.com/markwharton/moonbase/compare/v0.17.1...v0.18.0
[v0.19.0]: https://github.com/markwharton/moonbase/compare/v0.18.0...v0.19.0
[v0.20.0]: https://github.com/markwharton/moonbase/compare/v0.19.0...v0.20.0
[v0.21.0]: https://github.com/markwharton/moonbase/compare/v0.20.0...v0.21.0
[v0.22.0]: https://github.com/markwharton/moonbase/compare/v0.21.0...v0.22.0
