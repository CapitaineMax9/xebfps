// Cartes : ensembles d'AABB + points d'apparition.
// Matériaux : floor, wall, wall2, crate, crate2, metal, stone, container_r/b/g/y, sandbag

function build(def) {
  const boxes = [];
  const B = (x0, y0, z0, x1, y1, z1, m) => {
    boxes.push({
      x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
      x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), m,
    });
  };
  // bloc plein de x0..x1, z0..z1 sur une hauteur h
  const block = (x0, z0, x1, z1, h, m = 'wall') => B(x0, 0, z0, x1, h, z1, m);
  // caisse centrée
  const crate = (x, z, s = 1, h = s, m = 'crate', y = 0) => B(x - s / 2, y, z - s / 2, x + s / 2, y + h, z + s / 2, m);
  // escalier : nb marches de largeur w, montant vers la direction dir ('+x','-x','+z','-z')
  const stairs = (x, z, dir, w, n, stepH, stepD, m = 'stone') => {
    for (let i = 0; i < n; i++) {
      const h = stepH * (i + 1);
      const a = i * stepD, b = (i + 1) * stepD;
      if (dir === '+x') B(x + a, 0, z - w / 2, x + b, h, z + w / 2, m);
      if (dir === '-x') B(x - b, 0, z - w / 2, x - a, h, z + w / 2, m);
      if (dir === '+z') B(x - w / 2, 0, z + a, x + w / 2, h, z + b, m);
      if (dir === '-z') B(x - w / 2, 0, z - b, x + w / 2, h, z - a, m);
    }
  };
  // tonneau (collision carrée, rendu cylindrique)
  const barrel = (x, z) => B(x - 0.3, 0, z - 0.3, x + 0.3, 0.95, z + 0.3, 'barrel');
  def.build({ B, block, crate, stairs, barrel });
  const s = def.size;
  // Sol + murs extérieurs
  B(-s[0] / 2 - 2, -1, -s[1] / 2 - 2, s[0] / 2 + 2, 0, s[1] / 2 + 2, 'floor');
  const H = def.wallHeight || 9;
  const wm = def.outerMat || 'wall2';
  B(-s[0] / 2 - 2, 0, -s[1] / 2 - 2, s[0] / 2 + 2, H, -s[1] / 2, wm);
  B(-s[0] / 2 - 2, 0, s[1] / 2, s[0] / 2 + 2, H, s[1] / 2 + 2, wm);
  B(-s[0] / 2 - 2, 0, -s[1] / 2, -s[0] / 2, H, s[1] / 2, wm);
  B(s[0] / 2, 0, -s[1] / 2, s[0] / 2 + 2, H, s[1] / 2, wm);
  return {
    id: def.id, name: def.name, size: s, theme: def.theme, boxes,
    spawns: def.spawns, wallHeight: H,
  };
}

