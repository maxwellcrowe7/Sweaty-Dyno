import { esc, icon, teamColor, openModal, toast } from '../util.js';

/* A directory, not a dashboard. Every figure this page used to carry -- paid in,
   won, net, empire points -- is another tab's headline, and repeating them made
   one franchise 200px tall, so ten of them took three screens.
   What is left is what nothing else owns: who holds which franchise, who held it
   before, and a way through to the pages that do carry their numbers. */

/* When the manager whose row this is took it on -- which depends on the season
   being viewed, the same way the name does. Dating the row from the open-ended
   entry instead showed Andrew's row starting the year Matt takes over. */
const since = (t, season) => [...t.ownership]
  .filter((o) => o.fromSeason <= season && (o.toSeason == null || o.toSeason >= season))
  .sort((a, b) => b.fromSeason - a.fromSeason)[0]?.fromSeason
  ?? Math.min(...t.ownership.map((o) => o.fromSeason));

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
      /* A title belongs to the franchise -- empire points ride with the team,
         so a replacement inherits them. One won by a previous owner is dulled
         rather than dropped: the club is still on the shelf, it is just not
         this manager's. */
      const rings = finishes.filter((f) => f.team === t.number && f.place === 1)
        .map((f) => db.ownerAt(t.number, f.season) === t.managerId);
      const flag = db.rosterStatus(t.number);
      // a franchise that has only ever had one owner has no history to tell
      const past = t.ownership.length > 1 ? t.ownership : [];
      return `<div class="fr" style="--tc:${teamColor(t.number)}">
        <div class="fr-no">${String(t.number).padStart(2, '0')}</div>
        <div class="fr-who">
          <b>${esc(t.fullName)}</b>
          ${t.sleeper ? `<span class="fr-sl">@${esc(t.sleeper)}</span>` : ''}
          ${/* a role, said once, quietly -- it is one row in ten */''}
          ${t.managerId === comm
            ? '<span class="fr-comm" title="Commissioner" aria-label="Commissioner">C</span>' : ''}
          ${/* Sleeper is the source of truth for who owns a roster: a franchise
               it says nobody owns is a departure, and one owned by somebody we
               cannot name is a handover waiting to be confirmed. */''}
          ${flag?.key === 'vacant' ? `<span class="fr-flag gone"
            title="No owner in Sleeper as of ${flag.season}">No manager</span>` : ''}
          ${flag?.key === 'incoming' ? `<span class="fr-flag new"
            title="${esc(flag.user.ownerName || 'Someone')} owns this roster in Sleeper">${
            db.isAdmin ? '' : ''}New owner &mdash; confirm</span>` : ''}
        </div>
        ${/* rings first, so "since" holds one column down the page */''}
        <div class="fr-rings">${rings
          .map((his) => icon('crown', his ? '' : 'past')).join('')}</div>
        <div class="fr-since">since ${since(t, db.season)}</div>
        <div class="fr-go">
          ${db.isAdmin ? `<button class="fr-hand" data-hand="${t.number}"
            aria-label="Hand this franchise over" title="Hand this franchise over">${
            icon('swap')}</button>` : ''}
          ${/* named and marked for the tab they land on */''}
          <button data-go-trades="${t.number}">${icon('swap')}Transactions</button>
          <button data-go-drafts="${t.number}">${icon('board')}Drafts</button>
          <button data-go-stats="${t.number}">${icon('chart')}Stats</button>
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

/* Handing a franchise over. The league is season-granular on purpose: a manager
   who quits in November either owns that season or the next one starts without
   him, because splitting a season would complicate every ownership lookup in the
   app for something that may never happen. */
function handOver(db, number) {
  const t = db.team(number);
  const seen = db.rosterStatus(number);
  const mgrs = db.get('managers').managers.slice().sort((a, b) => a.name.localeCompare(b.name));
  const next = (seen?.season ?? db.league.currentSeason) + 1;
  const suggested = seen?.user?.ownerName || '';

  openModal({
    title: `Team ${number} changes hands`,
    confirm: 'Hand it over',
    body: `
      <p class="s dim" style="margin:0 0 12px">
        <b>${esc(t?.manager || 'The current manager')}</b> has held this franchise
        since ${esc(String(db.get('managers').teams.find((x) => x.number === number)?.ownership.at(-1).fromSeason))}.
        ${seen?.key === 'incoming' ? `Sleeper now shows <b>${esc(seen.user.ownerName || 'someone new')}</b> on this roster.` : ''}
        ${seen?.key === 'vacant' ? 'Sleeper shows nobody on this roster.' : ''}
      </p>
      <div class="field"><label>Taking over</label>
        <select name="who">
          <option value="">&mdash; someone new &mdash;</option>
          ${mgrs.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Their name</label>
        <input name="fullName" placeholder="First Last"></div>
      <div class="fgrid">
        <div class="field"><label>Sleeper username</label>
          <input name="sleeper" value="${esc(suggested)}" placeholder="their Sleeper handle"></div>
        <div class="field"><label>From season</label>
          <select name="from">${db.seasons.map((y) =>
            `<option value="${y}" ${y === next ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      </div>
      <p class="s dimmer" style="margin:2px 0 0">Everything before that season stays with
        ${esc(t?.manager || 'the outgoing manager')} &mdash; past trades, drafts and standings
        all read the owner of the day. Titles stay with the franchise, since the empire
        points do.</p>`,
    onConfirm: async (d) => {
      const from = Number(d.from);
      // one name in, everything else off it: the league calls people by their
      // first name, and the id is that name lowercased
      const full = String(d.fullName || '').trim();
      const first = full.split(/\s+/)[0] || '';
      let id = d.who;
      if (!id) {
        if (!first) { toast('Name the incoming manager'); return false; }
        id = first.toLowerCase().replace(/[^a-z0-9]+/g, '') || `mgr${Date.now()}`;
      }
      await db.update('managers', (m) => {
        if (!m.managers.some((x) => x.id === id)) {
          m.managers.push({
            id,
            name: first || id,
            aliases: [first, full, String(d.sleeper || '').trim()].filter(Boolean),
            sleeperUserId: null,
            sleeperUsername: String(d.sleeper || '').trim() || null,
            usernameConfirmed: false,
            fullName: full || first || id,
          });
        }
        const team = m.teams.find((x) => x.number === number);
        const outgoing = [...team.ownership].sort((a, b) => b.fromSeason - a.fromSeason)[0];
        if (outgoing && outgoing.toSeason == null) outgoing.toSeason = from - 1;
        team.ownership.push({ managerId: id, fromSeason: from, toSeason: null });
        team.ownership.sort((a, b) => a.fromSeason - b.fromSeason);
        // the flag has served its purpose; the next pull writes a fresh one
        if (m.rosterAudit?.teams) delete m.rosterAudit.teams[String(number)];
      });
      toast(`Team ${number} handed over from ${from}`);
    },
  });
}

export function mount(root, db, go) {
  /* The rest of the app is season-scoped and manager-blind; this is the one page
     that knows people, so it is the natural way in to their pages. */
  root.querySelectorAll('[data-hand]').forEach((b) => b.addEventListener('click', () =>
    handOver(db, Number(b.dataset.hand))));
  root.querySelectorAll('[data-go-trades]').forEach((b) => b.addEventListener('click', () =>
    go('trades', { mgr: b.dataset.goTrades })));
  root.querySelectorAll('[data-go-drafts]').forEach((b) => b.addEventListener('click', () =>
    go('drafts', { team: b.dataset.goDrafts })));
  root.querySelectorAll('[data-go-stats]').forEach((b) => b.addEventListener('click', () =>
    go('stats', { team: b.dataset.goStats })));
}
