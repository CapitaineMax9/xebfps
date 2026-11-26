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

  // ── Fusils d'assaut ────────────────────────────────────────────────────
  famas: {
    id: 'famas', name: 'FAMAS', slot: 1, kind: 'rifle', auto: false, burst: 3, burstDelay: 0.065,
    damage: 30, rangeMod: 0.96, range: 140, fireDelay: 0.38, mag: 25, reserve: 90, reload: 3.3, draw: 0.7,
    speed: 5.84, spread: { base: 0.0045, move: 0.1, air: 0.24, crouch: 0.75, shot: 0.004, recover: 5 },
    recoil: { v: 0.011, h: 0.007, first: 0 }, sound: 'famas',
  },
  galil: {
    id: 'galil', name: 'Galil AR', slot: 1, kind: 'rifle', auto: true,
    damage: 30, rangeMod: 0.97, range: 140, fireDelay: 0.09, mag: 35, reserve: 90, reload: 3.0, draw: 0.7,
    speed: 5.84, spread: { base: 0.005, move: 0.11, air: 0.25, crouch: 0.75, shot: 0.006, recover: 5 },
    recoil: { v: 0.012, h: 0.01, first: 0 }, sound: 'ak',
  },
  aug: {
    id: 'aug', name: 'AUG', slot: 1, kind: 'rifle', auto: true,
    damage: 28, rangeMod: 0.98, range: 150, fireDelay: 0.09, mag: 30, reserve: 90, reload: 3.8, draw: 0.8,
    speed: 5.5, scopedSpeed: 4.5, scope: [56],
    spread: { base: 0.0045, scoped: 0.0016, move: 0.1, air: 0.24, crouch: 0.75, shot: 0.005, recover: 5 },
    recoil: { v: 0.0105, h: 0.007, first: 0 }, sound: 'silencedRifle',
  },
  // ── Mitraillettes ──────────────────────────────────────────────────────
  mac10: {
    id: 'mac10', name: 'MAC-10', slot: 1, kind: 'smg', auto: true,
    damage: 29, rangeMod: 0.8, range: 60, fireDelay: 0.075, mag: 30, reserve: 100, reload: 2.6, draw: 0.5,
    speed: 6.1, spread: { base: 0.012, move: 0.02, air: 0.08, crouch: 0.85, shot: 0.004, recover: 6 },
    recoil: { v: 0.009, h: 0.008, first: 0.004 }, sound: 'smg',
  },
  ump45: {
    id: 'ump45', name: 'UMP-45', slot: 1, kind: 'smg', auto: true,
    damage: 35, rangeMod: 0.75, range: 60, fireDelay: 0.09, mag: 25, reserve: 100, reload: 3.5, draw: 0.6,
    speed: 5.84, spread: { base: 0.01, move: 0.025, air: 0.09, crouch: 0.85, shot: 0.005, recover: 6 },
    recoil: { v: 0.011, h: 0.007, first: 0.004 }, sound: 'smg',
  },
  mp7: {
    id: 'mp7', name: 'MP7', slot: 1, kind: 'smg', auto: true,
    damage: 29, rangeMod: 0.85, range: 70, fireDelay: 0.08, mag: 30, reserve: 120, reload: 3.1, draw: 0.6,
    speed: 5.84, spread: { base: 0.008, move: 0.02, air: 0.09, crouch: 0.85, shot: 0.004, recover: 6 },
    recoil: { v: 0.009, h: 0.006, first: 0.003 }, sound: 'smg',
  },
  // ── Lourdes + sniper automatique ───────────────────────────────────────
  m249: {
    id: 'm249', name: 'M249', slot: 1, kind: 'lmg', auto: true,
    damage: 32, rangeMod: 0.97, range: 140, fireDelay: 0.08, mag: 100, reserve: 200, reload: 5.7, draw: 1.0,
    speed: 4.95, spread: { base: 0.008, move: 0.15, air: 0.3, crouch: 0.7, shot: 0.007, recover: 4 },
    recoil: { v: 0.009, h: 0.012, first: 0.003 }, sound: 'lmg',
  },
  xm1014: {
    id: 'xm1014', name: 'XM1014', slot: 1, kind: 'shotgun', auto: true, pellets: 6, pelletSpread: 0.06,
    damage: 20, rangeMod: 0.6, range: 30, fireDelay: 0.35, mag: 7, reserve: 32, reload: 0.45, shellReload: true, draw: 0.7,
    speed: 5.5, spread: { base: 0.003, move: 0.02, air: 0.06, crouch: 0.9, shot: 0.004, recover: 6 },
    recoil: { v: 0.04, h: 0.012, first: 0.04 }, sound: 'shotgun',
  },
  scar20: {
    id: 'scar20', name: 'SCAR-20', slot: 1, kind: 'sniper', auto: false, semiAuto: true,
    damage: 80, rangeMod: 0.98, range: 220, fireDelay: 0.25, mag: 20, reserve: 90, reload: 3.1, draw: 1.0,
    speed: 5.08, scopedSpeed: 3.2, scope: [40, 15],
    spread: { base: 0.05, scoped: 0.0025, move: 0.12, air: 0.25, crouch: 0.85, shot: 0.012, recover: 4 },
    recoil: { v: 0.025, h: 0.006, first: 0.025 }, sound: 'sniper',
  },
  // ── Pistolets ──────────────────────────────────────────────────────────
  fiveseven: {
    id: 'fiveseven', name: 'Five-SeveN', slot: 2, kind: 'pistol', auto: false,
    damage: 32, rangeMod: 0.91, range: 90, fireDelay: 0.15, mag: 20, reserve: 100, reload: 2.2, draw: 0.5,
    speed: 6.1, spread: { base: 0.005, move: 0.03, air: 0.11, crouch: 0.8, shot: 0.012, recover: 5 },
    recoil: { v: 0.013, h: 0.004, first: 0 }, sound: 'pistol',
  },
  tec9: {
    id: 'tec9', name: 'Tec-9', slot: 2, kind: 'pistol', auto: false,
    damage: 33, rangeMod: 0.83, range: 70, fireDelay: 0.12, mag: 18, reserve: 90, reload: 2.5, draw: 0.5,
    speed: 6.1, spread: { base: 0.008, move: 0.025, air: 0.11, crouch: 0.8, shot: 0.014, recover: 5 },
    recoil: { v: 0.014, h: 0.006, first: 0 }, sound: 'pistol',
  },
  r8: {
    id: 'r8', name: 'R8 Revolver', slot: 2, kind: 'pistol', auto: false,
    damage: 86, rangeMod: 0.9, range: 100, fireDelay: 0.5, mag: 8, reserve: 8, reload: 2.3, draw: 0.6,
    speed: 5.84, spread: { base: 0.008, move: 0.08, air: 0.2, crouch: 0.8, shot: 0.06, recover: 3 },
    recoil: { v: 0.06, h: 0.012, first: 0 }, sound: 'deagle',
  },
  dualies: {
    id: 'dualies', name: 'Dual Berettas', slot: 2, kind: 'pistol', auto: false, dual: true,
    damage: 38, rangeMod: 0.79, range: 70, fireDelay: 0.12, mag: 30, reserve: 120, reload: 3.8, draw: 0.6,
    speed: 6.1, spread: { base: 0.009, move: 0.035, air: 0.12, crouch: 0.8, shot: 0.012, recover: 5 },
    recoil: { v: 0.012, h: 0.006, first: 0 }, sound: 'pistol',
  },
  // ── Armes loufoques ────────────────────────────────────────────────────
  zeus: {
    id: 'zeus', name: 'Taser Zeus', slot: 2, kind: 'pistol', auto: false, taser: true,
    damage: 500, rangeMod: 1, range: 3.6, fireDelay: 0.4, mag: 1, reserve: 0, reload: 1, draw: 0.5,
    speed: 6.1, spread: { base: 0.001, move: 0.004, air: 0.02, crouch: 1, shot: 0, recover: 6 },
    recoil: { v: 0.02, h: 0.004, first: 0 }, sound: 'zap',
  },
  railgun: {
    id: 'railgun', name: 'Railgun', slot: 1, kind: 'sniper', auto: false, pierce: true,
    damage: 160, rangeMod: 1, range: 250, fireDelay: 1.8, mag: 4, reserve: 16, reload: 3.0, draw: 1.0,
    speed: 5.2, scopedSpeed: 3.0, scope: [45, 20],
    spread: { base: 0.02, scoped: 0.0008, move: 0.08, air: 0.2, crouch: 0.85, shot: 0, recover: 6 },
    recoil: { v: 0.05, h: 0.004, first: 0.05 }, sound: 'rail',
  },
  rpg: {
    id: 'rpg', name: 'Lance-roquettes', slot: 1, kind: 'launcher', auto: false,
    projectile: { speed: 32, gravity: 1.5, splash: 4.5, self: 0.5, model: 'rocket' },
    damage: 130, rangeMod: 1, range: 200, fireDelay: 1.0, mag: 1, reserve: 8, reload: 2.6, draw: 1.0,
    speed: 4.8, spread: { base: 0.004, move: 0.04, air: 0.08, crouch: 0.9, shot: 0, recover: 6 },
    recoil: { v: 0.06, h: 0.01, first: 0.06 }, sound: 'rpg',
  },
  crossbow: {
    id: 'crossbow', name: 'Arbalète', slot: 1, kind: 'launcher', auto: false,
    projectile: { speed: 75, gravity: 6, splash: 0, model: 'bolt' },
    damage: 105, rangeMod: 1, range: 200, fireDelay: 1.2, mag: 1, reserve: 25, reload: 1.1, draw: 0.8,
    speed: 5.6, spread: { base: 0.002, move: 0.03, air: 0.08, crouch: 0.8, shot: 0, recover: 6 },
    recoil: { v: 0.02, h: 0.004, first: 0.02 }, sound: 'bow',
  },
  confetti: {
    id: 'confetti', name: 'Lance-confettis', slot: 1, kind: 'shotgun', auto: false, pellets: 16, pelletSpread: 0.09, confetti: true,
    damage: 9, rangeMod: 0.5, range: 18, fireDelay: 0.6, mag: 6, reserve: 30, reload: 0.4, shellReload: true, draw: 0.6,
    speed: 6.1, spread: { base: 0.004, move: 0.02, air: 0.05, crouch: 0.9, shot: 0, recover: 6 },
    recoil: { v: 0.03, h: 0.01, first: 0.03 }, sound: 'party',
  },
  pan: {
    id: 'pan', name: 'Poêle', slot: 3, kind: 'knife', speed: 6.2,
    damage: 55, heavyDamage: 95, backstab: 120, heavyBackstab: 200,
    range: 1.85, heavyRange: 1.75, fireDelay: 0.6, heavyDelay: 1.2, draw: 0.4, sound: 'bonk',
  },

  // ── Fusils supplémentaires ─────────────────────────────────────────────
  m4a4: {
    id: 'm4a4', name: 'M4A4', slot: 1, kind: 'rifle', auto: true,
    damage: 33, rangeMod: 0.97, range: 150, fireDelay: 0.09, mag: 30, reserve: 90, reload: 3.1, draw: 0.7,
    speed: 5.72, spread: { base: 0.0032, move: 0.1, air: 0.24, crouch: 0.75, shot: 0.005, recover: 5 },
    recoil: { v: 0.012, h: 0.009, first: 0 }, sound: 'ak',
  },
  sg553: {
    id: 'sg553', name: 'SG 553', slot: 1, kind: 'rifle', auto: true,
    damage: 33, rangeMod: 0.99, range: 160, fireDelay: 0.09, mag: 30, reserve: 90, reload: 3.0, draw: 0.8,
    speed: 5.46, scopedSpeed: 4.0, scope: [40],
    spread: { base: 0.004, scoped: 0.0013, move: 0.11, air: 0.25, crouch: 0.75, shot: 0.006, recover: 5 },
    recoil: { v: 0.013, h: 0.009, first: 0 }, sound: 'ak',
  },
  // ── Mitraillettes supplémentaires ──────────────────────────────────────
  bizon: {
    id: 'bizon', name: 'PP-Bizon', slot: 1, kind: 'smg', auto: true,
    damage: 27, rangeMod: 0.78, range: 60, fireDelay: 0.08, mag: 64, reserve: 120, reload: 2.4, draw: 0.6,
    speed: 5.84, spread: { base: 0.011, move: 0.02, air: 0.09, crouch: 0.85, shot: 0.004, recover: 6 },
    recoil: { v: 0.008, h: 0.006, first: 0.003 }, sound: 'smg',
  },
  mp5sd: {
    id: 'mp5sd', name: 'MP5-SD', slot: 1, kind: 'smg', auto: true, silenced: true,
    damage: 27, rangeMod: 0.86, range: 70, fireDelay: 0.08, mag: 30, reserve: 120, reload: 3.0, draw: 0.6,
    speed: 5.84, spread: { base: 0.008, move: 0.02, air: 0.09, crouch: 0.85, shot: 0.004, recover: 6 },
    recoil: { v: 0.009, h: 0.006, first: 0.003 }, sound: 'silenced',
  },
  // ── Fusils à pompe supplémentaires ─────────────────────────────────────
  mag7: {
    id: 'mag7', name: 'MAG-7', slot: 1, kind: 'shotgun', auto: false, pellets: 8, pelletSpread: 0.065,
    damage: 24, rangeMod: 0.5, range: 25, fireDelay: 0.8, mag: 5, reserve: 32, reload: 0.5, shellReload: true, draw: 0.6,
    speed: 5.5, spread: { base: 0.002, move: 0.02, air: 0.06, crouch: 0.9, shot: 0, recover: 6 },
    recoil: { v: 0.05, h: 0.01, first: 0.05 }, sound: 'shotgun',
  },
  sawedoff: {
    id: 'sawedoff', name: 'Sawed-Off', slot: 1, kind: 'shotgun', auto: false, pellets: 9, pelletSpread: 0.085,
    damage: 28, rangeMod: 0.4, range: 20, fireDelay: 0.7, mag: 7, reserve: 32, reload: 0.5, shellReload: true, draw: 0.6,
    speed: 5.46, spread: { base: 0.003, move: 0.02, air: 0.06, crouch: 0.9, shot: 0, recover: 6 },
    recoil: { v: 0.055, h: 0.012, first: 0.055 }, sound: 'shotgun',
  },
  // ── Lourde + sniper auto ───────────────────────────────────────────────
  negev: {
    id: 'negev', name: 'Negev', slot: 1, kind: 'lmg', auto: true,
    damage: 30, rangeMod: 0.95, range: 130, fireDelay: 0.07, mag: 150, reserve: 300, reload: 6.0, draw: 1.1,
    speed: 4.8, spread: { base: 0.012, move: 0.18, air: 0.32, crouch: 0.65, shot: 0.008, recover: 3 },
    recoil: { v: 0.01, h: 0.014, first: 0.004 }, sound: 'lmg',
  },
  g3sg1: {
    id: 'g3sg1', name: 'G3SG1', slot: 1, kind: 'sniper', auto: false, semiAuto: true,
    damage: 80, rangeMod: 0.98, range: 220, fireDelay: 0.25, mag: 20, reserve: 90, reload: 3.3, draw: 1.0,
    speed: 5.08, scopedSpeed: 3.2, scope: [40, 15],
    spread: { base: 0.05, scoped: 0.0025, move: 0.12, air: 0.25, crouch: 0.85, shot: 0.012, recover: 4 },
    recoil: { v: 0.025, h: 0.006, first: 0.025 }, sound: 'sniper',
  },
  // ── Pistolets supplémentaires ──────────────────────────────────────────
  p250: {
    id: 'p250', name: 'P250', slot: 2, kind: 'pistol', auto: false,
    damage: 35, rangeMod: 0.8, range: 70, fireDelay: 0.15, mag: 13, reserve: 26, reload: 2.2, draw: 0.5,
    speed: 6.1, spread: { base: 0.006, move: 0.03, air: 0.11, crouch: 0.8, shot: 0.013, recover: 5 },
    recoil: { v: 0.013, h: 0.005, first: 0 }, sound: 'pistol',
  },
  cz75: {
    id: 'cz75', name: 'CZ75-Auto', slot: 2, kind: 'pistol', auto: true,
    damage: 31, rangeMod: 0.78, range: 60, fireDelay: 0.07, mag: 12, reserve: 12, reload: 2.7, draw: 0.5,
    speed: 6.1, spread: { base: 0.01, move: 0.035, air: 0.12, crouch: 0.8, shot: 0.014, recover: 5 },
    recoil: { v: 0.014, h: 0.008, first: 0 }, sound: 'pistol',
  },
  p2000: {
    id: 'p2000', name: 'P2000', slot: 2, kind: 'pistol', auto: false,
    damage: 35, rangeMod: 0.86, range: 90, fireDelay: 0.17, mag: 13, reserve: 52, reload: 2.2, draw: 0.5,
    speed: 6.1, spread: { base: 0.004, move: 0.03, air: 0.11, crouch: 0.8, shot: 0.012, recover: 5 },
    recoil: { v: 0.013, h: 0.004, first: 0 }, sound: 'pistol',
  },
  // ── Armes loufoques supplémentaires ────────────────────────────────────
  minigun: {
    id: 'minigun', name: 'Minigun', slot: 1, kind: 'lmg', auto: true, spinup: 0.5,
    damage: 26, rangeMod: 0.9, range: 120, fireDelay: 0.045, mag: 200, reserve: 200, reload: 7.0, draw: 1.4,
    speed: 4.3, spread: { base: 0.02, move: 0.2, air: 0.35, crouch: 0.7, shot: 0.006, recover: 3 },
    recoil: { v: 0.006, h: 0.014, first: 0.002 }, sound: 'minigun',
  },
  gl: {
    id: 'gl', name: 'Lance-grenades', slot: 1, kind: 'launcher', auto: false,
    projectile: { speed: 36, gravity: 9, splash: 4.0, self: 0.4, model: 'grenade', bounce: 0.45, fuse: 1500 },
    damage: 110, rangeMod: 1, range: 200, fireDelay: 0.9, mag: 1, reserve: 16, reload: 2.0, draw: 0.8,
    speed: 5.5, spread: { base: 0.004, move: 0.04, air: 0.08, crouch: 0.9, shot: 0, recover: 6 },
    recoil: { v: 0.045, h: 0.01, first: 0.045 }, sound: 'rpg',
  },
  saber: {
    id: 'saber', name: 'Sabre laser', slot: 3, kind: 'knife', speed: 6.4, glow: true,
    damage: 70, heavyDamage: 120, backstab: 160, heavyBackstab: 250,
    range: 2.6, heavyRange: 2.4, fireDelay: 0.38, heavyDelay: 0.85, draw: 0.4, sound: 'saber',
  },

  // ── Grenades à lancer (slot 4, touche G) ───────────────────────────────
  he: {
    id: 'he', name: 'Grenade HE', kind: 'grenade', grenade: 'he', slot: 4, draw: 0.6, fireDelay: 0.9, speed: 6.2,
    projectile: { speed: 22, gravity: 13, bounce: 0.42, fuse: 1600, splash: 5.5, self: 0.5, model: 'frag' },
    damage: 110, sound: 'rpg',
  },
  flash: {
    id: 'flash', name: 'Grenade aveuglante', kind: 'grenade', grenade: 'flash', slot: 4, draw: 0.55, fireDelay: 0.8, speed: 6.2,
    projectile: { speed: 24, gravity: 13, bounce: 0.5, fuse: 1300, model: 'flash' }, sound: 'throw',
  },
  smoke: {
    id: 'smoke', name: 'Fumigène', kind: 'grenade', grenade: 'smoke', slot: 4, draw: 0.55, fireDelay: 0.8, speed: 6.2,
    projectile: { speed: 22, gravity: 13, bounce: 0.3, fuse: 1500, model: 'smoke' }, sound: 'throw',
  },
  molotov: {
    id: 'molotov', name: 'Cocktail Molotov', kind: 'grenade', grenade: 'molotov', slot: 4, draw: 0.6, fireDelay: 0.9, speed: 6.2,
    projectile: { speed: 22, gravity: 13, bounce: 0, fuse: 4000, model: 'molo' }, damage: 8, sound: 'throw',
  },

  // ── Magie (catégorie d'arme principale, coûte du mana) ─────────────────
  fireball: {
    id: 'fireball', name: 'Boule de feu', kind: 'magic', element: 'fire', staff: 'fire', slot: 1, draw: 0.6, fireDelay: 0.7, mana: 34, speed: 5.9,
    cast: 'proj', projectile: { speed: 30, gravity: 2.5, splash: 3.6, self: 0.3, model: 'fireball' }, damage: 85, sound: 'cast_fire',
  },
  chainbolt: {
    id: 'chainbolt', name: 'Éclair en chaîne', kind: 'magic', element: 'bolt', staff: 'bolt', slot: 1, draw: 0.6, fireDelay: 0.55, mana: 30, speed: 6.0,
    cast: 'chain', damage: 52, range: 60, chain: { jumps: 3, radius: 7, falloff: 0.72 }, sound: 'cast_bolt',
  },
  frostbeam: {
    id: 'frostbeam', name: 'Rayon de givre', kind: 'magic', element: 'ice', staff: 'ice', slot: 1, draw: 0.6, fireDelay: 0.3, mana: 13, speed: 6.0,
    cast: 'beam', damage: 20, range: 45, slow: { mul: 0.45, dur: 1500 }, sound: 'cast_ice',
  },
  arcaneorb: {
    id: 'arcaneorb', name: 'Orbe arcanique', kind: 'magic', element: 'arcane', staff: 'arcane', slot: 1, draw: 0.6, fireDelay: 0.5, mana: 22, speed: 6.0,
    cast: 'proj', projectile: { speed: 42, gravity: 0, splash: 1.6, self: 0, model: 'orb' }, damage: 55, sound: 'cast_arcane',
  },
  healstaff: {
    id: 'healstaff', name: 'Bâton de soin', kind: 'magic', element: 'heal', staff: 'heal', slot: 1, draw: 0.6, fireDelay: 0.5, mana: 24, speed: 6.1,
    cast: 'heal', heal: 24, radius: 6, sound: 'cast_heal',
  },
  aegis: {
    id: 'aegis', name: 'Égide arcanique', kind: 'magic', element: 'shield', staff: 'shield', slot: 1, draw: 0.6, fireDelay: 1.0, mana: 45, speed: 6.1,
    cast: 'shield', shield: 80, dur: 7000, sound: 'cast_heal',
  },
  blink: {
    id: 'blink', name: 'Bâton de saut', kind: 'magic', element: 'tele', staff: 'tele', slot: 1, draw: 0.5, fireDelay: 0.9, mana: 30, speed: 6.2,
    cast: 'blink', dist: 7, sound: 'cast_arcane',
  },
  totem: {
    id: 'totem', name: 'Totem gardien', kind: 'magic', element: 'summon', staff: 'summon', slot: 1, draw: 0.8, fireDelay: 1.4, mana: 60, speed: 6.0,
    cast: 'turret', turret: { hp: 60, dmg: 14, rof: 0.35, range: 42, life: 14000 }, sound: 'cast_summon',
  },
};

