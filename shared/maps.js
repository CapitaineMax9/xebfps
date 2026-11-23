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
  def.build({ B, block, crate, stairs });
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
  build: ({ block, crate, stairs, B }) => {
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
  build: ({ B, crate, stairs }) => {
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
  build: ({ B, crate }) => {
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

export const MAPS = { oasis, docks, duel };
export const MAP_LIST = ['oasis', 'docks', 'duel'];
