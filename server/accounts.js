// Comptes joueurs et économie (crédits, caisses, inventaire), gérés par le serveur.
import crypto from 'node:crypto';
import { createStore } from './store.js';
import { SKINS, CASES, RARITIES, rollCase, makeItem, itemValue, tradeUpResult } from '../shared/skins.js';
import { PRIMARIES, SECONDARIES, MELEES, WEAPONS } from '../shared/weapons.js';
import { CREDITS } from '../shared/constants.js';

const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
export const MAX_INVENTORY = 10000;
export const OPEN_COUNTS = [1, 5, 10, 100];
const GUEST_MAX_AGE = 60 * 24 * 3600 * 1000;

export const store = createStore();

export async function initAccounts() {
  await store.init();
  try { await store.cleanup(GUEST_MAX_AGE); } catch (e) { console.error('Nettoyage des invités :', e.message); }
  console.log(`Comptes : stockage ${store.kind}`);
  if (store.kind === 'fichier' && process.env.RENDER) {
    console.warn('ATTENTION : pas de DATABASE_URL. Sur Render, les comptes seront perdus à chaque redémarrage. Voir le README (base Neon gratuite).');
  }
}

// ── Utilitaires ──────────────────────────────────────────────────────────
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const newId = () => crypto.randomBytes(9).toString('base64url');

