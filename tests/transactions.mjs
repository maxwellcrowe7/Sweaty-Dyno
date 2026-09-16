// Sleeper describes a move as adds/drops keyed by roster. This checks we turn
// that into sides that read the way the deal actually happened -- including the
// three-team case, where "what I got" is NOT "what you gave".
let fail = 0;
const eq = (l, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  print(`  ${ok ? 'ok  ' : 'FAIL'} ${l}: ${JSON.stringify(g)}${ok ? '' : ' != ' + JSON.stringify(w)}`); };

const F = ['league', 'managers', 'bank', 'minigames', 'drafts', 'trades', 'stats', 'players', 'rules'];
const store = {}; for (const f of F) store[f] = JSON.parse(readFile(`data/${f}.json`));
globalThis.localStorage = { _d: {}, getItem: () => null, setItem() {}, removeItem() {} };
globalThis.structuredClone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- fixture: shapes taken from the real league feed ---------- */
const WEEKS = {
  1: [
    // a straight two-for-one, plus the third-rounder that came back
    { transaction_id: 't1', type: 'trade', status: 'complete', status_updated: Date.UTC(2025, 7, 15),
      roster_ids: [1, 6], adds: { 10235: 1 }, drops: { 10235: 6 },
      draft_picks: [{ round: 3, season: '2026', roster_id: 1, owner_id: 6, previous_owner_id: 1 }],
      waiver_budget: [] },
    // FAAB for a player
    { transaction_id: 't2', type: 'trade', status: 'complete', status_updated: Date.UTC(2025, 6, 9),
      roster_ids: [5, 6], adds: { 4098: 5 }, drops: { 4098: 6 }, draft_picks: [],
      waiver_budget: [{ sender: 5, receiver: 6, amount: 10 }] },
    // three teams: nobody's haul is the inverse of anybody else's
    { transaction_id: 't3', type: 'trade', status: 'complete', status_updated: Date.UTC(2025, 9, 1),
      roster_ids: [1, 5, 6], adds: { 100: 1, 200: 5, 300: 6 },
      drops: { 100: 5, 200: 6, 300: 1 }, draft_picks: [], waiver_budget: [] },
    { transaction_id: 'w1', type: 'waiver', status: 'complete', status_updated: Date.UTC(2025, 6, 12),
      roster_ids: [6], adds: { 5870: 6 }, drops: { 7596: 6 }, draft_picks: [],
      settings: { waiver_bid: 6 }, waiver_budget: [] },
    { transaction_id: 'w2', type: 'waiver', status: 'failed', status_updated: Date.UTC(2025, 6, 12),
      roster_ids: [3], adds: { 5870: 3 }, drops: null, draft_picks: [],
      settings: { waiver_bid: 9 }, waiver_budget: [] },
    { transaction_id: 'f1', type: 'free_agent', status: 'complete', status_updated: Date.UTC(2025, 8, 2),
      roster_ids: [3], adds: { 4444: 3 }, drops: null, draft_picks: [], waiver_budget: [] },
    { transaction_id: 'c1', type: 'commissioner', status: 'complete', status_updated: Date.UTC(2025, 4, 8),
      roster_ids: [2], adds: { 9999: 2 }, drops: null, draft_picks: [], waiver_budget: [] },
    // a bare drop is not an acquisition
    { transaction_id: 'f2', type: 'free_agent', status: 'complete', status_updated: Date.UTC(2025, 8, 3),
      roster_ids: [3], adds: null, drops: { 4444: 3 }, draft_picks: [], waiver_budget: [] },
  ],
  2: [],
};

globalThis.fetch = async (u) => {
  const m = String(u).match(/transactions\/(\d+)/);
  if (m) return { ok: true, json: async () => WEEKS[m[1]] || [] };
  return { ok: true, json: async () => store[String(u).split('/').pop().split('.json')[0]] };
};

const SL = await import('../js/sleeper.js');

const rosterToTeam = { 1: 1, 3: 3, 5: 5, 6: 6 };
const NAMES = { 10235: 'Roschon Johnson', 4098: 'Kareem Hunt', 100: 'Player A', 200: 'Player B',
  300: 'Player C', 5870: 'Oronde Gadsden', 7596: 'Cut Guy', 4444: 'Street Free Agent' };
const nameOf = (p) => NAMES[p] || `Player ${p}`;

const { trades, moves } = await SL.fetchTransactions('L', [1, 2], rosterToTeam, nameOf);

eq('three trades, and no commissioner surgery', trades.length, 3);
eq('failed claims never made it', moves.some((m) => m.sleeperId === 'w2'), false);
eq('a bare drop is not a pickup', moves.some((m) => m.sleeperId === 'f2'), false);
eq('two pickups', moves.length, 2);

/* ---- the two-team deal ---- */
const t1 = trades.find((t) => t.sleeperId === 't1');
const got = (t, team) => t.sides.find((s) => s.team === team).receives.map((r) => r.label);
eq('the player went one way', got(t1, 1), ['Roschon Johnson']);
eq('the pick came back the other', got(t1, 6), ['2026 3rd']);
eq('and it is stamped with whose pick it was', t1.sides.find((s) => s.team === 6).receives[0].pick,
   { season: 2026, round: 3, origin: 1 });
eq('dated off the day it settled', t1.date, '2025-08-15');

/* ---- FAAB reads as an asset, not a footnote ---- */
const t2 = trades.find((t) => t.sleeperId === 't2');
eq('cash is a thing you receive', got(t2, 6), ['$10 FAAB']);
eq('and the player is the other half', got(t2, 5), ['Kareem Hunt']);

/* ---- the three-team deal: provenance is the whole point ---- */
const t3 = trades.find((t) => t.sleeperId === 't3');
eq('three sides', t3.sides.length, 3);
eq('1 got A, and it came from 5', t3.sides.find((s) => s.team === 1).receives[0].from, 5);
eq('5 got B, and it came from 6', t3.sides.find((s) => s.team === 5).receives[0].from, 6);
eq('6 got C, and it came from 1', t3.sides.find((s) => s.team === 6).receives[0].from, 1);

/* ---- pickups ---- */
const w1 = moves.find((m) => m.sleeperId === 'w1');
eq('the bid came across', w1.faab, 6);
eq('so did the man he cut', w1.dropped, 'Cut Guy');
eq('a free agent has no bid', moves.find((m) => m.sleeperId === 'f1').faab, null);
eq('and is labelled as one', moves.find((m) => m.sleeperId === 'f1').type, 'free_agent');

/* ---- which season a date belongs to ---- */
const { db } = await import('../js/db.js');
await db.init();
eq('a date inside a window is filed there', db.seasonOf('2025-08-15'), 2025);
eq('and one in the next year is not', db.seasonOf('2026-01-06'), 2026);
await db.update('league', (L) => { L.seasonWindows['2026'] = { start: '2025-12-15', end: '2026-12-31' }; });
eq('a moved window moves the transaction with it', db.seasonOf('2025-12-20'), 2026);
eq('the rest of 2025 stays put', db.seasonOf('2025-08-15'), 2025);

print(fail ? `\n${fail} FAILURE(S)` : '\nTransactions passed.');
