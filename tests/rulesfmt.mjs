// Inline formatting is stored as markers in the rule text, not as HTML. These
// pin the two things that matters: what a marker renders as, and that a pure
// formatting change is NOT a rule change (otherwise the book flags a rule as
// changed and the diff shows two identical sentences).
const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>({ok:true,json:async()=>store[String(u).split('/').pop().split('.json')[0]]});
const {db}=await import('../js/db.js'); await db.init();
const {fmt,unfmt}=await import('../js/util.js');
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

print('— markers render —');
eq('bold',      fmt('FAAB is **$100**'), 'FAAB is <strong>$100</strong>');
eq('italic',    fmt('see _also_ below'), 'see <em>also</em> below');
eq('underline', fmt('__must__ be paid'), '<u>must</u> be paid');
eq('all three', fmt('**a** _b_ __c__'), '<strong>a</strong> <em>b</em> <u>c</u>');
eq('longest first: __ is not two _', fmt('__x__'), '<u>x</u>');

print('\n— html can never get through —');
eq('tags are escaped', fmt('<script>bad()</script>'), '&lt;script&gt;bad()&lt;/script&gt;');
eq('and inside a marker too', fmt('**<b>x</b>**'), '<strong>&lt;b&gt;x&lt;/b&gt;</strong>');
eq('a stray marker is left alone', fmt('2 ** 3 and _ alone'), '2 ** 3 and _ alone');

print('\n— stripping —');
eq('unfmt removes markers', unfmt('**a** _b_ __c__'), 'a b c');
eq('unfmt leaves plain text', unfmt('nothing here'), 'nothing here');

print('\n— a formatting-only edit is not a rule change —');
{
  db.cloud={signedIn:true};   // a draft book is only readable to a commissioner
  const sec = db.get('rules').seasons['2025'].sections[0];
  const id = sec.items[0].id;
  const was = sec.items[0].text;
  await db.update('rules',(r)=>{
    const b = structuredClone(r.seasons['2025']);
    b.status='draft'; b.published=null; b.basedOn=2025;
    r.seasons['2026']=b;
  });
  const bold = (t)=>t.replace(/^(\S+)/, '**$1**');
  await db.update('rules',(r)=>{
    r.seasons['2026'].sections[0].items[0].text = bold(was);
  });
  eq('bolding a word leaves the rule unchanged', db.rulesDiff(2026).byId.get(id), undefined);
  await db.update('rules',(r)=>{
    r.seasons['2026'].sections[0].items[0].text = bold(was) + ' Now with a new clause.';
  });
  eq('but changing the words does mark it', db.rulesDiff(2026).byId.get(id), 'changed');
  await db.update('rules',(r)=>{ delete r.seasons['2026']; });
}

print('\n— markers never reach a diff view —');
{
  const ru=await import('../js/views/rules.js');
  await db.update('rules',(r)=>{
    const keep=['buyin'];
    r.seasons['2025'].sections=r.seasons['2025'].sections.filter(s=>keep.includes(s.id));
    r.seasons['2026']={status:'draft',published:null,basedOn:2025,summary:null,
      sections:structuredClone(r.seasons['2025'].sections)};
  });
  await db.update('rules',(r)=>{
    const b=r.seasons['2026'].sections[0];
    b.items[0].text='Buy-in is **$75** a year.';
    b.items.push({id:'new-one',depth:0,text:'A __late fee__ of _$10_ applies.'});
  });
  db.season=2026;
  const book=ru.render(db,{params:{}});
  const panel=ru.render(db,{params:{tab:'changes'}});
  eq('no ** in the marked-up book', /\*\*/.test(book), false);
  eq('no ** in the change list',    /\*\*/.test(panel), false);
  eq('no __ in the change list',    /__/.test(panel), false);
  eq('the new rule still reads',    panel.includes('late fee'), true);
  await db.update('rules',(r)=>{ delete r.seasons['2026']; });
}

print(fail?`\n${fail} FAILURE(S)`:'\nRule formatting passed.');
