// What a step is, as an event: the same words for the original, where the observer sees the game call a routine,
// and for the remake, which runs the same code. Two runs are the same when their events are.
//
// A step's definition is what is known of its routine: the registers it takes and gives, and the part it plays. A
// toolkit's package defines its toolkit's steps, a machine's package the steps of its ROM, and a title's map its own
// (`map.steps`), over its toolkit's (observer.js `stepsOf`). A definition has only the fields its step has, and a step
// with none has no definition. The fields:
//
//   takes      the registers the routine takes, in order: a, x and y, and c for the carry ('axy')
//   gives      the registers it gives as it returns, its result ('ax')
//   zero       the inputs it takes from the toolkit's zero page, each by its name and its place there
//   memory     the inputs it takes from memory, each by its name and its address
//   inline     the reader of the data it takes after its call: (read, at) => { length, value }, `read` giving the byte
//              at an address
//   text       with `inline`: the data is a text, which a listing quotes so that it reads as one word (lift.js)
//   table      its X and Y are a table's address, given as `table`, in hexadecimal
//   restores   with A 0 or 1 it puts back what it kept, and takes A alone: what is in X and Y then is no input
//   character  its A is a character, given as the character, its high bit taken off
//   nothing    a value of A for which the routine does nothing: a call with it is no step
//   waits      it waits for keys; any other routine, while it runs, is busy, and a key pressed then is not for it
//   polls      it polls for a key, and is a step only when it gives one
//   carry      with `polls`: it gives a key only with the carry set
//   turn       it is a turn of the game's own loop, which reads the keyboard without waiting: the run stops at it, for
//              a key or none
//   leaves     it never returns: the game goes on from it
//   runs       it runs the game's own code inside itself, and the calls made while it runs are steps
//   button     it draws the space bar's button: a routine that calls it is about to wait for the key
//   seed       the route's seed is written for it, where the map's `seed` says (observer.js says when)
//   ask        it asks for a key, its A the ask's mode, then waits for RETURN to take the key or DELETE to take it back
//   cap        it draws a key's cap where the pen is, the key in A: an ask's call of it for RETURN says a key is chosen
//   prints     it draws the words after its call on the graphics screen, which clean text paints again (clean-text.js)

const NONE = {};

// A step as an event: its name, any fixed input (a panel's number), the registers its definition says it takes, its
// inputs from the zero page, read through `read`, and from memory, read through `peek`, and the data it had inline (a
// text, a picture's name, a sound).
export function describe(name, step = NONE, fixed, regs, words, read, peek) {
  const e = { step: name };
  if (fixed.length) e.n = fixed.map(Number);
  if (step.table) e.table = '$' + ((regs.x | regs.y << 8).toString(16).toUpperCase().padStart(4, '0'));
  else if (step.restores && regs.a < 2) e.a = regs.a;
  else if (step.takes) for (const r of step.takes) e[r] = regs[r];
  if (step.character && e.a !== undefined) e.a = String.fromCharCode(e.a & 0x7f);
  if (step.zero && read) for (const [k, at] of Object.entries(step.zero)) e[k] = read(at);
  if (step.memory && peek) for (const [k, at] of Object.entries(step.memory)) e[k] = peek(at);
  if (words !== undefined) e.words = words;
  return e;
}

// A routine's result as an event, recorded as it returns: the registers its definition says it gives.
export function result(name, step, regs) {
  const e = { result: name };
  for (const r of step.gives) e[r] = regs[r];
  return e;
}
