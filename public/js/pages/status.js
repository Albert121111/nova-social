import { el } from '../util.js';
import { get, on } from '../api.js';
import { pageHeader } from '../app.js';
import { renderPost, renderDetailPost, remember, createComposer, observeViews, engagements } from '../post.js';
import { emptyState, errorState, spinner } from '../ui.js';

export default async function status(ctx) {
  const id = ctx.params.id;
  const root = el(`<div class="page page-status">${pageHeader({ title: 'Пост', back: true })}<div class="status-body">${spinner()}</div></div>`);
  const body = root.querySelector('.status-body');
  let d;
  try { d = await get(`/api/posts/${encodeURIComponent(id)}`); } catch (e) {
    body.innerHTML = e.status === 404 ? emptyState('Хм… эта страница не существует.', 'Попробуйте поискать что-нибудь другое.') : errorState(e.message, false);
    return { el: root, title: 'Пост' };
  }
  const p = remember(d.post);
  let html = '';
  d.ancestors.forEach((a, i) => {
    if (a.unavailable) { html += `<div class="post-unavailable">Этот пост недоступен.</div>`; return; }
    remember(a);
    html += renderPost(a, { lineAbove: i > 0 && !d.ancestors[i - 1].unavailable, lineBelow: true, cls: 'ancestor' });
  });
  html += `<div class="status-main ${d.ancestors.length ? 'has-ancestors' : ''}">${d.ancestors.length ? '<div class="thread-line-into"></div>' : ''}${renderDetailPost(p)}</div>`;
  body.innerHTML = html;
  const composer = createComposer({ replyTo: p, inline: true });
  body.append(composer);
  const replies = el('<div class="replies"></div>');
  const renderReply = (r) => {
    remember(r);
    if (r.child) { remember(r.child); return `<div class="reply-thread">${renderPost(r, { lineBelow: true, hideReplyTo: true })}${renderPost(r.child, { lineAbove: true, hideReplyTo: true })}</div>`; }
    return renderPost(r, { hideReplyTo: true });
  };
  replies.innerHTML = d.replies.map(renderReply).join('');
  body.append(replies);
  observeViews(body);

  const off = on('posted', (np) => {
    if (np.replyTo !== p.id) return;
    const n = el(renderPost(np, { hideReplyTo: true }));
    n.classList.add('fresh');
    replies.prepend(n);
  });
  return {
    el: root, title: `${p.author.name}: «${p.text.slice(0, 40)}${p.text.length > 40 ? '…' : ''}»`, nav: null,
    show() {
      if (d.ancestors.length) {
        const main = root.querySelector('.status-main');
        requestAnimationFrame(() => window.scrollTo(0, main.getBoundingClientRect().top + window.scrollY - 53));
      }
      if (['likes', 'reposts', 'quotes'].includes(ctx.params.engage)) engagements(p, ctx.params.engage);
    },
    destroy: off,
  };
}
