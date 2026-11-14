import re
import os
d=os.path.dirname(os.path.abspath(__file__))+'/'
R=lambda f:open(d+f).read()
v3=open(d+'head.html').read()
head=v3[:v3.index('<style>')]
head=re.sub(r'<title>.*?</title>','<title>Layer2Funnels + Aurj · Ecosystem Design v8</title>',head)
p5=R('projects5.js')
for pat in [r"^const PV=.*$",r"^const PNAV=.*$",r"^const assignees=.*$",r"^const taskRow=.*$",r"^SEARCH\.push.*$"]:
  p5=re.sub(pat,'',p5,flags=re.M)
m5=R('more5.js');m5=m5[m5.index('/* ================= LAYER 2 AGENTS'):m5.index('/* ================= PROTOTYPE MAP')]
d5=R('drive5.js').replace('const fRows=','let fRows=')
t5=re.sub(r"^SEARCH\.push.*$",'',R('tasks5.js'),flags=re.M)
import sys;sys.path.insert(0,d);from scope import fm_scoped
v6s,v7s=fm_scoped(R('v6.css'),R('v7.css'))
css=''.join([R('base.css'),R('v4.css'),R('extra.css'),R('v5.css'),v6s,v7s,R('v8.css')])
parts=[R('head.js'),R('logos.js'),R('reuse.js'),R('icons5.js'),R('core5.js'),R('core6.js'),R('pdata5.js'),R('funnels5.js'),R('avatar5.js'),R('office5.js'),R('office6.js'),p5,R('projects6.js'),t5,R('tasks6.js'),R('planner6.js'),R('clients6.js'),R('portal.js'),d5,R('drive6.js'),R('studio5.js'),m5,R('fmp6.js'),R('misc6.js'),R('v7.js'),R('v8.js')]
js='\n'.join(parts)+"\n(function(){if(!location.hash)location.replace('#/launcher');route(true)})();\n"
fav='<link rel="icon" href="'+re.search(r'.l2fIcon.:\s*.(data:[^"\x27]+)',R('logos.js')).group(1)+'">'
html=(head if 'rel="icon"' in head else head.replace('</title>','</title>\n'+fav,1))+'<style>'+css+'</style>\n</head>\n<body>\n<main id="view"></main>\n<div id="toasts" aria-live="polite"></div>\n<div class="scrim" id="scrim" hidden><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgt" id="dlg"></div></div>\n<aside class="drawer" id="drawer" aria-label="Details"></aside>\n<script>\n'+js+'\n</script>\n</body>\n</html>\n'
open(d+'../ecosystem-v8.html','w').write(html);print(len(html))
