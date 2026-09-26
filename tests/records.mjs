// Headless smoke test: stub the browser, load real data, render every view.
const FILES = ['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store = {};
for (const f of FILES) store[f] = JSON.parse(readFile(`data/${f}.json`));

globalThis.localStorage = { _d:{}, getItem(k){return this._d[k]??null}, setItem(k,v){this._d[k]=v}, removeItem(k){delete this._d[k]} };
globalThis.structuredClone = (o) => JSON.parse(JSON.stringify(o));
globalThis.fetch = async (u) => {
  const k = String(u).split('/').pop().split('.json')[0];
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
globalThis.Blob = class {};
globalThis.location = { hash:'' };

/* Records, points against, all-play and luck -- everything that only exists
   once Sleeper's matchups have been paired. Synthetic scores, so the answers
   can be worked out by hand. */
const { db } = await import('../js/db.js');
await db.init();

let fails = 0;
const ok = (name, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) { fails++; print(`  FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else print(`  ok   ${name}`);
};

/* Four teams, two weeks. Week 1: T1 100 beats T2 90; T3 80 beats T4 70.
   Week 2: T1 60 loses to T2 110; T3 105 beats T4 50.
   T1 all-play: wk1 beats 90/80/70 = 3-0; wk2 beats 50 only = 1-2. So 4-2. */
const S = 2099;
db.get('stats').weekly.push(
  { season:S, week:1, team:1, points:100, maxPoints:null, opponent:2, result:'W' },
  { season:S, week:1, team:2, points:90,  maxPoints:null, opponent:1, result:'L' },
  { season:S, week:1, team:3, points:80,  maxPoints:null, opponent:4, result:'W' },
  { season:S, week:1, team:4, points:70,  maxPoints:null, opponent:3, result:'L' },
  { season:S, week:2, team:1, points:60,  maxPoints:null, opponent:2, result:'L' },
  { season:S, week:2, team:2, points:110, maxPoints:null, opponent:1, result:'W' },
  { season:S, week:2, team:3, points:105, maxPoints:null, opponent:4, result:'W' },
  { season:S, week:2, team:4, points:50,  maxPoints:null, opponent:3, result:'L' },
);

const st = db.stats(S);
ok('records are detected', st.hasRecords, true);
const r = (n) => st.rows.find((x) => x.number === n);

ok('T1 record', [r(1).wins, r(1).losses, r(1).ties], [1, 1, 0]);
ok('T1 points for', r(1).total, 160);
ok('T1 points against', r(1).pa, 200);          // 90 + 110
ok('T1 differential', r(1).diff, -40);
ok('T1 all-play', [r(1).allPlayW, r(1).allPlayL], [4, 2]);
ok('T3 unbeaten', [r(3).wins, r(3).losses], [2, 0]);
ok('T3 all-play', [r(3).allPlayW, r(3).allPlayL], [3, 3]);

/* T3 outscored the league in only half its head-to-heads yet went 2-0, and T1
   outscored it in two thirds of them and went 1-1. The schedule is the whole
   difference, which is exactly what luck measures. */
ok('T1 expected wins', r(1).expWins, 1.33);      // 4/6 * 2
ok('T1 is unlucky', r(1).luck, -0.33);
ok('T3 is lucky', r(3).luck, 1);                 // 2 wins on 1.0 expected
ok('luck is zero-sum', Math.round(st.rows.reduce((a, x) => a + (x.luck || 0), 0) * 10) / 10, 0);

/* A week nobody was paired for still counts toward points, never toward a record. */
db.get('stats').weekly.push({ season:S, week:3, team:1, points:120, maxPoints:null, opponent:null, result:null });
const st2 = db.stats(S);
ok('unpaired week scores', st2.rows.find((x) => x.number === 1).total, 280);
ok('unpaired week is not a game', st2.rows.find((x) => x.number === 1).wins
  + st2.rows.find((x) => x.number === 1).losses, 2);

/* Playoff weeks are stored but never counted as regular-season form. */
db.get('stats').weekly.push(
  { season:S, week:15, team:1, points:200, maxPoints:null, opponent:3, result:'W', playoff:true },
  { season:S, week:15, team:3, points:150, maxPoints:null, opponent:1, result:'L', playoff:true },
);
const st3 = db.stats(S);
ok('playoff points stay out of the total', st3.rows.find((x) => x.number === 1).total, 280);
ok('playoff wins stay out of the record', st3.rows.find((x) => x.number === 1).wins, 1);
ok('playoff weeks are kept', db.playoffWeeks(S).length, 2);
ok('playoff week is not in the chart', st3.weeks.includes(15), false);

/* Head to head reads off the same pairings. */
const h2h = db.headToHead();
ok('T1 owns nobody', [h2h[1][2].w, h2h[1][2].l], [1, 1]);
ok('T3 owns T4', [h2h[3][4].w, h2h[3][4].l], [2, 0]);
ok('h2h ignores the playoffs', [h2h[1][3]?.w ?? 0], [0]);
ok('h2h points mirror', h2h[1][2].pa, h2h[2][1].pf);

print(fails ? `Records: ${fails} failed.` : 'Records passed.');
if (fails) throw new Error('records');
