// Docs voice typing and conversation transcripts. Uses the browser's own speech recognition (Web Speech API: Chrome, Edge and other Chromium
// browsers; free, no server of ours). In some browsers the audio is processed by the browser vendor's speech service: the panel says so.
// Pure helpers (spoken punctuation, clock, speaker turns) are separate from the recognizer so they can be tested without a browser.
export const LANGS = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['ur-PK', 'Urdu (اردو)']];
export const isUrdu = (lang) => /^ur/i.test(lang);
export const SPEAKER_COLOURS = ['#1d4ed8', '#b91c1c', '#15803d', '#a16207', '#6d28d9', '#0e7490', '#be185d', '#c2410c', '#404040'];
export const MAX_SPEAKERS = 9;

/** 'hh:mm:ss' for a number of milliseconds. */
export const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const p = (n) => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`; };
/** Next speaker in turn (wraps around). */
export const nextSpeaker = (cur, count) => (count > 0 ? (cur + 1) % count : 0);
/** Auto-switch rule: a new speaker turn starts when the pause since the last utterance is longer than the chosen seconds. */
export const turnChanged = (lastAt, now, pauseSec) => lastAt > 0 && now - lastAt > pauseSec * 1000;

const SPOKEN = [
  [/\s*\b(?:new paragraph|next paragraph)\b[\s,.]*/gi, '\u0001'], [/\s*\b(?:new line|next line)\b[\s,.]*/gi, '\n'],
  [/\s*\b(?:full stop|period)\b/gi, '.'], [/\s*\bcomma\b/gi, ','], [/\s*\bquestion mark\b/gi, '?'], [/\s*\b(?:exclamation mark|exclamation point)\b/gi, '!'], [/\s*\bsemicolon\b/gi, ';'], [/\s*\bcolon\b/gi, ':'],
];
/** English spoken punctuation: "hello comma how are you question mark" -> "hello, how are you?". "\n" is a line break, "\u0001" a paragraph break. Other languages are returned as spoken. */
export function applyVoiceCommands(text, lang = 'en-US') {
  let t = String(text ?? '').trim(); if (!t || !/^en/i.test(lang)) return t;
  for (const [re, to] of SPOKEN) t = t.replace(re, to);
  t = t.replace(/([.,!?;:])(?=[^\s\n\u0001.,!?;:)"'])/g, '$1 ').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/ {2,}/g, ' ').trim();
  return t.replace(/(^|[.!?]\s+|\n|\u0001)(\p{Ll})/gu, (_m, a, c) => a + c.toUpperCase());
}
/** The text to put at the caret: a space first unless the caret is at a line start or the text begins with punctuation. */
export const withSpacing = (text, charBefore) => (text && charBefore && !/[\s(\[{"“‘'-]/.test(charBefore) && !/^[.,!?;:)\]}\n\u0001]/.test(text) ? ` ${text}` : text);

/** A restartable speech recognizer (the browser ends a session after a silence; this starts it again while we still want to listen). Null when the browser has none. */
export function createRecognizer({ lang, onFinal, onInterim, onState, onError }) {
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null; if (!SR) return null;
  let rec = null, want = false, l = lang;
  const make = () => {
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = l; rec.maxAlternatives = 1;
    rec.onstart = () => onState('listening');
    rec.onresult = (e) => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i += 1) { const r = e.results[i]; if (r.isFinal) { const t = r[0].transcript.trim(); if (t) onFinal(t); } else interim += r[0].transcript; } onInterim(interim); };
    rec.onerror = (e) => { if (e.error === 'no-speech' || e.error === 'aborted') return; if (e.error === 'not-allowed' || e.error === 'service-not-allowed') want = false; onError(e.error); };
    rec.onend = () => { onInterim(''); if (want) { try { make(); rec.start(); } catch { want = false; onState('stopped'); } } else onState('stopped'); };
  };
  return {
    start() { want = true; make(); try { rec.start(); } catch { onError('start-failed'); } },
    stop() { want = false; try { rec.stop(); } catch { /* already stopped */ } },
    setLang(x) { l = x; if (want) { rec.onend = null; try { rec.abort(); } catch { /* ignore */ } make(); try { rec.start(); } catch { /* ignore */ } } },
    get active() { return want; },
  };
}
export const voiceSupported = () => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
export const ERRORS = { 'not-allowed': 'The microphone is blocked. Allow it for this site in the browser’s address bar, then start again.', 'service-not-allowed': 'The browser’s speech service is not allowed here.', network: 'The speech service could not be reached. Check your connection.', 'audio-capture': 'No microphone was found.', 'language-not-supported': 'This browser does not support that language for speech.', 'start-failed': 'Could not start listening. Try again.' };

/** A transcript line made by conversation mode: bold coloured speaker name, then " (hh:mm:ss): ", then the words. */
export const isTranscriptLine = (b) => Boolean(b && b.t === 'p' && b.c?.length >= 2 && b.c[0].b && SPEAKER_COLOURS.includes(b.c[0].c) && /^ \(\d\d:\d\d:\d\d\): $/.test(b.c[1].x));