export const PRIMARIES = ['ak47', 'm4a1s', 'm4a4', 'famas', 'galil', 'aug', 'sg553', 'awp', 'ssg08', 'scar20', 'g3sg1', 'mp9', 'mac10', 'mp7', 'mp5sd', 'ump45', 'bizon', 'p90', 'nova', 'xm1014', 'mag7', 'sawedoff', 'm249', 'negev', 'minigun', 'railgun', 'rpg', 'gl', 'crossbow', 'confetti', 'fireball', 'chainbolt', 'frostbeam', 'arcaneorb', 'healstaff', 'aegis', 'blink', 'totem'];
export const MAGIC = ['fireball', 'chainbolt', 'frostbeam', 'arcaneorb', 'healstaff', 'aegis', 'blink', 'totem'];
export const GRENADES = ['he', 'flash', 'smoke', 'molotov'];
export const GRENADE_STOCK = { he: 1, flash: 2, smoke: 2, molotov: 1 };
export const SECONDARIES = ['usp', 'glock', 'p2000', 'deagle', 'fiveseven', 'p250', 'tec9', 'cz75', 'r8', 'dualies', 'zeus'];
export const MELEES = ['knife', 'pan', 'saber'];
export const SKINNABLE = ['knife', 'pan', 'saber', 'glock', 'usp', 'p2000', 'deagle', 'fiveseven', 'p250', 'tec9', 'cz75', 'r8', 'dualies', 'zeus', 'mp9', 'mac10', 'mp7', 'mp5sd', 'ump45', 'bizon', 'p90', 'nova', 'xm1014', 'mag7', 'sawedoff', 'confetti', 'ak47', 'm4a1s', 'm4a4', 'famas', 'galil', 'aug', 'sg553', 'm249', 'negev', 'minigun', 'ssg08', 'scar20', 'g3sg1', 'awp', 'railgun', 'rpg', 'gl', 'crossbow'];

// Délai minimal entre deux tirs (rafales comprises), utilisé pour la vérification côté serveur
export function minFireDelay(w) { return w.burst ? Math.min(w.burstDelay, w.fireDelay) : w.fireDelay; }

// Décalage de recul (en radians) pour le tir n° i d'une rafale : [pitch, yaw]
// Pattern déterministe et apprenable : montée verticale puis oscillation latérale.
export function recoilOffset(w, i) {
  const r = w.recoil;
  if (!r || i <= 0) return [0, 0];
  if (w.kind === 'sniper' || w.kind === 'shotgun' || w.kind === 'pistol' || w.kind === 'launcher') {
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
  if (st.scoped && s.scoped !== undefined) base = s.scoped;
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
