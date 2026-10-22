import re
v3=open('/mnt/user-data/outputs/ecosystem-v3.html').read()
js3=v3[v3.index('<script>')+8:v3.index('</script>')]
OD=js3[js3.index('const OD='):js3.index('function rOffice')]
css=open('base.css').read()+open('v4.css').read()+open('extra.css').read()
parts=[open('head.js').read(),open('reuse.js').read(),open('core.js').read(),OD]+[open(f).read() for f in ['projects.js','office.js','clients.js','portal.js','drive.js','studio.js']]
js='\n'.join(parts).replace('class="only-m" style="display:block;margin-bottom:12px"','class="only-mb" style="margin-bottom:12px"')
js+="\n(function(){const t=(location.hash||'').slice(1);nav(VIEWS[t]?t:'launcher',true)})();\n"
head=v3[:v3.index('<style>')]
html=head.replace('Ecosystem Design v3 “Signal”','Ecosystem Design v4 · All apps')+'<style>'+css+'</style>\n</head>\n<body>\n<main id="view"></main>\n<div id="toasts" aria-live="polite"></div>\n<div class="scrim" id="scrim" hidden><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgt" id="dlg"></div></div>\n<aside class="drawer" id="drawer" aria-label="Details"></aside>\n<script>\n'+js+'\n</script>\n</body>\n</html>\n'
open('/mnt/user-data/outputs/ecosystem-v4.html','w').write(html)
print(len(html))
