# Live funnel preview renderer. Input = the funnel's own canvas data (same shape the editor saves).
import sys, math, html
sys.path.insert(0, "/home/claude")
import pgobj as G

SZ = {"source": (196, 74), "page": (196, 112), "offer": (196, 112), "logic": (196, 74), "message": (196, 74), "goal": (196, 74), "action": (196, 74)}
def N(i, kind, x, y, key="", name=""):
    w, h = SZ[kind]; return dict(id=i, kind=kind, x=x, y=y, w=w, h=h, key=key, name=name)
def E(a, b, kind="flow", vol=1, side="r"): return dict(a=a, b=b, kind=kind, vol=vol, side=side)

# ---- the funnel canvas data. PT tripwire = the exact coordinates on the Editor board. ----
F = {}
F["pt"] = dict(
    name="PT tripwire funnel",
    nodes=[N("s1", "source", 60, 110, name="Instagram ads"), N("s2", "source", 60, 232, name="Gym poster QR"),
           N("quiz", "page", 330, 170, "quiz", "Fitness quiz"), N("chk", "offer", 580, 170, "checkout", "6-Week Kickstart"),
           N("cond", "logic", 830, 189, name="Joined coaching?"), N("sub", "offer", 1080, 170, "subscription", "Monthly coaching"),
           N("wa", "message", 830, 349, name="WhatsApp follow-up"), N("down", "offer", 1080, 330, "downsell", "Kickstart (£27)")],
    edges=[E("s1", "quiz", "flow", 2000), E("s2", "quiz", "flow", 300), E("quiz", "chk", "flow", 1035), E("chk", "cond", "flow", 83),
           E("cond", "sub", "flow", 29), E("chk", "wa", "leak", 952, "b"), E("wa", "down", "flow", 381)],
    frames=[(36, 72, 244, 280), (306, 72, 998, 400)], notes=[(1080, 506, 170, 96)])
F["quiz"] = dict(name="Quiz → coaching",
    nodes=[N("s", "source", 60, 150, name="Facebook ads"), N("q", "page", 330, 130, "quiz", "Quiz"), N("c", "offer", 580, 130, "subscription", "Coaching"),
           N("t", "page", 830, 130, "thankyou", "Thank-you"), N("w", "message", 580, 330, name="WhatsApp"), N("d", "offer", 830, 310, "downsell", "Downsell")],
    edges=[E("s", "q", "flow", 1800), E("q", "c", "flow", 700), E("c", "t", "flow", 120), E("q", "w", "leak", 1100, "b"), E("w", "d", "flow", 300)], frames=[], notes=[])
F["webinar"] = dict(name="Webinar funnel",
    nodes=[N("s", "source", 60, 200, name="Facebook ads"), N("o", "page", 330, 180, "optin", "Registration"), N("w", "page", 580, 180, "webinar", "Live webinar"),
           N("c", "offer", 830, 180, "checkout", "Offer"), N("t", "page", 1080, 180, "thankyou", "Thank-you"),
           N("e", "message", 830, 400, name="Email reminder"), N("r", "page", 1080, 380, "webinar", "Replay")],
    edges=[E("s", "o", "flow", 4000), E("o", "w", "flow", 1500), E("w", "c", "flow", 400), E("c", "t", "flow", 90),
           E("w", "e", "leak", 1100, "b"), E("e", "r", "flow", 700)], frames=[], notes=[])
F["application"] = dict(name="Application → call",
    nodes=[N("s", "source", 60, 170, name="LinkedIn ads"), N("v", "page", 330, 150, "vsl", "VSL"), N("a", "page", 580, 150, "application", "Application"),
           N("b", "page", 830, 150, "booking", "Qualified call"), N("t", "page", 1080, 150, "thankyou", "Confirmed"),
           N("e", "message", 830, 350, name="Email follow-up"), N("g", "goal", 1330, 169, name="Calls booked")],
    edges=[E("s", "v", "flow", 900), E("v", "a", "flow", 300), E("a", "b", "flow", 120), E("b", "t", "flow", 70), E("a", "e", "leak", 180, "b"), E("t", "g", "flow", 60)], frames=[], notes=[])
