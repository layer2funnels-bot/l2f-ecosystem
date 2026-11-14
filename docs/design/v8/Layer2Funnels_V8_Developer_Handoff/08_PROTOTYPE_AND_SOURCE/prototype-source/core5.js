
/* ================= v5 CORE ================= */
const PEOPLE={TR:['Tabish Riaz','#FFC633','Owner'],AR:['Ayesha Raza','#A898FF','Designer'],BK:['Bilal Khan','#5FDCCB','Developer'],SN:['Sana Noor','#FF9CC8','Copywriter'],UM:['Usman Malik','#D3F38A','Strategist'],AH:['Ahmad Hassan','#9CC8FF','Ads specialist']};
const av=(k,s)=>`<span class="avatar" style="--av:${PEOPLE[k][1]}${s?`;width:${s}px;height:${s}px;font-size:${Math.round(s*.34)}px`:''}" title="${PEOPLE[k][0]}">${k}</span>`;
const avs=ks=>`<span class="av-stack">${ks.map(k=>av(k)).join('')}</span>`;
const HOME={office:'office/home',projects:'projects/home',tasks:'tasks/today',clients:'clients/list',drive:'drive/home',planner:'planner/home',portal:'portal/home',forms:'forms/list',ladder:'ladder/list',whiteboard:'whiteboard/home',social:'social/calendar',fmp:'fmp/home',agents:'agents/home'};
const appState=id=>id==='portal'?'locked':(id==='fmp'&&org()==='aurj')?'notset':'ok';
const DEMO={time:'auto',wx:'auto'};
let RT={a:'launcher',p:[]},CURNAV=[],UNREAD=6;
const VIEWS={},AFTER={},ACT={},INPUT={},INPUTC={},KEY={};
const back=(p,l)=>`<a class="btn quiet sm backlink" href="#/${p}">${ic('right',16).replace('<svg','<svg style="transform:scaleX(-1)"')}${l}</a>`;
const head=(title,lede,acts='')=>`<div class="pagehead"><div><h1 class="h1">${title}</h1>${lede?`<p class="lede">${lede}</p>`:''}</div>${acts?`<div class="acts">${acts}</div>`:''}</div>`;
const tabs=(list,cur,pre)=>`<div class="tabs" role="tablist">${list.map(([k,l,n])=>`<a role="tab" href="#/${pre}${k}" aria-selected="${k===cur}">${l}${n!=null?`<span class="n">${n}</span>`:''}</a>`).join('')}</div>`;
const vsw=(list,cur,act)=>`<div class="vsw" role="group">${list.map(([k,l,i])=>`<button aria-pressed="${k===cur}" data-act="${act}:${k}">${i?ic(i,16):''}${l}</button>`).join('')}</div>`;
const emptyS=(icon,t,p,btn='')=>`<div class="empty">${icon}<h3>${t}</h3><p>${p}</p>${btn}</div>`;
const sp=(i,t)=>`<span class="pill ${t||''}">${i}</span>`;
const pv=t=>`<span class="pv" title="Shown in the prototype. Needs the backend.">${t||'Prototype data'}</span>`;

