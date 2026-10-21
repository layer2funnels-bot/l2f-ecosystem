// Rich text for notes: a small Markdown-style format parsed into a tree that React renders as elements.
// Raw HTML is never interpreted, so a note can't inject markup into the editor or a client's share link.
//
// Blocks:  # / ## / ### headings · "- " or "* " bullets · "1. " numbers · "- [ ] " / "- [x] " to-dos
//          (two spaces of indent per level) · "![alt](https://…)" image on its own line · a video link on its
//          own line (YouTube, Vimeo, Loom, Wistia) · "->text<-" centred, "->text" right-aligned · blank line = new
//          paragraph, single newline = line break.
// Inline:  **bold** · *italic* or _italic_ · ++underline++ · ~~strikethrough~~ · [text](https://…) · bare URLs.

export type Inline = { t: "text"; v: string } | { t: "b" | "i" | "u" | "s"; c: Inline[] } | { t: "a"; href: string; c: Inline[] };
export type Align = "left" | "center" | "right";
export type Block =
  | { t: "h"; level: 1 | 2 | 3; c: Inline[]; align: Align }
  | { t: "p"; lines: Inline[][]; align: Align }
  | { t: "li"; ordered: boolean; n: number; depth: number; check?: boolean; c: Inline[] }
  | { t: "img"; src: string; alt: string }
  | { t: "video"; url: string };

/** http(s) and mailto links only; anything else (javascript:, data:…) becomes "". */
export function safeUrl(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^mailto:[^\s]+$/i.test(s)) return s;
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : /^[\w-]+(\.[\w-]+)+/.test(s) ? `https://${s}` : "";
  try {
    const u = new URL(withProto);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|loom\.com|wistia\.com|wistia\.net|vidyard\.com)$/i;
export function isVideoUrl(url: string): boolean {
  try {
    return VIDEO_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/* ---------------- inline ---------------- */
const PAIRS: [string, "b" | "i" | "u" | "s"][] = [
  ["**", "b"],
  ["++", "u"],
  ["~~", "s"],
  ["*", "i"],
  ["_", "i"],
];

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  outer: while (i < src.length) {
    const rest = src.slice(i);
    // escaped marker
    if (rest[0] === "\\" && rest.length > 1 && /[*_+~[\]\\]/.test(rest[1])) {
      buf += rest[1];
      i += 2;
      continue;
    }
    // [text](url)
    if (rest[0] === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        const href = safeUrl(m[2]);
        flush();
        out.push(href ? { t: "a", href, c: parseInline(m[1]) } : { t: "text", v: m[1] });
        i += m[0].length;
        continue;
      }
    }
    // bare URL
    if (/^https?:\/\//i.test(rest) && !/[\w/]$/.test(buf)) {
      const m = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/i.exec(rest);
      if (m) {
        const href = safeUrl(m[0]);
        flush();
        out.push(href ? { t: "a", href, c: [{ t: "text", v: m[0] }] } : { t: "text", v: m[0] });
        i += m[0].length;
        continue;
      }
    }
    for (const [mk, t] of PAIRS) {
      if (!rest.startsWith(mk)) continue;
      // _ only counts at word boundaries (snake_case stays as typed)
      if (mk === "_" && /\w$/.test(buf)) break;
      const after = rest.slice(mk.length);
      if (!after || /^\s/.test(after)) break;
      const end = findClose(after, mk);
      if (end > 0) {
        flush();
        out.push({ t, c: parseInline(after.slice(0, end)) });
        i += mk.length * 2 + end;
        continue outer;
      }
      break;
    }
    buf += rest[0];
    i++;
  }
  flush();
  return out;
}

function findClose(s: string, mk: string): number {
  for (let j = 1; j <= s.length - mk.length; j++) {
    if (s[j - 1] === "\\") continue;
    if (s.startsWith(mk, j) && !/\s/.test(s[j - 1])) {
      // "**" must not be read as two "*"
      if (mk === "*" && (s[j + 1] === "*" || s[j - 1] === "*")) continue;
      if (mk === "_" && /\w/.test(s[j + 1] ?? "")) continue;
      return j;
    }
  }
  return -1;
}

/* ---------------- blocks ---------------- */
function alignOf(line: string): [string, Align] {
  const m = /^->\s?(.*?)\s?(<-)?$/.exec(line);
  if (!m) return [line, "left"];
  return [m[1], m[2] ? "center" : "right"];
}

