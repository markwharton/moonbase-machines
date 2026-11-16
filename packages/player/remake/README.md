# The Remake

A Remake is not a game written again in JavaScript. It runs the title's own code, from its own disk, on Moonbase's
machine: the Apple IIe or the Commodore 64 on Moonbase's own ROMs. The title's map names the routines its code calls,
by address. The observer turns each call into an event, and a view draws the events in place of the machine's
screen. Because the code is the original's, the remake does what the original did, and the pilots can hold the two
side by side, event by event.

An Apple title's Remake has a view (`../engines/scenes.js`): the driver's own, where it brings one; else the view of
the toolkit the title was made with, where it brings one; else the plain view, which paints the machine's screen. A Commodore 64 title's Remake is the 64
itself, played by the Original's engine on Moonbase's ROMs (`../engines/original.js`), with the title's fixes made to
its program when Bugs fixed is on (below).

A title of its own engine is the exception: its `title.js` names a module in its folder as its `engine`, and that
module plays the game itself (below).

## A title's folder

The page gives the player the title's folder (`../README.md` says what is in it). For a Remake it holds:

- `title.js`, the title's driver: the toolkit the title was made with, where a package has it (`toolkit`, below);
  the `map` (below); `warp`, where the title has one (The clock, below); a view of its own, its stage's shape and
  settings of its own, where it has them (The views, below); and the title's fixes, where it has them (Bugs fixed,
  below).
- the title's own modules, where it has them: its fixes (`fixes`), and any other module its `title.js` names in
  `modules`. A driver imports anything else it needs itself, as a title on the vector toolkit imports the drawing of
  its own routines and names it `drawing`.

A page may give the player a second driver for the same disk, in a folder of its own.

## The game on its machine

`game.js`, class `Game`, is the title's game on its machine, as the engine the page drives. `load.js` makes it
(`makeEngine`). The game is an Apple IIe (`@moonbase-machines/apple2e/machine.js`) with the game's disk in its drive,
and the machine runs the game's own code. Nothing of the game is written again: the registers, the memory, the stack
and the time are the machine's own.

```js
const { title, disk } = await loadTitle(folder, { data });
title.disk = disk;
const game = makeEngine(title, { clock });
game.on(event => view.apply(event));
game.run();        // 'idle' when the game waits for a key, 'frame' when the clock's time is spent, 'end'
game.press(13);
```

`game.mem` is the memory the game runs in, as the title's toolkit says (its `game`). A game on the vector toolkit runs
in auxiliary memory, and the language card's banks are placed in the top of the auxiliary 64K, so that one array holds
everything the game reads and writes. A game with no toolkit runs in main memory. `game.switches` is the machine's
soft switches, which say what screen it shows.

The machine counts the polls of the keyboard that find no key. When there have been 2,000, the observer says whether
the game waits for a key or is busy. A routine that polls the keyboard while it works is busy, and the run goes on
through it. `game.waitingOn` names the routine the game waits in. At a turn of a loop of the game's own that reads
the keyboard without waiting, it names the turn's step and has `turn` set.

## The map

A title's `map` (its `title.js`) names the routines its code calls, by address, each with the name of the event a
call makes (`routines`), and defines the steps of its own (`steps`). A title runs on its machine when its map has
`routines`.

Any title's map may name places in its code that are steps of the view's (`view`), by the file the code is in: a
place where the screen changes with no routine called, or a stretch of the game's own code, from its address until
the address where it is done (`until`). Such a stretch is one event for the view, and it keeps its time (The clock,
below). The observer follows these places for every title, with a toolkit or without.

The rest of the map is what the rules need beside them:

- **A title on the vector toolkit:** its disk's volume (`volume`); where its files load, when the disk's catalog has
  lost it (`loads`); the routine that sets the table of objects (`objects`); where the random routine keeps its seed
  (`seed`); the Main Menu, which the key reader jumps to (`menu`), or a way to the menus that keeps the screen and
  puts it back (`visit`); where the toolkit keeps what the view reads (`vars`); each problem's own routines
  (`problems`); the title's own routines the view has no drawing for, whose calls into the toolkit it draws instead
  (`open`); a splash the loader shows before the toolkit is in memory (`splash`); and characters a modern font would
  draw wrongly (`modern`).
- **A title with no toolkit, on the plain rules:** where the key reader takes the random routine's seed from
  (`seed`); a wait for a key that stirs the random routine as it polls (`stir`); and each loop of the game's own that
  reads the keyboard each turn, with the scene it is in, the address the scene loads at, and the name of the step a
  turn is (`ticks`).

## The steps

A step's definition says what its routine takes and gives, and what part it plays, such as waiting for keys or never
returning. `events.js` says what each field means, and makes a call into an event by its definition (`describe`,
`result`), in the same words for the original and the remake.

