import { money, esc, icon, teamTag, empty, openModal, teamOptions, toast, pts, info } from '../util.js';

const SUMMARY_MAX = 60;
/* Every week of the regular season is a line on the slate, game or no game. */
const WEEKS = 18;

/** The capped one-line summary, with room for a live count beside its label. */
const summaryField = (val, placeholder) => `<div class="field">
  <label class="has-count">Summary<span class="lbl-count" data-count></span></label>
  <input name="summary" value="${esc(val || '')}" maxlength="${SUMMARY_MAX}"
    placeholder="${esc(placeholder)}"></div>`;

/** Keep that count honest as you type. */
function liveCount(m) {
  const input = m.root.querySelector('input[name="summary"]');
  const out = m.root.querySelector('[data-count]');
  if (!input || !out) return;
  const show = () => {
    out.textContent = `${input.value.length}/${SUMMARY_MAX}`;
    out.classList.toggle('full', input.value.length >= SUMMARY_MAX);
  };
  input.addEventListener('input', show);
  show();
}

/* Which minigames are expanded — module scope so an edit does not close them. */
const MG_OPEN = new Set();

const phaseLabel = (g) => g.phase === 'week' ? `WK ${g.week}` : g.phase === 'pre' ? 'PRE' : 'POST';

const slotLabel = (g) => g.phase === 'week' ? `Week ${g.week}`
  : g.phase === 'pre' ? 'Preseason' : 'Post-season';

/** Is there anything in this slot at all? */
export const filled = (g) => Boolean(g.name || g.summary || g.rules
  || g.status === 'canceled' || g.results?.['1']?.team);

/** Status is never typed in — it follows from what has been filled in.
    Nothing entered -> no game that week; entered but no winner -> undecided;
    a winner -> decided. A slot cancelled in an earlier season stays cancelled. */
export function setStatus(g, was) {
  const entered = Boolean(g.name || g.summary || g.rules);
  const decided = Boolean(g.results?.['1']?.team);
  if (!entered && !decided) {
    g.status = 'none';
    g.payout = { 1: 0, 2: 0, 3: 0 };   // an empty slot costs the season nothing
    return;
  }
  g.status = was === 'canceled' ? 'canceled' : decided ? 'final' : 'scheduled';
}

/** Name and its short summary on one line, then who won and what it paid. */
function gameRow(db, g, S, admin) {
  const empty = g.status === 'none';
  const pointer = g.status === 'guillotine';
  const canceled = g.status === 'canceled';
  const win = g.results?.['1'];
  const winner = win?.team ? db.team(win.team)?.manager : null;
  const prize = Number(g.payout?.['1']) || 0;
  const open = MG_OPEN.has(g.id);
  // Expand only when there is something to read — the pencil on the row is how an
  // admin gets in, so an empty slot no longer has to open to offer a way to fill it.
  const detail = !pointer && !empty && (g.rules || win?.team || prize);

  const title = pointer ? 'Guillotine'
    : g.name ? esc(g.name)
    : empty ? (g.phase === 'week' ? 'No minigame this week' : 'Not running')
    : 'Not set yet';

  return `<div class="mg${open ? ' open' : ''}${empty || pointer || canceled ? ' quiet' : ''}">
    <div class="mg-hd"${detail
      ? ` role="button" tabindex="0" aria-expanded="${open}" data-mg="${esc(g.id)}"` : ''}>
      <span class="mg-wk">${phaseLabel(g)}</span>
      <span class="mg-main">
        <span class="mg-title${g.name && !empty ? '' : ' unset'}">${title}</span>
        ${g.summary && !empty ? `<span class="mg-sum">${esc(g.summary)}</span>` : ''}
      </span>
      ${admin && !pointer ? `<button class="edit-pencil" data-edit="${esc(g.id)}"
        aria-label="${g.name ? 'Edit' : 'Add'} ${esc(slotLabel(g))} minigame"
        title="${g.name ? 'Edit' : 'Add a minigame'}">${icon(g.name ? 'pencil' : 'plus')}</button>` : ''}
      ${canceled ? '<span class="chip red">Cancelled</span>'
        : pointer ? '<span class="chip heat">below</span>'
        : winner ? `<span class="mg-win">${esc(winner)}</span>`
        : empty ? ''
        : '<span class="mg-win none">&mdash;</span>'}
      <span class="mg-prize${prize && winner ? ' won' : ''}">${prize ? money(prize) : ''}</span>
      ${detail ? icon('chev', 'acc-caret') : '<span class="mg-nochev"></span>'}
    </div>
    ${detail ? `<div class="mg-bd">
      ${g.rules ? `<p class="mg-rules">${esc(g.rules)}</p>` : ''}
      ${empty && admin && !g.rules ? '<p class="mg-rules dimmer">Nothing set for this week yet.</p>' : ''}
      ${!empty && (win?.team || prize) ? `<ul class="mg-places"><li>
        <span class="pl">Winner</span>
        <span class="who">${win?.team ? teamTag(db.team(win.team), { num: false })
          : '<span class="dimmer">not decided</span>'}</span>
        <span class="val">${win?.value ? esc(win.value) : ''}</span>
      </li></ul>` : ''}
    </div>` : ''}
  </div>`;
}

