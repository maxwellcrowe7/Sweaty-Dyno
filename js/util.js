// ---------- tiny DOM helpers ----------
export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Escape untrusted text before it goes anywhere near innerHTML. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const el = (tag, attrs = {}, html = '') => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  if (html) n.innerHTML = html;
  return n;
};

// ---------- formatting ----------
export const money = (n, { sign = false, cents = false } = {}) => {
  const v = Number(n) || 0;
  const s = v.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
  });
  return sign && v > 0 ? '+' + s : s;
};
export const pts = (n) => (Number(n) || 0).toLocaleString('en-US',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n) => (Number(n) || 0).toLocaleString('en-US');

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** Parse as calendar-local, not UTC, so "2025-07-10" never slips to the 9th. */
export const fmtDate = (iso, { year = false } = {}) => {
  if (!iso) return '--';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${MON[m - 1]} ${d}${year ? ', ' + y : ''}`;
};
export const ordinal = (n) => {
  const v = Number(n), s = ['th','st','nd','rd'], k = v % 100;
  return v + (s[(k - 20) % 10] || s[k] || s[0]);
};

// ---------- team identity ----------
/** Stable, evenly-spaced hue per team number so colours never collide. */
export const teamHue = (n) => (((Number(n) || 0) - 1) * 137.508) % 360;
export const teamColor = (n) => n ? `hsl(${teamHue(n).toFixed(1)} 72% 62%)` : 'var(--ink-3)';

/** Team number first, then the name. No colour swatch — ten hues was noise. */
export const teamTag = (t, { num: showNum = true, alias = null } = {}) => {
  if (!t) return `<span class="tname"><span class="tnum">&mdash;</span>
    <b class="dim">${esc(alias || 'Unassigned')}</b></span>`;
  return `<span class="tname">${showNum ? `<span class="tnum">T${t.number}</span>` : ''}<b>${esc(t.manager)}</b></span>`;
};

export const posChip = (pos) =>
  `<span class="pos-chip pos-${pos ? esc(pos) : 'none'}">${pos ? esc(pos) : '--'}</span>`;

// ---------- icons (Lucide-style, 24x24 stroke) ----------
const I = {
  home:'M3 10.2 12 3l9 7.2M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5',
  wallet:'M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6M16 12.5h.01',
  trophy:'M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 14v6',
  board:'M4 4h16v16H4zM4 9.5h16M9.5 9.5V20M15 9.5V20',
  swap:'M7 4 3 8l4 4M3 8h13a4 4 0 0 1 0 8H9M17 20l4-4-4-4',
  chart:'M4 20V10M10 20V4M16 20v-7M22 20H2',
  crown:'M3 17h18M4 7l4 4 4-6 4 6 4-4-1.5 10h-13z',
  users:'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.87M16 2.1a4 4 0 0 1 0 7.75',
  more:'M5 12h.01M12 12h.01M19 12h.01',
  cog:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.5 2.7h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z',
  alert:'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  check:'M20 6 9 17l-5-5',
  plus:'M12 5v14M5 12h14',
  pencil:'m18 2 4 4-13 13H5v-4L18 2Z',
  down:'M12 3v13M6 11l6 6 6-6M4 21h16',
  sync:'M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4M21 12a9 9 0 0 1-15 6.7L3 16M3 20v-4h4',
  blade:'M6 2v20M18 2v20M4 2h16M4 17h16M8 5h8v2.5l-8 4z',
  // a controller: the one silhouette in the nav that is unmistakably "games" at
  // 16px, and unlike a die it does not share the board icon's square outline
  dice:'M6 11.5h4M8 9.5v4M16.2 10.3h.01M18.6 13.6h.01M7 4.5h10a5.5 5.5 0 0 1 5.5 5.5v3.2a5.3 5.3 0 0 1-5.3 5.3c-2.1 0-2.7-1.8-4-1.8h-3.4c-1.3 0-1.9 1.8-4 1.8A5.3 5.3 0 0 1 1.5 13.2V10A5.5 5.5 0 0 1 7 4.5Z',
  x:'M18 6 6 18M6 6l12 12',
  lock:'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  book:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z',
  list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  diff:'M12 3v6M9 6h6M12 15v6M9 18h6M5 12h14',
  chev:'m9 18 6-6-6-6',
  inbox:'M4 13h4l2 3h4l2-3h4M4 13 6.6 5.2A2 2 0 0 1 8.5 4h7a2 2 0 0 1 1.9 1.2L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z',
};
export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${I[name] || I.dice}"/></svg>`;

// ---------- misc ----------
export const toast = (msg) => {
  let t = $('#toast');
  if (!t) { t = el('div', { id: 'toast', class: 'toast' }); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
};

/** A small "i" that reveals an explanation on hover or tap. Wired globally by app.js. */
export const info = (text, label = 'What this means') =>
  `<button class="info" type="button" data-info="${esc(text)}" aria-label="${esc(label)}">i</button>`;

export const empty = (title, sub, ic = 'inbox') =>
  `<div class="empty">${icon(ic)}<p>${esc(title)}</p><small>${esc(sub)}</small></div>`;

export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + (Number(f(b)) || 0), 0);
export const by = (arr, f) => arr.reduce((m, x) => ((m[f(x)] ||= []).push(x), m), {});

/* ---------- modal ----------
   openModal({title, body, confirm, extra, closeButtons, onConfirm}) -> resolves when closed.
   `extra` is an optional button sharing the footer row with Cancel and Save.
   `closeButtons:false` drops the X and Cancel — clicking outside and Escape still close.
   `body` is an HTML string; the <form> inside is serialised and handed to onConfirm. */
export function openModal({ title, body, confirm = 'Save', danger = false, extra = '',
                            closeButtons = true, onConfirm = null }) {
  const bd = el('div', { class: 'modal-bd' });
  bd.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-hd">
        <h3>${esc(title)}</h3><div class="spacer" style="margin-left:auto"></div>
        ${closeButtons ? `<button class="btn sm ghost" data-close aria-label="Close">${icon('x')}</button>` : ''}
      </div>
      <form class="modal-bd2">${body}</form>
      ${onConfirm ? `<div class="modal-ft">
        ${extra}
        ${closeButtons ? '<button class="btn" data-close type="button">Cancel</button>' : ''}
        <button class="btn primary" data-ok type="button">${esc(confirm)}</button></div>` : ''}
    </div>`;
  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('open'));

  const close = () => { bd.classList.remove('open'); setTimeout(() => bd.remove(), 220); };
  bd.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
  document.addEventListener('keydown', function esckey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esckey); }
  });

  const form = bd.querySelector('form');
  bd.querySelector('[data-ok]')?.addEventListener('click', async () => {
    const data = {};
    for (const f of form.elements) {
      if (!f.name) continue;
      data[f.name] = f.type === 'checkbox' ? f.checked : f.value;
    }
    const ok = await onConfirm(data);
    if (ok !== false) close();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); bd.querySelector('[data-ok]')?.click(); });
  setTimeout(() => form.querySelector('input,select,textarea')?.focus(), 260);
  return { close, root: bd };
}

/** <option> list of teams for a select. */
export const teamOptions = (teams, sel = '', blank = '— none —') =>
  `<option value="">${esc(blank)}</option>` + teams.map((t) =>
    `<option value="${t.number}" ${String(sel) === String(t.number) ? 'selected' : ''}>T${t.number} · ${esc(t.manager)}</option>`).join('');
