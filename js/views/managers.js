import { money, esc, icon, teamTag, dot, teamColor, empty } from '../util.js';

export function render(db) {
  const led = db.ledger();
  const S = db.season;
  const mg = db.get('managers');
  const emp = db.empire();
  const finishes = db.get('bank').finishes || [];

  return `
  ${mg._placeholder || mg._unconfirmed ? `<div class="banner" style="margin-bottom:14px">${icon('alert')}
    <div><b>Team numbers are provisional.</b> Confirm the mapping in <code>tools/remap_teams.py</code>
    and re-run it — the whole app follows.</div></div>` : ''}

  <div class="section-title">Franchises</div>
  ${led.sort((a, b) => a.number - b.number).map((t) => {
    const rings = finishes.filter((f) => f.team === t.number && f.place === 1);
    const ep = emp.board.find((b) => b.number === t.number);
    const hist = t.ownership.map((o) => {
      const m = db.managerById(o.managerId);
      return `${esc(m?.name ?? o.managerId)} <span class="dimmer">${o.fromSeason}&ndash;${o.toSeason ?? 'now'}</span>`;
    }).join(' <span class="dimmer">&rarr;</span> ');
    return `<div class="card" style="margin-bottom:10px;border-left:3px solid ${teamColor(t.number)}">
      <div class="card-hd">
        <div style="font-family:var(--f-display);font-size:22px;font-weight:700;color:${teamColor(t.number)};
          min-width:34px">${String(t.number).padStart(2, '0')}</div>
        <div style="min-width:0">
          <h3 style="font-size:17px">${esc(t.fullName)}</h3>
          <div class="sub" style="text-transform:none;letter-spacing:0;font-size:11.5px">
            Team ${t.number}${t.sleeper ? ` &middot; <span style="color:var(--ink-3)">@${esc(t.sleeper)}</span>` : ''}</div>
        </div>
        <div class="spacer"></div>
        ${rings.map(() => '<span class="chip gold">' + icon('trophy') + ' Champ</span>').join('')}
      </div>
      <div class="card-bd" style="padding-top:12px">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center">
          <div><div class="k" style="font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);font-weight:700">Paid in</div>
            <div style="font-family:var(--f-display);font-size:19px;font-weight:700;margin-top:3px">${money(t.paidIn)}</div></div>
          <div><div class="k" style="font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);font-weight:700">Won</div>
            <div style="font-family:var(--f-display);font-size:19px;font-weight:700;margin-top:3px;color:var(--mint)">${money(t.won)}</div></div>
          <div><div class="k" style="font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);font-weight:700">Net</div>
            <div style="font-family:var(--f-display);font-size:19px;font-weight:700;margin-top:3px"
              class="${t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : 'dim'}">${money(t.net, { sign: true })}</div></div>
          <div><div class="k" style="font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);font-weight:700">Empire</div>
            <div style="font-family:var(--f-display);font-size:19px;font-weight:700;margin-top:3px;color:var(--violet)">${ep?.total ?? 0}</div></div>
        </div>
        ${t.owesNow ? `<div class="banner" style="margin-top:13px;background:rgba(255,77,94,.07);border-color:rgba(255,77,94,.26)">
          ${icon('alert')}<div>Owes <b style="color:var(--red)">${money(t.owesNow)}</b> for ${db.league.currentSeason} or earlier.</div></div>` : ''}
        ${t.owes - t.owesNow > 0 ? `<div class="s dimmer" style="margin-top:11px;font-size:11.5px">
          ${money(t.owes - t.owesNow)} of buy-ins scheduled for later seasons.</div>` : ''}
        <div class="s dim" style="margin-top:13px;font-size:12px">
          <span class="dimmer" style="letter-spacing:.12em;text-transform:uppercase;font-size:9.5px;font-weight:700">Ownership</span><br>${hist}
        </div>
      </div>
    </div>`;
  }).join('')}

  ${(mg.unresolvedAliases || []).some((a) => !a.managerId) ? `
  <div class="section-title">Unmapped names</div>
  <div class="card"><div class="card-bd">
    <div class="s dim" style="font-size:12.5px;margin-bottom:12px">These names appear in your spreadsheet but aren't
    matched to a manager yet, so their trades and claims show as unassigned.</div>
    ${mg.unresolvedAliases.filter((a) => !a.managerId).map((a) => `
      <div class="row" style="padding:10px 0">
        <span class="chip red">${esc(a.alias)}</span>
        <div class="grow"><div class="s">seen in ${esc(a.seenIn.join(', '))}</div></div>
      </div>`).join('')}
  </div></div>` : ''}
  `;
}
