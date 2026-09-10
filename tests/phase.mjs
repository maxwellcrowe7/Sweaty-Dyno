const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={_d:{},getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>{const x=String(u);
 if(x.includes('/rest/v1/'))return{ok:false,status:401,json:async()=>({message:'d'})};
 return{ok:true,json:async()=>store[x.split('/').pop().split('.json')[0]]}};
const {db}=await import('../js/db.js'); await db.init();
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

print('— phases —');
const ph=db.minigamePhases(2025);
eq('always three groups in playing order', ph.map(p=>p.phase), ['pre','week','post']);
eq('titles', ph.map(p=>p.title), ['Preseason','Weekly slate','Post-season']);
eq('2025 counts', ph.map(p=>p.games.length), [0,18,4]);
eq('weekly games in week order', ph[1].games.map(g=>g.week), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
eq('post-season in order', ph[2].games.map(g=>g.order), [1,2,3,4]);
eq('old awards became post games', ph[2].games.map(g=>g.name),
   ['Trade of the Year','Waiver Wire Wizard','League Favorite Manager','GM Jiu-Jitsu']);
eq('a cancelled one survived the move', ph[2].games.find(g=>g.name==='GM Jiu-Jitsu').status, 'canceled');
eq('awards key is gone', 'awards' in db.minigames(2025), false);

print('\n— money is unchanged by the restructure —');
eq('2025 minigame payouts still $170', db.payoutLines(2025).find(l=>l.category==='minigame').total, 170);
eq('bank still reconciles', [db.bank().collected, db.bank().disbursed, db.bank().cash], [1100,320,780]);
const winners = db.minigameWinnings(2025);
eq('post-season winners still counted', [winners[10], winners[6], winners[4]], [30,20,30]);

print('\n— adding each phase —');
await db.update('minigames',(m)=>{
  m.seasons['2026'].games.push({id:'x-pre',phase:'pre',order:1,week:null,name:'Offseason Wire',
    rules:'League vote',payout:{1:10,2:0,3:0},status:'final',results:{1:{team:5,value:null},2:null,3:null}});
  m.seasons['2026'].games.push({id:'x-post',phase:'post',order:1,week:null,name:'Trade of the Year',
    rules:'League vote',payout:{1:10,2:0,3:0},status:'scheduled',results:{1:null,2:null,3:null}});
});
const p26=db.minigamePhases(2026);
eq('2026 now pre/week/post', p26.map(p=>p.games.length), [1,18,1]);
eq('preseason winner pays out', db.payoutLines(2026).find(l=>l.category==='minigame').total, 10);
eq('undecided post-season pays nothing yet', db.minigameWinnings(2026)[undefined], undefined);
eq('empty slots cost nothing', db.minigames(2026).games.filter(g=>g.status==='none').length, 18);
eq('allocated counts only real prizes', db.minigameSpend(2026).committed, 10+10+10);
print(fail?`\n${fail} FAILURE(S)`:'\nPhases passed.');

print('\n— allowance vs what is allocated —');
eq('allowance comes from the rules ($200)', db.minigameBudget(2026), 200);
const sp=db.minigameSpend(2026);
eq('allocated is the sum of the slate', sp.committed, 30);  // guillotine + the pre/post added above
eq('unallocated = allowance - allocated', sp.unallocated, 200-sp.committed);
eq('2025 slate matches its payouts', db.minigameSpend(2025).committed, 170);
eq('2025 fully allocated? no — under by $30', db.minigameSpend(2025).unallocated, 30);

await db.update('league',(L)=>{L.minigameBudget={default:200,'2026':150};});
eq('a season override applies', db.minigameBudget(2026), 150);
eq('and can go negative when over', db.minigameSpend(2026).unallocated, 150-sp.committed);
await db.update('league',(L)=>{L.minigameBudget={default:200};});
eq('restored', db.minigameBudget(2026), 200);

print('\n— filling an empty slot activates it —');
{
  const before=db.minigameSpend(2026).committed;
  await db.update('minigames',(m)=>{
    const g=m.seasons['2026'].games.find(x=>x.phase==='week'&&x.week===1);
    g.name='First Blood'; g.summary='Highest scoring manager off the bat';
    g.payout={'1':10,'2':0,'3':0}; g.status='scheduled';
  });
  const g1=db.minigames(2026).games.find(x=>x.phase==='week'&&x.week===1);
  eq('slot now has a name', g1.name, 'First Blood');
  eq('and a short summary', g1.summary, 'Highest scoring manager off the bat');
  eq('summary within the cap', g1.summary.length <= db.get('minigames').defaults.summaryMax, true);
  eq('no longer an empty slot', g1.status, 'scheduled');
  eq('allocated rose by its prize', db.minigameSpend(2026).committed, before+10);
  await db.update('minigames',(m)=>{
    const g=m.seasons['2026'].games.find(x=>x.phase==='week'&&x.week===1);
    g.name=null; g.summary=null; g.payout={'1':0,'2':0,'3':0}; g.status='none';
  });
  eq('emptied again', db.minigameSpend(2026).committed, before);
}

print('\n— allocated moves with the slate, allowance does not —');
const b0=db.minigameBudget(2026), c0=db.minigameSpend(2026).committed;
await db.update('minigames',(m)=>{
  m.seasons['2026'].games.push({id:'t-extra',phase:'week',week:99,name:null,rules:null,
    payout:{1:25,2:0,3:0},status:'scheduled',results:{1:null,2:null,3:null}});
});
eq('allocated rose by the new prize', db.minigameSpend(2026).committed, c0+25);
eq('allowance unchanged', db.minigameBudget(2026), b0);
await db.update('minigames',(m)=>{m.seasons['2026'].games=m.seasons['2026'].games.filter(g=>g.id!=='t-extra');});
eq('restored', db.minigameSpend(2026).committed, c0);
