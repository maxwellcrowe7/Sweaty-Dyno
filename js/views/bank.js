import { money, esc, icon, teamTag, empty, toast, gauge } from '../util.js';

const CATS = {
  empire:    { label: 'Empire Pot', chip: 'violet' },
  placement: { label: 'Placement',  chip: 'gold' },
  minigame:  { label: 'Minigames',  chip: 'heat' },
};

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

/* Which panels are open. Module-scoped so it survives the re-render that an edit
   triggers — expanding a row, changing a value and watching the row collapse
   would be maddening. Not in the URL: this is transient, not worth linking to. */
const UI = { seasons: null, lines: new Set(), pop: null, won: new Set() };

/* ---------- payouts, one collapsible block per season ---------- */
const label = (db, r, cat) => cat === 'placement'
  ? `${ORD[(r.place || 1) - 1]}${r.team ? ` &mdash; ${esc(db.team(r.team).manager)}` : ''}`
  : esc(db.team(r.team)?.manager ?? '');

function seasonPayouts(db, season, open, admin) {
  const lines = db.payoutLines(season);
  /* What the season pays out, not what has been handed over: until the window
     closes nobody is owed anything, so the figure is the slate and the places
     it will pay. "To pay" waits for the season to be over. */
  const over = db.seasonOver(season);
  const emp = db.empireOutlook(season);
  const total = lines.reduce((a, l) => a + (l.category === 'empire'
    ? (emp.claimed || emp.live ? emp.pot : 0) : l.scheduled), 0);
  const paid = lines.reduce((a, l) => a + l.paidTotal, 0);
  const owed = over ? total - paid : 0;

  return `
  <div class="card acc${open ? ' open' : ''}" style="margin-bottom:10px">
    <button class="acc-hd" data-season="${season}" aria-expanded="${open}">
      ${icon('chev', 'acc-caret')}
      <h3>${season}</h3>
      <div class="spacer" style="margin-left:auto"></div>
      ${owed > 0 ? `<span class="chip red">${money(owed)} to pay</span>` : ''}
      <span class="chip${total ? (owed ? '' : ' mint') : ''}">${money(total)}</span>
    </button>
    <div class="acc-bd">
      ${lines.map((l) => {
        const c = CATS[l.category];
        const emp = l.category === 'empire' ? db.empireOutlook(season) : null;
        // the empire pot is only on the table once somebody could finish the
        // season holding it -- in year one nobody could
        const pot = emp ? (emp.claimed || emp.live ? emp.pot : 0) : l.scheduled;
        const can = l.rows.length > 0 || (emp && emp.live && !emp.claimed);

        let sub;
        if (emp) {
          sub = emp.claimed ? 'Claimed'
            : emp.live ? `${emp.contenders.length} could claim it`
            : 'Nobody can claim it this season';
        } else if (!l.scheduled) {
          sub = l.category === 'placement' ? 'No payout amounts set for any place' : 'Nothing set aside yet';
        } else if (l.decided === l.rows.length && l.rows.length) {
          sub = l.paidCount === l.rows.length ? 'All paid' : `${l.paidCount} of ${l.rows.length} paid`;
        } else if (l.decided) {
          sub = `${l.decided} of ${l.rows.length} decided`;
        } else {
          sub = 'at stake';
        }

        return `<div class="pay-line${can ? ' can' : ''}${UI.lines.has(`${season}:${l.category}`) ? ' open' : ''}">
          <button class="pay-hd" ${can ? `data-line="${season}:${l.category}"` : 'disabled'}>
            ${can ? icon('chev', 'acc-caret') : '<span style="width:18px;flex:none"></span>'}
            <span class="chip ${c.chip}">${c.label}</span>
            <div class="grow"><div class="s">${sub}</div></div>
            ${over && can && l.paidCount < l.decided ? '<span class="dot-owed" title="Payment outstanding"></span>' : ''}
            <div class="pay-val${!pot ? ' zero'
              : over && l.paidTotal === pot ? ' won' : ''}">${money(pot)}</div>
          </button>
          ${!can ? '' : `<ul class="pay-rows">
            ${emp ? `<li class="pay-note">${emp.claimed
              ? `Claimed by ${esc(db.team(emp.team)?.manager ?? '')} in ${emp.season}`
              : `A second title takes it &mdash; ${esc(emp.contenders.map((t) => t.manager).join(', '))}`}</li>`
            : l.rows.map((r) => `<li class="${r.team ? '' : 'open-prize '}${
              r.won?.length ? 'has-won ' : ''}${UI.won.has(`${season}:${r.team}`) ? 'open' : ''}"
              ${r.won?.length ? `data-won="${season}:${r.team}"` : ''}>
              <span class="pay-who">${label(db, r, l.category)}${
                r.won?.length ? icon('chev', 'won-caret') : ''}</span>
              ${r.won?.length ? `<span class="pay-what">${r.won.map((w) =>
                `<em>${esc(w.what)} <b>${money(w.amount)}</b></em>`).join('')}</span>` : ''}
              <b>${money(r.amount)}</b>
              ${!r.team ? '<span class="paid-tag">Open</span>'
                : admin
                ? `<button class="paid-btn${r.paid ? ' on' : ''}" data-paid="${season}:${l.category}:${r.team}"
                     aria-pressed="${r.paid}">${r.paid ? icon('check') : ''}<span>${r.paid ? 'Paid' : 'Mark paid'}</span></button>`
                : `<span class="paid-tag${r.paid ? ' on' : ''}">${r.paid ? 'Paid' : 'Unpaid'}</span>`}
            </li>`).join('')}
          </ul>`}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

