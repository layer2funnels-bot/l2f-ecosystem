import sys, html
sys.path.insert(0, "/home/claude")
import fmprev as P

CX, CY = 250, 150
def mk(spec, edges, note=""):
    nodes = []
    for t in spec:
        i, kind, key, name, c, r = t[:6]; dashed = len(t) > 6 and t[6]
        n = P.N(i, kind, 60 + c * CX, 40 + r * CY + (19 if kind in ("action", "message", "goal", "logic", "source") and any(x[1] in ("page", "offer") and x[5] == r for x in spec) else 0), key, name)
        if dashed: n["dashed"] = True
        nodes.append(n)
    es = []
    for e in edges:
        a, b = e[0], e[1]; kind = e[2] if len(e) > 2 else "flow"; side = e[3] if len(e) > 3 else "r"
        es.append(P.E(a, b, kind, 100, side))
    return dict(nodes=nodes, edges=es, frames=[], notes=[], note=note)

T = {}
T[1] = ("Lead Squeeze", "Opt-in → Form Completed → Thank You (download) → Delivery Email → Download. Optional dashed core offer and Add to Cart.",
  mk([("o", "page", "optin", "Opt-in", 0, 0), ("f", "action", "", "Form Completed", 1, 0), ("t", "page", "download", "Thank You (download)", 2, 0), ("e", "message", "", "Delivery Email", 3, 0), ("d", "page", "download", "Download", 4, 0),
      ("c", "offer", "checkout", "Core offer", 3, 1, True), ("a", "action", "", "Add to Cart", 4, 1, True)],
     [("o", "f"), ("f", "t"), ("t", "e"), ("e", "d"), ("t", "c", "skip", "b"), ("c", "a", "skip")]))
sv = [("s", "page", "quiz", "Survey Opt-in", 0, 1)] + [x for i in range(3) for x in (("f%d" % i, "action", "", "Form Completed", 1, i), ("t%d" % i, "page", "thankyou", "Thank You", 2, i), ("m%d" % i, "message", "", "Email Result", 3, i))] + [("of", "page", "sales", "Offer Page", 4, 1)]
T[2] = ("Survey", "Survey Opt-in → 3 segments (Form Completed → Thank You → Email Result each) → Offer Page.", mk(sv, [e for i in range(3) for e in (("s", "f%d" % i), ("f%d" % i, "t%d" % i), ("t%d" % i, "m%d" % i), ("m%d" % i, "of"))]))
sm = [("o", "page", "optin", "Opt-in", 0, 0), ("t", "page", "thankyou", "Thank You", 1, 0), ("a", "offer", "checkout", "All-Access order", 2, 0), ("w", "offer", "upsell", "Wait! One-time offer", 3, 0), ("t2", "page", "thankyou", "Thank You", 4, 0)] + [x for i in range(3) for x in (("e%d" % i, "message", "", "Day %d email" % (i + 1), 1, i + 1), ("p%d" % i, "page", "vsl", "Day %d content" % (i + 1), 2, i + 1))]
T[3] = ("Summit", "Opt-in → Thank You with All-Access upgrade and order → Wait one-time offer → Thank You. Day 1–3 content pages are fed by emails.", mk(sm, [("o", "t"), ("t", "a"), ("a", "w"), ("w", "t2")] + [e for i in range(3) for e in (("t", "e%d" % i, "flow", "b"), ("e%d" % i, "p%d" % i))]))
fc = [("o", "page", "optin", "Opt-in", 0, 0), ("u", "offer", "checkout", "Upgrade page", 1, 0), ("w", "offer", "upsell", "One-time offer", 2, 0, True), ("c", "page", "thankyou", "Congratulations", 3, 0), ("g", "message", "", "Community / group", 4, 0)]
fc += [x for i in range(5) for x in (("e%d" % i, "message", "", "Day %d email" % (i + 1), 0, i + 1), ("p%d" % i, "page", "vsl", "Day %d page" % (i + 1), 1, i + 1))] + [("j", "offer", "checkout", "Join Today", 3, 3), ("t2", "page", "thankyou", "Thank You", 4, 3)]
T[4] = ("Free Challenge Funnel", "Opt-in → Upgrade page → one-time offer (dashed) → Congratulations. Community/group, Day 1–5 pages fed by emails, then Join Today order → Thank You.", mk(fc, [("o", "u"), ("u", "w"), ("w", "c"), ("c", "g"), ("g", "e0", "flow", "b")] + [("e%d" % i, "p%d" % i) for i in range(5)] + [("p4", "j"), ("j", "t2")]))
T[5] = ("Book Funnel", "Order page → Wait upsell (downsell dashed) → Next Logical Thing (downsell dashed) → Thank You with offer wall. Second variant adds shipping speed and bump.",
  mk([("o", "offer", "checkout", "Order page", 0, 0), ("w", "offer", "upsell", "Wait! Upsell", 1, 0), ("d1", "offer", "downsell", "Downsell", 1, 1, True), ("n", "offer", "upsell", "Next Logical Thing", 2, 0), ("d2", "offer", "downsell", "Downsell", 2, 1, True), ("t", "page", "thankyou", "Thank You + offer wall", 3, 0)],
     [("o", "w"), ("w", "n"), ("n", "t"), ("w", "d1", "leak", "b"), ("d1", "n"), ("n", "d2", "leak", "b"), ("d2", "t")]))
