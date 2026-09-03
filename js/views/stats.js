import { esc, icon, teamTag, pts, empty, teamColor, money } from '../util.js';

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
        `<path d="${path(r)}" fill="none" stroke="#3A4657" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
      ${f ? `<path d="${path(f)}" fill="none" stroke="var(--heat)" stroke-width="2.5"
              stroke-linejoin="round" stroke-linecap="round" filter="drop-shadow(0 0 6px rgba(255,107,44,.4))"/>
        ${weeks.filter((w) => f[key][w] != null).map((w) => `
          <circle cx="${x(w).toFixed(1)}" cy="${y(f[key][w]).toFixed(1)}" r="4"
                  fill="var(--heat)" stroke="#141B24" stroke-width="2"/>`).join('')}` : ''}
      <line data-cross x1="0" x2="0" y1="${PAD.t}" y2="${H - PAD.b}" stroke="#5A6A80" stroke-width="1"
            stroke-dasharray="3 3" opacity="0"/>
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

export function render(db, state = {}) {
  const S = db.season;
  const st = db.stats(S);
  const focus = state.focusTeam ?? [...st.rows].sort((a, b) => b.total - a.total)[0]?.number ?? 1;
  const metric = st.hasCeiling && state.metric === 'ceiling' ? 'ceiling' : 'actual';
  const wkKey = metric === 'ceiling' ? 'byWeekMax' : 'byWeek';
  const sync = db.get('stats').lastSleeperSync;
  const withData = st.rows.filter((r) => r.games > 0);

  if (!st.hasData && !st.hasMaxPF) {
    return `${empty(`Nothing logged for ${S} yet`,
      'Connect your Sleeper league in Admin to pull weekly scores automatically, or enter them by hand.', 'chart')}
      <div style="text-align:center;margin-top:-14px"><button class="btn" data-go="admin">${icon('sync')} Set up Sleeper</button></div>`;
  }

  const lead = [...withData].sort((a, b) => b.total - a.total)[0];
  const ceiling = [...st.rows].filter((r) => r.maxPF != null).sort((a, b) => b.maxPF - a.maxPF)[0];
  const eff = [...st.rows].filter((r) => r.efficiency != null).sort((a, b) => b.efficiency - a.efficiency)[0];
  const best = st.weekly.length ? st.weekly.reduce((a, b) => (b.points > a.points ? b : a)) : null;

  return `
  <div class="tiles">
    <div class="tile accent"><div class="k">Points leader</div>
      <div class="v" style="font-size:23px">${esc(lead?.manager ?? '--')}</div>
      <div class="m">${lead ? pts(lead.total) + ' through wk ' + st.weeks.at(-1) : 'no scores yet'}</div></div>
    <div class="tile gold"><div class="k">Highest ceiling</div>
      <div class="v" style="font-size:23px">${esc(ceiling?.manager ?? '--')}</div>
      <div class="m">${ceiling ? pts(ceiling.maxPF) + ' max PF' : 'no max PF yet'}</div></div>
    <div class="tile mint"><div class="k">Best manager</div>
      <div class="v" style="font-size:23px">${eff ? esc(eff.manager) : '&mdash;'}</div>
      <div class="m">${eff ? (eff.efficiency * 100).toFixed(1) + '% of ceiling'
        : `needs all ${st.regularSeasonWeeks} weeks logged`}</div></div>
    <div class="tile"><div class="k">Top week</div>
      <div class="v">${best ? pts(best.points) : '--'}</div>
      <div class="m">${best ? esc(db.team(best.team)?.manager) + ' &middot; wk ' + best.week : ''}</div></div>
  </div>

  ${st.hasData ? `
  <div class="section-title">Week by week</div>
  <div class="card">
    <div class="card-hd"><h3>${metric === 'ceiling' ? 'Weekly ceiling' : 'Points for'}</h3><div class="spacer"></div>
      <span class="chip heat">${esc(db.team(focus)?.manager ?? '')}</span></div>
    <div class="card-bd">
      ${st.hasCeiling ? `<div class="pills" style="margin-bottom:10px">
        <button data-metric="actual" aria-pressed="${metric === 'actual'}">Actual</button>
        <button data-metric="ceiling" aria-pressed="${metric === 'ceiling'}">Ceiling</button>
      </div>` : ''}
      ${lineChart(withData, st.weeks, focus, wkKey)}
      <div class="pills" style="margin-top:10px">
        ${st.rows.map((r) => `<button data-focus="${r.number}" aria-pressed="${r.number === focus}">${esc(r.manager)}</button>`).join('')}
      </div>
      <div class="s dim" style="font-size:11.5px;margin-top:4px">Grey lines are the rest of the league. Tap a name to bring it forward.${
        metric === 'ceiling' ? ' Ceiling is the best lineup that team could have started that week.' : ''}</div>
    </div>
  </div>` : ''}

  ${st.hasMaxPF ? `
  <div class="section-title">Max points for</div>
  <div class="card">
    <div class="card-hd"><h3>Season ceiling</h3><div class="spacer"></div>
      <span class="chip ghost">best possible lineup</span></div>
    <div class="card-bd flush">${barChart(st.rows, 'maxPF', 'Max PF')}</div>
    <div class="card-bd" style="border-top:1px solid var(--line-soft)">
      <div class="s dim" style="font-size:12px">Max PF is what you'd have scored starting the perfect lineup every week.
      The gap between this and your actual points is the cost of your start/sit calls.</div>
    </div>
  </div>` : ''}

  ${st.hasCeiling ? `
  <div class="section-title">Left on the bench</div>
  <div class="card">
    <div class="card-hd"><h3>Ceiling minus actual</h3><div class="spacer"></div>
      <span class="chip ghost">lower is better</span></div>
    <div class="card-bd flush">${barChart(st.rows, 'left', 'Left on bench')}</div>
  </div>` : ''}

  ${st.hasEfficiency ? `
  <div class="section-title">Lineup efficiency</div>
  <div class="card">
    <div class="card-hd"><h3>Points as a share of ceiling</h3></div>
    <div class="card-bd flush">${barChart(withData, 'efficiency', 'Efficiency', '%')}</div>
  </div>` : ''}

  ${st.hasData ? `
  <div class="section-title">The numbers</div>
  <div class="card"><div class="card-bd flush"><div class="tw"><table class="dt">
    <thead><tr><th class="sticky">Team</th>
      ${st.weeks.map((w) => `<th class="n">W${w}</th>`).join('')}
      <th class="n">Total</th><th class="n">Avg</th><th class="n">High</th><th class="n">Low</th>
      ${st.hasMaxPF ? '<th class="n">Max PF</th><th class="n">Bench</th>' : ''}</tr></thead>
    <tbody>${[...withData].sort((a, b) => b.total - a.total).map((r) => `
      <tr><td class="sticky">${teamTag(r)}</td>
        ${st.weeks.map((w) => `<td class="n ${r.byWeek[w] === r.high ? 'pos' : r.byWeek[w] === r.low ? 'dim' : ''}">${r.byWeek[w] != null ? pts(r.byWeek[w]) : '<span class="dimmer">&mdash;</span>'}</td>`).join('')}
        <td class="n" style="font-weight:700">${pts(r.total)}</td>
        <td class="n">${pts(r.avg)}</td>
        <td class="n pos">${pts(r.high)}</td>
        <td class="n dim">${pts(r.low)}</td>
        ${st.hasMaxPF ? `<td class="n">${r.maxPF != null ? pts(r.maxPF) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n dim">${r.left != null ? pts(r.left) : '<span class="dimmer">&mdash;</span>'}</td>` : ''}
      </tr>`).join('')}
    </tbody></table></div></div></div>` : ''}

  <div class="s dimmer" style="font-size:11.5px;margin-top:16px;text-align:center">
    ${sync ? `Last Sleeper sync ${esc(sync)}` : 'Not yet synced with Sleeper'}
  </div>`;
}

export function mount(root, db, go, setState) {
  root.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () =>
    setState({ focusTeam: Number(b.dataset.focus) })));
  root.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () =>
    setState({ metric: b.dataset.metric })));
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
    tip.innerHTML = `<b style="font-family:var(--f-display);letter-spacing:.06em">WEEK ${wk}</b><br>`
      + ranked.slice(0, 3).map((r, i) =>
        `<span style="color:var(--ink-3)">${i + 1}.</span> ${esc(r.manager)} <b>${pts(r[mKey][wk])}</b>`).join('<br>');
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
}
