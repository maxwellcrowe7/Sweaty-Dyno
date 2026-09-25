import { money, esc, icon, teamTag, empty, fmtDate, pts, gauge } from '../util.js';

export function render(db) {
  // Home is pinned to the current season rather than the shared browsing one:
  // it has no picker, so following it would show a stale year with no way back.
  const S = db.league.currentSeason ?? db.season;
  const all = db.bank();
  const emp = db.empire();
  const led = db.ledger();
  const owing = led.filter((t) => t.owesNow > 0).sort((a, b) => b.owesNow - a.owesNow);
  const { trades } = db.trades();
  // anything still hanging over the league: open, or past its deadline and
  // waiting on a decision
  const openCond = db.conditions().filter((c) => ['open', 'due'].includes(db.conditionStatus(c).key));
  const mg = db.minigames(S);
  const nextGame = mg.games.find((g) => g.status !== 'final');
  const spend = db.minigameSpend(S);
  const st = db.stats(S);
  const leader = emp.board[0];

  const seasonBank = db.bank(S);
  const paidThis = seasonBank.payins.filter((p) => p.paid).length;

  return `
  <div class="hero">
  <div class="card gauge-card">
    <div style="position:relative">
      ${gauge([{ key: 'free', value: all.free }, { key: 'empire', value: all.earmarked }],
        `Bank cash ${money(all.cash)}: ${money(all.free)} free, ${money(all.earmarked)} empire pot`)}
      <div class="gauge-val">
        <div class="big">${money(all.cash)}</div>
        <div class="lbl">In the bank</div>
      </div>
    </div>
    <div class="gauge-legend">
      <div><i style="background:#3DDC97"></i> ${money(all.free)} free</div>
      <div><i style="background:#9C8CFA"></i> ${money(all.earmarked)} empire pot</div>
    </div>
  </div>

  <div class="tiles">
    <div class="tile mint"><div class="k">Collected</div><div class="v">${money(all.collected)}</div>
      <div class="m">all seasons</div></div>
    <div class="tile ${all.owedNow ? 'red' : ''}"><div class="k">Owed now</div><div class="v">${money(all.owedNow)}</div>
      <div class="m">${all.future ? money(all.future) + ' in future seasons' : 'nothing outstanding'}</div></div>
    <div class="tile accent"><div class="k">Paid out</div><div class="v">${money(all.disbursed)}</div>
      <div class="m">to managers</div></div>
    <div class="tile violet"><div class="k">Empire pot</div><div class="v">${money(emp.pot)}</div>
      <div class="m">${emp.claimed ? 'claimed' : 'unclaimed'}</div></div>
  </div>
  </div>

  ${owing.length ? `
  <div class="section-title">Dues outstanding</div>
  <div class="card"><div class="card-bd flush"><div class="rows">
    ${owing.slice(0, 5).map((t) => `
      <div class="row">
        ${teamTag(t)}
        <div class="grow"></div>
        <div class="val neg">${money(t.owesNow)}</div>
      </div>`).join('')}
  </div></div>
    ${owing.length > 5 ? `<div class="card-bd" style="padding-top:0"><button class="btn sm ghost" data-go="bank">See all ${owing.length} &rsaquo;</button></div>` : ''}
  </div>` : `
  <div class="section-title">Dues</div>
  <div class="card"><div class="card-bd">
    <div class="banner" style="background:rgba(61,220,151,.07);border-color:rgba(61,220,151,.26)">
      ${icon('check')}<div>Everyone is square through ${db.league.currentSeason}. <b style="color:var(--mint)">${money(all.collected)}</b> collected so far${all.future ? `, with ${money(all.future)} of buy-ins still scheduled.` : '.'}</div>
    </div>
  </div></div>`}

  <div class="section-title">Empire race</div>
  <div class="card">
    <div class="card-hd">
      <h3>Closest to the pot</h3>
      <div class="spacer"></div>
      <span class="chip violet">${money(emp.pot)} · ${emp.threshold} pts to win</span>
    </div>
    <div class="card-bd flush"><div class="rows">
      ${emp.board.slice(0, 4).map((t, i) => `
        <div class="row">
          <div style="width:18px;font-family:var(--f-display);font-weight:700;color:${i === 0 ? 'var(--gold)' : 'var(--ink-3)'};font-size:15px">${i + 1}</div>
          <div class="grow">
            <div class="t">${teamTag(t)}</div>
            <div class="meter violet" style="margin-top:7px"><i style="width:${(t.pct * 100).toFixed(1)}%"></i></div>
          </div>
          <div class="val" style="color:var(--violet)">${t.total}</div>
        </div>`).join('')}
    </div></div>
  </div>

  <div class="two" style="margin-top:14px">
    <div class="card">
      <div class="card-hd"><h3>${S} minigames</h3><div class="spacer"></div>
        <span class="chip">${money(spend.paid)} / ${money(spend.committed)}</span></div>
      <div class="card-bd">
        ${nextGame ? `
          <div class="row" style="padding:0 0 12px;border-bottom:1px solid var(--line-soft)">
            <span class="chip heat">Week ${nextGame.week}</span>
            <div class="grow"><div class="t">${nextGame.name ? esc(nextGame.name) : 'Minigame not set'}</div>
              <div class="s">${money(nextGame.payout?.['1'] || 0)} to the winner</div></div>
          </div>` : ''}
        <div class="meter" style="margin-top:12px"><i style="width:${spend.committed ? Math.min(100, (spend.paid / spend.committed) * 100).toFixed(1) : 0}%"></i></div>
        <div class="s dim" style="margin-top:8px;font-size:12px">
          ${money(spend.remaining)} of the ${S} minigame budget still to be won.
          ${mg.guillotine ? `Guillotine drops week ${mg.guillotine.startWeek}.` : ''}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-hd"><h3>${S} dues</h3><div class="spacer"></div>
        <span class="chip ${paidThis === seasonBank.payins.length ? 'mint' : ''}">${paidThis}/${seasonBank.payins.length} paid</span></div>
      <div class="card-bd">
        <div class="tile bare">
          <div class="k">Season pot</div>
          <div class="v">${money(seasonBank.collected)}</div>
          <div class="m">${seasonBank.outstanding ? money(seasonBank.outstanding) + ' still to come in' : 'fully collected'}</div>
        </div>
        <div class="meter mint" style="margin-top:12px"><i style="width:${seasonBank.payins.length ? (paidThis / seasonBank.payins.length * 100).toFixed(1) : 0}%"></i></div>
      </div>
    </div>
  </div>

  ${openCond.length ? `
  <div class="section-title">Open conditions</div>
  ${openCond.map((c) => {
    const s = db.conditionStatus(c);
    return `<div class="trade">
      <div class="trade-hd"><span class="chip ${s.chip}">${s.label}</span>
        <span class="d">${fmtDate(c.trade?.date, { year: true })}</span></div>
      <div class="cond"><div class="lbl">Condition</div>${esc(c.text)}
        ${c.deadline ? `<div class="out">${icon('clock')} ${esc(fmtDate(c.deadline, { year: true }))}</div>` : ''}</div>
    </div>`;
  }).join('')}` : ''}

  <div class="section-title">Latest moves</div>
  <div class="card"><div class="card-bd flush">
    ${trades.length ? `<div class="rows">${trades.slice(0, 4).map((t) => {
      const names = t.sides.map((s) => s.team ? esc(db.team(s.team)?.manager ?? `T${s.team}`) : esc(s.alias || '?'));
      const items = t.sides.flatMap((s) => s.receives).length;
      return `<div class="row">
        <span style="color:var(--ink-3)">${icon('swap')}</span>
        <div class="grow"><div class="t">${names.join(' &harr; ')}</div>
          <div class="s">${items} piece${items === 1 ? '' : 's'} &middot; ${fmtDate(t.date, { year: true })}</div></div>
        ${t.conditionalId ? '<span class="chip violet">Conditional</span>' : ''}
      </div>`;
    }).join('')}</div>` : empty('No trades logged', 'Trades you add will show up here newest-first.', 'swap')}
  </div>
  ${trades.length > 4 ? `<div class="card-bd" style="padding-top:12px"><button class="btn sm ghost" data-go="trades">All ${trades.length} trades &rsaquo;</button></div>` : ''}
  </div>

  ${st.hasMaxPF ? `
  <div class="section-title">Ceiling &middot; Max PF ${S}</div>
  <div class="card"><div class="card-bd flush"><div class="rows">
    ${st.rows.filter((r) => r.maxPF != null).sort((a, b) => b.maxPF - a.maxPF).slice(0, 3).map((r, i) => `
      <div class="row"><span class="chip ${i === 0 ? 'gold' : 'ghost'}">${i + 1}</span>
        <div class="grow"><div class="t">${teamTag(r)}</div>
          <div class="s">${r.total ? pts(r.total) + ' actual \u00b7 ' + (r.efficiency * 100).toFixed(1) + '% of ceiling' : 'ceiling only'}</div></div>
        <div class="val">${pts(r.maxPF)}</div></div>`).join('')}
  </div></div></div>` : ''}
  `;
}

export const mount = (root, db, go) => {
  root.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => go(b.dataset.go)));
};
