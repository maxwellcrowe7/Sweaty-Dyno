// The franchise directory: who holds what, who held it before, and the way
// through to the pages that carry their numbers.
let fail = 0;
const eq = (l, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  print(`  ${ok ? 'ok  ' : 'FAIL'} ${l}: ${JSON.stringify(g)}${ok ? '' : ' != ' + JSON.stringify(w)}`); };

const F = ['league', 'managers', 'bank', 'minigames', 'drafts', 'trades', 'stats', 'players', 'rules'];
const store = {}; for (const f of F) store[f] = JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage = { _d: {}, getItem: () => null, setItem() {}, removeItem() {} };
globalThis.structuredClone = (o) => JSON.parse(JSON.stringify(o));
globalThis.fetch = async (u) => {
  const x = String(u);
  if (x.includes('/rest/v1/sweaty_dyno_data')) {
    return { ok: true, json: async () => Object.entries(store)
      .map(([key, value]) => ({ key, value: JSON.parse(JSON.stringify(value)) })) };
  }
  return { ok: true, json: async () => store[x.split('/').pop().split('.json')[0]] };
};

const { db } = await import('../js/db.js');
await db.init();
const V = await import('../js/views/managers.js');

const h = V.render(db, {});
eq('a row for every franchise', (h.match(/class="fr"/g) || []).length, db.teams().length);
eq('each one offers a way into their trades',
   (h.match(/data-go-trades="/g) || []).length, db.teams().length);
eq('and into their draft board and their season',
   [(h.match(/data-go-drafts="/g) || []).length, (h.match(/data-go-stats="/g) || []).length],
   [db.teams().length, db.teams().length]);

// a crown for a title, and nothing for a franchise that has not won one
const champ = (db.get('bank').finishes || []).find((f) => f.place === 1);
const rowOf = (n) => h.split('class="fr"').find((x) => x.includes(`>${String(n).padStart(2, '0')}<`)) || '';
eq('the champion wears a crown', /fr-rings">\s*<svg/.test(rowOf(champ.team)), true);
const noRing = db.teams().map((t) => t.number)
  .find((n) => !(db.get('bank').finishes || []).some((f) => f.place === 1 && f.team === n));
eq('and nobody else does', /fr-rings">\s*<svg/.test(rowOf(noRing)), false);

// ownership history appears only where there is any
eq('one owner, no history line', /fr-hist/.test(h), false);
// writing needs a session; the shape is what matters here, so edit the store
store.managers.teams.find((x) => x.number === 4).ownership = [
  { managerId: 'andrew', fromSeason: 2025, toSeason: 2026 },
  { managerId: 'matt', fromSeason: 2027, toSeason: null }];
await db.init();
eq('a franchise that changed hands says so', /fr-hist/.test(V.render(db, {})), true);

// the commissioner is named once, on his own row
eq('the commissioner is marked', (h.match(/fr-comm/g) || []).length, 1);
eq('and it is the one league.json names',
   rowOf(db.teams().find((t) => t.managerId === db.league.commissioner).number).includes('fr-comm'), true);

// the figures that belong to other tabs are not repeated here
const back = V.render(db, {});
eq('no money on the directory', /Paid in|Net<|Empire<\/div>/.test(back), false);

print(fail ? `\n${fail} FAILURE(S)` : '\nFranchise directory passed.');
