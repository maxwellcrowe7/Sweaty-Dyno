/* ============================================================
   DATA LAYER
   Every read and write in the app goes through this module, so
   swapping the JSON+localStorage adapter for Supabase later is a
   change to ONE file. See the SupabaseAdapter stub at the bottom.
   ============================================================ */

import { SUPABASE, isConfigured } from './config.js';
import { migrate } from './migrate.js';
import { Supabase } from './supabase.js';

const FILES = ['league', 'managers', 'bank', 'minigames', 'drafts', 'trades', 'stats', 'players', 'rules'];
const LS_KEY = 'sweatydyno:overlay:v1';
const LS_ADMIN = 'sweatydyno:admin';

/* ---------- adapter: static JSON + localStorage overlay ---------- */
class JsonAdapter {
  constructor(base = 'data') { this.base = base; this.data = {}; this.overlay = {}; }

  async load() {
    // Single-file build inlines the data, so there is nothing to fetch.
    if (globalThis.__SD_DATA) {
      this.data = structuredClone(globalThis.__SD_DATA);
      try { this.overlay = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { this.overlay = {}; }
      for (const [k, v] of Object.entries(this.overlay)) if (this.data[k]) this.data[k] = v;
      return migrate(this.data);
    }
    const bust = `?v=${Date.now()}`;
    const loaded = await Promise.all(FILES.map(async (f) => {
      const res = await fetch(`${this.base}/${f}.json${bust}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Could not load ${f}.json (${res.status})`);
      return [f, await res.json()];
    }));
    this.data = Object.fromEntries(loaded);
    try { this.overlay = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
    catch { this.overlay = {}; }
    for (const [k, v] of Object.entries(this.overlay)) if (this.data[k]) this.data[k] = v;
    return migrate(this.data);
  }

  get(key) { return this.data[key]; }

  async set(key, value) {
    this.data[key] = value;
    this.overlay[key] = value;
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.overlay)); }
    catch (e) { console.warn('Local save failed', e); }
  }

  /** Unsaved-to-git changes living only in this browser. */
  dirtyKeys() { return Object.keys(this.overlay); }
  async revert() { this.overlay = {}; try { localStorage.removeItem(LS_KEY); } catch {} await this.load(); }
}

/* ---------- store ---------- */
class Store {
  constructor(adapter) { this.a = adapter; this.subs = new Set(); }

  async init() {
    if (this.a.live) this.cloud = this.a;          // keep the client for auth either way
    try {
      await this.a.load();
    } catch (err) {
      if (!this.cloud) throw err;
      // Supabase is configured but not usable yet (schema not run, table not
      // seeded, grants missing). Fall back to the bundled JSON so the tool
      // still works, and let Admin explain + offer to publish.
      this.cloudError = err.message;
      this.a = new JsonAdapter();
      await this.a.load();
    }
    // A key the database has never seen — a feature shipped after the last
    // publish — would otherwise just vanish from the UI. Backfill it from the
    // bundled JSON and tell Admin it needs uploading.
    this.missingInCloud = [];
    if (this.live) {
      const gaps = FILES.filter((f) => this.get(f) == null);
      if (gaps.length) {
        const local = new JsonAdapter();
        try {
          await local.load();
          for (const f of gaps) if (local.get(f) != null) this.a.data[f] = local.get(f);
          this.missingInCloud = gaps.filter((f) => this.get(f) != null);
        } catch { /* offline: the gap simply stays */ }
      }
    }
    this.cloud?.onAuth?.(() => this.emit());       // re-render when the commish signs in/out
    return this;
  }

  /** True when reads and writes go straight to Supabase. */
  get live() { return Boolean(this.a.live); }
  /** The Supabase client, present whenever config.js is filled in. */
  get auth() { return this.cloud ?? null; }
  get backend() { return this.live ? 'supabase' : this.cloud ? 'local-fallback' : 'local'; }

  /** The copy shipped with the site, whatever backend is currently active. */
  async repoSnapshot() {
    const a = new JsonAdapter();
    await a.load();
    return a.data;
  }