T[6] = ("Cart Funnel", "Order form (shipping speed, bump) → Add 2 / Add 1 upsell → Next SKU → Next SKU → Thank You with offer wall. Downsells are dashed.",
  mk([("o", "offer", "checkout", "Order form", 0, 0), ("u", "offer", "upsell", "Add 2 / Add 1", 1, 0), ("d1", "offer", "downsell", "Downsell", 1, 1, True), ("s1", "offer", "upsell", "Next SKU", 2, 0), ("d2", "offer", "downsell", "Downsell", 2, 1, True), ("s2", "offer", "upsell", "Next SKU", 3, 0), ("d3", "offer", "downsell", "Downsell", 3, 1, True), ("t", "page", "thankyou", "Thank You + offer wall", 4, 0)],
     [("o", "u"), ("u", "s1"), ("s1", "s2"), ("s2", "t"), ("u", "d1", "leak", "b"), ("d1", "s1"), ("s1", "d2", "leak", "b"), ("d2", "s2"), ("s2", "d3", "leak", "b"), ("d3", "t")]))
pc = [("s", "page", "sales", "Sales page", 0, 0), ("o", "offer", "checkout", "Order form", 1, 0), ("u", "offer", "upsell", "Upgrade (bonus)", 2, 0), ("w", "offer", "upsell", "One-time offer", 3, 0), ("t", "page", "thankyou", "Thank You", 4, 0), ("g", "message", "", "Community", 0, 1)]
pc += [x for i in range(3) for x in (("e%d" % i, "message", "", "Day %d email" % (i + 1), 1, i + 1), ("p%d" % i, "page", "vsl", "Day %d page" % (i + 1), 2, i + 1))] + [("j", "offer", "checkout", "Join Today", 3, 3), ("t2", "page", "thankyou", "Thank You", 4, 3)]
T[7] = ("Paid Challenge Funnel", "Sales page → Order form → Upgrade (bonus) → one-time offer → Thank You. Community, Day 1+ pages fed by emails, then Join Today order → Thank You.", mk(pc, [("s", "o"), ("o", "u"), ("u", "w"), ("w", "t"), ("t", "g", "flow", "b"), ("g", "e0")] + [("e%d" % i, "p%d" % i) for i in range(3)] + [("p2", "j"), ("j", "t2")]))
T[8] = ("Video Sales Letter Funnel", "Video sales page → Order form with bump → Upsell 1 (downsell) → Upsell 2 (downsell) → Thank You.",
  mk([("v", "page", "vsl", "Video sales page", 0, 0), ("o", "offer", "checkout", "Order form + bump", 1, 0), ("u1", "offer", "upsell", "Upsell 1", 2, 0), ("d1", "offer", "downsell", "Downsell", 2, 1, True), ("u2", "offer", "upsell", "Upsell 2", 3, 0), ("d2", "offer", "downsell", "Downsell", 3, 1, True), ("t", "page", "thankyou", "Thank You", 4, 0)],
     [("v", "o"), ("o", "u1"), ("u1", "u2"), ("u2", "t"), ("u1", "d1", "leak", "b"), ("d1", "u2"), ("u2", "d2", "leak", "b"), ("d2", "t")]))
