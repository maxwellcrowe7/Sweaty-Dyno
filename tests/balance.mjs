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
const row=(s)=>db.balanceSheet().find(r=>r.season===s);

print('— 2025: no carry in, matches the spreadsheet —');
const a=row(2025);
eq('fees', a.fees, 500);
eq('nothing carried into the first season', a.carryIn, 0);
eq('available = fees', a.available, 500);
eq('empire set-aside', a.empire, 150);
eq('minigames paid', a.mini, 170);
eq('placement paid', a.place, 150);
eq('surplus (spreadsheet G24 = 30)', a.surplus, 30);

print('\n— 2026: last year\'s surplus is available cash —');
const b=row(2026);
eq('its own fees', b.fees, 500);
eq('plus what 2025 left over', b.carryIn, 30);
eq('available', b.available, 530);
eq('the guillotine prize is already committed', b.mini, 10);
eq('surplus is what is NOT spoken for', b.surplus, 530-150-10);

print('\n— the chain keeps running —');
const c=row(2027);
eq('2027 carried in 2026 surplus', c.carryIn, 370);
eq('2027 fees so far', c.fees, 100);
eq('available', c.available, 470);
eq('no empire accrual for a season that has not started', c.empire, 0);
eq('surplus', c.surplus, 470);

print('\n— commitments vs cash: two different questions —');
eq('free cash = collected - paid out - empire pot', db.bank().free, 1100-320-300);
const sheet=db.balanceSheet().filter(r=>r.active);
const unpaid=sheet.reduce((a,r)=>a+(r.mini-r.miniPaid)+(r.place-r.placePaid),0);
eq('committed but not handed over', unpaid, 10);
eq('free cash = uncommitted surplus + what is owed out', db.bank().free, row(2027).surplus + unpaid);
eq('untouched seasons stay blank', db.balanceSheet().filter(r=>!r.active).map(r=>r.season), [2028,2029,2030]);

print('\n— raising a prize commits the money immediately —');
await db.update('minigames',(m)=>{
  const g=m.seasons['2025'].games.find(x=>x.phase==='week'&&x.week===1);
  g.payout['1']=60;                      // was $10
});
eq('2025 minigames rose straight away', row(2025).mini, 220);
// that week's winner is already marked paid, so the derived paid figure moves too
eq('and the paid figure follows, since that winner is settled', row(2025).miniPaid, 220);
eq('surplus fell by the same $50', row(2025).surplus, -20);
eq('and 2026 carries the shortfall', row(2026).carryIn, -20);
await db.update('minigames',(m)=>{
  const g=m.seasons['2025'].games.find(x=>x.phase==='week'&&x.week===1);
  g.payout['1']=10;
});
eq('restored', [row(2025).surplus, row(2026).available], [30,530]);

print('\n— adding an unplayed week still commits its prize —');
await db.update('minigames',(m)=>{
  m.seasons['2025'].games.push({id:'t-new',phase:'week',week:97,name:'Test',summary:null,rules:null,
    payout:{'1':25,'2':0,'3':0},status:'scheduled',results:{'1':null,'2':null,'3':null}});
});
eq('minigames include the unplayed prize', row(2025).mini, 195);
eq('nobody has been paid it', row(2025).miniPaid, 170);
eq('surplus drops accordingly', row(2025).surplus, 5);
await db.update('minigames',(m)=>{m.seasons['2025'].games=m.seasons['2025'].games.filter(g=>g.id!=='t-new');});
eq('restored', row(2025).surplus, 30);
print(fail?`\n${fail} FAILURE(S)`:'\nBalance sheet passed.');

print('\n— the all-time row agrees with the rows above it —');
{
  const act=db.balanceSheet().filter(r=>r.active);
  const t=act.reduce((a,r)=>({e:a.e+r.empire,m:a.m+r.mini,p:a.p+r.place}),{e:0,m:0,p:0});
  eq('empire totals', t.e, 300);
  eq('minigames total the committed columns', t.m, 170+10);
  eq('placement totals', t.p, 150);
  const left=db.bank().collected - t.e - t.m - t.p;
  eq('all-time surplus == last active season surplus', left, act.at(-1).surplus);
  eq('and equals collected minus every commitment', left, 1100-300-180-150);
}
