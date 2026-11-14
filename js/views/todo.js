'use strict';
/*
 * To-do planner: one card per person with a daily, weekly or monthly list.
 * Each list shows the board cards assigned to that person whose dates fall in the period, plus
 * extra to-dos ("todo" entities, optionally linked to a card). Sorted by time, priority or a manual
 * order the person drags into place ("todopos" entities hold the manual position of board cards).
 */
const TODO_SCOPES = ['day', 'week', 'month'];
const PRIO_RANK = { critical: 0, high: 1, medium: 2, low: 3, '': 4 };

const TodoView = {
  el: null, date: null, drag: null,
  busy() { const a = document.activeElement; return !!this.drag || !!(a && this.el?.contains(a) && a.matches('input')); },
  mount(el) {
    this.el = el;
    el.className = 'view view-todo';
    this.date = this.date || U.today();
    this.onMove = this.onMove.bind(this); this.onUp = this.onUp.bind(this);
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('keydown', e => this.onKey(e));
    el.addEventListener('pointerdown', e => this.onDown(e));
    this.render();
  },
  opts() { return Prefs.get('todo'); },

  /* ---------- periods */
  period(scope = this.opts().scope, d = this.date) {
    if (scope === 'week') { const s = U.startOfWeek(d); return { s, e: U.addDays(s, 6) }; }
    if (scope === 'month') { const s = U.startOfMonth(d); return { s, e: U.addDays(U.addMonths(s, 1), -1) }; }
    return { s: d, e: d };
  },
  label(p, scope) {
    if (scope === 'day') return U.fmtDate(p.s, { weekday: 'long', day: 'numeric', month: 'long' });
    if (scope === 'week') return `${t('todo.weekN', { n: U.isoWeek(p.s) })} · ${U.fmtRange(p.s, p.e)}`;
    return U.fmtDate(p.s, { month: 'long', year: 'numeric' });
  },
  shift(n) {
    const sc = this.opts().scope;
    this.date = sc === 'day' ? U.addDays(this.date, n) : sc === 'week' ? U.addDays(this.date, 7 * n) : U.addMonths(this.date, n);
    this.render();
  },

  /* ---------- data */
  posId: (mid, cid) => `tpos_${mid}_${cid}`,
  textOk(s) {
    const q = Filter.text.trim().toLocaleLowerCase(I18n.locale());
    if (!q || /[#@]/.test(q)) return true;
    const low = String(s || '').toLocaleLowerCase(I18n.locale());
    return q.split(/\s+/).every(tok => low.includes(tok));
  },
  fromCard(c, mid) {
    const pe = mid !== '_none' && Store.get(this.posId(mid, c.id));
    return { key: 'c:' + c.id, kind: 'card', id: c.id, title: c.title, done: !!c.done, due: c.due || c.start || null, prio: c.priority || '', pos: pe ? pe.pos : null, card: c };
  },
  fromTodo(x) {
    const c = x.cardId ? Store.get(x.cardId) : null;
    return { key: 't:' + x.id, kind: 'todo', id: x.id, title: x.title, done: !!x.done, due: x.due || null, prio: x.priority || '', pos: x.pos ?? null, card: c && c.type === 'card' ? c : null, todo: x };
  },
  /* Items for one person in period p: { main, late } */
  items(mid, b, p, o) {
    const today = U.today(), current = p.s <= today && today <= p.e;
    const mine = c => (mid === '_none' ? !(c.memberIds || []).length : (c.memberIds || []).includes(mid));
    const cards = Model.boardCards(b.id).filter(c => mine(c) && Filter.match(c));
    const main = [], late = [];
    for (const c of cards) {
      const s = Model.span(c); if (!s) continue;
      if (s.end >= p.s && s.start <= p.e) main.push(this.fromCard(c, mid));
      else if (current && !c.done && c.due && c.due < p.s) late.push(this.fromCard(c, mid));
    }
    if (mid !== '_none') {
      // Label / type / "no date" filters only make sense for board cards, so they hide extra to-dos.
      const cardOnly = Filter.labels.size || Filter.types.size || Filter.status === 'nodate';
      Store.all('todo', x => x.boardId === b.id && x.memberId === mid && x.scope === o.scope).forEach(x => {
        if (cardOnly || !this.textOk(x.title)) return;
        if (Filter.priorities.size && !Filter.priorities.has(x.priority || '')) return;
        if (Filter.status === 'overdue' && (x.done || (x.due || this.period(x.scope, x.date).e) >= U.today())) return;
        if (Filter.status === 'done' && !x.done) return;
        if (Filter.status === 'open' && x.done) return;
        if (x.date === p.s) main.push(this.fromTodo(x));
        else if (current && !x.done && x.date < p.s) late.push(this.fromTodo(x));
      });
    }
    return { main: this.sort(main, o), late: this.sort(late, { ...o, sort: o.sort === 'manual' ? 'time' : o.sort }) };
  },
  sort(arr, o) {
    const time = (a, z) => (a.due || '9999').localeCompare(z.due || '9999');
    const prio = (a, z) => PRIO_RANK[a.prio] - PRIO_RANK[z.prio];
    const title = (a, z) => a.title.localeCompare(z.title, I18n.locale());
    const man = (a, z) => (a.pos ?? Infinity) - (z.pos ?? Infinity) || 0;
    const by = o.sort === 'prio' ? [prio, time, title] : o.sort === 'manual' ? [man, time, prio, title] : [time, prio, title];
    return arr.sort((a, z) => (a.done - z.done) || by.reduce((r, f) => r || f(a, z), 0));
  },
  people(o) {
    const me = Prefs.get('me');
    let ms = Model.members();
    if (o.onlyMe && me) ms = ms.filter(m => m.id === me);
    if (Filter.members.size) ms = ms.filter(m => Filter.members.has(m.id));
    ms.sort((a, z) => (z.id === me) - (a.id === me));
    const out = ms.map(m => ({ id: m.id, m, name: m.name }));
    if (!o.onlyMe && (!Filter.members.size || Filter.members.has('none'))) out.push({ id: '_none', m: null, name: t('gantt.unassigned') });
    return out;
  },

  /* ---------- render */
  render() {
    const b = Model.board(); if (!b) { this.el.innerHTML = ''; return; }
    const o = this.opts(), p = this.period(), today = U.today();
    const seg = (k, v, label) => `<button class="seg-btn ${o[k] === v ? 'on' : ''}" data-opt="${k}" data-v="${v}">${label}</button>`;
    const people = this.people(o).map(x => ({ ...x, ...this.items(x.id, b, p, o) }))
      .filter(x => x.id !== '_none' || x.main.length || x.late.length);
    this.el.innerHTML = `<div class="panel todo-panel">
      <div class="toolbar">
        <h2 class="panel-title">${icon('checklist')} ${t('view.todo')}</h2>
        <div class="seg">${TODO_SCOPES.map(s => seg('scope', s, t('gantt.' + s))).join('')}</div>
        <div class="todo-nav">
          <button class="icon-btn" data-a="prev" aria-label="${t('todo.prev')}">${icon('left')}</button>
          <strong class="todo-period">${U.esc(this.label(p, o.scope))}</strong>
          <button class="icon-btn" data-a="next" aria-label="${t('todo.next')}">${icon('right')}</button>
          ${p.s <= today && today <= p.e ? '' : `<button class="btn sm ghost" data-a="today">${t('today')}</button>`}
        </div>
        <span class="grow"></span>
        <span class="muted todo-sort-label">${t('todo.sort')}</span>
        <div class="seg">${seg('sort', 'time', t('todo.sort.time'))}${seg('sort', 'prio', t('todo.sort.prio'))}${seg('sort', 'manual', t('todo.sort.manual'))}</div>
        <button class="chip ${o.onlyMe ? 'on' : ''}" data-a="onlyMe" ${Model.me() ? '' : 'disabled title="' + U.esc(t('card.whoAmI')) + '"'}>${icon('user')} ${t('todo.onlyMe')}</button>
        <button class="chip ${o.showDone ? 'on' : ''}" data-a="showDone">${icon('check')} ${t('todo.showDone')}</button>
      </div>
      <p class="hint todo-hint">${icon('info')} ${t('todo.hint')}${o.sort === 'manual' ? ' ' + t('todo.manualHint') : ''}</p>
      ${people.length ? `<div class="todo-grid">${people.map(x => this.personHTML(x, o)).join('')}</div>`
        : `<div class="empty-state"><p>${t('todo.noMembers')}</p><button class="btn" data-a="members">${icon('users')} ${t('members.manage')}</button></div>`}
    </div>`;
  },
  personHTML(x, o) {
    const all = [...x.main, ...x.late];
    const done = x.main.filter(i => i.done).length, total = x.main.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const hours = U.sum(all.filter(i => !i.done && i.kind === 'card'), i => i.card.estimate);
    const main = o.showDone ? x.main : x.main.filter(i => !i.done);
    const col = x.m ? U.safeColor(x.m.color, '#5B9CF2') : '#8C97A8';
    return `<section class="todo-person ${x.id === Prefs.get('me') ? 'is-me' : ''}" data-mid="${x.id}" style="--pc:${col}">
      <header class="tp-head">
        ${x.m ? UI.avatar(x.m) : `<span class="av">${icon('user')}</span>`}
        <div class="tp-name"><strong>${U.esc(x.name)}</strong><span class="muted">${t('todo.progress', { a: done, b: total })}${hours ? ` · ${Math.round(hours * 10) / 10}${t('hoursShort')}` : ''}</span></div>
        <span class="tp-pct mono">${total ? pct + '%' : ''}</span>
      </header>
      <div class="track tp-track"><div class="progress-bar ${pct === 100 ? 'full' : ''}" style="width:${pct}%"></div></div>
      ${x.late.length ? `<h4 class="tp-sec late">${icon('warn')} ${t('todo.overdue')} <span class="mono">${x.late.length}</span></h4>
        <ul class="td-list" data-list="late">${x.late.map(i => this.itemHTML(i, false, true)).join('')}</ul>` : ''}
      <ul class="td-list" data-list="main">${main.map(i => this.itemHTML(i, o.sort === 'manual')).join('') || `<li class="td-empty hint">${t('todo.empty')}</li>`}</ul>
      ${x.id !== '_none' ? `<div class="td-add">${icon('plus')}<input class="input sm" data-add="${x.id}" placeholder="${t('todo.addPh')}" aria-label="${t('todo.addPh')}" data-esc-blur></div>` : ''}
    </section>`;
  },
  itemHTML(i, handle, late = false) {
    const c = i.card, today = U.today();
    const overdue = !i.done && i.due && i.due < today;
    const meta = [];
    if (c) meta.push(`<button class="td-key mono" data-a="open-card" data-id="${c.id}" title="${t('todo.openCard')}">${U.esc(Model.cardKey(c))}</button>`);
    if (i.kind === 'card') { const l = Store.get(c.listId); if (l) meta.push(`<span class="td-list-name">${U.esc(l.name)}</span>`); }
    else meta.push(`<span class="td-tag">${t('todo.extra')}</span>`);
    if (i.kind === 'card' && (c.start || c.due)) meta.push(`<span class="badge due ${Model.dueState(c)}">${icon('clock')}${U.esc(U.fmtRange(c.start, c.due))}</span>`);
    else if (i.due) meta.push(`<span class="badge due ${overdue ? 'overdue' : ''}">${icon('clock')}${U.esc(U.fmtDate(i.due))}</span>`);
    else if (late && i.todo) meta.push(`<span class="badge due overdue">${icon('clock')}${U.esc(U.fmtDate(i.todo.date))}</span>`);
    if (i.prio) meta.push(`<span class="badge" style="color:${PRIORITY_COLOR[i.prio]}" title="${t('card.priority')}: ${t('prio.' + i.prio)}">${icon('flag')}</span>`);
    if (i.kind === 'card' && (c.checklist || []).length) { const cl = c.checklist; meta.push(`<span class="badge">${icon('checklist')}${cl.filter(z => z.done).length}/${cl.length}</span>`); }
    return `<li class="td-item ${i.done ? 'done' : ''} ${overdue ? 'late' : ''}" data-key="${i.key}">
      ${handle ? `<span class="td-handle" data-handle title="${t('todo.dragHint')}" aria-hidden="true">${icon('dots')}</span>` : ''}
      <button class="chk ${i.done ? 'on' : ''}" data-a="toggle" aria-label="${i.done ? t('card.reopen') : t('card.complete')}">${icon('check')}</button>
      <div class="td-body"><button class="td-title" data-a="${i.kind === 'card' ? 'open-card' : 'edit'}" ${i.kind === 'card' ? `data-id="${c.id}"` : ''}>${U.esc(i.title)}</button>
        <div class="td-meta">${meta.join('')}</div></div>
      ${i.kind === 'todo' ? `<button class="icon-btn sm" data-a="edit" aria-label="${t('edit')}">${icon('edit')}</button>` : ''}
    </li>`;
  },

  /* ---------- actions */
  onClick(e) {
    if (this.justDragged) return;
    const opt = e.target.closest('[data-opt]');
    if (opt) { Prefs.patch('todo', { [opt.dataset.opt]: opt.dataset.v }); this.render(); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const li = a.closest('[data-key]'), key = li?.dataset.key;
    switch (a.dataset.a) {
      case 'prev': this.shift(-1); break;
      case 'next': this.shift(1); break;
      case 'today': this.date = U.today(); this.render(); break;
      case 'onlyMe': Prefs.patch('todo', { onlyMe: !this.opts().onlyMe }); this.render(); break;
      case 'showDone': Prefs.patch('todo', { showDone: !this.opts().showDone }); this.render(); break;
      case 'members': Settings.open('members'); break;
      case 'open-card': CardModal.open(a.dataset.id); break;
      case 'edit': this.editTodo(key.slice(2)); break;
      case 'toggle': {
        const id = key.slice(2), ent = Store.get(id); if (!ent) break;
        if (key[0] === 'c') Model.setDone(ent, !ent.done);
        else Store.update(id, { done: !ent.done, doneAt: ent.done ? null : Date.now() });
        break;
      }
    }
  },
  onKey(e) {
    const inp = e.target.closest('[data-add]');
    if (!inp || e.key !== 'Enter') return;
    e.preventDefault();
    const title = inp.value.trim(); if (!title) return;
    const mid = inp.dataset.add, o = this.opts(), p = this.period(), b = Model.board();
    const mineTodos = Store.all('todo', x => x.memberId === mid);
    const mineCards = Store.all('todopos', x => x.memberId === mid);
    Store.create('todo', {
      boardId: b.id, memberId: mid, title, scope: o.scope, date: p.s, due: o.scope === 'day' ? p.s : null,
      priority: '', cardId: null, done: false, doneAt: null, pos: Model.nextPos([...mineTodos, ...mineCards]),
    });
    // Show it right away and keep the cursor in the same box for the next one.
    this.render();
    U.$(`[data-add="${mid}"]`, this.el)?.focus();
  },
  editTodo(id) {
    const x = Store.get(id); if (!x) return;
    const b = Store.get(x.boardId) || Model.board();
    const opt = (v, label, cur) => `<option value="${U.esc(v)}" ${v === (cur || '') ? 'selected' : ''}>${U.esc(label)}</option>`;
    const cards = Model.boardCards(b.id).sort((a, z) => (a.num || 0) - (z.num || 0));
    const m = UI.modal({
      title: t('todo.edit'), cls: 'dialog todo-dialog',
      body: `<label class="field">${t('todo.title')}<input class="input" data-f="title" value="${U.esc(x.title)}"></label>
        <div class="form-grid two">
          <label class="field">${t('todo.list')}<select class="input" data-f="scope">${TODO_SCOPES.map(s => opt(s, t('todo.scope.' + s), x.scope)).join('')}</select></label>
          <label class="field">${t('todo.due')}<input type="date" class="input" data-f="due" value="${x.due || ''}"></label>
        </div>
        <div class="form-grid two">
          <label class="field">${t('card.priority')}<select class="input" data-f="priority">${opt('', t('none'), x.priority)}${PRIORITIES.map(p => opt(p, t('prio.' + p), x.priority)).join('')}</select></label>
          <label class="field">${t('card.members')}<select class="input" data-f="memberId">${Model.members().map(mm => opt(mm.id, mm.name, x.memberId)).join('')}</select></label>
        </div>
        <label class="field">${t('todo.link')}<select class="input" data-f="cardId">${opt('', t('todo.noLink'), x.cardId)}${cards.map(c => opt(c.id, `${Model.cardKey(c)} · ${c.title}`, x.cardId)).join('')}</select></label>
        <span class="hint">${t('todo.linkHint')}</span>`,
      actions: `<button class="btn ghost danger-text" data-del>${icon('trash')} ${t('delete')}</button><span class="grow"></span><button class="btn" data-close>${t('cancel')}</button><button class="btn primary" data-ok>${t('save')}</button>`,
    });
    const val = f => U.$(`[data-f="${f}"]`, m.el).value;
    const save = () => {
      const title = val('title').trim(); if (!title) { U.$('[data-f=title]', m.el).focus(); return; }
      const scope = val('scope'), due = val('due') || null;
      const patch = { title, scope, due, priority: val('priority'), cardId: val('cardId') || null, memberId: val('memberId') || x.memberId };
      // Changing the list or the date moves the to-do into the matching day/week/month.
      if (scope !== x.scope || (due && due !== x.due)) patch.date = this.period(scope, due || x.date).s;
      Store.update(id, patch);
      m.close();
    };
    U.$('[data-ok]', m.el).onclick = save;
    U.$('[data-f=title]', m.el).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    U.$('[data-del]', m.el).onclick = () => {
      m.close();
      const snap = Store.remove(id);
      UI.toast(t('todo.deleted'), { action: t('undo'), onAction: () => Store.restore(snap) });
    };
  },

  /* ---------- manual ordering (drag the handle; works with mouse, pen and touch) */
  onDown(e) {
    const h = e.target.closest('[data-handle]');
    if (!h || e.button !== 0) return;
    e.preventDefault();
    const li = h.closest('.td-item'), ul = li.parentNode;
    const r = li.getBoundingClientRect();
    const ph = document.createElement('li');
    ph.className = 'td-ph'; ph.style.height = r.height + 'px';
    ul.insertBefore(ph, li);
    li.classList.add('td-dragging');
    li.style.width = r.width + 'px'; li.style.top = r.top + 'px'; li.style.left = r.left + 'px';
    this.drag = { li, ul, ph, y0: e.clientY, top: r.top, mid: li.closest('[data-mid]').dataset.mid };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  },
  onMove(e) {
    const d = this.drag; if (!d) return;
    d.li.style.top = (d.top + e.clientY - d.y0) + 'px';
    const before = U.$$('.td-item', d.ul).find(x => x !== d.li && (() => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; })());
    if (before) { if (d.ph.nextElementSibling !== before) d.ul.insertBefore(d.ph, before); }
    else if (d.ul.lastElementChild !== d.ph) d.ul.appendChild(d.ph);
  },
  onUp() {
    const d = this.drag; this.drag = null;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    if (!d) return;
    d.ul.insertBefore(d.li, d.ph); d.ph.remove();
    d.li.classList.remove('td-dragging'); d.li.style.cssText = '';
    this.justDragged = true; setTimeout(() => { this.justDragged = false; }, 50);
    // Renumber the whole visible list so the new order is stored for every item in it.
    U.$$('.td-item', d.ul).forEach((li, i) => {
      const pos = (i + 1) * 1024, [kind, id] = [li.dataset.key[0], li.dataset.key.slice(2)];
      if (kind === 't') { const x = Store.get(id); if (x && x.pos !== pos) Store.update(id, { pos }); return; }
      if (d.mid === '_none') return;
      const pid = this.posId(d.mid, id), cur = Store.get(pid);
      if (!cur || cur.pos !== pos) Store.put({ ...(cur || { id: pid, type: 'todopos', memberId: d.mid, cardId: id, createdAt: Date.now() }), pos });
    });
    this.render();
  },
};