export function parseRich(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  let para: { lines: Inline[][]; align: Align } | null = null;
  const end = () => {
    if (para) blocks.push({ t: "p", ...para });
    para = null;
  };
  const counters: number[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      end();
      counters.length = 0;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      end();
      const [text, align] = alignOf(h[2]);
      blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, c: parseInline(text), align });
      continue;
    }
    const li = /^(\s*)([-*]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (li) {
      end();
      const depth = Math.min(3, Math.floor(li[1].replace(/\t/g, "  ").length / 2));
      const ordered = /\d/.test(li[2]);
      counters.length = depth + 1;
      counters[depth] = ordered ? (counters[depth] ?? 0) + 1 : 0;
      blocks.push({ t: "li", ordered, n: counters[depth], depth, ...(li[3] ? { check: /x/i.test(li[3]) } : {}), c: parseInline(li[4]) });
      continue;
    }
    counters.length = 0;
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim());
    if (img && safeUrl(img[2])) {
      end();
      blocks.push({ t: "img", src: safeUrl(img[2]), alt: img[1] });
      continue;
    }
    const bare = line.trim();
    if (/^https?:\/\/\S+$/i.test(bare) && isVideoUrl(bare) && safeUrl(bare)) {
      end();
      blocks.push({ t: "video", url: safeUrl(bare) });
      continue;
    }
    const [text, align] = alignOf(line);
    if (para && para.align !== align) end();
    if (!para) para = { lines: [], align };
    para.lines.push(parseInline(text));
  }
  end();
  return blocks;
}

/* ---------------- plain text (exports, search, previews) ---------------- */
export const inlineText = (c: Inline[]): string => c.map((x) => (x.t === "text" ? x.v : inlineText(x.c))).join("");

export function richToPlain(src: string): string {
  return parseRich(src)
    .map((b) => {
      if (b.t === "h") return inlineText(b.c);
      if (b.t === "p") return b.lines.map(inlineText).join("\n");
      if (b.t === "li") return `${"  ".repeat(b.depth)}${b.check !== undefined ? (b.check ? "☑ " : "☐ ") : b.ordered ? `${b.n}. ` : "• "}${inlineText(b.c)}`;
      if (b.t === "img") return b.alt ? `[${b.alt}]` : "";
      return b.url;
    })
    .filter((x, i, a) => x !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n");
}

/* ---------------- editing helpers (toolbar) ---------------- */
export interface Sel {
  text: string;
  start: number;
  end: number;
}
/** Wrap the selection in an inline marker (toggles off when already wrapped). */
export function wrapSel(s: Sel, mk: string, placeholder = "text"): Sel {
  const { text, start, end } = s;
  const before = text.slice(0, start),
    mid = text.slice(start, end),
    after = text.slice(end);
  if (before.endsWith(mk) && after.startsWith(mk)) return { text: before.slice(0, -mk.length) + mid + after.slice(mk.length), start: start - mk.length, end: end - mk.length };
  const body = mid || placeholder;
  return { text: before + mk + body + mk + after, start: start + mk.length, end: start + mk.length + body.length };
}
/** Prefix every selected line (toggles off when all already have it). */
export function prefixLines(s: Sel, prefix: string | ((i: number) => string)): Sel {
  const { text } = s;
  const ls = text.lastIndexOf("\n", s.start - 1) + 1;
  const le = text.indexOf("\n", s.end);
  const lineEnd = le === -1 ? text.length : le;
  const lines = text.slice(ls, lineEnd).split("\n");
  const pf = (i: number) => (typeof prefix === "string" ? prefix : prefix(i));
  const strip = (l: string) => l.replace(/^(#{1,3}\s+|[-*]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|->\s?)/, "").replace(/\s?<-$/, "");
  const all = lines.every((l, i) => l.startsWith(pf(i)));
  const next = lines.map((l, i) => (all ? l.slice(pf(i).length) : pf(i) + strip(l))).join("\n");
  const text2 = text.slice(0, ls) + next + text.slice(lineEnd);
  return { text: text2, start: ls, end: ls + next.length };
}
/** Centre or right-align the selected lines (left removes alignment). */
export function alignLines(s: Sel, align: Align): Sel {
  const { text } = s;
  const ls = text.lastIndexOf("\n", s.start - 1) + 1;
  const le = text.indexOf("\n", s.end);
  const lineEnd = le === -1 ? text.length : le;
  const next = text
    .slice(ls, lineEnd)
    .split("\n")
    .map((l) => {
      const m = /^(#{1,3}\s+)?(.*)$/.exec(l)!;
      const head = m[1] ?? "";
      const body = alignOf(m[2])[0];
      if (!body.trim()) return l;
      return head + (align === "center" ? `->${body}<-` : align === "right" ? `->${body}` : body);
    })
    .join("\n");
  return { text: text.slice(0, ls) + next + text.slice(lineEnd), start: ls, end: ls + next.length };
}
