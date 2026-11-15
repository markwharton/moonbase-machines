// Blitz!'s code written back from statements, the reverse of blitz.js. blitz.js reads a Blitz! program as
// statements. After some of them are changed, removed or added, encode() lays the program out again in a copy of
// its memory. The copy loads and runs as the original does, with the changes made.
//
//   encode(mem, statements, { top })   { mem, end, room }
//     mem          a new 64K image: the input's bytes, with the program, its DATA and its variables laid out again
//     end          the address after the variable area, where the program's file ends
//     room         { top, arrays, strings, unsized }: the bytes the DIMs take when they run, and the bytes left for
//                  strings between the arrays and top; unsized names any array whose size is not a constant
//
// A statement equal to the one read at its address keeps its bytes. Any other statement is encoded from its tree,
// each operand in its shortest form. A label { label: 'L5F25' } marks where a jump to $5F25 now lands: on the
// statement that follows it in the list. A variable the program does not have is added to the end of its
// variable area. A statement or expression with no encoding here is an error that names it.
import { header, program, statements as read, variables, OPERATORS, NAMES } from './blitz.js';

const hex = (v, w = 4) => v.toString(16).toUpperCase().padStart(w, '0');

// The statements that are one byte, and how many values each takes from the stack.
const SIMPLE = { 0x13: 0, 0x15: 0, 0x16: 0, 0x1d: 0, 0x1e: 0, 0x3a: 0, 0x3b: 0, 0x3c: 1, 0x3d: 1, 0x3e: 1, 0x3f: 0,
  0x40: 1, 0x41: 1, 0x42: 1, 0x43: 1, 0x44: 1, 0x45: 0, 0x48: 1, 0x49: 0, 0x4e: 0, 0x4f: 0, 0x50: 0, 0x56: 1, 0x59: 0,
  0x5a: 0, 0x5b: 0, 0x5c: 0, 0x61: 1, 0x62: 0 };
const SIMPLE_OP = new Map(Object.keys(SIMPLE).map(b => [NAMES[b], +b]));
// The functions, $20 to $36, by name. MID$ takes three values, LEFT$ and RIGHT$ two, the others one.
const FUNCTIONS = new Map(Object.entries(NAMES).filter(([b]) => b >= 0x20 && b <= 0x36).map(([b, n]) => [n, +b]));
const ARGUMENTS = b => b === 0x36 ? 3 : b >= 0x34 ? 2 : 1;
const SPECIALS = ['pi', 'st', 'ti', 'xad', 'xae', 'ti$'];
// GET, READ and INPUT by name. Each instruction reads into the variable or element loaded just before it.
const PLACES = { get: () => 0x46, read: () => 0x4a, 'read$': () => 0x4b, 'input-item': s => s.last ? 0x51 : 0x57, input: s => s.last ? 0x53 : 0x55 };
// The statements that take a count of their values in the byte after them, with the values pushed last first.
const COUNTED = { load: 0x5d, save: 0x5e, verify: 0x5f, open: 0x60 };

// Two trees are the same when every field is the same, whatever the order of their keys.
const same = (a, b) => a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' &&
  Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k])));

// A variable's name as BASIC keeps it in two bytes. Both top bits set mean a whole number (%), and the
// second's alone a string ($).
function nameBytes(name) {
  const m = /^([A-Z])([A-Z0-9]?)([%$]?)$/.exec(name);
  if (!m) throw new Error(`${name} is not a BASIC variable's name`);
  const x = m[1].charCodeAt(0), y = m[2] ? m[2].charCodeAt(0) : 0;
  return m[3] === '%' ? [x | 0x80, y | 0x80] : m[3] === '$' ? [x, y | 0x80] : [x, y];
}

