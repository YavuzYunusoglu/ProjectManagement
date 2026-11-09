'use strict';
/*
 * Generative-AI usage log, structured after the TÜBİTAK guideline
 * "Destek Süreçlerinde ÜYZ'nin Sorumlu ve Güvenilir Kullanımı Rehberi" (v04, Jan 2026):
 *  - 1.1.1 supportive uses, 1.1.2 uses requiring close attention
 *  - 1.2 declaration: tool + version, stage/section, nature and scope
 *  - 1.3–1.5 responsibilities, risks and prohibited uses → verification checklist
 */
const AI_CATS = {
  support: ['literature', 'language', 'coding', 'ideation', 'vizSuggest'],
  careful: ['drafting', 'analysis', 'imagery', 'audio', 'gameContent'],
  other: ['other'],
};
const AI_NATURE = ['draft', 'improve', 'translate', 'code', 'debug', 'ideas', 'summary', 'asset', 'analysis', 'other'];
const AI_CHECKS = ['verified', 'noConfidential', 'license', 'original', 'bias'];
const AI_TOOLS = ['ChatGPT', 'Claude', 'Gemini', 'Microsoft Copilot', 'GitHub Copilot', 'Cursor', 'Midjourney', 'DALL·E', 'Stable Diffusion', 'Adobe Firefly', 'Suno', 'ElevenLabs', 'DeepL', 'Perplexity'];

