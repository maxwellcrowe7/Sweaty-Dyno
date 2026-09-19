import { esc, icon, teamTag, fmtDate, empty, posChip, seasonPicker, openModal, toast, money } from '../util.js';

/* Everything on this page comes from Sleeper. The only thing a commissioner
   adds by hand is the condition on a conditional trade, because Sleeper has no
   idea such a thing exists — see the pencil on a trade header. */

const isPickText = (s) => /\b(1st|2nd|3rd|4th|5th|\d\.\d\d|pick)\b/i.test(s) || /^\d{4}\s/.test(s);

/** An asset is either a plain string (hand-entered) or a pulled object. */
const normalize = (a) => (typeof a === 'string' ? { label: a } : a);

const assetRow = (db, raw, showFrom, locked = false) => {
  const a = normalize(raw);
  const pick = a.pick || isPickText(a.label);
  const origin = a.pick?.origin ? db.team(a.pick.origin) : null;
  const label = a.pick && origin ? `${a.label} (${origin.manager})` : a.label;
  const from = showFrom && a.from ? db.team(a.from) : null;
  // a pick or a pile of FAAB has no club; a player carries his, as on a pickup
  const club = pick || a.faab != null ? null : db.nflTeam(a.label);
  return `<li>
    ${a.faab != null ? `<span class="pos-chip pos-none">$</span>`
      : pick ? `<span class="pos-chip pos-none">PK</span>`
      : posChip(a.pos || db.position(a.label))}
    <span class="${pick ? 'pk' : ''}">${esc(label)}</span>
    ${club && club !== '--' ? `<span class="nfl">&ndash; ${esc(club)}</span>` : ''}
    ${locked ? `<span class="lk-mark" title="Locked until the condition resolves">${icon('lock')}</span>` : ''}
    ${from ? `<span class="from">from ${esc(from.manager)}</span>` : ''}
  </li>`;
};

/* The manager heads his own column, so the name sits over the haul it belongs to
   and is never repeated underneath it. */
/* The name is written twice and CSS keeps one: in the header, on the date's own
   row, where it sits over the column that is his -- and on the side itself for
   the two cases where that alignment cannot hold, a stacked phone layout and a
   three-way deal that wraps onto a second row. */
const side = (db, s, showFrom, banded, who, marks = null) => `
  <div class="trade-side">
    ${who(s)}
    <ul>${s.receives.map((x) => assetRow(db, x, showFrom, marks ? marks(x) : false)).join('')}</ul>
  </div>`;

/* A lock, written the way it reads: "Kareem Hunt, held by Max". */
const lockLabel = (db, l) => {
  if (l.kind === 'pick') {
    return `${l.season} ${['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][l.round] || `${l.round}th`}${
      l.origin && db.team(l.origin) ? ` (${db.team(l.origin).manager})` : ''}`;
  }
  return l.label;
};

