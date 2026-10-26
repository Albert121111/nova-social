import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { get } from '../api.js';
import { pageHeader, searchBox, attachSearch, loadTrendsInto, loadWhoToFollow, navigate, trendHtml } from '../app.js';
import { createFeed, postUrl } from '../post.js';
import { emptyState, userCell, spinner } from '../ui.js';

const EXPLORE_TABS = [['for_you', 'Для вас'], ['trending', 'Актуальное'], ['news', 'Новости'], ['sports', 'Спорт'], ['entertainment', 'Развлечения'], ['people', 'Люди']];
const CATEGORY = { news: 'Новости', sports: 'Спорт', entertainment: 'Развлечения' };

export function mediaTile(item) {
  const p = item.post;
  return `<a class="media-tile" href="${esc(postUrl(p))}"><img src="${esc(p.media[0])}" alt="" loading="lazy">${p.media.length > 1 ? `<span class="tile-multi">${icon('image')}</span>` : ''}</a>`;
}

export default function explore(ctx) {
  if (ctx.hashtag) { setTimeout(() => navigate('/search?q=' + encodeURIComponent('#' + ctx.params.tag), { replace: true })); return { el: el('<div></div>') }; }
  return ctx.search ? searchPage(ctx) : explorePage(ctx);
}

function headerWithSearch(value, back, tabs, active) {
  return `<div class="page-header explore-header">
    <div class="ph-row">
      ${back ? `<button class="icon-btn ph-back" data-back aria-label="Назад">${icon('back')}</button>` : `<button class="ph-avatar mobile-only" data-drawer aria-label="Меню"></button>`}
      <div class="ph-search">${searchBox(value)}</div>
      <a href="/settings" class="icon-btn" aria-label="Настройки">${icon('gear')}</a>
    </div>
    <nav class="tabs tabs-scroll">${tabs.map(([k, l, href]) => `<a class="tab ${k === active ? 'active' : ''}" href="${esc(href)}" data-tab="${k}"><span>${l}</span></a>`).join('')}</nav>
  </div>`;
}

function explorePage(ctx) {
  const tab = ctx.params.tab || 'for_you';
  const root = el(`<div class="page page-explore">
    ${headerWithSearch('', false, EXPLORE_TABS.map(([k, l]) => [k, l, k === 'for_you' ? '/explore' : `/explore/tabs/${k}`]), tab)}
    <div class="explore-body"></div>
  </div>`);
  root.querySelector('.ph-avatar')?.remove();
  attachSearch(root.querySelector('.ph-search'));
  const body = root.querySelector('.explore-body');

  if (tab === 'people') {
    body.innerHTML = `<h2 class="section-title">Кого читать</h2><div class="who-list">${spinner()}</div>`;
    loadWhoToFollow(body.querySelector('.who-list'), 30);
  } else if (tab === 'trending') {
    body.innerHTML = `<div class="trend-list">${spinner()}</div>`;
    loadTrendsInto(body.querySelector('.trend-list'), 30);
  } else if (CATEGORY[tab]) {
    body.innerHTML = `<div class="trend-list">${spinner()}</div><h2 class="section-title">Популярные посты</h2>`;
    get(`/api/trends?limit=10&category=${encodeURIComponent(CATEGORY[tab])}`).then(({ trends }) => {
      body.querySelector('.trend-list').innerHTML = trends.length ? trends.map(trendHtml).join('') : emptyState('Пока ничего', 'В этой категории ещё нет актуальных тем.');
      if (trends.length) {
        const q = trends.slice(0, 3).map((t) => '#' + t.tag);
        let idx = 0;
        body.append(createFeed({ load: async (cursor) => {
          // объединяем посты по нескольким темам категории
          const res = await get(`/api/search?q=${encodeURIComponent(q[idx])}&f=top${cursor ? '&cursor=' + cursor : ''}`);
          if (res.cursor == null && idx < q.length - 1) { idx++; return { items: res.items, cursor: 0 }; }
          return res;
        } }));
      } else body.querySelector('.section-title').remove();
    });
  } else {
    body.innerHTML = `<div class="explore-hero">${spinner()}</div><div class="trend-list"></div>
      <div class="explore-who"><h2 class="section-title">Кого читать</h2><div class="who-list"></div><a class="sb-more" href="/explore/tabs/people">Показать ещё</a></div>
      <h2 class="section-title">Популярное</h2>`;
    get('/api/trends?limit=11').then(({ trends }) => {
      const hero = body.querySelector('.explore-hero');
      if (!trends.length) { hero.remove(); return; }
      const t = trends[0];
      get(`/api/search?q=${encodeURIComponent('#' + t.tag)}&f=media`).then((r) => {
        const img = r.items[0]?.post.media[0];
        hero.innerHTML = `<a class="hero-card" href="/search?q=${encodeURIComponent('#' + t.tag)}" style="${img ? `background-image:url('${esc(img)}')` : ''}">
          <div class="hero-shade"></div><div class="hero-text"><div class="hero-cat">${esc(t.category)} · В тренде</div><div class="hero-title">#${esc(t.tag)}</div></div></a>`;
      });
      body.querySelector('.trend-list').innerHTML = trends.slice(1).map(trendHtml).join('');
    });
    loadWhoToFollow(body.querySelector('.who-list'), 3);
    body.append(createFeed({ load: (cursor) => get(`/api/feed?tab=foryou${cursor != null ? '&cursor=' + cursor : ''}`) }));
  }
  return { el: root, title: 'Обзор', nav: 'explore', hideSidebarSearch: true };
}

