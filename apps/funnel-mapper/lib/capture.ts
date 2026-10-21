// Page thumbnails: URL checks and the capture provider adapter. Display only: a thumbnail never touches the maths.
//
// Capture is delegated to an HTTP screenshot service so the app needs no headless browser. Configure it with
// CAPTURE_URL_TEMPLATE, a URL containing {url} (the page address, URL-encoded), for example
//   https://screenshots.example.com/v1/shot?key=SECRET&width=1280&url={url}
// that answers with an image. Without it the built-in public services below are used.

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

const privateV4 = (h: string) => {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
};

/** Only public http(s) pages may be captured: no credentials, no local or private network addresses (SSRF guard). */
export function validateCaptureUrl(raw: string): UrlCheck {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, reason: "Enter a page address" };
  if (text.length > 2000) return { ok: false, reason: "That address is too long" };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, reason: "That doesn’t look like a web address" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "Use an http or https address" };
  if (u.username || u.password) return { ok: false, reason: "Addresses with a login in them can’t be captured" };
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h.includes(".") && !h.includes(":")) return { ok: false, reason: "Use a full public address" };
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return { ok: false, reason: "Private addresses can’t be captured" };
  if (privateV4(h) || h === "::1" || h === "::" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h) || h.startsWith("::ffff:")) return { ok: false, reason: "Private addresses can’t be captured" };
  if (u.port && u.port !== "80" && u.port !== "443") return { ok: false, reason: "Only the standard web ports can be captured" };
  return { ok: true, url: u.toString() };
}

export interface CaptureProvider {
  /** Fetch an image of the page. Throws CaptureError. */
  capture(url: string): Promise<{ bytes: Uint8Array; type: "image/png" | "image/jpeg" | "image/webp" }>;
}
export class CaptureError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "failed" | "timeout" | "too_large" | "bad_image",
  ) {
    super(message);
  }
}

const MAX_BYTES = 5 * 1024 * 1024;

// Without CAPTURE_URL_TEMPLATE the app uses these keyless public screenshot services, tried in order, so "Capture preview"
// works on a fresh deployment. Only the (already validated, public) page address is sent to them. Set CAPTURE_URL_TEMPLATE
// to use your own paid service instead; it then replaces this list.
export const DEFAULT_CAPTURE_TEMPLATES = [
  "https://image.thum.io/get/width/1280/crop/800/noanimate/{url}",
  "https://api.microlink.io/?url={url}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800",
];

async function fetchShot(tpl: string, url: string, fetcher: typeof fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    // thum.io takes the address as a path suffix, so only the query-string templates are URL-encoded
    const target = /[?&=]\{url\}/.test(tpl) ? encodeURIComponent(url) : url;
    const res = await fetcher(tpl.replace("{url}", target), { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new CaptureError(`The capture service answered ${res.status}`, "failed");
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (type !== "image/png" && type !== "image/jpeg" && type !== "image/webp") throw new CaptureError("The capture service didn’t return an image", "bad_image");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new CaptureError("The captured image is too large", "too_large");
    return { bytes, type } as { bytes: Uint8Array; type: "image/png" | "image/jpeg" | "image/webp" };
  } catch (e) {
    if (e instanceof CaptureError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new CaptureError("The page took too long to capture", "timeout");
    throw new CaptureError("The capture service couldn’t be reached", "failed");
  } finally {
    clearTimeout(timer);
  }
}

/** The configured template service, else the built-in public ones in order. Always returns a provider. */
export function captureProviderFromEnv(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): CaptureProvider {
  const tpl = env.CAPTURE_URL_TEMPLATE?.trim();
  const templates = tpl && tpl.includes("{url}") ? [tpl] : DEFAULT_CAPTURE_TEMPLATES;
  return {
    async capture(url) {
      let last: CaptureError = new CaptureError("The page couldn’t be captured", "failed");
      for (const t of templates) {
        try {
          return await fetchShot(t, url, fetcher);
        } catch (e) {
          if (e instanceof CaptureError) last = e;
        }
      }
      throw last;
    },
  };
}
