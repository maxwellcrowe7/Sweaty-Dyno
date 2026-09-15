// Deleting one bullet used to rewrite the whole section: ids were handed out by
// POSITION, so every rule below the gap inherited its neighbour's id and the
// diff read them all as changed. Identity comes from the row's own id now.
const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>({ok:true,json:async()=>store[String(u).split('/').pop().split('.json')[0]]});
const {db}=await import('../js/db.js'); await db.init();
const {serializeSection}=await import('../js/views/rules.js');
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

// stand-ins for the rendered rows: serializeSection reads id, className and text
const row=(id,text,cls='rule-item d0')=>({
  nodeType:1, tagName:'LI',
  id: id===null?'':`i-${id}`, className:cls,
  classList:{contains:(c)=>cls.split(' ').includes(c)}, parentElement:{tagName:'UL'},
  childNodes:[{nodeType:3,nodeValue:text}],
});
const host=(rows)=>({querySelectorAll:()=>rows});

const items=[
  {id:'r1',depth:0,text:'One'},{id:'r2',depth:0,text:'Two'},
  {id:'r3',depth:0,text:'Three'},{id:'r4',depth:0,text:'Four'},
];

print('— deleting the middle bullet —');
const after = serializeSection(host([row('r1','One'),row('r3','Three'),row('r4','Four')]), items, 'sec');
eq('the survivors keep their own ids', after.map(x=>x.id), ['r1','r3','r4']);
eq('and their own text',               after.map(x=>x.text), ['One','Three','Four']);

// what the diff makes of it
await db.update('rules',(r)=>{
  r.seasons['2025'].sections=[{id:'sec',title:'Sec',items:structuredClone(items)}];
  r.seasons['2026']={status:'draft',published:null,basedOn:2025,summary:null,
    sections:[{id:'sec',title:'Sec',items:after}]};
});
db.cloud={signedIn:true};
const d=db.rulesDiff(2026);
eq('exactly one removal', [d.removed.length, d.removed[0].id], [1,'r2']);
eq('nothing marked changed', d.changed.length, 0);
eq('nothing marked added',   d.added.length, 0);

print('\n— editing one line in place —');
const edited = serializeSection(host([row('r1','One'),row('r2','Two, revised'),row('r3','Three'),row('r4','Four')]), items, 'sec');
eq('it keeps its id', edited[1].id, 'r2');
eq('and the others are untouched', edited.map(x=>x.id), ['r1','r2','r3','r4']);

print('\n— splitting a line (Enter clones the id) —');
const split = serializeSection(host([row('r1','One'),row('r2','Two'),row('r2','Newly typed'),row('r3','Three')]), items, 'sec');
eq('the first half keeps it', split[1].id, 'r2');
eq('the clone earns a new one', split[2].id !== 'r2' && split[2].id.startsWith('sec-'), true);
eq('ids are unique', new Set(split.map(x=>x.id)).size, split.length);

print('\n— a brand new row with no id —');
const added = serializeSection(host([row('r1','One'),row(null,'Fresh rule here')]), items, 'sec');
eq('gets a slug', added[1].id, 'sec-fresh-rule-here');


print('\n— the Mark changes toggle turns off ALL the marks —');
{
  const ru=await import('../js/views/rules.js');
  // a removal alone leaves nothing to flag -- a removed rule is not in the book.
  // Edit one as well so the marked-up view has something to show.
  await db.update('rules',(r)=>{ r.seasons['2026'].sections[0].items[0].text='One, revised'; });
  db.season=2026;
  const on  = ru.render(db,{params:{}});          // marks on (the default)
  const off = ru.render(db,{params:{marks:'0'}}); // marks off
  eq('on: the edited rule is flagged', /class="rule-flag/.test(on), true);
  eq('on: it is highlighted',          /\bmk-changed\b/.test(on), true);
  eq('on: with a word-level diff',     /<(ins|del)>/.test(on), true);
  // the toggle used to gate only the word-level diff, leaving the chip and the
  // orange bar on every touched rule
  eq('off: no CHANGED/NEW flags on rules', /class="rule-flag/.test(off), false);
  eq('off: no mk- highlight classes',      /\bmk-(changed|added)\b/.test(off), false);
  eq('off: no ins/del runs',               /<(ins|del)>/.test(off), false);
  eq('off: the rule text is still there',  off.includes('One, revised'), true);
}


print('\n— a deleted rule is shown back in its own place —');
{
  const ru=await import('../js/views/rules.js');
  await db.update('rules',(r)=>{
    r.seasons['2025'].sections=[{id:'sec',title:'Sec',items:[
      {id:'a',depth:0,text:'First'},{id:'b',depth:0,text:'Doomed'},{id:'c',depth:0,text:'Third'},
    ]}];
    r.seasons['2026']={status:'draft',published:null,basedOn:2025,summary:null,
      sections:[{id:'sec',title:'Sec',items:[
        {id:'a',depth:0,text:'First'},{id:'c',depth:0,text:'Third'},
      ]}]};
  });
  db.season=2026;
  const on = ru.render(db,{params:{}});
  eq('it is struck through', on.includes('<del>Doomed</del>'), true);
  eq('and flagged removed',  /mk-removed/.test(on), true);
  // between First and Third, where it used to be -- not appended at the end
  const at=(t)=>on.indexOf(t);
  eq('in its original position', at('First') < at('Doomed') && at('Doomed') < at('Third'), true);
  // and it is not in the book at all when marks are off
  const off = ru.render(db,{params:{marks:'0'}});
  eq('marks off: gone entirely', off.includes('Doomed'), false);
  eq('marks off: the rest remains', off.includes('First') && off.includes('Third'), true);
  // never editable: edit mode shows the real rules only
  eq('the section still has 2 rules', db.rulebook(2026).sections[0].items.length, 2);
}

print(fail?`\n${fail} FAILURE(S)`:'\nRule deletion passed.');
