import { esc, icon, empty, seasonPicker } from '../util.js';

/* Which hauls are open -- module scope so a repaint does not close them. */
const HAUL_OPEN = new Set();

export function render(db) {
  const seasons = db.draftSeasons();
  if (!seasons.length) return empty('No drafts yet', 'Rookie draft boards will appear here.', 'board');
  // One shared season for the whole app -- no private year here any more, which
  // is what used to let this page and the chrome disagree on screen.
  const year = db.season;
  if (!seasons.includes(year)) {
    return `<div class="view-hd"><h2>Drafts</h2>${seasonPicker(db)}</div>
      ${empty(`No ${year} draft`, 'No rookie board has been set up for this season yet.', 'board')}`;
  }
  const d = db.draft(year);
  const teams = db.teams(year);
  const tOf = (n) => teams.find((t) => t.number === n);

  const traded = d.picks.filter((p) => p.traded);
  // biggest position group first, so the bar and its key read left to right
  const counts = {};
  for (const p of d.picks) {
    const q = db.position(p.player) || '?';
    counts[q] = (counts[q] || 0) + 1;
  }
  const split = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const haul = {};
  for (const p of d.picks) haul[p.pickedBy] = (haul[p.pickedBy] || 0) + 1;
  const board = Object.entries(haul).map(([n, c]) => ({ t: tOf(+n), c }))
    .sort((a, b) => b.c - a.c || a.t.number - b.t.number);

  const cols = d.order.length;
  return `
  ${/* The one thing the board cannot tell you without counting thirty cells: how
       the class broke down by position, in the cells' own colours so it reads as
       a key for the board too. Built from the minigame money bar's own .mb-*
       classes rather than a parallel set, so the two cannot drift apart. */''}
  <div class="card pos-split">
    <div class="card-hd"><div class="grow"><h3>Drafts</h3></div>${seasonPicker(db)}</div>
    <div class="card-bd">
    <div class="mb-top">
      <span class="mb-stat"><b class="mb-fig">${traded.length}</b><span class="mb-lbl">traded</span></span>
      <span class="mb-div">/</span>
      <span class="mb-stat"><b class="mb-fig">${d.picks.length}</b><span class="mb-lbl">picks</span></span>
      <div class="mb-track" role="img" aria-label="${split.map(([q, c]) =>
        `${q === '?' ? 'unknown' : q} ${c}`).join(', ')}">
        ${split.map(([q, c]) => `<i class="${q === '?' ? 'ps-none' : `pos-${esc(q)}`}"
          style="width:${(c / d.picks.length * 100).toFixed(2)}%"
          title="${esc(q)} &mdash; ${c} of ${d.picks.length}"></i>`).join('')}
      </div>
    </div>
    <ul class="mb-legend">
      ${split.map(([q, c]) => `<li>
        <i class="${q === '?' ? 'ps-none' : `pos-${esc(q)}`}"></i>
        <span>${q === '?' ? 'Other' : esc(q)}</span><b>${c}</b></li>`).join('')}
    </ul>
    </div>
  </div>

  <div class="section-title">Draft board</div>
  <div class="card draft-card">
    <div class="card-hd"><h3>Draft board</h3><div class="spacer"></div>
      <span class="chip heat">${icon('swap')} traded</span></div>
    <div class="card-bd flush">
      <div class="board"><div class="board-grid" style="--cols:${cols}">
        ${/* just the name: the slot number is already the back half of every pick
             number in the column below it */''}
        ${d.order.map((n) => `<div class="board-head">${
          esc(tOf(n)?.manager ?? 'T' + n)}</div>`).join('')}
        ${Array.from({ length: d.rounds }, (_, r) =>
          d.order.map((_, s) => {
            const p = d.picks.find((x) => x.round === r + 1 && x.slot === s + 1);
            if (!p) return `<div class="pick blank"></div>`;
            const by = tOf(p.pickedBy);
            const pos = db.position(p.player);
            // first name over last, the way a draft board reads
            const parts = String(p.player).trim().split(/\s+/);
            const first = parts.length > 1 ? parts[0] : '';
            const last = parts.length > 1 ? parts.slice(1).join(' ') : p.player;
            return `<div class="pick${pos ? ` tint-${esc(pos)}` : ''}${p.traded ? ' traded' : ''}">
              <div class="body">
                <span class="no">${p.pick}</span>
                <span class="nm">${first ? `<b>${esc(first)}</b>` : ''}<i>${esc(last)}</i></span>
              </div>
              ${p.traded ? `<div class="tr-banner"><span class="ar">&rarr;</span>${
                esc(by?.manager ?? 'T' + p.pickedBy)}</div>` : ''}
            </div>`;
          }).join('')).join('')}
      </div></div>
    </div>
  </div>

  ${/* One row per manager, opening in place to the players they took -- the same
       shape as a minigame row. The row itself stays plain; the colour belongs to
       the player tags, where it means something. */''}
  <div class="section-title">Draft haul</div>
  <div class="card"><div class="card-bd flush"><div class="haul-list">
    ${board.map((b) => {
      const n = b.t.number;
      const mine = d.picks.filter((p) => p.pickedBy === n);
      const open = HAUL_OPEN.has(n);
      return `<div class="haul${open ? ' open' : ''}">
        <div class="haul-hd" role="button" tabindex="0" aria-expanded="${open}" data-haul="${n}">
          <span class="tnum">T${n}</span>
          <span class="who">${esc(b.t.manager)}</span>
          <span class="cnt">${mine.length} player${mine.length === 1 ? '' : 's'}</span>
          ${icon('chev', 'acc-caret')}
        </div>
        <div class="haul-bd">
          ${mine.map((p) => {
            const pos = db.position(p.player);
            return `<span class="haul-pick${pos ? ` tint-${esc(pos)}` : ''}">
              <b>${p.pick}</b><span>${esc(p.player)}</span></span>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div></div></div>
  `;
}

export function mount(root) {
  root.querySelectorAll('[data-haul]').forEach((hd) => {
    const n = Number(hd.dataset.haul);
    const fire = () => {
      HAUL_OPEN.has(n) ? HAUL_OPEN.delete(n) : HAUL_OPEN.add(n);
      const open = HAUL_OPEN.has(n);
      hd.setAttribute('aria-expanded', String(open));
      hd.closest('.haul').classList.toggle('open', open);
    };
    hd.addEventListener('click', fire);
    hd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
  });
}
