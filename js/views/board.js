'use strict';
/* Kanban board: lists and cards with pointer-based drag & drop (mouse, pen and touch). */
const BoardView = {
  el: null, drag: null, pend: null, composer: null, editingList: null, addingList: false, suppressClick: false,

  mount(el) {
    this.el = el;
    el.className = 'view view-board';
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    el.addEventListener('pointerdown', e => this.onPointerDown(e));
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('keydown', e => this.onKey(e));
    el.addEventListener('focusout', e => this.onFocusOut(e));
    this.render();
  },
  busy() { return !!(this.drag || this.pend); },

  render() {
    const el = this.el, b = Model.board();
    if (!b) { el.innerHTML = `<div class="empty-state"><p>${t('board.none')}</p></div>`; return; }
    const sc = U.$('.board-scroll', el);
    const sl = sc ? sc.scrollLeft : 0;
    const st = {};
    U.$$('.list', el).forEach(l => { st[l.dataset.list] = U.$('.list-cards', l)?.scrollTop || 0; });
    const draft = U.$('.composer textarea', el)?.value;
    if (this.composer && draft != null) this.composer.text = draft;

    const ctx = {
      filtering: Filter.active(),
      ai: {}, comments: {},
    };
    Store.all('ai', a => a.boardId === b.id).forEach(a => (a.cardIds || []).forEach(id => { ctx.ai[id] = (ctx.ai[id] || 0) + 1; }));
    Store.all('comment', c => c.boardId === b.id).forEach(c => { ctx.comments[c.cardId] = (ctx.comments[c.cardId] || 0) + 1; });
    const lists = Model.lists(b.id);
    let shown = 0, total = 0;
    const listsHtml = lists.map(l => {
      const all = Model.cards(l.id);
      const cards = ctx.filtering ? all.filter(c => Filter.match(c)) : all;
      shown += cards.length; total += all.length;
      return this.listHTML(l, all, cards, ctx);
    }).join('');

    el.innerHTML = `
      ${ctx.filtering ? `<div class="filter-strip">${icon('filter')}<span>${t('filter.showing', { n: shown, total })}</span><button class="btn sm ghost" data-act="clear-filter">${t('filter.clear')}</button></div>` : ''}
      <div class="board-scroll"><div class="lists">${listsHtml}
        <div class="list-add">${this.addingList
          ? `<div class="composer"><input class="input" data-role="new-list" placeholder="${t('list.namePh')}" data-esc-blur><div class="row"><button class="btn primary sm" data-act="add-list-ok">${t('list.add')}</button><button class="icon-btn" data-act="add-list-cancel" aria-label="${t('cancel')}">${icon('x')}</button></div></div>`
          : `<button class="add-list-btn" data-act="add-list">${icon('plus')} ${t('list.addAnother')}</button>`}</div>
      </div></div>`;

    const nsc = U.$('.board-scroll', el);
    nsc.scrollLeft = sl;
    U.$$('.list', el).forEach(l => { const c = U.$('.list-cards', l); if (c && st[l.dataset.list]) c.scrollTop = st[l.dataset.list]; });
    if (this.composer) {
      const ta = U.$(`.list[data-list="${this.composer.listId}"] .composer textarea`, el);
      if (ta) { ta.value = this.composer.text || ''; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
    if (this.editingList) U.$('.list-name-input', el)?.select();
    if (this.addingList) U.$('[data-role=new-list]', el)?.focus();
  },

  listHTML(l, all, cards, ctx) {
    const editing = this.editingList === l.id;
    const comp = this.composer && this.composer.listId === l.id;
    const lc = U.safeColor(l.color);
    return `<section class="list" data-list="${l.id}" ${lc ? `style="--lc:${lc}"` : ''} aria-label="${U.esc(l.name)}">
      <header class="list-head">
        ${editing ? `<input class="input list-name-input" value="${U.esc(l.name)}" aria-label="${t('list.name')}" data-esc-blur>`
          : `<h3 class="list-name" data-act="rename-list" title="${t('list.rename')}">${U.esc(l.name)}</h3>`}
        <span class="list-count mono">${ctx.filtering ? `${cards.length}/${all.length}` : all.length}</span>
        <button class="icon-btn" data-act="list-menu" aria-label="${t('list.menu')}">${icon('dots')}</button>
      </header>
      <div class="list-cards">${cards.map(c => this.cardHTML(c, ctx)).join('')}</div>
      <footer class="list-foot">${comp
        ? `<div class="composer"><textarea class="input" rows="2" placeholder="${t('card.titlePh')}" data-esc-blur></textarea>
            <div class="row"><button class="btn primary sm" data-act="composer-ok">${t('card.add')}</button><button class="icon-btn" data-act="composer-cancel" aria-label="${t('cancel')}">${icon('x')}</button></div></div>`
        : `<button class="add-card-btn" data-act="add-card">${icon('plus')} ${t('card.add')}</button>`}</footer>
    </section>`;
  },

  cardHTML(c, ctx) {
    const labels = Model.cardLabels(c), members = Model.cardMembers(c);
    const cl = c.checklist || [], clDone = cl.filter(i => i.done).length;
    const ds = Model.dueState(c);
    const col = U.safeColor(c.color);
    const badges = [];
    if (c.kind === 'bug') {
      const sev = c.bug?.severity;
      badges.push(`<span class="badge" style="color:${SEVERITY_COLOR[sev] || 'inherit'}" title="${t('type.bug')}${sev ? ' · ' + t('sev.' + sev) : ''}">${icon('bug')}</span>`);
    }
    if (c.priority) badges.push(`<span class="badge" style="color:${PRIORITY_COLOR[c.priority]}" title="${t('card.priority')}: ${t('prio.' + c.priority)}">${icon('flag')}</span>`);
    if (c.start || c.due) badges.push(`<span class="badge due ${ds}" title="${t('card.dates')}">${icon('clock')}${U.esc(U.fmtRange(c.start, c.due))}</span>`);
    if (c.desc) badges.push(`<span class="badge" title="${t('card.desc')}">${icon('text')}</span>`);
    if (cl.length) badges.push(`<span class="badge ${clDone === cl.length ? 'complete' : ''}" title="${t('card.checklist')}">${icon('checklist')}${clDone}/${cl.length}</span>`);
    if (ctx.comments[c.id]) badges.push(`<span class="badge" title="${t('card.comments')}">${icon('comment')}${ctx.comments[c.id]}</span>`);
    if ((c.dependsOn || []).length) badges.push(`<span class="badge" title="${t('card.deps')}">${icon('link')}${c.dependsOn.length}</span>`);
    if (ctx.ai[c.id]) badges.push(`<span class="badge ai" title="${t('ai.usedOnCard')}">${icon('sparkle')}</span>`);
    return `<article class="card ${c.done ? 'is-done' : ''}" data-card="${c.id}" tabindex="0" aria-label="${U.esc(c.title)}">
      ${col ? `<div class="card-cover" style="background:${col}"></div>` : ''}
      ${labels.length ? `<div class="card-labels">${labels.map(l => `<span class="lbl" style="--c:${U.safeColor(l.color, '#888')}">${U.esc(l.name)}</span>`).join('')}</div>` : ''}
      <div class="card-title"><button class="chk ${c.done ? 'on' : ''}" data-act="toggle-done" aria-label="${c.done ? t('card.reopen') : t('card.complete')}">${icon('check')}</button><span>${U.esc(c.title)}</span></div>
      <div class="card-foot"><span class="card-key mono">${U.esc(Model.cardKey(c))}</span><div class="badges">${badges.join('')}</div>
        ${members.length ? `<div class="avs">${members.map(m => UI.avatar(m, 'sm')).join('')}</div>` : ''}</div>
    </article>`;
  },

  // ---------- clicks & keys
  onClick(e) {
    if (this.suppressClick) return;
    const a = e.target.closest('[data-act]');
    const listEl = e.target.closest('.list');
    const listId = listEl?.dataset.list;
    if (a) {
      const act = a.dataset.act;
      if (act === 'toggle-done') { const c = Store.get(a.closest('.card').dataset.card); Model.setDone(c, !c.done); return; }
      if (act === 'add-card') { this.composer = { listId, text: '' }; this.render(); return; }
      if (act === 'composer-ok') { this.submitComposer(); return; }
      if (act === 'composer-cancel') { this.composer = null; this.render(); return; }
      if (act === 'rename-list') { this.editingList = listId; this.render(); return; }
      if (act === 'list-menu') { this.listMenu(a, Store.get(listId)); return; }
      if (act === 'add-list') { this.addingList = true; this.render(); return; }
      if (act === 'add-list-ok') { this.submitList(); return; }
      if (act === 'add-list-cancel') { this.addingList = false; this.render(); return; }
      if (act === 'clear-filter') { Filter.clear(); return; }
    }
    const card = e.target.closest('.card');
    if (card) CardModal.open(card.dataset.card);
  },
  onKey(e) {
    const tgt = e.target;
    if (tgt.matches('.composer textarea')) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.submitComposer(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.composer = null; this.render(); }
    } else if (tgt.matches('.list-name-input')) {
      if (e.key === 'Enter') { e.preventDefault(); tgt.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.editingList = null; this.render(); }
    } else if (tgt.matches('[data-role=new-list]')) {
      if (e.key === 'Enter') { e.preventDefault(); this.submitList(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.addingList = false; this.render(); }
    } else if (tgt.matches('.card') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); CardModal.open(tgt.dataset.card);
    }
  },
  onFocusOut(e) {
    if (e.target.matches('.list-name-input') && this.editingList) {
      const v = e.target.value.trim(), id = this.editingList;
      this.editingList = null;
      if (v && v !== Store.get(id)?.name) Store.update(id, { name: v }); else this.render();
    }
  },
  submitComposer() {
    const ta = U.$('.composer textarea', this.el);
    const lines = (ta?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) { ta && ta.focus(); return; }
    lines.forEach(title => Model.createCard(this.composer.listId, title));
    this.composer.text = '';
    requestAnimationFrame(() => { const c = U.$(`.list[data-list="${this.composer?.listId}"] .list-cards`, this.el); if (c) c.scrollTop = c.scrollHeight; });
  },
  submitList() {
    const inp = U.$('[data-role=new-list]', this.el);
    const v = inp?.value.trim();
    if (!v) { inp && inp.focus(); return; }
    const b = Model.board();
    Store.create('list', { boardId: b.id, name: v, pos: Model.nextPos(Model.lists(b.id)) });
    requestAnimationFrame(() => { const s = U.$('.board-scroll', this.el); if (s) s.scrollLeft = s.scrollWidth; });
  },

  listMenu(anchor, l) {
    const el = U.html(`<div class="menu">
      <div class="menu-title">${U.esc(l.name)}</div>
      <button class="menu-item" data-m="add">${icon('plus')} ${t('card.add')}</button>
      <button class="menu-item" data-m="sort-due">${icon('clock')} ${t('list.sortDue')}</button>
      <button class="menu-item" data-m="sort-prio">${icon('flag')} ${t('list.sortPrio')}</button>
      <button class="menu-item" data-m="sort-title">${icon('text')} ${t('list.sortTitle')}</button>
      <button class="menu-item" data-m="done-bottom">${icon('check')} ${t('list.doneBottom')}</button>
      <div class="menu-sep">${t('list.color')}</div>
      ${UI.swatches(l.color, { none: true })}
      <div class="menu-sep"></div>
      <button class="menu-item danger" data-m="delete">${icon('trash')} ${t('list.delete')}</button></div>`);
    el.addEventListener('click', async e => {
      const sw = e.target.closest('[data-color]');
      if (sw) { Store.update(l.id, { color: sw.dataset.color }); UI.closePopover(); return; }
      const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
      UI.closePopover();
      const cards = Model.cards(l.id);
      const reorder = arr => arr.forEach((c, i) => { if (c.pos !== (i + 1) * 1024) Store.update(c.id, { pos: (i + 1) * 1024 }); });
      const pr = { critical: 0, high: 1, medium: 2, low: 3, '': 4 };
      if (m === 'add') { this.composer = { listId: l.id, text: '' }; this.render(); }
      else if (m === 'sort-due') reorder([...cards].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')));
      else if (m === 'sort-prio') reorder([...cards].sort((a, b) => pr[a.priority || ''] - pr[b.priority || '']));
      else if (m === 'sort-title') reorder([...cards].sort((a, b) => a.title.localeCompare(b.title, I18n.locale())));
      else if (m === 'done-bottom') reorder([...cards].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)));
      else if (m === 'delete') {
        if (cards.length && !(await UI.confirm(t('list.deleteConfirm', { n: cards.length }), { ok: t('delete'), danger: true }))) return;
        const snap = Store.remove(l.id);
        UI.toast(t('list.deleted'), { action: t('undo'), onAction: () => Store.restore(snap) });
      }
    });
    UI.pop(anchor, el);
  },

  // ---------- drag & drop
  onPointerDown(e) {
    if (e.button !== 0 || this.drag || this.pend) return;
    if (e.target.closest('button, input, textarea, select, a, .composer')) return;
    const card = e.target.closest('.card');
    const head = !card && e.target.closest('.list-head');
    if (!card && !head) return;
    const src = card || head.closest('.list');
    this.pend = { kind: card ? 'card' : 'list', src, id: card ? card.dataset.card : src.dataset.list, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    if (this.pend.touch) this.pend.timer = setTimeout(() => { if (this.pend && !this.drag) this.begin(this.pend.x, this.pend.y); }, 300);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  },
  onMove(e) {
    const p = this.pend;
    if (p && !this.drag) {
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (p.touch) { if (dist > 10) this.endListeners(); return; }
      if (dist < 5) return;
      this.begin(e.clientX, e.clientY);
    }
    if (!this.drag) return;
    this.drag.x = e.clientX; this.drag.y = e.clientY;
    this.placeGhost();
    this.updatePlaceholder();
  },
  begin(x, y) {
    const p = this.pend;
    const r = p.src.getBoundingClientRect();
    const ghost = p.src.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = r.width + 'px';
    if (p.kind === 'list') ghost.style.height = r.height + 'px';
    document.body.appendChild(ghost);
    const ph = document.createElement('div');
    ph.className = p.kind === 'card' ? 'card-ph' : 'list-ph';
    ph.style.height = r.height + 'px';
    p.src.parentNode.insertBefore(ph, p.src);
    p.src.style.display = 'none';
    const sel = p.kind === 'card' ? '.card' : '.list';
    const near = dir => { let n = p.src[dir]; while (n && !n.matches(sel)) n = n[dir]; return n; };
    p.orig = `${near('previousElementSibling')?.dataset.card || near('previousElementSibling')?.dataset.list}|${near('nextElementSibling')?.dataset.card || near('nextElementSibling')?.dataset.list}`;
    this.drag = { ...p, ghost, ph, offX: p.x - r.left, offY: p.y - r.top, x, y };
    document.body.classList.add('is-dragging');
    if (navigator.vibrate && p.touch) navigator.vibrate(15);
    this.placeGhost();
    const loop = () => { if (!this.drag) return; this.autoScroll(); this.drag.raf = requestAnimationFrame(loop); };
    this.drag.raf = requestAnimationFrame(loop);
  },
  placeGhost() {
    const d = this.drag;
    d.ghost.style.transform = `translate(${d.x - d.offX}px, ${d.y - d.offY}px) rotate(${d.kind === 'card' ? 3 : 2}deg)`;
  },
  autoScroll() {
    const d = this.drag, sc = U.$('.board-scroll', this.el);
    const r = sc.getBoundingClientRect();
    let moved = false;
    const edge = 70;
    if (d.x < r.left + edge) { sc.scrollLeft -= Math.ceil((r.left + edge - d.x) / 5); moved = true; }
    else if (d.x > r.right - edge) { sc.scrollLeft += Math.ceil((d.x - (r.right - edge)) / 5); moved = true; }
    if (d.kind === 'card') {
      const cont = d.ph.parentNode;
      if (cont && cont.classList.contains('list-cards')) {
        const cr = cont.getBoundingClientRect();
        if (d.y < cr.top + 40) { cont.scrollTop -= 8; moved = true; }
        else if (d.y > cr.bottom - 40) { cont.scrollTop += 8; moved = true; }
      }
    }
    if (moved) this.updatePlaceholder();
  },
  updatePlaceholder() {
    const d = this.drag, { x, y } = d;
    if (d.kind === 'card') {
      const lists = U.$$('.lists > .list', this.el);
      let target = lists.find(l => { const r = l.getBoundingClientRect(); return x >= r.left && x <= r.right; });
      if (!target) target = lists.reduce((best, l) => { const r = l.getBoundingClientRect(); const dist = Math.min(Math.abs(x - r.left), Math.abs(x - r.right)); return !best || dist < best.d ? { l, d: dist } : best; }, null)?.l;
      if (!target) return;
      const cont = U.$('.list-cards', target);
      const before = U.$$('.card', cont).find(c => c !== d.src && (() => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; })());
      if (before) { if (d.ph.nextElementSibling !== before) cont.insertBefore(d.ph, before); }
      else if (cont.lastElementChild !== d.ph) cont.appendChild(d.ph);
    } else {
      const wrap = U.$('.lists', this.el);
      const before = U.$$('.lists > .list', this.el).find(l => l !== d.src && (() => { const r = l.getBoundingClientRect(); return x < r.left + r.width / 2; })());
      const ref = before || U.$('.list-add', wrap);
      if (d.ph.nextElementSibling !== ref) wrap.insertBefore(d.ph, ref);
    }
  },
  onUp() {
    const d = this.drag;
    this.endListeners();
    if (!d) return;
    cancelAnimationFrame(d.raf);
    this.drag = null;
    document.body.classList.remove('is-dragging');
    const sib = (dir, sel) => { let n = d.ph[dir]; while (n && (n === d.src || !n.matches(sel))) n = n[dir]; return n; };
    let patch = null, entity = Store.get(d.id), moved = null;
    const sel = d.kind === 'card' ? '.card' : '.list';
    const p0 = sib('previousElementSibling', sel), n0 = sib('nextElementSibling', sel);
    const same = `${p0?.dataset.card || p0?.dataset.list}|${n0?.dataset.card || n0?.dataset.list}` === d.orig && d.ph.closest('.list, .lists') === d.src.closest(d.kind === 'card' ? '.list' : '.lists');
    if (same) entity = null;
    else if (d.kind === 'card') {
      const listEl = d.ph.closest('.list');
      const prev = p0, next = n0;
      const pos = Model.posBetween(prev && Store.get(prev.dataset.card)?.pos, next && Store.get(next.dataset.card)?.pos);
      if (listEl && entity) {
        const listId = listEl.dataset.list;
        if (listId !== entity.listId) { patch = { listId, pos }; moved = Store.get(listId)?.name; }
        else patch = { pos };
      }
    } else {
      const prev = sib('previousElementSibling', '.list'), next = sib('nextElementSibling', '.list');
      patch = { pos: Model.posBetween(prev && Store.get(prev.dataset.list)?.pos, next && Store.get(next.dataset.list)?.pos) };
    }
    d.ghost.remove(); d.ph.remove(); d.src.style.display = '';
    this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 0);
    if (patch && entity && (patch.listId || patch.pos !== entity.pos)) {
      Store.update(d.id, patch);
      if (moved) Model.log(entity, 'act.moved', { list: moved });
    } else this.render();
  },
  endListeners() {
    if (this.pend?.timer) clearTimeout(this.pend.timer);
    this.pend = null;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  },
};
document.addEventListener('touchmove', e => { if (BoardView.drag) e.preventDefault(); }, { passive: false });
