// The settings a person may choose, each declared once here. settings.js says what a declaration is.
// - The player's own (play.js): the speaker, a Commodore 64's printer, and a title's version with its bugs fixed.
// - The Remake's (engines/scenes.js): the speed, Clean text, the monitor of a card title, and the mini view.
// - The Original's (engines/original.js): an Apple game's monitor, and its pictures drawn as vectors.
// Each setting is read where it acts. A site can also let a person set them away from the game, on an account's page.
// That page draws its controls from these declarations (settings.js `control`), so both places use the same setting.
export const SOUND = { name: 'sound', type: 'boolean', default: true, owner: 'person', words: 'Sound', labels: ['On', 'Off'] };
export const PRINTER = { name: 'printer', type: 'boolean', default: true, owner: 'person', words: 'Printer' };
export const FIXED = { name: 'fixed', type: 'boolean', default: false, owner: 'person', words: 'Bugs fixed', title: 'The game with its bugs fixed: it starts again' };
// The speed a Remake plays at. On Turbo the engine asks the title which steps it need not wait for (its title.js
// `warp`), and runs those flat out. On Original it asks nothing, and the game runs at the original's speed throughout.
// It applies to a title whose title.js has a `warp`.
export const SPEED = { name: 'speed', type: ['original', 'turbo'], default: 'turbo', owner: 'person', words: 'Speed', labels: ['Original', 'Turbo'] };
// Clean text applies only where a remake draws clean text: the vector titles, and card titles with `text`. With it
// off, the words are drawn as the game drew them.
export const CLEAN_TEXT = { name: 'clean-text', type: 'boolean', default: true, owner: 'person', words: 'Clean text' };
// The monitor a game is shown on: a colour monitor, or a monochrome monitor in the colour of its phosphor. Its
// `phosphors` are the colour of each monochrome monitor's phosphor, by the setting's value. A screen's painter is
// given one as its `ink`. Colour has none.
export const MONITOR = { name: 'monitor', type: ['colour', 'green', 'amber', 'white'], default: 'colour', owner: 'person', words: 'Monitor', labels: ['Colour', 'Green', 'Amber', 'White'],
  phosphors: { green: [51, 255, 51], amber: [255, 176, 0], white: [230, 236, 255] } };
export const MINI ={ name: 'mini', type: ['', 'live', 'pictures'], default: '', owner: 'person', words: 'Mini view', labels: ['Off', 'Live', 'Pictures'] };
export const VECTORS = { name: 'vectors', type: 'boolean', default: false, owner: 'person', words: 'Draw the pictures as vectors' };