// ---------------------------------------------------------------------------
// OASIS — village du désert, symétrique, plusieurs couloirs longs (idéal AWP)
// ---------------------------------------------------------------------------
const oasis = build({
  id: 'oasis', name: 'Oasis', size: [92, 92], wallHeight: 9,
  theme: { sky: ['#7fb6e6', '#f4dcb0'], fog: '#e8d5b0', fogNear: 60, fogFar: 170, sun: '#fff1d6', floor: 'sand', ambient: 0.75 },
  build: ({ block, crate, stairs, B, barrel }) => {
    barrel(31, 4); barrel(31.8, 4.7); barrel(-31, -4); barrel(-31.8, -4.7);
    barrel(6, -12); barrel(-6, 12); barrel(20, -38); barrel(-20, 38); barrel(41, 18); barrel(-41, -18);
    // Bâtiments du milieu (forment le long couloir central x ∈ [-3.5, 3.5])
    block(-14, -28, -3.5, -4, 7);
    block(3.5, 4, 14, 28, 7);
    block(3.5, -28, 14, -14, 6, 'wall');
    block(-14, 14, -3.5, 28, 6, 'wall');
    // Blocs autour des sites
    block(22, -34, 34, -20, 7);
    block(22, 20, 34, 34, 7);
    block(-34, -34, -22, -20, 7);
    block(-34, 20, -22, 34, 7);
    // Petits murets dans les couloirs intérieurs
    B(14, 0, -24, 18, 1.1, -23.2, 'sandbag');
    B(-18, 0, 23.2, -14, 1.1, 24, 'sandbag');
    // Couloir central : couvertures
    crate(2, -19, 1.2);
    crate(-2.2, 17, 1.2);
    crate(0, 0, 2, 1.1, 'crate2');
    crate(-2.4, -32, 1);
    crate(2.4, 32, 1);
    // Site A (est)
    crate(26, 0, 2.2, 2.2);
    crate(26, 2.2, 1.1, 1.1, 'crate2');
    crate(27.4, -1.6, 1, 1);
    crate(19.5, -7, 1.3, 1.3);
    crate(19.5, 7, 1.3, 1.3);
    B(30, 0, -9, 34, 1.1, -8.2, 'sandbag');
    B(30, 0, 8.2, 34, 1.1, 9, 'sandbag');
    // plateforme A avec escalier
    B(38, 0, -5, 45, 1.6, 5, 'stone');
    stairs(35, 0, '+x', 3, 3, 0.5, 1.0);
    crate(44, 4, 1, 1, 'crate', 1.6);
    // Site B (ouest)
    crate(-26, 0, 2.2, 2.2);
    crate(-26, -2.2, 1.1, 1.1, 'crate2');
    crate(-27.4, 1.6, 1, 1);
    crate(-19.5, -7, 1.3, 1.3);
    crate(-19.5, 7, 1.3, 1.3);
    B(-34, 0, -9, -30, 1.1, -8.2, 'sandbag');
    B(-34, 0, 8.2, -30, 1.1, 9, 'sandbag');
    B(-45, 0, -5, -38, 1.6, 5, 'stone');
    stairs(-35, 0, '-x', 3, 3, 0.5, 1.0);
    crate(-44, -4, 1, 1, 'crate', 1.6);
    // Couloirs extérieurs
    crate(40, -26, 2, 1.2, 'crate2');
    crate(-40, 26, 2, 1.2, 'crate2');
    crate(42, 24, 1.2);
    crate(-42, -24, 1.2);
    // Couloirs intérieurs
    crate(18, -28, 1.2);
    crate(-18, 28, 1.2);
    crate(17, 16, 1);
    crate(-17, -16, 1);
    // Places à côté du milieu
    crate(8.5, -8, 1.4, 1.4, 'crate2');
    crate(-8.5, 8, 1.4, 1.4, 'crate2');
    crate(10, -2, 1);
    crate(-10, 2, 1);
    // Zones d'apparition
    crate(-12, -40, 1.5, 1.2);
    crate(12, -40, 1.5, 1.2);
    crate(-12, 40, 1.5, 1.2);
    crate(12, 40, 1.5, 1.2);
    B(-6, 0, -38.6, 6, 1.0, -38, 'sandbag');
    B(-6, 0, 38, 6, 1.0, 38.6, 'sandbag');
    // Piliers décoratifs (colonnes)
    crate(-30, -40, 1.2, 4, 'stone');
    crate(30, -40, 1.2, 4, 'stone');
    crate(-30, 40, 1.2, 4, 'stone');
    crate(30, 40, 1.2, 4, 'stone');
  },
  spawns: {
    ffa: [
      [-20, -42], [20, -42], [0, -43], [-40, -40], [40, -40],
      [-20, 42], [20, 42], [0, 43], [-40, 40], [40, 40],
      [40, -14], [-40, 14], [18, 0], [-18, 0], [0, -10], [0, 10],
      [9, -2], [-9, 2], [18, 22], [-18, -22], [40, 14], [-40, -14],
    ],
    t0: [[-16, -42], [-8, -43], [0, -43], [8, -43], [16, -42], [-24, -41], [24, -41], [-4, -41], [4, -41]],
    t1: [[-16, 42], [-8, 43], [0, 43], [8, 43], [16, 42], [-24, 41], [24, 41], [-4, 41], [4, 41]],
  },
});

