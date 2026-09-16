// Which rulebook the page shows. The trap: a ?year= param left in the URL was
// re-applied on every repaint, so choosing another season in the picker was
// overwritten instantly and the control looked dead.
const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
const _ls={};
globalThis.localStorage={getItem:(k)=>k in _ls?_ls[k]:null,
  setItem:(k,v)=>{_ls[k]=String(v)},removeItem:(k)=>{delete _ls[k]}};
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
  // and it is written down, so a reload does not quietly turn it back on
  ru.setMarks(false);
  eq('off is stored', localStorage.getItem('sweatydyno:rulemarks'), '0');
  ru.setMarks(true);
  eq('on clears the store', localStorage.getItem('sweatydyno:rulemarks'), null);
  await db.update('rules',(r)=>{ delete r.seasons['2026']; });
  db.season=2025;
}


print('\n— a draft you cannot see is not a missing book —');
{
  await db.update('rules',(r)=>{
    r.seasons['2026']={status:'draft',published:null,basedOn:2025,summary:null,
      sections:structuredClone(r.seasons['2025'].sections)};
  });
  db.season=2026;
  const asAdmin = ru.render(db,{params:{}});
  eq('signed in: the book renders', asAdmin.includes('rules-layout'), true);

  // signed out, or previewing as a guest: the draft is filtered out of view
  db.cloud={signedIn:false};
  const asGuest = ru.render(db,{params:{}});
  eq('the data is still there',  Boolean(db.get('rules').seasons['2026']), true);
  eq('but the book is hidden',   db.rulebook(2026), null);
  // the bug: this used to say "No 2026 rulebook yet", which reads as deleted
  eq('it says it is a draft',    asGuest.includes('2026 is still a draft'), true);
  eq('not that it is missing',   asGuest.includes('No 2026 rulebook yet'), false);
  eq('and offers no Start button', asGuest.includes('data-new-book'), false);
  eq('the dot still shows draft',  /book-dot draft/.test(asGuest), true);

  db.cloud={signedIn:true};
  await db.update('rules',(r)=>{ delete r.seasons['2026']; });
  db.season=2025;
}


print('\n— where the book actions live —');
{
  await db.update('rules',(r)=>{
    r.seasons['2026']={status:'draft',published:null,basedOn:2025,summary:null,
      sections:structuredClone(r.seasons['2025'].sections)};
  });
  const has=(h,k)=>h.includes(k);
  db.season=2026;
  const book=ru.render(db,{params:{}}), chg=ru.render(db,{params:{tab:'changes'}});
  eq('draft: edit, publish and delete on the bar',
     [has(book,'data-edit-mode'),has(book,'data-publish-book'),has(book,'data-delete-book')], [true,true,true]);
  eq('what changed: none of them',
     [has(chg,'data-edit-mode'),has(chg,'data-publish-book'),has(chg,'data-delete-book')], [false,false,false]);
  eq('no Start button on a book that exists', has(book,'data-new-book'), false);

  db.season=2025;
  const pub=ru.render(db,{params:{}});
  eq('published: no Publish, still deletable',
     [has(pub,'data-publish-book'),has(pub,'data-delete-book')], [false,true]);

  db.season=2027;
  const none=ru.render(db,{params:{}});
  eq('no book: Start is the only action',
     [has(none,'data-new-book'),has(none,'data-delete-book'),has(none,'data-edit-mode')], [true,false,false]);

  await db.update('rules',(r)=>{ delete r.seasons['2026']; });
  db.season=2025;
}


print('\n— the Mark changes control —');
{
  await db.update('rules',(r)=>{
    r.seasons['2026']={status:'published',published:'2026-09-01',basedOn:2025,summary:null,
      sections:structuredClone(r.seasons['2025'].sections)};
    r.seasons['2026'].sections[0].items[0].text='Edited.';
  });
  db.season=2026;
  const on=ru.render(db,{params:{}});
  eq('it is a button, not a switch', on.includes('data-marks'), true);
  eq('no slide toggle left on the page', on.includes('id="diffToggle"'), false);
  eq('active when marks are on', /data-marks aria-pressed="true"/.test(on), true);
  ru.setMarks(false);
  eq('inactive when off', /data-marks aria-pressed="false"/.test(ru.render(db,{params:{}})), true);
  ru.setMarks(true);
  // a manager sees no Edit/Publish/Delete, so the row would be empty without it
  db.cloud={signedIn:false};
  const mgr=ru.render(db,{params:{}});
  eq('managers get it too', mgr.includes('data-marks'), true);
  // and it is the last control either way, so it sits in the same place for both
  const last=(h)=>h.slice(0,h.indexOf('</span>', h.indexOf('bar-actions'))).lastIndexOf('data-marks') > -1;
  eq('it is the last control for a manager', last(mgr), true);
  eq('but none of the book actions',
     ['data-edit-mode','data-publish-book','data-delete-book'].some(k=>mgr.includes(k)), false);
  db.cloud={signedIn:true};
  // pointless on the changes view, which always shows the diff
  eq('not on What changed', ru.render(db,{params:{tab:'changes'}}).includes('data-marks'), false);
  // the actions menu must ship shut: CSS shows it inline on a desktop, and the
  // phone rules key the popover off this attribute
  eq('actions menu starts hidden', /data-book-menu-list hidden/.test(on), true);
  await db.update('rules',(r)=>{ delete r.seasons['2026']; });
  db.season=2025;
}

print(fail?`\n${fail} FAILURE(S)`:'\nRulebook navigation passed.');
