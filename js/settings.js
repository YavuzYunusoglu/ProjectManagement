'use strict';
/* Settings dialog: appearance, board, members, labels, sync, data. */
const BG_PRESETS = {
  dusk: 'linear-gradient(135deg,#1f2a48 0%,#3b2552 55%,#5a2a3c 100%)',
  grape: 'linear-gradient(140deg,#21173a 0%,#4a3480 100%)',
  ocean: 'linear-gradient(135deg,#0b2f3f 0%,#0f6470 100%)',
  forest: 'linear-gradient(135deg,#10261f 0%,#2b5a3e 100%)',
  ember: 'linear-gradient(135deg,#2b1610 0%,#7c3413 100%)',
  slate: '#272c38',
  pixel: 'repeating-conic-gradient(#242a3a 0 25%,#1d2230 0 50%) 0 0/28px 28px',
  blueprint: 'linear-gradient(rgba(140,180,255,.13) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,rgba(140,180,255,.13) 1px,transparent 1px) 0 0/28px 28px,#163050',
  sand: 'linear-gradient(135deg,#efe3cf 0%,#d9c09c 100%)',
  sky: 'linear-gradient(135deg,#cfe0f6 0%,#9fbde6 100%)',
  mint: 'linear-gradient(135deg,#dcefe3 0%,#a9d6bb 100%)',
  paper: '#e4e8ef',
};
function boardBackground(b) {
  const bg = b?.background || { type: 'preset', value: 'dusk' };
  if (bg.type === 'color') return U.safeColor(bg.value, '#272c38');
  if (bg.type === 'image' && /^(https?:|data:image\/)/.test(bg.value || '')) return `center/cover no-repeat url("${String(bg.value).replace(/["\\]/g, '')}"), #222`;
  return BG_PRESETS[bg.value] || BG_PRESETS.dusk;
}

