'use strict';
/* Domain helpers on top of Store: boards, lists, cards, filters, seed data, Trello import. */
const CARD_TYPES = ['task', 'feature', 'bug', 'dialogue', 'art', 'audio', 'design'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const PRIORITY_COLOR = { low: '#8C97A8', medium: '#5B9CF2', high: '#F08A3E', critical: '#E5534B' };
const SEVERITIES = ['blocker', 'critical', 'major', 'minor', 'trivial'];
const SEVERITY_COLOR = { blocker: '#B3261E', critical: '#E5534B', major: '#F08A3E', minor: '#E8C547', trivial: '#8C97A8' };
const REPRO = ['always', 'often', 'sometimes', 'rarely'];
const PLATFORMS = ['Windows', 'macOS', 'Linux', 'Android', 'iOS', 'WebGL', 'PlayStation', 'Xbox', 'Switch'];

const byPos = (a, b) => (a.pos ?? 0) - (b.pos ?? 0) || (a.createdAt || 0) - (b.createdAt || 0);

const Model = {
  boards() { return Store.all('board').sort(byPos); },
  board() { return Store.get(Prefs.get('boardId')) || Model.boards()[0] || null; },
  lists(bid) { return Store.all('list', l => l.boardId === bid).sort(byPos); },
  cards(listId) { return Store.all('card', c => c.listId === listId).sort(byPos); },
  boardCards(bid) {
    const lists = new Set(Model.lists(bid).map(l => l.id));
    return Store.all('card', c => c.boardId === bid && lists.has(c.listId));
  },
  labels(bid) { return Store.all('label', l => l.boardId === bid).sort(byPos); },
  members() { return Store.all('member').sort(byPos); },
  milestones(bid) { return Store.all('milestone', m => m.boardId === bid).sort((a, b) => (a.date || '').localeCompare(b.date || '')); },
  comments(cardId) { return Store.all('comment', c => c.cardId === cardId).sort((a, b) => a.createdAt - b.createdAt); },
  activity(cardId) { return Store.all('activity', a => a.cardId === cardId).sort((a, b) => b.createdAt - a.createdAt); },
  aiEntries(bid) { return Store.all('ai', a => a.boardId === bid).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt); },
  wiki(bid) { return Store.all('wiki', w => w.boardId === bid).sort(byPos); },
  me() { return Store.get(Prefs.get('me')); },

  cardKey(c) { const b = Store.get(c.boardId); return `${(b && b.prefix) || 'PM'}-${c.num || '?'}`; },
  cardLabels(c) { return (c.labelIds || []).map(id => Store.get(id)).filter(Boolean); },
  cardMembers(c) { return (c.memberIds || []).map(id => Store.get(id)).filter(Boolean); },
  preds(c) { return (c.dependsOn || []).map(id => Store.get(id)).filter(x => x && x.type === 'card'); },
  progress(c) {
    if (c.done) return 1;
    const cl = c.checklist || [];
    return cl.length ? cl.filter(i => i.done).length / cl.length : 0;
  },
  span(c) {
    let s = c.start || c.due, e = c.due || c.start;
    if (!s) return null;
    if (s > e) [s, e] = [e, s];
    return { start: s, end: e };
  },
  dueState(c) {
    if (!c.due) return '';
    if (c.done) return 'done';
    const d = U.diffDays(U.today(), c.due);
    if (d < 0) return 'overdue';
    if (d <= 2) return 'soon';
    return '';
  },
  isOverdue(c) { return !c.done && c.due && c.due < U.today(); },
  nextPos(items) { return items.length ? Math.max(...items.map(i => i.pos ?? 0)) + 1024 : 1024; },
  nextNum(bid) { return Math.max(0, ...Store.all('card', c => c.boardId === bid).map(c => c.num || 0)) + 1; },
  posBetween(prev, next) {
    if (prev == null && next == null) return 1024;
    if (prev == null) return next - 1024;
    if (next == null) return prev + 1024;
    return (prev + next) / 2;
  },
  createCard(listId, title, extra = {}) {
    const list = Store.get(listId);
    const c = Store.create('card', {
      boardId: list.boardId, listId, title, num: Model.nextNum(list.boardId),
      pos: Model.nextPos(Model.cards(listId)), kind: 'task', priority: '', labelIds: [], memberIds: [],
      checklist: [], dependsOn: [], desc: '', start: null, due: null, done: false, estimate: null, ...extra,
    });
    Model.log(c, 'act.created', { list: list.name });
    return c;
  },
  setDone(c, done) {
    Store.update(c.id, { done, doneAt: done ? Date.now() : null });
    Model.log(c, done ? 'act.done' : 'act.reopened');
  },
  log(card, key, params = {}) {
    Store.create('activity', { boardId: card.boardId, cardId: card.id, key, params, by: Prefs.get('me') || null });
  },
  /* true if `from` (transitively) depends on `to` */
  dependsOnTransitive(fromId, toId, seen = new Set()) {
    if (fromId === toId) return true;
    if (seen.has(fromId)) return false;
    seen.add(fromId);
    const c = Store.get(fromId);
    return !!c && (c.dependsOn || []).some(p => Model.dependsOnTransitive(p, toId, seen));
  },
  addDependency(cardId, predId) {
    if (cardId === predId || Model.dependsOnTransitive(predId, cardId)) { UI.toast(t('deps.cycle'), { kind: 'err' }); return false; }
    const c = Store.get(cardId);
    if ((c.dependsOn || []).includes(predId)) return false;
    Store.update(cardId, { dependsOn: [...(c.dependsOn || []), predId] });
    return true;
  },
  removeCard(c) {
    const snap = Store.remove(c.id);
    UI.toast(t('card.deleted'), { action: t('undo'), onAction: () => Store.restore(snap) });
  },
};

