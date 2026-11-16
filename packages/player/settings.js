// A person's settings: what the player, its engines and a site's pages let a person choose (the sound, the printer,
// clean text, a page's own choices), each declared where it acts, in one shape, and kept through the provider
// (provider.js) on a disk of the owner's, settings/<owner>, where the person's files go. The store is typed against
// the declarations: only a declared setting can be read or kept, every value checked against its type. Nothing here
// knows of an address: a site that lets its address set a setting for a visit reads it itself and gives the value.
//
// A declaration: { name, type, default, owner, words, labels?, title? }
//   name     its name, in the store's file (and for a site, in whatever sets it for a visit)
//   type     'boolean', or an array of its fixed values, an enum
//   default  its value where nothing gives one
//   owner    whose it is: 'person' (the only owner yet; a parent's or teacher's later is another layer here, with
//            nothing changed where the setting is declared)
//   words    what its control calls it
//   labels   the words for its values: an enum's, in the order of its values, or a boolean's two, for true then false
//   title    a note on the control
//
//   check(type, value)       whether a value is of the type
//   describe(type)           the type in words, for saying what was refused
//
//   const settings = settingsStore({ disks, visit, fixed, hidden })
//     disks     { owner: disk }, the owner's settings disk (settings/<owner>), opened by the provider; its one file,
//               `settings`, the values by name
//     visit     def => a value for this visit, or undefined: the site's, from wherever it lets a visit set one (its
//               address, say); checked here, a value not of the type refused and said once; never kept
//     fixed     { name: value }, what the page fixes, over everything; hidden, [name], what it does not offer
//   settings.get(def)          its value: the page's fixed one, else one set during this visit, else the visit's
//                              from the site (its address), else the kept one where it is of the type (one that is
//                              not falls back, said), else its default
//   settings.set(def, value)   its value from now on, kept for the next visit too. Every listener hears it at once.
//                              Returns a promise, kept when stored. A value not of the type, or a setting the page
//                              fixes, throws.
//   settings.on(def, f)        f(value) on every change of its value, wherever it was made. Returns a function that
//                              stops it.
//   settings.offered(def)      whether its control is shown: not where the page hides it or fixes it
//
//   control(def, settings, { failed? })   a setting's control, as a <label>: a menu for an enum and for a boolean
//                                      that has labels, a box for any other boolean. Its words are the
//                                      declaration's. It shows the store's value and
//                                      follows every change of it, wherever made, so two controls for one setting
//                                      stay in step. A change made with it goes to the store. If it cannot be kept,
//                                      the setting goes back to the old value, and failed(error) hears why.
import { textBytes, bytesText } from './disk/disk.js';

const FILE = 'settings';

export function check(type, value) {
  if (Array.isArray(type)) return type.includes(value);
  if (type === 'boolean') return typeof value === 'boolean';
  throw new Error('settings: no such type: ' + JSON.stringify(type));
}

// The values a setting's menu offers, in the order of its labels: an enum's values, or true and false for a boolean
// that has labels. A boolean with no labels has no menu, and its control is a box.
const menu = def => Array.isArray(def.type) ? def.type : def.labels ? [true, false] : null;

export function control(def, settings, { failed = () => {} } = {}) {
  const label = document.createElement('label'), values = menu(def), choice = !!values;
  if (def.title) label.title = def.title;
  const box = choice
    ? Object.assign(document.createElement('select'), { innerHTML: values.map((v, i) => `<option value="${v}">${def.labels[i]}</option>`).join('') })
    : Object.assign(document.createElement('input'), { type: 'checkbox' });
  box.id = def.name;
  // A menu's options hold their values as text, so the chosen value is the one whose text the menu holds.
  const chosen = () => values.find(v => String(v) === box.value);
  const show = v => { if (choice) box.value = String(v); else box.checked = v; };
  show(settings.get(def));
  if (choice) label.append(def.words + ' ', box); else label.append(box, ' ' + def.words);
  settings.on(def, show);
  // The new value goes to the store, which tells every listener at once. If it cannot be kept, the setting goes back
  // to what it was, and `failed` hears why.
  box.addEventListener('change', async () => {
    const before = settings.get(def);
    try { await settings.set(def, choice ? chosen() : box.checked); }
    catch (err) {
      settings.set(def, before).catch(() => {});
      show(settings.get(def));
      failed(err);
    }
  });
  return label;
}


export const describe = type => Array.isArray(type) ? 'one of ' + type.map(v => v === '' ? 'nothing' : v).join(', ') : 'on or off';

export function settingsStore({ disks, visit = () => undefined, fixed = {}, hidden = [] }) {
  const said = new Set();
  const say = (key, what) => { if (!said.has(key)) { said.add(key); console.warn(what); } };
  const layers = Object.fromEntries(Object.entries(disks).map(([owner, disk]) => {
    let kept = null;
    try { kept = JSON.parse(bytesText(disk.read(FILE)) ?? '{}'); } catch {}
    return [owner, { disk, kept: kept && typeof kept === 'object' && !Array.isArray(kept) ? kept : {} }];
  }));
  // (the declaration itself checked as it is first met: its owner has a store here, its default is of its type)
  const seen = new Set();
  const layer = def => {
    const l = layers[def.owner];
    if (!l) throw new Error(`settings: no store for the owner ${def.owner} (${def.name})`);
    if (!seen.has(def.name)) { seen.add(def.name); if (!check(def.type, def.default)) throw new Error(`settings: ${def.name}'s default ${JSON.stringify(def.default)} is not ${describe(def.type)}`); }
    return l;
  };
  const now = {};   // (the values set during this visit, by name, over the visit's from the site)
  const listeners = new Map();   // (each setting's listeners, by name)
  const store = {
    get(def) {
      const l = layer(def);
      if (def.name in fixed) {
        if (!check(def.type, fixed[def.name])) throw new Error(`settings: ${def.name} fixed at ${JSON.stringify(fixed[def.name])}, not ${describe(def.type)}`);
        return fixed[def.name];
      }
      if (def.name in now) return now[def.name];
      const v = visit(def);
      if (v !== undefined) {
        if (check(def.type, v)) return v;
        say('visit ' + def.name, `${def.name}: ${JSON.stringify(v)} for this visit refused: not ${describe(def.type)}`);
      }
      if (def.name in l.kept) {
        if (check(def.type, l.kept[def.name])) return l.kept[def.name];
        say('kept ' + def.name, `${def.name}: the kept ${JSON.stringify(l.kept[def.name])} is not ${describe(def.type)}; its default used`);
      }
      return def.default;
    },
    set(def, value) {
      const l = layer(def);
      if (def.name in fixed) throw new Error(`settings: ${def.name} is fixed by the page`);
      if (!check(def.type, value)) throw new Error(`settings: ${def.name} cannot be ${JSON.stringify(value)}: not ${describe(def.type)}`);
      now[def.name] = l.kept[def.name] = value;
      for (const f of listeners.get(def.name) ?? []) f(value);
      return l.disk.write(FILE, textBytes(JSON.stringify(l.kept)));
    },
    on(def, f) {
      layer(def);
      const told = listeners.get(def.name) ?? listeners.set(def.name, new Set()).get(def.name);
      told.add(f);
      return () => told.delete(f);
    },
    offered: def => !hidden.includes(def.name) && !(def.name in fixed),
  };
  return store;
}
