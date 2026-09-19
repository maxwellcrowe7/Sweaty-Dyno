import { esc, icon, teamColor } from '../util.js';

/* A directory, not a dashboard. Every figure this page used to carry -- paid in,
   won, net, empire points -- is another tab's headline, and repeating them made
   one franchise 200px tall, so ten of them took three screens.
   What is left is what nothing else owns: who holds which franchise, who held it
   before, and a way through to the pages that do carry their numbers. */

const since = (t) => Math.min(...t.ownership.map((o) => o.fromSeason));

export function render(db) {
  const mg = db.get('managers');
  const comm = db.league.commissioner;
  const teams = db.teams().slice().sort((a, b) => a.number - b.number);
  const finishes = db.get('bank').finishes || [];

  return `
  ${mg._placeholder || mg._unconfirmed ? `<div class="banner" style="margin-bottom:14px">${icon('alert')}
    <div><b>Team numbers are provisional.</b> Confirm the mapping in <code>tools/remap_teams.py</code>
    and re-run it — the whole app follows.</div></div>` : ''}

  <div class="section-title">Franchises<span class="sub-n dim">${teams.length}</span></div>
  <div class="fr-list">
    ${teams.map((t) => {
      const rings = finishes.filter((f) => f.team === t.number && f.place === 1).length;
      // a franchise that has only ever had one owner has no history to tell
      const past = t.ownership.length > 1 ? t.ownership : [];
      return `<div class="fr" style="--tc:${teamColor(t.number)}">
        <div class="fr-no">${String(t.number).padStart(2, '0')}</div>
        <div class="fr-who">
          <b>${esc(t.fullName)}</b>
          ${t.sleeper ? `<span class="fr-sl">@${esc(t.sleeper)}</span>` : ''}
          ${/* a role, said once, quietly -- it is one row in ten */''}
          ${t.managerId === comm ? '<span class="fr-comm">Commissioner</span>' : ''}
        </div>
        <div class="fr-since">since ${since(t)}</div>
        <div class="fr-rings">${rings
          ? Array.from({ length: rings }, () => icon('crown')).join('')
          : ''}</div>
        <div class="fr-go">
          <button data-go-trades="${t.number}">Trades</button>
          <button data-go-stats="${t.number}">Stats</button>
        </div>
        ${past.length ? `<div class="fr-hist">${past.map((o) => {
          const m = db.managerById(o.managerId);
          return `<span>${esc(m?.name ?? o.managerId)}
            <em>${o.fromSeason}&ndash;${o.toSeason ?? 'now'}</em></span>`;
        }).join('<i>&rarr;</i>')}</div>` : ''}
      </div>`;
    }).join('')}
  </div>

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

export function mount(root, db, go) {
  /* The rest of the app is season-scoped and manager-blind; this is the one page
     that knows people, so it is the natural way in to their pages. */
  root.querySelectorAll('[data-go-trades]').forEach((b) => b.addEventListener('click', () =>
    go('trades', { mgr: b.dataset.goTrades })));
  root.querySelectorAll('[data-go-stats]').forEach((b) => b.addEventListener('click', () =>
    go('stats', { team: b.dataset.goStats })));
}
