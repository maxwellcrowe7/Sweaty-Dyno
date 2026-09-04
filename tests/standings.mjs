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
const nm=(t)=>db.team(t).manager;

print('— final standings, pulled from the Sleeper bracket —');
const f25=db.get('bank').finishes.filter(f=>f.season===2025).sort((a,b)=>a.place-b.place);
eq('all ten places', f25.map(f=>f.place), [1,2,3,4,5,6,7,8,9,10]);
eq('order', f25.map(f=>nm(f.team)),
   ['Max','Tanner','Tyler','Andrew','Alex','Sam','Neal','Matt','Noah','Damon']);
eq('champion matches the bank payout', nm(db.payoutLines(2025).find(l=>l.category==='placement').rows[0].team), 'Max');

print('\n— empire points now follow the finishes —');
const board=db.empire().board;
const pts=Object.fromEntries(board.map(t=>[t.manager,t.total]));
eq('20/10/5/5/3/3 by place', [pts.Max,pts.Tanner,pts.Tyler,pts.Andrew,pts.Alex,pts.Sam], [20,10,5,5,3,3]);
eq('outside the top six scores nothing', [pts.Neal,pts.Matt,pts.Noah,pts.Damon], [0,0,0,0]);
eq('these are not stored any more', 'empirePoints' in db.get('bank'), false);
eq('one title for the champion', board.find(t=>t.manager==='Max').titles, 1);
eq('nobody else has a title', board.filter(t=>t.titles>0).length, 1);

print('\n— changing the scale re-scores everyone —');
await db.update('league',(L)=>{L.empirePointsScale=[{place:1,points:30,label:'Champion'},{place:2,points:15,label:'Runner-up'}];});
const b2=Object.fromEntries(db.empire().board.map(t=>[t.manager,t.total]));
eq('new scale applied', [b2.Max,b2.Tanner,b2.Tyler], [30,15,0]);
await db.update('league',(L)=>{L.empirePointsScale=[
  {place:1,points:20,label:'Champion'},{place:2,points:10,label:'Title game berth'},
  {place:3,points:5,label:'Semi-final berth'},{place:4,points:5,label:'Semi-final berth'},
  {place:5,points:3,label:'Playoff berth'},{place:6,points:3,label:'Playoff berth'}];});
eq('restored', db.empire().board.find(t=>t.manager==='Max').total, 20);

print('\n— a correction to the bracket moves the money —');
await db.update('bank',(b)=>{
  const a=b.finishes.find(f=>f.season===2025&&f.place===1);
  const c=b.finishes.find(f=>f.season===2025&&f.place===2);
  [a.team,c.team]=[c.team,a.team];
});
eq('1st place payout follows', nm(db.payoutLines(2025).find(l=>l.category==='placement').rows[0].team), 'Tanner');
eq('and so do the empire points', db.empire().board.find(t=>t.manager==='Tanner').total, 20);
await db.update('bank',(b)=>{
  const a=b.finishes.find(f=>f.season===2025&&f.place===1);
  const c=b.finishes.find(f=>f.season===2025&&f.place===2);
  [a.team,c.team]=[c.team,a.team];
});
eq('restored', nm(db.payoutLines(2025).find(l=>l.category==='placement').rows[0].team), 'Max');
print(fail?`\n${fail} FAILURE(S)`:'\nStandings passed.');
