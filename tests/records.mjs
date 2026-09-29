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



/* Lineup efficiency is answerable from week one: the ratio only needs both
   halves to cover the same weeks, not a whole season. */
const E = 2098;
db.get('stats').weekly.push(
  { season:E, week:1, team:1, points:90,  maxPoints:100, opponent:2, result:'W' },
  { season:E, week:1, team:2, points:60,  maxPoints:120, opponent:1, result:'L' },
);
const ste = db.stats(E);
ok('efficiency after one week', ste.hasEfficiency, true);
ok('T1 started 90% of its ceiling', ste.rows.find((x) => x.number === 1).efficiency, 0.9);
ok('T2 left 60 on the bench', ste.rows.find((x) => x.number === 2).left, 60);

/* A week with no ceiling must not drag the ratio down -- it is not evidence. */
db.get('stats').weekly.push({ season:E, week:2, team:1, points:80, maxPoints:null, opponent:2, result:'W' });
ok('a ceiling-less week is excluded', db.stats(E).rows.find((x) => x.number === 1).efficiency, 0.9);

/* ---- the playoff cut ----
   Six spots: five on record, the sixth on points for among everyone else. A
   team can miss on record and play in January anyway, which is the whole
   reason this is not the standings sorted by wins. */
const P = 2097;
const mk = (week, a, ap, b, bp) => ([
  { season:P, week, team:a, points:ap, maxPoints:null, opponent:b, result: ap > bp ? 'W' : 'L' },
  { season:P, week, team:b, points:bp, maxPoints:null, opponent:a, result: bp > ap ? 'W' : 'L' },
]);
/* T1..T5 win every week; T6..T10 lose every week. T6 loses to the one team
   scoring more than him, so he goes 0-2 with the second-most points in the
   league -- exactly the team the sixth seed exists for. */
for (const wk of [1, 2]) db.get('stats').weekly.push(
  ...mk(wk, 1, 210, 6, 200),                       // T6 scores 200 and still loses
  ...mk(wk, 2, 118, 7, 80), ...mk(wk, 3, 116, 8, 79),
  ...mk(wk, 4, 114, 9, 78), ...mk(wk, 5, 112, 10, 77),
);
const po = db.playoffSeeds(P);
const seedOf = (n) => po.rows.find((r) => r.number === n);
ok('six make it', po.rows.filter((r) => r.in).length, 6);
ok('the five record seeds are the five winners',
  po.rows.filter((r) => r.in && r.how === 'record').map((r) => r.number).sort(), [1, 2, 3, 4, 5]);
ok('T6 is 0-2 and in anyway', [seedOf(6).wins, seedOf(6).in, seedOf(6).seed], [0, true, 6]);
ok('T6 got there on points', seedOf(6).how, 'points');
ok('T7 missed despite a better record than T6', [seedOf(7).wins, seedOf(7).in], [0, false]);
ok('the chase names the nearest team', po.chase.chaser.number, 7);
ok('and the gap', po.chase.gap, 240);            // T6 400 vs T7 160
ok('points back is only for the teams that missed',
  [seedOf(1).back ?? null, seedOf(7).back], [null, 240]);
ok('below the line runs on points, so back reads down the column',
  po.rows.filter((r) => !r.in).map((r) => r.back), [240, 242, 244, 246]);
/* six spots play a four-team first round, so two sit it out */
ok('two byes', po.byes, 2);
ok('and they are the top two seeds', po.rows.filter((r) => r.bye).map((r) => r.seed), [1, 2]);

/* A points seed is the only thing that makes the sixth row special; without one
   the cut is just the record. */
db.league.pointsSeeds = 0;
const po2 = db.playoffSeeds(P);
ok('no points seed, no chase', po2.chase, null);
ok('six by record', po2.rows.filter((r) => r.in).map((r) => r.number), [1, 2, 3, 4, 5, 6]);
db.league.pointsSeeds = 1;

/* ---- season highlights, from the 2099 fixture above ----
   wk1: T1 100-90 T2, T3 80-70 T4 (both by 10). wk2: T2 110-60 T1, T3 105-50 T4.
   wk3: T1 120 unpaired. wk15: playoffs, never counted. */
const hl = db.seasonHighlights(S);
ok('top week is the best regular-season score', [hl.top.team, hl.top.week, hl.top.points], [1, 3, 120]);
ok('biggest blowout', [hl.blowout.team, hl.blowout.opponent, hl.blowout.week, hl.blowout.margin], [3, 4, 2, 55]);
ok('closest game', [hl.closest.margin, hl.closest.week], [10, 1]);
/* Live season: the runs still going. T3 won wk1 and wk2; T4 lost both; T1
   won then lost, and its unpaired wk3 is no result, so it sits on L1. */
ok('a live season counts the win streak still running',
  [hl.streaks.W.n, hl.streaks.W.runs.map((r) => r.team), hl.streaks.current], [2, [3], true]);
ok('and the losing one', [hl.streaks.L.n, hl.streaks.L.runs.map((r) => r.team)], [2, [4]]);
ok('a streak knows where it started and that it is still going',
  [hl.streaks.W.runs[0].from.week, hl.streaks.W.runs[0].to.week, hl.streaks.W.runs[0].live], [1, 2, true]);
ok('playoff weeks put the season in the playoffs', db.seasonStage(S), 'Playoffs');

print(fails ? `Records: ${fails} failed.` : 'Records passed.');
if (fails) throw new Error('records');