// ---------------------------------------------------------------------------
// DOCKS — zone portuaire avec conteneurs, combats rapprochés (idéal FFA / Gun Game)
// ---------------------------------------------------------------------------
const docks = build({
  id: 'docks', name: 'Docks', size: [64, 52], wallHeight: 8, outerMat: 'metal',
  theme: { sky: ['#4f6d8f', '#c9b9a6'], fog: '#9aa5b0', fogNear: 40, fogFar: 120, sun: '#ffe2c0', floor: 'concrete', ambient: 0.7 },
  build: ({ B, crate, stairs, barrel }) => {
    barrel(-5, -10); barrel(-4.3, -10.7); barrel(5, 10); barrel(4.3, 10.7); barrel(-24, 10); barrel(24, -10);
    barrel(0, -19); barrel(0.7, -19.5); barrel(0, 19); barrel(-0.7, 19.5); barrel(-17.5, 0.5); barrel(17.5, -0.5);
    // conteneur : longueur 6 / largeur 2.5 / hauteur 2.6
    const cont = (x, z, rot, m, y = 0) => {
      const L = 6, W = 2.5, H = 2.6;
      if (rot) B(x - W / 2, y, z - L / 2, x + W / 2, y + H, z + L / 2, m);
      else B(x - L / 2, y, z - W / 2, x + L / 2, y + H, z + W / 2, m);
    };
    // Rangée centrale
    cont(-12, 0, false, 'container_r');
    cont(-6, 0, false, 'container_b');
    cont(-6, 0, false, 'container_y', 2.6);
    cont(8, 0, false, 'container_g');
    cont(14, 0, false, 'container_r');
    // Conteneurs verticaux
    cont(-20, -12, true, 'container_g');
    cont(-20, 12, true, 'container_b');
    cont(20, -12, true, 'container_y');
    cont(20, 12, true, 'container_r');
    cont(20, 12, true, 'container_g', 2.6);
    cont(0, -14, false, 'container_b');
    cont(0, 14, false, 'container_y');
    // Escalier de caisses pour monter sur le conteneur rouge central
    stairs(-12, -5.25, '+z', 2, 4, 0.52, 1.0, 'crate');
    // Plateforme haute (quai)
    B(-32, 0, -26, -24, 1.5, -18, 'stone');
    stairs(-21, -22, '-x', 3, 3, 0.5, 1.0);
    B(24, 0, 18, 32, 1.5, 26, 'stone');
    stairs(21, 22, '+x', 3, 3, 0.5, 1.0);
    // Caisses
    crate(-2, 0, 1.2); crate(2.2, 0.4, 1.2); crate(2.2, 0.4, 1, 1, 'crate2', 1.2);
    crate(-12, -8, 1.2); crate(12, 8, 1.2);
    crate(-12, 8, 1.4, 1.4, 'crate2'); crate(12, -8, 1.4, 1.4, 'crate2');
    crate(-28, 6, 1.2); crate(28, -6, 1.2);
    crate(-27, -8, 2, 1.2, 'crate2'); crate(27, 8, 2, 1.2, 'crate2');
    crate(-8, -21, 1.2); crate(8, 21, 1.2);
    crate(10, -21, 1.6, 1.6); crate(-10, 21, 1.6, 1.6);
    crate(-4, 22.5, 1); crate(4, -22.5, 1);
    // Piliers de grue
    crate(-14, -21, 1.4, 7, 'metal'); crate(14, 21, 1.4, 7, 'metal');
    // Barrières
    B(26, 0, -16, 30, 1.0, -15.4, 'metal');
    B(-30, 0, 15.4, -26, 1.0, 16, 'metal');
  },
  spawns: {
    ffa: [
      [-28, -12], [28, 12], [-28, 0], [28, 0], [-28, 20], [28, -20],
      [-12, -20], [12, 20], [0, -8], [0, 8], [-14, 4], [14, -4],
      [-6, 18], [6, -18], [-28, -22, 1.5], [28, 22, 1.5], [-12, 0, 2.6],
    ],
    t0: [[-29, -8], [-29, -4], [-29, 0], [-29, 4], [-29, 8], [-27, -12], [-27, 12], [-25, 2]],
    t1: [[29, -8], [29, -4], [29, 0], [29, 4], [29, 8], [27, -12], [27, 12], [25, -2]],
  },
});

