import { esc, icon, teamTag, fmtDate, empty, posChip, seasonPicker, openModal, toast, money } from '../util.js';

/* Everything on this page comes from Sleeper. The only thing a commissioner
   adds by hand is the condition on a conditional trade, because Sleeper has no
   idea such a thing exists — see the pencil on a trade header. */

const isPickText = (s) => /\b(1st|2nd|3rd|4th|5th|\d\.\d\d|pick)\b/i.test(s) || /^\d{4}\s/.test(s);

/** An asset is either a plain string (hand-entered) or a pulled object. */
const normalize = (a) => (typeof a === 'string' ? { label: a } : a);

const assetRow = (db, raw, showFrom) => {
  const a = normalize(raw);
  const pick = a.pick || isPickText(a.label);
  const origin = a.pick?.origin ? db.team(a.pick.origin) : null;
  const label = a.pick && origin ? `${a.label} (${origin.manager})` : a.label;
  const from = showFrom && a.from ? db.team(a.from) : null;
  return `<li>
    ${a.faab != null ? `<span class="pos-chip pos-none">$</span>`
      : pick ? `<span class="pos-chip pos-none">PK</span>` : posChip(db.position(a.label))}
    <span class="${pick ? 'pk' : ''}">${esc(label)}</span>
    ${from ? `<span class="from">from ${esc(from.manager)}</span>` : ''}
  </li>`;
};

/* The manager heads his own column, so the name sits over the haul it belongs to
   and is never repeated underneath it. */
/* The name is written twice and CSS keeps one: in the header, on the date's own
   row, where it sits over the column that is his -- and on the side itself for
   the two cases where that alignment cannot hold, a stacked phone layout and a
   three-way deal that wraps onto a second row. */
const side = (db, s, showFrom, banded, who) => `
  <div class="trade-side">
    ${who(s)}
    <ul>${s.receives.map((x) => assetRow(db, x, showFrom)).join('')}</ul>
  </div>`;

const tradeCard = (db, t, cond = null) => {
  const st = cond ? db.conditionalStatus(cond) : null;
  // Two-team deals are self-describing: what I get is what you gave. Three-way
  // deals are not, so every asset says who it came from.
  const showFrom = t.sides.length > 2;
  const banded = t.sides.length > 2;
  const who = (s) => `<div class="who">${teamTag(s.team ? db.team(s.team) : null, { alias: s.alias })}
    <span class="arrow">gets</span></div>`;

  return `<div class="trade${cond ? ' is-cond' : ''}${banded ? ' banded' : ''}" data-trade="${esc(t.id)}">
    <div class="trade-hd">
      <div class="trade-meta">
        ${st ? `<span class="chip ${st.chip}">${st.label}</span>` : ''}
        <div style="flex:1"></div>
        ${db.isAdmin ? `<button class="edit-pencil" data-cond-edit="${esc(t.id)}"
          aria-label="Condition on this trade" title="Condition on this trade">${icon('pencil')}</button>` : ''}
        <span class="d">${fmtDate(t.date, { year: true })}</span>
      </div>
      ${banded ? '' : `<div class="trade-names">${t.sides.map(who).join('')}</div>`}
    </div>
    <div class="trade-body">${t.sides.map((s) => side(db, s, showFrom, banded, who)).join('')}</div>
    ${cond ? `<div class="cond">
      <div class="lbl">Condition</div>${esc(cond.condition)}
      <div class="out">
        ${st.key === 'open'
          ? `${icon('clock')} Resolves by ${esc(cond.deadlineLabel || fmtDate(cond.deadline, { year: true }))}`
          : `${icon(st.key === 'met' ? 'check' : 'x')} ${esc(cond.outcome || st.label)}`}
      </div></div>` : ''}
    ${t.note && !cond ? `<div class="cond note">
      <div class="lbl">Note</div>${esc(t.note)}</div>` : ''}
  </div>`;
};

/* A pickup is four facts: who, in, out, what it cost. The drop used to be a
   clause at the end of a subtitle, which buried the half of the move that
   costs you a roster spot -- it now sits beside the add as its equal, one
   column each, marked + and -, and they lead the line because they are what you
   came to read. The minus and the dulled colour already say
   "out", so the name is not struck through as well, and a move that dropped
   nobody just leaves the column empty. */
