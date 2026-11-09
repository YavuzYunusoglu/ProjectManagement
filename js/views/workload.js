'use strict';
/* Per-person workload heat grid (estimated hours spread across workdays, or card counts). */
const WorkloadView = {
  el: null,
  busy() { return false; },
  mount(el) {
    this.el = el;
    el.className = 'view view-workload';
    el.addEventListener('click', e => this.onClick(e));
    this.render();
  },
  build() {
    const b = Model.board(), o = Prefs.get('workload');
    const base = U.addDays(U.startOfWeek(U.today()), -7);
    const cols = o.scale === 'day'
      ? [...Array(28)].map((_, i) => { const d = U.addDays(base, i); return { s: d, e: d, label: U.fmtDate(d, { day: 'numeric' }), sub: U.fmtDate(d, { weekday: 'narrow' }), we: U.isWeekend(d), today: d === U.today() }; })
      : [...Array(12)].map((_, i) => { const s = U.addDays(base, i * 7); return { s, e: U.addDays(s, 6), label: `${t('gantt.weekShort')}${U.isoWeek(s)}`, sub: U.fmtDate(s), today: U.today() >= s && U.today() <= U.addDays(s, 6) }; });
    const cards = Model.boardCards(b.id).filter(c => !c.done && Model.span(c) && Filter.match(c));
    const people = [...Model.members().map(m => ({ id: m.id, m, name: m.name, cap: +m.capacity || 20 })), { id: '_none', name: t('gantt.unassigned'), cap: 0 }];
    const rows = people.map(p => {
      const mine = cards.filter(c => (p.id === '_none' ? !Model.cardMembers(c).length : (c.memberIds || []).includes(p.id)));
      const vals = cols.map(col => {
        let v = 0;
        for (const c of mine) {
          const s = Model.span(c);
          if (s.end < col.s || s.start > col.e) continue;
          if (o.metric === 'cards') { v += 1; continue; }
          const share = p.id === '_none' ? 1 : Model.cardMembers(c).length || 1;
          const totalWd = U.workdays(s.start, s.end), a = s.start > col.s ? s.start : col.s, z = s.end < col.e ? s.end : col.e;
          const frac = totalWd ? U.workdays(a, z) / totalWd : (U.diffDays(a, z) + 1) / (U.diffDays(s.start, s.end) + 1);
          v += (+c.estimate || 0) * frac / share;
        }
        return v;
      });
      const cap = o.metric === 'hours' ? (o.scale === 'day' ? p.cap / 5 : p.cap) : 0;
      return { ...p, cards: mine, vals, capCol: cap };
    }).filter(r => r.id !== '_none' || r.cards.length);
    const max = Math.max(1, ...rows.flatMap(r => r.vals));
    return { b, o, cols, rows, max, noEstimate: o.metric === 'hours' && cards.length && !cards.some(c => +c.estimate) };
  },
  svg(m, forExport = false) {
    const NAME = 170, CW = m.o.scale === 'day' ? 34 : 70, RH = 42, HEAD = 40, SUM = 92;
    const W = NAME + CW * m.cols.length + SUM, H = HEAD + RH * m.rows.length;
    const out = [];
    m.cols.forEach((c, i) => {
      const x = NAME + i * CW;
      out.push(`<text x="${x + CW / 2}" y="17" text-anchor="middle" font-size="11" font-weight="${c.today ? 700 : 500}" fill="${c.today ? 'var(--accent)' : 'var(--text-2)'}">${U.esc(c.label)}</text>
        <text x="${x + CW / 2}" y="31" text-anchor="middle" font-size="9.5" fill="var(--text-3)">${U.esc(c.sub)}</text>`);
    });
    out.push(`<text x="${NAME + CW * m.cols.length + SUM - 6}" y="24" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--text-3)">${t('work.total')}</text>`);
    m.rows.forEach((r, ri) => {
      const y = HEAD + ri * RH;
      const col = r.m ? U.safeColor(r.m.color, '#5B9CF2') : '#8C97A8';
      out.push(`<circle cx="18" cy="${y + RH / 2}" r="11" fill="${col}"/><text x="18" y="${y + RH / 2 + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="${U.ink(col)}">${U.esc(r.m ? (r.m.initials || U.initials(r.m.name)) : '–')}</text>
        <text x="36" y="${y + RH / 2 - 1}" font-size="12.5" font-weight="600" fill="var(--text)">${U.esc(trunc(r.name, 17))}</text>
        <text x="36" y="${y + RH / 2 + 13}" font-size="10" fill="var(--text-3)">${t('work.openCards', { n: r.cards.length })}${r.capCol ? ` · ${r.cap}${t('hoursShort')}/${t('work.weekShort')}` : ''}</text>`);
      r.vals.forEach((v, ci) => {
        const x = NAME + ci * CW + 1, c = m.cols[ci];
        const ratio = r.capCol ? v / r.capCol : v / m.max;
        const over = r.capCol && v > r.capCol + 0.01;
        const fill = v <= 0 ? (c.we ? 'var(--weekend)' : 'var(--row-alt)') : over ? 'var(--danger)' : 'var(--accent)';
        const op = v <= 0 ? 1 : over ? Math.min(1, 0.55 + (ratio - 1) * 0.5) : 0.15 + Math.min(1, ratio) * 0.7;
        const txt = v > 0 ? (m.o.metric === 'hours' ? (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) : v) : '';
        out.push(`<rect x="${x}" y="${y + 3}" width="${CW - 2}" height="${RH - 6}" rx="4" fill="${fill}" fill-opacity="${op}"><title>${U.esc(`${r.name} · ${c.sub}: ${txt || 0}${m.o.metric === 'hours' ? ' ' + t('hours') : ''}${r.capCol ? ` / ${Math.round(r.capCol * 10) / 10}` : ''}`)}</title></rect>
          ${txt !== '' ? `<text x="${x + (CW - 2) / 2}" y="${y + RH / 2 + 4}" text-anchor="middle" font-size="${m.o.scale === 'day' ? 10 : 11.5}" font-weight="600" fill="${over ? '#fff' : ratio > 0.5 ? 'var(--accent-ink)' : 'var(--text)'}" pointer-events="none">${txt}</text>` : ''}`);
      });
      const tot = U.sum(r.vals), capTot = r.capCol * m.cols.filter(c => !c.we).length;
      out.push(`<text x="${W - 6}" y="${y + RH / 2 + 4}" text-anchor="end" font-size="12" font-weight="700" ${MONO} fill="${capTot && tot > capTot ? 'var(--danger)' : 'var(--text)'}">${m.o.metric === 'hours' ? Math.round(tot) + t('hoursShort') : tot}</text>`);
    });
    return { inner: out.join(''), W, H };
  },
  render() {
    const m = this.m = this.build(), o = m.o;
    const { inner, W, H } = this.svg(m);
    const seg = (k, v, label) => `<button class="seg-btn ${o[k] === v ? 'on' : ''}" data-opt="${k}" data-v="${v}">${label}</button>`;
    this.el.innerHTML = `<div class="panel work-panel">
      <div class="toolbar">
        <h2 class="panel-title">${icon('users')} ${t('view.workload')}</h2>
        <div class="seg">${seg('metric', 'hours', t('work.hours'))}${seg('metric', 'cards', t('work.cards'))}</div>
        <div class="seg">${seg('scale', 'week', t('gantt.week'))}${seg('scale', 'day', t('gantt.day'))}</div>
        <span class="grow"></span>
        <button class="btn sm ghost" data-a="capacity">${icon('gear')} ${t('work.capacity')}</button>
        <button class="btn sm" data-a="export">${icon('download')} ${t('export')}</button>
      </div>
      ${m.noEstimate ? `<p class="notice">${icon('info')} ${t('work.noEstimate')}</p>` : ''}
      <div class="legend-row"><span class="lg-sw" style="--c:var(--accent);opacity:.3"></span>${t('work.legendLow')}<span class="lg-sw" style="--c:var(--accent)"></span>${t('work.legendFull')}<span class="lg-sw" style="--c:var(--danger)"></span>${t('work.legendOver')}</div>
      <div class="chart-scroll"><svg width="${W}" height="${H}" class="work-svg">${inner}</svg></div>
      <div class="work-lists">${m.rows.map(r => `<section class="work-col">
        <h3>${r.m ? UI.avatar(r.m, 'sm') : ''} ${U.esc(r.name)} <span class="mono muted">${r.cards.length}</span></h3>
        ${r.cards.sort((a, z) => (a.due || '9').localeCompare(z.due || '9')).map(c => `<button class="ag-row" data-card="${c.id}"><span class="dot" style="--c:${GanttView.barColor(c)}"></span><span class="grow">${U.esc(c.title)}</span><span class="mono muted">${c.estimate ? c.estimate + t('hoursShort') + ' · ' : ''}${U.esc(U.fmtDate(c.due))}</span></button>`).join('') || `<p class="hint">${t('work.free')}</p>`}
      </section>`).join('')}</div>
    </div>`;
  },
  onClick(e) {
    const opt = e.target.closest('[data-opt]');
    if (opt) { Prefs.patch('workload', { [opt.dataset.opt]: opt.dataset.v }); this.render(); return; }
    const a = e.target.closest('[data-a]');
    if (a?.dataset.a === 'export') {
      Exporter.menu(a, () => {
        const m = this.build(), s = this.svg(m), T = 40;
        const inner = `<text x="16" y="26" font-size="16" font-weight="700" fill="var(--text)">${U.esc(m.b.name)} — ${t('view.workload')} (${m.o.metric === 'hours' ? t('work.hours') : t('work.cards')})</text><g transform="translate(12,${T})">${s.inner}</g>`;
        return { svg: Exporter.standalone(inner, s.W + 24, s.H + T + 12), w: s.W + 24, h: s.H + T + 12, name: `${m.b.name}-workload` };
      });
      return;
    }
    if (a?.dataset.a === 'capacity') { Settings.open('members'); return; }
    const c = e.target.closest('[data-card]'); if (c) CardModal.open(c.dataset.card);
  },
};
