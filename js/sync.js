'use strict';
/*
 * Cloud sync through Google Drive: one JSON file, polled every 15 s; merge-then-upload.
 * Relies on Store's per-entity last-writer-wins merge, so a lost race heals
 * itself on the next cycle (the newer local copy is pushed again).
 */
const Sync = (() => {
  let adapter = null;
  let status = 'local', detail = '';
  const subs = new Set();
  const setStatus = (s, d = '') => { status = s; detail = d; subs.forEach(f => f()); };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* Connection log: kept in localStorage so it survives a reload and can be copied for debugging. */
  const LOG_KEY = 'gdpm.synclog';
  let logItems = [];
  try { logItems = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { logItems = []; }
  function log(level, step, msg, code = '') {
    logItems.push({ at: Date.now(), level, step, code: String(code || ''), msg: String(msg || '') });
    if (logItems.length > 60) logItems = logItems.slice(-60);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logItems)); } catch { /* ignore */ }
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)(`[Sync] ${step}${code ? ' [' + code + ']' : ''}: ${msg}`);
    subs.forEach(f => f());
  }
  /* An Error that carries a machine-readable code, e.g. "popup_closed" or "HTTP 403 appNotAuthorizedToFile". */
  function fail(code, msg) { const e = new Error(msg || code); e.code = code; return e; }
  function hintFor(code) {
    const k = 'sync.err.' + String(code).replace(/^HTTP \d+ /, '').replace(/[^\w]/g, '');
    const v = t(k);
    return v === k ? '' : v;
  }
  function report(step, e) {
    const code = e.code || '';
    log('error', step, e.message, code);
    setStatus(navigator.onLine ? 'error' : 'offline', code ? `${code} · ${hintFor(code) || e.message}` : e.message);
  }

  async function initialMerge(remoteMap, key) {
    const s = Prefs.get('sync');
    if (s.initDone[key]) return 'merge';
    let choice = 'merge';
    const remoteHas = Object.values(remoteMap).some(e => !e.deleted);
    // Untouched sample data on a fresh device: just take the team's data, no question needed.
    if (remoteHas && Prefs.get('pristine')) choice = 'remote';
    else if (remoteHas && !Store.isEmpty()) {
      choice = await UI.choice(t('sync.firstTitle'), t('sync.firstMsg'), [
        { value: 'remote', label: t('sync.useRemote'), hint: t('sync.useRemoteHint'), primary: true },
        { value: 'merge', label: t('sync.merge'), hint: t('sync.mergeHint') },
      ]) || 'remote';
    }
    Prefs.patch('sync', { initDone: { ...Prefs.get('sync').initDone, [key]: true } });
    return choice;
  }
  function applyInitial(choice, remoteMap) {
    if (choice === 'remote') Store.replaceAll(Object.values(remoteMap));
    else Store.applyRemote(Object.values(remoteMap));
  }

  /* ---------------- Google Drive ---------------- */
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3/files/';
  const UP = 'https://www.googleapis.com/upload/drive/v3/files';
  const DriveAdapter = {
    ready: false, token: null, exp: 0, version: null, remote: {}, chain: Promise.resolve(), timer: null,
    conf() { return Prefs.get('sync').drive; },
    async start(interactive) {
      const c = this.conf();
      if (!c.clientId) throw fail('no_client_id', t('sync.noClientId'));
      setStatus('connecting');
      log('info', 'start', `origin=${location.origin} clientId=…${c.clientId.slice(-30)} file=${c.fileId || '—'} interactive=${interactive}`);
      await this.loadGis();
      if (!this.tokenValid()) {
        if (!interactive) { setStatus('needsLogin'); log('info', 'start', 'no valid sign-in, waiting for Connect'); return; }
        await this.signIn();
      }
      if (!c.fileId) { setStatus('needsFile'); log('info', 'start', 'signed in, no data file chosen yet'); return; }
      let remote;
      try { remote = await this.download(); }
      catch (e) {
        // drive.file only sees files this person created or picked once with the Picker.
        if (/^HTTP (403|404)/.test(e.code || '')) { log('warn', 'download', e.message, e.code); setStatus('needsFile', `${e.code} · ${t('sync.dr.needPick')}`); return; }
        throw e;
      }
      this.version = (await this.meta()).version;
      log('info', 'download', `${Object.keys(remote).length} records, version ${this.version}`);
      applyInitial(await initialMerge(remote, 'drive:' + c.fileId), remote);
      this.remote = remote;
      this.ready = true;
      setStatus('synced', c.fileName);
      log('info', 'start', 'connected');
      this.sync();
      this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.sync(); }, 15000);
      this.onVis = () => { if (document.visibilityState === 'visible') this.sync(); };
      document.addEventListener('visibilitychange', this.onVis);
    },
    signIn() {
      const c = this.conf();
      return new Promise((res, rej) => {
        let done = false, closedTimer = null;
        const finish = (fn, v) => { if (done) return; done = true; clearTimeout(closedTimer); fn(v); };
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: c.clientId, scope: SCOPE,
          callback: r => {
            if (r.error) return finish(rej, fail(r.error, r.error_description || r.error));
            if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return finish(rej, fail('scope_not_granted', t('sync.err.scope_not_granted')));
            this.token = r.access_token; this.exp = Date.now() + (r.expires_in - 60) * 1000;
            sessionStorage.setItem('gdpm.dtok', JSON.stringify({ token: this.token, exp: this.exp, cid: c.clientId }));
            log('info', 'signin', `token received (valid ${Math.round(r.expires_in / 60)} min)`);
            finish(res);
          },
          error_callback: e => {
            const type = (e && e.type) || 'unknown';
            log('warn', 'signin', (e && e.message) || type, type);
            // Browsers that isolate the Google popup (Cross-Origin-Opener-Policy) can report
            // "popup_closed" even though the person approved; the token still arrives a moment later.
            // So wait a little before treating it as a real cancel.
            if (type === 'popup_closed') {
              closedTimer = setTimeout(() => finish(rej, fail('popup_closed', t('sync.popupClosed'))), 15000);
              return;
            }
            finish(rej, fail(type, type === 'popup_failed_to_open' ? t('popupBlocked') : (e && e.message) || type));
          },
        });
        log('info', 'signin', 'opening Google sign-in window');
        tc.requestAccessToken({ prompt: '' });
      });
    },
    loadGis() {
      return U.loadScript('https://accounts.google.com/gsi/client')
        .catch(() => { throw fail('gsi_load_failed', t('sync.err.gsi_load_failed')); });
    },
    tokenValid() {
      if (this.token && Date.now() < this.exp) return true;
      try {
        const saved = JSON.parse(sessionStorage.getItem('gdpm.dtok') || 'null');
        if (saved && saved.exp > Date.now() + 60000 && saved.cid === this.conf().clientId) { this.token = saved.token; this.exp = saved.exp; return true; }
      } catch { /* ignore */ }
      this.token = null;
      return false;
    },
    /* Sign in only when needed. Call it from a click so the browser allows the popup. */
    async ensureToken() { if (!this.tokenValid()) { await this.loadGis(); await this.signIn(); } },
    async api(url, opts = {}) {
      if (!this.tokenValid()) { this.ready = false; setStatus('needsLogin'); log('warn', 'api', 'sign-in expired', 'token_expired'); throw fail('auth', t('sync.err.token_expired')); }
      let r;
      try { r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + this.token, ...(opts.headers || {}) } }); }
      catch (e) { throw fail('network', `${t('sync.err.network')} (${e.message})`); }
      if (r.ok) return r;
      let reason = '', message = '';
      const text = await r.text();
      try { const j = JSON.parse(text).error || {}; reason = (j.errors && j.errors[0] && j.errors[0].reason) || j.status || ''; message = j.message || ''; } catch { message = text.slice(0, 200); }
      const code = `HTTP ${r.status}${reason ? ' ' + reason : ''}`;
      if (r.status === 401) {
        this.token = null; this.ready = false; sessionStorage.removeItem('gdpm.dtok'); setStatus('needsLogin');
        log('warn', 'api', message, code);
        throw fail('auth', t('sync.err.token_expired'));
      }
      throw fail(code, message || code);
    },
    async meta() { return (await this.api(`${API}${this.conf().fileId}?fields=version,name&supportsAllDrives=true`)).json(); },
    async download() {
      const txt = await (await this.api(`${API}${this.conf().fileId}?alt=media&supportsAllDrives=true`)).text();
      if (!txt.trim()) return {};
      let d;
      try { d = JSON.parse(txt); } catch { throw fail('bad_file', t('sync.err.bad_file')); }
      return d.entities || {};
    },
    async upload() {
      const body = JSON.stringify({ app: 'gamedev-pm', v: 1, savedAt: new Date().toISOString(), entities: Store.raw() });
      const r = await this.api(`${UP}/${this.conf().fileId}?uploadType=media&fields=version&supportsAllDrives=true`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
      });
      return (await r.json()).version;
    },
    async cycle() {
      if (!this.ready) return;
      const m = await this.meta();
      if (m.version !== this.version) {
        this.remote = await this.download();
        this.version = m.version;
        Store.applyRemote(Object.values(this.remote));
      }
      const up = Store.newerThan(this.remote);
      if (up.length) {
        setStatus('syncing', this.conf().fileName);
        this.version = await this.upload();
        this.remote = clone(Store.raw());
        log('info', 'upload', `${up.length} changed records, version ${this.version}`);
      }
      setStatus('synced', this.conf().fileName);
    },
    sync() {
      this.chain = this.chain.then(() => this.cycle()).catch(e => { if (e.code !== 'auth') report('sync', e); });
      return this.chain;
    },
    queue() {
      if (!this.ready) return;
      setStatus('syncing', this.conf().fileName);
      clearTimeout(this.qt);
      this.qt = setTimeout(() => this.sync(), 1500);
    },
    async createFile() {
      const meta = { name: 'gamedev-pm-data.json', mimeType: 'application/json' };
      const bnd = 'gdpm' + Date.now();
      const body = `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bnd}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ app: 'gamedev-pm', v: 1, entities: Store.raw() })}\r\n--${bnd}--`;
      const r = await this.api(`${UP}?uploadType=multipart&fields=id,name`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bnd }, body });
      const f = await r.json();
      log('info', 'create', `created ${f.name} (${f.id})`);
      Prefs.patch('sync', { drive: { ...this.conf(), fileId: f.id, fileName: f.name }, initDone: { ...Prefs.get('sync').initDone, ['drive:' + f.id]: true } });
      return f;
    },
    async pickFile() {
      const c = this.conf();
      if (!c.apiKey || !c.appId) throw fail('picker_keys_missing', t('sync.pickerNeeds'));
      await U.loadScript('https://apis.google.com/js/api.js').catch(() => { throw fail('gapi_load_failed', t('sync.err.gsi_load_failed')); });
      await new Promise((res, rej) => gapi.load('picker', { callback: res, onerror: () => rej(fail('picker_load_failed', t('sync.err.picker_load_failed'))) }));
      log('info', 'picker', 'opening Drive file picker');
      const f = await new Promise(res => {
        const mine = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes('application/json').setMode(google.picker.DocsViewMode.LIST);
        const shared = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes('application/json').setOwnedByMe(false).setMode(google.picker.DocsViewMode.LIST);
        new google.picker.PickerBuilder().addView(mine).addView(shared)
          .setOAuthToken(this.token).setDeveloperKey(c.apiKey).setAppId(c.appId).setOrigin(location.protocol + "//" + location.host)
          .setCallback(d => {
            if (d.action === google.picker.Action.PICKED) res({ id: d.docs[0].id, name: d.docs[0].name });
            else if (d.action === google.picker.Action.CANCEL) { log('info', 'picker', 'cancelled'); res(null); }
            else if (d.action === 'error' || d.action === google.picker.Action.ERROR) { log('error', 'picker', JSON.stringify(d).slice(0, 200), 'picker_error'); res(null); }
          }).build().setVisible(true);
      });
      if (f) { log('info', 'picker', `picked ${f.name} (${f.id})`); Prefs.patch('sync', { drive: { ...c, fileId: f.id, fileName: f.name } }); }
      return f;
    },
    stop() {
      this.ready = false; clearInterval(this.timer); clearTimeout(this.qt);
      if (this.onVis) document.removeEventListener('visibilitychange', this.onVis);
    },
    async signOut() {
      this.stop();
      try { if (this.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(this.token, () => {}); } catch { /* ignore */ }
      this.token = null; sessionStorage.removeItem('gdpm.dtok');
    },
  };

  const adapters = { drive: DriveAdapter };
  window.addEventListener('online', () => { if (adapter === DriveAdapter) DriveAdapter.sync(); });

  return {
    get status() { return status; },
    get detail() { return detail; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    provider: () => Prefs.get('sync').provider,
    drive: DriveAdapter,
    async start(interactive = false) {
      if (adapter) adapter.stop();
      const p = Prefs.get('sync').provider;
      adapter = adapters[p] || null;
      if (!adapter) { setStatus('local'); return; }
      try { await adapter.start(interactive); }
      catch (e) { if (e.code !== 'auth') report('start', e); }
    },
    /* Load Google's sign-in script early so a later click can open the popup immediately. */
    preload() {
      if (this._preloaded || Prefs.get('sync').provider !== 'drive') return;
      this._preloaded = true;
      DriveAdapter.loadGis().catch(e => log('error', 'preload', e.message, e.code));
    },
    log, report,
    get logItems() { return logItems; },
    clearLog() { logItems = []; try { localStorage.removeItem(LOG_KEY); } catch { /* ignore */ } subs.forEach(f => f()); },
    async signOut() { if (adapter) await adapter.signOut(); adapter = null; setStatus('local'); },
    stop() { if (adapter) adapter.stop(); adapter = null; setStatus('local'); },
    onLocal(ids) { if (adapter && adapter.ready) adapter.queue(ids); },
    now() { if (adapter === DriveAdapter) DriveAdapter.sync(); },
  };
})();
Store.onLocal = ids => Sync.onLocal(ids);