// ---------------------------------------------------------------------------
// DUEL — carte longue façon « awp_ », deux camps séparés par un muret central
// ---------------------------------------------------------------------------
const duel = build({
  id: 'duel', name: 'Duel', size: [32, 72], wallHeight: 7, outerMat: 'wall2',
  theme: { sky: ['#ef9a6a', '#ffd8a8'], fog: '#e9b48f', fogNear: 50, fogFar: 140, sun: '#ffd0a0', floor: 'sand', ambient: 0.8 },
  build: ({ B, crate, barrel }) => {
    barrel(-13, -16); barrel(13, 16); barrel(6, -24); barrel(-6, 24); barrel(-2.5, -5); barrel(2.5, 5);
    // Muret central avec ouvertures
    B(-16, 0, -0.4, -9, 1.2, 0.4, 'sandbag');
    B(-5, 0, -0.4, 5, 1.2, 0.4, 'sandbag');
    B(9, 0, -0.4, 16, 1.2, 0.4, 'sandbag');
    // Grandes caisses de chaque côté (symétrie centrale)
    for (const s of [-1, 1]) {
      crate(-9 * s, -10 * s, 2.4, 2.4);
      crate(9 * s, -18 * s, 2.4, 2.4);
      crate(0, -14 * s, 1.2);
      crate(-4 * s, -24 * s, 1.4, 1.4, 'crate2');
      crate(5 * s, -6 * s, 1.1);
      crate(12 * s, -28 * s, 1.6, 2.4, 'crate2');
      crate(-12 * s, -30 * s, 1.2);
      B(-6 * s, 0, -31 * s, 6 * s, 1.1, -31.6 * s, 'sandbag');
      crate(-9 * s, -10 * s, 1.2, 1.2, 'crate2', 2.4);
    }
  },
  spawns: {
    ffa: [[-10, -33], [0, -34], [10, -33], [-12, -20], [12, -12], [-12, 20], [12, 12], [-10, 33], [0, 34], [10, 33], [0, -20], [0, 20], [-5, 8], [5, -8]],
    t0: [[-10, -34], [-5, -34], [0, -34], [5, -34], [10, -34], [-12, -33], [12, -33]],
    t1: [[-10, 34], [-5, 34], [0, 34], [5, 34], [10, 34], [-12, 33], [12, 33]],
  },
});

