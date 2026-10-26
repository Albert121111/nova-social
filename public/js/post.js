import { el, esc, avatar, richText, relTime, fullTime, fmtNum, fmtCount, timeLeft, plural, highlightComposer, charCount, readImage, pickFiles } from './util.js';
import { icon } from './icons.js';
import { api, get, post as apiPost, del, state, emit, trackView } from './api.js';
import { openModal, openMenu, toast, confirmDialog, openLightbox, setFollowState, closeAllModals, userCell, spinner, emptyState, errorState } from './ui.js';
import { navigate, cachedRoots } from './app.js';

const postUrl = (p) => `/${p.author.username}/status/${p.id}`;

/* ============================== Рендер поста ============================== */

function mediaGrid(media, { small = false } = {}) {
  if (!media || !media.length) return '';
  const n = media.length;
  const items = media.map((src, i) => `<button class="media-cell" data-action="media" data-index="${i}" tabindex="-1"><img src="${esc(src)}" alt="Изображение" loading="lazy"></button>`).join('');
  return `<div class="media media-${n} ${small ? 'media-small' : ''}" data-media='${esc(JSON.stringify(media))}'>${items}</div>`;
}

function pollHtml(p) {
  const poll = p.poll;
  if (!poll) return '';
  const mine = state.me && p.author.id === state.me.id;
  const showResults = poll.voted >= 0 || poll.closed || mine;
  const max = Math.max(...poll.options.map((o) => o.votes));
  let body;
  if (!showResults) {
    body = poll.options.map((o, i) => `<button class="poll-choice" data-action="vote" data-option="${i}">${esc(o.text)}</button>`).join('');
  } else {
    body = poll.options.map((o, i) => {
      const pct = poll.total ? Math.round((o.votes / poll.total) * 1000) / 10 : 0;
      const win = o.votes === max && max > 0;
      return `<div class="poll-result ${win ? 'win' : ''}">
        <div class="poll-bar" style="width:${Math.max(pct, 0.6)}%"></div>
        <span class="poll-label">${esc(o.text)}${poll.voted === i ? `<span class="poll-check">${icon('check')}</span>` : ''}</span>
        <span class="poll-pct">${pct.toLocaleString('ru-RU')}%</span>
      </div>`;
    }).join('');
  }
  return `<div class="poll" data-poll>${body}<div class="poll-meta">${fmtNum(poll.total)} ${plural(poll.total, ['голос', 'голоса', 'голосов'])} · ${poll.closed ? 'Окончательные результаты' : timeLeft(poll.endsAt)}</div></div>`;
}

function quoteHtml(q) {
  if (!q) return '';
  if (q.unavailable) return `<div class="quote quote-unavailable">Этот пост недоступен.</div>`;
  if (q.nested) return `<div class="quote quote-unavailable">Цитата</div>`;
  return `<div class="quote" data-quote-href="${esc(postUrl(q))}" role="link" tabindex="0">
    <div class="quote-head">${avatar(q.author, 20, { link: false })}<span class="quote-name truncate">${esc(q.author.name)}</span>${q.author.verified ? icon('verified') : ''}<span class="quote-handle truncate">@${esc(q.author.username)}</span><span class="dot">·</span><span class="quote-time">${relTime(q.createdAt)}</span></div>
    ${q.replyToUser ? `<div class="post-replyto">В ответ @${esc(q.replyToUser)}</div>` : ''}
    ${q.text ? `<div class="quote-text">${richText(q.text)}</div>` : ''}
    ${mediaGrid(q.media, { small: !!q.text })}
    ${q.poll ? `<div class="quote-poll">${icon('poll')} Опрос: ${q.poll.options.map((o) => esc(o.text)).join(' / ')}</div>` : ''}
  </div>`;
}

