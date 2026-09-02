import { money, esc, icon, teamTag, empty, ordinal } from '../util.js';

export function render(db) {
  const e = db.empire();
  const L = db.league;
  const seasons = db.seasons;
  const bank = db.get('bank');
  const leader = e.board[0];
  const chase = e.board[1];

  let running = 0;
  const growth = e.contributions.map((c) => ({ ...c, running: (running += c.amount) }));
  const maxRun = Math.max(...growth.map((g) => g.running), 1);

  return `
  <div class="card gauge-card" style="padding-top:26px">
    <div class="k" style="font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3);font-weight:700">The Empire Pot</div>
    <div style="font-family:var(--f-display);font-size:56px;font-weight:700;line-height:1;margin:8px 0 4px;color:var(--violet);
      text-shadow:0 0 30px rgba(156,140,250,.35)">${money(e.pot)}</div>
    <div class="s dim" style="font-size:12.5px">${e.claimed
      ? `Claimed by <b style="color:var(--gold)">${esc(db.team(e.claimed)?.manager ?? '')}</b>`
      : `Rolls over until someone reaches <b style="color:var(--violet)">${e.threshold} empire points</b>`}</div>
    <div style="margin-top:18px;display:flex;gap:3px;align-items:flex-end;height:60px;justify-content:center">
      ${growth.map((g) => `
        <div style="flex:1;max-width:56px;display:flex;flex-direction:column;align-items:center;gap:5px">
          <div style="width:100%;height:${g.running ? Math.max(6, (g.running / maxRun) * 46) : 3}px;border-radius:3px;
            background:${g.amount ? 'linear-gradient(180deg,#C9BDFF,var(--violet))' : 'var(--surface-3)'}"
            title="${g.season}: ${money(g.running)}"></div>
          <div style="font-size:9.5px;color:var(--ink-3);font-weight:600">${String(g.season).slice(2)}</div>
        </div>`).join('')}
    </div>
    <div class="s dimmer" style="font-size:11px;margin-top:8px">${money(L.empireContribution[String(db.season)] || 0)} set aside each season</div>
  </div>

  <div class="section-title">The race</div>
  <div class="card">
    <div class="card-hd"><h3>Empire points</h3><div class="spacer"></div>
      <span class="chip violet">${e.threshold} to win</span></div>
    <div class="card-bd flush"><div class="rows">
      ${e.board.map((t, i) => `
        <div class="row">
          <div style="width:20px;flex:none;font-family:var(--f-display);font-weight:700;font-size:15px;
            color:${i === 0 ? 'var(--gold)' : 'var(--ink-3)'}">${i + 1}</div>
          <div class="grow">
            <div class="t">${teamTag(t)}</div>
            <div class="meter violet" style="margin-top:7px"><i style="width:${(t.pct * 100).toFixed(1)}%"></i></div>
            <div class="s" style="margin-top:5px">${t.total
              ? `${e.threshold - t.total} more to claim ${money(e.pot)}`
              : 'yet to score'}</div>
          </div>
          <div class="val" style="color:${t.total ? 'var(--violet)' : 'var(--ink-3)'}">${t.total}</div>
        </div>`).join('')}
    </div></div>
    ${leader && chase ? `<div class="card-bd" style="border-top:1px solid var(--line-soft)">
      <div class="banner" style="background:rgba(156,140,250,.07);border-color:rgba(156,140,250,.26)">
        ${icon('crown')}<div><b style="color:var(--violet)">${esc(leader.manager)}</b> leads by
        ${leader.total - chase.total} point${leader.total - chase.total === 1 ? '' : 's'} and is
        ${((leader.pct) * 100).toFixed(0)}% of the way to the pot.</div></div>
    </div>` : ''}
  </div>

  <div class="section-title">How points are earned</div>
  <div class="card"><div class="card-bd flush"><div class="rows">
    ${L.empirePointsScale.map((s) => `
      <div class="row">
        <span class="chip ${s.place === 1 ? 'gold' : 'ghost'}">${ordinal(s.place)}</span>
        <div class="grow"><div class="t">${esc(s.label)}</div></div>
        <div class="val" style="color:var(--violet)">+${s.points}</div>
      </div>`).join('')}
  </div></div>
  <div class="card-bd" style="border-top:1px solid var(--line-soft)">
    <div class="s dim" style="font-size:12px;line-height:1.6">${esc(L.empireRule)}</div></div>
  </div>

  <div class="section-title">By season</div>
  <div class="card"><div class="card-bd flush"><div class="tw"><table class="dt">
    <thead><tr><th class="sticky">Team</th>
      ${seasons.map((s) => `<th class="n">${String(s).slice(2)}</th>`).join('')}
      <th class="n">Total</th></tr></thead>
    <tbody>
      ${e.board.map((t) => `<tr><td class="sticky">${teamTag(t)}</td>
        ${seasons.map((s) => `<td class="n ${t.bySeason[s] ? '' : 'dimmer'}">${t.bySeason[s] || '&mdash;'}</td>`).join('')}
        <td class="n" style="font-weight:700;color:var(--violet)">${t.total}</td></tr>`).join('')}
      <tr class="total"><td class="sticky">Pot</td>
        ${seasons.map((s) => {
          const v = bank.payouts.filter((p) => p.category === 'empire' && p.season === s).reduce((a, p) => a + p.amount, 0);
          return `<td class="n ${v ? '' : 'dimmer'}">${v ? money(v) : '&mdash;'}</td>`;
        }).join('')}
        <td class="n" style="color:var(--violet)">${money(e.pot)}</td></tr>
    </tbody></table></div></div></div>
  `;
}
