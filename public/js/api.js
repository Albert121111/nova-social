// Обёртка над fetch и общее состояние приложения
export const state = {
  me: null,
  unread: { notifications: 0, messages: 0 },
  seenViews: new Set(),
};

const listeners = new Map();
export function on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, new Set()); listeners.get(evt).add(fn); return () => listeners.get(evt).delete(fn); }
export function emit(evt, data) { for (const fn of listeners.get(evt) || []) { try { fn(data); } catch (e) { console.error(e); } } }

export async function api(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch { throw new Error('Нет соединения с сервером'); }
  let data = null;
  try { data = await res.json(); } catch { /* пусто */ }
  if (!res.ok) {
    if (res.status === 401 && state.me) emit('unauthorized');
    const err = new Error((data && data.error) || `Ошибка ${res.status}`);
    err.status = res.status; throw err;
  }
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b = {}) => api('POST', u, b);
export const put = (u, b = {}) => api('PUT', u, b);
export const del = (u, b) => api('DELETE', u, b);

// Пакетная отправка просмотров
let viewQueue = [];
let viewTimer = null;
export function trackView(id) {
  if (state.seenViews.has(id)) return;
  state.seenViews.add(id); viewQueue.push(id);
  if (!viewTimer) viewTimer = setTimeout(() => { const ids = viewQueue; viewQueue = []; viewTimer = null; post('/api/views', { ids }).catch(() => {}); }, 1500);
}
