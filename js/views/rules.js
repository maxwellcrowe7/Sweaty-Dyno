import { esc, icon, empty, fmtDate, openModal, toast, seasonPicker, fmt, unfmt,
  formatBar, wireRichBar } from '../util.js';

const MARK = {
  added:   { chip: 'mint',  label: 'New' },
  changed: { chip: 'heat',  label: 'Changed' },
  removed: { chip: 'red',   label: 'Removed' },
};

/** Word-level diff so a changed line shows what actually moved. */

/* Edit mode is module state, not persisted: a reload always lands you reading
   rather than editing, and it can never be on for someone without rights. */
let EDITING = false;

function inlineDiff(before, after) {
  const a = before.split(/(\s+)/), b = after.split(/(\s+)/);
  const n = a.length, m = b.length;
  // longest common subsequence over words (documents here are short)
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(['=', b[j]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['-', a[i]]); i++; }
    else { out.push(['+', b[j]]); j++; }
  }
  while (i < n) out.push(['-', a[i++]]);
  while (j < m) out.push(['+', b[j++]]);

  return out.map(([k, t]) => k === '=' ? esc(t)
    : k === '+' ? `<ins>${esc(t)}</ins>`
    : `<del>${esc(t)}</del>`).join('');
}

/* Text <-> items. One rule per line, four spaces per level of nesting, and a
   leading "1." for a numbered line. The number you type is ignored -- the list
   counts itself -- so you never have to renumber by hand. */
export const toText = (items) => items.map((it) =>
  '    '.repeat(it.depth) + (it.ordered ? '1. ' : '') + it.text).join('\n');

/* Reading the edited document back out. A strict whitelist: bold, italic and
   underline become markers, everything else contributes only its text. That is
   what stops a paste from Word putting fonts and colours into the rulebook, and
   it is why the stored text stays diffable. */
export function serializeNode(node) {
  if (node.nodeType === 3) return node.nodeValue;
  if (node.nodeType !== 1) return '';
  const inner = [...node.childNodes].map(serializeNode).join('');
  if (!inner.trim()) return inner;
  const t = node.tagName;
  if (t === 'B' || t === 'STRONG') return `**${inner}**`;
  if (t === 'I' || t === 'EM') return `_${inner}_`;
  if (t === 'U') return `__${inner}__`;
  return inner;
}

/** The <li>s of one edited section, back to items. */
export function serializeSection(root, old, secId) {
  const out = [];
  root.querySelectorAll('li').forEach((li, i) => {
    const text = serializeNode(li).replace(/\s+/g, ' ').trim();
    if (!text) return;
    const m = li.className.match(/\bd(\d)\b/);
    const depth = m ? Number(m[1]) : 0;
    const ordered = li.classList.contains('ord') || li.parentElement?.tagName === 'OL';
    const prior = old[out.length];
    const id = prior ? prior.id
      : `${secId}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').split('-')
          .filter(Boolean).slice(0, 6).join('-')}`.slice(0, 60);
    out.push(ordered ? { id, depth, text, ordered: true } : { id, depth, text });
  });
  return out;
}

export function toItems(body, old, secId) {
  const lines = body.split('\n').filter((l) => l.trim());
  return lines.map((l, i) => {
    const depth = Math.floor((l.length - l.trimStart().length) / 4);
    const raw = l.trim();
    const ordered = /^\d+[.)]\s+/.test(raw);
    const text = ordered ? raw.replace(/^\d+[.)]\s+/, '') : raw;
    // keep the id of whatever was in this position: that is what makes an edit
    // read as "changed" rather than as a delete plus an add
    const prior = old[i];
    const id = prior ? prior.id
      : `${secId}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').split('-')
          .filter(Boolean).slice(0, 6).join('-')}`.slice(0, 60);
    return ordered ? { id, depth, text, ordered: true } : { id, depth, text };
  });
}

/* Consecutive items of the same kind share one list, so a numbered run counts
   1,2,3 and a bullet after it does not reset or continue anything. */
function listHtml(items, diff, showDiff) {
  const out = [];
  for (let i = 0; i < items.length;) {
    const ord = Boolean(items[i].ordered);
    const run = [];
    while (i < items.length && Boolean(items[i].ordered) === ord) run.push(items[i++]);
    out.push(`<${ord ? 'ol' : 'ul'} class="rule-list">${run.map((it) =>
      itemHtml(it, diff?.byId.get(it.id), diff?.wasById.get(it.id), showDiff)).join('')}</${ord ? 'ol' : 'ul'}>`);
  }
  return out.join('');
}

