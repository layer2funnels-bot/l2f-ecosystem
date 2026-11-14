const dOf=o=>new Date(2026,9,19+o);
const dl=o=>o===3?'Today':o===4?'Tomorrow':o===2?'Yesterday':dOf(o).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const TST={todo:['To do','#7C818D'],prog:['In progress','#D98200'],review:['Review','#8A5CF2'],done:['Done','#2B63F6']};
const PRI={urgent:['Urgent','#E5482F'],high:['High','#F07C1A'],normal:['Normal','#2B63F6'],low:['Low','#8A8F9B']};
const PSTAT={'On track':'blue','At risk':'warn',Planning:'',Done:'blue'};
const PROJ={l2f:[
{id:'p1',n:'Harry Kaye quiz funnel',cl:'Harry Kaye PT',lead:'TR',st:'On track',pr:42,due:'28 Nov',c:'#EF5235',team:['TR','SN','AR','UM','BK'],fav:1,purpose:'Build a fitness quiz funnel that books discovery calls for Harry’s online coaching.'},
{id:'p2',n:'Mindful Money course launch',cl:'Mindful Money Co',lead:'AR',st:'At risk',pr:64,due:'14 Nov',c:'#6B4FF0',team:['AR','SN','BK'],fav:1,purpose:'Launch a $497 course with a webinar funnel and a 5-email sequence.'},
{id:'p3',n:'L2F website refresh',cl:'Internal',lead:'BK',st:'On track',pr:20,due:'20 Dec',c:'#2B5CF0',team:['BK','AR'],purpose:'Refresh layer2funnels.com with new case studies and a clearer offer.'},
{id:'p4',n:'Funnel Done Right Challenge',cl:'Internal',lead:'TR',st:'Planning',pr:8,due:'Jan 2027',c:'#F07C1A',team:['TR','UM'],purpose:'A 7-day beginner challenge with a companion book.'},
{id:'p5',n:'Apex Coaching webinar funnel',cl:'Apex Coaching',lead:'SN',st:'Done',pr:100,due:'Sep',c:'#13A592',team:['SN','BK'],arch:1,purpose:'Webinar funnel, launched in September.'},
{id:'p6',n:'Q3 ads test',cl:'Internal',lead:'UM',st:'Done',pr:100,due:'Sep',c:'#E9488F',team:['UM'],arch:1,purpose:'Test three ad angles for L2F lead magnet.'}],
aurj:[
{id:'a1',n:'Urdu Basics, Season 2',cl:'Internal',lead:'TR',st:'On track',pr:55,due:'30 Nov',c:'#B0305A',team:['TR','SN','AR'],fav:1,purpose:'Record and publish 12 lessons for Season 2.'},
{id:'a2',n:'Grade 9 Maths videos',cl:'Internal',lead:'UM',st:'At risk',pr:30,due:'15 Nov',c:'#0C7F95',team:['UM','BK'],purpose:'Short explainer videos for the Grade 9 syllabus.'},
{id:'a3',n:'Khushab classes, Term 2',cl:'Internal',lead:'TR',st:'Planning',pr:12,due:'Jan 2027',c:'#E8A33D',team:['TR'],purpose:'Plan the in-person term and worksheets.'},
{id:'a4',n:'Season 1 edits',cl:'Internal',lead:'AR',st:'Done',pr:100,due:'Aug',c:'#7E5BF2',team:['AR'],arch:1,purpose:'Final edits for Season 1.'}]};
const projs=()=>PROJ[org()];const proj=id=>projs().find(p=>p.id===id);
const mk=(n,st,as,o,pri,tags,sd,st2,s,len,co)=>({n,st,as,o,pri,tags,sd,stt:st2,s,len,co:co||[]});
const TASKS={p1:[mk('Interview Harry about his clients','done','TR',0,'normal',['Research'],3,3,-10,6),mk('Customer avatar draft','review','UM',5,'high',['Strategy'],2,4,-4,8),mk('Quiz questions v2','prog','SN',3,'urgent',['Copy'],1,3,-2,6,['UM']),mk('Quiz flow wireframe','prog','AR',4,'normal',['Design'],1,2,0,5,['BK']),mk('Results page copy','todo','SN',8,'high',['Copy'],0,2,2,7),mk('Brand kit from client','done','AR',1,'normal',['Brand'],1,1,-6,5),mk('Lead magnet PDF','todo','AR',10,'normal',['Design'],0,0,5,6),mk('Build quiz in GoHighLevel','todo','BK',15,'normal',['Build'],0,5,10,8),mk('Email follow-up sequence','todo','SN',17,'low',['Copy'],0,4,12,6),mk('QA and launch checklist','todo','TR',23,'high',['Launch'],0,6,20,5)]};
['p2','p3','p4','p5','p6','a1','a2','a3','a4'].forEach((p,j)=>TASKS[p]=[['Kick-off and brief','done','TR',-2],['Outline and plan','prog','UM',3],['First draft','prog','SN',4],['Design pass','todo','AR',9],['Review with lead','review','TR',6],['Publish and check','todo','BK',16]].map(([n,st,as,o],i)=>mk(n,st,as,o+j%3,['high','normal','urgent','normal','low','normal'][i],[['Plan','Copy','Design','Review','Build'][i%5]],i%2,2,o-4+j%3,5+i%3)));
const tasksOf=pid=>TASKS[pid].map((t,i)=>Object.assign(t,{pid,i,id:pid+'-'+i}));
const allTasks=()=>projs().flatMap(p=>tasksOf(p.id));
const stPill=s=>`<span class="st" style="--c:${TST[s][1]}">${TST[s][0]}</span>`;
const priL=p=>`<span class="pri" style="--c:${PRI[p][1]}">${ic('flag',15)}${PRI[p][0]}</span>`;
