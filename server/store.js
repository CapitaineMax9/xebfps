// Stockage des comptes : fichier JSON (par défaut) ou PostgreSQL (si DATABASE_URL est défini).
import fs from 'node:fs';
import path from 'node:path';

// ── Fichier JSON ─────────────────────────────────────────────────────────
class FileStore {
  constructor(file) {
    this.file = file;
    this.kind = 'fichier';
    this.accounts = new Map();   // id -> compte
    this.byName = new Map();     // nom en minuscules -> id
    this.sessions = new Map();   // hash du jeton -> id
    this.timer = null;
  }

  async init() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const a of data.accounts || []) this.index(a);
      for (const [h, id] of Object.entries(data.sessions || {})) if (this.accounts.has(id)) this.sessions.set(h, id);
    }
  }

  index(a) {
    this.accounts.set(a.id, a);
    if (a.nameLower) this.byName.set(a.nameLower, a.id);
  }

  async findBySession(hash) { const id = this.sessions.get(hash); return id ? this.accounts.get(id) || null : null; }
  async findByName(nameLower) { const id = this.byName.get(nameLower); return id ? this.accounts.get(id) || null : null; }
  async nameTaken(nameLower) { return this.byName.has(nameLower); }
  async create(a) { this.index(a); this.schedule(); }
  async addSession(hash, id) { this.sessions.set(hash, id); this.schedule(); }
  async removeSession(hash) { this.sessions.delete(hash); this.schedule(); }
  async save(a) { this.index(a); this.schedule(); }
  async rename(a) { for (const [k, v] of this.byName) if (v === a.id) this.byName.delete(k); this.index(a); this.schedule(); }

  async cleanup(maxAgeMs) {
    const lim = Date.now() - maxAgeMs;
    for (const a of [...this.accounts.values()]) {
      if (!a.nameLower && (a.lastSeen || 0) < lim) {
        this.accounts.delete(a.id);
        for (const [h, id] of this.sessions) if (id === a.id) this.sessions.delete(h);
      }
    }
    this.schedule();
  }

  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 800);
  }

  flush() {
    const data = { accounts: [...this.accounts.values()], sessions: Object.fromEntries(this.sessions) };
    const tmp = this.file + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('Sauvegarde impossible :', e.message); }
  }

  async close() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.flush(); }
}

// ── PostgreSQL ───────────────────────────────────────────────────────────
class PgStore {
  constructor(url) {
    this.url = url;
    this.kind = 'PostgreSQL';
    this.cache = new Map();    // id -> compte (le serveur est la seule source de vérité)
    this.pending = new Map();  // id -> timer de sauvegarde
  }

  async init() {
    const { default: pg } = await import('pg');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(this.url);
    this.pool = new pg.Pool({ connectionString: this.url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
    await this.pool.query(`
      create table if not exists accounts (
        id text primary key,
        name_lower text unique,
        data jsonb not null,
        last_seen timestamptz not null default now()
      );
      create table if not exists sessions (
        token_hash text primary key,
        account_id text not null references accounts(id) on delete cascade,
        created_at timestamptz not null default now()
      );`);
  }

  wrap(row) {
    if (!row) return null;
    if (this.cache.has(row.id)) return this.cache.get(row.id);
    const a = row.data;
    this.cache.set(a.id, a);
    return a;
  }

  async findBySession(hash) {
    const r = await this.pool.query('select a.id, a.data from sessions s join accounts a on a.id = s.account_id where s.token_hash = $1', [hash]);
    return this.wrap(r.rows[0]);
  }

  async findByName(nameLower) {
    const r = await this.pool.query('select id, data from accounts where name_lower = $1', [nameLower]);
    return this.wrap(r.rows[0]);
  }

  async nameTaken(nameLower) {
    const r = await this.pool.query('select 1 from accounts where name_lower = $1', [nameLower]);
    return r.rowCount > 0;
  }

  async create(a) {
    this.cache.set(a.id, a);
    await this.pool.query('insert into accounts (id, name_lower, data) values ($1, $2, $3)', [a.id, a.nameLower || null, a]);
  }

  async addSession(hash, id) {
    await this.pool.query('insert into sessions (token_hash, account_id) values ($1, $2) on conflict do nothing', [hash, id]);
  }

  async removeSession(hash) { await this.pool.query('delete from sessions where token_hash = $1', [hash]); }

  async save(a) {
    this.cache.set(a.id, a);
    if (this.pending.has(a.id)) return;
    this.pending.set(a.id, setTimeout(() => this.write(a.id), 800));
  }

  async write(id) {
    this.pending.delete(id);
    const a = this.cache.get(id);
    if (!a) return;
    try {
      await this.pool.query('update accounts set data = $2, name_lower = $3, last_seen = now() where id = $1', [id, a, a.nameLower || null]);
    } catch (e) { console.error('Sauvegarde PostgreSQL impossible :', e.message); }
  }

  async rename(a) {
    this.cache.set(a.id, a);
    await this.pool.query('update accounts set name_lower = $2, data = $3 where id = $1', [a.id, a.nameLower || null, a]);
  }

  async cleanup(maxAgeMs) {
    await this.pool.query('delete from accounts where name_lower is null and last_seen < now() - ($1 || \' milliseconds\')::interval', [String(maxAgeMs)]);
  }

  async close() {
    const ids = [...this.pending.keys()];
    for (const [, t] of this.pending) clearTimeout(t);
    await Promise.all(ids.map((id) => this.write(id)));
    await this.pool.end();
  }
}

export function createStore() {
  const url = process.env.DATABASE_URL;
  if (url) return new PgStore(url);
  return new FileStore(process.env.DATA_FILE || path.resolve('data', 'accounts.json'));
}
