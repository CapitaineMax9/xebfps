// Profil du joueur stocké dans le navigateur (localStorage).
import { CREDITS } from '/shared/constants.js';
import { SKINS, makeItem } from '/shared/skins.js';

const KEY = 'xebfps_profile_v1';

const DEFAULT_SETTINGS = {
  sens: 2.0, scopeSens: 1.0, fov: 90, volume: 0.6,
  crossColor: '#4cff6a', crossSize: 7, crossGap: 4, crossThick: 2, crossDot: false, crossDynamic: true,
  shadows: true, showFps: false, quality: 1, viewmodelFov: 68, bob: true,
};

function defaults() {
  // quelques skins offerts pour commencer
  const starter = [makeItem('glock_sable'), makeItem('p90_urbain'), makeItem('ssg_ondes')];
  return {
    name: 'Joueur' + Math.floor(Math.random() * 9000 + 1000),
    credits: CREDITS.start,
    inventory: starter,
    equipped: {},
    loadout: { primary: 'awp', secondary: 'usp' },
    settings: { ...DEFAULT_SETTINGS },
    stats: { kills: 0, deaths: 0, hs: 0, cases: 0, matches: 0 },
  };
}

let data = null;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      data = JSON.parse(raw);
      data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      data.inventory = (data.inventory || []).filter((i) => i && SKINS[i.skin]);
      data.equipped = data.equipped || {};
      data.stats = { ...defaults().stats, ...(data.stats || {}) };
      data.loadout = data.loadout || { primary: 'awp', secondary: 'usp' };
      for (const [w, uid] of Object.entries(data.equipped)) if (!data.inventory.find((i) => i.uid === uid)) delete data.equipped[w];
    }
  } catch { data = null; }
  if (!data) data = defaults();
  save();
  return data;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* stockage indisponible */ }
}

export const profile = () => data;

export function addCredits(n) { data.credits = Math.max(0, Math.round(data.credits + n)); save(); }

export function addItem(item) { data.inventory.push(item); save(); }

export function removeItem(uid) {
  data.inventory = data.inventory.filter((i) => i.uid !== uid);
  for (const [w, u] of Object.entries(data.equipped)) if (u === uid) delete data.equipped[w];
  save();
}

export function equip(item) {
  const s = SKINS[item.skin];
  data.equipped[s.weapon] = item.uid;
  save();
}

export function unequip(weapon) { delete data.equipped[weapon]; save(); }

export function equippedItem(weapon) {
  const uid = data.equipped[weapon];
  return uid ? data.inventory.find((i) => i.uid === uid) || null : null;
}

// Skins équipés envoyés au serveur (pour que les autres les voient)
export function equippedSkins() {
  const out = {};
  for (const w of Object.keys(data.equipped)) {
    const it = equippedItem(w);
    if (it) out[w] = { skin: it.skin, float: it.float, seed: it.seed, st: it.st, kills: it.kills };
  }
  return out;
}

export function isEquipped(uid) { return Object.values(data.equipped).includes(uid); }
