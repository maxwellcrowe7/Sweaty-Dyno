import { db } from './db.js';
import * as Auto from './autosync.js';
import { $, el, icon, esc, toast } from './util.js';

import * as Dashboard from './views/dashboard.js';
import * as Bank      from './views/bank.js';
import * as Minigames from './views/minigames.js';
import * as Drafts    from './views/drafts.js';
import * as Trades    from './views/transactions.js';
import * as Rules     from './views/rules.js';
import * as Stats     from './views/stats.js';
import * as Empire    from './views/empire.js';
import * as Managers  from './views/managers.js';
import * as Admin     from './views/admin.js';

const VIEWS = {
  home:      { label: 'Home',      icon: 'home',   mod: Dashboard, primary: true },
  bank:      { label: 'Bank',      icon: 'wallet', mod: Bank,      primary: true },
  minigames: { label: 'Games',     icon: 'dice',   mod: Minigames, primary: true },
  drafts:    { label: 'Drafts',    icon: 'board',  mod: Drafts,    primary: true },
  trades:    { label: 'Transactions', icon: 'swap', mod: Trades },
  rules:     { label: 'Rules',     icon: 'book',  mod: Rules },
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
    <div class="mark" role="img" aria-label="Sweaty Dyno"></div>
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
  // The picker is rendered by whichever view is season-scoped, so listen once
  // here by delegation rather than rewiring it on every paint.
  document.body.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-season]');
    if (sel) db.season = Number(sel.value);
  });

  /* Our own dropdowns, wired once by delegation. They exist because a native
     <select> lets the OS put its popup wherever it likes -- usually over the
     control -- and these sit at the top of a page where that reads badly. */
  const shutPickers = (except = null) => {
    document.querySelectorAll('[data-pick]').forEach((p) => {
      if (p === except) return;
      p.querySelector('[data-pick-menu]').hidden = true;
      p.querySelector('[data-pick-btn]')?.setAttribute('aria-expanded', 'false');
    });
  };
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-btn]');
    const opt = e.target.closest('[data-pick-val]');
    shutPickers(btn || opt ? e.target.closest('[data-pick]') : null);
    if (btn) {
      const menu = btn.closest('[data-pick]').querySelector('[data-pick-menu]');
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    if (!opt) return;
    // write through to the real control, so anything listening for `change`
    // never learns this was not a select
    const pick = opt.closest('[data-pick]');
    const sel = pick.querySelector('.pick-native');
    pick.querySelector('[data-pick-menu]').hidden = true;
    pick.querySelector('[data-pick-btn]').setAttribute('aria-expanded', 'false');
    if (sel.value === opt.dataset.pickVal) return;
    sel.value = opt.dataset.pickVal;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') shutPickers(); });
}

const openSheet  = () => { $('#sheet').classList.add('open'); $('#sheetBd').classList.add('open'); };
const closeSheet = () => { $('#sheet')?.classList.remove('open'); $('#sheetBd')?.classList.remove('open'); };


/* ============================================================
   COLLAPSIBLE SECTIONS
   Every top-level `.section-title` gets its following siblings wrapped and
   becomes a real toggle. Done here rather than in each view so no section
   can be missed, and so the marker only ever appears where it works.
   Collapsed state is remembered per view.
   ============================================================ */
const COLLAPSE_KEY = 'sweatydyno:collapsed:v1';

const readCollapsed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); }
  catch { return new Set(); }
};
const writeCollapsed = (set) => {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
};

function wireSections(main, view) {
  const collapsed = readCollapsed();
  // direct children only: titles nested inside cards or modals are labels, not sections
  for (const title of [...main.children].filter((n) => n.classList?.contains('section-title'))) {
    const body = document.createElement('div');
    body.className = 'sec-body';
    let n = title.nextElementSibling;
    while (n && !n.classList.contains('section-title')) {
      const next = n.nextElementSibling;
      body.appendChild(n);
      n = next;
    }
    if (!body.childElementCount) continue;   // nothing to collapse — leave it inert
    title.after(body);

    if (!title.querySelector('.sec-mark')) {
      const mark = document.createElement('i');
      mark.className = 'sec-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = '<b></b><b></b>';
      title.prepend(mark);
    }

    const key = `${view}|${title.textContent.trim().slice(0, 40)}`;
    const set = (open) => {
      title.setAttribute('aria-expanded', String(open));
      title.querySelector('.sec-mark')?.classList.toggle('open', open);
      body.hidden = !open;
    };
    set(!collapsed.has(key));

    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    const toggle = () => {
      const open = title.getAttribute('aria-expanded') !== 'true';
      set(open);
      const c = readCollapsed();
      open ? c.delete(key) : c.add(key);
      writeCollapsed(c);
    };
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }
}