wb = [("o", "page", "optin", "Opt-in", 0, 0), ("f", "action", "", "Form Completed", 1, 0), ("r", "page", "thankyou", "Registration Thank You", 2, 0), ("c", "message", "", "Confirmation Email", 3, 0)]
wb += [("a%d" % i, "message", "", "Attendance Email %d" % (i + 1), i, 1) for i in range(3)] + [("l", "page", "webinar", "Webinar Live", 3, 1), ("wl", "action", "", "Watch Live", 4, 1)]
wb += [("y%d" % i, "message", "", "Replay Email %d" % (i + 1), i, 2) for i in range(3)] + [("rp", "page", "webinar", "Webinar Replay", 3, 2), ("wr", "action", "", "Watch Replay", 4, 2)]
T[9] = ("Webinar Funnel", "Opt-in → Form Completed → Registration Thank You. Confirmation Email → Attendance Emails 1–3 → Webinar Live → Watch Live. Replay Emails 1–3 → Webinar Replay → Watch Replay.", mk(wb, [("o", "f"), ("f", "r"), ("r", "c"), ("c", "a0", "flow", "b"), ("a0", "a1"), ("a1", "a2"), ("a2", "l"), ("l", "wl"), ("l", "y0", "leak", "b"), ("y0", "y1"), ("y1", "y2"), ("y2", "rp"), ("rp", "wr")]))
pl = [("o", "page", "optin", "Opt-in", 0, 0), ("t", "page", "thankyou", "Thank You", 1, 0)] + [("e%d" % i, "message", "", "Email %d" % (i + 1), i, 1) for i in range(5)] + [("p%d" % i, "page", "vsl", "Day %d video" % (i + 1), i + 1, 2) for i in range(4)] + [("j", "offer", "checkout", "Join Today + bump", 5, 2), ("t2", "page", "thankyou", "Thank You", 6, 2)]
T[10] = ("Product Launch Funnel", "Opt-in → Thank You. Day 1–4 video pages fed by 5 emails → Join Today order (bump) → Thank You.", mk(pl, [("o", "t"), ("t", "e0", "flow", "b")] + [("e%d" % i, "e%d" % (i + 1)) for i in range(4)] + [("e%d" % i, "p%d" % i, "flow", "b") for i in range(4)] + [("p3", "j"), ("j", "t2")]))
T[11] = ("Application Funnel", "Offer Page → Application Form → Form Completed → Calendar → Schedule Meeting → Call Scheduled → Deal Proposal → Deal Won. Two Schedule Reminder Emails loop back to the calendar.",
  mk([("o", "page", "sales", "Offer Page", 0, 0), ("a", "page", "application", "Application Form", 1, 0), ("f", "action", "", "Form Completed", 2, 0), ("c", "page", "booking", "Calendar", 3, 0), ("s", "action", "", "Schedule Meeting", 4, 0), ("k", "action", "", "Call Scheduled", 5, 0), ("d", "action", "", "Deal Proposal", 6, 0), ("w", "goal", "", "Deal Won", 7, 0),
      ("r1", "message", "", "Schedule Reminder 1", 4, 1), ("r2", "message", "", "Schedule Reminder 2", 5, 1)],
     [("o", "a"), ("a", "f"), ("f", "c"), ("c", "s"), ("s", "k"), ("k", "d"), ("d", "w"), ("s", "r1", "flow", "b"), ("r1", "r2"), ("r2", "c", "skip", "b")]))
T[12] = ("Webinar Application Funnel", "Save-your-spot Opt-in → Thank You → Web Class → Application page (video, questions, CTA) → What's Next (booking).",
  mk([("o", "page", "optin", "Save-your-spot Opt-in", 0, 0), ("t", "page", "thankyou", "Thank You", 1, 0), ("w", "page", "webinar", "Web Class", 2, 0), ("a", "page", "application", "Application page", 3, 0), ("n", "page", "booking", "What's Next (booking)", 4, 0)], [("o", "t"), ("t", "w"), ("w", "a"), ("a", "n")]))
mc = [("o", "page", "optin", "Opt-in", 0, 0), ("f", "action", "", "Form Completed", 1, 0), ("r", "page", "thankyou", "Registration Thank You", 2, 0)]
mc += [("e%d" % i, "message", "", "Video Email %d" % (i + 1), i, 1) for i in range(3)] + [("p%d" % i, "page", "vsl", "Video page %d" % (i + 1), i + 1, 2) for i in range(3)] + [("w%d" % i, "action", "", "Watch Video %d" % (i + 1), i + 2, 3) for i in range(3)]
T[13] = ("Mini Class Funnel", "Opt-in → Form Completed → Registration Thank You. Video Emails 1–3 → Video pages 1–3 → Watch Video events.", mk(mc, [("o", "f"), ("f", "r"), ("r", "e0", "flow", "b"), ("e0", "e1"), ("e1", "e2")] + [("e%d" % i, "p%d" % i, "flow", "b") for i in range(3)] + [("p%d" % i, "w%d" % i) for i in range(3)]))

for k, (name, desc, d) in T.items(): P.F["t%d" % k] = dict(name=name, **d)
ORDER = [(k, T[k][0], T[k][1], len(T[k][2]["nodes"])) for k in sorted(T)]
if __name__ == "__main__":
    print([(k, n, c) for k, n, _, c in ORDER])
