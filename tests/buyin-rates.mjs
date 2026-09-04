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

print('— raising a FUTURE season rate —');
eq('baseline owed now', db.bank().owedNow, 0);
await db.update('league',(L)=>{L.buyIn['2027']=75;});
eq('2027 expected rises', db.bank(2027).expected, 750);
eq('owed now UNCHANGED (2027 has not started)', db.bank().owedNow, 0);
eq('no team shows a debt', db.ledger().filter(t=>t.owesNow>0).length, 0);

print('\n— raising the CURRENT season rate —');
await db.update('league',(L)=>{L.buyIn['2026']=75;});
eq('owed now reflects the shortfall', db.bank().owedNow, 250);
eq('every team is short $25', [...new Set(db.ledger().map(t=>t.owesNow))], [25]);

print('\n— restore —');
await db.update('league',(L)=>{L.buyIn['2026']=50;L.buyIn['2027']=50;});
eq('back to baseline', [db.bank().owedNow, db.bank().expected], [0,3000]);
print(fail?`\n${fail} FAILURE(S)`:'\nRate-row behaviour is correct.');
