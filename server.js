/*
 * Nova — социальная сеть в стиле X.
 * Сервер на чистом Node.js (без npm-зависимостей).
 * Запуск:  node server.js   →  http://localhost:3000
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(UPLOADS, { recursive: true });
const storage = require('./storage')({ DB_FILE, UPLOADS });

/* ------------------------------------------------------------------ */
/*  Хранилище                                                           */
/* ------------------------------------------------------------------ */

const EMPTY = new Map();
function bucket(map, key) {
  let m = map.get(key);
  if (!m) { m = new Map(); map.set(key, m); }
  return m;
}

/** Связь «многие-ко-многим» с отметкой времени (лайки, подписки и т.д.) */
class Rel {
  constructor() { this.byA = new Map(); this.byB = new Map(); }
  has(a, b) { const m = this.byA.get(a); return !!m && m.has(b); }
  add(a, b, t = Date.now()) {
    if (this.has(a, b)) return false;
    bucket(this.byA, a).set(b, t); bucket(this.byB, b).set(a, t);
    markDirty(); return true;
  }
  remove(a, b) {
    if (!this.has(a, b)) return false;
    this.byA.get(a).delete(b); this.byB.get(b).delete(a);
    markDirty(); return true;
  }
  toggle(a, b) { if (this.has(a, b)) { this.remove(a, b); return false; } this.add(a, b); return true; }
  ofA(a) { return this.byA.get(a) || EMPTY; }
  ofB(b) { return this.byB.get(b) || EMPTY; }
  dropB(b) { for (const a of [...this.ofB(b).keys()]) this.remove(a, b); }
  dropA(a) { for (const b of [...this.ofA(a).keys()]) this.remove(a, b); }
  toJSON() { const out = []; for (const [a, m] of this.byA) for (const [b, t] of m) out.push([a, b, t]); return out; }
  load(arr) { for (const [a, b, t] of arr || []) { bucket(this.byA, a).set(b, t); bucket(this.byB, b).set(a, t); } }
}

const db = {
  seq: 1000,
  users: new Map(),        // id -> user
  usernames: new Map(),    // lower(username) -> id
  posts: new Map(),        // id -> post
  replies: new Map(),      // postId -> Set(childIds)
  quotes: new Map(),       // postId -> Set(quoteIds)
  byAuthor: new Map(),     // userId -> Set(postIds)
  likes: new Rel(),        // user -> post
  reposts: new Rel(),      // user -> post
  bookmarks: new Rel(),    // user -> post
  follows: new Rel(),      // follower -> following
  notifications: [],       // {id,userId,type,actorId,postId,createdAt,read}
  messages: [],            // {id,from,to,text,media,createdAt,read}
  sessions: new Map(),     // token -> userId
};

function nextId() { db.seq += 1; markDirty(); return String(db.seq); }

function indexPost(p) {
  db.posts.set(p.id, p);
  if (!db.byAuthor.has(p.authorId)) db.byAuthor.set(p.authorId, new Set());
  db.byAuthor.get(p.authorId).add(p.id);
  if (p.replyTo) { if (!db.replies.has(p.replyTo)) db.replies.set(p.replyTo, new Set()); db.replies.get(p.replyTo).add(p.id); }
  if (p.quoteOf) { if (!db.quotes.has(p.quoteOf)) db.quotes.set(p.quoteOf, new Set()); db.quotes.get(p.quoteOf).add(p.id); }
}
function unindexPost(p) {
  db.posts.delete(p.id);
  db.byAuthor.get(p.authorId)?.delete(p.id);
  if (p.replyTo) db.replies.get(p.replyTo)?.delete(p.id);
  if (p.quoteOf) db.quotes.get(p.quoteOf)?.delete(p.id);
}
function indexUser(u) { db.users.set(u.id, u); db.usernames.set(u.username.toLowerCase(), u.id); if (!db.byAuthor.has(u.id)) db.byAuthor.set(u.id, new Set()); }

let dirty = false, saveTimer = null;
function markDirty() {
  dirty = true;
  if (!saveTimer) saveTimer = setTimeout(saveNow, process.env.DATABASE_URL ? 1000 : 400);
}
function saveNow() {
  saveTimer = null;
  if (!dirty) return;
  dirty = false;
  const data = {
    seq: db.seq,
    users: [...db.users.values()],
    posts: [...db.posts.values()],
    likes: db.likes.toJSON(), reposts: db.reposts.toJSON(),
    bookmarks: db.bookmarks.toJSON(), follows: db.follows.toJSON(),
    notifications: db.notifications, messages: db.messages,
    sessions: [...db.sessions.entries()],
  };
  return storage.save(JSON.stringify(data)).catch((e) => {
    console.error('Не удалось сохранить базу:', e.message);
    markDirty(); // попробуем ещё раз
  });
}

function applyData(d) {
  db.seq = d.seq || 1000;
  for (const u of d.users || []) indexUser(u);
  for (const p of d.posts || []) indexPost(p);
  db.likes.load(d.likes); db.reposts.load(d.reposts);
  db.bookmarks.load(d.bookmarks); db.follows.load(d.follows);
  db.notifications = d.notifications || [];
  db.messages = d.messages || [];
  db.sessions = new Map(d.sessions || []);
}

/* ------------------------------------------------------------------ */
/*  Утилиты                                                             */
/* ------------------------------------------------------------------ */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function checkPassword(user, password) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

