import { el, esc, avatar, relTime, clockTime, dayLabel, joinedDate, fmtNum, plural, richText, readImage, pickFiles, debounce } from '../util.js';
import { icon } from '../icons.js';
import { get, post, on, state, emit } from '../api.js';
import { navigate, setTitle } from '../app.js';
import { openModal, openMenu, openLightbox, toast, spinner, emptyState, errorState } from '../ui.js';

/* ---------- Выбор получателя (новое сообщение, «отправить пост») ---------- */

export function pickRecipient(onPick, { title = 'Новое сообщение' } = {}) {
  const box = el(`<div class="pick-recipient">
    <label class="pr-search">${icon('search')}<input placeholder="Поиск людей" autofocus></label>
    <div class="pr-list">${spinner()}</div>
  </div>`);
  const m = openModal({ title, content: box, className: 'modal-tall' });
  const list = box.querySelector('.pr-list');
  const input = box.querySelector('input');
  const row = (u) => `<button class="pr-row" data-u='${esc(JSON.stringify(u))}'>${avatar(u, 40, { link: false })}<span class="pr-names"><span class="pr-name">${esc(u.name)}${u.verified ? icon('verified') : ''}</span><span class="pr-handle">@${esc(u.username)}</span></span></button>`;
  const search = debounce(async () => {
    const q = input.value.trim();
    try {
      if (!q) {
        const { conversations } = await get('/api/messages');
        const { users } = await get('/api/suggestions?limit=8');
        const seen = new Set();
        const all = [...conversations.map((c) => c.user), ...users].filter((u) => !seen.has(u.id) && seen.add(u.id));
        list.innerHTML = all.map(row).join('') || '<div class="pr-empty">Начните вводить имя</div>';
      } else {
        const { users } = await get('/api/search?f=user&q=' + encodeURIComponent(q));
        list.innerHTML = users.map(row).join('') || `<div class="pr-empty">Ничего не найдено для «${esc(q)}»</div>`;
      }
    } catch (e) { list.innerHTML = errorState(e.message, false); }
  }, 150);
  input.addEventListener('input', search);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-u]'); if (!b) return;
    m.close(); onPick(JSON.parse(b.dataset.u));
  });
  search();
}

/* ---------- Страница сообщений (живёт, пока открыто приложение) ---------- */

let inst = null;

export default function messages(ctx) {
  if (!inst) inst = createMessages();
  inst.open(ctx.params.username || null);
  return { el: inst.root, title: 'Сообщения', nav: 'messages', wide: true, sidebar: false, cache: false, show: () => inst.refreshTitle() };
}

