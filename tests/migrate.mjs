const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const disk={}; for(const f of F) disk[f]=JSON.parse(readFile(`data/${f}.json`));

// Recreate EXACTLY what Supabase is still serving: the pre-restructure shape.
const stale=JSON.parse(JSON.stringify(disk));
stale.bank.payins=stale.bank.payins.map(p=>({season:p.season,team:p.team,amount:50,paid:p.paid>0,
  ...(p.season===2027&&p.team===4?{note:"Matt paid on Andrew's behalf (9/2/25)",date:'2025-09-02'}:{})}));
// mirror what the database actually holds: 8 minigame rows, 2 placement, 2 empire
const LEG={'2':20,'3':10,'4':30,'5':10,'6':20,'7':20,'9':30,'10':30};
stale.bank.payouts=[
  ...Object.entries(LEG).map(([t,a],i)=>({id:'po-2025-mg-'+i,season:2025,team:+t,category:'minigame',amount:a,label:'Minigame winnings',paid:true})),
  {id:'po-2025-pl-1',season:2025,team:6,category:'placement',place:1,amount:100,label:'1st place',paid:true},
  {id:'po-2025-pl-2',season:2025,team:8,category:'placement',place:2,amount:50,label:'2nd place',paid:true},
  {id:'po-2025-emp-1',season:2025,team:null,category:'empire',amount:150,label:'Rolling pot set-aside',paid:false},
  {id:'po-2026-emp-1',season:2026,team:null,category:'empire',amount:150,label:'Rolling pot set-aside',paid:false}];
delete stale.bank.empirePot;
delete stale.bank.settled;
delete stale.league.placementPayouts;
stale.minigames.seasons['2025']={games:[],guillotine:null,legacy:{note:'totals only',totalsByTeam:LEG,total:170}};
for(const s of Object.values(stale.minigames.seasons)){
  for(const g of s.games||[]) delete g.phase;
}
stale.minigames.seasons['2026'].awards=[{id:'aw-old',name:'Legacy Award',rules:'vote',payout:10,status:'final',result:{team:2,value:null}}];
for(const w of stale.stats.weekly) delete w.maxPoints;

globalThis.localStorage={_d:{},getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>{const x=String(u);
 if(x.includes('/rest/v1/sweaty_dyno_data'))
   return{ok:true,json:async()=>Object.entries(stale).map(([key,value])=>({key,value:JSON.parse(JSON.stringify(value))}))};
 return{ok:true,json:async()=>disk[x.split('/').pop().split('.json')[0]]}};

const {db}=await import('../js/db.js'); await db.init();
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

print('— the reported bug: old cloud shape —');
eq('reading the stale cloud copy', db.live, true);
const b=db.bank();
eq('Paid per manager is dollars, not a count', db.ledger().map(t=>t.paidIn), [100,100,100,150,100,100,100,150,100,100]);
eq('collected is $1,100 not $22', b.collected, 1100);
eq('bank cash unchanged by the migration', b.cash, 780);
eq('empire pot from accrual, not payout rows', b.earmarked, 300);
eq('stored payout rows removed', 'payouts' in db.get('bank'), false);
eq('placement scale recovered from the old rows', db.placementScale(2025), {'1':100,'2':50});
eq('who was paid was preserved', db.isSettled(2025,'placement',6), true);
eq('legacy totals kept as the fallback source', db.minigames(2025).legacy.total, 170);
eq('and they drive the payouts', db.payoutLines(2025).find(l=>l.category==='minigame').total, 170);
eq('per-season collected', db.seasons.map(s=>db.bank(s).collected), [500,500,100,0,0,0]);
eq('stale note stripped', db.get('bank').payins.some(p=>'note' in p), false);
eq('stale amount field stripped', db.get('bank').payins.some(p=>'amount' in p), false);
eq('empirePot backfilled', db.get('bank').empirePot, {claimedBy:null,claimedSeason:null,paidAmount:null});
eq('old awards list folded into post-phase games',
   db.minigames(2026).games.filter(g=>g.phase==='post').map(g=>g.name), ['Legacy Award']);
eq('and the separate awards key is gone', 'awards' in db.minigames(2026), false);
eq('a folded award still pays out', db.payoutLines(2026).find(l=>l.category==='minigame').rows.map(r=>[r.team,r.amount]), [[2,10]]);
eq('every game has a phase', db.minigames(2026).games.every(g=>g.phase), true);
eq('maxPoints backfilled', db.get('stats').weekly.every(w=>'maxPoints' in w), true);

print('\n— rendering the stale copy —');
const B=await import('../js/views/bank.js');
const html=B.render(db,{params:{}});
eq('no $1/$2/$3 in the Paid column', /\$[123]<\/td>/.test(html), false);
eq('shows $100 rows', html.includes('$100'), true);
eq('no NaN or undefined', /NaN|undefined/.test(html), false);
print(fail?`\n${fail} FAILURE(S)`:'\nStale-data migration passed.');
