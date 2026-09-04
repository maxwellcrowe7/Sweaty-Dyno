const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={_d:{},getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>{const x=String(u);
 if(x.includes('/rest/v1/'))return{ok:false,status:401,json:async()=>({message:'denied'})};
 return{ok:true,json:async()=>store[x.split('/').pop().split('.json')[0]]}};
const {db}=await import('../js/db.js'); await db.init();
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};
const line=(s,c)=>db.payoutLines(s).find(l=>l.category===c);

print('— 2025 derives from its sources —');
eq('minigames total', line(2025,'minigame').total, 170);
eq('placement total', line(2025,'placement').total, 150);
eq('empire not claimed -> nothing to pay', line(2025,'empire').rows.length, 0);
eq('everything marked paid', db.bank(2025).owedOut, 0);
eq('bank reconciles', [db.bank().collected, db.bank().disbursed, db.bank().cash], [1100,320,780]);

print('\n— minigames LIVE-calculate —');
const before = line(2025,'minigame').total;
await db.update('minigames',(m)=>{
  const g=m.seasons['2025'].games.find(x=>x.phase==='week'&&x.week===1);
  g.payout['1']=25;                       // raise week 1 from $10 to $25
});
eq('payout follows the game immediately', line(2025,'minigame').total, before+15);
eq("winner's row rose", line(2025,'minigame').rows.find(r=>r.team===3).amount, 25);
eq('balance sheet minigame column follows', db.bank(2025).byCat.minigame, before+15);
await db.update('minigames',(m)=>{
  const g=m.seasons['2025'].games.find(x=>x.phase==='week'&&x.week===1); g.payout['1']=10;
});
eq('restored', line(2025,'minigame').total, 170);

await db.update('minigames',(m)=>{
  const g=m.seasons['2025'].games.find(x=>x.phase==='week'&&x.week===9);
  g.status='final'; g.payout={'1':10,'2':0,'3':0}; g.results={'1':{team:1,value:'test'},'2':null,'3':null};
});
eq('a new winner appears in the payouts', line(2025,'minigame').rows.some(r=>r.team===1), true);
eq('and is unpaid by default', line(2025,'minigame').rows.find(r=>r.team===1).paid, false);
eq('total rose', line(2025,'minigame').total, 180);
eq('season now owes money out', db.bank(2025).owedOut, 10);
eq('balance sheet only counts what was PAID', db.bank(2025).byCat.minigame, 170);

print('\n— paid / not paid —');
await db.update('bank',(b)=>{b.settled.push({season:2025,category:'minigame',team:1,date:'2026-09-03'});});
eq('marking paid clears the debt', db.bank(2025).owedOut, 0);
eq('balance sheet updates live', db.bank(2025).byCat.minigame, 180);
eq('cash drops', db.bank().cash, 770);
await db.update('bank',(b)=>{b.settled=b.settled.filter(x=>!(x.season===2025&&x.category==='minigame'&&x.team===1));});
await db.update('minigames',(m)=>{
  const g=m.seasons['2025'].games.find(x=>x.phase==='week'&&x.week===9);
  g.status='none'; g.payout={'1':0,'2':0,'3':0}; g.results={'1':null,'2':null,'3':null};
});
eq('back to baseline', [line(2025,'minigame').total, db.bank().cash], [170,780]);

print('\n— placement: results from Sleeper, amounts from config —');
eq('all ten places are recorded', db.get('bank').finishes.filter(f=>f.season===2025).length, 10);
eq('but only the paying places appear', line(2025,'placement').rows.map(r=>r.place), [1,2]);
eq('scale', db.placementScale(2025), {'1':100,'2':50});
await db.update('league',(L)=>{L.placementPayouts['2025']={'1':100,'2':50,'3':25};});
eq('paying a 3rd needs only a config line', line(2025,'placement').rows.map(r=>r.place), [1,2,3]);
eq('and the money follows', line(2025,'placement').total, 175);
eq('the new row is unpaid', line(2025,'placement').rows.find(r=>r.place===3).paid, false);
eq('3rd went to the bracket winner of that game', db.team(line(2025,'placement').rows.find(r=>r.place===3).team).manager, 'Tyler');
await db.update('league',(L)=>{delete L.placementPayouts['2025'];});
eq('restored', line(2025,'placement').total, 150);

print('\n— empire pot —');
eq('unclaimed: no rows, nothing owed', [line(2026,'empire').rows.length, db.bank(2026).owedOut], [0,0]);
await db.update('bank',(b)=>{b.empirePot={claimedBy:6,claimedSeason:2026,paidAmount:null};});
eq('claimed: one row for the winner', line(2026,'empire').rows.map(r=>[r.team,r.amount,r.paid]), [[6,300,false]]);
eq('owed out until handed over', db.bank(2026).owedOut, 300);
eq('pot still in the bank', db.empirePotBalance(), 300);
await db.update('bank',(b)=>{b.empirePot={claimedBy:null,claimedSeason:null,paidAmount:null};});
eq('restored', db.empirePotBalance(), 300);

print('\n— no legacy blocks in the repo data —');
eq('2025 has real games, not totals', [db.minigames(2025).games.length, db.minigames(2025).legacy], [22,undefined]);
eq('2025 has post-season minigames', db.minigames(2025).games.filter(g=>g.phase==='post').length, 4);
print(fail?`\n${fail} FAILURE(S)`:'\nDerived payouts passed.');