/* Shared filter used by board, gantt, calendar and workload. */
const Filter = {
  text: '', labels: new Set(), members: new Set(), priorities: new Set(), types: new Set(), status: 'all',
  subs: new Set(),
  count() {
    return this.labels.size + this.members.size + this.priorities.size + this.types.size + (this.status !== 'all' ? 1 : 0) + (this.text.trim() ? 1 : 0);
  },
  active() { return this.count() > 0; },
  clear() { this.text = ''; [this.labels, this.members, this.priorities, this.types].forEach(s => s.clear()); this.status = 'all'; this.changed(); },
  changed() { this.subs.forEach(f => f()); },
  match(c) {
    if (this.labels.size && !(c.labelIds || []).some(id => this.labels.has(id))) return false;
    if (this.members.size && !(c.memberIds || []).some(id => this.members.has(id)) && !(this.members.has('none') && !(c.memberIds || []).length)) return false;
    if (this.priorities.size && !this.priorities.has(c.priority || '')) return false;
    if (this.types.size && !this.types.has(c.kind || 'task')) return false;
    if (this.status === 'open' && c.done) return false;
    if (this.status === 'done' && !c.done) return false;
    if (this.status === 'overdue' && !Model.isOverdue(c)) return false;
    if (this.status === 'nodate' && (c.start || c.due)) return false;
    const loc = I18n.locale();
    const q = this.text.trim().toLocaleLowerCase(loc);
    if (!q) return true;
    const low = s => String(s || '').toLocaleLowerCase(loc);
    return q.split(/\s+/).every(tok => {
      if (tok.startsWith('#') && tok.length > 1) return Model.cardLabels(c).some(l => low(l.name).includes(tok.slice(1)));
      if (tok.startsWith('@') && tok.length > 1) return Model.cardMembers(c).some(m => low(m.name).includes(tok.slice(1)) || low(m.initials).includes(tok.slice(1)));
      return low(c.title).includes(tok) || low(c.desc).includes(tok) || low(Model.cardKey(c)).includes(tok);
    });
  },
};