F["subab"] = dict(name="Subscription + A/B test",
    nodes=[N("s", "source", 60, 200, name="Instagram ads"), N("p", "page", 330, 180, "sales", "Sales page"), N("x", "logic", 580, 199, name="A/B split"),
           N("a", "offer", 830, 90, "subscription", "Plan A"), N("b", "offer", 830, 290, "subscription", "Plan B"), N("t", "page", 1080, 190, "thankyou", "Thank-you")],
    edges=[E("s", "p", "flow", 1200), E("p", "x", "flow", 160), E("x", "a", "flow", 80), E("x", "b", "flow", 80), E("a", "t", "flow", 20), E("b", "t", "flow", 20)], frames=[], notes=[])
F["lead"] = dict(name="Lead magnet",
    nodes=[N("s", "source", 60, 150, name="Google ads"), N("o", "page", 330, 130, "optin", "Opt-in"), N("t", "page", 580, 130, "thankyou", "Thank-you"),
           N("e", "message", 830, 150, name="Email sequence"), N("p", "page", 1080, 130, "sales", "Sales page"), N("c", "offer", 1330, 130, "checkout", "Checkout")],
    edges=[E("s", "o", "flow", 2000), E("o", "t", "flow", 700), E("t", "e", "flow", 700), E("e", "p", "flow", 300), E("p", "c", "flow", 90)], frames=[], notes=[])
F["vsl"] = dict(name="VSL",
    nodes=[N("s", "source", 60, 170, name="YouTube ads"), N("v", "page", 330, 150, "vsl", "VSL page"), N("c", "offer", 580, 150, "checkout", "Checkout"),
           N("u", "offer", 830, 150, "upsell", "Upsell"), N("d", "offer", 830, 330, "downsell", "Downsell"), N("t", "page", 1080, 150, "thankyou", "Thank-you")],
    edges=[E("s", "v", "flow", 3000), E("v", "c", "flow", 300), E("c", "u", "flow", 60), E("u", "t", "flow", 20), E("u", "d", "leak", 40, "b"), E("d", "t", "flow", 10)], frames=[], notes=[])
F["fitness"] = dict(name="L2F fitness standard", **{k: v for k, v in F["pt"].items() if k != "name"})
F["fitness"]["nodes"] = F["pt"]["nodes"] + [dict(N("g", "goal", 1330, 189, name="Revenue goal"))]
F["fitness"]["edges"] = F["pt"]["edges"] + [E("sub", "g", "flow", 29)]
F["empty"] = dict(name="Untitled funnel", nodes=[], edges=[], frames=[], notes=[])

PAGE_TINT, OFFER_TINT = "#A78BFA", "#FB923C"
TINT = {"source": "#60A5FA", "page": "#A78BFA", "offer": "#FB923C", "logic": "#FBBF24", "message": "#2DD4BF", "goal": "#84CC16", "action": "#2DD4BF"}

def bbox(d):
    xs = []; 
    for n in d["nodes"]: xs += [(n["x"], n["y"], n["x"] + n["w"], n["y"] + n["h"] + (10 if n["kind"] == "offer" else 0))]
    for f in d["frames"]: xs += [(f[0], f[1], f[0] + f[2], f[1] + f[3])]
    return min(a[0] for a in xs), min(a[1] for a in xs), max(a[2] for a in xs), max(a[3] for a in xs)

def edge_path(a, b, side, T):
    s, tx, ty = T
    if side == "b": sx, sy = a["x"] + a["w"] / 2, a["y"] + a["h"]
    else: sx, sy = a["x"] + a["w"], a["y"] + a["h"] / 2
    ex, ey = b["x"], b["y"] + b["h"] / 2
    if side == "b":
        dx, dy = ex - sx, ey - sy; c1 = (sx, sy + .67 * dy); c2 = (sx + .47 * dx, ey)
    else:
        m = max(30, (ex - sx) / 2); c1 = (sx + m, sy); c2 = (ex - m, ey)
    P = [(sx, sy), c1, c2, (ex, ey)]; P = [(x * s + tx, y * s + ty) for x, y in P]
    return P


