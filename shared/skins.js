// Catalogue de skins, raretés, usures et caisses.
// Les motifs (pattern) sont générés procéduralement côté client (public/js/skinTex.js).

export const RARITIES = {
  milspec:    { id: 'milspec',    name: 'Qualité Militaire', color: '#4b69ff', weight: 79.92, value: 30 },
  restricted: { id: 'restricted', name: 'Restreint',         color: '#8847ff', weight: 15.98, value: 120 },
  classified: { id: 'classified', name: 'Classifié',         color: '#d32ce6', weight: 3.2,   value: 450 },
  covert:     { id: 'covert',     name: 'Secret',            color: '#eb4b4b', weight: 0.64,  value: 1500 },
  gold:       { id: 'gold',       name: '★ Objet rare spécial', color: '#e4ae39', weight: 0.26, value: 5000 },
};
export const RARITY_ORDER = ['milspec', 'restricted', 'classified', 'covert', 'gold'];

export const WEARS = [
  { id: 'FN', name: 'Neuve', short: 'NE', max: 0.07, mult: 1.6 },
  { id: 'MW', name: 'Très peu usée', short: 'TPU', max: 0.15, mult: 1.25 },
  { id: 'FT', name: 'Testée sur le terrain', short: 'TT', max: 0.38, mult: 1.0 },
  { id: 'WW', name: 'Usée', short: 'US', max: 0.45, mult: 0.85 },
  { id: 'BS', name: 'Marquée par les combats', short: 'MC', max: 1.0, mult: 0.7 },
];

export function wearOf(float) {
  for (const w of WEARS) if (float < w.max) return w;
  return WEARS[WEARS.length - 1];
}

export const KNIVES = {
  karambit: { id: 'karambit', name: 'Karambit' },
  bayonet: { id: 'bayonet', name: 'Baïonnette' },
  butterfly: { id: 'butterfly', name: 'Couteau papillon' },
};

// Catalogue. weapon = id d'arme, ou 'knife' avec knife = type de couteau.
// pattern + colors décrivent le motif ; fin = finition { metal, rough }
const S = [];
const add = (id, weapon, name, rarity, pattern, colors, extra = {}) =>
  S.push({ id, weapon, name, rarity, pattern, colors, minF: 0, maxF: 1, ...extra });

// ── Caisse Prélude ───────────────────────────────────────────────────────────
add('glock_sable', 'glock', 'Sable Fin', 'milspec', 'camo', ['#c8b48a', '#a38a5f', '#7d6a48', '#e0d2b0'], { maxF: 0.8 });
add('mp9_acier', 'mp9', 'Bleu Acier', 'milspec', 'solid', ['#2f5d8c', '#1d3b5a'], { fin: { metal: 0.7, rough: 0.35 }, maxF: 0.5 });
add('nova_brindille', 'nova', 'Brindille', 'milspec', 'camo', ['#4a5a35', '#2e3a22', '#6d7a48', '#1f2616']);
add('p90_urbain', 'p90', 'Pixel Urbain', 'milspec', 'digital', ['#8a8f96', '#5b6068', '#c3c7cc', '#3a3e44']);
add('ssg_ondes', 'ssg08', 'Ondes Marines', 'milspec', 'waves', ['#0f3b5c', '#2b7bb0', '#8fd3ff']);
add('usp_cobalt', 'usp', 'Cobalt Fondu', 'restricted', 'fade', ['#1a2a6c', '#2d63d8', '#7fd1ff'], { fin: { metal: 0.85, rough: 0.2 }, maxF: 0.3 });
add('m4_ruche', 'm4a1s', 'Ruche', 'restricted', 'hex', ['#1c1c1c', '#f2b01e', '#3a3a3a']);
add('deagle_carbone', 'deagle', 'Carbone Rouge', 'restricted', 'carbon', ['#151515', '#2a2a2a', '#d42b2b']);
add('ak_tigre', 'ak47', 'Tigre Royal', 'classified', 'stripes', ['#e8871e', '#1a1208', '#f6c25b']);
add('awp_electrique', 'awp', 'Électrique', 'classified', 'lightning', ['#120c24', '#8f4dff', '#e6d6ff']);
add('awp_dragon', 'awp', 'Dragon d\'Or', 'covert', 'scales', ['#7a1010', '#e0a526', '#2a0606', '#ffe08a'], { fin: { metal: 0.5, rough: 0.35 } });
add('ak_inferno', 'ak47', 'Inferno', 'covert', 'flames', ['#1a0a05', '#ff4b12', '#ffd23f']);
add('kara_fondu', 'knife', 'Fondu', 'gold', 'fade', ['#ffd23f', '#ff3fa4', '#7a3cff'], { knife: 'karambit', fin: { metal: 0.95, rough: 0.12 }, maxF: 0.08 });
add('kara_trempe', 'knife', 'Trempé', 'gold', 'casehard', ['#2f56b8', '#c99a2e', '#5b5f66'], { knife: 'karambit', fin: { metal: 0.9, rough: 0.25 } });
add('kara_doppler', 'knife', 'Doppler', 'gold', 'doppler', ['#0a0a12', '#d0207a', '#3a2fd6'], { knife: 'karambit', fin: { metal: 0.95, rough: 0.1 }, maxF: 0.08 });

