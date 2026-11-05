// Unsaved work registry: a screen with unsaved changes registers how to save them; the switcher and navigation ask before anything is lost.
let entry = null;
export const dirty = {
  set(label, save, opts = {}) { entry = { label, save, auto: !!opts.auto }; },   // auto: an autosaving editor; leaving saves first instead of asking
  clear() { entry = null; },
  get: () => entry,
  isDirty: () => entry !== null,
};
