'use strict';
/* GDD / wiki pages with Markdown. */
const WikiView = {
  el: null, mode: 'split', dirty: false,
  busy() { const a = document.activeElement; return !!(a && this.el?.contains(a) && a.matches('textarea, input')); },
  mount(el) {
    this.el = el;
    el.className = 'view view-wiki';
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('input', e => this.onInput(e));
    el.addEventListener('focusout', e => { if (e.target.matches('.wiki-editor, .wiki-title-input')) this.save(); });
    this.mode = innerWidth < 900 ? 'preview' : 'split';
    this.render();
  },
  pages() { return Model.wiki(Model.board().id); },
  current() {
    const ps = this.pages();
    return ps.find(p => p.id === Prefs.get('wikiPage')) || ps[0] || null;
  },
  render() {
    const ps = this.pages(), cur = this.current();
    const seg = (v, label) => `<button class="seg-btn ${this.mode === v ? 'on' : ''}" data-mode="${v}">${label}</button>`;
    this.el.innerHTML = `<div class="wiki-layout">
      <aside class="panel wiki-side">
        <div class="side-head"><h2 class="panel-title">${icon('book')} ${t('view.wiki')}</h2><button class="icon-btn" data-a="new" aria-label="${t('wiki.new')}">${icon('plus')}</button></div>
        <nav class="wiki-pages">${ps.map(p => `<button class="wiki-link ${cur && p.id === cur.id ? 'on' : ''}" data-page="${p.id}">${icon('file')}<span>${U.esc(p.title || t('wiki.untitled'))}</span></button>`).join('') || `<p class="hint">${t('wiki.empty')}</p>`}</nav>
      </aside>
      <section class="panel wiki-main">
        ${cur ? `<div class="toolbar">
            <input class="wiki-title-input" value="${U.esc(cur.title)}" aria-label="${t('wiki.title')}" placeholder="${t('wiki.untitled')}">
            <div class="seg">${seg('edit', t('wiki.edit'))}${seg('split', t('wiki.split'))}${seg('preview', t('wiki.preview'))}</div>
            <button class="icon-btn" data-a="download" aria-label="${t('wiki.download')}" title="${t('wiki.download')}">${icon('download')}</button>
            <button class="icon-btn" data-a="delete" aria-label="${t('delete')}" title="${t('delete')}">${icon('trash')}</button>
          </div>
          <div class="wiki-body mode-${this.mode}">
            <textarea class="wiki-editor mono" spellcheck="true" aria-label="${t('wiki.content')}" placeholder="${t('md.hint')}">${U.esc(cur.content || '')}</textarea>
            <article class="md wiki-preview">${MD.render(cur.content || '') || `<p class="hint">${t('wiki.nothing')}</p>`}</article>
          </div>
          <p class="hint wiki-meta">${t('md.hint')} · ${t('wiki.updated')} ${U.esc(U.relTime(cur.updatedAt))}</p>`
        : `<div class="empty-state"><p>${t('wiki.empty')}</p><button class="btn primary" data-a="new">${icon('plus')} ${t('wiki.new')}</button></div>`}
      </section></div>`;
  },
  onInput(e) {
    if (e.target.matches('.wiki-editor')) {
      U.$('.wiki-preview', this.el).innerHTML = MD.render(e.target.value);
      this.dirty = true;
      clearTimeout(this.t); this.t = setTimeout(() => this.save(), 1200);
    } else if (e.target.matches('.wiki-title-input')) { this.dirty = true; clearTimeout(this.t); this.t = setTimeout(() => this.save(), 1200); }
  },
  save() {
    if (!this.dirty) return;
    this.dirty = false;
    const cur = this.current(); if (!cur) return;
    const content = U.$('.wiki-editor', this.el)?.value ?? cur.content;
    const title = U.$('.wiki-title-input', this.el)?.value.trim() || cur.title;
    if (content !== cur.content || title !== cur.title) Store.update(cur.id, { content, title });
  },
  async onClick(e) {
    const mode = e.target.closest('[data-mode]');
    if (mode) { this.save(); this.mode = mode.dataset.mode; this.render(); return; }
    const pg = e.target.closest('[data-page]');
    if (pg) { this.save(); Prefs.set('wikiPage', pg.dataset.page); this.render(); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const cur = this.current();
    if (a.dataset.a === 'new') {
      this.save();
      const tpl = await UI.choice(t('wiki.new'), t('wiki.pickTemplate'), [
        { value: 'blank', label: t('wiki.tpl.blank') }, { value: 'gdd', label: t('wiki.tpl.gdd'), primary: true },
        { value: 'character', label: t('wiki.tpl.character') }, { value: 'level', label: t('wiki.tpl.level') }, { value: 'meeting', label: t('wiki.tpl.meeting') }]);
      if (!tpl) return;
      const content = WikiTemplates[tpl]();
      const title = (content.match(/^#\s+(.+)$/m) || [])[1] || t('wiki.untitled');
      const p = Store.create('wiki', { boardId: Model.board().id, title, content, pos: Model.nextPos(this.pages()) });
      Prefs.set('wikiPage', p.id);
      this.render();
    } else if (a.dataset.a === 'delete' && cur) {
      if (!(await UI.confirm(t('wiki.deleteConfirm', { title: cur.title }), { ok: t('delete'), danger: true }))) return;
      const snap = Store.remove(cur.id);
      UI.toast(t('wiki.deleted'), { action: t('undo'), onAction: () => Store.restore(snap) });
    } else if (a.dataset.a === 'download' && cur) {
      this.save();
      U.download(`${cur.title || 'page'}.md`, this.current().content || '', 'text/markdown');
    }
  },
};
