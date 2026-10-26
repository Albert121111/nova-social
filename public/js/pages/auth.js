import { el, esc, APP_NAME } from '../util.js';
import { icon } from '../icons.js';
import { post } from '../api.js';
import { openModal } from '../ui.js';

export function landing() {
  const root = el(`<div class="landing">
    <div class="landing-main">
      <div class="landing-logo">${icon('logo')}</div>
      <div class="landing-cta">
        <div class="landing-logo-small">${icon('logo')}</div>
        <h1>В курсе происходящего</h1>
        <h2>Присоединяйтесь сегодня.</h2>
        <div class="landing-buttons">
          <button class="btn btn-lg btn-inverse w-full" data-demo>Войти в демо-аккаунт</button>
          <div class="or"><span>или</span></div>
          <button class="btn btn-lg btn-accent w-full" data-signup>Создать учётную запись</button>
          <p class="tos">Регистрируясь, вы соглашаетесь с <a>Условиями предоставления услуг</a> и <a>Политикой конфиденциальности</a>, а также с <a>Политикой использования файлов cookie</a>.</p>
          <h3>Уже зарегистрированы?</h3>
          <button class="btn btn-lg btn-outline accent-text w-full" data-login>Войти</button>
        </div>
      </div>
    </div>
    <footer class="landing-footer">
      ${['О нас', 'Справочный центр', 'Условия предоставления услуг', 'Политика конфиденциальности', 'Файлы cookie', 'Специальные возможности', 'Блог', 'Разработчикам', 'Настройки'].map((t) => `<a>${t}</a>`).join('')}<span>© 2026 ${APP_NAME}</span>
    </footer>
  </div>`);
  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-signup]')) signup();
    if (e.target.closest('[data-login]')) login();
    if (e.target.closest('[data-demo]')) {
      try { await post('/api/login', { username: 'demo', password: 'demo123' }); location.reload(); } catch (err) { login(err.message); }
    }
  });
  return root;
}

function field(name, label, type = 'text', extra = '') {
  return `<label class="field"><input name="${name}" type="${type}" placeholder=" " ${extra}><span class="field-label">${label}</span></label>`;
}

function authModal(title, inner, submitLabel, onSubmit, footer = '') {
  const box = el(`<form class="auth-form" novalidate>
    <div class="auth-logo">${icon('logo')}</div>
    <h1>${esc(title)}</h1>
    ${inner}
    <div class="auth-error" hidden></div>
    <button class="btn btn-lg btn-inverse w-full" type="submit">${esc(submitLabel)}</button>
    ${footer}
  </form>`);
  const m = openModal({ content: box, className: 'modal-auth' });
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = box.querySelector('[type="submit"]'); btn.disabled = true;
    const err = box.querySelector('.auth-error'); err.hidden = true;
    try { await onSubmit(Object.fromEntries(new FormData(box))); location.reload(); } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-to-signup]')) { e.preventDefault(); m.close(); signup(); }
    if (e.target.closest('[data-to-login]')) { e.preventDefault(); m.close(); login(); }
  });
  return { box, m };
}

function login(error) {
  const { box } = authModal(`Войдите в ${APP_NAME}`,
    field('username', 'Имя пользователя', 'text', 'autocomplete="username" autofocus') + field('password', 'Пароль', 'password', 'autocomplete="current-password"'),
    'Войти', (d) => post('/api/login', d),
    '<p class="auth-switch">Нет учётной записи? <a href="#" data-to-signup>Зарегистрируйтесь</a></p><p class="auth-hint">Демо-доступ: <b>demo</b> / <b>demo123</b></p>');
  if (error) { const e = box.querySelector('.auth-error'); e.textContent = error; e.hidden = false; }
}

function signup() {
  const { box } = authModal('Создайте учётную запись',
    `${field('name', 'Имя', 'text', 'maxlength="50" autofocus autocomplete="name"')}
     <label class="field field-prefix"><span class="prefix">@</span><input name="username" placeholder=" " maxlength="15" autocomplete="username"><span class="field-label">Имя пользователя</span></label>
     <p class="field-hint">Латинские буквы, цифры и _, от 3 до 15 символов.</p>
     ${field('password', 'Пароль', 'password', 'autocomplete="new-password"')}
     <p class="field-hint">Не меньше 6 символов.</p>`,
    'Зарегистрироваться', (d) => post('/api/register', d),
    '<p class="auth-switch">Уже есть учётная запись? <a href="#" data-to-login>Войти</a></p>');
  const name = box.querySelector('[name="name"]'), uname = box.querySelector('[name="username"]');
  let touched = false;
  uname.addEventListener('input', () => { touched = true; });
  name.addEventListener('input', () => {
    if (touched) return;
    const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
    uname.value = name.value.toLowerCase().split('').map((c) => map[c] ?? c).join('').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 15);
  });
}