  /**
   * Which files differ between the shipped copy and the database. Comparing
   * content rather than presence is the point: every key can exist and still
   * be months out of date, which is exactly what went wrong before.
   */
  async cloudDiff() {
    if (!this.cloud) return [];
    const repo = await this.repoSnapshot();
    const cloud = this.live ? this.a.data : {};
    return FILES
      .filter((f) => repo[f] !== undefined)
      .map((f) => ({
        key: f,
        differs: JSON.stringify(repo[f]) !== JSON.stringify(cloud[f]),
        missing: cloud[f] === undefined,
      }))
      .filter((x) => x.differs);
  }

  /** Overwrite the named files in the database with the shipped copy. */
  async publishToCloud(keys = null, onStep = () => {}) {
    if (!this.cloud) throw new Error('Supabase is not configured.');
    if (!this.cloud.signedIn) throw new Error('Sign in as commissioner first.');
    const repo = await this.repoSnapshot();
    const list = keys || FILES;
    for (const f of list) {
      if (repo[f] === undefined) continue;
      onStep(f);
      await this.cloud.set(f, repo[f]);
    }
    await this.cloud.load();
    this.a = this.cloud;
    this.cloudError = null;
    this.missingInCloud = [];
    try { localStorage.removeItem(LS_KEY); } catch {}
    this.emit();
  }
  get(k) { return this.a.get(k); }
  dirtyKeys() { return this.a.dirtyKeys?.() ?? []; }
  async revert() { await this.a.revert?.(); this.emit(); }

  async set(k, v) { await this.a.set(k, v); this.emit(); }
  /** Mutate a file in place: db.update('bank', b => { b.payouts.push(x) }) */
  async update(k, fn) { const d = structuredClone(this.get(k)); fn(d); await this.set(k, d); return d; }

  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { this.subs.forEach((f) => f()); }

  /* ---------- edit mode ----------
     With Supabase the gate is real: writes are refused by RLS unless a
     signed-in user made them. Without it, this is a local convenience
     switch only — the honest framing is "this browser", not "security". */
  get isAdmin() {
    if (this.cloud) return this.cloud.signedIn;
    return localStorage.getItem(LS_ADMIN) === '1';
  }
  setAdmin(on) {
    if (this.cloud) return;   // Supabase mode: sign in / out instead
    on ? localStorage.setItem(LS_ADMIN, '1') : localStorage.removeItem(LS_ADMIN);
    this.emit();
  }

  /* ================= derived selectors ================= */

  get league() { return this.get('league'); }
  get seasons() { return this.league.seasons; }

  managerById(id) { return this.get('managers').managers.find((m) => m.id === id) || null; }

  /** Every team, with the manager who owned it in `season`. */
  teams(season = this.season) {
    return this.get('managers').teams.map((t) => {
      const own = [...t.ownership]
        .filter((o) => o.fromSeason <= season && (o.toSeason == null || o.toSeason >= season))
        .sort((a, b) => b.fromSeason - a.fromSeason)[0] || t.ownership.at(-1);
      const m = own ? this.managerById(own.managerId) : null;
      return {
        number: t.number,
        name: t.name || (m ? `${m.name}` : `Team ${t.number}`),
        manager: m ? m.name : `Team ${t.number}`,
        fullName: m ? (m.fullName || m.name) : `Team ${t.number}`,
        sleeper: m?.sleeperUsername ?? null,
        managerId: m?.id ?? null,
        abandoned: !own,
        ownership: t.ownership,
      };
    });
  }
  team(n, season = this.season) { return n == null ? null : this.teams(season).find((t) => t.number === Number(n)) || null; }

  /** Current view season — set by the app shell, defaults to league config. */
  get season() { return this._season ?? this.league.currentSeason; }
  set season(s) { this._season = Number(s); this.emit(); }

  /* ---------- bank ---------- */

  /** What one team owes for a season. */
  buyIn(season) { return Number(this.league.buyIn?.[String(season)]) || 0; }

  /** Seasons that have actually started — the empire pot only accrues for these. */
  activeSeasons() { return this.seasons.filter((s) => s <= this.league.currentSeason); }

  /* ---------- payouts ----------
     Amounts are never stored. Each category derives from whatever produced it,
     so a corrected minigame result moves the money automatically and the books
     cannot drift from the results. `settled` records only who has been paid. */

