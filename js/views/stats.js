import { esc, icon, teamTag, pts, empty, teamColor, money, seasonPicker } from '../util.js';

/* ---------------------------------------------------------------
   Charts here deliberately use ONE accent series over recessive
   context lines rather than ten categorical hues: ten hues cannot be
   told apart under colour-vision deficiency, and on a phone the
   spaghetti is unreadable. Identity is always carried by a label too.
   --------------------------------------------------------------- */

const PAD = { t: 14, r: 16, b: 26, l: 40 };

function lineChart(rows, weeks, focus, key = 'byWeek') {
  if (!weeks.length) return '';
  const W = 640, H = 240;
  const vals = rows.flatMap((r) => Object.values(r[key]));
  if (!vals.length) return '';
  const lo = Math.floor(Math.min(...vals) / 20) * 20 - 10;
  const hi = Math.ceil(Math.max(...vals) / 20) * 20 + 10;
  const x = (w) => PAD.l + ((w - weeks[0]) / Math.max(1, weeks.at(-1) - weeks[0])) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = (r) => weeks.filter((w) => r[key][w] != null)
    .map((w, i) => `${i ? 'L' : 'M'}${x(w).toFixed(1)} ${y(r[key][w]).toFixed(1)}`).join(' ');

  const ticks = [];
  for (let i = 0; i <= 4; i++) ticks.push(lo + ((hi - lo) / 4) * i);
  const f = rows.find((r) => r.number === focus);

  return `
  <div style="position:relative">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;touch-action:pan-y"
         role="img" aria-label="Weekly points by week; ${esc(f?.manager ?? '')} highlighted"
         data-chart data-w="${W}" data-lo="${lo}" data-hi="${hi}">
      ${ticks.map((t) => `
        <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"
              stroke="#28323F" stroke-width="1"/>
        <text x="${PAD.l - 8}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end"
              fill="#7C8BA0" font-size="10" font-family="Inter,sans-serif">${Math.round(t)}</text>`).join('')}
      ${weeks.map((w) => `<text x="${x(w).toFixed(1)}" y="${H - 8}" text-anchor="middle"
              fill="#7C8BA0" font-size="10" font-family="Inter,sans-serif">${w}</text>`).join('')}
      ${rows.filter((r) => r.number !== focus).map((r) =>
        `<path class="ln" data-line="${r.number}" d="${path(r)}" fill="none" stroke="#3A4657"
               stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
      ${f ? `<path d="${path(f)}" fill="none" stroke="var(--heat)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round" filter="drop-shadow(0 0 6px rgba(255,107,44,.4))"/>
        ${weeks.filter((w) => f[key][w] != null).map((w) => `
          <circle cx="${x(w).toFixed(1)}" cy="${y(f[key][w]).toFixed(1)}" r="4"
                  fill="var(--heat)" stroke="#141B24" stroke-width="2"/>`).join('')}` : ''}
      <line data-cross x1="0" x2="0" y1="${PAD.t}" y2="${H - PAD.b}" stroke="#5A6A80" stroke-width="1"
            stroke-dasharray="3 3" opacity="0"/>
      ${/* A 1.5px line is not a target. These sit on top, invisible and twelve
           pixels wide, and are the only thing the pointer ever actually hits --
           so a line can be hovered and clicked at the width it is drawn. */''}
      ${rows.filter((r) => r.number !== focus).map((r) =>
        `<path class="ln-hit" data-hit="${r.number}" d="${path(r)}" fill="none" stroke="transparent"
               stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    </svg>
    <div data-tip style="position:absolute;pointer-events:none;opacity:0;transition:opacity .12s;
      background:var(--surface-3);border:1px solid var(--line);border-radius:8px;padding:7px 10px;
      font-size:12px;white-space:nowrap;box-shadow:var(--shadow);z-index:3"></div>
  </div>`;
}

function barChart(rows, key, label, unit = '') {
  const data = rows.filter((r) => r[key] != null).sort((a, b) => b[key] - a[key]);
  if (!data.length) return '';
  const max = Math.max(...data.map((r) => r[key]));
  return `<div class="rows">
    ${data.map((r) => `
      <div class="row" style="padding:9px 16px;align-items:center">
        <div style="width:96px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600">
<span class="tnum" style="margin-right:7px">T${r.number}</span>${esc(r.manager)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="height:16px;background:var(--surface-3);border-radius:4px;overflow:hidden">
            <i style="display:block;height:100%;width:${(r[key] / max * 100).toFixed(1)}%;
               background:linear-gradient(90deg,#C43D0E,var(--heat));border-radius:4px"></i>
          </div>
        </div>
        <div style="width:76px;flex:none;text-align:right;font-family:var(--f-display);font-weight:700;font-size:15px">
          ${unit === '%' ? (r[key] * 100).toFixed(1) + '%' : pts(r[key])}
        </div>
      </div>`).join('')}
  </div>`;
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
  const byPF = [...at.rows].sort((a, b) => b.pf - a.pf);
  const best = at.rows.map((r) => r.best).filter(Boolean)
    .sort((a, b) => b.points - a.points);
  const bestOf = (w) => at.rows.find((r) => r.best === w);
  const champs = [...at.rows].filter((r) => r.titles).sort((a, b) => b.titles - a.titles);

  /* Every week anyone has ever played, ranked. The record book is the one thing
     a dynasty league re-reads, so it is worth showing whole rather than as a
     single "best week" tile. */
  const allWeeks = at.rows.flatMap((r) => r.bySeason.flatMap((s) =>
    Object.entries(s.byWeek).map(([week, points]) =>
      ({ team: r.number, manager: r.manager, season: s.season, week: Number(week), points }))));
  const top = [...allWeeks].sort((a, b) => b.points - a.points).slice(0, 5);
  const bot = [...allWeeks].sort((a, b) => a.points - b.points).slice(0, 5);

  const h2h = db.headToHead();
  const grid = [...at.rows].sort((a, b) => a.number - b.number);

  return `
  <div class="tiles">
    <div class="tile accent"><div class="k">Best record</div>
      <div class="v" style="font-size:23px">${esc(byPct[0]?.manager ?? '--')}</div>
      <div class="m">${byPct[0] ? `${rec(byPct[0].wins, byPct[0].losses, byPct[0].ties)} &middot; ${
        (byPct[0].winPct * 100).toFixed(0)}%` : ''}</div></div>
    <div class="tile gold"><div class="k">Most points</div>
      <div class="v" style="font-size:23px">${esc(byPF[0]?.manager ?? '--')}</div>
      <div class="m">${byPF[0] ? pts(byPF[0].pf) + ' over ' + byPF[0].seasons
        + ' season' + (byPF[0].seasons === 1 ? '' : 's') : ''}</div></div>
    <div class="tile mint"><div class="k">Best week ever</div>
      <div class="v">${best[0] ? pts(best[0].points) : '--'}</div>
      <div class="m">${best[0] ? `${esc(bestOf(best[0]).manager)} &middot; ${best[0].season} wk ${best[0].week}` : ''}</div></div>
    <div class="tile"><div class="k">Titles</div>
      <div class="v" style="font-size:23px">${champs.length ? esc(champs[0].manager) : '&mdash;'}</div>
      <div class="m">${champs.length ? `${champs[0].titles} &middot; ${champs.length} manager${
        champs.length === 1 ? '' : 's'} with one` : 'none awarded yet'}</div></div>
  </div>

  <div class="section-title">Franchises<span class="sub-n dim">${at.seasons.length} season${
    at.seasons.length === 1 ? '' : 's'}</span></div>
  <div class="card"><div class="card-bd flush"><div class="tw"><table class="dt">
    <thead><tr><th class="sticky">Team</th>
      <th class="n">Yrs</th><th class="n">Rec</th><th class="n">Win%</th>
      <th class="n">PF</th><th class="n">PA</th><th class="n">Avg</th>
      <th class="n">All&#8209;play</th><th class="n">Titles</th></tr></thead>
    <tbody>${byPct.map((r) => `
      <tr><td class="sticky">${teamTag(r)}</td>
        <td class="n dim">${r.seasons}</td>
        <td class="n" style="font-weight:700">${rec(r.wins, r.losses, r.ties)}</td>
        <td class="n">${r.winPct == null ? '&mdash;' : (r.winPct * 100).toFixed(1) + '%'}</td>
        <td class="n">${pts(r.pf)}</td>
        <td class="n dim">${pts(r.pa)}</td>
        <td class="n dim">${pts(r.avg)}</td>
        <td class="n dim">${r.allPlayW}&ndash;${r.allPlayL}</td>
        <td class="n">${r.titles ? `${icon('crown')}`.repeat(1) + (r.titles > 1 ? ` <b>${r.titles}</b>` : '')
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
          return `<td class="n ${cls}" title="${esc(r.manager)} vs ${esc(c.manager)}">${x.w}&ndash;${x.l}</td>`;
        }).join('')}
      </tr>`).join('')}
    </tbody></table></div></div>
    <div class="card-bd" style="border-top:1px solid var(--line-soft)">
      <div class="s dim" style="font-size:12px">Regular season only. Read across: the row is your record
      against that column.</div></div>
  </div>

  <div class="section-title">Record book</div>
  <div class="rb-grid">
    ${[['Biggest weeks', top, 'mint'], ['Smallest weeks', bot, 'dim']].map(([title, list, tone]) => `
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

export function render(db, state = {}) {
  const tab = state.statTab === 'all' ? 'all' : 'season';

  const bar = `
  <div class="view-hd"><h2>${tab === 'all' ? 'All-time' : `${db.season} stats`}</h2>
    ${tab === 'season' ? seasonPicker(db) : ''}</div>
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
  const metric = st.hasCeiling && state.metric === 'ceiling' ? 'ceiling' : 'actual';
  const wkKey = metric === 'ceiling' ? 'byWeekMax' : 'byWeek';
  const sync = db.get('stats').lastSleeperSync;
  const withData = st.rows.filter((r) => r.games > 0);

  if (!st.hasData && !st.hasMaxPF) {
    return bar + `${empty(`Nothing logged for ${S} yet`,
      'Connect your Sleeper league in Admin to pull weekly scores automatically, or enter them by hand.', 'chart')}
      <div style="text-align:center;margin-top:-14px"><button class="btn" data-go="admin">${icon('sync')} Set up Sleeper</button></div>`;
  }

  const lead = [...withData].sort((a, b) => b.total - a.total)[0];
  const eff = [...st.rows].filter((r) => r.efficiency != null).sort((a, b) => b.efficiency - a.efficiency)[0];
  const best = st.weekly.length ? st.weekly.reduce((a, b) => (b.points > a.points ? b : a)) : null;
  /* The most wronged team in the league. It is the stat this page exists to
     settle, so it gets a tile rather than a column somebody has to go find. */
  const unlucky = [...withData].filter((r) => r.luck != null).sort((a, b) => a.luck - b.luck)[0];
  const po = db.playoffSeeds(S);

  /* One card, three questions about the same ten managers, rather than three
     cards of identical bars. */
  const LINEUP = [
    ['maxPF', 'Max PF', 'Every week\'s best possible lineup, added up.', st.hasMaxPF],
    ['left', 'Left on bench', 'Ceiling minus what was actually started. Lower is better.', st.hasCeiling],
    ['efficiency', 'Efficiency', 'Points as a share of the ceiling.', st.hasEfficiency],
  ].filter(([, , , ok]) => ok);
  const lk = LINEUP.some(([k]) => k === state.lineup) ? state.lineup : LINEUP[0]?.[0];
  const lkRow = LINEUP.find(([k]) => k === lk);

  return bar + `
  <div class="tiles">
    <div class="tile accent"><div class="k">Points leader</div>
      <div class="v" style="font-size:23px">${esc(lead?.manager ?? '--')}</div>
      <div class="m">${lead ? pts(lead.total) + ' through wk ' + st.weeks.at(-1) : 'no scores yet'}</div></div>
    <div class="tile gold"><div class="k">Most unlucky</div>
      <div class="v" style="font-size:23px">${esc(unlucky?.manager ?? '--')}</div>
      <div class="m">${unlucky ? `${unlucky.luck.toFixed(1)} wins vs ${unlucky.allPlayW}&ndash;${
        unlucky.allPlayL} all-play` : 'needs matchups'}</div></div>
    <div class="tile mint"><div class="k">Best manager</div>
      <div class="v" style="font-size:23px">${eff ? esc(eff.manager) : '&mdash;'}</div>
      <div class="m">${eff ? (eff.efficiency * 100).toFixed(1) + '% of ceiling'
        : 'no ceilings yet — pull from Sleeper'}</div></div>
    <div class="tile"><div class="k">Top week</div>
      <div class="v">${best ? pts(best.points) : '--'}</div>
      <div class="m">${best ? esc(db.team(best.team)?.manager) + ' &middot; wk ' + best.week : ''}</div></div>
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
  <div class="card">
    ${/* the toggle rides the header rather than costing the body its own row */''}
    <div class="card-hd"><h3>${metric === 'ceiling' ? 'Weekly ceiling' : 'Points for'}</h3>
      ${st.hasCeiling ? `<div class="pills sub" style="margin-left:auto">
        <button data-metric="actual" aria-pressed="${metric === 'actual'}">Actual</button>
        <button data-metric="ceiling" aria-pressed="${metric === 'ceiling'}">Ceiling</button>
      </div>` : ''}</div>
    <div class="card-bd">
      ${lineChart(withData, st.weeks, focus, wkKey)}
      ${/* Pills where there is room for all ten; a select on a phone, where
           they would scroll off sideways and hide most of the league. Both are
           always rendered and CSS picks one -- the pills also stay the record of
           who is selected, which the tooltip reads. */''}
      <div class="pills wk-pills" style="margin-top:10px">
        ${st.rows.map((r) => `<button data-focus="${r.number}" aria-pressed="${r.number === focus}">${esc(r.manager)}</button>`).join('')}
      </div>
      <div class="season-pick wk-pick">
        <span>Manager</span>
        <select data-focus-sel aria-label="Manager">
          ${st.rows.map((r) => `<option value="${r.number}" ${r.number === focus ? 'selected' : ''}>${esc(r.manager)}</option>`).join('')}
        </select>
      </div>
    </div>
  </div>` : ''}

  ${LINEUP.length ? `
  <div class="section-title">Lineups</div>
  <div class="card">
    <div class="card-bd" style="padding-bottom:0">
      <div class="pills">${LINEUP.map(([k, label]) =>
        `<button data-lineup="${k}" aria-pressed="${k === lk}">${label}</button>`).join('')}</div>
    </div>
    <div class="card-bd flush">${barChart(
      lk === 'efficiency' ? withData : st.rows, lk, lkRow[1], lk === 'efficiency' ? '%' : '')}</div>
    <div class="card-bd" style="border-top:1px solid var(--line-soft)">
      <div class="s dim" style="font-size:12px">${lkRow[2]}</div></div>
  </div>` : ''}

  ${st.hasData ? `
  <div class="section-title">The numbers</div>
  <div class="card"><div class="card-bd flush"><div class="tw"><table class="dt">
    <thead><tr><th class="sticky">Team</th>
      ${st.weeks.map((w) => `<th class="n">W${w}</th>`).join('')}
      <th class="n">Total</th><th class="n">Avg</th><th class="n">High</th><th class="n">Low</th></tr></thead>
    <tbody>${[...withData].sort((a, b) => b.total - a.total).map((r) => `
      <tr><td class="sticky">${teamTag(r)}</td>
        ${st.weeks.map((w) => `<td class="n ${r.byWeek[w] === r.high ? 'pos' : r.byWeek[w] === r.low ? 'dim' : ''}">${r.byWeek[w] != null ? pts(r.byWeek[w]) : '<span class="dimmer">&mdash;</span>'}</td>`).join('')}
        <td class="n" style="font-weight:700">${pts(r.total)}</td>
        <td class="n">${pts(r.avg)}</td>
        <td class="n pos">${pts(r.high)}</td>
        <td class="n dim">${pts(r.low)}</td>
      </tr>`).join('')}
    </tbody></table></div></div></div>` : ''}

  <div class="s dimmer" style="font-size:11.5px;margin-top:16px;text-align:center">
    ${sync ? `Last Sleeper sync ${esc(sync)}` : 'Not yet synced with Sleeper'}
  </div>`;
}

export function mount(root, db, go, setState) {
  root.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () =>
    setState({ focusTeam: Number(b.dataset.focus) })));
  root.querySelector('[data-focus-sel]')?.addEventListener('change', (e) =>
    setState({ focusTeam: Number(e.target.value) }));
  root.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () =>
    setState({ metric: b.dataset.metric })));
  root.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () =>
    setState({ statTab: b.dataset.stab })));
  root.querySelectorAll('[data-lineup]').forEach((b) => b.addEventListener('click', () =>
    setState({ lineup: b.dataset.lineup })));
  root.querySelector('[data-go]')?.addEventListener('click', (e) => go(e.currentTarget.dataset.go));

  /* crosshair + tooltip */
  const svg = root.querySelector('[data-chart]');
  if (!svg) return;
  const wrap = svg.parentElement;
  const tip = wrap.querySelector('[data-tip]');
  const cross = svg.querySelector('[data-cross]');
  const st = db.stats(db.season);
  const rows = st.rows.filter((r) => r.games > 0);
  const W = +svg.dataset.w;

  const mKey = root.querySelector('[data-metric][aria-pressed="true"]')?.dataset.metric === 'ceiling'
    ? 'byWeekMax' : 'byWeek';
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
