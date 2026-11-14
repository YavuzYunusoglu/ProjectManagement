'use strict';
/*
 * Cloud sync through Google Drive: one JSON file, polled every 15 s; merge-then-upload.
 * Relies on Store's per-entity last-writer-wins merge, so a lost race heals
 * itself on the next cycle (the newer local copy is pushed again). When two people change
 * the same item, or the file changed while this device had unsent edits, the person is asked
 * whether to keep their version or take the one in Drive.
 * The data file is found automatically (team file in config.js, the remembered file, or a search
 * of the files this app can see) and the Google sign-in renews itself on the next click.
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
      // Closing the dialog keeps everything (merge) instead of silently replacing local data.
      choice = await UI.choice(t('sync.firstTitle'), t('sync.firstMsg'), [
        { value: 'remote', label: t('sync.useRemote'), hint: t('sync.useRemoteHint'), primary: true },
        { value: 'merge', label: t('sync.merge'), hint: t('sync.mergeHint') },
      ]) || 'merge';
    }
    Prefs.patch('sync', { initDone: { ...Prefs.get('sync').initDone, [key]: true } });
    return choice;
  }
  function applyInitial(choice, remoteMap) {
    if (choice === 'remote') Store.replaceAll(Object.values(remoteMap));
    else Store.applyRemote(Object.values(remoteMap));
  }
  const entName = e => (e && (e.title || e.name || (e.text && String(e.text).slice(0, 40)))) || t('sync.anItem');

  /*
   * Merge a downloaded copy into the local data.
   * - Startup, the file changed while we were away AND this device has unsent edits → ask "keep mine / use Drive's".
   * - Someone edited the very item we also edited → ask the same question for those items.
   * - Otherwise merge silently (per item, newest edit wins).
   */
  async function reconcile(remote, { startup = false, changed = false } = {}) {
    const conflicts = Store.conflicts(remote);
    const pending = Store.newerThan(remote).length;
    if (startup && changed && pending) {
      log('info', 'merge', `file changed since last visit; ${pending} local changes, ${conflicts.length} conflicts`);
      const v = await UI.choice(t('sync.changedTitle'), t('sync.changedMsg', { n: pending, c: conflicts.length ? t('sync.changedConflicts', { c: conflicts.length }) : '' }), [
        { value: 'local', label: t('sync.keep'), hint: t('sync.keepHint'), primary: true },
        { value: 'remote', label: t('sync.replace'), hint: t('sync.replaceHint') },
      ]);
      if (v === 'remote') { Store.replaceAll(Object.values(remote)); log('info', 'merge', 'replaced local data with the Drive copy'); return; }
      if (v === 'local') Store.resolve(Store.conflicts(remote), 'local', remote);
      Store.applyRemote(Object.values(remote));
      return;
    }
    if (conflicts.length) {
      const cur = id => { const l = Store.raw()[id]; return l && !l.deleted ? l : remote[id]; };
      const names = conflicts.slice(0, 5).map(id => '• ' + entName(cur(id))).join('\n') + (conflicts.length > 5 ? '\n…' : '');
      log('info', 'merge', `${conflicts.length} conflicting items`);
      const v = await UI.choice(t('sync.conflictTitle'), t('sync.conflictMsg', { n: conflicts.length, list: names }), [
        { value: 'local', label: t('sync.keep'), hint: t('sync.keepConflictHint'), primary: true },
        { value: 'remote', label: t('sync.replace'), hint: t('sync.replaceConflictHint') },
      ]);
      // Closing the dialog falls back to "newest edit wins" below.
      if (v) Store.resolve(Store.conflicts(remote).filter(id => conflicts.includes(id)), v, remote);
    }
    const got = Store.applyRemote(Object.values(remote));
    if (startup && changed && got.length) UI.toast(t('sync.pulled', { n: got.length }), { timeout: 3000 });
  }

  /* ---------------- Google Drive ---------------- */
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UP = 'https://www.googleapis.com/upload/drive/v3/files';
  const TOKEN_KEY = 'gdpm.dtok';
  const DriveAdapter = {
    ready: false, token: null, exp: 0, version: null, remote: {}, timer: null, running: null, again: false, lastAuto: 0,
    conf() { return Prefs.get('sync').drive; },
    setDrive(patch) { Prefs.patch('sync', { drive: { ...Prefs.get('sync').drive, ...patch } }); },
    saveVersion() {
      const id = this.conf().fileId; if (!id) return;
      Prefs.patch('sync', { versions: { ...(Prefs.get('sync').versions || {}), [id]: this.version } });
    },
    async start(interactive) {
      const c = this.conf();
      if (!c.clientId) throw fail('no_client_id', t('sync.noClientId'));
      setStatus('connecting');
      log('info', 'start', `origin=${location.origin} file=${c.fileId || '—'} interactive=${interactive}`);
      await this.loadGis();
      if (!this.tokenValid()) {
        if (!interactive) {
          setStatus('needsLogin', c.email ? t('sync.autoHint') : '');
          log('info', 'start', c.email ? 'sign-in expired; renews on the next click' : 'no sign-in yet, waiting for Connect');
          return;
        }
        await this.signIn();
      }
      if (!this.conf().email) this.fetchUser();
      const f = await this.resolveFile(interactive);
      if (!f) return;
      const remote = await this.download();
      const saved = (Prefs.get('sync').versions || {})[f.id];
      log('info', 'download', `${Object.keys(remote).length} records, version ${f.version}${saved ? ` (last seen ${saved})` : ''}`);
      const key = 'drive:' + f.id;
      if (!Prefs.get('sync').initDone[key]) applyInitial(await initialMerge(remote, key), remote);
      else await reconcile(remote, { startup: true, changed: saved != null && saved !== f.version });
      this.remote = remote;
      this.version = f.version;
      this.saveVersion();
      this.ready = true;
      setStatus('synced', f.name);
      log('info', 'start', 'connected');
      this.sync();
      this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.sync(); }, 15000);
      // Coming back to the tab pulls changes; leaving it pushes pending edits right away.
      this.onVis = () => { if (this.ready) this.sync(); };
      document.addEventListener('visibilitychange', this.onVis);
    },

    /* ---- sign-in */
    signIn() {
      const c = this.conf();
      return new Promise((res, rej) => {
        let done = false, closedTimer = null;
        const finish = (fn, v) => { if (done) return; done = true; clearTimeout(closedTimer); fn(v); };
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: c.clientId, scope: SCOPE,
          // With the account known and consent already given, Google's window closes by itself.
          ...(c.email ? { login_hint: c.email } : {}),
          callback: r => {
            if (r.error) return finish(rej, fail(r.error, r.error_description || r.error));
            if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return finish(rej, fail('scope_not_granted', t('sync.err.scope_not_granted')));
            this.token = r.access_token; this.exp = Date.now() + (r.expires_in - 60) * 1000;
            try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: this.token, exp: this.exp, cid: c.clientId })); } catch { /* ignore */ }
            log('info', 'signin', `token received (valid ${Math.round(r.expires_in / 60)} min)`);
            finish(res);
          },
          error_callback: e => {
            const type = (e && e.type) || 'unknown';
            log('warn', 'signin', (e && e.message) || type, type);
            // Browsers that isolate the Google popup (Cross-Origin-Opener-Policy) can report
            // "popup_closed" even though the person approved; the token still arrives a moment later.
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
        // Kept in localStorage (not sessionStorage) so a reload or a new tab reuses it until it expires.
        const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || 'null');
        if (saved && saved.exp > Date.now() + 60000 && saved.cid === this.conf().clientId) { this.token = saved.token; this.exp = saved.exp; return true; }
      } catch { /* ignore */ }
      this.token = null;
      return false;
    },
    dropToken() { this.token = null; try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
    /* Sign in only when needed. Call it from a click so the browser allows the popup. */
    async ensureToken() { if (!this.tokenValid()) { await this.loadGis(); await this.signIn(); } },
    async fetchUser() {
      try {
        const u = (await (await this.api('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')).json()).user || {};
        if (u.emailAddress) { this.setDrive({ email: u.emailAddress }); log('info', 'signin', `account ${u.emailAddress}`); }
      } catch (e) { log('warn', 'signin', 'could not read the account: ' + e.message, e.code); }
    },

    /* ---- HTTP */
    async api(url, opts = {}) {
      if (!this.tokenValid()) { this.ready = false; setStatus('needsLogin', t('sync.autoHint')); log('warn', 'api', 'sign-in expired', 'token_expired'); throw fail('auth', t('sync.err.token_expired')); }
      let r;
      try { r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + this.token, ...(opts.headers || {}) } }); }
      catch (e) { throw fail('network', `${t('sync.err.network')} (${e.message})`); }
      if (r.ok) return r;
      let reason = '', message = '';
      const text = await r.text();
      try { const j = JSON.parse(text).error || {}; reason = (j.errors && j.errors[0] && j.errors[0].reason) || j.status || ''; message = j.message || ''; } catch { message = text.slice(0, 200); }
      const code = `HTTP ${r.status}${reason ? ' ' + reason : ''}`;
      if (r.status === 401) {
        this.dropToken(); this.ready = false; setStatus('needsLogin', t('sync.autoHint'));
        log('warn', 'api', message, code);
        throw fail('auth', t('sync.err.token_expired'));
      }
      throw fail(code, message || code);
    },
    async meta(id = this.conf().fileId) { return (await this.api(`${API}/${id}?fields=id,version,name&supportsAllDrives=true`)).json(); },
    async download() {
      const txt = await (await this.api(`${API}/${this.conf().fileId}?alt=media&supportsAllDrives=true`)).text();
      if (!txt.trim()) return {};
      let d;
      try { d = JSON.parse(txt); } catch { throw fail('bad_file', t('sync.err.bad_file')); }
      return (d && d.entities) || {};
    },
    async upload(snapshot) {
      const body = JSON.stringify({ app: 'gamedev-pm', v: 1, savedAt: new Date().toISOString(), entities: snapshot });
      const r = await this.api(`${UP}/${this.conf().fileId}?uploadType=media&fields=version&supportsAllDrives=true`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body,
      });
      return (await r.json()).version;
    },

    /* ---- finding the data file without asking */
    /* drive.file only lists files this app created or that this person opened with it once,
       so whatever comes back is one of our data files. */
    async findFiles() {
      const q = encodeURIComponent("trashed=false and mimeType='application/json'");
      const r = await this.api(`${API}?q=${q}&orderBy=modifiedTime%20desc&pageSize=20&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,modifiedTime,appProperties)`);
      const files = (await r.json()).files || [];
      const ours = f => (f.appProperties && f.appProperties.gdpm === '1') || /gamedev-pm/i.test(f.name || '');
      return [...files.filter(ours), ...files.filter(f => !ours(f))];
    },
    async resolveFile(interactive) {
      const wanted = this.conf().fileId;
      if (wanted) {
        try {
          const m = await this.meta(wanted);
          if (m.name !== this.conf().fileName) this.setDrive({ fileName: m.name });
          return m;
        } catch (e) {
          if (!/^HTTP (403|404)/.test(e.code || '')) throw e;
          log('warn', 'file', `no access to ${wanted}: ${e.message}`, e.code);
        }
      }
      let files = [];
      try { files = await this.findFiles(); } catch (e) { if (e.code === 'auth') throw e; log('warn', 'file', 'search failed: ' + e.message, e.code); }
      log('info', 'file', `found ${files.length} data file(s) in Drive`);
      let f = null;
      if (!wanted && files.length === 1) f = files[0];
      else if (!wanted && files.length > 1) {
        const id = await UI.choice(t('sync.dr.whichTitle'), t('sync.dr.whichMsg'), files.slice(0, 6).map((x, i) => ({
          value: x.id, label: x.name, hint: x.modifiedTime ? `${t('sync.dr.modified')} ${U.fmtDateTime(Date.parse(x.modifiedTime))}` : '', primary: i === 0,
        })));
        f = files.find(x => x.id === id) || null;
      }
      if (f) {
        log('info', 'file', `using ${f.name} (${f.id})`);
        this.setDrive({ fileId: f.id, fileName: f.name });
        return this.meta(f.id);
      }
      // The team file (or a remembered one) exists but this Google account hasn't opened it with the app yet.
      // Drive only allows that through Google's own file picker, once per account.
      if (wanted) {
        setStatus('needsFile', t('sync.dr.needPick'));
        if (interactive) { const p = await this.pickFile(wanted); if (p) return this.meta(p.id); }
        else UI.toast(t('sync.dr.needPick'), { action: t('sync.dr.pick'), onAction: () => Sync.pickAndStart(), timeout: 12000 });
        return null;
      }
      setStatus('needsFile');
      log('info', 'file', 'no data file yet');
      if (interactive) {
        const v = await UI.choice(t('sync.dr.file'), t('sync.dr.noneMsg'), [
          { value: 'pick', label: t('sync.dr.pick'), hint: t('sync.dr.pickHint'), primary: true },
          { value: 'create', label: t('sync.dr.create'), hint: t('sync.dr.createHint') },
        ]);
        if (v === 'create') { const n = await this.createFile(); UI.toast(t('sync.dr.created')); return this.meta(n.id); }
        if (v === 'pick') { const p = await this.pickFile(); if (p) return this.meta(p.id); }
      }
      return null;
    },

    /* ---- sync loop: one cycle at a time; requests that arrive meanwhile run once afterwards */
    async cycle(round = 0) {
      if (!this.ready) return;
      const m = await this.meta();
      if (m.version !== this.version) {
        const remote = await this.download();
        await reconcile(remote);
        this.remote = remote;
        this.version = m.version;
        this.saveVersion();
      }
      if (!this.ready) return;
      const up = Store.newerThan(this.remote);
      if (up.length) {
        // Someone may have saved while we were merging; merge their copy first so we never overwrite it.
        if (round < 2 && (await this.meta()).version !== this.version) return this.cycle(round + 1);
        setStatus('syncing', this.conf().fileName);
        const snap = clone(Store.raw());
        this.version = await this.upload(snap);
        this.remote = snap;
        Store.markSynced(snap);
        this.saveVersion();
        log('info', 'upload', `${up.length} changed records, version ${this.version}`);
      }
      setStatus('synced', this.conf().fileName);
    },
    sync() {
      if (this.running) { this.again = true; return this.running; }
      this.running = (async () => {
        try { do { this.again = false; await this.cycle(); } while (this.again && this.ready); }
        catch (e) { if (e.code !== 'auth') report('sync', e); }
        finally { this.running = null; }
      })();
      return this.running;
    },
    queue() {
      if (!this.ready) return;
      setStatus('syncing', this.conf().fileName);
      clearTimeout(this.qt);
      this.qt = setTimeout(() => this.sync(), 1500);
    },

    /* ---- creating / picking a file */
    async createFile() {
      const meta = { name: 'gamedev-pm-data.json', mimeType: 'application/json', appProperties: { gdpm: '1' } };
      const bnd = 'gdpm' + Date.now();
      const body = `--${bnd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${bnd}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ app: 'gamedev-pm', v: 1, entities: Store.raw() })}\r\n--${bnd}--`;
      const r = await this.api(`${UP}?uploadType=multipart&fields=id,name`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bnd }, body });
      const f = await r.json();
      log('info', 'create', `created ${f.name} (${f.id})`);
      this.setDrive({ fileId: f.id, fileName: f.name });
      Prefs.patch('sync', { initDone: { ...Prefs.get('sync').initDone, ['drive:' + f.id]: true } });
      return f;
    },
    /* Google's own file picker. `preselect` narrows the first tab to that file so it's a single click. */
    async pickFile(preselect) {
      const c = this.conf();
      if (!c.apiKey || !c.appId) throw fail('picker_keys_missing', t('sync.pickerNeeds'));
      await U.loadScript('https://apis.google.com/js/api.js').catch(() => { throw fail('gapi_load_failed', t('sync.err.gsi_load_failed')); });
      await new Promise((res, rej) => gapi.load('picker', { callback: res, onerror: () => rej(fail('picker_load_failed', t('sync.err.picker_load_failed'))) }));
      log('info', 'picker', `opening Drive file picker${preselect ? ' for ' + preselect : ''}`);
      const f = await new Promise(res => {
        const view = () => new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes('application/json').setMode(google.picker.DocsViewMode.LIST);
        const b = new google.picker.PickerBuilder();
        if (preselect) { const v = view(); if (typeof v.setFileIds === 'function') { v.setFileIds(preselect); b.addView(v); } }
        b.addView(view()).addView(view().setOwnedByMe(false))
          .setOAuthToken(this.token).setDeveloperKey(c.apiKey).setAppId(c.appId).setOrigin(location.protocol + '//' + location.host)
          .setCallback(d => {
            if (d.action === google.picker.Action.PICKED) res({ id: d.docs[0].id, name: d.docs[0].name });
            else if (d.action === google.picker.Action.CANCEL) { log('info', 'picker', 'cancelled'); res(null); }
            else if (d.action === 'error' || d.action === google.picker.Action.ERROR) { log('error', 'picker', JSON.stringify(d).slice(0, 200), 'picker_error'); res(null); }
          }).build().setVisible(true);
      });
      if (f) { log('info', 'picker', `picked ${f.name} (${f.id})`); this.setDrive({ fileId: f.id, fileName: f.name }); }
      return f;
    },
    stop() {
      this.ready = false; clearInterval(this.timer); clearTimeout(this.qt);
      if (this.onVis) document.removeEventListener('visibilitychange', this.onVis);
    },
    async signOut() {
      this.stop();
      try { if (this.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(this.token, () => {}); } catch { /* ignore */ }
      this.dropToken();
      this.setDrive({ email: '' });
    },
  };

  const adapters = { drive: DriveAdapter };
  window.addEventListener('online', () => { if (adapter === DriveAdapter && DriveAdapter.ready) DriveAdapter.sync(); });

  /*
   * Automatic sign-in renewal. Google's browser sign-in hands out 1-hour tokens and can only renew
   * them through its own window, which browsers allow only right after a click. So the first click
   * anywhere after the token ran out (or shortly before it does) renews it; for someone who signed
   * in before, Google's window opens and closes by itself.
   */
  let autoOff = false, starting = null;
  document.addEventListener('click', () => {
    if (adapter !== DriveAdapter || autoOff || !navigator.onLine) return;
    const D = DriveAdapter, now = Date.now();
    if (now - D.lastAuto < 90000 || !D.conf().email) return;
    if (status === 'needsLogin' && !starting) {
      D.lastAuto = now;
      log('info', 'auto', 'renewing the Google sign-in after a click');
      api.start(true, { auto: true });
    } else if (D.ready && D.exp - now < 10 * 60000) {
      D.lastAuto = now;
      log('info', 'auto', 'refreshing the Google sign-in before it expires');
      D.signIn().catch(e => { log('warn', 'auto', e.message, e.code); if (e.code === 'popup_failed_to_open') autoOff = true; });
    }
  }, true);

  const api = {
    get status() { return status; },
    get detail() { return detail; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    provider: () => Prefs.get('sync').provider,
    drive: DriveAdapter,
    /* Concurrent calls (a click while the page is still connecting) share one attempt. */
    start(interactive = false, { auto = false } = {}) {
      if (starting) return starting;
      starting = (async () => {
        if (adapter) adapter.stop();
        const p = Prefs.get('sync').provider;
        adapter = adapters[p] || null;
        if (!adapter) { setStatus('local'); return; }
        try { await adapter.start(interactive); }
        catch (e) {
          if (e.code === 'auth') return;
          if (auto) {
            log('warn', 'auto', e.message, e.code);
            if (e.code === 'popup_failed_to_open') { autoOff = true; UI.toast(t('sync.err.popup_failed_to_open'), { kind: 'err', timeout: 8000 }); }
            setStatus('needsLogin', t('sync.autoHint'));
            return;
          }
          report('start', e);
        }
      })().finally(() => { starting = null; });
      return starting;
    },
    /* Opened from a toast button, so Google's windows are allowed. */
    async pickAndStart() {
      try {
        await DriveAdapter.ensureToken();
        const f = await DriveAdapter.pickFile(Prefs.get('sync').drive.fileId);
        if (f) await api.start(true);
      } catch (e) { report('picker', e); UI.toast(`${e.code ? '[' + e.code + '] ' : ''}${e.message}`, { kind: 'err', timeout: 8000 }); }
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
  return api;
})();
Store.onLocal = ids => Sync.onLocal(ids);
