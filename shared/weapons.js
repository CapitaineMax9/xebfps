// Définition des armes (valeurs inspirées des FPS tactiques).
// Unités : mètres, secondes, radians. speed = vitesse max du joueur avec l'arme en main.

export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Couteau', slot: 3, kind: 'knife', speed: 6.35,
    damage: 40, heavyDamage: 65, backstab: 90, heavyBackstab: 180,
    range: 1.9, heavyRange: 1.6, fireDelay: 0.42, heavyDelay: 1.0, draw: 0.3,
  },
  glock: {
    id: 'glock', name: 'Glock-18', slot: 2, kind: 'pistol', auto: false,
    damage: 30, rangeMod: 0.85, range: 80, fireDelay: 0.15, mag: 20, reserve: 120, reload: 2.2, draw: 0.5,
    speed: 6.1, spread: { base: 0.006, move: 0.035, air: 0.12, crouch: 0.8, shot: 0.012, recover: 5 },
    recoil: { v: 0.012, h: 0.004, first: 0 }, sound: 'pistol', price: 0,
  },
  usp: {
    id: 'usp', name: 'USP-S', slot: 2, kind: 'pistol', auto: false, silenced: true,
    damage: 35, rangeMod: 0.89, range: 90, fireDelay: 0.17, mag: 12, reserve: 48, reload: 2.2, draw: 0.5,
    speed: 6.1, spread: { base: 0.004, move: 0.03, air: 0.11, crouch: 0.8, shot: 0.014, recover: 5 },
    recoil: { v: 0.014, h: 0.004, first: 0 }, sound: 'silenced', price: 0,
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', slot: 2, kind: 'pistol', auto: false,
    damage: 63, rangeMod: 0.86, range: 100, fireDelay: 0.225, mag: 7, reserve: 35, reload: 2.2, draw: 0.6,
    speed: 5.84, spread: { base: 0.007, move: 0.07, air: 0.2, crouch: 0.8, shot: 0.05, recover: 3 },
    recoil: { v: 0.05, h: 0.01, first: 0 }, sound: 'deagle', price: 0,
  },
  mp9: {
    id: 'mp9', name: 'MP9', slot: 1, kind: 'smg', auto: true,
    damage: 26, rangeMod: 0.87, range: 70, fireDelay: 0.07, mag: 30, reserve: 120, reload: 2.1, draw: 0.6,
    speed: 6.1, spread: { base: 0.009, move: 0.02, air: 0.09, crouch: 0.85, shot: 0.004, recover: 6 },
    recoil: { v: 0.009, h: 0.006, first: 0.004 }, sound: 'smg',
  },
  p90: {
    id: 'p90', name: 'P90', slot: 1, kind: 'smg', auto: true,
    damage: 26, rangeMod: 0.86, range: 70, fireDelay: 0.07, mag: 50, reserve: 100, reload: 3.3, draw: 0.6,
    speed: 5.84, spread: { base: 0.01, move: 0.02, air: 0.09, crouch: 0.85, shot: 0.003, recover: 6 },
    recoil: { v: 0.008, h: 0.006, first: 0.004 }, sound: 'smg',
  },
  nova: {
    id: 'nova', name: 'Nova', slot: 1, kind: 'shotgun', auto: false, pellets: 9, pelletSpread: 0.055,
    damage: 26, rangeMod: 0.55, range: 30, fireDelay: 0.88, mag: 8, reserve: 32, reload: 0.5, shellReload: true, draw: 0.6,
    speed: 5.84, spread: { base: 0.002, move: 0.02, air: 0.06, crouch: 0.9, shot: 0, recover: 6 },
    recoil: { v: 0.06, h: 0.01, first: 0.06 }, sound: 'shotgun',
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 1, kind: 'rifle', auto: true,
    damage: 36, rangeMod: 0.98, range: 150, fireDelay: 0.1, mag: 30, reserve: 90, reload: 2.5, draw: 0.7,
    speed: 5.46, spread: { base: 0.0035, move: 0.11, air: 0.25, crouch: 0.75, shot: 0.006, recover: 5 },
    recoil: { v: 0.0145, h: 0.0115, first: 0 }, sound: 'ak',
  },
  m4a1s: {
    id: 'm4a1s', name: 'M4A1-S', slot: 1, kind: 'rifle', auto: true, silenced: true,
    damage: 38, rangeMod: 0.99, range: 150, fireDelay: 0.1, mag: 20, reserve: 80, reload: 3.1, draw: 0.7,
    speed: 5.72, spread: { base: 0.003, move: 0.09, air: 0.22, crouch: 0.75, shot: 0.005, recover: 5 },
    recoil: { v: 0.0115, h: 0.008, first: 0 }, sound: 'silencedRifle',
  },
  ssg08: {
    id: 'ssg08', name: 'SSG 08', slot: 1, kind: 'sniper', auto: false,
    damage: 88, rangeMod: 0.99, range: 200, fireDelay: 1.25, mag: 10, reserve: 90, reload: 3.7, draw: 0.8,
    speed: 5.84, scopedSpeed: 5.84, scope: [40, 15],
    spread: { base: 0.028, scoped: 0.0018, move: 0.08, air: 0.006, crouch: 0.8, shot: 0, recover: 6 },
    recoil: { v: 0.03, h: 0.005, first: 0.03 }, sound: 'sniper',
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 1, kind: 'sniper', auto: false,
    damage: 115, rangeMod: 0.99, range: 250, fireDelay: 1.46, mag: 5, reserve: 30, reload: 3.6, draw: 1.0,
    speed: 5.08, scopedSpeed: 2.6, scope: [40, 10],
    spread: { base: 0.085, scoped: 0.0012, move: 0.16, air: 0.3, crouch: 0.85, shot: 0, recover: 6 },
    recoil: { v: 0.045, h: 0.006, first: 0.045 }, sound: 'awp',
  },
};

