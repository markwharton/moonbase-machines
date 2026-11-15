// @moonbase-machines/player: every module by name, for one bundled file or to take the whole package at once:
// import { play } from '@moonbase-machines/player', its modules each a namespace named by its path (play, diskDisk,
// enginesOriginal). Each module can be imported on its own too: '@moonbase-machines/player/<module>.js' (play.js,
// disk/disk.js).
export * as play from './play.js';
export * as keys from './keys.js';
export * as saves from './saves.js';
export * as settings from './settings.js';
export * as declared from './declared.js';
export * as provider from './provider.js';
export * as enginesOriginal from './engines/original.js';
export * as enginesScenes from './engines/scenes.js';
export * as audio from './audio.js';
export * as modal from './modal.js';
export * as parts from './parts.js';
export * as diskDialogs from './disk/dialogs.js';
export * as diskDisk from './disk/disk.js';
export * as diskLocal from './disk/local.js';
export * as diskMemory from './disk/memory.js';
export * as remakeCardView from './remake/card-view.js';
export * as remakeClock from './remake/clock.js';
export * as remakeEvents from './remake/events.js';
export * as remakeFixes from './remake/fixes.js';
export * as remakeGame from './remake/game.js';
export * as remakeLayout from './remake/layout.js';
export * as remakeLift from './remake/lift.js';
export * as remakeLoad from './remake/load.js';
export * as remakeObserver from './remake/observer.js';
export * as remakeView from './remake/view.js';
export * as remakeFaces from './remake/faces.js';
export * as remakeCleanText from './remake/clean-text.js';