Each definition lives with what it belongs to. The vector toolkit's steps are `@moonbase-machines/vector/steps.js`,
the Apple's ROM's and ProDOS's are `@moonbase-machines/apple2e/steps.js`, and the Commodore 64's KERNAL's, with its
jump table by address, are `@moonbase-machines/c64/steps.js`. A title's own steps are its map's `steps`. The observer
takes the Apple's steps, the title's toolkit's over them, and the map's own over those (`stepsOf`), and reads each
routine's part from its definition, never from its name.

## The observer

`observer.js` is a machine and a title's map in, and events out. The page's game and the pilots' observers share it.
It sets a hook at each routine of the map. A hook is a function the processor runs when it reaches the address, and
the observer keeps any hook that was there before. A call into a routine is an event (`events.js` `describe`), and a
routine's result is an event at its return (`result`). The calls a routine makes for itself are part of it, and make
no event of their own.

With `view`, the observer also gives the view's own events, each marked `inside`. These are no steps of the
transcript. They are the calls the view needs to draw what a routine of the title's own drew, and the steps the
map's `view` names. Each event carries its cycles, and each outermost routine's event is given to `enter` as it starts
and to `leave` as it ends, so that the engine knows how long the routine took (`game.took`).

## The toolkit

A title made with a toolkit that a package holds names it in its `title.js`, as `toolkit`. The player's own code names
no toolkit. It asks the title's toolkit for each part it uses. A toolkit is an object, and each of its parts is
optional:

| Part | What it is |
|---|---|
| `steps` | its steps' definitions, by the names a title's map gives its routines |
| `rules(core)` | how the observer follows a game built on it: when it is in memory, which calls are the game's, and when the game waits |
| `game(game)` | the memory the game runs in, and what it adds to the game, as the game starts (`game.js`) |
| `view(stage, options)` | its view (The views, below) |
| `text` | true when its view draws the words itself, so Clean text applies |
| `overlay(m, layer)` | its drawing over the machine's own screen, for the Original's setting Draw the pictures as vectors (`../engines/original.js`) |

The rules are given the observer's core: its state, what it does, and its helpers, so that a toolkit's package needs
nothing of the player's. `observer.js` says what the core holds. A toolkit's rules may give more than the plain rules
do, such as a key's time, and the observer passes that on as they give it.

A title with no toolkit has the plain rules (`observer.js` `plain`): each routine of its map is a step, and the plain
view paints the machine's screen. The vector toolkit is `@moonbase-machines/vector/toolkit.js`.

## The views

The page's runner (`../engines/scenes.js`) gives each event to a view as it happens, and the view draws it. It takes
the first of these that the title has:

- The driver's own view (its `title.js` `view`), which draws the game in a way of its own. Its driver may give its
  stage a shape of its own (`shape`, `[width, height]` in its own dots) and settings of its own (`settings`,
  declarations as `../declared.js` has them), which the page places with the player's.
- The toolkit's view, where the title's toolkit has one (its `view`). The vector toolkit's, `View`
  (`@moonbase-machines/vector/view.js`), draws the screen as SVG, 560 by 384. Its pictures are drawn from their shapes,
  smooth at any size, its objects from their own dots, and its words laid out as the toolkit laid them out. With Clean
  text on, the words are drawn in a modern face. A title's own drawing (its driver's `drawing`) draws what the title's
  own routines drew.
- `card-view.js`, `CardView`, the plain view: the hi-res page or the text page the soft switches show, painted from
  the machine's memory dot for dot, for the monitor the Monitor setting names. With Clean text on, a title whose
  `title.js` has `text` has its words painted again in one colour (`clean-text.js`).

A view is a function, `view(stage, options)`. It is given the stage, and it makes what it draws on there. The plain
view and the vector toolkit's view draw on an SVG that the runner makes for them (`options.svg()`, the game's screen,
`#screen`). A view is also given the game (`engine`), the game's data (`disk`), a key to give the game as a person
gives one (`press`), each setting's value and its changes (`setting`), and a place on the options line for parts of
its own (`control`). It may take a key before the game does (its `claim(k)`). `../engines/scenes.js` says what else
a view may have.

## The clock

The page runs the game on one clock (`clock.js`, sixty frames a second, `../engines/scenes.js`). Each frame ticks the
game's clock, which owes the machine a sixtieth of a second of the original's time. The machine runs until it has
spent the time owed, or until the game waits for a key (`'frame'` or `'idle'`), and the page draws what it did and
plays its speaker's clicks. The computer's own time comes out of the frame, so the game keeps the original's time on
a fast computer and on a slow one. A wait for a key is the player's time, and no frame owes it.

