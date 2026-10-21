# Funnel Mapper Pro - Page / Offer object (single source for canvas, library, object boards)
import re

def R(x, y, w, h, f, rx=1.5, s=None, sw=1, dash=None):
    st = ' stroke="%s" stroke-width="%s"' % (s, sw) if s else ''
    if dash: st += ' stroke-dasharray="%s"' % dash
    return '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"%s/>' % (x, y, w, h, rx, f, st)

INK, MID, LT, IMG, ST, WHT = "#334155", "#AEB7C6", "#D4DAE6", "#D9DFEA", "#CBD5E1", "#fff"
A = "{A}"
def field(x, y, w, h=8): return R(x, y, w, h, WHT, 2, ST)
def line(x, y, w, c=MID, h=2.5): return R(x, y, w, h, c, 1.2)
def hero(x, y, w, h):
    return R(x, y, w, h, IMG, 2) + '<path d="M%s %s L%s %s L%s %s L%s %s L%s %s Z" fill="#C3CBD9"/>' % (
        x, y + h, x + w * .28, y + h * .45, x + w * .5, y + h * .72, x + w * .7, y + h * .3, x + w, y + h) + \
        '<circle cx="%s" cy="%s" r="2.6" fill="%s"/>' % (x + w * .2, y + h * .25, MID)
def play(cx, cy, r=6):
    return '<circle cx="%s" cy="%s" r="%s" fill="#fff" opacity=".92"/><path d="M%s %s l%s %s l-%s %s z" fill="#1F2937"/>' % (
        cx, cy, r, cx - r * .3, cy - r * .5, r * .9, r * .5, r * .9, r * .5)
def arrow(cx, y, up=True):
    if up: return '<path d="M%s %s l8 10 h-5 v8 h-6 v-8 h-5 z" fill="%s"/>' % (cx, y, A)
    return '<path d="M%s %s l8 -10 h-5 v-8 h-6 v8 h-5 z" fill="%s"/>' % (cx, y + 18, A)

