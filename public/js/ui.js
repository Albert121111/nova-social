import { el, esc, avatar, fmtNum, richText, plural } from './util.js';
import { icon } from './icons.js';
import { get, post, state, emit } from './api.js';

const layers = () => document.getElementById('layers');

/* ------------------------------ Модальные окна ------------------------------ */

const modalStack = [];
export function openModal({ content, title = '', className = '', closeIcon = 'close', headerRight = '', onClose, noHeader = false, dismissable = true } = {}) {
  const root = el(`<div class="modal-layer ${className}">
    <div class="modal-backdrop"></div>
    <div class="modal" role="dialog" aria-modal="true">
      ${noHeader ? '' : `<div class="modal-header">
        <button class="icon-btn modal-close" aria-label="Закрыть">${icon(closeIcon)}</button>
        <div class="modal-title">${esc(title)}</div>
        <div class="modal-header-right">${headerRight}</div>
      </div>`}
      <div class="modal-body"></div>
    </div>
  </div>`);
  const body = root.querySelector('.modal-body');
  if (typeof content === 'string') body.innerHTML = content; else if (content) body.append(content);
  let closed = false;
  const m = {
    root, body,
    close() {
      if (closed) return; closed = true;
      root.classList.add('closing');
      setTimeout(() => root.remove(), 120);
      const i = modalStack.indexOf(m); if (i >= 0) modalStack.splice(i, 1);
      if (!modalStack.length) document.documentElement.classList.remove('modal-open');
      onClose && onClose();
    },
  };
  root.querySelector('.modal-close')?.addEventListener('click', () => m.close());
  if (dismissable) root.querySelector('.modal-backdrop').addEventListener('click', () => m.close());
  modalStack.push(m);
  document.documentElement.classList.add('modal-open');
  layers().append(root);
  setTimeout(() => root.querySelector('[autofocus], textarea, input')?.focus(), 30);
  return m;
}
export function closeAllModals() { [...modalStack].reverse().forEach((m) => m.close()); }

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (closeMenu()) return;
  if (document.querySelector('.lightbox')) { document.querySelector('.lightbox').remove(); return; }
  modalStack[modalStack.length - 1]?.close();
});

export function confirmDialog({ title, text, confirm = 'Подтвердить', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const content = el(`<div class="confirm">
      <h2>${esc(title)}</h2><p>${esc(text)}</p>
      <button class="btn btn-lg ${danger ? 'btn-danger' : 'btn-inverse'} w-full" data-ok>${esc(confirm)}</button>
      <button class="btn btn-lg btn-outline w-full" data-cancel>Отмена</button>
    </div>`);
    const m = openModal({ content, noHeader: true, className: 'modal-confirm', onClose: () => resolve(result) });
    content.querySelector('[data-ok]').onclick = () => { result = true; m.close(); };
    content.querySelector('[data-cancel]').onclick = () => m.close();
  });
}

/* ------------------------------ Выпадающие меню ------------------------------ */

let openMenuEl = null;
export function closeMenu() {
  if (!openMenuEl) return false;
  openMenuEl.remove(); openMenuEl = null; return true;
}
export function openMenu(anchor, items, { align = 'right', className = '', width } = {}) {
  closeMenu();
  const menu = el(`<div class="menu-layer"><div class="menu-backdrop"></div><div class="menu ${className}" role="menu"></div></div>`);
  const box = menu.querySelector('.menu');
  if (width) box.style.width = width + 'px';
  for (const it of items) {
    if (it.html) { box.append(el(it.html)); continue; }
    if (it.separator) { box.append(el('<div class="menu-sep"></div>')); continue; }
    const b = el(`<${it.href ? `a href="${esc(it.href)}"` : 'button'} class="menu-item ${it.danger ? 'danger' : ''}" role="menuitem">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></${it.href ? 'a' : 'button'}>`);
    b.addEventListener('click', (e) => { if (!it.href) e.preventDefault(); closeMenu(); it.onClick && it.onClick(); });
    box.append(b);
  }
  menu.querySelector('.menu-backdrop').addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); });
  layers().append(menu);
  openMenuEl = menu;
  const r = anchor.getBoundingClientRect();
  const bw = box.offsetWidth, bh = box.offsetHeight;
  let left = align === 'right' ? r.right - bw : r.left;
  let top = r.top;
  if (top + bh > window.innerHeight - 8) top = Math.max(8, r.bottom - bh);
  left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
  box.style.left = left + 'px'; box.style.top = top + 'px';
  return menu;
}
window.addEventListener('resize', () => closeMenu());