export const PRIMARIES = ['ak47', 'm4a1s', 'awp', 'ssg08', 'mp9', 'p90', 'nova'];
export const SECONDARIES = ['usp', 'glock', 'deagle'];
export const SKINNABLE = ['knife', 'glock', 'usp', 'deagle', 'mp9', 'p90', 'nova', 'ak47', 'm4a1s', 'ssg08', 'awp'];

// Décalage de recul (en radians) pour le tir n° i d'une rafale : [pitch, yaw]
// Pattern déterministe et apprenable : montée verticale puis oscillation latérale.
export function recoilOffset(w, i) {
  const r = w.recoil;
  if (!r || i <= 0) return [0, 0];
  if (w.kind === 'sniper' || w.kind === 'shotgun' || w.kind === 'pistol') {
    return [r.v * Math.min(i, 4), r.h * Math.sin(i * 1.7) * 0.5];
  }
  const rise = Math.min(i, 9);
  const pitch = r.v * rise + r.v * 0.15 * Math.max(0, i - 9);
  let yaw = 0;
  if (i > 3) yaw = r.h * (Math.sin((i - 3) * 0.55) * 3.2 + (i > 15 ? -2 : 0));
  else yaw = r.h * 0.25 * i;
  return [pitch, yaw];
}

/**
 * Imprécision actuelle de l'arme (rayon du cône en radians).
 * st : { speedRatio (0..1), onGround, crouch, scoped, shotAccum }
 */
export function currentSpread(w, st) {
  const s = w.spread;
  if (!s) return 0;
  let base = s.base;
  if (w.kind === 'sniper' && st.scoped) base = s.scoped;
  let v = base + s.move * Math.min(1, st.speedRatio) * (w.kind === 'sniper' && !st.scoped ? 0.5 : 1);
  if (!st.onGround) v += s.air;
  if (st.crouch && st.onGround) v *= s.crouch;
  v += st.shotAccum || 0;
  return v;
}

// Applique une dispersion aléatoire uniforme dans un disque autour d'une direction
export function spreadDir(dx, dy, dz, spread, rnd = Math.random) {
  if (spread <= 0) return [dx, dy, dz];
  // base orthonormée
  let ux, uy, uz;
  if (Math.abs(dy) < 0.99) { ux = -dz; uy = 0; uz = dx; } else { ux = 1; uy = 0; uz = 0; }
  let l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(rnd()) * spread;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  let ox = dx + ux * ca + vx * sa, oy = dy + uy * ca + vy * sa, oz = dz + uz * ca + vz * sa;
  l = Math.hypot(ox, oy, oz);
  return [ox / l, oy / l, oz / l];
}

// Direction de visée à partir de yaw/pitch (convention three.js : -Z à yaw=0)
export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

export function weaponSpeed(id, scoped) {
  const w = WEAPONS[id];
  if (!w) return 6.35;
  if (scoped && w.scopedSpeed) return w.scopedSpeed;
  return w.speed;
}