P = {
 "optin": R(8,7,50,4,INK) + line(14,14,38) + field(9,24,48,9) + field(9,37,48,9) + R(9,50,48,9,A,2),
 "sales": hero(6,5,54,21) + R(8,30,40,4,INK) + line(8,37,50) + line(8,42,44) + R(8,50,28,9,A,2),
 "longsales": R(8,6,44,4,INK) + ''.join(line(8,14+i*5.5,50 if i%3 else 42) for i in range(6)) + R(8,50,34,9,A,2),
 "vsl": R(6,6,54,31,"#1F2937",2) + play(33,21.5,7) + R(10,42,46,4,INK) + R(10,50,46,9,A,2),
 "webinar": R(6,5,54,25,"#1F2937",2) + play(28,17.5,6) + R(46,8,10,5,"#EF4444",2) + R(6,34,25,10,WHT,2,ST) + R(35,34,25,10,A,2) + R(6,49,54,10,A,2),
 "quiz": R(8,6,50,3,LT) + R(8,6,24,3,A) + R(8,14,44,4,INK) + line(8,20,32) + R(8,27,50,9,A,2,A) +
         '<circle cx="14" cy="31.5" r="2.4" fill="#fff"/>' + R(8,39,50,9,WHT,2,ST) + R(8,51,50,9,WHT,2,ST),
 "application": R(8,6,36,4,INK) + line(8,15,14) + field(8,19,50) + line(8,31,14) + field(8,35,50) + R(8,47,50,6,WHT,2,ST) + R(8,56,22,6,A,2),
 "booking": R(6,5,36,40,WHT,2,ST) + R(6,5,36,8,A,2) + ''.join(R(10+i*6.4,17+j*8,4.6,5,"#C3CBD9",1) for j in range(3) for i in range(5)) +
            R(23.6,25,4.6,5,A,1) + R(46,7,14,7,LT,2) + R(46,17,14,7,A,2) + R(46,27,14,7,LT,2) + R(6,50,54,9,A,2),
 "thankyou": '<circle cx="33" cy="18" r="11" fill="#10B981" opacity=".15"/><circle cx="33" cy="18" r="7.5" fill="none" stroke="#10B981" stroke-width="2"/>' +
             '<path d="M29.5 18l2.7 2.7 5-6" stroke="#10B981" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
             R(14,35,38,4,INK) + line(18,43,30) + line(22,49,22),
 "download": R(18,6,30,24,"#E6EAF1",3,ST) + '<path d="M33 11v11 M28 17l5 5 5-5" stroke="%s" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' % A +
             R(12,35,42,4,INK) + R(10,47,46,10,A,2),
 "blog": R(5,5,56,19,IMG,2) + R(7,28,40,4,INK) + ''.join(line(7,36+i*5,52 if i%2 else 44) for i in range(5)),
 "home": R(4,4,58,7,"#1F2937",2) + '<circle cx="9" cy="7.5" r="2" fill="#10B981"/>' + R(40,6,8,3,"#64748B") + R(50,6,8,3,"#64748B") +
         hero(4,14,58,25) + R(8,43,36,4,INK) + R(8,51,22,8,A,2),
 "members": R(4,4,14,57,"#E6EAF1",2) + '<circle cx="11" cy="12" r="3.6" fill="#C3CBD9"/>' + ''.join(line(7,21+i*6,8,"#C3CBD9") for i in range(3)) +
            R(22,6,19,25,WHT,2,ST) + R(43,6,19,25,WHT,2,ST) + R(22,34,19,25,WHT,2,ST) + R(43,34,19,25,WHT,2,ST) +
            '<path d="M28 15l7 4-7 4z" fill="%s"/>' % A,
 "popup": R(0,0,66,65,"#1F2937",0) + '<rect width="66" height="65" fill="#1F2937" opacity=".4"/>' + R(9,11,48,42,WHT,3) +
          '<path d="M49 16l4 4M53 16l-4 4" stroke="#94A3B8" stroke-width="1.2"/>' + R(14,18,26,3.5,INK) + field(14,27,38,8) + R(14,39,38,9,A,2),
 "generic": R(8,7,50,4,INK) + line(8,16,50) + line(8,21,44) + hero(8,28,50,18) + R(8,50,28,9,A,2),
 # offers
 "checkout": R(5,5,22,31,"#E6EAF1",2,ST) + R(8,8,16,14,"#C7D0DE",2) + line(8,26,16,"#94A3B8") + line(8,31,10) +
             field(31,6,30,7) + field(31,16,30,7) + field(31,26,14,7) + field(47,26,14,7) + R(5,45,56,12,A,2),
 "upsell": arrow(33,5,True) + R(14,29,38,4,INK) + line(18,36,30) + R(6,43,54,10,A,2) + R(6,56,54,6,WHT,2,ST),
 "downsell": R(8,5,50,22,WHT,2,ST) + R(11,8,14,16,"#E6EAF1",2) + R(29,10,26,3,INK) + line(29,16,20) + R(29,21,14,4,A,1.5) +
             '<path d="M33 31v9 M28.5 36l4.5 4.5 4.5-4.5" stroke="%s" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' % A + R(8,47,50,11,A,2),
 "subscription": R(5,6,17,30,WHT,2,ST) + R(24,4,18,34,A,2) + R(44,6,17,30,WHT,2,ST) + line(8,12,11) + line(8,17,8) + line(27,10,12,"#fff") + line(27,15,9,"#fff") + line(47,12,11) + line(47,17,8) +
                '<path d="M25 51a8 8 0 0 1 14-4 M40 44v4h-4 M41 53a8 8 0 0 1-14 4 M26 60v-4h4" stroke="%s" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' % A,
 "bump": R(6,5,54,30,WHT,2,ST) + R(10,9,14,12,"#E6EAF1",2) + R(28,10,26,3,INK) + line(28,16,20) + R(10,26,44,5,A,2) +
         R(6,40,54,19,A,2,A,1,"3 2") + R(11,46,8,8,WHT,1.5,A,1.2) + '<path d="M13 50l2 2 3.4-4" stroke="%s" stroke-width="1.5" fill="none" stroke-linecap="round"/>' % A + R(23,46,28,3,INK) + line(23,52,22),
 "product": R(8,5,50,32,"#E6EAF1",2,ST) + R(14,9,38,18,"#C7D0DE",2) + R(14,30,24,3,INK) + R(8,42,22,5,A,1.5) + R(8,51,50,9,A,2),
 "bundle": R(6,6,25,22,"#E6EAF1",2,ST) + R(35,6,25,22,"#E6EAF1",2,ST) + R(20,31,25,19,"#E6EAF1",2,ST) + R(6,53,54,8,A,2),
 "coupon": '<path d="M5 14h56v10a4 4 0 0 0 0 8v10H5V32a4 4 0 0 0 0-8z" fill="#fff" stroke="%s" stroke-width="1.2"/>' % A + '<path d="M22 14v28" stroke="%s" stroke-width="1.2" stroke-dasharray="2 2"/>' % A +
           R(27,21,28,5,A,1.5) + line(27,30,22) + R(8,50,50,8,WHT,2,ST),
 "plan": ''.join(R(6+i*14.4,34-i*7,11,24+i*7-0,A if i==3 else "#E6EAF1",2,None) for i in range(4)) + R(6,7,30,4,INK) + line(6,14,22) + R(40,6,20,8,A,2),
 "trial": R(8,24,50,30,WHT,2,ST) + R(8,24,50,9,A,2) + R(31,24,4,30,"#fff",0) + '<path d="M33 24c-3-9-12-8-9-3 2 3 9 3 9 3zM33 24c3-9 12-8 9-3-2 3-9 3-9 3z" fill="none" stroke="%s" stroke-width="1.6"/>' % A + R(14,41,38,3,INK) + line(14,47,26) + R(8,57,50,5,A,1.5),
 "cart": ''.join(R(6,6+i*13,16,10,"#E6EAF1",2) + R(25,7+i*13,22,3,INK) + line(25,13+i*13,14) + R(50,8+i*13,10,3,INK) for i in range(3)) + R(6,46,54,1,ST,0) + R(40,50,20,4,INK) + R(6,57,54,6,A,2),
}
PRETTY = {"optin":"Opt-in page","sales":"Sales page","longsales":"Long-form sales","vsl":"VSL page","webinar":"Webinar","quiz":"Quiz page",
          "application":"Application","booking":"Booking","thankyou":"Thank-you page","download":"Download","blog":"Blog post","home":"Home / about",
          "members":"Members area","popup":"Popup","generic":"Page","checkout":"Checkout","upsell":"Upsell","downsell":"Downsell","subscription":"Subscription",
          "bump":"Order bump","product":"Product","bundle":"Bundle","coupon":"Coupon","plan":"Payment plan","trial":"Free trial","cart":"Cart"}
