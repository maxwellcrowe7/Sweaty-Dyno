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
print('\n— the race sorts on points, then a title, then team number —');
{
  const order = () => db.empire().board.map(t=>t.manager);
  eq('points first', order().slice(0,2), ['Max','Tanner']);
  // 5 pts each, no title either way -> Andrew (T4) ahead of Tyler (T9)
  eq('equal points with no title: team number', order().slice(2,4), ['Andrew','Tyler']);
  eq('and again lower down', order().slice(4,6), ['Alex','Sam']);
  eq('teams on nothing keep team order',
     order().slice(6), ['Noah','Neal','Damon','Matt']);

  // give Tyler (T9) a title in a season nobody else placed: he now outranks
  // Andrew (T4) on the same points, purely on the tie-break
  const before = db.get('bank').finishes.map(f=>({...f}));
  await db.update('bank',(b)=>{
    b.finishes = b.finishes.filter(f=>!(f.season===2026));
    b.finishes.push({season:2026, team:9, place:1});   // Tyler, +20 and a title
    b.finishes.push({season:2026, team:4, place:2});   // Andrew, +10
  });
  const bd = db.empire().board;
  eq('Tyler now leads on points', [bd[0].manager, bd[0].total, bd[0].titles], ['Tyler',25,1]);
  eq('then Max on 20, then Andrew on 15',
     bd.slice(1,3).map(t=>[t.manager,t.total]), [['Max',20],['Andrew',15]]);
  await db.update('bank',(b)=>{ b.finishes = before; });

  // the rule that actually matters: equal points, one has a title. Noah (T1)
  // gets there via two runner-up finishes, Neal (T2) via one championship, so
  // team number would put Noah first -- the title has to override it.
  await db.update('bank',(b)=>{ b.finishes = b.finishes.filter(f=>f.season===2025);
    b.finishes.push({season:2026, team:2, place:1});   // Neal T2: 20, 1 title
    b.finishes.push({season:2026, team:1, place:2});   // Noah T1: 10
    b.finishes.push({season:2027, team:1, place:2});   // Noah T1: 10 more -> 20, no title
  });
  const tie = db.empire().board.filter(t=>t.total===20);
  eq('both on 20', tie.map(t=>[t.manager,t.titles]), [['Neal',1],['Max',1],['Noah',0]]);
  eq('the titled team wins the tie even with the higher team number',
     tie.map(t=>t.manager).indexOf('Neal') < tie.map(t=>t.manager).indexOf('Noah'), true);
  await db.update('bank',(b)=>{ b.finishes = before; });

  // a straight tie WITH a title on both sides
  await db.update('bank',(b)=>{ b.finishes = b.finishes.filter(f=>f.season!==2026);
    b.finishes.push({season:2026, team:7, place:1});   // Sam T7: 3+20=23, 1 title
    b.finishes.push({season:2026, team:3, place:1});   // Alex T3: 3+20=23, 1 title
  });
  eq('two champions tie on points, lower team number wins',
     db.empire().board.slice(0,2).map(t=>t.manager), ['Alex','Sam']);
  await db.update('bank',(b)=>{ b.finishes = before; });
  eq('restored again', db.empire().board.map(t=>t.manager).slice(0,2), ['Max','Tanner']);
}

print(fail?`\n${fail} FAILURE(S)`:'\nStandings passed.');