function actionsHtml(p, { detail = false } = {}) {
  const s = p.stats;
  const reposts = s.reposts + s.quotes;
  return `
    <button class="act act-reply" data-action="reply" aria-label="${s.replies} ответов. Ответить"><span class="act-ic">${icon('reply')}</span><span class="act-n">${fmtCount(s.replies)}</span></button>
    <button class="act act-repost ${p.reposted ? 'on' : ''}" data-action="repost" aria-label="${reposts} репостов"><span class="act-ic">${icon('repost')}</span><span class="act-n">${fmtCount(reposts)}</span></button>
    <button class="act act-like ${p.liked ? 'on' : ''}" data-action="like" aria-label="${s.likes} отметок «Нравится»"><span class="act-ic">${icon(p.liked ? 'heartFill' : 'heart')}</span><span class="act-n">${fmtCount(s.likes)}</span></button>
    ${detail ? `<button class="act act-bookmark ${p.bookmarked ? 'on' : ''}" data-action="bookmark" aria-label="Закладки"><span class="act-ic">${icon(p.bookmarked ? 'bookmarkFill' : 'bookmark')}</span><span class="act-n">${fmtCount(s.bookmarks)}</span></button>`
      : `<a class="act act-views" href="${esc(postUrl(p))}" data-action="views" aria-label="${p.views} просмотров"><span class="act-ic">${icon('views')}</span><span class="act-n">${fmtCount(p.views)}</span></a>`}
    <div class="act-group">
      ${detail ? '' : `<button class="act act-bookmark ${p.bookmarked ? 'on' : ''}" data-action="bookmark" aria-label="Закладки"><span class="act-ic">${icon(p.bookmarked ? 'bookmarkFill' : 'bookmark')}</span></button>`}
      <button class="act act-share" data-action="share" aria-label="Поделиться"><span class="act-ic">${icon('share')}</span></button>
    </div>`;
}

export function renderPost(p, opts = {}) {
  if (!p) return '';
  const a = p.author;
  let context = '';
  if (opts.pinned) context = `<div class="post-context">${icon('pin')}<span>Закреплено</span></div>`;
  else if (opts.repostBy) {
    const me = state.me && opts.repostBy.id === state.me.id;
    context = `<div class="post-context">${icon('repost')}<a href="/${esc(opts.repostBy.username)}" data-hovercard="${esc(opts.repostBy.username)}">${me ? 'Вы сделали репост' : `${esc(opts.repostBy.name)} сделал(а) репост`}</a></div>`;
  }
  const replyTo = p.replyTo && !opts.hideReplyTo
    ? `<div class="post-replyto">В ответ ${p.replyToUser ? `<a href="/${esc(p.replyToUser)}" data-hovercard="${esc(p.replyToUser)}">@${esc(p.replyToUser)}</a>` : '<span>на удалённый пост</span>'}</div>` : '';
  const long = charCount(p.text) > 280 && !opts.full;
  const text = long ? [...p.text].slice(0, 280).join('') + '…' : p.text;
  return `<article class="post ${opts.lineAbove ? 'has-line-above' : ''} ${opts.lineBelow ? 'has-line-below' : ''} ${opts.cls || ''}" data-id="${p.id}" data-href="${esc(postUrl(p))}" tabindex="0">
    ${context}
    <div class="post-grid">
      <div class="post-left">
        ${opts.lineAbove ? '<div class="thread-line-top"></div>' : ''}
        ${avatar(a, 40)}
        ${opts.lineBelow ? '<div class="thread-line"></div>' : ''}
      </div>
      <div class="post-main">
        <div class="post-head">
          <div class="post-head-names">
            <a href="/${esc(a.username)}" class="post-name" data-hovercard="${esc(a.username)}"><span class="truncate">${esc(a.name)}</span>${a.verified ? icon('verified') : ''}</a>
            <a href="/${esc(a.username)}" class="post-handle truncate" tabindex="-1" data-hovercard="${esc(a.username)}">@${esc(a.username)}</a>
            <span class="dot">·</span>
            <a href="${esc(postUrl(p))}" class="post-time" title="${esc(fullTime(p.createdAt))}"><time datetime="${new Date(p.createdAt).toISOString()}">${relTime(p.createdAt)}</time></a>
          </div>
          <button class="icon-btn post-more" data-action="more" aria-label="Ещё">${icon('dots')}</button>
        </div>
        ${replyTo}
        ${text ? `<div class="post-text" dir="auto">${richText(text)}${long ? ` <a href="${esc(postUrl(p))}" class="show-more">Показать ещё</a>` : ''}</div>` : ''}
        ${pollHtml(p)}
        ${mediaGrid(p.media)}
        ${quoteHtml(p.quote)}
        ${opts.noActions ? '' : `<div class="post-actions">${actionsHtml(p)}</div>`}
      </div>
    </div>
  </article>`;
}

export function renderItem(item, opts = {}) {
  return renderPost(item.post, { ...opts, repostBy: item.kind === 'repost' ? item.by : null });
}