/* ------------------------------ Уведомления-тосты ------------------------------ */

export function toast(text, action) {
  const t = el(`<div class="toast" role="status"><span>${esc(text)}</span>${action ? `<a href="${esc(action.href)}" class="toast-action">${esc(action.label)}</a>` : ''}</div>`);
  layers().append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}

/* ------------------------------ Просмотр изображений ------------------------------ */

export function openLightbox(urls, index = 0) {
  let i = index;
  const lb = el(`<div class="lightbox">
    <button class="icon-btn lb-close" aria-label="Закрыть">${icon('close')}</button>
    <button class="icon-btn lb-prev" aria-label="Назад">${icon('back')}</button>
    <img class="lb-img" alt="">
    <button class="icon-btn lb-next" aria-label="Вперёд"><span style="display:inline-flex;transform:scaleX(-1)">${icon('back')}</span></button>
  </div>`);
  const img = lb.querySelector('.lb-img');
  const show = () => {
    img.src = urls[i];
    lb.querySelector('.lb-prev').style.visibility = i > 0 ? 'visible' : 'hidden';
    lb.querySelector('.lb-next').style.visibility = i < urls.length - 1 ? 'visible' : 'hidden';
  };
  lb.addEventListener('click', (e) => {
    if (e.target.closest('.lb-prev')) { i--; show(); return; }
    if (e.target.closest('.lb-next')) { i++; show(); return; }
    if (e.target === img) return;
    lb.remove(); document.removeEventListener('keydown', keys);
  });
  const keys = (e) => {
    if (!document.body.contains(lb)) return document.removeEventListener('keydown', keys);
    if (e.key === 'ArrowLeft' && i > 0) { i--; show(); }
    if (e.key === 'ArrowRight' && i < urls.length - 1) { i++; show(); }
  };
  document.addEventListener('keydown', keys);
  show();
  layers().append(lb);
}

/* ------------------------------ Кнопка «Читать» ------------------------------ */

export function followButton(u, size = '') {
  if (!u || (state.me && u.id === state.me.id)) return '';
  return u.following
    ? `<button class="btn btn-outline follow-btn is-following ${size}" data-follow="${esc(u.username)}" data-on="1"><span class="t-def">Читаю</span><span class="t-hover">Не читать</span></button>`
    : `<button class="btn btn-inverse follow-btn ${size}" data-follow="${esc(u.username)}">${u.followsYou && !size ? 'Читать в ответ' : 'Читать'}</button>`;
}

export function setFollowState(username, user) {
  document.querySelectorAll(`[data-follow="${CSS.escape(username)}"]`).forEach((b) => {
    const nb = el(followButton(user, [...b.classList].filter((c) => c.startsWith('btn-sm') || c === 'btn-lg').join(' ')));
    if (nb) b.replaceWith(nb);
  });
  emit('follow', user);
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-follow]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const username = b.dataset.follow;
  const on = !b.dataset.on;
  if (!on) {
    const ok = await confirmDialog({ title: `Перестать читать @${username}?`, text: 'Их посты больше не будут появляться в ленте «Подписки». Вы по-прежнему сможете открыть их профиль, если он не защищён.', confirm: 'Не читать', danger: false });
    if (!ok) return;
  }
  b.disabled = true;
  try {
    const { user } = await post(`/api/users/${encodeURIComponent(username)}/follow`, { on });
    setFollowState(username, user);
    if (state.me) state.me.followingCount = (state.me.followingCount || 0) + (on ? 1 : -1);
  } catch (err) { toast(err.message); b.disabled = false; }
});

/* ------------------------------ Карточка пользователя при наведении ------------------------------ */

const hcCache = new Map();
let hcTimer = null, hcHide = null, hcEl = null, hcTarget = null;
function hideHovercard() { hcEl?.remove(); hcEl = null; hcTarget = null; }

