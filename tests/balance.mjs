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
eq('surplus rolls on', b.surplus, 530-150);

print('\n— the chain keeps running —');
const c=row(2027);
eq('2027 carried in 2026 surplus', c.carryIn, 380);
eq('2027 fees so far', c.fees, 100);
eq('available', c.available, 480);
eq('no empire accrual for a season that has not started', c.empire, 0);
eq('surplus', c.surplus, 480);

print('\n— it reconciles with the bank —');
eq('last active surplus == free cash', row(2027).surplus, db.bank().free);
eq('free cash = collected - paid out - empire pot', db.bank().free, 1100-320-300);
eq('untouched seasons stay blank', db.balanceSheet().filter(r=>!r.active).map(r=>r.season), [2028,2029,2030]);

print('\n— spending more moves the carry —');
await db.update('minigames',(m)=>{
  const g=m.seasons['2025'].games.find(x=>x.phase==='week'&&x.week===1);
  g.payout['1']=60;                      // was $10
});
await db.update('bank',(x)=>{x.settled.push({season:2025,category:'minigame',team:3,date:null});});
eq('2025 minigames rose', row(2025).mini, 220);
eq('2025 surplus fell by the same $50', row(2025).surplus, -20);
eq('and 2026 carries the shortfall', row(2026).carryIn, -20);
eq('2026 available drops', row(2026).available, 480);
await db.update('minigames',(m)=>{
  const g=m.seasons['2025'].games.find(x=>x.phase==='week'&&x.week===1);
  g.payout['1']=10;
});
eq('restored', [row(2025).surplus, row(2026).available], [30,530]);

print('\n— unpaid awards do not leave the bank —');
await db.update('bank',(x)=>{x.settled=x.settled.filter(y=>!(y.season===2025&&y.category==='minigame'&&y.team===3));});
eq('an unpaid winner is not spent yet', row(2025).mini, 160);
eq('so surplus is higher', row(2025).surplus, 40);
eq('but it is flagged as owed', row(2025).owedOut, 10);
await db.update('bank',(x)=>{x.settled.push({season:2025,category:'minigame',team:3,date:null});});
eq('restored', row(2025).surplus, 30);
print(fail?`\n${fail} FAILURE(S)`:'\nBalance sheet passed.');