export function renderDetailPost(p) {
  const a = p.author;
  return `<article class="post post-detail" data-id="${p.id}" tabindex="0">
    <div class="pd-head">
      ${avatar(a, 40)}
      <div class="pd-names">
        <a href="/${esc(a.username)}" class="post-name" data-hovercard="${esc(a.username)}"><span class="truncate">${esc(a.name)}</span>${a.verified ? icon('verified') : ''}</a>
        <a href="/${esc(a.username)}" class="post-handle" data-hovercard="${esc(a.username)}">@${esc(a.username)}</a>
      </div>
      <div class="pd-head-right">
        ${state.me && a.id !== state.me.id && !a.following ? `<button class="btn btn-inverse btn-sm follow-btn" data-follow="${esc(a.username)}">Читать</button>` : ''}
        <button class="icon-btn post-more" data-action="more" aria-label="Ещё">${icon('dots')}</button>
      </div>
    </div>
    ${p.replyTo ? `<div class="post-replyto">В ответ ${p.replyToUser ? `<a href="/${esc(p.replyToUser)}">@${esc(p.replyToUser)}</a>` : 'на удалённый пост'}</div>` : ''}
    ${p.text ? `<div class="pd-text" dir="auto">${richText(p.text)}</div>` : ''}
    ${pollHtml(p)}
    ${mediaGrid(p.media)}
    ${quoteHtml(p.quote)}
    <div class="pd-meta"><span>${esc(fullTime(p.createdAt))}</span><span class="dot">·</span><span><b>${fmtNum(p.views)}</b> ${plural(p.views, ['просмотр', 'просмотра', 'просмотров'])}</span></div>
    <div class="pd-stats" data-stats>${statsHtml(p)}</div>
    <div class="post-actions pd-actions">${actionsHtml(p, { detail: true })}</div>
  </article>`;
}
function statsHtml(p) {
  const s = p.stats;
  const parts = [];
  if (s.reposts) parts.push(`<a href="${esc(postUrl(p))}/reposts" data-engage="reposts"><b>${fmtNum(s.reposts)}</b> ${plural(s.reposts, ['репост', 'репоста', 'репостов'])}</a>`);
  if (s.quotes) parts.push(`<a href="${esc(postUrl(p))}/quotes" data-engage="quotes"><b>${fmtNum(s.quotes)}</b> ${plural(s.quotes, ['цитата', 'цитаты', 'цитат'])}</a>`);
  if (s.likes) parts.push(`<a href="${esc(postUrl(p))}/likes" data-engage="likes"><b>${fmtNum(s.likes)}</b> ${plural(s.likes, ['отметка «Нравится»', 'отметки «Нравится»', 'отметок «Нравится»'])}</a>`);
  if (s.bookmarks) parts.push(`<span><b>${fmtNum(s.bookmarks)}</b> ${plural(s.bookmarks, ['закладка', 'закладки', 'закладок'])}</span>`);
  return parts.join('');
}

/* ============================== Синхронизация состояния ============================== */

const store = new Map(); // id -> последняя версия поста
export function remember(p) {
  if (!p) return p;
  store.set(p.id, p);
  if (p.quote && p.quote.id && !p.quote.unavailable && !p.quote.nested) store.set(p.quote.id, p.quote);
  return p;
}
export function rememberItems(items) { for (const i of items) remember(i.post); return items; }

function allRoots() { return [document, ...cachedRoots()]; }

export function syncPost(p) {
  remember(p);
  for (const root of allRoots()) {
    root.querySelectorAll(`.post[data-id="${p.id}"]`).forEach((node) => {
      const detail = node.classList.contains('post-detail');
      const bar = node.querySelector(':scope .post-actions');
      if (bar) bar.innerHTML = actionsHtml(p, { detail });
      const poll = node.querySelector(':scope [data-poll]');
      if (poll && p.poll) poll.outerHTML = pollHtml(p);
      const stats = node.querySelector('[data-stats]');
      if (stats) stats.innerHTML = statsHtml(p);
    });
  }
}
function removePostNodes(id) {
  for (const root of allRoots()) root.querySelectorAll(`.post[data-id="${id}"]`).forEach((n) => n.remove());
}

/* ============================== Действия ============================== */

async function toggle(p, kind, node) {
  const was = kind === 'like' ? p.liked : kind === 'repost' ? p.reposted : p.bookmarked;
  const next = structuredClone(p);
  const key = kind === 'like' ? 'liked' : kind === 'repost' ? 'reposted' : 'bookmarked';
  const stat = kind === 'like' ? 'likes' : kind === 'repost' ? 'reposts' : 'bookmarks';
  next[key] = !was; next.stats[stat] += was ? -1 : 1;
  syncPost(next);
  if (kind === 'like' && !was) node?.querySelector('.act-like')?.classList.add('pop');
  try {
    const r = await apiPost(`/api/posts/${p.id}/${kind}`, { on: !was });
    syncPost(r.post);
    return r.post;
  } catch (e) { syncPost(p); toast(e.message); return p; }
}

