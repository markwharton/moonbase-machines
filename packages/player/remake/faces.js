// The faces for clean text in every view: Inter for words, JetBrains Mono for a grid of characters. The page serves
// the fonts (Inter 500, 600 and 700; JetBrains Mono 500). Without them, each falls back to a system face.
//
//   gridText(x, y, ink)    the attributes of an SVG <text> for one character in a 14 by 16 cell at x, y
//   fit(root)              stretches every <text> under root that has data-x and data-width to that width
//   fitWhenLoaded(root)    fits again once the page's fonts have loaded, since a word measured in a fallback face
//                          has the wrong width
export const WORDS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const GRID = '"JetBrains Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';

// The grid's size: a 14 by 16 cell holds a character whose capitals are about 14 pixels tall, as the Apple's are.
const GRID_SIZE = 19, GRID_WEIGHT = 500, GRID_BASELINE = 15;

export function gridText(x, y, ink) {
  return { x: x + 7, y: y + GRID_BASELINE, fill: ink, 'font-family': GRID, 'font-size': GRID_SIZE, 'font-weight': GRID_WEIGHT, 'text-anchor': 'middle' };
}

// Browsers differ in how they stretch text to a length, so each word is measured on the page and scaled to fit.
export function fit(root) {
  for (const el of root.querySelectorAll('text[data-width]')) {
    const natural = el.getComputedTextLength();
    if (natural > 0) el.setAttribute('transform', `translate(${el.dataset.x} 0) scale(${el.dataset.width / natural} 1)`);
  }
}

export function fitWhenLoaded(root) {
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (!fonts) return;
  const again = () => fit(root);
  fonts.ready.then(again);
  fonts.addEventListener?.('loadingdone', again);
}
