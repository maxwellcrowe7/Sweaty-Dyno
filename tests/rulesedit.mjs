// Reading the edited document back out. The whitelist is the point: only b/i/u
// become markers, so a paste from Word cannot put fonts or colours into a rule.
const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>({ok:true,json:async()=>store[String(u).split('/').pop().split('.json')[0]]});
const {db}=await import('../js/db.js'); await db.init();

let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};

const items=[
  {id:'a',depth:0,text:'Top level rule'},
  {id:'b',depth:1,text:'Nested under it'},
  {id:'c',depth:0,ordered:true,text:'First numbered'},
  {id:'d',depth:0,ordered:true,text:'Second numbered'},
];

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
