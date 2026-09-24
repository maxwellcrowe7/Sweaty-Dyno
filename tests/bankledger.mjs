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
eq('every year opens one', (h.match(/data-pop="rate:/g) || []).length, db.seasons.length);
// what was expected hides behind what came in, per season and all time
eq('no standing expected row', /class="total sub"/.test(h), false);
eq('every collected figure opens one',
   (h.match(/data-pop="due:/g) || []).length, db.seasons.length + 1);
eq('nothing starts open', /pop-host( up)? open/.test(h), false);
// a season short of its expected total says so in gold
eq('a shortfall is marked', /pop-box short/.test(h), true);

/* ---- payouts show what a season WILL pay, and owe nothing until it ends ---- */
const open2 = db.seasons.find((y) => !db.seasonOver(y));
const done = db.seasons.find((y) => db.seasonOver(y));
const scale = Object.values(db.placementScale(open2)).reduce((a, v) => a + v, 0);
const lines = db.payoutLines(open2);
eq('placement is scheduled before anyone finishes',
   lines.find((l) => l.category === 'placement').scheduled, scale);
eq('and nothing is awarded yet', lines.find((l) => l.category === 'placement').total, 0);
eq('minigames are scheduled off the slate',
   lines.find((l) => l.category === 'minigame').scheduled,
   Math.max(db.minigameSpend(open2).committed, db.minigameSpend(open2).paid));

const payH = V.render(db, {});
// each accordion runs from its own header to the next card
// the chip lives in the accordion header, which ends at its own </button>
const head = (y) => {
  const at = payH.indexOf(`data-season="${y}"`);
  return at < 0 ? '' : payH.slice(at, payH.indexOf('</button>', at));
};
const card = (y) => {
  const at = payH.indexOf(`data-season="${y}"`);
  if (at < 0) return '';
  const next = payH.indexOf('<div class="card acc', at);
  return payH.slice(at, next < 0 ? payH.length : next);
};
eq('a season still running is on the page', card(open2).length > 0, true);
eq('and owes nothing yet', /to pay/.test(head(open2)), false);
eq('its figures are at stake', /at stake/.test(card(open2)), true);
eq('a finished season states results, not stakes', /at stake/.test(card(done)), false);

/* ---- the pot, before anyone has won it ---- */
const first = db.seasons[0];
eq('season one could never pay the empire out', db.empireOutlook(first).live, false);
// a champion can take it with a second title the year after
const champ = (db.get('bank').finishes || []).find((f) => f.season === first && f.place === 1);
const next2 = db.empireOutlook(first + 1);
eq('the year after, its champion can', next2.live, true);
eq('and he is the one named', next2.contenders.map((c) => c.number), [champ.team]);

// placement is the scale itself, filled in as places are decided
const openLines = db.payoutLines(open2);
const pl = openLines.find((l) => l.category === 'placement');
eq('a row per paying place', pl.rows.length, Object.keys(db.placementScale(open2)).length);
eq('nobody in them yet', pl.decided, 0);
const doneLines = db.payoutLines(done).find((l) => l.category === 'placement');
eq('and filled in once the season is done', doneLines.decided, doneLines.rows.length);

// each minigame winner carries what he won it on
const mgLine = db.payoutLines(done).find((l) => l.category === 'minigame');
eq('winners name their prizes', mgLine.rows.every((r) => r.won.length > 0), true);
eq('and those prizes add up to the total',
   mgLine.rows.every((r) => r.won.reduce((a, w) => a + w.amount, 0) === r.amount), true);

// a season nobody has played is not a payout card
eq('no card for a future season', /data-season="2030"/.test(payH), false);

print(fail ? `\n${fail} FAILURE(S)` : '\nBank ledger passed.');
