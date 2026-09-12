import { money, esc, icon, teamTag, ordinal } from '../util.js';

/* The podium reads as a podium: gold, silver, bronze, then nothing. */
const MEDAL = { 1: 'gold', 2: 'silver', 3: 'bronze' };

export function render(db) {
  const e = db.empire();
  const L = db.league;
  const seasons = db.seasons;
  const bank = db.get('bank');
  // How full the bar reads: points against the threshold, or against the pack
  // if no threshold is configured, so the longest bar is always the leader.
  const top = Math.max(...e.board.map((t) => t.total), 0);
  const barPct = (t) => {
    const den = e.threshold || top;
    return den ? Math.min(1, t.total / den) : 0;
  };

  // The crown column is always as wide as the pot demands, whether or not anyone
  // has filled it. Widens if someone collects more than that, to keep rows aligned.
  const slots = Math.max(e.titlesToWin, ...e.board.map((t) => t.titles), 1);

  let running = 0;
  const growth = e.contributions.map((c) => ({ ...c, running: (running += c.amount) }));
  const maxRun = Math.max(...growth.map((g) => g.running), 1);

  return `
  ${/* Pot and race are ONE block at the top of the page -- the pot states the
       rule, the race shows who is close to it, so they are two halves of the
       same card rather than two cards that happen to sit together. */''}
  <div class="card empire-top">
  <div class="pot-side">
    <div class="k" style="font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3);font-weight:700">The Empire Pot</div>
    <div style="font-family:var(--f-display);font-size:56px;font-weight:700;line-height:1;margin:8px 0 4px;color:var(--violet);
      text-shadow:0 0 30px rgba(156,140,250,.35)">${money(e.pot)}</div>
    <div class="s dim" style="font-size:12.5px">${e.claimed
      ? `Claimed by <b style="color:var(--gold)">${esc(db.team(e.claimed)?.manager ?? '')}</b>`
      : `Rolls over until a manager wins <b style="color:var(--violet)">${e.titlesToWin} titles</b>, or <b style="color:var(--violet)">1 title and ${e.threshold}+ points</b>`}</div>
    <div class="pot-growth">
      ${growth.map((g) => `
        <div class="col">
          <div class="bar" style="height:${g.running ? Math.max(8, (g.running / maxRun) * 100) : 4}%;
            background:${g.amount ? 'linear-gradient(180deg,#C9BDFF,var(--violet))' : 'var(--surface-3)'}"
            title="${g.season}: ${money(g.running)}"></div>
          <span>${String(g.season).slice(2)}</span>
        </div>`).join('')}
    </div>
    <div class="s dimmer" style="font-size:11px;margin-top:8px">${money(L.empireContribution[String(db.season)] || 0)} set aside each season</div>
  </div>

  ${/* One line per manager: name, bar, points, then a crown per title held.
       The slot is always as wide as the pot demands, so an earned crown lands
       in the same column on every row and the empty space says what is left. */''}
  <div class="race">
    ${e.board.map((t) => `
      <div class="race-row${t.total ? '' : ' out'}">
        <span class="who">${esc(t.manager)}</span>
        <span class="meter violet"><i style="width:${(barPct(t) * 100).toFixed(1)}%"></i></span>
        <span class="pts${t.total ? '' : ' zero'}">${t.total}</span>
        <span class="ttl" style="--slots:${slots}">${
          Array.from({ length: t.titles }, () => icon('crown', 'on')).join('')}</span>
      </div>`).join('')}
  </div>
  </div>

  <div class="section-title">Point criteria</div>
  <div class="card"><div class="card-bd flush"><div class="rows">
    ${L.empirePointsScale.map((s) => `
      <div class="row">
        <span class="chip ${MEDAL[s.place] || 'ghost'}">${ordinal(s.place)}</span>
        <div class="grow"><div class="t">${esc(s.label)}</div></div>
        <div class="val" style="color:var(--violet)">+${s.points}</div>
      </div>`).join('')}
  </div></div></div>

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
          const v = e.contributions.find((c) => c.season === s)?.amount || 0;
          return `<td class="n ${v ? '' : 'dimmer'}">${v ? money(v) : '&mdash;'}</td>`;
        }).join('')}
        <td class="n" style="color:var(--violet)">${money(e.pot)}</td></tr>
    </tbody></table></div></div></div>
  `;
}
