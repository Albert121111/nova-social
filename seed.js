'use strict';
/* Демо-данные: пользователи, посты, картинки (SVG генерируются на лету). */
const crypto = require('crypto');

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(20261026);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);

/* ---------- SVG-генераторы ---------- */

function avatarSvg(initials, h1, h2, shape) {
  const deco = shape === 1
    ? `<circle cx="300" cy="60" r="140" fill="hsla(${h2},90%,75%,.35)"/>`
    : shape === 2 ? `<path d="M0 300 L200 120 L400 280 V400 H0Z" fill="hsla(${h2},80%,30%,.35)"/>`
      : `<circle cx="80" cy="340" r="160" fill="hsla(${h1},90%,80%,.25)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},75%,55%)"/><stop offset="1" stop-color="hsl(${h2},75%,40%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/>${deco}<text x="200" y="200" dy=".35em" text-anchor="middle" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="150" font-weight="700" fill="#fff">${initials}</text></svg>`;
}

function bannerSvg(h1, h2) {
  let shapes = '';
  for (let i = 0; i < 9; i++) {
    shapes += `<circle cx="${between(0, 1500)}" cy="${between(0, 500)}" r="${between(40, 260)}" fill="hsla(${pick([h1, h2, (h1 + 40) % 360])},85%,${between(45, 75)}%,${between(0.15, 0.45).toFixed(2)})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},60%,25%)"/><stop offset="1" stop-color="hsl(${h2},70%,45%)"/></linearGradient></defs><rect width="1500" height="500" fill="url(#b)"/>${shapes}</svg>`;
}

function mountains(h) {
  const layer = (base, amp, color) => {
    let d = `M0 675 L0 ${base}`;
    for (let x = 0; x <= 1200; x += 60) d += ` L${x} ${base - rand() * amp}`;
    return `<path d="${d} L1200 675Z" fill="${color}"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h},70%,30%)"/><stop offset=".7" stop-color="hsl(${(h + 30) % 360},85%,65%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360},90%,75%)"/></linearGradient></defs><rect width="1200" height="675" fill="url(#s)"/><circle cx="${between(250, 950)}" cy="300" r="90" fill="hsl(${(h + 50) % 360},100%,88%)" opacity=".9"/>${layer(420, 180, `hsl(${h},35%,35%)`)}${layer(500, 140, `hsl(${h},40%,24%)`)}${layer(590, 90, `hsl(${h},45%,14%)`)}</svg>`;
}
function space() {
  let stars = '';
  for (let i = 0; i < 220; i++) stars += `<circle cx="${between(0, 1200)}" cy="${between(0, 675)}" r="${between(0.4, 2.2).toFixed(1)}" fill="#fff" opacity="${between(0.3, 1).toFixed(2)}"/>`;
  const h = Math.floor(between(0, 360));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><radialGradient id="p" cx=".35" cy=".35"><stop offset="0" stop-color="hsl(${h},80%,70%)"/><stop offset="1" stop-color="hsl(${h},70%,20%)"/></radialGradient><radialGradient id="n" cx=".7" cy=".3" r=".8"><stop offset="0" stop-color="hsla(${(h + 180) % 360},80%,40%,.5)"/><stop offset="1" stop-color="#05060f" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="675" fill="#05060f"/><rect width="1200" height="675" fill="url(#n)"/>${stars}<circle cx="600" cy="360" r="170" fill="url(#p)"/><ellipse cx="600" cy="360" rx="300" ry="55" fill="none" stroke="hsla(${(h + 40) % 360},70%,80%,.7)" stroke-width="10" transform="rotate(-15 600 360)"/></svg>`;
}
function city() {
  let b = '';
  for (let x = 0; x < 1200;) {
    const w = between(60, 140), hgt = between(160, 520);
    b += `<rect x="${x}" y="${675 - hgt}" width="${w}" height="${hgt}" fill="hsl(230,30%,${between(8, 16)}%)"/>`;
    for (let wy = 675 - hgt + 15; wy < 660; wy += 26) for (let wx = x + 10; wx < x + w - 14; wx += 20) if (rand() > 0.55) b += `<rect x="${wx}" y="${wy}" width="9" height="13" fill="hsl(${pick([45, 50, 190])},100%,${between(60, 80)}%)" opacity=".85"/>`;
    x += w + between(4, 14);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1026"/><stop offset="1" stop-color="#6d2a7a"/></linearGradient></defs><rect width="1200" height="675" fill="url(#c)"/><circle cx="950" cy="130" r="50" fill="#f4f1c9"/>${b}</svg>`;
}
function sea() {
  let waves = '';
  for (let y = 420; y < 675; y += 14) waves += `<rect x="${between(-100, 300)}" y="${y}" width="${between(500, 1100)}" height="3" fill="#ffd9a8" opacity="${(0.6 - (y - 420) / 600).toFixed(2)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a6b"/><stop offset=".55" stop-color="#ff7b54"/><stop offset=".62" stop-color="#ffb26b"/></linearGradient><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3f8f"/><stop offset="1" stop-color="#0d1033"/></linearGradient></defs><rect width="1200" height="420" fill="url(#k)"/><circle cx="600" cy="420" r="110" fill="#ffe3a3"/><rect y="420" width="1200" height="255" fill="url(#w)"/>${waves}</svg>`;
}
function code() {
  const colors = ['#c678dd', '#61afef', '#98c379', '#e5c07b', '#e06c75', '#56b6c2', '#abb2bf'];
  let lines = '';
  for (let i = 0; i < 18; i++) {
    let x = 80 + (i % 5 === 0 ? 0 : 30 * Math.floor(between(1, 3)));
    lines += `<text x="30" y="${80 + i * 32}" font-family="Consolas,monospace" font-size="18" fill="#4b5263">${i + 1}</text>`;
    for (let k = 0; k < between(2, 6); k++) { const w = between(40, 160); lines += `<rect x="${x}" y="${66 + i * 32}" width="${w}" height="14" rx="4" fill="${pick(colors)}" opacity=".9"/>`; x += w + 12; }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#282c34"/><rect width="1200" height="36" fill="#21252b"/><circle cx="24" cy="18" r="7" fill="#ff5f56"/><circle cx="46" cy="18" r="7" fill="#ffbd2e"/><circle cx="68" cy="18" r="7" fill="#27c93f"/>${lines}</svg>`;
}
function chart(up = true) {
  let d = 'M60 ', y = up ? 520 : 200;
  const pts = [];
  for (let x = 60; x <= 1140; x += 30) { y += (up ? -1 : 1) * between(-18, 30); y = Math.max(80, Math.min(600, y)); pts.push(`${x} ${y.toFixed(0)}`); }
  d += pts.join(' L');
  const col = up ? '#00ba7c' : '#f4212e';
  let grid = '';
  for (let g = 100; g < 650; g += 100) grid += `<line x1="40" x2="1160" y1="${g}" y2="${g}" stroke="#2f3336"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#0b0e11"/>${grid}<path d="${d} L1140 640 L60 640Z" fill="${col}" opacity=".12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="4"/></svg>`;
}
function blobs() {
  const h = Math.floor(between(0, 360));
  let c = '';
  for (let i = 0; i < 7; i++) c += `<circle cx="${between(100, 1100)}" cy="${between(80, 600)}" r="${between(80, 260)}" fill="hsl(${(h + i * 40) % 360},85%,60%)" opacity=".55"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><defs><filter id="f"><feGaussianBlur stdDeviation="40"/></filter></defs><rect width="1200" height="675" fill="hsl(${h},50%,12%)"/><g filter="url(#f)">${c}</g></svg>`;
}
function food() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#8b5a3c"/><g opacity=".15">${Array.from({ length: 12 }, (_, i) => `<rect y="${i * 60}" width="1200" height="4" fill="#3b2314"/>`).join('')}</g><circle cx="600" cy="340" r="270" fill="#f3efe8"/><circle cx="600" cy="340" r="215" fill="#fffdf8"/><circle cx="600" cy="340" r="170" fill="#f2a541"/><circle cx="600" cy="340" r="150" fill="#e8562a" opacity=".85"/>${Array.from({ length: 14 }, () => `<circle cx="${between(480, 720)}" cy="${between(220, 460)}" r="${between(12, 24)}" fill="${pick(['#b5172a', '#3e8e41', '#fff4d6', '#2b2b2b'])}"/>`).join('')}<path d="M1000 120 l40 420" stroke="#c0c0c0" stroke-width="16" stroke-linecap="round"/></svg>`;
}
function game() {
  let blocks = '';
  const cols = ['#5d9e3a', '#79c05a', '#8b5a2b', '#6b4423', '#7f7f7f'];
  for (let x = 0; x < 1200; x += 60) {
    const top = 360 + Math.floor(between(-2, 3)) * 60;
    for (let y = top; y < 675; y += 60) blocks += `<rect x="${x}" y="${y}" width="60" height="60" fill="${y === top ? pick(cols.slice(0, 2)) : pick(cols.slice(2))}" stroke="#00000033"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#7ec0ee"/><rect x="900" y="60" width="90" height="90" fill="#fff59d"/><rect x="200" y="100" width="240" height="50" fill="#fff" opacity=".9"/><rect x="250" y="70" width="140" height="40" fill="#fff" opacity=".9"/>${blocks}<rect x="540" y="180" width="60" height="180" fill="#6b4423"/><rect x="460" y="80" width="220" height="140" fill="#2e7d32"/></svg>`;
}

const GEN = { mountains: () => mountains(Math.floor(between(0, 360))), space, city, sea, code, chartUp: () => chart(true), chartDown: () => chart(false), blobs, food, game };

/* ---------- Данные ---------- */

const USERS = [
  { username: 'nova', name: 'Nova', bio: 'Официальный аккаунт Nova. Что происходит в мире — прямо сейчас.', location: 'Интернет', website: 'nova.local', verified: true, h: [205, 230], init: 'N' },
  { username: 'alex_dev', name: 'Алексей Петров', bio: 'Fullstack-разработчик. JavaScript, Node.js, немного Rust. Пишу о коде и жизни программиста.', location: 'Москва', website: 'github.com/alexdev', verified: true, h: [260, 300], init: 'АП' },
  { username: 'maria_art', name: 'Мария Смирнова 🎨', bio: 'Иллюстратор и цифровой художник. Открыта для заказов ✉️', location: 'Санкт-Петербург', website: 'behance.net/maria', h: [320, 20], init: 'МС' },
  { username: 'space_today', name: 'Космос сегодня', bio: 'Новости космонавтики, астрономии и науки. Каждый день.', location: 'Орбита Земли', website: '', verified: true, h: [240, 280], init: 'КС' },
  { username: 'ivan_plays', name: 'Иван | Gaming', bio: 'Стримлю по вечерам. Minecraft, инди и всё, что затягивает. 🎮', location: 'Екатеринбург', website: '', h: [110, 160], init: 'И' },
  { username: 'kate_travels', name: 'Катя в пути ✈️', bio: '42 страны и не собираюсь останавливаться. Фото, маршруты, лайфхаки.', location: 'Где-то в мире', website: '', h: [180, 30], init: 'К' },
  { username: 'tech_digest', name: 'Тех Дайджест', bio: 'Главное из мира технологий за 5 минут в день.', location: '', website: 'techdigest.local', verified: true, h: [190, 220], init: 'ТД' },
  { username: 'anna_cooks', name: 'Анна готовит', bio: 'Простые рецепты на каждый день. Без сложных ингредиентов 🍝', location: 'Казань', website: '', h: [20, 45], init: 'А' },
  { username: 'dmitry_fit', name: 'Дмитрий Фит', bio: 'Тренер. Бег, зал, здоровый сон. Без фанатизма.', location: 'Новосибирск', website: '', h: [0, 30], init: 'Д' },
  { username: 'memes_daily', name: 'Мемы каждый день', bio: 'Если не смешно — значит, вы ещё не проснулись.', location: '', website: '', h: [50, 90], init: 'М' },
  { username: 'oleg_trader', name: 'Олег', bio: 'Рынки, графики, кофе. Не финансовый совет.', location: 'Сочи', website: '', h: [140, 170], init: 'О' },
  { username: 'john_carter', name: 'John Carter', bio: 'Product designer. Building things people love. EN/RU', location: 'London', website: 'johncarter.design', verified: true, h: [200, 260], init: 'JC' },
  { username: 'sofia_music', name: 'София 🎵', bio: 'Пою, пишу песни, играю на укулеле. Новый трек уже скоро!', location: 'Минск', website: '', h: [290, 330], init: 'С' },
  { username: 'demo', name: 'Демо Пользователь', bio: 'Это демо-аккаунт. Попробуйте всё: посты, лайки, репосты, сообщения!', location: 'Россия', website: '', h: [210, 180], init: 'ДП', password: 'demo123' },
];

// [автор, текст, часов назад, картинки[], опрос?]
const POSTS = [
  ['nova', 'Добро пожаловать в Nova! 👋\n\nЗдесь можно публиковать посты, отвечать, делать репосты и цитаты, ставить лайки, сохранять в закладки и переписываться в личных сообщениях.\n\nРасскажите, что у вас происходит! #Nova', 70],
  ['space_today', 'Новый снимок туманности получен космическим телескопом. Расстояние — около 7 500 световых лет. Красота, от которой захватывает дух 🌌 #Космос #Наука', 2, ['space']],
  ['alex_dev', 'Совет дня: перестаньте писать `console.log` везде. Научитесь пользоваться отладчиком в браузере — сэкономите часы.\n\n#JavaScript #Программирование', 3, ['code']],
  ['maria_art', 'Закончила новую работу — «Горный рассвет». Рисовала три вечера подряд. Как вам? 🏔️ #арт #иллюстрация', 5, ['mountains']],
  ['tech_digest', 'Главное за сегодня:\n\n• Новые модели ИИ стали заметно быстрее\n• Цены на SSD снова снижаются\n• Вышло крупное обновление популярного браузера\n\n#Технологии #ИИ', 1.5],
  ['ivan_plays', 'Построил замок в Minecraft за 6 часов стрима. Чат помогал выбирать блоки 😄 Стрим сегодня в 20:00! #Minecraft #игры', 4, ['game']],
  ['kate_travels', 'Закат на побережье. Никакие фильтры не передадут, как это выглядит вживую 🌅 #путешествия', 8, ['sea']],
  ['anna_cooks', 'Пицца за 30 минут без дрожжей 🍕\n\nТесто: мука, йогурт, щепотка соли и разрыхлитель. Сверху — что найдёте в холодильнике. Рецепт в ответах 👇 #рецепт #еда', 6, ['food']],
  ['dmitry_fit', 'Напоминание: 7–8 часов сна дают для восстановления больше, чем любая добавка из магазина. #ЗОЖ #фитнес', 9],
  ['memes_daily', 'Я: лягу пораньше сегодня\nТакже я в 3 ночи: читаю, как устроены чёрные дыры', 3.5],
  ['oleg_trader', 'Неделя закрывается в плюс. Главное — дисциплина и стоп-лоссы. #рынки', 12, ['chartUp']],
  ['john_carter', 'Good design is invisible. If users notice your interface, something is probably wrong.\n\n#design #UX', 7],
  ['sofia_music', 'Записала демо новой песни 🎶 Кто хочет послушать первым? #музыка', 10],
  ['tech_digest', 'Какой язык программирования вы бы посоветовали начинающему в 2026 году?', 14, null, ['Python', 'JavaScript', 'Go', 'Rust']],
  ['space_today', 'Сегодня ночью можно увидеть МКС невооружённым глазом. Она выглядит как яркая звезда, которая быстро движется по небу 🛰️ #Космос', 20],
  ['alex_dev', 'Переписал бэкенд пет-проекта с нуля. Было 4000 строк — стало 1200. Иногда лучший код — тот, который удалил. #Программирование', 26],
  ['maria_art', 'Ночной город — моя любимая тема для рисования. Огни окон как маленькие истории ✨ #арт', 30, ['city']],
  ['kate_travels', 'Горы или море? Голосуйте 👇 #путешествия', 22, null, ['Горы 🏔️', 'Море 🌊']],
  ['nova', 'Совет: нажмите на ⚙️ «Оформление» в меню «Ещё», чтобы выбрать тему (светлая, приглушённая, тёмная), цвет акцента и размер шрифта. #Nova', 48],
  ['ivan_plays', 'Кто во что играет на этих выходных? Ищу что-то кооперативное на вечер 🎮 #игры', 28],
  ['dmitry_fit', 'Пробежал сегодня 10 км под дождём. Ни одной причины не бежать не нашлось 🏃‍♂️ #бег #спорт', 33],
  ['memes_daily', 'Когда код заработал с первого раза и ты не понимаешь почему 🤔', 15],
  ['oleg_trader', 'Рынок сегодня решил проверить нервы всех участников. Держимся. #рынки', 40, ['chartDown']],
  ['john_carter', 'Spent the whole day on a single button. Worth it. #design', 50, ['blobs']],
  ['anna_cooks', 'Какой суп вы готовите чаще всего?', 44, null, ['Борщ', 'Куриный', 'Грибной', 'Солянка']],
  ['tech_digest', 'Исследование: 68% разработчиков используют ИИ-помощников каждый день. А вы? #ИИ #Технологии', 36],
  ['space_today', 'Ровно 69 лет назад на орбиту вышел первый искусственный спутник Земли. С этого началась космическая эра 🚀 #Космос #история', 60],
  ['sofia_music', 'Спасибо всем, кто пришёл на концерт вчера! Это было невероятно 💜 #музыка #концерт', 55, ['blobs']],
  ['alex_dev', 'Самая недооценённая фича Node.js — встроенный тест-раннер. `node --test` и никаких зависимостей. #JavaScript #Nodejs', 64],
  ['kate_travels', 'Утро в горах. Холодно, тихо и абсолютно счастливо ⛰️ #путешествия', 75, ['mountains', 'mountains']],
  ['maria_art', 'Эксперимент с цветом: только градиенты, никаких контуров 🎨 #арт', 80, ['blobs', 'blobs', 'blobs']],
  ['ivan_plays', 'Сделал карту для выживания с друзьями. Кто хочет сид? #Minecraft', 90, ['game']],
  ['nova', 'Новое: опросы! Нажмите на иконку списка в поле публикации, добавьте 2–4 варианта и выберите длительность. #Nova', 86],
];

// Ответы: [автор, индекс поста-родителя в POSTS, текст, часов после родителя]
const REPLIES = [
  ['anna_cooks', 7, 'Рецепт: 300 г муки, 250 г йогурта, 1 ч.л. разрыхлителя, соль. Замесить, раскатать, 15 минут при 220°. Готово! 🍕', 0.1],
  ['memes_daily', 7, 'Сохранил. Завтра буду есть пиццу на завтрак, обед и ужин', 0.6],
  ['alex_dev', 1, 'Ого! А есть версия в высоком разрешении?', 0.3],
  ['space_today', 1, '@alex_dev Да, ссылку добавим в течение дня 🙌', 0.5],
  ['john_carter', 3, 'Absolutely beautiful colors 😍', 1],
  ['kate_travels', 3, 'Хочу туда! Это реальное место?', 1.4],
  ['maria_art', 3, '@kate_travels Собирательный образ, но вдохновлялась Алтаем 🏔️', 1.6],
  ['ivan_plays', 2, 'Вот это я понимаю совет. Я до сих пор живу на console.log 😅', 0.4],
  ['dmitry_fit', 8, 'Отлично сказано! Подписываюсь под каждым словом', 0.3],
  ['kate_travels', 12, 'Ждём новый трек! 💜', 0.5],
  ['oleg_trader', 4, 'Про SSD хорошая новость, как раз собирался обновлять', 0.4],
  ['tech_digest', 15, 'Красиво! Сколько времени заняла миграция?', 0.8],
  ['alex_dev', 15, '@tech_digest Две недели по вечерам. Тесты очень помогли.', 1.2],
  ['kate_travels', 5, 'Я бы с удовольствием посмотрела стрим! Во сколько по Москве?', 0.5],
  ['ivan_plays', 5, '@kate_travels В 18:00 по Москве 🎮', 0.7],
  ['memes_daily', 1, 'Красота неописуемая 🌌', 0.8],
  ['sofia_music', 6, 'Это прекрасно 😍', 1],
];

// Цитаты: [автор, индекс цитируемого поста, текст, часов после]
const QUOTES = [
  ['memes_daily', 2, 'Я после того, как узнал про breakpoints:', 0.9],
  ['maria_art', 1, 'Хочу нарисовать что-то вдохновлённое этим снимком ✨', 1.2],
  ['tech_digest', 15, 'Отличный пример того, что рефакторинг окупается. #Программирование', 2],
];

function seed({ db, indexUser, indexPost, nextId, hashPassword, storeFile }) {
  const write = (svg) => {
    const name = crypto.createHash('md5').update(svg).digest('hex').slice(0, 20) + '.svg';
    storeFile(name, Buffer.from(svg, 'utf8'));
    return '/uploads/' + name;
  };
  const now = Date.now();
  const H = 3.6e6;

  const users = {};
  USERS.forEach((u, i) => {
    const { salt, hash } = hashPassword(u.password || crypto.randomBytes(16).toString('hex'));
    const user = {
      id: nextId(), username: u.username, name: u.name, salt, hash,
      bio: u.bio, location: u.location, website: u.website, verified: !!u.verified,
      avatar: write(avatarSvg(u.init, u.h[0], u.h[1], i % 3)),
      banner: u.username === 'demo' ? null : write(bannerSvg(u.h[0], u.h[1])),
      createdAt: now - between(30, 900) * 864e5, pinned: null,
    };
    indexUser(user); users[u.username] = user;
  });
  users.demo.createdAt = now - 2 * 864e5;

  // Подписки: все читают nova, плюс случайные связи
  const names = Object.keys(users);
  for (const a of names) {
    for (const b of names) {
      if (a === b) continue;
      const p = b === 'nova' ? 1 : (users[b].verified ? 0.6 : 0.35);
      if (rand() < p) db.follows.add(users[a].id, users[b].id, now - between(1, 600) * H);
    }
  }
  for (const b of ['alex_dev', 'space_today', 'maria_art', 'kate_travels', 'ivan_plays', 'tech_digest']) db.follows.add(users.demo.id, users[b].id, now - 40 * H);

  const created = [];
  const mkPost = (author, text, at, extra = {}) => {
    const p = { id: nextId(), authorId: users[author].id, text, media: [], createdAt: at, views: 0, replyTo: null, quoteOf: null, poll: null, ...extra };
    indexPost(p); return p;
  };

  for (const [author, text, hours, imgs, poll] of POSTS) {
    const at = now - hours * H - between(0, 40) * 60000;
    const media = (imgs || []).map((k) => write(GEN[k]()));
    const p = mkPost(author, text, at, {
      media,
      poll: poll ? { options: poll.map((t) => ({ text: t, votes: [] })), endsAt: at + (hours > 30 ? 24 : 72) * H } : null,
    });
    created.push(p);
  }
  for (const [author, idx, text, after] of REPLIES) {
    const parent = created[idx];
    const at = Math.min(parent.createdAt + after * H, now - 60000);
    mkPost(author, text, at, { replyTo: parent.id });
  }
  for (const [author, idx, text, after] of QUOTES) {
    const q = created[idx];
    mkPost(author, text, Math.min(q.createdAt + after * H, now - 60000), { quoteOf: q.id });
  }

  // Посты демо-пользователя
  const d1 = mkPost('demo', 'Всем привет! Это мой первый пост в Nova 👋', now - 30 * H);
  const d2 = mkPost('demo', 'Интересно, как быстро здесь будут расти читатели 🤔 #Nova', now - 5 * H);

  // Лайки, репосты, просмотры, голоса
  const ids = Object.values(users).map((u) => u.id).filter((id) => id !== users.demo.id);
  for (const p of db.posts.values()) {
    const pop = p.replyTo ? 0.15 : between(0.15, 0.85);
    for (const uid of ids) {
      if (uid === p.authorId) continue;
      if (rand() < pop) db.likes.add(uid, p.id, Math.min(p.createdAt + between(0.05, 20) * H, now - 1000));
      if (!p.replyTo && rand() < pop * 0.09) db.reposts.add(uid, p.id, Math.min(p.createdAt + between(0.1, 20) * H, now - 1000));
      if (rand() < 0.05) db.bookmarks.add(uid, p.id, p.createdAt + H);
    }
    p.views = Math.floor(db.likes.ofB(p.id).size * between(40, 160) + between(20, 400) + (p.media.length ? 900 : 0));
    if (p.poll) {
      for (const uid of ids) if (uid !== p.authorId && rand() < 0.8) {
        const r = rand();
        const idx = Math.min(p.poll.options.length - 1, Math.floor(Math.pow(r, 1.6) * p.poll.options.length));
        p.poll.options[idx].votes.push(uid);
      }
    }
  }

  // Уведомления для демо-аккаунта
  const pushN = (type, actor, postId, hoursAgo, read = false) => db.notifications.push({ id: nextId(), userId: users.demo.id, type, actorId: users[actor].id, postId, createdAt: now - hoursAgo * H, read });
  for (const [a, h] of [['alex_dev', 4], ['maria_art', 3.5], ['john_carter', 3], ['sofia_music', 2.2]]) { db.likes.add(users[a].id, d2.id, now - h * H); pushN('like', a, d2.id, h); }
  db.reposts.add(users.kate_travels.id, d2.id, now - 2 * H); pushN('repost', 'kate_travels', d2.id, 2);
  for (const [a, h] of [['ivan_plays', 1], ['kate_travels', 26], ['alex_dev', 28]]) { db.follows.add(users[a].id, users.demo.id, now - h * H); pushN('follow', a, null, h, h > 20); }
  const r1 = mkPost('ivan_plays', '@demo Добро пожаловать! Заходи на стрим вечером 🎮', now - 0.6 * H, { replyTo: d1.id });
  pushN('reply', 'ivan_plays', r1.id, 0.6);
  for (const [a, h] of [['nova', 29], ['dmitry_fit', 25]]) { db.likes.add(users[a].id, d1.id, now - h * H); pushN('like', a, d1.id, h, true); }

  // Личные сообщения
  const msg = (from, to, text, hoursAgo, read = true) => db.messages.push({ id: nextId(), from: users[from].id, to: users[to].id, text, media: [], createdAt: now - hoursAgo * H, read });
  msg('alex_dev', 'demo', 'Привет! Видел твой первый пост 👋', 27);
  msg('demo', 'alex_dev', 'Привет! Да, только осваиваюсь тут', 26.8);
  msg('alex_dev', 'demo', 'Если будут вопросы по разработке — пиши, помогу', 26.5);
  msg('kate_travels', 'demo', 'Привет! Спасибо, что подписался 😊', 3);
  msg('kate_travels', 'demo', 'Если интересно, скоро будет пост про маршрут по Алтаю', 2.9, false);
  msg('nova', 'demo', 'Добро пожаловать в Nova! Здесь можно переписываться с любым пользователем. Попробуйте ответить на это сообщение.', 47);

  users.nova.pinned = created[0].id;
}

module.exports = { seed };
