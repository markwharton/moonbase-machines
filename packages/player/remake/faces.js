// The faces a remake's clean text is drawn in, every view's: Inter for words placed freely, JetBrains Mono for a
// grid of characters (Mark, 14 November 2026, from samples: the workshop's docs/clean-text/; Inter and IBM Plex Mono
// the alternative). A page that has them serves them (moonbase.au from Bunny Fonts' files, kept on the site); each
// falls back to the system's own, so a page without them still reads clean. The weights a page should serve:
// Inter's 500, 600 and 700, JetBrains Mono's 500.
export const WORDS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const GRID = '"JetBrains Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';
