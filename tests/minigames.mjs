const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={_d:{},getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>{const s=String(u);
 if(s.includes('/rest/v1/sweaty_dyno_data'))return{ok:true,json:async()=>Object.entries(store).map(([key,value])=>({key,value:JSON.parse(JSON.stringify(value))}))};
 return{ok:true,json:async()=>store[s.split('/').pop().split('.json')[0]]}};
const {db}=await import('../js/db.js'); await db.init();
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

print('— 2025 minigames rebuilt from the rulebook —');
const s=db.minigames(2025);
eq('18 weeks scheduled', s.games.filter(g=>(g.phase||'week')==='week').length, 18);
eq('weeks with no game (9,16,17)', s.games.filter(g=>g.phase==='week'&&g.status==='none').map(g=>g.week), [9,16,17]);
eq('week 18 cancelled', s.games.find(g=>g.phase==='week'&&g.week===18).status, 'canceled');
eq('4 post-season minigames', s.games.filter(g=>g.phase==='post').length, 4);
eq('one of them cancelled', s.games.filter(g=>g.phase==='post'&&g.status==='canceled').length, 1);
const gr=db.guillotineRun(2025);
eq('guillotine runs wk1 to wk9', [gr.startWeek, gr.lastWeek], [1,9]);
eq('9 chops, 1 survivor', [gr.chopped, gr.survivors.length], [9,1]);
eq('guillotine winner Andrew', db.team(gr.winner).manager, 'Andrew');
eq('spend reconciles with the bank', db.minigameSpend(2025).paid, 170);

print('\n— chops match the Sleeper scores we pulled —');
const st=db.stats(2025);
let m=0;
for(const w of gr.weeks){
  const row=st.rows.find(r=>r.number===w.chopped);
  if(Math.abs(row.byWeek[w.week]-w.scores[0].points)<0.02) m++;
}
eq('all 9 chop scores match actual weekly points', m, 9);

print('\n— empire win condition —');
const e=db.empire();
eq('needs 2 titles, or 1 + 50', [e.titlesToWin, e.threshold, e.requiresTitle], [2,50,true]);
const max=e.board.find(t=>t.manager==='Max');
eq('Max: 1 title, 20 pts', [max.titles, max.total], [1,20]);
eq('Max eligible, needs 1 more title or 30 pts', [max.eligible, max.titlesToGo, max.pointsToGo], [true,1,30]);
eq('Max has not won yet', max.wins, false);
const tanner=e.board.find(t=>t.manager==='Tanner');
eq('Tanner has points but no title -> not eligible', [tanner.total, tanner.titles, tanner.eligible], [10,0,false]);
eq('leader is the one with a title', e.board[0].manager, 'Max');

print('\n— rules —');
eq('one published rulebook', db.rulebookSeasons(), [2025]);
eq('14 sections', db.rulebook(2025).sections.length, 14);
eq('no diff for the first book', db.rulesDiff(2025), null);
eq('empire section states both routes',
  db.rulebook(2025).sections.find(x=>x.id==='empire').items.some(i=>i.text.includes('2 titles OR 1 title and 50+')), true);
print(fail?`\n${fail} FAILURE(S)`:'\nAll checks passed.');