const tradeCard = (db, t, cond = null, breaks = [], nested = false, marks = null) => {
  const st = cond ? db.conditionStatus(cond) : null;
  const mine = breaks.filter((b) => b.lock.condition.id === cond?.id);
  // the trade that discharged this condition rides inside this card rather than
  // sitting in the list as an unexplained second deal
  /* What the condition promises, and then what actually discharged it. The
     expected return is hand-entered so the follow-up is visible from the day
     the deal is struck -- Sleeper has no idea it is coming. Once the real trade
     lands and is linked, it supersedes the sketch. */
  const settler = cond?.settledBy
    ? db.get('trades').trades.find((x) => x.id === cond.settledBy) : null;
  const promised = !settler && cond?.expected?.length
    ? { id: `${t.id}-expected`, date: null, sides: cond.expected } : null;
  /* The follow-up reads left to right the same way the deal above it does --
     a nested card that swapped the managers round made you re-read both. */
  /* Locks are marked on the follow-up and nowhere else. An asset is frozen
     precisely so it is still there to settle the condition, so the promised
     return is the row where saying so means something -- and marking it in one
     place is what stops an asset that moves in both deals reading as two. */
  const live = cond && ['open', 'due'].includes(st.key) ? (cond.locks || []) : [];
  const isLocked = (raw) => live.some((l) => db.sameAsset(l, normalize(raw)));

  const align = (x) => {
    if (!x) return null;
    const order = t.sides.map((sd) => sd.team);
    const rank = (sd) => (order.indexOf(sd.team) + 1 || order.length + 1);
    return { ...x, sides: [...x.sides].sort((a, b) => rank(a) - rank(b)) };
  };
  // Two-team deals are self-describing: what I get is what you gave. Three-way
  // deals are not, so every asset says who it came from.
  const showFrom = t.sides.length > 2;
  const banded = t.sides.length > 2;
  const who = (s) => `<div class="who">${teamTag(s.team ? db.team(s.team) : null, { alias: s.alias })}
    <span class="arrow">gets</span></div>`;

  return `<div class="trade${cond ? ' is-cond' : ''}${banded ? ' banded' : ''}${
      nested ? ` nested is-${nested}` : ''}" data-trade="${esc(t.id)}">
    <div class="trade-hd">
      <div class="trade-meta">
        ${st ? `<span class="chip ${st.chip}">${st.label}</span>` : ''}
        <div style="flex:1"></div>
        ${db.isAdmin && !nested ? `<button class="edit-pencil" data-cond-edit="${esc(t.id)}"
          aria-label="Condition on this trade" title="Condition on this trade">${icon('pencil')}</button>` : ''}
        ${/* a trade that has not happened has no date, and the colour already
             says it is a promise rather than a record */''}
        ${t.date ? `<span class="d">${esc(fmtDate(t.date, { year: true }))}</span>` : ''}
      </div>
      ${banded ? '' : `<div class="trade-names">${t.sides.map(who).join('')}</div>`}
    </div>
    <div class="trade-body">${t.sides.map((s) =>
      side(db, s, showFrom, banded, who, marks)).join('')}</div>
    ${cond ? `<div class="cond">
      <p class="cond-line"><span class="lbl">Condition</span>${esc(cond.text)}</p>
      ${/* a resolved condition freezes nothing: the chips go with it */''}

      ${/* "Condition met" plus the wording above usually says what happened --
           "met" already implies Max made the finals. The note is for the times
           it does not, so an empty one prints nothing. */''}
      ${/* The chip says open or needs a decision, the follow-up below is tinted
           to match, and the locked rows carry the date. All this line ever adds
           is a restatement -- so it now only carries an outcome worth writing. */''}
      ${['met', 'void'].includes(st.key) && cond.outcome
        ? `<div class="out">${icon(st.key === 'met' ? 'check' : 'x')} ${esc(cond.outcome)}</div>` : ''}
      ${mine.length ? `<div class="lock-break">${icon('alert')}
        ${mine.length === 1 ? 'A locked asset moved anyway' : `${mine.length} locked assets moved anyway`}:
        ${esc(mine.map((b) => lockLabel(db, b.lock)).join(', '))}</div>` : ''}
      ${/* the settlement sits on the condition's own ground -- it belongs to the
           condition, and a second colour around it only said so again */''}
      ${settler || promised ? `<div class="settle-wrap">
        ${tradeCard(db, align(settler || promised), null, [], st.key, live.length ? isLocked : null)}
      </div>` : ''}
    </div>` : ''}
    ${t.note && !cond ? `<div class="cond note">
      <p class="cond-line"><span class="lbl">Note</span>${esc(t.note)}</p></div>` : ''}
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
    // the add column is deliberately narrow; a name long enough to clip keeps
    // its full self in the tooltip
    return `${posChip(db.position(name))}<span class="nm" title="${esc(name)}">${esc(name)}</span>${
      club && club !== '--' ? `<span class="nfl">&ndash; ${esc(club)}</span>` : ''}`;
  };
  return `<div class="row wv">
    <div class="wv-in"><i class="wv-mark in">+</i>${man(w.player)}</div>
    <div class="wv-out">${w.dropped ? `<i class="wv-mark out">&minus;</i>${man(w.dropped)}` : ''}</div>
    <div class="wv-who"><b>${esc(team?.manager || w.alias || 'Unassigned')}</b>
      <span>&ndash; ${fmtDate(w.date, { year: true })}</span></div>
    ${fa ? '<span class="chip ghost wv-val" title="Free agent">FA</span>'
      : `<div class="val wv-val" style="color:${w.faab ? 'var(--mint)' : 'var(--ink-3)'}">$${w.faab || 0}</div>`}
  </div>`;
};

/* Four things you might want to narrow by, and only two of them earn a tab.
   Trades and pickups are different objects -- a two-column card and a one-line
   row -- so that is the split. Conditional and free-agent are sub-kinds of
   those, on a quieter second row. Preseason and in-season are a GROUPING, not a
   filter: the FAAB budgets are separate, so you want both subtotals at once.
   And manager cuts across all of it, so it sits up with the season. */
const PHASES = [['pre', 'Preseason'], ['in', 'In-season']];

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
  const condFor = (t) => conditional.find((c) => c.tradeId === t.id) || null;
  const locked = db.lockedAssets(S);
  const breaks = db.lockBreaks(S);
  /* A settling trade belongs to the deal it completes, not to the list. It is
     hidden wherever it would otherwise appear -- including the following season,
     which is where it lands when a condition takes until the next offseason to
     pay out -- and rides inside the original card instead. */
  const settlers = new Set(db.conditions(null).map((c) => c.settledBy).filter(Boolean));

  // a manager filter narrows WHOSE transactions you see; a trade he was in is
  // still shown whole, because a one-sided trade card would be a lie
  const mine = (t) => !mgr || t.sides.some((x) => x.team === mgr);
  const myMove = (w) => !mgr || w.team === mgr;

  const tradeRows = trades.filter((t) => !settlers.has(t.id)).filter(mine).filter((t) => kind === 'all'
    || (kind === 'conditional' ? condFor(t) : !condFor(t)));
  const moveRows = waivers.filter(myMove).filter((w) => kind === 'all'
    || (kind === 'fa' ? w.type === 'free_agent' : w.type !== 'free_agent'));

  const open = conditional.filter((c) => ['open', 'due'].includes(db.conditionStatus(c).key));
  const claims = moveRows.filter((w) => w.type !== 'free_agent');
  const spent = (phase) => claims.filter((w) => db.faabPhase(w.date) === phase)
    .reduce((a, w) => a + (w.faab || 0), 0);

  const inPhase = (rows, phase) => rows.filter((x) =>
    (db.faabPhase(x.date) === 'pre') === (phase === 'pre'));
  const rows = tab === 'trades' ? tradeRows : moveRows;
  const phases = [{ key: 'pre', title: 'Preseason' }, { key: 'in', title: 'In-season' }]
    .map((p) => ({ ...p, rows: inPhase(rows, p.key) }))
    .filter((p) => p.rows.length);

  const fa = moveRows.filter((w) => w.type === 'free_agent');
  const topBid = claims.reduce((n, w) => Math.max(n, w.faab || 0), 0);
  const withCond = tradeRows.filter((t) => condFor(t));
  const pieces = tradeRows.reduce((a, t) =>
    a + t.sides.filter((x) => !mgr || x.team === mgr).reduce((n, x) => n + x.receives.length, 0), 0);

  const who = mgr ? ` for ${db.team(mgr)?.manager || `T${mgr}`}` : '';
  const group = (p) => tab === 'trades'
    ? `<div class="section-title">${p.title}<span class="sub-n dim">${p.rows.length}</span></div>
       ${p.rows.map((t) => tradeCard(db, t, condFor(t), breaks)).join('')}`
    : `<div class="section-title">${p.title}
         <span class="sub-n">${money(spent(p.key))} spent</span></div>
       <div class="wv-list">${p.rows.map((w) => moveRow(db, w)).join('')}</div>`;

  const list = phases.length ? phases.map(group).join('')
    : (tab === 'trades'
      ? empty('No trades', `Nothing${who} in ${S}. Pull transactions in Admin to bring them across.`, 'swap')
      : empty('No pickups', `Nothing${who} in ${S}. Pull transactions in Admin to bring them across.`, 'inbox'));

  return `
  <div class="view-hd"><h2>Transactions</h2>
    <div class="hd-picks">${mgrPicker(db, S, state.tradeMgr || '')}${seasonPicker(db)}</div></div>

  ${/* the sub-filter shares the tabs' line, a rule's width away: near enough to
       read as attached to them, separate enough not to be mistaken for more of
       them */''}
  <div class="pill-bar">
    <div class="pills">
      ${/* the counts live in the summary below, said once and split by phase */''}
      <button data-tab="trades" aria-pressed="${tab === 'trades'}">Trades</button>
      <button data-tab="waivers" aria-pressed="${tab === 'waivers'}">Waivers</button>
    </div>
    <span class="pill-sep"></span>
    <div class="pills sub">
      ${KINDS[tab].map(([k, label]) =>
        `<button data-kind="${k}" aria-pressed="${kind === k}">${label}</button>`).join('')}
    </div>
  </div>

  ${/* One matrix, not two tiles. The phases were printed twice, once per tile,
       which is the tell that this is a table: say them once across the top and
       let each row answer them. Counts lead, money annotates the row where it
       means something, and the whole thing costs one card instead of two. */''}
  <div class="card sum">
    ${/* the season total closes the row: the two phases are the story, and the
         sum of them is what you ask for next */''}
    <div class="sum-row hd"><span></span>${PHASES.map(([, t]) =>
      `<span>${t}</span>`).join('')}<span class="tot">Total</span></div>
    ${(tab === 'trades' ? [
      { label: 'Trades', rows: tradeRows },
      { label: 'Conditional', rows: withCond },
    ].map((r) => ({ label: r.label,
        cells: [...PHASES.map(([k]) => ({ n: inPhase(r.rows, k).length })), { n: r.rows.length }] }))
    : [
      { label: 'Waivers', cells: [
        ...PHASES.map(([k]) => ({
          n: claims.filter((w) => db.faabPhase(w.date) === k).length, sub: money(spent(k)) })),
        { n: claims.length, sub: money(spent('pre') + spent('in')) }] },
      { label: 'Free Agents', cells: [
        ...PHASES.map(([k]) => ({ n: fa.filter((w) => db.faabPhase(w.date) === k).length })),
        { n: fa.length }] },
    ]).map((r) => `<div class="sum-row">
      <b>${r.label}</b>
      ${r.cells.map((c, i) => `<div${i === 2 ? ' class="tot"' : ''}><em${c.n ? '' : ' class="none"'}>${c.n}</em>${
        c.sub ? `<s>/</s><i>${c.sub}</i>` : ''}</div>`).join('')}
    </div>`).join('')}
  </div>

  ${/* The list you check before waving a trade through -- so it stays put when
       empty and says so, rather than leaving you to wonder whether it is empty
       or whether you are on the wrong tab. */''}
  ${tab !== 'trades' ? '' : `
    <div class="section-title">Locked assets<span class="sub-n dim">${locked.length}</span></div>
    ${!locked.length ? `<div class="card"><div class="card-bd lock-none">
      ${icon('lock')} Nothing is locked right now</div></div>`
    : `<div class="card"><div class="card-bd flush"><div class="rows">
      ${locked.map((l) => {
        const broke = breaks.find((b) => b.lock === l);
        return `<div class="row lock-row${broke ? ' broke' : ''}">
          <span class="lk">${icon('lock')}</span>
          <div class="grow">
            <div class="t">${esc(lockLabel(db, l))}</div>
            <div class="s">held by ${esc(db.team(l.heldBy)?.manager || '?')}${
              l.condition.deadline ? ` &middot; until ${esc(fmtDate(l.condition.deadline, { year: true }))}` : ''}</div>
          </div>
          ${broke ? `<span class="chip red">${broke.how === 'dropped' ? 'Dropped' : 'Traded'} anyway</span>` : ''}
        </div>`;
      }).join('')}
    </div></div></div>`}`}

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

  /* The one hand-entered thing on this page: the strings attached to a deal --
     what was promised, what is frozen until it resolves, and which later trade
     eventually discharged it. Sleeper supplies everything else. */
  /* The one hand-entered thing on this page: the strings attached to a deal --
     what was promised, and which later trade eventually discharged it. The
     promised return is built asset by asset rather than typed as text, and the
     locks fall out of it: whatever is owed is frozen in the hands of whoever
     owes it, so there is nothing separate to keep in step. */
  const POS = ['QB', 'RB', 'WR', 'TE'];
  const ORD = ['', '1st', '2nd', '3rd'];
  const ROWS = 4;

  root.querySelectorAll('[data-cond-edit]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.condEdit;
    const trade = db.get('trades').trades.find((x) => x.id === id);
    const c = db.conditionFor(id);
    const parties = trade.sides.map((sd) => sd.team).filter(Boolean);
    const years = Array.from({ length: 4 }, (_, i) => (db.seasonOf(trade.date) || db.season) + i);

    // the promise, as it stands
    const held = (team) => (c?.expected || []).find((sd) => sd.team === team)?.receives || [];

    /* A column per manager, empty until you add to it. The menu merges "what
       kind" and "which one" into a single choice -- FAAB, a position, or a
       round -- and the row that appears carries only the field that choice
       still leaves open. */
    const colHtml = (team) => `<div class="ab-col" data-col data-team="${team}">
      <div class="ab-who">${teamTag(db.team(team))}<span class="arrow">gets</span></div>
      <div class="ab-list" data-list></div>
      <button type="button" class="btn sm ghost ab-add" data-add>${icon('plus')} Asset</button>
      ${/* the chooser opens under the button that asked for it */''}
      <div class="ab-menu" data-menu hidden>
        <button type="button" data-new="faab">FAAB</button>
        <span class="ab-menu-lbl">Player</span>
        ${POS.map((pz) => `<button type="button" data-new="pos:${pz}">${pz}</button>`).join('')}
        <span class="ab-menu-lbl">Pick</span>
        ${[1, 2, 3].map((n) => `<button type="button" data-new="rd:${n}">${ORD[n]}</button>`).join('')}
      </div>
    </div>`;

    const after = db.get('trades').trades
      .filter((x) => x.id !== id && (x.date || '') >= (trade.date || '')
        && x.sides.some((sd) => parties.includes(sd.team)))
      .sort((x, y) => (y.date || '').localeCompare(x.date || ''));

    const m = openModal({
      title: 'Condition',
      confirm: 'Save',
      closeButtons: false,
      body: `
        <div class="field"><label>If&hellip; then&hellip;</label>
          <textarea name="text" placeholder="If Max reaches the finals, the 2026 3rd converts to Noah's.">${esc(c?.text || '')}</textarea></div>
        ${/* one flat list of labelled fields: the modal is short enough that
             section headings were dividing five things into three groups */''}
        <div class="field"><label>Promised return</label>
          <div class="ab-grid">${parties.map(colHtml).join('')}</div></div>

        <div class="fgrid">
          <div class="field"><label>Status</label><select name="status" data-status>
            ${[['open', 'Open'], ['met', 'Condition met'], ['void', 'Not met']].map(([v, t]) =>
              `<option value="${v}" ${(c?.status || 'open') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Deadline</label>
            <input name="deadline" type="date" value="${esc(c?.deadline || '')}"></div>
        </div>
        <div class="fgrid one">
          ${/* a noun, because the value is a trade: "Completion trade: --" reads
               where "Settled by: --" sounds like a missing name */''}
          <div class="field" data-settled-field><label>Completion trade</label><select name="settledBy">
            <option value="">&mdash;</option>
            ${after.map((x) => `<option value="${esc(x.id)}" ${c?.settledBy === x.id ? 'selected' : ''}>${
              esc(fmtDate(x.date, { year: true }))} &middot; ${
              esc(x.sides.map((sd) => db.team(sd.team)?.manager || '?').join(' / '))}${
              db.seasonOf(x.date) !== (trade.season ?? db.seasonOf(trade.date))
                ? ` (${db.seasonOf(x.date)})` : ''}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Result detail</label><input name="outcome" value="${esc(c?.outcome || '')}"></div>`,
      onConfirm: async (d) => {
        const body = d.text.trim();
        /* the rows were built as you went, so read whatever is in the form */
        const want = [];
        for (const k of Object.keys(d)) {
          const mm = k.match(/^a(\d+)_kind$/);
          if (!mm) continue;
          const i = mm[1];
          const to = Number(d[`a${i}_team`]);
          const kind = d[k];
          if (kind === 'faab') {
            const amt = Number(d[`a${i}_amt`]);
            if (amt) want.push({ to, asset: { label: `$${amt} FAAB`, faab: amt } });
          } else if (kind === 'pick') {
            const yr = Number(d[`a${i}_yr`]);
            const rd = Number(d[`a${i}_rd`]);
            want.push({ to, asset: { label: `${yr} ${ORD[rd]}`,
              pick: { season: yr, round: rd, origin: Number(d[`a${i}_own`]) } } });
          } else {
            const name = String(d[`a${i}_name`] || '').trim();
            if (name) want.push({ to, asset: { label: name, pos: d[`a${i}_pos`] || null } });
          }
        }
        const expected = [...new Set(want.map((w) => w.to))].map((team) => ({
          team, receives: want.filter((w) => w.to === team).map((w) => w.asset),
        }));
        /* The locks are the promise: whatever is owed is frozen in the hands of
           whoever owes it, which on a two-team deal is simply the other side. */
        const locks = want.map((w) => {
          const heldBy = parties.find((t) => t !== w.to) ?? w.to;
          if (w.asset.pick) {
            return { kind: 'pick', season: w.asset.pick.season, round: w.asset.pick.round,
              origin: w.asset.pick.origin, heldBy };
          }
          // FAAB is locked too: a trade that spends it can be blocked, even
          // though a waiver bid that overruns it can only be unwound afterwards
          if (w.asset.faab != null) return { kind: 'faab', amount: w.asset.faab, label: w.asset.label, heldBy };
          return { kind: 'player', label: w.asset.label, heldBy };
        });

        await db.update('trades', (t) => {
          t.conditions ||= [];
          const at = t.conditions.findIndex((x) => x.id === c?.id);
          if (!body) { if (at > -1) t.conditions.splice(at, 1); return; }
          const rec = {
            id: c?.id || `cond-${id}`,
            season: trade.season ?? db.seasonOf(trade.date),
            tradeId: id,
            text: body,
            deadline: d.deadline || null,
            status: d.status,
            locks,
            expected,
            // only a met condition has a trade that completed it
            settledBy: d.status === 'met' ? (d.settledBy || null) : null,
            settledOn: d.status === 'met'
              ? (db.get('trades').trades.find((x) => x.id === d.settledBy)?.date || null) : null,
            outcome: d.outcome.trim() || null,
          };
          if (at > -1) t.conditions[at] = rec; else t.conditions.push(rec);
        });
        toast(body ? 'Condition saved' : 'Condition removed');
      },
    });

    /* Rows are built as they are chosen rather than sitting there empty. */
    const shutMenus = () => m.root.querySelectorAll('[data-menu]').forEach((x) => { x.hidden = true; });
    let seq = 0;
    const rowHtml = (team, kind, spec, a) => {
      const i = seq++;
      const base = `<input type="hidden" name="a${i}_kind" value="${kind}">
        <input type="hidden" name="a${i}_team" value="${team}">`;
      const kill = `<button type="button" class="ab-kill" data-del-row
        aria-label="Remove">${icon('x')}</button>`;
      if (kind === 'faab') return `<div class="ab-row">${base}
        <span class="pos-chip pos-none">$</span>
        <input type="number" min="0" name="a${i}_amt" placeholder="FAAB"
          value="${a?.faab ?? ''}">${kill}</div>`;
      if (kind === 'pick') return `<div class="ab-row">${base}
        <input type="hidden" name="a${i}_rd" value="${spec}">
        <span class="pos-chip pos-none">${ORD[spec]}</span>
        <select name="a${i}_yr">${years.map((y) =>
          `<option value="${y}" ${String(a?.pick?.season) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <select name="a${i}_own">${db.teams().map((t) =>
          `<option value="${t.number}" ${String(t.number) === String(a?.pick?.origin ?? team)
            ? 'selected' : ''}>${esc(t.manager)}</option>`).join('')}</select>${kill}</div>`;
      return `<div class="ab-row">${base}
        <input type="hidden" name="a${i}_pos" value="${spec}">
        <span class="pos-chip pos-${spec}">${spec}</span>
        <input name="a${i}_name" placeholder="Player name" value="${esc(a?.label || '')}">${kill}</div>`;
    };
    const addRow = (col, kind, spec, a) => {
      col.querySelector('[data-list]').insertAdjacentHTML('beforeend', rowHtml(col.dataset.team, kind, spec, a));
      col.querySelector('[data-menu]').hidden = true;
      col.querySelector('[data-list] .ab-row:last-child input:not([type=hidden])')?.focus();
    };

    m.root.querySelectorAll('[data-col]').forEach((col) => {
      // whatever the condition already promises, laid back out as rows
      for (const a of held(Number(col.dataset.team))) {
        addRow(col, a.faab != null ? 'faab' : a.pick ? 'pick' : 'player',
          a.pick ? a.pick.round : (a.pos || 'RB'), a);
      }
      col.querySelector('[data-add]').addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = col.querySelector('[data-menu]');
        const open = menu.hidden;
        shutMenus();
        menu.hidden = !open;
      });
      col.querySelectorAll('[data-new]').forEach((opt) => opt.addEventListener('click', () => {
        const [kind, spec] = opt.dataset.new.split(':');
        addRow(col, kind === 'rd' ? 'pick' : kind === 'pos' ? 'player' : 'faab', spec);
      }));
    });
    /* Only a condition that was met has a trade that completed it: an open one
       has not happened yet, and one that went unmet never will. */
    const status = m.root.querySelector('[data-status]');
    const settled = m.root.querySelector('[data-settled-field]');
    const syncSettled = () => {
      const on = status.value === 'met';
      const sel = settled.querySelector('select');
      // and it lets go of what it was holding, rather than greying out over a
      // trade that is still selected underneath
      if (!on) sel.value = '';
      sel.disabled = !on;
      settled.classList.toggle('off', !on);
    };
    status.addEventListener('change', syncSettled);
    syncSettled();

    m.root.addEventListener('click', (e) => {
      const kill = e.target.closest?.('[data-del-row]');
      if (kill) { kill.closest('.ab-row').remove(); return; }
      // clicking anywhere but inside a chooser closes it; Escape already closes
      // the whole modal, so it needs nothing of its own here
      if (!e.target.closest?.('[data-menu]')) shutMenus();
    });
  }));
}
