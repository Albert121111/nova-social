import { el, esc, avatar, fmtNum, plural, APP_NAME, debounce } from './util.js';
import { icon } from './icons.js';
import { get, post, state, on, emit } from './api.js';
import { openMenu, toast, closeAllModals, closeMenu } from './ui.js';

/* ============================== Тема оформления ============================== */

const ACCENTS = { blue: '#1d9bf0', yellow: '#ffd400', pink: '#f91880', purple: '#7856ff', orange: '#ff7a00', green: '#00ba7c' };
export const display = {
  get() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem('display') || '{}'); } catch { /* приватный режим */ }
    return { theme: d.theme || 'dark', accent: d.accent || 'blue', font: d.font ?? 2 };
  },
  set(patch) {
    const d = { ...display.get(), ...patch };
    try { localStorage.setItem('display', JSON.stringify(d)); } catch { /* ничего */ }
    display.apply(d);
  },
  apply(d = display.get()) {
    const r = document.documentElement;
    r.dataset.theme = d.theme;
    r.style.setProperty('--accent', ACCENTS[d.accent] || ACCENTS.blue);
    r.style.setProperty('--accent-ink', d.accent === 'yellow' ? '#0f1419' : '#fff');
    r.style.setProperty('--fs', [14, 14.5, 15, 16.5, 18][d.font] + 'px');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', { light: '#ffffff', dim: '#15202b', dark: '#000000' }[d.theme]);
  },
  ACCENTS,
};
display.apply();

/* ============================== Роутер ============================== */

const ROUTES = [
  ['/', () => ({ redirect: '/home' })],
  ['/home', () => import('./pages/home.js')],
  ['/explore', () => import('./pages/explore.js')],
  ['/explore/tabs/:tab', () => import('./pages/explore.js')],
  ['/search', () => import('./pages/explore.js'), { search: true }],
  ['/hashtag/:tag', () => import('./pages/explore.js'), { hashtag: true }],
  ['/notifications', () => import('./pages/notifications.js')],
  ['/notifications/mentions', () => import('./pages/notifications.js'), { mentions: true }],
  ['/messages', () => import('./pages/messages.js')],
  ['/messages/:username', () => import('./pages/messages.js')],
  ['/i/bookmarks', () => import('./pages/bookmarks.js')],
  ['/settings', () => import('./pages/settings.js')],
  ['/settings/:section', () => import('./pages/settings.js')],
  ['/premium', () => import('./pages/premium.js')],
  ['/i/premium', () => import('./pages/premium.js')],
  ['/compose/post', () => ({ compose: true })],
  ['/:username/status/:id', () => import('./pages/status.js')],
  ['/:username/status/:id/:engage', () => import('./pages/status.js')],
  ['/:username/followers', () => import('./pages/follows.js'), { list: 'followers' }],
  ['/:username/following', () => import('./pages/follows.js'), { list: 'following' }],
  ['/:username/followers_you_follow', () => import('./pages/follows.js'), { list: 'mutuals' }],
  ['/:username', () => import('./pages/profile.js'), { tab: 'posts' }],
  ['/:username/with_replies', () => import('./pages/profile.js'), { tab: 'replies' }],
  ['/:username/media', () => import('./pages/profile.js'), { tab: 'media' }],
  ['/:username/likes', () => import('./pages/profile.js'), { tab: 'likes' }],
].map(([pattern, loader, extra]) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { pattern, re, keys, loader, extra: extra || {} };
});

const cache = new Map(); // path -> {node, scroll, page}
let current = null; // {path, node, page}
let navToken = 0;

export function cachedRoots() { return [...cache.values()].map((c) => c.node); }

export function navigate(path, { replace = false } = {}) {
  closeMenu();
  if (path === location.pathname + location.search && !replace) { window.scrollTo({ top: 0, behavior: 'smooth' }); emit('reselect', path); return; }
  saveCurrent();
  if (replace) history.replaceState(history.state, '', path); else history.pushState({ internal: true }, '', path);
  render(false);
}
function saveCurrent() {
  if (!current || current.page?.cache === false) return;
  cache.set(current.path, { node: current.node, scroll: window.scrollY, page: current.page });
  if (cache.size > 12) cache.delete(cache.keys().next().value);
}
window.addEventListener('popstate', () => { closeAllModals(); saveCurrent(); render(true); });