export function sharePost(p, anchor) {
  const url = location.origin + postUrl(p);
  openMenu(anchor, [
    { icon: 'link', label: 'Копировать ссылку', onClick: async () => { try { await navigator.clipboard.writeText(url); toast('Скопировано в буфер обмена'); } catch { prompt('Ссылка на пост:', url); } } },
    { icon: 'mail', label: 'Отправить в личных сообщениях', onClick: () => import('./pages/messages.js').then((m) => m.pickRecipient((u) => apiPost(`/api/messages/${u.username}`, { text: url }).then(() => toast('Ваш пост отправлен'), (e) => toast(e.message)))) },
    ...(navigator.share ? [{ icon: 'share', label: 'Поделиться через…', onClick: () => navigator.share({ url }).catch(() => {}) }] : []),
  ]);
}

function moreMenu(p, anchor, node) {
  const mine = state.me && p.author.id === state.me.id;
  const items = [];
  if (mine) {
    items.push({ icon: 'trash', label: 'Удалить', danger: true, onClick: async () => {
      const ok = await confirmDialog({ title: 'Удалить пост?', text: 'Это действие невозможно отменить. Пост будет удалён из вашего профиля, ленты всех читателей и результатов поиска.', confirm: 'Удалить', danger: true });
      if (!ok) return;
      try { await del(`/api/posts/${p.id}`); removePostNodes(p.id); toast('Ваш пост удалён'); emit('deleted', p.id); if (location.pathname === postUrl(p)) history.back(); } catch (e) { toast(e.message); }
    } });
    const pinned = state.me.pinned === p.id;
    items.push({ icon: 'pin', label: pinned ? 'Открепить от профиля' : 'Закрепить в профиле', onClick: async () => {
      try { const r = await apiPost(`/api/posts/${p.id}/pin`); state.me.pinned = r.pinned; toast(r.pinned ? 'Пост закреплён в вашем профиле' : 'Пост откреплён от вашего профиля'); } catch (e) { toast(e.message); }
    } });
    items.push({ icon: 'chart', label: 'Статистика поста', onClick: () => postStats(p) });
  } else {
    items.push({ icon: 'sad', label: 'Не интересует этот пост', onClick: () => { node?.remove(); toast('Спасибо. Вы будете видеть меньше таких постов.'); } });
    items.push(p.author.following
      ? { icon: 'unfollow', label: `Не читать @${p.author.username}`, onClick: () => followToggle(p, false) }
      : { icon: 'follow', label: `Читать @${p.author.username}`, onClick: () => followToggle(p, true) });
    items.push({ icon: 'mail', label: `Написать @${p.author.username}`, href: `/messages/${p.author.username}` });
  }
  items.push({ icon: 'link', label: 'Копировать ссылку', onClick: () => navigator.clipboard?.writeText(location.origin + postUrl(p)).then(() => toast('Скопировано в буфер обмена')) });
  items.push({ icon: 'chart', label: 'Взаимодействия с постом', onClick: () => engagements(p, 'likes') });
  openMenu(anchor, items, { className: 'menu-post' });
}

async function followToggle(p, on) {
  try {
    const { user } = await apiPost(`/api/users/${p.author.username}/follow`, { on });
    setFollowState(p.author.username, user);
    for (const v of store.values()) if (v.author.id === user.id) v.author.following = user.following;
    toast(on ? `Вы читаете @${user.username}` : `Вы больше не читаете @${user.username}`);
  } catch (e) { toast(e.message); }
}

function postStats(p) {
  const s = p.stats;
  const box = el(`<div class="stats-modal">
    <div class="stats-grid">
      <div><div class="stats-n">${fmtNum(p.views)}</div><div class="stats-l">Просмотры</div></div>
      <div><div class="stats-n">${fmtNum(s.likes)}</div><div class="stats-l">Нравится</div></div>
      <div><div class="stats-n">${fmtNum(s.reposts + s.quotes)}</div><div class="stats-l">Репосты</div></div>
      <div><div class="stats-n">${fmtNum(s.replies)}</div><div class="stats-l">Ответы</div></div>
      <div><div class="stats-n">${fmtNum(s.bookmarks)}</div><div class="stats-l">Закладки</div></div>
      <div><div class="stats-n">${p.views ? ((s.likes + s.reposts + s.replies + s.bookmarks) / p.views * 100).toFixed(1) : 0}%</div><div class="stats-l">Вовлечённость</div></div>
    </div></div>`);
  openModal({ title: 'Статистика поста', content: box });
}

