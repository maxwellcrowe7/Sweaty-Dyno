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
eq('2026 now pre/week/post', p26.map(p=>p.games.length), [1,13,1]);
eq('preseason winner pays out', db.payoutLines(2026).find(l=>l.category==='minigame').total, 10);
eq('undecided post-season pays nothing yet', db.minigameWinnings(2026)[undefined], undefined);
eq('budget counts all three phases', db.minigameSpend(2026).committed, 13*10+10+10+10);
print(fail?`\n${fail} FAILURE(S)`:'\nPhases passed.');