async function render(fromHistory) {
  const token = ++navToken;
  const path = location.pathname + location.search;
  const primary = document.getElementById('primary');
  if (!primary) return;
  current?.page?.hide?.();

  if (fromHistory && cache.has(path)) {
    const c = cache.get(path);
    cache.delete(path);
    primary.replaceChildren(c.node);
    current = { path, node: c.node, page: c.page };
    applyLayout(c.page);
    c.page.show?.();
    requestAnimationFrame(() => window.scrollTo(0, c.scroll));
    return;
  }
  cache.delete(path);

  const pathname = location.pathname;
  let route = null, params = {};
  for (const r of ROUTES) {
    const m = r.re.exec(pathname);
    if (m) { route = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
  }
  if (!route) { route = ROUTES.find((r) => r.pattern === '/home'); }
  const mod = await route.loader();
  if (token !== navToken) return;
  if (mod.redirect) return navigate(mod.redirect, { replace: true });
  if (mod.compose) { history.replaceState({}, '', '/home'); await render(false); import('./post.js').then((m) => m.openComposeModal()); return; }
  const ctx = { params, query: new URLSearchParams(location.search), path, ...route.extra };
  const page = await mod.default(ctx);
  if (token !== navToken) { page.destroy?.(); return; }
  current?.page?.cache === false && current.page.destroy?.();
  primary.replaceChildren(page.el);
  current = { path, node: page.el, page };
  applyLayout(page);
  window.scrollTo(0, 0);
  page.show?.();
}

function applyLayout(page) {
  const shell = document.querySelector('.shell');
  shell.classList.toggle('wide', !!page.wide);
  shell.classList.toggle('no-sidebar', page.sidebar === false);
  shell.classList.toggle('sidebar-no-search', !!page.hideSidebarSearch);
  document.querySelectorAll('.nav-item[data-nav]').forEach((a) => {
    const active = page.nav === a.dataset.nav;
    a.classList.toggle('active', active);
    const i = a.querySelector('.nav-icon');
    if (i && a.dataset.icon) i.innerHTML = icon(active ? a.dataset.icon + 'Fill' : a.dataset.icon);
  });
  setTitle(page.title || '');
}

let baseTitle = '';
export function setTitle(t) { baseTitle = t; updateTitle(); }
function updateTitle() {
  const n = state.unread.notifications + state.unread.messages;
  document.title = `${n ? `(${n}) ` : ''}${baseTitle ? baseTitle + ' / ' : ''}${APP_NAME}`;
}

// Перехват кликов по внутренним ссылкам
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  if (e.target.closest('[data-follow], [data-action]:not(a)')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  e.preventDefault();
  closeAllModals();
  navigate(url.pathname + url.search);
});

/* ============================== Общие элементы страниц ============================== */

export function pageHeader({ title = '', subtitle = '', back = false, right = '', tabs = null, activeTab = null, avatarOnMobile = false, logoOnMobile = false, className = '' } = {}) {
  return `<div class="page-header ${className}">
    <div class="ph-row">
      ${back ? `<button class="icon-btn ph-back" data-back aria-label="Назад">${icon('back')}</button>` : ''}
      ${avatarOnMobile && state.me ? `<button class="ph-avatar mobile-only" data-drawer aria-label="Меню">${avatar(state.me, 32, { link: false })}</button>` : ''}
      <div class="ph-titles ${logoOnMobile ? 'desktop-only' : ''}">${title ? `<h2 class="ph-title">${title}</h2>` : ''}${subtitle ? `<div class="ph-sub">${subtitle}</div>` : ''}</div>
      ${logoOnMobile ? `<div class="ph-logo mobile-only">${icon('logo')}</div>` : ''}
      <div class="ph-right">${right}</div>
    </div>
    ${tabs ? `<nav class="tabs">${tabs.map(([key, label, href]) => `<a class="tab ${key === activeTab ? 'active' : ''}" ${href ? `href="${esc(href)}"` : ''} data-tab="${esc(key)}"><span>${label}</span></a>`).join('')}</nav>` : ''}
  </div>`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) {
    e.preventDefault();
    if (history.state && history.state.internal) history.back(); else navigate('/home', { replace: true });
  }
  if (e.target.closest('[data-drawer]')) { e.preventDefault(); openDrawer(); }
});

