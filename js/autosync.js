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