def name_svg(name, x, y_one, y_two, size=12, maxc=17):
    name = html.escape(name)
    if len(name) <= maxc: return '<text x="%d" y="%d" font-family="DM Sans,sans-serif" font-size="%d" font-weight="600" fill="#F1F5F9">%s</text>' % (x, y_one, size, name)
    words = name.split(" "); best = None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:]); sc = max(len(a), len(b))
        if best is None or sc < best[0]: best = (sc, a, b)
    if best is None: a, b = name[:maxc], name[maxc:2 * maxc]
    else: _, a, b = best
    return ('<text x="%d" y="%d" font-family="DM Sans,sans-serif" font-size="%d" font-weight="600" fill="#F1F5F9">%s</text><text x="%d" y="%d" font-family="DM Sans,sans-serif" font-size="%d" font-weight="600" fill="#F1F5F9">%s</text>' % (x, y_two[0], size, a[:maxc + 2], x, y_two[1], size, b[:maxc + 2]))

def node_svg(n, s, names):
    k, w, h = n["kind"], n["w"], n["h"]; t = TINT[k]; g = ['<g transform="translate(%.2f %.2f)">' % (n["x"], n["y"])]
    if s < .11:
        g.append('<rect width="%d" height="%d" rx="%d" fill="%s" opacity=".92"/>' % (w, h, 14 if k in ("page", "offer") else 37, t))
        if k in ("page", "offer"): g.append('<rect x="10" y="10" width="72" height="72" rx="6" fill="#F8FAFC"/>')
        g.append("</g>"); return "".join(g)
    if k in ("page", "offer"):
        acc = G.OFFER_ACC if k == "offer" else G.PAGE_ACC
        g.append('<rect width="%d" height="%d" rx="12" fill="#111827" stroke="#2A3648" stroke-width="2"/>' % (w, h))
        g.append('<rect x="8" y="7" width="68" height="76" rx="5" fill="#F4F6FA" stroke="#475569" stroke-width="2"/><rect x="9" y="8" width="66" height="9" fill="#E3E8F0"/>')
        body = G.P.get(n["key"], G.P["generic"]).replace("{A}", acc)
        g.append('<svg x="9" y="17" width="66" height="65" viewBox="0 0 66 65">%s</svg>' % body)
        if names and s >= .3:
            g.append(name_svg(n["name"], 86, 32, (28, 44), 12, 16))
        else:
            g.append('<rect x="86" y="20" width="86" height="9" rx="4" fill="#F1F5F9" opacity=".8"/><rect x="86" y="36" width="52" height="7" rx="3" fill="#94A3B8" opacity=".6"/>')
        g.append('<rect x="86" y="58" width="40" height="12" rx="4" fill="#E2E8F0" opacity=".85"/>')
        g.append('<path d="M0 90h196v10a12 12 0 0 1-12 12H12A12 12 0 0 1 0 100z" fill="#0B1220"/><rect x="8" y="97" width="14" height="10" rx="3" fill="%s"/><rect x="28" y="99" width="70" height="6" rx="3" fill="%s"/>' % (t, t))
        if k == "offer": g.append('<rect x="12" y="-10" width="52" height="20" rx="5" fill="#0B1220" stroke="%s" stroke-width="2"/><rect x="20" y="-3" width="36" height="6" rx="3" fill="%s"/>' % (t, t))
    elif k == "source":
        g.append('<path d="M37 0H184a12 12 0 0 1 12 12V62a12 12 0 0 1-12 12H37a37 37 0 0 1 0-74z" fill="#111827" stroke="#2A3648" stroke-width="2"/><circle cx="37" cy="37" r="22" fill="%s"/>' % t)
        g.append(''+(name_svg(n["name"], 70, 42, (33, 49), 12, 19) if (names and s >= .3) else '<rect x="70" y="22" width="90" height="9" rx="4" fill="#F1F5F9" opacity=".8"/><rect x="70" y="40" width="56" height="7" rx="3" fill="#94A3B8" opacity=".6"/>')+'')
    elif k == "action":
        g.append('<rect width="196" height="74" rx="12" fill="#111827" stroke="#2A3648" stroke-width="2"/><g transform="translate(37 37) rotate(45)"><rect x="-17" y="-17" width="34" height="34" rx="8" fill="%s"/></g>' % t)
        g.append('<rect x="70" y="22" width="90" height="9" rx="4" fill="#F1F5F9" opacity=".8"/><rect x="70" y="40" width="56" height="7" rx="3" fill="#94A3B8" opacity=".6"/>' if not (names and s >= .3) else name_svg(n["name"], 70, 42, (33, 49), 12, 19))
    elif k in ("message", "goal"):
        g.append('<rect width="196" height="74" rx="37" fill="#111827" stroke="#2A3648" stroke-width="2"/><circle cx="37" cy="37" r="22" fill="%s"/>' % t)
        g.append(''+(name_svg(n["name"], 70, 42, (33, 49), 12, 19) if (names and s >= .3) else '<rect x="70" y="22" width="90" height="9" rx="4" fill="#F1F5F9" opacity=".8"/><rect x="70" y="40" width="56" height="7" rx="3" fill="#94A3B8" opacity=".6"/>')+'')
    else:  # logic
        g.append('<rect width="196" height="74" rx="6" fill="#111827" stroke="#2A3648" stroke-width="2"/><rect x="14" y="15" width="44" height="44" rx="8" fill="%s"/>' % t)
        g.append(''+(name_svg(n["name"], 70, 42, (33, 49), 12, 19) if (names and s >= .3) else '<rect x="70" y="22" width="90" height="9" rx="4" fill="#F1F5F9" opacity=".8"/><rect x="70" y="40" width="56" height="7" rx="3" fill="#94A3B8" opacity=".6"/>')+'')
    out_s = "".join(g) + "</g>"
    if n.get("dashed"): out_s = out_s.replace('stroke="#2A3648" stroke-width="2"', 'stroke="#94A3B8" stroke-width="3" stroke-dasharray="12 8"', 1)
    return out_s

