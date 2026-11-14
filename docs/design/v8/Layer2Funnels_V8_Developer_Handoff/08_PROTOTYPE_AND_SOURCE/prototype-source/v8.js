/* =================== v8 data fixes (no structural change) ===================
   v7 showed "undefined" on the Clara and Marcus avatar profiles: only John had content.
   Give every sample avatar complete sample content so every tab renders. */
(function(){
  const fill=(base,o)=>Object.assign({},JOHN,base,o);
  const L=AVX.l2f;
  L[1]=fill(L[1],{pr:'she',ob:'her',
    facts:[['Age','28–40'],['Gender','Female'],['Income','$3K–$12K / month'],['Location','UK and US'],['Family','Often a parent'],['Goal','A full online roster']],
    now:'Coaches in person and online, but most clients still come from referrals. Has tried posting daily and a free challenge; neither filled her calendar.',
    wants:['A steady flow of booked calls','Fewer hours in the gym, more online clients','A brand she is proud to send people to'],
    scared:['Looking salesy online','Paying for ads that don’t convert','Losing referral clients to cheaper coaches'],
    pays:['Done-for-you quiz funnels','$1,500–$3,000 for a launch'],
    reach:['Instagram and TikTok fitness creators','Facebook groups for online coaches','Podcasts on fitness business'],
    root:'If I post more, the right clients will find me.',
    oneliner:'Clara is an online fitness coach earning $3K–$12K a month from referrals who needs a predictable way to book calls without feeling salesy.',
    used:['Quiz funnel','Harry Kaye quiz funnel']});
  L[2]=fill(L[2],{pr:'he',ob:'him',
    facts:[['Age','35–55'],['Gender','Male'],['Income','$15K–$60K / month'],['Location','US and Europe'],['Family','Married'],['Goal','Two days a week off client work']],
    now:'Fully booked with retainer clients and no time to build a funnel. Wants a productised offer but keeps postponing the build.',
    wants:['A productised offer that sells without calls','Fewer, better clients','Time back for strategy'],
    scared:['A funnel that cheapens his brand','Another project he has to manage','Leads that are too small'],
    pays:['Premium done-for-you builds','$3,000–$8,000 per project'],
    reach:['LinkedIn','Industry newsletters','Referral partners'],
    root:'My clients only buy from me after a long conversation.',
    oneliner:'Marcus is a fully booked B2B consultant who needs a premium productised funnel so new clients can buy without a long sales process.',
    used:['Webinar funnel']});
  const A=AVX.aurj;A[0]=fill(A[0],{pr:'he',ob:'him'});
})();
