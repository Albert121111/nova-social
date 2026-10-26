import { el, esc, avatar, APP_NAME } from '../util.js';
import { icon } from '../icons.js';
import { post, state } from '../api.js';
import { pageHeader, display, logout, navigate } from '../app.js';
import { openModal, toast } from '../ui.js';
import { renderPost } from '../post.js';

const SECTIONS = [
  ['account', 'Ваша учётная запись', 'Сведения об учётной записи, смена пароля, профиль.', 'user'],
  ['display', 'Оформление', 'Тема, цвет акцента и размер шрифта.', 'display'],
  ['premium', 'Premium', 'Синяя галочка и длинные посты до 4000 символов.', 'lightning'],
  ['shortcuts', 'Сочетания клавиш', 'Быстрая навигация с клавиатуры.', 'key'],
  ['about', `О ${APP_NAME}`, 'Версия, хранение данных и запуск в локальной сети.', 'info'],
];

export default function settings(ctx) {
  const section = ctx.params.section || null;
  const root = el(`<div class="page page-settings ${section ? 'has-detail' : ''}">
    <section class="settings-list-pane">
      ${pageHeader({ title: 'Настройки', back: true })}
      <div class="settings-list">
        ${SECTIONS.map(([k, t, d, ic]) => `<a class="settings-item ${k === section ? 'active' : ''}" href="/settings/${k}" data-s="${k}">
          <span class="si-icon">${icon(ic)}</span><span class="si-text"><span class="si-title">${esc(t)}</span><span class="si-desc">${esc(d)}</span></span>${icon('chevron')}</a>`).join('')}
        <button class="settings-item danger" data-logout><span class="si-icon">${icon('logout')}</span><span class="si-text"><span class="si-title">Выйти</span><span class="si-desc">Выйти из учётной записи @${esc(state.me.username)}</span></span></button>
      </div>
    </section>
    <section class="settings-detail-pane"></section>
  </div>`);
  const detail = root.querySelector('.settings-detail-pane');
  root.querySelector('[data-logout]').addEventListener('click', logout);
  root.querySelector('.settings-list').addEventListener('click', (e) => {
    const a = e.target.closest('[data-s]'); if (!a) return;
    if (a.dataset.s === 'display') { e.preventDefault(); e.stopPropagation(); openDisplay(); }
    if (a.dataset.s === 'premium') { e.preventDefault(); e.stopPropagation(); navigate('/premium'); }
    if (a.dataset.s === 'shortcuts') { e.preventDefault(); e.stopPropagation(); document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })); }
  });

  if (section === 'account') {
    const me = state.me;
    detail.innerHTML = `${pageHeader({ title: 'Ваша учётная запись', back: true })}
      <div class="settings-block">
        <a class="account-card" href="/${esc(me.username)}">${avatar(me, 48, { link: false })}<div><div class="ac-name">${esc(me.name)}${me.verified ? icon('verified') : ''}</div><div class="ac-handle">@${esc(me.username)}</div></div></a>
        <div class="settings-row"><span>Имя пользователя</span><b>@${esc(me.username)}</b></div>
        <div class="settings-row"><span>Подтверждение</span><b>${me.verified ? 'Premium' : 'Нет'}</b></div>
        <a class="settings-row link" href="/${esc(me.username)}">Изменить профиль ${icon('chevron')}</a>
      </div>
      <form class="settings-block pw-form">
        <h3>Сменить пароль</h3>
        <label class="field"><input type="password" name="current" placeholder=" " autocomplete="current-password" required><span class="field-label">Текущий пароль</span></label>
        <label class="field"><input type="password" name="next" placeholder=" " autocomplete="new-password" minlength="6" required><span class="field-label">Новый пароль</span></label>
        <label class="field"><input type="password" name="repeat" placeholder=" " autocomplete="new-password" minlength="6" required><span class="field-label">Подтвердите пароль</span></label>
        <button class="btn btn-accent">Сохранить</button>
      </form>`;
    detail.querySelector('.pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (f.get('next') !== f.get('repeat')) return toast('Пароли не совпадают');
      try { await post('/api/me/password', { current: f.get('current'), next: f.get('next') }); toast('Пароль изменён'); e.target.reset(); } catch (err) { toast(err.message); }
    });
  } else if (section === 'about') {
    detail.innerHTML = `${pageHeader({ title: `О ${APP_NAME}`, back: true })}
      <div class="settings-block prose">
        <p><b>${APP_NAME}</b> — социальная сеть, которая работает на вашем компьютере. Все данные хранятся в папке <code>data</code> рядом с сервером: <code>db.json</code> и загруженные картинки в <code>data/uploads</code>.</p>
        <p>Чтобы друзья могли зайти с телефона или другого компьютера в той же Wi-Fi сети, откройте адрес «В локальной сети», который сервер печатает при запуске.</p>
        <p>Чтобы начать с чистого листа, остановите сервер и удалите папку <code>data</code> — при следующем запуске создадутся демо-данные.</p>
      </div>`;
  } else {
    detail.innerHTML = `<div class="settings-placeholder">${icon('gear')}<p>Выберите раздел настроек</p></div>`;
  }
  return { el: root, title: 'Настройки', nav: null, wide: true, sidebar: false, cache: false };
}

