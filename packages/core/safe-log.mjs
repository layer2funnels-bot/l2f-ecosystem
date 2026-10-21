// T15 log hygiene. A log line is built from an allowlist of fields; nothing else can enter it.
// Request bodies, response data, ids, emails, tokens, headers and database messages are never logged.
const ALLOWED = ['ts', 'requestId', 'op', 'status', 'class', 'db_code', 'ms', 'rateLimited'];
const SENSITIVE = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,                     // JWT
  /[^\s@"']+@[^\s@"']+\.[^\s@"']+/g,                                                    // email
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,                     // uuid
  /\b[0-9a-f]{32,}\b/gi,                                                                // long hex (tokens, hashes)
  /\bsb_(secret|publishable)_[A-Za-z0-9_-]+/g,                                          // Supabase keys
];
export const scrub = (v) => (typeof v === 'string' ? SENSITIVE.reduce((s, re) => s.replace(re, '[redacted]'), v) : v);

// sink(line: object) is where lines go (console.log(JSON.stringify(...)) in production, an array in tests).
export function createSafeLogger(sink) {
  return {
    log(event) {
      const line = {};
      for (const k of ALLOWED) if (event[k] !== undefined && event[k] !== null) line[k] = typeof event[k] === 'number' || typeof event[k] === 'boolean' ? event[k] : scrub(String(event[k]));
      sink(line);
      return line;
    },
  };
}
