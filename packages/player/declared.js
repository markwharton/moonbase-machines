// The settings a person may choose, declared once (settings.js says what a declaration is): the player's own, the
// speaker, a Commodore 64's printer and a title's version with its bugs fixed (play.js); the Remake's, the old style
// text and the mini view (engines/scenes.js); the Original's, an Apple's pictures as vectors (engines/original.js).
// Each is read where it acts, and a site that lets a person set them away from the game (an account's page) draws
// them from here (settings.js `control`), so the two are always the same setting.
export const SOUND = { name: 'sound', type: 'boolean', default: true, owner: 'person', words: 'Sound' };
export const PRINTER = { name: 'printer', type: 'boolean', default: true, owner: 'person', words: 'Printer' };
export const FIXED = { name: 'fixed', type: 'boolean', default: false, owner: 'person', words: 'Bugs fixed', title: 'The game with its bugs fixed: it starts again' };
export const OLD_STYLE = { name: 'old-style', type: 'boolean', default: false, owner: 'person', words: 'Old style text' };
export const MINI = { name: 'mini', type: ['', 'live', 'pictures'], default: '', owner: 'person', words: 'Mini view', labels: ['Off', 'Live', 'Pictures'] };
export const VECTORS = { name: 'vectors', type: 'boolean', default: false, owner: 'person', words: 'Draw the pictures as vectors' };
