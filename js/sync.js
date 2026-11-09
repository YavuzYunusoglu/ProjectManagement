'use strict';
/*
 * Cloud sync. Two interchangeable back ends:
 *  - Firebase Firestore: one document per entity, real-time listener.
 *  - Google Drive: one JSON file, polled every 15 s; merge-then-upload.
 * Both rely on Store's per-entity last-writer-wins merge, so a lost race heals
 * itself on the next cycle (the newer local copy is pushed again).
 */
const Sync = (() => {
  let adapter = null;
  let status = 'local', detail = '';
  const subs = new Set();
  const setStatus = (s, d = '') => { status = s; detail = d; subs.forEach(f => f()); };
  const clone = o => JSON.parse(JSON.stringify(o));

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

  function parseConfig(s) {
    s = String(s || '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error(t('sync.badConfig'));
    s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch { /* JS object literal, convert below */ }
    try {
      return JSON.parse(s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*}/g, '}'));
    } catch { throw new Error(t('sync.badConfig')); }
  }

  /* ---------------- Firebase ---------------- */
  const FirebaseAdapter = {
    ready: false, pending: new Set(), unsub: null, user: null,
    async start(interactive) {
      const conf = Prefs.get('sync').firebase;
      const config = parseConfig(conf.config);
      const ws = (conf.workspace || 'gamedev-pm').replace(/[^\w-]/g, '_');
      const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
      setStatus('connecting');
      await U.loadScript(base + 'firebase-app-compat.js');
      await U.loadScript(base + 'firebase-auth-compat.js');
      await U.loadScript(base + 'firebase-firestore-compat.js');
      let app = firebase.apps.find(x => x.name === 'gdpm');
      if (app && app.options.projectId !== config.projectId) { await app.delete(); app = null; }
      app = app || firebase.initializeApp(config, 'gdpm');
      this.auth = app.auth();
      this.db = app.firestore();
      this.user = await new Promise(res => { const un = this.auth.onAuthStateChanged(u => { un(); res(u); }); });
      if (!this.user) {
        if (!interactive) { setStatus('needsLogin'); return; }
        this.user = (await this.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())).user;
      }
      this.col = this.db.collection('workspaces').doc(ws).collection('entities');
      const key = `fb:${config.projectId}:${ws}`;
      let first = true;
      this.unsub = this.col.onSnapshot(async snap => {
        if (first) {
          first = false;
          const remote = {};
          snap.forEach(d => { remote[d.id] = d.data(); });
          applyInitial(await initialMerge(remote, key), remote);
          this.ready = true;
          this.queue(Store.newerThan(remote));
          setStatus('synced', this.user.email);
          return;
        }
        const list = snap.docChanges().filter(ch => ch.type !== 'removed' && !ch.doc.metadata.hasPendingWrites).map(ch => ch.doc.data());
        Store.applyRemote(list);
        if (!this.pending.size) setStatus('synced', this.user.email);
      }, err => setStatus('error', err.code === 'permission-denied' ? t('sync.denied') : err.message));
    },
    queue(ids) {
      if (!this.ready) return;
      ids.forEach(i => this.pending.add(i));
      if (!this.pending.size) return;
      setStatus('syncing', this.user?.email);
      clearTimeout(this.t);
      this.t = setTimeout(() => this.flush(), 400);
    },
    async flush() {
      const ids = [...this.pending]; this.pending.clear();
      const raw = Store.raw();
      try {
        for (let i = 0; i < ids.length; i += 400) {
          const batch = this.db.batch();
          ids.slice(i, i + 400).forEach(id => raw[id] && batch.set(this.col.doc(id), clone(raw[id])));
          await batch.commit();
        }
        if (!this.pending.size) setStatus('synced', this.user?.email);
      } catch (e) {
        ids.forEach(i => this.pending.add(i));
        setStatus('error', e.code === 'permission-denied' ? t('sync.denied') : e.message);
      }
    },
    stop() { this.unsub && this.unsub(); this.unsub = null; this.ready = false; clearTimeout(this.t); },
    async signOut() { this.stop(); try { await this.auth?.signOut(); } catch { /* ignore */ } },
  };

  /* ---------------- Google Drive ---------------- */
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3/files/';
  const UP = 'https://www.googleapis.com/upload/drive/v3/files';
  const DriveAdapter = {
    ready: false, token: null, exp: 0, version: null, remote: {}, chain: Promise.resolve(), timer: null,
    conf() { return Prefs.get('sync').drive; },
    async start(interactive) {
      const c = this.conf();
      if (!c.clientId) throw new Error(t('sync.noClientId'));
      setStatus('connecting');
      await U.loadScript('https://accounts.google.com/gsi/client');
      try {
        const saved = JSON.parse(sessionStorage.getItem('gdpm.dtok') || 'null');
        if (saved && saved.exp > Date.now() + 60000 && saved.cid === c.clientId) { this.token = saved.token; this.exp = saved.exp; }
      } catch { /* ignore */ }
      if (!this.token) {
        if (!interactive) { setStatus('needsLogin'); return; }
        await this.signIn();
      }
      if (!c.fileId) { setStatus('needsFile'); return; }
      let remote;
      try { remote = await this.download(); }
      catch (e) {
        // drive.file only sees files this person created or picked once with the Picker.
        if (/^Drive (403|404)/.test(e.message)) { setStatus('needsFile', t('sync.dr.needPick')); return; }
        throw e;
      }
      this.version = (await this.meta()).version;
      applyInitial(await initialMerge(remote, 'drive:' + c.fileId), remote);
      this.remote = remote;
      this.ready = true;
      setStatus('synced', c.fileName);
      this.sync();
      this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.sync(); }, 15000);
      this.onVis = () => { if (document.visibilityState === 'visible') this.sync(); };
      document.addEventListener('visibilitychange', this.onVis);
    },
    signIn() {
      const c = this.conf();
      return new Promise((res, rej) => {
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: c.clientId, scope: SCOPE,
          callback: r => {
            if (r.error) return rej(new Error(r.error));
            this.token = r.access_token; this.exp = Date.now() + (r.expires_in - 60) * 1000;
            sessionStorage.setItem('gdpm.dtok', JSON.stringify({ token: this.token, exp: this.exp, cid: c.clientId }));
            res();
          },
          error_callback: e => rej(new Error(e.message || e.type || 'auth')),
        });
        tc.requestAccessToken({ prompt: '' });
      });
    },
    async api(url, opts = {}) {
      if (!this.token || Date.now() > this.exp) { this.token = null; this.ready = false; setStatus('needsLogin'); throw new Error('auth'); }
      const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + this.token, ...(opts.headers || {}) } });
      if (r.status === 401) { this.token = null; this.ready = false; sessionStorage.removeItem('gdpm.dtok'); setStatus('needsLogin'); throw new Error('auth'); }
      if (!r.ok) throw new Error(`Drive ${r.status}: ${(await r.text()).slice(0, 160)}`);
      return r;
    },
    async meta() { return (await this.api(`${API}${this.conf().fileId}?fields=version,name&supportsAllDrives=true`)).json(); },
    async download() {
      const txt = await (await this.api(`${API}${this.conf().fileId}?alt=media&supportsAllDrives=true`)).text();
      if (!txt.trim()) return {};
      const d = JSON.parse(txt);
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
      }
      setStatus('synced', this.conf().fileName);
    },
    sync() {
      this.chain = this.chain.then(() => this.cycle()).catch(e => { if (e.message !== 'auth') setStatus(navigator.onLine ? 'error' : 'offline', e.message); });
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
      Prefs.patch('sync', { drive: { ...this.conf(), fileId: f.id, fileName: f.name }, initDone: { ...Prefs.get('sync').initDone, ['drive:' + f.id]: true } });
      return f;
    },
    async pickFile() {
      const c = this.conf();
      if (!c.apiKey || !c.appId) throw new Error(t('sync.pickerNeeds'));
      await U.loadScript('https://apis.google.com/js/api.js');
      await new Promise(res => gapi.load('picker', res));
      const f = await new Promise(res => {
        const mine = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes('application/json').setMode(google.picker.DocsViewMode.LIST);
        const shared = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes('application/json').setOwnedByMe(false).setMode(google.picker.DocsViewMode.LIST);
        new google.picker.PickerBuilder().addView(mine).addView(shared)
          .setOAuthToken(this.token).setDeveloperKey(c.apiKey).setAppId(c.appId)
          .setCallback(d => {
            if (d.action === google.picker.Action.PICKED) res({ id: d.docs[0].id, name: d.docs[0].name });
            else if (d.action === google.picker.Action.CANCEL) res(null);
          }).build().setVisible(true);
      });
      if (f) Prefs.patch('sync', { drive: { ...c, fileId: f.id, fileName: f.name } });
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

  const adapters = { firebase: FirebaseAdapter, drive: DriveAdapter };
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
      catch (e) { if (e.message !== 'auth') setStatus('error', e.message || String(e)); }
    },
    async signOut() { if (adapter) await adapter.signOut(); adapter = null; setStatus('local'); },
    stop() { if (adapter) adapter.stop(); adapter = null; setStatus('local'); },
    onLocal(ids) { if (adapter && adapter.ready) adapter.queue(ids); },
    now() { if (adapter === DriveAdapter) DriveAdapter.sync(); },
  };
})();
Store.onLocal = ids => Sync.onLocal(ids);