/* ---------- rail (replaces the global header) ---------- */
const PINNED=['office','projects','tasks','clients','drive','planner'];
function orgMenu(){return `<div class="menu railmenu" hidden role="menu"><p class="over">Organizations</p>${Object.keys(ORG).map(o=>`<button role="menuitemradio" aria-checked="${o===org()}" data-act="org:${o}">${mark(o,36)}<span><b>${ORG[o].name}</b><small>${ORG[o].lvl} · ${o==='l2f'?'funnel agency':'education'}</small></span>${o===org()?ic('check',18,'chk',2.4):''}</button>`).join('')}<p class="hint" style="padding:6px 10px 4px">Switching keeps you on this page. The two organizations never share data.</p></div>`}
function appMenu(id){return `<div class="appmenu" hidden role="menu"><a class="home" href="#/launcher"><span class="mini">${ic('grid',18)}</span>Launcher<kbd style="margin-left:auto">G L</kbd></a><div class="grid">${APPS.map(a=>`<a href="#/${HOME[a.id]}" data-app="${a.id}" aria-current="${a.id===id}" class="${appState(a.id)!=='ok'?'dim':''}">${plate(a,38)}${a.name}</a>`).join('')}</div><p class="hint" style="padding:8px 4px 0">Ctrl-click or middle-click opens an app in a new tab.</p></div>`}
function rail(id){return `<nav class="rail" aria-label="Ecosystem"><div class="r-wrap"><button class="r-org" data-act="railmenu" aria-haspopup="true" aria-expanded="false" title="${oname()} · switch organization">${mark(org(),34)}</button>${orgMenu()}</div>
<div class="r-wrap"><button class="r-btn" data-act="railmenu" aria-haspopup="true" aria-expanded="false" title="All apps">${ic('grid',20)}</button>${appMenu(id)}</div><span class="r-div"></span>
<div class="r-apps">${PINNED.map(a=>`<a class="r-app" href="#/${HOME[a]}" ${a===id?'aria-current="page"':''} title="${app(a).name}">${plate(app(a),30)}</a>`).join('')}${PINNED.includes(id)||!app(id)?'':`<a class="r-app" aria-current="page" href="#/${HOME[id]}" title="${app(id).name}">${plate(app(id),30)}</a>`}</div>
<span class="r-sp"></span><button class="r-btn" data-act="usearch" title="Search everything (Ctrl K)" aria-label="Search everything">${ic('search',20)}</button>
<button class="r-btn" data-act="inbox" title="Notifications" aria-label="Notifications, ${UNREAD} unread">${ic('bell',20)}${UNREAD?`<i class="r-badge">${UNREAD}</i>`:''}</button>
<div class="r-wrap"><button class="r-me" data-act="railmenu" aria-haspopup="true" aria-expanded="false" title="Your profile">${photo(36)}</button>${profileMenu()}</div></nav>`}
const photo=s=>`<span class="photo" style="width:${s}px;height:${s}px"><svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill="#FFC633"/><circle cx="20" cy="16" r="7" fill="#C68A5E"/><path d="M8 40c1-8 6-12 12-12s11 4 12 12z" fill="#16171B"/><path d="M13 14c0-6 4-8 7-8s7 2 7 8c-2-3-4-4-7-4s-5 1-7 4z" fill="#1D1A18"/></svg></span>`;
function profileMenu(){return `<div class="menu railmenu up" hidden role="menu"><div style="display:flex;gap:12px;align-items:center;padding:8px 10px 12px">${photo(48)}<div><b>Tabish Riaz</b><small class="muted" style="display:block">tabish@layer2funnels.com</small></div></div><a class="menu-link" href="#/profile">${ic('user',18)}My profile</a><div style="padding:6px 10px"><p class="over" style="margin-bottom:6px">Appearance</p>${['light','dark'].map(t=>`<button class="chip" style="min-height:36px" aria-pressed="${H.dataset.theme===t}" data-act="demo:theme=${t}">${ic(t==='light'?'sun':'moon',16)}${t[0].toUpperCase()+t.slice(1)}</button>`).join(' ')}</div><div class="tg-row" style="padding:0 10px">Weather on the Launcher<button class="toggle" role="switch" aria-checked="${DEMO.wx!=='off'}" data-act="wxtoggle" aria-label="Weather"></button></div><a class="menu-link" href="#/states">${ic('info',18)}Keyboard shortcuts <kbd style="margin-left:auto">?</kbd></a><a class="menu-link" href="#/auth">${ic('logout',18)}Sign out</a></div>`}
function bar(id,crumbs,o={}){return `<header class="bar"><button class="iconbtn only-m" data-act="msheet" aria-label="Apps and account">${mark(org(),26)}</button>${o.toggleSide===false?'':`<button class="iconbtn hide-m" data-act="sidetoggle" aria-label="Collapse sidebar" title="Collapse sidebar">${ic('layers',18)}</button>`}<nav class="crumb" aria-label="Breadcrumb">${crumbs.map((c,i)=>c[1]?`<a href="#/${c[1]}">${c[0]}</a>`:`<b>${c[0]}</b>`).join('<span class="sep">/</span>')}</nav><span class="grow"></span>${o.search?`<label class="inp appsearch">${ic('search',16)}<input placeholder="${o.search}" aria-label="${o.search}" data-filter="${o.filter||''}"><kbd>/</kbd></label>`:''}${o.barRight||''}<button class="iconbtn only-m" data-act="usearch" aria-label="Search everything">${ic('search',20)}</button></header>`}
const isOn=(n,cur)=>n[0]===cur||(n[4]||[]).some(k=>k[0]===cur);
function navItem(n,cur){const[p,l,i,c,kids]=n;return `<div class="grp"><a href="#/${p}" ${p===cur?'aria-current="page"':''}>${ic(i)}<span>${l}</span>${c?`<span class="count">${c}</span>`:''}</a>${kids&&isOn(n,cur)?`<div class="sub">${kids.map(k=>`<a href="#/${k[0]}" ${cur===k[0]?'aria-current="page"':''}>${ic(k[2],18)}<span>${k[1]}</span></a>`).join('')}</div>`:''}</div>`}
function bbar(nav,cur){const more=nav.length>5,items=more?nav.slice(0,4):nav;return `<nav class="bbar" aria-label="Sections">${items.map(n=>`<a href="#/${n[0]}" ${isOn(n,cur)?'aria-current="page"':''}><span class="pillic">${ic(n[2],22)}</span>${n[5]||n[1]}</a>`).join('')}${more?`<button data-act="more" ${nav.slice(4).some(n=>isOn(n,cur))?'aria-current="page"':''}><span class="pillic">${ic('more',22)}</span>More</button>`:''}</nav>`}
function shell(id,o){const a=app(id);CURNAV=o.nav;return `<div class="shell ${o.flushApp?'flushapp':''}" data-app="${id}">${rail(id)}<aside class="side" aria-label="${a.name} menu"><div class="side-top">${plate(a,30)}<b>${a.name}</b>${o.sideAction||''}</div>${o.sideTop||''}<nav class="nav" aria-label="${a.name}">${o.nav.map(n=>navItem(n,o.cur)).join('')}</nav>${o.sideMid||''}</aside>
<div class="main">${o.noBar?'':bar(id,o.crumbs||[[a.name]],o)}<div class="content ${o.wide?'wide':''} ${o.flush?'flush':''}">${o.body}</div></div></div>${bbar(o.nav,o.cur)}`}
/* focused layout for editors and canvases: one 48px bar, no rail */
function focusBar(id,{title,sub,back:bk,right=''}){return `<header class="fbar5"><a class="iconbtn" href="#/${bk}" aria-label="Back">${ic('right',20).replace('<svg','<svg style="transform:scaleX(-1)"')}</a><div class="r-wrap"><button class="iconbtn" data-act="railmenu" aria-label="Apps">${ic('grid',18)}</button>${appMenu(id)}</div>${plate(app(id),26)}<div class="grow" style="min-width:0">${title}${sub?`<small>${sub}</small>`:''}</div>${right}</header>`}
function openDrawer(html,cls=''){const d=$('#drawer');d.className='drawer '+cls;d.innerHTML=html;d.classList.add('open');setTimeout(()=>d.querySelector('button,input')?.focus(),60)}
function closeMenus(){$$('.menu,.appmenu').forEach(m=>m.hidden=true);$$('[data-act="railmenu"],[data-act="orgmenu"]').forEach(b=>b.setAttribute('aria-expanded','false'));$('.ctx')?.remove()}
function confetti(){if(reduce)return;const c=document.createElement('div');c.className='confetti';const cols=['#FFC633','#FF7A45','#7A5CF2','#2B63F6','#13A592','#E9488F'];c.innerHTML=Array.from({length:90},()=>`<i style="left:${Math.random()*100}%;background:${cols[Math.random()*6|0]};--x:${(Math.random()-.5)*300}px;--r:${Math.random()*900}deg;animation-delay:${Math.random()*.4}s"></i>`).join('');document.body.append(c);setTimeout(()=>c.remove(),2400)}
/* context menu (right-click) */
function ctxMenu(e,items){e.preventDefault();$('.ctx')?.remove();const m=document.createElement('div');m.className='ctx';m.setAttribute('role','menu');m.innerHTML=items.map(it=>it==='-'?'<hr>':`<button role="menuitem" data-act="${it[2]}" class="${it[3]||''}">${ic(it[0],16)}${it[1]}${it[4]?`<kbd>${it[4]}</kbd>`:''}</button>`).join('');document.body.append(m);const r=m.getBoundingClientRect();m.style.left=Math.min(e.clientX,innerWidth-r.width-8)+'px';m.style.top=Math.min(e.clientY,innerHeight-r.height-8)+'px';m.querySelector('button')?.focus()}

