import re
def _pref(s,fm=None):
  s=s.strip()
  if not s or s.startswith('.fmpx') or s.startswith('.shell.fmpx'):return s
  if fm is not None:
    m=re.match(r'\.([\w-]+)',s)
    if not m or m.group(1) not in fm:return s
  return '.fmpx '+s
def scope_rules(css,fm=None):
  return re.sub(r'([^{}]+)\{([^{}]*)\}',lambda m:','.join(_pref(x,fm) for x in m.group(1).split(','))+'{'+m.group(2)+'}',css)
def scope_media(css,fm):
  # rules inside @media blocks: scope only selectors that start with an FM class
  out=[];i=0
  for m in re.finditer(r'@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)\s*\}',css):
    out.append(css[i:m.start(1)]);out.append(scope_rules(m.group(1),fm));i=m.end(1)
  out.append(css[i:]);return ''.join(out)
def fm_scoped(v6,v7):
  L=v6.split('\n');a=next(i for i,l in enumerate(L) if 'FMP v6: its own dark identity' in l);b=next(i for i,l in enumerate(L) if 'Whiteboard full page' in l)
  sec='\n'.join(L[a+1:b])
  fm=set(re.findall(r'\.([\w-]+)',re.sub(r'\{[^}]*\}','{}',sec)))-{'fmpx','shell','ed','on','new','live','sm','big','six','three','no','d','grow'}
  v6='\n'.join(L[:a+1]+[scope_rules(sec)]+L[b:])
  L=v7.split('\n');a=next(i for i,l in enumerate(L) if 'Funnel Mapper: one step larger' in l);b=next(i for i,l in enumerate(L) if i>a and l.startswith('/*'))
  v7='\n'.join(L[:a+1]+[scope_rules('\n'.join(L[a+1:b]))]+L[b:])
  return scope_media(v6,fm),scope_media(v7,fm)
