'use strict';
/* SVG / PNG export for charts. Charts use CSS variables; they are resolved to real colors on export. */
const Exporter = {
  resolve(svg) {
    const cs = getComputedStyle(document.documentElement);
    return svg.replace(/var\((--[\w-]+)\)/g, (m, n) => cs.getPropertyValue(n).trim() || '#888');
  },
  standalone(inner, w, h, bgVar = '--panel') {
    const font = "font-family:'Figtree','Segoe UI',Arial,sans-serif";
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="${font}">
<rect width="100%" height="100%" fill="var(${bgVar})"/>${inner}</svg>`;
    return Exporter.resolve(s);
  },
  svg(svgStr, name) { U.download(name + '.svg', svgStr, 'image/svg+xml'); },
  png(svgStr, w, h, name, scale = 2) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => U.download(name + '.png', b), 'image/png');
    };
    img.onerror = () => UI.toast(t('export.failed'), { kind: 'err' });
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  },
  /* Shows a small menu next to `anchor` with SVG / PNG options. build() -> {svg, w, h, name} */
  menu(anchor, build) {
    const el = U.html(`<div class="menu">
      <button class="menu-item" data-f="svg">${icon('download')} ${t('export.svg')}</button>
      <button class="menu-item" data-f="png">${icon('image')} ${t('export.png')}</button></div>`);
    el.addEventListener('click', e => {
      const f = e.target.closest('[data-f]')?.dataset.f; if (!f) return;
      UI.closePopover();
      const r = build();
      const name = r.name.replace(/[^\w\-ğüşöçıİĞÜŞÖÇ]+/g, '_');
      f === 'svg' ? Exporter.svg(r.svg, name) : Exporter.png(r.svg, r.w, r.h, name);
    });
    UI.pop(anchor, el, { align: 'end' });
  },
};
