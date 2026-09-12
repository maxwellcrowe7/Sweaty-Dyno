import { money, esc, icon, teamTag, openModal, teamOptions, toast, pts, info } from '../util.js';
import { SEASON_WEEKS } from '../db.js';

const PLACES = { 1: 'Winner', 2: 'Runner-up', 3: 'Third' };

const PLACE_LABEL = { 1: 'Winner', 2: 'Runner-up', 3: 'Third' };
const SUMMARY_MAX = 48;

/* Which minigames are expanded — module scope so an edit does not close them. */
const MG_OPEN = new Set();

const phaseLabel = (g) => g.phase === 'week' ? `WK ${g.week}` : g.phase === 'pre' ? 'PRE' : 'POST';

const slotLabel = (g) => g.phase === 'week' ? `Week ${g.week}`
  : g.phase === 'pre' ? 'Preseason' : 'Post-season';

/** Keep the stored slate in playing order, so the raw file reads like the page. */
function sortSlate(games) {
  const rank = { pre: 0, week: 1, post: 2 };
  const ord = (g) => (g.phase === 'week' ? g.week : g.order) ?? 0;
  games.sort((a, b) => rank[a.phase] - rank[b.phase] || ord(a) - ord(b));
}

/** Is there anything in this slot worth keeping? A blank one is just a slot. */
const filledIn = (g) => Boolean(g.name || g.rules || g.results?.['1']?.team
  || g.status === 'canceled' || g.status === 'guillotine');

/**
 * Status is worked out, never chosen. Nothing written down means no minigame
 * that week; something written down but no winner means undecided; a winner
 * means decided. The guillotine pointer is the one status set from elsewhere.
 */
const deriveStatus = (g) => g.status === 'guillotine' ? 'guillotine'
  : !(g.name || g.rules) ? 'none'
  : g.results?.['1']?.team ? 'final'
  : 'scheduled';

/** Name and its one-line summary on one line, then who won and what it paid. */
function gameRow(db, g, S, admin) {
  const blank = g.status === 'none';
  const pointer = g.status === 'guillotine';
  const canceled = g.status === 'canceled';
  const win = g.results?.['1'];
  const winner = win?.team ? db.team(win.team)?.manager : null;
  const prize = Number(g.payout?.['1']) || 0;
  const open = MG_OPEN.has(g.id);
  // an empty slot is still worth opening if you are the one who can fill it in
  const detail = !pointer && (admin || g.rules || win?.value
    || g.results?.['2']?.team || g.results?.['3']?.team);

  const title = pointer ? 'Guillotine'
    : g.name ? esc(g.name)
    : blank ? (g.phase === 'week' ? 'No minigame this week' : 'Not running')
    : 'Not set yet';

  return `<div class="mg${open ? ' open' : ''}${blank || pointer || canceled ? ' quiet' : ''}">
    <button class="mg-hd" ${detail ? `data-mg="${esc(g.id)}"` : 'disabled'}>
      <span class="mg-wk">${phaseLabel(g)}</span>
      <span class="mg-name">
        <span class="mg-title${g.name && !blank ? '' : ' unset'}">${title}</span>
        ${g.summary && !blank ? `<span class="mg-sum">${esc(g.summary)}</span>` : ''}
      </span>
      ${canceled ? '<span class="chip red">Cancelled</span>'
        : pointer ? '<span class="chip heat">below</span>'
        : winner ? `<span class="mg-win">${esc(winner)}</span>`
        : blank ? ''
        : '<span class="mg-win none">&mdash;</span>'}
      <span class="mg-prize${prize && winner ? ' won' : ''}">${prize ? money(prize) : ''}</span>
      ${detail ? icon('chev', 'acc-caret') : '<span class="mg-nochev"></span>'}
    </button>
    ${detail ? `<div class="mg-bd">
      ${g.rules ? `<p class="mg-rules">${esc(g.rules)}</p>` : ''}
      ${blank && admin && !g.rules ? '<p class="mg-rules dimmer">Nothing set for this week yet.</p>' : ''}
      ${!blank ? `<ul class="mg-places">
        ${['1', '2', '3'].map((pl) => {
          const r = g.results?.[pl];
          const pay = Number(g.payout?.[pl]) || 0;
          if (!r?.team && !pay) return '';
          // The prize is already on the collapsed row, so showing it again here
          // would just be the same number twice. Runner-up money is not up there.
          const showPay = pl !== '1' && pay;
          return `<li>
            <span class="pl">${PLACE_LABEL[pl]}</span>
            <span class="who">
              ${r?.team ? teamTag(db.team(r.team)) : '<span class="dimmer">not decided</span>'}
              ${r?.value ? `<span class="val">${esc(r.value)}</span>` : ''}
            </span>
            ${showPay ? `<b>${money(pay)}</b>` : ''}
          </li>`;
        }).join('')}
      </ul>` : ''}
      ${admin ? `<div class="mg-edit"><button class="btn sm" data-edit="${esc(g.id)}">${
        icon(g.name ? 'pencil' : 'plus')} ${g.name ? 'Edit' : 'Add a minigame'}</button></div>` : ''}
    </div>` : ''}
  </div>`;
}