const RESERVED = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'premium',
  'hashtag', 'api', 'uploads', 'login', 'signup', 'logout', 'compose', 'admin', 'about', 'help', 'tos', 'privacy', 'nova']);

const userByName = (name) => db.users.get(db.usernames.get(String(name || '').toLowerCase()));

function extractMentions(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/(^|[^\w@])@([A-Za-z0-9_]{1,15})/g)) out.add(m[2].toLowerCase());
  return [...out];
}
function extractTags(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/(^|[^\p{L}\p{N}_&#])#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu)) out.add(m[2]);
  return [...out];
}

function saveDataUrl(dataUrl, allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m || !allowed.includes(m[1])) throw httpError(400, 'Неподдерживаемый формат изображения');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) throw httpError(413, 'Файл больше 8 МБ');
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[m[1]];
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  storage.putFile(name, buf);
  return '/uploads/' + name;
}
/** Принимает либо уже загруженный URL /uploads/..., либо data:URL */
function acceptImage(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^\/uploads\/[\w.-]+$/.test(v)) return v;
  return saveDataUrl(v);
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

/* ------------------------------------------------------------------ */
/*  Сериализация                                                        */
/* ------------------------------------------------------------------ */

function miniUser(u, viewerId) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, name: u.name, avatar: u.avatar, verified: !!u.verified,
    bio: u.bio || '', following: viewerId ? db.follows.has(viewerId, u.id) : false,
    followsYou: viewerId ? db.follows.has(u.id, viewerId) : false,
    followers: db.follows.ofB(u.id).size, followingCount: db.follows.ofA(u.id).size,
  };
}
function fullUser(u, viewerId) {
  return {
    ...miniUser(u, viewerId),
    banner: u.banner, location: u.location || '', website: u.website || '',
    createdAt: u.createdAt, pinned: u.pinned || null,
    posts: (db.byAuthor.get(u.id) || new Set()).size,
    isMe: u.id === viewerId,
  };
}

function pollView(p, viewerId) {
  if (!p.poll) return null;
  const total = p.poll.options.reduce((s, o) => s + o.votes.length, 0);
  const voted = p.poll.options.findIndex((o) => o.votes.includes(viewerId));
  return {
    options: p.poll.options.map((o) => ({ text: o.text, votes: o.votes.length })),
    total, voted, endsAt: p.poll.endsAt, closed: Date.now() > p.poll.endsAt,
  };
}

function serializePost(p, viewerId, depth = 0) {
  if (!p) return null;
  const author = db.users.get(p.authorId);
  const parent = p.replyTo ? db.posts.get(p.replyTo) : null;
  let quote = null;
  if (p.quoteOf) {
    const q = db.posts.get(p.quoteOf);
    quote = q ? (depth < 1 ? serializePost(q, viewerId, depth + 1) : { id: q.id, nested: true }) : { unavailable: true };
  }
  return {
    id: p.id, text: p.text, media: p.media || [], createdAt: p.createdAt, views: p.views || 0,
    author: miniUser(author, viewerId),
    replyTo: p.replyTo || null,
    replyToUser: parent ? db.users.get(parent.authorId)?.username : (p.replyTo ? null : undefined),
    quote,
    poll: pollView(p, viewerId),
    stats: {
      replies: db.replies.get(p.id)?.size || 0,
      reposts: db.reposts.ofB(p.id).size,
      quotes: db.quotes.get(p.id)?.size || 0,
      likes: db.likes.ofB(p.id).size,
      bookmarks: db.bookmarks.ofB(p.id).size,
    },
    liked: viewerId ? db.likes.has(viewerId, p.id) : false,
    reposted: viewerId ? db.reposts.has(viewerId, p.id) : false,
    bookmarked: viewerId ? db.bookmarks.has(viewerId, p.id) : false,
  };
}

/* ------------------------------------------------------------------ */
/*  Уведомления и realtime (Server-Sent Events)                         */
/* ------------------------------------------------------------------ */

const streams = new Map(); // userId -> Set(res)
function push(userId, event, data) {
  const set = streams.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}
function broadcast(event, data, exceptUserId) {
  for (const uid of streams.keys()) if (uid !== exceptUserId) push(uid, event, data);
}
setInterval(() => { for (const set of streams.values()) for (const r of set) r.write(': ping\n\n'); }, 25000);

function unreadCounts(userId) {
  return {
    notifications: db.notifications.filter((n) => n.userId === userId && !n.read).length,
    messages: db.messages.filter((m) => m.to === userId && !m.read).length,
  };
}

function notify(userId, type, actorId, postId = null) {
  if (!userId || userId === actorId) return;
  const dup = db.notifications.find((n) => n.userId === userId && n.type === type && n.actorId === actorId && n.postId === postId);
  if (dup) return;
  db.notifications.push({ id: nextId(), userId, type, actorId, postId, createdAt: Date.now(), read: false });
  if (db.notifications.length > 20000) db.notifications.splice(0, 5000);
  markDirty();
  push(userId, 'unread', unreadCounts(userId));
}

/* ------------------------------------------------------------------ */
/*  Логика постов                                                       */
/* ------------------------------------------------------------------ */

