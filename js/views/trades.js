import { esc, icon, teamTag, fmtDate, empty, money, posChip, openModal, teamOptions, toast } from '../util.js';

const isPick = (s) => /\b(1st|2nd|3rd|4th|5th|\d\.\d\d|pick)\b/i.test(s) || /^\d{4}\s/.test(s);

const asset = (db, s) => isPick(s)
  ? `<li><span class="pos-chip pos-none">PK</span><span class="pk">${esc(s)}</span></li>`
  : `<li>${posChip(db.position(s))}<span>${esc(s)}</span></li>`;

const side = (db, s) => `
  <div class="trade-side">
    <div class="who">${teamTag(s.team ? db.team(s.team) : null, { alias: s.alias })}
      <span class="arrow">gets</span></div>
    <ul>${s.receives.map((x) => asset(db, x)).join('')}</ul>
  </div>`;

const tradeCard = (db, t, cond = null) => {
  const st = cond ? db.conditionalStatus(cond) : null;
  return `<div class="trade">
    <div class="trade-hd">
      ${st ? `<span class="chip ${st.chip}">${st.label}</span>` : `<span class="chip ghost">${icon('swap')} Trade</span>`}
      <div style="flex:1"></div>
      <span class="d">${fmtDate(t.date, { year: true })}</span>
    </div>
    <div class="trade-body">${t.sides.map((s) => side(db, s)).join('')}</div>
    ${cond ? `<div class="cond">
      <div class="lbl">Condition</div>${esc(cond.condition)}
      <div class="out">
        ${st.key === 'open'
          ? `${icon('clock')} Resolves by ${esc(cond.deadlineLabel || fmtDate(cond.deadline, { year: true }))}`
          : `${icon(st.key === 'met' ? 'check' : 'x')} ${esc(cond.outcome || st.label)}`}
      </div></div>` : ''}
    ${t.note && !cond ? `<div class="cond" style="background:rgba(255,255,255,.02)">
      <div class="lbl" style="color:var(--ink-3)">Note</div>${esc(t.note)}</div>` : ''}
  </div>`;
};

export function render(db, state = {}) {
  const tab = state.tradeTab || 'trades';
  const { trades, conditional, waivers } = db.trades();
  const admin = db.isAdmin;
  const open = conditional.filter((c) => db.conditionalStatus(c).key === 'open');
  const faab = waivers.reduce((a, w) => a + (w.faab || 0), 0);

  const body = {
    trades: () => trades.length
      ? trades.map((t) => tradeCard(db, t, t.conditionalId
          ? conditional.find((c) => c.id === t.conditionalId) : null)).join('')
      : empty('No trades yet', 'Log a trade and it lands here, newest first.', 'swap'),

    conditional: () => conditional.length
      ? conditional.map((c) => tradeCard(db, c, c)).join('')
      : empty('No conditional trades', 'Trades with strings attached show open, met, or expired.', 'clock'),

    waivers: () => waivers.length ? `
      <div class="card"><div class="card-bd flush"><div class="rows">
        ${waivers.map((w) => `<div class="row">
          <span class="chip ghost">#${w.n}</span>
          <div class="grow">
            <div class="t" style="display:flex;align-items:center;gap:7px">${posChip(db.position(w.player))} ${esc(w.player)}</div>
            <div class="s">${teamTag(w.team ? db.team(w.team) : null, { alias: w.alias, num: false })} &middot; ${fmtDate(w.date, { year: true })}</div>
          </div>
          <div class="val" style="color:${w.faab ? 'var(--mint)' : 'var(--ink-3)'}">$${w.faab}</div>
        </div>`).join('')}
      </div></div></div>` : empty('No waiver claims', 'FAAB claims you record show up here.', 'inbox'),
  }[tab]();

  return `
  <div class="pills">
    <button data-tab="trades" aria-pressed="${tab === 'trades'}">Trades ${trades.length}</button>
    <button data-tab="conditional" aria-pressed="${tab === 'conditional'}">Conditional ${conditional.length}</button>
    <button data-tab="waivers" aria-pressed="${tab === 'waivers'}">Waivers ${waivers.length}</button>
  </div>

  ${tab === 'trades' ? `<div class="tiles" style="margin-top:8px">
    <div class="tile"><div class="k">Trades</div><div class="v">${trades.length}</div><div class="m">all time</div></div>
    <div class="tile accent"><div class="k">Pieces moved</div><div class="v">${trades.reduce((a, t) => a + t.sides.reduce((x, s) => x + s.receives.length, 0), 0)}</div><div class="m">players + picks</div></div>
    <div class="tile ${open.length ? 'gold' : ''}"><div class="k">Open conditions</div><div class="v">${open.length}</div><div class="m">awaiting outcome</div></div>
    <div class="tile mint"><div class="k">FAAB spent</div><div class="v">$${faab}</div><div class="m">${waivers.length} claims</div></div>
  </div>` : ''}

  ${admin ? `<div style="margin:14px 0 4px"><button class="btn primary" data-new="${tab}" style="width:100%">
      ${icon('plus')} New ${tab === 'waivers' ? 'waiver claim' : tab === 'conditional' ? 'conditional trade' : 'trade'}</button></div>` : ''}

  <div class="section-title">${tab === 'waivers' ? 'Claims' : 'Log'}</div>
  ${body}
  `;
}

