// The Apple IIe's ROM routines and ProDOS's call as steps, by the names a title's map gives them: what each one's
// routine takes and gives. The player's remake/events.js says what each field of a definition means. HOME ($FC58),
// BELL ($FBDD) and the hi-res page cleared ($F3F4) take nothing, and have no definition.

// A reader of `n` bytes of data inline after a call, through `read`: { length, value }, the value the bytes in
// hexadecimal.
export const bytes = n => (read, at) => { const b = []; for (let k = 0; k < n; k++) b.push(read(at + k).toString(16)); return { length: n, value: b.join(' ') }; };

export const STEPS = {
  // the Monitor's COUT ($FDED), the character in A; its OUTPORT ($FE95), output to the slot in A, as PR# does; and its
  // WAIT ($FCA8), A its length
  cout: { takes: 'a' },
  outport: { takes: 'a' },
  pause: { takes: 'a' },
  // Applesoft's HPOSN ($F411), its y in A and its x in X and Y; HLIN ($F53A), its x in A and X and its y in Y; and
  // HCOLOR ($F6F0), the colour in X
  hposn: { takes: 'axy' },
  hlin: { takes: 'axy' },
  hcolor: { takes: 'x' },
  // ProDOS's machine language interface ($BF00): its call and the address of its parameters, three bytes inline
  prodos: { inline: bytes(3) },
};