OFFER_KEYS = {"checkout","upsell","downsell","subscription","bump","product","bundle","coupon","plan","trial","cart"}
RULES = [("order bump","bump"),("bump","bump"),("upsell","upsell"),("oto","upsell"),("downsell","downsell"),("subscription","subscription"),
         ("membership","members"),("payment plan","plan"),("free trial","trial"),("coupon","coupon"),("bundle","bundle"),("cart","cart"),
         ("checkout","checkout"),("order","checkout"),("product","product"),("vsl","vsl"),("video sales","vsl"),("webinar","webinar"),
         ("quiz","quiz"),("survey","quiz"),("application","application"),("booking","booking"),("calendar","booking"),("thank","thankyou"),
         ("download","download"),("delivery","download"),("members","members"),("blog","blog"),("home","home"),("about","home"),
         ("popup","popup"),("long-form","longsales"),("sales","sales"),("landing","sales"),("opt-in","optin"),("optin","optin"),("squeeze","optin")]
def key_for(text):
    t = (text or "").lower()
    for kw, k in RULES:
        if kw in t: return k
    return "generic"

def preview_svg(key, acc, w=66, h=65):
    body = P.get(key, P["generic"]).replace(A, acc)
    return ('<svg width="%s" height="%s" viewBox="0 0 66 65" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'
            '<rect width="66" height="65" fill="#F4F6FA"/>%s</svg>') % (w, h, body)

PAGE_ACC, OFFER_ACC = "#8B5CF6", "#F97316"
PAGE_TINT, OFFER_TINT = "#A78BFA", "#FB923C"
def kind_of(key): return "offer" if key in OFFER_KEYS else "page"

def mini_window(key, w=46):
    """library tile thumbnail - same window as the canvas object, scaled"""
    acc = OFFER_ACC if kind_of(key) == "offer" else PAGE_ACC
    sh = round(65 * w / 66)
    return ('<span class="mw" style="width:%dpx"><span class="mwc"><i></i><i></i><i></i></span>%s</span>' % (w + 2, preview_svg(key, acc, w, sh)))

