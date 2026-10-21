import { describe, expect, it } from "vitest";
import { alignLines, parseInline, parseRich, prefixLines, richToPlain, safeUrl, wrapSel } from "@/lib/rich-text";

describe("rich text", () => {
  it("parses inline formatting", () => {
    expect(parseInline("a **b** *i* ++u++ ~~s~~")).toEqual([
      { t: "text", v: "a " },
      { t: "b", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " " },
      { t: "i", c: [{ t: "text", v: "i" }] },
      { t: "text", v: " " },
      { t: "u", c: [{ t: "text", v: "u" }] },
      { t: "text", v: " " },
      { t: "s", c: [{ t: "text", v: "s" }] },
    ]);
    expect(parseInline("snake_case_name")).toEqual([{ t: "text", v: "snake_case_name" }]);
    expect(parseInline("2 * 3 * 4")).toEqual([{ t: "text", v: "2 * 3 * 4" }]);
    expect(parseInline("**bold *and italic***")[0]).toMatchObject({ t: "b" });
  });
  it("only keeps safe links", () => {
    expect(parseInline("[x](javascript:alert(1))").some((x) => x.t === "a")).toBe(false);
    expect(parseInline("[x](javascript:void)")).toEqual([{ t: "text", v: "x" }]);
    expect(parseInline("[x](https://a.com)")).toEqual([{ t: "a", href: "https://a.com/", c: [{ t: "text", v: "x" }] }]);
    expect(parseInline("see https://a.com/p.")[1]).toEqual({ t: "a", href: "https://a.com/p", c: [{ t: "text", v: "https://a.com/p" }] });
    expect(safeUrl("data:text/html,x")).toBe("");
    expect(safeUrl("example.com")).toBe("https://example.com/");
    expect(safeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
  });
  it("never produces HTML from markup", () => {
    const plain = richToPlain("<script>alert(1)</script> **x**");
    expect(plain).toBe("<script>alert(1)</script> x");
    expect(parseRich("<img src=x onerror=1>")).toEqual([{ t: "p", align: "left", lines: [[{ t: "text", v: "<img src=x onerror=1>" }]] }]);
  });
  it("parses blocks", () => {
    const b = parseRich("# Title\nline one\nline two\n\n- a\n  - b\n1. one\n2. two\n- [x] done\n->mid<-\n![logo](https://a.com/l.png)\nhttps://youtu.be/abc");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "li", "li", "li", "li", "li", "p", "img", "video"]);
    expect(b[1]).toMatchObject({ lines: [[{ v: "line one" }], [{ v: "line two" }]] });
    expect(b[3]).toMatchObject({ depth: 1 });
    expect(b[5]).toMatchObject({ ordered: true, n: 2 });
    expect(b[6]).toMatchObject({ check: true });
    expect(b[7]).toMatchObject({ align: "center" });
  });
  it("plain text for exports", () => {
    expect(richToPlain("## Plan\n- **one**\n1. two\n- [ ] three")).toBe("Plan\n• one\n1. two\n☐ three");
  });
  it("toolbar helpers wrap, prefix and align", () => {
    expect(wrapSel({ text: "hello world", start: 6, end: 11 }, "**").text).toBe("hello **world**");
    const w = wrapSel({ text: "hello **world**", start: 8, end: 13 }, "**");
    expect(w.text).toBe("hello world");
    expect(prefixLines({ text: "a\nb", start: 0, end: 3 }, "- ").text).toBe("- a\n- b");
    expect(prefixLines({ text: "- a\n- b", start: 0, end: 7 }, "- ").text).toBe("a\nb");
    expect(prefixLines({ text: "a\nb", start: 0, end: 3 }, (i) => `${i + 1}. `).text).toBe("1. a\n2. b");
    expect(alignLines({ text: "# a", start: 0, end: 3 }, "center").text).toBe("# ->a<-");
    expect(alignLines({ text: "->a<-", start: 0, end: 5 }, "left").text).toBe("a");
  });
});