export function render(db, state = {}) {
  const all = db.bank();
  const led = db.ledger().sort((a, b) => b.net - a.net);
  const seasons = db.seasons;
  const teams = db.teams();
  const bank = db.get('bank');
  const admin = db.isAdmin;
  // Open the most recent season that actually has payouts — defaulting to the
  // current season would leave the only populated block collapsed.
  // every season that has started gets a card, so the current one is there to
  // act on rather than appearing only once somebody has won something
  const started = seasons.filter((s) => s <= db.league.currentSeason);
  // a decided result, not a prize on offer -- the placement scale gives every
  // season rows, so this would otherwise hand a card to 2030
  const withRows = seasons.filter((s) => db.payoutLines(s).some((l) => l.decided));
  const paidSeasons = [...new Set([...started, ...withRows])].sort((a, b) => a - b);
  if (UI.seasons === null)
    UI.seasons = new Set([paidSeasons.at(-1) ?? db.league.currentSeason]);
  const openSeasons = UI.seasons;

  const paidFor = (t, s) => bank.payins.find((p) => p.team === t && p.season === s)?.paid || 0;
  const seasonPaid = (s) => bank.payins.filter((p) => p.season === s).reduce((a, p) => a + (Number(p.paid) || 0), 0);
  const seasonDue = (s) => db.buyIn(s) * teams.length;

  /* A total with what was expected of it tucked behind, said as a fraction --
     the two figures beside each other are the whole story, and the section
     heading already says what they are. The totals are the last row, so it
     opens upward or the card clips it. */
  const due = (key, shown, expected, got) => `
    <td class="n pop-host up${UI.pop === key ? ' open' : ''}">
      <button class="tot-btn" data-pop="${key}" aria-expanded="${UI.pop === key}"
        title="Collected of expected">${shown}</button>
      <div class="pop-box${got < expected ? ' short' : ''}">${money(got)}<i>/</i>${money(expected)}</div>
    </td>`;

  const sheet = db.balanceSheet();
  const best = Math.max(1, ...led.map((t) => t.won));

  return `
  ${/* The bank is one pot with claims on it, so it is one graphic: the dial is
       the cash, and the colours are what is already spoken for. Beside it sit
       the two things a dial of today's money cannot say -- what has come in and
       what has gone out over every season. */''}
  <div class="hero">
    <div class="card gauge-card">
      <div style="position:relative">
        ${gauge([
          { key: 'free', value: all.spendable },
          { key: 'owed', value: all.owedOut },
          { key: 'empire', value: all.earmarked },
        ], `In the bank ${money(all.cash)}: ${money(all.spendable)} free, ${
          money(all.owedOut)} owed out, ${money(all.earmarked)} empire pot`)}
        <div class="gauge-val">
          <div class="big">${money(all.cash)}</div>
          <div class="lbl">In the bank</div>
        </div>
      </div>
      <div class="gauge-legend">
        <div><i style="background:#3DDC97"></i> ${money(all.spendable)} free</div>
        ${all.owedOut ? `<div><i style="background:#F5C451"></i> ${money(all.owedOut)} owed out</div>` : ''}
        <div><i style="background:#9C8CFA"></i> ${money(all.earmarked)} empire pot</div>
      </div>
    </div>

    <div class="tiles">
      <div class="tile mint"><div class="k">Collected</div><div class="v">${money(all.collected)}</div>
        <div class="m">every season</div></div>
      <div class="tile accent"><div class="k">Paid out</div><div class="v">${money(all.disbursed)}</div>
        <div class="m">to managers</div></div>
      <div class="tile gold"><div class="k">${db.season} at stake</div>
        <div class="v">${money(db.payoutLines(db.season).reduce((a, l) => a + (l.category === 'empire'
          ? (db.empireOutlook(db.season).live ? db.empireOutlook(db.season).pot : 0) : l.scheduled), 0))}</div>
        <div class="m">prizes this season</div></div>
      <div class="tile violet"><div class="k">Empire pot</div><div class="v">${money(all.earmarked)}</div>
        <div class="m">${db.empireClaim() ? 'claimed' : 'accruing, unclaimed'}</div></div>
    </div>
  </div>

  <div class="section-title">Buy-ins</div>
  <div class="card">
    <div class="card-bd flush"><div class="tw"><table class="dt">
      ${/* The buy-in for a season lives behind its own year: every figure in the
           column below already says whether it was paid in full, so a row
           stating the rate ten times was answering a question nobody had
           until they had it about one season. */''}
      <thead><tr><th class="sticky">Team</th>
        ${seasons.map((s) => `<th class="n pop-host${UI.pop === `rate:${s}` ? ' open' : ''}">
          <button class="yr-btn" data-pop="rate:${s}" aria-expanded="${UI.pop === `rate:${s}`}"
            title="${admin ? 'Set' : 'See'} the ${s} buy-in">${s}</button>
          <div class="pop-box">${admin
            ? `<input class="rate-in" type="text" inputmode="decimal" data-rate="${s}"
                 value="${money(db.buyIn(s))}" aria-label="${s} buy-in">`
            : money(db.buyIn(s))}</div>
        </th>`).join('')}
        <th class="n">Paid</th></tr></thead>
      <tbody>
        ${teams.map((t) => {
          const paid = seasons.reduce((a, s) => a + paidFor(t.number, s), 0);
          return `<tr><td class="sticky">${teamTag(t)}</td>
            ${seasons.map((s) => {
              const v = paidFor(t.number, s);
              const due = db.buyIn(s);
              const cls = v >= due && due > 0 ? 'full' : v > 0 ? 'part' : 'none';
              return `<td class="n cell-${cls}">${admin
                ? `<input class="cell-in" type="text" inputmode="decimal"
                     data-pay="${t.number}:${s}" value="${v ? money(v) : ''}" placeholder="&mdash;"
                     aria-label="${esc(t.manager)} ${s}">`
                : v ? money(v) : '<span class="dimmer">&mdash;</span>'}</td>`;
            }).join('')}
            <td class="n" style="font-weight:700">${money(paid)}</td></tr>`;
        }).join('')}
        ${/* what was expected sits behind what came in: a standing row of it
             was a second line of totals nobody reads until they are chasing
             one particular season */''}
        <tr class="total"><td class="sticky">Collected</td>
          ${seasons.map((s) => due(`due:${s}`,
            seasonPaid(s) ? money(seasonPaid(s)) : '<span class="dimmer">&mdash;</span>',
            seasonDue(s), seasonPaid(s))).join('')}
          ${due('due:all', money(all.collected), all.expected, all.collected)}</tr>
      </tbody></table></div></div>
  </div>

  <div class="section-title">Payouts</div>
  ${[...paidSeasons].sort((a, b) => b - a)
    .map((s) => seasonPayouts(db, s, openSeasons.has(s), admin)).join('')
    || empty('No payouts yet', 'Minigame and placement winners will appear here, grouped by season.', 'wallet')}

  <div class="section-title">Balance sheet</div>
  <div class="card"><div class="card-bd flush"><div class="tw"><table class="dt">
    ${/* the column names carry it: money in, the three things it goes to, what
         is left. A paragraph behind each was explaining arithmetic the row
         already performs. */''}
    <thead><tr><th class="sticky">Season</th><th class="n">Buy-ins</th><th class="n">Carried</th>
      <th class="n">Empire</th>
      <th class="n">Minigames</th><th class="n">Placement</th><th class="n">Surplus</th></tr></thead>
    <tbody>${sheet.map((r) => !r.active
      ? `<tr><td class="sticky dim">${r.season}</td>
          ${[0, 1, 2, 3, 4, 5].map(() => '<td class="n dimmer">&mdash;</td>').join('')}</tr>`
      : `<tr><td class="sticky" style="font-weight:700">${r.season}</td>
        ${/* money in and money forward are different things: added together,
             the column footed to more than the league has ever taken in */''}
        <td class="n" style="font-weight:700">${r.fees ? money(r.fees) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n">${r.carryIn ? money(r.carryIn) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n" style="color:${r.empire ? 'var(--violet)' : ''}">${r.empire ? money(r.empire) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n" style="color:${r.mini ? 'var(--heat)' : ''}">${r.mini ? money(r.mini) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n" style="color:${r.place ? 'var(--gold)' : ''}">${r.place ? money(r.place) : '<span class="dimmer">&mdash;</span>'}</td>
        <td class="n ${r.surplus > 0 ? 'pos' : r.surplus < 0 ? 'neg' : 'dimmer'}">${money(r.surplus)}</td></tr>`).join('')}
      ${(() => {
        // sum the columns above rather than a separately-derived figure, or the
        // total silently disagrees with the rows it is totalling
        const t = sheet.filter((r) => r.active).reduce((a, r) => ({
          carry: a.carry + r.carryIn,
          empire: a.empire + r.empire, mini: a.mini + r.mini, place: a.place + r.place,
        }), { carry: 0, empire: 0, mini: 0, place: 0 });
        const left = all.collected - t.empire - t.mini - t.place;
        return `<tr class="total"><td class="sticky">All time</td>
          <td class="n">${money(all.collected)}</td>
          <td class="n">${t.carry ? money(t.carry) : '<span class="dimmer">&mdash;</span>'}</td>
          <td class="n">${money(t.empire)}</td>
          <td class="n">${money(t.mini)}</td>
          <td class="n">${money(t.place)}</td>
          <td class="n ${left >= 0 ? 'pos' : 'neg'}">${money(left)}</td></tr>`;
      })()}
    </tbody></table></div></div>
    ${/* Who has actually been handed what is the payouts section's job. This
         table sets money aside and checks that it balances. */''}
  </div>

  ${/* The scoreboard, not a statement. Everyone pays the same buy-in, so net is
       just winnings less a constant -- there is one real variable here, and the
       bar is it: how much a manager has won, and what he won it on, drawn
       against the biggest haul in the league. A manager who has paid a future
       season early is not counted, because none of that money could have been
       won back yet, and the buy-in grid above already says who has. */''}
  <div class="section-title">Manager ledger</div>
  <div class="card">
    <div class="card-hd"><h3>Lifetime net</h3><div class="spacer"></div>
      ${Object.entries(CATS).reverse().map(([k, c]) =>
        `<span class="lg-key"><i class="lg-${k}"></i>${c.label}</span>`).join('')}
    </div>
    <div class="card-bd flush"><div class="rows">
      ${led.slice().sort((a, b) => b.net - a.net || b.won - a.won).map((t) => `
        <div class="row led">
          ${/* no rank column: the rows are sorted by net every time they are
               drawn, so the order is the ranking */''}
          ${/* the number, not just the name: this ledger belongs to the
               franchise and survives a change of manager */''}
          <span class="led-who">${teamTag(t)}</span>
          <span class="led-bar">${Object.entries(t.cat).filter(([, v]) => v > 0).map(([c, v]) =>
            `<button class="lg-${c}" data-seg style="width:${(v / best * 100).toFixed(1)}%"
               aria-label="${esc(CATS[c].label)} ${money(v)}"><em>${esc(CATS[c].label)}
               <b>${money(v)}</b></em></button>`).join('')}</span>
          ${/* one figure with the other in parentheses: the net leads because it
               is what the ledger is for, and the haul explains it without
               needing a column of its own to be told apart */''}
          <span class="led-fig">
            <b class="led-net ${t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : 'dim'}">${money(t.net, { sign: true })}</b>
            <span class="led-won${t.won ? '' : ' none'}">(${money(t.won)} total)</span>
          </span>
        </div>`).join('')}
    </div></div>
  </div>
  `;
}

export function mount(root, db, go, setState, params = {}) {
  /* Type a plain number, see a dollar value. Editing shows the raw figure so
     you are never fighting a currency mask mid-keystroke. */
  const parseMoney = (v) => Math.max(0, Number(String(v).replace(/[^0-9.]/g, '')) || 0);

  const currencyField = (inp, read, write) => {
    let busy = false;
    // Commit on Enter directly rather than via blur(): a soft keyboard's Done
    // key does not reliably blur the field, and losing a typed figure is worse
    // than committing twice (the busy flag covers that).
    const commit = async () => {
      if (busy) return;
      busy = true;
      try {
        const val = parseMoney(inp.value);
        if (val !== read()) await write(val);
        inp.value = val ? money(val) : '';
      } finally { busy = false; }
    };
    inp.addEventListener('focus', () => {
      const raw = read();
      inp.value = raw ? String(raw) : '';
      inp.select();
    });
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit().then(() => inp.blur()); }
      if (e.key === 'Escape') { inp.value = ''; inp.blur(); }
    });
  };

  root.querySelectorAll('[data-pay]').forEach((inp) => {
    const [team, season] = inp.dataset.pay.split(':').map(Number);
    currencyField(inp,
      () => db.get('bank').payins.find((p) => p.team === team && p.season === season)?.paid || 0,
      async (val) => {
        await db.update('bank', (b) => {
          const row = b.payins.find((p) => p.team === team && p.season === season);
          if (row) row.paid = val;
          else b.payins.push({ season, team, paid: val });
        });
        toast(`${db.team(team).manager} ${season}: ${val ? money(val) : 'cleared'}`);
      });
  });

  /* Opened in place rather than through a repaint: the table is a wide
     scroller and a repaint would lose where you had scrolled to. */
  /* Opened in place rather than through a repaint: the table is a wide
     scroller and a repaint would lose where you had scrolled to. */
  const showPops = () => root.querySelectorAll('[data-pop]').forEach((b) => {
    const on = b.dataset.pop === UI.pop;
    b.closest('.pop-host').classList.toggle('open', on);
    b.setAttribute('aria-expanded', String(on));
  });
  root.querySelectorAll('[data-pop]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    UI.pop = UI.pop === b.dataset.pop ? null : b.dataset.pop;
    showPops();
    if (UI.pop) root.querySelector('.pop-host.open .rate-in')?.focus();
  }));
  // a popover closes the way a reader expects: click anywhere else
  root._rateShut = (e) => {
    if (UI.pop == null || e.target.closest?.('.pop-box') || e.target.closest?.('[data-pop]')) return;
    UI.pop = null;
    showPops();
  };
  document.addEventListener('click', root._rateShut);

  /* On a phone the prizes a manager won are folded away -- there is no room to
     spell them out beside his name. On a desktop they are always out, so a tap
     there means nothing. */
  /* A bar segment says what it is worth when you tap it -- the colours have a
     legend, but the amounts were only ever in a hover title. */
  const shutSegs = (except) => root.querySelectorAll('.led-bar button.on')
    .forEach((b) => { if (b !== except) b.classList.remove('on'); });
  root.querySelectorAll('[data-seg]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !b.classList.contains('on');
    shutSegs();
    b.classList.toggle('on', on);
  }));
  root._segShut = () => shutSegs();
  document.addEventListener('click', root._segShut);

  root.querySelectorAll('[data-won]').forEach((li) => li.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (window.matchMedia('(min-width:621px)').matches) return;
    const k = li.dataset.won;
    UI.won.has(k) ? UI.won.delete(k) : UI.won.add(k);
    li.classList.toggle('open', UI.won.has(k));
  }));

  root.querySelectorAll('[data-rate]').forEach((inp) => {
    const s = inp.dataset.rate;
    currencyField(inp, () => db.buyIn(s), async (val) => {
      await db.update('league', (L) => { L.buyIn[s] = val; });
      toast(`${s} buy-in set to ${money(val)}`);
    });
  });

  /* Accordions toggle the DOM directly — routing through the URL would re-render
     and cost the reader their place. UI state above keeps them open across the
     re-render an edit causes. */
  root.querySelectorAll('[data-season]').forEach((b) => b.addEventListener('click', () => {
    const y = Number(b.dataset.season);
    UI.seasons.has(y) ? UI.seasons.delete(y) : UI.seasons.add(y);
    const open = UI.seasons.has(y);
    b.setAttribute('aria-expanded', String(open));
    b.closest('.acc').classList.toggle('open', open);
  }));

  root.querySelectorAll('[data-paid]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const [season, category, team] = b.dataset.paid.split(':');
    const s = Number(season), t = Number(team);
    const was = db.isSettled(s, category, t);
    await db.update('bank', (x) => {
      x.settled ||= [];
      if (was) x.settled = x.settled.filter((y) => !(y.season === s && y.category === category && y.team === t));
      else x.settled.push({ season: s, category, team: t, date: new Date().toISOString().slice(0, 10) });
    });
    toast(`${db.team(t).manager} ${was ? 'marked unpaid' : 'marked paid'}`);
  }));

  root.querySelectorAll('[data-line]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.line;
    UI.lines.has(key) ? UI.lines.delete(key) : UI.lines.add(key);
    b.closest('.pay-line').classList.toggle('open', UI.lines.has(key));
  }));
}