CSS = """
/* ===== Page / Offer object (funnel-native) ===== */
.node.fam-page,.node.fam-offer{height:112px;padding:0;overflow:visible}
.pgo{display:flex;flex-direction:column;height:100%;border-radius:inherit;overflow:hidden}
.pgo-top{display:flex;gap:10px;flex:1;min-height:0;padding:7px 10px 0 8px}
.pgo-win{width:68px;height:76px;flex:none;border-radius:5px;overflow:hidden;background:#F4F6FA;border:1px solid #475569;box-shadow:0 2px 6px rgba(0,0,0,.4);box-sizing:border-box}
.pgo-chrome{height:9px;background:#E3E8F0;display:flex;align-items:center;gap:2px;padding:0 4px;border-bottom:1px solid #D4DAE6;box-sizing:border-box}
.pgo-chrome i{width:3px;height:3px;border-radius:50%;display:block;background:#AEB7C6}
.pgo-chrome i:nth-child(1){background:#F87171}.pgo-chrome i:nth-child(2){background:#FBBF24}.pgo-chrome i:nth-child(3){background:#34D399}
.pgo-win svg{display:block}
.pgo-info{min-width:0;flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:1px 0 5px}
.pgo-title{font-size:13px;font-weight:600;color:#F1F5F9;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.pgo-m{display:flex;flex-direction:column;gap:1px;min-width:0}
.pgo-l{font-size:10.5px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pgo-l strong{color:#E2E8F0;font-weight:600}
.pgo-r{font-family:'Bricolage Grotesque',sans-serif;font-size:15px;font-weight:600;color:#F1F5F9;line-height:1.15;letter-spacing:-.01em}
.pgo-cap{height:22px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 8px;background:#0B1220;border-top:1px solid #1E293B}
.pgo-ty{display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;white-space:nowrap;min-width:0}
.pgo-ic{width:14px;height:14px;border-radius:4px;display:grid;place-items:center;color:#fff;flex:none}
.pgo-ic svg{width:9px;height:9px}
.node .pgo-cap .st{position:static;flex:none}
.node.fam-page .port,.node.fam-offer .port{width:16px;height:16px;border:2px solid #0B1220;display:grid;place-items:center;font-size:8.5px;font-weight:800;line-height:1;color:#03241A;z-index:3;box-sizing:border-box}
.node.fam-page .port.pr,.node.fam-offer .port.pr{right:-9px;left:auto;top:50%;margin-top:-8px;background:#10B981}
.node.fam-page .port.pr::after,.node.fam-offer .port.pr::after{content:"Y"}
.node.fam-page .port.pb,.node.fam-offer .port.pb{left:50%;margin-left:-8px;bottom:-9px;top:auto;background:#F97316}
.node.fam-page .port.pb::after,.node.fam-offer .port.pb::after{content:"N"}
.node.fam-page .port.pl,.node.fam-offer .port.pl{left:-7px;top:50%;margin-top:-6px;width:12px;height:12px;background:#0B1220;border:2px solid #64748B}
"""

def obj_inner(title, label, left, right, key, status_html="", glyph_svg="", win=None):
    acc = OFFER_ACC if kind_of(key) == "offer" else PAGE_ACC
    tint = OFFER_TINT if kind_of(key) == "offer" else PAGE_TINT
    g = re.sub(r'width="\d+" height="\d+"', 'width="9" height="9"', glyph_svg, count=1)
    r = '<div class="pgo-r">%s</div>' % right if right else ''
    return ('<div class="pgo"><div class="pgo-top"><div class="pgo-win"><div class="pgo-chrome"><i></i><i></i><i></i></div>%s</div>'
            '<div class="pgo-info"><div class="pgo-title">%s</div><div class="pgo-m"><span class="pgo-l">%s</span>%s</div></div></div>'
            '<div class="pgo-cap"><span class="pgo-ty" style="color:%s"><span class="pgo-ic" style="background:%s">%s</span>%s</span>%s</div></div>'
            % (win if win else preview_svg(key, acc, 66, 65), title, left, r, tint, tint, g, label, status_html))