/* ============================== Каркас ============================== */

const NAV = [
  { key: 'home', href: '/home', icon: 'home', label: 'Главная' },
  { key: 'explore', href: '/explore', icon: 'search', label: 'Обзор' },
  { key: 'notifications', href: '/notifications', icon: 'bell', label: 'Уведомления', badge: 'notifications' },
  { key: 'messages', href: '/messages', icon: 'mail', label: 'Сообщения', badge: 'messages' },
  { key: 'bookmarks', href: '/i/bookmarks', icon: 'bookmark', label: 'Закладки' },
  { key: 'premium', href: '/premium', icon: 'lightning', label: 'Premium', noFill: true },
  { key: 'profile', href: null, icon: 'user', label: 'Профиль' },
];

function shellHtml() {
  const me = state.me;
  return `<div class="shell">
    <header class="nav" role="banner">
      <div class="nav-inner">
        <div class="nav-top">
          <a href="/home" class="nav-logo" aria-label="${APP_NAME}">${icon('logo')}</a>
          <nav class="nav-items">
            ${NAV.map((n) => `<a href="${n.href || '/' + esc(me.username)}" class="nav-item" data-nav="${n.key}" ${n.noFill ? '' : `data-icon="${n.icon}"`}>
              <span class="nav-icon-wrap"><span class="nav-icon">${icon(n.icon)}</span>${n.badge ? `<span class="badge" data-badge="${n.badge}" hidden></span>` : ''}</span>
              <span class="nav-label">${n.label}</span></a>`).join('')}
            <button class="nav-item" data-more-menu><span class="nav-icon-wrap"><span class="nav-icon">${icon('more')}</span></span><span class="nav-label">Ещё</span></button>
          </nav>
          <button class="btn btn-accent nav-post" data-compose><span class="nav-post-label">Опубликовать</span><span class="nav-post-icon">${icon('feather')}</span></button>
        </div>
        <button class="account-switcher" data-account-menu>
          <span class="as-avatar">${avatar(me, 40, { link: false })}</span>
          <span class="as-names"><span class="as-name"><span class="truncate">${esc(me.name)}</span>${me.verified ? icon('verified') : ''}</span><span class="as-handle">@${esc(me.username)}</span></span>
          <span class="as-dots">${icon('dots')}</span>
        </button>
      </div>
    </header>
    <main class="main" role="main">
      <div class="main-inner">
        <div class="primary-col" id="primary"></div>
        <aside class="sidebar-col" id="sidebar"></aside>
      </div>
    </main>
    <nav class="bottom-nav">
      ${NAV.slice(0, 4).map((n) => `<a href="${n.href}" class="nav-item" data-nav="${n.key}" data-icon="${n.icon}"><span class="nav-icon-wrap"><span class="nav-icon">${icon(n.icon)}</span>${n.badge ? `<span class="badge" data-badge="${n.badge}" hidden></span>` : ''}</span></a>`).join('')}
    </nav>
    <button class="fab" data-compose aria-label="Опубликовать">${icon('feather')}</button>
  </div>`;
}

export function refreshShellUser() {
  const me = state.me;
  const as = document.querySelector('.account-switcher');
  if (as) {
    as.querySelector('.as-avatar').innerHTML = avatar(me, 40, { link: false });
    as.querySelector('.as-name').innerHTML = `<span class="truncate">${esc(me.name)}</span>${me.verified ? icon('verified') : ''}`;
  }
  document.querySelector('.nav-item[data-nav="profile"]')?.setAttribute('href', '/' + me.username);
}

function updateBadges() {
  document.querySelectorAll('[data-badge]').forEach((b) => {
    const n = state.unread[b.dataset.badge] || 0;
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  });
  updateTitle();
}
on('unread', (u) => { state.unread = u; updateBadges(); });

/* ============================== Боковая панель ============================== */

