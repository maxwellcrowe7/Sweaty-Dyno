// Which rulebook the page shows. The trap: a ?year= param left in the URL was
// re-applied on every repaint, so choosing another season in the picker was
// overwritten instantly and the control looked dead.
const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>({ok:true,json:async()=>store[String(u).split('/').pop().split('.json')[0]]});
const {db}=await import('../js/db.js'); await db.init();
const ru=await import('../js/views/rules.js');
db.cloud={signedIn:true};
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

// a stand-in for the mounted DOM: mount only needs querySelector(All) to find nothing
const root={querySelector:()=>null,querySelectorAll:()=>[],_params:null};
const mount=(params)=>{ let went=null;
  ru.mount(root, db, (v,p)=>{went={v,p};}, ()=>{}, params); return went; };

print('— a ?year= deep link is used once, then dropped —');
await db.update('rules',(r)=>{
  r.seasons['2026']={status:'draft',published:null,basedOn:2025,summary:null,
    sections:structuredClone(r.seasons['2025'].sections)};
});
db.season=2025;
const went=mount({year:'2026'});
eq('it moved the shared season', db.season, 2026);
eq('and navigated with year cleared', went && went.p.year, null);

print('\n— once dropped, the picker wins —');
db.season=2025;
mount({});                       // no param any more
eq('stays where you put it', db.season, 2025);

print('\n— a year with no book is not silently swapped —');
db.season=2027;
const html=ru.render(db,{params:{}});
eq('says there is no 2027 book', html.includes('No 2027 rulebook yet'), true);
eq('and offers to start it', html.includes('data-new-book'), true);

print('\n— deleting a book —');
await db.removeRulebook(2026);
eq('2026 is gone', db.rulebookSeasons(), [2025]);
eq('2025 is untouched', db.rulebook(2025).sections.length > 0, true);
db.season=2025;
eq('and it renders', ru.render(db,{params:{}}).includes('rules-layout'), true);


print('\n— the tabs are reachable from both tabs —');
{
  await db.update('rules',(r)=>{
    r.seasons['2026']={status:'draft',published:null,basedOn:2025,summary:null,
      sections:structuredClone(r.seasons['2025'].sections)};
    r.seasons['2026'].sections[0].items[0].text='Changed for the test.';
  });
  db.season=2026;
  const book   = ru.render(db,{params:{}});
  const changes= ru.render(db,{params:{tab:'changes'}});
  eq('rulebook view offers both tabs',
     ['data-rtab="rules"','data-rtab="changes"'].every(x=>book.includes(x)), true);
  // the regression: opening What changed used to hide the way back
  eq('changes view still offers both tabs',
     ['data-rtab="rules"','data-rtab="changes"'].every(x=>changes.includes(x)), true);
  eq('changes view shows the change list', changes.includes('What changed'), true);
  eq('and drops the contents rail', changes.includes('class="toc'), false);
  eq('rulebook view keeps it', book.includes('class="toc'), true);
  await db.update('rules',(r)=>{ delete r.seasons['2026']; });
  db.season=2025;
}


print('\n— Mark changes survives leaving the tab —');
{
  await db.update('rules',(r)=>{
    r.seasons['2026']={status:'draft',published:null,basedOn:2025,summary:null,
      sections:structuredClone(r.seasons['2025'].sections)};
    r.seasons['2026'].sections[0].items[0].text='Edited for the test.';
  });
  db.season=2026;
  const marked=()=>/class="rule-flag/.test(ru.render(db,{params:{}}));
  eq('on by default', marked(), true);
  ru.setMarks(false);
  eq('off once you turn it off', marked(), false);
  // this is the bug: it used to ride on a URL param, which was dropped the
  // moment you navigated away, so coming back silently switched it on again
  mount({});                       // a repaint, as if returning to the tab
  eq('still off after coming back', marked(), false);
  ru.setMarks(true);
  eq('and back on when you say so', marked(), true);
  await db.update('rules',(r)=>{ delete r.seasons['2026']; });
  db.season=2025;
}

print(fail?`\n${fail} FAILURE(S)`:'\nRulebook navigation passed.');
