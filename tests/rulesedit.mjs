// The text <-> items transform behind the inline rule editor. The thing worth
// guarding is id reuse: a rule keeps the id of whatever sat in its position, and
// that is the only reason an edit reads as "changed" instead of a delete + add.
const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>({ok:true,json:async()=>store[String(u).split('/').pop().split('.json')[0]]});
const {db}=await import('../js/db.js'); await db.init();
const {toText,toItems}=await import('../js/views/rules.js');
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

const items=[
  {id:'a',depth:0,text:'Top level rule'},
  {id:'b',depth:1,text:'Nested under it'},
  {id:'c',depth:0,ordered:true,text:'First numbered'},
  {id:'d',depth:0,ordered:true,text:'Second numbered'},
];

print('— round trip —');
eq('text shape', toText(items).split('\n'),
   ['Top level rule','    Nested under it','1. First numbered','1. Second numbered']);
// key ORDER differs (ordered lands after text); compare the values, not the shape
const norm=(xs)=>xs.map(x=>Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])));
eq('back to items', norm(toItems(toText(items), items, 'sec')), norm(items));

print('\n— the number you type does not matter —');
eq('7. still means "numbered"', toItems('7. hello', [], 'sec')[0],
   {id:'sec-hello',depth:0,text:'hello',ordered:true});
eq('and 1) works too', toItems('1) hello', [], 'sec')[0].ordered, true);
eq('a bare line is a bullet', toItems('hello', [], 'sec')[0].ordered, undefined);

print('\n— ids —');
eq('an edit in place keeps the id',
   toItems('Top level rule EDITED', items, 'sec')[0].id, 'a');
eq('a new line gets a slug', toItems('Top\nBrand new rule here', items, 'sec')[1].id, 'b');
eq('blank lines are dropped', toItems('a\n\n\nb', [], 'sec').length, 2);
eq('depth from four-space steps',
   toItems('a\n    b\n        c', [], 'sec').map(x=>x.depth), [0,1,2]);

print('\n— markers survive the trip —');
eq('formatting is just text', toItems('**bold** and _it_', [], 'sec')[0].text, '**bold** and _it_');

print('\n— a real section, edited in place —');
{
  db.cloud={signedIn:true};
  const sec = db.get('rules').seasons['2025'].sections[0];
  const ids = sec.items.map(i=>i.id);
  const edited = toItems(toText(sec.items), sec.items, sec.id);
  eq('every id is preserved', edited.map(i=>i.id), ids);
  eq('and the text is untouched', edited.map(i=>i.text), sec.items.map(i=>i.text));
}

print('\n— reading the edited document back out —');
{
  const {serializeNode}=await import('../js/views/rules.js');
  // serializeNode only reads nodeType / tagName / childNodes / nodeValue, so plain
  // objects stand in for a DOM that JavaScriptCore does not have
  const t=(v)=>({nodeType:3,nodeValue:v});
  const e=(tag,...kids)=>({nodeType:1,tagName:tag.toUpperCase(),childNodes:kids});
  const ser=(...kids)=>serializeNode(e('div',...kids));

  eq('bold becomes **',      ser(t('a '), e('b', t('x')), t(' b')), 'a **x** b');
  eq('strong too',           ser(e('strong', t('x'))), '**x**');
  eq('italic becomes _',     ser(e('i', t('x'))), '_x_');
  eq('em too',               ser(e('em', t('x'))), '_x_');
  eq('underline becomes __', ser(e('u', t('x'))), '__x__');
  eq('nested marks',         ser(e('b', t('a '), e('i', t('b')))), '**a _b_**');

  // the whitelist is the point: a paste from Word brings spans, fonts and
  // colours, and none of it may reach the stored rule
  eq('a pasted span is stripped', ser(e('span', t('x'))), 'x');
  eq('a font tag too',            ser(e('font', t('x'))), 'x');
  eq('a div keeps only its words',ser(e('div', e('p', t('a')), t('b'))), 'ab');
  eq('but bold inside a paste survives',
     ser(e('span', t('a '), e('b', t('x')))), 'a **x**');
  eq('an empty mark adds no markers', ser(e('b', t('   '))), '   ');
}
print(fail?`\n${fail} FAILURE(S)`:'\nRule editing passed.');
