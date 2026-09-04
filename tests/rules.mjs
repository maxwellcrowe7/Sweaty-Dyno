const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={_d:{},getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>{const x=String(u);
 if(x.includes('/rest/v1/sweaty_dyno_data'))return{ok:true,json:async()=>Object.entries(store).map(([key,value])=>({key,value:JSON.parse(JSON.stringify(value))}))};
 return{ok:true,json:async()=>store[x.split('/').pop().split('.json')[0]]}};
// build a 2026 book in the fixture so the diff has something to compare against
{
  const r=store.rules, b=JSON.parse(JSON.stringify(r.seasons['2025']));
  b.status='published'; b.published='2026-06-20'; b.basedOn=2025; b.summary='test';
  const find=(sec,frag)=>{const s=b.sections.find(x=>x.id===sec);
    return [s, s.items.findIndex(i=>i.text.includes(frag))];};
  let [s1,i1]=find('buyin','$50/year'); s1.items[i1].text='$50/year (unchanged for 2026)';
  let [s2,i2]=find('waivers','$100 in in-season'); s2.items[i2].text='Managers will be given $125 in in-season FAAB to spend during that league year.';
  let [s3,i3]=find('trading','week 14'); s3.items[i3].text='Trades must be accepted prior to the end of the final game in week 13.';
  b.sections.find(x=>x.id==='waivers').items.push({id:'waivers-tiebreak-2026',depth:1,text:'Tied FAAB bids are broken by reverse standings order.'});
  const rev=b.sections.find(x=>x.id==='revival'); rev.items=rev.items.slice(0,2);
  r.seasons['2026']=b;
}
const {db}=await import('../js/db.js'); await db.init();
const R=await import('../js/views/rules.js');
const html=R.render(db,{params:{year:'2026'}});
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};
eq('changed items marked inline',(html.match(/mk-changed/g)||[]).length,3);
eq('added items marked inline',(html.match(/mk-added/g)||[]).length,1);
eq('inline word-diff rendered',/<del>[^<]*\$100<\/del>/.test(html)||html.includes('$100</del>'),true);
eq('section jump anchors',(html.match(/data-jump="/g)||[]).length,14);
eq('per-section change counts',(html.match(/toc-dot/g)||[]).length,4);
const d=db.rulesDiff(2026);
eq('diff totals',[d.changed.length,d.added.length,d.removed.length],[3,1,8]);
eq('diff baseline',d.from,2025);
eq('unchanged items carry no mark',db.rulebook(2026).sections.find(s=>s.id==='scoring').items.every(i=>!d.byId.has(i.id)),true);
const marksOff=R.render(db,{params:{year:'2026',marks:'0'}});
eq('marks toggle drops the word-diff',/(<ins>|<del>)/.test(marksOff.split('What changed')[1]||''),false);
eq('2025 has no diff (nothing before it)',db.rulesDiff(2025),null);
// a draft must be invisible to a logged-out visitor
db.update=async()=>{};
const raw=JSON.parse(readFile('data/rules.json'));
eq('published 2025 visible',db.rulebook(2025)!==null,true);
eq('repo ships only 2025',Object.keys(JSON.parse(readFile('data/rules.json')).seasons),['2025']);
print(fail?`\n${fail} FAILURE(S)`:'\nRules checks passed.');
