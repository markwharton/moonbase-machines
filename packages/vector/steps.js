// What is known of the vector toolkit's steps, by the names a title's map gives its routines.
import { INLINE } from './inline.js';

// Each step's definition: the registers its routine takes and gives, and the part it plays. The player's
// remake/events.js says what each field means. A step with none of them has no definition here: show, panel, flash,
// and the routines whose names start with a dot.
export const STEPS = {
  // the text, the picture by its name, and the sound, each read from the data after the call (inline.js)
  text: { inline: INLINE.text, text: true },
  picture: { inline: INLINE.picture },
  sound: { inline: INLINE.sound },
  // the picture window's colour and the two text boxes' below it, in A, X and Y
  box: { takes: 'axy' },
  // an object by its number in A, at the column and row in X and Y: put down whole, with the ground under it kept, or
  // the third way. Objects 0 and 1 put the kept ground back.
  object: { takes: 'axy', restores: true },
  'object-keep': { takes: 'axy', restores: true },
  'object-mode': { takes: 'axy', restores: true },
  // the table of objects, its address in X and Y
  objects: { takes: 'xy', table: true },
  // the waits for the space bar: wait shows its button, and wait-erase takes the button away after; wait-or-escape
  // gives the carry
  wait: { waits: true },
  'wait-erase': { waits: true },
  'wait-or-escape': { gives: 'c', waits: true },
  // the space bar's button alone
  button: { button: true },
  // a span of a row in the colour in A, from X to Y
  span: { takes: 'axy' },
  // a random number below A, given in A
  random: { takes: 'a', gives: 'a', seed: true },
  // A beep of the pitch in A. For A 0 it returns at once. A scene that reads keys by polling beeps each poll's key, 0
  // for none, until one comes, so a beep of 0 is no step: as steps those would count how long the machine was watched.
  beep: { takes: 'a', nothing: 0 },
  // a key with its letter in A, at the place in X and Y, or where the pen is
  'key-at': { takes: 'axy', character: true },
  key: { takes: 'a', character: true, cap: true },
  // A multiplied by X, into X and A; Y and X divided by A
  multiply: { takes: 'ax', gives: 'ax' },
  divide: { takes: 'axy', gives: 'ax' },
  // a line from ($00, $02) to ($01, $03) in the colour in $11
  line: { zero: { x0: 0x00, x1: 0x01, y0: 0x02, y1: 0x03, color: 0x11 } },
  // the asks for a key, A saying which keys: each takes a key, then waits for RETURN or DELETE, and gives A and X, and
  // ask-escape the carry too
  ask: { takes: 'a', gives: 'ax', waits: true, ask: true },
  'ask-mode': { takes: 'a', gives: 'ax', waits: true, ask: true },
  'ask-escape': { takes: 'a', gives: 'axc', waits: true, ask: true },
  // a filled rectangle and a rectangle's outline, in the colour in A, from the corner in X and Y, $0E and $0F its
  // width and height
  rectangle: { takes: 'axy', zero: { width: 0x0e, height: 0x0f } },
  'rectangle-outline': { takes: 'axy', zero: { width: 0x0e, height: 0x0f } },
  // the colour of the dot at X and Y, given in A
  'read-dot': { takes: 'xy', gives: 'a' },
  // problem A loaded into the language card and run; it gives the carry
  problem: { takes: 'a', gives: 'c', runs: true },
  // one dot, in the colour in A, at X and Y
  dot: { takes: 'axy' },
  // rows filled with the colour in A, X of them from row Y
  'fill-rows': { takes: 'axy' },
  // the keyboard, the joystick or the Concept Keyboard read: a key in A, or 0
  'read-key': { gives: 'a', polls: true },
  // part A loaded and started
  part: { takes: 'a', runs: true, leaves: true },
  // a key panel from a table, by A
  'key-panel': { takes: 'a' },
  // a span kept, put back or inverted, by X and Y
  'keep-span': { takes: 'xy' },
  'put-span': { takes: 'xy' },
  'invert-span': { takes: 'xy' },
  // two white lines across the screen at row Y
  'white-lines': { takes: 'y' },
  // the point test, by X and Y: $80 in A for in and 0 for out
  inside: { takes: 'xy', gives: 'a' },
};

// The steps whose work is only drawing: a picture, a box, a text, an object, a line, and the screen shown, cleared or
// moved. A Remake that draws at once need not wait for them.
export const DRAWS = ['show', 'picture', 'box', 'panel', 'text', 'objects', 'object', 'object-keep', 'object-mode', 'white-lines', 'fill-rows', 'span', 'dot', 'line', 'rectangle', 'rectangle-outline', 'key-panel', 'key', 'key-at', 'keep-span', 'put-span', 'invert-span', 'button', 'text-screen', 'scroll', 'shift-down', 'clear-screen'];