function searchPage(ctx) {
  const q = ctx.query.get('q') || '';
  const f = ctx.query.get('f') || 'top';
  const tabs = [['top', 'Популярное'], ['live', 'Последнее'], ['user', 'Люди'], ['media', 'Медиа']]
    .map(([k, l]) => [k, l, `/search?q=${encodeURIComponent(q)}${k === 'top' ? '' : '&f=' + k}`]);
  const root = el(`<div class="page page-search">
    ${headerWithSearch(q, true, tabs, f)}
    <div class="search-body"></div>
  </div>`);
  attachSearch(root.querySelector('.ph-search'));
  const body = root.querySelector('.search-body');
  const noResults = () => emptyState(`Нет результатов для «${q}»`, 'Попробуйте поискать что-нибудь другое или проверьте настройки поиска.');

  if (!q) body.innerHTML = emptyState('Ищите в Nova', 'Находите людей, темы и посты.');
  else if (f === 'user') {
    body.innerHTML = spinner();
    get(`/api/search?q=${encodeURIComponent(q)}&f=user`).then(({ users }) => {
      body.innerHTML = users.length ? users.map((u) => userCell(u)).join('') : noResults();
    });
  } else if (f === 'media') {
    body.append(createFeed({ className: 'media-grid-feed', render: mediaTile, empty: noResults, load: (c) => get(`/api/search?q=${encodeURIComponent(q)}&f=media${c ? '&cursor=' + c : ''}`) }));
  } else {
    let first = true;
    body.append(createFeed({
      empty: noResults,
      load: async (c) => {
        const r = await get(`/api/search?q=${encodeURIComponent(q)}&f=${f}${c ? '&cursor=' + c : ''}`);
        if (first && r.users?.length) {
          first = false;
          const box = el(`<div class="search-people"><h2 class="section-title">Люди</h2>${r.users.map((u) => userCell(u)).join('')}<a class="sb-more" href="/search?q=${encodeURIComponent(q)}&f=user">Показать все</a></div>`);
          body.prepend(box);
        }
        first = false;
        return r;
      },
    }));
  }
  return { el: root, title: q ? `${q} — поиск` : 'Поиск', nav: 'explore', hideSidebarSearch: true };
}