document.addEventListener('mouseover', (e) => {
  if (matchMedia('(hover: none)').matches) return;
  const t = e.target.closest('[data-hovercard]');
  if (hcEl && (e.target.closest('.hovercard'))) { clearTimeout(hcHide); return; }
  if (!t) { clearTimeout(hcTimer); if (hcEl) { clearTimeout(hcHide); hcHide = setTimeout(hideHovercard, 300); } return; }
  if (t === hcTarget) { clearTimeout(hcHide); return; }
  clearTimeout(hcTimer);
  hcTimer = setTimeout(async () => {
    const name = t.dataset.hovercard;
    if (state.me && name.toLowerCase() === state.me.username.toLowerCase() && t.closest('.account-switcher')) return;
    let u = hcCache.get(name.toLowerCase());
    if (!u || Date.now() - u.t > 30000) {
      try { const d = await get(`/api/users/${encodeURIComponent(name)}`); u = { t: Date.now(), user: d.user }; hcCache.set(name.toLowerCase(), u); } catch { return; }
    }
    if (!document.body.contains(t)) return;
    hideHovercard();
    const x = u.user;
    hcTarget = t;
    hcEl = el(`<div class="hovercard">
      <div class="hc-top">${avatar(x, 64)}${followButton(x)}</div>
      <a href="/${esc(x.username)}" class="hc-name">${esc(x.name)}${x.verified ? icon('verified') : ''}</a>
      <div class="hc-handle">@${esc(x.username)}${x.followsYou ? ' <span class="badge-soft">Читает вас</span>' : ''}</div>
      ${x.bio ? `<div class="hc-bio">${richText(x.bio)}</div>` : ''}
      <div class="hc-stats"><a href="/${esc(x.username)}/following"><b>${fmtNum(x.followingCount)}</b> в читаемых</a><a href="/${esc(x.username)}/followers"><b>${fmtNum(x.followers)}</b> ${plural(x.followers, ['читатель', 'читателя', 'читателей'])}</a></div>
    </div>`);
    layers().append(hcEl);
    const r = t.getBoundingClientRect();
    const w = hcEl.offsetWidth, h = hcEl.offsetHeight;
    let top = r.bottom + 6; if (top + h > window.innerHeight - 8) top = r.top - h - 6;
    hcEl.style.left = Math.max(8, Math.min(r.left - 20, window.innerWidth - w - 8)) + 'px';
    hcEl.style.top = Math.max(8, top) + 'px';
    hcEl.addEventListener('mouseleave', () => { hcHide = setTimeout(hideHovercard, 300); });
  }, 550);
});
document.addEventListener('click', () => { clearTimeout(hcTimer); if (hcEl) hideHovercard(); }, true);
window.addEventListener('scroll', () => { clearTimeout(hcTimer); if (hcEl) hideHovercard(); }, { passive: true });

/* ------------------------------ Списки пользователей ------------------------------ */

export function userCell(u, { bio = true, button = true } = {}) {
  return `<a class="user-cell" href="/${esc(u.username)}">
    ${avatar(u, 40, { link: false })}
    <div class="uc-main">
      <div class="uc-row">
        <div class="uc-names">
          <div class="uc-name"><span class="truncate">${esc(u.name)}</span>${u.verified ? icon('verified') : ''}</div>
          <div class="uc-handle"><span class="truncate">@${esc(u.username)}</span>${u.followsYou ? '<span class="badge-soft">Читает вас</span>' : ''}</div>
        </div>
        ${button ? followButton(u, 'btn-sm') : ''}
      </div>
      ${bio && u.bio ? `<div class="uc-bio">${esc(u.bio)}</div>` : ''}
    </div>
  </a>`;
}

export function spinner() { return '<div class="spinner-wrap"><div class="spinner"></div></div>'; }
export function emptyState(title, text = '', extra = '') {
  return `<div class="empty"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${extra}</div>`;
}
export function errorState(message, retry = true) {
  return `<div class="empty error-state"><p>${esc(message)}</p>${retry ? '<button class="btn btn-accent" data-retry>Повторить</button>' : ''}</div>`;
}
