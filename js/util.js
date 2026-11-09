'use strict';
/* Generic helpers. Dates are stored as ISO day strings: 'YYYY-MM-DD'. */
const COLORS = ['#E5534B', '#F08A3E', '#E8C547', '#3FBF8F', '#2BB6C4', '#5B9CF2', '#7C6CF2', '#C266E0', '#E96BA8', '#8C97A8', '#B07A4F', '#4E5BA6'];

const U = {
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  $(s, r = document) { return r.querySelector(s); },
  $$(s, r = document) { return [...r.querySelectorAll(s)]; },
  html(str) { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  sum(arr, f = x => x) { return arr.reduce((s, x) => s + (+f(x) || 0), 0); },
  safeColor(c, fallback = '') { return /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fallback; },

  // ---- dates
  iso(d) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; },
  parse(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
  today() { return U.iso(new Date()); },
  addDays(s, n) { const d = U.parse(s); d.setDate(d.getDate() + n); return U.iso(d); },
  addMonths(s, n) { const d = U.parse(s); d.setDate(1); d.setMonth(d.getMonth() + n); return U.iso(d); },
  diffDays(a, b) { return Math.round((U.parse(b) - U.parse(a)) / 864e5); },
  dow(s) { return U.parse(s).getDay(); },
  isWeekend(s) { const d = U.dow(s); return d === 0 || d === 6; },
  startOfWeek(s) { return U.addDays(s, -((U.dow(s) + 6) % 7)); },
  startOfMonth(s) { return s.slice(0, 8) + '01'; },
  minDate(...a) { return a.filter(Boolean).sort()[0] || null; },
  maxDate(...a) { return a.filter(Boolean).sort().pop() || null; },
  isoWeek(s) {
    const d = U.parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  },
  workdays(a, b) { let n = 0; for (let d = a; d <= b; d = U.addDays(d, 1)) if (!U.isWeekend(d)) n++; return n; },
  fmtDate(s, opts = { day: 'numeric', month: 'short' }) {
    if (!s) return '';
    return new Intl.DateTimeFormat(I18n.locale(), opts).format(U.parse(s));
  },
  fmtRange(a, b) {
    if (a && b && a !== b) return `${U.fmtDate(a)} – ${U.fmtDate(b)}`;
    return U.fmtDate(a || b);
  },
  fmtDateTime(ts) {
    return new Intl.DateTimeFormat(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  },
  relTime(ts) {
    const rtf = new Intl.RelativeTimeFormat(I18n.locale(), { numeric: 'auto' });
    const s = (ts - Date.now()) / 1000, a = Math.abs(s);
    if (a < 60) return rtf.format(Math.round(s), 'second');
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
    return U.fmtDateTime(ts);
  },

  // ---- colors
  rgb(hex) {
    let h = (hex || '#888').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  ink(hex) {
    const [r, g, b] = U.rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#14171f' : '#ffffff';
  },
  alpha(hex, a) { const [r, g, b] = U.rgb(hex); return `rgba(${r},${g},${b},${a})`; },
  initials(name) {
    const p = String(name || '?').trim().split(/\s+/);
    return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toLocaleUpperCase(I18n.locale());
  },

  // ---- io
  download(name, content, mime = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  pickFile(accept) {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
      i.onchange = () => res(i.files[0] || null); i.click();
    });
  },
  readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); },
  async shrinkImage(file, max = 1600, q = 0.78) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return c.toDataURL('image/jpeg', q);
  },
  _scripts: {},
  loadScript(src) {
    return U._scripts[src] ||= new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = () => { delete U._scripts[src]; rej(new Error('Script load failed: ' + src)); };
      document.head.appendChild(s);
    });
  },
  async copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; }
  },
};
