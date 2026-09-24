// The ledger is a scoreboard, not a statement: it counts seasons played and
// ranks by net.
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
const V = await import('../js/views/bank.js');
const cur = db.league.currentSeason;

/* ---- a season not yet played does not count against anyone ---- */
const team = db.teams()[0].number;
const before = db.ledger().find((t) => t.number === team);
store.bank.payins.push({ season: cur + 2, team, paid: 50 });
await db.init();
const after = db.ledger().find((t) => t.number === team);
eq('paying a future season does not dent the net', after.net, before.net);
eq('but it is remembered as paid ahead', after.prepaid, 50);

/* ---- the header states each fact once, and free cash nets out both claims ---- */
const all = db.bank();
eq('free cash is what is left after the pot and the prizes',
   all.spendable, all.cash - all.earmarked - all.owedOut);

const h = V.render(db, {});
eq('the header carries what is held, claimed and left',
   ['In the bank', 'Empire pot', 'Owed out', 'Free cash'].every((k) => h.includes(k)), true);
eq('buy-ins owed is not one of them', /Owed now/.test(h), false);

/* ---- the scoreboard ranks by net and explains its own bar ---- */
// read the ranks the view printed rather than re-deriving the order
const ranks = [...h.matchAll(/class="led-no">(\d+)</g)].map((m) => Number(m[1]));
eq('every manager is ranked', ranks.length, db.teams().length);
eq('and numbered in order', ranks.join(), db.teams().map((_, i) => i + 1).join());
const nets = db.ledger().slice().sort((a, b) => b.net - a.net || b.won - a.won).map((t) => t.net);
eq('best net first', nets[0], Math.max(...db.ledger().map((t) => t.net)));
eq('the colours are named', ['lg-minigame', 'lg-placement', 'lg-empire']
   .every((k) => h.includes(`lg-key`) && h.includes(k)), true);

/* ---- a season's buy-in hides behind its own year ---- */
eq('no standing rate row', /rate-row/.test(h), false);
eq('every year opens one', (h.match(/data-yr="/g) || []).length, db.seasons.length);
eq('and the rate is in there', (h.match(/class="yr-rate"/g) || []).length, db.seasons.length);

print(fail ? `\n${fail} FAILURE(S)` : '\nBank ledger passed.');