  placementScale(season) {
    const p = this.league.placementPayouts || {};
    return p[String(season)] || p.default || {};
  }

  isSettled(season, category, team) {
    return (this.get('bank').settled || [])
      .some((x) => x.season === season && x.category === category && x.team === team);
  }

  /** Minigame winnings per team for a season, straight from the games. */
  minigameWinnings(season) {
    const s = this.minigames(season);
    const out = {};
    const add = (team, amt) => { if (team && amt) out[team] = (out[team] || 0) + amt; };
    for (const g of s.games || [])
      for (const pl of ['1', '2', '3']) add(g.results?.[pl]?.team, Number(g.payout?.[pl]) || 0);
    const run = this.guillotineRun(season);
    if (run?.winner) add(run.winner, Number(s.guillotine.payout?.['1']) || 0);


    // A season recorded before week-by-week tracking existed carries only totals.
    // Fall back to those rather than reporting $0 for a season that was paid.
    if (!Object.keys(out).length && s.legacy?.totalsByTeam)
      for (const [team, amt] of Object.entries(s.legacy.totalsByTeam)) add(Number(team), Number(amt) || 0);
    return out;
  }

  /** One block per category for a season, each with its rows and paid state. */
  payoutLines(season) {
    const claim = this.empireClaim();
    const settled = (c, t) => this.isSettled(season, c, t);

    const empireRows = claim && claim.season === season
      ? [{ team: claim.team, amount: claim.amount, paid: settled('empire', claim.team) }] : [];

    const scale = this.placementScale(season);
    const placementRows = (this.get('bank').finishes || [])
      .filter((f) => f.season === season)
      .map((f) => ({ team: f.team, place: f.place, amount: Number(scale[String(f.place)]) || 0,
                     paid: settled('placement', f.team) }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => a.place - b.place);

    const minigameRows = Object.entries(this.minigameWinnings(season))
      .map(([team, amount]) => ({ team: Number(team), amount, paid: settled('minigame', Number(team)) }))
      .sort((a, b) => b.amount - a.amount || a.team - b.team);

    return [
      { category: 'empire',    rows: empireRows },
      { category: 'placement', rows: placementRows },
      { category: 'minigame',  rows: minigameRows },
    ].map((l) => ({
      ...l,
      total: l.rows.reduce((a, r) => a + r.amount, 0),
      paidTotal: l.rows.filter((r) => r.paid).reduce((a, r) => a + r.amount, 0),
      paidCount: l.rows.filter((r) => r.paid).length,
    }));
  }

  /** Flat payout rows, all seasons or one. */
  payouts(season = null) {
    const seasons = season == null ? this.seasons : [season];
    return seasons.flatMap((s) => this.payoutLines(s)
      .flatMap((l) => l.rows.map((r) => ({ ...r, season: s, category: l.category }))));
  }

  bank(season = null) {
    const b = this.get('bank');
    const inSeason = (x) => season == null || x.season === season;
    const payins = b.payins.filter(inSeason);
    const teamCount = this.get('managers').teams.length;

    const collected = payins.reduce((a, p) => a + (Number(p.paid) || 0), 0);
    const expected = (season == null ? this.seasons : [season])
      .reduce((a, s) => a + this.buyIn(s) * teamCount, 0);

    const cur = this.league.currentSeason;
    const owedNow = (season == null ? this.seasons : [season])
      .filter((s) => s <= cur)
      .reduce((a, s) => a + Math.max(0, this.buyIn(s) * teamCount
        - b.payins.filter((p) => p.season === s).reduce((x, p) => x + (Number(p.paid) || 0), 0)), 0);

    const rows = this.payouts(season);
    const disbursed = rows.filter((r) => r.paid).reduce((a, r) => a + r.amount, 0);
    const committed = rows.reduce((a, r) => a + r.amount, 0);

    const byCat = {}, byCatCommitted = {};
    for (const r of rows) {
      byCatCommitted[r.category] = (byCatCommitted[r.category] || 0) + r.amount;
      if (r.paid) byCat[r.category] = (byCat[r.category] || 0) + r.amount;
    }

    const earmarked = season == null ? this.empirePotBalance() : 0;
    const cash = collected - disbursed;
    return {
      payins, payouts: rows, collected, expected,
      outstanding: Math.max(0, expected - collected),
      owedNow, future: Math.max(0, expected - collected - owedNow),
      disbursed, committed, owedOut: committed - disbursed,
      earmarked, cash, free: cash - earmarked,
      byCat, byCatCommitted, teamCount,
    };
  }

  /** Money set aside for the Empire so far, less anything already paid out. */
  empirePotBalance() {
    const contributed = this.activeSeasons()
      .reduce((a, s) => a + (Number(this.league.empireContribution?.[String(s)]) || 0), 0);
    const claim = this.empireClaim();
    const paid = claim && this.isSettled(claim.season, 'empire', claim.team) ? claim.amount : 0;
    return contributed - paid;
  }

  /** The season the pot was won, if it has been. */
  empireClaim() {
    const e = this.get('bank').empirePot;
    if (!e?.claimedBy) return null;
    const upTo = this.seasons.filter((s) => s <= e.claimedSeason)
      .reduce((a, s) => a + (Number(this.league.empireContribution?.[String(s)]) || 0), 0);
    return { team: e.claimedBy, season: e.claimedSeason, amount: Number(e.paidAmount) || upTo };
  }

  /** Per-team ledger. `owes` only ever counts seasons that have started. */
  ledger(season = null) {
    const b = this.get('bank');
    const cur = this.league.currentSeason;
    const rows = this.payouts(season);
    return this.teams().map((t) => {
      const ins = b.payins.filter((p) => p.team === t.number && (season == null || p.season === season));
      const mine = rows.filter((r) => r.team === t.number);
      const paidIn = ins.reduce((a, p) => a + (Number(p.paid) || 0), 0);
      const owesNow = (season == null ? this.seasons : [season])
        .filter((s) => s <= cur)
        .reduce((a, s) => a + Math.max(0, this.buyIn(s)
          - (ins.find((p) => p.season === s)?.paid || 0)), 0);
      const cat = {};
      for (const r of mine) cat[r.category] = (cat[r.category] || 0) + r.amount;
      const won = mine.reduce((a, r) => a + r.amount, 0);
      const awaiting = mine.filter((r) => !r.paid).reduce((a, r) => a + r.amount, 0);
      return { ...t, paidIn, owes: owesNow, owesNow, won, awaiting, net: won - paidIn, cat };
    });
  }

  /* ---------- empire ---------- */
  empire() {
    const b = this.get('bank'), L = this.league;
    const pot = this.empirePotBalance();
    const active = new Set(this.activeSeasons());
    const contributions = this.seasons.map((s) => ({
      season: s,
      amount: active.has(s) ? (Number(L.empireContribution?.[String(s)]) || 0) : 0,
    }));
    // Two ways to win: 2 titles, or 1 title AND the points threshold.
    // Points alone never claim it, so progress has to be measured against both.
    const titlesNeeded = L.empireTitlesToWin ?? 2;
    const board = this.teams().map((t) => {
      const rows = b.empirePoints.filter((e) => e.team === t.number);
      const bySeason = Object.fromEntries(this.seasons.map((s) =>
        [s, rows.filter((r) => r.season === s).reduce((a, r) => a + r.points, 0)]));
      const total = Object.values(bySeason).reduce((a, x) => a + x, 0);
      const titles = (b.finishes || []).filter((f) => f.team === t.number && f.place === 1).length;
      const ptsPct = L.empireThreshold ? Math.min(1, total / L.empireThreshold) : 0;
      const titlePct = titlesNeeded ? Math.min(1, titles / titlesNeeded) : 0;
      const eligible = !L.empireRequiresTitle || titles >= 1;
      return {
        ...t, bySeason, total, titles, eligible,
        needsTitle: L.empireRequiresTitle && titles === 0,
        titlesToGo: Math.max(0, titlesNeeded - titles),
        pointsToGo: Math.max(0, (L.empireThreshold || 0) - total),
        // closest of the two routes
        pct: Math.max(titlePct, eligible ? ptsPct : 0),
        wins: titles >= titlesNeeded || (eligible && total >= (L.empireThreshold || Infinity)),
      };
    }).sort((a, b2) => b2.pct - a.pct || b2.total - a.total || a.number - b2.number);
    return { pot, contributions, board, threshold: L.empireThreshold,
             titlesToWin: titlesNeeded, requiresTitle: Boolean(L.empireRequiresTitle),
             claimed: b.empirePot?.claimedBy ?? null };
  }

  /* ---------- minigames ---------- */
  minigames(season = this.season) {
    const s = this.get('minigames').seasons[String(season)];
    return s || { games: [], guillotine: null, legacy: null };
  }
  /** Minigames grouped by phase, each already in the order they are played. */
  minigamePhases(season = this.season) {
    const games = this.minigames(season).games || [];
    const ord = (g) => (g.phase === 'week' ? g.week : g.order) ?? 0;
    const pick = (ph) => games.filter((g) => (g.phase || 'week') === ph).sort((a, b) => ord(a) - ord(b));
    return [
      { phase: 'pre',  title: 'Preseason',   games: pick('pre') },
      { phase: 'week', title: 'Weekly slate', games: pick('week') },
      { phase: 'post', title: 'Post-season',  games: pick('post') },
    ];
  }

  minigameSpend(season = this.season) {
    const s = this.minigames(season);
    const won = (g) => Object.entries(g.results || {})
      .filter(([, r]) => r?.team).reduce((a, [pl]) => a + (Number(g.payout?.[pl]) || 0), 0);
    const paid = s.games.reduce((a, g) => a + won(g), 0)
      + (s.guillotine?.winner ? (Number(s.guillotine.payout?.['1']) || 0) : 0)

    const committed = s.games.reduce((a, g) => a + Object.values(g.payout || {}).reduce((x, y) => x + (Number(y) || 0), 0), 0)
      + Object.values(s.guillotine?.payout || {}).reduce((x, y) => x + (Number(y) || 0), 0)

    return { paid: paid + (s.legacy?.total || 0), committed, remaining: committed - paid };
  }

  /**
   * The guillotine, played out from the weekly scores rather than typed in.
   * Each week the lowest-scoring survivor is chopped, so the run is a pure
   * function of the results — it cannot disagree with the scoreboard.
   * `overrides` force a specific chop where a tie or a missing week needs a call.
   */
  guillotineRun(season = this.season) {
    const G = this.minigames(season).guillotine;
    if (!G) return null;

    const entrants = G.entrants?.length ? [...G.entrants] : this.teams(season).map((t) => t.number);
    const start = Number(G.startWeek) || 1;
    // one chop a week until a single manager is left
    const lastWeek = start + entrants.length - 2;

    const byWeek = {};
    for (const w of this.get('stats').weekly)
      if (w.season === season) (byWeek[w.week] ||= {})[w.team] = w.points;

    const overrides = new Map((G.overrides || []).map((o) => [o.week, o.team]));

    let pool = [...entrants];
    const weeks = [];
    for (let wk = start; wk <= lastWeek; wk++) {
      const scores = pool
        .map((t) => ({ team: t, points: byWeek[wk]?.[t] ?? null }))
        .sort((a, b) => (a.points ?? Infinity) - (b.points ?? Infinity) || a.team - b.team);
      const haveAll = scores.length > 0 && scores.every((x) => x.points != null);

      let chopped = overrides.has(wk) ? overrides.get(wk) : null;
      let tied = false;
      if (chopped == null && haveAll) {
        const low = scores[0].points;
        tied = scores.filter((x) => x.points === low).length > 1;
        chopped = scores[0].team;
      }
      weeks.push({
        week: wk,
        scores: scores.map((x) => ({ ...x, chopped: x.team === chopped })),
        chopped, tied,
        forced: overrides.has(wk),
        settled: chopped != null,
        waiting: !haveAll && chopped == null,
      });
      if (chopped == null) break;
      pool = pool.filter((t) => t !== chopped);
    }

    const done = weeks.length === entrants.length - 1 && weeks.every((w) => w.settled);
    return {
      startWeek: start, lastWeek, entrants,
      weeks, survivors: pool,
      winner: G.winner ?? (done && pool.length === 1 ? pool[0] : null),
      complete: done,
      chopped: weeks.filter((w) => w.settled).length,
    };
  }

  /* ---------- stats ---------- */
  stats(season = this.season) {
    const st = this.get('stats');
    const weekly = st.weekly.filter((w) => w.season === season);
    const weeks = [...new Set(weekly.map((w) => w.week))].sort((a, b) => a - b);
    const rows = this.teams(season).map((t) => {
      const mine = weekly.filter((w) => w.team === t.number);
      const total = mine.reduce((a, w) => a + w.points, 0);
      const maxpf = st.maxPF.find((m) => m.season === season && m.team === t.number)?.points ?? null;
      const scores = mine.map((w) => w.points);
      const ceil = mine.filter((w) => w.maxPoints != null);
      const maxTotal = ceil.reduce((a, w) => a + w.maxPoints, 0);
      // Max PF is a whole-season figure, so the ratio is only meaningful once the
      // weekly log actually covers the season. Partial data would report nonsense.
      const fullSeason = mine.length >= (st.regularSeasonWeeks || 14);
      return {
        ...t, total, maxPF: maxpf, games: mine.length, fullSeason,
        avg: mine.length ? total / mine.length : null,
        high: scores.length ? Math.max(...scores) : null,
        low: scores.length ? Math.min(...scores) : null,
        efficiency: fullSeason && maxpf && total ? total / maxpf : null,
        maxTotal: ceil.length ? Math.round(maxTotal * 100) / 100 : null,
        left: ceil.length ? Math.round((maxTotal - total) * 100) / 100 : null,
        byWeek: Object.fromEntries(mine.map((w) => [w.week, w.points])),
        byWeekMax: Object.fromEntries(ceil.map((w) => [w.week, w.maxPoints])),
      };
    });
    return { weeks, rows, weekly, hasData: weekly.length > 0,
             hasMaxPF: rows.some((r) => r.maxPF != null),
             hasEfficiency: rows.some((r) => r.efficiency != null),
             hasCeiling: rows.some((r) => r.maxTotal != null),
             regularSeasonWeeks: st.regularSeasonWeeks || 14 };
  }

  /* ---------- rules ---------- */

  /** Seasons with a rulebook, newest first. Drafts are hidden unless signed in. */
  rulebookSeasons() {
    const r = this.get('rules')?.seasons || {};
    return Object.keys(r).map(Number)
      .filter((s) => r[String(s)].status === 'published' || this.isAdmin)
      .sort((a, b) => b - a);
  }

  rulebook(season) {
    const b = this.get('rules')?.seasons?.[String(season)];
    if (!b) return null;
    if (b.status !== 'published' && !this.isAdmin) return null;
    return { season: Number(season), ...b };
  }

  /** The rulebook a given season was copied from — the diff baseline. */
  previousRulebook(season) {
    const b = this.get('rules')?.seasons?.[String(season)];
    if (!b) return null;
    if (b.basedOn) return this.get('rules').seasons[String(b.basedOn)]
      ? { season: Number(b.basedOn), ...this.get('rules').seasons[String(b.basedOn)] } : null;
    const earlier = Object.keys(this.get('rules').seasons).map(Number)
      .filter((s) => s < Number(season)).sort((a, b2) => b2 - a)[0];
    return earlier == null ? null : { season: earlier, ...this.get('rules').seasons[String(earlier)] };
  }

  /**
   * What changed between a rulebook and the one it was based on.
   * Items carry stable ids, so an edit reads as `changed` rather than as a
   * remove plus an add — which is the whole point of copying last year forward.
   */
  rulesDiff(season) {
    const cur = this.rulebook(season);
    const prev = this.previousRulebook(season);
    if (!cur || !prev) return null;

    const flat = (bk) => {
      const m = new Map();
      for (const sec of bk.sections)
        for (const it of sec.items) m.set(it.id, { ...it, section: sec.id, sectionTitle: sec.title });
      return m;
    };
    const A = flat(prev), B = flat(cur);

    const added = [], changed = [], removed = [];
    for (const [id, it] of B) {
      const was = A.get(id);
      if (!was) added.push(it);
      else if (was.text !== it.text) changed.push({ ...it, was: was.text });
    }
    for (const [id, it] of A) if (!B.has(id)) removed.push(it);

    const prevSecs = new Set(prev.sections.map((s) => s.id));
    const curSecs = new Set(cur.sections.map((s) => s.id));
    const sectionsAdded = cur.sections.filter((s) => !prevSecs.has(s.id));
    const sectionsRemoved = prev.sections.filter((s) => !curSecs.has(s.id));

    const byId = new Map();
    for (const it of added) byId.set(it.id, 'added');
    for (const it of changed) byId.set(it.id, 'changed');
    const wasById = new Map(changed.map((c) => [c.id, c.was]));

    const perSection = {};
    for (const sec of cur.sections) {
      const a = added.filter((x) => x.section === sec.id).length;
      const c = changed.filter((x) => x.section === sec.id).length;
      const d = removed.filter((x) => x.section === sec.id).length;
      if (a || c || d) perSection[sec.id] = { added: a, changed: c, removed: d, total: a + c + d };
    }

    return {
      from: prev.season, to: cur.season,
      added, changed, removed, sectionsAdded, sectionsRemoved,
      byId, wasById, perSection,
      count: added.length + changed.length + removed.length,
    };
  }

  /* ---------- drafts / trades ---------- */
  draft(season = this.season) { return this.get('drafts').rookie[String(season)] || null; }
  draftSeasons() { return Object.keys(this.get('drafts').rookie).map(Number).sort((a, b) => b - a); }
  position(player) { return this.get('players').positions[player] || null; }

  trades(season = null) {
    const t = this.get('trades');
    const f = (x) => season == null || x.season === season;
    return {
      trades: t.trades.filter(f).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      conditional: t.conditionalTrades.filter(f),
      waivers: t.waivers.filter(f).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.n - a.n),
    };
  }

