// Unsaved work registry: a screen with unsaved changes registers how to save them; the switcher and navigation ask before anything is lost.
let entry = null;
export const dirty = {
  set(label, save) { entry = { label, save }; },
  clear() { entry = null; },
  get: () => entry,
  isDirty: () => entry !== null,
};