function createMessages() {
  const root = el(`<div class="page page-messages">
    <section class="dm-list-pane">
      <div class="page-header"><div class="ph-row">
        <button class="ph-avatar mobile-only" data-drawer aria-label="Меню">${avatar(state.me, 32, { link: false })}</button>
        <div class="ph-titles"><h2 class="ph-title">Сообщения</h2></div>
        <div class="ph-right"><a href="/settings" class="icon-btn" aria-label="Настройки">${icon('gear')}</a><button class="icon-btn" data-new aria-label="Новое сообщение">${icon('newMsg')}</button></div>
      </div></div>
      <label class="dm-filter">${icon('search')}<input placeholder="Поиск в личных сообщениях"></label>
      <div class="dm-convs">${spinner()}</div>
    </section>
    <section class="dm-chat-pane"></section>
  </div>`);
  const convsBox = root.querySelector('.dm-convs');
  const chat = root.querySelector('.dm-chat-pane');
  const filter = root.querySelector('.dm-filter input');
  let convs = [];
  let openUser = null; // username
  let chatState = null; // {user, messages, box}

  async function loadConvs() {
    try { convs = (await get('/api/messages')).conversations; renderConvs(); } catch (e) { convsBox.innerHTML = errorState(e.message, false); }
  }
  function renderConvs() {
    const q = filter.value.trim().toLowerCase();
    const list = convs.filter((c) => !q || c.user.name.toLowerCase().includes(q) || c.user.username.toLowerCase().includes(q));
    if (!convs.length) {
      convsBox.innerHTML = `<div class="dm-welcome"><h2>Добро пожаловать в почту!</h2><p>Обменивайтесь личными сообщениями с другими пользователями Nova.</p><button class="btn btn-accent btn-lg" data-new>Написать</button></div>`;
      return;
    }
    convsBox.innerHTML = list.map((c) => {
      const mine = c.last.from === state.me.id;
      const snippet = c.last.text || (c.last.media.length ? 'Отправлено фото' : '');
      return `<a class="dm-conv ${c.user.username === openUser ? 'active' : ''} ${c.unread ? 'unread' : ''}" href="/messages/${esc(c.user.username)}">
        ${avatar(c.user, 40, { link: false })}
        <div class="dm-conv-main">
          <div class="dm-conv-top"><span class="dm-conv-name truncate">${esc(c.user.name)}</span>${c.user.verified ? icon('verified') : ''}<span class="dm-conv-handle truncate">@${esc(c.user.username)}</span><span class="dot">·</span><span class="dm-conv-time">${relTime(c.last.createdAt)}</span></div>
          <div class="dm-conv-last truncate">${mine ? 'Вы: ' : ''}${esc(snippet)}</div>
        </div>
        ${c.unread ? '<span class="dm-dot"></span>' : ''}
      </a>`;
    }).join('') || `<div class="pr-empty">Ничего не найдено</div>`;
  }
  filter.addEventListener('input', renderConvs);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) pickRecipient((u) => navigate('/messages/' + u.username));
  });

  function emptyChat() {
    chat.innerHTML = `<div class="dm-empty"><h2>Выберите сообщение</h2><p>Выберите одну из существующих переписок или начните новую.</p><button class="btn btn-accent btn-lg" data-new>Новое сообщение</button></div>`;
  }

  async function openChat(username) {
    chat.innerHTML = spinner();
    try {
      const d = await get('/api/messages/' + encodeURIComponent(username));
      if (openUser !== username) return;
      renderChat(d.user, d.messages);
      const c = convs.find((x) => x.user.username === username);
      if (c && c.unread) { c.unread = 0; renderConvs(); }
      get('/api/unread').then((u) => emit('unread', u));
    } catch (e) { chat.innerHTML = errorState(e.message, false); }
  }

  function bubbleGroups(msgs) {
    let html = '', lastDay = '';
    msgs.forEach((m, i) => {
      const day = dayLabel(m.createdAt);
      if (day !== lastDay) { html += `<div class="dm-day">${day}</div>`; lastDay = day; }
      const next = msgs[i + 1];
      const mine = m.from === state.me.id;
      const endOfGroup = !next || next.from !== m.from || next.createdAt - m.createdAt > 120000 || dayLabel(next.createdAt) !== day;
      html += msgHtml(m, mine, endOfGroup, mine && i === msgs.length - 1);
    });
    return html;
  }
  function msgHtml(m, mine, showTime, last) {
    return `<div class="dm-msg ${mine ? 'mine' : 'theirs'} ${showTime ? 'end' : ''}" data-mid="${m.id}">
      ${m.media.length ? `<button class="dm-img" data-img="${esc(m.media[0])}"><img src="${esc(m.media[0])}" alt=""></button>` : ''}
      ${m.text ? `<div class="dm-bubble">${richText(m.text)}</div>` : ''}
      ${showTime ? `<div class="dm-time">${clockTime(m.createdAt)}${last ? ` · <span class="dm-seen">${m.read ? 'Прочитано' : 'Отправлено'}</span>` : ''}</div>` : ''}
    </div>`;
  }

  function renderChat(user, msgs) {
    chatState = { user, messages: msgs };
    chat.innerHTML = `<div class="page-header dm-chat-header"><div class="ph-row">
        <a class="icon-btn ph-back mobile-back" href="/messages" aria-label="Назад">${icon('back')}</a>
        <a class="dm-chat-title" href="/${esc(user.username)}">${avatar(user, 32, { link: false })}<span class="truncate">${esc(user.name)}</span>${user.verified ? icon('verified') : ''}</a>
        <div class="ph-right"><button class="icon-btn" data-chat-info aria-label="Информация">${icon('info')}</button></div>
      </div></div>
      <div class="dm-scroll">
        <a class="dm-profile" href="/${esc(user.username)}">
          ${avatar(user, 64, { link: false })}
          <div class="dm-profile-name">${esc(user.name)}${user.verified ? icon('verified') : ''}</div>
          <div class="dm-profile-handle">@${esc(user.username)}</div>
          ${user.bio ? `<div class="dm-profile-bio">${esc(user.bio)}</div>` : ''}
          <div class="dm-profile-meta">${joinedDate(user.createdAt)} · ${fmtNum(user.followers)} ${plural(user.followers, ['читатель', 'читателя', 'читателей'])}</div>
        </a>
        <div class="dm-msgs">${bubbleGroups(msgs)}</div>
      </div>
      <div class="dm-composer">
        <div class="dm-attach"></div>
        <div class="dm-input-row">
          <button class="icon-btn accent" data-dm-img aria-label="Фото">${icon('image')}</button>
          <button class="icon-btn accent" data-dm-emoji aria-label="Эмодзи">${icon('emoji')}</button>
          <textarea rows="1" placeholder="Начните новое сообщение"></textarea>
          <button class="icon-btn accent" data-dm-send aria-label="Отправить" disabled>${icon('send')}</button>
        </div>
      </div>`;
    const scroll = chat.querySelector('.dm-scroll');
    const ta = chat.querySelector('textarea');
    const sendBtn = chat.querySelector('[data-dm-send]');
    const attach = chat.querySelector('.dm-attach');
    let image = null;
    const upd = () => {
      ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
      sendBtn.disabled = !ta.value.trim() && !image;
    };
    const renderAttach = () => { attach.innerHTML = image ? `<div class="cmp-thumb"><img src="${image}" alt=""><button class="thumb-x" data-rm>${icon('close')}</button></div>` : ''; upd(); };
    attach.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { image = null; renderAttach(); } });
    ta.addEventListener('input', upd);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!sendBtn.disabled) send(); } });
    chat.querySelector('[data-dm-img]').addEventListener('click', async () => {
      const [f] = await pickFiles(); if (!f) return;
      try { image = await readImage(f, 1400); renderAttach(); } catch (err) { toast(err.message); }
    });
    chat.querySelector('[data-dm-emoji]').addEventListener('click', (e) => {
      const menu = openMenu(e.currentTarget, [{ html: `<div class="emoji-grid">${'😀 😂 😊 😍 🥰 😎 🤔 😮 😭 😡 👍 👎 👏 🙏 💪 🔥 ✨ ❤️ 💯 🎉 👀 😅 🙂 😉'.split(' ').map((x) => `<button class="emoji" data-e="${x}">${x}</button>`).join('')}</div>` }], { align: 'left', className: 'menu-emoji' });
      menu.querySelector('.emoji-grid').addEventListener('click', (ev) => { const b = ev.target.closest('[data-e]'); if (b) { ta.value += b.dataset.e; upd(); ta.focus(); } });
    });
    chat.querySelector('[data-chat-info]').addEventListener('click', () => navigate('/' + user.username));
    chat.querySelector('.dm-msgs').addEventListener('click', (e) => { const b = e.target.closest('[data-img]'); if (b) openLightbox([b.dataset.img]); });
    async function send() {
      const text = ta.value.trim();
      const media = image ? [image] : [];
      ta.value = ''; image = null; renderAttach();
      try {
        await post('/api/messages/' + encodeURIComponent(user.username), { text, media });
      } catch (err) { toast(err.message); ta.value = text; upd(); }
      ta.focus();
    }
    scroll.scrollTop = scroll.scrollHeight;
    setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; if (matchMedia('(min-width: 700px)').matches) ta.focus(); }, 50);
  }

  function appendMessage(m) {
    if (!chatState) return;
    if (chatState.messages.some((x) => x.id === m.id)) return;
    chatState.messages.push(m);
    const box = chat.querySelector('.dm-msgs');
    const scroll = chat.querySelector('.dm-scroll');
    const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 200;
    box.innerHTML = bubbleGroups(chatState.messages);
    if (nearBottom || m.from === state.me.id) scroll.scrollTop = scroll.scrollHeight;
  }

  on('dm', ({ message, user, own }) => {
    const other = own ? user : user;
    let c = convs.find((x) => x.user.id === other.id);
    if (!c) { c = { user: other, last: message, unread: 0 }; convs.unshift(c); }
    c.last = message;
    convs = [c, ...convs.filter((x) => x !== c)];
    const isOpen = chatState && chatState.user.id === other.id && document.body.contains(root);
    if (!own && !isOpen) c.unread++;
    if (isOpen) {
      appendMessage(message);
      if (!own) get('/api/messages/' + encodeURIComponent(other.username)).then(() => get('/api/unread')).then((u) => emit('unread', u)).catch(() => {});
    } else if (!own && !location.pathname.startsWith('/messages')) {
      toast(`${user.name}: ${message.text || 'фото'}`, { label: 'Открыть', href: '/messages/' + user.username });
    }
    renderConvs();
  });
  on('dmread', ({ by }) => {
    if (chatState && chatState.user.id === by) {
      chatState.messages.forEach((m) => { if (m.from === state.me.id) m.read = true; });
      const seen = chat.querySelector('.dm-seen'); if (seen) seen.textContent = 'Прочитано';
    }
  });

  loadConvs();
  return {
    root,
    open(username) {
      openUser = username;
      root.classList.toggle('has-chat', !!username);
      renderConvs();
      if (username) openChat(username); else { chatState = null; emptyChat(); }
      this.refreshTitle();
    },
    refreshTitle() { setTitle(chatState && openUser ? chatState.user?.name || 'Сообщения' : 'Сообщения'); },
  };
}