// ---------------------------------------------------------------------------
// ROYAUME — immense carte verte (1200×1200) parsemée de maisons, forts,
// entrepôts et cachettes générés — pensée Battle Royale façon Fortnite.
// ---------------------------------------------------------------------------
// Points d'apparition étalés (anneaux) — réutilisés pour dégager les POI.
const R_FFA = [];
for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; R_FFA.push([Math.round(Math.cos(a) * 540), Math.round(Math.sin(a) * 540)]); }
for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; R_FFA.push([Math.round(Math.cos(a) * 300), Math.round(Math.sin(a) * 300)]); }
const R_T0 = [[-360, -545], [-240, -555], [-120, -545], [0, -558], [120, -545], [240, -555], [360, -545]];
const R_T1 = [[-360, 545], [-240, 555], [-120, 545], [0, 558], [120, 545], [240, 555], [360, 545]];
const R_ALL = [...R_FFA, ...R_T0, ...R_T1];
const royaume = build({
  id: 'royaume', name: 'Royaume', size: [1200, 1200], wallHeight: 16, outerMat: 'wall2',
  theme: { sky: ['#8fc0ea', '#cfe8b0'], fog: '#cfe4c2', fogNear: 120, fogFar: 520, sun: '#fff6e0', floor: 'grass', ambient: 0.85 },
  build: ({ block, crate, stairs, B, barrel }) => {
    // RNG déterministe (identique client/serveur) pour la génération des POI
    let s = 0x1a2b3c4d >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const cc = ['container_r', 'container_b', 'container_g', 'container_y'];
    // maison enterrable : 4 murs + une ouverture (porte) + couverture intérieure
    const house = (cx, cz) => {
      const w = ri(9, 15), d = ri(9, 15), h = ri(5, 8), door = ri(0, 3), t = 0.5;
      // murs avec une ouverture de 3,2 m sur un côté
      const seg = (x0, z0, x1, z1) => block(cx + x0, cz + z0, cx + x1, cz + z1, h, 'wall');
      if (door === 0) { seg(-w / 2, -d / 2, -1.6, -d / 2 + t); seg(1.6, -d / 2, w / 2, -d / 2 + t); } else seg(-w / 2, -d / 2, w / 2, -d / 2 + t);
      if (door === 1) { seg(-w / 2, d / 2 - t, -1.6, d / 2); seg(1.6, d / 2 - t, w / 2, d / 2); } else seg(-w / 2, d / 2 - t, w / 2, d / 2);
      if (door === 2) { seg(-w / 2, -d / 2, -w / 2 + t, -1.6); seg(-w / 2, 1.6, -w / 2 + t, d / 2); } else seg(-w / 2, -d / 2, -w / 2 + t, d / 2);
      if (door === 3) { seg(w / 2 - t, -d / 2, w / 2, -1.6); seg(w / 2 - t, 1.6, w / 2, d / 2); } else seg(w / 2 - t, -d / 2, w / 2, d / 2);
      crate(cx + ri(-2, 2), cz + ri(-2, 2), 1.3, 1.3, rnd() < 0.5 ? 'crate' : 'crate2');
      if (rnd() < 0.5) { B(cx - w / 2, h, cz - d / 2, cx + w / 2, h + 0.4, cz + d / 2, 'wall'); } // toit sur certaines
    };
    const fort = (cx, cz) => {
      for (const [ax, az] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) block(cx + ax - 2.5, cz + az - 2.5, cx + ax + 2.5, cz + az + 2.5, ri(8, 11), 'stone');
      const wall = (x0, z0, x1, z1) => B(cx + x0, 0, cz + z0, cx + x1, 3.4, cz + z1, 'stone');
      wall(-13, -13, -3, -11); wall(3, -13, 13, -11);     // mur nord (entrée)
      wall(-13, 11, 13, 13); wall(-13, -13, -11, 13); wall(11, -13, 13, 13);
      crate(cx, cz, 2.4, 2.4); crate(cx + 5, cz - 4, 1.3); stairs(cx, cz - 9, '+z', 4, 3, 0.6, 1.0, 'stone');
    };
    const warehouse = (cx, cz) => {
      let ci = ri(0, 3);
      for (let i = 0; i < ri(5, 8); i++) { const ox = ri(-11, 11), oz = ri(-9, 9), rot = rnd() < 0.5; const m = cc[ci++ % 4]; if (rot) B(cx + ox - 3, 0, cz + oz - 1.3, cx + ox + 3, 2.6, cz + oz + 1.3, m); else B(cx + ox - 1.3, 0, cz + oz - 3, cx + ox + 1.3, 2.6, cz + oz + 3, m); }
      B(cx - 3, 2.6, cz - 1.3, cx + 3, 5.2, cz + 1.3, cc[ci % 4]);
    };
    const camp = (cx, cz) => {
      for (let i = 0; i < ri(3, 6); i++) crate(cx + ri(-8, 8), cz + ri(-8, 8), 1 + rnd() * 1.4, 1 + rnd() * 1.4, rnd() < 0.5 ? 'crate' : 'crate2');
      B(cx - 9, 0, cz - 3, cx - 8.2, 1.1, cz + 3, 'sandbag'); B(cx + 8.2, 0, cz - 3, cx + 9, 1.1, cz + 3, 'sandbag');
      barrel(cx + 4, cz + 4); barrel(cx + 4.8, cz + 4.7);
    };
    const rocks = (cx, cz) => { for (let i = 0; i < ri(3, 6); i++) crate(cx + ri(-7, 7), cz + ri(-7, 7), 1.6 + rnd() * 2.2, 1.4 + rnd() * 2.4, 'stone'); }; // cachette
    const shed = (cx, cz) => { const w = ri(5, 7); block(cx - w / 2, cz - w / 2, cx + w / 2, cz - w / 2 + 0.5, ri(3, 4), 'wall'); block(cx - w / 2, cz + w / 2 - 0.5, cx + w / 2, cz + w / 2, ri(3, 4), 'wall'); block(cx - w / 2, cz - w / 2, cx - w / 2 + 0.5, cz + w / 2, ri(3, 4), 'wall'); crate(cx + 1, cz, 1.2); };
    const POIS = [house, house, house, fort, warehouse, camp, rocks, rocks, shed];
    const clearOf = (x, z, r) => R_ALL.some((s2) => Math.hypot(x - s2[0], z - s2[1]) < r);
    // grille de POI sur toute la carte
    const N = 8, span = 1080, step = span / (N - 1), start = -span / 2;
    for (let gi = 0; gi < N; gi++) for (let gj = 0; gj < N; gj++) {
      const cx = Math.round(start + gi * step + (rnd() - 0.5) * step * 0.45);
      const cz = Math.round(start + gj * step + (rnd() - 0.5) * step * 0.45);
      if (Math.hypot(cx, cz) < 80) continue;        // centre dégagé (donjon)
      if (clearOf(cx, cz, 34)) continue;            // dégage les apparitions
      POIS[Math.floor(rnd() * POIS.length)](cx, cz);
    }
    // ── Donjon central (point de repère) ──
    B(-16, 0, -16, 16, 3, 16, 'stone');
    stairs(-16, 0, '-x', 7, 5, 0.6, 1.2); stairs(16, 0, '+x', 7, 5, 0.6, 1.2);
    block(-7, -7, 7, 7, 14, 'wall'); B(-9, 3, -9, 9, 3.4, 9, 'stone');
    crate(-12, -12, 1.4, 1.4, 'crate2', 3); crate(12, 12, 1.4, 1.4, 'crate2', 3);
    // couverture éparse dans les champs (hors apparitions)
    for (let i = 0; i < 120; i++) { const x = ri(-560, 560), z = ri(-560, 560); if (Math.hypot(x, z) < 70 || clearOf(x, z, 22)) continue; if (rnd() < 0.6) crate(x, z, 1.2 + rnd() * 1.2, 1.2 + rnd() * 1.2, rnd() < 0.5 ? 'crate' : 'crate2'); else { barrel(x, z); barrel(x + 0.8, z + 0.5); } }
  },
  spawns: { ffa: R_FFA, t0: R_T0, t1: R_T1 },
});