const Settings = {
  m: null, tab: 'general',
  open(tab = 'general') {
    this.tab = tab;
    if (this.m) this.m.close();
    this.m = UI.modal({ title: t('settings.title'), cls: 'settings-modal', body: '<div class="settings"></div>', onClose: () => { this.unsub && this.unsub(); this.unsubSync && this.unsubSync(); this.m = null; } });
    this.root = this.m.body.firstElementChild;
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('change', e => this.onChange(e));
    this.unsub = Store.subscribe(() => { const a = document.activeElement; if (!(a && this.root.contains(a) && a.matches('input:not([type=checkbox]):not([type=radio]),textarea'))) this.render(); });
    this.unsubSync = Sync.subscribe(() => { if (this.tab === 'sync') this.render(); });
    this.render();
  },
  render() {
    const tabs = ['general', 'board', 'members', 'labels', 'sync', 'data'];
    const icons = { general: 'contrast', board: 'image', members: 'users', labels: 'tag', sync: 'cloud', data: 'archive' };
    this.root.innerHTML = `<nav class="settings-nav" role="tablist">${tabs.map(k => `<button role="tab" class="snav ${this.tab === k ? 'on' : ''}" data-tab="${k}">${icon(icons[k])}<span>${t('settings.' + k)}</span></button>`).join('')}</nav>
      <div class="settings-pane">${this['pane_' + this.tab]()}</div>`;
  },
  radio(name, val, opts) {
    return `<div class="seg">${opts.map(([v, label]) => `<label class="seg-btn ${val === v ? 'on' : ''}"><input type="radio" name="${name}" value="${v}" ${val === v ? 'checked' : ''}>${label}</label>`).join('')}</div>`;
  },
  pane_general() {
    const opt = (v, label, cur) => `<option value="${U.esc(v)}" ${v === (cur || '') ? 'selected' : ''}>${U.esc(label)}</option>`;
    return `<h3>${t('settings.general')}</h3>
      <div class="field"><span class="field-label">${t('settings.theme')}</span>${this.radio('theme', Prefs.get('theme'), [['system', t('settings.system')], ['light', t('settings.light')], ['dark', t('settings.dark')]])}</div>
      <div class="field"><span class="field-label">${t('settings.language')}</span>${this.radio('lang', Prefs.get('lang'), [['system', t('settings.system')], ['tr', 'Türkçe'], ['en', 'English']])}</div>
      <label class="field">${t('settings.me')}<select class="input" data-s="me">${opt('', '—', Prefs.get('me'))}${Model.members().map(m => opt(m.id, m.name, Prefs.get('me'))).join('')}</select><span class="hint">${t('settings.meHint')}</span></label>
      <div class="field"><span class="field-label">${t('settings.shortcuts')}</span>
        <ul class="kbd-list"><li><kbd>/</kbd> ${t('kbd.search')}</li><li><kbd>1</kbd>–<kbd>7</kbd> ${t('kbd.views')}</li><li><kbd>Esc</kbd> ${t('kbd.close')}</li><li><kbd>Ctrl</kbd>+<kbd>Enter</kbd> ${t('kbd.save')}</li></ul></div>
      <div class="field about"><span class="field-label">${t('about.title')}</span>
        <p class="notice">${icon('sparkle')} <span>${t('about.ai')}</span></p></div>`;
  },
  pane_board() {
    const b = Model.board(); if (!b) return '';
    const bg = b.background || { type: 'preset', value: 'dusk' };
    return `<h3>${t('settings.board')}</h3>
      <div class="form-grid two">
        <label class="field">${t('board.name')}<input class="input" data-b="name" value="${U.esc(b.name)}"></label>
        <label class="field">${t('board.prefix')}<input class="input mono" data-b="prefix" maxlength="5" value="${U.esc(b.prefix || '')}"><span class="hint">${t('board.prefixHint')}</span></label>
      </div>
      <div class="field"><span class="field-label">${t('board.background')}</span>
        <div class="bg-grid">${Object.keys(BG_PRESETS).map(k => `<button class="bg-sw ${bg.type === 'preset' && bg.value === k ? 'on' : ''}" data-bg="${k}" style="background:${BG_PRESETS[k]}" aria-label="${k}" title="${k}"></button>`).join('')}</div>
        <div class="row wrap gap">
          <label class="btn sm ghost color-pick">${icon('palette')} ${t('board.bgColor')}<input type="color" data-bgcolor value="${bg.type === 'color' ? bg.value : '#2b3140'}"></label>
          <button class="btn sm ghost" data-a="bg-url">${icon('link')} ${t('board.bgUrl')}</button>
          <button class="btn sm ghost" data-a="bg-upload">${icon('upload')} ${t('board.bgUpload')}</button>
        </div>
        <span class="hint">${t('board.bgHint')}</span>
      </div>
      <div class="field danger-zone"><span class="field-label">${t('board.danger')}</span><button class="btn sm danger" data-a="board-delete">${icon('trash')} ${t('board.delete')}</button></div>`;
  },
  pane_members() {
    return `<h3>${t('settings.members')}</h3><p class="hint">${t('members.hint')}</p>
      <div class="ent-list">${Model.members().map(m => `<div class="ent-row" data-mid="${m.id}">
        ${UI.avatar(m)}
        <input class="input" data-mf="name" value="${U.esc(m.name)}" aria-label="${t('members.name')}">
        <input class="input mono w-xs" data-mf="initials" maxlength="3" value="${U.esc(m.initials || '')}" aria-label="${t('members.initials')}">
        <label class="cap-field"><input class="input mono w-xs" type="number" min="0" max="80" data-mf="capacity" value="${m.capacity ?? 20}" aria-label="${t('members.capacity')}"><span>${t('hoursShort')}/${t('work.weekShort')}</span></label>
        <button class="sw" style="--c:${U.safeColor(m.color, '#5B9CF2')}" data-a="m-color" aria-label="${t('color')}"></button>
        <button class="icon-btn" data-a="m-del" aria-label="${t('delete')}">${icon('trash')}</button></div>`).join('')}</div>
      <div class="row gap"><input class="input" data-new-member placeholder="${t('members.namePh')}"><button class="btn primary" data-a="m-add">${icon('plus')} ${t('members.add')}</button></div>`;
  },
  pane_labels() {
    const b = Model.board();
    return `<h3>${t('settings.labels')}</h3><p class="hint">${t('labels.hint')}</p>
      <div class="ent-list">${Model.labels(b.id).map(l => {
        const n = Store.all('card', c => (c.labelIds || []).includes(l.id)).length;
        return `<div class="ent-row" data-lid="${l.id}">
        <span class="lbl lg" style="--c:${U.safeColor(l.color, '#888')}">${U.esc(l.name)}</span>
        <input class="input" data-lf="name" value="${U.esc(l.name)}" aria-label="${t('labels.name')}">
        <span class="muted mono">${n}</span>
        <button class="sw" style="--c:${U.safeColor(l.color, '#888')}" data-a="l-color" aria-label="${t('color')}"></button>
        <button class="icon-btn" data-a="l-filter" aria-label="${t('labels.filterBy')}" title="${t('labels.filterBy')}">${icon('filter')}</button>
        <button class="icon-btn" data-a="l-del" aria-label="${t('delete')}">${icon('trash')}</button></div>`;
      }).join('')}</div>
      <div class="row gap"><input class="input" data-new-label placeholder="${t('labels.namePh')}"><button class="btn primary" data-a="l-add">${icon('plus')} ${t('labels.create')}</button></div>`;
  },
  pane_sync() {
    const s = Prefs.get('sync'), p = s.provider;
    const st = Sync.status;
    const statusLine = `<div class="sync-status st-${st}">${icon(st === 'local' ? 'cloudOff' : 'cloud')}<span><strong>${t('sync.st.' + st)}</strong>${Sync.detail ? ` · ${U.esc(Sync.detail)}` : ''}</span></div>`;
    let body = '';
    if (p === 'drive') {
      const keys = s.team
        ? `<p class="notice ok">${icon('check')} <span>${t('sync.dr.teamKeys')}</span></p>`
        : `<label class="field">${t('sync.dr.clientId')}<input class="input mono" data-sf="drive.clientId" value="${U.esc(s.drive.clientId)}" placeholder="1234…apps.googleusercontent.com"></label>
        <div class="form-grid two">
          <label class="field">${t('sync.dr.apiKey')}<input class="input mono" data-sf="drive.apiKey" value="${U.esc(s.drive.apiKey)}" placeholder="AIza…"></label>
          <label class="field">${t('sync.dr.appId')}<input class="input mono" data-sf="drive.appId" value="${U.esc(s.drive.appId)}" placeholder="123456789012"></label>
        </div>
        <span class="hint">${t('sync.dr.keysHint')}</span>`;
      body = `${keys}
        <div class="field"><span class="field-label">${t('sync.dr.file')}</span>
          ${s.drive.fileId ? `<div class="file-row">${icon('file')}<span><strong>${U.esc(s.drive.fileName || 'data.json')}</strong><small class="mono">${U.esc(s.drive.fileId)}</small></span><button class="btn sm ghost" data-a="dr-forget">${t('sync.dr.forget')}</button></div>`
          : `<div class="row wrap gap"><button class="btn sm" data-a="dr-create">${icon('plus')} ${t('sync.dr.create')}</button><button class="btn sm" data-a="dr-pick">${icon('search')} ${t('sync.dr.pick')}</button><button class="btn sm ghost" data-a="dr-paste">${icon('edit')} ${t('sync.dr.paste')}</button></div><span class="hint">${t('sync.dr.fileHint')}</span>`}
        </div>
        <div class="row gap">${st === 'synced' || st === 'syncing' ? `<button class="btn" data-a="sync-now">${icon('refresh')} ${t('sync.now')}</button><button class="btn" data-a="sync-signout">${icon('logout')} ${t('sync.signOut')}</button>` : `<button class="btn primary" data-a="sync-connect">${icon('cloud')} ${t('sync.connectGoogle')}</button>`}</div>`;
    } else {
      body = `<p class="hint">${t('sync.localHint')}</p>`;
    }
    return `<h3>${t('settings.sync')}</h3>
      ${s.team ? '' : this.radio('provider', p, [['none', t('sync.p.none')], ['drive', 'Google Drive']])}
      ${p !== 'none' ? statusLine : ''}
      <div class="sync-body">${body}</div>
      <details class="sync-help"><summary>${icon('info')} ${t('sync.how')}</summary>
        <div class="md">${MD.render(t('sync.howText'))}</div></details>
      <p class="hint">${t('sync.readme')} <code>README.md</code></p>`;
  },
  pane_data() {
    return `<h3>${t('settings.data')}</h3>
      <div class="data-actions">
        <button class="data-btn" data-a="export-json">${icon('download')}<span><strong>${t('data.export')}</strong><small>${t('data.exportHint')}</small></span></button>
        <button class="data-btn" data-a="import-json">${icon('upload')}<span><strong>${t('data.import')}</strong><small>${t('data.importHint')}</small></span></button>
        <button class="data-btn" data-a="import-trello">${icon('board')}<span><strong>${t('data.trello')}</strong><small>${t('data.trelloHint')}</small></span></button>
        <button class="data-btn" data-a="demo">${icon('sparkle')}<span><strong>${t('data.demo')}</strong><small>${t('data.demoHint')}</small></span></button>
        <button class="data-btn danger" data-a="wipe">${icon('trash')}<span><strong>${t('data.wipe')}</strong><small>${t('data.wipeHint')}</small></span></button>
      </div>`;
  },

  onChange(e) {
    const el = e.target;
    if (el.name === 'theme') { Prefs.set('theme', el.value); App.applyTheme(); this.render(); return; }
    if (el.name === 'lang') { Prefs.set('lang', el.value); I18n.apply(); App.renderAll(); this.render(); return; }
    if (el.name === 'provider') { Sync.stop(); Prefs.patch('sync', { provider: el.value }); this.render(); App.renderTop(); return; }
    if (el.dataset.s === 'me') { Prefs.set('me', el.value || null); App.renderTop(); return; }
    if (el.dataset.b) {
      const b = Model.board(), v = el.value.trim();
      if (el.dataset.b === 'prefix') Store.update(b.id, { prefix: v.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PM' });
      else if (v) Store.update(b.id, { name: v });
      return;
    }
    if (el.dataset.bgcolor !== undefined) { Store.update(Model.board().id, { background: { type: 'color', value: el.value } }); return; }
    if (el.dataset.mf) {
      const id = el.closest('[data-mid]').dataset.mid, k = el.dataset.mf;
      const v = k === 'capacity' ? Math.max(0, +el.value || 0) : el.value.trim();
      if (k === 'name' && !v) return;
      Store.update(id, { [k]: k === 'initials' ? v.toLocaleUpperCase(I18n.locale()) : v });
      return;
    }
    if (el.dataset.lf) { const v = el.value.trim(); if (v) Store.update(el.closest('[data-lid]').dataset.lid, { name: v }); return; }
    if (el.dataset.sf) {
      const [grp, k] = el.dataset.sf.split('.');
      const s = Prefs.get('sync');
      Prefs.patch('sync', { [grp]: { ...s[grp], [k]: el.value.trim() } });
    }
  },
  colorPop(anchor, cur, onPick) {
    const el = U.html(`<div class="menu">${UI.swatches(cur)}</div>`);
    el.addEventListener('click', e => { const s = e.target.closest('[data-color]'); if (s) { UI.closePopover(); onPick(s.dataset.color); } });
    UI.pop(anchor, el);
  },
  async onClick(e) {
    const tab = e.target.closest('[data-tab]');
    if (tab) { this.tab = tab.dataset.tab; this.render(); return; }
    const bg = e.target.closest('[data-bg]');
    if (bg) { Store.update(Model.board().id, { background: { type: 'preset', value: bg.dataset.bg } }); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const b = Model.board();
    const act = a.dataset.a;
    try {
      switch (act) {
        case 'bg-url': {
          const url = await UI.prompt(t('board.bgUrl'), b.background?.type === 'image' && !b.background.value.startsWith('data:') ? b.background.value : '', { placeholder: 'https://…' });
          if (url && /^https?:\/\//.test(url)) Store.update(b.id, { background: { type: 'image', value: url } });
          break;
        }
        case 'bg-upload': {
          const f = await U.pickFile('image/*'); if (!f) break;
          const data = await U.shrinkImage(f, 1920, 0.72);
          if (data.length > 700000) { UI.toast(t('board.bgTooBig'), { kind: 'err' }); break; }
          Store.update(b.id, { background: { type: 'image', value: data } });
          break;
        }
        case 'board-delete': {
          if (Model.boards().length < 2) { UI.toast(t('board.lastOne'), { kind: 'err' }); break; }
          if (!(await UI.confirm(t('board.deleteConfirm', { name: b.name }), { ok: t('delete'), danger: true }))) break;
          Store.remove(b.id);
          Prefs.set('boardId', Model.boards()[0]?.id);
          this.m.close(); App.renderAll();
          break;
        }
        case 'm-add': {
          const inp = U.$('[data-new-member]', this.root), name = inp.value.trim();
          if (!name) { inp.focus(); break; }
          const used = Model.members().map(m => m.color);
          Store.create('member', { name, initials: U.initials(name), color: COLORS.find(c => !used.includes(c)) || COLORS[used.length % COLORS.length], pos: Model.nextPos(Model.members()), capacity: 20 });
          break;
        }
        case 'm-color': { const id = a.closest('[data-mid]').dataset.mid; this.colorPop(a, Store.get(id).color, c => Store.update(id, { color: c })); break; }
        case 'm-del': {
          const id = a.closest('[data-mid]').dataset.mid;
          if (await UI.confirm(t('members.deleteConfirm', { name: Store.get(id).name }), { ok: t('delete'), danger: true })) {
            Store.remove(id);
            Store.all('card', c => (c.memberIds || []).includes(id)).forEach(c => Store.update(c.id, { memberIds: c.memberIds.filter(x => x !== id) }));
          }
          break;
        }
        case 'l-add': {
          const inp = U.$('[data-new-label]', this.root), name = inp.value.trim();
          if (!name) { inp.focus(); break; }
          Store.create('label', { boardId: b.id, name, color: COLORS[Model.labels(b.id).length % COLORS.length], pos: Model.nextPos(Model.labels(b.id)) });
          break;
        }
        case 'l-color': { const id = a.closest('[data-lid]').dataset.lid; this.colorPop(a, Store.get(id).color, c => Store.update(id, { color: c })); break; }
        case 'l-filter': { const id = a.closest('[data-lid]').dataset.lid; Filter.clear(); Filter.labels.add(id); Filter.changed(); this.m.close(); break; }
        case 'l-del': {
          const id = a.closest('[data-lid]').dataset.lid;
          if (await UI.confirm(t('labels.deleteConfirm', { name: Store.get(id).name }), { ok: t('delete'), danger: true })) {
            Store.remove(id);
            Store.all('card', c => (c.labelIds || []).includes(id)).forEach(c => Store.update(c.id, { labelIds: c.labelIds.filter(x => x !== id) }));
          }
          break;
        }
        case 'sync-connect': await Sync.start(true); App.renderTop(); break;
        case 'sync-signout': await Sync.signOut(); App.renderTop(); this.render(); break;
        case 'sync-now': Sync.now(); break;
        case 'dr-create': case 'dr-pick': case 'dr-paste': {
          if (!Prefs.get('sync').drive.clientId) { UI.toast(t('sync.noClientId'), { kind: 'err' }); break; }
          if (!Sync.drive.token) { await U.loadScript('https://accounts.google.com/gsi/client'); await Sync.drive.signIn(); }
          if (act === 'dr-create') { await Sync.drive.createFile(); UI.toast(t('sync.dr.created')); }
          else if (act === 'dr-pick') { if (!(await Sync.drive.pickFile())) break; }
          else {
            const id = await UI.prompt(t('sync.dr.paste'), '', { placeholder: '1AbC…' });
            if (!id) break;
            const fid = (id.match(/[-\w]{25,}/) || [id])[0];
            Prefs.patch('sync', { drive: { ...Prefs.get('sync').drive, fileId: fid, fileName: '' } });
          }
          await Sync.start(true);
          App.renderTop(); this.render();
          break;
        }
        case 'dr-forget': Sync.stop(); Prefs.patch('sync', { drive: { ...Prefs.get('sync').drive, fileId: '', fileName: '' } }); this.render(); App.renderTop(); break;
        case 'export-json': {
          const data = { app: 'gamedev-pm', v: 1, exportedAt: new Date().toISOString(), entities: Store.raw() };
          U.download(`gamedev-pm-${U.today()}.json`, JSON.stringify(data, null, 1), 'application/json');
          break;
        }
        case 'import-json': {
          const f = await U.pickFile('.json,application/json'); if (!f) break;
          const d = JSON.parse(await U.readText(f));
          const ents = Object.values(d.entities || {}).filter(x => x && x.id && x.type && !x.deleted);
          if (!ents.length) { UI.toast(t('data.importEmpty'), { kind: 'err' }); break; }
          const mode = await UI.choice(t('data.import'), t('data.importAsk', { n: ents.length }), [
            { value: 'merge', label: t('data.merge'), hint: t('data.mergeHint'), primary: true },
            { value: 'replace', label: t('data.replace'), hint: t('data.replaceHint') }]);
          if (!mode) break;
          if (mode === 'replace') { const keep = new Set(ents.map(x => x.id)); Object.values(Store.raw()).filter(x => !x.deleted && !keep.has(x.id)).forEach(x => Store.remove(x.id)); }
          ents.forEach(x => Store.put(x));
          if (!Store.get(Prefs.get('boardId'))) Prefs.set('boardId', Model.boards()[0]?.id);
          UI.toast(t('data.imported', { n: ents.length }));
          App.renderAll();
          break;
        }
        case 'import-trello': {
          const f = await U.pickFile('.json,application/json'); if (!f) break;
          const d = JSON.parse(await U.readText(f));
          if (!Array.isArray(d.cards) || !Array.isArray(d.lists)) { UI.toast(t('data.trelloBad'), { kind: 'err' }); break; }
          const r = importTrello(d);
          UI.toast(t('data.trelloDone', { name: r.board.name, n: r.cards }));
          this.m.close(); App.renderAll();
          break;
        }
        case 'demo': seedDemo(); this.m.close(); App.renderAll(); UI.toast(t('data.demoDone')); break;
        case 'wipe': {
          if (!(await UI.confirm(t('data.wipeConfirm'), { ok: t('data.wipe'), danger: true }))) break;
          Object.values(Store.raw()).filter(x => !x.deleted).forEach(x => Store.remove(x.id));
          const nb = Store.create('board', { name: t('board.defaultName'), prefix: 'PM', pos: 1024, background: { type: 'preset', value: 'dusk' } });
          ['todo', 'doing', 'done'].forEach((k, i) => Store.create('list', { boardId: nb.id, name: t('list.default.' + k), pos: (i + 1) * 1024 }));
          Prefs.set('boardId', nb.id);
          this.m.close(); App.renderAll();
          break;
        }
      }
    } catch (err) {
      UI.toast(err.message || String(err), { kind: 'err' });
    }
  },
};
