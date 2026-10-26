import { el, esc, APP_NAME } from '../util.js';
import { icon } from '../icons.js';
import { post, state, emit } from '../api.js';
import { pageHeader, navigate } from '../app.js';
import { toast, confirmDialog } from '../ui.js';

const PLANS = [
  { key: 'basic', name: 'Basic', month: 249, features: ['Небольшой приоритет в ответах', 'Редактирование постов', 'Длинные посты', 'Форматирование текста'] },
  { key: 'premium', name: 'Premium', month: 649, best: true, features: ['Всё из Basic', 'Синяя галочка', 'Посты до 4000 символов', 'Приоритет в ответах', 'Меньше рекламы', 'Аналитика постов'] },
  { key: 'plus', name: 'Premium+', month: 2490, features: ['Всё из Premium', 'Полное отсутствие рекламы', 'Наибольший приоритет в ответах', 'Ранний доступ к новым функциям'] },
];

export default function premium() {
  let yearly = true;
  let selected = 'premium';
  const root = el(`<div class="page page-premium">
    ${pageHeader({ title: '', back: true })}
    <div class="premium-hero">
      <h1>Перейдите на Premium</h1>
      <p>Получите синюю галочку, длинные посты и другие возможности. <span class="demo-note">Это демо — оплата не взимается.</span></p>
      <div class="billing-toggle"><button data-bill="year" class="on">Ежегодно <span class="save">Экономия 12%</span></button><button data-bill="month">Ежемесячно</button></div>
    </div>
    <div class="plans"></div>
    <div class="premium-footer"></div>
  </div>`);
  const plans = root.querySelector('.plans');
  const footer = root.querySelector('.premium-footer');
  function render() {
    plans.innerHTML = PLANS.map((p) => {
      const price = yearly ? Math.round(p.month * 0.88) : p.month;
      return `<button class="plan ${p.key === selected ? 'on' : ''}" data-plan="${p.key}">
        ${p.best ? '' : ''}
        <div class="plan-name">${p.name}</div>
        <div class="plan-price"><b>${price.toLocaleString('ru-RU')} ₽</b> / месяц</div>
        <div class="plan-billed">${yearly ? `${(price * 12).toLocaleString('ru-RU')} ₽ в год` : 'Оплата ежемесячно'}</div>
        <ul>${p.features.map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>
        <span class="plan-radio">${icon('check')}</span>
      </button>`;
    }).join('');
    const plan = PLANS.find((p) => p.key === selected);
    const price = yearly ? Math.round(plan.month * 0.88) : plan.month;
    footer.innerHTML = state.me.verified
      ? `<div class="pf-info"><div class="pf-title">${icon('verified')} У вас есть ${APP_NAME} Premium</div><div class="pf-sub">Синяя галочка отображается рядом с вашим именем.</div></div><button class="btn btn-outline btn-lg" data-cancel>Отменить подписку</button>`
      : `<div class="pf-info"><div class="pf-title">${plan.name}</div><div class="pf-sub"><b>${price.toLocaleString('ru-RU')} ₽ / месяц</b> · ${yearly ? 'ежегодная оплата' : 'ежемесячная оплата'}</div></div><button class="btn btn-inverse btn-lg" data-subscribe>Подписаться и заплатить</button>`;
  }
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bill]');
    if (b) { yearly = b.dataset.bill === 'year'; root.querySelectorAll('[data-bill]').forEach((x) => x.classList.toggle('on', x === b)); render(); }
    const p = e.target.closest('[data-plan]');
    if (p) { selected = p.dataset.plan; render(); }
    if (e.target.closest('[data-subscribe]')) {
      try {
        const { user } = await post('/api/premium', { enable: true });
        emit('me', user); render();
        toast('Добро пожаловать в Premium! Синяя галочка уже у вас.');
      } catch (err) { toast(err.message); }
    }
    if (e.target.closest('[data-cancel]')) {
      if (!(await confirmDialog({ title: 'Отменить Premium?', text: 'Синяя галочка пропадёт, а лимит поста вернётся к 280 символам.', confirm: 'Отменить подписку', danger: true }))) return;
      const { user } = await post('/api/premium', { enable: false });
      emit('me', user); render();
      toast('Подписка отменена');
    }
  });
  render();
  return { el: root, title: 'Premium', nav: 'premium', wide: true, sidebar: false, cache: false };
}