const itemHtml = (it, mark, was, showDiff) => {
  const m = mark ? MARK[mark] : null;
  const body = (mark === 'changed' && was && showDiff) ? inlineDiff(was, it.text) : fmt(it.text);
  return `<li class="rule-item d${it.depth}${it.ordered ? ' ord' : ''}${
    m ? ' mk-' + mark : ''}" id="i-${esc(it.id)}">
    ${m ? `<span class="rule-flag ${m.chip}">${m.label}</span>` : ''}
    <span class="rule-text">${body}</span>
  </li>`;
};

export function render(db, state = {}) {
  const P = state.params || {};
  const seasons = db.rulebookSeasons();
  if (!seasons.length)
    return empty('No rulebook yet', 'Publish a rulebook and it will appear here with a table of contents.', 'book');

  // A ?year= deep link still wins for this paint -- mount then adopts it into the
  // shared season, so the link works AND the app stays on one year afterwards.
  const urlYear = seasons.includes(Number(P.year)) ? Number(P.year) : null;
  const year = urlYear ?? (seasons.includes(db.season) ? db.season : seasons[0]);
  const bk = db.rulebook(year);
  const diff = db.rulesDiff(year);
  const showDiff = P.marks !== '0';
  const tab = P.tab === 'changes' && diff ? 'changes' : 'rules';
  const admin = db.isAdmin;

  const editing = admin && EDITING;
  const toc = `
    <nav class="toc${editing ? ' editing' : ''}" aria-label="Contents">
      <div class="toc-hd">${icon('list')} Contents</div>
      <ol>
        ${bk.sections.map((s, i) => {
          const d = diff?.perSection[s.id];
          return `<li data-sec="${esc(s.id)}">
            ${editing ? `<button class="toc-grip" data-grip aria-label="Drag to reorder"
              title="Drag to reorder">${icon('grip')}</button>` : ''}
            <a href="#s-${esc(s.id)}" data-jump="${esc(s.id)}">
            <span class="toc-name">${esc(s.title)}</span>
            ${d ? `<i class="toc-dot" title="${d.total} change${d.total === 1 ? '' : 's'}">${d.total}</i>` : ''}
          </a>
          ${editing ? `<span class="toc-tools">
            <button data-sec-rename="${esc(s.id)}" aria-label="Rename ${esc(s.title)}"
              title="Rename">${icon('pencil')}</button>
            <button data-sec-del="${esc(s.id)}" class="del" aria-label="Delete ${esc(s.title)}"
              title="Delete">${icon('x')}</button>
          </span>` : ''}</li>`;
        }).join('')}
      </ol>
      ${editing ? `<div class="toc-add">
        <button class="btn sm" data-sec-add>${icon('plus')} Add section</button></div>` : ''}
    </nav>`;

  const changesPanel = !diff ? '' : `
    <div class="card">
      <div class="card-hd">${icon('diff')}<h3>What changed</h3><div class="spacer"></div>
        <span class="chip heat">${diff.count} edit${diff.count === 1 ? '' : 's'}</span></div>
      <div class="card-bd">
        <div class="s dim" style="font-size:12.5px;line-height:1.6">
          Comparing the ${diff.to} rulebook against ${diff.from}. Everything not listed here is unchanged.
        </div>
      </div>
      ${diff.count === 0 ? `<div class="card-bd" style="padding-top:0">
        <div class="banner" style="background:rgba(61,220,151,.07);border-color:rgba(61,220,151,.26)">
          ${icon('check')}<div>Identical to the ${diff.from} rulebook.</div></div></div>` : ''}
      ${['changed', 'added', 'removed'].map((kind) => {
        const rows = diff[kind];
        if (!rows.length) return '';
        return `<div class="card-bd" style="border-top:1px solid var(--line-soft)">
          <div class="section-title" style="margin:0 0 10px">
            <span class="chip ${MARK[kind].chip}">${MARK[kind].label}</span>
            <span style="color:var(--ink-3)">${rows.length}</span></div>
          <ul class="chg">
            ${rows.map((r) => `<li>
              <a class="chg-sec" href="#i-${esc(r.id)}" data-jump-item="${esc(r.id)}">${esc(r.sectionTitle)}</a>
              <div class="chg-body">${
                kind === 'changed' ? inlineDiff(r.was, r.text)
                : kind === 'removed' ? `<del>${esc(r.text)}</del>`
                : `<ins>${esc(r.text)}</ins>`}</div>
            </li>`).join('')}
          </ul>
        </div>`;
      }).join('')}
    </div>`;

  const doc = `
    <article class="rulebook">
      ${bk.sections.map((s) => {
        const d = diff?.perSection[s.id];
        return `<section class="rule-sec${editing ? ' editing' : ''}" id="s-${esc(s.id)}">
          <h2>${esc(s.title)}${d ? `<span class="chip heat" style="margin-left:9px">${d.total}</span>` : ''}</h2>
          ${/* Edit mode changes nothing about how the body LOOKS -- same markup,
               same classes -- it just makes it editable. */''}
          ${editing ? `<div class="sec-body" contenteditable="true" spellcheck="true"
            data-body="${esc(s.id)}" aria-label="${esc(s.title)} rules"
            >${listHtml(s.items, null, false)}</div>`
            : listHtml(s.items, diff, showDiff)}
        </section>`;
      }).join('')}
    </article>`;

  return `

  <div class="rules-meta">
    <div>
      <h1 class="rules-title">Rulebook ${seasonPicker(db)}</h1>
      <div class="s dim" style="font-size:12px">
        ${bk.status === 'published'
          ? `Published ${fmtDate(bk.published, { year: true })}`
          : '<span class="chip heat">Draft — only you can see this</span>'}
        ${diff ? ` · based on ${diff.from}` : ''}
      </div>
    </div>
    ${diff && diff.count ? `<label class="toggle" style="margin-left:auto">
      <input type="checkbox" id="diffToggle" ${showDiff ? 'checked' : ''}><span class="tr"></span>
      <span style="font-size:12px;color:var(--ink-2)">Mark changes</span></label>` : ''}
    ${admin ? `<button class="btn sm${editing ? ' primary' : ''}" data-edit-mode
      style="${diff && diff.count ? '' : 'margin-left:auto'}">${icon(editing ? 'check' : 'pencil')} ${
      editing ? 'Done' : 'Edit'}</button>` : ''}
  </div>


  ${diff ? `<div class="pills" style="margin-bottom:12px">
    <button data-rtab="rules" aria-pressed="${tab === 'rules'}">Rulebook</button>
    <button data-rtab="changes" aria-pressed="${tab === 'changes'}">What changed ${diff.count}</button>
  </div>` : ''}

  ${tab === 'changes' ? changesPanel : `
    <div class="rules-layout${editing ? ' editing' : ''}">
      ${toc}
      <div class="rules-doc card"><div class="card-bd">${doc}</div></div>
    </div>
    ${/* Outside the card on purpose: .card is overflow:hidden, which stops a
         sticky child from ever sticking. This is fixed to the viewport. */''}
    ${editing ? `<div class="edit-dock">
      ${formatBar()}
      <div class="dock-ft">
        <button class="btn sm primary" data-save-all>${icon('check')} Save</button>
        <span class="dock-state" data-dirty>No changes yet</span>
      </div>
    </div>` : ''}`}

  ${admin ? `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn" data-new-book>${icon('plus')} Start next season's rulebook</button>
    ${bk.status !== 'published' ? `<button class="btn primary" data-publish-book="${year}">${icon('check')} Publish ${year}</button>` : ''}
  </div>` : ''}
  `;
}

