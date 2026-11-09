'use strict';
/* Modals, popovers, toasts and small dialogs. */
const UI = (() => {
  const stack = [];
  let popover = null;

  function modal({ title = '', body = '', cls = '', onClose, actions = '', focus = true } = {}) {
    const ov = U.html(`<div class="ov" role="presentation">
      <div class="modal ${cls}" role="dialog" aria-modal="true" aria-label="${U.esc(title)}">
        ${title ? `<header class="modal-head"><h2>${U.esc(title)}</h2><button class="icon-btn" data-close aria-label="${t('close')}">${icon('x')}</button></header>` : ''}
        <div class="modal-body"></div>
        ${actions ? `<footer class="modal-foot">${actions}</footer>` : ''}
      </div></div>`);
    const bodyEl = ov.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const prevFocus = document.activeElement;
    const api = {
      el: ov.querySelector('.modal'), body: bodyEl, closed: false,
      close() {
        if (api.closed) return; api.closed = true;
        const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
        ov.classList.add('out');
        setTimeout(() => ov.remove(), 140);
        onClose && onClose();
        prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true });
      },
    };
    let downOnOverlay = false;
    ov.addEventListener('pointerdown', e => { downOnOverlay = e.target === ov; });
    ov.addEventListener('click', e => {
      if ((e.target === ov && downOnOverlay) || e.target.closest('[data-close]')) api.close();
    });
    document.body.appendChild(ov);
    stack.push(api);
    requestAnimationFrame(() => {
      const f = focus ? ov.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]), textarea, select, button.primary') : null;
      if (f) f.focus({ preventScroll: true });
      else { api.el.tabIndex = -1; api.el.focus({ preventScroll: true }); }
    });
    return api;
  }

  function confirm(msg, { ok = t('ok'), danger = false, title = '' } = {}) {
    return new Promise(res => {
      let val = false;
      const m = modal({
        title, cls: 'dialog',
        body: `<p class="dialog-msg">${U.esc(msg)}</p>`,
        actions: `<button class="btn" data-close>${t('cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${U.esc(ok)}</button>`,
        onClose: () => res(val),
      });
      m.el.querySelector('[data-ok]').onclick = () => { val = true; m.close(); };
    });
  }

  function prompt(title, value = '', { placeholder = '', multiline = false, ok = t('save') } = {}) {
    return new Promise(res => {
      let val = null;
      const field = multiline
        ? `<textarea class="input" rows="4" placeholder="${U.esc(placeholder)}">${U.esc(value)}</textarea>`
        : `<input class="input" value="${U.esc(value)}" placeholder="${U.esc(placeholder)}">`;
      const m = modal({
        title, cls: 'dialog', body: field,
        actions: `<button class="btn" data-close>${t('cancel')}</button><button class="btn primary" data-ok>${U.esc(ok)}</button>`,
        onClose: () => res(val),
      });
      const inp = m.body.querySelector('input,textarea');
      const done = () => { val = inp.value.trim(); m.close(); };
      m.el.querySelector('[data-ok]').onclick = done;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter' && (!multiline || e.ctrlKey)) { e.preventDefault(); done(); } });
    });
  }

  function choice(title, msg, options) {
    return new Promise(res => {
      let val = null;
      const m = modal({
        title, cls: 'dialog',
        body: `<p class="dialog-msg">${U.esc(msg)}</p><div class="choice-list">${options.map((o, i) =>
          `<button class="choice ${o.primary ? 'primary' : ''}" data-i="${i}"><strong>${U.esc(o.label)}</strong>${o.hint ? `<span>${U.esc(o.hint)}</span>` : ''}</button>`).join('')}</div>`,
        onClose: () => res(val),
      });
      m.body.addEventListener('click', e => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        val = options[+b.dataset.i].value; m.close();
      });
    });
  }

  function toast(msg, { action, onAction, timeout = 4500, kind = '' } = {}) {
    let host = U.$('.toasts');
    if (!host) { host = U.html('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(host); }
    const el = U.html(`<div class="toast ${kind}"><span>${U.esc(msg)}</span>${action ? `<button class="btn sm">${U.esc(action)}</button>` : ''}</div>`);
    host.appendChild(el);
    const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
    if (action) el.querySelector('button').onclick = () => { onAction && onAction(); kill(); };
    setTimeout(kill, timeout);
  }

  function closePopover() { if (popover) { const p = popover; popover = null; p.el.remove(); p.onClose && p.onClose(); } }

  function pop(anchor, content, { cls = '', onClose, align = 'start' } = {}) {
    closePopover();
    const el = U.html(`<div class="popover ${cls}" role="dialog"></div>`);
    if (typeof content === 'string') el.innerHTML = content; else el.appendChild(content);
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = align === 'end' ? r.right - w : r.left;
    let y = r.bottom + 6;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 6);
    x = U.clamp(x, 8, innerWidth - w - 8);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    popover = { el, anchor, onClose, close: closePopover };
    requestAnimationFrame(() => { const f = el.querySelector('input,textarea'); f && f.focus(); });
    return popover;
  }

  document.addEventListener('pointerdown', e => {
    if (popover && !popover.el.contains(e.target) && !popover.anchor.contains(e.target)) closePopover();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (popover) { closePopover(); e.stopPropagation(); return; }
    const top = stack[stack.length - 1];
    if (top && !e.defaultPrevented) {
      const a = document.activeElement;
      if (a && a.matches('input,textarea') && a.dataset.escBlur !== undefined) { a.blur(); return; }
      top.close();
    }
  });

  /* Color swatch picker, returns html. data-color on each swatch. */
  function swatches(selected, { none = false, name = 'color' } = {}) {
    return `<div class="swatches" role="radiogroup">${none ? `<button class="sw none ${!selected ? 'on' : ''}" data-${name}="" aria-label="${t('none')}">${icon('x')}</button>` : ''}${COLORS.map(c =>
      `<button class="sw ${c === selected ? 'on' : ''}" data-${name}="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>`;
  }

  function avatar(m, size = '') {
    if (!m) return '';
    const c = U.safeColor(m.color, '#5B9CF2');
    return `<span class="av ${size}" style="--c:${c};color:${U.ink(c)}" title="${U.esc(m.name)}">${U.esc(m.initials || U.initials(m.name))}</span>`;
  }

  return { modal, confirm, prompt, choice, toast, pop, closePopover, swatches, avatar, get top() { return stack[stack.length - 1]; } };
})();