// ── Caisse Néon ──────────────────────────────────────────────────────────────
add('glock_circuit', 'glock', 'Circuit Vert', 'milspec', 'circuit', ['#06140a', '#22ff88', '#0c3a1e']);
add('p90_vague', 'p90', 'Vague Néon', 'milspec', 'waves', ['#1a0630', '#ff3fd0', '#3ff0ff']);
add('mp9_bonbon', 'mp9', 'Bonbon', 'milspec', 'solid', ['#ff7ac8', '#c43d8e'], { fin: { metal: 0.3, rough: 0.5 } });
add('nova_grille', 'nova', 'Grille Laser', 'milspec', 'circuit', ['#140818', '#ff2e63', '#3d0f2a']);
add('ssg_lime', 'ssg08', 'Citron Vert', 'milspec', 'digital', ['#9be22e', '#5a8f13', '#d6ff7a', '#2f4a0a']);
add('ak_retro', 'ak47', 'Rétro Wave', 'restricted', 'fade', ['#ff3fa4', '#7a3cff', '#22e0ff'], { fin: { metal: 0.6, rough: 0.3 } });
add('usp_cyber', 'usp', 'Cyber', 'restricted', 'circuit', ['#020a14', '#22d3ff', '#0b2a40']);
add('m4_neonhex', 'm4a1s', 'Néon Ruche', 'restricted', 'hex', ['#0b0b14', '#ff2ed1', '#1d1d2e']);
add('deagle_nova', 'deagle', 'Supernova', 'classified', 'galaxy', ['#05030f', '#6a2cff', '#ff4fd8', '#ffffff']);
add('awp_synth', 'awp', 'Synthwave', 'classified', 'synth', ['#1a0638', '#ff3fa4', '#ffcf3f', '#22e0ff']);
add('awp_horizon', 'awp', 'Horizon Orbital', 'covert', 'geo', ['#f2f2f2', '#ff6a13', '#141414', '#2b2b2b']);
add('m4_cyberbete', 'm4a1s', 'Cyber-Bête', 'covert', 'splatter', ['#0e0e1a', '#2ef2c5', '#ff2ed1', '#ffe53f']);
add('papi_rubis', 'knife', 'Doppler Rubis', 'gold', 'doppler', ['#1a0005', '#ff1030', '#7a0010'], { knife: 'butterfly', fin: { metal: 0.95, rough: 0.08 }, maxF: 0.08 });
add('papi_galaxie', 'knife', 'Galaxie', 'gold', 'galaxy', ['#05030f', '#3a6bff', '#ff4fd8', '#ffffff'], { knife: 'butterfly', fin: { metal: 0.7, rough: 0.25 } });
add('papi_fondu', 'knife', 'Fondu', 'gold', 'fade', ['#ffd23f', '#ff3fa4', '#7a3cff'], { knife: 'butterfly', fin: { metal: 0.95, rough: 0.12 }, maxF: 0.08 });