/* Which guillotine weeks are expanded — module scope so an edit does not close them. */
const GUIL_OPEN = new Set();
/* And whether the card itself is open. Collapsed by default, like a minigame row. */
const GUIL_CARD = new Set();

function guillotineCard(db, G, S, admin) {
  if (!G) return admin ? `<div class="card"><div class="card-bd" style="text-align:center">
    <div class="s dim" style="font-size:12.5px;margin-bottom:11px">No guillotine set up for ${S}.</div>
    <button class="btn" data-editguil>${icon('blade')} Add the guillotine</button></div></div>` : '';

  const run = db.guillotineRun(S);
  const alive = run.survivors.length;
  const cardOpen = GUIL_CARD.has(S);

  /* Who is left, at a glance: still-in pills sit left, chopped ones fall to the
     right — most recent chop first, so the pool drains rightward as the run goes. */
  const chopWeek = new Map(run.weeks.filter((w) => w.settled).map((w) => [w.chopped, w.week]));
  const pool = [...run.entrants].sort((a, b) => {
    const ca = chopWeek.get(a), cb = chopWeek.get(b);
    if (ca == null && cb == null) return a - b;
    if (ca == null) return -1;
    if (cb == null) return 1;
    return cb - ca;
  });

  return `
  <div class="card guil${cardOpen ? ' open' : ''}">
    <div class="card-hd">
      <div class="guil-toggle" role="button" tabindex="0"
        aria-expanded="${cardOpen}" data-guiltoggle>
        ${icon('blade')}
        <div class="guil-main"><h3>Guillotine</h3>
          ${G.summary ? `<span class="mg-sum">${esc(G.summary)}</span>` : ''}</div>
        ${admin ? `<button class="edit-pencil" data-editguil aria-label="Edit the guillotine"
          title="Edit">${icon('pencil')}</button>` : ''}
        <span class="gap"></span>
        <span class="chip ${run.winner || alive === 1 ? 'gold' : 'mint'}">${
          run.winner ? 'Decided' : `${alive} alive`}</span>
        <span class="mg-prize${run.winner ? ' won' : ''}">${money(G.payout?.['1'] || 0)}</span>
        ${icon('chev', 'acc-caret')}
      </div>
    </div>
    <div class="guil-bd">
    <div class="card-bd" style="padding-bottom:12px">
      <div class="s dim" style="font-size:12.5px;line-height:1.55">${esc(G.rules || '')}</div>
      <div class="guil-pool">
        ${pool.map((t) => {
          const wk = chopWeek.get(t);
          const cls = wk != null ? 'out' : t === run.winner ? 'win' : 'alive';
          return `<span class="gp ${cls}">${cls === 'win' ? icon('crown') : ''}${
            esc(db.team(t)?.manager ?? `T${t}`)}${wk != null ? `<span class="wk">W${wk}</span>` : ''}</span>`;
        }).join('')}
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
    </div>` : ''}
    </div>
  </div>`;
}

export function render(db) {
  const S = db.season;
  const s = db.minigames(S);
  const admin = db.isAdmin;
  const mb = db.minigameBreakdown(S);
  // the bar measures the season against its own slate, not against an allowance
  const pct = (v) => `${(v / (mb.allocated || 1) * 100).toFixed(2)}%`;

  return `
  <div class="card money">
    <div class="card-hd">
      <div class="grow"><h3>${S} minigames</h3></div>
      ${admin ? `<button class="btn sm ghost" data-setup aria-label="${S} season setup"
        title="Season setup">${icon('cog')}</button>` : ''}
    </div>
    <div class="card-bd">
      <div class="mb-top">
        <span class="mb-stat"><b class="mb-fig won">${money(mb.awarded)}</b><span class="mb-lbl">won</span></span>
        <span class="mb-div">/</span>
        <span class="mb-stat"><b class="mb-fig">${money(mb.allocated)}</b><span class="mb-lbl">total</span></span>
      ${/* Part-to-whole across the season's own slate. Each section is one block,
           split bright/dull at what it has paid out, so a half-run weekly slate
           reads as half-lit without needing a second chart. */''}
      <div class="mb-track" role="img" aria-label="${money(mb.awarded)} won of ${money(mb.allocated)}: ${
        mb.parts.filter((p) => p.allocated)
          .map((p) => `${p.title} ${money(p.awarded)} of ${money(p.allocated)}`).join(', ') || 'nothing yet'}">
        ${mb.parts.filter((p) => p.allocated > 0).map((p) => {
          const lit = p.awarded / p.allocated * 100;
          return `<span class="mb-part" style="width:${pct(p.allocated)}"
            title="${p.title} &mdash; ${money(p.awarded)} of ${money(p.allocated)} awarded">
            ${p.awarded > 0 ? `<i class="mb-${p.key}" style="width:${lit.toFixed(2)}%"></i>` : ''}
            ${p.awarded < p.allocated ? `<i class="mb-${p.key} dim" style="flex:1"></i>` : ''}
          </span>`;
        }).join('')}
        </div>
      </div>
      <ul class="mb-legend">
        ${mb.parts.map((p) => `<li${p.allocated ? '' : ' class="nil"'}>
          <i class="mb-${p.key}"></i><span>${p.title}</span><b>${money(p.allocated)}</b></li>`).join('')}
      </ul>
    </div>
  </div>

  ${/* Every phase gets a section whether or not it has games — the slate's shape
       should not change under you, and an empty one is a place to add to. */''}
  ${db.minigamePhases(S).map((ph) => {
    // the weekly slate is built by Season setup, not one game at a time
    const add = ph.phase === 'week' || !admin ? '' : `<div class="mg-add">
      <button class="btn sm" data-addgame="${ph.phase}">${icon('plus')} Add minigame</button></div>`;

    if (!ph.games.length && ph.phase === 'week') {
      return `<div class="section-title">${ph.title}</div>
        ${empty('No slate yet', admin
          ? 'Set up the season below and every week appears here, ready to fill in.'
          : `The commissioner hasn't set up ${S}'s minigames yet.`, 'dice')}
        ${admin ? `<div style="text-align:center;margin-top:-14px">
          <button class="btn primary" data-setup>${icon('plus')} Set up ${S} season</button></div>` : ''}`;
    }
    // an admin with nothing scheduled gets the button alone — an empty card says less
    const card = ph.games.length
      ? `<div class="card"><div class="card-bd flush"><div class="mg-list">
          ${ph.games.map((g) => gameRow(db, g, S, admin)).join('')}
        </div></div></div>`
      : admin ? '' : `<div class="card"><div class="card-bd">
          <div class="s dim" style="font-size:12.5px">No ${ph.title.toLowerCase()} minigames this season.</div>
        </div></div>`;
    return `<div class="section-title">${ph.title}</div>${card}${add}`;
  }).join('')}

  <div class="section-title">Guillotine</div>
  ${guillotineCard(db, s.guillotine, S, admin) || `<div class="card"><div class="card-bd">
    <div class="s dim" style="font-size:12.5px">No guillotine this season.</div></div></div>`}
  `;
}

export function mount(root, db) {
  const S = db.season;
  const teams = db.teams(S);

  /* These headers are divs, not buttons — the edit pencil sits inside them and a
     button cannot nest in a button. So wire up click, keyboard and aria by hand,
     and let a click on the pencil through rather than also toggling the row. */
  const expander = (el, toggle) => {
    const fire = () => {
      const open = toggle();
      el.setAttribute('aria-expanded', String(open));
    };
    el.addEventListener('click', (e) => { if (!e.target.closest('.edit-pencil')) fire(); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
  };

  /* minigame rows expand in place */
  root.querySelectorAll('[data-mg]').forEach((b) => expander(b, () => {
    const id = b.dataset.mg;
    MG_OPEN.has(id) ? MG_OPEN.delete(id) : MG_OPEN.add(id);
    const open = MG_OPEN.has(id);
    b.closest('.mg').classList.toggle('open', open);
    return open;
  }));

  /* the guillotine card opens the same way a minigame row does */
  const guilHd = root.querySelector('[data-guiltoggle]');
  if (guilHd) expander(guilHd, () => {
    GUIL_CARD.has(S) ? GUIL_CARD.delete(S) : GUIL_CARD.add(S);
    const open = GUIL_CARD.has(S);
    guilHd.closest('.guil').classList.toggle('open', open);
    return open;
  });

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
  const season = () => db.get('minigames').seasons[String(S)]
    ||= { games: [], guillotine: null, legacy: null };

  root.querySelectorAll('[data-setup]').forEach((b) => b.addEventListener('click', () => {
    const cur = db.minigames(S);
    const d0 = db.get('minigames').defaults || {};
    openModal({
      title: `${S} season setup`,
      confirm: cur.games.length ? 'Update' : 'Create slate',
      body: `<div class="fgrid" style="grid-template-columns:repeat(2,1fr)">
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
          <input name="guil" type="number" min="1" max="18" inputmode="numeric"
            value="${cur.guillotine?.startWeek ?? ''}"></div>`,
      onConfirm: async (f) => {
        const want = { pre: Math.max(0, +f.pre || 0), week: WEEKS,
                       post: Math.max(0, +f.post || 0) };
        const pay = Math.max(0, +f.pay || 0);
        const guil = f.guil ? Math.max(1, +f.guil) : null;
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, legacy: null });
          for (const g of sn.games) g.phase ||= 'week';
          for (const phase of ['pre', 'week', 'post']) {
            const mine = sn.games.filter((g) => g.phase === phase);
            const n = want[phase];
            // add the missing ones; anything already filled in is left alone
            for (let i = 1; i <= n; i++) {
              const has = phase === 'week' ? mine.some((g) => g.week === i) : mine.some((g) => g.order === i);
              if (has) continue;
              sn.games.push({
                id: `${S}-${phase}${String(i).padStart(2, '0')}`,
                phase, week: phase === 'week' ? i : null, order: phase === 'week' ? null : i,
                name: null, rules: null, payout: { 1: pay, 2: 0, 3: 0 },
                status: 'scheduled', results: { 1: null, 2: null, 3: null },
              });
            }
            // trim only the empty tail, never something with a result
            sn.games = sn.games.filter((g) => {
              if (g.phase !== phase) return true;
              const idx = phase === 'week' ? g.week : g.order;
              if (idx <= n) return true;
              return Boolean(g.name || g.results?.['1']?.team);
            });
            // Reset anything still blank back to an empty slot at no cost.
            // A slot with a name or a winner is left completely alone.
            for (const g of sn.games) {
              if (g.phase !== phase) continue;
              const touched = g.name || g.results?.['1']?.team
                || g.status === 'canceled' || g.status === 'guillotine';
              if (touched) continue;
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

  root.querySelectorAll('[data-addgame]').forEach((b) => b.addEventListener('click', async () => {
    const phase = b.dataset.addgame;
    const pay = db.get('minigames').defaults?.weeklyPayout?.['1'] ?? 10;
    const same = db.minigames(S).games.filter((g) => (g.phase || 'week') === phase);
    const n = phase === 'week'
      ? Math.max(0, ...same.map((g) => g.week || 0)) + 1
      : Math.max(0, ...same.map((g) => g.order || 0)) + 1;
    await db.update('minigames', (m) => {
      const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, legacy: null });
      sn.games.push({
        id: `${S}-${phase}${String(n).padStart(2, '0')}-${Date.now().toString(36)}`,
        phase, week: phase === 'week' ? n : null, order: phase === 'week' ? null : n,
        name: null, rules: null, payout: { 1: pay, 2: 0, 3: 0 },
        status: 'scheduled', results: { 1: null, 2: null, 3: null },
      });
    });
    toast(phase === 'week' ? `Week ${n} added` : `${phase === 'pre' ? 'Preseason' : 'Post-season'} minigame added`);
  }));

  root.querySelector('[data-editguil]')?.addEventListener('click', () => {
    const G = db.minigames(S).guillotine;
    const m = openModal({
      title: 'Guillotine',
      confirm: 'Save',
      body: `${summaryField(G?.summary, 'e.g. Lowest score each week is out')}
        <div class="field"><label>Rules / notes</label><textarea name="rules">${esc(G?.rules
          || 'Lowest scoring manager is chopped every week until one remains.')}</textarea></div>
        <div class="fgrid" style="grid-template-columns:repeat(3,1fr)">
          <div class="field"><label>Starts week</label>
            <input name="start" type="number" min="1" inputmode="numeric" value="${G?.startWeek ?? 1}"></div>
          <div class="field"><label>Last chop</label>
            <input value="week ${(G?.startWeek ?? 1) + db.teams(S).length - 2}" disabled style="opacity:.55"></div>
          <div class="field"><label>Payout</label>
            <input name="pay" type="number" min="0" inputmode="numeric" value="${G?.payout?.['1'] ?? 10}"></div>
        </div>`,
      closeButtons: false,   // outside-click, Escape and Save all close it
      extra: G ? `<button type="button" class="btn danger" data-clear>Remove</button>` : '',
      onConfirm: async (f) => {
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, legacy: null });
          sn.guillotine = {
            ...(sn.guillotine || { id: `${S}-guillotine`, name: 'Guillotine', status: 'scheduled',
                                   entrants: db.teams(S).map((t) => t.number), eliminations: [], winner: null }),
            summary: f.summary.trim().slice(0, SUMMARY_MAX) || null,
            rules: f.rules.trim() || null,
            startWeek: Math.max(1, +f.start || 1),
            payout: { 1: Math.max(0, +f.pay || 0) },
          };
        });
        toast('Guillotine saved');
      },
    });

    m.root.querySelector('[data-clear]')?.addEventListener('click', async () => {
      await db.update('minigames', (mg) => {
        mg.seasons[String(S)].guillotine = null;
      });
      m.close();
      toast('Guillotine removed');
    });

    liveCount(m);
  });



  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const g = db.minigames(S).games.find((x) => x.id === b.dataset.edit);
    const r = g.results?.['1'] || {};
    const m = openModal({
      title: `${slotLabel(g)} minigame`,
      confirm: 'Save',
      body: `
        <div class="field"><label>Minigame</label>
          <input name="name" value="${esc(g.name || '')}" placeholder="e.g. Closest to the Number"></div>
        ${summaryField(g.summary, 'e.g. Highest scoring manager off the bat')}
        <div class="field"><label>Rules / notes</label>
          <textarea name="rules" placeholder="How it's won${
            g.phase !== 'week' ? ' — league vote is fine' : ''}">${esc(g.rules || '')}</textarea></div>
        <div class="fgrid" style="grid-template-columns:2fr 3fr">
          <div class="field"><label>Payout $</label>
            <input name="pay1" type="number" min="0" step="1" inputmode="numeric" value="${Number(g.payout?.['1']) || 0}"></div>
          <div class="field"><label>Winner</label>
            <select name="team1">${teamOptions(teams, r.team ?? '')}</select></div>
        </div>
        <div class="field"><label>What won it</label>
          <input name="val1" value="${esc(r.value || '')}" placeholder="player / score / note"></div>`,
      closeButtons: false,   // outside-click, Escape and Save all close it
      extra: filled(g)
        ? `<button type="button" class="btn danger" data-clear>${
            g.phase === 'week' ? 'Clear' : 'Remove'}</button>`
        : '',
      onConfirm: async (d) => {
        await db.update('minigames', (m) => {
          const gg = m.seasons[String(S)].games.find((x) => x.id === g.id);
          gg.name = d.name.trim() || null;
          gg.summary = d.summary.trim().slice(0, SUMMARY_MAX) || null;
          gg.rules = d.rules.trim() || null;
          // 2nd and 3rd are kept in the shape but never used — every game is
          // winner-take-all, and already-published data reads back unchanged
          gg.payout = { 1: +d.pay1 || 0, 2: 0, 3: 0 };
          gg.results = { 1: d.team1 ? { team: +d.team1, value: d.val1.trim() || null } : null,
                         2: null, 3: null };
          setStatus(gg, g.status);
        });
        toast(`${slotLabel(g)} saved`);
      },
    });

    m.root.querySelector('[data-clear]')?.addEventListener('click', async () => {
      const weekly = g.phase === 'week';
      await db.update('minigames', (mg) => {
        const sn = mg.seasons[String(S)];
        // Weeks 1-18 always keep a line — clearing empties the slot, it does not
        // take the week off the slate. Extra pre/post slots are removed outright.
        if (!weekly) { sn.games = sn.games.filter((x) => x.id !== g.id); return; }
        const gg = sn.games.find((x) => x.id === g.id);
        gg.name = null; gg.summary = null; gg.rules = null;
        gg.payout = { 1: 0, 2: 0, 3: 0 };
        gg.results = { 1: null, 2: null, 3: null };
        gg.status = 'none';
      });
      m.close();
      toast(weekly ? `Week ${g.week} cleared` : 'Minigame removed');
    });

    liveCount(m);
  }));






}