// A number in BASIC's five bytes: the exponent plus 128, then the mantissa with its sign in the top bit.
function float(v) {
  if (!Number.isFinite(v)) throw new Error(`${v} is not a number BASIC holds`);
  if (v === 0) return [0, 0, 0, 0, 0];
  let m = Math.abs(v), e = Math.ceil(Math.log2(m));
  m /= 2 ** e;
  while (m >= 1) { m /= 2; e++; }
  while (m < 0.5) { m *= 2; e--; }
  let bits = Math.round(m * 2 ** 32);
  if (bits === 2 ** 32) { bits = 2 ** 31; e++; }
  if (e + 128 < 1 || e + 128 > 255) throw new Error(`${v} is out of BASIC's range`);
  return [e + 128, (Math.floor(bits / 2 ** 24) & 0x7f) | (v < 0 ? 0x80 : 0), (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255];
}

// A number in the shortest form Blitz! gives it. The runtime holds a whole number in 16 bits with a sign, so
// one from 32768 up is a float, as Blitz! compiles it.
function number(v, out) {
  if (Number.isInteger(v) && v >= 0 && v < 16) out.push(0xb0 + v);
  else if (Number.isInteger(v) && v >= 16 && v < 32) out.push(0xe0 + v);
  else if (Number.isInteger(v) && v >= 32 && v < 256) out.push(0xa6, v);
  else if (Number.isInteger(v) && v >= 256 && v < 32768) out.push(0xa7, v >> 8, v & 255);
  else out.push(0xa8, ...float(v));
}

export function encode(mem, list, { top } = {}) {
  const h = header(mem), at = program(mem), names = variables(mem), { out: original, problems } = read(mem);
  if (problems.length) throw new Error(`the program reads with problems: ${problems[0]}`);

  // Each statement as read, by its address, with the address after its last instruction.
  const before = new Map(), arrays = new Map();
  for (const s of original) {
    if (s.label !== undefined) continue;
    before.set(s.at, { s, end: s.op + at.get(s.op).length });
    // A DIM gives its array's name and its slot: where the array's offset is kept in the first array.
    if (s.k === 'dim') arrays.set(s.n, { slot: mem[s.op + 4] << 8 | mem[s.op + 5], dims: mem[s.op + 1], name: [mem[s.op + 2], mem[s.op + 3]] });
  }
  // Every byte of the program's two stretches must be in a statement, so that a program with no edits keeps them all.
  for (const [from, to] of [[h.start, h.data], [h.main, h.vars]]) {
    let a = from;
    while (a < to) { const b = before.get(a); if (!b) throw new Error(`the byte at $${hex(a)} is in no statement`); a = b.end; }
  }

  // The variables by name, and the ones the edits add.
  const numbers = new Map(), added = [];
  names.forEach((n, k) => numbers.set(n, numbers.has(n) ? -1 : k));
  const variable = name => {
    let n = numbers.get(name);
    if (n === -1) throw new Error(`more than one variable is named ${name}`);
    if (n === undefined) { n = names.length + added.length; added.push(nameBytes(name)); numbers.set(name, n); }
    if (n >= 768) throw new Error(`${name} is variable ${n}; blitz.js reads no variable from 768 on`);
    return n;
  };
  const array = (name, dims) => {
    const a = arrays.get(name);
    if (!a) throw new Error(`no DIM gives the array ${name}`);
    if (a.dims !== dims) throw new Error(`${name} has ${a.dims} dimensions, not ${dims}`);
    if (a.slot > 255) throw new Error(`${name}'s slot is ${a.slot}; blitz.js reads no slot from 256 on`);
    return a;
  };

  // An expression's instructions in postfix order: its operands, then what combines them. A place is a
  // variable that GET, READ, INPUT or FOR reads into. A place that is a number needs the long form even below
  // variable 32, since only that form leaves the variable's address for the statement. A string's short form
  // leaves it too.
  const value = (x, out, place = false) => {
    switch (x.k) {
      case 'num': return number(x.v, out);
      case 'str': {
        const b = Array.from(x.s, c => c.charCodeAt(0));
        if (b.some(c => c > 255)) throw new Error(`the string "${x.s}" has a character beyond a byte`);
        if (b.length > 255) throw new Error(`the string "${x.s}" is longer than 255`);
        return out.push(...(b.length < 8 ? [0xe8 + b.length] : [0xe7, b.length]), ...b);
      }
      case 'var': {
        const n = variable(x.n);
        return n < 32 && (!place || x.n.endsWith('$')) ? out.push(0x80 + n) : out.push(0xa0 | n >> 8, n & 255);
      }
      case 'elem': { const a = array(x.n, x.i.length); x.i.forEach(i => value(i, out)); return out.push(0xa4, a.slot); }
      case 'op': {
        const o = OPERATORS.indexOf(x.o);
        if (o < 1) throw new Error(`no encoding for the operator ${x.o}`);
        value(x.a, out); value(x.b, out); return out.push(o);
      }
      case 'neg': value(x.a, out); return out.push(0x0e);
      case 'not': value(x.a, out); return out.push(0x0f);
      case 'fn': {
        const b = FUNCTIONS.get(x.n);
        if (b === undefined) throw new Error(`no encoding for the function ${x.n}`);
        if (x.args.length !== ARGUMENTS(b)) throw new Error(`${x.n} takes ${ARGUMENTS(b)} values, not ${x.args.length}`);
        x.args.forEach(a => value(a, out)); return out.push(b);
      }
      case 'special': {
        const k = SPECIALS.indexOf(x.n);
        if (k < 0) throw new Error(`no encoding for the special value ${x.n}`);
        return out.push(0xaa + k);
      }
    }
    throw new Error(`no encoding for the expression ${x.k}`);
  };

  // A statement's bytes, and its jumps: where each target goes in the bytes, and for a short IF, where its
  // instruction is.
  const statement = s => {
    const out = [], jumps = [];
    const jump = (b, to) => { out.push(b); jumps.push({ at: out.length, to }); out.push(0, 0); };
    switch (s.k) {
      case 'let':
        if (s.t.k === 'var') {
          value(s.e, out);
          const n = variable(s.t.n);
          if (n < 32) out.push(0xc0 + n); else out.push(0xe0 | n >> 8, n & 255);
        } else if (s.t.k === 'elem') {
          const a = array(s.t.n, s.t.i.length);
          s.t.i.forEach(i => value(i, out)); value(s.e, out); out.push(0xe4, a.slot);
        } else throw new Error(`no encoding for a let into ${s.t.k}`);
        break;
      case 'poke': value(s.v, out); value(s.a, out); out.push(0x17); break;
      // FOR with STEP is left out: blitz.js reads its values in an order the runtime does not use.
      case 'for':
        if (s.step) throw new Error('no encoding for the statement for with a step');
        value(s.to, out); value({ k: 'var', n: s.v }, out, true); out.push(0x11);
        break;
      case 'dim': {
        const a = array(s.n, s.sizes.length);
        s.sizes.forEach(x => value(x, out)); out.push(0x10, s.sizes.length, ...a.name, a.slot >> 8, a.slot & 255);
        break;
      }
      case 'unless': value(s.e, out); jumps.push({ at: out.length + 1, to: s.to, short: out.length }); out.push(0x1f, 0); break;
      case 'if-goto': value(s.e, out); jump(0x52, s.to); break;
      case 'if-return': value(s.e, out); out.push(0x58); break;
      case 'goto': jump(0x19, s.to); break;
      case 'gosub': jump(0x1a, s.to); break;
      case 'on': {
        value(s.e, out);
        if (2 + 2 * s.to.length > 255) throw new Error(`an ON of ${s.to.length} targets is longer than its length byte holds`);
        out.push(s.gosub ? 0x1c : 0x1b, 2 + 2 * s.to.length);
        for (const t of s.to) { jumps.push({ at: out.length, to: t }); out.push(0, 0); }
        break;
      }
      // SYS: its address, then its text up to a colon, which the machine code reads its parameters from.
      case 'sys': {
        const text = Array.from(s.words, c => c.charCodeAt(0));
        if (text.includes(0x3a) || text.length > 79 || text.some(c => c > 255)) throw new Error(`SYS's text "${s.words}" cannot be read back`);
        value(s.e, out); out.push(0x18, ...text, 0x3a);
        break;
      }
      case 'wait':
        if (s.args.length !== 2 && s.args.length !== 3) throw new Error(`WAIT takes 2 or 3 values, not ${s.args.length}`);
        [...s.args].reverse().forEach(a => value(a, out)); out.push(s.args.length === 2 ? 0x4c : 0x4d);
        break;
      default:
        if (PLACES[s.k]) { value(s.t, out, true); out.push(PLACES[s.k](s)); break; }
        if (COUNTED[s.k]) {
          if (s.args.length > 255) throw new Error(`${s.k} has more values than its count byte holds`);
          [...s.args].reverse().forEach(a => value(a, out)); out.push(COUNTED[s.k], s.args.length);
          break;
        }
        if (!SIMPLE_OP.has(s.k)) throw new Error(`no encoding for the statement ${s.k}`);
        if ((s.args?.length ?? 0) !== SIMPLE[SIMPLE_OP.get(s.k)]) throw new Error(`${s.k} takes ${SIMPLE[SIMPLE_OP.get(s.k)]} values, not ${s.args?.length ?? 0}`);
        (s.args ?? []).forEach(a => value(a, out)); out.push(SIMPLE_OP.get(s.k));
    }
    return { bytes: out, jumps };
  };

  // A kept statement's bytes, and the jumps in them.
  const kept = ({ s, end }) => {
    const jumps = [];
    for (let a = s.at; a < end; a += at.get(a).length) {
      const i = at.get(a), o = a - s.at;
      if (i.op === 0x19 || i.op === 0x1a || i.op === 0x52) jumps.push({ at: o + 1, to: i.to[0] });
      else if (i.op === 0x1b || i.op === 0x1c) i.to.forEach((t, k) => jumps.push({ at: o + 2 + 2 * k, to: t }));
      else if (i.op === 0x1f) jumps.push({ at: o + 1, to: i.to[0], short: o });
    }
    return { bytes: mem.subarray(s.at, end), jumps };
  };

  // The list split into the program's two stretches: from its start to its DATA, and from its main code on.
  const stretch = a => a >= h.start && a < h.data ? 0 : a >= h.main && a < h.vars ? 1 : -1;
  const pieces = [[], []];
  let last = 0;
  for (const x of list) {
    const label = x.label !== undefined;
    if (label && !/^L[0-9A-F]{4}$/i.test(x.label)) throw new Error(`${x.label} is not a label`);
    if (!label && !Number.isInteger(x.at)) throw new Error(`the statement ${x.k} has no address`);
    const a = label ? parseInt(x.label.slice(1), 16) : x.at, k = stretch(a);
    if (k < 0) throw new Error(`${label ? x.label : 'the statement at $' + hex(a)} is outside the program`);
    if (k < last) throw new Error(`${label ? x.label : 'the statement at $' + hex(a)} comes after the main code's statements`);
    last = k;
    if (label) { pieces[k].push({ label: a }); continue; }
    const b = before.get(x.at);
    try {
      pieces[k].push({ from: x.at, ...(b && same(x, b.s) ? kept(b) : statement(x)) });
    } catch (e) { throw new Error(`$${hex(x.at)}: ${e.message}`); }
  }

  // Each piece's new address. A jump to a label's address lands on the statement after the label. A jump to an
  // address with no label lands on the first statement in the list with that address.
  const labels = new Map(), firsts = new Map();
  const lay = (list, a) => {
    let waiting = [];
    for (const p of list) {
      if (p.label !== undefined) { waiting.push(p.label); continue; }
      for (const l of waiting) labels.set(l, a);
      waiting = [];
      if (!firsts.has(p.from)) firsts.set(p.from, a);
      p.to = a; a += p.bytes.length;
    }
    if (waiting.length) throw new Error(`L${hex(waiting[0])} marks no statement`);
    return a;
  };
  const data = lay(pieces[0], h.start), main = data + (h.main - h.data), vars = lay(pieces[1], main);
  const arraysAt = vars + (h.arrays - h.vars) + 7 * added.length, end = arraysAt + (h.end - h.arrays);
  if (end > 0x10000) throw new Error(`the program ends at $${hex(end, 5)}, beyond memory`);
  const moved = t => labels.get(t) ?? firsts.get(t);

  const out = mem.slice();
  out.fill(0, h.start, Math.max(h.end, end));
  for (const p of [...pieces[0], ...pieces[1]]) {
    if (p.label !== undefined) continue;
    out.set(p.bytes, p.to);
    for (const j of p.jumps) {
      const t = moved(j.to);
      if (t === undefined) throw new Error(`the jump at $${hex(p.from)} goes to $${hex(j.to)}, where no statement or label is now`);
      if (j.short === undefined) { out[p.to + j.at] = t >> 8; out[p.to + j.at + 1] = t & 255; continue; }
      // A short IF goes on by its one byte, counted from its own address, so its target is ahead of it.
      const by = t - (p.to + j.short);
      if (by < 0 || by > 255) throw new Error(`the short IF at $${hex(p.to + j.short)}, read at $${hex(p.from)}, would jump ${by} bytes, more than its byte holds`);
      out[p.to + j.at] = by;
    }
  }
  // The DATA keeps its bytes. They run to the byte before the main code, which is the RUN the program starts with.
  out.set(mem.subarray(h.data, h.main), data);
  // The variables follow the program. Each is its name's two bytes and five of value, and a new one starts at 0.
  out.set(mem.subarray(h.vars, h.arrays), vars);
  added.forEach((n, k) => out.set([...n, 0, 0, 0, 0, 0], vars + (h.arrays - h.vars) + 7 * k));
  out.set(mem.subarray(h.arrays, h.end), arraysAt);
  // The header: the variables, the arrays, their end, the program's start, its DATA, and the address before main.
  [vars, arraysAt, end, h.start, data, main - 1].forEach((w, k) => { out[0x1f93 + 2 * k] = w & 255; out[0x1f94 + 2 * k] = w >> 8; });

  return { mem: out, end, room: room(list, end, top) };
}

// The room the program has when it runs. Blitz!'s DIM makes each array with Commodore BASIC V2's own routines,
// so it takes what BASIC's DIM takes: 5 + 2 × dimensions + element × (size + 1) × (size + 1) ..., one factor a
// dimension. The 5 are the name's two bytes, the array's length in two and its count of dimensions in one; each
// dimension's size takes two more. An element is 2 bytes for a whole number, 3 for a string's descriptor and 5 for
// a float, so DIM A(10) takes 62 bytes, as on a C64. The strings have what is left between the end of the arrays
// and the top of BASIC's memory.
function room(list, end, top) {
  const sizes = new Map(), unsized = [];
  for (const s of list) {
    if (s.k !== 'dim') continue;
    if (!s.sizes.every(x => x.k === 'num')) { unsized.push(s.n); continue; }
    const element = s.n.endsWith('%') ? 2 : s.n.endsWith('$') ? 3 : 5;
    const bytes = 5 + 2 * s.sizes.length + element * s.sizes.reduce((p, x) => p * (Math.floor(x.v) + 1), 1);
    sizes.set(s.n, Math.max(sizes.get(s.n) ?? 0, bytes));
  }
  const arrays = [...sizes.values()].reduce((a, b) => a + b, 0);
  if (top === undefined) return { top, arrays, strings: null, unsized };
  if (end > top) throw new Error(`the file ends at $${hex(end - 1)}, at or past the top of memory, $${hex(top)}`);
  const strings = top - end - arrays;
  if (strings < 0) throw new Error(`the arrays end ${-strings} bytes past the top of memory, $${hex(top)}`);
  return { top, arrays, strings, unsized };
}
