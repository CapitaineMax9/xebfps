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
// ROYAUME — grande carte verte ouverte avec plusieurs zones (pensée Battle Royale)
// ---------------------------------------------------------------------------
const royaume = build({
  id: 'royaume', name: 'Royaume', size: [150, 150], wallHeight: 11, outerMat: 'wall2',
  theme: { sky: ['#8fc0ea', '#cfe8b0'], fog: '#cfe4c2', fogNear: 80, fogFar: 230, sun: '#fff6e0', floor: 'grass', ambient: 0.82 },
  build: ({ block, crate, stairs, B, barrel }) => {
    // ── Donjon central (point haut) ──
    B(-9, 0, -9, 9, 2, 9, 'stone');
    stairs(-9, 0, '-x', 5, 4, 0.5, 1.1);
    stairs(9, 0, '+x', 5, 4, 0.5, 1.1);
    block(-4, -4, 4, 4, 9, 'wall');       // tour
    B(-5, 2, -5, 5, 2.4, 5, 'stone');
    crate(-6.5, -6.5, 1.2, 1.2, 'crate2', 2); crate(6.5, 6.5, 1.2, 1.2, 'crate2', 2);
    // ── Village (nord-est) : maisons avec rues ──
    for (const [hx, hz, w, d, h] of [[34, -46, 9, 8, 6], [46, -40, 8, 9, 7], [30, -34, 7, 7, 5], [48, -54, 9, 7, 6], [38, -58, 7, 8, 5]]) {
      block(hx - w / 2, hz - d / 2, hx + w / 2, hz + d / 2, h, 'wall');
    }
    crate(40, -46, 1.4); crate(36, -40, 1.2, 1.2, 'crate2'); barrel(44, -48); barrel(45, -47.2);
    // ── Fort (nord-ouest) : enceinte carrée avec tours d'angle et entrée ──
    for (const [ax, az] of [[-52, -52], [-28, -52], [-52, -28], [-28, -28]]) block(ax - 2, az - 2, ax + 2, az + 2, 8, 'stone');
    B(-52, 0, -52, -34, 3, -50, 'stone'); B(-30, 0, -52, -28, 3, -50 + 0, 'stone'); // mur nord (entrée au milieu)
    B(-52, 0, -30, -50, 3, -28, 'stone'); B(-52, 0, -52, -50, 3, -42, 'stone');
    B(-30, 0, -52, -28, 3, -42, 'stone'); B(-30, 0, -34, -28, 3, -28, 'stone');
    B(-52, 0, -30, -42, 3, -28, 'stone'); B(-38, 0, -30, -28, 3, -28, 'stone');
    crate(-40, -40, 2, 2); crate(-44, -36, 1.2); stairs(-40, -46, '+z', 4, 3, 0.6, 1.0, 'stone');
    // ── Entrepôt (sud-est) : conteneurs empilés ──
    const cc = ['container_r', 'container_b', 'container_g', 'container_y'];
    let ci = 0;
    for (const [cx, cz, rot] of [[34, 40, 0], [34, 46, 0], [42, 43, 1], [48, 40, 0], [40, 52, 1], [30, 48, 0]]) {
      const m = cc[ci++ % 4];
      if (rot) B(cx - 3, 0, cz - 1.2, cx + 3, 2.6, cz + 1.2, m); else B(cx - 1.2, 0, cz - 3, cx + 1.2, 2.6, cz + 3, m);
    }
    B(36, 2.6, 42, 40, 5.2, 48, cc[1]); // conteneur en hauteur
    crate(46, 50, 1.4, 1.4, 'crate2'); barrel(30, 54);
    // ── Camp (sud-ouest) : caisses et sacs ──
    crate(-40, 40, 2.2, 2.2); crate(-44, 44, 1.4, 1.4, 'crate2'); crate(-36, 46, 1.2);
    B(-48, 0, 38, -34, 1.1, 38.8, 'sandbag'); B(-48, 0, 47.2, -34, 1.1, 48, 'sandbag');
    crate(-46, 42, 1.2, 2.2, 'crate'); barrel(-38, 36); barrel(-39, 36.8); barrel(-50, 50);
    // ── Couverture éparse dans les champs ──
    for (const [x, z] of [[0, -40], [0, 40], [-40, 0], [40, 0], [18, -18], [-18, 18], [18, 18], [-18, -18], [60, 0], [-60, 0], [0, 60], [0, -60], [22, -56], [-22, 56]]) {
      crate(x, z, 1.4, 1.4, (x + z) % 2 ? 'crate' : 'crate2');
    }
    for (const [x, z] of [[12, -30], [-12, 30], [30, 12], [-30, -12], [55, -30], [-55, 30], [30, -62], [-30, 62]]) { barrel(x, z); barrel(x + 0.8, z + 0.6); }
    // murets de couverture au milieu des champs (loin des apparitions)
    B(44, 0, 8, 56, 1.2, 8.8, 'sandbag'); B(-56, 0, -8.8, -44, 1.2, -8, 'sandbag');
  },
  spawns: {
    ffa: [
      [0, -66], [0, 66], [-66, 0], [66, 0], [-62, -62], [62, -62], [-62, 62], [62, 62],
      [-34, -66], [34, -66], [-34, 66], [34, 66], [-66, -34], [-66, 34], [66, -34], [66, 34],
      [20, -20], [-20, 20], [20, 20], [-20, -20], [0, -24], [0, 24], [-24, 0], [24, 0],
    ],
    t0: [[-20, -66], [-10, -66], [0, -66], [10, -66], [20, -66], [-30, -64], [30, -64], [-46, -64], [46, -64]],
    t1: [[-20, 66], [-10, 66], [0, 66], [10, 66], [20, 66], [-30, 64], [30, 64], [-40, 62], [40, 62]],
  },
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