/* ---------- router: real links, Ctrl-click opens a new tab ---------- */
function nav(path,noVT){if(location.hash!=='#/'+path){location.hash='/'+path;return}route(noVT)}
function route(noVT){const path=(location.hash||'#/launcher').replace(/^#\/?/,'')||'launcher';const [a,...p]=path.split('/');const run=()=>{RT={a:VIEWS[a]?a:'launcher',p};draw();scrollTo(0,0)};closeMenus();$('#drawer')?.classList.remove('open');if(document.startViewTransition&&!reduce&&!noVT)document.startViewTransition(run);else run()}
addEventListener('hashchange',()=>route());
function draw(){const f=VIEWS[RT.a]||VIEWS.launcher;$('#view').innerHTML=f(RT.p);AFTER[RT.a]?.(RT.p);rDemo()}
function openApp(id,el){const a=app(id),st=appState(id);closeMenus();
if(st==='locked')return dlg({icon:plate(a,56),title:'Client Portal is locked for clients',body:'Clients can’t sign in until the security tests pass. You can preview exactly what a client sees. Only an owner can switch it on.',acts:[['Turn on (unavailable)','toast:Available after the security tests pass.','quiet'],['Preview client view','nav:portal/home','primary']]});
if(st==='notset')return dlg({icon:plate(a,56),title:'Funnel Mapper isn’t set up in Aurj',body:'It’s on for Layer2Funnels only. Switch there to use it, or ask an admin to set it up here.',acts:[['Ask an admin','toast:Saved as a request. Sending needs the backend.','quiet'],['Switch to Layer2Funnels','org:l2f','primary']]});
const p=el?.querySelector?.('.plate');if(p&&RT.a==='launcher'&&!reduce)zoom(p,a,()=>nav(HOME[id],true));else nav(HOME[id])}
function setOrg(o){if(o===org())return;H.dataset.org=o;draw();toast(`Switched to ${ORG[o].name}. You stayed on the same page.`,'ok')}

/* ---------- universal search (Ctrl K) ---------- */
const US={scope:'all'};
const fz=(s,q)=>{s=String(s).toLowerCase();if(!q)return 1;const i=s.indexOf(q);if(i>=0)return 100-i;let j=0;for(const ch of s)if(ch===q[j])j++;if(j===q.length)return 40;let m=0;for(let k=0;k<q.length-1;k++)if(s.includes(q.slice(k,k+2)))m++;return m>=Math.max(2,q.length-3)?20:0};
const hl=(s,q)=>{const i=q?String(s).toLowerCase().indexOf(q):-1;return i<0?esc(s):esc(s.slice(0,i))+'<mark>'+esc(s.slice(i,i+q.length))+'</mark>'+esc(s.slice(i+q.length))};
const SEARCH=[];/* each app pushes: ()=>[{app,t,s,href,arch}] */
function usOpen(q=''){closeCmdk();const here=app(RT.a)?RT.a:null;US.scope=here&&US.keep!==RT.a?here:US.scope;US.keep=RT.a;const d=document.createElement('div');d.className='cmdk-scrim';d.innerHTML=`<div class="cmdk" role="dialog" aria-label="Search"><div class="cmdk-in">${ic('search',22)}<input id="usq" placeholder="Search ${US.scope==='all'?'everything you can open':app(US.scope).name}… try “quiz”, “harry”, “@me overdue”, “is:archived”" value="${esc(q)}" autocomplete="off"><kbd>Esc</kbd></div><div class="cmdk-chips"><button aria-pressed="${US.scope==='all'}" data-act="usscope:all">${ic('globe',14)}Everywhere</button>${here&&here!=='launcher'?`<button aria-pressed="${US.scope===here}" data-act="usscope:${here}">In ${app(here).name}</button>`:''}${['projects','tasks','clients','drive','office','planner'].filter(x=>x!==here).map(x=>`<button aria-pressed="${US.scope===x}" data-act="usscope:${x}">${app(x).name}</button>`).join('')}</div><div class="cmdk-res" id="usr"></div><div class="cmdk-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> new tab</span><span>Only results you’re allowed to open.</span></div></div>`;document.body.append(d);usRun();setTimeout(()=>$('#usq').focus(),20)}
function closeCmdk(){$('.cmdk-scrim')?.remove()}
function usRun(){const raw=($('#usq')?.value||'').toLowerCase();const arch=/is:archived/.test(raw),me=/@me/.test(raw),od=/overdue/.test(raw);const q=raw.replace(/is:archived|@me|overdue/g,'').trim();
let items=SEARCH.flatMap(f=>f()).filter(r=>(US.scope==='all'||r.app===US.scope)&&(arch?r.arch:!r.arch||q.length>2)&&(!me||r.me)&&(!od||r.od));
items=items.map(r=>({...r,sc:Math.max(fz(r.t,q),fz(r.s||'',q)*.6)})).filter(r=>r.sc>0).sort((a,b)=>b.sc-a.sc);
const R=$('#usr');if(!R)return;
if(!q&&!arch&&!me&&!od){R.innerHTML=`<h5>Quick actions</h5>${[['plus','New task','nav:tasks/today','tasks'],['doc','New document','nav:drive/edit/doc/new','drive'],['projects','New project','nav:projects/home','projects'],['clients','New client','nav:clients/pipeline','clients'],['mic','Start meeting notes','nav:agents/meeting/new','agents']].map(([i,l,a,ap])=>`<button data-act="${a}" data-close>${plate(app(ap),28)}<span class="main"><b>${l}</b></span></button>`).join('')}<h5>Jump back in</h5>${items.slice(0,5).map(usRow('')).join('')}`;R.querySelector('button')?.setAttribute('aria-selected','true');return}
const by={};items.slice(0,40).forEach(r=>(by[r.app]=by[r.app]||[]).push(r));
R.innerHTML=Object.keys(by).length?Object.entries(by).map(([a,L])=>`<h5>${app(a).name}</h5>${L.slice(0,US.scope==='all'?4:12).map(usRow(q)).join('')}`).join(''):`<div class="empty" style="padding:30px">${ic('search',28)}<h3 style="font-size:18px">No matches for “${esc(q)}”</h3><p>Try fewer words, or search everywhere.</p></div>`;
R.insertAdjacentHTML('beforeend',`<div class="ai-row">${ic('agents',20)}<span style="flex:1">${q?`Ask the assistant about “${esc(q)}”`:'Ask the assistant'}</span><span class="pill">Later, with approval</span></div>`);R.querySelector('button')?.setAttribute('aria-selected','true')}
const usRow=q=>r=>`<button data-href="${r.href}">${plate(app(r.app),28)}<span class="main"><b>${hl(r.t,q)}</b><small>${esc(r.s||'')}</small></span>${r.arch?'<span class="pill">'+ic('archive',13)+'Archived</span>':''}</button>`;
INPUT.usq=()=>usRun();

/* ---------- notifications (one inbox for every app) ---------- */
const NOTE=[['projects','SN','mentioned you in “Quiz questions v2”','10 min ago','mention',1,'projects/p/p1/list'],['clients','UM','Harry Kaye replied to “Customer avatar: Clara v2”','25 min ago','approval',1,'clients/c/hk/requests'],['tasks','BK','assigned you “Check GHL calendar sync”','1 h ago','assigned',1,'tasks/list/team'],['planner','TR','Objective “40 booked calls” update is due today','2 h ago','update',1,'planner/plan/p1/builder'],['drive','AR','shared “Q4 content calendar” with you','3 h ago','share',1,'drive/edit/sheet/cal'],['social','SN','“Case study: 41 calls” is waiting for your approval','Yesterday','approval',1,'social/approvals'],['projects','UM','finished “Customer avatar draft” you follow','Yesterday','update',0,'projects/p/p1/board']];
const NF={app:'all',kind:'all'};
function inbox(){const L=NOTE.filter(n=>(NF.app==='all'||n[0]===NF.app)&&(NF.kind==='all'||n[4]===NF.kind));openDrawer(`<div class="drw-h"><b class="grow" style="font:700 22px/1 var(--font-d)">Notifications</b><button class="btn quiet sm" data-act="inboxread">Mark all read</button><button class="iconbtn" data-act="drawerx" aria-label="Close">${ic('x')}</button></div>
<div class="vsw" style="margin-bottom:10px">${[['all','All'],['mention','Mentions'],['assigned','Assigned'],['approval','Approvals'],['update','Updates']].map(([k,l])=>`<button aria-pressed="${NF.kind===k}" data-act="nfk:${k}">${l}</button>`).join('')}</div>
<div class="chiprow">${['all',...new Set(NOTE.map(n=>n[0]))].map(a=>`<button class="chip ${NF.app===a?'on':''}" data-act="nfa:${a}">${a==='all'?'All apps':plate(app(a),18)+app(a).name}</button>`).join('')}</div>
<div class="nlist">${L.map((n,i)=>`<a class="nitem ${n[5]?'unread':''}" href="#/${n[6]}" data-act="inboxgo">${av(n[1])}<span class="main"><span><b>${PEOPLE[n[1]][0]}</b> ${n[2]}</span><small>${plate(app(n[0]),16)} ${app(n[0]).name} · ${n[3]}</small></span>${n[5]?'<i class="dot"></i>':''}</a>`).join('')||'<p class="hint" style="padding:20px">Nothing here.</p>'}</div>
<a class="menu-link" href="#/office/settings/notifications" style="margin-top:12px">${ic('gear',16)}Notification settings: choose apps and email digests</a>`,'wide')}

/* ---------- demo controls ---------- */
function rDemo(){let f=$('#demofab');if(!f){f=document.createElement('div');f.id='demofab';document.body.append(f)}const o=(k,v,l,cur)=>`<button data-act="demo:${k}=${v}" aria-pressed="${cur===v}">${l}</button>`;
f.innerHTML=`<button class="demo-fab" data-act="demotoggle" aria-expanded="${!!window.demoOpen}">${ic('sliders',18)}<span>Prototype</span></button>${window.demoOpen?`<div class="demo" role="dialog" aria-label="Prototype controls"><h4>Map</h4><div class="opts"><a class="opts-a" href="#/map">Every app and page</a></div><h4>Screens</h4><div class="opts">${[['launcher','Launcher'],['auth','Sign in'],['states','States'],['system','Design system']].map(([k,l])=>`<a class="opts-a" href="#/${k}" aria-pressed="${RT.a===k}">${l}</a>`).join('')}</div>
<h4>Organization</h4><div class="opts">${o('org','l2f','Layer2Funnels',org())}${o('org','aurj','Aurj',org())}</div><h4>Theme</h4><div class="opts">${o('theme','light','Light',H.dataset.theme)}${o('theme','dark','Dark',H.dataset.theme)}</div>
<h4>Launcher time</h4><div class="opts">${['auto','morning','afternoon','evening','night'].map(v=>o('time',v,v[0].toUpperCase()+v.slice(1),DEMO.time)).join('')}</div><h4>Launcher weather</h4><div class="opts">${[['auto','Auto'],['clear','Clear'],['cloud','Cloudy'],['rain','Rain'],['hot','Hot'],['cold','Cold'],['off','Off']].map(([v,l])=>o('wx',v,l,DEMO.wx)).join('')}</div></div>`:''}`}

/* ---------- launcher (kept, improved) ---------- */
const tod=()=>{if(DEMO.time!=='auto')return DEMO.time;const h=new Date().getHours();return h<5?'night':h<12?'morning':h<17?'afternoon':h<21?'evening':'night'};
const WX={clear:['Clear','sun',24],cloud:['Cloudy','cloud',19],rain:['Light rain','rain',16],hot:['Very hot','heat',41],cold:['Cold','snow',3],off:['','',0]};
const wxNow=()=>DEMO.wx==='auto'?'cloud':DEMO.wx;
VIEWS.launcher=()=>{const t=tod(),w=wxNow(),W=WX[w];const g={morning:'Good morning',afternoon:'Good afternoon',evening:'Good evening',night:'Working late'}[t];
const tile=(a,i)=>{const st=appState(a.id);const pill={locked:`<span class="pill">${ic('lock',12,'',2.4)}Locked</span>`,notset:'<span class="pill">Not here</span>'}[st]||(a.id==='agents'?'<span class="pill">Preview</span>':'');
return `<a class="tile" style="--i:${i}" href="#/${HOME[a.id]}" data-app="${a.id}" data-name="${a.name.toLowerCase()}" data-st="${st}" aria-label="${a.name}">${pill}<span class="shadowf"></span>${plate(a,96)}<span class="t-name">${a.name}</span><span class="t-desc">${a.desc}</span></a>`};
return `<section class="lx t-${t} w-${w}"><div class="sky"></div><div class="orb"></div><div class="tint"></div><div class="wx" id="wx"></div><div class="l-wrap"><div class="l-top on-stage"><div class="orgwrap"><button class="orgbtn" data-act="orgmenu" aria-haspopup="true" aria-expanded="false">${mark(org(),28)}<span>${oname()}</span>${ic('down',16)}</button>${orgMenu().replace('railmenu','')}</div><div style="display:flex;gap:6px;align-items:center"><button class="iconbtn" style="color:#fff" data-act="usearch" aria-label="Search everything">${ic('search')}</button><button class="iconbtn" style="color:#fff;position:relative" data-act="inbox" aria-label="Notifications">${ic('bell')}<i class="r-badge">${UNREAD}</i></button><a class="r-me" href="#/profile" aria-label="Your profile">${photo(34)}</a></div></div>
<div class="l-hero">${w!=='off'?`<span class="wxchip" title="From your location. Turn it off in your profile.">${ic(w==='clear'&&t==='night'?'moon':W[1],18)}${W[0]} · ${W[2]}°</span>`:''}<h1>${g},<br><em>Tabish.</em></h1><p class="sub">${org()==='l2f'?'3 things need you today. 2 client approvals came back.':'2 lessons are waiting for review.'}</p>
<label class="l-find">${ic('search',20)}<span class="sr">Find an app</span><input id="findapp" placeholder="Find an app" autocomplete="off"><kbd>/</kbd></label></div>
<div class="shelf"><div class="l-group"><h2>Everyday</h2><div class="l-grid">${['office','projects','tasks','clients','drive','planner','portal'].map((id,i)=>tile(app(id),i)).join('')}</div></div>
<div class="l-group"><h2>Studio</h2><div class="l-grid">${['fmp','forms','ladder','social','whiteboard','agents'].map((id,i)=>tile(app(id),i+7)).join('')}</div></div><p class="l-empty" id="l-empty" hidden></p>
<div class="jump"><h2>Jump back in</h2><div class="jrow">${[['drive','Q4 content calendar','Sheet · edited 10 min ago','drive/edit/sheet/cal'],['projects','Harry Kaye quiz funnel','Project · 3 tasks due','projects/p/p1/list'],['office','John, the One Comma Club chaser','Customer avatar','office/avatar/john'],['planner','2027 Growth plan','Strategy builder','planner/plan/p1/builder']].map(([a,t,s,h])=>`<a class="jcard" href="#/${h}">${plate(app(a),30)}<span><b>${t}</b><small>${s}</small></span></a>`).join('')}</div></div></div>
<p class="l-foot">Ctrl-click any app to open it in a new tab. The sky follows your time of day${w!=='off'?' and local weather':''}.</p></div></section>`};
AFTER.launcher=()=>{const w=wxNow(),x=$('#wx');if(!x||reduce)return;let h='';const R=Math.random;
if(w==='rain')h=Array.from({length:70},()=>`<i class="rdrop" style="left:${R()*110}%;animation-duration:${.55+R()*.4}s;animation-delay:${-R()*2}s"></i>`).join('');
if(w==='cold')h=Array.from({length:60},()=>{const s=2+R()*4;return `<i class="flake" style="left:${R()*100}%;width:${s}px;height:${s}px;animation-duration:${6+R()*8}s;animation-delay:${-R()*12}s"></i>`}).join('');
if(w==='cloud'||w==='rain')h+=Array.from({length:5},(_,i)=>`<i class="cloudp" style="top:${4+i*9}%;width:${260+R()*260}px;height:${70+R()*60}px;animation-duration:${60+R()*50}s;animation-delay:${-R()*80}s"></i>`).join('');
if(w==='hot')h='<i class="haze"></i>';x.innerHTML=h};
VIEWS.system=()=>rSystem();VIEWS.auth=()=>rAuth();VIEWS.states=()=>rStates();

/* ---------- events ---------- */
Object.assign(ACT,{
nav:v=>nav(v),go:v=>nav(v),open:(v,t)=>openApp(v,t),org:v=>setOrg(v),noop:()=>{},
toast:v=>{const[m,k]=v.split(/:(?=ok$|warn$)/);toast(m,k)},
railmenu:(v,t)=>{const m=t.nextElementSibling,o=m.hidden;closeMenus();m.hidden=!o;t.setAttribute('aria-expanded',o)},
orgmenu:(v,t)=>{const m=t.nextElementSibling,o=m.hidden;closeMenus();m.hidden=!o;t.setAttribute('aria-expanded',o)},
usearch:()=>usOpen(),usscope:v=>{US.scope=v;$$('.cmdk-chips button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.act==='usscope:'+v));usRun();$('#usq').focus()},
inbox:()=>inbox(),nfk:v=>{NF.kind=v;inbox()},nfa:v=>{NF.app=v;inbox()},inboxread:()=>{NOTE.forEach(n=>n[5]=0);UNREAD=0;inbox();draw();toast('All caught up.','ok')},inboxgo:()=>{UNREAD=Math.max(0,UNREAD-1)},
wxtoggle:()=>{DEMO.wx=DEMO.wx==='off'?'auto':'off';draw()},
sidetoggle:()=>{$('.shell')?.classList.toggle('sidecol');localStorage.setItem('l2f.sidecol',$('.shell')?.classList.contains('sidecol')?'1':'')},
msheet:()=>dlg({title:oname(),body:`<div style="display:grid;gap:4px;margin-top:8px"><a class="linkrow" href="#/launcher">${ic('grid')}<span class="main"><b>Launcher</b></span></a><button class="linkrow" data-act="usearch">${ic('search')}<span class="main"><b>Search everything</b></span></button><button class="linkrow" data-act="inbox">${ic('bell')}<span class="main"><b>Notifications</b><small>${UNREAD} unread</small></span></button>${Object.keys(ORG).map(o=>`<button class="linkrow" data-act="org:${o}">${mark(o,28)}<span class="main"><b>${ORG[o].name}</b></span>${o===org()?ic('check',18):''}</button>`).join('')}<a class="linkrow" href="#/profile">${photo(28)}<span class="main"><b>My profile</b></span></a></div><div class="grid3" style="gap:6px;margin-top:10px">${APPS.map(a=>`<a class="linkrow" style="flex-direction:column;text-align:center;font-size:12px" href="#/${HOME[a.id]}">${plate(a,34)}${a.name}</a>`).join('')}</div>`,acts:[['Close','noop']]}),
more:()=>dlg({title:'More',body:`<div style="display:grid;gap:4px;margin-top:6px">${CURNAV.slice(4).map(n=>`<a class="linkrow" href="#/${n[0]}">${ic(n[2])}<span class="main"><b>${n[1]}</b></span>${ic('right',16)}</a>`).join('')}</div>`,acts:[['Close','noop']]}),
drawerx:()=>$('#drawer').classList.remove('open'),
demotoggle:()=>{window.demoOpen=!window.demoOpen;rDemo()},
demo:v=>{const[k,x]=v.split('=');if(k==='org')return setOrg(x);if(k==='theme')H.dataset.theme=x;else DEMO[k]=x;draw()},
concept:v=>{H.dataset.concept=v;draw()},
auth:v=>{authState=v;draw()},
pw:(v,t)=>{const i=$('#'+v),s=i.type==='password';i.type=s?'text':'password';t.setAttribute('aria-pressed',s)},
signin:()=>nav('launcher'),resend:()=>toast('Email sent again.','ok'),savepw:()=>{authState='signin';draw();toast('Password updated.','ok')},checkinv:()=>$('#inv-r').textContent='No invitations yet. We checked just now.',
decline:()=>dlg({title:'Decline this invitation?',body:'You won’t join Aurj. They can invite you again later.',acts:[['Keep invitation','noop'],['Decline','toast:Invitation declined.','ink']]}),
'demo-dlg':()=>dlg({icon:plate(app('clients'),56),title:'Archive this client?',body:'Archived clients leave the pipeline and their sharing pauses. Restore any time.',acts:[['Cancel','noop'],['Archive client','toast:Client archived.:ok','ink']]}),
'demo-spring':()=>$('#sdemo')?.classList.toggle('go'),
tgl:(v,t)=>t.setAttribute('aria-checked',t.getAttribute('aria-checked')!=='true'),
chipt:(v,t)=>t.setAttribute('aria-pressed',t.getAttribute('aria-pressed')!=='true')
});
document.addEventListener('click',e=>{
 if(!e.target.closest('.r-wrap,.orgwrap,.appsw'))closeMenus();
 if(!e.target.closest('.ctx'))$('.ctx')?.remove();
 if(window.demoOpen&&!e.target.closest('#demofab')){window.demoOpen=false;rDemo()}
 if(e.target===$('#scrim'))return closeDlg();
 if(e.target.classList?.contains('cmdk-scrim'))return closeCmdk();
 const hb=e.target.closest('[data-href]');if(hb){closeCmdk();if(e.ctrlKey||e.metaKey)open('#/'+hb.dataset.href,'_blank');else nav(hb.dataset.href);return}
 const tile=e.target.closest('a.tile');if(tile&&!(e.ctrlKey||e.metaKey||e.shiftKey||e.button)){e.preventDefault();openApp(tile.dataset.app,tile);return}
 const am=e.target.closest('.appmenu a[data-app]');if(am&&!(e.ctrlKey||e.metaKey)&&appState(am.dataset.app)!=='ok'){e.preventDefault();openApp(am.dataset.app);return}
 if(e.target.closest('a[href^="#/"]')){closeMenus();if(e.target.closest('#scrim'))closeDlg();if(e.target.closest('.cmdk'))closeCmdk()}
 const t=e.target.closest('[data-act]');if(!t)return;
 const[a,v]=t.dataset.act.split(/:(.*)/s);
 if(t.closest('#scrim')){closeDlg();if(a==='noop')return}
 if(t.closest('.cmdk')&&t.hasAttribute('data-close'))closeCmdk();
 if(t.closest('.ctx'))$('.ctx')?.remove();
 if(a==='nav'&&(e.ctrlKey||e.metaKey||e.shiftKey)){open('#/'+v,'_blank');return}
 const f=ACT[a];if(f){if(t.tagName!=='A')e.preventDefault();f(v,t,e)}
});
document.addEventListener('contextmenu',e=>{const t=e.target.closest('[data-ctx]');if(t){const f=CTX[t.dataset.ctx.split(':')[0]];if(f)ctxMenu(e,f(t.dataset.ctx.split(':').slice(1).join(':'),t))}});
const CTX={};
document.addEventListener('input',e=>{const id=e.target.id;
 if(id==='findapp'){const q=e.target.value.trim().toLowerCase();let n=0;$$('.lx .tile').forEach(t=>{const m=!q||t.dataset.name.includes(q);t.hidden=!m;if(m)n++});$$('.lx .l-group').forEach(g=>g.hidden=!$$('.tile:not([hidden])',g).length);const em=$('#l-empty');em.hidden=!!n;em.textContent=`No app called “${e.target.value}”.`}
 if(e.target.dataset.filter!=null){const q=e.target.value.toLowerCase();$$('[data-row]').forEach(r=>r.hidden=!r.dataset.row.toLowerCase().includes(q))}
 if(id==='np-1'||id==='np-2'){const a=$('#np-1').value,b=$('#np-2').value;$('[data-r="len"]').classList.toggle('ok',a.length>=10);$('[data-r="match"]').classList.toggle('ok',!!a&&a===b)}
 INPUT[id]?.(e.target,e);for(const k in INPUTC)if(e.target.classList.contains(k))INPUTC[k](e.target,e)});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(!$('#scrim').hidden)closeDlg();else if($('.cmdk-scrim'))closeCmdk();else if($('#drawer.open'))$('#drawer').classList.remove('open');closeMenus();$('.ctx')?.remove();if(window.demoOpen){window.demoOpen=false;rDemo()}}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();usOpen()}
 const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)||document.activeElement.isContentEditable;
 if(e.key==='/'&&!typing){const f=$('#findapp')||$('.appsearch input');if(f){e.preventDefault();f.focus()}}
 if(e.key==='Enter'&&e.target.id==='findapp')$('.lx .tile:not([hidden])')?.click();
 if($('.cmdk-scrim')){const L=$$('#usr button');let i=L.findIndex(b=>b.getAttribute('aria-selected')==='true');if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();L[i]?.removeAttribute('aria-selected');i=(i+(e.key==='ArrowDown'?1:-1)+L.length)%L.length;L[i]?.setAttribute('aria-selected','true');L[i]?.scrollIntoView({block:'nearest'})}if(e.key==='Enter'&&e.target.id==='usq'){e.preventDefault();const b=L[i];if(b?.dataset.href){closeCmdk();if(e.ctrlKey||e.metaKey)open('#/'+b.dataset.href,'_blank');else nav(b.dataset.href)}else b?.click()}}
 if(e.key==='Tab'&&!$('#scrim').hidden){const b=$$('#dlg button,#dlg input,#dlg select,#dlg textarea,#dlg a');if(e.shiftKey&&document.activeElement===b[0]){e.preventDefault();b.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===b.at(-1)){e.preventDefault();b[0].focus()}}
 KEY[RT.a]?.(e,typing)});
document.addEventListener('pointermove',e=>{if(reduce||e.pointerType!=='mouse')return;const t=e.target.closest('.tile');if(!t)return;const r=t.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;t.style.setProperty('--rx',(-y*16)+'deg');t.style.setProperty('--ry',(x*18)+'deg')});
document.addEventListener('pointerout',e=>{const t=e.target.closest('.tile');if(t&&!t.contains(e.relatedTarget)){t.style.removeProperty('--rx');t.style.removeProperty('--ry')}});

document.addEventListener('auxclick',e=>{const t=e.target.closest('[data-act^="nav:"],[data-href]');if(t&&e.button===1){e.preventDefault();open('#/'+(t.dataset.href||t.dataset.act.slice(4)),'_blank')}});
