'use strict';
/* Gantt chart generated from cards: drag to move/resize, link bars for dependencies, milestones, critical path, export. */
const G = { ROW: 32, HEAD: 52, LEFT: 340, BAR: 18 };
const MONO = "font-family=\"'JetBrains Mono',Consolas,monospace\"";
const trunc = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);

const GanttView = {
  el: null, drag: null,
  opts() { return Prefs.get('gantt'); },
  busy() { return !!this.drag; },

  mount(el) {
    this.el = el;
    el.className = 'view view-gantt';
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('change', e => this.onChange(e));
    el.addEventListener('pointerdown', e => this.onDown(e));
    this.onMove = this.onMove.bind(this); this.onUp = this.onUp.bind(this);
    this.render();
    this.scrollToToday();
  },

  /* ---------- data */
  build(over = {}) {
    const b = Model.board(), o = this.opts();
    const dw = { day: 34, week: 13, month: 4.2 }[o.zoom] || 34;
    const span = c => over[c.id] || Model.span(c);
    let cards = Model.boardCards(b.id).filter(c => Filter.match(c) && (o.showDone || !c.done));
    const undated = cards.filter(c => !Model.span(c));
    cards = cards.filter(c => Model.span(c)).sort((a, z) => span(a).start.localeCompare(span(z).start) || (a.pos - z.pos));
    let groups;
    if (o.group === 'member') {
      groups = [...Model.members().map(m => ({ id: m.id, name: m.name, color: m.color, cards: cards.filter(c => (c.memberIds || []).filter(id => Store.get(id))[0] === m.id) })),
        { id: '_none', name: t('gantt.unassigned'), color: '', cards: cards.filter(c => !Model.cardMembers(c).length) }];
    } else if (o.group === 'label') {
      groups = [...Model.labels(b.id).map(l => ({ id: l.id, name: l.name, color: l.color, cards: cards.filter(c => Model.cardLabels(c)[0]?.id === l.id) })),
        { id: '_none', name: t('gantt.noLabel'), color: '', cards: cards.filter(c => !Model.cardLabels(c).length) }];
    } else if (o.group === 'none') {
      groups = [{ id: '_all', name: '', cards, flat: true }];
    } else {
      groups = Model.lists(b.id).map(l => ({ id: l.id, name: l.name, color: l.color, cards: cards.filter(c => c.listId === l.id) }));
    }
    groups = groups.filter(g => g.cards.length);
    const ms = Model.milestones(b.id).filter(m => m.date);
    const rows = [{ kind: 'ms' }];
    for (const g of groups) {
      const sp = g.cards.map(span);
      g.start = sp.map(s => s.start).sort()[0]; g.end = sp.map(s => s.end).sort().pop();
      g.progress = U.sum(g.cards, c => Model.progress(c)) / g.cards.length;
      if (!g.flat) rows.push({ kind: 'group', g });
      if (g.flat || !o.collapsed[g.id]) g.cards.forEach(c => rows.push({ kind: 'card', c, s: span(c), g }));
    }
    const today = U.today();
    const all = [today, ...cards.flatMap(c => [span(c).start, span(c).end]), ...ms.map(m => m.date)].sort();
    let start = U.addDays(all[0], o.zoom === 'month' ? -10 : -4);
    let end = U.addDays(all[all.length - 1], o.zoom === 'month' ? 60 : o.zoom === 'week' ? 28 : 14);
    if (o.zoom === 'week') start = U.startOfWeek(start);
    if (o.zoom === 'month') start = U.startOfMonth(start);
    if (o.zoom === 'day' && U.diffDays(start, end) < 45) end = U.addDays(start, 45);
    const days = U.diffDays(start, end) + 1;
    const rowOf = {};
    rows.forEach((r, i) => { if (r.kind === 'card') rowOf[r.c.id] = i; });
    const crit = o.critical ? this.criticalPath(cards, span) : { ids: new Set(), edges: new Set() };
    return { b, o, dw, rows, groups, ms, start, end, days, W: Math.ceil(days * dw), H: rows.length * G.ROW, today, undated, rowOf, span, crit, x: d => U.diffDays(start, d) * dw };
  },
  /* Driving path: from the latest-finishing card, follow the predecessor that finishes last. */
  criticalPath(cards, span) {
    const ids = new Set(), edges = new Set();
    let cur = cards.reduce((a, c) => (!a || span(c).end > span(a).end ? c : a), null);
    while (cur && !ids.has(cur.id)) {
      ids.add(cur.id);
      const ps = Model.preds(cur).filter(p => Model.span(p));
      if (!ps.length) break;
      const p = ps.reduce((a, z) => (span(z).end > span(a).end ? z : a));
      edges.add(p.id + '>' + cur.id);
      cur = p;
    }
    return { ids, edges };
  },
  barColor(c) {
    return U.safeColor(c.color) || U.safeColor(Model.cardLabels(c)[0]?.color) || U.safeColor(Store.get(c.listId)?.color) || '#5B9CF2';
  },

  /* ---------- svg parts (strings) */
  headSVG(m) {
    const { o, dw, start, days, x, today } = m;
    const out = [`<rect width="${m.W}" height="${G.HEAD}" fill="var(--panel)"/>`];
    const top = [], bottom = [];
    if (o.zoom === 'month') {
      for (let d = start; d <= m.end; d = U.addMonths(d, 1)) {
        const nx = U.addMonths(d, 1), w = U.diffDays(d, nx) * dw;
        bottom.push(`<line x1="${x(d)}" y1="26" x2="${x(d)}" y2="${G.HEAD}" stroke="var(--line)"/><text x="${x(d) + 6}" y="43" font-size="11" fill="var(--text-2)">${U.esc(U.fmtDate(d, { month: 'short' }))}</text>`);
        if (d.slice(5, 7) === '01' || d === start) top.push(`<text x="${x(d) + 6}" y="17" font-size="12" font-weight="600" fill="var(--text)">${d.slice(0, 4)}</text><line x1="${x(d)}" y1="0" x2="${x(d)}" y2="26" stroke="var(--line)"/>`);
        void w;
      }
    } else {
      for (let d = start; d <= m.end; d = U.addMonths(U.startOfMonth(d), 1)) {
        top.push(`<line x1="${x(d)}" y1="0" x2="${x(d)}" y2="26" stroke="var(--line)"/><text x="${x(d) + 8}" y="17" font-size="12" font-weight="600" fill="var(--text)">${U.esc(U.fmtDate(d, { month: 'long', year: 'numeric' }))}</text>`);
      }
      if (o.zoom === 'day') {
        for (let i = 0; i < days; i++) {
          const d = U.addDays(start, i), xx = i * dw, we = U.isWeekend(d);
          if (we) bottom.push(`<rect x="${xx}" y="26" width="${dw}" height="${G.HEAD - 26}" fill="var(--weekend)"/>`);
          bottom.push(`<text x="${xx + dw / 2}" y="38" font-size="9.5" text-anchor="middle" fill="var(--text-3)">${U.esc(U.fmtDate(d, { weekday: 'narrow' }))}</text>
            <text x="${xx + dw / 2}" y="49" font-size="11" text-anchor="middle" ${MONO} fill="${d === today ? 'var(--accent)' : we ? 'var(--text-3)' : 'var(--text-2)'}" font-weight="${d === today ? 700 : 400}">${+d.slice(8)}</text>`);
        }
      } else {
        for (let d = U.startOfWeek(start); d <= m.end; d = U.addDays(d, 7)) {
          bottom.push(`<line x1="${x(d)}" y1="26" x2="${x(d)}" y2="${G.HEAD}" stroke="var(--line)"/><text x="${x(d) + 5}" y="43" font-size="10.5" ${MONO} fill="var(--text-2)">${t('gantt.weekShort')}${U.isoWeek(d)} · ${+d.slice(8)}</text>`);
        }
      }
    }
    out.push(`<line x1="0" y1="26" x2="${m.W}" y2="26" stroke="var(--line)"/>`, ...top, ...bottom, `<line x1="0" y1="${G.HEAD - 0.5}" x2="${m.W}" y2="${G.HEAD - 0.5}" stroke="var(--line-strong)"/>`);
    // playhead tab (today)
    if (today >= start && today <= m.end) {
      const tx = x(today) + dw / 2, label = U.fmtDate(today);
      const w = Math.max(44, label.length * 7 + 14);
      out.push(`<g class="playhead"><rect x="${tx - w / 2}" y="2" width="${w}" height="19" rx="9.5" fill="var(--accent)"/><text x="${tx}" y="15.5" font-size="11" font-weight="700" text-anchor="middle" fill="var(--accent-ink)">${U.esc(label)}</text>
        <path d="M${tx - 5} ${G.HEAD - 7} L${tx + 5} ${G.HEAD - 7} L${tx} ${G.HEAD - 1} Z" fill="var(--accent)"/></g>`);
    }
    return out.join('');
  },

  leftSVG(m) {
    const { rows } = m, R = G.ROW, L = G.LEFT;
    const out = [`<rect width="${L}" height="${m.H}" fill="var(--panel)"/>`];
    rows.forEach((r, i) => {
      const y = i * R;
      if (r.kind === 'ms') {
        out.push(`<rect y="${y}" width="${L}" height="${R}" fill="var(--row-alt)"/><path d="M16 ${y + 10} l6 6 -6 6 -6 -6z" fill="var(--accent)"/><text x="30" y="${y + 20}" font-size="12" font-weight="600" fill="var(--text-2)">${t('gantt.milestones')} (${m.ms.length})</text>`);
      } else if (r.kind === 'group') {
        const g = r.g, col = U.safeColor(g.color, '#8C97A8'), col2 = !!m.o.collapsed[g.id];
        out.push(`<g class="g-grouprow" data-group="${g.id}"><rect y="${y}" width="${L}" height="${R}" fill="var(--row-alt)"/>
          <path d="${col2 ? `M12 ${y + 11} l5 5 -5 5` : `M10 ${y + 13} l5 5 5 -5`}" fill="none" stroke="var(--text-2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="26" y="${y + 11}" width="4" height="10" rx="2" fill="${col}"/>
          <text x="36" y="${y + 20.5}" font-size="12.5" font-weight="700" fill="var(--text)">${U.esc(trunc(g.name, 26))}</text>
          <text x="${L - 10}" y="${y + 20.5}" font-size="11" text-anchor="end" ${MONO} fill="var(--text-3)">${g.cards.length} · ${Math.round(g.progress * 100)}%</text></g>`);
      } else {
        const c = r.c, s = r.s, mem = Model.cardMembers(c)[0], ind = r.g.flat ? 12 : 26;
        out.push(`<g class="g-cardrow" data-card="${c.id}"><rect y="${y}" width="${L}" height="${R}" fill="transparent"/>
          ${c.done ? `<path d="M${ind} ${y + 16.5} l3 3 6 -7" fill="none" stroke="var(--ok)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : `<circle cx="${ind + 4.5}" cy="${y + 16}" r="3.5" fill="${this.barColor(c)}"/>`}
          <text x="${ind + 15}" y="${y + 20}" font-size="12.5" fill="${c.done ? 'var(--text-3)' : 'var(--text)'}" ${c.done ? 'text-decoration="line-through"' : ''}>${U.esc(trunc(c.title, 27 - (ind > 12 ? 2 : 0)))}</text>
          ${mem ? `<circle cx="${L - 120}" cy="${y + 16}" r="9.5" fill="${U.safeColor(mem.color, '#5B9CF2')}"/><text x="${L - 120}" y="${y + 19.5}" font-size="8.5" font-weight="700" text-anchor="middle" fill="${U.ink(U.safeColor(mem.color, '#5B9CF2'))}">${U.esc(mem.initials || U.initials(mem.name))}</text>` : ''}
          <text x="${L - 104}" y="${y + 20}" font-size="10.5" ${MONO} fill="var(--text-2)">${U.esc(U.fmtDate(s.start))}</text>
          <text x="${L - 10}" y="${y + 20}" font-size="10.5" text-anchor="end" ${MONO} fill="var(--text-3)">${U.diffDays(s.start, s.end) + 1}${t('gantt.dayShort')}</text></g>`);
      }
      out.push(`<line x1="0" y1="${y + R - 0.5}" x2="${L}" y2="${y + R - 0.5}" stroke="var(--line)" stroke-opacity=".6"/>`);
    });
    out.push(`<line x1="${L - 0.5}" y1="0" x2="${L - 0.5}" y2="${m.H}" stroke="var(--line-strong)"/>`);
    return out.join('');
  },

  cornerSVG() {
    const L = G.LEFT;
    return `<rect width="${L}" height="${G.HEAD}" fill="var(--panel)"/>
      <text x="12" y="43" font-size="10" font-weight="700" fill="var(--text-3)">${t('gantt.colTask').toLocaleUpperCase(I18n.locale())}</text>
      <text x="${L - 104}" y="43" font-size="10" font-weight="700" fill="var(--text-3)">${t('gantt.colStart').toLocaleUpperCase(I18n.locale())}</text>
      <text x="${L - 10}" y="43" font-size="10" font-weight="700" text-anchor="end" fill="var(--text-3)">${t('gantt.colDays').toLocaleUpperCase(I18n.locale())}</text>
      <line x1="0" y1="${G.HEAD - 0.5}" x2="${L}" y2="${G.HEAD - 0.5}" stroke="var(--line-strong)"/><line x1="${L - 0.5}" y1="0" x2="${L - 0.5}" y2="${G.HEAD}" stroke="var(--line-strong)"/>`;
  },

  bodySVG(m, forExport = false) {
    const { rows, dw, x, o, W, H, start, days, today } = m, R = G.ROW;
    const out = [`<defs><marker id="garrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="var(--text-2)"/></marker>
      <marker id="garrow-c" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="var(--danger)"/></marker></defs>
      <rect width="${W}" height="${H}" fill="var(--panel)"/>`];
    // row backgrounds
    rows.forEach((r, i) => { if (r.kind !== 'card') out.push(`<rect y="${i * R}" width="${W}" height="${R}" fill="var(--row-alt)"/>`); });
    // weekends + grid
    if (o.zoom !== 'month') {
      for (let i = 0; i < days; i++) {
        const d = U.addDays(start, i);
        if (U.isWeekend(d)) out.push(`<rect x="${i * dw}" width="${dw}" height="${H}" fill="var(--weekend)"/>`);
        if (o.zoom === 'day' || U.dow(d) === 1) out.push(`<line x1="${i * dw}" x2="${i * dw}" y2="${H}" stroke="var(--line)" stroke-opacity="${U.dow(d) === 1 ? 0.9 : 0.35}"/>`);
      }
    } else {
      for (let d = start; d <= m.end; d = U.addMonths(d, 1)) out.push(`<line x1="${x(d)}" x2="${x(d)}" y2="${H}" stroke="var(--line)"/>`);
    }
    rows.forEach((r, i) => out.push(`<line x1="0" y1="${i * R + R - 0.5}" x2="${W}" y2="${i * R + R - 0.5}" stroke="var(--line)" stroke-opacity=".45"/>`));
    // milestone lines
    m.ms.forEach(ms => { const mx = x(ms.date) + dw / 2; out.push(`<line x1="${mx}" x2="${mx}" y1="${R}" y2="${H}" stroke="${U.safeColor(ms.color, '#F2A93B')}" stroke-width="1.5" stroke-dasharray="4 4" stroke-opacity=".8"/>`); });
    // today
    if (today >= start && today <= m.end) out.push(`<line x1="${x(today) + dw / 2}" x2="${x(today) + dw / 2}" y2="${H}" stroke="var(--accent)" stroke-width="2"/>`);
    // group summary bars
    rows.forEach((r, i) => {
      if (r.kind !== 'group') return;
      const g = r.g, gx = x(g.start), gw = (U.diffDays(g.start, g.end) + 1) * dw, y = i * R + 12, col = U.safeColor(g.color, '#8C97A8');
      out.push(`<rect x="${gx}" y="${y}" width="${gw}" height="7" rx="2" fill="${col}" fill-opacity=".35"/><rect x="${gx}" y="${y}" width="${gw * g.progress}" height="7" rx="2" fill="${col}"/>
        <path d="M${gx} ${y} v12 l6 -5z M${gx + gw} ${y} v12 l-6 -5z" fill="${col}"/>`);
    });
    // dependencies
    if (o.deps) {
      rows.forEach((r, i) => {
        if (r.kind !== 'card') return;
        for (const pid of r.c.dependsOn || []) {
          const pi = m.rowOf[pid]; if (pi == null) continue;
          const ps = rows[pi].s;
          const px = x(ps.end) + dw, py = pi * R + R / 2, sx = x(r.s.start), sy = i * R + R / 2;
          const d = sx - px >= 14 ? `M${px} ${py} H${px + 7} V${sy} H${sx - 1}` : `M${px} ${py} H${px + 7} V${sy + (sy > py ? -R / 2 : R / 2)} H${sx - 9} V${sy} H${sx - 1}`;
          const bad = r.s.start < ps.end, crit = m.crit.edges.has(pid + '>' + r.c.id);
          out.push(`<path d="${d}" fill="none" stroke="${bad || crit ? 'var(--danger)' : 'var(--text-2)'}" stroke-width="${crit ? 2 : 1.4}" ${bad ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#${bad || crit ? 'garrow-c' : 'garrow'})" stroke-linejoin="round"/>`);
          if (!forExport) out.push(`<path class="gdep-hit" data-from="${pid}" data-to="${r.c.id}" d="${d}" fill="none" stroke="transparent" stroke-width="10"><title>${U.esc(t('gantt.depRemoveHint'))}</title></path>`);
        }
      });
    }
    // bars
    rows.forEach((r, i) => {
      if (r.kind !== 'card') return;
      const c = r.c, s = r.s, bx = x(s.start), bw = Math.max(dw, (U.diffDays(s.start, s.end) + 1) * dw), y = i * R + (R - G.BAR) / 2;
      const col = this.barColor(c), p = Model.progress(c), crit = m.crit.ids.has(c.id);
      const late = Model.isOverdue(c);
      out.push(`<g class="gbar" data-card="${c.id}">
        <rect x="${bx}" y="${y}" width="${bw}" height="${G.BAR}" rx="5" fill="${col}" fill-opacity="${c.done ? 0.55 : 0.28}" stroke="${crit ? 'var(--danger)' : col}" stroke-width="${crit ? 2 : 1}" ${late ? 'stroke-dasharray="3 2"' : ''}/>
        ${p > 0 ? `<rect x="${bx}" y="${y}" width="${Math.max(4, bw * p)}" height="${G.BAR}" rx="5" fill="${col}"/>` : ''}
        ${c.done ? `<path d="M${bx + 6} ${y + 9.5} l3 3 6 -7" fill="none" stroke="${U.ink(col)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        <text x="${bx + bw + 14}" y="${y + 13}" font-size="11.5" fill="var(--text)" font-weight="500">${U.esc(trunc(c.title, 40))}${p > 0 && !c.done ? ` <tspan fill="var(--text-3)" ${MONO} font-size="10">${Math.round(p * 100)}%</tspan>` : ''}</text>
        ${forExport ? '' : `<rect class="gh gh-l" x="${bx - 3}" y="${y}" width="8" height="${G.BAR}" fill="transparent"/><rect class="gh gh-r" x="${bx + bw - 5}" y="${y}" width="8" height="${G.BAR}" fill="transparent"/>
        <circle class="gconn" cx="${bx + bw + 6}" cy="${y + G.BAR / 2}" r="4.5" fill="var(--panel)" stroke="var(--text-2)" stroke-width="1.5"><title>${U.esc(t('gantt.linkHint'))}</title></circle>`}
      </g>`);
    });
    // milestones (top row)
    m.ms.forEach(ms => {
      const mx = x(ms.date) + dw / 2, col = U.safeColor(ms.color, '#F2A93B');
      out.push(`<g class="gms" data-ms="${ms.id}"><path d="M${mx} ${R / 2 - 9} l9 9 -9 9 -9 -9z" fill="${ms.done ? 'var(--panel)' : col}" stroke="${col}" stroke-width="2"/>
        <text x="${mx + 13}" y="${R / 2 + 4}" font-size="11.5" font-weight="700" fill="var(--text)">${U.esc(ms.name)}</text></g>`);
    });
    if (!forExport) out.push('<path class="glink-tmp" d="" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>');
    return out.join('');
  },

  /* ---------- render */
  render() {
    const el = this.el, b = Model.board();
    if (!b) { el.innerHTML = ''; return; }
    const sc = U.$('.g-scroll', el);
    const pos = sc ? [sc.scrollLeft, sc.scrollTop] : null;
    const m = this.m = this.build();
    const o = m.o;
    const seg = (k, v, label) => `<button class="seg-btn ${o[k] === v ? 'on' : ''}" data-opt="${k}" data-v="${v}">${label}</button>`;
    const tog = (k, label, ic) => `<label class="toggle"><input type="checkbox" data-opt-check="${k}" ${o[k] ? 'checked' : ''}><span>${ic ? icon(ic) : ''}${label}</span></label>`;
    el.innerHTML = `<div class="panel gantt-panel">
      <div class="toolbar">
        <div class="seg">${seg('zoom', 'day', t('gantt.day'))}${seg('zoom', 'week', t('gantt.week'))}${seg('zoom', 'month', t('gantt.month'))}</div>
        <label class="inline-select">${t('gantt.groupBy')}<select data-opt-sel="group">
          ${['list', 'member', 'label', 'none'].map(v => `<option value="${v}" ${o.group === v ? 'selected' : ''}>${t('gantt.group.' + v)}</option>`).join('')}</select></label>
        ${tog('deps', t('gantt.deps'), 'link')}${tog('critical', t('gantt.critical'), 'target')}${tog('showDone', t('gantt.showDone'), 'check')}
        <span class="grow"></span>
        ${m.undated.length ? `<button class="btn sm ghost" data-a="undated">${icon('calendar')} ${t('gantt.undated', { n: m.undated.length })}</button>` : ''}
        <button class="btn sm ghost" data-a="today">${t('today')}</button>
        <button class="btn sm" data-a="ms-add">${icon('diamond')} ${t('ms.add')}</button>
        <button class="btn sm" data-a="export">${icon('download')} ${t('export')}</button>
      </div>
      ${m.rows.length <= 1 && !m.ms.length ? `<div class="empty-state"><p>${t('gantt.empty')}</p></div>` : `
      <div class="g-scroll"><div class="g-grid" style="grid-template-columns:${G.LEFT}px ${m.W}px">
        <div class="g-corner"><svg width="${G.LEFT}" height="${G.HEAD}">${this.cornerSVG()}</svg></div>
        <div class="g-head"><svg width="${m.W}" height="${G.HEAD}">${this.headSVG(m)}</svg></div>
        <div class="g-left"><svg width="${G.LEFT}" height="${m.H}">${this.leftSVG(m)}</svg></div>
        <div class="g-body"><svg width="${m.W}" height="${m.H}">${this.bodySVG(m)}</svg></div>
      </div></div>`}
      <div class="gtip" hidden></div>
    </div>`;
    const nsc = U.$('.g-scroll', el);
    if (nsc && pos) { nsc.scrollLeft = pos[0]; nsc.scrollTop = pos[1]; }
  },
  renderBody(over) {
    const m = this.m = this.build(over);
    const body = U.$('.g-body svg', this.el);
    if (body) body.innerHTML = this.bodySVG(m);
  },
  scrollToToday() {
    const sc = U.$('.g-scroll', this.el); if (!sc || !this.m) return;
    sc.scrollLeft = Math.max(0, this.m.x(this.m.today) - (sc.clientWidth - G.LEFT) * 0.3);
  },

  onChange(e) {
    const k = e.target.dataset.optCheck || e.target.dataset.optSel;
    if (!k) return;
    Prefs.patch('gantt', { [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
    this.render();
  },
  async onClick(e) {
    const opt = e.target.closest('[data-opt]');
    if (opt) {
      const sc = U.$('.g-scroll', this.el), m0 = this.m;
      const mid = sc && m0 ? U.addDays(m0.start, Math.round((sc.scrollLeft + (sc.clientWidth - G.LEFT) / 2) / m0.dw)) : null;
      Prefs.patch('gantt', { [opt.dataset.opt]: opt.dataset.v }); this.render();
      const sc2 = U.$('.g-scroll', this.el);
      if (sc2 && mid) sc2.scrollLeft = Math.max(0, this.m.x(mid) - (sc2.clientWidth - G.LEFT) / 2);
      return;
    }
    const a = e.target.closest('[data-a]');
    if (a) {
      const act = a.dataset.a;
      if (act === 'today') this.scrollToToday();
      else if (act === 'ms-add') MilestoneDialog.open(null);
      else if (act === 'export') Exporter.menu(a, () => this.exportSVG());
      else if (act === 'undated') this.undatedPop(a);
      return;
    }
    const grp = e.target.closest('.g-grouprow');
    if (grp) { const col = { ...this.opts().collapsed }; col[grp.dataset.group] = !col[grp.dataset.group]; Prefs.patch('gantt', { collapsed: col }); this.render(); return; }
    const row = e.target.closest('.g-cardrow');
    if (row) { CardModal.open(row.dataset.card); return; }
    const dep = e.target.closest('.gdep-hit');
    if (dep && !this.justDragged) {
      const from = Store.get(dep.dataset.from), to = Store.get(dep.dataset.to);
      if (from && to && await UI.confirm(t('gantt.depRemove', { a: from.title, b: to.title }), { ok: t('delete'), danger: true })) {
        Store.update(to.id, { dependsOn: (to.dependsOn || []).filter(x => x !== from.id) });
      }
    }
  },
  undatedPop(anchor) {
    const el = U.html(`<div class="menu"><div class="menu-title">${t('gantt.undatedTitle')}</div>${this.m.undated.slice(0, 50).map(c =>
      `<button class="menu-item" data-id="${c.id}"><span class="mono muted">${U.esc(Model.cardKey(c))}</span> ${U.esc(c.title)}</button>`).join('')}</div>`);
    el.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) { UI.closePopover(); CardModal.open(b.dataset.id); } });
    UI.pop(anchor, el, { align: 'end' });
  },

  /* ---------- dragging on the chart */
  onDown(e) {
    if (e.button !== 0) return;
    const body = e.target.closest('.g-body svg'); if (!body) return;
    const bar = e.target.closest('.gbar'), ms = e.target.closest('.gms');
    if (!bar && !ms) return;
    e.preventDefault();
    let mode = 'move';
    if (e.target.classList.contains('gh-l')) mode = 'l';
    else if (e.target.classList.contains('gh-r')) mode = 'r';
    else if (e.target.classList.contains('gconn')) mode = 'link';
    if (ms) mode = 'ms';
    const id = bar ? bar.dataset.card : ms.dataset.ms;
    const ent = Store.get(id);
    const r = body.getBoundingClientRect();
    this.drag = { mode, id, ent, x0: e.clientX, y0: e.clientY, dd: 0, moved: false, span: bar ? Model.span(ent) : null, svgRect: r };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  },
  dragSpan(d) {
    const s = d.span, n = d.dd;
    if (d.mode === 'move') return { start: U.addDays(s.start, n), end: U.addDays(s.end, n) };
    if (d.mode === 'l') { const st = U.addDays(s.start, n); return { start: st > s.end ? s.end : st, end: s.end }; }
    if (d.mode === 'r') { const en = U.addDays(s.end, n); return { start: s.start, end: en < s.start ? s.start : en }; }
    return s;
  },
  onMove(e) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
    d.moved = true;
    const tip = U.$('.gtip', this.el);
    if (d.mode === 'link') {
      const r = U.$('.g-body svg', this.el).getBoundingClientRect();
      const i = this.m.rowOf[d.id], s = this.m.rows[i].s;
      const sx = this.m.x(s.end) + this.m.dw + 6, sy = i * G.ROW + G.ROW / 2;
      U.$('.glink-tmp', this.el)?.setAttribute('d', `M${sx} ${sy} L${e.clientX - r.left} ${e.clientY - r.top}`);
      return;
    }
    const dd = Math.round((e.clientX - d.x0) / this.m.dw);
    if (dd !== d.dd) {
      d.dd = dd;
      if (d.mode === 'ms') {
        const ms = { ...d.ent, date: U.addDays(d.ent.date, dd) };
        const keep = this.m;
        this.m = this.build(); this.m.ms = this.m.ms.map(x => (x.id === ms.id ? ms : x));
        U.$('.g-body svg', this.el).innerHTML = this.bodySVG(this.m);
        void keep;
        tip.textContent = `${d.ent.name}: ${U.fmtDate(ms.date, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      } else {
        const sp = this.dragSpan(d);
        this.renderBody({ [d.id]: sp });
        tip.textContent = `${U.fmtRange(sp.start, sp.end)} · ${U.diffDays(sp.start, sp.end) + 1} ${t('gantt.days')}`;
      }
    }
    tip.hidden = false;
    const pr = U.$('.gantt-panel', this.el).getBoundingClientRect();
    tip.style.transform = `translate(${e.clientX - pr.left + 14}px, ${e.clientY - pr.top + 16}px)`;
  },
  onUp(e) {
    const d = this.drag;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.drag = null;
    const tip = U.$('.gtip', this.el); if (tip) tip.hidden = true;
    if (!d) return;
    if (!d.moved) {
      if (d.mode === 'ms') MilestoneDialog.open(d.id); else CardModal.open(d.id);
      return;
    }
    this.justDragged = true; setTimeout(() => { this.justDragged = false; }, 50);
    if (d.mode === 'link') {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.gbar, .g-cardrow');
      if (target && target.dataset.card !== d.id) Model.addDependency(target.dataset.card, d.id);
      this.render();
      return;
    }
    if (!d.dd) { this.render(); return; }
    if (d.mode === 'ms') { Store.update(d.id, { date: U.addDays(d.ent.date, d.dd) }); return; }
    const sp = this.dragSpan(d), c = d.ent;
    const patch = {};
    if (d.mode === 'move') { if (c.start) patch.start = U.addDays(c.start, d.dd); if (c.due) patch.due = U.addDays(c.due, d.dd); }
    else if (d.mode === 'l') { patch.start = sp.start; if (!c.due) patch.due = sp.end; }
    else { patch.due = sp.end; if (!c.start) patch.start = sp.start; }
    Store.update(c.id, patch);
    Model.log(c, 'act.dates', { range: U.fmtRange(patch.start ?? c.start, patch.due ?? c.due) });
  },

  /* ---------- export */
  exportSVG() {
    const m = this.build();
    const TOP = 44, W = G.LEFT + m.W, H = TOP + G.HEAD + m.H;
    const inner = `
      <text x="16" y="28" font-size="17" font-weight="700" fill="var(--text)">${U.esc(m.b.name)} — ${t('view.gantt')}</text>
      <text x="${W - 16}" y="28" font-size="11" text-anchor="end" fill="var(--text-3)">${U.esc(U.fmtDate(U.today(), { day: 'numeric', month: 'long', year: 'numeric' }))}</text>
      <g transform="translate(${G.LEFT},${TOP})">${this.headSVG(m)}</g>
      <g transform="translate(0,${TOP + G.HEAD})">${this.leftSVG(m)}</g>
      <g transform="translate(${G.LEFT},${TOP + G.HEAD})">${this.bodySVG(m, true)}</g>
      <g transform="translate(0,${TOP})">${this.cornerSVG()}</g>`;
    return { svg: Exporter.standalone(inner, W, H), w: W, h: H, name: `${m.b.name}-gantt` };
  },
};

/* Create / edit a milestone. */
const MilestoneDialog = {
  open(id, defaults = {}) {
    const b = Model.board();
    const ms = id ? Store.get(id) : { name: '', date: defaults.date || U.today(), color: '#F2A93B', desc: '', done: false };
    let color = ms.color;
    const m = UI.modal({
      title: id ? t('ms.edit') : t('ms.add'), cls: 'dialog',
      body: `<div class="form">
        <label class="field">${t('ms.name')}<input class="input" data-k="name" value="${U.esc(ms.name)}" placeholder="Alpha, Beta, Demo…"></label>
        <label class="field">${t('ms.date')}<input class="input" type="date" data-k="date" value="${ms.date || ''}"></label>
        <div class="field"><span class="field-label">${t('color')}</span>${UI.swatches(color)}</div>
        <label class="field">${t('ms.desc')}<textarea class="input" rows="3" data-k="desc">${U.esc(ms.desc || '')}</textarea></label>
        <label class="toggle"><input type="checkbox" data-k="done" ${ms.done ? 'checked' : ''}><span>${t('ms.reached')}</span></label>
      </div>`,
      actions: `${id ? `<button class="btn ghost danger-text" data-del>${icon('trash')} ${t('delete')}</button><span class="grow"></span>` : ''}<button class="btn" data-close>${t('cancel')}</button><button class="btn primary" data-ok>${t('save')}</button>`,
    });
    m.el.addEventListener('click', async e => {
      const sw = e.target.closest('[data-color]');
      if (sw) { color = sw.dataset.color; U.$$('.sw', m.el).forEach(s => s.classList.toggle('on', s === sw)); return; }
      if (e.target.closest('[data-del]')) {
        if (await UI.confirm(t('ms.deleteConfirm', { name: ms.name }), { ok: t('delete'), danger: true })) { Store.remove(id); m.close(); }
        return;
      }
      if (!e.target.closest('[data-ok]')) return;
      const v = k => U.$(`[data-k=${k}]`, m.el);
      const name = v('name').value.trim(), date = v('date').value;
      if (!name || !date) { (name ? v('date') : v('name')).focus(); return; }
      const data = { name, date, color, desc: v('desc').value, done: v('done').checked };
      if (id) Store.update(id, data); else Store.create('milestone', { boardId: b.id, ...data });
      m.close();
    });
  },
};
