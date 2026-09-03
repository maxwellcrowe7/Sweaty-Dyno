import { esc, icon, empty, fmtDate, openModal, toast } from '../util.js';

const MARK = {
  added:   { chip: 'mint',  label: 'New' },
  changed: { chip: 'heat',  label: 'Changed' },
  removed: { chip: 'red',   label: 'Removed' },
};

/** Word-level diff so a changed line shows what actually moved. */
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

const itemHtml = (it, mark, was, showDiff) => {
  const m = mark ? MARK[mark] : null;
  const body = (mark === 'changed' && was && showDiff) ? inlineDiff(was, it.text) : esc(it.text);
  return `<li class="rule-item d${it.depth}${m ? ' mk-' + mark : ''}" id="i-${esc(it.id)}">
    ${m ? `<span class="rule-flag ${m.chip}">${m.label}</span>` : ''}
    <span class="rule-text">${body}</span>
  </li>`;
};

export function render(db, state = {}) {
  const P = state.params || {};
  const seasons = db.rulebookSeasons();
  if (!seasons.length)
    return empty('No rulebook yet', 'Publish a rulebook and it will appear here with a table of contents.', 'book');

  const year = seasons.includes(Number(P.year)) ? Number(P.year) : seasons[0];
  const bk = db.rulebook(year);
  const diff = db.rulesDiff(year);
  const showDiff = P.marks !== '0';
  const tab = P.tab === 'changes' && diff ? 'changes' : 'rules';
  const admin = db.isAdmin;

  const toc = `
    <nav class="toc" aria-label="Contents">
      <div class="toc-hd">${icon('list')} Contents</div>
      <ol>
        ${bk.sections.map((s) => {
          const d = diff?.perSection[s.id];
          return `<li><a href="#s-${esc(s.id)}" data-jump="${esc(s.id)}">
            <span>${esc(s.title)}</span>
            ${d ? `<i class="toc-dot" title="${d.total} change${d.total === 1 ? '' : 's'}">${d.total}</i>` : ''}
          </a></li>`;
        }).join('')}
      </ol>
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
        return `<section class="rule-sec" id="s-${esc(s.id)}">
          <h2>${esc(s.title)}${d ? `<span class="chip heat" style="margin-left:9px">${d.total}</span>` : ''}</h2>
          <ul>${s.items.map((it) =>
            itemHtml(it, diff?.byId.get(it.id), diff?.wasById.get(it.id), showDiff)).join('')}</ul>
          ${admin ? `<button class="btn sm ghost" data-edit-sec="${esc(s.id)}">${icon('pencil')} Edit section</button>` : ''}
        </section>`;
      }).join('')}
    </article>`;

  return `
  <div class="rules-bar">
    <div class="pills" style="flex:1">
      ${seasons.map((y) => {
        const st = db.get('rules').seasons[String(y)].status;
        return `<button data-ryear="${y}" aria-pressed="${y === year}">${y}${st !== 'published' ? ' · draft' : ''}</button>`;
      }).join('')}
    </div>
  </div>

  <div class="rules-meta">
    <div>
      <h1 class="rules-title">${esc(bk.season)} Rulebook</h1>
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
  </div>

  ${bk.summary ? `<div class="banner" style="margin-bottom:14px">${icon('book')}<div>${esc(bk.summary)}</div></div>` : ''}

  ${diff ? `<div class="pills" style="margin-bottom:12px">
    <button data-rtab="rules" aria-pressed="${tab === 'rules'}">Rulebook</button>
    <button data-rtab="changes" aria-pressed="${tab === 'changes'}">What changed ${diff.count}</button>
  </div>` : ''}

  ${tab === 'changes' ? changesPanel : `
    <div class="rules-layout">
      ${toc}
      <div class="rules-doc card"><div class="card-bd">${doc}</div></div>
    </div>`}

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
  root.querySelectorAll('[data-ryear]').forEach((b) => b.addEventListener('click', () =>
    nav({ year: b.dataset.ryear, tab: null })));
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
  root.querySelectorAll('[data-edit-sec]').forEach((b) => b.addEventListener('click', () => {
    const year = Number(root.querySelector('[data-ryear][aria-pressed="true"]').dataset.ryear);
    const sec = db.rulebook(year).sections.find((s) => s.id === b.dataset.editSec);
    openModal({
      title: `Edit — ${sec.title}`,
      confirm: 'Save section',
      body: `<div class="s dim" style="font-size:12px;line-height:1.6;margin-bottom:12px">
          One rule per line. Indent with four spaces to nest. Editing a line keeps its identity, so it
          shows as <b style="color:var(--heat)">Changed</b>; a new line shows as
          <b style="color:var(--mint)">New</b>.</div>
        <div class="field"><label>Section title</label><input name="title" value="${esc(sec.title)}"></div>
        <div class="field"><label>Rules</label><textarea name="body" style="min-height:260px;font-size:13px">${
          esc(sec.items.map((it) => '    '.repeat(it.depth) + it.text).join('\n'))}</textarea></div>`,
      onConfirm: async (d) => {
        const lines = d.body.split('\n').filter((l) => l.trim());
        await db.update('rules', (r) => {
          const s = r.seasons[String(year)].sections.find((x) => x.id === sec.id);
          s.title = d.title.trim() || s.title;
          const old = sec.items;
          s.items = lines.map((l, i) => {
            const depth = Math.floor((l.length - l.trimStart().length) / 4);
            const text = l.trim();
            // keep the id of the line that was in this position, so an edit reads
            // as a change rather than a delete + add
            const prior = old[i];
            const id = prior ? prior.id
              : `${sec.id}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').split('-').filter(Boolean).slice(0, 6).join('-')}-${Date.now().toString(36)}${i}`;
            return { id, depth, text };
          });
        });
        toast('Section saved');
      },
    });
  }));

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
      body: `<div class="s dim" style="font-size:12.5px;line-height:1.6;margin-bottom:13px">
          Copies a season forward as a draft. Every rule keeps its identity, so whatever you then edit
          shows up as a tracked change and everything else stays quiet.</div>
        <div class="fgrid">
          <div class="field"><label>New season</label>
            <input name="year" type="number" inputmode="numeric" value="${next}"></div>
          <div class="field"><label>Copy from</label>
            <select name="from">${years.sort((a, b) => b - a).map((y) =>
              `<option value="${y}">${y}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Summary (optional)</label>
          <input name="summary" placeholder="What's different this year"></div>`,
      onConfirm: async (d) => {
        const y = String(+d.year);
        if (db.get('rules').seasons[y]) { toast(`${y} already exists`); return false; }
        await db.update('rules', (r) => {
          r.seasons[y] = {
            status: 'draft', published: null, basedOn: +d.from,
            summary: d.summary.trim() || null,
            sections: structuredClone(r.seasons[String(d.from)].sections),
          };
        });
        go('rules', { year: y });
        toast(`${y} draft created from ${d.from}`);
      },
    });
  });
}
