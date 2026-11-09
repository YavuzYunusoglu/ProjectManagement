'use strict';
/*
 * Data store: a flat map of entities keyed by id. Every entity carries
 * {id, type, updatedAt, updatedBy}. Deletions become tombstones ({deleted:true}).
 * Merging two copies = per-entity "last writer wins", which lets several people
 * edit different cards at the same time without overwriting each other.
 */
const Prefs = (() => {
  const KEY = 'gdpm.prefs';
  const defaults = {
    theme: 'system', lang: 'system', view: 'board', boardId: null, me: null,
    sync: {
      provider: 'none',
      firebase: { config: '', workspace: 'gamedev-pm' },
      drive: { clientId: '', apiKey: '', appId: '', fileId: '', fileName: '' },
      initDone: {},
    },
    gantt: { zoom: 'day', group: 'list', deps: true, critical: false, showDone: true, collapsed: {} },
    workload: { metric: 'hours', scale: 'week' },
    stats: { metric: 'cards' },
    wikiPage: null,
  };
  let p;
  try { p = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { p = {}; }
  p = { ...defaults, ...p };
  for (const k of ['sync', 'gantt', 'workload', 'stats']) p[k] = { ...defaults[k], ...(p[k] || {}) };
  p.sync.firebase = { ...defaults.sync.firebase, ...p.sync.firebase };
  p.sync.drive = { ...defaults.sync.drive, ...p.sync.drive };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ } };
  /* Team settings from config.js (committed to the repo) override each person's sync settings. */
  const team = (window.GDPM_CONFIG && window.GDPM_CONFIG.sync) || {};
  const teamOn = ['firebase', 'drive'].includes(team.provider);
  const effectiveSync = () => {
    if (!teamOn) return p.sync;
    const fb = team.firebase || {}, dr = team.drive || {};
    return {
      ...p.sync, team: true, provider: team.provider,
      firebase: { config: typeof fb.config === 'string' ? fb.config : JSON.stringify(fb.config || {}), workspace: fb.workspace || 'gamedev-pm' },
      drive: { ...p.sync.drive, clientId: dr.clientId || '', apiKey: dr.apiKey || '', appId: dr.appId || '', fileId: p.sync.drive.fileId || dr.fileId || '' },
    };
  };
  return {
    get: k => (k === 'sync' ? effectiveSync() : p[k]),
    set(k, v) { p[k] = v; save(); },
    patch(k, v) { p[k] = { ...p[k], ...v }; save(); },
  };
})();

const Store = (() => {
  const KEY = 'gdpm.data.v1';
  let ents = {};
  const subs = new Set();
  let pend = { local: new Set(), remote: new Set() };
  let queued = false, lastStamp = 0;
  const clientId = (() => {
    let c = localStorage.getItem('gdpm.client');
    if (!c) { c = U.uid(); localStorage.setItem('gdpm.client', c); }
    return c;
  })();
  const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

  const save = U.debounce(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, entities: ents })); }
    catch { UI.toast(t('err.storage'), { kind: 'err' }); }
  }, 250);

  function flush() {
    queued = false;
    const b = pend; pend = { local: new Set(), remote: new Set() };
    for (const src of ['remote', 'local']) {
      const ids = [...b[src]];
      if (!ids.length) continue;
      subs.forEach(f => f(ids, src));
      if (src === 'local') {
        if (Prefs.get('pristine')) Prefs.set('pristine', false);
        if (Store.onLocal) Store.onLocal(ids);
      }
    }
  }
  function touch(ids, src) {
    ids.forEach(i => pend[src].add(i));
    save();
    if (!queued) { queued = true; queueMicrotask(flush); }
  }
  function put(e) {
    const n = { ...e, updatedAt: stamp(), updatedBy: clientId };
    delete n.deleted;
    ents[n.id] = n;
    touch([n.id], 'local');
    return n;
  }
  const newer = (a, b) => a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && String(a.updatedBy) > String(b.updatedBy));

  function cascade(id, out = new Set()) {
    const e = ents[id];
    if (!e || e.deleted || out.has(id)) return out;
    out.add(id);
    const kids = Object.values(ents).filter(x => !x.deleted && (
      (e.type === 'board' && x.boardId === id) ||
      (e.type === 'list' && x.type === 'card' && x.listId === id) ||
      (e.type === 'card' && x.type === 'comment' && x.cardId === id)));
    kids.forEach(k => cascade(k.id, out));
    return out;
  }

  return {
    clientId,
    onLocal: null,
    load() {
      try { const d = JSON.parse(localStorage.getItem(KEY)); ents = d?.entities || {}; }
      catch { ents = {}; }
    },
    raw: () => ents,
    isEmpty: () => !Object.values(ents).some(e => !e.deleted),
    get(id) { const e = ents[id]; return e && !e.deleted ? e : null; },
    all(type, pred) { return Object.values(ents).filter(e => e.type === type && !e.deleted && (!pred || pred(e))); },
    create(type, data) {
      return put({ id: U.uid(), type, createdAt: Date.now(), createdBy: Prefs.get('me') || null, ...data });
    },
    put,
    update(id, patch) {
      const cur = ents[id];
      if (!cur || cur.deleted) return null;
      return put({ ...cur, ...patch });
    },
    /* Deletes an entity and its children. Returns snapshots for undo. */
    remove(id) {
      const ids = [...cascade(id)];
      const snap = ids.map(i => ents[i]);
      ids.forEach(i => { ents[i] = { id: i, type: ents[i].type, deleted: true, updatedAt: stamp(), updatedBy: clientId }; });
      touch(ids, 'local');
      return snap;
    },
    restore(snap) { snap.forEach(s => put({ ...s })); },
    /* Merge entities that came from the cloud. */
    applyRemote(list) {
      const changed = [];
      for (const r of list) {
        if (!r || !r.id) continue;
        const l = ents[r.id];
        if (!l || newer(r, l)) { ents[r.id] = r; changed.push(r.id); lastStamp = Math.max(lastStamp, r.updatedAt || 0); }
      }
      if (changed.length) touch(changed, 'remote');
      return changed;
    },
    /* Ids whose local copy is newer than (or missing from) the given remote map. */
    newerThan(remoteMap) {
      return Object.values(ents).filter(l => { const r = remoteMap[l.id]; return !r || newer(l, r); }).map(l => l.id);
    },
    replaceAll(list) {
      const old = Object.keys(ents);
      ents = {};
      list.forEach(e => { if (e && e.id) ents[e.id] = e; });
      touch([...new Set([...old, ...Object.keys(ents)])], 'remote');
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
})();
