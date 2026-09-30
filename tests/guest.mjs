// The guest preview: a commissioner can look at the app as the league sees it
// without signing out. The invariant worth guarding is that there is always a
// way OUT: the guest bar, drawn from asGuest on every page. Admin itself shows
// what the league sees, so its switch into the preview goes while you are in it.
const F=['league','managers','bank','minigames','drafts','trades','stats','players','rules'];
const store={}; for(const f of F) store[f]=JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.structuredClone=(o)=>JSON.parse(JSON.stringify(o));
globalThis.fetch=async(u)=>({ok:true,json:async()=>store[String(u).split('/').pop().split('.json')[0]]});
const {db}=await import('../js/db.js'); await db.init();
const mg=await import('../js/views/minigames.js');
const ad=await import('../js/views/admin.js');
let fail=0; const eq=(l,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w);if(!ok)fail++;
  print(`  ${ok?'ok  ':'FAIL'} ${l}: ${JSON.stringify(g)}${ok?'':' != '+JSON.stringify(w)}`);};
db.season=2026;
const editable=()=> (mg.render(db).match(/edit-pencil/g)||[]).length;

print('— signed out —');
eq('no rights', [db.hasAdminRights, db.isAdmin], [false,false]);
eq('no edit pencils', editable(), 0);
eq('no guest toggle offered', ad.render(db).includes('guestToggle'), false);
// a manager opening Admin sees the way in and nothing past it
const sections = (h) => (h.match(/class="section-title"/g) || []).length;
eq('Admin is the edit switch alone (local)', sections(ad.render(db)), 0);
db.cloud = { signedIn: false, user: null };   // Supabase configured, nobody signed in
{
  const h = ad.render(db);
  eq('Admin is the sign-in alone (Supabase)', [h.includes('data-signin'), sections(h), /Sleeper|Needs a look/.test(h)], [true, 0, false]);
}

print('\n— signed in —');
db.cloud={signedIn:true};
eq('rights and admin view', [db.hasAdminRights, db.isAdmin], [true,true]);
eq('edit pencils present', editable()>0, true);
eq('guest toggle offered', ad.render(db).includes('guestToggle'), true);
// it must not depend on the "Needs a look" list having anything in it -- that is
// a conditional block, and the toggle was originally nested inside it
const noIssues = { ...db, issues: () => [], __proto__: Object.getPrototypeOf(db) };
eq('offered even with no issues to show',
   ad.render(noIssues).includes('guestToggle'), true);

print('\n— previewing as a guest —');
db.setAsGuest(true);
eq('rights kept, admin view off', [db.hasAdminRights, db.isAdmin, db.asGuest], [true,false,true]);
eq('edit pencils gone', editable(), 0);
// Admin looks as it does to the league; the way back is the guest bar app.js
// draws on every page -- keyed on asGuest, so the preview can never strand you
eq('Admin shows the league\'s view: no switch, nothing else',
   [ad.render(db).includes('guestToggle'), /Sleeper|Needs a look/.test(ad.render(db))], [false, false]);
{
  const app = readFile('js/app.js');
  eq('the guest bar is the way back, drawn from asGuest',
     [/if \(!db\.asGuest\)/.test(app), /data-exit-guest/.test(app), /setAsGuest\(false\)/.test(app)], [true, true, true]);
}

print('\n— back out —');
db.setAsGuest(false);
eq('admin view restored', [db.isAdmin, db.asGuest], [true,false]);
eq('edit pencils back', editable()>0, true);

print('\n— a reload is an escape hatch —');
db.setAsGuest(true);
eq('not persisted anywhere', [localStorage.getItem('sweatydyno:guest'), db._asGuest], [null,true]);
// paid in full reads green for a manager too, not just the commissioner
{
  const B = await import('../js/views/bank.js');
  const h = B.render(db, {});
  eq('a guest sees the paid cells marked', /class="n cell-full"/.test(h), true);
}

print(fail?`\n${fail} FAILURE(S)`:'\nGuest preview passed.');
