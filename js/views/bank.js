import { money, esc, icon, teamTag, dot, empty, toast } from '../util.js';

const CATS = {
  minigame:  { label: 'Minigames', chip: 'heat' },
  placement: { label: 'Placement', chip: 'gold' },
  empire:    { label: 'Rolling pot', chip: 'violet' },
  other:     { label: 'Other', chip: '' },
};

export function render(db) {
  const all = db.bank();
  const led = db.ledger().sort((a, b) => b.net - a.net);
  const seasons = db.seasons;
  const teams = db.teams();
  const bank = db.get('bank');
  const admin = db.isAdmin;

  /* ---- balance sheet ---- */
  const sheet = seasons.map((s) => {
    const b = db.bank(s);
    return {
      season: s,
      inn: b.collected,
      empire: b.byCat.empire || 0,
      mini: b.byCat.minigame || 0,
      place: b.byCat.placement || 0,
      get surplus() { return this.inn - this.empire - this.mini - this.place; },
      outstanding: b.outstanding,
    };
  });

  return `
  <div class="tiles">
    <div class="tile accent"><div class="k">Should be in the bank</div><div class="v">${money(all.cash)}</div>
      <div class="m">${money(all.collected)} in &minus; ${money(all.disbursed)} out</div></div>
    <div class="tile violet"><div class="k">Empire locked</div><div class="v">${money(all.earmarked)}</div>
      <div class="m">stays until claimed</div></div>
    <div class="tile mint"><div class="k">Free cash</div><div class="v">${money(all.free)}</div>
      <div class="m">not spoken for</div></div>
    <div class="tile ${all.owedNow ? 'red' : ''}"><div class="k">Owed now</div><div class="v">${money(all.owedNow)}</div>
      <div class="m">${money(all.future)} scheduled later</div></div>
  </div>

  <div class="section-title">Buy-ins</div>
  <div class="card">
    <div class="card-hd"><h3>Who's paid</h3><div class="spacer"></div>
      ${admin ? '<span class="chip heat">Tap a cell to toggle</span>' : `<span class="chip">${money(db.league.buyIn[String(db.season)] || 0)} / season</span>`}</div>
    <div class="card-bd flush"><div class="tw"><table class="dt">
      <thead><tr><th class="sticky">Team</th>
        ${seasons.map((s) => `<th class="n">${s}</th>`).join('')}
        <th class="n">Paid</th><th class="n">Owes</th></tr></thead>
      <tbody>
        ${teams.map((t) => {
          const rows = seasons.map((s) => bank.payins.find((p) => p.team === t.number && p.season === s));
          const paid = rows.filter((r) => r?.paid).reduce((a, r) => a + r.amount, 0);
          const owes = rows.filter((r) => r && !r.paid).reduce((a, r) => a + r.amount, 0);
          return `<tr><td class="sticky">${teamTag(t)}</td>
            ${rows.map((r, i) => !r ? '<td class="n dimmer">&ndash;</td>' : `
              <td class="n" ${admin ? `data-pay="${t.number}:${seasons[i]}" style="cursor:pointer"` : ''}
                  title="${esc(r.note || '')}">
                ${r.paid
                  ? `<span style="color:var(--mint)">${money(r.amount)}</span>`
                  : `<span style="color:var(--ink-3)">&mdash;</span>`}
                ${r.note ? '<span style="color:var(--heat)" title="' + esc(r.note) + '">*</span>' : ''}
              </td>`).join('')}
            <td class="n" style="font-weight:700">${money(paid)}</td>
            <td class="n ${owes ? (rows.some((r) => r && !r.paid && r.season <= db.league.currentSeason) ? 'neg' : 'dim') : 'dimmer'}">${owes ? money(owes) : '&mdash;'}</td></tr>`;
        }).join('')}
        <tr class="total"><td class="sticky">Total</td>
          ${seasons.map((s) => `<td class="n">${money(db.bank(s).collected)}</td>`).join('')}
          <td class="n">${money(all.collected)}</td>
          <td class="n ${all.outstanding ? 'neg' : ''}">${all.outstanding ? money(all.outstanding) : '&mdash;'}</td></tr>
      </tbody></table></div></div>
      ${bank.payins.some((p) => p.note) ? `<div class="card-bd" style="border-top:1px solid var(--line-soft)">
        ${bank.payins.filter((p) => p.note).map((p) => `<div class="s dim" style="font-size:12px">
          <b style="color:var(--heat)">*</b> ${p.season} ${esc(db.team(p.team)?.manager ?? '')} &mdash; ${esc(p.note)}</div>`).join('')}
      </div>` : ''}
  </div>

  <div class="section-title">Balance sheet</div>
  <div class="card"><div class="card-bd flush"><div class="tw"><table class="dt">
    <thead><tr><th class="sticky">Season</th><th class="n">In</th><th class="n">Empire</th>
      <th class="n">Minigames</th><th class="n">Placement</th><th class="n">Surplus</th></tr></thead>
    <tbody>${sheet.map((r) => `
      <tr><td class="sticky" style="font-weight:700">${r.season}</td>
        <td class="n">${r.inn ? money(r.inn) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n" style="color:${r.empire ? 'var(--violet)' : ''}">${r.empire ? money(r.empire) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n" style="color:${r.mini ? 'var(--heat)' : ''}">${r.mini ? money(r.mini) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n" style="color:${r.place ? 'var(--gold)' : ''}">${r.place ? money(r.place) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n ${r.surplus > 0 ? 'pos' : r.surplus < 0 ? 'neg' : 'dimmer'}">${r.inn || r.mini || r.place ? money(r.surplus) : '&mdash;'}</td></tr>`).join('')}
      <tr class="total"><td class="sticky">All time</td>
        <td class="n">${money(all.collected)}</td>
        <td class="n">${money(all.byCat.empire || 0)}</td>
        <td class="n">${money(all.byCat.minigame || 0)}</td>
        <td class="n">${money(all.byCat.placement || 0)}</td>
        <td class="n ${all.collected - all.disbursed - all.earmarked >= 0 ? 'pos' : 'neg'}">${money(all.free)}</td></tr>
    </tbody></table></div></div></div>

  <div class="section-title">Manager ledger</div>
  <div class="card">
    <div class="card-hd"><h3>Lifetime net</h3><div class="spacer"></div>
      <span class="chip ghost">winnings &minus; buy-ins</span></div>
    <div class="card-bd flush"><div class="rows">
      ${led.map((t) => `
        <div class="row">
          <div class="grow">
            <div class="t">${teamTag(t)}</div>
            <div class="s">${money(t.paidIn)} in &middot; ${money(t.won)} won${t.owes ? ` &middot; <span class="neg">${money(t.owes)} owed</span>` : ''}</div>
            <div style="display:flex;gap:4px;margin-top:7px;height:5px;border-radius:99px;overflow:hidden;background:var(--surface-3)">
              ${Object.entries(t.cat).filter(([, v]) => v > 0).map(([c, v]) => `
                <i style="display:block;height:100%;width:${t.won ? (v / t.won * 100).toFixed(1) : 0}%;background:${
                  c === 'minigame' ? 'var(--heat)' : c === 'placement' ? 'var(--gold)' : 'var(--violet)'}"></i>`).join('')}
            </div>
          </div>
          <div class="val ${t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : 'dim'}">${money(t.net, { sign: true })}</div>
        </div>`).join('')}
    </div></div>
  </div>

  <div class="section-title">Payouts</div>
  ${db.seasons.filter((s) => bank.payouts.some((p) => p.season === s)).map((s) => {
    const ps = bank.payouts.filter((p) => p.season === s);
    return `<div class="card">
      <div class="card-hd"><h3>${s}</h3><div class="spacer"></div>
        <span class="chip">${money(ps.reduce((a, p) => a + p.amount, 0))}</span></div>
      <div class="card-bd flush"><div class="rows">
        ${ps.sort((a, b) => b.amount - a.amount).map((p) => {
          const c = CATS[p.category] || CATS.other;
          return `<div class="row">
            <span class="chip ${c.chip}">${c.label}</span>
            <div class="grow">
              <div class="t">${p.team ? teamTag(db.team(p.team)) : '<span class="dim">Rolls into the empire pot</span>'}</div>
              <div class="s">${esc(p.label || '')}${p.note ? ' &middot; ' + esc(p.note) : ''}</div>
            </div>
            <div class="val" style="color:${p.paid ? '' : 'var(--violet)'}">${money(p.amount)}</div>
          </div>`;
        }).join('')}
      </div></div></div>`;
  }).join('') || empty('No payouts recorded', 'Payouts appear here as you log minigame and placement winners.', 'wallet')}
  `;
}

export function mount(root, db) {
  root.querySelectorAll('[data-pay]').forEach((cell) => cell.addEventListener('click', async () => {
    const [team, season] = cell.dataset.pay.split(':').map(Number);
    await db.update('bank', (b) => {
      const p = b.payins.find((x) => x.team === team && x.season === season);
      if (p) p.paid = !p.paid;
    });
    const t = db.team(team);
    const now = db.get('bank').payins.find((x) => x.team === team && x.season === season);
    toast(`${t.manager} ${season}: ${now.paid ? 'paid' : 'unpaid'}`);
  }));
}
