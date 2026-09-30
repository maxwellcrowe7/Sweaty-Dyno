// Every Home link that names a spot on another tab (data-at) must find that spot
// (data-anchor) there, or the link quietly lands at the top of the page.
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
// the local data has scores but no matchups: pair teams off so there are records
const W = store.stats.weekly;
for (const g of W) {
  const opp = ((g.team - 1 + g.week) % 10) ^ 1;
  const o = W.find((x) => x.week === g.week && ((x.team - 1 + g.week) % 10) === opp);
  g.opponent = o.team; g.result = g.points > o.points ? 'W' : g.points < o.points ? 'L' : 'T';
}
store.stats.weekly = W.filter((g) => g.week <= 9);
const { db } = await import('../js/db.js');
await db.init();
db.today = () => '2025-10-15'; db.season = 2025;
const home = (await import('../js/views/dashboard.js')).render(db, {});
// arriving at a spot on Stats must show the Season side, whichever was left open
const pages = {
  stats: (await import('../js/views/stats.js')).render(db, { arrive: true, params: { at: 'x' }, statTab: 'all' }),
  minigames: (await import('../js/views/minigames.js')).render(db, {}),
  // arriving at a trade must show the Trades tab, whichever was left open
  trades: (await import('../js/views/transactions.js')).render(db, { arrive: true, params: { at: 'trade-x' }, tradeTab: 'waivers' }),
};
let fails = 0, n = 0;
for (const [, to, at] of home.matchAll(/data-go="(\w+)" data-at="([^"]+)"/g)) {
  n++;
  if (!(pages[to] || '').includes(`data-anchor="${at}"`)) { fails++; print(`  FAIL ${to} has no spot "${at}"`); }
}
if (n < 4) { fails++; print(`  FAIL only ${n} Home links name a spot`); }
print(fails ? `\n${fails} failure(s)` : `Home links: all ${n} spots found.`);
