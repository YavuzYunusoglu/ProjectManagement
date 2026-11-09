'use strict';
/* Statistics: headline numbers, burndown, distributions. Every chart can be exported. */
const roundRight = (x, y, w, h, r) => {
  r = Math.min(r, w, h / 2);
  return `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - r}z`;
};
const niceTicks = (max, n = 4) => {
  if (max <= 0) return [0, 1];
  const raw = max / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  const out = []; for (let v = 0; v <= max + step * 0.001; v += step) out.push(+v.toFixed(6));
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
};

const StatsView = {
  el: null, charts: {},
  busy() { return false; },
  mount(el) {
    this.el = el;
    el.className = 'view view-stats';
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('pointermove', e => this.onHover(e));
    el.addEventListener('pointerleave', () => this.hideTip(), true);
    this.render();
  },
  w(c) { return Prefs.get('stats').metric === 'hours' ? (+c.estimate || 0) : 1; },
  fmt(v) { return Prefs.get('stats').metric === 'hours' ? `${Math.round(v * 10) / 10}${t('hoursShort')}` : String(Math.round(v)); },

  /* ---------- burndown */
  burndown(b, cards) {
    const today = U.today();
    const cday = c => U.iso(new Date(c.createdAt || Date.now()));
    const dday = c => (c.doneAt ? U.iso(new Date(c.doneAt)) : today);
    let start = U.minDate(...cards.map(cday), ...cards.map(c => c.start)) || today;
    const end = U.maxDate(today, ...cards.map(c => c.due), ...Model.milestones(b.id).map(m => m.date));
    if (U.diffDays(start, end) > 240) start = U.addDays(end, -240);
    if (start > today) start = today;
    const pts = [];
    for (let d = start; d <= today; d = U.addDays(d, 1)) {
      const live = cards.filter(c => cday(c) <= d);
      const scope = U.sum(live, c => this.w(c));
      const done = U.sum(live.filter(c => c.done && dday(c) <= d), c => this.w(c));
      pts.push({ d, scope, rem: scope - done });
    }
    const W = U.clamp((this.el?.clientWidth || 900) - 70, 340, 1240), H = 300, ml = 46, mr = 18, mt = 18, mb = 34;
    const iw = W - ml - mr, ih = H - mt - mb;
    const n = Math.max(1, U.diffDays(start, end));
    const scopeNow = pts.length ? pts[pts.length - 1].scope : 0;
    const ticks = niceTicks(Math.max(scopeNow, ...pts.map(p => p.scope)));
    const ymax = ticks[ticks.length - 1] || 1;
    const X = d => ml + (U.diffDays(start, d) / n) * iw, Y = v => mt + ih - (v / ymax) * ih;
    const out = [];
    ticks.forEach(v => out.push(`<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-opacity="${v ? 0.6 : 1}"/><text x="${ml - 8}" y="${Y(v) + 3.5}" text-anchor="end" font-size="10.5" ${MONO} fill="var(--text-3)">${v}</text>`));
    const step = n > 120 ? 28 : n > 50 ? 14 : 7;
    for (let d = U.startOfWeek(start); d <= end; d = U.addDays(d, step)) {
      if (d < start) continue;
      out.push(`<text x="${X(d)}" y="${H - 12}" text-anchor="middle" font-size="10.5" fill="var(--text-3)">${U.esc(U.fmtDate(d))}</text><line x1="${X(d)}" x2="${X(d)}" y1="${mt + ih}" y2="${mt + ih + 4}" stroke="var(--line-strong)"/>`);
    }
    Model.milestones(b.id).filter(m => m.date >= start && m.date <= end).forEach(m => {
      const x = X(m.date), c = U.safeColor(m.color, '#F2A93B');
      out.push(`<line x1="${x}" x2="${x}" y1="${mt}" y2="${mt + ih}" stroke="${c}" stroke-dasharray="3 4" stroke-opacity=".7"/><path d="M${x} ${mt + ih - 6} l6 6 -6 6 -6 -6z" fill="${c}" stroke="var(--panel)" stroke-width="2"><title>${U.esc(m.name)}</title></path>`);
    });
    if (today <= end) out.push(`<line x1="${X(today)}" x2="${X(today)}" y1="${mt}" y2="${mt + ih}" stroke="var(--accent)" stroke-width="1.5"/><text x="${X(today) + 4}" y="${mt + 10}" font-size="10" font-weight="700" fill="var(--text-2)">${t('today')}</text>`);
    out.push(`<path d="M${X(start)} ${Y(scopeNow)} L${X(end)} ${Y(0)}" stroke="var(--text-3)" stroke-width="1.5" stroke-dasharray="6 5" fill="none"/>`);
    const line = k => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join('');
    if (pts.length) {
      out.push(`<path d="${line('scope')}" stroke="var(--text-2)" stroke-width="1.5" stroke-dasharray="2 3" fill="none"/>`);
      out.push(`<path d="${line('rem')} L${X(pts[pts.length - 1].d)} ${Y(0)} L${X(start)} ${Y(0)}Z" fill="var(--accent)" fill-opacity=".10"/>`);
      out.push(`<path d="${line('rem')}" stroke="var(--accent)" stroke-width="2.25" fill="none" stroke-linejoin="round"/>`);
      const last = pts[pts.length - 1];
      out.push(`<circle cx="${X(last.d)}" cy="${Y(last.rem)}" r="4.5" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/><text x="${X(last.d) + 8}" y="${Y(last.rem) - 8}" font-size="11.5" font-weight="700" fill="var(--text)">${this.fmt(last.rem)}</text>`);
    }
    out.push(`<line x1="${ml}" x2="${W - mr}" y1="${mt + ih}" y2="${mt + ih}" stroke="var(--line-strong)"/>`);
    this.bd = { pts, X, Y, W, H, mt, ih, start };
    return { inner: out.join(''), W, H };
  },

  /* ---------- horizontal bars (single or stacked) */
  hbars(rows, { W = 380, labelW = 120 } = {}) {
    const RH = 28, BH = 14, top = 4;
    const max = Math.max(1, ...rows.map(r => U.sum(r.segs, s => s.v)));
    const bw = W - labelW - 44;
    const H = top + rows.length * RH + 4;
    const out = [];
    rows.forEach((r, i) => {
      const y = top + i * RH, by = y + (RH - BH) / 2;
      out.push(`<text x="${labelW - 10}" y="${y + RH / 2 + 4}" text-anchor="end" font-size="11.5" fill="var(--text-2)">${U.esc(trunc(r.label, 18))}</text>`);
      let x = labelW;
      const segs = r.segs.filter(s => s.v > 0);
      segs.forEach((s, si) => {
        const w = (s.v / max) * bw, last = si === segs.length - 1;
        const ww = Math.max(0, w - (last ? 0 : 2));
        out.push(last ? `<path d="${roundRight(x, by, Math.max(ww, 2), BH, 4)}" fill="${s.color}"><title>${U.esc(`${r.label} · ${s.name}: ${this.fmtN(s.v)}`)}</title></path>`
          : `<rect x="${x}" y="${by}" width="${ww}" height="${BH}" fill="${s.color}"><title>${U.esc(`${r.label} · ${s.name}: ${this.fmtN(s.v)}`)}</title></rect>`);
        x += w;
      });
      const tot = U.sum(r.segs, s => s.v);
      out.push(`<text x="${x + 6}" y="${y + RH / 2 + 4}" font-size="11" ${MONO} fill="var(--text)">${this.fmtN(tot)}${r.suffix || ''}</text>`);
    });
    out.push(`<line x1="${labelW}" x2="${labelW}" y1="0" y2="${H}" stroke="var(--line-strong)"/>`);
    return { inner: out.join(''), W, H };
  },
  fmtN(v) { return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toString(); },

  chartBox(key, title, sub, chart, legend = '') {
    this.charts[key] = { title, chart };
    return `<section class="panel chart-card ${key === 'burndown' ? 'wide' : ''}">
      <header class="chart-head"><div><h3>${U.esc(title)}</h3>${sub ? `<p class="hint">${U.esc(sub)}</p>` : ''}</div>
        <button class="icon-btn" data-export="${key}" aria-label="${t('export')}">${icon('download')}</button></header>
      ${legend ? `<div class="legend-row">${legend}</div>` : ''}
      <div class="chart-scroll" data-chart="${key}"><svg viewBox="0 0 ${chart.W} ${chart.H}" width="${chart.W}" height="${chart.H}" class="chart-svg">${chart.inner}</svg>${key === 'burndown' ? '<div class="ctip" hidden></div><div class="cross" hidden></div>' : ''}</div>
    </section>`;
  },

  render() {
    const b = Model.board(); if (!b) return;
    const o = Prefs.get('stats');
    const cards = Model.boardCards(b.id).filter(c => Filter.match(c));
    const today = U.today(), wk = U.addDays(today, 7);
    const done = cards.filter(c => c.done), open = cards.filter(c => !c.done);
    const overdue = open.filter(c => Model.isOverdue(c));
    const thisWeek = open.filter(c => c.due && c.due >= today && c.due <= wk);
    const remH = U.sum(open, c => +c.estimate || 0);
    const nextMs = Model.milestones(b.id).find(m => m.date >= today && !m.done);
    const pct = cards.length ? Math.round(done.length / cards.length * 100) : 0;
    const msCards = nextMs ? cards.filter(c => c.due && c.due <= nextMs.date) : [];
    const msPct = msCards.length ? Math.round(msCards.filter(c => c.done).length / msCards.length * 100) : 0;
    const tile = (label, val, sub = '', cls = '') => `<div class="tile ${cls}"><span class="tile-label">${label}</span><strong class="tile-val">${val}</strong>${sub ? `<span class="tile-sub">${sub}</span>` : ''}</div>`;

    const DONE = 'var(--ok)', OPEN = 'var(--chart-open)';
    const doneOpen = (label, list) => ({ label, segs: [{ v: U.sum(list.filter(c => c.done), c => this.w(c)), color: DONE, name: t('stats.done') }, { v: U.sum(list.filter(c => !c.done), c => this.w(c)), color: OPEN, name: t('stats.open') }] });
    const byList = this.hbars(Model.lists(b.id).map(l => doneOpen(l.name, cards.filter(c => c.listId === l.id))));
    const byMember = this.hbars([...Model.members().map(m => doneOpen(m.name, cards.filter(c => (c.memberIds || []).includes(m.id)))), doneOpen(t('gantt.unassigned'), cards.filter(c => !Model.cardMembers(c).length))].filter(r => U.sum(r.segs, s => s.v)));
    const byLabel = this.hbars(Model.labels(b.id).map(l => ({ label: l.name, segs: [{ v: U.sum(cards.filter(c => (c.labelIds || []).includes(l.id)), c => this.w(c)), color: U.safeColor(l.color, '#8C97A8'), name: l.name }] })).filter(r => r.segs[0].v));
    const byPrio = this.hbars(PRIORITIES.slice().reverse().map(p => ({ label: t('prio.' + p), segs: [{ v: U.sum(open.filter(c => c.priority === p), c => this.w(c)), color: PRIORITY_COLOR[p], name: t('prio.' + p) }] })));
    const byType = this.hbars(CARD_TYPES.map(ty => ({ label: t('type.' + ty), segs: [{ v: U.sum(cards.filter(c => (c.kind || 'task') === ty), c => this.w(c)), color: 'var(--chart-open)', name: t('type.' + ty) }] })).filter(r => r.segs[0].v));
    const bd = this.burndown(b, cards);
    const lgDO = `<span class="lg-sw" style="--c:${DONE}"></span>${t('stats.done')}<span class="lg-sw" style="--c:${OPEN}"></span>${t('stats.open')}`;
    const unit = o.metric === 'hours' ? t('stats.unitHours') : t('stats.unitCards');
    this.charts = {};
    this.el.innerHTML = `<div class="stats-wrap">
      <div class="toolbar panel">
        <h2 class="panel-title">${icon('chart')} ${t('view.stats')}</h2>
        <div class="seg"><button class="seg-btn ${o.metric === 'cards' ? 'on' : ''}" data-metric="cards">${t('work.cards')}</button><button class="seg-btn ${o.metric === 'hours' ? 'on' : ''}" data-metric="hours">${t('work.hours')}</button></div>
        ${Filter.active() ? `<span class="hint">${icon('filter')} ${t('stats.filtered')}</span>` : ''}
      </div>
      <div class="tiles">
        ${tile(t('stats.progress'), `${pct}%`, t('stats.doneOf', { a: done.length, b: cards.length }))}
        ${tile(t('stats.open'), open.length, remH ? t('stats.hoursLeft', { h: Math.round(remH) }) : '')}
        ${tile(t('stats.overdue'), overdue.length, overdue.length ? t('stats.needsAttention') : t('stats.onTrack'), overdue.length ? 'bad' : 'good')}
        ${tile(t('stats.dueWeek'), thisWeek.length, t('stats.next7'))}
        ${nextMs ? tile(t('stats.nextMs'), U.esc(nextMs.name), `${U.esc(U.fmtDate(nextMs.date))} · ${t('stats.daysLeft', { n: U.diffDays(today, nextMs.date) })} · ${msPct}%`) : ''}
      </div>
      <div class="chart-grid">
        ${this.chartBox('burndown', t('stats.burndown'), t('stats.burndownSub', { unit }), bd,
          `<span class="lg-line" style="--c:var(--accent)"></span>${t('stats.remaining')}<span class="lg-line dashed" style="--c:var(--text-3)"></span>${t('stats.ideal')}<span class="lg-line dotted" style="--c:var(--text-2)"></span>${t('stats.scope')}`)}
        ${this.chartBox('lists', t('stats.byList'), unit, byList, lgDO)}
        ${this.chartBox('members', t('stats.byMember'), unit, byMember, lgDO)}
        ${byLabel.H > 10 ? this.chartBox('labels', t('stats.byLabel'), unit, byLabel) : ''}
        ${this.chartBox('prio', t('stats.byPrio'), t('stats.openOnly') + ' · ' + unit, byPrio)}
        ${byType.H > 10 ? this.chartBox('types', t('stats.byType'), unit, byType) : ''}
      </div>
    </div>`;
  },
  onClick(e) {
    const m = e.target.closest('[data-metric]');
    if (m) { Prefs.patch('stats', { metric: m.dataset.metric }); this.render(); return; }
    const ex = e.target.closest('[data-export]');
    if (ex) {
      const key = ex.dataset.export;
      Exporter.menu(ex, () => {
        const c = this.charts[key], T = 40, W = c.chart.W + 24, H = c.chart.H + T + 12;
        const inner = `<text x="16" y="26" font-size="15" font-weight="700" fill="var(--text)">${U.esc(Model.board().name)} — ${U.esc(c.title)}</text><g transform="translate(12,${T})">${c.chart.inner}</g>`;
        return { svg: Exporter.standalone(inner, W, H), w: W, h: H, name: `${Model.board().name}-${key}` };
      });
    }
  },
  onHover(e) {
    const box = e.target.closest('[data-chart="burndown"]');
    if (!box || !this.bd || !this.bd.pts.length) { this.hideTip(); return; }
    const svg = box.querySelector('svg'), r = svg.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (this.bd.W / r.width);
    const { pts, X, Y } = this.bd;
    let best = pts[0];
    for (const p of pts) if (Math.abs(X(p.d) - sx) < Math.abs(X(best.d) - sx)) best = p;
    const k = r.width / this.bd.W;
    const cross = box.querySelector('.cross'), tip = box.querySelector('.ctip');
    cross.hidden = false; tip.hidden = false;
    cross.style.cssText = `left:${svg.offsetLeft + X(best.d) * k}px;top:${svg.offsetTop + this.bd.mt * k}px;height:${this.bd.ih * k}px`;
    tip.innerHTML = `<strong>${U.esc(U.fmtDate(best.d, { day: 'numeric', month: 'long' }))}</strong><span><i style="--c:var(--accent)"></i>${t('stats.remaining')} <b>${this.fmt(best.rem)}</b></span><span><i style="--c:var(--text-2)"></i>${t('stats.scope')} <b>${this.fmt(best.scope)}</b></span>`;
    const tx = svg.offsetLeft + X(best.d) * k, ty = svg.offsetTop + Y(best.rem) * k;
    tip.style.left = (tx + 180 > box.clientWidth + box.scrollLeft ? tx - 170 : tx + 12) + 'px';
    tip.style.top = Math.max(0, ty - 30) + 'px';
  },
  hideTip() { U.$$('.ctip, .cross', this.el).forEach(x => { x.hidden = true; }); },
};