def render(key, W, H, pad=8, cap=.5, cls="thumb fluid", uid="", label=True, names=None, mark=None, dim=False, dots=False, delta=None):
    d = F[key] if isinstance(key, str) else key
    nodes = {n["id"]: n for n in d["nodes"]}
    label_txt = "Map of %s: %d blocks, %d connections" % (d["name"], len(d["nodes"]), len(d["edges"]))
    head = '<svg class="%s" width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-label="%s">' % (cls, W, H, W, H, html.escape(label_txt))
    pat = '<defs><pattern id="dp%s%d%d" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#1E293B"/></pattern></defs><rect width="%d" height="%d" fill="url(#dp%s%d%d)"/>' % (uid, W, H, W, H, uid, W, H)
    if not d["nodes"]:
        cy = H / 2 - (28 if H > 100 else 12)
        return head + pat + '<g fill="none" stroke="#475569" stroke-width="1.4" stroke-dasharray="4 4"><rect x="%.1f" y="%.1f" width="68" height="40" rx="8"/></g>' % (W / 2 - 34, cy - 26) + \
               '<text x="%.1f" y="%.1f" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="%d" font-weight="600" fill="#CBD5E1">No blocks yet</text>' % (W / 2, cy + 32, 12 if W > 150 else 8) + \
               ('<text x="%.1f" y="%.1f" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="10.5" fill="#64748B">Add a traffic source to start</text>' % (W / 2, cy + 47) if H > 100 else "") + "</svg>"
    x0, y0, x1, y1 = bbox(d); bw, bh = x1 - x0, y1 - y0
    s = min((W - 2 * pad) / bw, (H - 2 * pad) / bh, cap)
    tx = (W - bw * s) / 2 - x0 * s; ty = (H - bh * s) / 2 - y0 * s
    names = (s >= .3) if names is None else names
    out = [head, pat]
    out.append('<g transform="translate(%.2f %.2f) scale(%.4f)">' % (tx, ty, s))
    for f in d["frames"]: out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="14" fill="rgba(148,163,184,.05)" stroke="#334155" stroke-width="2" stroke-dasharray="10 8"/>' % f)
    for f in d["notes"]:
        if f[0] >= x0 and f[1] >= y0 and f[0] + f[2] <= x1 and f[1] + f[3] <= y1: out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="6" fill="#FDE68A" opacity=".55"/>' % f)
    out.append("</g>")
    vmax = max(e["vol"] for e in d["edges"]) if d["edges"] else 1
    for e in d["edges"]:
        P = edge_path(nodes[e["a"]], nodes[e["b"]], e["side"], (s, tx, ty)); w = (1.2 if s < .11 else 1) + 1.7 * math.sqrt(e["vol"] / vmax)
        col, dash = ("#F97316", ' stroke-dasharray="%.1f %.1f"' % (4, 3)) if e["kind"] == "leak" else (("#475569", ' stroke-dasharray="1.5 3"') if e["kind"] == "skip" else ("#64748B", ""))
        out.append('<path d="M%.1f %.1f C%.1f %.1f %.1f %.1f %.1f %.1f" fill="none" stroke="%s" stroke-width="%.2f" stroke-linecap="round"%s/>' % (*P[0], *P[1], *P[2], *P[3], col, w, dash))
        if dots:
            import math as _m
            pts = [(( (1-t)**3*P[0][0] + 3*(1-t)**2*t*P[1][0] + 3*(1-t)*t**2*P[2][0] + t**3*P[3][0]), ((1-t)**3*P[0][1] + 3*(1-t)**2*t*P[1][1] + 3*(1-t)*t**2*P[2][1] + t**3*P[3][1])) for t in [i/20 for i in range(21)]]
            L = sum(_m.dist(pts[i], pts[i+1]) for i in range(20)); n = max(2, int(L / 22))
            for i in range(n):
                t = (i + .5) / n; x = (1-t)**3*P[0][0] + 3*(1-t)**2*t*P[1][0] + 3*(1-t)*t**2*P[2][0] + t**3*P[3][0]; y = (1-t)**3*P[0][1] + 3*(1-t)**2*t*P[1][1] + 3*(1-t)**2*t*0 + 3*(1-t)*t**2*P[2][1] + t**3*P[3][1] - 3*(1-t)**2*t*0
                out.append('<circle cx="%.1f" cy="%.1f" r="2.7" fill="%s" stroke="#0B1220" stroke-width="1"/>' % (x, y, "#FB923C" if e["kind"] == "leak" else "#34D399"))
        ex, ey = P[3]; ar = max(3.2, w * 1.9)
        out.append('<path d="M%.1f %.1f l%.1f %.1f l0 %.1f z" fill="%s"/>' % (ex, ey, -ar * 1.4, -ar * .7, ar * 1.4, col))
    out.append('<g transform="translate(%.2f %.2f) scale(%.4f)">' % (tx, ty, s))
    for n in d["nodes"]:
        out.append(node_svg(n, s, names))
        if mark and n["id"] == mark:
            out.append('<rect x="%d" y="%d" width="%d" height="%d" rx="16" fill="none" stroke="#F97316" stroke-width="%.1f" stroke-dasharray="14 8"/>' % (n["x"] - 10, n["y"] - 10, n["w"] + 20, n["h"] + 20, max(3, 1.6 / s)))
    out.append("</g>")
    if dim: out.append('<rect width="%d" height="%d" fill="#0B1220" opacity=".5"/>' % (W, H))
    out.append("</svg>")
    return "".join(out)