// ---------------------------------------------------------------------------
// ENTREPÔT — hangar industriel, allées de conteneurs, combats rapprochés
// ---------------------------------------------------------------------------
const entrepot = build({
  id: 'entrepot', name: 'Entrepôt', size: [72, 60], wallHeight: 8, outerMat: 'metal',
  theme: { sky: ['#52606e', '#b7bcc2'], fog: '#9aa2ab', fogNear: 40, fogFar: 120, sun: '#ffeccb', floor: 'concrete', ambient: 0.72 },
  build: ({ block, crate, stairs, B, barrel }) => {
    const cc = ['container_r', 'container_b', 'container_g', 'container_y'];
    // allées de conteneurs (symétrie centrale)
    for (const s of [-1, 1]) {
      B(-30 * 1, 0, -20 * s, -18, 2.6, -14 * s, cc[0]);
      B(-6, 0, -22 * s, 6, 2.6, -16 * s, cc[1]);
      B(18, 0, -20 * s, 30, 2.6, -14 * s, cc[2]);
      B(-30, 2.6, -20 * s, -18, 5.2, -14 * s, cc[3]);
      crate(-12 * s, -6 * s, 1.6, 1.6, 'crate2');
      crate(12 * s, -9 * s, 1.4);
      barrel(-24 * s, -2 * s); barrel(-23.2 * s, -2.6 * s);
    }
    // plateforme / mezzanine centrale avec escaliers
    B(-7, 0, -3.5, 7, 2.2, 3.5, 'stone');
    stairs(-7, 0, '-x', 4, 4, 0.55, 0.9); stairs(7, 0, '+x', 4, 4, 0.55, 0.9);
    crate(0, 0, 1.4, 1.4, 'crate2', 2.2);
    // caisses éparses
    crate(-26, 8, 1.4); crate(26, -8, 1.4); crate(-20, -10, 1.2, 1.2, 'crate2'); crate(20, 10, 1.2, 1.2, 'crate2');
    B(-32, 0, 6, -24, 1.1, 6.8, 'sandbag'); B(24, 0, -6.8, 32, 1.1, -6, 'sandbag');
  },
  spawns: {
    ffa: [[-32, -24], [32, -24], [-32, 24], [32, 24], [0, -26], [0, 26], [-32, 0], [32, 0], [-14, -10], [14, 10], [14, -10], [-14, 10], [0, -12], [0, 12]],
    t0: [[-32, -24], [-24, -25], [-16, -24], [-8, -25], [0, -26], [8, -25], [16, -24]],
    t1: [[-32, 24], [-24, 25], [-16, 24], [-8, 25], [0, 26], [8, 25], [16, 24]],
  },
});