export function mount(root, db, go, setState) {
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () =>
    setState({ tradeTab: b.dataset.tab })));

  root.querySelector('[data-new]')?.addEventListener('click', () => {
    const kind = root.querySelector('[data-new]').dataset.new;
    const teams = db.teams();
    const today = new Date().toISOString().slice(0, 10);

    if (kind === 'waivers') {
      return openModal({
        title: 'Waiver claim', confirm: 'Add claim',
        body: `<div class="field"><label>Player</label><input name="player" required placeholder="Player name"></div>
          <div class="fgrid">
            <div class="field"><label>Team</label><select name="team">${teamOptions(teams)}</select></div>
            <div class="field"><label>FAAB $</label><input name="faab" type="number" min="0" inputmode="numeric" value="0"></div>
          </div>
          <div class="field"><label>Date</label><input name="date" type="date" value="${today}"></div>`,
        onConfirm: async (d) => {
          if (!d.player.trim()) { toast('Player name required'); return false; }
          await db.update('trades', (t) => {
            const season = +d.date.slice(0, 4);
            const n = Math.max(0, ...t.waivers.filter((w) => w.season === season).map((w) => w.n)) + 1;
            t.waivers.push({ n, season, date: d.date, team: d.team ? +d.team : null, player: d.player.trim(), faab: +d.faab || 0 });
          });
          toast('Claim added');
        },
      });
    }

    const isCond = kind === 'conditional';
    openModal({
      title: isCond ? 'Conditional trade' : 'New trade',
      confirm: 'Log it',
      body: `
        <div class="field"><label>Date</label><input name="date" type="date" value="${today}"></div>
        <div class="section-title" style="margin-top:6px">Side A</div>
        <div class="field"><label>Team</label><select name="a">${teamOptions(teams)}</select></div>
        <div class="field"><label>Receives &mdash; one per line</label>
          <textarea name="ar" placeholder="Player Name&#10;2027 1st (Max)"></textarea></div>
        <div class="section-title">Side B</div>
        <div class="field"><label>Team</label><select name="b">${teamOptions(teams)}</select></div>
        <div class="field"><label>Receives &mdash; one per line</label>
          <textarea name="br" placeholder="Player Name&#10;2027 2nd (Noah)"></textarea></div>
        ${isCond ? `
          <div class="section-title">Condition</div>
          <div class="field"><label>If&hellip; then&hellip;</label>
            <textarea name="condition" placeholder="If Max reaches the finals, the 2026 3rd converts to Noah's."></textarea></div>
          <div class="fgrid">
            <div class="field"><label>Deadline</label><input name="deadline" type="date"></div>
            <div class="field"><label>Deadline label</label><input name="deadlineLabel" placeholder="End of the playoffs"></div>
          </div>` : `
          <div class="field"><label>Note (optional)</label><input name="note"></div>`}`,
      onConfirm: async (d) => {
        const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
        if (!d.a || !d.b) { toast('Pick both teams'); return false; }
        if (!lines(d.ar).length && !lines(d.br).length) { toast('Add at least one asset'); return false; }
        const season = +d.date.slice(0, 4);
        await db.update('trades', (t) => {
          const sides = [{ team: +d.a, receives: lines(d.ar) }, { team: +d.b, receives: lines(d.br) }];
          if (isCond) {
            t.conditionalTrades.push({
              id: `cond-${season}-${String(t.conditionalTrades.length + 1).padStart(2, '0')}`,
              season, date: d.date, status: 'open', sides,
              condition: d.condition.trim(), deadline: d.deadline || null,
              deadlineLabel: d.deadlineLabel.trim() || null,
              resolvedDate: null, outcome: null, settledTradeId: null,
            });
          } else {
            t.trades.push({
              id: `${season}-${String(t.trades.filter((x) => x.season === season).length + 1).padStart(2, '0')}`,
              season, date: d.date, sides, note: d.note?.trim() || null,
            });
          }
        });
        toast(isCond ? 'Conditional logged' : 'Trade logged');
      },
    });
  });
}
