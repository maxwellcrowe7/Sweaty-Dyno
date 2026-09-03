import { db } from './db.js';
import { $, el, icon, esc, toast } from './util.js';

import * as Dashboard from './views/dashboard.js';
import * as Bank      from './views/bank.js';
import * as Minigames from './views/minigames.js';
import * as Drafts    from './views/drafts.js';
import * as Trades    from './views/trades.js';
import * as Rules     from './views/rules.js';
import * as Stats     from './views/stats.js';
import * as Empire    from './views/empire.js';
import * as Managers  from './views/managers.js';
import * as Admin     from './views/admin.js';

const VIEWS = {
  home:      { label: 'Home',      icon: 'home',   mod: Dashboard, primary: true },
  bank:      { label: 'Bank',      icon: 'wallet', mod: Bank,      primary: true },
  minigames: { label: 'Games',     icon: 'dice',   mod: Minigames, primary: true },
  drafts:    { label: 'Draft',     icon: 'board',  mod: Drafts,    primary: true },
  trades:    { label: 'Trades',    icon: 'swap',   mod: Trades },
  rules:     { label: 'Rules',     icon: 'book',   mod: Rules },
  stats:     { label: 'Stats',     icon: 'chart',  mod: Stats },
  empire:    { label: 'Empire',    icon: 'crown',  mod: Empire },
  managers:  { label: 'Managers',  icon: 'users',  mod: Managers },
  admin:     { label: 'Admin',     icon: 'cog',    mod: Admin },
};
const PRIMARY = Object.keys(VIEWS).filter((k) => VIEWS[k].primary);

const state = { view: 'home', params: {} };
const setState = (patch) => { Object.assign(state, patch); paint(); };

/** `#/rules?year=2026&tab=changes&sec=waivers` -> { view, params }.
    Keeping view state in the URL makes sections linkable and the back button work. */
const parseHash = () => {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return {
    view: VIEWS[path] ? path : 'home',
    params: Object.fromEntries(new URLSearchParams(qs || '')),
  };
};
const routeFromHash = () => parseHash().view;

const go = (view, params = null) => {
  if (!VIEWS[view]) return;
  const q = params && Object.keys(params).length
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()
    : '';
  location.hash = `#/${view}${q}`;
  closeSheet();
};

/* ---------- chrome ---------- */
const brand = () => `
  <div class="brand">
    <div class="mark">SD</div>
    <div class="txt"><h1>${esc(db.league.name)}</h1><small>${esc(db.league.tagline)}</small></div>
  </div>`;

function navButtons(keys, cls = '') {
  return keys.map((k) => `<button class="${cls}" data-view="${k}"
    ${state.view === k ? 'aria-current="page"' : ''}>${icon(VIEWS[k].icon)}<span>${VIEWS[k].label}</span></button>`).join('');
}

function shell() {
  document.getElementById('boot-fallback')?.remove();
  document.body.innerHTML = `
  <div class="app">
    <nav class="sidenav" aria-label="Sections">
      ${brand()}
      ${navButtons(Object.keys(VIEWS))}
    </nav>
    <div class="col">
      <header class="topbar">
        ${brand()}
        <div class="season-pick">
          <label for="seasonSel">Season</label>
          <select id="seasonSel" aria-label="Season">
            ${db.seasons.map((s) => `<option value="${s}" ${s === db.season ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </header>
      <main id="main"></main>
    </div>
  </div>
  <nav class="tabbar" aria-label="Sections">
    ${navButtons(PRIMARY)}
    <button data-sheet>${icon('more')}<span>More</span></button>
  </nav>
  <div class="sheet-backdrop" id="sheetBd"></div>
  <div class="sheet" id="sheet" role="dialog" aria-label="More sections">
    <div class="grab"></div>
    ${Object.keys(VIEWS).filter((k) => !VIEWS[k].primary)
      .map((k) => `<button class="sheet-item" data-view="${k}"
        ${state.view === k ? 'aria-current="page"' : ''}>${icon(VIEWS[k].icon)}${VIEWS[k].label}</button>`).join('')}
  </div>`;

  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) go(b.dataset.view);
    if (e.target.closest('[data-sheet]')) openSheet();
  });
  $('#sheetBd').addEventListener('click', closeSheet);
  $('#seasonSel').addEventListener('change', (e) => { db.season = Number(e.target.value); });
}

const openSheet  = () => { $('#sheet').classList.add('open'); $('#sheetBd').classList.add('open'); };
const closeSheet = () => { $('#sheet')?.classList.remove('open'); $('#sheetBd')?.classList.remove('open'); };

/* ---------- render ---------- */
function paint() {
  const v = VIEWS[state.view];
  const main = $('#main');
  if (!main) return;
  if (main._spy) { window.removeEventListener('scroll', main._spy); main._spy = null; }
  try {
    main.innerHTML = v.mod.render(db, state);
    v.mod.mount?.(main, db, go, setState, state.params || {});
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="card"><div class="card-bd">
      <div class="banner">${icon('alert')}<div><b>${esc(v.label)} hit an error.</b><br>
      <span style="font-family:ui-monospace,monospace;font-size:11.5px">${esc(err.message)}</span></div></div></div></div>`;
  }
  document.querySelectorAll('[data-view]').forEach((b) => {
    if (b.dataset.view === state.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  const sel = $('#seasonSel');
  if (sel && Number(sel.value) !== db.season) sel.value = db.season;
  // Only jump to the top when the section actually changed. Expanding a row or
  // switching a tab within a view must leave the reader where they were.
  if (paint._last !== state.view) {
    paint._last = state.view;
    main.scrollTop = 0;
    window.scrollTo({ top: 0 });
  }
}

/* ---------- boot ---------- */
(async function boot() {
  try {
    await db.init();
  } catch (err) {
    document.getElementById('boot-fallback')?.remove();
    document.body.innerHTML = `<div style="max-width:520px;margin:16vh auto;padding:26px;font-family:system-ui;color:#EAF0F6">
      <h1 style="font-size:22px;margin-bottom:10px">Couldn't load the league data</h1>
      <p style="color:#A9B6C6;line-height:1.6;font-size:14px">${esc(err.message)}</p>
      ${globalThis.__SD_DATA ? '' : `<p style="color:#6D7C8E;line-height:1.6;font-size:13px">This app uses ES modules and
      <code>fetch</code>, so it has to be served over http — opening <code>index.html</code> straight off the disk
      won't work. Run <code style="color:#FF6B2C">python3 -m http.server 8000</code> in this folder and visit
      <code>localhost:8000</code>, or double-click <code>sweaty-dyno.html</code> instead.</p>`}</div>`;
    return;
  }
  Object.assign(state, parseHash());
  shell();
  paint();
  window.addEventListener('hashchange', () => setState(parseHash()));
  db.on(() => {
    const sel = $('#seasonSel');
    if (sel) sel.value = db.season;
    paint();
  });
})();
