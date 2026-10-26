import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { get, state } from '../api.js';
import { pageHeader } from '../app.js';
import { userCell, emptyState, errorState, spinner } from '../ui.js';

export default async function follows(ctx) {
  const username = ctx.params.username;
  const list = ctx.list;
  const root = el(`<div class="page page-follows">${pageHeader({ title: '@' + esc(username), back: true })}${spinner()}</div>`);
  let d;
  try { d = await get(`/api/users/${encodeURIComponent(username)}/${list}`); } catch (e) {
    root.innerHTML = pageHeader({ title: 'Профиль', back: true }) + errorState(e.message, false);
    return { el: root, title: 'Профиль' };
  }
  const u = d.user;
  const tabs = [['followers', 'Читатели', `/${u.username}/followers`], ['following', 'Читаемые', `/${u.username}/following`]];
  if (!u.isMe) tabs.unshift(['mutuals', 'Знакомые', `/${u.username}/followers_you_follow`]);
  const empty = {
    followers: u.isMe ? emptyState('Ищете читателей?', 'Когда кто-нибудь начнёт вас читать, вы увидите этого пользователя здесь.') : emptyState(`У @${u.username} пока нет читателей`, 'Когда кто-то начнёт читать этого пользователя, он появится здесь.'),
    following: u.isMe ? emptyState('Будьте в курсе событий', 'Читайте пользователей, которые вам интересны.', '<a class="btn btn-accent btn-lg" href="/explore/tabs/people">Найти людей</a>') : emptyState(`@${u.username} пока никого не читает`, 'Когда это произойдёт, вы увидите это здесь.'),
    mutuals: emptyState(`У @${u.username} нет общих с вами читателей`, 'Когда кто-то из тех, кого вы читаете, начнёт читать этого пользователя, он появится здесь.'),
  }[list];
  root.innerHTML = `${pageHeader({ title: `<span class="ph-name">${esc(u.name)}${u.verified ? icon('verified') : ''}</span>`, subtitle: '@' + esc(u.username), back: true, tabs, activeTab: list })}
    <div class="user-list">${d.users.length ? d.users.map((x) => userCell(x)).join('') : empty}</div>`;
  return { el: root, title: list === 'followers' ? `Читатели @${u.username}` : list === 'following' ? `Читаемые @${u.username}` : `Знакомые читатели`, nav: u.isMe ? 'profile' : null, cache: false };
}
