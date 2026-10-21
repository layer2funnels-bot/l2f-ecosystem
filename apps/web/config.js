// Public, browser-safe settings only (no secrets ever). Local stack defaults; replaced at go-live by the build step.
// The publishable key is designed to be public; privileged keys must never appear here (npm run check:secrets guards this).
window.L2F_CONFIG = {
  supabaseUrl: 'http://127.0.0.1:54321',
  publishableKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  googleEnabled: false,
  showNeedsDesign: true,
};
