import { el, esc, avatar, richText, relTime } from '../util.js';
import { icon } from '../icons.js';
import { get, post, on, state, emit } from '../api.js';
import { pageHeader, navigate } from '../app.js';
import { renderPost, remember, observeViews } from '../post.js';
import { emptyState, errorState, spinner } from '../ui.js';

const VERB = {
  like: ['отметил(а) ваш пост', 'отметили ваш пост'],
  repost: ['сделал(а) репост вашего поста', 'сделали репост вашего поста'],
  follow: ['читает вас', 'читают вас'],
};
const ICON = { like: ['heartFill', 'n-like'], repost: ['repost', 'n-repost'], follow: ['userFill', 'n-follow'] };

function groupHtml(n) {
  if (['reply', 'mention', 'quote'].includes(n.type)) {
    remember(n.post);
    return `<div class="notif-post ${n.unread ? 'unread' : ''}">${renderPost(n.post)}</div>`;
  }
  const [ic, cls] = ICON[n.type];
  const first = n.actors[0];
  const others = n.actors.length - 1;
  const who = `<b>${esc(first.name)}</b>${others ? ` и ещё ${others}` : ''}`;
  const verb = VERB[n.type][others ? 1 : 0];
  const href = n.type === 'follow' ? `/${first.username}` : `/${n.post.author.username}/status/${n.post.id}`;
  return `<div class="notif ${n.unread ? 'unread' : ''}" data-href="${esc(href)}">
    <div class="notif-icon ${cls}">${icon(ic)}</div>
    <div class="notif-main">
      <div class="notif-avatars">${n.actors.slice(0, 8).map((u) => avatar(u, 32)).join('')}<span class="notif-time">${relTime(n.createdAt)}</span></div>
      <div class="notif-text">${who} ${verb}</div>
      ${n.post && n.post.text ? `<div class="notif-quote">${richText(n.post.text)}</div>` : ''}
      ${n.post && !n.post.text && n.post.media.length ? `<div class="notif-thumb"><img src="${esc(n.post.media[0])}" alt=""></div>` : ''}
    </div>
  </div>`;
}

export default function notifications(ctx) {
  const tab = ctx.mentions ? 'mentions' : 'all';
  const root = el(`<div class="page page-notifications">
    ${pageHeader({ title: 'Уведомления', avatarOnMobile: true, right: `<a href="/settings" class="icon-btn" aria-label="Настройки">${icon('gear')}</a>`,
    tabs: [['all', 'Все', '/notifications'], ['mentions', 'Упоминания', '/notifications/mentions']], activeTab: tab })}
    <div class="notif-list">${spinner()}</div>
  </div>`);
  const list = root.querySelector('.notif-list');
  let visible = true;

  async function load() {
    try {
      const { notifications } = await get(`/api/notifications${tab === 'mentions' ? '?tab=mentions' : ''}`);
      list.innerHTML = notifications.length ? notifications.map(groupHtml).join('')
        : tab === 'mentions' ? emptyState('Здесь пока ничего нет', 'Когда кто-нибудь упомянет вас, вы увидите это здесь.')
          : emptyState('Здесь пока ничего нет', 'От отметок «Нравится» до репостов и многого другого — здесь вы найдёте все взаимодействия.');
      observeViews(list);
      if (state.unread.notifications) { await post('/api/notifications/read'); emit('unread', { ...state.unread, notifications: 0 }); }
    } catch (e) { list.innerHTML = errorState(e.message); }
  }
  list.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) { list.innerHTML = spinner(); load(); return; }
    const n = e.target.closest('.notif[data-href]');
    if (n && !e.target.closest('a')) navigate(n.dataset.href);
  });
  const off = on('unread', (u) => { if (visible && u.notifications > 0) load(); });
  load();
  return {
    el: root, title: 'Уведомления', nav: 'notifications', cache: false,
    hide() { visible = false; }, show() { visible = true; },
    destroy() { off(); },
  };
}