/* Which guillotine weeks are expanded — module scope so an edit does not close them. */
const GUIL_OPEN = new Set();

function guillotineCard(db, G, S, admin) {
  if (!G) return admin ? `<div class="card"><div class="card-bd" style="text-align:center">
    <div class="s dim" style="font-size:12.5px;margin-bottom:11px">No guillotine set up for ${S}.</div>
    <button class="btn" data-editguil>${icon('blade')} Add the guillotine</button></div></div>` : '';

  const run = db.guillotineRun(S);
  const alive = run.survivors.length;
  const pct = run.entrants.length > 1 ? run.chopped / (run.entrants.length - 1) : 0;

  return `
  <div class="card">
    <div class="card-hd">
      ${icon('blade')}
      <div><h3>Guillotine</h3><div class="sub">wk ${run.startWeek}&ndash;${run.lastWeek} &middot; ${run.entrants.length} in</div></div>
      <div class="spacer"></div>
      <span class="chip ${run.winner ? 'gold' : 'heat'}">${money(G.payout?.['1'] || 0)}</span>
      ${admin ? `<button class="btn sm ghost" data-editguil>${icon('pencil')}</button>` : ''}
    </div>
    <div class="card-bd" style="padding-bottom:12px">
      <div class="s dim" style="font-size:12.5px;line-height:1.55">${esc(G.rules || '')}</div>
      <div style="display:flex;gap:10px;margin-top:12px;align-items:center">
        <div class="meter" style="flex:1"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
        <span class="chip ${run.winner || alive === 1 ? 'gold' : 'mint'}">${
          run.winner ? 'Decided' : `${alive} alive`}</span>
      </div>
    </div>

    <div class="card-bd flush"><div class="guil-weeks">
      ${run.weeks.map((w) => {
        const key = `${S}:${w.week}`;
        const open = GUIL_OPEN.has(key);
        const isFinal = w.week === run.lastWeek && w.settled;
        return `<div class="gw${open ? ' open' : ''}">
          <button class="gw-hd" data-gweek="${key}">
            ${icon('chev', 'acc-caret')}
            <span class="wk">W${w.week}</span>
            <div class="grow">
              ${w.settled ? `<div class="gw-out">${esc(db.team(w.chopped)?.manager ?? '')} chopped${
                    w.forced ? ' <span class="chip red" style="margin-left:6px">forced</span>'
                    : w.tied ? ' <span class="chip gold" style="margin-left:6px">tie</span>' : ''}</div>
                  ${isFinal && run.winner ? `<div class="gw-win">${icon('crown')} ${esc(db.team(run.winner)?.manager ?? '')} survives</div>` : ''}`
                : `<div class="gw-wait">${w.waiting ? 'Awaiting scores' : 'Not played'}</div>`}
            </div>
            <span class="gw-score">${w.settled ? pts(w.scores[0].points) : `${w.scores.length} left`}</span>
          </button>
          <div class="gw-bd">
            <ol class="gw-scores">
              ${w.scores.map((x, i) => `<li class="${x.chopped ? 'out' : ''}">
                <span class="rank">${i + 1}</span>
                <span class="who">${teamTag(db.team(x.team))}</span>
                <b>${x.points == null ? '&mdash;' : pts(x.points)}</b>
              </li>`).join('')}
            </ol>
            ${admin && w.scores.length > 1 ? `<div class="gw-force">
              <label>Override the chop</label>
              <select data-force="${key}">
                <option value="">Lowest score (${esc(db.team(w.scores[0].team)?.manager ?? '')})</option>
                ${w.scores.map((x) => `<option value="${x.team}" ${w.forced && w.chopped === x.team ? 'selected' : ''}>${
                  esc(db.team(x.team)?.manager ?? '')}</option>`).join('')}
              </select>
            </div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div></div>

    ${run.winner ? `<div class="card-bd" style="border-top:1px solid var(--line-soft)">
      <div class="banner" style="background:rgba(245,196,81,.08);border-color:rgba(245,196,81,.3)">
        ${icon('crown')}<div>Last one standing: <b style="color:var(--gold)">${esc(db.team(run.winner)?.manager ?? '')}</b>
        takes ${money(G.payout?.['1'] || 0)}.</div></div>
    </div>` : `<div class="card-bd" style="border-top:1px solid var(--line-soft)">
      <div class="s dim" style="font-size:12px">Chops are worked out from the weekly scores, so this fills in
      on its own as ${S} is synced.</div></div>`}
  </div>`;
}

export function render(db) {
  const S = db.season;
  const s = db.minigames(S);
  const spend = db.minigameSpend(S);
  const admin = db.isAdmin;
  const phases = db.minigamePhases(S);
  // Every week is a slot, but only a slot with a minigame in it is one to play.
  const live = phases.flatMap((ph) => ph.games)
    .filter((g) => g.name && g.status !== 'canceled' && g.status !== 'guillotine');
  const done = live.filter((g) => g.status === 'final').length;

  return `
  <div class="tiles">
    <div class="tile accent"><div class="k">Allocated${info(
      `What every prize on this season's slate adds up to. It is not a limit — it moves as you add or change minigames.`)}</div>
      <div class="v">${money(spend.committed)}</div>
      <div class="m">${spend.budget
        ? (spend.unallocated > 0 ? `${money(spend.unallocated)} of ${money(spend.budget)} unallocated`
          : spend.unallocated < 0 ? `${money(-spend.unallocated)} over the ${money(spend.budget)} allowance`
          : `all of ${money(spend.budget)} allocated`)
        : `${S} minigames`}</div></div>
    <div class="tile mint"><div class="k">Awarded</div><div class="v">${money(spend.paid)}</div>
      <div class="m">${done} settled</div></div>
    <div class="tile"><div class="k">Still up</div><div class="v">${money(spend.remaining)}</div>
      <div class="m">${live.length - done} to play</div></div>
    <div class="tile gold"><div class="k">Guillotine</div>
      <div class="v">${money(s.guillotine?.payout?.['1'] || 0)}</div>
      <div class="m">${s.guillotine ? `from week ${s.guillotine.startWeek}` : 'not set up'}</div></div>
  </div>

  ${spend.budget && spend.unallocated !== 0 ? `<div class="banner" style="margin-top:14px;${
    spend.unallocated < 0 ? 'background:rgba(255,77,94,.07);border-color:rgba(255,77,94,.26)' : ''}">
    ${icon('alert')}<div>${spend.unallocated > 0
      ? `${money(spend.unallocated)} of the ${money(spend.budget)} minigame allowance is not attached to a prize yet.`
      : `The slate is ${money(-spend.unallocated)} over the ${money(spend.budget)} allowance.`}</div></div>` : ''}

  ${admin ? `<div class="mg-actions">
    <button class="btn sm" data-setup>${icon('cog')} Season setup</button>
    <button class="btn sm" data-addgame="pre">${icon('plus')} Preseason</button>
    <button class="btn sm" data-addgame="post">${icon('plus')} Post-season</button>
  </div>` : ''}

  ${phases.map((ph) => {
    // The weekly slate is always there — weeks 1–18, filled in or not. Preseason
    // and post-season only show up once something has been put in them.
    if (!ph.games.length) return '';
    return `<div class="section-title">${ph.title}</div>
      <div class="card"><div class="card-bd flush"><div class="mg-list">
        ${ph.games.map((g) => gameRow(db, g, S, admin)).join('')}
      </div></div></div>`;
  }).join('')}

  <div class="section-title">Elimination</div>
  ${guillotineCard(db, s.guillotine, S, admin)}
  `;
}

export function mount(root, db) {
  const S = db.season;
  const teams = db.teams(S);

  /* minigame rows expand in place */
  root.querySelectorAll('[data-mg]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.mg;
    MG_OPEN.has(id) ? MG_OPEN.delete(id) : MG_OPEN.add(id);
    b.closest('.mg').classList.toggle('open', MG_OPEN.has(id));
  }));

  /* guillotine week rows expand in place */
  root.querySelectorAll('[data-gweek]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.gweek;
    GUIL_OPEN.has(k) ? GUIL_OPEN.delete(k) : GUIL_OPEN.add(k);
    b.closest('.gw').classList.toggle('open', GUIL_OPEN.has(k));
  }));

  root.querySelectorAll('[data-force]').forEach((sel) => sel.addEventListener('change', async () => {
    const wk = Number(sel.dataset.force.split(':')[1]);
    const team = sel.value ? Number(sel.value) : null;
    await db.update('minigames', (m) => {
      const g = m.seasons[String(S)].guillotine;
      g.overrides = (g.overrides || []).filter((o) => o.week !== wk);
      if (team) g.overrides.push({ week: wk, team });
    });
    toast(team ? `Week ${wk} chop forced` : `Week ${wk} back to the lowest score`);
  }));

  /* ---------- season setup, all on this tab ---------- */
  root.querySelectorAll('[data-setup]').forEach((b) => b.addEventListener('click', () => {
    const cur = db.minigames(S);
    const d0 = db.get('minigames').defaults || {};
    openModal({
      title: `${S} season setup`,
      confirm: 'Save',
      body: `<div class="s dim" style="font-size:12.5px;line-height:1.6;margin-bottom:13px">
          The weekly slate is always weeks 1&ndash;${SEASON_WEEKS} &mdash; a week with nothing in it
          costs nothing. This is for the extras either side of it, and the house defaults.</div>
        <div class="fgrid" style="grid-template-columns:repeat(2,1fr)">
          <div class="field"><label>Preseason</label>
            <input name="pre" type="number" min="0" max="20" inputmode="numeric"
              value="${cur.games.filter((g) => g.phase === 'pre').length || d0.preseason || 0}"></div>
          <div class="field"><label>Post-season</label>
            <input name="post" type="number" min="0" max="20" inputmode="numeric"
              value="${cur.games.filter((g) => g.phase === 'post').length || d0.postseason || 0}"></div>
        </div>
        <div class="field"><label>Default payout</label>
          <input name="pay" type="number" min="0" inputmode="numeric"
            value="${d0.weeklyPayout?.['1'] ?? 10}"></div>
        <div class="field"><label>Guillotine starts week (blank for none)</label>
          <input name="guil" type="number" min="1" max="${SEASON_WEEKS}" inputmode="numeric"
            value="${cur.guillotine?.startWeek ?? ''}"></div>`,
      onConfirm: async (f) => {
        const want = { pre: Math.max(0, +f.pre || 0), post: Math.max(0, +f.post || 0) };
        const pay = Math.max(0, +f.pay || 0);
        const guil = f.guil ? Math.max(1, +f.guil) : null;
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, legacy: null });
          for (const g of sn.games) g.phase ||= 'week';
          // Weeks are never created or removed here — the slate is always 1–18.
          // A week left blank is simply dropped, so it costs and stores nothing.
          sn.games = sn.games.filter((g) => g.phase !== 'week' || filledIn(g));
          for (const phase of ['pre', 'post']) {
            const mine = sn.games.filter((g) => g.phase === phase);
            const n = want[phase];
            // add the missing ones; anything already filled in is left alone
            for (let i = 1; i <= n; i++) {
              if (mine.some((g) => g.order === i)) continue;
              sn.games.push({
                id: `${S}-${phase}${String(i).padStart(2, '0')}`,
                phase, week: null, order: i,
                name: null, summary: null, rules: null, payout: { 1: pay, 2: 0, 3: 0 },
                status: 'scheduled', results: { 1: null, 2: null, 3: null },
              });
            }
            // trim only the empty tail, never something with a result
            sn.games = sn.games.filter((g) => g.phase !== phase || g.order <= n || filledIn(g));
            // Reset anything still blank back to an empty slot at no cost.
            // A slot with a name or a winner is left completely alone.
            for (const g of sn.games) {
              if (g.phase !== phase || filledIn(g)) continue;
              g.status = 'none';
              g.payout = { 1: 0, 2: 0, 3: 0 };
              g.summary = null;
              g.rules = null;
            }
          }
          const ord = (g) => (g.phase === 'week' ? g.week : g.order) ?? 0;
          const rank = { pre: 0, week: 1, post: 2 };
          sn.games.sort((a, b) => rank[a.phase] - rank[b.phase] || ord(a) - ord(b));
          if (guil && !sn.guillotine) {
            sn.guillotine = { id: `${S}-guillotine`, startWeek: guil, name: 'Guillotine',
              rules: 'Lowest scoring manager is chopped every week until one remains.',
              payout: { 1: pay }, status: 'scheduled',
              entrants: db.teams(S).map((t) => t.number), overrides: [], winner: null };
          } else if (guil && sn.guillotine) {
            sn.guillotine.startWeek = guil;
          } else if (!guil) sn.guillotine = null;
        });
        toast(`${S} slate ready`);
      },
    });
  }));

  /* Weeks are never added — they are all there already. Only the extras
     either side of the season are a list you can grow. */
  root.querySelectorAll('[data-addgame]').forEach((b) => b.addEventListener('click', async () => {
    const phase = b.dataset.addgame;
    const pay = db.get('minigames').defaults?.weeklyPayout?.['1'] ?? 10;
    const same = db.minigames(S).games.filter((g) => g.phase === phase);
    const n = Math.max(0, ...same.map((g) => g.order || 0)) + 1;
    await db.update('minigames', (m) => {
      const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, legacy: null });
      sn.games.push({
        id: `${S}-${phase}${String(n).padStart(2, '0')}-${Date.now().toString(36)}`,
        phase, week: null, order: n,
        name: null, summary: null, rules: null, payout: { 1: pay, 2: 0, 3: 0 },
        status: 'scheduled', results: { 1: null, 2: null, 3: null },
      });
    });
    toast(`${phase === 'pre' ? 'Preseason' : 'Post-season'} minigame added`);
  }));

  root.querySelector('[data-editguil]')?.addEventListener('click', () => {
    const G = db.minigames(S).guillotine;
    const modal = openModal({
      title: 'Guillotine',
      confirm: 'Save',
      body: `<div class="field"><label>Rules</label><textarea name="rules">${esc(G?.rules
          || 'Lowest scoring manager is chopped every week until one remains.')}</textarea></div>
        <div class="fgrid">
          <div class="field"><label>Starts week</label>
            <input name="start" type="number" min="1" inputmode="numeric" value="${G?.startWeek ?? 1}"></div>
          <div class="field"><label>Last chop</label>
            <input value="week ${(G?.startWeek ?? 1) + db.teams(S).length - 2}" disabled style="opacity:.55"></div>
        </div>
        <div class="s dim" style="font-size:12px;margin:-4px 0 12px;line-height:1.5">
          One chop a week until a single manager is left, so ${db.teams(S).length} managers means
          ${db.teams(S).length - 1} chops &mdash; the last week follows from the start week.</div>
        <div class="field"><label>Payout</label>
          <input name="pay" type="number" min="0" inputmode="numeric" value="${G?.payout?.['1'] ?? 10}"></div>
        ${G ? `<div class="modal-del">
          <button type="button" class="btn sm danger" data-delguil>${icon('x')} Remove the guillotine</button>
          <span>Takes it off the ${S} slate entirely.</span>
        </div>` : ''}`,
      onConfirm: async (f) => {
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, legacy: null });
          sn.guillotine = {
            ...(sn.guillotine || { id: `${S}-guillotine`, name: 'Guillotine', status: 'scheduled',
                                   entrants: db.teams(S).map((t) => t.number), eliminations: [], winner: null }),
            rules: f.rules.trim() || null,
            startWeek: Math.max(1, +f.start || 1),
            payout: { 1: Math.max(0, +f.pay || 0) },
          };
        });
        toast('Guillotine saved');
      },
    });

    modal.root.querySelector('[data-delguil]')?.addEventListener('click', async () => {
      modal.close();
      await db.update('minigames', (m) => {
        const sn = m.seasons[String(S)];
        if (sn) sn.guillotine = null;
      });
      toast('Guillotine removed');
    });
  });



  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    // The slate, not the stored games — an untouched week only exists on the slate.
    const g = db.minigamePhases(S).flatMap((ph) => ph.games).find((x) => x.id === b.dataset.edit);
    if (!g) return;
    const r = (p) => g.results?.[p] || {};
    // An untouched slot carries no prize yet, so offer the house default rather
    // than making the winner's $ be typed in every single week.
    const house = db.get('minigames').defaults?.weeklyPayout?.['1'] ?? 10;
    const pay = (p) => Number(g.payout?.[p]) || (p === '1' && !filledIn(g) ? house : 0);

    const modal = openModal({
      title: `${slotLabel(g)} minigame`,
      confirm: 'Save',
      body: `
        <div class="field"><label>Minigame</label>
          <input name="name" value="${esc(g.name || '')}" placeholder="e.g. Closest to the Number"></div>
        <div class="field"><label>Summary <span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink-3)">&mdash; one line, shown on the row</span></label>
          <input name="summary" value="${esc(g.summary || '')}" maxlength="${SUMMARY_MAX}"
            placeholder="e.g. Highest scoring manager off the bat"></div>
        <div class="field"><label>Rules / notes</label>
          <textarea name="rules" placeholder="How it's won${
            g.phase !== 'week' ? ' — league vote is fine' : ''}">${esc(g.rules || '')}</textarea></div>
        <div class="s dim" style="font-size:12px;margin:-6px 0 12px;line-height:1.5">
          Leave the name and rules blank and there is no minigame ${
            g.phase === 'week' ? 'that week' : 'in this slot'} &mdash; no prize, no winner.
          Fill them in and it is undecided until you name a winner below.</div>
        <div class="section-title" style="margin-top:6px">Payout</div>
        <div class="fgrid" style="grid-template-columns:repeat(3,1fr)">
          ${['1', '2', '3'].map((p) => `<div class="field"><label>${PLACES[p]} $</label>
            <input name="pay${p}" type="number" min="0" step="1" inputmode="numeric" value="${pay(p)}"></div>`).join('')}
        </div>
        <div class="section-title" style="margin-top:2px">Result</div>
        ${['1', '2', '3'].map((p) => `
          <div class="fgrid" style="grid-template-columns:1fr 1fr">
            <div class="field"><label>${PLACES[p]}</label>
              <select name="team${p}">${teamOptions(teams, r(p).team ?? '')}</select></div>
            <div class="field"><label>What won it</label>
              <input name="val${p}" value="${esc(r(p).value || '')}" placeholder="player / score / note"></div>
          </div>`).join('')}
        ${filledIn(g) ? `<div class="modal-del">
          <button type="button" class="btn sm danger" data-del>${icon('x')} Delete this minigame</button>
          <span>${g.phase === 'week' ? `Week ${g.week} stays on the slate, empty.` : 'Removes the slot.'}</span>
        </div>` : ''}`,
      onConfirm: async (d) => {
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, legacy: null });
          // A week you have never touched is not stored yet — filling it in is
          // what brings it into the file, and saving a blank one over a blank
          // one is a no-op rather than a new empty record.
          let gg = sn.games.find((x) => x.id === g.id);
          if (!gg) {
            if (!(d.name.trim() || d.rules.trim() || d.team1 || d.team2 || d.team3)) return;
            gg = { ...g };
            sn.games.push(gg);
            sortSlate(sn.games);
          }
          gg.name = d.name.trim() || null;
          gg.summary = d.summary.trim().slice(0, SUMMARY_MAX) || null;
          gg.rules = d.rules.trim() || null;
          gg.payout = { 1: +d.pay1 || 0, 2: +d.pay2 || 0, 3: +d.pay3 || 0 };
          gg.results = {};
          for (const p of ['1', '2', '3'])
            gg.results[p] = d[`team${p}`] ? { team: +d[`team${p}`], value: d[`val${p}`].trim() || null } : null;
          gg.status = deriveStatus(gg);
          // Nothing written down means no minigame, so nothing is set aside for
          // it and nobody won it — otherwise an empty week could still hold money.
          if (gg.status === 'none') {
            gg.payout = { 1: 0, 2: 0, 3: 0 };
            gg.results = { 1: null, 2: null, 3: null };
            // an emptied week is back to being just a slot, so stop storing it
            if (gg.phase === 'week') sn.games = sn.games.filter((x) => x.id !== gg.id);
          }
        });
        toast(`${slotLabel(g)} saved`);
      },
    });

    /* Deleting empties the slot. For a week that is all it does — the week
       itself is part of the season and stays on the slate. */
    modal.root.querySelector('[data-del]')?.addEventListener('click', async () => {
      modal.close();
      await db.update('minigames', (m) => {
        const sn = m.seasons[String(S)];
        if (sn) sn.games = sn.games.filter((x) => x.id !== g.id);
      });
      toast(g.phase === 'week' ? `Week ${g.week} cleared` : 'Minigame removed');
    });
  }));






}
