import { money, esc, icon, teamTag, empty, openModal, teamOptions, toast, pts } from '../util.js';

const PLACES = { 1: 'Winner', 2: 'Runner-up', 3: 'Third' };

const resultRow = (db, g, place) => {
  const r = g.results?.[place];
  const pay = Number(g.payout?.[place]) || 0;
  if (!r?.team) return pay ? `<div class="row" style="padding:8px 0">
      <span class="chip ghost">${PLACES[place]}</span>
      <div class="grow"><div class="s">not decided</div></div>
      <div class="dimmer" style="font-size:13px">${money(pay)}</div></div>` : '';
  return `<div class="row" style="padding:8px 0">
    <span class="chip ${place === '1' ? 'heat' : 'ghost'}">${PLACES[place]}</span>
    <div class="grow"><div class="t">${teamTag(db.team(r.team))}</div>
      ${r.value ? `<div class="s">${esc(r.value)}</div>` : ''}</div>
    <div style="font-family:var(--f-display);font-weight:700;font-size:16px;color:${place === '1' ? 'var(--heat)' : 'var(--ink-2)'}">${money(pay)}</div>
  </div>`;
};

function guillotineCard(db, G, S, admin) {
  if (!G) return admin ? `<div class="card"><div class="card-bd" style="text-align:center">
    <div class="s dim" style="font-size:12.5px;margin-bottom:11px">No guillotine set up for ${S}.</div>
    <button class="btn" data-editguil>${icon('blade')} Add the guillotine</button></div></div>` : '';
  const gone = new Set(G.eliminations.map((e) => e.team));
  const alive = G.entrants.filter((t) => !gone.has(t));
  const order = [...G.eliminations].sort((a, b) => b.week - a.week);
  return `
  <div class="card">
    <div class="card-hd">
      ${icon('blade')}
      <div><h3>Guillotine</h3><div class="sub">from week ${G.startWeek}${
        G.awardedInWeek && G.awardedInWeek !== G.startWeek ? ` &middot; paid wk ${G.awardedInWeek}` : ''}</div></div>
      <div class="spacer"></div>
      <span class="chip ${G.winner ? 'gold' : 'heat'}">${money(G.payout?.['1'] || 0)}</span>
      ${admin ? `<button class="btn sm ghost" data-editguil>${icon('pencil')}</button>` : ''}
    </div>
    <div class="card-bd" style="padding-bottom:10px">
      <div class="s dim" style="font-size:12.5px;line-height:1.55">${esc(G.rules || '')}</div>
      <div style="display:flex;gap:10px;margin-top:12px;align-items:center">
        <div class="meter" style="flex:1"><i style="width:${G.entrants.length ? ((G.entrants.length - alive.length) / (G.entrants.length - 1) * 100).toFixed(1) : 0}%"></i></div>
        <span class="chip ${alive.length === 1 ? 'gold' : 'mint'}">${alive.length} alive</span>
      </div>
    </div>
    <div class="card-bd flush"><div class="guillo">
      ${alive.map((t) => `<div class="g-row alive">
          <span class="wk">IN</span>
          <div class="grow" style="flex:1">${teamTag(db.team(t))}</div>
          ${admin && alive.length > 1 ? `<button class="btn sm" data-chop="${t}">Chop</button>` : ''}
        </div>`).join('')}
      ${order.map((e) => `<div class="g-row out">
          <span class="wk">W${e.week}</span>
          <div class="grow" style="flex:1">${teamTag(db.team(e.team))}</div>
          <div class="dimmer" style="font-size:12.5px">${e.points != null ? pts(e.points) : ''}</div>
          ${admin ? `<button class="btn sm ghost" data-unchop="${e.team}" aria-label="Undo">${icon('sync')}</button>` : ''}
        </div>`).join('')}
    </div></div>
    ${alive.length === 1 && !G.winner && admin ? `<div class="card-bd">
      <button class="btn primary" data-crown="${alive[0]}" style="width:100%">${icon('crown')} Crown ${esc(db.team(alive[0]).manager)}</button></div>` : ''}
    ${G.winner ? `<div class="card-bd" style="border-top:1px solid var(--line-soft)">
      <div class="banner" style="background:rgba(245,196,81,.08);border-color:rgba(245,196,81,.3)">
        ${icon('crown')}<div>Last one standing: <b style="color:var(--gold)">${esc(db.team(G.winner)?.manager)}</b> takes ${money(G.payout?.['1'] || 0)}.</div></div>
    </div>` : ''}
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
    <button class="btn sm" data-addweek>${icon('plus')} Add week</button>
    <button class="btn sm" data-addaward>${icon('trophy')} Add award</button>
  </div>` : ''}

  <div class="section-title">Weekly slate</div>
  ${s.games.length ? s.games.map((g) => {
    const settled = g.results?.['1']?.team;
    const off = g.status === 'none' || g.status === 'canceled' || g.status === 'guillotine';
    const title = g.status === 'none' ? 'No minigame this week'
      : g.name ? esc(g.name) : 'Not set yet';
    return `<div class="card" style="margin-bottom:10px${off ? ';opacity:.62' : ''}">
      <div class="card-hd">
        <span class="chip ${settled ? 'mint' : off ? '' : 'ghost'}">WK ${g.week}</span>
        <div style="min-width:0">
          <h3 style="font-size:15px;${g.name && !off ? '' : 'color:var(--ink-3)'}">${title}</h3>
          ${g.rules ? `<div class="sub" style="text-transform:none;letter-spacing:0;font-size:11.5px">${esc(g.rules)}</div>` : ''}
        </div>
        <div class="spacer"></div>
        ${g.status === 'canceled' ? '<span class="chip red">Cancelled</span>' : ''}
        ${g.status === 'guillotine' ? '<span class="chip heat">See below</span>' : ''}
        ${admin ? `<button class="btn sm" data-edit="${g.id}">${icon(g.name ? 'pencil' : 'plus')}</button>` : ''}
      </div>
      ${g.note ? `<div class="card-bd" style="padding-top:0"><div class="s dim" style="font-size:12px">${esc(g.note)}</div></div>` : ''}
      ${!off && (settled || Object.values(g.payout || {}).some((v) => v > 0))
        ? `<div class="card-bd" style="padding-top:4px;padding-bottom:4px">
            ${['1', '2', '3'].map((p) => resultRow(db, g, p)).join('')}</div>`
        : ''}
    </div>`;
  }).join('') : `${empty('No slate yet', admin
      ? `Set up the season below and every week appears here, ready to fill in.`
      : `The commissioner hasn't set up ${S}'s minigames yet.`, 'dice')}
    ${admin ? `<div style="text-align:center;margin-top:-14px">
      <button class="btn primary" data-setup>${icon('plus')} Set up ${S} season</button></div>` : ''}`}

  ${(s.awards || []).length ? `
  <div class="section-title">Post-season awards</div>
  <div class="card"><div class="card-bd flush"><div class="rows">
    ${s.awards.map((a) => `<div class="row"${a.status === 'canceled' ? ' style="opacity:.6"' : ''}>
      ${icon('trophy')}
      <div class="grow">
        <div class="t">${esc(a.name)}</div>
        <div class="s" style="white-space:normal">${esc(a.rules || '')}</div>
      </div>
      ${a.status === 'canceled' ? '<span class="chip red">Cancelled</span>'
        : a.result?.team ? `<div style="text-align:right">
            <div>${teamTag(db.team(a.result.team), { num: false })}</div>
            <div class="s" style="color:var(--heat);font-family:var(--f-display);font-weight:700">${money(a.payout)}</div>
          </div>` : '<span class="chip ghost">undecided</span>'}
      ${admin ? `<button class="btn sm ghost" data-editaward="${a.id}">${icon('pencil')}</button>` : ''}
    </div>`).join('')}
  </div></div></div>` : ''}

  <div class="section-title">Elimination</div>
  ${guillotineCard(db, s.guillotine, S, admin)}
  `;
}

export function mount(root, db) {
  const S = db.season;
  const teams = db.teams(S);

  /* ---------- season setup, all on this tab ---------- */
  const season = () => db.get('minigames').seasons[String(S)]
    ||= { games: [], guillotine: null, awards: [], legacy: null };

  root.querySelectorAll('[data-setup]').forEach((b) => b.addEventListener('click', () => {
    const cur = db.minigames(S);
    const d0 = db.get('minigames').defaults || {};
    openModal({
      title: `${S} season setup`,
      confirm: cur.games.length ? 'Update' : 'Create slate',
      body: `<div class="s dim" style="font-size:12.5px;line-height:1.6;margin-bottom:13px">
          Creates one entry per week. Existing weeks keep whatever you have already entered &mdash;
          this only adds the missing ones.</div>
        <div class="fgrid">
          <div class="field"><label>Weeks</label>
            <input name="weeks" type="number" min="1" max="18" inputmode="numeric"
              value="${cur.games.length || d0.weeks || 14}"></div>
          <div class="field"><label>Default payout</label>
            <input name="pay" type="number" min="0" inputmode="numeric"
              value="${d0.weeklyPayout?.['1'] ?? 10}"></div>
        </div>
        <div class="field"><label>Guillotine week (blank for none)</label>
          <input name="guil" type="number" min="1" max="18" inputmode="numeric"
            value="${cur.guillotine?.week ?? ''}"></div>`,
      onConfirm: async (f) => {
        const weeks = Math.max(1, Math.min(18, +f.weeks || 14));
        const pay = Math.max(0, +f.pay || 0);
        const guil = f.guil ? Math.max(1, +f.guil) : null;
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, awards: [], legacy: null });
          sn.awards ||= [];
          for (let wk = 1; wk <= weeks; wk++) {
            if (sn.games.some((g) => g.week === wk)) continue;
            sn.games.push({ id: `${S}-w${String(wk).padStart(2, '0')}`, week: wk, name: null, rules: null,
              payout: { 1: pay, 2: 0, 3: 0 }, status: 'scheduled', results: { 1: null, 2: null, 3: null } });
          }
          sn.games = sn.games.filter((g) => g.week <= weeks).sort((a, b) => a.week - b.week);
          if (guil && !sn.guillotine) {
            sn.guillotine = { id: `${S}-guillotine`, week: guil, startWeek: 1, name: 'Guillotine',
              rules: 'Lowest scoring manager is chopped every week until one remains.',
              payout: { 1: pay }, status: 'scheduled',
              entrants: db.teams(S).map((t) => t.number), eliminations: [], winner: null, awardedInWeek: guil };
          } else if (guil && sn.guillotine) {
            sn.guillotine.week = guil; sn.guillotine.awardedInWeek = guil;
          } else if (!guil) sn.guillotine = null;
        });
        toast(`${S} slate ready`);
      },
    });
  }));

  root.querySelector('[data-addweek]')?.addEventListener('click', async () => {
    const cur = db.minigames(S);
    const wk = Math.max(0, ...cur.games.map((g) => g.week)) + 1;
    const pay = db.get('minigames').defaults?.weeklyPayout?.['1'] ?? 10;
    await db.update('minigames', (m) => {
      const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, awards: [], legacy: null });
      sn.games.push({ id: `${S}-w${String(wk).padStart(2, '0')}`, week: wk, name: null, rules: null,
        payout: { 1: pay, 2: 0, 3: 0 }, status: 'scheduled', results: { 1: null, 2: null, 3: null } });
    });
    toast(`Week ${wk} added`);
  });

  root.querySelector('[data-editguil]')?.addEventListener('click', () => {
    const G = db.minigames(S).guillotine;
    openModal({
      title: 'Guillotine',
      confirm: 'Save',
      body: `<div class="field"><label>Rules</label><textarea name="rules">${esc(G?.rules
          || 'Lowest scoring manager is chopped every week until one remains.')}</textarea></div>
        <div class="fgrid">
          <div class="field"><label>Runs from week</label>
            <input name="start" type="number" min="1" inputmode="numeric" value="${G?.startWeek ?? 1}"></div>
          <div class="field"><label>Paid out in week</label>
            <input name="week" type="number" min="1" inputmode="numeric" value="${G?.week ?? 9}"></div>
        </div>
        <div class="field"><label>Payout</label>
          <input name="pay" type="number" min="0" inputmode="numeric" value="${G?.payout?.['1'] ?? 10}"></div>
        ${G ? '<label class="toggle" style="margin-top:4px"><input type="checkbox" name="remove"><span class="tr"></span><span style="font-size:12.5px">Remove the guillotine</span></label>' : ''}`,
      onConfirm: async (f) => {
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, awards: [], legacy: null });
          if (f.remove) { sn.guillotine = null; return; }
          sn.guillotine = {
            ...(sn.guillotine || { id: `${S}-guillotine`, name: 'Guillotine', status: 'scheduled',
                                   entrants: db.teams(S).map((t) => t.number), eliminations: [], winner: null }),
            rules: f.rules.trim() || null,
            startWeek: Math.max(1, +f.start || 1),
            week: Math.max(1, +f.week || 9),
            awardedInWeek: Math.max(1, +f.week || 9),
            payout: { 1: Math.max(0, +f.pay || 0) },
          };
        });
        toast('Guillotine saved');
      },
    });
  });

  const awardModal = (award) => {
    const teams = db.teams(S);
    openModal({
      title: award ? 'Edit award' : 'New award',
      confirm: 'Save award',
      body: `<div class="field"><label>Award</label>
          <input name="name" value="${esc(award?.name || '')}" placeholder="e.g. Trade of the Year"></div>
        <div class="field"><label>How it's won</label>
          <textarea name="rules">${esc(award?.rules || '')}</textarea></div>
        <div class="fgrid">
          <div class="field"><label>Payout</label>
            <input name="pay" type="number" min="0" inputmode="numeric" value="${award?.payout ?? 10}"></div>
          <div class="field"><label>Winner</label>
            <select name="team">${teamOptions(teams, award?.result?.team ?? '')}</select></div>
        </div>
        <label class="toggle"><input type="checkbox" name="canceled" ${award?.status === 'canceled' ? 'checked' : ''}>
          <span class="tr"></span><span style="font-size:12.5px">Cancelled</span></label>
        ${award ? '<label class="toggle" style="margin-top:9px"><input type="checkbox" name="remove"><span class="tr"></span><span style="font-size:12.5px;color:var(--red)">Delete this award</span></label>' : ''}`,
      onConfirm: async (f) => {
        if (!f.name.trim() && !f.remove) { toast('Give it a name'); return false; }
        await db.update('minigames', (m) => {
          const sn = (m.seasons[String(S)] ||= { games: [], guillotine: null, awards: [], legacy: null });
          sn.awards ||= [];
          if (award && f.remove) { sn.awards = sn.awards.filter((a) => a.id !== award.id); return; }
          const rec = {
            id: award?.id || `${S}-aw${Date.now().toString(36)}`,
            name: f.name.trim(),
            rules: f.rules.trim() || null,
            payout: f.canceled ? 0 : Math.max(0, +f.pay || 0),
            status: f.canceled ? 'canceled' : (f.team ? 'final' : 'scheduled'),
            result: f.canceled || !f.team ? null : { team: +f.team, value: null },
          };
          const i = sn.awards.findIndex((a) => a.id === rec.id);
          i >= 0 ? sn.awards[i] = rec : sn.awards.push(rec);
        });
        toast('Award saved');
      },
    });
  };
  root.querySelector('[data-addaward]')?.addEventListener('click', () => awardModal(null));
  root.querySelectorAll('[data-editaward]').forEach((b) => b.addEventListener('click', () =>
    awardModal(db.minigames(S).awards.find((a) => a.id === b.dataset.editaward))));

  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const g = db.minigames(S).games.find((x) => x.id === b.dataset.edit);
    const r = (p) => g.results?.[p] || {};
    openModal({
      title: `Week ${g.week} minigame`,
      confirm: 'Save week',
      body: `
        <div class="field"><label>Minigame</label>
          <input name="name" value="${esc(g.name || '')}" placeholder="e.g. Closest to the Number"></div>
        <div class="field"><label>Rules / notes</label>
          <textarea name="rules" placeholder="How it's won">${esc(g.rules || '')}</textarea></div>
        <div class="section-title" style="margin-top:6px">Payout</div>
        <div class="fgrid" style="grid-template-columns:repeat(3,1fr)">
          ${['1', '2', '3'].map((p) => `<div class="field"><label>${PLACES[p]} $</label>
            <input name="pay${p}" type="number" min="0" step="1" inputmode="numeric" value="${Number(g.payout?.[p]) || 0}"></div>`).join('')}
        </div>
        <div class="field" style="margin-top:2px">
          <label>Status</label>
          <select name="status">
            ${['scheduled', 'final', 'none', 'canceled'].map((k) => `<option value="${k}" ${g.status === k ? 'selected' : ''}>${
              { scheduled: 'Scheduled', final: 'Decided', none: 'No minigame this week', canceled: 'Cancelled' }[k]}</option>`).join('')}
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
          <span class="tr"></span><span style="font-size:12.5px;color:var(--red)">Delete week ${g.week}</span></label>`,
      onConfirm: async (d) => {
        if (d.remove) {
          await db.update('minigames', (m) => {
            const sn = m.seasons[String(S)];
            sn.games = sn.games.filter((x) => x.id !== g.id);
          });
          toast(`Week ${g.week} removed`);
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

  root.querySelectorAll('[data-chop]').forEach((b) => b.addEventListener('click', () => {
    const t = Number(b.dataset.chop);
    const G = db.minigames(S).guillotine;
    const wk = G.startWeek + G.eliminations.length;
    openModal({
      title: `Chop ${db.team(t).manager}`,
      confirm: 'Chop',
      body: `<div class="field"><label>Week</label>
          <input name="week" type="number" inputmode="numeric" value="${wk}"></div>
        <div class="field"><label>Their score (optional)</label>
          <input name="points" type="number" step="0.01" inputmode="decimal" placeholder="lowest remaining"></div>
        <p class="s dim" style="font-size:12.5px;margin:0">Lowest-scoring survivor gets cut. This can be undone.</p>`,
      onConfirm: async (d) => {
        await db.update('minigames', (m) => {
          m.seasons[String(S)].guillotine.eliminations.push(
            { week: +d.week || wk, team: t, points: d.points ? +d.points : null });
        });
        toast(`${db.team(t).manager} chopped`);
      },
    });
  }));

  root.querySelectorAll('[data-unchop]').forEach((b) => b.addEventListener('click', async () => {
    const t = Number(b.dataset.unchop);
    await db.update('minigames', (m) => {
      const G = m.seasons[String(S)].guillotine;
      G.eliminations = G.eliminations.filter((e) => e.team !== t);
      if (G.winner === t) G.winner = null;
    });
    toast('Back in the pool');
  }));

  root.querySelectorAll('[data-crown]').forEach((b) => b.addEventListener('click', async () => {
    const t = Number(b.dataset.crown);
    await db.update('minigames', (m) => { m.seasons[String(S)].guillotine.winner = t; });
    toast(`${db.team(t).manager} survives`);
  }));
}
