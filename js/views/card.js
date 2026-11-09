'use strict';
/* Card detail dialog. */
const CardModal = {
  m: null, id: null, root: null, editDesc: false, tab: 'comments', pendingRender: false, editingItem: null, editingComment: null,

  open(id) {
    if (!Store.get(id)) return;
    if (this.m) this.m.close();
    Object.assign(this, { id, editDesc: false, tab: 'comments', editingItem: null, editingComment: null, pendingRender: false });
    this.m = UI.modal({ cls: 'card-modal', focus: false, body: '<div class="cm"></div>', onClose: () => { this.unsub && this.unsub(); this.m = null; this.id = null; } });
    this.m.el.setAttribute('aria-label', Store.get(id).title);
    this.root = this.m.body.firstElementChild;
    this.unsub = Store.subscribe(() => this.onStore());
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('change', e => this.onChange(e));
    this.root.addEventListener('keydown', e => this.onKey(e));
    this.root.addEventListener('input', e => { if (e.target.matches('.cm-title')) this.grow(e.target); });
    this.root.addEventListener('focusout', e => {
      if (e.target.matches('.cl-edit') && this.editingItem) { this.saveItem(e.target); return; }
      if (this.pendingRender) setTimeout(() => { if (this.m && !this.root.contains(document.activeElement)) { this.pendingRender = false; this.render(); } }, 0); });
    this.render();
  },
  card() { return Store.get(this.id); },
  onStore() {
    if (!this.m) return;
    if (!this.card()) { this.m.close(); return; }
    const a = document.activeElement;
    if (a && this.root.contains(a) && a.matches('input:not([type=checkbox]), textarea, select')) { this.pendingRender = true; return; }
    this.render();
  },
  grow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; },

  render() {
    const c = this.card(); if (!c) return;
    const b = Store.get(c.boardId);
    const lists = Model.lists(c.boardId);
    const labels = Model.cardLabels(c), members = Model.cardMembers(c);
    const cl = c.checklist || [], clDone = cl.filter(i => i.done).length;
    const pct = cl.length ? Math.round(clDone / cl.length * 100) : 0;
    const col = U.safeColor(c.color);
    const ms = Model.milestones(c.boardId);
    const preds = Model.preds(c);
    const succs = Store.all('card', x => x.boardId === c.boardId && (x.dependsOn || []).includes(c.id));
    const ai = Store.all('ai', a => (a.cardIds || []).includes(c.id));
    const comments = Model.comments(c.id), acts = Model.activity(c.id).slice(0, 60);
    const scroll = U.$('.cm-main', this.root)?.scrollTop;
    const opt = (v, label, cur) => `<option value="${U.esc(v)}" ${v === (cur || '') ? 'selected' : ''}>${U.esc(label)}</option>`;
    const bug = c.bug || {};

    this.root.innerHTML = `
    <header class="cm-head ${col ? 'has-cover' : ''}" ${col ? `style="--cover:${col}"` : ''}>
      <div class="cm-crumbs"><span class="mono">${U.esc(Model.cardKey(c))}</span><span>·</span><label class="inline-select">${t('card.inList')}
        <select data-f="listId">${lists.map(l => opt(l.id, l.name, c.listId)).join('')}</select></label>
        ${b ? `<span class="muted">· ${U.esc(b.name)}</span>` : ''}</div>
      <div class="cm-title-row">
        <button class="chk big ${c.done ? 'on' : ''}" data-a="done" aria-label="${c.done ? t('card.reopen') : t('card.complete')}">${icon('check')}</button>
        <textarea class="cm-title" data-f="title" rows="1" aria-label="${t('card.title')}" data-esc-blur>${U.esc(c.title)}</textarea>
      </div>
      <button class="icon-btn cm-close" data-close aria-label="${t('close')}">${icon('x')}</button>
    </header>
    <div class="cm-grid">
      <div class="cm-main">
        <div class="cm-summary">
          <div class="sum-group"><h5>${t('card.members')}</h5><div class="row wrap">${members.map(m => UI.avatar(m)).join('')}<button class="round-btn" data-a="members" aria-label="${t('card.editMembers')}">${icon('plus')}</button></div></div>
          <div class="sum-group"><h5>${t('card.labels')}</h5><div class="row wrap">${labels.map(l => `<span class="lbl lg" style="--c:${U.safeColor(l.color, '#888')}">${U.esc(l.name)}</span>`).join('')}<button class="round-btn" data-a="labels" aria-label="${t('card.editLabels')}">${icon('plus')}</button></div></div>
          ${c.start || c.due ? `<div class="sum-group"><h5>${t('card.dates')}</h5><span class="badge due big ${Model.dueState(c)}">${icon('clock')}${U.esc(U.fmtRange(c.start, c.due))}${c.done ? ` · ${t('card.doneShort')}` : Model.isOverdue(c) ? ` · ${t('card.overdue')}` : ''}</span></div>` : ''}
          ${c.priority ? `<div class="sum-group"><h5>${t('card.priority')}</h5><span class="badge big" style="color:${PRIORITY_COLOR[c.priority]}">${icon('flag')}${t('prio.' + c.priority)}</span></div>` : ''}
        </div>

        ${c.kind === 'bug' ? `<section class="cm-sec bug-sec">
          <h4>${icon('bug')} ${t('bug.title')}</h4>
          <div class="form-grid">
            <label>${t('bug.severity')}<select class="input" data-f="bug.severity">${opt('', '—', bug.severity)}${SEVERITIES.map(s => opt(s, t('sev.' + s), bug.severity)).join('')}</select></label>
            <label>${t('bug.repro')}<select class="input" data-f="bug.repro">${opt('', '—', bug.repro)}${REPRO.map(s => opt(s, t('repro.' + s), bug.repro)).join('')}</select></label>
            <label>${t('bug.build')}<input class="input mono" data-f="bug.build" value="${U.esc(bug.build || '')}" placeholder="v0.3.1 / #128"></label>
          </div>
          <div class="field"><span class="field-label">${t('bug.platforms')}</span><div class="chips">${PLATFORMS.map(p => `<button class="chip ${(bug.platforms || []).includes(p) ? 'on' : ''}" data-a="platform" data-v="${p}">${p}</button>`).join('')}</div></div>
          <label class="field">${t('bug.steps')}<textarea class="input" rows="3" data-f="bug.steps" placeholder="1. …&#10;2. …">${U.esc(bug.steps || '')}</textarea></label>
          <div class="form-grid two">
            <label>${t('bug.expected')}<textarea class="input" rows="2" data-f="bug.expected">${U.esc(bug.expected || '')}</textarea></label>
            <label>${t('bug.actual')}<textarea class="input" rows="2" data-f="bug.actual">${U.esc(bug.actual || '')}</textarea></label>
          </div>
        </section>` : ''}

        <section class="cm-sec">
          <div class="sec-head"><h4>${icon('text')} ${t('card.desc')}</h4>${!this.editDesc && c.desc ? `<button class="btn sm ghost" data-a="desc-edit">${icon('edit')} ${t('edit')}</button>` : ''}</div>
          ${this.editDesc
            ? `<textarea class="input desc-input" rows="7" placeholder="${t('card.descPh')}">${U.esc(c.desc || '')}</textarea>
               <div class="row"><button class="btn primary sm" data-a="desc-save">${t('save')}</button><button class="btn sm ghost" data-a="desc-cancel">${t('cancel')}</button><span class="hint">${t('md.hint')}</span></div>`
            : c.desc ? `<div class="md" data-a="desc-edit">${MD.render(c.desc)}</div>`
              : `<button class="placeholder-btn" data-a="desc-edit">${t('card.descPh')}</button>`}
        </section>

        <section class="cm-sec">
          <div class="sec-head"><h4>${icon('checklist')} ${t('card.checklist')}</h4>${cl.length ? `<span class="mono muted">${clDone}/${cl.length}</span>` : ''}</div>
          ${cl.length ? `<div class="progress"><div class="track"><div class="progress-bar ${pct === 100 ? 'full' : ''}" style="width:${pct}%"></div></div><span class="mono">${pct}%</span></div>` : ''}
          <ul class="checklist">${cl.map((it, i) => `<li class="${it.done ? 'done' : ''}">
              <input type="checkbox" data-a="cl-toggle" data-i="${i}" ${it.done ? 'checked' : ''} aria-label="${U.esc(it.text)}">
              ${this.editingItem === it.id ? `<input class="input sm cl-edit" data-i="${i}" value="${U.esc(it.text)}" data-esc-blur>` : `<span class="cl-text" data-a="cl-edit" data-i="${i}">${U.esc(it.text)}</span>`}
              <button class="icon-btn sm" data-a="cl-del" data-i="${i}" aria-label="${t('delete')}">${icon('x')}</button></li>`).join('')}</ul>
          <input class="input sm cl-new" placeholder="${t('card.checklistAdd')}" data-esc-blur>
        </section>

        <section class="cm-sec">
          <div class="sec-head"><h4>${icon('link')} ${t('card.deps')}</h4><button class="btn sm ghost" data-a="dep-add">${icon('plus')} ${t('card.depAdd')}</button></div>
          ${preds.length || succs.length ? `<div class="dep-list">
            ${preds.map(p => `<div class="dep"><span class="dep-kind">${t('card.blockedBy')}</span><button class="link" data-a="open-card" data-id="${p.id}"><span class="mono">${U.esc(Model.cardKey(p))}</span> ${U.esc(p.title)}</button>${p.done ? `<span class="badge complete">${icon('check')}</span>` : ''}<button class="icon-btn sm" data-a="dep-del" data-id="${p.id}" aria-label="${t('delete')}">${icon('x')}</button></div>`).join('')}
            ${succs.map(s => `<div class="dep"><span class="dep-kind">${t('card.blocks')}</span><button class="link" data-a="open-card" data-id="${s.id}"><span class="mono">${U.esc(Model.cardKey(s))}</span> ${U.esc(s.title)}</button></div>`).join('')}
          </div>` : `<p class="hint">${t('card.depsHint')}</p>`}
        </section>

        <section class="cm-sec">
          <div class="sec-head"><h4>${icon('sparkle')} ${t('ai.title')}</h4><button class="btn sm ghost" data-a="ai-add">${icon('plus')} ${t('ai.add')}</button></div>
          ${ai.length ? `<div class="ai-mini">${ai.map(a => `<button class="ai-row" data-a="ai-open" data-id="${a.id}"><strong>${U.esc(a.tool)} ${U.esc(a.version || '')}</strong><span>${t('aicat.' + a.category)}</span><span class="mono muted">${U.esc(U.fmtDate(a.date))}</span></button>`).join('')}</div>`
            : `<p class="hint">${t('ai.cardHint')}</p>`}
        </section>

        <section class="cm-sec">
          <div class="tabs" role="tablist">
            <button role="tab" class="tab ${this.tab === 'comments' ? 'on' : ''}" data-a="tab" data-v="comments">${icon('comment')} ${t('card.comments')} <span class="mono">${comments.length}</span></button>
            <button role="tab" class="tab ${this.tab === 'activity' ? 'on' : ''}" data-a="tab" data-v="activity">${icon('clock')} ${t('card.activity')}</button>
          </div>
          ${this.tab === 'comments' ? `
            <div class="comment-new">${UI.avatar(Model.me()) || `<span class="av">${icon('user')}</span>`}
              <div class="grow"><textarea class="input comment-input" rows="2" placeholder="${t('card.commentPh')}"></textarea>
              <div class="row"><button class="btn primary sm" data-a="comment-send">${t('card.commentSend')}</button>${!Model.me() ? `<span class="hint">${t('card.whoAmI')}</span>` : ''}</div></div></div>
            <ul class="comments">${comments.slice().reverse().map(cm => {
              const who = Store.get(cm.by);
              return `<li>${UI.avatar(who) || `<span class="av">${icon('user')}</span>`}<div class="grow">
                <div class="c-meta"><strong>${U.esc(who?.name || t('unknown'))}</strong><span class="muted">${U.esc(U.relTime(cm.createdAt))}${cm.edited ? ' · ' + t('edited') : ''}</span></div>
                ${this.editingComment === cm.id
                  ? `<textarea class="input comment-edit" rows="2" data-id="${cm.id}">${U.esc(cm.text)}</textarea><div class="row"><button class="btn primary sm" data-a="comment-save" data-id="${cm.id}">${t('save')}</button><button class="btn ghost sm" data-a="comment-cancel">${t('cancel')}</button></div>`
                  : `<div class="md bubble">${MD.render(cm.text)}</div><div class="c-actions"><button class="link sm" data-a="comment-edit" data-id="${cm.id}">${t('edit')}</button><button class="link sm" data-a="comment-del" data-id="${cm.id}">${t('delete')}</button></div>`}
              </div></li>`;
            }).join('')}</ul>`
          : `<ul class="activity">${acts.map(a => {
              const who = Store.get(a.by);
              return `<li>${UI.avatar(who, 'sm') || `<span class="av sm">${icon('user')}</span>`}<span><strong>${U.esc(who?.name || t('someone'))}</strong> ${U.esc(t(a.key, a.params || {}))}</span><span class="muted mono">${U.esc(U.relTime(a.createdAt))}</span></li>`;
            }).join('') || `<li class="hint">${t('card.noActivity')}</li>`}</ul>`}
        </section>
      </div>

      <aside class="cm-side">
        <label class="field">${t('card.type')}<select class="input" data-f="kind">${CARD_TYPES.map(x => opt(x, t('type.' + x), c.kind || 'task')).join('')}</select></label>
        <div class="form-grid two">
          <label class="field">${t('card.start')}<input type="date" class="input" data-f="start" value="${c.start || ''}"></label>
          <label class="field">${t('card.due')}<input type="date" class="input" data-f="due" value="${c.due || ''}"></label>
        </div>
        <div class="form-grid two">
          <label class="field">${t('card.priority')}<select class="input" data-f="priority">${opt('', t('none'), c.priority)}${PRIORITIES.map(p => opt(p, t('prio.' + p), c.priority)).join('')}</select></label>
          <label class="field">${t('card.estimate')}<input type="number" min="0" step="0.5" class="input mono" data-f="estimate" value="${c.estimate ?? ''}" placeholder="${t('hoursShort')}"></label>
        </div>
        <label class="field">${t('card.milestone')}<select class="input" data-f="milestoneId">${opt('', t('none'), c.milestoneId)}${ms.map(m => opt(m.id, `${m.name} · ${U.fmtDate(m.date)}`, c.milestoneId)).join('')}</select></label>
        <div class="field"><span class="field-label">${t('card.cover')}</span>${UI.swatches(c.color, { none: true })}</div>
        <div class="side-actions">
          <button class="btn ${c.done ? '' : 'primary'}" data-a="done">${icon('check')} ${c.done ? t('card.reopen') : t('card.complete')}</button>
          <button class="btn ghost" data-a="duplicate">${icon('copy')} ${t('card.duplicate')}</button>
          <button class="btn ghost danger-text" data-a="delete">${icon('trash')} ${t('delete')}</button>
        </div>
        <p class="hint mono">${t('card.created')} ${U.esc(U.fmtDateTime(c.createdAt || Date.now()))}</p>
      </aside>
    </div>`;
    const ta = U.$('.cm-title', this.root); this.grow(ta);
    if (scroll) U.$('.cm-main', this.root).scrollTop = scroll;
    if (this.editDesc) { const d = U.$('.desc-input', this.root); d.focus(); }
    if (this.editingItem) U.$('.cl-edit', this.root)?.select();
    if (this.editingComment) U.$('.comment-edit', this.root)?.focus();
  },

  onChange(e) {
    const f = e.target.dataset.f; if (!f) return;
    const c = this.card(); if (!c) return;
    let v = e.target.value;
    if (f === 'title') { v = v.replace(/\s+/g, ' ').trim(); if (!v) { e.target.value = c.title; return; } if (v === c.title) return; Store.update(c.id, { title: v }); Model.log(c, 'act.renamed', { title: v }); return; }
    if (f === 'listId') { Store.update(c.id, { listId: v, pos: Model.nextPos(Model.cards(v)) }); Model.log(c, 'act.moved', { list: Store.get(v)?.name }); return; }
    if (f.startsWith('bug.')) { Store.update(c.id, { bug: { ...(c.bug || {}), [f.slice(4)]: v } }); return; }
    if (f === 'estimate') { Store.update(c.id, { estimate: v === '' ? null : Math.max(0, +v) }); return; }
    if (f === 'start' || f === 'due') {
      const patch = { [f]: v || null };
      const s = f === 'start' ? v : c.start, d = f === 'due' ? v : c.due;
      if (s && d && s > d) { if (f === 'start') patch.due = s; else patch.start = d; }
      Store.update(c.id, patch);
      Model.log(c, 'act.dates', { range: U.fmtRange(patch.start ?? c.start, patch.due ?? c.due) || '—' });
      return;
    }
    if (f === 'kind') { Store.update(c.id, { kind: v }); return; }
    Store.update(c.id, { [f]: v });
  },

  onKey(e) {
    const tg = e.target;
    if (tg.matches('.cm-title') && e.key === 'Enter') { e.preventDefault(); tg.blur(); }
    else if (tg.matches('.cl-new') && e.key === 'Enter') {
      e.preventDefault();
      const v = tg.value.trim(); if (!v) return;
      const c = this.card();
      Store.update(c.id, { checklist: [...(c.checklist || []), { id: U.uid(), text: v, done: false }] });
      tg.value = '';
    } else if (tg.matches('.cl-edit') && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Enter') this.saveItem(tg); else { this.editingItem = null; this.render(); }
    } else if (tg.matches('.desc-input') && e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); this.saveDesc(); }
    else if (tg.matches('.desc-input') && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.editDesc = false; this.render(); }
    else if (tg.matches('.comment-input') && e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); this.sendComment(); }
  },
  saveItem(inp) {
    const c = this.card(), i = +inp.dataset.i, v = inp.value.trim();
    this.editingItem = null;
    const cl = [...(c.checklist || [])];
    if (v && cl[i] && cl[i].text !== v) { cl[i] = { ...cl[i], text: v }; Store.update(c.id, { checklist: cl }); } else this.render();
  },
  saveDesc() {
    const v = U.$('.desc-input', this.root).value;
    this.editDesc = false;
    const c = this.card();
    if (v !== (c.desc || '')) Store.update(c.id, { desc: v }); else this.render();
  },
  sendComment() {
    const ta = U.$('.comment-input', this.root);
    const v = ta.value.trim(); if (!v) { ta.focus(); return; }
    const c = this.card();
    ta.value = '';
    Store.create('comment', { boardId: c.boardId, cardId: c.id, text: v, by: Prefs.get('me') || null });
  },

  async onClick(e) {
    const a = e.target.closest('[data-a], [data-color]'); if (!a) return;
    const c = this.card(); if (!c) return;
    if (a.dataset.color !== undefined && !a.dataset.a) { Store.update(c.id, { color: a.dataset.color }); return; }
    const act = a.dataset.a, i = +a.dataset.i;
    const cl = [...(c.checklist || [])];
    switch (act) {
      case 'done': Model.setDone(c, !c.done); break;
      case 'members': this.membersPop(a); break;
      case 'labels': this.labelsPop(a); break;
      case 'desc-edit': if (e.target.closest('a')) return; this.editDesc = true; this.render(); break;
      case 'desc-save': this.saveDesc(); break;
      case 'desc-cancel': this.editDesc = false; this.render(); break;
      case 'cl-toggle': cl[i] = { ...cl[i], done: a.checked }; Store.update(c.id, { checklist: cl }); break;
      case 'cl-del': cl.splice(i, 1); Store.update(c.id, { checklist: cl }); break;
      case 'cl-edit': this.editingItem = cl[i].id; this.render(); break;
      case 'platform': {
        const p = a.dataset.v, cur = c.bug?.platforms || [];
        Store.update(c.id, { bug: { ...(c.bug || {}), platforms: cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p] } });
        break;
      }
      case 'dep-add': this.depsPop(a); break;
      case 'dep-del': Store.update(c.id, { dependsOn: (c.dependsOn || []).filter(x => x !== a.dataset.id) }); break;
      case 'open-card': this.open(a.dataset.id); break;
      case 'ai-add': AIView.openForm(null, { cardIds: [c.id], boardId: c.boardId }); break;
      case 'ai-open': AIView.openForm(a.dataset.id); break;
      case 'tab': this.tab = a.dataset.v; this.render(); break;
      case 'comment-send': this.sendComment(); break;
      case 'comment-edit': this.editingComment = a.dataset.id; this.render(); break;
      case 'comment-cancel': this.editingComment = null; this.render(); break;
      case 'comment-save': {
        const v = U.$('.comment-edit', this.root).value.trim();
        this.editingComment = null;
        if (v) Store.update(a.dataset.id, { text: v, edited: true }); else this.render();
        break;
      }
      case 'comment-del':
        if (await UI.confirm(t('card.commentDelete'), { ok: t('delete'), danger: true })) Store.remove(a.dataset.id);
        break;
      case 'duplicate': {
        const { id, num, createdAt, updatedAt, updatedBy, ...rest } = c;
        const n = Store.create('card', { ...rest, title: c.title + ' ' + t('card.copySuffix'), num: Model.nextNum(c.boardId), pos: c.pos + 1, done: false, doneAt: null,
          checklist: (c.checklist || []).map(x => ({ ...x, id: U.uid(), done: false })) });
        Model.log(n, 'act.created', { list: Store.get(n.listId)?.name });
        this.open(n.id);
        break;
      }
      case 'delete':
        if (await UI.confirm(t('card.deleteConfirm', { title: c.title }), { ok: t('delete'), danger: true })) { this.m.close(); Model.removeCard(c); }
        break;
    }
  },

  membersPop(anchor) {
    const render = () => {
      const c = this.card();
      return `<div class="menu"><div class="menu-title">${t('card.members')}</div>
        ${Model.members().map(m => `<button class="menu-item" data-mid="${m.id}">${UI.avatar(m, 'sm')} ${U.esc(m.name)} ${(c.memberIds || []).includes(m.id) ? `<span class="tick">${icon('check')}</span>` : ''}</button>`).join('') || `<p class="hint">${t('members.none')}</p>`}
        <div class="menu-sep"></div><button class="menu-item" data-manage>${icon('users')} ${t('members.manage')}</button></div>`;
    };
    const pop = UI.pop(anchor, render());
    pop.el.addEventListener('click', e => {
      if (e.target.closest('[data-manage]')) { UI.closePopover(); Settings.open('members'); return; }
      const b = e.target.closest('[data-mid]'); if (!b) return;
      const c = this.card(), id = b.dataset.mid, cur = c.memberIds || [];
      const add = !cur.includes(id);
      Store.update(c.id, { memberIds: add ? [...cur, id] : cur.filter(x => x !== id) });
      Model.log(c, add ? 'act.memberAdded' : 'act.memberRemoved', { name: Store.get(id)?.name });
      pop.el.innerHTML = render();
    });
  },

  labelsPop(anchor) {
    let newColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    const render = () => {
      const c = this.card();
      return `<div class="menu labels-menu"><div class="menu-title">${t('card.labels')}</div>
        ${Model.labels(c.boardId).map(l => `<button class="menu-item" data-lid="${l.id}"><span class="lbl" style="--c:${U.safeColor(l.color, '#888')}">${U.esc(l.name)}</span>${(c.labelIds || []).includes(l.id) ? `<span class="tick">${icon('check')}</span>` : ''}</button>`).join('')}
        <div class="menu-sep">${t('labels.new')}</div>
        <input class="input sm" data-new placeholder="${t('labels.namePh')}">
        ${UI.swatches(newColor)}
        <button class="btn primary sm full" data-create>${t('labels.create')}</button>
        <button class="menu-item" data-manage>${icon('tag')} ${t('labels.manage')}</button></div>`;
    };
    const pop = UI.pop(anchor, render());
    const create = () => {
      const inp = U.$('[data-new]', pop.el), name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      const c = this.card();
      const l = Store.create('label', { boardId: c.boardId, name, color: newColor, pos: Model.nextPos(Model.labels(c.boardId)) });
      Store.update(c.id, { labelIds: [...(c.labelIds || []), l.id] });
      pop.el.innerHTML = render();
    };
    pop.el.addEventListener('keydown', e => { if (e.target.matches('[data-new]') && e.key === 'Enter') { e.preventDefault(); create(); } });
    pop.el.addEventListener('click', e => {
      if (e.target.closest('[data-manage]')) { UI.closePopover(); Settings.open('labels'); return; }
      if (e.target.closest('[data-create]')) { create(); return; }
      const sw = e.target.closest('[data-color]');
      if (sw) { newColor = sw.dataset.color; U.$$('.sw', pop.el).forEach(s => s.classList.toggle('on', s === sw)); return; }
      const b = e.target.closest('[data-lid]'); if (!b) return;
      const c = this.card(), id = b.dataset.lid, cur = c.labelIds || [];
      Store.update(c.id, { labelIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
      pop.el.innerHTML = render();
    });
  },

  depsPop(anchor) {
    const c = this.card();
    const el = U.html(`<div class="menu deps-menu"><div class="menu-title">${t('card.depPick')}</div><input class="input sm" placeholder="${t('search')}"><div class="dep-options"></div></div>`);
    const fill = q => {
      q = q.toLocaleLowerCase(I18n.locale());
      const opts = Model.boardCards(c.boardId)
        .filter(x => x.id !== c.id && !(c.dependsOn || []).includes(x.id) && !Model.dependsOnTransitive(x.id, c.id))
        .filter(x => !q || x.title.toLocaleLowerCase(I18n.locale()).includes(q) || Model.cardKey(x).toLowerCase().includes(q))
        .slice(0, 40);
      U.$('.dep-options', el).innerHTML = opts.map(x => `<button class="menu-item" data-id="${x.id}"><span class="mono muted">${U.esc(Model.cardKey(x))}</span> ${U.esc(x.title)}</button>`).join('') || `<p class="hint">${t('nothingFound')}</p>`;
    };
    fill('');
    el.querySelector('input').addEventListener('input', e => fill(e.target.value));
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      UI.closePopover();
      Model.addDependency(c.id, b.dataset.id);
    });
    UI.pop(anchor, el);
  },
};