/* ---------- info popovers ----------
   One handler for every `info()` button. Hover on pointer devices, tap
   elsewhere; Escape and an outside tap close it. */
let infoPop = null;
const closeInfo = () => { infoPop?.remove(); infoPop = null; };

function showInfo(btn) {
  closeInfo();
  const pop = el('div', { class: 'info-pop', role: 'tooltip' });
  pop.textContent = btn.dataset.info;
  document.body.appendChild(pop);
  infoPop = pop;

  const r = btn.getBoundingClientRect();
  const w = Math.min(280, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  pop.style.left = `${left}px`;
  // flip above when there is no room below
  const below = window.innerHeight - r.bottom;
  if (below < pop.offsetHeight + 16) {
    pop.style.top = `${r.top + window.scrollY - pop.offsetHeight - 8}px`;
  } else {
    pop.style.top = `${r.bottom + window.scrollY + 8}px`;
  }
  requestAnimationFrame(() => pop.classList.add('show'));
}

function wireInfo(root) {
  const canHover = window.matchMedia?.('(hover: hover)').matches;
  root.querySelectorAll('[data-info]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      infoPop && infoPop._for === btn ? closeInfo() : (showInfo(btn), infoPop._for = btn);
    });
    if (canHover) {
      btn.addEventListener('mouseenter', () => { showInfo(btn); infoPop._for = btn; });
      btn.addEventListener('mouseleave', closeInfo);
      btn.addEventListener('focus', () => { showInfo(btn); infoPop._for = btn; });
      btn.addEventListener('blur', closeInfo);
    }
  });
}
document.addEventListener('click', closeInfo);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInfo(); });
window.addEventListener('scroll', closeInfo, { passive: true });

/* ---------- render ---------- */
/* A standing way out of the guest preview. Without it you can forget you are in
   it and read the missing edit controls as the app being broken. */
function paintGuestBar() {
  let bar = document.getElementById('guestBar');
  if (!db.asGuest) { bar?.remove(); return; }
  if (bar) return;
  bar = el('div', { id: 'guestBar', class: 'guest-bar' });
  bar.innerHTML = `${icon('users')}<span>Viewing as a guest</span>
    <button type="button" data-exit-guest>Exit</button>`;
  bar.querySelector('[data-exit-guest]').addEventListener('click', () => db.setAsGuest(false));
  document.body.appendChild(bar);
}

function paint() {
  paintGuestBar();
  const v = VIEWS[state.view];
  const main = $('#main');
  if (!main) return;
  if (main._spy) { window.removeEventListener('scroll', main._spy); main._spy = null; }
  if (main._menuShut) { document.removeEventListener('click', main._menuShut); main._menuShut = null; }
  if (main._menuKey) { document.removeEventListener('keydown', main._menuKey); main._menuKey = null; }
  closeInfo();
  try {
    main.innerHTML = v.mod.render(db, state);
    v.mod.mount?.(main, db, go, setState, state.params || {});
    wireSections(main, state.view);
    wireInfo(main);
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
  globalThis.__SDDB = db;   // lets tooling and the console inspect the live store
  Object.assign(state, parseHash());
  shell();
  paint();
  window.addEventListener('hashchange', () => setState(parseHash()));

  // Pull anything new from Sleeper on open. Only runs for a signed-in
  // commissioner, and only when the cheap checks say it is worth a look.
  if (Auto.shouldConsider(db)) {
    Auto.run(db, (msg) => toast(msg)).then((summary) => { if (summary) toast(summary); });
  }
  db.on(paint);
})();
