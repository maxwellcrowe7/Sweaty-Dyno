// Headless smoke test: stub the browser, load real data, render every view.
const FILES = ['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store = {};
for (const f of FILES) store[f] = JSON.parse(readFile(`data/${f}.json`));

globalThis.localStorage = { _d:{}, getItem(k){return this._d[k]??null}, setItem(k,v){this._d[k]=v}, removeItem(k){delete this._d[k]} };
globalThis.structuredClone = (o) => JSON.parse(JSON.stringify(o));
globalThis.fetch = async (u) => {
  const url = String(u);
  // This suite covers the LOCAL backend (overlay + export). Refusing the cloud
  // read makes the store fall back to JsonAdapter, which is what we want to test.
  // The cloud path is covered by remap-check.mjs and supa-test.mjs.
  if (url.includes('/rest/v1/sweaty_dyno_data'))
    return { ok:false, status:401, json: async () => ({ message:'permission denied for table sweaty_dyno_data' }) };
  const k = url.split('/').pop().split('.json')[0];
  if (!(k in store)) throw new Error('no such file '+u);
  return { ok:true, status:200, json: async () => JSON.parse(JSON.stringify(store[k])) };
};
const mkEl = () => ({ className:'', style:{}, innerHTML:'', textContent:'', dataset:{},
  setAttribute(){}, removeAttribute(){}, toggleAttribute(){}, addEventListener(){}, append(){}, appendChild(){}, remove(){},
  querySelector:()=>null, querySelectorAll:()=>[], closest:()=>null, getBoundingClientRect:()=>({left:0,width:300}), elements:[] });
globalThis.document = { body:mkEl(), createElement:mkEl, querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){} };
globalThis.window = { addEventListener(){}, scrollTo(){} };
globalThis.requestAnimationFrame = (f)=>f();
globalThis.navigator = { clipboard:{ writeText:async()=>{} } };
globalThis.setTimeout = (f)=>{ return 0; };
globalThis.clearTimeout = ()=>{};
globalThis.URL = { createObjectURL:()=>'blob:x', revokeObjectURL(){} };
const { db } = await import('../js/db.js');
await db.init();
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  print(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ' != ' + JSON.stringify(want)}`);
};

print('— reconcile against the spreadsheet —');
const all = db.bank();
eq('paid in (sheet N9=1100)', all.collected, 1100);
eq('paid out (sheet O9=320)', all.disbursed, 320);
eq('bank total (sheet P9=780)', all.cash, 780);
eq('empire pot (sheet J30=300)', db.empire().pot, 300);
const b25 = db.bank(2025);
eq('2025 buy-in (C24=500)', b25.collected, 500);
eq('2025 minigames (E24=170)', b25.byCat.minigame, 170);
eq('2025 placement (F24=150)', b25.byCat.placement, 150);
eq('2025 surplus (G24=30)', b25.collected - (Number(db.league.empireContribution['2025'])||0)
   - (b25.byCat.minigame||0) - (b25.byCat.placement||0), 30);
eq('empire is an accrual, not a 2025 payout', b25.byCat.empire, undefined);
eq('2027 collected (row5=100)', db.bank(2027).collected, 100);
const emp = db.empire().board;
eq('empire leader', [emp[0].manager, emp[0].total], ['Max', 20]);
eq('empire total pts', emp.reduce((a,t)=>a+t.total,0), 46);
db.season = 2025;
const st = db.stats(2025);
eq('2025 max PF Andrew (2538.45)', st.rows.find(r=>r.manager==='Andrew').maxPF, 2538.45);
const A=st.rows.find(r=>r.manager==='Andrew');
eq('2025 Andrew season PF (Sleeper)', +A.total.toFixed(2), 2132.00);
eq('full regular season logged', st.weeks.length, 14);
eq('weekly ceiling sums to season max PF', +A.maxTotal.toFixed(2), +A.maxPF.toFixed(2));
eq('every week has a ceiling', db.get('stats').weekly.filter(w=>w.season===2025&&w.maxPoints==null).length, 0);
eq('Andrew wk1 actual/ceiling', [A.byWeek[1], A.byWeekMax[1]], [143.05, 185.95]);
eq('efficiency now computable', A.efficiency != null, true);
eq('bench points = ceiling - actual', +A.left.toFixed(2), +(A.maxPF - A.total).toFixed(2));
const d = db.draft(2025);
eq('2025 R1.01 = Ashton Jeanty by Sam', [d.picks[0].player, db.team(d.picks[0].pickedBy).manager, d.picks[0].traded], ['Ashton Jeanty','Sam',false]);
eq('2025 R1.02 slot Tanner, picked by Damon', [db.team(d.picks[1].slotTeam).manager, db.team(d.picks[1].pickedBy).manager], ['Tanner','Damon']);
eq('2026 1.10 = Max slot', db.team(db.draft(2026).order[9]).manager, 'Max');

print('\n— backend fallback —');
eq('cloud unreachable -> local backend', db.live, false);
eq('reason recorded for Admin', /permission denied/.test(db.cloudError||''), true);
eq('data still fully available', db.bank().collected, 1100);

print('\n— write paths —');
const before = db.bank().collected;
await db.update('bank', (b) => { b.payins.find(p=>p.team===3&&p.season===2027).paid = 50; });
eq('toggle buy-in paid +50', db.bank().collected, before + 50);
eq('overlay marked dirty', db.dirtyKeys().includes('bank'), true);
await db.update('bank', (b) => { b.payins.find(p=>p.team===3&&p.season===2027).paid = 0; });
eq('toggle back', db.bank().collected, before);

db.season = 2026;
await db.update('minigames', (m) => {
  const g = m.seasons['2026'].games[0];
  g.name = 'Closest to the Number'; g.payout = {1:10,2:5,3:0};
  g.results = {1:{team:7,value:'Ja’Marr Chase 41.2'},2:{team:2,value:null},3:null};
  g.status = 'final';
});
const mgLine = db.payoutLines(2026).find(l=>l.category==='minigame');
eq('bank derives the payout straight from the game', mgLine.rows.map(r=>[r.team,r.amount]).sort(), [[2,5],[7,10]]);
eq('derived total', mgLine.total, 15);
eq('nothing marked paid yet', mgLine.paidCount, 0);
eq('2026 minigame spend', db.minigameSpend(2026).paid, 15);
const g26 = db.guillotineRun(2026);
eq('guillotine runs from its start week', g26.startWeek, db.minigames(2026).guillotine.startWeek);
eq('last chop derived from the field size', g26.lastWeek, g26.startWeek + g26.entrants.length - 2);
eq('no scores yet, so nobody chopped', g26.chopped, 0);
await db.update('trades', (t) => { t.trades.push({id:'2026-01',season:2026,date:'2026-08-30',sides:[{team:1,receives:['Test Player']},{team:2,receives:['2027 1st (Andrew)']}],note:null}); });
eq('trade added', db.trades(2026).trades.length, 1);

print('\n— conditional status logic —');
const c = db.get('trades').conditionalTrades[0];
eq('met stays met', db.conditionalStatus(c).key, 'met');
eq('open+future deadline', db.conditionalStatus({status:'open',deadline:'2099-01-01'}).key, 'open');
eq('open+past deadline expires', db.conditionalStatus({status:'open',deadline:'2020-01-01'}).key, 'expired');

print('\n— optimal lineup (Max PF) —');
const SL = await import('../js/sleeper.js');
const pp = {a:30,b:25,c:20,d:15,e:10,f:5};
const pos = {a:'QB',b:'RB',c:'RB',d:'WR',e:'WR',f:'TE'};
const r = SL.optimalScore(pp, ['QB','RB','WR','FLEX','BN','BN'], (p)=>pos[p]);
eq('greedy picks QB30+RB25+WR15+FLEX20', r.total, 90);
eq('bench excluded', r.lineup.length, 4);

print('\n— revert —');
await db.revert();
eq('revert restores committed data', [db.bank().collected, db.trades(2026).trades.length, db.dirtyKeys().length], [1100, 0, 0]);

print(fail ? `\n${fail} FAILURE(S)` : '\nAll logic checks passed.');
