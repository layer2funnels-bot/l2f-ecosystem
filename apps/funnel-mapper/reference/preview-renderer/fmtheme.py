import re
# dark -> light, by role. Brand/category colours (Emerald, blue, violet, orange, teal, lime) are unchanged.
MAP = {
 # surfaces
 "#070B14":"#E9EEF5","#0B1220":"#F4F6FA","#0F172A":"#FFFFFF","#111827":"#FFFFFF",
 "#111A2B":"#F1F5F9","#131B2B":"#F1F5F9","#141D2E":"#EEF2F7","#162033":"#EEF2F7","#16213A":"#E6EDF7","#172133":"#EEF2F7","#1A2437":"#EEF2F7","#1F2937":"#EEF2F7",
 "#1E293B":"#E5EAF1","#273449":"#D3DBE6","#2A3648":"#D3DBE6","#334155":"#C4CEDB","#475569":"#7B8AA0",
 # text
 "#F8FAFC":"#0B1220","#F1F5F9":"#0F172A","#E2E8F0":"#1E293B","#CBD5E1":"#334155","#94A3B8":"#55657B","#64748B":"#5B6B82",
 # accent text that must stay readable on white
 "#6EE7B7":"#047857","#34D399":"#059669","#4ADE80":"#15803D","#FDBA74":"#C2410C","#FCD34D":"#B45309","#FCA5A5":"#B91C1C","#F87171":"#DC2626",
 # tinted backgrounds
"#064E3B":"#047857","#431407":"#FFEDD5","#3B2A06":"#FEF3C7","#422006":"#713F12",
}
HEX = re.compile(r'#[0-9A-Fa-f]{6}\b')
def _hex(m): return MAP.get(m.group(0).upper(), m.group(0))
def to_light(html):
    parts = re.split(r'(data:image/[^"\')\s]+)', html)          # never touch embedded images
    out = []
    for p in parts:
        if p.startswith("data:image/"): out.append(p); continue
        p = HEX.sub(_hex, p)
        p = re.sub(r'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,', 'rgba(@@DK@@,', p)                    # light-on-dark highlights become dark tints
        p = re.sub(r'rgba\(\s*(?:11\s*,\s*18\s*,\s*32|17\s*,\s*24\s*,\s*39|15\s*,\s*23\s*,\s*42)\s*,', 'rgba(255,255,255,', p)   # dark translucent surfaces become white
        p = p.replace('rgba(@@DK@@,', 'rgba(15,23,42,')
        p = re.sub(r'rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*\.\d+\)', 'rgba(15,23,42,.14)', p)
        out.append(p)
    return "".join(out)
