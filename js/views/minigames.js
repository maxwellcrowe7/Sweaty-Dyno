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
  if (!G) return '';
  const gone = new Set(G.eliminations.map((e) => e.team));
  const alive = G.entrants.filter((t) => !gone.has(t));
  const order = [...G.eliminations].sort((a, b) => b.week - a.week);
  return `
  <div class="card">
    <div class="card-hd">
      ${icon('blade')}
      <div><h3>Guillotine</h3><div class="sub">from week ${G.startWeek}</div></div>
      <div class="spacer"></div>
      <span class="chip ${G.winner ? 'gold' : 'heat'}">${money(G.payout?.['1'] || 0)}</span>
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

  if (s.legacy && !s.games.length) {
    const totals = Object.entries(s.legacy.totalsByTeam).sort((a, b) => b[1] - a[1]);
    return `
    <div class="banner" style="margin-bottom:14px">${icon('alert')}
      <div>${esc(s.legacy.note)}</div></div>
    <div class="card">
      <div class="card-hd"><h3>${S} minigame winnings</h3><div class="spacer"></div>
        <span class="chip heat">${money(s.legacy.total)}</span></div>
      <div class="card-bd flush"><div class="rows">
        ${totals.map(([t, v]) => `<div class="row">
          <div class="grow">${teamTag(db.team(Number(t)))}</div>
          <div class="val" style="color:var(--heat)">${money(v)}</div></div>`).join('')}
      </div></div>
    </div>`;
  }

  return `
  <div class="tiles">
    <div class="tile accent"><div class="k">Budget</div><div class="v">${money(spend.committed)}</div><div class="m">${S} minigames</div></div>
    <div class="tile mint"><div class="k">Awarded</div><div class="v">${money(spend.paid)}</div><div class="m">${done} settled</div></div>
    <div class="tile"><div class="k">Still up</div><div class="v">${money(spend.remaining)}</div><div class="m">${s.games.length - done} to play</div></div>
    <div class="tile gold"><div class="k">Guillotine</div><div class="v">${money(s.guillotine?.payout?.['1'] || 0)}</div>
      <div class="m">week ${s.guillotine?.startWeek ?? '--'}</div></div>
  </div>

  <div class="section-title">Weekly slate</div>
  ${s.games.length ? s.games.map((g) => {
    const settled = g.results?.['1']?.team;
    return `<div class="card" style="margin-bottom:10px">
      <div class="card-hd">
        <span class="chip ${settled ? 'mint' : 'ghost'}">WK ${g.week}</span>
        <div style="min-width:0">
          <h3 style="font-size:15px;${g.name ? '' : 'color:var(--ink-3)'}">${g.name ? esc(g.name) : 'Not set yet'}</h3>
          ${g.rules ? `<div class="sub" style="text-transform:none;letter-spacing:0;font-size:11.5px">${esc(g.rules)}</div>` : ''}
        </div>
        <div class="spacer"></div>
        ${admin ? `<button class="btn sm" data-edit="${g.id}">${icon(g.name ? 'pencil' : 'plus')}</button>` : ''}
      </div>
      ${settled || Object.values(g.payout || {}).some((v) => v > 0)
        ? `<div class="card-bd" style="padding-top:4px;padding-bottom:4px">
            ${['1', '2', '3'].map((p) => resultRow(db, g, p)).join('')}</div>`
        : ''}
    </div>`;
  }).join('') : empty('No slate yet', `Add this season's minigames in Admin, or turn on edit mode to build the schedule week by week.`, 'dice')}

  <div class="section-title">Elimination</div>
  ${guillotineCard(db, s.guillotine, S, admin)}
  `;
}

export function mount(root, db) {
  const S = db.season;
  const teams = db.teams(S);

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
        <div class="section-title" style="margin-top:2px">Result</div>
        ${['1', '2', '3'].map((p) => `
          <div class="fgrid" style="grid-template-columns:1fr 1fr">
            <div class="field"><label>${PLACES[p]}</label>
              <select name="team${p}">${teamOptions(teams, r(p).team ?? '')}</select></div>
            <div class="field"><label>What won it</label>
              <input name="val${p}" value="${esc(r(p).value || '')}" placeholder="player / score / note"></div>
          </div>`).join('')}`,
      onConfirm: async (d) => {
        await db.update('minigames', (m) => {
          const gg = m.seasons[String(S)].games.find((x) => x.id === g.id);
          gg.name = d.name.trim() || null;
          gg.rules = d.rules.trim() || null;
          gg.payout = { 1: +d.pay1 || 0, 2: +d.pay2 || 0, 3: +d.pay3 || 0 };
          gg.results = {};
          for (const p of ['1', '2', '3'])
            gg.results[p] = d[`team${p}`] ? { team: +d[`team${p}`], value: d[`val${p}`].trim() || null } : null;
          gg.status = gg.results['1']?.team ? 'final' : 'scheduled';
        });
        syncPayouts(db, S);
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
    syncPayouts(db, S);
    toast(`${db.team(t).manager} survives`);
  }));
}

/**
 * Rebuild the season's `minigame` payout lines from the minigame results, so the
 * bank always agrees with what was actually awarded. Legacy seasons are left alone.
 */
export async function syncPayouts(db, season) {
  const s = db.minigames(season);
  if (s.legacy) return;
  const tally = {};
  const add = (team, amt) => { if (team && amt) tally[team] = (tally[team] || 0) + amt; };
  for (const g of s.games)
    for (const p of ['1', '2', '3']) add(g.results?.[p]?.team, Number(g.payout?.[p]) || 0);
  if (s.guillotine?.winner) add(s.guillotine.winner, Number(s.guillotine.payout?.['1']) || 0);

  await db.update('bank', (b) => {
    b.payouts = b.payouts.filter((p) => !(p.season === season && p.category === 'minigame'));
    for (const [team, amount] of Object.entries(tally))
      b.payouts.push({
        id: `po-${season}-mg-${team}`, season, team: +team, category: 'minigame',
        amount, label: 'Minigame winnings', paid: true, date: null, note: null,
      });
  });
}
