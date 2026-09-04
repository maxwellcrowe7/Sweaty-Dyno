const FILES=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of FILES) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={_d:{},getItem(k){return this._d[k]??null},setItem(k,v){this._d[k]=v},removeItem(k){delete this._d[k]}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
// answer as Supabase would, so this exercises the real cloud read path
globalThis.fetch=async(u)=>{
  const url=String(u);
  if(url.includes('/rest/v1/sweaty_dyno_data'))
    return {ok:true,status:200,json:async()=>Object.entries(store).map(([key,value])=>({key,value:JSON.parse(JSON.stringify(value))}))};
  return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(store[url.split('/').pop().split('.json')[0]]))};
};
const {db}=await import('../js/db.js'); await db.init();
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w); if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

print('— team mapping —');
for (const [n,u] of [[1,'NoahG621'],[2,'Nealb17'],[3,'alexrcrowe'],[4,'Andrewnissen1'],[5,'dweierke34'],
                     [6,'maxcrowe'],[7,'kuti'],[8,'Tanner2431'],[9,'Gopherkid14'],[10,'3bnet']]) {
  const t=db.team(n); const m=db.managerById(t.managerId);
  eq(`T${n} -> ${u}`, m.sleeperUsername, u);
}
print('\n— totals unchanged by the remap —');
const all=db.bank();
eq('paid in',all.collected,1100); eq('paid out',all.disbursed,320); eq('bank',all.cash,780);
eq('empire pot',db.empire().pot,300);
eq('2025 surplus',(()=>{const b=db.bank(2025);
  return b.collected-(Number(db.league.empireContribution['2025'])||0)-(b.byCat.minigame||0)-(b.byCat.placement||0);})(),30);

print('\n— data followed the managers, not the numbers —');
const led=db.ledger();
const by=(n)=>led.find(t=>t.manager===n);
eq('Max won $120 (2025 mini 20 + 1st 100)', by('Max').won, 120);
eq('Tanner won $50 (2nd)', by('Tanner').won, 50);
eq('Noah won $0', by('Noah').won, 0);
eq('Max empire pts 20', db.empire().board.find(t=>t.manager==='Max').total, 20);
eq('Tanner empire pts 10', db.empire().board.find(t=>t.manager==='Tanner').total, 10);
const st=db.stats(2025);
eq('Andrew max PF 2538.45', st.rows.find(r=>r.manager==='Andrew').maxPF, 2538.45);
eq('Noah max PF 2056.85', st.rows.find(r=>r.manager==='Noah').maxPF, 2056.85);
const d=db.draft(2025);
eq('2025 1.01 Sam picks Jeanty',[d.picks[0].player,db.team(d.picks[0].pickedBy).manager],['Ashton Jeanty','Sam']);
eq('2025 1.02 slot Tanner -> Damon',[db.team(d.picks[1].slotTeam).manager,db.team(d.picks[1].pickedBy).manager],['Tanner','Damon']);
eq('2026 order starts Noah, ends Max',[db.team(db.draft(2026).order[0]).manager,db.team(db.draft(2026).order[9]).manager],['Noah','Max']);
const tr=db.trades();
eq('no unassigned sides left but Waterson', tr.trades.flatMap(t=>t.sides).filter(s=>s.team===null).length, 0);
eq('Ebnet trade now names a team', db.team(tr.trades.find(t=>t.id==='2025-04').sides[1].team).manager, 'Matt');
eq('no unassigned waivers left', tr.waivers.filter(w=>w.team===null).length, 0);
eq('Waterson claims -> Tyler', tr.waivers.filter(w=>w.team===9).length, 3);
eq('every team has a full name', db.teams().filter(t=>!t.fullName||!t.fullName.includes(' ')).length, 0);
eq('every team has a sleeper handle', db.teams().filter(t=>!t.sleeper).length, 0);
eq('T7 Sam Kutina', [db.team(7).fullName, db.team(7).sleeper], ['Sam Kutina','kuti']);
eq('T9 Tyler Waterson', [db.team(9).fullName, db.team(9).sleeper], ['Tyler Waterson','Gopherkid14']);
eq('T10 Matt Ebnet', [db.team(10).fullName, db.team(10).sleeper], ['Matt Ebnet','3bnet']);
eq('reading live from supabase', db.live, true);
eq('backend reports supabase', db.backend, 'supabase');
eq('no config warnings left', db.issues().filter(i=>i.level==='warn').length, 0);
eq('edit mode gated on sign-in', db.isAdmin, false);
print(fail?`\n${fail} FAILURE(S)`:'\nAll remap checks passed.');
