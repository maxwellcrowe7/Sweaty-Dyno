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
  // a pick or a pile of FAAB has no club; a player carries his, as on a pickup
  const club = pick || a.faab != null ? null : db.nflTeam(a.label);
  return `<li>
    ${a.faab != null ? `<span class="pos-chip pos-none">$</span>`
      : pick ? `<span class="pos-chip pos-none">PK</span>` : posChip(db.position(a.label))}
    <span class="${pick ? 'pk' : ''}">${esc(label)}</span>
    ${club && club !== '--' ? `<span class="nfl">&ndash; ${esc(club)}</span>` : ''}
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

/* A lock, written the way it reads: "Kareem Hunt, held by Max". */
const lockLabel = (db, l) => (l.kind === 'player' ? l.label
  : `${l.season} ${['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][l.round] || `${l.round}th`}${
    l.origin && db.team(l.origin) ? ` (${db.team(l.origin).manager})` : ''}`);

const tradeCard = (db, t, cond = null, breaks = [], nested = false) => {
  const st = cond ? db.conditionStatus(cond) : null;
  const mine = breaks.filter((b) => b.lock.condition.id === cond?.id);
  // the trade that discharged this condition rides inside this card rather than
  // sitting in the list as an unexplained second deal
  const settler = cond?.settledBy
    ? db.get('trades').trades.find((x) => x.id === cond.settledBy) : null;
  // Two-team deals are self-describing: what I get is what you gave. Three-way
  // deals are not, so every asset says who it came from.
  const showFrom = t.sides.length > 2;
  const banded = t.sides.length > 2;
  const who = (s) => `<div class="who">${teamTag(s.team ? db.team(s.team) : null, { alias: s.alias })}
    <span class="arrow">gets</span></div>`;

  return `<div class="trade${cond ? ' is-cond' : ''}${banded ? ' banded' : ''}${
      nested ? ' nested' : ''}" data-trade="${esc(t.id)}">
    <div class="trade-hd">
      <div class="trade-meta">
        ${st ? `<span class="chip ${st.chip}">${st.label}</span>` : ''}
        <div style="flex:1"></div>
        ${db.isAdmin && !nested ? `<button class="edit-pencil" data-cond-edit="${esc(t.id)}"
          aria-label="Condition on this trade" title="Condition on this trade">${icon('pencil')}</button>` : ''}
        <span class="d">${fmtDate(t.date, { year: true })}</span>
      </div>
      ${banded ? '' : `<div class="trade-names">${t.sides.map(who).join('')}</div>`}
    </div>
    <div class="trade-body">${t.sides.map((s) => side(db, s, showFrom, banded, who)).join('')}</div>
    ${cond ? `<div class="cond">
      <p class="cond-line"><span class="lbl">Condition</span>${esc(cond.text)}</p>
      ${/* a resolved condition freezes nothing: the chips go with it */''}
      ${cond.locks?.length && ['open', 'due'].includes(st.key) ? `<div class="locks">
        ${cond.locks.map((l) => `<span class="lock-chip">${icon('lock')}${esc(lockLabel(db, l))}
          <em>${esc(db.team(l.heldBy)?.manager || '?')}</em></span>`).join('')}
      </div>` : ''}
      ${/* "Condition met" plus the wording above usually says what happened --
           "met" already implies Max made the finals. The note is for the times
           it does not, so an empty one prints nothing. */''}
      ${st.key === 'open'
        ? (cond.deadline ? `<div class="out">${icon('clock')} ${
          esc(fmtDate(cond.deadline, { year: true }))}</div>` : '')
        : st.key === 'due'
          ? `<div class="out">${icon('alert')} Deadline passed &mdash; say what happened</div>`
          : cond.outcome
            ? `<div class="out">${icon(st.key === 'met' ? 'check' : 'x')} ${esc(cond.outcome)}</div>`
            : ''}
      ${mine.length ? `<div class="lock-break">${icon('alert')}
        ${mine.length === 1 ? 'A locked asset moved anyway' : `${mine.length} locked assets moved anyway`}:
        ${esc(mine.map((b) => lockLabel(db, b.lock)).join(', '))}</div>` : ''}
      ${/* the settlement sits on the condition's own ground -- it belongs to the
           condition, and a second colour around it only said so again */''}
      ${settler ? `<div class="settle-wrap">${tradeCard(db, settler, null, [], true)}</div>` : ''}
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
  root.querySelectorAll('[data-cond-edit]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.condEdit;
    const trade = db.get('trades').trades.find((x) => x.id === id);
    const c = db.conditionFor(id);
    const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

    // every asset that changed hands in this deal, and who ended up with it
    const inTrade = trade.sides.flatMap((side) => side.receives.map((raw) => {
      const a = typeof raw === 'string' ? { label: raw } : raw;
      return a.pick
        ? { kind: 'pick', season: a.pick.season, round: a.pick.round, origin: a.pick.origin, heldBy: side.team }
        : { kind: 'player', label: a.label, heldBy: side.team };
    })).filter((l) => l.kind === 'player' ? !/FAAB/i.test(l.label) : true);

    const same = (x, y) => x.kind === y.kind && x.heldBy === y.heldBy && (x.kind === 'player'
      ? x.label === y.label
      : x.season === y.season && x.round === y.round && x.origin === y.origin);
    const held = (l) => db.team(l.heldBy)?.manager || `T${l.heldBy}`;
    const text = (l) => (l.kind === 'player' ? l.label
      : `${l.season} ${ORD[l.round] || `${l.round}th`}${l.origin && db.team(l.origin) ? ` (${db.team(l.origin).manager})` : ''}`);
    // anything locked that this trade did not move gets written out longhand
    const extra = (c?.locks || []).filter((l) => !inTrade.some((x) => same(x, l)))
      .map((l) => `${text(l)} @ ${held(l)}`).join('\n');

    // a candidate settlement: a later trade involving anyone from this one
    const people = new Set(trade.sides.map((x) => x.team));
    /* Any later trade involving one or both of these managers, whatever season
       it lands in: a condition agreed in November can easily pay out in the
       next offseason, and it still belongs to the deal that created it. A deal
       between two other managers cannot settle this one, so it is not offered. */
    const after = db.get('trades').trades
      .filter((x) => x.id !== id && (x.date || '') >= (trade.date || '')
        && x.sides.some((sd) => people.has(sd.team)))
      .sort((x, y) => (y.date || '').localeCompare(x.date || ''));

    openModal({
      title: 'Condition',
      confirm: 'Save',
      closeButtons: false,
      body: `
        <div class="field"><label>If&hellip; then&hellip;</label>
          <textarea name="text" placeholder="If Max reaches the finals, the 2026 3rd converts to Noah's.">${esc(c?.text || '')}</textarea></div>
        <div class="field"><label>Deadline</label>
          <input name="deadline" type="date" value="${esc(c?.deadline || '')}"></div>

        <div class="section-title">Locked until it resolves</div>
        <div class="lock-pick">
          ${inTrade.map((l, i) => `<label class="lk-opt">
            <input type="checkbox" name="lk${i}" ${(c?.locks || []).some((x) => same(x, l)) ? 'checked' : ''}>
            <span>${esc(text(l))}</span><em>${esc(held(l))}</em></label>`).join('')}
        </div>
        <div class="field"><label>Other assets &mdash; one per line, <span class="dimmer">asset @ manager</span></label>
          <textarea name="extra" placeholder="Kareem Hunt @ Max&#10;2026 3rd (Alex) @ Max">${esc(extra)}</textarea>
          <div class="lock-err" data-lock-err hidden></div></div>

        <div class="section-title">Outcome</div>
        <div class="fgrid">
          <div class="field"><label>Status</label><select name="status">
            ${[['open', 'Open'], ['met', 'Condition met'], ['void', 'Not met']].map(([v, t]) =>
              `<option value="${v}" ${(c?.status || 'open') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Settled by</label><select name="settledBy">
            <option value="">&mdash;</option>
            ${after.map((x) => `<option value="${esc(x.id)}" ${c?.settledBy === x.id ? 'selected' : ''}>${
              esc(fmtDate(x.date, { year: true }))} &middot; ${
              esc(x.sides.map((sd) => db.team(sd.team)?.manager || '?').join(' / '))}${
              db.seasonOf(x.date) !== (trade.season ?? db.seasonOf(trade.date))
                ? ` (${db.seasonOf(x.date)})` : ''}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>What happened</label><input name="outcome" value="${esc(c?.outcome || '')}"></div>`,
      onConfirm: async (d) => {
        const body = d.text.trim();
        // parse "2026 3rd (Alex) @ Max" and "Kareem Hunt @ Max"
        /* Manager by name, alias or team number -- and a line that cannot be read
           is an error, not something to drop on the floor. Skipping them
           silently was indistinguishable from the whole box not saving. */
        const byName = (n) => {
          const q = String(n).trim().toLowerCase();
          if (!q) return null;
          const t = db.teams().find((x) => x.manager.toLowerCase() === q)
            || db.teams().find((x) => (x.fullName || '').toLowerCase() === q)
            || db.teams().find((x) => String(x.number) === q.replace(/^t/, ''))
            || db.teams().find((x) => x.manager.toLowerCase().startsWith(q));
          return t?.number ?? null;
        };
        const parsed = [];
        const bad = [];
        String(d.extra || '').split('\n').forEach((line, n) => {
          if (!line.trim()) return;
          const at = line.lastIndexOf('@');
          if (at < 0) return bad.push(`Line ${n + 1}: add "@ manager" &mdash; ${esc(line.trim())}`);
          const asset = line.slice(0, at).trim();
          const owner = line.slice(at + 1).trim();
          const heldBy = byName(owner);
          if (!asset) return bad.push(`Line ${n + 1}: no asset before the @`);
          if (!heldBy) return bad.push(`Line ${n + 1}: no manager called "${esc(owner)}"`);
          const m = asset.match(/^(\d{4})\s+(\d)(?:st|nd|rd|th)(?:\s*\(([^)]+)\))?$/i);
          parsed.push(m
            ? { kind: 'pick', season: Number(m[1]), round: Number(m[2]), origin: m[3] ? byName(m[3]) : null, heldBy }
            : { kind: 'player', label: asset, heldBy });
        });
        if (bad.length) {
          const box = document.querySelector('[data-lock-err]');
          if (box) { box.innerHTML = bad.join('<br>'); box.hidden = false; }
          toast('Check the locked assets');
          return false;
        }
        const locks = [...inTrade.filter((l, i) => d[`lk${i}`]), ...parsed];

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
            settledBy: d.settledBy || null,
            settledOn: d.status === 'open' ? null : (db.get('trades').trades.find((x) => x.id === d.settledBy)?.date || null),
            outcome: d.outcome.trim() || null,
          };
          if (at > -1) t.conditions[at] = rec; else t.conditions.push(rec);
        });
        toast(body ? 'Condition saved' : 'Condition removed');
      },
    });
  }));
}