const moveRow = (db, w) => {
  const fa = w.type === 'free_agent';
  const team = w.team ? db.team(w.team) : null;
  const man = (name) => {
    const club = db.nflTeam(name);
    return `${posChip(db.position(name))}<span class="nm">${esc(name)}</span>${
      club && club !== '--' ? `<span class="nfl">&ndash; ${esc(club)}</span>` : ''}`;
  };
  return `<div class="row wv">
    <div class="wv-in"><i class="wv-mark in">+</i>${man(w.player)}</div>
    <div class="wv-out">${w.dropped ? `<i class="wv-mark out">&minus;</i>${man(w.dropped)}` : ''}</div>
    <div class="wv-who"><b>${esc(team?.manager || w.alias || 'Unassigned')}</b>
      <span>&ndash; ${fmtDate(w.date, { year: true })}</span></div>
    ${fa ? '<span class="chip ghost wv-val">Free agent</span>'
      : `<div class="val wv-val" style="color:${w.faab ? 'var(--mint)' : 'var(--ink-3)'}">$${w.faab || 0}</div>`}
  </div>`;
};

/* Four things you might want to narrow by, and only two of them earn a tab.
   Trades and pickups are different objects -- a two-column card and a one-line
   row -- so that is the split. Conditional and free-agent are sub-kinds of
   those, on a quieter second row. Preseason and in-season are a GROUPING, not a
   filter: the FAAB budgets are separate, so you want both subtotals at once.
   And manager cuts across all of it, so it sits up with the season. */
const KINDS = {
  trades: [['all', 'All'], ['standard', 'Standard'], ['conditional', 'Conditional']],
  waivers: [['all', 'All'], ['claims', 'Claims'], ['fa', 'Free agents']],
};

const mgrPicker = (db, S, sel) => `<div class="season-pick">
  <span>Manager</span>
  <select data-mgr aria-label="Manager">
    <option value="">All</option>
    ${db.teams(S).slice().sort((a, b) => a.manager.localeCompare(b.manager)).map((t) =>
      `<option value="${t.number}" ${String(t.number) === String(sel) ? 'selected' : ''}>${esc(t.manager)}</option>`).join('')}
  </select>
</div>`;

export function render(db, state = {}) {
  const tab = state.tradeTab === 'waivers' ? 'waivers' : 'trades';
  const kind = state.tradeKind || 'all';
  const mgr = state.tradeMgr ? Number(state.tradeMgr) : null;
  const S = db.season;
  const { trades, conditional, waivers } = db.trades(S);
  const condFor = (t) => (t.conditionalId ? conditional.find((c) => c.id === t.conditionalId) : null)
    || conditional.find((c) => c.settledTradeId === t.id) || null;

  // a manager filter narrows WHOSE transactions you see; a trade he was in is
  // still shown whole, because a one-sided trade card would be a lie
  const mine = (t) => !mgr || t.sides.some((x) => x.team === mgr);
  const myMove = (w) => !mgr || w.team === mgr;

  const tradeRows = trades.filter(mine).filter((t) => kind === 'all'
    || (kind === 'conditional' ? condFor(t) : !condFor(t)));
  const moveRows = waivers.filter(myMove).filter((w) => kind === 'all'
    || (kind === 'fa' ? w.type === 'free_agent' : w.type !== 'free_agent'));

  const open = conditional.filter((c) => db.conditionalStatus(c).key === 'open');
  const claims = moveRows.filter((w) => w.type !== 'free_agent');
  const spent = (phase) => claims.filter((w) => db.faabPhase(w.date) === phase)
    .reduce((a, w) => a + (w.faab || 0), 0);
  const pot = (mgr ? 1 : db.teams(S).length) * 100;

  const inPhase = (rows, phase) => rows.filter((x) =>
    (db.faabPhase(x.date) === 'pre') === (phase === 'pre'));
  const rows = tab === 'trades' ? tradeRows : moveRows;
  const phases = [{ key: 'pre', title: 'Preseason' }, { key: 'in', title: 'In-season' }]
    .map((p) => ({ ...p, rows: inPhase(rows, p.key) }))
    .filter((p) => p.rows.length);

  const who = mgr ? ` for ${db.team(mgr)?.manager || `T${mgr}`}` : '';
  const group = (p) => tab === 'trades'
    ? `<div class="section-title">${p.title}<span class="sub-n dim">${p.rows.length}</span></div>
       ${p.rows.map((t) => tradeCard(db, t, condFor(t))).join('')}`
    : `<div class="section-title">${p.title}
         <span class="sub-n">${money(spent(p.key))} of ${money(pot)}</span></div>
       <div class="wv-list">${p.rows.map((w) => moveRow(db, w)).join('')}</div>`;

  const list = phases.length ? phases.map(group).join('')
    : (tab === 'trades'
      ? empty('No trades', `Nothing${who} in ${S}. Pull transactions in Admin to bring them across.`, 'swap')
      : empty('No pickups', `Nothing${who} in ${S}. Pull transactions in Admin to bring them across.`, 'inbox'));

  return `
  <div class="view-hd"><h2>Transactions</h2>
    <div class="hd-picks">${mgrPicker(db, S, state.tradeMgr || '')}${seasonPicker(db)}</div></div>

  <div class="pills">
    <button data-tab="trades" aria-pressed="${tab === 'trades'}">Trades ${trades.filter(mine).length}</button>
    <button data-tab="waivers" aria-pressed="${tab === 'waivers'}">Waivers ${waivers.filter(myMove).length}</button>
  </div>

  <div class="pills sub">
    ${KINDS[tab].map(([k, label]) =>
      `<button data-kind="${k}" aria-pressed="${kind === k}">${label}</button>`).join('')}
  </div>

  ${tab === 'trades' ? `
    <div class="tiles" style="margin-top:8px">
      <div class="tile"><div class="k">Trades</div><div class="v">${tradeRows.length}</div><div class="m">in ${S}</div></div>
      <div class="tile accent"><div class="k">Pieces moved</div><div class="v">${tradeRows.reduce((a, t) =>
        a + t.sides.filter((x) => !mgr || x.team === mgr).reduce((n, x) => n + x.receives.length, 0), 0)}</div>
        <div class="m">${mgr ? 'received' : 'players + picks'}</div></div>
      <div class="tile ${open.length ? 'gold' : ''}"><div class="k">Open conditions</div><div class="v">${open.length}</div><div class="m">awaiting outcome</div></div>
    </div>` : `
    <div class="tiles" style="margin-top:8px">
      <div class="tile"><div class="k">Claims</div><div class="v">${claims.length}</div><div class="m">through waivers</div></div>
      <div class="tile accent"><div class="k">Free agents</div><div class="v">${moveRows.length - claims.length}</div><div class="m">straight adds</div></div>
      <div class="tile mint"><div class="k">FAAB spent</div>
        <div class="v">${money(spent('pre') + spent('in'))}</div>
        <div class="m">${money(spent('pre'))} pre &middot; ${money(spent('in'))} in-season</div></div>
    </div>`}

  ${list}
  `;
}

