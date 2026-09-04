import { money, esc, icon, teamTag, empty, openModal, teamOptions, toast, pts } from '../util.js';

const PLACES = { 1: 'Winner', 2: 'Runner-up', 3: 'Third' };

const PLACE_LABEL = { 1: 'Winner', 2: 'Runner-up', 3: 'Third' };

/* Which minigames are expanded — module scope so an edit does not close them. */
const MG_OPEN = new Set();

const phaseLabel = (g) => g.phase === 'week' ? `WK ${g.week}` : g.phase === 'pre' ? 'PRE' : 'POST';

/** One line: what it was, who won, what it paid. Everything else is inside. */
function gameRow(db, g, S, admin) {
  const inert = g.status === 'none' || g.status === 'guillotine';
  const canceled = g.status === 'canceled';
  const win = g.results?.['1'];
  const winner = win?.team ? db.team(win.team)?.manager : null;
  const prize = Number(g.payout?.['1']) || 0;
  const open = MG_OPEN.has(g.id);
  const detail = !inert && (g.rules || win?.value || g.results?.['2']?.team || g.results?.['3']?.team || admin);

  const title = g.status === 'none' ? (g.phase === 'week' ? 'No minigame this week' : 'Not running')
    : g.status === 'guillotine' ? 'Guillotine'
    : g.name ? esc(g.name) : 'Not set yet';

  return `<div class="mg${open ? ' open' : ''}${inert || canceled ? ' quiet' : ''}">
    <button class="mg-hd" ${detail ? `data-mg="${esc(g.id)}"` : 'disabled'}>
      <span class="mg-wk">${phaseLabel(g)}</span>
      <span class="mg-title${g.name && !inert ? '' : ' unset'}">${title}</span>
      ${canceled ? '<span class="chip red">Cancelled</span>'
        : g.status === 'guillotine' ? '<span class="chip heat">below</span>'
        : winner ? `<span class="mg-win">${esc(winner)}</span>`
        : inert ? ''
        : '<span class="mg-win none">&mdash;</span>'}
      <span class="mg-prize${prize && winner ? ' won' : ''}">${prize ? money(prize) : ''}</span>
      ${detail ? icon('chev', 'acc-caret') : '<span style="width:18px;flex:none"></span>'}
    </button>
    ${detail ? `<div class="mg-bd">
      ${g.rules ? `<p class="mg-rules">${esc(g.rules)}</p>` : ''}
      <ul class="mg-places">
        ${['1', '2', '3'].map((pl) => {
          const r = g.results?.[pl];
          const pay = Number(g.payout?.[pl]) || 0;
          if (!r?.team && !pay) return '';
          return `<li>
            <span class="pl">${PLACE_LABEL[pl]}</span>
            <span class="who">
              ${r?.team ? teamTag(db.team(r.team)) : '<span class="dimmer">not decided</span>'}
              ${r?.value ? `<span class="val">${esc(r.value)}</span>` : ''}
            </span>
            <b>${pay ? money(pay) : '&mdash;'}</b>
          </li>`;
        }).join('')}
      </ul>
      ${admin ? `<div class="mg-edit"><button class="btn sm" data-edit="${esc(g.id)}">${icon('pencil')} Edit</button></div>` : ''}
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
  const done = s.games.filter((g) => g.status === 'final').length;

  return `
  <div class="tiles">
    <div class="tile accent"><div class="k">Budget</div><div class="v">${money(spend.committed)}</div><div class="m">${S} minigames</div></div>
    <div class="tile mint"><div class="k">Awarded</div><div class="v">${money(spend.paid)}</div><div class="m">${done} settled</div></div>
    <div class="tile"><div class="k">Still up</div><div class="v">${money(spend.remaining)}</div><div class="m">${s.games.length - done} to play</div></div>
    <div class="tile gold"><div class="k">Guillotine</div><div class="v">${money(s.guillotine?.payout?.['1'] || 0)}</div>
      <div class="m">week ${s.guillotine?.startWeek ?? '--'}</div></div>
  </div>

  ${admin ? `<div class="mg-actions">
    <button class="btn sm" data-setup>${icon('cog')} Season setup</button>
    <button class="btn sm" data-addgame="pre">${icon('plus')} Preseason</button>
    <button class="btn sm" data-addgame="week">${icon('plus')} Week</button>
    <button class="btn sm" data-addgame="post">${icon('plus')} Post-season</button>
  </div>` : ''}

  ${db.minigamePhases(S).map((ph) => {
    if (!ph.games.length) {
      if (ph.phase !== 'week') return '';
      return `<div class="section-title">${ph.title}</div>
        ${empty('No slate yet', admin
          ? 'Set up the season below and every week appears here, ready to fill in.'
          : `The commissioner hasn't set up ${S}'s minigames yet.`, 'dice')}
        ${admin ? `<div style="text-align:center;margin-top:-14px">
          <button class="btn primary" data-setup>${icon('plus')} Set up ${S} season</button></div>` : ''}`;
    }
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
  const season = () => db.get('minigames').seasons[String(S)]
    ||= { games: [], guillotine: null, legacy: null };

  root.querySelectorAll('[data-setup]').forEach((b) => b.addEventListener('click', () => {
    const cur = db.minigames(S);
    const d0 = db.get('minigames').defaults || {};
    openModal({
      title: `${S} season setup`,
      confirm: cur.games.length ? 'Update' : 'Create slate',
      body: `<div class="s dim" style="font-size:12.5px;line-height:1.6;margin-bottom:13px">
          Creates one entry per week. Existing weeks keep whatever you have already entered &mdash;
          this only adds the missing ones.</div>
        <div class="fgrid" style="grid-template-columns:repeat(3,1fr)">
          <div class="field"><label>Preseason</label>
            <input name="pre" type="number" min="0" max="20" inputmode="numeric"
              value="${cur.games.filter((g) => g.phase === 'pre').length || d0.preseason || 0}"></div>
          <div class="field"><label>Weekly</label>
            <input name="weeks" type="number" min="0" max="18" inputmode="numeric"
              value="${cur.games.filter((g) => (g.phase || 'week') === 'week').length || d0.weeks || 14}"></div>
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
        const want = { pre: Math.max(0, +f.pre || 0), week: Math.max(0, Math.min(18, +f.weeks || 0)),
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
    openModal({
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
        ${G ? '<label class="toggle" style="margin-top:4px"><input type="checkbox" name="remove"><span class="tr"></span><span style="font-size:12.5px">Remove the guillotine</span></label>' : ''}`,
      onConfirm: async (f) => {
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, legacy: null });
          if (f.remove) { sn.guillotine = null; return; }
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
  });



  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const g = db.minigames(S).games.find((x) => x.id === b.dataset.edit);
    const r = (p) => g.results?.[p] || {};
    openModal({
      title: g.phase === 'week' ? `Week ${g.week} minigame`
        : g.phase === 'pre' ? 'Preseason minigame' : 'Post-season minigame',
      confirm: 'Save',
      body: `
        <div class="field"><label>Minigame</label>
          <input name="name" value="${esc(g.name || '')}" placeholder="e.g. Closest to the Number"></div>
        <div class="field"><label>Rules / notes</label>
          <textarea name="rules" placeholder="How it's won${
            g.phase !== 'week' ? ' — league vote is fine' : ''}">${esc(g.rules || '')}</textarea></div>
        <div class="section-title" style="margin-top:6px">Payout</div>
        <div class="fgrid" style="grid-template-columns:repeat(3,1fr)">
          ${['1', '2', '3'].map((p) => `<div class="field"><label>${PLACES[p]} $</label>
            <input name="pay${p}" type="number" min="0" step="1" inputmode="numeric" value="${Number(g.payout?.[p]) || 0}"></div>`).join('')}
        </div>
        <div class="field" style="margin-top:2px">
          <label>Status</label>
          <select name="status">
            ${['scheduled', 'final', 'none', 'canceled'].map((k) => `<option value="${k}" ${g.status === k ? 'selected' : ''}>${
              { scheduled: 'Scheduled', final: 'Decided',
                none: g.phase === 'week' ? 'No minigame this week' : 'Not running',
                canceled: 'Cancelled' }[k]}</option>`).join('')}
          </select>
        </div>
        <div class="section-title" style="margin-top:2px">Result</div>
        ${['1', '2', '3'].map((p) => `
          <div class="fgrid" style="grid-template-columns:1fr 1fr">
            <div class="field"><label>${PLACES[p]}</label>
              <select name="team${p}">${teamOptions(teams, r(p).team ?? '')}</select></div>
            <div class="field"><label>What won it</label>
              <input name="val${p}" value="${esc(r(p).value || '')}" placeholder="player / score / note"></div>
          </div>`).join('')}
        <label class="toggle" style="margin-top:2px"><input type="checkbox" name="remove">
          <span class="tr"></span><span style="font-size:12.5px;color:var(--red)">Delete this minigame</span></label>`,
      onConfirm: async (d) => {
        if (d.remove) {
          await db.update('minigames', (m) => {
            const sn = m.seasons[String(S)];
            sn.games = sn.games.filter((x) => x.id !== g.id);
          });
          toast('Minigame removed');
          return;
        }
        await db.update('minigames', (m) => {
          const gg = m.seasons[String(S)].games.find((x) => x.id === g.id);
          gg.name = d.name.trim() || null;
          gg.rules = d.rules.trim() || null;
          gg.payout = { 1: +d.pay1 || 0, 2: +d.pay2 || 0, 3: +d.pay3 || 0 };
          gg.results = {};
          for (const p of ['1', '2', '3'])
            gg.results[p] = d[`team${p}`] ? { team: +d[`team${p}`], value: d[`val${p}`].trim() || null } : null;
          gg.status = d.status || (gg.results['1']?.team ? 'final' : 'scheduled');
        });
        toast(`Week ${g.week} saved`);
      },
    });
  }));






}
