import { el, esc } from '../util.js';
import { icon } from '../icons.js';
import { get, del, on, state } from '../api.js';
import { pageHeader } from '../app.js';
import { createFeed } from '../post.js';
import { emptyState, openMenu, confirmDialog, toast } from '../ui.js';

export default function bookmarks() {
  const empty = () => emptyState('Сохраняйте посты на потом', 'Добавляйте посты в закладки, чтобы легко находить их в будущем.');
  const root = el(`<div class="page page-bookmarks">
    ${pageHeader({ title: 'Закладки', subtitle: '@' + esc(state.me.username), back: true, right: `<button class="icon-btn" data-bm-menu aria-label="Ещё">${icon('dots')}</button>` })}
  </div>`);
  let feed = createFeed({ load: () => get('/api/bookmarks'), empty });
  root.append(feed);
  root.querySelector('[data-bm-menu]').addEventListener('click', (e) => {
    openMenu(e.currentTarget, [{ icon: 'trash', label: 'Удалить все закладки', danger: true, onClick: async () => {
      if (!(await confirmDialog({ title: 'Удалить все закладки?', text: 'Это действие невозможно отменить, и все выбранные вами закладки будут удалены.', confirm: 'Удалить', danger: true }))) return;
      try { await del('/api/bookmarks'); feed.feed.reload(); toast('Все закладки удалены'); } catch (err) { toast(err.message); }
    } }]);
  });
  const off = on('bookmark', (p) => {
    if (!p.bookmarked) root.querySelectorAll(`.post[data-id="${p.id}"]`).forEach((n) => n.remove());
    else if (!root.querySelector(`.post[data-id="${p.id}"]`)) feed.feed.prepend({ kind: 'post', post: p, at: Date.now() });
    if (!root.querySelector('.post')) feed.feed.reload();
  });
  return { el: root, title: 'Закладки', nav: 'bookmarks', cache: false, destroy: off };
}
