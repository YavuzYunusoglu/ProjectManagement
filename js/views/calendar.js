'use strict';
/* Month calendar: multi-day bars per week row, drag to reschedule, click a day to add a card, .ics export. */
const CalendarView = {
  el: null, month: null, drag: null,
  busy() { return !!this.drag; },
  mount(el) {
    this.el = el;
    el.className = 'view view-calendar';
    this.month = this.month || U.startOfMonth(U.today());
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('pointerdown', e => this.onDown(e));
    this.onMove = this.onMove.bind(this); this.onUp = this.onUp.bind(this);
    this.render();
  },
  events(b, from, to) {
    const ev = [];
    Model.boardCards(b.id).filter(c => Filter.match(c)).forEach(c => {
      const s = Model.span(c); if (!s || s.end < from || s.start > to) return;
      ev.push({ id: c.id, kind: 'card', start: s.start, end: s.end, title: c.title, color: GanttView.barColor(c), done: c.done, late: Model.isOverdue(c), c });
    });
    Model.milestones(b.id).forEach(m => { if (m.date >= from && m.date <= to) ev.push({ id: m.id, kind: 'ms', start: m.date, end: m.date, title: m.name, color: U.safeColor(m.color, '#F2A93B'), done: m.done }); });
    return ev;
  },
  render() {
    const b = Model.board(); if (!b) return;
    const first = this.month, gridStart = U.startOfWeek(first);
    const gridEnd = U.addDays(gridStart, 41), today = U.today();
    const ev = this.events(b, gridStart, gridEnd);
    const wd = [...Array(7)].map((_, i) => U.fmtDate(U.addDays(gridStart, i), { weekday: 'short' }));
    const MAXL = 3;
    let weeks = '';
    for (let w = 0; w < 6; w++) {
      const ws = U.addDays(gridStart, w * 7), we = U.addDays(ws, 6);
      const segs = ev.filter(e => e.end >= ws && e.start <= we)
        .map(e => ({ e, s: e.start < ws ? ws : e.start, en: e.end > we ? we : e.end }))
        .sort((a, z) => (z.e.kind === 'ms') - (a.e.kind === 'ms') || a.s.localeCompare(z.s) || U.diffDays(z.s, z.en) - U.diffDays(a.s, a.en));
      const lanes = [], more = Array(7).fill(0), placed = [];
      for (const sg of segs) {
        const c0 = U.diffDays(ws, sg.s), c1 = U.diffDays(ws, sg.en);
        let lane = 0;
        while (lanes[lane] && lanes[lane].some(([a, z]) => !(c1 < a || c0 > z))) lane++;
        if (lane >= MAXL) { for (let c = c0; c <= c1; c++) more[c]++; continue; }
        (lanes[lane] ||= []).push([c0, c1]);
        placed.push({ ...sg, c0, c1, lane });
      }
      weeks += `<div class="cal-week">
        ${[...Array(7)].map((_, i) => {
          const d = U.addDays(ws, i);
          return `<div class="cal-day ${d.slice(0, 7) !== first.slice(0, 7) ? 'out' : ''} ${d === today ? 'today' : ''} ${U.isWeekend(d) ? 'we' : ''}" data-date="${d}">
            <span class="cal-num mono">${+d.slice(8)}</span>
            ${more[i] ? `<button class="cal-more" data-a="more" data-date="${d}">+${more[i]}</button>` : ''}
            <button class="cal-add" data-a="add" data-date="${d}" aria-label="${t('cal.addOn', { date: U.fmtDate(d) })}">${icon('plus')}</button></div>`;
        }).join('')}
        ${placed.map(p => `<div class="cal-ev ${p.e.kind} ${p.e.done ? 'done' : ''} ${p.e.late ? 'late' : ''} ${p.s > p.e.start ? 'cont-l' : ''} ${p.en < p.e.end ? 'cont-r' : ''}"
          data-${p.e.kind === 'ms' ? 'ms' : 'card'}="${p.e.id}" style="--c:${p.e.color};left:calc(${p.c0} * 100% / 7 + 3px);width:calc(${p.c1 - p.c0 + 1} * 100% / 7 - 6px);top:${28 + p.lane * 22}px" title="${U.esc(p.e.title)}">
          ${p.e.kind === 'ms' ? icon('diamond') : p.e.done ? icon('check') : ''}<span>${U.esc(p.e.title)}</span></div>`).join('')}
      </div>`;
    }
    const upcoming = this.agenda(b);
    this.el.innerHTML = `<div class="cal-layout">
      <div class="panel cal-panel">
        <div class="toolbar">
          <button class="icon-btn" data-a="prev" aria-label="${t('cal.prev')}">${icon('left')}</button>
          <h2 class="cal-title">${U.esc(U.fmtDate(first, { month: 'long', year: 'numeric' }))}</h2>
          <button class="icon-btn" data-a="next" aria-label="${t('cal.next')}">${icon('right')}</button>
          <button class="btn sm ghost" data-a="today">${t('today')}</button>
          <span class="grow"></span>
          <button class="btn sm" data-a="ms-add">${icon('diamond')} ${t('ms.add')}</button>
          <button class="btn sm" data-a="ics">${icon('download')} ${t('cal.ics')}</button>
        </div>
        <div class="cal-head">${wd.map(d => `<span>${U.esc(d)}</span>`).join('')}</div>
        <div class="cal-grid">${weeks}</div>
      </div>
      <aside class="panel cal-side">${upcoming}</aside>
    </div>`;
  },
  agenda(b) {
    const today = U.today(), soon = U.addDays(today, 14);
    const cards = Model.boardCards(b.id).filter(c => Filter.match(c) && !c.done);
    const late = cards.filter(c => c.due && c.due < today).sort((a, z) => a.due.localeCompare(z.due));
    const next = cards.filter(c => c.due && c.due >= today && c.due <= soon).sort((a, z) => a.due.localeCompare(z.due));
    const ms = Model.milestones(b.id).filter(m => m.date >= today).slice(0, 4);
    const row = c => `<button class="ag-row" data-card="${c.id}"><span class="dot" style="--c:${GanttView.barColor(c)}"></span><span class="grow">${U.esc(c.title)}</span><span class="mono muted">${U.esc(U.fmtDate(c.due))}</span></button>`;
    return `
      <h3 class="side-title">${icon('warn')} ${t('cal.overdue')} <span class="mono">${late.length}</span></h3>
      ${late.map(row).join('') || `<p class="hint">${t('cal.noneOverdue')}</p>`}
      <h3 class="side-title">${icon('clock')} ${t('cal.next14')} <span class="mono">${next.length}</span></h3>
      ${next.map(row).join('') || `<p class="hint">${t('cal.noneSoon')}</p>`}
      <h3 class="side-title">${icon('diamond')} ${t('gantt.milestones')}</h3>
      ${ms.map(m => `<button class="ag-row" data-ms="${m.id}"><span class="dot diamond" style="--c:${U.safeColor(m.color, '#F2A93B')}"></span><span class="grow">${U.esc(m.name)}</span><span class="mono muted">${U.esc(U.fmtDate(m.date))} · ${U.diffDays(today, m.date)}${t('gantt.dayShort')}</span></button>`).join('') || `<p class="hint">${t('cal.noMs')}</p>`}`;
  },
  async onClick(e) {
    if (this.justDragged) return;
    const a = e.target.closest('[data-a]');
    if (a) {
      const act = a.dataset.a;
      if (act === 'prev') { this.month = U.addMonths(this.month, -1); this.render(); }
      else if (act === 'next') { this.month = U.addMonths(this.month, 1); this.render(); }
      else if (act === 'today') { this.month = U.startOfMonth(U.today()); this.render(); }
      else if (act === 'ms-add') MilestoneDialog.open(null);
      else if (act === 'ics') this.exportICS();
      else if (act === 'add') this.quickAdd(a.dataset.date);
      else if (act === 'more') this.dayPop(a, a.dataset.date);
      return;
    }
    const card = e.target.closest('[data-card]'); if (card) { CardModal.open(card.dataset.card); return; }
    const ms = e.target.closest('[data-ms]'); if (ms) MilestoneDialog.open(ms.dataset.ms);
  },
  async quickAdd(date) {
    const b = Model.board(), lists = Model.lists(b.id);
    if (!lists.length) { UI.toast(t('cal.needList')); return; }
    const title = await UI.prompt(t('cal.addOn', { date: U.fmtDate(date, { day: 'numeric', month: 'long' }) }), '', { placeholder: t('card.titlePh'), ok: t('card.add') });
    if (title) Model.createCard(lists[0].id, title, { due: date });
  },
  dayPop(anchor, date) {
    const b = Model.board();
    const ev = this.events(b, date, date);
    const el = U.html(`<div class="menu"><div class="menu-title">${U.esc(U.fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>${ev.map(x =>
      `<button class="menu-item" data-${x.kind === 'ms' ? 'ms' : 'card'}="${x.id}"><span class="dot" style="--c:${x.color}"></span> ${U.esc(x.title)}</button>`).join('')}</div>`);
    el.addEventListener('click', e => {
      const c = e.target.closest('[data-card]'), m = e.target.closest('[data-ms]');
      UI.closePopover();
      if (c) CardModal.open(c.dataset.card); else if (m) MilestoneDialog.open(m.dataset.ms);
    });
    UI.pop(anchor, el);
  },
  dayAt(x, y) { return document.elementFromPoint(x, y)?.closest('.cal-day')?.dataset.date || null; },
  onDown(e) {
    if (e.button !== 0) return;
    const ev = e.target.closest('.cal-ev'); if (!ev) return;
    const id = ev.dataset.card || ev.dataset.ms;
    ev.style.pointerEvents = 'none';
    const from = this.dayAt(e.clientX, e.clientY);
    ev.style.pointerEvents = '';
    if (!from) return;
    this.drag = { id, kind: ev.dataset.card ? 'card' : 'ms', from, to: from, x0: e.clientX, y0: e.clientY, moved: false, el: ev };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  },
  onMove(e) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
    if (!d.moved) { d.moved = true; d.el.classList.add('dragging'); document.body.classList.add('is-dragging'); }
    d.el.style.transform = `translate(${e.clientX - d.x0}px, ${e.clientY - d.y0}px)`;
    d.el.style.pointerEvents = 'none';
    const to = this.dayAt(e.clientX, e.clientY);
    U.$$('.cal-day.drop', this.el).forEach(x => x.classList.remove('drop'));
    if (to) { d.to = to; U.$(`.cal-day[data-date="${to}"]`, this.el)?.classList.add('drop'); }
  },
  onUp() {
    const d = this.drag; this.drag = null;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    document.body.classList.remove('is-dragging');
    if (!d || !d.moved) return;
    this.justDragged = true; setTimeout(() => { this.justDragged = false; }, 50);
    const n = U.diffDays(d.from, d.to);
    if (!n) { this.render(); return; }
    const ent = Store.get(d.id);
    if (d.kind === 'ms') Store.update(d.id, { date: U.addDays(ent.date, n) });
    else {
      const patch = {};
      if (ent.start) patch.start = U.addDays(ent.start, n);
      if (ent.due) patch.due = U.addDays(ent.due, n);
      Store.update(d.id, patch);
      Model.log(ent, 'act.dates', { range: U.fmtRange(patch.start ?? ent.start, patch.due ?? ent.due) });
    }
  },
  exportICS() {
    const b = Model.board();
    const esc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const d = s => s.replace(/-/g, '');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GameDev PM//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(b.name)}`];
    Model.boardCards(b.id).forEach(c => {
      const s = Model.span(c); if (!s) return;
      lines.push('BEGIN:VEVENT', `UID:${c.id}@gamedev-pm`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(s.start)}`, `DTEND;VALUE=DATE:${d(U.addDays(s.end, 1))}`,
        `SUMMARY:${esc(`[${Model.cardKey(c)}] ${c.title}${c.done ? ' ✓' : ''}`)}`, `DESCRIPTION:${esc(c.desc)}`, 'END:VEVENT');
    });
    Model.milestones(b.id).forEach(m => lines.push('BEGIN:VEVENT', `UID:${m.id}@gamedev-pm`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(m.date)}`, `DTEND;VALUE=DATE:${d(U.addDays(m.date, 1))}`, `SUMMARY:${esc('◆ ' + m.name)}`, 'END:VEVENT'));
    lines.push('END:VCALENDAR');
    U.download(`${b.name}.ics`, lines.join('\r\n'), 'text/calendar');
  },
};