function createPost(user, body) {
  const text = String(body.text || '').replace(/\r\n/g, '\n').trim();
  const limit = user.verified ? 4000 : 280;
  if ([...text].length > limit) throw httpError(400, `Максимум ${limit} символов`);
  const media = (Array.isArray(body.media) ? body.media : []).slice(0, 4).map(acceptImage).filter(Boolean);
  let poll = null;
  if (body.poll && Array.isArray(body.poll.options)) {
    const opts = body.poll.options.map((o) => String(o || '').trim().slice(0, 25)).filter(Boolean);
    if (opts.length >= 2) {
      const minutes = Math.min(Math.max(Number(body.poll.minutes) || 1440, 5), 7 * 1440);
      poll = { options: opts.slice(0, 4).map((t) => ({ text: t, votes: [] })), endsAt: Date.now() + minutes * 60000 };
    }
  }
  if (!text && !media.length && !body.quoteOf) throw httpError(400, 'Пустой пост');
  let parent = null;
  if (body.replyTo) { parent = db.posts.get(String(body.replyTo)); if (!parent) throw httpError(404, 'Пост не найден'); }
  let quoted = null;
  if (body.quoteOf) { quoted = db.posts.get(String(body.quoteOf)); if (!quoted) throw httpError(404, 'Пост не найден'); }

  const p = {
    id: nextId(), authorId: user.id, text, media, createdAt: Date.now(), views: 0,
    replyTo: parent ? parent.id : null, quoteOf: quoted ? quoted.id : null, poll: media.length ? null : poll,
  };
  indexPost(p); markDirty();

  if (parent) notify(parent.authorId, 'reply', user.id, p.id);
  if (quoted) notify(quoted.authorId, 'quote', user.id, p.id);
  for (const name of extractMentions(text)) {
    const m = userByName(name);
    if (m && (!parent || m.id !== parent.authorId)) notify(m.id, 'mention', user.id, p.id);
  }
  broadcast('post', { id: p.id, authorId: user.id, avatar: user.avatar, reply: !!parent }, user.id);
  return p;
}

function deletePost(p) {
  unindexPost(p);
  db.likes.dropB(p.id); db.reposts.dropB(p.id); db.bookmarks.dropB(p.id);
  db.notifications = db.notifications.filter((n) => n.postId !== p.id);
  for (const u of db.users.values()) if (u.pinned === p.id) u.pinned = null;
  markDirty();
}

function postScore(p, viewerId, now) {
  const ageH = (now - p.createdAt) / 3.6e6;
  const eng = 1 + db.likes.ofB(p.id).size + 2 * db.reposts.ofB(p.id).size
    + 1.5 * (db.replies.get(p.id)?.size || 0) + 0.004 * (p.views || 0);
  let s = eng / Math.pow(ageH + 2, 1.35);
  if (viewerId && db.follows.has(viewerId, p.authorId)) s *= 1.6;
  if (p.authorId === viewerId) s *= (ageH < 1 ? 50 : 1);
  if (p.media && p.media.length) s *= 1.15;
  return s;
}

/** Хронологическая лента из постов и репостов набора пользователей */
function timeline(userIds, { includeReplies = false, before = Infinity, limit = 20 } = {}) {
  const items = new Map(); // postId -> item (оставляем самое свежее появление)
  const add = (it) => { const cur = items.get(it.post.id); if (!cur || cur.at < it.at) items.set(it.post.id, it); };
  for (const uid of userIds) {
    for (const pid of db.byAuthor.get(uid) || []) {
      const p = db.posts.get(pid);
      if (!p || (p.replyTo && !includeReplies)) continue;
      add({ kind: 'post', post: p, at: p.createdAt });
    }
    for (const [pid, t] of db.reposts.ofA(uid)) {
      const p = db.posts.get(pid);
      if (p) add({ kind: 'repost', post: p, at: t, by: uid });
    }
  }
  return [...items.values()].filter((i) => i.at < before).sort((a, b) => b.at - a.at).slice(0, limit);
}

function serializeItems(items, viewerId) {
  return items.map((i) => ({
    kind: i.kind, at: i.at, post: serializePost(i.post, viewerId),
    by: i.by ? miniUser(db.users.get(i.by), viewerId) : undefined,
  }));
}

/* ------------------------------------------------------------------ */
/*  Тренды                                                              */
/* ------------------------------------------------------------------ */

const CATEGORY_WORDS = {
  'Новости': ['новости', 'news', 'политика', 'экономика', 'космос', 'наука', 'ии', 'ai', 'технологии', 'рынки', 'история', 'погода', 'мир'],
  'Спорт': ['спорт', 'футбол', 'хоккей', 'фитнес', 'бег', 'теннис', 'баскетбол', 'olympics', 'зож', 'тренировк'],
  'Развлечения': ['путешеств', 'иллюстрац', 'design', 'музыка', 'кино', 'игры', 'gaming', 'minecraft', 'мемы', 'сериалы', 'аниме', 'роблокс', 'roblox', 'арт', 'art', 'концерт', 'рецепт', 'еда'],
};
function categoryOf(tag) {
  const t = tag.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) if (words.some((w) => t === w || (w.length > 3 && t.startsWith(w)))) return cat;
  return 'Актуальное';
}
function trends(limit = 10, category = null) {
  const since = Date.now() - 14 * 864e5;
  const counts = new Map();
  for (const p of db.posts.values()) {
    if (p.createdAt < since) continue;
    for (const tag of extractTags(p.text)) {
      const key = tag.toLowerCase();
      const c = counts.get(key) || { tag, count: 0, recent: 0 };
      c.count += 1 + db.likes.ofB(p.id).size * 0.2 + db.reposts.ofB(p.id).size * 0.5;
      c.posts = (c.posts || 0) + 1;
      if (Date.now() - p.createdAt < 864e5) c.recent += 1;
      counts.set(key, c);
    }
  }
  let list = [...counts.values()].map((c) => ({ tag: c.tag, posts: c.posts, score: c.count + c.recent * 2, category: categoryOf(c.tag) }));
  if (category) list = list.filter((t) => t.category === category);
  return list.sort((a, b) => b.score - a.score).slice(0, limit)
    .map((t) => ({ tag: t.tag, category: t.category, posts: t.posts }));
}