// ── Caisse Prédateur ─────────────────────────────────────────────────────────
add('glock_ecailles', 'glock', 'Écailles', 'milspec', 'scales', ['#2d3b2a', '#5d7a4a', '#16200f', '#8faa6a']);
add('mp9_marbre', 'mp9', 'Marbre Gris', 'milspec', 'marble', ['#d9d9d9', '#6b6b6b', '#2a2a2a']);
add('p90_jungle', 'p90', 'Jungle', 'milspec', 'camo', ['#2f4a1c', '#6b8a2e', '#1a2a0f', '#a3b85a']);
add('nova_rouille', 'nova', 'Rouille', 'milspec', 'camo', ['#7a3b1a', '#a35a2a', '#3d1e0e', '#c48a4a']);
add('usp_os', 'usp', 'Os Blanchi', 'milspec', 'marble', ['#efe6d2', '#b8a888', '#6b5d45']);
add('ssg_jade', 'ssg08', 'Dragon de Jade', 'restricted', 'scales', ['#0b4a3a', '#2ee0a0', '#06231b', '#b6ffe0'], { fin: { metal: 0.5, rough: 0.3 } });
add('deagle_lave', 'deagle', 'Coulée de Lave', 'restricted', 'flames', ['#0d0503', '#c2280e', '#ff9a1f']);
add('ak_vipere', 'ak47', 'Vipère', 'restricted', 'hex', ['#0f2a12', '#53d63a', '#071408']);
add('m4_predateur', 'm4a1s', 'Prédateur', 'classified', 'stripes', ['#d8d8d8', '#141414', '#8a8a8a']);
add('awp_givre', 'awp', 'Givre', 'classified', 'marble', ['#e8f6ff', '#6cc3ff', '#1b4a7a'], { fin: { metal: 0.6, rough: 0.25 } });
add('awp_gorgone', 'awp', 'Gorgone', 'covert', 'gorgon', ['#0b3326', '#2fb37a', '#e0b23a', '#061a12'], { fin: { metal: 0.55, rough: 0.3 } });
add('ak_bete', 'ak47', 'Bête Sauvage', 'covert', 'splatter', ['#141414', '#ff2e2e', '#2ee6ff', '#ffe53f']);
add('bayo_fondu', 'knife', 'Fondu', 'gold', 'fade', ['#ffd23f', '#ff3fa4', '#7a3cff'], { knife: 'bayonet', fin: { metal: 0.95, rough: 0.12 }, maxF: 0.08 });
add('bayo_trempe', 'knife', 'Trempée', 'gold', 'casehard', ['#2f56b8', '#c99a2e', '#5b5f66'], { knife: 'bayonet', fin: { metal: 0.9, rough: 0.25 } });
add('bayo_tigre', 'knife', 'Dent de Tigre', 'gold', 'stripes', ['#f0b429', '#4a2a05', '#ffe08a'], { knife: 'bayonet', fin: { metal: 0.95, rough: 0.12 }, maxF: 0.08 });

export const SKINS = {};
for (const s of S) SKINS[s.id] = s;

export const CASES = [
  {
    id: 'prelude', name: 'Caisse Prélude', price: 250, color: '#c98a2b',
    items: ['glock_sable', 'mp9_acier', 'nova_brindille', 'p90_urbain', 'ssg_ondes', 'usp_cobalt', 'm4_ruche', 'deagle_carbone', 'ak_tigre', 'awp_electrique', 'awp_dragon', 'ak_inferno', 'kara_fondu', 'kara_trempe', 'kara_doppler'],
  },
  {
    id: 'neon', name: 'Caisse Néon', price: 300, color: '#d63fd0',
    items: ['glock_circuit', 'p90_vague', 'mp9_bonbon', 'nova_grille', 'ssg_lime', 'ak_retro', 'usp_cyber', 'm4_neonhex', 'deagle_nova', 'awp_synth', 'awp_horizon', 'm4_cyberbete', 'papi_rubis', 'papi_galaxie', 'papi_fondu'],
  },
  {
    id: 'predateur', name: 'Caisse Prédateur', price: 350, color: '#3fa34d',
    items: ['glock_ecailles', 'mp9_marbre', 'p90_jungle', 'nova_rouille', 'usp_os', 'ssg_jade', 'deagle_lave', 'ak_vipere', 'm4_predateur', 'awp_givre', 'awp_gorgone', 'ak_bete', 'bayo_fondu', 'bayo_trempe', 'bayo_tigre'],
  },
];