The clock is plain: it ticks, and it can warp. While it warps, the machine runs flat out, spends none of the time
owed, and is not heard. The page's `pace` is the clock's scale: 1 is the original's speed, a half is twice as fast,
and 0 runs the game until it waits. The sound plays at pace 1 only.

A title says when the machine warps, by its `title.js` `warp(step, game)`. The engine asks it about three kinds of
step:

- A routine of the map, as its outermost call starts, with the routine's event. The answer holds until the routine
  ends. A stretch of the map's `view` is asked about the same way.
- A read from the disk, a step named `disk`.
- The game's own code, the code that runs while no routine or stretch runs, a step named `game`. The engine asks as
  each run starts and as each outermost routine or stretch ends.

A title that warps the game's own code is still asked about each routine afresh, so a routine it does not warp keeps
its time, as a sound or a pause must. `game.turning` says whether the game is in a loop of its own that takes a key
each turn without waiting. A title with no `warp` never warps, and plays at the original's speed throughout. While a
stretch of the game's code that the map names as a step of the view's runs (The map, above), and the title does not
warp it, nothing inside it warps: a game whose pace is its drawing keeps the original's time there.

```js
warp: step => DRAWS.includes(step.step) || step.step === 'disk'
```

### Speed

Speed is the player's setting for a Remake (`declared.js` `SPEED`): Original or Turbo. It decides whether the engine
asks the title's `warp` at all (`game.turbo`). The title still decides what warps.

- **Turbo**, where it starts: the engine asks the title about each step, and runs flat out through those the title
  says yes to.
- **Original**: the engine asks nothing. Nothing warps, and the game runs at the original's speed throughout.

Two rules hold for steps inside steps, on Turbo:

- Inside a step that warps, everything warps.
- Inside a stretch of the game's code that the map names and the title does not warp, nothing warps.

So a title can skip the time its pictures take to draw and still keep an animation whose pace is its drawing. It
names the animation's stretch of code in its map, and leaves that step out of what it warps.

| | A picture drawn elsewhere | An animation the title names and does not warp | Sounds and pauses |
|---|---|---|---|
| Turbo | at once | the original's time | the original's time |
| Original | the original's time | the original's time | the original's time |

The setting is offered for a title whose `title.js` has a `warp`.

A routine that the title's toolkit frees (its game's `frees`) runs flat out while it waits for a key, so that what it
draws to ask is shown at once. When it returns, the time it took since its last key is owed. The cycles that ran at
warp stay the machine's, so the pilots hold the same cycles and clicks whatever the clock did; the speaker leaves them
out (`game.untimed`).

`toWait(game)` runs the game to its next wait with nothing held back, as a pilot, a replay and a route played first
do.

## Bugs fixed

The Remake plays the game as it was, bugs and all, because the pilots hold it against the original. A title can also
have a version with its bugs fixed. Its `title.js` names each program that version replaces, the module that makes
the fixes, and for each program its file on the disk and the top of the memory it runs in:

```js
basic: { game: { program: { file: 'GAME' }, blitz: true, top: 0x8000 } },
fixed: { game: 'game-fixed' }, fixes: 'fixes',
```

The player's setting **Bugs fixed** (`../play.js`, `fixed`) is offered only for a title that has one, and the page
starts again when it changes. With it on, `fixes.js` reads the program from the disk as statements
(`@moonbase-machines/c64/blitz.js`), makes the fixes, and writes the statements back as the program's own code
(`@moonbase-machines/c64/blitz-encode.js`). The drive gives that file in place of the disk's. The fixes module is a
function `fixed(statements, render)` that returns the statements with every fix made. Each fix names the statement it
changes by its address and checks that it is the one it expects, so a fix whose statement has changed stops the
build instead of editing the wrong one. The encoder stops too when the fixed program no longer fits.

## A title of its own engine

When `title.js` names a module as its `engine`, `loadTitle` imports that module as `title.own`, and the player hands
it the game (`../play.js`). That engine is the original program's own, read from its code and written again routine
for routine, playing the game's data as the original read it.

## The files

| File | What it is |
|---|---|
| `game.js` | the title's game on its machine, as the engine the page drives |
| `observer.js` | the machine's run as events, by the title's map |
| `events.js` | what a step's definition holds, and each routine's call as an event by it, in the same words for the original and the remake |
| `clock.js` | the clock: a tick a frame, warp, and the page's pace |
| `fixes.js` | a title's fixes, made to its program on the disk |
| `load.js` | loads a title's folder and its game's data, and makes its game |
| `card-view.js`, `clean-text.js` | the plain view, the machine's screen; its words painted clean |
| `lift.js` | the lifter: a file's 6502 walked from its entries into a listing, for a tool to print, by the title's steps |
