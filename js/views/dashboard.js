import { money, esc, icon, teamTag, fmtDate, pts, gauge, posChip } from '../util.js';

/* ============================================================
   HOME
   One glance at every tab that changes week to week: big figures, few
   words, and a way through to the page each block comes from. Nothing
   here is new data -- it is the headline of somewhere else.
   ============================================================ */

/* The block header: what it is, and the tab it came from. Not a
   .section-title, so the app's collapse wiring leaves it alone -- a home
   page that folds away is not a glance. */
const hd = (label, to, tab, ic) => `<div class="hm-hd"><span>${label}</span>
  <button class="hm-go" data-go="${to}">${icon(ic)}${tab}</button></div>`;

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
  ${hd(`Week ${wk}`, 'stats', 'Stats', 'chart')}
  <div class="tiles hl-tiles">
    <div class="tile accent"><div class="k">Top score</div>
      <div class="v">${pts(h.top.points)}</div><div class="m">${nm(h.top.team)}</div></div>
    <div class="tile red"><div class="k">Low score</div>
      <div class="v">${pts(low.points)}</div><div class="m">${nm(low.team)}</div></div>
    <div class="tile mint"><div class="k">Blowout</div>
      <div class="v">${h.blowout ? '+' + pts(h.blowout.margin) : '&mdash;'}</div>
      <div class="m">${h.blowout ? `${nm(h.blowout.team)} over ${nm(h.blowout.opponent)}` : ''}</div></div>
    <div class="tile gold"><div class="k">Closest</div>
      <div class="v">${h.closest ? pts(h.closest.margin) : '&mdash;'}</div>
      <div class="m">${h.closest ? `${nm(h.closest.team)} over ${nm(h.closest.opponent)}` : ''}</div></div>
  </div>`;

  /* ---- playoff race: the six in, and the two nearest out ---- */
  const po = db.playoffSeeds(S);
  const inn = po.rows.filter((r) => r.in);
  const out = po.rows.filter((r) => !r.in).slice(0, 2);
  const race = !st.hasRecords ? '' : `
  <div class="hm-race">
    ${hd(po.decided ? 'Final seeds' : 'Playoff race', 'stats', 'Stats', 'chart')}
    <div class="card"><div class="card-bd flush"><div class="rows">
      ${inn.map((r, i) => `<div class="row hm-seed${i === inn.length - 1 ? ' cut' : ''}">
        <span class="hm-n">${r.seed}</span>${teamTag(r)}
        ${r.bye ? '<span class="seed-tag bye">BYE</span>' : ''}${r.how === 'points' ? '<span class="seed-tag">PTS</span>' : ''}
        <div class="grow"></div><b class="hm-rec">${r.wins}&ndash;${r.losses}</b></div>`).join('')}
      ${out.map((r) => `<div class="row hm-seed out">
        <span class="hm-n"></span>${teamTag(r)}<div class="grow"></div>
        <span class="hm-back">&minus;${pts(r.back)}</span><b class="hm-rec">${r.wins}&ndash;${r.losses}</b></div>`).join('')}
    </div></div></div>
  </div>`;

  /* ---- this week's minigame, and who took the last one ---- */
  const mg = db.minigames(S).games || [];
  const next = mg.find((g) => g.status !== 'final');
  const last = [...mg].filter((g) => g.status === 'final' && g.results?.['1']?.team)
    .sort((a, b) => (b.week ?? 0) - (a.week ?? 0))[0];
  const game = !next && !last ? '' : `
  <div class="hm-game">
    ${hd(next?.week ? `Week ${next.week} minigame` : 'Minigames', 'minigames', 'Games', 'dice')}
    <div class="card"><div class="card-bd hm-game-bd">
      ${next ? `<div><div class="hm-big mint">${money(next.payout?.['1'] || 0)}</div>
        <div class="hm-name">${esc(next.name || 'To be set')}</div>
        ${next.summary ? `<div class="hm-sub">${esc(next.summary)}</div>` : ''}</div>` : '<div class="hm-sub">Slate finished</div>'}
      ${last ? `<div class="hm-last"><span class="k">Wk ${last.week} winner</span><b>${nm(last.results['1'].team)}</b>
        <span>${esc(last.name || '')}</span></div>` : ''}
    </div></div>
  </div>`;

  /* ---- latest moves: trades and pickups together, newest first ---- */
  const { trades, waivers } = db.trades(S);
  const moves = [
    ...trades.map((t) => ({ kind: 'trade', date: t.date, t })),
    ...waivers.map((w) => ({ kind: 'move', date: w.date, w })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const openCond = db.conditions().filter((c) => ['open', 'due'].includes(db.conditionStatus(c).key)).length;
  const moveRow = (m) => {
    if (m.kind === 'trade') {
      const pieces = m.t.sides.flatMap((s) => s.receives).map((r) => r.label);
      return `<div class="row hm-mv"><span class="hm-ic">${icon('swap')}</span>
        <div class="grow"><div class="t">${m.t.sides.map((s) => nm(s.team)).join(' &harr; ')}</div>
          <div class="s">${esc(pieces.slice(0, 2).join(', '))}${pieces.length > 2 ? ` +${pieces.length - 2}` : ''}</div></div>
        <span class="hm-date">${fmtDate(m.date)}</span></div>`;
    }
    const w = m.w;
    return `<div class="row hm-mv"><span class="hm-ic plus">+</span>
      <div class="grow"><div class="t">${posChip(db.position(w.player))} ${esc(w.player)}</div>
        <div class="s">${nm(w.team)}${w.dropped ? ` &middot; drops ${esc(w.dropped)}` : ''}</div></div>
      <span class="hm-bid${w.type === 'free_agent' ? ' fa' : ''}">${w.type === 'free_agent' ? 'FA' : money(w.faab || 0)}</span></div>`;
  };
  const movesCard = `
  <div class="hm-moves">
    ${hd('Latest moves', 'trades', 'Transactions', 'swap')}
    <div class="card"><div class="card-bd flush">
      ${moves.length ? `<div class="rows">${moves.map(moveRow).join('')}</div>`
        : '<div class="card-bd hm-sub">Nothing yet this season</div>'}
      ${openCond ? `<div class="hm-cond">${icon('lock')} ${openCond} open conditional trade${openCond === 1 ? '' : 's'}</div>` : ''}
    </div></div>
  </div>`;

  /* ---- empire race ---- */
  const emp = db.empire();
  const empire = `
  <div class="hm-emp">
    ${hd('Empire race', 'empire', 'Empire', 'crown')}
    <div class="card"><div class="card-bd flush">
      <div class="hm-pot"><span class="hm-big violet">${money(emp.pot)}</span>
        <span class="hm-sub">${emp.claimed ? 'claimed' : `${emp.threshold} pts or ${emp.titlesToWin} titles`}</span></div>
      <div class="rows">${emp.board.slice(0, 4).map((t) => `<div class="row hm-er">
        ${teamTag(t)}<div class="grow"><div class="meter violet"><i style="width:${(t.pct * 100).toFixed(1)}%"></i></div></div>
        <b class="hm-pts">${t.total}</b></div>`).join('')}</div>
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
  <button class="hm-rules" data-go="rules">${icon('book')}
    <span><b>${diff.count}</b> rule change${diff.count === 1 ? '' : 's'} for ${S}</span>${icon('chev')}</button>` : '';

  return `
  <div class="view-hd hm-title"><h2>Home</h2><span class="chip stage">${esc(db.seasonStage(S))}</span></div>
  ${rules}
  ${recap}
  ${/* Two columns on a desktop, filled so they end near the same height; on a
       phone the columns dissolve and the blocks read in priority order */''}
  <div class="hm-grid">
    <div class="hm-col">${race}${empire}</div>
    <div class="hm-col">${game}${movesCard}${bank}</div>
  </div>`;
}

export const mount = (root, db, go) => {
  root.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => go(b.dataset.go)));
};