// Tirage d'un objet dans une caisse (rnd = générateur 0..1)
export function rollCase(caseDef, rnd = Math.random) {
  const total = RARITY_ORDER.reduce((a, r) => a + RARITIES[r].weight, 0);
  let x = rnd() * total;
  let rarity = 'milspec';
  for (const r of RARITY_ORDER) {
    x -= RARITIES[r].weight;
    if (x <= 0) { rarity = r; break; }
  }
  const pool = caseDef.items.filter((id) => SKINS[id].rarity === rarity);
  const skin = SKINS[pool[Math.floor(rnd() * pool.length)]];
  return makeItem(skin.id, rnd);
}

export function makeItem(skinId, rnd = Math.random) {
  const skin = SKINS[skinId];
  const float = skin.minF + (skin.maxF - skin.minF) * rnd();
  return {
    uid: Date.now().toString(36) + Math.floor(rnd() * 1e9).toString(36),
    skin: skinId,
    float: Math.round(float * 1e6) / 1e6,
    seed: Math.floor(rnd() * 1000),
    st: rnd() < 0.1,
    kills: 0,
  };
}

export function itemValue(item) {
  const s = SKINS[item.skin];
  if (!s) return 0;
  let v = RARITIES[s.rarity].value * wearOf(item.float).mult;
  if (item.st) v *= 1.5;
  return Math.round(v);
}

export function itemFullName(item) {
  const s = SKINS[item.skin];
  if (!s) return '?';
  const base = s.weapon === 'knife' ? '★ ' + KNIVES[s.knife].name : weaponLabel(s.weapon);
  return (item.st ? 'StatKill™ ' : '') + base + ' | ' + s.name;
}

const LABELS = { knife: 'Couteau', glock: 'Glock-18', usp: 'USP-S', deagle: 'Desert Eagle', mp9: 'MP9', p90: 'P90', nova: 'Nova', ak47: 'AK-47', m4a1s: 'M4A1-S', ssg08: 'SSG 08', awp: 'AWP' };
export function weaponLabel(id) { return LABELS[id] || id; }

// Contrat d'échange : 10 objets d'une même rareté (hors ★) -> 1 objet de la rareté suivante
export function tradeUpResult(items, rnd = Math.random) {
  if (items.length !== 10) return null;
  const rar = SKINS[items[0].skin].rarity;
  if (!items.every((i) => SKINS[i.skin].rarity === rar)) return null;
  const idx = RARITY_ORDER.indexOf(rar);
  if (idx < 0 || idx >= RARITY_ORDER.indexOf('covert')) return null;
  const next = RARITY_ORDER[idx + 1];
  // les objets possibles viennent des caisses des objets fournis
  const pool = [];
  for (const it of items) {
    const c = CASES.find((cc) => cc.items.includes(it.skin));
    if (!c) continue;
    for (const id of c.items) if (SKINS[id].rarity === next) pool.push(id);
  }
  if (!pool.length) return null;
  const skinId = pool[Math.floor(rnd() * pool.length)];
  const avgF = items.reduce((a, i) => a + i.float, 0) / items.length;
  const it = makeItem(skinId, rnd);
  const sk = SKINS[skinId];
  it.float = Math.round((sk.minF + (sk.maxF - sk.minF) * avgF) * 1e6) / 1e6;
  it.st = items.every((i) => i.st);
  return it;
}
