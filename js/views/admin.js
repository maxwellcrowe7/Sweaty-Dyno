import { esc, icon, toast, openModal, money, teamTag } from '../util.js';
import * as SL from '../sleeper.js';
import { isConfigured } from '../config.js';

const LEVEL = { warn: 'red', info: '', edit: 'heat' };

export function render(db) {
  const admin = db.isAdmin;
  const issues = db.issues();
  const dirty = db.dirtyKeys();
  const L = db.league;
  const ids = L.sleeper.leagueIds;
  const S = db.season;
  const st = db.get('stats');

  const live = db.live;
  const cloud = Boolean(db.auth);
  const cloudErr = db.cloudError;
  const user = db.auth?.user ?? null;

  return `
  ${cloud ? `
  <div class="card">
    <div class="card-hd">${icon(admin ? 'check' : 'lock')}<h3>Commissioner</h3><div class="spacer"></div>
      <span class="chip ${admin ? 'mint' : ''}">${admin ? 'Signed in' : 'Viewing'}</span></div>
    <div class="card-bd">
      ${!cloudErr && db.missingInCloud?.length ? `<div class="banner" style="margin-bottom:14px">${icon('alert')}
        <div><b>${db.missingInCloud.length} file${db.missingInCloud.length === 1 ? '' : 's'} not in the database yet.</b><br>
        <span class="dim">${esc(db.missingInCloud.join(', '))}</span><br><br>
        Showing the built-in copy. Sign in and hit <b>Publish</b> to upload.</div></div>` : ''}
      ${cloudErr ? `<div class="banner" style="margin-bottom:14px">${icon('alert')}
        <div><b>Not reading from Supabase yet.</b><br>
        <span style="font-family:ui-monospace,monospace;font-size:11.5px">${esc(cloudErr)}</span><br><br>
        Showing the built-in data meanwhile. Sign in below and hit <b>Publish</b> to upload it.</div></div>` : ''}
      ${admin ? `
        <div class="s dim" style="font-size:12.5px;line-height:1.6;margin-bottom:13px">
          Signed in as <b style="color:var(--ink)">${esc(user?.email ?? 'commissioner')}</b>.
          ${live ? `Edit controls are on across the app and every change saves to the database immediately &mdash;
                    the league sees it on their next refresh.`
                 : `Editing is still local until the data is published.`}
        </div>
        ${(!live || db.missingInCloud?.length) ? `<button class="btn primary" data-publish style="width:100%;margin-bottom:9px">
          ${icon('down')} Publish ${live ? 'missing files' : 'local data'} to Supabase</button>
          <div data-pubout class="s dim" style="font-size:12px;margin-bottom:11px"></div>` : ''}
        <button class="btn" data-signout>${icon('lock')} Sign out</button>
      ` : `
        <div class="s dim" style="font-size:12.5px;line-height:1.6;margin-bottom:13px">
          Anyone can read the league without signing in. Sign in to edit &mdash; the database itself
          refuses writes from anyone who hasn't.
        </div>
        <form data-signin>
          <div class="field"><label>Email</label>
            <input name="email" type="email" autocomplete="username" required placeholder="you@example.com"></div>
          <div class="field"><label>Password</label>
            <input name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn primary" type="submit" style="width:100%">${icon('check')} Sign in</button>
          <div data-autherr class="s" style="font-size:12.5px;margin-top:10px;color:var(--red)"></div>
        </form>
      `}
    </div>
  </div>` : `
  <div class="card">
    <div class="card-hd">${icon('lock')}<h3>Edit mode</h3><div class="spacer"></div>
      <label class="toggle"><input type="checkbox" id="adminToggle" ${admin ? 'checked' : ''}><span class="tr"></span></label>
    </div>
    <div class="card-bd">
      <div class="s dim" style="font-size:12.5px;line-height:1.6">
        Turns on the edit controls across the app: tap buy-in cells to mark them paid, add trades and
        waiver claims, set each week's minigame and chop teams from the guillotine.
        Changes save in this browser only &mdash; export below and commit to make them everyone's.
        ${isConfigured() ? '' : '<br><br>Add your Supabase keys in <code>js/config.js</code> to save live instead.'}
      </div>
    </div>
  </div>`}

  ${issues.length ? `
  <div class="section-title">Needs a look</div>
  <div class="card"><div class="card-bd flush"><div class="rows">
    ${issues.map((i) => `<div class="row">
      <span class="chip ${LEVEL[i.level] ?? ''}">${i.level === 'warn' ? 'Fix' : i.level === 'edit' ? 'Unsaved' : 'Info'}</span>
      <div class="grow"><div class="s" style="white-space:normal;font-size:12.5px;color:var(--ink-2)">${esc(i.text)}</div></div>
    </div>`).join('')}
  </div></div></div>` : `
  <div class="card"><div class="card-bd">
    <div class="banner" style="background:rgba(61,220,151,.07);border-color:rgba(61,220,151,.26)">
      ${icon('check')}<div>Everything checks out. No config gaps and nothing unexported.</div></div>
  </div></div>`}

  <div class="section-title">Sleeper</div>
  <div class="card">
    <div class="card-hd">${icon('sync')}<h3>League sync</h3><div class="spacer"></div>
      <span class="chip ${Object.values(ids).some(Boolean) ? 'mint' : ''}">${Object.values(ids).filter(Boolean).length} linked</span></div>
    <div class="card-bd">
      ${db.seasons.map((s) => `
        <div class="field" style="margin-bottom:9px">
          <label>${s} league ID</label>
          <div style="display:flex;gap:8px">
            <input data-lid="${s}" value="${esc(ids[String(s)] || '')}" placeholder="e.g. 1124800000000000000"
              inputmode="numeric" style="flex:1">
            <button class="btn sm" data-test="${s}">Test</button>
          </div>
        </div>`).join('')}
      <div class="s dim" style="font-size:12px;margin:4px 0 14px;line-height:1.6">
        Open your league on sleeper.com &mdash; the ID is the long number in the URL
        (<span class="dimmer">sleeper.com/leagues/<b style="color:var(--heat)">1124…</b>/team</span>).
        Sleeper's read API is public, so nothing here needs a password.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-save-ids>${icon('check')} Save IDs</button>
        <button class="btn primary" data-sync="${S}" ${ids[String(S)] ? '' : 'disabled'}>${icon('down')} Sync ${S} scores</button>
        <button class="btn" data-maxpf="${S}" ${ids[String(S)] ? '' : 'disabled'}>${icon('chart')} Compute Max PF</button>
      </div>
      <div data-syncout class="s dim" style="font-size:12px;margin-top:12px"></div>
      ${st.lastSleeperSync ? `<div class="s dimmer" style="font-size:11.5px;margin-top:6px">Last sync ${esc(st.lastSleeperSync)}</div>` : ''}
    </div>
  </div>

  <div class="section-title">${live ? 'Backup' : 'Save your work'}</div>
  <div class="card">
    <div class="card-hd">${icon('down')}<h3>${live ? 'Export a snapshot' : 'Export'}</h3><div class="spacer"></div>
      ${live ? '<span class="chip mint">saved live</span>'
             : dirty.length ? `<span class="chip heat">${dirty.length} changed</span>` : '<span class="chip">in sync</span>'}</div>
    <div class="card-bd">
      <div class="s dim" style="font-size:12.5px;line-height:1.6;margin-bottom:13px">
        ${live
          ? `Changes save to Supabase as you make them &mdash; there is nothing to commit. Downloading is
             still worth doing occasionally as an offline backup, and the files drop straight back into
             <code>/data</code> if you ever want to run without a backend.`
          : `Download the changed files and drop them into <code>/data</code> in the repo, then commit.
             That's what turns your local edits into what everyone else sees.`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" data-export-all ${dirty.length ? '' : 'disabled'}>
          ${icon('down')} Download changed (${dirty.length})</button>
        <button class="btn" data-export-every>${icon('down')} Download all 8</button>
        <button class="btn" data-copy>${icon('pencil')} Copy changed to clipboard</button>
      </div>
      ${dirty.length ? `<div style="margin-top:14px">
        <div class="s dimmer" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;margin-bottom:7px">Changed</div>
        ${dirty.map((k) => `<span class="chip heat" style="margin:0 4px 4px 0">${esc(k)}.json</span>`).join('')}
        <div style="margin-top:12px"><button class="btn sm ghost" data-revert style="color:var(--red)">Discard local changes</button></div>
      </div>` : ''}
    </div>
  </div>

  <div class="section-title">League settings</div>
  <div class="card"><div class="card-bd">
    <div class="fgrid">
      <div class="field"><label>Buy-in ${S}</label>
        <input data-cfg="buyIn" type="number" value="${L.buyIn[String(S)] ?? 50}"></div>
      <div class="field"><label>Empire set-aside ${S}</label>
        <input data-cfg="empireContribution" type="number" value="${L.empireContribution[String(S)] ?? 150}"></div>
      <div class="field"><label>Empire threshold (pts)</label>
        <input data-cfg="empireThreshold" type="number" value="${L.empireThreshold}"></div>
      <div class="field"><label>Current season</label>
        <select data-cfg="currentSeason">${db.seasons.map((s) =>
          `<option value="${s}" ${s === L.currentSeason ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <button class="btn" data-save-cfg>${icon('check')} Save settings</button>
  </div></div>
  `;
}

const dl = (name, text) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export function mount(root, db) {
  const out = root.querySelector('[data-syncout]');
  const say = (m) => { if (out) out.innerHTML = esc(m); };

  root.querySelector('[data-signin]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const err = f.querySelector('[data-autherr]');
    const btn = f.querySelector('button[type="submit"]');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await db.auth.signIn(f.email.value.trim(), f.password.value);
      toast('Signed in as commissioner');
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false; btn.innerHTML = 'Sign in';
    }
  });

  root.querySelector('[data-publish]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const out = root.querySelector('[data-pubout]');
    btn.disabled = true;
    try {
      await db.publishToCloud((f) => { out.textContent = `Uploading ${f}.json…`; });
      toast('League published to Supabase');
    } catch (ex) {
      out.innerHTML = `<span style="color:var(--red)">${esc(ex.message)}</span>`;
      btn.disabled = false;
    }
  });

  root.querySelector('[data-signout]')?.addEventListener('click', async () => {
    await db.auth.signOut();
    toast('Signed out');
  });

  root.querySelector('#adminToggle')?.addEventListener('change', (e) => {
    db.setAdmin(e.target.checked);
    toast(e.target.checked ? 'Edit mode on' : 'Edit mode off');
  });

  /* ---- sleeper ---- */
  root.querySelector('[data-save-ids]')?.addEventListener('click', async () => {
    await db.update('league', (L) => {
      root.querySelectorAll('[data-lid]').forEach((i) => { L.sleeper.leagueIds[i.dataset.lid] = i.value.trim(); });
    });
    toast('League IDs saved');
  });

  root.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', async () => {
    const id = root.querySelector(`[data-lid="${b.dataset.test}"]`).value.trim();
    if (!id) return toast('Enter an ID first');
    b.disabled = true; say('Checking…');
    try {
      const lg = await SL.league(id);
      const us = await SL.users(id);
      say(`Connected: "${lg.name}" · ${lg.season} · ${lg.total_rosters} teams · ${us.length} users`);
      toast('Sleeper reachable');
    } catch (e) { say(`Could not reach that league — ${e.message}`); toast('Connection failed'); }
    b.disabled = false;
  }));

  root.querySelector('[data-sync]')?.addEventListener('click', async (ev) => {
    const S = Number(ev.currentTarget.dataset.sync);
    const id = db.league.sleeper.leagueIds[String(S)];
    ev.currentTarget.disabled = true;
    try {
      say('Matching rosters…');
      const map = await SL.buildRosterMap(id, db.get('managers'), db.teams(S));
      if (map.unmatched.length)
        say(`Heads up: no manager matched ${map.unmatched.map((u) => u.name).join(', ')}. Add those names to \`aliases\` in managers.json.`);
      const weeks = await SL.completedWeeks(S, db.get('stats').regularSeasonWeeks);
      if (!weeks.length) { say('No completed weeks yet this season.'); ev.currentTarget.disabled = false; return; }
      const rows = [];
      for (const w of weeks) {
        say(`Pulling week ${w} of ${weeks.at(-1)}…`);
        rows.push(...(await SL.fetchWeek(id, w, map.rosterToTeam)));
      }
      await db.update('stats', (s) => {
        s.weekly = s.weekly.filter((x) => x.season !== S);
        for (const r of rows) s.weekly.push({ season: S, week: r.week, team: r.team, points: r.points, opponent: null, result: null });
        s.lastSleeperSync = new Date().toISOString().slice(0, 16).replace('T', ' ');
      });
      say(`Synced ${rows.length} scores across ${weeks.length} weeks. Export stats.json to keep it.`);
      toast(`${S} scores synced`);
    } catch (e) { say(`Sync failed — ${e.message}`); }
    ev.currentTarget.disabled = false;
  });

  root.querySelector('[data-maxpf]')?.addEventListener('click', async (ev) => {
    const S = Number(ev.currentTarget.dataset.maxpf);
    const id = db.league.sleeper.leagueIds[String(S)];
    ev.currentTarget.disabled = true;
    try {
      const map = await SL.buildRosterMap(id, db.get('managers'), db.teams(S));
      const weeks = await SL.completedWeeks(S, db.get('stats').regularSeasonWeeks);
      if (!weeks.length) { say('No completed weeks to compute from.'); ev.currentTarget.disabled = false; return; }
      const totals = await SL.fetchMaxPF(id, weeks, map.rosterToTeam, say);
      await db.update('stats', (s) => {
        s.maxPF = s.maxPF.filter((m) => m.season !== S);
        for (const [team, points] of Object.entries(totals)) s.maxPF.push({ season: S, team: +team, points });
      });
      say(`Max PF computed for ${Object.keys(totals).length} teams over ${weeks.length} weeks.`);
      toast('Max PF updated');
    } catch (e) { say(`Could not compute Max PF — ${e.message}`); }
    ev.currentTarget.disabled = false;
  });

  /* ---- export ---- */
  const files = () => db.exportFiles();
  root.querySelector('[data-export-all]')?.addEventListener('click', () => {
    const dirty = new Set(db.dirtyKeys());
    files().filter((f) => dirty.has(f.name.replace('.json', ''))).forEach((f, i) =>
      setTimeout(() => dl(f.name, f.json), i * 220));
    toast(`Downloading ${dirty.size} file${dirty.size === 1 ? '' : 's'}`);
  });
  root.querySelector('[data-export-every]')?.addEventListener('click', () => {
    files().forEach((f, i) => setTimeout(() => dl(f.name, f.json), i * 220));
    toast('Downloading all data files');
  });
  root.querySelector('[data-copy]')?.addEventListener('click', async () => {
    const dirty = new Set(db.dirtyKeys());
    const picked = files().filter((f) => dirty.has(f.name.replace('.json', '')));
    if (!picked.length) return toast('Nothing changed');
    const text = picked.map((f) => `/* ---- data/${f.name} ---- */\n${f.json}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); toast('Copied'); }
    catch { toast('Clipboard blocked — use Download'); }
  });
  root.querySelector('[data-revert]')?.addEventListener('click', () => {
    openModal({
      title: 'Discard local changes?', confirm: 'Discard', danger: true,
      body: `<p style="margin:0;font-size:13.5px;line-height:1.6">This throws away every edit stored in this
        browser and reloads the committed files in <code>/data</code>. It cannot be undone.</p>`,
      onConfirm: async () => { await db.revert(); toast('Back to the committed data'); },
    });
  });

  /* ---- settings ---- */
  root.querySelector('[data-save-cfg]')?.addEventListener('click', async () => {
    const g = (k) => root.querySelector(`[data-cfg="${k}"]`).value;
    const S = String(db.season);
    await db.update('league', (L) => {
      L.buyIn[S] = +g('buyIn') || 0;
      L.empireContribution[S] = +g('empireContribution') || 0;
      L.empireThreshold = +g('empireThreshold') || 0;
      L.currentSeason = +g('currentSeason');
    });
    toast('Settings saved');
  });
}
