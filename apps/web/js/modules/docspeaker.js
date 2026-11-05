// Automatic speaker detection for conversation transcripts (beta, free, runs in the browser; no audio leaves the page through this code).
// The microphone is analysed with Web Audio next to the speech recognizer. For each utterance a small voice fingerprint is built from voiced frames
// (mean pitch by autocorrelation, spectral centroid and roll-off, eight band energies). Utterances are clustered online: an utterance joins the nearest
// known voice if it is close enough (cosine distance), otherwise it starts a new speaker (at most MAX). It works best with one person at a time and
// similar microphone distance; it cannot tell identical-sounding voices apart. Everything here is pure (arrays in, numbers out) so it can be tested.
export const MAX_SPEAKERS = 6, BANDS = 8, MIN_VOICED_FRAMES = 6;

// ---- a small FFT (radix-2, in place) for the magnitude spectrum of one frame
export function magnitudeSpectrum(x) {
  const n = x.length; const re = Float64Array.from(x), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i += 1) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len; const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k += 1) { const a = i + k, b = i + k + len / 2; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
  const out = new Float64Array(n / 2); for (let i = 0; i < n / 2; i += 1) out[i] = Math.hypot(re[i], im[i]); return out;
}
/** Pitch in Hz by normalised autocorrelation (70 to 400 Hz), or 0 when the frame is not clearly voiced. */
export function pitchOf(x, sampleRate) {
  const n = x.length; const lo = Math.floor(sampleRate / 400), hi = Math.min(Math.floor(sampleRate / 70), n - 1);
  let e0 = 0; for (let i = 0; i < n; i += 1) e0 += x[i] * x[i]; if (e0 < 1e-8) return 0;
  let best = 0, bestLag = 0; const r = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag += 1) { let s = 0; for (let i = 0; i + lag < n; i += 1) s += x[i] * x[i + lag]; r[lag] = s / e0; }
  for (let lag = lo; lag <= hi; lag += 1) if (r[lag] > best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) { best = r[lag]; bestLag = lag; }
  if (best < 0.45 || !bestLag) return 0;
  const a = r[bestLag - 1], b = r[bestLag], c = r[bestLag + 1]; const d = a - 2 * b + c; const shift = d ? (0.5 * (a - c)) / d : 0;      // parabolic refinement
  return sampleRate / (bestLag + shift);
}
/** Features of one audio frame (Float32 samples). `voiced` is false for silence and noise. */
export function frameFeatures(x, sampleRate) {
  let rms = 0; for (let i = 0; i < x.length; i += 1) rms += x[i] * x[i]; rms = Math.sqrt(rms / x.length);
  if (rms < 0.01) return { voiced: false };
  const f0 = pitchOf(x, sampleRate); if (!f0) return { voiced: false };
  const w = Float64Array.from(x, (v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (x.length - 1))));     // Hann window
  const m = magnitudeSpectrum(w); const hz = sampleRate / x.length; let tot = 0, cen = 0; const limit = Math.min(m.length, Math.floor(5000 / hz));
  for (let i = 1; i < limit; i += 1) { tot += m[i]; cen += m[i] * i * hz; }
  if (!tot) return { voiced: false };
  let acc = 0, roll = 0; for (let i = 1; i < limit; i += 1) { acc += m[i]; if (acc >= 0.85 * tot) { roll = i * hz; break; } }
  const bands = new Array(BANDS).fill(0); const edges = Array.from({ length: BANDS + 1 }, (_, k) => 100 * (5000 / 100) ** (k / BANDS));     // 100 Hz .. 5 kHz, log spaced
  for (let i = 1; i < limit; i += 1) { const f = i * hz; if (f < edges[0]) continue; let k = 0; while (k < BANDS - 1 && f >= edges[k + 1]) k += 1; bands[k] += m[i] * m[i]; }
  const be = bands.reduce((a, b) => a + b, 0) || 1;
  return { voiced: true, f0, centroid: cen / tot, rolloff: roll, bands: bands.map((b) => b / be) };
}
// typical ranges, used to put every dimension on a comparable scale
const MU = [Math.log2(150), 1500, 3000, ...Array(BANDS).fill(1 / BANDS)], SD = [0.35, 700, 1100, ...Array(BANDS).fill(0.12)], W = [3, 1, 1, ...Array(BANDS).fill(0.6)];
/** The fingerprint (a standardised, weighted vector) of an utterance from its voiced frames, or null when there is too little voice. */
export function fingerprint(frames) {
  const v = frames.filter((f) => f.voiced); if (v.length < MIN_VOICED_FRAMES) return null;
  const mean = (g) => v.reduce((a, f) => a + g(f), 0) / v.length;
  const raw = [mean((f) => Math.log2(f.f0)), mean((f) => f.centroid), mean((f) => f.rolloff), ...Array.from({ length: BANDS }, (_, k) => mean((f) => f.bands[k]))];
  return raw.map((x, i) => ((x - MU[i]) / SD[i]) * W[i]);
}
export const cosineDistance = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i += 1) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return na && nb ? 1 - d / Math.sqrt(na * nb) : 1; };
const euclid = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

/** Online clustering of utterance fingerprints. assign() returns the speaker index; a vector too far from every known voice starts a new speaker. */
export class SpeakerClusters {
  constructor({ threshold = 0.3, max = MAX_SPEAKERS } = {}) { this.threshold = threshold; this.max = max; this.centres = []; this.counts = []; this.last = -1; }
  distance(a, b) { return cosineDistance(a, b) + 0.05 * euclid(a, b); }
  /** vec is a fingerprint, or null for an utterance too short to judge (it stays with the previous speaker). */
  assign(vec) {
    if (!vec) return { id: this.last >= 0 ? this.last : 0, isNew: false, short: true };
    let best = -1, bd = Infinity; this.centres.forEach((c, i) => { const d = this.distance(vec, c); if (d < bd) { bd = d; best = i; } });
    if (best < 0 || (bd > this.threshold && this.centres.length < this.max)) { const id = this.add(vec); this.last = id; return { id, isNew: true, dist: bd }; }
    const n = this.counts[best] + 1; this.centres[best] = this.centres[best].map((x, i) => x + (vec[i] - x) / Math.min(n, 12)); this.counts[best] = n; this.last = best;       // the centre follows the voice slowly
    return { id: best, isNew: false, dist: bd };
  }
  add(vec) { this.centres.push(vec.slice()); this.counts.push(1); return this.centres.length - 1; }
}