async function renderSidebar() {
  const sb = document.getElementById('sidebar');
  sb.innerHTML = `<div class="sidebar-inner">
    <div class="sb-search">${searchBox()}</div>
    <section class="sb-card sb-premium">
      <h2>Подпишитесь на Premium</h2>
      <p>Подпишитесь, чтобы открыть новые функции и получить синюю галочку.</p>
      <a href="/premium" class="btn btn-accent">Подписаться</a>
    </section>
    <section class="sb-card sb-trends"><h2>Что происходит</h2><div class="sb-list">${'<div class="spinner-wrap"><div class="spinner"></div></div>'}</div></section>
    <section class="sb-card sb-who"><h2>Кого читать</h2><div class="sb-list"></div><a href="/explore/tabs/people" class="sb-more">Показать ещё</a></section>
    <footer class="sb-footer">
      <a href="/settings">Условия использования</a><a href="/settings">Политика конфиденциальности</a><a href="/settings">Файлы cookie</a><a href="/settings">Специальные возможности</a><a href="/premium">Реклама</a><span>© 2026 ${APP_NAME}</span>
    </footer>
  </div>`;
  attachSearch(sb.querySelector('.sb-search'));
  if (state.me.verified) sb.querySelector('.sb-premium').remove();
  const inner = sb.querySelector('.sidebar-inner');
  new ResizeObserver(() => inner.style.setProperty('--sbh', inner.offsetHeight + 'px')).observe(inner);
  loadTrendsInto(sb.querySelector('.sb-trends .sb-list'), 5);
  loadWhoToFollow(sb.querySelector('.sb-who .sb-list'), 3);
}

export function trendHtml(t, i) {
  return `<a class="trend" href="/search?q=${encodeURIComponent('#' + t.tag)}">
    <div class="trend-meta">${i + 1} · ${t.category === 'Актуальное' ? 'Актуально' : `${esc(t.category)} · Актуально`}</div>
    <div class="trend-name">#${esc(t.tag)}</div>
    <div class="trend-meta">${fmtNum(t.posts)} ${plural(t.posts, ['пост', 'поста', 'постов'])}</div>
    <span class="icon-btn trend-more" aria-hidden="true">${icon('dots')}</span>
  </a>`;
}
export async function loadTrendsInto(box, limit, category) {
  try {
    const { trends } = await get(`/api/trends?limit=${limit}${category ? '&category=' + encodeURIComponent(category) : ''}`);
    box.innerHTML = trends.length ? trends.map(trendHtml).join('') : '<div class="sb-empty">Пока нет актуальных тем</div>';
  } catch { box.innerHTML = '<div class="sb-empty">Не удалось загрузить темы</div>'; }
}
export async function loadWhoToFollow(box, limit) {
  const { userCell } = await import('./ui.js');
  try {
    const { users } = await get(`/api/suggestions?limit=${limit}`);
    box.innerHTML = users.length ? users.map((u) => userCell(u, { bio: false })).join('') : '<div class="sb-empty">Вы уже читаете всех 🎉</div>';
  } catch { box.innerHTML = ''; }
}
on('follow', () => {
  const box = document.querySelector('.sb-who .sb-list');
  if (box && !box.matches(':hover')) setTimeout(() => loadWhoToFollow(box, 3), 1500);
});