export function openDisplay() {
  const d = display.get();
  const me = state.me;
  const sample = {
    id: 'preview', text: `В центре внимания ${APP_NAME} — люди и то, что у них происходит. Упоминания @username, хэштеги #вот_так и ссылки подсвечиваются цветом акцента.`,
    media: [], createdAt: Date.now() - 3600e3 * 2, views: 1200,
    author: { id: 'x', username: APP_NAME.toLowerCase(), name: APP_NAME, avatar: '/favicon.svg', verified: true },
    stats: { replies: 12, reposts: 48, quotes: 3, likes: 316, bookmarks: 9 }, liked: true,
  };
  const box = el(`<div class="display-settings">
    <h2 class="ds-title">Настройте вид</h2>
    <p class="ds-sub">Эти настройки влияют на все учётные записи ${APP_NAME} в этом браузере.</p>
    <div class="ds-preview">${renderPost(sample, { cls: 'preview-post' })}</div>
    <div class="ds-label">Размер шрифта</div>
    <div class="ds-card ds-font"><span class="aa small">Аа</span><div class="font-track">${[0, 1, 2, 3, 4].map((i) => `<button class="font-dot ${i <= d.font ? 'filled' : ''} ${i === d.font ? 'current' : ''}" data-font="${i}" aria-label="Размер ${i + 1}"></button>`).join('')}<div class="font-line"><div class="font-fill" style="width:${d.font * 25}%"></div></div></div><span class="aa big">Аа</span></div>
    <div class="ds-label">Цвет</div>
    <div class="ds-card ds-colors">${Object.entries(display.ACCENTS).map(([k, c]) => `<button class="color-dot ${k === d.accent ? 'on' : ''}" style="background:${c}" data-accent="${k}" aria-label="${k}">${icon('check')}</button>`).join('')}</div>
    <div class="ds-label">Фон</div>
    <div class="ds-card ds-bg">
      ${[['light', 'По умолчанию'], ['dim', 'Приглушённый'], ['dark', 'Без подсветки']].map(([k, l]) => `<button class="bg-opt bg-${k} ${k === d.theme ? 'on' : ''}" data-theme-opt="${k}"><span class="radio">${icon('check')}</span><span>${l}</span></button>`).join('')}
    </div>
    <button class="btn btn-accent btn-lg ds-done">Готово</button>
  </div>`);
  box.querySelector('.ds-preview .post').classList.add('reply-target');
  const m = openModal({ content: box, noHeader: true, className: 'modal-display' });
  box.addEventListener('click', (e) => {
    const f = e.target.closest('[data-font]');
    if (f) {
      const v = Number(f.dataset.font); display.set({ font: v });
      box.querySelectorAll('.font-dot').forEach((b, i) => { b.classList.toggle('filled', i <= v); b.classList.toggle('current', i === v); });
      box.querySelector('.font-fill').style.width = v * 25 + '%';
    }
    const a = e.target.closest('[data-accent]');
    if (a) { display.set({ accent: a.dataset.accent }); box.querySelectorAll('.color-dot').forEach((b) => b.classList.toggle('on', b === a)); }
    const t = e.target.closest('[data-theme-opt]');
    if (t) { display.set({ theme: t.dataset.themeOpt }); box.querySelectorAll('.bg-opt').forEach((b) => b.classList.toggle('on', b === t)); }
    if (e.target.closest('.ds-done')) m.close();
  });
}