/* ------------------------------------------------------------------ */
/*  HTTP                                                                */
/* ------------------------------------------------------------------ */

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(httpError(413, 'Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(httpError(400, 'Неверный JSON')); }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionCookie(token, maxAge = 60 * 60 * 24 * 365) {
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler, auth: opts.auth !== false });
}

/* ---------- Авторизация ---------- */

route('POST', '/api/register', async (ctx) => {
  const { username, name, password } = ctx.body;
  if (!/^[A-Za-z0-9_]{3,15}$/.test(username || '')) throw httpError(400, 'Имя пользователя: 3–15 символов, латиница, цифры и _');
  if (RESERVED.has(username.toLowerCase()) || userByName(username)) throw httpError(409, 'Это имя пользователя уже занято');
  const displayName = String(name || '').trim().slice(0, 50);
  if (!displayName) throw httpError(400, 'Введите имя');
  if (String(password || '').length < 6) throw httpError(400, 'Пароль должен быть не короче 6 символов');
  const { salt, hash } = hashPassword(password);
  const u = {
    id: nextId(), username, name: displayName, salt, hash, bio: '', location: '', website: '',
    avatar: null, banner: null, verified: false, createdAt: Date.now(), pinned: null,
  };
  indexUser(u);
  // Новичок сразу читает официальный аккаунт
  const official = userByName('nova'); if (official) db.follows.add(u.id, official.id);
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions.set(token, u.id); markDirty();
  return { status: 201, data: { user: fullUser(u, u.id) }, headers: { 'Set-Cookie': sessionCookie(token) } };
}, { auth: false });

route('POST', '/api/login', async (ctx) => {
  const u = userByName(ctx.body.username?.replace(/^@/, ''));
  if (!u || !checkPassword(u, ctx.body.password || '')) throw httpError(401, 'Неверное имя пользователя или пароль');
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions.set(token, u.id); markDirty();
  return { data: { user: fullUser(u, u.id) }, headers: { 'Set-Cookie': sessionCookie(token) } };
}, { auth: false });

route('POST', '/api/logout', async (ctx) => {
  db.sessions.delete(ctx.token); markDirty();
  return { data: { ok: true }, headers: { 'Set-Cookie': sessionCookie('', 0) } };
});

route('GET', '/api/health', async () => ({ data: { ok: true } }), { auth: false });

route('GET', '/api/me', async (ctx) => ({ data: { user: fullUser(ctx.user, ctx.user.id), unread: unreadCounts(ctx.user.id) } }));

route('PUT', '/api/me', async (ctx) => {
  const u = ctx.user, b = ctx.body;
  if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 50); if (!n) throw httpError(400, 'Имя не может быть пустым'); u.name = n; }
  if (b.bio !== undefined) u.bio = String(b.bio).slice(0, 160);
  if (b.location !== undefined) u.location = String(b.location).slice(0, 30);
  if (b.website !== undefined) u.website = String(b.website).trim().slice(0, 100);
  if (b.avatar !== undefined) u.avatar = acceptImage(b.avatar);
  if (b.banner !== undefined) u.banner = acceptImage(b.banner);
  markDirty();
  return { data: { user: fullUser(u, u.id) } };
});

route('POST', '/api/me/password', async (ctx) => {
  const { current, next } = ctx.body;
  if (!checkPassword(ctx.user, current || '')) throw httpError(400, 'Текущий пароль указан неверно');
  if (String(next || '').length < 6) throw httpError(400, 'Новый пароль должен быть не короче 6 символов');
  Object.assign(ctx.user, hashPassword(next)); markDirty();
  return { data: { ok: true } };
});

route('POST', '/api/premium', async (ctx) => {
  ctx.user.verified = !!ctx.body.enable; markDirty();
  return { data: { user: fullUser(ctx.user, ctx.user.id) } };
});

route('POST', '/api/upload', async (ctx) => ({ data: { url: saveDataUrl(ctx.body.dataUrl) } }));

/* ---------- Ленты ---------- */

route('GET', '/api/feed', async (ctx) => {
  const me = ctx.user.id;
  const limit = 20;
  if (ctx.query.get('tab') === 'following') {
    const before = Number(ctx.query.get('cursor')) || Infinity;
    const ids = [me, ...db.follows.ofA(me).keys()];
    const items = timeline(ids, { before, limit });
    return { data: { items: serializeItems(items, me), cursor: items.length === limit ? items[items.length - 1].at : null } };
  }
  const offset = Number(ctx.query.get('cursor')) || 0;
  const now = Date.now();
  const ranked = [...db.posts.values()].filter((p) => !p.replyTo)
    .map((p) => ({ p, s: postScore(p, me, now) })).sort((a, b) => b.s - a.s);
  const page = ranked.slice(offset, offset + limit).map(({ p }) => ({ kind: 'post', post: p, at: p.createdAt }));
  return { data: { items: serializeItems(page, me), cursor: offset + limit < ranked.length ? offset + limit : null } };
});

