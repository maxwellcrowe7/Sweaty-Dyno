import { money, esc, icon, teamTag, empty, toast } from '../util.js';

const CATS = {
  empire:    { label: 'Empire / rolling pot', chip: 'violet', order: 0 },
  placement: { label: 'Placement',            chip: 'gold',   order: 1 },
  minigame:  { label: 'Minigames',            chip: 'heat',   order: 2 },
};

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

/* ---------- payouts, one collapsible block per season ---------- */
function seasonPayouts(db, season, open) {
  const b = db.get('bank');
  const rows = b.payouts.filter((p) => p.season === season);
  const claim = db.empireClaim();
  const empire = claim && claim.season === season ? claim : null;

  const placement = rows.filter((p) => p.category === 'placement').sort((a, x) => (a.place || 9) - (x.place || 9));
  const minigames = rows.filter((p) => p.category === 'minigame').sort((a, x) => x.amount - a.amount);

  const lines = [
    { cat: 'empire', total: empire ? empire.amount : 0,
      sub: empire ? `Won by ${esc(db.team(empire.team)?.manager ?? '')}` : 'Empire criteria not met — rolls over',
      rows: empire ? [{ label: db.team(empire.team)?.manager ?? '', amount: empire.amount }] : [] },
    { cat: 'placement', total: placement.reduce((a, p) => a + p.amount, 0),
      sub: `${placement.length} place${placement.length === 1 ? '' : 's'} paid`,
      rows: placement.map((p) => ({ label: `${ORD[(p.place || 1) - 1]} — ${db.team(p.team)?.manager ?? ''}`, amount: p.amount })) },
    { cat: 'minigame', total: minigames.reduce((a, p) => a + p.amount, 0),
      sub: `${minigames.length} manager${minigames.length === 1 ? '' : 's'} cashed`,
      rows: minigames.map((p) => ({ label: db.team(p.team)?.manager ?? '', amount: p.amount })) },
  ];
  const total = lines.reduce((a, l) => a + l.total, 0);

  return `
  <div class="card acc${open ? ' open' : ''}" style="margin-bottom:10px">
    <button class="acc-hd" data-season="${season}" aria-expanded="${open}">
      ${icon('chev', 'acc-caret')}
      <h3>${season}</h3>
      <div class="spacer" style="margin-left:auto"></div>
      <span class="chip${total ? ' mint' : ''}">${money(total)}</span>
    </button>
    <div class="acc-bd">
      ${lines.map((l) => {
        const c = CATS[l.cat];
        const can = l.rows.length > 0;
        return `<div class="pay-line${can ? ' can' : ''}">
          <button class="pay-hd" ${can ? `data-line="${season}:${l.cat}"` : 'disabled'}>
            ${can ? icon('chev', 'acc-caret') : '<span style="width:18px;flex:none"></span>'}
            <span class="chip ${c.chip}">${c.label}</span>
            <div class="grow"><div class="s">${l.sub}</div></div>
            <div class="pay-val${l.total ? '' : ' zero'}">${money(l.total)}</div>
          </button>
          ${can ? `<ul class="pay-rows">
            ${l.rows.map((r) => `<li><span>${esc(r.label)}</span><b>${money(r.amount)}</b></li>`).join('')}
          </ul>` : ''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

export function render(db, state = {}) {
  const all = db.bank();
  const led = db.ledger().sort((a, b) => b.net - a.net);
  const seasons = db.seasons;
  const teams = db.teams();
  const bank = db.get('bank');
  const admin = db.isAdmin;
  const P = state.params || {};
  const openSeasons = new Set((P.open || String(db.league.currentSeason)).split(',').filter(Boolean).map(Number));
  const ratesOpen = P.rates === '1';

  const paidFor = (t, s) => bank.payins.find((p) => p.team === t && p.season === s)?.paid || 0;
  const seasonPaid = (s) => bank.payins.filter((p) => p.season === s).reduce((a, p) => a + (Number(p.paid) || 0), 0);
  const seasonDue = (s) => db.buyIn(s) * teams.length;

  const sheet = seasons.map((s) => {
    const bs = db.bank(s);
    const contrib = s <= db.league.currentSeason ? (Number(db.league.empireContribution[String(s)]) || 0) : 0;
    const mini = bs.byCat.minigame || 0, place = bs.byCat.placement || 0;
    return { season: s, inn: bs.collected, empire: contrib, mini, place,
             surplus: bs.collected - contrib - mini - place };
  });

  return `
  <div class="tiles">
    <div class="tile accent"><div class="k">Should be in the bank</div><div class="v">${money(all.cash)}</div>
      <div class="m">${money(all.collected)} in &minus; ${money(all.disbursed)} out</div></div>
    <div class="tile violet"><div class="k">Empire pot</div><div class="v">${money(all.earmarked)}</div>
      <div class="m">${db.empireClaim() ? 'claimed' : 'accruing, unclaimed'}</div></div>
    <div class="tile mint"><div class="k">Free cash</div><div class="v">${money(all.free)}</div>
      <div class="m">not spoken for</div></div>
    <div class="tile ${all.owedNow ? 'red' : ''}"><div class="k">Owed now</div><div class="v">${money(all.owedNow)}</div>
      <div class="m">through ${db.league.currentSeason}</div></div>
  </div>

  <div class="section-title">Buy-ins</div>
  <div class="card">
    <div class="card-hd"><h3>Buy-ins</h3><div class="spacer"></div>
      ${admin ? '<span class="chip heat">Type an amount in any cell</span>'
              : `<span class="chip">${money(all.collected)} of ${money(all.expected)}</span>`}</div>

    <button class="acc-hd sub" data-rates aria-expanded="${ratesOpen}">
      ${icon('chev', 'acc-caret')}
      <span>Buy-in per season</span>
      <div class="spacer" style="margin-left:auto"></div>
      <span class="chip ghost">${money(db.buyIn(db.league.currentSeason))} in ${db.league.currentSeason}</span>
    </button>
    <div class="acc-bd${ratesOpen ? ' open' : ''}">
      <div class="card-bd" style="padding-top:6px">
        <div class="rates">
          ${seasons.map((s) => `<label class="rate">
            <span>${s}</span>
            ${admin ? `<input type="number" min="0" step="5" inputmode="numeric"
                        data-rate="${s}" value="${db.buyIn(s)}">`
                    : `<b>${money(db.buyIn(s))}</b>`}
            <i>&times;${teams.length} = ${money(seasonDue(s))}</i>
          </label>`).join('')}
        </div>
      </div>
    </div>

    <div class="card-bd flush"><div class="tw"><table class="dt">
      <thead><tr><th class="sticky">Team</th>
        ${seasons.map((s) => `<th class="n">${s}</th>`).join('')}
        <th class="n">Paid</th></tr></thead>
      <tbody>
        ${teams.map((t) => {
          const paid = seasons.reduce((a, s) => a + paidFor(t.number, s), 0);
          return `<tr><td class="sticky">${teamTag(t)}</td>
            ${seasons.map((s) => {
              const v = paidFor(t.number, s);
              const due = db.buyIn(s);
              const cls = v >= due && due > 0 ? 'full' : v > 0 ? 'part' : 'none';
              return `<td class="n cell-${cls}">${admin
                ? `<input class="cell-in" type="number" min="0" step="5" inputmode="numeric"
                     data-pay="${t.number}:${s}" value="${v || ''}" placeholder="0"
                     aria-label="${esc(t.manager)} ${s}">`
                : v ? money(v) : '<span class="dimmer">&mdash;</span>'}</td>`;
            }).join('')}
            <td class="n" style="font-weight:700">${money(paid)}</td></tr>`;
        }).join('')}
        <tr class="total"><td class="sticky">Collected</td>
          ${seasons.map((s) => `<td class="n">${seasonPaid(s) ? money(seasonPaid(s)) : '<span class="dimmer">&mdash;</span>'}</td>`).join('')}
          <td class="n">${money(all.collected)}</td></tr>
        <tr class="total sub"><td class="sticky dim">Expected</td>
          ${seasons.map((s) => `<td class="n dim">${money(seasonDue(s))}</td>`).join('')}
          <td class="n dim">${money(all.expected)}</td></tr>
      </tbody></table></div></div>
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
        <td class="n ${r.surplus > 0 ? 'pos' : r.surplus < 0 ? 'neg' : 'dimmer'}">${r.inn ? money(r.surplus) : '&mdash;'}</td></tr>`).join('')}
      <tr class="total"><td class="sticky">All time</td>
        <td class="n">${money(all.collected)}</td>
        <td class="n">${money(db.empirePotBalance() + (db.empireClaim()?.amount || 0))}</td>
        <td class="n">${money(all.byCat.minigame || 0)}</td>
        <td class="n">${money(all.byCat.placement || 0)}</td>
        <td class="n ${all.free >= 0 ? 'pos' : 'neg'}">${money(all.free)}</td></tr>
    </tbody></table></div></div></div>

  <div class="section-title">Payouts</div>
  ${seasons.filter((s) => bank.payouts.some((p) => p.season === s) || db.empireClaim()?.season === s)
    .sort((a, b) => b - a)
    .map((s) => seasonPayouts(db, s, openSeasons.has(s))).join('')
    || empty('No payouts yet', 'Minigame and placement winners will appear here, grouped by season.', 'wallet')}

  <div class="section-title">Manager ledger</div>
  <div class="card">
    <div class="card-hd"><h3>Lifetime net</h3><div class="spacer"></div>
      <span class="chip ghost">winnings &minus; buy-ins</span></div>
    <div class="card-bd flush"><div class="rows">
      ${led.map((t) => `
        <div class="row">
          <div class="grow">
            <div class="t">${teamTag(t)}</div>
            <div class="s">${money(t.paidIn)} in &middot; ${money(t.won)} won${t.owesNow ? ` &middot; <span class="neg">${money(t.owesNow)} owed</span>` : ''}</div>
            <div style="display:flex;gap:3px;margin-top:7px;height:5px;border-radius:99px;overflow:hidden;background:var(--surface-3)">
              ${Object.entries(t.cat).filter(([, v]) => v > 0).map(([c, v]) => `
                <i style="display:block;height:100%;width:${t.won ? (v / t.won * 100).toFixed(1) : 0}%;background:${
                  c === 'minigame' ? 'var(--heat)' : c === 'placement' ? 'var(--gold)' : 'var(--violet)'}"></i>`).join('')}
            </div>
          </div>
          <div class="val ${t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : 'dim'}">${money(t.net, { sign: true })}</div>
        </div>`).join('')}
    </div></div>
  </div>
  `;
}

export function mount(root, db, go, setState, params = {}) {
  const nav = (patch) => go('bank', { ...params, ...patch });

  /* buy-in cells: type a value, save on blur or Enter */
  root.querySelectorAll('[data-pay]').forEach((inp) => {
    const commit = async () => {
      const [team, season] = inp.dataset.pay.split(':').map(Number);
      const val = Math.max(0, Number(inp.value) || 0);
      const cur = db.get('bank').payins.find((p) => p.team === team && p.season === season)?.paid || 0;
      if (val === cur) return;
      await db.update('bank', (b) => {
        const row = b.payins.find((p) => p.team === team && p.season === season);
        if (row) row.paid = val;
        else b.payins.push({ season, team, paid: val });
      });
      toast(`${db.team(team).manager} ${season}: ${val ? money(val) : 'cleared'}`);
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = inp.defaultValue; inp.blur(); }
    });
  });

  /* buy-in rate per season */
  root.querySelectorAll('[data-rate]').forEach((inp) => {
    inp.addEventListener('blur', async () => {
      const s = inp.dataset.rate;
      const val = Math.max(0, Number(inp.value) || 0);
      if (val === db.buyIn(s)) return;
      await db.update('league', (L) => { L.buyIn[s] = val; });
      toast(`${s} buy-in set to ${money(val)}`);
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });

  root.querySelector('[data-rates]')?.addEventListener('click', () =>
    nav({ rates: params.rates === '1' ? null : '1' }));

  /* one open season at a time is the common case, but allow several */
  root.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => {
    const cur = new Set((params.open || String(db.league.currentSeason)).split(',').filter(Boolean));
    const y = b.dataset.season;
    cur.has(y) ? cur.delete(y) : cur.add(y);
    nav({ open: [...cur].join(',') || null });
  }));

  /* payout category rows expand in place, no re-render */
  root.querySelectorAll('[data-line]').forEach((b) => b.addEventListener('click', () =>
    b.closest('.pay-line').classList.toggle('open')));
}