/* First-run content: the team's Trello board, so every view has something to show. */
function seedDemo() {
  const y = new Date().getFullYear();
  const D = (m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const ts = s => U.parse(s).getTime();
  const b = Store.create('board', { name: 'Project PO535-V', prefix: 'PO', pos: 1024, background: { type: 'preset', value: 'dusk' } });
  const mk = (name, initials, color, pos) => Store.create('member', { name, initials, color, pos, capacity: 20 });
  const yy = mk('Yavuz', 'YY', '#2BB6C4', 1), m2 = mk(I18n.lang() === 'tr' ? 'Ekip üyesi 2' : 'Team member 2', 'O', '#7C6CF2', 2), m3 = mk(I18n.lang() === 'tr' ? 'Ekip üyesi 3' : 'Team member 3', 'E3', '#E5534B', 3);
  Prefs.set('me', yy.id);
  const lb = (name, color, pos) => Store.create('label', { boardId: b.id, name, color, pos });
  const code = lb('code', '#F08A3E', 1), ux = lb('ux', '#7C6CF2', 2), dlg = lb('dialogue', '#3FBF8F', 3), sys = lb('system', '#5B9CF2', 4);
  const L = (name, pos, color) => Store.create('list', { boardId: b.id, name, pos, color });
  const lp = L('Code Progress', 1024, '#F08A3E'), lbg = L('Code Bugs', 2048, '#E5534B'), ld = L('Charachter Dialogues', 3072, '#3FBF8F');
  let num = 0, pos = 0;
  const C = (list, title, o = {}) => Store.create('card', {
    boardId: b.id, listId: list.id, title, num: ++num, pos: (pos += 1024), kind: 'task', priority: '', labelIds: [], memberIds: [yy.id],
    checklist: [], dependsOn: [], desc: '', start: null, due: null, done: false, estimate: null,
    createdAt: o.start ? ts(o.start) : ts(D(10, 20)), ...o,
  });
  const day = C(lp, 'Day System', { start: D(10, 23), due: D(10, 30), done: true, doneAt: ts(D(10, 30)), labelIds: [code.id, sys.id], estimate: 16, priority: 'high', kind: 'feature',
    checklist: [{ id: U.uid(), text: 'Gün/gece döngüsü', done: true }, { id: U.uid(), text: 'Gün sayacı UI', done: true }] });
  const dia = C(lp, 'Dialogue System', { start: D(10, 23), due: D(11, 13), labelIds: [code.id, sys.id], estimate: 30, priority: 'high', kind: 'feature', dependsOn: [day.id],
    checklist: [{ id: U.uid(), text: 'Diyalog veri formatı', done: true }, { id: U.uid(), text: 'Seçenek dallanması', done: true }, { id: U.uid(), text: 'Diyalog UI', done: false }, { id: U.uid(), text: 'Ses entegrasyonu', done: false }] });
  const ev = C(lp, 'Event', { start: D(11, 6), due: D(11, 20), labelIds: [code.id], estimate: 20, priority: 'medium', kind: 'feature', dependsOn: [day.id] });
  const cut = C(lp, 'Cutscene System', { start: D(11, 6), due: D(11, 20), labelIds: [code.id, sys.id], estimate: 24, priority: 'medium', kind: 'feature', memberIds: [yy.id, m2.id], dependsOn: [day.id] });
  const rad = C(lp, 'Radio System', { start: D(11, 6), due: D(11, 20), labelIds: [code.id], estimate: 12, priority: 'low', kind: 'feature' });
  const core = C(lp, 'Core loop for 2 days', { due: D(11, 20), labelIds: [code.id], estimate: 10, priority: 'critical', dependsOn: [ev.id, cut.id, rad.id] });
  const uxc = C(lp, 'UX', { start: D(11, 20), due: D(12, 4), labelIds: [ux.id], estimate: 24, priority: 'medium', kind: 'design', memberIds: [yy.id, m3.id], dependsOn: [core.id] });
  C(lp, 'BugFix', { start: D(12, 4), due: D(12, 18), labelIds: [code.id], estimate: 30, priority: 'high', dependsOn: [uxc.id] });
  pos = 0;
  const names = ['Dorman Tee', 'Walter Taylor', 'Harold Carpenter', 'Elisha Blue', 'Sophia Taylor', 'Benjamin Welson', "Thomas O'Kelly", 'Davis Miller', 'Mahmut Can', 'Mia Evans', 'Chengo Harriet'];
  names.forEach((n, i) => C(ld, n, { labelIds: [dlg.id], kind: 'dialogue', done: i < 8, doneAt: i < 8 ? ts(D(10, 24 + i)) : null, memberIds: [m2.id] }));
  void lbg;
  Store.create('milestone', { boardId: b.id, name: 'Alpha', date: D(11, 20), color: '#F2A93B' });
  Store.create('milestone', { boardId: b.id, name: 'Beta', date: D(12, 4), color: '#7C6CF2' });
  Store.create('milestone', { boardId: b.id, name: I18n.lang() === 'tr' ? 'Teslim' : 'Delivery', date: D(12, 18), color: '#E5534B' });
  Store.create('ai', {
    boardId: b.id, date: U.today(), memberId: yy.id, tool: 'Claude', version: 'Opus 5.5',
    category: 'coding', nature: 'code', stage: I18n.lang() === 'tr' ? 'Proje yönetim aracı (bu uygulama)' : 'Project management tool (this app)',
    purpose: I18n.lang() === 'tr' ? 'Ekip içi proje takip aracının kodunun yazılması.' : 'Writing the code of the team’s project tracking tool.',
    humanRole: I18n.lang() === 'tr' ? 'Gereksinimler ekip tarafından belirlendi; kod incelenip test edildi.' : 'Requirements set by the team; code reviewed and tested.',
    significant: true, checks: { verified: true, noConfidential: true, license: true, original: false, bias: false }, cardIds: [], notes: '',
  });
  Store.create('wiki', { boardId: b.id, title: 'GDD', pos: 1024, content: WikiTemplates.gdd() });
  Prefs.set('boardId', b.id);
  return b;
}

/* Import a Trello board export (Board menu → Print, export and share → Export as JSON). */
function importTrello(json) {
  const TC = { green: '#3FBF8F', yellow: '#E8C547', orange: '#F08A3E', red: '#E5534B', purple: '#7C6CF2', blue: '#5B9CF2', sky: '#2BB6C4', lime: '#8BC34A', pink: '#E96BA8', black: '#4E5BA6' };
  const tc = c => TC[String(c || '').replace(/_(light|dark)$/, '')] || '#8C97A8';
  const day = s => (s ? U.iso(new Date(s)) : null);
  const b = Store.create('board', { name: json.name || 'Trello', prefix: (json.name || 'TR').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TR', pos: Model.nextPos(Model.boards()), background: { type: 'preset', value: 'dusk' } });
  const memberMap = {};
  const existing = Model.members();
  (json.members || []).forEach((m, i) => {
    const found = existing.find(e => e.name === m.fullName);
    memberMap[m.id] = (found || Store.create('member', { name: m.fullName || m.username, initials: m.initials || U.initials(m.fullName), color: COLORS[(i + 4) % COLORS.length], pos: Model.nextPos(Model.members()), capacity: 20 })).id;
  });
  const labelMap = {};
  (json.labels || []).forEach((l, i) => { labelMap[l.id] = Store.create('label', { boardId: b.id, name: l.name || l.color || 'label', color: tc(l.color), pos: i }).id; });
  const listMap = {};
  (json.lists || []).filter(l => !l.closed).forEach(l => { listMap[l.id] = Store.create('list', { boardId: b.id, name: l.name, pos: l.pos }).id; });
  const checklists = {};
  (json.checklists || []).forEach(cl => { (checklists[cl.idCard] ||= []).push(...(cl.checkItems || []).sort(byPos).map(it => ({ id: U.uid(), text: it.name, done: it.state === 'complete' }))); });
  const cardMap = {};
  let num = 0;
  (json.cards || []).filter(c => !c.closed && listMap[c.idList]).forEach(c => {
    cardMap[c.id] = Store.create('card', {
      boardId: b.id, listId: listMap[c.idList], title: c.name, desc: c.desc || '', num: ++num, pos: c.pos, kind: 'task', priority: '',
      labelIds: (c.idLabels || []).map(i => labelMap[i]).filter(Boolean), memberIds: (c.idMembers || []).map(i => memberMap[i]).filter(Boolean),
      checklist: checklists[c.id] || [], dependsOn: [], start: day(c.start), due: day(c.due), done: !!c.dueComplete,
      doneAt: c.dueComplete ? Date.now() : null, estimate: null,
      color: c.cover && c.cover.color ? tc(c.cover.color) : '',
    }).id;
  });
  (json.actions || []).filter(a => a.type === 'commentCard' && cardMap[a.data?.card?.id]).forEach(a => {
    Store.create('comment', { boardId: b.id, cardId: cardMap[a.data.card.id], text: a.data.text, by: memberMap[a.idMemberCreator] || null, createdAt: Date.parse(a.date) || Date.now() });
  });
  Prefs.set('boardId', b.id);
  return { board: b, cards: num };
}
