import { esc, icon, teamTag, posChip, empty, teamColor } from '../util.js';

export function render(db, state = {}) {
  const seasons = db.draftSeasons();
  if (!seasons.length) return empty('No drafts yet', 'Rookie draft boards will appear here.', 'board');
  const year = state.draftYear && seasons.includes(state.draftYear) ? state.draftYear : seasons[0];
  const d = db.draft(year);
  const teams = db.teams(year);
  const tOf = (n) => teams.find((t) => t.number === n);

  const traded = d.picks.filter((p) => p.traded);
  const haul = {};
  for (const p of d.picks) haul[p.pickedBy] = (haul[p.pickedBy] || 0) + 1;
  const board = Object.entries(haul).map(([n, c]) => ({ t: tOf(+n), c }))
    .sort((a, b) => b.c - a.c || a.t.number - b.t.number);

  const cols = d.order.length;
  return `
  <div class="pills">
    ${seasons.map((y) => `<button data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join('')}
  </div>

  <div class="tiles" style="margin-top:8px">
    <div class="tile"><div class="k">Picks</div><div class="v">${d.picks.length}</div><div class="m">${d.rounds} rounds</div></div>
    <div class="tile accent"><div class="k">Traded slots</div><div class="v">${traded.length}</div>
      <div class="m">${((traded.length / d.picks.length) * 100).toFixed(0)}% changed hands</div></div>
    <div class="tile mint"><div class="k">Most picks</div><div class="v">${board[0]?.c ?? 0}</div>
      <div class="m">${esc(board[0]?.t?.manager ?? '')}</div></div>
    <div class="tile"><div class="k">Own slot</div><div class="v">${d.picks.length - traded.length}</div>
      <div class="m">picks never traded</div></div>
  </div>

  <div class="section-title">${year} rookie board</div>
  <div class="card">
    <div class="card-hd"><h3>Draft board</h3><div class="spacer"></div>
      <span class="chip heat">${icon('swap')} traded</span></div>
    <div class="card-bd flush">
      <div class="board"><div class="board-grid" style="grid-template-columns:repeat(${cols},132px)">
        ${d.order.map((n, i) => {
          const t = tOf(n);
          return `<div class="board-head" style="border-top:2px solid ${teamColor(n)}">
            <div class="sl">${String(i + 1).padStart(2, '0')}</div>
            <div class="nm">${esc(t?.manager ?? 'T' + n)}</div></div>`;
        }).join('')}
        ${Array.from({ length: d.rounds }, (_, r) =>
          d.order.map((_, s) => {
            const p = d.picks.find((x) => x.round === r + 1 && x.slot === s + 1);
            if (!p) return `<div class="pick blank"></div>`;
            const by = tOf(p.pickedBy);
            const pos = db.position(p.player);
            return `<div class="pick ${p.traded ? 'traded' : ''}">
              <div class="top"><span class="no">${p.pick}</span>
                <div style="flex:1"></div>${posChip(pos)}</div>
              <div class="pl">${esc(p.player)}</div>
              ${p.traded ? `<div class="via">via ${esc(by?.manager ?? 'T' + p.pickedBy)}</div>`
                         : `<div class="via" style="color:var(--ink-3)">&nbsp;</div>`}
            </div>`;
          }).join('')).join('')}
      </div></div>
    </div>
    <div class="card-bd" style="border-top:1px solid var(--line-soft)">
      <div class="s dim" style="font-size:12px">Columns are the original slot owner. An orange bar means the pick was
      traded — the name underneath is who actually made the selection. Swipe the board sideways.</div>
    </div>
  </div>

  <div class="section-title">Who drafted what</div>
  <div class="card"><div class="card-bd flush"><div class="rows">
    ${board.map((b) => {
      const mine = d.picks.filter((p) => p.pickedBy === b.t.number);
      return `<div class="row">
        <div class="grow">
          <div class="t">${teamTag(b.t)}</div>
          <div class="s" style="white-space:normal;line-height:1.7;margin-top:4px">
            ${mine.map((p) => `<span class="chip ghost plain" style="margin:0 3px 3px 0"><b style="color:var(--ink-3);font-weight:700">${p.pick}</b> ${esc(p.player)}</span>`).join('')}
          </div>
        </div>
        <div class="val">${b.c}</div>
      </div>`;
    }).join('')}
  </div></div></div>
  `;
}

export function mount(root, db, go, setState) {
  root.querySelectorAll('[data-year]').forEach((b) => b.addEventListener('click', () =>
    setState({ draftYear: Number(b.dataset.year) })));
}