  /** Conditional status, re-evaluated against today so "expired" is never stale. */
  conditionalStatus(c) {
    if (c.status === 'met') return { key: 'met', label: 'Condition met', chip: 'mint' };
    if (c.status === 'expired') return { key: 'expired', label: 'Expired', chip: 'red' };
    if (c.deadline && new Date(c.deadline) < new Date())
      return { key: 'expired', label: 'Deadline passed', chip: 'red' };
    return { key: 'open', label: 'Open', chip: 'gold' };
  }

  /* ---------- health checks surfaced in Admin ---------- */
  issues() {
    const out = [];
    const mg = this.get('managers');
    if (mg._placeholder || mg._unconfirmed) out.push({ level: 'warn', text: 'Team numbers are still provisional. Confirm TARGET in tools/remap_teams.py and re-run it.' });
    for (const a of mg.unresolvedAliases || [])
      if (!a.managerId) out.push({ level: 'warn', text: `Alias "${a.alias}" is not mapped to a manager (seen in ${a.seenIn.join(', ')}).` });
    const ids = Object.values(this.league.sleeper.leagueIds).filter(Boolean);
    if (!ids.length) out.push({ level: 'info', text: 'No Sleeper league ID set yet — stat sync is disabled.' });
    const d = this.dirtyKeys();
    if (d.length) out.push({ level: 'edit', text: `Unexported local changes in: ${d.join(', ')}.` });
    if (this.cloudError) out.push({ level: 'warn', text: `Supabase is configured but not serving data yet: ${this.cloudError}` });
    if (this.missingInCloud?.length) out.push({ level: 'warn',
      text: `Not in the database yet: ${this.missingInCloud.join(', ')}. Showing the built-in copy — sign in and Publish to upload.` });
    else if (!this.live) out.push({ level: 'info', text: 'Running on the JSON files. Add your Supabase keys in js/config.js to save changes live.' });
    return out;
  }

  /* ---------- export for committing back to the repo ---------- */
  exportFiles() {
    return FILES.map((f) => ({ name: `${f}.json`, json: JSON.stringify(this.get(f), null, 2) }));
  }
}

export const db = new Store(isConfigured() ? new Supabase(SUPABASE) : new JsonAdapter());

/* ============================================================
   The Supabase adapter lives in js/supabase.js. Point js/config.js at
   your project and the store above switches to it automatically — no
   view code changes, because every read and write goes through here.
   ============================================================ */