def title_to_key(t):
    t = t.lower()
    for kw, k in (("fitness standard", "fitness"), ("application", "application"), ("a/b", "subab"), ("subscription", "subab"), ("webinar", "webinar"), ("quiz", "quiz"),
                  ("vsl", "vsl"), ("lead", "lead"), ("ebook", "lead"), ("opt-in", "lead"), ("untitled", "empty"), ("tripwire", "pt")):
        if kw in t: return k
    return "pt"
def stats(key):
    d = F[key]; return len(d["nodes"]), len(d["edges"])

def big():
    nodes, edges = [], []
    for i in range(5):
        dx = (i % 3) * 1500; dy = (i // 3) * 620
        for n in F["pt"]["nodes"]:
            m = dict(n); m["id"] = "%s_%d" % (n["id"], i); m["x"] += dx; m["y"] += dy; nodes.append(m)
        for e in F["pt"]["edges"]:
            m = dict(e); m["a"] = "%s_%d" % (e["a"], i); m["b"] = "%s_%d" % (e["b"], i); edges.append(m)
    return dict(name="Agency master funnel", nodes=nodes, edges=edges, frames=[], notes=[])
F["big"] = big()

def layout(key, W, H, pad=8, cap=.5):
    d = F[key] if isinstance(key, str) else key
    x0, y0, x1, y1 = bbox(d); bw, bh = x1 - x0, y1 - y0
    s = min((W - 2 * pad) / bw, (H - 2 * pad) / bh, cap)
    tx = (W - bw * s) / 2 - x0 * s; ty = (H - bh * s) / 2 - y0 * s
    return s, tx, ty, {n["id"]: ((n["x"] * s + tx), (n["y"] * s + ty), n["w"] * s, n["h"] * s) for n in d["nodes"]}
