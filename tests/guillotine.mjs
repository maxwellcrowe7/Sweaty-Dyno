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
const nm=(t)=>t==null?null:db.team(t).manager;

print('— 2025 played out from the Sleeper scores —');
const r=db.guillotineRun(2025);
eq('starts week 1', r.startWeek, 1);
eq('10 managers -> last chop in week 9', r.lastWeek, 9);
eq('9 weeks, 9 chops', [r.weeks.length, r.chopped], [9,9]);
eq('complete', r.complete, true);
eq('winner', nm(r.winner), 'Andrew');

print('\n— against the chops recorded in the rulebook —');
const RECORDED=[[1,'Matt',99.35],[2,'Noah',73.40],[3,'Damon',114.20],[4,'Alex',121.00],
                [5,'Neal',128.70],[6,'Sam',113.55],[7,'Max',111.70],[8,'Tyler',144.90],[9,'Tanner',124.30]];
let m=0;
for(const [wk,who,pts] of RECORDED){
  const w=r.weeks.find(x=>x.week===wk);
  const lo=w.scores[0];
  const okName=nm(w.chopped)===who, okPts=Math.abs(lo.points-pts)<0.02;
  if(okName&&okPts) m++;
  else print(`     wk${wk}: got ${nm(w.chopped)} ${lo.points}, expected ${who} ${pts}`);
}
eq('all 9 chops match the rulebook exactly', m, 9);

print('\n— pool shrinks each week —');
eq('week 1 shows all ten', r.weeks[0].scores.length, 10);
eq('week 5 shows six', r.weeks[4].scores.length, 6);
eq('week 9 shows two', r.weeks[8].scores.length, 2);
eq('scores ascending', r.weeks[0].scores.every((x,i,a)=>i===0||a[i-1].points<=x.points), true);
eq('lowest is flagged chopped', r.weeks[0].scores[0].chopped, true);
eq('nobody else flagged', r.weeks[0].scores.filter(x=>x.chopped).length, 1);
eq('a chopped team never reappears', r.weeks[8].scores.some(x=>x.team===r.weeks[0].chopped), false);
eq('no ties needed resolving', r.weeks.filter(w=>w.tied).length, 0);

print('\n— 2026 has no scores yet —');
const r26=db.guillotineRun(2026);
eq('waiting on week 1', [r26.weeks.length, r26.weeks[0].waiting], [1,true]);
eq('nobody chopped', r26.chopped, 0);
eq('no winner', r26.winner, null);
eq('last week derived from 10 managers', r26.lastWeek, r26.startWeek+8);

print('\n— overrides —');
await db.update('minigames',(mm)=>{mm.seasons['2025'].guillotine.overrides=[{week:1,team:1}];});
const r2=db.guillotineRun(2025);
eq('forced chop honoured', nm(r2.weeks[0].chopped), 'Noah');
eq('marked as forced', r2.weeks[0].forced, true);
eq('the run diverges after it', nm(r2.weeks[1].chopped)!=='Noah', true);
await db.update('minigames',(mm)=>{delete mm.seasons['2025'].guillotine.overrides;});
eq('restored', nm(db.guillotineRun(2025).weeks[0].chopped), 'Matt');
print(fail?`\n${fail} FAILURE(S)`:'\nGuillotine passed.');