const AIView = {
  el: null, q: '', group: 'all', guideOpen: false,
  busy() { return false; },
  groupOf(cat) { return Object.keys(AI_CATS).find(g => AI_CATS[g].includes(cat)) || 'other'; },
  required(a) {
    const req = ['verified', 'noConfidential'];
    if (this.groupOf(a.category) === 'careful' || ['coding', 'imagery'].includes(a.category)) req.push('license');
    if (this.groupOf(a.category) === 'careful') req.push('original');
    return req;
  },
  missing(a) { return this.required(a).filter(k => !(a.checks || {})[k]); },

  mount(el) {
    this.el = el;
    el.className = 'view view-ai';
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('input', e => { if (e.target.matches('.ai-search')) { this.q = e.target.value; this.renderList(); } });
    this.render();
  },
  render() {
    const b = Model.board(), all = Model.aiEntries(b.id);
    const sig = all.filter(a => a.significant).length;
    const tools = [...new Set(all.map(a => a.tool).filter(Boolean))];
    const miss = all.filter(a => this.missing(a).length).length;
    const seg = (v, label) => `<button class="seg-btn ${this.group === v ? 'on' : ''}" data-group="${v}">${label}</button>`;
    this.el.innerHTML = `<div class="ai-wrap">
      <section class="panel ai-hero">
        <div class="ai-hero-text">
          <span class="eyebrow">${t('ai.eyebrow')}</span>
          <h2>${t('ai.heading')}</h2>
          <p>${t('ai.lead')}</p>
        </div>
        <div class="ai-hero-actions">
          <button class="btn primary" data-a="add">${icon('plus')} ${t('ai.add')}</button>
          <button class="btn" data-a="report">${icon('file')} ${t('ai.report')}</button>
          <button class="btn ghost" data-a="csv">${icon('download')} CSV</button>
        </div>
        <div class="tiles mini">
          <div class="tile"><span class="tile-label">${t('ai.entries')}</span><strong class="tile-val">${all.length}</strong></div>
          <div class="tile"><span class="tile-label">${t('ai.significantCount')}</span><strong class="tile-val">${sig}</strong><span class="tile-sub">${t('ai.mustDeclare')}</span></div>
          <div class="tile"><span class="tile-label">${t('ai.tools')}</span><strong class="tile-val">${tools.length}</strong><span class="tile-sub">${U.esc(tools.slice(0, 3).join(', '))}${tools.length > 3 ? '…' : ''}</span></div>
          <div class="tile ${miss ? 'bad' : 'good'}"><span class="tile-label">${t('ai.openChecks')}</span><strong class="tile-val">${miss}</strong><span class="tile-sub">${miss ? t('ai.openChecksSub') : t('ai.allChecked')}</span></div>
        </div>
      </section>

      <section class="panel ai-guide ${this.guideOpen ? 'open' : ''}">
        <button class="guide-toggle" data-a="guide" aria-expanded="${this.guideOpen}">${icon('shield')}<span><strong>${t('ai.guideTitle')}</strong><small>${t('ai.guideSource')}</small></span>${icon('down', 'chev')}</button>
        ${this.guideOpen ? this.guideHTML() : ''}
      </section>

      <section class="panel ai-list-panel">
        <div class="toolbar">
          <div class="seg">${seg('all', t('ai.all'))}${seg('support', t('ai.grp.support'))}${seg('careful', t('ai.grp.careful'))}${seg('significant', t('ai.significantShort'))}${seg('missing', t('ai.missingShort'))}</div>
          <span class="grow"></span>
          <div class="search sm">${icon('search')}<input class="ai-search" value="${U.esc(this.q)}" placeholder="${t('ai.searchPh')}" aria-label="${t('search')}"></div>
        </div>
        <div class="ai-list"></div>
      </section>
    </div>`;
    this.renderList();
  },
  guideHTML() {
    const li = keys => keys.map(k => `<li>${t(k)}</li>`).join('');
    return `<div class="guide-body">
      <div class="guide-cols">
        <div class="guide-col ok"><h4>${icon('check')} ${t('ai.g.supportTitle')}</h4><p class="hint">${t('ai.g.supportLead')}</p><ul>${li(['aicat.literature', 'aicat.language', 'aicat.coding', 'aicat.ideation', 'aicat.vizSuggest'])}</ul></div>
        <div class="guide-col warn"><h4>${icon('warn')} ${t('ai.g.carefulTitle')}</h4><p class="hint">${t('ai.g.carefulLead')}</p><ul>${li(['aicat.drafting', 'aicat.analysis', 'aicat.imagery', 'aicat.audio', 'aicat.gameContent'])}</ul></div>
        <div class="guide-col bad"><h4>${icon('ban')} ${t('ai.g.banTitle')}</h4><ul>${li(['ai.g.ban1', 'ai.g.ban2', 'ai.g.ban3'])}</ul></div>
      </div>
      <div class="guide-cols two">
        <div><h4>${icon('file')} ${t('ai.g.declTitle')}</h4><p>${t('ai.g.declLead')}</p><ul>${li(['ai.g.decl1', 'ai.g.decl2', 'ai.g.decl3'])}</ul></div>
        <div><h4>${icon('shield')} ${t('ai.g.respTitle')}</h4><ul>${li(['ai.g.resp1', 'ai.g.resp2', 'ai.g.resp3', 'ai.g.resp4', 'ai.g.resp5'])}</ul></div>
      </div>
      <p class="hint">${t('ai.g.note')} <a href="https://tubitak.gov.tr/tr/kurumsal/hakkimizda/uretken-yapay-zeka-rehberi" target="_blank" rel="noopener">tubitak.gov.tr</a></p>
    </div>`;
  },
  filtered() {
    const loc = I18n.locale(), q = this.q.trim().toLocaleLowerCase(loc);
    return Model.aiEntries(Model.board().id).filter(a => {
      if (this.group === 'support' && this.groupOf(a.category) !== 'support') return false;
      if (this.group === 'careful' && this.groupOf(a.category) !== 'careful') return false;
      if (this.group === 'significant' && !a.significant) return false;
      if (this.group === 'missing' && !this.missing(a).length) return false;
      if (!q) return true;
      return [a.tool, a.version, a.stage, a.purpose, a.notes, a.humanRole, Store.get(a.memberId)?.name, t('aicat.' + a.category)].some(s => String(s || '').toLocaleLowerCase(loc).includes(q));
    });
  },
  renderList() {
    const list = U.$('.ai-list', this.el); if (!list) return;
    const rows = this.filtered();
    list.innerHTML = rows.length ? `<div class="ai-table" role="table">
      <div class="ai-tr head" role="row"><span>${t('ai.f.date')}</span><span>${t('ai.f.tool')}</span><span>${t('ai.f.category')}</span><span>${t('ai.f.stage')}</span><span>${t('ai.f.person')}</span><span>${t('ai.f.status')}</span></div>
      ${rows.map(a => {
        const g = this.groupOf(a.category), miss = this.missing(a), who = Store.get(a.memberId);
        return `<button class="ai-tr" role="row" data-id="${a.id}">
          <span class="mono">${U.esc(U.fmtDate(a.date, { day: 'numeric', month: 'short', year: '2-digit' }))}</span>
          <span><strong>${U.esc(a.tool)}</strong> <span class="muted">${U.esc(a.version || '')}</span></span>
          <span><span class="cat-badge ${g}">${t('aicat.' + a.category)}</span>${a.nature ? `<small class="muted">${t('ainature.' + a.nature)}</small>` : ''}</span>
          <span class="clip">${U.esc(a.stage || '—')}${(a.cardIds || []).length ? ` <span class="mono muted">· ${a.cardIds.length} ${icon('board')}</span>` : ''}</span>
          <span>${who ? UI.avatar(who, 'sm') + ' ' + U.esc(who.name) : '—'}</span>
          <span class="status-cell">${a.significant ? `<span class="pill">${t('ai.significantShort')}</span>` : ''}${miss.length ? `<span class="pill warn">${icon('warn')} ${t('ai.missingN', { n: miss.length })}</span>` : `<span class="pill ok">${icon('check')} ${t('ai.checked')}</span>`}</span>
        </button>`;
      }).join('')}</div>`
      : `<div class="empty-state"><p>${Model.aiEntries(Model.board().id).length ? t('nothingFound') : t('ai.empty')}</p></div>`;
  },
  onClick(e) {
    const g = e.target.closest('[data-group]');
    if (g) { this.group = g.dataset.group; this.render(); return; }
    const row = e.target.closest('.ai-tr[data-id]');
    if (row) { this.openForm(row.dataset.id); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'add') this.openForm(null);
    else if (a.dataset.a === 'guide') { this.guideOpen = !this.guideOpen; this.render(); }
    else if (a.dataset.a === 'report') this.report();
    else if (a.dataset.a === 'csv') this.csv();
  },

  /* ---------- form */
  openForm(id, defaults = {}) {
    const b = Store.get(defaults.boardId) || Model.board();
    const a = id ? Store.get(id) : {
      date: U.today(), memberId: Prefs.get('me') || '', tool: '', version: '', category: 'coding', nature: 'code', stage: '', purpose: '', humanRole: '',
      significant: true, checks: {}, cardIds: [], notes: '', ...defaults,
    };
    let cardIds = [...(a.cardIds || [])];
    const checks = { ...(a.checks || {}) };
    const opt = (v, label, cur) => `<option value="${U.esc(v)}" ${v === (cur || '') ? 'selected' : ''}>${U.esc(label)}</option>`;
    const m = UI.modal({
      title: id ? t('ai.editTitle') : t('ai.addTitle'), cls: 'ai-modal',
      body: `<form class="form ai-form" onsubmit="return false">
        <div class="form-grid three">
          <label class="field">${t('ai.f.date')}<input class="input" type="date" name="date" value="${a.date || ''}"></label>
          <label class="field">${t('ai.f.person')}<select class="input" name="memberId">${opt('', '—', a.memberId)}${Model.members().map(x => opt(x.id, x.name, a.memberId)).join('')}</select></label>
          <label class="field">${t('ai.f.significant')}<select class="input" name="significant">${opt('1', t('ai.sigYes'), a.significant ? '1' : '0')}${opt('0', t('ai.sigNo'), a.significant ? '1' : '0')}</select></label>
        </div>
        <div class="form-grid two">
          <label class="field">${t('ai.f.tool')} <em class="req">*</em><input class="input" name="tool" list="ai-tools" value="${U.esc(a.tool)}" placeholder="ChatGPT, Claude, Gemini…" required></label>
          <label class="field">${t('ai.f.version')}<input class="input" name="version" value="${U.esc(a.version || '')}" placeholder="GPT-5, Opus 5.5, 2.5 Pro…"></label>
        </div>
        <datalist id="ai-tools">${AI_TOOLS.map(x => `<option value="${x}">`).join('')}</datalist>
        <div class="form-grid two">
          <label class="field">${t('ai.f.category')}<select class="input" name="category">
            ${Object.keys(AI_CATS).map(gk => `<optgroup label="${t('ai.grp.' + gk)}">${AI_CATS[gk].map(c => opt(c, t('aicat.' + c), a.category)).join('')}</optgroup>`).join('')}</select></label>
          <label class="field">${t('ai.f.nature')}<select class="input" name="nature">${AI_NATURE.map(n => opt(n, t('ainature.' + n), a.nature)).join('')}</select></label>
        </div>
        <div class="cat-note"></div>
        <label class="field">${t('ai.f.stage')} <em class="req">*</em><input class="input" name="stage" value="${U.esc(a.stage || '')}" placeholder="${t('ai.f.stagePh')}"></label>
        <label class="field">${t('ai.f.purpose')}<textarea class="input" rows="2" name="purpose" placeholder="${t('ai.f.purposePh')}">${U.esc(a.purpose || '')}</textarea></label>
        <label class="field">${t('ai.f.human')}<textarea class="input" rows="2" name="humanRole" placeholder="${t('ai.f.humanPh')}">${U.esc(a.humanRole || '')}</textarea></label>
        <fieldset class="checks"><legend>${icon('shield')} ${t('ai.f.checks')}</legend>
          ${AI_CHECKS.map(k => `<label class="check-row" data-check="${k}"><input type="checkbox" name="chk-${k}" ${checks[k] ? 'checked' : ''}><span><strong>${t('aichk.' + k)}</strong><small>${t('aichk.' + k + 'Hint')}</small></span><em class="req-tag">${t('ai.required')}</em></label>`).join('')}
        </fieldset>
        <div class="field"><span class="field-label">${t('ai.f.cards')}</span><div class="linked-cards"></div><button type="button" class="btn sm ghost" data-link>${icon('plus')} ${t('ai.f.linkCard')}</button></div>
        <label class="field">${t('ai.f.notes')}<textarea class="input" rows="2" name="notes" placeholder="${t('ai.f.notesPh')}">${U.esc(a.notes || '')}</textarea></label>
        <p class="notice">${icon('ban')} ${t('ai.f.privacy')}</p>
      </form>`,
      actions: `${id ? `<button class="btn ghost danger-text" data-del>${icon('trash')} ${t('delete')}</button><span class="grow"></span>` : ''}<button class="btn" data-close>${t('cancel')}</button><button class="btn primary" data-ok>${t('save')}</button>`,
    });
    const f = U.$('form', m.el);
    const val = n => f.elements[n].value;
    const refresh = () => {
      const cat = val('category'), grp = this.groupOf(cat);
      U.$('.cat-note', m.el).innerHTML = grp === 'careful' ? `<p class="notice warn">${icon('warn')} <span><strong>${t('ai.g.carefulTitle')}:</strong> ${t('ai.note.' + cat)}</span></p>`
        : grp === 'support' ? `<p class="notice ok">${icon('check')} <span>${t('ai.note.support')}</span></p>` : '';
      const req = this.required({ category: cat });
      U.$$('.check-row', m.el).forEach(r => r.classList.toggle('is-req', req.includes(r.dataset.check)));
      U.$('.linked-cards', m.el).innerHTML = cardIds.map(cid => Store.get(cid)).filter(Boolean).map(c =>
        `<span class="chip on">${U.esc(Model.cardKey(c))} ${U.esc(trunc(c.title, 28))}<button type="button" class="chip-x" data-unlink="${c.id}" aria-label="${t('delete')}">${icon('x')}</button></span>`).join('') || `<span class="hint">${t('ai.f.noCards')}</span>`;
    };
    refresh();
    f.addEventListener('change', e => {
      if (e.target.name === 'category') {
        const cat = val('category');
        if (this.groupOf(cat) === 'careful') f.elements.significant.value = '1';
        const natureFor = { literature: 'summary', language: 'improve', coding: 'code', ideation: 'ideas', vizSuggest: 'ideas', drafting: 'draft', analysis: 'analysis', imagery: 'asset', audio: 'asset', gameContent: 'draft' };
        if (!id && natureFor[cat]) f.elements.nature.value = natureFor[cat];
        if (!id && cat === 'language') f.elements.significant.value = '0';
      }
      refresh();
    });
    m.el.addEventListener('click', async e => {
      const un = e.target.closest('[data-unlink]');
      if (un) { cardIds = cardIds.filter(x => x !== un.dataset.unlink); refresh(); return; }
      const ln = e.target.closest('[data-link]');
      if (ln) { this.cardPicker(ln, b, cardIds, idd => { cardIds.push(idd); refresh(); }); return; }
      if (e.target.closest('[data-del]')) {
        if (await UI.confirm(t('ai.deleteConfirm'), { ok: t('delete'), danger: true })) { Store.remove(id); m.close(); }
        return;
      }
      if (!e.target.closest('[data-ok]')) return;
      if (!val('tool').trim()) { f.elements.tool.focus(); return; }
      if (!val('stage').trim()) { f.elements.stage.focus(); return; }
      const data = {
        date: val('date') || U.today(), memberId: val('memberId') || null, tool: val('tool').trim(), version: val('version').trim(),
        category: val('category'), nature: val('nature'), stage: val('stage').trim(), purpose: val('purpose').trim(), humanRole: val('humanRole').trim(),
        significant: val('significant') === '1', notes: val('notes').trim(), cardIds,
        checks: Object.fromEntries(AI_CHECKS.map(k => [k, f.elements['chk-' + k].checked])),
      };
      if (id) Store.update(id, data); else Store.create('ai', { boardId: b.id, ...data });
      const miss = this.missing(data);
      if (miss.length) UI.toast(t('ai.savedMissing', { n: miss.length }), { kind: 'warn' });
      m.close();
    });
  },
  cardPicker(anchor, b, exclude, onPick) {
    const el = U.html(`<div class="menu deps-menu"><input class="input sm" placeholder="${t('search')}"><div class="dep-options"></div></div>`);
    const fill = q => {
      q = q.toLocaleLowerCase(I18n.locale());
      U.$('.dep-options', el).innerHTML = Model.boardCards(b.id).filter(c => !exclude.includes(c.id) && (!q || c.title.toLocaleLowerCase(I18n.locale()).includes(q)))
        .slice(0, 40).map(c => `<button type="button" class="menu-item" data-id="${c.id}"><span class="mono muted">${U.esc(Model.cardKey(c))}</span> ${U.esc(c.title)}</button>`).join('') || `<p class="hint">${t('nothingFound')}</p>`;
    };
    fill('');
    el.querySelector('input').addEventListener('input', e => fill(e.target.value));
    el.addEventListener('click', e => { const x = e.target.closest('[data-id]'); if (x) { UI.closePopover(); onPick(x.dataset.id); } });
    UI.pop(anchor, el);
  },

  /* ---------- declaration report */
  reportText(onlySignificant) {
    const b = Model.board();
    const all = Model.aiEntries(b.id).filter(a => !onlySignificant || a.significant).sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    const L = [];
    L.push(`# ${t('ai.rep.title')}`, '');
    L.push(`**${t('ai.rep.project')}:** ${b.name}  `);
    L.push(`**${t('ai.rep.date')}:** ${U.fmtDate(U.today(), { day: 'numeric', month: 'long', year: 'numeric' })}  `);
    L.push(`**${t('ai.rep.basis')}:** ${t('ai.rep.basisText')}`, '');
    if (!all.length) { L.push(t('ai.rep.none')); return L.join('\n'); }
    const tools = [...new Set(all.map(a => `${a.tool}${a.version ? ' (' + a.version + ')' : ''}`))];
    L.push(`## ${t('ai.rep.summary')}`, '');
    L.push(t('ai.rep.summaryText', { n: all.length, tools: tools.join(', ') }), '');
    L.push(`| ${t('ai.f.tool')} | ${t('ai.f.stage')} | ${t('ai.f.nature')} | ${t('ai.f.date')} |`, '|---|---|---|---|');
    all.forEach(a => L.push(`| ${a.tool}${a.version ? ' ' + a.version : ''} | ${(a.stage || '').replace(/\|/g, '/')} | ${t('ainature.' + a.nature)} | ${U.fmtDate(a.date)} |`));
    L.push('', `## ${t('ai.rep.details')}`, '');
    const byTool = {};
    all.forEach(a => { (byTool[`${a.tool}${a.version ? ' — ' + a.version : ''}`] ||= []).push(a); });
    for (const [tool, list] of Object.entries(byTool)) {
      L.push(`### ${tool}`, '');
      list.forEach(a => {
        const who = Store.get(a.memberId)?.name;
        const cards = (a.cardIds || []).map(id => Store.get(id)).filter(Boolean).map(c => `${Model.cardKey(c)} ${c.title}`);
        L.push(`- **${t('ai.f.stage')}:** ${a.stage || '—'}`);
        L.push(`  - ${t('ai.f.category')}: ${t('aicat.' + a.category)} (${t('ai.grp.' + this.groupOf(a.category))})`);
        L.push(`  - ${t('ai.f.nature')}: ${t('ainature.' + a.nature)}`);
        if (a.purpose) L.push(`  - ${t('ai.f.purpose')}: ${a.purpose}`);
        if (a.humanRole) L.push(`  - ${t('ai.f.human')}: ${a.humanRole}`);
        if (cards.length) L.push(`  - ${t('ai.f.cards')}: ${cards.join('; ')}`);
        L.push(`  - ${t('ai.f.date')}: ${U.fmtDate(a.date, { day: 'numeric', month: 'long', year: 'numeric' })}${who ? ` · ${who}` : ''}`);
        const done = AI_CHECKS.filter(k => (a.checks || {})[k]).map(k => t('aichk.' + k));
        if (done.length) L.push(`  - ${t('ai.f.checks')}: ${done.join('; ')}`);
      });
      L.push('');
    }
    const open = all.filter(a => this.missing(a).length);
    if (open.length) {
      L.push(`## ${t('ai.rep.open')}`, '');
      open.forEach(a => L.push(`- ${a.tool} — ${a.stage}: ${this.missing(a).map(k => t('aichk.' + k)).join(', ')}`));
      L.push('');
    }
    L.push(`## ${t('ai.rep.pledge')}`, '', t('ai.rep.pledgeText'), '');
    L.push(`${t('ai.rep.signature')}: ______________________`);
    return L.join('\n');
  },
  report() {
    let only = true;
    const m = UI.modal({
      title: t('ai.report'), cls: 'report-modal',
      body: `<div class="report-bar"><label class="toggle"><input type="checkbox" data-only checked><span>${t('ai.rep.onlySig')}</span></label><span class="grow"></span>
        <button class="btn sm" data-r="copy">${icon('copy')} ${t('copy')}</button><button class="btn sm" data-r="md">${icon('download')} .md</button><button class="btn sm primary" data-r="print">${icon('print')} ${t('ai.rep.print')}</button></div>
        <article class="md report-preview"></article>`,
    });
    const draw = () => { U.$('.report-preview', m.el).innerHTML = MD.render(this.reportText(only)); };
    draw();
    m.el.addEventListener('change', e => { if (e.target.matches('[data-only]')) { only = e.target.checked; draw(); } });
    m.el.addEventListener('click', async e => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (!r) return;
      const txt = this.reportText(only);
      if (r === 'copy') { await U.copy(txt); UI.toast(t('copied')); }
      else if (r === 'md') U.download(`${Model.board().name}-UYZ-beyan.md`, txt, 'text/markdown');
      else if (r === 'print') {
        const w = window.open('', '_blank');
        if (!w) { UI.toast(t('popupBlocked'), { kind: 'err' }); return; }
        w.document.write(`<!doctype html><html lang="${I18n.lang()}"><head><meta charset="utf-8"><title>${U.esc(t('ai.rep.title'))}</title>
          <style>body{font:12pt/1.5 'Segoe UI',Arial,sans-serif;max-width:760px;margin:32px auto;color:#111}h1{font-size:20pt}h2{font-size:14pt;margin-top:24px;border-bottom:1px solid #ccc}h3{font-size:12pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:4px 8px;text-align:left;font-size:10pt}</style></head>
          <body>${MD.render(txt)}</body></html>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
      }
    });
  },
  csv() {
    const rows = Model.aiEntries(Model.board().id);
    const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const head = ['date', 'person', 'tool', 'version', 'category', 'nature', 'stage', 'purpose', 'human_contribution', 'significant', ...AI_CHECKS, 'cards', 'notes'];
    const lines = [head.join(',')].concat(rows.map(a => [a.date, Store.get(a.memberId)?.name, a.tool, a.version, t('aicat.' + a.category), t('ainature.' + a.nature), a.stage, a.purpose, a.humanRole,
      a.significant ? 1 : 0, ...AI_CHECKS.map(k => ((a.checks || {})[k] ? 1 : 0)), (a.cardIds || []).map(id => Store.get(id)).filter(Boolean).map(c => Model.cardKey(c)).join(' '), a.notes].map(q).join(',')));
    U.download(`${Model.board().name}-ai-usage.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  },
};
