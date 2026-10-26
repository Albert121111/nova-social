export const APP_NAME = 'Nova';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Строку HTML → DOM-элемент (первый корневой узел) */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}

export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function fmtNum(n) {
  n = Number(n) || 0;
  if (n < 10000) return n.toLocaleString('ru-RU');
  if (n < 1e6) return (Math.floor(n / 100) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' тыс.';
  if (n < 1e9) return (Math.floor(n / 1e5) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн';
  return (Math.floor(n / 1e8) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млрд';
}
/** Компактный счётчик под постом (пусто для нуля) */
export const fmtCount = (n) => (n ? fmtNum(n) : '');

const MONTHS = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export function relTime(ts) {
  const d = new Date(ts), now = Date.now();
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s || 1} с`;
  if (s < 3600) return `${Math.floor(s / 60)} мин`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч`;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()} г.`}`;
}
export function fullTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} · ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
}
export const joinedDate = (ts) => { const d = new Date(ts); return `Регистрация: ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()} г.`; };
export function clockTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function dayLabel(ts) {
  const d = new Date(ts), t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Сегодня';
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
}
export function timeLeft(ts) {
  const s = Math.floor((ts - Date.now()) / 1000);
  if (s <= 0) return 'Окончательные результаты';
  if (s < 3600) return `Осталось ${Math.ceil(s / 60)} мин`;
  if (s < 86400) return `Осталось ${Math.floor(s / 3600)} ч`;
  const d = Math.floor(s / 86400);
  return `Осталось ${d} ${plural(d, ['день', 'дня', 'дней'])}`;
}

/** Экранирует текст и превращает ссылки, @упоминания и #хэштеги в ссылки */
export function richText(text) {
  const re = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(^|[^\w@])@([A-Za-z0-9_]{1,15})|(^|[^\p{L}\p{N}_&#])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu;
  let out = '', last = 0, m;
  const src = String(text || '');
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (m[1]) {
      const url = m[1];
      const shown = url.replace(/^https?:\/\/(www\.)?/, '');
      out += `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="lnk">${esc(shown.length > 30 ? shown.slice(0, 28) + '…' : shown)}</a>`;
    } else if (m[3]) {
      out += esc(m[2]) + `<a href="/${esc(m[3])}" class="lnk" data-hovercard="${esc(m[3])}">@${esc(m[3])}</a>`;
    } else if (m[5]) {
      out += esc(m[4]) + `<a href="/search?q=${encodeURIComponent('#' + m[5])}" class="lnk">#${esc(m[5])}</a>`;
    }
    last = re.lastIndex;
  }
  return out + esc(src.slice(last));
}

/** Подсветка для поля ввода: хэштеги/упоминания/ссылки синие, превышение лимита — красным */
export function highlightComposer(text, limit) {
  const chars = [...text];
  const head = chars.slice(0, limit).join(''), tail = chars.slice(limit).join('');
  const hl = (s) => esc(s).replace(/(https?:\/\/\S+)|(^|[^\w@])(@\w{1,15})|(^|[^\p{L}\p{N}_&#])(#[\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu,
    (all, url, p1, at, p2, tag) => url ? `<mark class="hl">${url}</mark>` : at ? `${p1}<mark class="hl">${at}</mark>` : `${p2}<mark class="hl">${tag}</mark>`);
  return hl(head) + (tail ? `<mark class="over">${esc(tail)}</mark>` : '') + '​';
}

export const charCount = (s) => [...String(s)].length;

export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Уменьшает картинку из File до maxSize и возвращает data:URL (GIF не трогаем, чтобы сохранить анимацию) */
export function readImage(file, maxSize = 1600, quality = 0.88) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return reject(new Error('Поддерживаются PNG, JPEG, GIF и WEBP'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Не удалось прочитать файл'));
    fr.onload = () => {
      if (file.type === 'image/gif') return resolve(fr.result);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Повреждённое изображение'));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export function pickFiles({ multiple = false } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp'; inp.multiple = multiple;
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}

export const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#cfd9de"/><circle cx="200" cy="160" r="70" fill="#fff"/><path d="M70 380c10-80 60-130 130-130s120 50 130 130z" fill="#fff"/></svg>');
export const avatarUrl = (u) => (u && u.avatar) || DEFAULT_AVATAR;

export function avatar(u, size = 40, opts = {}) {
  const link = opts.link !== false && u;
  const img = `<img class="avatar" src="${esc(avatarUrl(u))}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" loading="lazy">`;
  return link ? `<a href="/${esc(u.username)}" class="avatar-link" data-hovercard="${esc(u.username)}">${img}</a>` : img;
}
