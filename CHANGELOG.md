# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
