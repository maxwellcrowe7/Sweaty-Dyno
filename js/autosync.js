/* ============================================================
   AUTO-SYNC
   Sleeper's API is public and CORS-open, so the browser can pull it
   directly — no server, no scheduler, no credentials. When the
   commissioner opens the app signed in, anything new is fetched and
   written to the database, and the league sees it from then on.

   Deliberately conservative:
     - only the current season, only completed weeks
     - only when signed in (RLS refuses anyone else anyway)
     - skips the ~5 MB player file, so Max PF stays a manual button
     - does nothing if a recent sync already covered those weeks
   ============================================================ */
import * as SL from './sleeper.js';

const LAST = 'sweatydyno:autosync:v1';

const readLast = () => {
  try { return JSON.parse(localStorage.getItem(LAST) || '{}'); } catch { return {}; }
};
const writeLast = (v) => {
  try { localStorage.setItem(LAST, JSON.stringify(v)); } catch { /* private mode */ }
};

/** Should we even look? Cheap checks only — no network. */
export function shouldConsider(db) {
  const cfg = db.league.sleeper || {};
  if (cfg.autoSync === false) return false;
  if (!db.isAdmin) return false;                 // only the commissioner can write
  const season = db.league.currentSeason;
  if (!cfg.leagueIds?.[String(season)]) return false;
  const gapHours = Number(cfg.autoSyncHours ?? 6);
  const last = readLast()[String(season)];
  if (last && (Date.now() - last) < gapHours * 3600 * 1000) return false;
  return true;
}

/**
 * Pull anything new for the current season. Returns a short summary, or null
 * if there was nothing to do. Never throws — a failed sync must not stop the
 * app from loading.
 */
export async function run(db, onStep = () => {}) {
  const season = db.league.currentSeason;
  const id = db.league.sleeper.leagueIds[String(season)];
  try {
    const have = new Set(db.get('stats').weekly.filter((w) => w.season === season).map((w) => w.week));
    const weeks = await SL.completedWeeks(season, db.get('stats').regularSeasonWeeks);
    const missing = weeks.filter((w) => !have.has(w));

    // mark the attempt before doing the work, so a wobbly network does not
    // retry on every single page load
    writeLast({ ...readLast(), [String(season)]: Date.now() });

    if (!missing.length && have.size) return null;
    if (!weeks.length) return null;

    onStep('Checking Sleeper…');
    const map = await SL.buildRosterMap(id, db.get('managers'), db.teams(season));
    if (!Object.keys(map.rosterToTeam).length) return null;

    const rows = [];
    for (const w of weeks) {
      onStep(`Week ${w}…`);
      rows.push(...(await SL.fetchWeek(id, w, map.rosterToTeam)));
    }
    if (!rows.length) return null;

    await db.update('stats', (s) => {
      const prior = new Map(s.weekly.filter((x) => x.season === season)
        .map((x) => [`${x.week}:${x.team}`, x.maxPoints]));
      s.weekly = s.weekly.filter((x) => x.season !== season);
      for (const r of rows) s.weekly.push({
        season, week: r.week, team: r.team, points: r.points,
        maxPoints: prior.get(`${r.week}:${r.team}`) ?? null,
        opponent: null, result: null,
      });
      s.lastSleeperSync = new Date().toISOString().slice(0, 16).replace('T', ' ');
    });

    let placed = 0;
    try {
      const places = await SL.fetchStandings(id);
      const finished = Object.entries(places)
        .map(([place, roster]) => ({ season, place: Number(place), team: map.rosterToTeam[roster] }))
        .filter((f) => f.team);
      if (finished.length) {
        await db.update('bank', (b) => {
          b.finishes = [...(b.finishes || []).filter((f) => f.season !== season), ...finished]
            .sort((x, y) => x.season - y.season || x.place - y.place);
        });
        placed = finished.length;
      }
    } catch { /* no bracket until the playoffs */ }

    const newWeeks = missing.length || weeks.length;
    return `Synced ${newWeeks} week${newWeeks === 1 ? '' : 's'} from Sleeper`
      + (placed ? ` and ${placed} final places` : '');
  } catch {
    return null;   // stay quiet; the manual button reports properly
  }
}

/* ============================================================
   TRANSACTIONS
   Trades, waiver claims and free-agent adds, pulled per season.

   Kept out of run() above on purpose: Sleeper's transaction payloads carry
   player IDs and nothing else, so naming them means the ~5 MB player file.
   That download happens at most once — every name and position it resolves is
   written to players.json, so the next sync only needs it if a face is new,
   and nobody reading the app ever downloads it at all.
   ============================================================ */

