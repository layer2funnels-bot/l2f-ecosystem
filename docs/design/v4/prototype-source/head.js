const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const H=document.documentElement;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!H.dataset.theme)H.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const APPS=[
{id:'office',name:'Office',desc:'Home, plans, team and admin',c:['#454955','#1B1D23','#0A0B0D'],g:'#FFC633',grp:1},
{id:'projects',name:'Projects',desc:'Boards, tasks and timelines',c:['#6E98FF','#2B5CF0','#1A3BAE'],grp:1},
{id:'clients',name:'Clients',desc:'Pipeline, strategy and delivery',c:['#FF9A7E','#EF5235','#A93220'],grp:1},
{id:'drive',name:'Drive',desc:'Files, SOPs and templates',c:['#A898FF','#6B4FF0','#4729B5'],grp:1},
{id:'planner',name:'Planner',desc:'Your week, in one view',c:['#D3F38A','#7FBF2A','#4F7F12'],g:'#1E2A06',grp:1},
{id:'portal',name:'Client Portal',desc:'What your clients will see',c:['#5FDCCB','#13A592','#0A7064'],grp:1},
{id:'forms',name:'Form Builder',desc:'Forms, quizzes and intake',c:['#FFBE6E','#F07C1A','#AE520A'],grp:2},
{id:'ladder',name:'Value Ladder',desc:'Offers from free to premium',c:['#FFE58F','#EEBB12','#A07A00'],g:'#2A1F00',grp:2},
{id:'social',name:'Social Planner',desc:'Posts, carousels, schedule',c:['#FF9CC8','#E9488F','#A82462'],grp:2},
{id:'whiteboard',name:'Whiteboard',desc:'Sketch ideas together',c:['#FFFFFC','#E7E4DB','#ACA796'],g:'#1B1D23',grp:2},
{id:'fmp',name:'Funnel Mapper Pro',desc:'Map, model and forecast',c:['#5CE6B2','#10B981','#087850'],grp:2},
{id:'agents',name:'Layer 2 Agents',desc:'Coming later, with approval',c:['#C3B0FF','#7E5BF2','#5030C0'],grp:2}];
const app=id=>APPS.find(a=>a.id===id);
const plate=(a,s=64,x='')=>`<span class="plate" style="${x}--s:${s}px;--c1:${a.c[0]};--c2:${a.c[1]};--c3:${a.c[2]};--g:${a.g||'#FFFEFA'}" aria-hidden="true">${ic(a.id,Math.round(s*.47),'gl',2)}</span>`;
const ORG={l2f:{name:'Layer2Funnels',lvl:'Owner'},aurj:{name:'Aurj',lvl:'Owner'}};
const org=()=>H.dataset.org, oname=()=>ORG[org()].name;
let authState='signin';