// ---------------------------------------------------------------------------
// TEMPLE — ruines de pierre, longues lignes de vue et plateformes (AWP / TDM)
// ---------------------------------------------------------------------------
const temple = build({
  id: 'temple', name: 'Temple', size: [96, 64], wallHeight: 9,
  theme: { sky: ['#e9b06a', '#ffe0b0'], fog: '#e7c79a', fogNear: 55, fogFar: 160, sun: '#ffe0a8', floor: 'sand', ambient: 0.8 },
  build: ({ block, crate, stairs, B, barrel }) => {
    // grand escalier central et podium (ligne de vue centrale)
    B(-8, 0, -4, 8, 2.4, 4, 'stone');
    stairs(-8, 0, '-x', 6, 4, 0.6, 1.1); stairs(8, 0, '+x', 6, 4, 0.6, 1.1);
    block(-3, -3, 3, 3, 7, 'stone'); // autel
    // rangées de colonnes (couloirs longs symétriques)
    for (const s of [-1, 1]) {
      for (const cx of [-34, -22, 22, 34]) crate(cx, 16 * s, 1.4, 7, 'stone');
      block(-42, 9 * s, -30, 20 * s, 6, 'wall');
      block(30, 9 * s, 42, 20 * s, 6, 'wall');
      crate(-16, 10 * s, 1.6, 1.6, 'crate2');
      crate(16, 13 * s, 1.4);
      B(-10, 0, 24 * s, 10, 1.2, 24.8 * s, 'sandbag');
      barrel(-40, 4 * s); barrel(40, -4 * s);
    }
    crate(0, 18, 1.4); crate(0, -18, 1.4);
    crate(-46, 10, 1.2, 4, 'stone'); crate(46, -10, 1.2, 4, 'stone');
  },
  spawns: {
    ffa: [[-44, -26], [44, -26], [-44, 26], [44, 26], [0, -28], [0, 28], [-44, 0], [44, 0], [-20, -20], [20, 20], [20, -20], [-20, 20], [-30, 0], [30, 0]],
    t0: [[-44, -26], [-36, -27], [-28, -26], [-20, -27], [-44, 0], [44, -26], [36, -27]],
    t1: [[-44, 26], [-36, 27], [-28, 26], [-20, 27], [-44, 8], [44, 26], [36, 27]],
  },
});

export const MAPS = { oasis, docks, duel, royaume, entrepot, temple };
export const MAP_LIST = ['oasis', 'docks', 'duel', 'royaume', 'entrepot', 'temple'];