/* Поиск с подсказками */
export function searchBox(value = '') {
  return `<form class="search-box" role="search" autocomplete="off">
    <span class="sbx-icon">${icon('search')}</span>
    <input type="search" name="q" placeholder="Поиск" value="${esc(value)}" aria-label="Поисковый запрос">
    <button type="button" class="sbx-clear" aria-label="Очистить" ${value ? '' : 'hidden'}>${icon('close')}</button>
    <div class="sbx-dropdown" hidden></div>
  </form>`;
}
export function attachSearch(container) {
  const form = container.querySelector('.search-box');
  const input = form.querySelector('input');
  const dd = form.querySelector('.sbx-dropdown');
  const clear = form.querySelector('.sbx-clear');
  const go = (q) => { dd.hidden = true; input.blur(); navigate('/search?q=' + encodeURIComponent(q)); };
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); if (q) go(q); });
  clear.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = ''; clear.hidden = true; suggest(); input.focus(); });
  const suggest = debounce(async () => {
    const q = input.value.trim();
    clear.hidden = !q;
    if (!q) { dd.innerHTML = '<div class="sbx-hint">Попробуйте найти людей, темы или ключевые слова</div>'; return; }
    try {
      const { users, tags } = await get('/api/search/typeahead?q=' + encodeURIComponent(q));
      dd.innerHTML = `<a class="sbx-row sbx-query" href="/search?q=${encodeURIComponent(q)}">${icon('search')}<span>${esc(q)}</span></a>`
        + tags.map((t) => `<a class="sbx-row sbx-query" href="/search?q=${encodeURIComponent('#' + t.tag)}">${icon('search')}<span>#${esc(t.tag)}</span></a>`).join('')
        + users.map((u) => `<a class="sbx-row sbx-user" href="/${esc(u.username)}">${avatar(u, 40, { link: false })}<span class="sbx-user-names"><span class="sbx-user-name">${esc(u.name)}${u.verified ? icon('verified') : ''}</span><span class="sbx-user-handle">@${esc(u.username)}</span></span></a>`).join('')
        + `<a class="sbx-row sbx-goto" href="/${esc(q.replace(/^@/, ''))}">Перейти к @${esc(q.replace(/^@/, ''))}</a>`;
    } catch { /* ничего */ }
  }, 150);
  input.addEventListener('input', suggest);
  input.addEventListener('focus', () => { form.classList.add('focused'); dd.hidden = false; suggest(); });
  input.addEventListener('blur', () => { form.classList.remove('focused'); setTimeout(() => { dd.hidden = true; }, 150); });
  dd.addEventListener('mousedown', (e) => e.preventDefault());
  dd.addEventListener('click', () => { dd.hidden = true; input.blur(); });
}

/* ============================== Меню «Ещё», аккаунт, мобильное меню ============================== */

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-compose]')) {
    e.preventDefault();
    import('./post.js').then((m) => m.openComposeModal());
  }
  const more = e.target.closest('[data-more-menu]');
  if (more) {
    openMenu(more, [
      { icon: 'list', label: 'Списки', onClick: () => toast('Списки появятся в следующем обновлении') },
      { icon: 'users', label: 'Сообщества', onClick: () => toast('Сообщества появятся в следующем обновлении') },
      { icon: 'lightning', label: 'Premium', href: '/premium' },
      { separator: true },
      { icon: 'gear', label: 'Настройки и конфиденциальность', href: '/settings' },
      { icon: 'display', label: 'Оформление', onClick: () => import('./pages/settings.js').then((m) => m.openDisplay()) },
      { icon: 'key', label: 'Сочетания клавиш', onClick: shortcutsHelp },
    ], { align: 'left', className: 'menu-more', width: 318 });
  }
  const acc = e.target.closest('[data-account-menu]');
  if (acc) {
    openMenu(acc, [
      { icon: 'user', label: 'Профиль', href: '/' + state.me.username },
      { icon: 'logout', label: `Выйти из учётной записи @${state.me.username}`, onClick: logout },
    ], { align: 'left', width: 300 });
  }
});

function openDrawer() {
  const me = state.me;
  const d = el(`<div class="drawer-layer"><div class="drawer-backdrop"></div><div class="drawer">
    <div class="drawer-head">${avatar(me, 40)}<div class="drawer-name">${esc(me.name)}${me.verified ? icon('verified') : ''}</div><div class="drawer-handle">@${esc(me.username)}</div>
      <div class="drawer-stats"><a href="/${esc(me.username)}/following"><b>${fmtNum(me.followingCount)}</b> в читаемых</a><a href="/${esc(me.username)}/followers"><b>${fmtNum(me.followers)}</b> читателей</a></div></div>
    <a class="drawer-item" href="/${esc(me.username)}">${icon('user')}<span>Профиль</span></a>
    <a class="drawer-item" href="/premium">${icon('lightning')}<span>Premium</span></a>
    <a class="drawer-item" href="/i/bookmarks">${icon('bookmark')}<span>Закладки</span></a>
    <a class="drawer-item" href="/settings">${icon('gear')}<span>Настройки</span></a>
    <button class="drawer-item" data-display>${icon('display')}<span>Оформление</span></button>
    <button class="drawer-item" data-logout>${icon('logout')}<span>Выйти</span></button>
  </div></div>`);
  const close = () => { d.classList.add('closing'); setTimeout(() => d.remove(), 200); };
  d.addEventListener('click', (e) => {
    if (e.target.closest('.drawer-backdrop, a')) close();
    if (e.target.closest('[data-display]')) { close(); import('./pages/settings.js').then((m) => m.openDisplay()); }
    if (e.target.closest('[data-logout]')) { close(); logout(); }
  });
  document.getElementById('layers').append(d);
}