function scrypt(pass, salt) {
  return new Promise((res, rej) => crypto.scrypt(pass, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
}

async function hashPassword(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(pass, salt);
  return { salt, hash: key.toString('hex') };
}

async function checkPassword(pass, rec) {
  if (!rec) return false;
  const key = await scrypt(pass, rec.salt);
  const ref = Buffer.from(rec.hash, 'hex');
  return ref.length === key.length && crypto.timingSafeEqual(ref, key);
}

export function cleanName(n) {
  return String(n ?? '').replace(/[<>"'&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

const USERNAME_RE = /^[\p{L}\p{N}_-]{3,16}$/u;

function newAccount(name) {
  const starter = ['glock_sable', 'p90_urbain', 'ssg_ondes'].map((id) => makeItem(id));
  return {
    id: newId(), name: cleanName(name) || 'Joueur' + Math.floor(Math.random() * 9000 + 1000), nameLower: null, pass: null,
    credits: CREDITS.start, inventory: starter, equipped: {}, loadout: { primary: 'awp', secondary: 'usp' },
    settings: {}, stats: { kills: 0, deaths: 0, hs: 0, cases: 0, matches: 0, wins: 0 },
    created: Date.now(), lastSeen: Date.now(), imported: false,
  };
}

// Comptes privilégiés : liste lue dans la variable d'environnement ADMIN_USERS (pseudos séparés par des virgules)
export function isAdmin(a) {
  if (!a || !a.nameLower) return false;
  return (process.env.ADMIN_USERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(a.nameLower);
}

// withInv = false : profil « léger » sans l'inventaire (les changements sont envoyés à part)
export function publicProfile(a, withInv = true) {
  const p = {
    name: a.name, registered: !!a.nameLower, credits: a.credits, equipped: a.equipped,
    loadout: a.loadout, settings: a.settings, stats: a.stats, invCount: a.inventory.length, invMax: MAX_INVENTORY,
  };
  if (withInv) p.inventory = a.inventory;
  if (isAdmin(a)) p.adm = true;
  return p;
}

function touch(a) { a.lastSeen = Date.now(); store.save(a); }

// Objet d'inventaire nettoyé (pour l'import depuis l'ancienne sauvegarde du navigateur)
function sanitizeItem(i) {
  if (!i || typeof i !== 'object' || !has(SKINS, i.skin)) return null;
  const s = SKINS[i.skin];
  const f = Math.min(s.maxF, Math.max(s.minF, Number(i.float) || s.minF));
  const it = makeItem(s.id);
  it.float = Math.round(f * 1e6) / 1e6;
  it.seed = Math.abs(Math.floor(Number(i.seed) || 0)) % 1000;
  it.st = !!i.st;
  it.kills = Math.min(1e6, Math.max(0, Math.floor(Number(i.kills) || 0)));
  return { it, oldUid: String(i.uid || '') };
}

// ── Authentification ─────────────────────────────────────────────────────
// Renvoie { acc, token } : compte existant si le jeton est valide, sinon nouveau compte invité.
export async function authenticate(token, name) {
  if (typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)) {
    const acc = await store.findBySession(sha(token));
    if (acc) { touch(acc); return { acc, token, created: false }; }
  }
  const acc = newAccount(name);
  await store.create(acc);
  const t = newToken();
  await store.addSession(sha(t), acc.id);
  return { acc, token: t, created: true };
}

// Import unique de l'ancienne progression stockée dans le navigateur
export function importLocal(acc, local) {
  if (acc.imported || acc.nameLower || !local || typeof local !== 'object') return false;
  acc.imported = true;
  const credits = Math.min(50000, Math.max(0, Math.floor(Number(local.credits) || 0)));
  const items = Array.isArray(local.inventory) ? local.inventory.slice(0, 300).map(sanitizeItem).filter(Boolean) : [];
  acc.credits = Math.max(acc.credits, credits);
  const map = new Map();
  acc.inventory = items.map(({ it, oldUid }) => { map.set(oldUid, it.uid); return it; });
  acc.equipped = {};
  if (local.equipped && typeof local.equipped === 'object') {
    for (const [w, uid] of Object.entries(local.equipped)) {
      const nu = map.get(String(uid));
      const it = acc.inventory.find((x) => x.uid === nu);
      if (it && SKINS[it.skin].weapon === w) acc.equipped[w] = nu;
    }
  }
  if (local.loadout) setLoadout(acc, local.loadout);
  if (local.name) acc.name = cleanName(local.name) || acc.name;
  store.save(acc);
  return true;
}

export async function register(acc, username, password) {
  const name = String(username ?? '').trim();
  if (!USERNAME_RE.test(name)) return { error: 'Pseudo invalide : 3 à 16 caractères (lettres, chiffres, _ ou -).' };
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) return { error: 'Le mot de passe doit faire entre 6 et 64 caractères.' };
  if (acc.nameLower) return { error: 'Ce compte est déjà enregistré.' };
  const lower = name.toLowerCase();
  if (await store.nameTaken(lower)) return { error: 'Ce pseudo est déjà pris.' };
  acc.pass = await hashPassword(password);
  acc.name = name;
  acc.nameLower = lower;
  try { await store.rename(acc); } catch { acc.nameLower = null; acc.pass = null; return { error: 'Ce pseudo est déjà pris.' }; }
  return { ok: true };
}

export async function login(username, password) {
  const lower = String(username ?? '').trim().toLowerCase();
  const acc = await store.findByName(lower);
  if (!acc || !(await checkPassword(String(password ?? ''), acc.pass))) return { error: 'Pseudo ou mot de passe incorrect.' };
  const t = newToken();
  await store.addSession(sha(t), acc.id);
  touch(acc);
  return { acc, token: t };
}

export async function logout(token) {
  if (typeof token === 'string') await store.removeSession(sha(token));
}

export async function changePassword(acc, oldPass, newPass) {
  if (!acc.nameLower) return { error: 'Crée d\'abord un compte.' };
  if (!(await checkPassword(String(oldPass ?? ''), acc.pass))) return { error: 'Ancien mot de passe incorrect.' };
  if (typeof newPass !== 'string' || newPass.length < 6 || newPass.length > 64) return { error: 'Le mot de passe doit faire entre 6 et 64 caractères.' };
  acc.pass = await hashPassword(newPass);
  store.save(acc);
  return { ok: true };
}

export function setGuestName(acc, name) {
  if (acc.nameLower) return;
  const n = cleanName(name);
  if (n) { acc.name = n; store.save(acc); }
}

// ── Économie ─────────────────────────────────────────────────────────────
export function openCase(acc, caseId, count = 1) {
  const c = CASES.find((x) => x.id === caseId);
  if (!c) return { error: 'Caisse inconnue.' };
  const n = OPEN_COUNTS.includes(Number(count)) ? Number(count) : 1;
  if (acc.credits < c.price * n) return { error: `Pas assez de crédits (il te faut ${(c.price * n).toLocaleString('fr-FR')} ◈ pour ${n} caisse${n > 1 ? 's' : ''}).` };
  if (acc.inventory.length + n > MAX_INVENTORY) return { error: `Inventaire plein (${MAX_INVENTORY} objets max) : vends quelques objets.` };
  acc.credits -= c.price * n;
  const items = [];
  for (let i = 0; i < n; i++) items.push(rollCase(c));
  acc.inventory.push(...items);
  acc.stats.cases = (acc.stats.cases || 0) + n;
  store.save(acc);
  return { item: items[0], items };
}

// Vente groupée (ignore les objets inconnus ; déséquipe ce qui est vendu)
export function sellMany(acc, uids) {
  if (!Array.isArray(uids)) return { error: 'Liste invalide.' };
  const set = new Set(uids.slice(0, MAX_INVENTORY).map(String));
  let value = 0, count = 0;
  const sold = [];
  acc.inventory = acc.inventory.filter((i) => {
    if (!set.has(i.uid)) return true;
    value += itemValue(i); count++; sold.push(i.uid);
    return false;
  });
  for (const [w, u] of Object.entries(acc.equipped)) if (set.has(u)) delete acc.equipped[w];
  acc.credits += value;
  store.save(acc);
  return { value, count, uids: sold };
}

export function sell(acc, uid) {
  const it = acc.inventory.find((i) => i.uid === uid);
  if (!it) return { error: 'Objet introuvable.' };
  acc.inventory = acc.inventory.filter((i) => i !== it);
  for (const [w, u] of Object.entries(acc.equipped)) if (u === uid) delete acc.equipped[w];
  const v = itemValue(it);
  acc.credits += v;
  store.save(acc);
  return { value: v, uid };
}

export function equip(acc, uid) {
  const it = acc.inventory.find((i) => i.uid === uid);
  if (!it) return { error: 'Objet introuvable.' };
  acc.equipped[SKINS[it.skin].weapon] = uid;
  store.save(acc);
  return { ok: true };
}

export function unequip(acc, weapon) {
  if (typeof weapon === 'string') delete acc.equipped[weapon];
  store.save(acc);
  return { ok: true };
}

export function tradeUp(acc, uids) {
  if (!Array.isArray(uids) || uids.length !== 10 || new Set(uids).size !== 10) return { error: 'Il faut 10 objets différents.' };
  const items = uids.map((u) => acc.inventory.find((i) => i.uid === u));
  if (items.some((i) => !i)) return { error: 'Objet introuvable.' };
  const res = tradeUpResult(items);
  if (!res) return { error: 'Contrat invalide (10 objets de la même rareté, hors Secret et ★).' };
  const set = new Set(uids);
  acc.inventory = acc.inventory.filter((i) => !set.has(i.uid));
  for (const [w, u] of Object.entries(acc.equipped)) if (set.has(u)) delete acc.equipped[w];
  acc.inventory.push(res);
  store.save(acc);
  return { item: res };
}

export function setLoadout(acc, lo) {
  if (!lo || typeof lo !== 'object') return;
  acc.loadout = {
    primary: PRIMARIES.includes(lo.primary) ? lo.primary : acc.loadout.primary,
    secondary: SECONDARIES.includes(lo.secondary) ? lo.secondary : acc.loadout.secondary,
    melee: MELEES.includes(lo.melee) ? lo.melee : (acc.loadout.melee || 'knife'),
  };
  store.save(acc);
}

export function setSettings(acc, st) {
  if (!st || typeof st !== 'object') return;
  const out = {};
  for (const [k, v] of Object.entries(st).slice(0, 40)) {
    if (typeof k !== 'string' || k.length > 24) continue;
    if (['number', 'boolean'].includes(typeof v) || (typeof v === 'string' && v.length <= 24)) out[k] = v;
  }
  acc.settings = out;
  store.save(acc);
}

export function reward(acc, n) {
  acc.credits += Math.max(0, Math.floor(n));
  store.save(acc);
  return acc.credits;
}

// Statistiques du classement (rstats) : comptées seulement si le joueur joue « normalement »
function rs(acc) { return (acc.rstats = acc.rstats || { kills: 0, deaths: 0, hs: 0, wins: 0, matches: 0 }); }

export function recordKill(acc, weapon, hs, ranked = true) {
  acc.stats.kills = (acc.stats.kills || 0) + 1;
  if (hs) acc.stats.hs = (acc.stats.hs || 0) + 1;
  if (ranked) { rs(acc).kills++; if (hs) rs(acc).hs++; }
  let stKills = null;
  const uid = acc.equipped[weapon];
  const it = uid && acc.inventory.find((i) => i.uid === uid);
  if (it && it.st) { it.kills = (it.kills || 0) + 1; stKills = it.kills; }
  store.save(acc);
  return stKills;
}

export function recordDeath(acc, ranked = true) {
  acc.stats.deaths = (acc.stats.deaths || 0) + 1;
  if (ranked) rs(acc).deaths++;
  store.save(acc);
}

export function recordMatch(acc, won, ranked = true) {
  acc.stats.matches = (acc.stats.matches || 0) + 1;
  if (won) acc.stats.wins = (acc.stats.wins || 0) + 1;
  if (ranked) { rs(acc).matches++; if (won) rs(acc).wins++; }
  store.save(acc);
}

// ── Classement ───────────────────────────────────────────────────────────
export const BOARD_CATS = {
  kills: { label: 'Kills', value: (r) => r.kills, min: (r) => r.kills > 0 },
  wins: { label: 'Victoires', value: (r) => r.wins, min: (r) => r.wins > 0 },
  kd: { label: 'K/D', value: (r) => Math.round(r.kills / Math.max(1, r.deaths) * 100) / 100, min: (r) => r.kills >= 20 },
  hs: { label: 'Headshots %', value: (r) => Math.round(r.hs / Math.max(1, r.kills) * 1000) / 10, min: (r) => r.kills >= 20 },
};
const boardCache = { t: 0, list: null };

export async function leaderboard(cat, me) {
  const C = BOARD_CATS[cat] ? BOARD_CATS[cat] : BOARD_CATS.kills;
  if (!boardCache.list || Date.now() - boardCache.t > 15000) {
    const accs = await store.allRegistered();
    boardCache.list = accs.map((a) => ({ id: a.id, name: a.name, r: { kills: 0, deaths: 0, hs: 0, wins: 0, matches: 0, ...(a.rstats || {}) } }));
    boardCache.t = Date.now();
  }
  // le joueur qui demande voit toujours ses chiffres à jour
  const list = boardCache.list.map((e) => (me && e.id === me.id ? { ...e, r: { ...e.r, ...rs(me) } } : e));
  const rows = list.filter((e) => C.min(e.r)).map((e) => ({ id: e.id, name: e.name, value: C.value(e.r), ...e.r }));
  rows.sort((a, b) => b.value - a.value || b.kills - a.kills || a.name.localeCompare(b.name));
  const myIdx = me ? rows.findIndex((r) => r.id === me.id) : -1;
  const strip = ({ id, ...r }) => r; // l'identifiant interne n'est jamais envoyé
  return {
    cat: BOARD_CATS[cat] ? cat : 'kills',
    top: rows.slice(0, 50).map((r, i) => ({ rank: i + 1, ...strip(r), me: !!me && r.id === me.id })),
    me: myIdx >= 0 ? { rank: myIdx + 1, ...strip(rows[myIdx]) } : null,
    total: rows.length,
  };
}

// Objet offert en fin de match (40 % de chances, Militaire ou Restreint)
export function drop(acc) {
  if (Math.random() > 0.4 || acc.inventory.length >= MAX_INVENTORY) return null;
  const c = CASES[Math.floor(Math.random() * CASES.length)];
  const rar = Math.random() < 0.85 ? 'milspec' : 'restricted';
  const pool = c.items.filter((id) => SKINS[id].rarity === rar);
  if (!pool.length) return null;
  const it = makeItem(pool[Math.floor(Math.random() * pool.length)]);
  acc.inventory.push(it);
  store.save(acc);
  return it;
}

// Skins équipés tels que vus par les autres joueurs
export function equippedSkins(acc) {
  const out = {};
  for (const [w, uid] of Object.entries(acc.equipped)) {
    if (!has(WEAPONS, w)) continue;
    const it = acc.inventory.find((i) => i.uid === uid);
    if (it) out[w] = { skin: it.skin, float: it.float, seed: it.seed, st: it.st, kills: it.kills };
  }
  return out;
}

export { RARITIES };
