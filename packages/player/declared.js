// The settings a person may choose, each declared once here. settings.js says what a declaration is.
// - The player's own (play.js): the speaker, a Commodore 64's printer, and a title's version with its bugs fixed.
// - The Remake's (engines/scenes.js): Old style text and the mini view.
// - The Original's (engines/original.js): an Apple game's pictures drawn as vectors.
// Each setting is read where it acts. A site can also let a person set them away from the game, on an account's page.
// That page draws its controls from these declarations (settings.js `control`), so both places use the same setting.
export const SOUND = { name: 'sound', type: 'boolean', default: true, owner: 'person', words: 'Sound' };
export const PRINTER = { name: 'printer', type: 'boolean', default: true, owner: 'person', words: 'Printer' };
export const FIXED = { name: 'fixed', type: 'boolean', default: false, owner: 'person', words: 'Bugs fixed', title: 'The game with its bugs fixed: it starts again' };
// Old style text applies only where a remake draws clean text: the vector titles, and card titles with `text`.
export const OLD_STYLE = { name: 'old-style', type: 'boolean', default: false, owner: 'person', words: 'Old style text' };
export const MINI = { name: 'mini', type: ['', 'live', 'pictures'], default: '', owner: 'person', words: 'Mini view', labels: ['Off', 'Live', 'Pictures'] };
export const VECTORS = { name: 'vectors', type: 'boolean', default: false, owner: 'person', words: 'Draw the pictures as vectors' };
