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
print('\n— the money bar reconciles with the slate —');
for(const S of [2025,2026]){
  const b=db.minigameBreakdown(S), sp=db.minigameSpend(S);
  eq(`${S} parts sum to allocated`, b.parts.reduce((a,p)=>a+p.allocated,0), b.allocated);
  eq(`${S} allocated matches minigameSpend`, b.allocated, sp.committed);
  eq(`${S} awarded matches minigameSpend`, b.awarded, sp.paid);
  eq(`${S} unallocated = allowance - allocated`, b.unallocated, b.budget-b.allocated);
  eq(`${S} awarded never exceeds allocated`, b.awarded<=b.allocated, true);
  // the bar splits each section bright/dull at awarded, so a part that paid out
  // more than it set aside would render past its own block
  eq(`${S} no part awards more than it allocated`,
     b.parts.every(p=>p.awarded<=p.allocated), true);
  eq(`${S} part awards sum to the total`, b.parts.reduce((a,p)=>a+p.awarded,0), b.awarded);
  eq(`${S} four parts, always the same four`, b.parts.map(p=>p.key), ['pre','week','post','guil']);
  // the count is real games, not the 18 always-there week slots
  eq(`${S} counts named games only`, b.games,
     db.minigames(S).games.filter(g=>g.name).length + (db.minigames(S).guillotine?1:0));
}
const b25=db.minigameBreakdown(2025);
eq('2025 splits 130/30/10 across weekly/post/guillotine',
   b25.parts.map(p=>p.allocated), [0,130,30,10]);
eq('2025 is fully awarded', [b25.allocated,b25.awarded], [170,170]);
eq('2025 leaves $30 of the allowance free', b25.unallocated, 30);
const b26=db.minigameBreakdown(2026);
eq('2026 has only the guillotine allocated', b26.parts.map(p=>p.allocated), [0,0,0,10]);
eq('2026 nothing awarded yet', b26.awarded, 0);
eq('nobody is over the allowance', [b25.over,b26.over], [0,0]);

print(fail?`\n${fail} FAILURE(S)`:'\nAll checks passed.');
