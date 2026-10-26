import { el, esc, avatar, avatarUrl, richText, fmtNum, plural, joinedDate, readImage, pickFiles, charCount } from '../util.js';
import { icon } from '../icons.js';
import { get, put, on, state, emit } from '../api.js';
import { pageHeader, navigate } from '../app.js';
import { createFeed, renderPost, remember, observeViews } from '../post.js';
import { emptyState, errorState, followButton, openMenu, openModal, openLightbox, toast, spinner } from '../ui.js';
import { mediaTile } from './explore.js';

export default async function profile(ctx) {
  const username = ctx.params.username;
  const tab = ctx.tab;
  const root = el(`<div class="page page-profile">${pageHeader({ title: esc(username), back: true })}${spinner()}</div>`);
  let data;
  try { data = await get(`/api/users/${encodeURIComponent(username)}`); } catch (e) {
    root.innerHTML = `${pageHeader({ title: 'Профиль', back: true })}
      <div class="profile-banner"></div>
      <div class="profile-top"><div class="profile-avatar">${avatar(null, 133, { link: false })}</div></div>
      <div class="profile-info"><div class="profile-name">@${esc(username)}</div></div>
      ${e.status === 404 ? emptyState('Эта учётная запись не существует', 'Попробуйте поискать что-нибудь другое.') : errorState(e.message, false)}`;
    return { el: root, title: 'Профиль', nav: null };
  }
  const u = data.user;
  const isMe = u.isMe;
  if (isMe) { state.me = { ...state.me, ...u }; }

  const tabs = [['posts', 'Посты', `/${u.username}`], ['replies', 'Ответы', `/${u.username}/with_replies`], ['media', 'Медиа', `/${u.username}/media`]];
  if (isMe) tabs.push(['likes', 'Нравится', `/${u.username}/likes`]);

  const website = u.website ? (/^https?:\/\//.test(u.website) ? u.website : 'https://' + u.website) : '';
  root.innerHTML = `
    ${pageHeader({ title: `<span class="ph-name">${esc(u.name)}${u.verified ? icon('verified') : ''}</span>`, subtitle: `${fmtNum(u.posts)} ${plural(u.posts, ['пост', 'поста', 'постов'])}`, back: true })}
    <div class="profile-banner" ${u.banner ? `style="background-image:url('${esc(u.banner)}')" data-banner="${esc(u.banner)}"` : ''}></div>
    <div class="profile-top">
      <button class="profile-avatar" data-avatar>${avatar(u, 133, { link: false })}</button>
      <div class="profile-actions">
        ${isMe ? '<button class="btn btn-outline" data-edit>Изменить профиль</button>'
          : `<button class="icon-btn btn-round-outline" data-pmore aria-label="Ещё">${icon('dots')}</button>
             <a class="icon-btn btn-round-outline" href="/messages/${esc(u.username)}" aria-label="Сообщение">${icon('mail')}</a>
             ${followButton(u)}`}
      </div>
    </div>
    <div class="profile-info">
      <div class="profile-name">${esc(u.name)}${u.verified ? icon('verified') : ''}${isMe && !u.verified ? `<a href="/premium" class="get-verified">${icon('verified')}Получить подтверждение</a>` : ''}</div>
      <div class="profile-handle">@${esc(u.username)}${u.followsYou ? '<span class="badge-soft">Читает вас</span>' : ''}</div>
      ${u.bio ? `<div class="profile-bio">${richText(u.bio)}</div>` : ''}
      <div class="profile-meta">
        ${u.location ? `<span>${icon('location')}${esc(u.location)}</span>` : ''}
        ${website ? `<span>${icon('link')}<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(u.website.replace(/^https?:\/\//, ''))}</a></span>` : ''}
        <span>${icon('calendar')}${joinedDate(u.createdAt)}</span>
      </div>
      <div class="profile-stats">
        <a href="/${esc(u.username)}/following"><b>${fmtNum(u.followingCount)}</b> в читаемых</a>
        <a href="/${esc(u.username)}/followers"><b data-followers>${fmtNum(u.followers)}</b> ${plural(u.followers, ['читатель', 'читателя', 'читателей'])}</a>
      </div>
      ${!isMe && data.mutuals.length ? `<a class="profile-mutuals" href="/${esc(u.username)}/followers_you_follow"><span class="mutual-avatars">${data.mutuals.map((m) => avatar(m, 20, { link: false })).join('')}</span><span>Читают ${data.mutuals.map((m) => esc(m.name)).join(', ')}</span></a>` : ''}
    </div>
    <nav class="tabs profile-tabs">${tabs.map(([k, l, href]) => `<a class="tab ${k === tab ? 'active' : ''}" href="${esc(href)}"><span>${l}</span></a>`).join('')}</nav>
    <div class="profile-feed"></div>`;

  const feedBox = root.querySelector('.profile-feed');
  if (tab === 'posts' && data.pinned) {
    remember(data.pinned);
    feedBox.insertAdjacentHTML('beforeend', renderPost(data.pinned, { pinned: true }));
    observeViews(feedBox);
  }
  const emptyByTab = {
    posts: () => isMe ? emptyState('Вы ещё ничего не публиковали', 'Когда вы опубликуете пост, он появится здесь.') : emptyState(`@${u.username} ещё ничего не публиковал(а)`, 'Когда это произойдёт, посты появятся здесь.'),
    replies: () => emptyState(isMe ? 'Вы ещё никому не отвечали' : `@${u.username} ещё никому не отвечал(а)`, 'Когда это произойдёт, ответы появятся здесь.'),
    media: () => emptyState(isMe ? 'Освещайте мир камерой' : `У @${u.username} нет медиафайлов`, isMe ? 'Когда вы опубликуете фото, они появятся здесь.' : 'Когда они появятся, вы увидите их здесь.'),
    likes: () => emptyState('У вас пока нет отметок «Нравится»', 'Нажмите на сердечко у любого поста, чтобы показать, что он вам нравится. Здесь будут все такие посты.'),
  };
  const feed = createFeed({
    className: tab === 'media' ? 'media-grid-feed' : '',
    render: tab === 'media' ? mediaTile : undefined,
    empty: data.pinned && tab === 'posts' ? () => '' : emptyByTab[tab],
    load: (cursor) => get(`/api/users/${encodeURIComponent(u.username)}/posts?tab=${tab}${cursor != null ? '&cursor=' + cursor : ''}`),
  });
  feedBox.append(feed);

  root.querySelector('[data-avatar]').addEventListener('click', () => { if (u.avatar) openLightbox([u.avatar]); });
  root.querySelector('[data-banner]')?.addEventListener('click', () => openLightbox([u.banner]));
  root.querySelector('[data-edit]')?.addEventListener('click', () => editProfile(u));
  root.querySelector('[data-pmore]')?.addEventListener('click', (e) => {
    openMenu(e.currentTarget, [
      { icon: 'link', label: 'Копировать ссылку на профиль', onClick: () => navigator.clipboard?.writeText(location.origin + '/' + u.username).then(() => toast('Скопировано в буфер обмена')) },
      { icon: 'search', label: 'Искать посты', href: '/search?q=' + encodeURIComponent('from:' + u.username) },
      { icon: 'mail', label: `Написать @${u.username}`, href: '/messages/' + u.username },
    ]);
  });

  const off = on('posted', (p) => { if (isMe && tab === 'posts' && !p.replyTo) feed.feed.prepend({ kind: 'post', post: p, at: p.createdAt }); });
  const off2 = on('follow', (x) => {
    if (x.id === u.id) { const b = root.querySelector('[data-followers]'); if (b) b.textContent = fmtNum(x.followers); }
  });
  return { el: root, title: `${u.name} (@${u.username})`, nav: isMe ? 'profile' : null, destroy() { off(); off2(); } };
}

/* ---------- Редактирование профиля ---------- */

function field(name, label, value, max, textarea = false) {
  return `<label class="field ${textarea ? 'field-area' : ''}">
    ${textarea ? `<textarea name="${name}" maxlength="${max}" placeholder=" " rows="3">${esc(value)}</textarea>` : `<input name="${name}" maxlength="${max}" value="${esc(value)}" placeholder=" ">`}
    <span class="field-label">${label}</span><span class="field-count">${charCount(value)} / ${max}</span>
  </label>`;
}

export function editProfile(u) {
  const changes = {};
  const box = el(`<form class="edit-profile">
    <div class="ep-banner" style="${u.banner ? `background-image:url('${esc(u.banner)}')` : ''}">
      <div class="ep-overlay"><button type="button" class="icon-btn ep-btn" data-pick="banner" aria-label="Добавить фото баннера">${icon('camera')}</button>
      <button type="button" class="icon-btn ep-btn" data-rm-banner aria-label="Удалить" ${u.banner ? '' : 'hidden'}>${icon('close')}</button></div>
    </div>
    <div class="ep-avatar"><img src="${esc(avatarUrl(u))}" alt=""><div class="ep-overlay"><button type="button" class="icon-btn ep-btn" data-pick="avatar" aria-label="Добавить аватар">${icon('camera')}</button></div></div>
    <div class="ep-fields">
      ${field('name', 'Имя', u.name, 50)}
      ${field('bio', 'О себе', u.bio, 160, true)}
      ${field('location', 'Местоположение', u.location, 30)}
      ${field('website', 'Веб-сайт', u.website, 100)}
      <div class="ep-row"><span>Дата регистрации</span><span>${joinedDate(u.createdAt).replace('Регистрация: ', '')}</span></div>
      <a class="ep-row ep-link" href="/premium"><span>${u.verified ? 'У вас есть Premium ✓' : 'Перейти на Premium'}</span>${icon('chevron')}</a>
    </div>
  </form>`);
  const m = openModal({ title: 'Изменить профиль', content: box, className: 'modal-edit', headerRight: '<button class="btn btn-inverse btn-sm" data-save>Сохранить</button>' });
  box.addEventListener('input', (e) => {
    const f = e.target.closest('.field'); if (!f) return;
    f.querySelector('.field-count').textContent = `${charCount(e.target.value)} / ${e.target.maxLength}`;
  });
  box.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const [f] = await pickFiles(); if (!f) return;
      try {
        const kind = pick.dataset.pick;
        const data = await readImage(f, kind === 'banner' ? 1500 : 400, 0.9);
        changes[kind] = data;
        if (kind === 'banner') { box.querySelector('.ep-banner').style.backgroundImage = `url('${data}')`; box.querySelector('[data-rm-banner]').hidden = false; }
        else box.querySelector('.ep-avatar img').src = data;
      } catch (err) { toast(err.message); }
    }
    if (e.target.closest('[data-rm-banner]')) { changes.banner = null; box.querySelector('.ep-banner').style.backgroundImage = ''; e.target.closest('[data-rm-banner]').hidden = true; }
  });
  m.root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    const fd = new FormData(box);
    const body = { ...changes, name: fd.get('name'), bio: fd.get('bio'), location: fd.get('location'), website: fd.get('website') };
    try {
      const { user } = await put('/api/me', body);
      emit('me', user);
      m.close();
      navigate(location.pathname, { replace: true });
    } catch (err) { toast(err.message); btn.disabled = false; }
  });
}