/** pid -> name, from what we already know, reaching for Sleeper only if we must. */
async function namer(db, pids, onStep = () => {}) {
  const known = db.get('players').sleeperNames || {};
  const clubs = db.get('players').nflTeams || {};
  // A player we can already name still needs looking up if we have never
  // learned his club -- otherwise a cache built before clubs existed would keep
  // the fast path forever and the column would stay empty for good.
  const missing = [...new Set(pids)].filter((p) => !known[p] || !clubs[known[p]]);
  if (!missing.length) {
    return { nameOf: (p) => known[p], learned: {}, positions: {}, nflTeams: {} };
  }

  onStep('Loading the player list (~5 MB, once)…');
  const pl = await SL.players();
  const learned = {};
  const positions = {};
  const nflTeams = {};
  for (const p of missing) {
    const r = pl[String(p)];
    if (!r) continue;
    const name = r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ');
    if (!name) continue;
    learned[p] = name;
    // a retired or practice-squad player has no club; remember that we asked,
    // so he does not drag the big file down on every pull from now on
    nflTeams[name] = r.team || clubs[name] || '--';
    const pos = r.position || (Array.isArray(r.fantasy_positions) ? r.fantasy_positions[0] : null);
    if (pos) positions[name] = pos;
  }
  return { nameOf: (p) => known[p] || learned[p] || `Player ${p}`, learned, positions, nflTeams };
}

/**
 * Pull a season's transactions and merge them in. Sleeper is the source of
 * truth: anything it knows about replaces our copy of that transaction, and
 * anything hand-entered that Sleeper has never heard of is left alone.
 * Returns a short summary.
 */
export async function pullTransactions(db, season, onStep = () => {}) {
  const id = db.league.sleeper.leagueIds[String(season)];
  if (!id) return 'No Sleeper league ID for that season.';

  onStep('Matching rosters…');
  const map = await SL.buildRosterMap(id, db.get('managers'), db.teams(season));
  if (!Object.keys(map.rosterToTeam).length) return 'No rosters matched — check the aliases in managers.json.';

  /* Record who Sleeper thinks owns each franchise, so the Managers tab can flag
     a departure without a network call of its own. The roster-to-team map is
     kept too: once an owner changes, his roster no longer matches a manager,
     and last season's map is the only thing that still says which team it is. */
  await db.update('managers', (m) => {
    m.rosterMap = { ...(m.rosterMap || {}), [String(season)]: map.rosterToTeam };
    const known = m.rosterMap[String(season)] || {};
    const prior = Object.assign({}, ...Object.values(m.rosterMap || {}));
    const teams = {};
    for (const [rid, seen] of Object.entries(map.owners || {})) {
      const team = known[rid] ?? prior[rid];
      if (team) teams[String(team)] = seen;
    }
    m.rosterAudit = { season, at: new Date().toISOString().slice(0, 10), teams };
  });

  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  onStep('Reading transactions…');
  // first pass names nothing; it only tells us which players we need names for
  const raw = await SL.fetchTransactions(id, weeks, map.rosterToTeam, (pid) => String(pid));
  const pids = [
    ...raw.trades.flatMap((t) => t.sides.flatMap((s) => s.receives.map((r) => r.player).filter(Boolean))),
    ...raw.moves.flatMap((m) => [m.player, m.dropped].filter(Boolean)),
  ];
  const { nameOf, learned, positions, nflTeams } = await namer(db, pids, onStep);

  const name = (v) => (v == null ? null : nameOf(v));
  const trades = raw.trades.map((t) => ({
    id: `sl-${t.sleeperId}`, sleeperId: t.sleeperId, source: 'sleeper',
    season: db.seasonOf(t.date), date: t.date,
    sides: t.sides.map((s) => ({
      team: s.team,
      receives: s.receives.map((r) => (r.player ? { ...r, label: name(r.player) } : r)),
    })),
  }));
  const moves = raw.moves.map((m) => ({
    id: `sl-${m.sleeperId}`, sleeperId: m.sleeperId, source: 'sleeper',
    season: db.seasonOf(m.date), date: m.date, team: m.team, type: m.type,
    player: name(m.player), dropped: name(m.dropped), faab: m.faab,
  }));

  if (Object.keys(learned).length || Object.keys(positions).length) {
    await db.update('players', (p) => {
      p.sleeperNames = { ...(p.sleeperNames || {}), ...learned };
      p.positions = { ...positions, ...p.positions };
      // a player's NFL team DOES change, so the newer answer wins here
      p.nflTeams = { ...(p.nflTeams || {}), ...nflTeams };
    });
  }

  await db.update('trades', (t) => {
    // only this season's pulled rows are replaced — other seasons, and anything
    // hand-entered, stay exactly where they are
    const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
    const merge = (rows, fresh) => {
      const ids = new Set(fresh.map((x) => x.id));
      const stale = (r) => r.source === 'sleeper' && (r.season === season || ids.has(r.id));
      return [...rows.filter((r) => !stale(r)), ...fresh].sort(byDate);
    };
    t.trades = merge(t.trades, trades);
    t.waivers = merge(t.waivers, moves);
    t.lastTransactionSync = new Date().toISOString().slice(0, 16).replace('T', ' ');
  });

  return `${trades.length} trade${trades.length === 1 ? '' : 's'} and ${moves.length} pickup${moves.length === 1 ? '' : 's'} from ${season}`;
}