/* ---------- Посты ---------- */

route('POST', '/api/posts', async (ctx) => {
  const p = createPost(ctx.user, ctx.body);
  return { status: 201, data: { post: serializePost(p, ctx.user.id) } };
});

route('GET', '/api/posts/:id', async (ctx) => {
  const p = db.posts.get(ctx.params.id);
  if (!p) throw httpError(404, 'Этот пост был удалён или не существует');
  const me = ctx.user.id;
  const ancestors = [];
  let cur = p, guard = 0;
  while (cur.replyTo && guard++ < 50) {
    const parent = db.posts.get(cur.replyTo);
    if (!parent) { ancestors.unshift({ unavailable: true }); break; }
    ancestors.unshift(serializePost(parent, me)); cur = parent;
  }
  const replies = [...(db.replies.get(p.id) || [])].map((id) => db.posts.get(id)).filter(Boolean)
    .sort((a, b) => {
      const ma = a.authorId === me ? 1 : 0, mb = b.authorId === me ? 1 : 0;
      if (ma !== mb) return mb - ma;
      const oa = a.authorId === p.authorId ? 1 : 0, ob = b.authorId === p.authorId ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return (db.likes.ofB(b.id).size - db.likes.ofB(a.id).size) || (b.createdAt - a.createdAt);
    })
    .map((r) => {
      const s = serializePost(r, me);
      // показываем первый ответ на ответ (как ветку в X)
      const sub = [...(db.replies.get(r.id) || [])].map((id) => db.posts.get(id)).filter(Boolean)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (sub) s.child = serializePost(sub, me);
      return s;
    });
  return { data: { post: serializePost(p, me), ancestors, replies } };
});

route('DELETE', '/api/posts/:id', async (ctx) => {
  const p = db.posts.get(ctx.params.id);
  if (!p) throw httpError(404, 'Пост не найден');
  if (p.authorId !== ctx.user.id) throw httpError(403, 'Нельзя удалить чужой пост');
  deletePost(p);
  return { data: { ok: true } };
});

function postAction(rel, notifyType) {
  return async (ctx) => {
    const p = db.posts.get(ctx.params.id);
    if (!p) throw httpError(404, 'Пост не найден');
    const on = ctx.body.on === undefined ? !rel.has(ctx.user.id, p.id) : !!ctx.body.on;
    if (on) { if (rel.add(ctx.user.id, p.id) && notifyType) notify(p.authorId, notifyType, ctx.user.id, p.id); }
    else rel.remove(ctx.user.id, p.id);
    return { data: { post: serializePost(p, ctx.user.id) } };
  };
}
route('POST', '/api/posts/:id/like', postAction(db.likes, 'like'));
route('POST', '/api/posts/:id/repost', postAction(db.reposts, 'repost'));
route('POST', '/api/posts/:id/bookmark', postAction(db.bookmarks, null));

route('POST', '/api/posts/:id/vote', async (ctx) => {
  const p = db.posts.get(ctx.params.id);
  if (!p || !p.poll) throw httpError(404, 'Опрос не найден');
  if (Date.now() > p.poll.endsAt) throw httpError(400, 'Опрос завершён');
  if (p.poll.options.some((o) => o.votes.includes(ctx.user.id))) throw httpError(400, 'Вы уже проголосовали');
  const opt = p.poll.options[Number(ctx.body.option)];
  if (!opt) throw httpError(400, 'Нет такого варианта');
  opt.votes.push(ctx.user.id); markDirty();
  return { data: { post: serializePost(p, ctx.user.id) } };
});

route('POST', '/api/posts/:id/pin', async (ctx) => {
  const p = db.posts.get(ctx.params.id);
  if (!p || p.authorId !== ctx.user.id) throw httpError(404, 'Пост не найден');
  ctx.user.pinned = ctx.user.pinned === p.id ? null : p.id; markDirty();
  return { data: { pinned: ctx.user.pinned } };
});

