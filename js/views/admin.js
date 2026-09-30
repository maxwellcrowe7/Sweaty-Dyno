import { esc, icon, toast, openModal, money, teamTag, fmtDate, currencyField } from '../util.js';
import * as SL from '../sleeper.js';
import { pullSeason } from '../autosync.js';
import { isConfigured } from '../config.js';

const LEVEL = { warn: 'red', info: '', edit: 'heat' };

/* Which season windows are open. Survives a repaint, so saving one year does
   not slam every other year shut. */
const WIN_OPEN = new Set();
/* Whether the Season windows card itself is unfolded. */
const WIN_CARD = { open: false };

/* League IDs already checked quietly this session, so a repaint (or an offline
   Sleeper) does not set the same check off again and again. */
const ID_TRIED = new Set();

export function render(db) {
  const admin = db.isAdmin;
  const issues = db.issues();
  const dirty = db.dirtyKeys();
  const L = db.league;
  const ids = L.sleeper.leagueIds;
  const S = db.season;
  const cur = db.currentSeason;
  const st = db.get('stats');

  const live = db.live;
  const cloud = Boolean(db.auth);
  const cloudErr = db.cloudError;
  const user = db.auth?.user ?? null;

  // what only a signed-in commissioner is told: storage trouble, and the
  // one-off publish of local data. With neither, the card is just its header.
  const notes = !admin ? '' : `
      ${!cloudErr && db.missingInCloud?.length ? `<div class="banner">${icon('alert')}
        <div><b>${db.missingInCloud.length} file${db.missingInCloud.length === 1 ? '' : 's'} not in the database yet.</b><br>
        <span class="dim">${esc(db.missingInCloud.join(', '))}</span><br><br>
        Showing the built-in copy. Hit <b>Publish</b> to upload.</div></div>` : ''}
      ${cloudErr ? `<div class="banner">${icon('alert')}
        <div><b>Not reading from Supabase yet.</b><br>
        <span style="font-family:ui-monospace,monospace;font-size:11.5px">${esc(cloudErr)}</span><br><br>
        Showing the built-in data meanwhile. Hit <b>Publish</b> to upload it.</div></div>` : ''}
      ${!live ? `<button class="btn primary" data-publish style="width:100%">
        ${icon('down')} Publish local data to Supabase</button>
        <div data-pubout class="s dim" style="font-size:12px"></div>` : ''}`.trim();

  const signIn = `
  ${cloud ? admin ? `
  <div class="card">
    ${/* who you are and the way out, on the header line itself */''}
    <div class="card-hd">${icon('check')}
      <div class="adm-id"><h3>Commissioner</h3>
        <span class="adm-who"><span class="adm-pre">Signed in as </span><b>${esc(user?.email ?? 'commissioner')}</b></span></div>
      <button class="btn sm" data-signout>${icon('lock')} Sign out</button></div>
    ${notes ? `<div class="card-bd adm-notes">${notes}</div>` : ''}
  </div>` : `
  <div class="card">
    <div class="card-hd">${icon('lock')}<h3>Commissioner sign-in</h3></div>
    <div class="card-bd">
      <div class="s dim" style="font-size:12.5px;line-height:1.6;margin-bottom:13px">
        Anyone can view the league without signing in.</div>
      <form data-signin>
        <div class="field"><label>Email</label>
          <input name="email" type="email" autocomplete="username" required placeholder="you@example.com"></div>
        <div class="field"><label>Password</label>
          <input name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit" style="width:100%">${icon('check')} Sign in</button>
        <div data-autherr class="s" style="font-size:12.5px;margin-top:10px;color:var(--red)"></div>
      </form>
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
  </div>`}`;

  // The switch into the guest preview. The way back out is the guest bar, which
  // app.js draws on every page while previewing, so this only shows beforehand.
  const guestCard = `
  ${db.hasAdminRights ? `
  <div class="section-title">View as</div>
  <div class="card">
    <div class="card-hd">${icon('users')}
      <div class="adm-id"><h3>Guest preview</h3><span class="adm-who">See the app as the league sees it</span></div>
      <label class="toggle"><input type="checkbox" id="guestToggle" aria-label="See the app as the league sees it">
        <span class="tr"></span></label></div>
  </div>` : ''}`;

  // Until you are signed in, Admin is the sign-in and nothing else: no issues
  // list, no data, no Sleeper controls. Previewing as a guest shows exactly that.
  if (!admin) return signIn;

  return `${signIn}
  ${guestCard}

  ${issues.length ? `
  <div class="section-title">Needs a look</div>
  <div class="card"><div class="card-bd flush"><div class="rows">
    ${issues.map((i) => `<div class="row">
      <span class="chip ${LEVEL[i.level] ?? ''}">${i.level === 'warn' ? 'Fix' : i.level === 'edit' ? 'Unsaved' : 'Info'}</span>
      <div class="grow"><div class="s" style="white-space:normal;font-size:12.5px;color:var(--ink-2)">${esc(i.text)}</div></div>
    </div>`).join('')}
  </div></div></div>` : ''}

  ${/* all-clear notices say nothing you need to act on, so Admin only speaks
       up when something is wrong: problems above, a lost connection here */''}
  ${live ? '' : `
  <div class="card" style="margin-bottom:14px">
    <div class="card-bd" style="padding:13px 16px">
      <div class="conn">
        <span class="conn-dot ${live ? 'on' : 'off'}"></span>
        <div>
          <div class="conn-main">${live
            ? 'Reading and writing the Supabase database'
            : cloud ? 'Not reaching the database — showing the built-in copy'
            : 'Running on the built-in copy (no database configured)'}</div>
          <div class="conn-sub">${live
            ? (admin ? 'Your edits save straight away and the league sees them on their next refresh.'
                     : 'Sign in below to edit. Everyone can read without signing in.')
            : 'Edits stay in this browser until the data reaches the database.'}</div>
        </div>
      </div>
    </div>
  </div>`}

  ${/* The database is the live copy; the site ships a copy of its own. This
       compares them and stays one quiet line: a missing file can be added
       (safe -- the database has nothing there to lose), and a repair that
       overwrites live edits is on purpose only, behind a warning. */''}
  ${cloud ? `
  <div class="section-title">Database</div>
  <div class="card">
    <div class="card-hd">${icon('sync')}
      <div class="adm-id"><h3>Seed &amp; repair</h3><span class="adm-who" data-diffline>Checking&hellip;</span></div>
      <button class="btn sm primary" data-seed hidden>${icon('down')} Add missing</button>
      <button class="btn sm ghost" data-repair hidden>Repair</button></div>
  </div>
  <div data-pushout class="s dim" style="font-size:12px;margin:-6px 2px 0"></div>` : ''}

  <div class="section-title">Sleeper</div>
  <div class="card">
    <div class="card-hd">${icon('sync')}<h3>League sync</h3><div class="spacer"></div>
      <span class="chip ${Object.values(ids).some(Boolean) ? 'mint' : ''}">${Object.values(ids).filter(Boolean).length} linked</span></div>
    <div class="card-bd">
      ${/* An ID saves the moment you leave the box and is checked against Sleeper
           there and then. One that checked out wears a tick (its league's name
           on hover); an empty or unchecked one keeps its Test button. */''}
      ${db.seasons.map((s) => {
        const id = ids[String(s)] || '';
        const ok = id && L.sleeper.verified?.[String(s)]?.id === id ? L.sleeper.verified[String(s)] : null;
        return `
        <div class="field" style="margin-bottom:9px">
          <label>${s} league ID</label>
          <div class="lid-in">
            <input data-lid="${s}" value="${esc(id)}" placeholder="Not set yet"
              inputmode="numeric" style="flex:1">
            ${ok ? `<span class="lid-ok" title="${esc(ok.name)} on Sleeper" aria-label="Linked: ${esc(ok.name)}">${icon('check')}</span>`
              : `<button class="btn sm" data-test="${s}">Test</button>`}
          </div>
        </div>`;
      }).join('')}
      <div class="adm-pull">
        <button class="btn primary" data-pull="${S}" ${ids[String(S)] ? '' : 'disabled'}>${icon('down')} Pull ${S} from Sleeper</button>
        ${st.lastSleeperSync ? `<span class="s dimmer">Last sync ${esc(st.lastSleeperSync)}</span>` : ''}
      </div>
      <div data-syncout class="s dim" style="font-size:12px;margin-top:10px"></div>
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

  ${/* what each season costs a team, and what of it goes to the empire. Set
       here and only here -- the Bank shows it but does not edit it */''}
  <div class="section-title">Buy-ins</div>
  <div class="card"><div class="card-bd flush">
    <div class="bi-grid">
      ${/* per team, then what that makes across the league, then the share of
           it set aside -- so the empire figure reads as part of a whole */''}
      <span class="bi-k">Season</span><span class="bi-k">Per team</span><span class="bi-k">Total</span><span class="bi-k"><span class="bi-long">To the </span>empire</span>
      ${db.seasons.map((y) => `
        <span class="bi-y">${y}${y === cur ? '<span class="chip mint now-tag">Current</span>' : ''}</span>
        <input class="bi-in" type="text" inputmode="decimal" data-buyin="${y}"
          value="${money(db.buyIn(y))}" aria-label="${y} buy-in per team">
        <span class="bi-tot" title="${db.teams(y).length} teams">${money(db.buyIn(y) * db.teams(y).length)}</span>
        <input class="bi-in" type="text" inputmode="decimal" data-setaside="${y}"
          value="${money(Number(L.empireContribution[String(y)]) || 0)}" aria-label="${y} empire set-aside">`).join('')}
    </div>
  </div></div>

  <div class="section-title">League settings</div>
  <div class="card"><div class="card-bd">
    <div class="fgrid">
      <div class="field"><label>Empire threshold (pts)</label>
        <input data-cfg="empireThreshold" type="number" value="${L.empireThreshold}"></div>
      ${/* a role, marked on the Managers tab -- not a permission, which the
           database decides */''}
      <div class="field"><label>Commissioner</label>
        <select data-cfg="commissioner">
          <option value="">&mdash;</option>
          ${db.get('managers').managers.slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => `<option value="${esc(m.id)}" ${
              m.id === L.commissioner ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select></div>
    </div>
  </div></div>

  ${/* the dates each season's transactions are filed by -- and so which season
       is current. Folded away until you come to move one. */''}
  <div class="card win-card${WIN_CARD.open ? ' open' : ''}">
    <button class="card-hd win-card-hd" data-wincard aria-expanded="${WIN_CARD.open}">${icon('clock')}
      <div class="adm-id"><h3>Season windows</h3><span class="adm-who">${cur} is current</span></div>
      ${icon('chev', 'acc-caret')}</button>
    <div class="card-bd">
      <div class="s dim" style="font-size:12px;margin-bottom:12px;line-height:1.6">
        A transaction is filed under whichever window its date falls in, so an offseason
        trade lands in the season it was made for rather than the one it interrupted.
        The season whose window holds today is the current one.
      </div>
      ${/* one year at a time: six seasons of four dates is a wall of boxes, and
           you only ever come here to move one boundary. */''}
      ${db.seasons.map((y) => { const w = db.seasonWindow(y); const open = WIN_OPEN.has(y); return `
        <div class="win-row${open ? ' open' : ''}">
          <button class="win-hd" data-winyear="${y}" aria-expanded="${open}">
            ${icon('chev', 'acc-caret')}
            <span class="win-y">${y}</span>
            ${y === cur ? '<span class="chip mint now-tag">Current</span>' : ''}
            <span class="win-sum">${esc(fmtDate(w.start))} &rarr; ${esc(fmtDate(w.end))}</span>
          </button>
          <div class="win-bd">
          <div class="fgrid four">
            <div class="field"><label>Preseason opens</label>
              <input type="date" data-win="${y}" data-part="start" value="${esc(w.start)}"></div>
            <div class="field"><label>Preseason closes</label>
              <input type="date" data-win="${y}" data-part="preseasonEnd" value="${esc(w.preseasonEnd)}"></div>
            ${/* shown, not asked for: it is always the morning after the close,
                 and seeing it beats being told the rule */''}
            <div class="field"><label>Season opens</label>
              <input type="date" data-derived="${y}" value="${esc(db.inSeasonStart(y))}" disabled
                title="The day after the preseason closes"></div>
            <div class="field"><label>Season closes</label>
              <input type="date" data-win="${y}" data-part="end" value="${esc(w.end)}"></div>
          </div></div>
        </div>`; }).join('')}
    </div>
  </div>
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

  /* Database sync: compare, then push what differs. */
  const line = root.querySelector('[data-diffline]');
  const seedBtn = root.querySelector('[data-seed]');
  const repairBtn = root.querySelector('[data-repair]');
  const pushOut = root.querySelector('[data-pushout]');
  const fileChips = (keys) => keys.map((k) => `<span class="chip heat" style="margin:0 4px 4px 0">${esc(k)}.json</span>`).join('');
  const push = async (keys) => {
    try {
      await db.publishToCloud(keys, (f) => { pushOut.textContent = `Pushing ${f}.json…`; });
      pushOut.innerHTML = `<span style="color:var(--mint)">Updated ${keys.length} file${keys.length === 1 ? '' : 's'}. The league sees it on their next refresh.</span>`;
      toast('Database updated');
    } catch (ex) {
      pushOut.innerHTML = `<span style="color:var(--red)">${esc(ex.message)}</span>`;
    }
  };
  if (line) {
    db.cloudDiff().then((diff) => {
      const missing = diff.filter((d) => d.missing).map((d) => d.key);
      const differs = diff.filter((d) => !d.missing).map((d) => d.key);
      line.textContent = missing.length
        ? `${missing.length} file${missing.length === 1 ? '' : 's'} not in the database yet`
        : differs.length ? 'Live edits since the site copy' : 'Matches the site copy';
      if (missing.length && seedBtn) {
        seedBtn.hidden = false;
        seedBtn.addEventListener('click', () => { seedBtn.disabled = true; push(missing); });
      }
      if (differs.length && repairBtn) {
        repairBtn.hidden = false;
        repairBtn.addEventListener('click', () => openModal({
          title: 'Repair the database?',
          confirm: `Overwrite ${differs.length} file${differs.length === 1 ? '' : 's'}`,
          danger: true,
          body: `<p style="margin:0 0 10px;font-size:13.5px;line-height:1.6">
              <b>Nothing is wrong.</b> The league's data lives in two places: the database, which is the
              live copy every edit in the app saves to, and a copy that ships with the site, a snapshot
              from when it was last updated. As the season goes on the two drift apart &mdash; every buy-in
              marked paid, minigame result and chop lands in the database only. That is how it is meant
              to work.</p>
            <p style="margin:0 0 10px;font-size:13.5px;line-height:1.6">Repair replaces the database copy of
              these files with the site's snapshot:</p>
            <p style="margin:0 0 12px">${fileChips(differs)}</p>
            <p style="margin:0;font-size:12.5px;line-height:1.6;color:var(--red)">
              Anything edited in the app since that snapshot is lost from these files. Only use it if the
              database has been broken and you want the snapshot back.</p>
            <p style="margin:8px 0 0;font-size:12px;color:var(--ink-3)">Supabase keeps every earlier version, so this can be undone from the database if needed.</p>`,
          onConfirm: () => push(differs),
        }));
      }
    }).catch((e) => { line.textContent = `Check failed: ${e.message}`; });
  }

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

  root.querySelector('#guestToggle')?.addEventListener('change', (e) => {
    // no toast: the guest bar appears at once and says the same thing
    db.setAsGuest(e.target.checked);
  });

  root.querySelector('#adminToggle')?.addEventListener('change', (e) => {
    db.setAdmin(e.target.checked);
    toast(e.target.checked ? 'Edit mode on' : 'Edit mode off');
  });

  /* ---- sleeper ---- */
  /* League IDs: saved on leaving the box, then checked. A check that passes is
     remembered against that exact ID, so the tick survives a reload and goes
     the moment the ID changes. A league from another season does not pass. */
  const check = async (season, id, { quiet = false } = {}) => {
    if (!quiet) say('Checking…');
    try {
      const lg = await SL.league(id);
      if (String(lg.season) !== String(season)) throw new Error(`that league is the ${lg.season} season`);
      await db.update('league', (L) => {
        L.sleeper.verified = { ...(L.sleeper.verified || {}), [season]: { id, name: lg.name } };
      });
      if (!quiet) toast(`${season} linked: ${lg.name}`);
    } catch (e) {
      if (!quiet) { say(`Could not use that ${season} ID — ${e.message}`); toast('Connection failed'); }
    }
  };
  root.querySelectorAll('[data-lid]').forEach((i) => i.addEventListener('change', async () => {
    const season = i.dataset.lid, id = i.value.trim();
    await db.update('league', (L) => {
      L.sleeper.leagueIds[season] = id;
      if (L.sleeper.verified?.[season] && L.sleeper.verified[season].id !== id) delete L.sleeper.verified[season];
    });
    if (id) check(season, id);
  }));
  root.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', () => {
    const id = root.querySelector(`[data-lid="${b.dataset.test}"]`).value.trim();
    if (!id) return toast('Enter an ID first');
    b.disabled = true;
    check(b.dataset.test, id).finally(() => { b.disabled = false; });
  }));
  // saved IDs that were never checked get checked quietly, once, on opening
  if (db.isAdmin) for (const [season, id] of Object.entries(db.league.sleeper.leagueIds || {})) {
    if (id && db.league.sleeper.verified?.[season]?.id !== id && !ID_TRIED.has(`${season}:${id}`)) {
      ID_TRIED.add(`${season}:${id}`);
      check(season, id, { quiet: true });
    }
  }

  /* toggled in place rather than through a repaint: a half-typed date in another
     year would not survive one */
  root.querySelectorAll('[data-winyear]').forEach((b) => b.addEventListener('click', () => {
    const y = Number(b.dataset.winyear);
    const row = b.closest('.win-row');
    const open = !row.classList.contains('open');
    row.classList.toggle('open', open);
    b.setAttribute('aria-expanded', String(open));
    if (open) WIN_OPEN.add(y); else WIN_OPEN.delete(y);
  }));

  /* the derived date follows the close as you change it, so you never save a
     window and only then find out where the season actually starts */
  root.querySelectorAll('[data-part="preseasonEnd"]').forEach((i) => i.addEventListener('input', () => {
    const out = root.querySelector(`[data-derived="${i.dataset.win}"]`);
    if (!out || !i.value) return;
    const d = new Date(`${i.value}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    out.value = d.toISOString().slice(0, 10);
  }));

  /* windows, buy-ins and settings save the moment a value is committed --
     no Save buttons, as with the league IDs */
  root.querySelector('[data-wincard]')?.addEventListener('click', (e) => {
    WIN_CARD.open = !WIN_CARD.open;
    e.currentTarget.closest('.win-card').classList.toggle('open', WIN_CARD.open);
    e.currentTarget.setAttribute('aria-expanded', String(WIN_CARD.open));
  });
  root.querySelectorAll('[data-win]').forEach((i) => i.addEventListener('change', async () => {
    if (!i.value) return;
    const y = i.dataset.win;
    await db.update('league', (L) => {
      L.seasonWindows = L.seasonWindows || {};
      L.seasonWindows[y] = { ...db.seasonWindow(y), ...(L.seasonWindows[y] || {}), [i.dataset.part]: i.value };
    });
    toast(`${y} window saved`);
  }));
  root.querySelectorAll('[data-buyin]').forEach((inp) => {
    const y = inp.dataset.buyin;
    currencyField(inp, () => db.buyIn(y), async (val) => {
      await db.update('league', (L) => { L.buyIn[y] = val; });
      toast(`${y} buy-in set to ${money(val)}`);
    });
  });
  root.querySelectorAll('[data-setaside]').forEach((inp) => {
    const y = inp.dataset.setaside;
    currencyField(inp, () => Number(db.league.empireContribution[y]) || 0, async (val) => {
      await db.update('league', (L) => { L.empireContribution[y] = val; });
      toast(`${y} empire set-aside ${money(val)}`);
    });
  });

  /* One errand, one roster map, one download of the player file. */
  root.querySelector('[data-pull]')?.addEventListener('click', async (ev) => {
    const S = Number(ev.currentTarget.dataset.pull);
    ev.currentTarget.disabled = true;
    try {
      say(await pullSeason(db, S, say));
      toast(`${S} pulled`);
    } catch (e) { say(`Pull failed — ${e.message}`); toast('Pull failed'); }
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
  root.querySelectorAll('[data-cfg]').forEach((i) => i.addEventListener('change', async () => {
    const k = i.dataset.cfg;
    await db.update('league', (L) => {
      L[k] = k === 'commissioner' ? (i.value || null) : (+i.value || 0);
    });
    toast('Saved');
  }));
}
