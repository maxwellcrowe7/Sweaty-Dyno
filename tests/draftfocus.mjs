// Picking one manager out of the draft board: his head and every pick he made,
// including the ones he traded for in someone else's column.
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
const D = await import('../js/views/drafts.js');
db.season = db.draftSeasons()[0];
const d = db.draft(db.season);

const plain = D.render(db, {});
eq('nothing is picked out by default', /board-grid focused/.test(plain), false);

const team = d.picks[0].pickedBy;
const h = D.render(db, { params: { team: String(team) } });
const made = d.picks.filter((p) => p.pickedBy === team).length;
eq('the board is in focus mode', /board-grid focused/.test(h), true);
eq('every pick he made is lit', (h.match(/class="pick[^"]* on"/g) || []).length, made);
eq('and his column head with them', new RegExp(`data-focus-team="${team}" aria-pressed="true"`).test(h), true);
eq('one head is lit, not all of them', (h.match(/aria-pressed="true"/g) || []).length, 1);

print(fail ? `\n${fail} FAILURE(S)` : '\nDraft focus passed.');