route('GET', '/api/posts/:id/engagements', async (ctx) => {
  const p = db.posts.get(ctx.params.id);
  if (!p) throw httpError(404, 'Пост не найден');
  const type = ctx.query.get('type');
  const me = ctx.user.id;
  if (type === 'quotes') {
    const qs = [...(db.quotes.get(p.id) || [])].map((id) => db.posts.get(id)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
    return { data: { posts: qs.map((q) => serializePost(q, me)) } };
  }
  const rel = type === 'reposts' ? db.reposts : db.likes;
  const users = [...rel.ofB(p.id).entries()].sort((a, b) => b[1] - a[1]).map(([uid]) => miniUser(db.users.get(uid), me)).filter(Boolean);
  return { data: { users } };
});

route('POST', '/api/views', async (ctx) => {
  for (const id of (ctx.body.ids || []).slice(0, 100)) {
    const p = db.posts.get(String(id));
    if (p) p.views = (p.views || 0) + 1;
  }
  markDirty();
  return { data: { ok: true } };
});

/* ---------- Пользователи ---------- */

route('GET', '/api/users/:username', async (ctx) => {
  const u = userByName(ctx.params.username);
  if (!u) throw httpError(404, 'Эта учётная запись не существует');
  const me = ctx.user.id;
  const data = { user: fullUser(u, me) };
  if (u.pinned && db.posts.has(u.pinned)) data.pinned = serializePost(db.posts.get(u.pinned), me);
  // «Читают X и Y, которых вы знаете»
  data.mutuals = [...db.follows.ofB(u.id).keys()].filter((id) => id !== me && db.follows.has(me, id)).slice(0, 3)
    .map((id) => miniUser(db.users.get(id), me));
  return { data };
});

route('GET', '/api/users/:username/posts', async (ctx) => {
  const u = userByName(ctx.params.username);
  if (!u) throw httpError(404, 'Эта учётная запись не существует');
  const me = ctx.user.id, tab = ctx.query.get('tab') || 'posts', limit = 20;
  const cursor = ctx.query.get('cursor');
  if (tab === 'posts' || tab === 'replies') {
    const before = Number(cursor) || Infinity;
    let items = timeline([u.id], { includeReplies: tab === 'replies', before, limit: 1e9 });
    if (tab === 'posts' && u.pinned) items = items.filter((i) => !(i.kind === 'post' && i.post.id === u.pinned));
    items = items.slice(0, limit);
    return { data: { items: serializeItems(items, me), cursor: items.length === limit ? items[items.length - 1].at : null } };
  }
  const offset = Number(cursor) || 0;
  let posts;
  if (tab === 'media') {
    posts = [...(db.byAuthor.get(u.id) || [])].map((id) => db.posts.get(id)).filter((p) => p && p.media.length).sort((a, b) => b.createdAt - a.createdAt);
  } else if (tab === 'likes') {
    if (u.id !== me) throw httpError(403, 'Отметки «Нравится» видны только владельцу');
    posts = [...db.likes.ofA(u.id).entries()].sort((a, b) => b[1] - a[1]).map(([id]) => db.posts.get(id)).filter(Boolean);
  } else throw httpError(400, 'Неизвестная вкладка');
  const page = posts.slice(offset, offset + limit);
  return { data: { items: serializeItems(page.map((p) => ({ kind: 'post', post: p, at: p.createdAt })), me), cursor: offset + limit < posts.length ? offset + limit : null } };
});

route('POST', '/api/users/:username/follow', async (ctx) => {
  const u = userByName(ctx.params.username);
  if (!u) throw httpError(404, 'Пользователь не найден');
  if (u.id === ctx.user.id) throw httpError(400, 'Нельзя читать самого себя');
  const on = ctx.body.on === undefined ? !db.follows.has(ctx.user.id, u.id) : !!ctx.body.on;
  if (on) { if (db.follows.add(ctx.user.id, u.id)) notify(u.id, 'follow', ctx.user.id); }
  else db.follows.remove(ctx.user.id, u.id);
  return { data: { user: fullUser(u, ctx.user.id) } };
});

for (const list of ['followers', 'following', 'mutuals']) {
  route('GET', `/api/users/:username/${list}`, async (ctx) => {
    const u = userByName(ctx.params.username);
    if (!u) throw httpError(404, 'Пользователь не найден');
    let ids;
    if (list === 'followers') ids = [...db.follows.ofB(u.id).entries()];
    else if (list === 'following') ids = [...db.follows.ofA(u.id).entries()];
    else ids = [...db.follows.ofB(u.id).entries()].filter(([id]) => db.follows.has(ctx.user.id, id));
    const users = ids.sort((a, b) => b[1] - a[1]).map(([id]) => miniUser(db.users.get(id), ctx.user.id)).filter(Boolean);
    return { data: { user: fullUser(u, ctx.user.id), users } };
  });
}

route('GET', '/api/suggestions', async (ctx) => {
  const me = ctx.user.id;
  const n = Math.min(Number(ctx.query.get('limit')) || 3, 30);
  const users = [...db.users.values()].filter((u) => u.id !== me && !db.follows.has(me, u.id))
    .map((u) => {
      // друзья друзей ценнее
      let s = db.follows.ofB(u.id).size;
      for (const f of db.follows.ofB(u.id).keys()) if (db.follows.has(me, f)) s += 5;
      return { u, s };
    })
    .sort((a, b) => b.s - a.s).slice(0, n).map(({ u }) => miniUser(u, me));
  return { data: { users } };
});

/* ---------- Поиск, тренды ---------- */

route('GET', '/api/search', async (ctx) => {
  const me = ctx.user.id;
  const raw = (ctx.query.get('q') || '').trim();
  const f = ctx.query.get('f') || 'top';
  const q = raw.toLowerCase();
  if (!q) return { data: { items: [], users: [] } };
  const userMatch = (u) => u.username.toLowerCase().includes(q.replace(/^@/, '')) || u.name.toLowerCase().includes(q) || (u.bio || '').toLowerCase().includes(q);
  const users = [...db.users.values()].filter(userMatch)
    .sort((a, b) => db.follows.ofB(b.id).size - db.follows.ofB(a.id).size)
    .map((u) => miniUser(u, me));
  if (f === 'user') return { data: { users: users.slice(0, 50), items: [] } };

  let fromUser = null, term = q;
  const fm = /(?:^|\s)from:@?(\w+)/.exec(q);
  if (fm) { fromUser = userByName(fm[1]); term = q.replace(fm[0], '').trim(); }
  const words = term.split(/\s+/).filter(Boolean);
  let posts = [...db.posts.values()].filter((p) => {
    if (fromUser && p.authorId !== fromUser.id) return false;
    const t = p.text.toLowerCase();
    return words.every((w) => {
      if (w.startsWith('#')) return extractTags(p.text).some((tag) => tag.toLowerCase() === w.slice(1));
      return t.includes(w);
    });
  });
  if (f === 'media') posts = posts.filter((p) => p.media.length);
  if (f === 'live' || f === 'media') posts.sort((a, b) => b.createdAt - a.createdAt);
  else { const now = Date.now(); posts.sort((a, b) => postScore(b, me, now) * 5 - postScore(a, me, now) * 5 || b.createdAt - a.createdAt); }
  const offset = Number(ctx.query.get('cursor')) || 0;
  const page = posts.slice(offset, offset + 20);
  return {
    data: {
      items: serializeItems(page.map((p) => ({ kind: 'post', post: p, at: p.createdAt })), me),
      users: f === 'top' && offset === 0 ? users.slice(0, 3) : [],
      cursor: offset + 20 < posts.length ? offset + 20 : null,
    },
  };
});

route('GET', '/api/search/typeahead', async (ctx) => {
  const q = (ctx.query.get('q') || '').trim().toLowerCase().replace(/^@/, '');
  if (!q) return { data: { users: [], tags: [] } };
  const users = [...db.users.values()].filter((u) => u.username.toLowerCase().startsWith(q) || u.name.toLowerCase().includes(q))
    .sort((a, b) => db.follows.ofB(b.id).size - db.follows.ofB(a.id).size).slice(0, 6).map((u) => miniUser(u, ctx.user.id));
  const tags = trends(100).filter((t) => t.tag.toLowerCase().includes(q.replace(/^#/, ''))).slice(0, 4);
  return { data: { users, tags } };
});

route('GET', '/api/trends', async (ctx) => {
  const cat = ctx.query.get('category');
  return { data: { trends: trends(Number(ctx.query.get('limit')) || 10, cat || null) } };
});

/* ---------- Уведомления ---------- */

route('GET', '/api/notifications', async (ctx) => {
  const me = ctx.user.id;
  const mentionsOnly = ctx.query.get('tab') === 'mentions';
  const mine = db.notifications.filter((n) => n.userId === me && (!mentionsOnly || ['mention', 'reply', 'quote'].includes(n.type)))
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 300);
  // Группируем лайки/репосты одного поста и подписки за сутки
  const groups = [];
  const index = new Map();
  for (const n of mine) {
    const groupable = ['like', 'repost', 'follow'].includes(n.type);
    const key = groupable ? `${n.type}:${n.postId || ''}:${Math.floor(n.createdAt / 864e5)}` : null;
    if (key && index.has(key)) { const g = index.get(key); g.actors.push(n.actorId); g.unread = g.unread || !n.read; continue; }
    const g = { id: n.id, type: n.type, postId: n.postId, createdAt: n.createdAt, actors: [n.actorId], unread: !n.read };
    groups.push(g); if (key) index.set(key, g);
  }
  const out = groups.slice(0, 100).map((g) => {
    const actors = [...new Set(g.actors)].map((id) => miniUser(db.users.get(id), me)).filter(Boolean);
    const p = g.postId ? db.posts.get(g.postId) : null;
    return { ...g, actors, post: p ? serializePost(p, me) : null };
  }).filter((g) => g.actors.length && (g.type === 'follow' || g.post));
  return { data: { notifications: out } };
});

route('POST', '/api/notifications/read', async (ctx) => {
  for (const n of db.notifications) if (n.userId === ctx.user.id) n.read = true;
  markDirty();
  push(ctx.user.id, 'unread', unreadCounts(ctx.user.id));
  return { data: { ok: true } };
});

route('GET', '/api/unread', async (ctx) => ({ data: unreadCounts(ctx.user.id) }));

/* ---------- Закладки ---------- */

route('GET', '/api/bookmarks', async (ctx) => {
  const me = ctx.user.id;
  const posts = [...db.bookmarks.ofA(me).entries()].sort((a, b) => b[1] - a[1]).map(([id]) => db.posts.get(id)).filter(Boolean);
  return { data: { items: serializeItems(posts.map((p) => ({ kind: 'post', post: p, at: p.createdAt })), me) } };
});
route('DELETE', '/api/bookmarks', async (ctx) => { db.bookmarks.dropA(ctx.user.id); return { data: { ok: true } }; });

/* ---------- Сообщения ---------- */

function messageView(m) { return { id: m.id, from: m.from, to: m.to, text: m.text, media: m.media || [], createdAt: m.createdAt, read: m.read }; }

route('GET', '/api/messages', async (ctx) => {
  const me = ctx.user.id;
  const convs = new Map();
  for (const m of db.messages) {
    if (m.from !== me && m.to !== me) continue;
    const other = m.from === me ? m.to : m.from;
    const c = convs.get(other) || { last: null, unread: 0 };
    if (!c.last || c.last.createdAt < m.createdAt) c.last = m;
    if (m.to === me && !m.read) c.unread++;
    convs.set(other, c);
  }
  const list = [...convs.entries()].sort((a, b) => b[1].last.createdAt - a[1].last.createdAt)
    .map(([uid, c]) => ({ user: miniUser(db.users.get(uid), me), last: messageView(c.last), unread: c.unread }))
    .filter((c) => c.user);
  return { data: { conversations: list } };
});

route('GET', '/api/messages/:username', async (ctx) => {
  const other = userByName(ctx.params.username);
  if (!other) throw httpError(404, 'Пользователь не найден');
  const me = ctx.user.id;
  let changed = false;
  const msgs = db.messages.filter((m) => (m.from === me && m.to === other.id) || (m.from === other.id && m.to === me));
  for (const m of msgs) if (m.to === me && !m.read) { m.read = true; changed = true; }
  if (changed) { markDirty(); push(me, 'unread', unreadCounts(me)); push(other.id, 'read', { by: me }); }
  return { data: { user: fullUser(other, me), messages: msgs.slice(-500).map(messageView) } };
});

route('POST', '/api/messages/:username', async (ctx) => {
  const other = userByName(ctx.params.username);
  if (!other) throw httpError(404, 'Пользователь не найден');
  const text = String(ctx.body.text || '').trim().slice(0, 10000);
  const media = (Array.isArray(ctx.body.media) ? ctx.body.media : []).slice(0, 1).map(acceptImage).filter(Boolean);
  if (!text && !media.length) throw httpError(400, 'Пустое сообщение');
  const m = { id: nextId(), from: ctx.user.id, to: other.id, text, media, createdAt: Date.now(), read: other.id === ctx.user.id };
  db.messages.push(m); markDirty();
  const view = messageView(m);
  push(other.id, 'message', { message: view, user: miniUser(ctx.user, other.id) });
  push(other.id, 'unread', unreadCounts(other.id));
  push(ctx.user.id, 'message', { message: view, user: miniUser(other, ctx.user.id), own: true });
  return { status: 201, data: { message: view } };
});

/* ---------- Realtime ---------- */

route('GET', '/api/events', async (ctx) => {
  const { res, user } = ctx;
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: unread\ndata: ${JSON.stringify(unreadCounts(user.id))}\n\n`);
  if (!streams.has(user.id)) streams.set(user.id, new Set());
  streams.get(user.id).add(res);
  ctx.req.on('close', () => { streams.get(user.id)?.delete(res); });
  return { raw: true };
});

/* ------------------------------------------------------------------ */
/*  Статика                                                             */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
function serveFile(res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache };
    if (ext === '.svg') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}
function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/uploads/')) {
    const name = path.basename(pathname);
    const file = path.join(UPLOADS, name);
    if (fs.existsSync(file) || !/^[\w.-]+$/.test(name)) return serveFile(res, file, 'public, max-age=31536000, immutable');
    // файла нет в локальном кэше — достаём из базы
    return storage.getFile(name).then(() => serveFile(res, file, 'public, max-age=31536000, immutable'))
      .catch(() => { res.writeHead(500); res.end(); });
  }
  const safe = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const file = path.join(PUBLIC, safe);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (path.extname(file) && fs.existsSync(file)) return serveFile(res, file, 'no-cache');
  // SPA: всё остальное отдаёт index.html
  return serveFile(res, path.join(PUBLIC, 'index.html'), 'no-cache');
}

/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, pathname);
  }
  try {
    let match = null, r = null;
    for (const cand of routes) {
      if (cand.method !== req.method) continue;
      const m = cand.re.exec(pathname);
      if (m) { r = cand; match = m; break; }
    }
    if (!r) throw httpError(404, 'Нет такого метода API');
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
    const token = parseCookies(req).sid;
    const user = token ? db.users.get(db.sessions.get(token)) : null;
    if (r.auth && !user) throw httpError(401, 'Нужно войти');
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    const out = await r.handler({ req, res, params, query: url.searchParams, body, user, token });
    if (out.raw) return;
    sendJson(res, out.status || 200, out.data, out.headers);
  } catch (e) {
    if (!e.status) console.error(e);
    sendJson(res, e.status || 500, { error: e.status ? e.message : 'Внутренняя ошибка сервера' });
  }
});

/* ------------------------------------------------------------------ */

async function shutdown() {
  try { await saveNow(); await storage.flush(); } catch (e) { console.error(e.message); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Порт ${PORT} уже занят — похоже, сервер уже запущен.`);
    console.error(`  Откройте http://localhost:${PORT} или запустите на другом порту:  set PORT=3001 && node server.js\n`);
  } else console.error(e);
  process.exit(1);
});

(async function start() {
  await storage.init();
  const data = await storage.load();
  if (data) applyData(data);
  else {
    console.log('Создаю демо-данные…');
    require('./seed').seed({ db, indexUser, indexPost, nextId, hashPassword, storeFile: (name, buf) => storage.putFile(name, buf), markDirty });
    dirty = true;
    await saveNow();
    await storage.flush();
  }
  server.listen(PORT, '0.0.0.0', () => {
    const nets = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
    console.log('\n  Nova запущена!  Хранилище: ' + storage.kind + '\n');
    console.log(`  На этом компьютере:   http://localhost:${PORT}`);
    for (const n of nets) console.log(`  В локальной сети:     http://${n.address}:${PORT}`);
    console.log('\n  Демо-вход: demo / demo123');
    console.log('  Остановить: Ctrl+C\n');
  });
})().catch((e) => { console.error('Не удалось запустить сервер:', e.message); process.exit(1); });
