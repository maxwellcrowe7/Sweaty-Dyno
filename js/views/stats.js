import { esc, icon, teamTag, pts, empty, teamColor, money, seasonPicker } from '../util.js';

/* ---------------------------------------------------------------
   Charts here deliberately use ONE accent series over recessive
   context lines rather than ten categorical hues: ten hues cannot be
   told apart under colour-vision deficiency, and on a phone the
   spaghetti is unreadable. Identity is always carried by a label too.
   --------------------------------------------------------------- */

const PAD = { t: 14, r: 16, b: 26, l: 40 };

/* The size the chart should be drawn at, once it has been checked after the
   page settled -- null until then, when the check at draw time is used. */
let WIDE = null;

function lineChart(rows, weeks, focus, key = 'byWeek', both = false) {
  if (!weeks.length) return '';
  /* Taller where there is room for it. The viewBox fixes the aspect ratio, so a
     desktop that wants more height needs a taller drawing, not a CSS height --
     and a phone keeps the shorter one, since there every pixel is scroll. */
  const wide = WIDE ?? (typeof window !== 'undefined' && window.matchMedia?.('(min-width:621px)').matches);
  const W = 640, H = wide ? 290 : 240;
  /* Axis labels are drawn in viewBox units, and a phone shrinks the whole
     drawing to a little over half size -- 10 units came out near 5.5px. So the
     phone drawing gets bigger labels and a deeper bottom margin to hold them. */
  const FS = wide ? 10 : 16;
  const PB = wide ? PAD.b : 32;
  /* Both: one manager against his own best lineup. The league's lines go --
     the question is no longer how he compares with everyone else -- and the
     scale is fitted to his two lines alone, so the gap between them reads. */
  const fr = rows.find((r) => r.number === focus);
  const vals = both
    ? (fr ? [...Object.values(fr.byWeek), ...Object.values(fr.byWeekMax)] : [])
    : rows.flatMap((r) => Object.values(r[key]));
  if (!vals.length) return '';
  const lo = Math.floor(Math.min(...vals) / 20) * 20 - 10;
  const hi = Math.ceil(Math.max(...vals) / 20) * 20 + 10;
  const x = (w) => PAD.l + ((w - weeks[0]) / Math.max(1, weeks.at(-1) - weeks[0])) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PB);
  const path = (r, k = key) => weeks.filter((w) => r[k][w] != null)
    .map((w, i) => `${i ? 'L' : 'M'}${x(w).toFixed(1)} ${y(r[k][w]).toFixed(1)}`).join(' ');
  // the bench: the band between what he could have started and what he did
  const band = (r) => {
    const wk = weeks.filter((w) => r.byWeek[w] != null && r.byWeekMax[w] != null);
    if (wk.length < 2) return '';
    const top = wk.map((w, i) => `${i ? 'L' : 'M'}${x(w).toFixed(1)} ${y(r.byWeekMax[w]).toFixed(1)}`);
    const bot = [...wk].reverse().map((w) => `L${x(w).toFixed(1)} ${y(r.byWeek[w]).toFixed(1)}`);
    return `${top.join(' ')} ${bot.join(' ')} Z`;
  };

  const ticks = [];
  for (let i = 0; i <= 4; i++) ticks.push(lo + ((hi - lo) / 4) * i);
  const f = rows.find((r) => r.number === focus);

  return `
  <div style="position:relative">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;touch-action:pan-y"
         role="img" aria-label="Weekly points by week; ${esc(f?.manager ?? '')} highlighted"
         data-chart data-w="${W}" data-lo="${lo}" data-hi="${hi}" data-wide="${wide ? 1 : 0}">
      ${ticks.map((t) => `
        <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"
              stroke="#28323F" stroke-width="1"/>
        <text x="${PAD.l - 8}" y="${(y(t) + FS * 0.35).toFixed(1)}" text-anchor="end"
              fill="#7C8BA0" font-size="${FS}" font-family="Inter,sans-serif">${Math.round(t)}</text>`).join('')}
      ${weeks.map((w) => `<text x="${x(w).toFixed(1)}" y="${H - 8}" text-anchor="middle"
              fill="#7C8BA0" font-size="${FS}" font-family="Inter,sans-serif">${w}</text>`).join('')}
      ${both ? '' : rows.filter((r) => r.number !== focus).map((r) =>
        `<path class="ln" data-line="${r.number}" d="${path(r)}" fill="none" stroke="#3A4657"
               stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
      ${both && f ? `<path d="${band(f)}" fill="rgba(255,107,44,.13)" stroke="none"/>
        <path d="${path(f, 'byWeekMax')}" fill="none" stroke="var(--heat)" stroke-opacity=".6"
              stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${f ? `<path d="${path(f, both ? 'byWeek' : key)}" fill="none" stroke="var(--heat)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round" filter="drop-shadow(0 0 6px rgba(255,107,44,.4))"/>
        ${weeks.filter((w) => f[both ? 'byWeek' : key][w] != null).map((w) => `
          <circle cx="${x(w).toFixed(1)}" cy="${y(f[both ? 'byWeek' : key][w]).toFixed(1)}" r="4"
                  fill="var(--heat)" stroke="#141B24" stroke-width="2"/>`).join('')}` : ''}
      <line data-cross x1="0" x2="0" y1="${PAD.t}" y2="${H - PB}" stroke="#5A6A80" stroke-width="1"
            stroke-dasharray="3 3" opacity="0"/>
      ${/* A 1.5px line is not a target. These sit on top, invisible and twelve
           pixels wide, and are the only thing the pointer ever actually hits --
           so a line can be hovered and clicked at the width it is drawn. */''}
      ${both ? '' : rows.filter((r) => r.number !== focus).map((r) =>
        `<path class="ln-hit" data-hit="${r.number}" d="${path(r)}" fill="none" stroke="transparent"
               stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    </svg>
    <div data-tip style="position:absolute;pointer-events:none;opacity:0;transition:opacity .12s;
      background:var(--surface-3);border:1px solid var(--line);border-radius:8px;padding:7px 10px;
      font-size:12px;white-space:nowrap;box-shadow:var(--shadow);z-index:3"></div>
  </div>`;
}

/* ---------- lineups: one bar per manager, all four numbers at once ----------
   The whole bar is his Max PF, the filled part the points he actually started,
   the rest what he left on the bench -- so efficiency is simply how full the bar
   is. The toggle picks which of the four is printed beside it and how the list
   is sorted; the bar itself never changes. */
const LU = [
  ['eff', 'Efficiency', (r) => r.eff, 'desc', (v) => (v * 100).toFixed(1) + '%'],
  ['pf', 'Points for', (r) => r.pf, 'desc', pts],
  ['max', 'Max PF', (r) => r.max, 'desc', pts],
  ['bench', 'Bench', (r) => r.bench, 'asc', pts],
];

/* Where the bars start. Everyone's Max PF sits within a few hundred points of
   everyone else's, so bars from zero come out near-identical; starting at half
   the lowest points-for keeps the whole of every bar on screen while spreading
   first from last. Recomputed from the data every render, so it moves with the
   season -- a hundred-odd in week two, eight hundred by week fourteen -- and
   rounded to a figure worth printing on the axis. */
function luFloor(rows) {
  const low = Math.min(...rows.map((r) => r.pf));
  const half = low / 2;
  const step = half >= 500 ? 100 : half >= 100 ? 50 : 10;
  return Math.max(0, Math.floor(half / step) * step);
}

function lineupBars(st, key) {
  const rows = st.rows.filter((r) => r.games > 0 && r.maxTotal != null).map((r) => ({
    ...r, max: r.maxTotal, bench: r.left, pf: r.maxTotal - r.left, eff: r.efficiency,
  }));
  if (!rows.length) return '';
  const [, , get, dir, fmt] = LU.find(([k]) => k === key) || LU[0];
  rows.sort((a, b) => (dir === 'asc' ? get(a) - get(b) : get(b) - get(a)));
  const lo = luFloor(rows);
  const hi = Math.max(...rows.map((r) => r.max));
  const w = (v) => ((v / (hi - lo)) * 100).toFixed(2);

  /* A proper axis along the bottom, ticked at round figures, rather than two
     loose numbers over the top. The floor is always labelled -- it is the one
     thing about the scale nobody would guess -- and a tick too close to it or
     to the end is dropped rather than printed on top of its neighbour. */
  const range = hi - lo;
  const step = [50, 100, 200, 250, 500, 1000, 2000].find((v) => range / v <= 5) || 5000;
  const at = (v) => ((v - lo) / range) * 100;
  const ticks = [{ v: lo, p: 0 }];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step)
    if (at(v) > 15 && at(v) < 96) ticks.push({ v, p: at(v) });

  return `
    <div class="rows">${rows.map((r) => `
      <div class="row lu">
        <span class="lu-who">${teamTag(r)}</span>
        <span class="led-bar lu-bar">
          <button class="lu-pf" data-luseg style="width:${w(r.pf - lo)}%"
            aria-label="Points for ${pts(r.pf)}"><em>Points for <b>${pts(r.pf)}</b></em></button>
          <button class="lu-bench" data-luseg style="width:${w(r.bench)}%"
            aria-label="Bench ${pts(r.bench)}, Max PF ${pts(r.max)}"><em>Bench <b>${pts(r.bench)}</b>
            &middot; Max PF <b>${pts(r.max)}</b></em></button>
        </span>
        <b class="lu-fig">${fmt(get(r))}</b>
      </div>`).join('')}
    </div>
    <div class="lu-axis"><span></span><span class="lu-scale">${ticks.map((t) =>
      `<i style="left:${t.p.toFixed(2)}%"${t.p === 0 ? ' class="first"' : ''}>${
        t.v.toLocaleString('en-US')}</i>`).join('')}</span><span></span></div>`;
}

const rec = (w, l, t) => `${w}&ndash;${l}${t ? `&ndash;${t}` : ''}`;

/* ---------- the standings, which is what a record table is ---------- */
/* Sorted in seed order rather than by record, because that is the question
   people actually bring to it. The five record seeds, then the points seed,
   then everyone else in record order, with a line drawn across the cut. */
function standings(db, st, season) {
  const po = db.playoffSeeds(season);
  const lastIn = po.rows.filter((r) => r.in).length;
  return `<div class="tw"><table class="dt seeds">
    <thead><tr><th class="sticky seed">#</th><th class="sticky t">Team</th>
      ${/* record and points for ARE the two seeding rules, so the gap that
           settles the last spot belongs beside them, not at the far end */''}
      <th class="n">Rec</th><th class="n">PF</th><th class="n">Back</th>
      <th class="n">PA</th><th class="n">Diff</th><th class="n">All&#8209;play</th></tr></thead>
    <tbody>${po.rows.map((r, i) => `
      <tr class="${r.in ? 'in' : 'out'}${i + 1 === lastIn ? ' cut' : ''}">
        <td class="sticky seed">${r.in ? r.seed : ''}</td>
        <td class="sticky t">${teamTag(r)}${r.bye
          ? '<span class="seed-tag bye" title="First-round bye">BYE</span>' : ''}${r.how === 'points'
          ? '<span class="seed-tag" title="Took the last spot on points for">PTS</span>' : ''}</td>
        <td class="n" style="font-weight:700">${rec(r.wins, r.losses, r.ties)}</td>
        <td class="n">${pts(r.total)}</td>
        <td class="n">${r.back == null ? '<span class="dimmer">&mdash;</span>'
          : `<span class="back">&minus;${pts(r.back)}</span>`}</td>
        <td class="n dim">${pts(r.pa)}</td>
        <td class="n" style="color:${r.diff >= 0 ? 'var(--mint)' : 'var(--red)'}">${
          r.diff > 0 ? '+' : ''}${pts(r.diff)}</td>
        <td class="n dim">${r.allPlayW}&ndash;${r.allPlayL}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

/* ---------- all time ---------- */
function allTime(db) {
  const at = db.allTime();
  if (!at.hasData) return empty('No seasons logged yet',
    'Pull a season from Sleeper in Admin and the record book fills itself in.', 'chart');

  const byPct = [...at.rows].sort((a, b) => (b.winPct ?? 0) - (a.winPct ?? 0) || b.pf - a.pf);
  const hl = db.allTimeHighlights();
  const nm = (n) => esc(db.team(n)?.manager ?? `T${n}`);
  const game = (g) => g ? `data-res data-yr="${g.season}" data-wk="${g.week}" data-me="${nm(g.team)}"
    data-mp="${pts(g.points)}" data-r="W" data-opp="${nm(g.opponent)}" data-op="${pts(g.opp.points)}"` : '';
  const who = (teams) => teams.length > 2 ? `${teams.length} teams` : teams.map(nm).join(', ');

  /* Every week anyone has ever played, ranked. The record book is the one thing
     a dynasty league re-reads, so it is worth showing whole rather than as a
     single "best week" tile. */
  const allWeeks = at.rows.flatMap((r) => r.bySeason.flatMap((s) =>
    Object.entries(s.byWeek).map(([week, points]) =>
      ({ team: r.number, manager: r.manager, season: s.season, week: Number(week), points }))));
  const top = [...allWeeks].sort((a, b) => b.points - a.points).slice(0, 5);
  const bot = [...allWeeks].sort((a, b) => a.points - b.points).slice(0, 5);

  /* Every meeting between every pair, so a head-to-head cell can say what its
     record is made of -- a 1-1 hides whether both were blowouts or coin flips. */
  const games = at.seasons.flatMap((y) => db.stats(y).weekly);
  const score = new Map(games.map((g) => [`${g.season}:${g.week}:${g.team}`, g.points]));
  const met = {};
  for (const g of games) {
    if (g.opponent == null || !g.result) continue;
    ((met[g.team] ||= {})[g.opponent] ||= []).push({ ...g, them: score.get(`${g.season}:${g.week}:${g.opponent}`) });
  }
  const h2h = db.headToHead();
  const grid = [...at.rows].sort((a, b) => a.number - b.number);
  const lead = byPct[0];

  return `
  <div class="tiles hl-tiles">
    <div class="tile accent"><div class="k">Best record</div>
      <div class="v">${lead ? rec(lead.wins, lead.losses, lead.ties) : '&mdash;'}</div>
      <div class="m">${lead ? `${nm(lead.number)} &middot; ${(lead.winPct * 100).toFixed(0)}%` : ''}</div></div>
    <button class="tile mint hl-game" ${game(hl.blowout)} ${hl.blowout ? '' : 'disabled'}>
      <div class="k">Biggest blowout</div>
      <div class="v">${hl.blowout ? '+' + pts(hl.blowout.margin) : '&mdash;'}</div>
      <div class="m">${hl.blowout ? `${nm(hl.blowout.team)} over ${nm(hl.blowout.opponent)} &middot; ${hl.blowout.season} Wk ${hl.blowout.week}` : 'needs matchups'}</div></button>
    <button class="tile gold hl-game" ${game(hl.closest)} ${hl.closest ? '' : 'disabled'}>
      <div class="k">Closest game</div>
      <div class="v">${hl.closest ? pts(hl.closest.margin) : '&mdash;'}</div>
      <div class="m">${hl.closest ? `${nm(hl.closest.team)} over ${nm(hl.closest.opponent)} &middot; ${hl.closest.season} Wk ${hl.closest.week}` : 'needs matchups'}</div></button>
    ${streakTile(db, hl.streaks, { title: 'Longest streaks', withYear: true })}
  </div>

  <div class="section-title">Franchises</div>
  <div class="card"><div class="card-bd flush"><div class="tw"><table class="dt">
    <thead><tr><th class="sticky">Team</th>
      <th class="n">Yrs</th><th class="n">Rec</th><th class="n">Win%</th>
      <th class="n">PF</th><th class="n">PA</th><th class="n">Avg</th>
      <th class="n">All&#8209;play</th><th class="n">Playoffs</th><th class="n">Titles</th></tr></thead>
    <tbody>${byPct.map((r) => `
      <tr><td class="sticky">${teamTag(r)}</td>
        <td class="n dim">${r.seasons}</td>
        <td class="n" style="font-weight:700">${rec(r.wins, r.losses, r.ties)}</td>
        <td class="n">${r.winPct == null ? '&mdash;' : (r.winPct * 100).toFixed(1) + '%'}</td>
        <td class="n">${pts(r.pf)}</td>
        <td class="n dim">${pts(r.pa)}</td>
        <td class="n dim">${pts(r.avg)}</td>
        <td class="n dim">${r.allPlayW}&ndash;${r.allPlayL}</td>
        <td class="n">${r.playoffs || '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n">${r.titles ? icon('crown') + (r.titles > 1 ? ` <b>${r.titles}</b>` : '')
          : '<span class="dimmer">&mdash;</span>'}</td>
      </tr>`).join('')}
    </tbody></table></div></div></div>

  <div class="section-title">Head to head</div>
  <div class="card"><div class="card-bd flush"><div class="tw"><table class="dt h2h">
    <thead><tr><th class="sticky">&nbsp;</th>
      ${grid.map((c) => `<th class="n" title="${esc(c.manager)}">T${c.number}</th>`).join('')}</tr></thead>
    <tbody>${grid.map((r) => `
      <tr><td class="sticky">${teamTag(r)}</td>
        ${grid.map((c) => {
          if (c.number === r.number) return '<td class="n self"></td>';
          const x = h2h[r.number]?.[c.number];
          if (!x) return '<td class="n"><span class="dimmer">&mdash;</span></td>';
          const cls = x.w > x.l ? 'won' : x.w < x.l ? 'lost' : '';
          const list = (met[r.number]?.[c.number] || []).sort((a, b) => a.season - b.season || a.week - b.week);
          const pop = `<b class="res-hd">${nm(r.number)} vs ${nm(c.number)} &middot; ${x.w}&ndash;${x.l}</b>`
            + list.map((g) => `<span class="res-ln${g.result === 'W' ? ' w' : ''}"><i>${g.season} Wk ${g.week}</i>
                <b>${g.result} ${pts(g.points)}&ndash;${g.them != null ? pts(g.them) : '?'}</b></span>`).join('');
          return `<td class="n wk"><button class="res-cell ${cls}" data-res data-pophtml="${esc(pop)}">${x.w}&ndash;${x.l}</button></td>`;
        }).join('')}
      </tr>`).join('')}
    </tbody></table></div></div></div>

  <div class="section-title">Record book</div>
  <div class="rb-grid">
    ${[['Biggest weeks', top, 'mint'], ['Smallest weeks', bot, 'red']].map(([title, list, tone]) => `
      <div class="card"><div class="card-hd"><h3>${title}</h3></div>
        <div class="card-bd flush"><div class="rows">
          ${list.map((w, i) => `<div class="row rb">
            <span class="rb-n">${i + 1}</span>
            ${teamTag({ number: w.team, manager: w.manager })}
            <div class="grow"></div>
            <span class="rb-when">${w.season} wk ${w.week}</span>
            <b class="rb-pts ${tone}">${pts(w.points)}</b>
          </div>`).join('')}
        </div></div>
      </div>`).join('')}
  </div>`;
}

/* ---------- results: every matchup of the season, one cell each ----------
   Rows in seed order, so reading down matches the playoff race above. Each
   cell is that week's score, coloured by how the matchup went -- which means
   something from week one, unlike marking a manager's best and worst weeks,
   which paints the whole grid when there are only two of them. Tapping a score
   says who it was against. The week's top score league-wide is bold. */
function resultsGrid(db, st, season) {
  const order = db.playoffSeeds(season).rows;
  const byTeam = new Map();
  const top = {};
  for (const w of st.weekly) {
    if (!byTeam.has(w.team)) byTeam.set(w.team, {});
    byTeam.get(w.team)[w.week] = w;
    top[w.week] = Math.max(top[w.week] ?? -Infinity, w.points);
  }
  const name = (n) => db.team(n, season)?.manager ?? `T${n}`;
  return `<div class="tw"><table class="dt res">
    <thead><tr><th class="sticky">Team</th>
      <th class="n">Avg</th><th class="n">High</th><th class="n">Low</th>
      ${st.weeks.map((w) => `<th class="n wk">W${w}</th>`).join('')}</tr></thead>
    <tbody>${order.map((r) => {
      const mine = byTeam.get(r.number) || {};
      return `<tr><td class="sticky">${teamTag(r)}</td>
        <td class="n">${r.avg != null ? pts(r.avg) : '&mdash;'}</td>
        <td class="n dim">${r.high != null ? pts(r.high) : '&mdash;'}</td>
        <td class="n dim">${r.low != null ? pts(r.low) : '&mdash;'}</td>
        ${st.weeks.map((wk) => {
          const g = mine[wk];
          if (!g) return '<td class="n wk"><span class="dimmer">&mdash;</span></td>';
          const opp = g.opponent != null ? byTeam.get(g.opponent)?.[wk] : null;
          const cls = { W: 'won', L: 'lost', T: 'tied' }[g.result] || '';
          return `<td class="n wk"><button class="res-cell ${cls}${g.points === top[wk] ? ' top' : ''}"
            data-res data-wk="${wk}" data-me="${esc(r.manager)}" data-mp="${pts(g.points)}"
            data-r="${g.result || ''}" ${opp ? `data-opp="${esc(name(g.opponent))}" data-op="${pts(opp.points)}"` : ''}
            >${pts(g.points)}</button></td>`;
        }).join('')}
      </tr>`;
    }).join('')}
    </tbody></table></div>`;
}

/* ---------- streak tile, shared by the Season and All-time headers ----------
   Two rows -- the winning streak and the losing one -- so it stays the height
   of the tiles beside it. Each row opens the spans behind it: where every tied
   streak started and ended, or "present" when it is still going. */
function streakTile(db, streaks, { title, withYear }) {
  const nm = (n) => esc(db.team(n)?.manager ?? `T${n}`);
  const when = (g) => `${withYear ? g.season + ' ' : ''}Wk ${g.week}`;
  const span = (r) => {
    if (r.live) return `${when(r.from)} &ndash; present`;
    if (r.from === r.to) return when(r.from);
    // the year is said again only when the run crosses into another season
    const end = withYear && r.to.season !== r.from.season ? when(r.to) : `Wk ${r.to.week}`;
    return `${when(r.from)} &ndash; ${end}`;
  };
  const row = (k, st) => {
    if (!st) return `<div class="st-row none"><b class="st-v ${k}">&mdash;</b><span>nobody</span></div>`;
    const names = st.runs.length > 2 ? `${st.runs.length} teams` : st.runs.map((r) => nm(r.team)).join(', ');
    const pop = `<b class="res-hd">${k === 'W' ? 'Win' : 'Losing'} streak &middot; ${k}${st.n}</b>`
      + st.runs.map((r) => `<span class="res-ln"><i>${nm(r.team)}</i><b>${span(r)}</b></span>`).join('');
    return `<button class="st-row" data-res data-pophtml="${esc(pop)}">
      <b class="st-v ${k}">${k}${st.n}</b><span>${names}</span></button>`;
  };
  /* side by side: each half is a figure over its names, the same stack as
     every other tile, with a rule between them */
  return `<div class="tile violet st-tile"><div class="k">${title}</div>
    <div class="st-pair">${row('W', streaks.W)}${row('L', streaks.L)}</div></div>`;
}

/** "2 seasons · 16 weeks": how much history the all-time figures stand on. */
const allSpan = (db) => {
  const { seasons, weeks } = db.allTimeHighlights();
  return `${seasons} season${seasons === 1 ? '' : 's'} \u00b7 ${weeks} weeks`;
};

export function render(db, state = {}) {
  const tab = state.statTab === 'all' ? 'all' : 'season';

  const bar = `
  ${/* Title and picker share the first line at every width. The tag -- where
       things stand, and that every figure on the page is regular season --
       sits beside the title where there is room and drops under it on a phone.
       All-time keeps the picker's space, held invisibly, so both sides line up. */''}
  <div class="view-hd stats-hd"><h2>${tab === 'all' ? 'All-time' : `${db.season} stats`}</h2>
    <span class="chip stage">${esc(tab === 'season' ? db.seasonStage(db.season) : allSpan(db))}
      &middot; Regular season only</span>
    ${tab === 'season' ? seasonPicker(db) : `<div class="pick-ghost" aria-hidden="true" inert>${seasonPicker(db)}</div>`}</div>
  <div class="pill-bar">
    <div class="pills">
      <button data-stab="season" aria-pressed="${tab === 'season'}">Season</button>
      <button data-stab="all" aria-pressed="${tab === 'all'}">All-time</button>
    </div>
  </div>`;

  if (tab === 'all') return bar + allTime(db);

  const S = db.season;
  const st = db.stats(S);
  // ?team=6 arrives from the Managers tab, otherwise the season's leader
  const focus = state.focusTeam
    || Number(state.params?.team)
    || [...st.rows].sort((a, b) => b.total - a.total)[0]?.number || 1;
  const metric = st.hasCeiling && ['ceiling', 'both'].includes(state.metric) ? state.metric : 'actual';
  const wkKey = metric === 'ceiling' ? 'byWeekMax' : 'byWeek';
  const sync = db.get('stats').lastSleeperSync;
  const withData = st.rows.filter((r) => r.games > 0);

  if (!st.hasData && !st.hasMaxPF) {
    return bar + `${empty(`Nothing logged for ${S} yet`,
      'Connect your Sleeper league in Admin to pull weekly scores automatically, or enter them by hand.', 'chart')}
      <div style="text-align:center;margin-top:-14px"><button class="btn" data-go="admin">${icon('sync')} Set up Sleeper</button></div>`;
  }

  const hl = db.seasonHighlights(S);
  const nm = (n) => esc(db.team(n, S)?.manager ?? `T${n}`);
  /* A matchup tile opens the same popover as a Results cell, so a game reads
     the same wherever it is tapped. */
  const game = (g) => g ? `data-res data-wk="${g.week}" data-me="${nm(g.team)}" data-mp="${pts(g.points)}"
    data-r="W" data-opp="${nm(g.opponent)}" data-op="${pts(g.opp.points)}"` : '';
  const who = (teams) => teams.length > 2 ? `${teams.length} teams` : teams.map(nm).join(', ');
  const po = db.playoffSeeds(S);

  /* One card, three questions about the same ten managers, rather than three
     cards of identical bars. */
  const lk = LU.some(([k]) => k === state.lineup) ? state.lineup : 'eff';
  const lkLabel = LU.find(([k]) => k === lk)[1];

  /* Highlights, not leaders: every leader is the first row of a section below,
     so the header carries the things nothing below spells out. */
  return bar + `
  <div class="tiles hl-tiles">
    <div class="tile accent"><div class="k">Top week</div>
      <div class="v">${hl.top ? pts(hl.top.points) : '&mdash;'}</div>
      <div class="m">${hl.top ? `${nm(hl.top.team)} &middot; Wk ${hl.top.week}` : 'no scores yet'}</div></div>
    <button class="tile mint hl-game" ${game(hl.blowout)} ${hl.blowout ? '' : 'disabled'}>
      <div class="k">Biggest blowout</div>
      <div class="v">${hl.blowout ? '+' + pts(hl.blowout.margin) : '&mdash;'}</div>
      <div class="m">${hl.blowout ? `${nm(hl.blowout.team)} over ${nm(hl.blowout.opponent)} &middot; Wk ${hl.blowout.week}` : 'needs matchups'}</div></button>
    <button class="tile gold hl-game" ${game(hl.closest)} ${hl.closest ? '' : 'disabled'}>
      <div class="k">Closest game</div>
      <div class="v">${hl.closest ? pts(hl.closest.margin) : '&mdash;'}</div>
      <div class="m">${hl.closest ? `${nm(hl.closest.team)} over ${nm(hl.closest.opponent)} &middot; Wk ${hl.closest.week}` : 'needs matchups'}</div></button>
    ${streakTile(db, hl.streaks, { title: hl.streaks.current ? 'Streaks' : 'Longest streaks', withYear: false })}
  </div>

  ${st.hasRecords ? `
  <div class="section-title">${po.decided ? 'Final seeds' : 'Playoff race'}</div>
  <div class="card"><div class="card-bd flush">${standings(db, st, S)}</div>
  </div>` : `
  <div class="card" style="margin-bottom:14px"><div class="card-bd">
    <div class="s dim" style="font-size:12.5px">${icon('alert')} No matchups pulled for ${S} yet, so there are
    no records. Run <b>Pull ${S} from Sleeper</b> in Admin.</div></div></div>`}

  ${st.hasData ? `
  <div class="section-title">Week by week</div>
  <div class="card wk-card">
    ${/* the toggle rides the header rather than costing the body its own row */''}
    <div class="card-hd"><h3>${metric === 'ceiling' ? 'Max PF' : metric === 'both' ? 'PF vs Max PF' : 'Points for'}</h3>
      <div class="hd-right">
        ${/* phones only: the manager select shares the header line, so picking
             someone costs the card no row of its own */''}
        <div class="season-pick wk-pick">
          <select data-focus-sel aria-label="Manager">
            ${st.rows.map((r) => `<option value="${r.number}" ${r.number === focus ? 'selected' : ''}>${esc(r.manager)}</option>`).join('')}
          </select>
        </div>
        ${st.hasCeiling ? `<div class="pills sub wk-pills">
          <button data-metric="actual" aria-pressed="${metric === 'actual'}">Points for</button>
          <button data-metric="ceiling" aria-pressed="${metric === 'ceiling'}">Max PF</button>
          <button data-metric="both" aria-pressed="${metric === 'both'}">Both</button>
        </div>
        <div class="season-pick wk-pick">
          <select data-metric-sel aria-label="Chart">
            <option value="actual" ${metric === 'actual' ? 'selected' : ''}>Points for</option>
            <option value="ceiling" ${metric === 'ceiling' ? 'selected' : ''}>Max PF</option>
            <option value="both" ${metric === 'both' ? 'selected' : ''}>Both</option>
          </select>
        </div>` : ''}
      </div></div>
    <div class="card-bd">
      ${lineChart(withData, st.weeks, focus, wkKey, metric === 'both')}
      ${/* Pills where there is room for all ten; a select on a phone, where
           they would scroll off sideways and hide most of the league. Both are
           always rendered and CSS picks one -- the pills also stay the record of
           who is selected, which the tooltip reads. */''}
      <div class="pills wk-pills" style="margin-top:10px">
        ${st.rows.map((r) => `<button data-focus="${r.number}" aria-pressed="${r.number === focus}">${esc(r.manager)}</button>`).join('')}
      </div>

    </div>
  </div>` : ''}

  ${st.hasCeiling ? `
  <div class="section-title">Lineups</div>
  <div class="card">
    <div class="card-hd"><h3>${lkLabel}</h3>
      <div class="hd-right">
        <div class="pills sub wk-pills">${LU.map(([k, label]) =>
          `<button data-lineup="${k}" aria-pressed="${k === lk}">${label}</button>`).join('')}</div>
        <div class="season-pick wk-pick"><select data-lineup-sel aria-label="Lineup figure">${LU.map(([k, label]) =>
          `<option value="${k}" ${k === lk ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      </div></div>
    <div class="card-bd flush">${lineupBars(st, lk)}</div>
  </div>` : ''}

  ${st.hasData ? `
  <div class="section-title">Results</div>
  <div class="card"><div class="card-bd flush">${resultsGrid(db, st, S)}</div></div>` : ''}

  <div class="s dimmer" style="font-size:11.5px;margin-top:16px;text-align:center">
    ${sync ? `Last Sleeper sync ${esc(sync)}` : 'Not yet synced with Sleeper'}
  </div>`;
}

export function mount(root, db, go, setState) {
  root.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () =>
    setState({ focusTeam: Number(b.dataset.focus) })));

  /* Results: tap a score for the matchup behind it. The popover lives on the
     page, not in the table -- the grid scrolls sideways, and anything inside it
     would be cut off above the first rows. */
  const pop = document.createElement('div');
  pop.className = 'res-pop';
  pop.hidden = true;
  document.body.append(pop);
  let openCell = null;
  const shut = () => { pop.hidden = true; openCell?.classList.remove('on'); openCell = null; };
  root.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openCell === b) return shut();
    shut();
    const d = b.dataset;
    const said = { W: 'Won', L: 'Lost', T: 'Tied' }[d.r] || 'No matchup';
    pop.innerHTML = d.pophtml || `<b class="res-hd">${d.yr ? d.yr + ' ' : ''}Week ${d.wk} &middot; ${said}</b>
      <span class="res-ln me">${d.me} <b>${d.mp}</b></span>
      ${d.opp ? `<span class="res-ln">${d.opp} <b>${d.op}</b></span>` : ''}`;
    pop.hidden = false;
    const r = b.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));
    // above the cell unless that would leave the screen, then below it
    const top = r.top - ph - 8 < 8 ? r.bottom + 8 : r.top - ph - 8;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${top + window.scrollY}px`;
    b.classList.add('on');
    openCell = b;
  }));
  root.querySelector('.dt.res')?.closest('.tw')?.addEventListener('scroll', shut, { passive: true });
  root._resShut = () => { shut(); };
  root._resPop = pop;
  document.addEventListener('click', root._resShut);
  root.querySelector('[data-focus-sel]')?.addEventListener('change', (e) =>
    setState({ focusTeam: Number(e.target.value) }));
  root.querySelector('[data-metric-sel]')?.addEventListener('change', (e) =>
    setState({ metric: e.target.value }));
  root.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () =>
    setState({ metric: b.dataset.metric })));
  root.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () =>
    setState({ statTab: b.dataset.stab })));
  root.querySelectorAll('[data-lineup]').forEach((b) => b.addEventListener('click', () =>
    setState({ lineup: b.dataset.lineup })));
  root.querySelector('[data-lineup-sel]')?.addEventListener('change', (e) =>
    setState({ lineup: e.target.value }));
  /* a segment says what it is worth when you tap it, the same as the Bank
     ledger's bars; one open at a time, and a tap anywhere else closes it */
  const shutLu = (except) => root.querySelectorAll('.lu-bar button.on')
    .forEach((b) => { if (b !== except) b.classList.remove('on'); });
  root.querySelectorAll('[data-luseg]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !b.classList.contains('on');
    shutLu();
    b.classList.toggle('on', on);
  }));
  root._luShut = () => shutLu();
  document.addEventListener('click', root._luShut);
  root.querySelector('[data-go]')?.addEventListener('click', (e) => go(e.currentTarget.dataset.go));

  /* The chart is drawn at one of two sizes, chosen while it is drawn. Right
     after a refresh the browser can give that check the wrong answer -- the
     chart then came out at its phone size, with oversized axis figures, until
     something else repainted it. So check again once the page has settled,
     and whenever the window crosses the line, and redraw if the answer
     changed. */
  const mq = window.matchMedia?.('(min-width:621px)');
  if (mq) {
    const recheck = () => {
      const drawn = root.querySelector('[data-chart]');
      WIDE = mq.matches;
      if (drawn && (drawn.dataset.wide === '1') !== WIDE) setState({});
    };
    requestAnimationFrame(() => requestAnimationFrame(recheck));
    mq.addEventListener?.('change', recheck);
    root._mqShut = () => mq.removeEventListener?.('change', recheck);
  }

  /* crosshair + tooltip */
  const svg = root.querySelector('[data-chart]');
  if (!svg) return;
  const wrap = svg.parentElement;
  const tip = wrap.querySelector('[data-tip]');
  const cross = svg.querySelector('[data-cross]');
  const st = db.stats(db.season);
  const rows = st.rows.filter((r) => r.games > 0);
  const W = +svg.dataset.w;

  const mode = root.querySelector('[data-metric][aria-pressed="true"]')?.dataset.metric || 'actual';
  const mKey = mode === 'ceiling' ? 'byWeekMax' : 'byWeek';
  let hover = null;
  // read from the DOM rather than a captured value: the pills are the record of
  // what is selected, and they are re-rendered whenever it changes
  const focused = () => Number(root.querySelector('[data-focus][aria-pressed="true"]')?.dataset.focus) || null;
  const move = (ev) => {
    const p = ev.touches?.[0] ?? ev;
    const box = svg.getBoundingClientRect();
    const vx = ((p.clientX - box.left) / box.width) * W;
    const span = W - PAD.l - PAD.r;
    const t = Math.max(0, Math.min(1, (vx - PAD.l) / span));
    const wk = st.weeks[Math.round(t * (st.weeks.length - 1))];
    if (wk == null) return;
    const ranked = rows.filter((r) => r[mKey][wk] != null).sort((a, b) => b[mKey][wk] - a[mKey][wk]);
    cross.setAttribute('x1', vx); cross.setAttribute('x2', vx); cross.setAttribute('opacity', '1');
    /* In Both there is no league to rank -- the tooltip is one manager's week:
       what he scored, what he could have, and what the difference cost him. */
    if (mode === 'both') {
      const me = rows.find((r) => r.number === focused());
      const a = me?.byWeek[wk], c = me?.byWeekMax[wk];
      tip.innerHTML = `<b style="font-family:var(--f-display);letter-spacing:.06em">WEEK ${wk}</b><br>`
        + `<span class="tip-row">Points for <b>${a != null ? pts(a) : '&mdash;'}</b></span><br>`
        + `<span class="tip-row">Max PF <b>${c != null ? pts(c) : '&mdash;'}</b></span>`
        + `<div class="tip-hover on">Left on bench <b>${a != null && c != null ? pts(c - a) : '&mdash;'}</b></div>`;
      tip.style.opacity = '1';
      tip.style.left = Math.min(box.width - 150, Math.max(0, (vx / W) * box.width - 60)) + 'px';
      tip.style.top = '8px';
      return;
    }
    const top = ranked.slice(0, 3);
    /* One extra line under the top three, for the one manager you are asking
       about: whoever is under the pointer, or the selected line when the
       pointer is not on one. Never both -- the answer to "what did he score"
       is one number, and the question is whichever line you are touching. */
    const askedAbout = hover ?? focused();
    const shown = new Set(top.map((r) => r.number));
    // already up there: mark his row rather than printing him twice
    const also = askedAbout != null && !shown.has(askedAbout)
      ? rows.find((r) => r.number === askedAbout) : null;
    // `ranked` is everyone who scored that week, so his index is his place
    const alsoRank = also ? ranked.findIndex((r) => r.number === also.number) + 1 : 0;

    tip.innerHTML = `<b style="font-family:var(--f-display);letter-spacing:.06em">WEEK ${wk}</b><br>`
        + top.map((r, i) => `<span class="tip-row${r.number === askedAbout
          ? (r.number === focused() ? ' on' : ' hot') : ''}"><span class="tip-i">${i + 1}.</span> ${
          esc(r.manager)} <b>${pts(r[mKey][wk])}</b></span>`).join('<br>')
      + (also ? `<div class="tip-hover${also.number === focused() ? ' on' : ''}">${
          /* his place that week, so the row reads as a continuation of the list
             above rather than a figure with no standing */''}${
          alsoRank ? `<span class="tip-i">${alsoRank}.</span> ` : ''}${
          esc(also.manager)} <b>${also[mKey][wk] != null ? pts(also[mKey][wk]) : '&mdash;'}</b></div>` : '');
    tip.style.opacity = '1';
    const left = Math.min(box.width - 150, Math.max(0, (vx / W) * box.width - 60));
    tip.style.left = left + 'px';
    tip.style.top = '8px';
  };
  const leave = () => { tip.style.opacity = '0'; cross.setAttribute('opacity', '0'); };
  svg.addEventListener('mousemove', move);
  svg.addEventListener('mouseleave', leave);
  svg.addEventListener('touchstart', move, { passive: true });
  svg.addEventListener('touchmove', move, { passive: true });
  svg.addEventListener('touchend', leave);

  /* Both directions: pick a name to find the line, or point at a line to find
     the name. Hovering previews what a click would select -- the line comes
     forward and its pill lights up -- so the chart is readable without having
     to guess and click through ten managers. */
  svg.querySelectorAll('[data-hit]').forEach((hit) => {
    const n = hit.dataset.hit;
    const line = svg.querySelector(`[data-line="${n}"]`);
    const pill = root.querySelector(`[data-focus="${n}"]`);
    const set = (on) => {
      line?.classList.toggle('hot', on);
      pill?.classList.toggle('hot', on);
      hover = on ? Number(n) : null;
    };
    hit.addEventListener('mouseenter', () => set(true));
    hit.addEventListener('mouseleave', () => set(false));
    hit.addEventListener('click', () => setState({ focusTeam: Number(n) }));
  });
}
