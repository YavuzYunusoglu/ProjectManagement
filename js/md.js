'use strict';
/* Minimal, safe Markdown renderer (input is escaped first; only http(s)/mailto/# links). */
const MD = (() => {
  const safeUrl = u => (/^(https?:|mailto:|#)/i.test(u) ? u : /^data:image\//i.test(u) ? u : '#');
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img alt="${a}" src="${safeUrl(u)}">`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${txt}</a>`)
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  }
  function render(src) {
    const lines = U.esc(src || '').replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; out.push(`<pre><code>${buf.join('\n')}</code></pre>`); continue;
      }
      let m;
      if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^&gt;\s?/.test(l)) {
        const buf = [];
        while (i < lines.length && /^&gt;\s?/.test(lines[i])) buf.push(lines[i++].replace(/^&gt;\s?/, ''));
        out.push(`<blockquote>${render_inner(buf)}</blockquote>`); continue;
      }
      if (/^\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
        const head = row(l); i += 2;
        const body = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
        out.push(`<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ''));
        const li = items.map(it => {
          const tm = it.match(/^\[([ xX])\]\s+(.*)$/);
          return tm ? `<li class="task"><input type="checkbox" disabled ${tm[1] !== ' ' ? 'checked' : ''}> ${inline(tm[2])}</li>` : `<li>${inline(it)}</li>`;
        }).join('');
        out.push(ordered ? `<ol>${li}</ol>` : `<ul>${li}</ul>`);
        continue;
      }
      if (!l.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|&gt;|\s*([-*+]|\d+\.)\s+|\|)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join('<br>'))}</p>`);
    }
    return out.join('');
  }
  // blockquote content is already escaped; render it without escaping again
  function render_inner(buf) { return buf.map(b => inline(b)).join('<br>'); }
  return { render };
})();

const WikiTemplates = {
  blank: () => '',
  gdd: () => I18n.lang() === 'tr' ? `# Oyun Tasarım Dokümanı

## Genel bakış
- **Tür:**
- **Platform:**
- **Hedef kitle:**
- **Tek cümlelik özet:**

## Temel oynanış döngüsü
1.
2.
3.

## Mekanikler
| Mekanik | Açıklama | Durum |
|---|---|---|
| Gün sistemi | Gün/gece döngüsü | Bitti |

## Hikâye ve karakterler

## Seviyeler / bölümler

## Sanat yönü

## Ses ve müzik

## Teknik notlar
` : `# Game Design Document

## Overview
- **Genre:**
- **Platform:**
- **Audience:**
- **One-line pitch:**

## Core loop
1.
2.
3.

## Mechanics
| Mechanic | Description | Status |
|---|---|---|
| Day system | Day/night cycle | Done |

## Story and characters

## Levels

## Art direction

## Audio

## Technical notes
`,
  character: () => I18n.lang() === 'tr' ? `# Karakter adı

- **Rol:**
- **Yaş / görünüm:**
- **Motivasyon:**

## Arka plan

## Diyalog tonu
> Örnek replik

## İlişkiler
` : `# Character name

- **Role:**
- **Age / look:**
- **Motivation:**

## Background

## Voice and tone
> Sample line

## Relationships
`,
  level: () => I18n.lang() === 'tr' ? `# Seviye adı

## Amaç

## Akış
1.
2.

## Düşmanlar / engeller

## Ödüller

## Notlar
- [ ] Blockout
- [ ] Işıklandırma
- [ ] Test
` : `# Level name

## Goal

## Flow
1.
2.

## Enemies / obstacles

## Rewards

## Notes
- [ ] Blockout
- [ ] Lighting
- [ ] Playtest
`,
  meeting: () => `# ${I18n.lang() === 'tr' ? 'Toplantı notu' : 'Meeting notes'} — ${U.today()}

## ${I18n.lang() === 'tr' ? 'Katılımcılar' : 'Attendees'}

## ${I18n.lang() === 'tr' ? 'Kararlar' : 'Decisions'}

## ${I18n.lang() === 'tr' ? 'Yapılacaklar' : 'Action items'}
- [ ]
`,
};
