import { money, esc, icon, teamTag, fmtDate, pts, gauge, posChip, normalize, isPickText } from '../util.js';

/* ============================================================
   HOME
   One glance at every tab that changes week to week: big figures, few
   words, and a way through to the page each block comes from. Nothing
   here is new data -- it is the headline of somewhere else.
   ============================================================ */

/* The block header: what it is, and the tab it came from -- and, with `at`,
   the spot on that tab it is the headline of. Not a .section-title, so the
   app's collapse wiring leaves it alone -- a home page that folds away is not
   a glance. */
const hd = (label, to, tab, ic, at = '') => `<div class="hm-hd"><span>${label}</span>
  <button class="hm-go" data-go="${to}"${at ? ` data-at="${esc(at)}"` : ''}>${icon(ic)}${tab}</button></div>`;

// what a rules change has to differ by for the home page to mention it again
const RULES_SEEN = 'sweatydyno:rulesSeen';
export const rulesSignature = (diff) => !diff ? ''
  : [...diff.added, ...diff.changed, ...diff.removed].map((x) => x.id).sort().join(',');
const rulesSeen = (season) => {
  try { return JSON.parse(localStorage.getItem(RULES_SEEN) || '{}')[season] ?? null; } catch { return null; }
};
export const markRulesSeen = (season, sig) => {
  try {
    const m = JSON.parse(localStorage.getItem(RULES_SEEN) || '{}');
    m[season] = sig;
    localStorage.setItem(RULES_SEEN, JSON.stringify(m));
  } catch { /* private mode */ }
};