export async function logout() {
  try { await post('/api/logout'); } catch { /* ничего */ }
  location.href = '/';
}
on('unauthorized', () => { location.reload(); });

/* ============================== Горячие клавиши ============================== */

let gPressed = 0;
document.addEventListener('keydown', (e) => {
  if (!state.me || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal-layer')) return;
  const k = e.key.toLowerCase();
  if (Date.now() - gPressed < 1000) {
    const map = { h: '/home', e: '/explore', n: '/notifications', m: '/messages', b: '/i/bookmarks', p: '/' + state.me.username, s: '/settings' };
    gPressed = 0;
    if (map[k]) { e.preventDefault(); navigate(map[k]); }
    return;
  }
  if (k === 'g') { gPressed = Date.now(); return; }
  if (k === 'n') { e.preventDefault(); import('./post.js').then((m) => m.openComposeModal()); }
  if (k === '/') { const i = document.querySelector('.search-box input'); if (i && i.offsetParent) { e.preventDefault(); i.focus(); } }
  if (k === '?') shortcutsHelp();
  if (k === 'j' || k === 'k') {
    const posts = [...document.querySelectorAll('#primary .post[data-id]')];
    if (!posts.length) return;
    const cur = posts.indexOf(document.activeElement);
    const next = posts[Math.max(0, Math.min(posts.length - 1, cur + (k === 'j' ? 1 : -1)))];
    next.focus(); next.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  const focused = document.activeElement?.closest?.('.post[data-id]');
  if (focused) {
    const act = { l: 'like', r: 'reply', t: 'repost', b: 'bookmark' }[k];
    if (act) { e.preventDefault(); focused.querySelector(`.post-actions [data-action="${act}"]`)?.click(); }
  }
});
function shortcutsHelp() {
  import('./ui.js').then(({ openModal }) => openModal({ title: 'Сочетания клавиш', content: `<div class="shortcuts">
    ${[['n', 'Новый пост'], ['/', 'Поиск'], ['j / k', 'Следующий / предыдущий пост'], ['l', 'Нравится'], ['r', 'Ответить'], ['t', 'Репост'], ['b', 'Закладка'], ['Enter', 'Открыть пост'], ['g h', 'Главная'], ['g e', 'Обзор'], ['g n', 'Уведомления'], ['g m', 'Сообщения'], ['g b', 'Закладки'], ['g p', 'Профиль'], ['g s', 'Настройки'], ['?', 'Эта справка'], ['Ctrl + Enter', 'Отправить пост']].map(([key, d]) => `<div class="sc-row"><span>${d}</span><kbd>${key}</kbd></div>`).join('')}
  </div>` }));
}

/* ============================== Realtime ============================== */

function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('unread', (e) => emit('unread', JSON.parse(e.data)));
  es.addEventListener('message', (e) => emit('dm', JSON.parse(e.data)));
  es.addEventListener('post', (e) => emit('newpost', JSON.parse(e.data)));
  es.addEventListener('read', (e) => emit('dmread', JSON.parse(e.data)));
}

/* ============================== Запуск ============================== */

async function boot() {
  const app = document.getElementById('app');
  try {
    const d = await get('/api/me');
    state.me = d.user; state.unread = d.unread;
  } catch {
    const auth = await import('./pages/auth.js');
    app.replaceChildren(auth.landing());
    document.title = `${APP_NAME}. Что происходит / ${APP_NAME}`;
    return;
  }
  app.innerHTML = shellHtml();
  updateBadges();
  renderSidebar();
  connectEvents();
  await render(false);
}

on('me', (u) => { state.me = { ...state.me, ...u }; refreshShellUser(); });
boot();
