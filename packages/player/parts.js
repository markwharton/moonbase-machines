// The parts both players make the same: the printer's paper under the screen, a phone's keyboard, and the status line.
//
//   statusLine(el)         say(text, { error }): sets the status line's text. An error gets the class `error` and
//                          stays: later ordinary text does not replace it, so a page that shows only errors keeps it.
//   paperBox(words)        the paper's box (hidden until there is something printed): its line, Print and
//                          Tear off, and the sheet (#paper-box, #print-paper, #tear, #paper)
//   phoneKeys(root, stage) on a phone, the Keyboard button (#keyboard) opens its keyboard on a box (#keys-box)
//                          whose keys go to the window's own listener; a keyboard that names no key gives
//                          its characters, passed on as keys
export function statusLine(el) {
  return (text, { error = false } = {}) => {
    if (el.classList.contains('error') && !error) return;
    el.textContent = text;
    el.classList.toggle('error', error);
  };
}

export function paperBox({ line, print, tear }) {
  const box = document.createElement('div');
  box.id = 'paper-box'; box.hidden = true;
  box.innerHTML = '<p><span></span> <button id="print-paper" type="button"></button> <button id="tear" type="button"></button></p><canvas id="paper"></canvas>';
  box.querySelector('span').textContent = line;
  box.querySelector('#print-paper').textContent = print;
  box.querySelector('#tear').textContent = tear;
  return box;
}

export function phoneKeys(root, stage) {
  const kb = root.querySelector('#keyboard'), box = root.querySelector('#keys-box');
  if (!kb || !box || !matchMedia('(pointer: coarse)').matches) return;
  kb.hidden = false;
  kb.addEventListener('click', () => box.focus());
  stage.addEventListener('click', () => box.focus());
  let unnamed = false;
  box.addEventListener('keydown', e => { unnamed = e.key === 'Unidentified'; });
  box.addEventListener('input', () => {
    if (unnamed) for (const ch of box.value) for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { key: ch }));
    box.value = '';
  });
}

// the options line's keyboard parts, as both players have them
export const KEYS_MARKUP = '<button type="button" id="keyboard" class="full" hidden>Keyboard</button><input id="keys-box" class="keys-box" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Keys for the game">';
