'use strict';
/*
 * Хранилище данных.
 *  - По умолчанию: файл data/db.json и картинки в data/uploads (для запуска на своём компьютере).
 *  - Если задана переменная DATABASE_URL: всё хранится в PostgreSQL (для хостингов,
 *    где диск стирается при перезапуске — например, бесплатный Render).
 */
const fs = require('fs');
const path = require('path');

function localStorage({ DB_FILE, UPLOADS }) {
  return {
    kind: 'файлы (data/)',
    async init() {},
    async load() {
      if (!fs.existsSync(DB_FILE)) return null;
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    },
    async save(json) {
      const tmp = DB_FILE + '.tmp';
      try {
        fs.writeFileSync(tmp, json);
        fs.renameSync(tmp, DB_FILE);
      } catch {
        // Windows иногда блокирует rename (антивирус) — пишем напрямую
        fs.writeFileSync(DB_FILE, json);
      }
    },
    putFile(name, buf) { fs.writeFileSync(path.join(UPLOADS, name), buf); },
    async getFile() { return null; },
    async flush() {},
  };
}

function pgStorage({ UPLOADS }) {
  let Pool;
  try { ({ Pool } = require('pg')); } catch {
    throw new Error('Задан DATABASE_URL, но пакет "pg" не установлен. Выполните: npm install');
  }
  const url = process.env.DATABASE_URL;
  let host = '';
  try { host = new URL(url).hostname; } catch { /* ничего */ }
  // Внутренние адреса Render (dpg-xxxx-a) — без SSL, внешние базы (Neon, Supabase…) — с SSL
  const ssl = process.env.PGSSL === 'disable' || !host.includes('.') || host === 'localhost' || host === '127.0.0.1'
    ? false : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, ssl, max: 4 });
  pool.on('error', (e) => console.error('PostgreSQL:', e.message));

  let chain = Promise.resolve();
  const pending = new Set();
  const track = (p) => { pending.add(p); p.finally(() => pending.delete(p)); return p; };

  return {
    kind: 'PostgreSQL',
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS nova_state (id INT PRIMARY KEY, data TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS nova_files (name TEXT PRIMARY KEY, data BYTEA NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
    },
    async load() {
      const r = await pool.query('SELECT data FROM nova_state WHERE id = 1');
      return r.rows.length ? JSON.parse(r.rows[0].data) : null;
    },
    save(json) {
      // сохранения идут строго по очереди
      chain = chain.then(() => pool.query(
        'INSERT INTO nova_state (id, data, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [json]));
      return track(chain);
    },
    putFile(name, buf) {
      fs.writeFileSync(path.join(UPLOADS, name), buf); // локальный кэш
      track(pool.query('INSERT INTO nova_files (name, data) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, buf])
        .catch((e) => console.error('Не удалось сохранить файл', name, e.message)));
    },
    async getFile(name) {
      const r = await pool.query('SELECT data FROM nova_files WHERE name = $1', [name]);
      if (!r.rows.length) return null;
      fs.writeFileSync(path.join(UPLOADS, name), r.rows[0].data);
      return true;
    },
    async flush() { await Promise.allSettled([...pending]); },
  };
}

module.exports = function createStorage(opts) {
  return process.env.DATABASE_URL ? pgStorage(opts) : localStorage(opts);
};
