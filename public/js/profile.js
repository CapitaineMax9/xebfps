// Profil du joueur : miroir du compte stocké sur le serveur.
// Seuls le jeton de session et les paramètres sont gardés dans le navigateur.
import { send } from './net.js';

const TOKEN_KEY = 'xebfps_token';
const SETTINGS_KEY = 'xebfps_settings';
const LEGACY_KEY = 'xebfps_profile_v1';

export const DEFAULT_SETTINGS = {
  sens: 2.0, scopeSens: 1.0, fov: 90, volume: 0.6,
  crossColor: '#4cff6a', crossSize: 7, crossGap: 4, crossThick: 2, crossDot: false, crossDynamic: true,
  shadows: true, showFps: false, quality: 1, viewmodelFov: 68, bob: true, gfx: 'auto', gfxV: 2,
  killcam: true, mlg: false,
};

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* indisponible */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* indisponible */ } },
};

// v2 : la qualité passe en « Auto » pour tout le monde (l'ancien « Élevé » était trop lourd)
function migrate(raw) {
  const st = { ...DEFAULT_SETTINGS, ...raw };
  if (raw.gfxV !== 2) { st.gfx = 'auto'; st.gfxV = 2; }
  return st;
}

let data = {
  name: 'Joueur', registered: false, credits: 0, inventory: [], equipped: {},
  loadout: { primary: 'awp', secondary: 'usp' }, settings: { ...DEFAULT_SETTINGS }, stats: {},
};
let loaded = false;
const listeners = new Set();

export function load() {
  let st = {};
  try { st = JSON.parse(ls.get(SETTINGS_KEY) || '{}') || {}; } catch { st = {}; }
  // anciens paramètres de la v1
  const legacy = legacyProfile();
  if (legacy && legacy.settings && !ls.get(SETTINGS_KEY)) st = legacy.settings;
  if (legacy && legacy.name) data.name = legacy.name;
  data.settings = migrate(st);
  return data;
}

export const profile = () => data;
export const isLoaded = () => loaded;
export function onChange(fn) { listeners.add(fn); }
function emit() { for (const fn of listeners) fn(data); }

export function getToken() { return ls.get(TOKEN_KEY); }
export function setToken(t) { if (t) ls.set(TOKEN_KEY, t); }

// Ancienne progression stockée dans le navigateur (importée une seule fois dans le compte)
export function legacyProfile() {
  try { return JSON.parse(ls.get(LEGACY_KEY) || 'null'); } catch { return null; }
}
export function legacyDone() {
  const l = legacyProfile();
  if (l) { ls.set(LEGACY_KEY + '_importe', JSON.stringify(l)); ls.del(LEGACY_KEY); }
}

// Mise à jour depuis le serveur
export function setProfile(p, { fromLogin = false } = {}) {
  if (!p) return;
  const localSettings = data.settings;
  const serverSettings = p.settings && Object.keys(p.settings).length ? p.settings : null;
  data = { ...data, ...p };
  if (serverSettings && (fromLogin || !loaded)) data.settings = migrate(serverSettings);
  else data.settings = localSettings;
  if (!serverSettings || serverSettings.gfxV !== data.settings.gfxV || serverSettings.gfx !== data.settings.gfx) send({ t: 'settings', settings: data.settings });
  ls.set(SETTINGS_KEY, JSON.stringify(data.settings));
  loaded = true;
  emit();
}

let settingsTimer = 0;
export function save() {
  ls.set(SETTINGS_KEY, JSON.stringify(data.settings));
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => send({ t: 'settings', settings: data.settings }), 800);
}

// Applique les objets ajoutés / retirés envoyés par le serveur
export function applyInvDelta(add, del) {
  if (!add && !del) return;
  if (del && del.length) { const set = new Set(del); data.inventory = data.inventory.filter((i) => !set.has(i.uid)); }
  if (add && add.length) data.inventory.push(...add);
  emit();
}

export function setCredits(total) { if (Number.isFinite(total)) { data.credits = total; emit(); } }
export function addLocalItem(item) { data.inventory.push(item); emit(); }

export function equippedItem(weapon) {
  const uid = data.equipped[weapon];
  return uid ? data.inventory.find((i) => i.uid === uid) || null : null;
}

export function isEquipped(uid) { return Object.values(data.equipped).includes(uid); }