export async function engagements(p, tab = 'likes') {
  const tabs = [['likes', 'Отметки «Нравится»'], ['reposts', 'Репосты'], ['quotes', 'Цитаты']];
  const box = el(`<div class="engage"><div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" data-t="${k}"><span>${l}</span></button>`).join('')}</div><div class="engage-list"></div></div>`);
  const list = box.querySelector('.engage-list');
  const load = async (t) => {
    box.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    list.innerHTML = spinner();
    try {
      const d = await get(`/api/posts/${p.id}/engagements?type=${t}`);
      if (t === 'quotes') list.innerHTML = d.posts.length ? d.posts.map((q) => renderPost(remember(q))).join('') : emptyState('Цитат пока нет', 'Когда кто-нибудь процитирует этот пост, вы увидите это здесь.');
      else list.innerHTML = d.users.length ? d.users.map((u) => userCell(u)).join('') : emptyState(t === 'likes' ? 'Отметок «Нравится» пока нет' : 'Репостов пока нет', 'Когда они появятся, вы увидите их здесь.');
    } catch (e) { list.innerHTML = errorState(e.message, false); }
  };
  box.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) load(b.dataset.t); });
  openModal({ title: 'Взаимодействия с постом', content: box, className: 'modal-tall' });
  load(tab);
}

function repostMenu(p, anchor, node) {
  openMenu(anchor, [
    { icon: 'repost', label: p.reposted ? 'Отменить репост' : 'Сделать репост', onClick: async () => { const r = await toggle(p, 'repost', node); if (r.reposted) toast('Вы сделали репост'); } },
    { icon: 'quote', label: 'Цитировать', onClick: () => openComposeModal({ quote: p }) },
  ], { className: 'menu-repost', width: 220 });
}

export function openReplyModal(p) {
  const wrap = el(`<div class="reply-modal">
    ${renderPost(p, { noActions: true, lineBelow: true, cls: 'reply-target', hideReplyTo: true })}
    <div class="reply-to-line">В ответ <a href="/${esc(p.author.username)}">@${esc(p.author.username)}</a></div>
  </div>`);
  const m = openModal({ content: wrap, className: 'modal-compose' });
  const c = createComposer({ replyTo: p, modal: true, onPosted: (np) => { m.close(); toast('Ваш ответ отправлен.', { label: 'Посмотреть', href: postUrl(np) }); } });
  wrap.append(c);
  setTimeout(() => c.querySelector('textarea').focus(), 40);
}

export function openComposeModal({ quote = null } = {}) {
  const m = openModal({ content: '', className: 'modal-compose', headerRight: '<span class="drafts-link">Черновики</span>' });
  const c = createComposer({ quote, modal: true, onPosted: (np) => { m.close(); toast('Ваш пост отправлен.', { label: 'Посмотреть', href: postUrl(np) }); } });
  m.body.append(c);
  setTimeout(() => c.querySelector('textarea').focus(), 40);
}

/* Делегирование кликов по постам */
document.addEventListener('click', async (e) => {
  const node = e.target.closest('.post');
  if (!node || !node.dataset.id) return;
  const p = store.get(node.dataset.id);
  if (!p) return;
  const actionEl = e.target.closest('[data-action]');
  if (actionEl && node.contains(actionEl)) {
    const a = actionEl.dataset.action;
    if (a === 'views') return; // обычная ссылка
    e.preventDefault(); e.stopPropagation();
    if (node.classList.contains('reply-target')) return;
    if (a === 'like') toggle(p, 'like', node);
    else if (a === 'bookmark') { const r = await toggle(p, 'bookmark', node); toast(r.bookmarked ? 'Добавлено в закладки' : 'Удалено из закладок', r.bookmarked ? { label: 'Открыть', href: '/i/bookmarks' } : null); emit('bookmark', r); }
    else if (a === 'repost') repostMenu(p, actionEl, node);
    else if (a === 'reply') openReplyModal(p);
    else if (a === 'share') sharePost(p, actionEl);
    else if (a === 'more') moreMenu(p, actionEl, node);
    else if (a === 'vote') {
      try { const r = await apiPost(`/api/posts/${p.id}/vote`, { option: Number(actionEl.dataset.option) }); syncPost(r.post); } catch (err) { toast(err.message); }
    } else if (a === 'media') {
      const box = actionEl.closest('.media');
      const urls = JSON.parse(box.dataset.media);
      if (box.closest('.quote')) { navigate(box.closest('.quote').dataset.quoteHref); return; }
      openLightbox(urls, Number(actionEl.dataset.index));
    }
    return;
  }
  const eng = e.target.closest('[data-engage]');
  if (eng) { e.preventDefault(); engagements(p, eng.dataset.engage); return; }
  if (e.target.closest('a, button, input, textarea, video, label')) return;
  const quote = e.target.closest('.quote[data-quote-href]');
  if (quote) { e.preventDefault(); navigate(quote.dataset.quoteHref); return; }
  if (node.classList.contains('post-detail') || node.classList.contains('reply-target')) return;
  if (window.getSelection && String(window.getSelection()).length > 0) return;
  closeAllModals();
  navigate(node.dataset.href);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const node = e.target.closest?.('.post[data-href]');
  if (node && e.target === node) navigate(node.dataset.href);
});

/* ============================== Лента с бесконечной прокруткой ============================== */

const viewObserver = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) { trackView(en.target.dataset.id); viewObserver.unobserve(en.target); }
}, { threshold: 0.5 });
export function observeViews(root) { root.querySelectorAll('.post[data-id]:not([data-viewed])').forEach((n) => { n.dataset.viewed = '1'; viewObserver.observe(n); }); }

/**
 * Создаёт ленту: load(cursor) → {items, cursor}. render(item) → html.
 */
export function createFeed({ load, render = (i) => renderItem(i), empty = () => emptyState('Здесь пока пусто'), className = '' }) {
  const root = el(`<div class="feed ${className}"><div class="feed-items"></div><div class="feed-sentinel"></div></div>`);
  const itemsBox = root.querySelector('.feed-items');
  const sentinel = root.querySelector('.feed-sentinel');
  let cursor = null, loading = false, done = false, count = 0;
  const seen = new Set();

  async function more() {
    if (loading || done) return;
    loading = true;
    sentinel.innerHTML = spinner();
    try {
      const d = await load(cursor);
      const items = (d.items || []).filter((i) => i.post && !seen.has(i.kind + i.post.id + (i.by?.id || '')));
      items.forEach((i) => { seen.add(i.kind + i.post.id + (i.by?.id || '')); remember(i.post); });
      itemsBox.insertAdjacentHTML('beforeend', items.map(render).join(''));
      count += items.length;
      observeViews(itemsBox);
      cursor = d.cursor;
      done = cursor == null;
      sentinel.innerHTML = done && !count ? empty() : '';
    } catch (e) {
      sentinel.innerHTML = errorState(e.message);
      sentinel.querySelector('[data-retry]')?.addEventListener('click', () => { loading = false; more(); });
      done = true; loading = false; return;
    }
    loading = false;
    if (!done && sentinel.getBoundingClientRect().top < window.innerHeight + 800) more();
  }
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) more(); }, { rootMargin: '800px' });
  io.observe(sentinel);

  root.feed = {
    reload() { cursor = null; done = false; count = 0; seen.clear(); itemsBox.innerHTML = ''; more(); },
    prepend(item) {
      remember(item.post);
      const key = item.kind + item.post.id + (item.by?.id || '');
      seen.add(key); count++;
      const n = el(render(item)); n.classList.add('fresh');
      itemsBox.prepend(n);
      sentinel.querySelector('.empty')?.remove();
    },
    more,
  };
  setTimeout(more, 0);
  return root;
}

/* ============================== Поле публикации ============================== */

const EMOJI = '😀 😂 🤣 😊 😍 🥰 😘 😎 🤩 🥳 😇 🙂 😉 😋 😜 🤔 🤨 😐 🙄 😏 😴 😮 😱 😭 😤 😡 🤯 🥺 😬 🤗 🤝 👍 👎 👏 🙌 🙏 💪 👀 🧠 👋 ✌️ 🤞 👌 🔥 ✨ 💯 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 ⭐ 🌟 ⚡ 🌈 ☀️ 🌙 🌊 🌸 🍕 🍔 🍩 ☕ 🍺 🎉 🎁 🎮 🎵 🎨 📸 🚀 ✈️ 🏆 ⚽ 🏀 💻 📱 📈 💡 ✅ ❌ ⚠️ 🤖 👑'.split(' ');

export function createComposer({ replyTo = null, quote = null, modal = false, inline = false, placeholder, onPosted } = {}) {
  const me = state.me;
  const limit = me.verified ? 4000 : 280;
  const ph = placeholder || (replyTo ? 'Опубликуйте свой ответ' : 'Что происходит?!');
  const root = el(`<div class="composer ${modal ? 'in-modal' : ''} ${inline ? 'inline collapsed' : ''}">
    <div class="cmp-progress"></div>
    ${inline && replyTo ? `<div class="cmp-replying">В ответ <a href="/${esc(replyTo.author.username)}">@${esc(replyTo.author.username)}</a></div>` : ''}
    <div class="cmp-row">
      <div class="cmp-left">${avatar(me, 40)}</div>
      <div class="cmp-main">
        <div class="cmp-field"><div class="cmp-backdrop" aria-hidden="true"></div><textarea rows="1" placeholder="${esc(ph)}" aria-label="Текст поста"></textarea></div>
        <div class="cmp-media"></div>
        <div class="cmp-poll"></div>
        ${quote ? `<div class="cmp-quote">${quoteHtml(quote)}</div>` : ''}
        ${!replyTo ? `<div class="cmp-audience"><button class="audience-btn" type="button">${icon('globe')}<span>Все могут ответить</span></button></div>` : ''}
        <div class="cmp-toolbar">
          <div class="cmp-tools">
            <button class="icon-btn accent" data-tool="image" title="Медиафайлы">${icon('image')}</button>
            <button class="icon-btn accent" data-tool="gif" title="GIF" disabled>${icon('gif')}</button>
            ${replyTo ? '' : `<button class="icon-btn accent" data-tool="poll" title="Опрос">${icon('poll')}</button>`}
            <button class="icon-btn accent" data-tool="emoji" title="Эмодзи">${icon('emoji')}</button>
          </div>
          <div class="cmp-right">
            <div class="cmp-counter"></div>
            <button class="btn btn-accent cmp-submit" disabled>${replyTo ? 'Ответить' : 'Опубликовать'}</button>
          </div>
        </div>
      </div>
    </div>
  </div>`);
  const ta = root.querySelector('textarea');
  const backdrop = root.querySelector('.cmp-backdrop');
  const mediaBox = root.querySelector('.cmp-media');
  const pollBox = root.querySelector('.cmp-poll');
  const submit = root.querySelector('.cmp-submit');
  const counter = root.querySelector('.cmp-counter');
  const media = []; // data URLs
  let poll = null;  // {options: [], days, hours, minutes}

  function update() {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    backdrop.innerHTML = highlightComposer(ta.value, limit);
    root.classList.toggle('has-text', !!ta.value);
    const n = charCount(ta.value);
    const left = limit - n;
    const pollOk = !poll || poll.options.filter((o) => o.trim()).length >= 2;
    const ok = (ta.value.trim() || media.length || quote) && left >= 0 && pollOk;
    submit.disabled = !ok;
    if (!n) { counter.innerHTML = ''; return; }
    const r = left <= 20 ? 13 : 9, C = 2 * Math.PI * r;
    const frac = Math.min(n / limit, 1);
    const color = left < 0 ? 'var(--danger)' : left <= 20 ? 'var(--warning)' : 'var(--accent)';
    counter.innerHTML = `<svg width="${r * 2 + 6}" height="${r * 2 + 6}" viewBox="0 0 ${r * 2 + 6} ${r * 2 + 6}" class="${left <= 20 ? 'big' : ''}">
      <circle cx="${r + 3}" cy="${r + 3}" r="${r}" fill="none" stroke="var(--border)" stroke-width="2.4"/>
      ${left > -10 ? `<circle cx="${r + 3}" cy="${r + 3}" r="${r}" fill="none" stroke="${color}" stroke-width="2.4" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" stroke-linecap="round" transform="rotate(-90 ${r + 3} ${r + 3})"/>` : ''}
      ${left <= 20 ? `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-size="12" fill="${left < 0 ? 'var(--danger)' : 'var(--text2)'}">${left}</text>` : ''}
    </svg>`;
    counter.classList.toggle('sep', true);
  }

  function renderMedia() {
    mediaBox.innerHTML = media.length ? `<div class="cmp-media-grid n${media.length}">${media.map((m, i) => `<div class="cmp-thumb"><img src="${m}" alt=""><button class="thumb-x" data-rm="${i}" aria-label="Удалить">${icon('close')}</button></div>`).join('')}</div>` : '';
    root.querySelector('[data-tool="image"]').disabled = media.length >= 4 || !!poll;
    const pb = root.querySelector('[data-tool="poll"]'); if (pb) pb.disabled = media.length > 0 || !!poll;
    update();
  }
  mediaBox.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { media.splice(Number(b.dataset.rm), 1); renderMedia(); } });

  async function addFiles(files) {
    for (const f of files) {
      if (media.length >= 4) { toast('Можно прикрепить до 4 изображений'); break; }
      try { media.push(await readImage(f)); } catch (e) { toast(e.message); }
    }
    renderMedia();
  }

  function renderPoll() {
    if (!poll) { pollBox.innerHTML = ''; renderMedia(); return; }
    const sel = (name, max, val) => `<label class="select"><span>${name}</span><select data-p="${name}">${Array.from({ length: max + 1 }, (_, i) => `<option ${i === val ? 'selected' : ''}>${i}</option>`).join('')}</select></label>`;
    pollBox.innerHTML = `<div class="poll-editor">
      <div class="pe-options">${poll.options.map((o, i) => `<div class="pe-row"><label class="field"><input maxlength="25" data-opt="${i}" value="${esc(o)}" placeholder=" "><span class="field-label">Вариант ${i + 1}${i > 1 ? ' (необязательно)' : ''}</span><span class="field-count">${charCount(o)} / 25</span></label>${i === poll.options.length - 1 && poll.options.length < 4 ? `<button class="icon-btn accent" data-add-opt title="Добавить вариант">${icon('plus')}</button>` : ''}</div>`).join('')}</div>
      <div class="pe-len"><div class="pe-len-title">Длительность опроса</div><div class="pe-selects">${sel('Дни', 7, poll.days)}${sel('Часы', 23, poll.hours)}${sel('Минуты', 59, poll.minutes)}</div></div>
      <button class="pe-remove" data-rm-poll>Удалить опрос</button>
    </div>`;
    renderMedia();
  }
  pollBox.addEventListener('input', (e) => {
    const i = e.target.dataset.opt;
    if (i !== undefined) { poll.options[i] = e.target.value; e.target.parentElement.querySelector('.field-count').textContent = `${charCount(e.target.value)} / 25`; update(); }
  });
  pollBox.addEventListener('change', (e) => {
    const k = e.target.dataset.p;
    if (k) { poll[{ 'Дни': 'days', 'Часы': 'hours', 'Минуты': 'minutes' }[k]] = Number(e.target.value); }
  });
  pollBox.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-opt]')) { poll.options.push(''); renderPoll(); pollBox.querySelector(`[data-opt="${poll.options.length - 1}"]`).focus(); }
    if (e.target.closest('[data-rm-poll]')) { poll = null; renderPoll(); }
  });

  root.querySelector('.cmp-tools').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tool]'); if (!b || b.disabled) return;
    const t = b.dataset.tool;
    if (t === 'image') addFiles(await pickFiles({ multiple: true }));
    if (t === 'poll') { poll = { options: ['', ''], days: 1, hours: 0, minutes: 0 }; renderPoll(); pollBox.querySelector('input').focus(); }
    if (t === 'emoji') {
      const menu = openMenu(b, [{ html: `<div class="emoji-grid">${EMOJI.map((x) => `<button class="emoji" data-e="${x}">${x}</button>`).join('')}</div>` }], { align: 'left', className: 'menu-emoji' });
      menu.querySelector('.emoji-grid').addEventListener('click', (ev) => {
        const eb = ev.target.closest('[data-e]'); if (!eb) return;
        const s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? ta.value.length;
        ta.value = ta.value.slice(0, s) + eb.dataset.e + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + eb.dataset.e.length;
        update();
      });
    }
  });

  root.querySelector('.audience-btn')?.addEventListener('click', (e) => {
    openMenu(e.currentTarget, [{ html: '<div class="menu-title">Кто может отвечать?<small>Выберите, кто может отвечать на этот пост. Любой упомянутый пользователь всегда может ответить.</small></div>' },
      { icon: 'globe', label: 'Все' }, { icon: 'user', label: 'Аккаунты, которые вы читаете' }, { icon: 'verified', label: 'Подтверждённые аккаунты' }], { align: 'left', width: 320 });
  });

  ta.addEventListener('input', update);
  ta.addEventListener('scroll', () => { backdrop.scrollTop = ta.scrollTop; });
  ta.addEventListener('focus', () => root.classList.remove('collapsed'));
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !submit.disabled) send(); });
  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drag'); });
  root.addEventListener('dragleave', () => root.classList.remove('drag'));
  root.addEventListener('drop', (e) => { e.preventDefault(); root.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });

  async function send() {
    submit.disabled = true; root.classList.add('sending');
    try {
      const body = { text: ta.value, media, replyTo: replyTo?.id, quoteOf: quote?.id };
      if (poll) body.poll = { options: poll.options, minutes: Math.max(5, poll.days * 1440 + poll.hours * 60 + poll.minutes) };
      const { post } = await apiPost('/api/posts', body);
      remember(post);
      ta.value = ''; media.length = 0; poll = null; renderPoll();
      if (inline) root.classList.add('collapsed');
      emit('posted', post);
      if (replyTo) { const parent = store.get(replyTo.id); if (parent) { const n = structuredClone(parent); n.stats.replies++; syncPost(n); } }
      if (quote) { const q = store.get(quote.id); if (q) { const n = structuredClone(q); n.stats.quotes++; syncPost(n); } }
      onPosted && onPosted(post);
    } catch (e) { toast(e.message); }
    root.classList.remove('sending');
    update();
  }
  submit.addEventListener('click', send);
  update();
  return root;
}

export { postUrl, spinner };
export async function fetchPost(id) { return get(`/api/posts/${id}`); }
export { api };