export function render(db) {
  // Home is pinned to the current season rather than the shared browsing one:
  // it has no picker, so following it would show a stale year with no way back.
  const S = db.league.currentSeason ?? db.season;
  const nm = (n) => esc(db.team(n, S)?.manager ?? `T${n}`);
  const st = db.stats(S);

  /* ---- last week, in four figures ---- */
  const wk = st.weeks.at(-1);
  const games = wk ? st.weekly.filter((g) => g.week === wk) : [];
  const h = games.length ? db.highlightsFrom(games, st.rows.map((r) => r.number), false) : null;
  const low = games.length ? games.reduce((a, b) => (b.points < a.points ? b : a)) : null;
  const recap = !h ? '' : `
  ${hd(`Week ${wk}`, 'stats', 'Stats', 'chart', 'results')}
  <div class="tiles hl-tiles">
    <div class="tile mint"><div class="k">Top score</div>
      <div class="v">${pts(h.top.points)}</div><div class="m">${nm(h.top.team)}</div></div>
    <div class="tile red"><div class="k">Low score</div>
      <div class="v">${pts(low.points)}</div><div class="m">${nm(low.team)}</div></div>
    <div class="tile blue"><div class="k">Blowout</div>
      <div class="v">${h.blowout ? '+' + pts(h.blowout.margin) : '&mdash;'}</div>
      <div class="m">${h.blowout ? `${nm(h.blowout.team)} over ${nm(h.blowout.opponent)}` : ''}</div></div>
    <div class="tile gold"><div class="k">Closest</div>
      <div class="v">${h.closest ? pts(h.closest.margin) : '&mdash;'}</div>
      <div class="m">${h.closest ? `${nm(h.closest.team)} over ${nm(h.closest.opponent)}` : ''}</div></div>
  </div>`;

  /* ---- playoff race: all ten in one list, the orange rule across is the cut ----
     On a desktop it sits beside the moves, which run about as tall, so no
     one has to be folded away to keep the row even. */
  const po = db.playoffSeeds(S);
  const inn = po.rows.filter((r) => r.in);
  const out = po.rows.filter((r) => !r.in);
  const race = !st.hasRecords ? '' : `
  <div class="hm-race">
    ${hd(po.decided ? 'Final seeds' : 'Playoff race', 'stats', 'Stats', 'chart', 'seeds')}
    <div class="card"><div class="hm-race-bd">
      <div class="hm-rc" style="flex-grow:${inn.length}">${inn.map((r) => `<div class="hm-seed">
        <span class="hm-n">${r.seed}</span><span class="hm-nm">${nm(r.number)}</span>
        ${r.bye ? '<span class="seed-tag bye">BYE</span>' : ''}${r.how === 'points' ? '<span class="seed-tag">PTS</span>' : ''}
        <b class="hm-rec">${r.wins}&ndash;${r.losses}</b></div>`).join('')}</div>
      ${out.length ? `<div class="hm-rc out" style="flex-grow:${out.length}">${out.map((r) => `<div class="hm-seed">
        <span class="hm-nm">${nm(r.number)}</span>
        <span class="hm-back">&minus;${pts(r.back)}</span>
        <b class="hm-rec">${r.wins}&ndash;${r.losses}</b></div>`).join('')}</div>` : ''}
    </div></div>
  </div>`;

  /* ---- this week's minigame, and who took the last one ---- */
  const mg = db.minigames(S).games || [];
  const next = db.currentMinigame(S);
  const last = [...mg].filter((g) => g.status === 'final' && g.results?.['1']?.team)
    .sort((a, b) => (b.week ?? 0) - (a.week ?? 0))[0];
  const game = !next && !last ? '' : `
  <div class="hm-game">
    ${hd(next?.week ? `Week ${next.week} minigame` : 'Minigames', 'minigames', 'Games', 'dice', next ? `mg-${next.id}` : 'slate')}
    <div class="card"><div class="card-bd hm-game-bd">
      ${next ? `<div class="hm-big mint">${money(next.payout?.['1'] || 0)}</div>
        <div><div class="hm-name">${esc(next.name || 'To be set')}</div>
        ${next.summary ? `<div class="hm-sub">${esc(next.summary)}</div>` : ''}</div>` : '<div class="hm-sub">Slate finished</div>'}
    </div>
    ${/* last week's result is a different fact from this week's game, so it gets
         a ribbon of its own rather than sharing the block's space */''}
    ${last ? `<div class="hm-ribbon"><span class="k">Wk ${last.week}</span>
      <span class="hm-rib-name">${esc(last.name || '')}</span>
      ${/* the winner, not what won it: "310 yards" fits, "Josh Allen, 42.9
           points, 43% market share" does not, and the Games tab has it whole */''}
      <b>${nm(last.results['1'].team)}</b></div>` : ''}
    </div>
  </div>`;

  /* ---- the guillotine: how many are left and who went last ----
     The whole run lives on the Games tab; here it is two facts. The strip
     of names is the pool -- still in bright, chopped faded with their week. */
  const run = db.guillotineRun(S);
  const G = db.minigames(S).guillotine;
  const settled = run ? run.weeks.filter((w) => w.settled) : [];
  const lastChop = settled.at(-1);
  const lastCut = lastChop?.scores.find((x) => x.chopped);
  const choppedWeek = new Map(settled.map((w) => [w.chopped, w.week]));
  const guil = !run || !run.entrants.length ? '' : `
  <div class="hm-guil">
    ${hd('Guillotine', 'minigames', 'Games', 'blade', 'guillotine')}
    <div class="card"><div class="card-bd hm-guil-bd">
      ${run.winner ? `<div><div class="hm-big mint">${nm(run.winner)}</div>
          <div class="hm-sub">last one standing</div></div>`
        : `<div class="hm-left"><span class="hm-big">${run.survivors.length}</span><span class="hm-of">/${run.entrants.length}</span>
          <span class="hm-left-k">left</span></div>`}
      ${lastChop ? `<div class="hm-chop"><span class="k">Wk ${lastChop.week} chopped</span>
        <b>${nm(lastChop.chopped)} <span>${pts(lastCut?.points ?? 0)}</span></b>
      </div>` : `<div class="hm-sub">First chop week ${run.startWeek}</div>`}
    </div>
    ${/* an even grid, never a ragged wrap: ten names are two full rows of five.
         Finishing order -- the ones left, then the latest chop back to week one */''}
    <div class="hm-pool" style="--cols:${Math.ceil(run.entrants.length / 2)}">${[...run.survivors, ...settled.map((w) => w.chopped).reverse()].map((n) => choppedWeek.has(n)
      ? `<span class="gone"><b>${nm(n)}</b><i>W${choppedWeek.get(n)}</i></span>`
      : `<span><b>${nm(n)}</b></span>`).join('')}</div>
    </div>
  </div>`;

  /* ---- latest moves: pickups, then trades, the newest three of each ----
     Two groups rather than one mixed list: they are different shapes of thing,
     and a trade can then be laid out as a trade. */
  const { trades, waivers } = db.trades(S);
  const newest = (xs) => [...xs].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
  const pickups = newest(waivers.map((w) => ({ kind: 'move', date: w.date, w })));
  // a trade that settles a condition rides inside the deal it completes, as on
  // the Transactions page, rather than showing up as a trade of its own
  const settlers = new Set(db.conditions(null).map((c) => c.settledBy).filter(Boolean));
  const deals = newest(trades.filter((t) => !settlers.has(t.id)).map((t) => ({ kind: 'trade', date: t.date, t })));
  const openCond = db.conditions().filter((c) => ['open', 'due'].includes(db.conditionStatus(c).key)).length;
  /* One shape for every move: an icon on the first line, the move itself, and
     the date on the right. A trade lists each side with what it received, so
     the card says who got what rather than a pile of assets under two names. */
  /* A trade on Home is one line per side, however many assets it moved: the
     side's headline asset -- a player before a pick, a pick before FAAB -- and
     a count of the rest. The whole deal is one tap away on Transactions. */
  const kindOf = (a) => a.pick || isPickText(a.label) ? 1 : a.faab != null || /\bFAAB\b/i.test(a.label) ? 2 : 0;
  const ranked = (rs) => rs.map(normalize).map((a, i) => ({ a, i, k: kindOf(a) }))
    .sort((x, y) => x.k - y.k || x.i - y.i);
  // the count opens the rest where you are, rather than sending you away for it
  const more = (rest) => !rest.length ? '' : `<button class="hm-more" type="button"
    data-info="${esc(rest.map((x) => x.a.label).join('\n'))}" aria-label="${rest.length} more: ${
    esc(rest.map((x) => x.a.label).join(', '))}">+${rest.length}</button>`;
  const asset = ({ a, k }) => `${k === 0 ? posChip(db.position(a.label)) + ' ' : ''}${esc(a.label)}`;
  const moveRow = (m) => {
    if (m.kind === 'trade') {
      return `<div class="row hm-mv hm-tr" role="link" tabindex="0" data-go="trades" data-at="trade-${esc(m.t.id)}">
        <span class="hm-ic">${icon('swap')}</span>
        <div class="grow hm-sides">${m.t.sides.map((sd) => `<div class="hm-side">
          <b>${nm(sd.team)}</b><span>${(() => {
            const [first, ...rest] = ranked(sd.receives);
            return first ? `${asset(first)} ${more(rest)}` : '';
          })()}</span></div>`).join('')}</div>
        <span class="hm-date">${fmtDate(m.date)}</span></div>`;
    }
    // as on the Transactions page: who and when under the player, what it
    // cost on the right
    const w = m.w;
    return `<div class="row hm-mv hm-pk"><span class="hm-ic plus">+</span>
      <div class="grow"><div class="t">${posChip(db.position(w.player))} ${esc(w.player)}</div>
        <div class="s">${nm(w.team)} &ndash; ${fmtDate(m.date)}</div></div>
      ${w.type === 'free_agent' ? '<span class="chip ghost hm-cost">FA</span>'
        : `<b class="hm-cost hm-bid">${money(w.faab || 0)}</b>`}</div>`;
  };
  const movesCard = `
  <div class="hm-moves">
    ${hd('Latest moves', 'trades', 'Transactions', 'swap')}
    ${/* two cards a small step apart, not two labelled groups in one: the split
         reads without headers costing the column their height */''}
    ${pickups.length ? `<div class="card"><div class="card-bd flush">
      <div class="rows">${pickups.map(moveRow).join('')}</div></div></div>` : ''}
    ${deals.length || openCond ? `<div class="card"><div class="card-bd flush">
      <div class="rows">${deals.map(moveRow).join('')}</div>
      ${openCond ? `<div class="hm-cond">${icon('lock')} ${openCond} open conditional trade${openCond === 1 ? '' : 's'}</div>` : ''}
    </div></div>` : ''}
    ${pickups.length || deals.length || openCond ? ''
      : '<div class="card"><div class="card-bd hm-sub">Nothing yet this season</div></div>'}
  </div>`;

  /* ---- empire race ---- */
  const emp = db.empire();
  const empire = `
  <div class="hm-emp">
    ${hd('Empire race', 'empire', 'Empire', 'crown')}
    <div class="card"><div class="card-bd flush">
      <div class="hm-pot"><span class="hm-big violet">${money(emp.pot)}</span>
        <span class="hm-sub">${emp.claimed ? 'claimed' : `${emp.titlesToWin} titles, or a title and ${emp.threshold} pts`}</span></div>
      <div class="rows">${emp.board.slice(0, 4).map((t) => `<div class="row hm-er">
        ${teamTag(t)}<div class="grow"><div class="meter violet"><i style="width:${(t.pct * 100).toFixed(1)}%"></i></div></div>
        <b class="hm-pts">${t.total}</b>
        ${/* as on the Empire page: a crown per title needed, earned ones gold */''}
        <span class="hm-crowns">${Array.from({ length: Math.max(emp.titlesToWin, t.titles || 0) }, (_, i) =>
          icon('crown', i < (t.titles || 0) ? 'on' : 'off')).join('')}</span></div>`).join('')}</div>
    </div></div>
  </div>`;

  /* ---- the bank: one dial, its three claims, and anyone who owes ---- */
  const c = db.bankClaims();
  const owing = db.ledger().filter((t) => t.owesNow > 0).sort((a, b) => b.owesNow - a.owesNow);
  const bank = `
  <div class="hm-bank">
    ${hd('Bank', 'bank', 'Bank', 'wallet')}
    <div class="card"><div class="card-bd hm-bank-bd">
      <div class="hm-dial">
        ${gauge([{ key: 'free', value: c.free }, { key: 'owed', value: c.prizes }, { key: 'empire', value: c.empire }],
          `In the bank ${money(c.cash)}`)}
        <div class="gauge-val"><div class="big">${money(c.cash)}</div><div class="lbl">In the bank</div></div>
      </div>
      <div class="hm-claims">
        <div><i class="lg-free"></i><span>Free</span><b>${money(c.free)}</b></div>
        <div><i class="lg-owed"></i><span>Prizes</span><b>${money(c.prizes)}</b></div>
        <div><i class="lg-empire"></i><span>Empire</span><b>${money(c.empire)}</b></div>
      </div>
    </div>
    ${owing.length ? `<div class="hm-owe">${owing.map((t) => `<span>${nm(t.number)} <b>${money(t.owesNow)}</b></span>`).join('')}</div>` : ''}
    </div>
  </div>`;

  /* ---- a rulebook that has changed since you last looked ---- */
  const diff = db.rulesDiff(S);
  const sig = rulesSignature(diff);
  const rules = diff?.count && rulesSeen(S) !== sig ? `
  <button class="hm-rules" data-go="rules" data-tab="changes">${icon('book')}
    <span><b>${diff.count}</b> rule change${diff.count === 1 ? '' : 's'} for ${S}</span>${icon('chev')}</button>` : '';

  return `
  <div class="view-hd hm-title"><h2>Home</h2><span class="chip stage">${esc(db.seasonStage(S))}</span></div>
  ${rules}
  ${recap}
  ${/* Two rows on a desktop: race and guillotine beside the game and the moves,
       then empire beside the bank. Each row's two sides end on one line, so no
       edge lands a few pixels off its neighbour. On a phone the rows dissolve
       and the blocks read in priority order. */''}
  <div class="hm-grid">
    <div class="hm-col">${race}${guil}</div>
    <div class="hm-col">${game}${movesCard}</div>
    <div class="hm-col">${empire}</div>
    <div class="hm-col">${bank}</div>
  </div>`;
}

export const mount = (root, db, go) => {
  // Home shows the current season, so land there too, not on whichever year
  // the other tabs were last browsing
  const S = db.league.currentSeason ?? db.season;
  root.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      if (db.season !== S) db.season = S;
      go(b.dataset.go, { at: b.dataset.at, tab: b.dataset.tab });
    }));
  // a trade row is a link to that trade; Enter follows it like one
  root.querySelectorAll('.hm-tr').forEach((r) => r.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') r.click();
  }));
};