export function mount(root, db, go, setState) {
  // the sub-filter means something different on each tab, so switching tabs
  // drops back to All rather than carrying a filter that no longer exists
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () =>
    setState({ tradeTab: b.dataset.tab, tradeKind: 'all' })));
  root.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () =>
    setState({ tradeKind: b.dataset.kind })));
  root.querySelector('[data-mgr]')?.addEventListener('change', (e) =>
    setState({ tradeMgr: e.target.value }));

  /* The one hand-entered thing on this page: the strings attached to a deal. */
  root.querySelectorAll('[data-cond-edit]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.condEdit;
    const { conditional } = db.trades();
    const c = conditional.find((x) => x.settledTradeId === id || x.id === id) || null;
    openModal({
      title: 'Condition',
      confirm: 'Save',
      closeButtons: false,
      body: `
        <div class="field"><label>If&hellip; then&hellip;</label>
          <textarea name="condition" placeholder="If Max reaches the finals, the 2026 3rd converts to Noah's.">${esc(c?.condition || '')}</textarea></div>
        <div class="fgrid">
          <div class="field"><label>Deadline</label><input name="deadline" type="date" value="${esc(c?.deadline || '')}"></div>
          <div class="field"><label>Deadline label</label><input name="deadlineLabel" value="${esc(c?.deadlineLabel || '')}" placeholder="End of the playoffs"></div>
        </div>
        <div class="fgrid">
          <div class="field"><label>Status</label><select name="status">
            ${['open', 'met', 'expired'].map((s) =>
              `<option value="${s}" ${(c?.status || 'open') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Outcome</label><input name="outcome" value="${esc(c?.outcome || '')}"></div>
        </div>`,
      onConfirm: async (d) => {
        const text = d.condition.trim();
        await db.update('trades', (t) => {
          const at = t.conditionalTrades.findIndex((x) => x.settledTradeId === id || x.id === id);
          if (!text) { if (at > -1) t.conditionalTrades.splice(at, 1); return; }
          const trade = t.trades.find((x) => x.id === id);
          const rec = {
            id: at > -1 ? t.conditionalTrades[at].id : `cond-${id}`,
            season: trade?.season ?? null, date: trade?.date ?? null,
            status: d.status, sides: trade?.sides || [],
            condition: text, deadline: d.deadline || null,
            deadlineLabel: d.deadlineLabel.trim() || null,
            resolvedDate: d.status === 'open' ? null : (trade?.date ?? null),
            outcome: d.outcome.trim() || null, settledTradeId: id,
          };
          if (at > -1) t.conditionalTrades[at] = rec; else t.conditionalTrades.push(rec);
        });
        toast(text ? 'Condition saved' : 'Condition removed');
      },
    });
  }));
}
