/* ============================================================
   SLEEPER API CLIENT
   Sleeper's read API is public, keyless and CORS-open, so this
   works from GitHub Pages with no proxy and no secrets.
   Docs: https://docs.sleeper.com
   ============================================================ */

const API = 'https://api.sleeper.app/v1';

const get = async (path) => {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`Sleeper ${path} -> ${r.status}`);
  return r.json();
};

export const nflState = () => get('/state/nfl');
export const league   = (id) => get(`/league/${id}`);
export const users    = (id) => get(`/league/${id}/users`);
export const rosters  = (id) => get(`/league/${id}/rosters`);
export const matchups = (id, wk) => get(`/league/${id}/matchups/${wk}`);

/* Full player dictionary is ~5 MB — fetched at most once per page load,
   held in memory only, and needed just for the Max-PF optimal lineup. */
let _players = null;
export const players = async () => (_players ||= await get('/players/nfl'));
export const playersCached = () => _players;

/* ---------- roster -> team number ---------- */

/**
 * Build rosterId -> teamNumber using saved sleeperUserId, falling back to a
 * name match against each manager's aliases. Returns the map plus any
 * Sleeper users it could not place, so the UI can ask for help.
 */
export async function buildRosterMap(leagueId, managersFile, teamsForSeason) {
  const [us, rs] = await Promise.all([users(leagueId), rosters(leagueId)]);
  const byUser = new Map();
  const unmatched = [];

  for (const u of us) {
    const saved = managersFile.managers.find((m) => m.sleeperUserId === u.user_id);
    if (saved) { byUser.set(u.user_id, saved.id); continue; }
    const cands = [u.display_name, u.username, u.metadata?.team_name].filter(Boolean).map((s) => s.toLowerCase());
    const hit = managersFile.managers.find((m) =>
      [m.name, ...(m.aliases || []), m.sleeperUsername].filter(Boolean)
        .some((a) => cands.some((c) => c === a.toLowerCase() || c.includes(a.toLowerCase()))));
    if (hit) byUser.set(u.user_id, hit.id);
    else unmatched.push({ userId: u.user_id, name: u.display_name || u.username, team: u.metadata?.team_name || null });
  }

  const teamOf = (mid) => teamsForSeason.find((t) => t.managerId === mid)?.number ?? null;
  const rosterToTeam = {};
  for (const r of rs) {
    const mid = byUser.get(r.owner_id);
    const tn = mid ? teamOf(mid) : null;
    if (tn) rosterToTeam[r.roster_id] = tn;
  }
  return { rosterToTeam, unmatched, users: us, rosters: rs };
}

/* ---------- weekly points ---------- */

export async function fetchWeek(leagueId, week, rosterToTeam) {
  const ms = await matchups(leagueId, week);
  return ms
    .filter((m) => rosterToTeam[m.roster_id] && m.points != null)
    .map((m) => ({
      team: rosterToTeam[m.roster_id],
      week,
      points: Math.round(m.points * 100) / 100,
      rosterId: m.roster_id,
      matchupId: m.matchup_id ?? null,
      playersPoints: m.players_points || null,
      starters: m.starters || null,
    }));
}

/* ---------- optimal lineup (Max PF) ---------- */

const FLEX = {
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
};
const SKIP = new Set(['BN', 'IR', 'TAXI']);

/**
 * Best possible score from everyone rostered that week.
 * Slots are filled most-constrained first (fixed positions, then the
 * narrowest flex, then the widest), taking the top scorer each time.
 */
export function optimalScore(playersPoints, slots, posOf) {
  if (!playersPoints || !slots) return null;
  const pool = Object.entries(playersPoints)
    .map(([pid, p]) => ({ pid, p: Number(p) || 0, pos: posOf(pid) }))
    .filter((x) => x.pos)
    .sort((a, b) => b.p - a.p);

  const open = slots.filter((s) => !SKIP.has(s))
    .map((s) => ({ slot: s, accepts: FLEX[s] || [s] }))
    .sort((a, b) => a.accepts.length - b.accepts.length);

  const used = new Set();
  let total = 0;
  const lineup = [];
  for (const s of open) {
    const pick = pool.find((x) => !used.has(x.pid) && s.accepts.includes(x.pos));
    if (!pick) continue;
    used.add(pick.pid); total += pick.p;
    lineup.push({ slot: s.slot, ...pick });
  }
  return { total: Math.round(total * 100) / 100, lineup };
}

/**
 * Season Max PF per team = sum of each week's optimal lineup.
 * Downloads the player dictionary once; call only when the user asks for it.
 */
export async function fetchMaxPF(leagueId, weeks, rosterToTeam, onProgress = () => {}) {
  const lg = await league(leagueId);
  const slots = lg.roster_positions || [];
  onProgress('Loading player list (~5 MB, once)…');
  const pl = await players();
  const posOf = (pid) => {
    const p = pl[pid];
    if (!p) return null;
    return p.position || (Array.isArray(p.fantasy_positions) ? p.fantasy_positions[0] : null);
  };

  const totals = {};
  for (const wk of weeks) {
    onProgress(`Week ${wk}…`);
    const ms = await matchups(leagueId, wk);
    for (const m of ms) {
      const tn = rosterToTeam[m.roster_id];
      if (!tn || !m.players_points) continue;
      const best = optimalScore(m.players_points, slots, posOf);
      if (best) totals[tn] = Math.round(((totals[tn] || 0) + best.total) * 100) / 100;
    }
  }
  return totals;
}

/**
 * Final standings from the playoff brackets. Sleeper tags each placement game
 * with `p`: in the winners bracket p=1 is the championship (1st/2nd), p=3 the
 * third-place game, p=5 the fifth. The losers bracket numbers from 7th.
 * Returns { place: rosterId } for every place the brackets decided.
 */
export async function fetchStandings(leagueId) {
  const [win, lose] = await Promise.all([
    get(`/league/${leagueId}/winners_bracket`).catch(() => []),
    get(`/league/${leagueId}/losers_bracket`).catch(() => []),
  ]);
  const places = {};
  const take = (bracket, offset) => {
    for (const m of bracket) {
      if (!m.p || m.w == null || m.l == null) continue;
      places[offset + m.p] = m.w;
      places[offset + m.p + 1] = m.l;
    }
  };
  take(win, 0);
  take(lose, 6);          // losers bracket p=1 decides 7th
  return places;
}

/** Completed regular-season weeks for a season, per Sleeper's own clock. */
export async function completedWeeks(season, regularSeasonWeeks = 14) {
  const st = await nflState();
  const cur = Number(st.week) || 0;
  const done = String(st.season) === String(season) ? Math.max(0, cur - 1) : regularSeasonWeeks;
  return Array.from({ length: Math.min(done, regularSeasonWeeks) }, (_, i) => i + 1);
}
