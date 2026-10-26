import { el, avatar } from '../util.js';
import { icon } from '../icons.js';
import { get, on, state } from '../api.js';
import { pageHeader } from '../app.js';
import { createFeed, createComposer } from '../post.js';
import { emptyState } from '../ui.js';

export default function home() {
  let tab = 'foryou';
  try { tab = localStorage.getItem('homeTab') || 'foryou'; } catch { /* ничего */ }
  const root = el(`<div class="page page-home">
    ${pageHeader({ title: 'Главная', avatarOnMobile: true, logoOnMobile: true, className: 'home-header', tabs: [['foryou', 'Для вас'], ['following', 'Подписки']], activeTab: tab })}
    <div class="home-composer desktop-composer"></div>
    <button class="new-posts-pill" hidden>${icon('arrowUp')}<span class="np-avatars"></span><span>опубликовали</span></button>
    <div class="home-feeds"></div>
  </div>`);
  root.querySelector('.home-composer').append(createComposer({}));
  const feedsBox = root.querySelector('.home-feeds');
  const feeds = {};
  function getFeed(t) {
    if (!feeds[t]) {
      feeds[t] = createFeed({
        load: (cursor) => get(`/api/feed?tab=${t}${cursor != null ? '&cursor=' + cursor : ''}`),
        empty: () => t === 'following'
          ? emptyState('Добро пожаловать в Nova!', 'Читайте интересных людей — их посты будут появляться здесь.', '<a href="/explore/tabs/people" class="btn btn-accent btn-lg">Найти людей</a>')
          : emptyState('Пока нет постов', 'Будьте первым, кто что-нибудь опубликует!'),
      });
      feedsBox.append(feeds[t]);
    }
    return feeds[t];
  }
  function select(t) {
    tab = t;
    try { localStorage.setItem('homeTab', t); } catch { /* ничего */ }
    root.querySelectorAll('.tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    getFeed(t);
    for (const [k, f] of Object.entries(feeds)) f.hidden = k !== t;
  }
  root.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    e.preventDefault();
    if (b.dataset.tab === tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    select(b.dataset.tab);
    window.scrollTo(0, 0);
  });
  select(tab);

  // Новые посты от других — плашка «опубликовали»
  const pill = root.querySelector('.new-posts-pill');
  const fresh = [];
  const offNew = on('newpost', (d) => {
    if (d.reply) return;
    fresh.unshift(d);
    const avatars = [...new Map(fresh.map((x) => [x.authorId, x])).values()].slice(0, 3);
    pill.querySelector('.np-avatars').innerHTML = avatars.map((x) => avatar({ avatar: x.avatar }, 24, { link: false })).join('');
    pill.hidden = false;
  });
  pill.addEventListener('click', () => {
    fresh.length = 0; pill.hidden = true;
    window.scrollTo({ top: 0 });
    getFeed(tab).feed.reload();
  });
  const offPosted = on('posted', (p) => {
    if (p.replyTo) return;
    for (const f of Object.values(feeds)) f.feed.prepend({ kind: 'post', post: p, at: p.createdAt });
  });
  const offReselect = on('reselect', (path) => { if (path === '/home' && !pill.hidden) pill.click(); });
  const offDeleted = on('deleted', () => {});

  return {
    el: root, title: 'Главная', nav: 'home',
    destroy() { offNew(); offPosted(); offReselect(); offDeleted(); },
  };
}
