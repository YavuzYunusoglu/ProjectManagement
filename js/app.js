'use strict';
/* App shell: top bar, view dock, routing, theme, filters, keyboard. */
const VIEWS = { board: BoardView, todo: TodoView, gantt: GanttView, calendar: CalendarView, workload: WorkloadView, stats: StatsView, wiki: WikiView, ai: AIView };
const VIEW_ICONS = { board: 'board', todo: 'checklist', gantt: 'gantt', calendar: 'calendar', workload: 'users', stats: 'chart', wiki: 'book', ai: 'sparkle' };
const LIGHT_BGS = ['sand', 'sky', 'mint', 'paper'];

const App = {
  view: null, viewKey: null, stale: false, raf: null,

  init() {
    Store.load();
    I18n.apply();
    if (Store.isEmpty()) {
      seedDemo();
      // Sample data counts as "pristine" until the person edits something (see Sync initial merge).
      setTimeout(() => Prefs.set('pristine', true), 0);
    }
    if (!Model.boards().length) this.createBoard(t('board.defaultName'));
    if (!Store.get(Prefs.get('boardId'))) Prefs.set('boardId', Model.boards()[0].id);
    this.applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
    window.addEventListener('languagechange', () => { if (Prefs.get('lang') === 'system') { I18n.apply(); this.renderAll(); } });

    document.getElementById('app').innerHTML = `
      <header class="top" id="top"></header>
      <main class="stage" id="stage"><div id="view"></div></main>
      <nav class="dock" id="dock" aria-label="${t('nav.views')}"></nav>`;
    this.renderTop();
    this.renderDock();
    this.show(VIEWS[Prefs.get('view')] ? Prefs.get('view') : 'board');

    Store.subscribe(() => this.schedule());
    Filter.subs.add(() => { this.updateTop(); this.renderView(); });
    Sync.subscribe(() => this.renderSync());
    document.addEventListener('keydown', e => this.onKey(e));
    document.addEventListener('focusout', () => setTimeout(() => this.flushStale(), 0));
    document.addEventListener('pointerup', () => setTimeout(() => this.flushStale(), 0));
    setInterval(() => this.flushStale(), 1000);
    Sync.start(false);
    setTimeout(() => {
      if (!Model.me() && Model.members().length) UI.toast(t('me.pick'), { action: t('me.pickAction'), onAction: () => Settings.open('general'), timeout: 9000 });
    }, 1500);
  },

  createBoard(name) {
    const b = Store.create('board', { name, prefix: 'PM', pos: Model.nextPos(Model.boards()), background: { type: 'preset', value: 'dusk' } });
    ['todo', 'doing', 'done'].forEach((k, i) => Store.create('list', { boardId: b.id, name: t('list.default.' + k), pos: (i + 1) * 1024 }));
    return b;
  },

  /* ---------- theme */
  applyTheme() {
    const p = Prefs.get('theme');
    const dark = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#12151d' : '#eef1f6');
    if (this.view && this.viewKey !== 'board') this.renderView();
    this.updateTop();
  },
  applyBg() {
    const b = Model.board(), st = document.getElementById('stage');
    if (!st || !b) return;
    st.style.background = boardBackground(b);
    const bg = b.background || {};
    const light = (bg.type === 'preset' && LIGHT_BGS.includes(bg.value)) || (bg.type === 'color' && U.ink(bg.value) !== '#ffffff');
    st.dataset.tone = light ? 'light' : 'dark';
    document.title = `${b.name} · GameDev PM`;
  },

  /* ---------- top bar */
  renderTop() {
    const top = document.getElementById('top'); if (!top) return;
    top.innerHTML = `
      <div class="top-left">
        <span class="brand" aria-hidden="true"><svg viewBox="0 0 28 28"><path d="M10 4l8 10-8 10-8-10z" fill="var(--accent)"/><path d="M18 4l8 10-8 10" fill="none" stroke="var(--text-2)" stroke-width="2.2" stroke-linejoin="round"/></svg></span>
        <button class="board-switch" data-a="boards" aria-haspopup="true"><span class="bs-name"></span>${icon('down')}</button>
      </div>
      <div class="search top-search">${icon('search')}<input id="search" type="search" autocomplete="off" placeholder="${t('search.ph')}" aria-label="${t('search')}" value="${U.esc(Filter.text)}"><kbd>/</kbd></div>
      <button class="icon-btn filter-btn" data-a="filter" aria-label="${t('filter.title')}">${icon('filter')}<span class="count" hidden></span></button>
      <span class="grow"></span>
      <button class="sync-ind" data-a="sync"></button>
      <div class="top-avs" data-a="members"></div>
      <button class="icon-btn" data-a="theme"></button>
      <button class="icon-btn lang-btn" data-a="lang" aria-label="${t('settings.language')}"></button>
      <button class="icon-btn" data-a="settings" aria-label="${t('settings.title')}" title="${t('settings.title')}">${icon('gear')}</button>`;
    if (!top.dataset.bound) {
      top.dataset.bound = '1';
      top.addEventListener('click', e => this.onTopClick(e));
      const apply = U.debounce(v => { Filter.text = v; Filter.changed(); }, 140);
      top.addEventListener('input', e => { if (e.target.id === 'search') apply(e.target.value); });
    }
    this.updateTop();
    this.renderSync();
  },
  updateTop() {
    const top = document.getElementById('top'); if (!top) return;
    const b = Model.board();
    const bs = U.$('.bs-name', top); if (bs) bs.textContent = b ? b.name : '';
    const cnt = U.$('.filter-btn .count', top);
    if (cnt) { const n = Filter.count() - (Filter.text.trim() ? 1 : 0); cnt.hidden = !n; cnt.textContent = n; }
    U.$('.filter-btn', top)?.classList.toggle('on', Filter.active());
    const ms = Model.members(), avs = U.$('.top-avs', top);
    if (avs) avs.innerHTML = ms.slice(0, 5).map(m => UI.avatar(m, 'sm')).join('') + (ms.length > 5 ? `<span class="av sm more">+${ms.length - 5}</span>` : '');
    const th = U.$('[data-a=theme]', top);
    if (th) { const p = Prefs.get('theme'); th.innerHTML = icon(p === 'light' ? 'sun' : p === 'dark' ? 'moon' : 'contrast'); th.title = `${t('settings.theme')}: ${t('settings.' + p)}`; th.setAttribute('aria-label', th.title); }
    const lg = U.$('[data-a=lang]', top); if (lg) { lg.textContent = I18n.lang().toUpperCase(); lg.title = `${t('settings.language')}: ${Prefs.get('lang') === 'system' ? t('settings.system') + ' · ' : ''}${I18n.lang() === 'tr' ? 'Türkçe' : 'English'}`; }
    this.applyBg();
  },
  renderSync() {
    const el = U.$('#top .sync-ind'); if (!el) return;
    const st = Sync.status;
    const ic = { local: 'cloudOff', error: 'warn', offline: 'cloudOff' }[st] || 'cloud';
    el.className = `sync-ind st-${st}`;
    el.innerHTML = `${icon(ic, st === 'syncing' || st === 'connecting' ? 'spin' : '')}<span>${t('sync.st.' + st)}</span>`;
    el.title = `${t('sync.st.' + st)}${Sync.detail ? ' · ' + Sync.detail : ''}`;
  },
  async onTopClick(e) {
    const a = e.target.closest('[data-a]'); if (!a) return;
    switch (a.dataset.a) {
      case 'boards': this.boardsPop(a); break;
      case 'filter': this.filterPop(a); break;
      case 'settings': Settings.open(); break;
      case 'members': Settings.open('members'); break;
      case 'sync': {
        const st = Sync.status;
        if (st === 'needsLogin') { await Sync.start(true); this.renderSync(); }
        else Settings.open('sync');
        break;
      }
      case 'theme': {
        const order = ['system', 'light', 'dark'];
        Prefs.set('theme', order[(order.indexOf(Prefs.get('theme')) + 1) % 3]);
        this.applyTheme();
        UI.toast(`${t('settings.theme')}: ${t('settings.' + Prefs.get('theme'))}`, { timeout: 1500 });
        break;
      }
      case 'lang': Prefs.set('lang', I18n.lang() === 'tr' ? 'en' : 'tr'); I18n.apply(); this.renderAll(); break;
    }
  },
  boardsPop(anchor) {
    const cur = Model.board();
    const el = U.html(`<div class="menu boards-menu"><div class="menu-title">${t('board.switch')}</div>
      ${Model.boards().map(b => `<button class="menu-item ${b.id === cur?.id ? 'on' : ''}" data-bid="${b.id}"><span class="bg-dot" style="background:${boardBackground(b)}"></span>${U.esc(b.name)}${b.id === cur?.id ? `<span class="tick">${icon('check')}</span>` : ''}</button>`).join('')}
      <div class="menu-sep"></div>
      <button class="menu-item" data-new>${icon('plus')} ${t('board.new')}</button>
      <button class="menu-item" data-settings>${icon('gear')} ${t('board.settings')}</button></div>`);
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-bid]');
      if (b) { UI.closePopover(); Prefs.set('boardId', b.dataset.bid); Filter.clear(); this.renderAll(); return; }
      if (e.target.closest('[data-settings]')) { UI.closePopover(); Settings.open('board'); return; }
      if (e.target.closest('[data-new]')) {
        UI.closePopover();
        const name = await UI.prompt(t('board.new'), '', { placeholder: t('board.namePh'), ok: t('create') });
        if (!name) return;
        const nb = this.createBoard(name);
        Prefs.set('boardId', nb.id); this.renderAll();
      }
    });
    UI.pop(anchor, el);
  },
  filterPop(anchor) {
    const b = Model.board();
    const chip = (set, v, label, color) => `<button class="chip ${set.has(v) ? 'on' : ''}" data-set="${set === Filter.labels ? 'labels' : set === Filter.members ? 'members' : set === Filter.priorities ? 'priorities' : 'types'}" data-v="${v}" ${color ? `style="--c:${color}"` : ''}>${color ? '<i></i>' : ''}${U.esc(label)}</button>`;
    const html = () => `<div class="menu filter-menu">
      <div class="menu-title">${t('filter.title')}${Filter.active() ? `<button class="link sm" data-clear>${t('filter.clear')}</button>` : ''}</div>
      <div class="fsec"><h5>${t('filter.status')}</h5><div class="chips">${['all', 'open', 'done', 'overdue', 'nodate'].map(s => `<button class="chip ${Filter.status === s ? 'on' : ''}" data-status="${s}">${t('filter.st.' + s)}</button>`).join('')}</div></div>
      <div class="fsec"><h5>${t('card.labels')}</h5><div class="chips">${Model.labels(b.id).map(l => chip(Filter.labels, l.id, l.name, U.safeColor(l.color, '#888'))).join('') || `<span class="hint">${t('labels.none')}</span>`}</div></div>
      <div class="fsec"><h5>${t('card.members')}</h5><div class="chips">${Model.members().map(m => chip(Filter.members, m.id, m.name, U.safeColor(m.color, '#888'))).join('')}${chip(Filter.members, 'none', t('gantt.unassigned'))}</div></div>
      <div class="fsec"><h5>${t('card.priority')}</h5><div class="chips">${PRIORITIES.map(p => chip(Filter.priorities, p, t('prio.' + p), PRIORITY_COLOR[p])).join('')}</div></div>
      <div class="fsec"><h5>${t('card.type')}</h5><div class="chips">${CARD_TYPES.map(x => chip(Filter.types, x, t('type.' + x))).join('')}</div></div>
      <p class="hint">${t('filter.searchHint')}</p></div>`;
    const pop = UI.pop(anchor, html(), { align: 'start' });
    pop.el.addEventListener('click', e => {
      if (e.target.closest('[data-clear]')) { Filter.clear(); const s = U.$('#search'); if (s) s.value = ''; }
      const st = e.target.closest('[data-status]'); if (st) { Filter.status = st.dataset.status; Filter.changed(); }
      const c = e.target.closest('[data-set]');
      if (c) { const set = Filter[c.dataset.set]; set.has(c.dataset.v) ? set.delete(c.dataset.v) : set.add(c.dataset.v); Filter.changed(); }
      pop.el.innerHTML = html();
    });
  },

  /* ---------- dock + views */
  renderDock() {
    const dock = document.getElementById('dock'); if (!dock) return;
    dock.innerHTML = Object.keys(VIEWS).map((k, i) => `<button class="dock-btn ${this.viewKey === k ? 'on' : ''}" data-view="${k}" title="${t('view.' + k)} (${i + 1})" ${this.viewKey === k ? 'aria-current="page"' : ''}>${icon(VIEW_ICONS[k])}<span>${t('view.' + k)}</span></button>`).join('');
    if (!dock.dataset.bound) { dock.dataset.bound = '1'; dock.addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) this.show(b.dataset.view); }); }
  },
  show(key) {
    UI.closePopover();
    this.viewKey = key;
    Prefs.set('view', key);
    const old = document.getElementById('view');
    const el = document.createElement('div');
    el.id = 'view';
    old.replaceWith(el);
    this.view = VIEWS[key];
    this.view.mount(el);
    this.renderDock();
    this.applyBg();
  },
  renderView() {
    if (!this.view) return;
    if (this.view.busy()) { this.stale = true; return; }
    this.stale = false;
    this.view.render();
  },
  flushStale() { if (this.stale && this.view && !this.view.busy()) this.renderView(); },
  schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      if (!Store.get(Prefs.get('boardId'))) { const f = Model.boards()[0]; if (f) Prefs.set('boardId', f.id); }
      this.updateTop();
      this.renderView();
    });
  },
  renderAll() {
    this.renderTop();
    this.renderDock();
    this.show(this.viewKey || 'board');
  },

  onKey(e) {
    const typing = e.target.closest('input, textarea, select, [contenteditable]');
    if (typing || e.ctrlKey || e.metaKey || e.altKey || UI.top) return;
    if (e.key === '/') { e.preventDefault(); U.$('#search')?.focus(); return; }
    const n = +e.key;
    if (n >= 1 && n <= Object.keys(VIEWS).length) { e.preventDefault(); this.show(Object.keys(VIEWS)[n - 1]); }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