export function mount(root, db, go, setState, params = {}) {
  root._params = params;
  const P = { ...(root._params || {}) };
  const nav = (patch) => go('rules', { ...P, ...patch });
  // the deep link is a one-shot: adopt it, then the shared season carries on
  const urlYear = Number(P.year);
  if (urlYear && db.seasons.includes(urlYear) && db.season !== urlYear) db.season = urlYear;
  // the book this paint is actually showing -- render picks it the same way
  const books = db.rulebookSeasons();
  const shownYear = books.includes(db.season) ? db.season : books[0];
  root.querySelectorAll('[data-rtab]').forEach((b) => b.addEventListener('click', () =>
    nav({ tab: b.dataset.rtab === 'rules' ? null : b.dataset.rtab })));
  root.querySelector('#diffToggle')?.addEventListener('change', (e) =>
    nav({ marks: e.target.checked ? null : '0' }));

  const scrollTo = (el, smooth = true) => {
    if (!el) return;
    // clamp: a target near the end of the document must not scroll into blank space
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const top = Math.min(Math.max(0, el.getBoundingClientRect().top + window.scrollY - 76), max);
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1400);
  };
  root.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); scrollTo(root.querySelector(`#s-${CSS.escape(a.dataset.jump)}`));
  }));
  // arriving from a link: ?sec= or ?item=
  const deep = params.item ? `#i-${CSS.escape(params.item)}`
             : params.sec ? `#s-${CSS.escape(params.sec)}` : null;
  if (deep) setTimeout(() => scrollTo(root.querySelector(deep), false), 60);
  root.querySelectorAll('[data-jump-item]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const id = a.dataset.jumpItem;
    nav({ tab: null, item: id });
  }));

  /* scroll-spy: highlight the section you're reading, like a PDF outline */
  const links = [...root.querySelectorAll('[data-jump]')];
  const secs = links.map((a) => root.querySelector(`#s-${CSS.escape(a.dataset.jump)}`)).filter(Boolean);
  if (secs.length) {
    const spy = () => {
      let active = 0;
      secs.forEach((s, i) => { if (s.getBoundingClientRect().top <= 120) active = i; });
      links.forEach((a, i) => a.classList.toggle('on', i === active));
    };
    spy();
    window.addEventListener('scroll', spy, { passive: true });
    root._spy = spy;
  }

  /* ---------- editing ---------- */
  root.querySelector('[data-edit-mode]')?.addEventListener('click', () => {
    EDITING = !EDITING;
    db.emit();
  });

  // `secs` above is the scroll-spy's list of section ELEMENTS; this is the data
  const secList = () => db.rulebook(shownYear)?.sections ?? [];
  const nameOf = (id) => secList().find((s) => s.id === id)?.title ?? '';

  /* Drag to reorder. Pointer events rather than HTML5 drag-and-drop, which does
     not fire on touch -- the rail is used on a phone too.

     Nothing moves while you drag: a line shows where the row will land and the
     list is rewritten once, on release. Reordering live instead means every
     insertion changes the geometry you are measuring the pointer against, which
     is what made it jump around. */
  const list = root.querySelector('.toc.editing ol');
  if (list) root.querySelectorAll('[data-grip]').forEach((grip) => {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const li = grip.closest('li');
      const rows = [...list.querySelectorAll('li')];
      const from = rows.indexOf(li);
      let target = from;

      grip.setPointerCapture(e.pointerId);
      li.classList.add('dragging');
      list.classList.add('reordering');
      const mark = document.createElement('div');
      mark.className = 'toc-drop';
      list.appendChild(mark);

      const move = (ev) => {
        target = rows.length;
        for (let k = 0; k < rows.length; k++) {
          const r = rows[k].getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) { target = k; break; }
        }
        const at = target < rows.length
          ? rows[target].offsetTop
          : rows[rows.length - 1].offsetTop + rows[rows.length - 1].offsetHeight;
        mark.style.top = `${at}px`;
        // landing either side of where it already is changes nothing
        mark.classList.toggle('nil', target === from || target === from + 1);
      };
      const done = async () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', done);
        grip.removeEventListener('pointercancel', done);
        mark.remove();
        li.classList.remove('dragging');
        list.classList.remove('reordering');
        if (target === from || target === from + 1) return;
        const ids = rows.map((x) => x.dataset.sec);
        const [moved] = ids.splice(from, 1);
        ids.splice(target > from ? target - 1 : target, 0, moved);
        await db.setSectionOrder(shownYear, ids);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', done);
      grip.addEventListener('pointercancel', done);
    });
  });

  /* Rename in place: the title becomes an input where it sits. Enter or blur
     commits, Escape puts it back. */
  root.querySelectorAll('[data-sec-rename]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.secRename;
    const li = b.closest('li');
    const name = li.querySelector('.toc-name');
    if (!name || li.querySelector('.toc-rename')) return;
    const was = nameOf(id);
    const input = document.createElement('input');
    input.className = 'toc-rename';
    input.value = was;
    input.setAttribute('aria-label', 'Section title');
    name.replaceWith(input);
    input.focus();
    input.select();

    let settled = false;
    const cancel = () => { if (!settled) { settled = true; db.emit(); } };
    const commit = async () => {
      if (settled) return;
      settled = true;
      const v = input.value.trim();
      if (!v || v === was) { db.emit(); return; }
      await db.renameSection(shownYear, id, v);
      toast('Section renamed');
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
    input.addEventListener('click', (e) => e.preventDefault());
  }));

  root.querySelectorAll('[data-sec-del]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.secDel;
    const sec = secList().find((x) => x.id === id);
    const n = sec?.items.length ?? 0;
    openModal({
      title: `Delete ${sec?.title ?? 'section'}?`, confirm: 'Delete', danger: true,
      body: `<p style="margin:0;font-size:13.5px;line-height:1.6">This removes the section and
        ${n === 0 ? 'it is empty' : `the <b>${n}</b> rule${n === 1 ? '' : 's'} in it`}. It only affects
        the ${shownYear} book &mdash; earlier years keep their copy.</p>`,
      onConfirm: async () => {
        await db.removeSection(shownYear, id);
        toast('Section deleted');
      },
    });
  }));

  root.querySelector('[data-sec-add]')?.addEventListener('click', () => {
    openModal({
      title: 'Add section', confirm: 'Add', closeButtons: false,
      body: `<div class="field"><label>Title</label>
          <input name="title" placeholder="e.g. Waivers" required></div>
        <div class="field"><label>Position</label>
          <select name="at">
            ${secList().map((x, i) => `<option value="${i}">Before ${esc(x.title)}</option>`).join('')}
            <option value="" selected>At the end</option>
          </select></div>`,
      onConfirm: async (d) => {
        if (!d.title.trim()) return false;
        const id = await db.addSection(shownYear, d.title, d.at === '' ? null : +d.at);
        toast(`${d.title.trim()} added`);
        setTimeout(() => document.getElementById(`s-${id}`)?.scrollIntoView({ block: 'start' }), 60);
      },
    });
  });

  /* Editing happens in the document, one section at a time. Save writes that
     section; Revert just repaints it from the data. */
  /* The body is the same markup it is read in, just editable. One toolbar for the
     whole document, docked so it is still there wherever you have scrolled to. */
  const bodies = [...root.querySelectorAll('.sec-body[data-body]')];
  const bar = root.querySelector('.edit-dock .fmt-bar');
  const state = root.querySelector('[data-dirty]');
  const dirty = new Set();

  if (bar && bodies.length) {
    const touched = (host) => {
      dirty.add(host.dataset.body);
      if (state) {
        state.textContent = `${dirty.size} section${dirty.size === 1 ? '' : 's'} edited`;
        state.classList.add('on');
      }
    };
    bodies.forEach((host) => wireRichBar(bar, host, () => touched(host)));
  }

  root.querySelector('[data-save-all]')?.addEventListener('click', async () => {
    if (!dirty.size) { toast('Nothing to save'); return; }
    const book = db.rulebook(shownYear);
    const next = new Map();
    for (const id of dirty) {
      const host = root.querySelector(`.sec-body[data-body="${CSS.escape(id)}"]`);
      const before = book.sections.find((x) => x.id === id);
      if (host && before) next.set(id, serializeSection(host, before.items, id));
    }
    await db.update('rules', (r) => {
      const secs = r.seasons[String(shownYear)].sections;
      for (const [id, items] of next) {
        const sec = secs.find((x) => x.id === id);
        if (sec) sec.items = items;
      }
    });
    toast(`${next.size} section${next.size === 1 ? '' : 's'} saved`);
  });

  root.querySelector('[data-publish-book]')?.addEventListener('click', async (e) => {
    const y = e.currentTarget.dataset.publishBook;
    await db.update('rules', (r) => {
      r.seasons[y].status = 'published';
      r.seasons[y].published = new Date().toISOString().slice(0, 10);
    });
    toast(`${y} rulebook published`);
  });

  root.querySelector('[data-new-book]')?.addEventListener('click', () => {
    const years = Object.keys(db.get('rules').seasons).map(Number);
    const next = Math.max(...years) + 1;
    openModal({
      title: 'Start a new rulebook',
      confirm: 'Create draft',
      closeButtons: false,
      body: `<div class="fgrid">
          <div class="field"><label>New season</label>
            <input name="year" type="number" inputmode="numeric" value="${next}"></div>
          <div class="field"><label>Copy from</label>
            <select name="from">${years.sort((a, b) => b - a).map((y) =>
              `<option value="${y}">${y}</option>`).join('')}</select></div>
        </div>
        `,
      onConfirm: async (d) => {
        const y = String(+d.year);
        if (db.get('rules').seasons[y]) { toast(`${y} already exists`); return false; }
        await db.update('rules', (r) => {
          r.seasons[y] = {
            status: 'draft', published: null, basedOn: +d.from,
            summary: null,
            sections: structuredClone(r.seasons[String(d.from)].sections),
          };
        });
        go('rules', { year: y });
        toast(`${y} draft created from ${d.from}`);
      },
    });
  });
}
