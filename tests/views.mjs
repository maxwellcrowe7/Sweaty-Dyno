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

const { db } = await import('../js/db.js');
await db.init();

const views = {
  dashboard:'../js/views/dashboard.js', bank:'../js/views/bank.js', minigames:'../js/views/minigames.js',
  drafts:'../js/views/drafts.js', trades:'../js/views/trades.js', stats:'../js/views/stats.js',
  empire:'../js/views/empire.js', rules:'../js/views/rules.js', managers:'../js/views/managers.js', admin:'../js/views/admin.js' };

let fails = 0;
const seasons = [2025, 2026];
const variants = { rules:[{},{params:{year:'2026'}},{params:{year:'2026',tab:'changes'}},{params:{year:'2026',marks:'0'}},{params:{year:'2025'}}], stats:[{},{metric:'ceiling'},{focusTeam:3}], trades:[{tradeTab:'trades'},{tradeTab:'conditional'},{tradeTab:'waivers'}],
                   drafts:[{draftYear:2025},{draftYear:2026}], stats:[{},{focusTeam:3}] };

for (const S of seasons) {
  db.season = S;
  for (const [name, path] of Object.entries(views)) {
    const mod = await import(path);
    for (const st of (variants[name] || [{}])) {
      try {
        const html = mod.render(db, st);
        if (typeof html !== 'string' || html.length < 20) throw new Error('empty output');
        if (/undefined|NaN|\[object Object\]/.test(html)) {
          const m = html.match(/.{0,70}(undefined|NaN|\[object Object\]).{0,50}/);
          throw new Error('leaked value -> …' + m[0].replace(/\s+/g,' ') + '…');
        }
        // crude tag balance check
        const open = (html.match(/<div/g)||[]).length, close = (html.match(/<\/div>/g)||[]).length;
        if (open !== close) throw new Error(`div imbalance: ${open} open vs ${close} close`);
        print(`  ok   ${S} ${name}${Object.keys(st).length?' '+JSON.stringify(st):''}  (${html.length}b)`);
      } catch (e) { fails++; print(`  FAIL ${S} ${name} ${JSON.stringify(st)}\n       ${e.message}`); }
    }
  }
}
print(fails ? `\n${fails} failure(s)` : '\nAll views rendered clean.');

// auto-sync must never fire for a visitor, and must not throw when it does run
{
  const A = await import('../js/autosync.js');
  const before = db.isAdmin;
  print('\n— auto-sync gating —');
  print(`  ${A.shouldConsider(db) === false ? 'ok  ' : 'FAIL'} signed out: does not consider syncing: ${A.shouldConsider(db)}`);
  db.get('league').sleeper.autoSync = false;
  print(`  ${A.shouldConsider(db) === false ? 'ok  ' : 'FAIL'} disabled in config: stays off: ${A.shouldConsider(db)}`);
  db.get('league').sleeper.autoSync = true;
  const r = await A.run(db, () => {});
  print(`  ${r === null || typeof r === 'string' ? 'ok  ' : 'FAIL'} run() never throws: ${JSON.stringify(r)}`);
}
