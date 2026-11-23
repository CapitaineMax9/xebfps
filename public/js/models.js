// Modèles low-poly des armes, couteaux et personnages.
import * as THREE from 'three';
import { SKINS } from '/shared/skins.js';
import { skinTexture, skinFinish } from './skinTex.js';

// ── Géométries avec UV à l'échelle (pour que le motif du skin ait une densité constante)
const UV_SCALE = 2.8; // répétitions par mètre

function scaleBoxUV(geo, w, h, d, off) {
  const uv = geo.attributes.uv;
  // ordre des faces : +x, -x, +y, -y, +z, -z (4 sommets chacune)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] * UV_SCALE + off[0], uv.getY(i) * dims[f][1] * UV_SCALE + off[1]);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

let uvSeed = 0;
function nextOff() { uvSeed = (uvSeed * 9301 + 49297) % 233280; return [(uvSeed / 233280) * 3, ((uvSeed * 7) % 233280) / 233280 * 3]; }

export function boxGeo(w, h, d) {
  return scaleBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, nextOff());
}

export function cylGeo(r, len, seg = 10, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateX(Math.PI / 2); // axe le long de Z ; r2 vers -Z
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * r;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ * UV_SCALE, uv.getY(i) * len * UV_SCALE);
  uv.needsUpdate = true;
  return g;
}

// ── Matériaux ──────────────────────────────────────────────────────────────
const M = {
  dark: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.7, metalness: 0.2 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.8 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.25, metalness: 0.95 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x3fa0ff, roughness: 0.05, metalness: 0.6, emissive: 0x0a2a55, emissiveIntensity: 0.6 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.85 }),
  gloveKnuckle: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.2 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4a5640, roughness: 0.95 }),
  cuff: new THREE.MeshStandardMaterial({ color: 0x343c2e, roughness: 0.95 }),
  skinTone: new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.8 }),
  stDisplay: null,
};

// couleurs par défaut des parties « skinnables »
const DEFAULTS = {
  ak47: { skin: 0x2b2b2b, skin2: 0x7a4a24 },
  m4a1s: { skin: 0x2d2f31, skin2: 0x2d2f31 },
  awp: { skin: 0x4c5c3a, skin2: 0x4c5c3a },
  ssg08: { skin: 0x3c3f42, skin2: 0x3c3f42 },
  deagle: { skin: 0x9da2a8, skin2: 0x9da2a8, metal: 0.85 },
  glock: { skin: 0x262626, skin2: 0x262626 },
  usp: { skin: 0x2a2b2d, skin2: 0x2a2b2d },
  mp9: { skin: 0x2a2c2e, skin2: 0x2a2c2e },
  p90: { skin: 0x2b2d2b, skin2: 0x2b2d2b },
  nova: { skin: 0x2a2a2a, skin2: 0x5a3a20 },
  knife: { skin: 0xc8ccd2, skin2: 0xc8ccd2, metal: 0.95 },
};

const matCache = new Map();
function skinMaterials(weaponId, item) {
  const key = item ? `${item.skin}:${item.seed}:${Math.round(item.float * 20)}` : 'def:' + weaponId;
  if (matCache.has(key)) return matCache.get(key);
  let mats;
  if (item && SKINS[item.skin]) {
    const tex = skinTexture(item.skin, item.float, item.seed);
    const fin = skinFinish(item.skin, item.float);
    const m = new THREE.MeshPhysicalMaterial({ map: tex, metalness: fin.metalness, roughness: fin.roughness, clearcoat: 0.55 * (1 - item.float), clearcoatRoughness: 0.22 + item.float * 0.5 });
    mats = { skin: m, skin2: m };
  } else {
    const d = DEFAULTS[weaponId] || DEFAULTS.ak47;
    mats = {
      skin: new THREE.MeshStandardMaterial({ color: d.skin, roughness: d.metal ? 0.25 : 0.55, metalness: d.metal || 0.35 }),
      skin2: new THREE.MeshStandardMaterial({ color: d.skin2, roughness: d.metal ? 0.25 : 0.7, metalness: d.metal ? d.metal : 0.05 }),
    };
  }
  matCache.set(key, mats);
  return mats;
}

// ── Constructeur de modèle ─────────────────────────────────────────────────
function makeBuilder(group, mats) {
  const get = (k) => mats[k] || M[k];
  return {
    box(w, h, d, x, y, z, mat = 'skin', rx = 0, ry = 0, rz = 0) {
      const m = new THREE.Mesh(boxGeo(w, h, d), get(mat));
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      group.add(m); return m;
    },
    cyl(r, len, x, y, z, mat = 'metal', seg = 10, r2 = r, rx = 0, ry = 0) {
      const m = new THREE.Mesh(cylGeo(r, len, seg, r2), get(mat));
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
      group.add(m); return m;
    },
    group,
  };
}

const BUILDERS = {
  ak47(b, g) {
    b.box(0.05, 0.075, 0.36, 0, 0.035, -0.08);
    b.box(0.044, 0.022, 0.3, 0, 0.083, -0.06);
    b.box(0.058, 0.055, 0.2, 0, 0.03, -0.36, 'skin2');
    b.box(0.046, 0.034, 0.18, 0, 0.077, -0.35, 'skin2');
    b.cyl(0.011, 0.3, 0, 0.045, -0.6);
    b.cyl(0.016, 0.06, 0, 0.045, -0.77, 'metal', 8);
    b.box(0.01, 0.045, 0.012, 0, 0.08, -0.68, 'metal');
    b.box(0.03, 0.02, 0.05, 0, 0.098, -0.22, 'metal');
    b.box(0.036, 0.11, 0.045, 0, -0.045, 0.04, 'dark', 0.3);
    b.box(0.008, 0.012, 0.07, 0, -0.012, -0.03, 'metal');
    g.userData.mag = [b.box(0.032, 0.12, 0.07, 0, -0.06, -0.15, 'skin', -0.2), b.box(0.031, 0.1, 0.066, 0, -0.155, -0.11, 'skin', -0.5)];
    b.box(0.045, 0.072, 0.27, 0, 0.0, 0.25, 'skin2', 0.08);
    b.box(0.05, 0.12, 0.022, 0, -0.025, 0.385, 'dark', 0.08);
    return { muzzle: [0, 0.045, -0.81], st: [0.027, 0.035, -0.12] };
  },
  m4a1s(b, g) {
    b.box(0.045, 0.07, 0.22, 0, 0.02, -0.07);
    b.box(0.048, 0.05, 0.27, 0, 0.075, -0.1);
    b.box(0.02, 0.016, 0.22, 0, 0.108, -0.1, 'dark');
    b.box(0.058, 0.062, 0.25, 0, 0.065, -0.36);
    b.cyl(0.01, 0.08, 0, 0.065, -0.52);
    b.cyl(0.021, 0.21, 0, 0.065, -0.66, 'skin', 12);
    b.box(0.012, 0.04, 0.015, 0, 0.13, -0.45, 'dark');
    b.box(0.025, 0.035, 0.03, 0, 0.13, 0.0, 'dark');
    b.box(0.034, 0.1, 0.042, 0, -0.05, 0.05, 'dark', 0.3);
    g.userData.mag = [b.box(0.03, 0.15, 0.06, 0, -0.08, -0.12, 'skin', -0.1)];
    b.cyl(0.016, 0.14, 0, 0.06, 0.1, 'dark');
    b.box(0.045, 0.085, 0.16, 0, 0.035, 0.24);
    b.box(0.048, 0.1, 0.02, 0, 0.03, 0.33, 'dark');
    return { muzzle: [0, 0.065, -0.77], st: [0.026, 0.02, -0.06] };
  },
  awp(b, g) {
    b.box(0.07, 0.09, 0.55, 0, 0.02, -0.12);
    b.box(0.066, 0.07, 0.26, 0, 0.03, -0.52);
    b.cyl(0.015, 0.52, 0, 0.055, -0.86, 'metal', 10);
    b.cyl(0.023, 0.08, 0, 0.055, -1.14, 'metal', 8);
    b.box(0.052, 0.042, 0.3, 0, 0.087, -0.12, 'metal');
    // lunette
    b.cyl(0.024, 0.34, 0, 0.158, -0.15, 'dark', 14);
    b.cyl(0.024, 0.08, 0, 0.158, -0.36, 'dark', 14, 0.036);
    b.cyl(0.03, 0.06, 0, 0.158, 0.05, 'dark', 14);
    b.cyl(0.033, 0.004, 0, 0.158, -0.402, 'lens', 14);
    b.cyl(0.027, 0.004, 0, 0.158, 0.081, 'lens', 14);
    b.box(0.03, 0.032, 0.03, 0, 0.19, -0.15, 'dark');
    b.box(0.03, 0.03, 0.03, 0.03, 0.158, -0.15, 'dark');
    b.box(0.022, 0.05, 0.022, 0, 0.12, -0.04, 'dark');
    b.box(0.022, 0.05, 0.022, 0, 0.12, -0.26, 'dark');
    // culasse
    const bolt = new THREE.Group();
    bolt.position.set(0.035, 0.087, 0.02);
    const bb = makeBuilder(bolt, {});
    bb.box(0.06, 0.008, 0.008, 0.03, 0, 0, 'steel');
    bb.box(0.018, 0.018, 0.018, 0.062, -0.006, 0, 'steel');
    g.add(bolt);
    g.userData.bolt = bolt;
    b.box(0.042, 0.11, 0.05, 0, -0.06, 0.06, 'skin', 0.3);
    b.box(0.066, 0.13, 0.32, 0, 0.0, 0.31);
    b.box(0.05, 0.03, 0.2, 0, 0.078, 0.32);
    b.box(0.07, 0.15, 0.03, 0, -0.005, 0.48, 'dark');
    b.box(0.03, 0.02, 0.06, 0, -0.015, -0.02, 'metal');
    g.userData.mag = [b.box(0.05, 0.06, 0.09, 0, -0.05, -0.18, 'dark')];
    return { muzzle: [0, 0.055, -1.19], st: [0.036, 0.03, -0.2], scope: [0, 0.158, 0.1] };
  },
  ssg08(b, g) {
    b.box(0.05, 0.07, 0.42, 0, 0.02, -0.12);
    b.box(0.045, 0.05, 0.22, 0, 0.03, -0.44);
    b.cyl(0.011, 0.52, 0, 0.05, -0.78, 'metal');
    b.cyl(0.016, 0.05, 0, 0.05, -1.05, 'metal', 8);
    b.box(0.04, 0.035, 0.24, 0, 0.07, -0.12, 'metal');
    b.cyl(0.02, 0.3, 0, 0.135, -0.14, 'dark', 12);
    b.cyl(0.02, 0.06, 0, 0.135, -0.32, 'dark', 12, 0.028);
    b.cyl(0.024, 0.004, 0, 0.135, -0.352, 'lens', 12);
    b.cyl(0.022, 0.004, 0, 0.135, 0.012, 'lens', 12);
    b.box(0.018, 0.04, 0.018, 0, 0.1, -0.05, 'dark');
    b.box(0.018, 0.04, 0.018, 0, 0.1, -0.24, 'dark');
    const bolt = new THREE.Group(); bolt.position.set(0.028, 0.07, 0.0);
    const bb = makeBuilder(bolt, {}); bb.box(0.05, 0.007, 0.007, 0.025, 0, 0, 'steel'); bb.box(0.015, 0.015, 0.015, 0.052, -0.005, 0, 'steel');
    g.add(bolt); g.userData.bolt = bolt;
    b.box(0.036, 0.1, 0.045, 0, -0.05, 0.05, 'skin', 0.3);
    b.box(0.045, 0.03, 0.3, 0, 0.03, 0.27);
    b.box(0.045, 0.03, 0.22, 0, -0.04, 0.3, 'skin', -0.25);
    b.box(0.05, 0.13, 0.025, 0, -0.01, 0.43, 'dark');
    g.userData.mag = [b.box(0.04, 0.06, 0.07, 0, -0.04, -0.16, 'dark')];
    return { muzzle: [0, 0.05, -1.08], st: [0.026, 0.02, -0.2], scope: [0, 0.135, 0.05] };
  },
  deagle(b, g) {
    b.box(0.034, 0.045, 0.26, 0, 0.065, -0.08);
    b.box(0.026, 0.014, 0.24, 0, 0.094, -0.08);
    b.box(0.03, 0.03, 0.2, 0, 0.028, -0.06);
    b.box(0.032, 0.125, 0.056, 0, -0.04, 0.03, 'dark', 0.22);
    b.box(0.006, 0.03, 0.05, 0, 0.0, -0.04, 'metal');
    b.box(0.008, 0.012, 0.008, 0, 0.105, -0.2, 'metal');
    g.userData.mag = [b.box(0.024, 0.04, 0.04, 0, -0.105, 0.045, 'metal', 0.22)];
    return { muzzle: [0, 0.07, -0.215], st: [0.018, 0.06, -0.08] };
  },
  glock(b, g) {
    b.box(0.03, 0.04, 0.19, 0, 0.058, -0.055);
    b.box(0.03, 0.026, 0.16, 0, 0.026, -0.05);
    b.box(0.03, 0.115, 0.05, 0, -0.035, 0.03, 'skin', 0.32);
    b.box(0.006, 0.026, 0.045, 0, 0.0, -0.035, 'dark');
    b.box(0.006, 0.01, 0.006, 0, 0.082, -0.14, 'metal');
    g.userData.mag = [b.box(0.024, 0.03, 0.036, 0, -0.1, 0.05, 'dark', 0.32)];
    return { muzzle: [0, 0.06, -0.152], st: [0.016, 0.058, -0.06] };
  },
  usp(b, g) {
    b.box(0.032, 0.04, 0.2, 0, 0.058, -0.06);
    b.box(0.03, 0.026, 0.17, 0, 0.026, -0.05);
    b.cyl(0.017, 0.14, 0, 0.058, -0.23, 'skin', 12);
    b.box(0.031, 0.115, 0.05, 0, -0.035, 0.03, 'dark', 0.3);
    b.box(0.006, 0.026, 0.045, 0, 0.0, -0.035, 'dark');
    g.userData.mag = [b.box(0.024, 0.03, 0.036, 0, -0.1, 0.05, 'dark', 0.3)];
    return { muzzle: [0, 0.058, -0.31], st: [0.017, 0.058, -0.06] };
  },
  mp9(b, g) {
    b.box(0.045, 0.07, 0.28, 0, 0.04, -0.08);
    b.box(0.02, 0.014, 0.2, 0, 0.082, -0.08, 'dark');
    b.cyl(0.012, 0.08, 0, 0.045, -0.26);
    b.box(0.022, 0.07, 0.03, 0, -0.02, -0.18, 'dark', -0.15);
    b.box(0.034, 0.1, 0.045, 0, -0.04, 0.02, 'skin', 0.2);
    g.userData.mag = [b.box(0.026, 0.09, 0.034, 0, -0.12, 0.03, 'dark', 0.2)];
    b.box(0.02, 0.035, 0.2, 0, 0.035, 0.14, 'dark');
    return { muzzle: [0, 0.045, -0.3], st: [0.024, 0.04, -0.1] };
  },
  p90(b, g) {
    b.box(0.06, 0.1, 0.46, 0, 0.03, -0.05);
    b.box(0.05, 0.03, 0.34, 0, 0.095, -0.08, 'skin2');
    b.box(0.04, 0.06, 0.06, 0, -0.01, -0.3);
    b.cyl(0.012, 0.04, 0, 0.04, -0.3, 'metal');
    b.box(0.03, 0.03, 0.12, 0, 0.13, -0.05, 'dark');
    b.box(0.03, 0.07, 0.04, 0, -0.04, -0.02, 'dark', 0.2);
    g.userData.mag = [g.children[1]];
    return { muzzle: [0, 0.04, -0.33], st: [0.031, 0.03, -0.05] };
  },
  nova(b, g) {
    b.box(0.045, 0.07, 0.22, 0, 0.05, -0.08);
    b.cyl(0.012, 0.56, 0, 0.074, -0.45);
    b.cyl(0.014, 0.44, 0, 0.042, -0.39, 'metal');
    const pump = b.box(0.048, 0.048, 0.15, 0, 0.042, -0.36, 'skin2');
    g.userData.pump = pump;
    b.box(0.034, 0.1, 0.045, 0, -0.03, 0.04, 'dark', 0.3);
    b.box(0.042, 0.09, 0.3, 0, 0.0, 0.2, 'skin2', 0.15);
    b.box(0.006, 0.01, 0.006, 0, 0.085, -0.7, 'metal');
    g.userData.mag = [];
    return { muzzle: [0, 0.074, -0.74], st: [0.024, 0.05, -0.08] };
  },
};

// ── Détails supplémentaires (rails, molettes, crans…) ───────────────────
const rail = (b, n, x, y, z0, step = 0.012, w = 0.022) => { for (let i = 0; i < n; i++) b.box(w, 0.006, 0.006, x, y, z0 - i * step, 'dark'); };
const serrations = (b, n, w, y, z0, h = 0.03) => { for (let i = 0; i < n; i++) { b.box(w + 0.002, h, 0.003, 0, y, z0 - i * 0.007, 'dark'); } };
const PI2 = Math.PI / 2;
const DETAILS = {
  awp(b) {
    // canon cannelé + frein de bouche ajouré
    for (const [x, y] of [[0.014, 0.055], [-0.014, 0.055], [0, 0.069], [0, 0.041]]) b.box(0.004, 0.004, 0.42, x, y, -0.88, 'dark');
    for (const z of [-1.12, -1.15]) { b.box(0.05, 0.012, 0.012, 0, 0.055, z, 'dark'); }
    // tourelles et bagues de lunette
    b.cyl(0.013, 0.02, 0, 0.19, -0.15, 'metal', 12, 0.013, PI2);
    b.cyl(0.015, 0.006, 0, 0.204, -0.15, 'steel', 12, 0.015, PI2);
    b.cyl(0.013, 0.02, 0.035, 0.158, -0.15, 'metal', 12, 0.013, 0, PI2);
    b.cyl(0.011, 0.02, -0.03, 0.158, -0.12, 'metal', 10, 0.011, 0, PI2);
    for (const z of [-0.04, -0.26]) b.cyl(0.03, 0.018, 0, 0.158, z, 'dark', 14);
    b.cyl(0.032, 0.01, 0, 0.158, 0.035, 'metal', 14);
    // rail picatinny sur la culasse
    rail(b, 18, 0, 0.11, 0.02);
    // pontet, détente, levier
    b.box(0.006, 0.03, 0.006, 0, -0.04, -0.02, 'steel', 0.3);
    b.box(0.008, 0.008, 0.08, 0, -0.06, -0.03, 'dark');
    // bipied replié + anneaux de sangle
    b.cyl(0.006, 0.22, 0.02, -0.01, -0.58, 'dark'); b.cyl(0.006, 0.22, -0.02, -0.01, -0.58, 'dark');
    b.box(0.05, 0.02, 0.03, 0, 0.0, -0.66, 'dark');
    b.box(0.008, 0.02, 0.02, 0, -0.07, 0.4, 'steel');
    // crosse : appui-joue réglable, plaque de couche à cales
    b.box(0.054, 0.012, 0.18, 0, 0.1, 0.32, 'dark');
    for (const z of [0.465, 0.475]) b.box(0.072, 0.15, 0.004, 0, -0.005, z, 'metal');
  },
  ssg08(b) {
    for (const z of [-0.05, -0.24]) b.cyl(0.024, 0.014, 0, 0.135, z, 'dark', 12);
    b.cyl(0.011, 0.018, 0, 0.163, -0.14, 'metal', 10, 0.011, PI2);
    b.cyl(0.011, 0.018, 0.028, 0.135, -0.14, 'metal', 10, 0.011, 0, PI2);
    rail(b, 14, 0, 0.09, 0.0);
    b.box(0.006, 0.026, 0.006, 0, -0.035, -0.02, 'steel', 0.3);
  },
  ak47(b) {
    b.box(0.03, 0.03, 0.03, 0, 0.065, -0.47, 'metal');         // bloc d'emprunt de gaz
    b.box(0.012, 0.05, 0.03, 0, 0.075, -0.68, 'metal');        // capuchon du guidon
    b.cyl(0.004, 0.3, 0, 0.022, -0.6, 'steel');                // baguette de nettoyage
    for (let i = 0; i < 8; i++) b.box(0.046, 0.003, 0.004, 0, 0.095, -0.17 + i * 0.03, 'dark'); // nervures du couvercle
    for (const [x, z] of [[0.026, 0.05], [0.026, -0.2], [-0.026, 0.05], [-0.026, -0.2]]) b.cyl(0.004, 0.004, x, 0.02, z, 'steel', 6, 0.004, 0, PI2); // rivets
    b.box(0.004, 0.04, 0.06, 0.027, 0.05, -0.02, 'metal', 0.2);  // sélecteur
    for (let i = 0; i < 4; i++) b.box(0.034, 0.004, 0.06, 0, -0.08 - i * 0.03, -0.15 + i * 0.01, 'dark', -0.3); // nervures du chargeur
    b.box(0.006, 0.025, 0.006, 0, -0.03, -0.03, 'steel', 0.3);
  },
  m4a1s(b) {
    rail(b, 20, 0, 0.108, 0.04);
    rail(b, 14, 0, 0.1, -0.24);
    for (const side of [-1, 1]) for (let i = 0; i < 10; i++) b.box(0.006, 0.02, 0.006, side * 0.031, 0.065, -0.25 - i * 0.022, 'dark');
    b.box(0.03, 0.012, 0.04, 0, 0.09, 0.07, 'dark');       // levier d'armement
    b.cyl(0.008, 0.02, 0.028, 0.08, -0.02, 'steel', 8, 0.008, 0, PI2); // assistance de fermeture
    b.box(0.002, 0.028, 0.06, 0.025, 0.075, -0.09, 'dark'); // fenêtre d'éjection
    for (let i = 0; i < 6; i++) b.cyl(0.022, 0.004, 0, 0.065, -0.58 - i * 0.03, 'dark', 12); // bagues du silencieux
    b.box(0.006, 0.025, 0.006, 0, -0.03, -0.04, 'steel', 0.3);
    for (let i = 0; i < 4; i++) b.box(0.032, 0.004, 0.064, 0, -0.04 - i * 0.03, -0.12, 'dark', -0.1);
  },
  deagle(b) {
    serrations(b, 6, 0.034, 0.068, 0.04);
    b.box(0.012, 0.012, 0.012, 0, 0.1, 0.03, 'dark');      // hausse
    b.box(0.02, 0.02, 0.014, 0, 0.07, 0.06, 'metal', -0.4); // chien
    b.box(0.002, 0.03, 0.05, 0.018, 0.07, -0.05, 'dark');  // fenêtre d'éjection
    b.box(0.005, 0.02, 0.005, 0, 0.0, -0.03, 'steel', 0.3);
  },
  glock(b) {
    serrations(b, 5, 0.03, 0.058, 0.03);
    b.box(0.012, 0.01, 0.01, 0, 0.083, 0.03, 'dark');
    b.box(0.005, 0.018, 0.005, 0, 0.0, -0.03, 'steel', 0.3);
  },
  usp(b) {
    serrations(b, 5, 0.032, 0.058, 0.03);
    b.box(0.012, 0.01, 0.01, 0, 0.083, 0.03, 'dark');
    b.box(0.02, 0.014, 0.012, 0, 0.062, 0.05, 'metal', -0.4);
    for (let i = 0; i < 3; i++) b.cyl(0.018, 0.004, 0, 0.058, -0.19 - i * 0.04, 'dark', 12);
  },
  mp9(b) { rail(b, 14, 0, 0.09, 0.0); b.box(0.006, 0.02, 0.006, 0, -0.01, -0.06, 'steel', 0.3); b.cyl(0.016, 0.02, 0, 0.045, -0.29, 'dark', 8); },
  p90(b) { b.box(0.064, 0.02, 0.2, 0, -0.02, 0.06, 'dark'); b.box(0.02, 0.05, 0.08, 0, 0.0, -0.12, 'dark'); },
  nova(b) { for (let i = 0; i < 6; i++) b.box(0.05, 0.004, 0.006, 0, 0.066, -0.3 - i * 0.02, 'dark'); b.box(0.006, 0.02, 0.006, 0, -0.0, -0.04, 'steel', 0.3); },
};

// Couteaux (origine au manche, lame vers -Z)
const KNIFE_BUILDERS = {
  default(b) {
    b.box(0.006, 0.034, 0.15, 0, 0.004, -0.13);
    b.box(0.006, 0.022, 0.04, 0, 0.012, -0.22, 'skin', 0.5);
    b.box(0.022, 0.05, 0.014, 0, 0, -0.045, 'dark');
    b.box(0.024, 0.03, 0.11, 0, -0.002, 0.02, 'dark');
  },
  bayonet(b) {
    b.box(0.007, 0.036, 0.2, 0, 0.004, -0.16);
    b.box(0.007, 0.022, 0.05, 0, 0.012, -0.28, 'skin', 0.45);
    b.box(0.009, 0.008, 0.16, 0, 0.0, -0.15, 'steel');
    b.box(0.03, 0.06, 0.016, 0, 0, -0.05, 'metal');
    b.box(0.026, 0.032, 0.12, 0, -0.002, 0.02, 'dark');
    b.box(0.03, 0.036, 0.02, 0, -0.002, 0.085, 'metal');
  },
  karambit(b) {
    // lame en crochet : segments successifs
    let y = 0.0, z = -0.06, a = 0.25;
    for (let i = 0; i < 6; i++) {
      const len = 0.03;
      b.box(0.006, 0.026 - i * 0.003, len + 0.004, 0, y, z, 'skin', a);
      y -= Math.sin(a) * len; z -= Math.cos(a) * len;
      a += 0.33;
    }
    b.box(0.022, 0.03, 0.1, 0, 0.01, 0.01, 'dark', -0.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 14), M.metal);
    ring.position.set(0, 0.025, 0.075); ring.rotation.y = Math.PI / 2;
    b.group.add(ring);
  },
  flip(b) {
    b.box(0.006, 0.032, 0.14, 0, 0.006, -0.12);
    b.box(0.006, 0.02, 0.045, 0, 0.0, -0.205, 'skin', -0.45);
    b.box(0.008, 0.012, 0.012, 0, 0.026, -0.06, 'steel');
    b.box(0.022, 0.03, 0.035, 0, 0.0, -0.035, 'steel');
    b.box(0.02, 0.028, 0.1, 0, -0.002, 0.03, 'skin');
    b.box(0.024, 0.006, 0.1, 0, 0.012, 0.03, 'dark');
  },
  butterfly(b) {
    b.box(0.006, 0.03, 0.16, 0, 0.006, -0.13);
    b.box(0.006, 0.02, 0.04, 0, 0.014, -0.225, 'skin', 0.5);
    b.box(0.012, 0.026, 0.12, -0.009, -0.002, 0.02, 'steel');
    b.box(0.012, 0.026, 0.12, 0.009, -0.002, 0.02, 'steel');
    b.box(0.03, 0.03, 0.012, 0, -0.002, -0.045, 'metal');
  },
};

/**
 * Construit le modèle d'une arme.
 * item : objet d'inventaire équipé ({skin, float, seed, st, kills}) ou null
 * opts.statTrak : affiche le compteur
 */
export function buildWeapon(weaponId, item = null, opts = {}) {
  const g = new THREE.Group();
  const skin = item && SKINS[item.skin] ? SKINS[item.skin] : null;
  const mats = skinMaterials(weaponId, skin ? item : null);
  const b = makeBuilder(g, mats);
  let info = { muzzle: [0, 0, -0.3] };
  if (weaponId === 'knife') {
    const type = skin && skin.knife ? skin.knife : 'default';
    KNIFE_BUILDERS[type](b);
    info = { muzzle: [0, 0, -0.2] };
  } else if (BUILDERS[weaponId]) {
    info = BUILDERS[weaponId](b, g);
    if (DETAILS[weaponId] && opts.detail !== false) DETAILS[weaponId](b);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.fromArray(info.muzzle);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.userData.scope = info.scope;
  if (item && item.st && info.st && opts.statTrak !== false) {
    const disp = makeStatTrak(item.kills || 0);
    disp.position.fromArray(info.st);
    g.add(disp);
    g.userData.stDisplay = disp;
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = !!opts.shadows; o.receiveShadow = false; } });
  return g;
}

export function makeStatTrak(kills) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016), mat);
  m.rotation.y = Math.PI / 2;
  m.userData.update = (k) => {
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#120a04'; ctx.fillRect(0, 0, 128, 40);
    ctx.fillStyle = '#ff8a1f'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff8a1f'; ctx.shadowBlur = 8;
    ctx.fillText(String(k).padStart(6, '0'), 64, 21);
    tex.needsUpdate = true;
  };
  m.userData.update(kills);
  return m;
}

// ── Bras du viewmodel ──────────────────────────────────────────────────────
export function buildArms() {
  const g = new THREE.Group();
  const mk = (w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, parent = null) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    (parent || g).add(m);
    return m;
  };
  const hand = (parent, wrap) => {
    mk(0.055, 0.07, 0.075, M.glove, 0, 0, 0, 0, parent);                       // paume
    mk(0.058, 0.02, 0.05, M.gloveKnuckle, 0, 0.03, -0.01, 0, parent);          // protection des phalanges
    for (let i = 0; i < 4; i++) {                                               // doigts repliés
      const f = new THREE.Group(); f.position.set(-0.03, 0.022 - i * 0.017, -0.03); f.rotation.y = wrap ? 1.2 : 0.4; parent.add(f);
      mk(0.035, 0.015, 0.016, M.glove, 0, 0, -0.012, 0, f);
      mk(0.022, 0.014, 0.015, M.glove, -0.01, 0, -0.03, 0, f).rotation.y = 0.9;
    }
    mk(0.016, 0.016, 0.045, M.glove, 0.028, 0.02, -0.035, 0, parent).rotation.y = -0.5; // pouce
  };
  const right = new THREE.Group();
  mk(0.068, 0.068, 0.3, M.sleeve, 0, -0.015, 0.2, 0, right);
  mk(0.078, 0.078, 0.05, M.cuff, 0, -0.015, 0.06, 0, right);
  mk(0.062, 0.062, 0.06, M.glove, 0, -0.01, 0.03, 0, right); // poignet
  const rh = new THREE.Group(); right.add(rh); hand(rh, true);
  const left = new THREE.Group();
  mk(0.068, 0.068, 0.32, M.sleeve, 0, -0.015, 0.21, 0, left);
  mk(0.078, 0.078, 0.05, M.cuff, 0, -0.015, 0.06, 0, left);
  mk(0.062, 0.062, 0.06, M.glove, 0, -0.01, 0.03, 0, left);
  const lh = new THREE.Group(); left.add(lh); hand(lh, false);
  lh.rotation.z = Math.PI / 2;
  g.add(right, left);
  g.userData.right = right; g.userData.left = left;
  return g;
}

// ── Personnage (troisième personne) ────────────────────────────────────────
// Squelette simple : hanches > jambes (genou) ; colonne > tête ; épaules > bras (coude, IK).
const OUTFITS = [
  { shirt: 0x2f3f56, pants: 0x27303c, vest: 0x4a5560, helmet: 0x1e2630, accent: 0x5aa9ff, skin: 0xc89878, wrap: null },          // Défense
  { shirt: 0x8a6a42, pants: 0x5a4a34, vest: 0x4a3c28, helmet: null, accent: 0xffb347, skin: 0xb88464, wrap: 0x6a2a20 },           // Assaut
  { shirt: 0x4a2f5e, pants: 0x2e2638, vest: 0x3b2a48, helmet: 0x241a30, accent: 0xc06bff, skin: 0xc89878, wrap: null },
  { shirt: 0x3e5e44, pants: 0x2a3a2e, vest: 0x46583a, helmet: null, accent: 0x5be08a, skin: 0x9a6a4a, wrap: 0x2a3a22 },
  { shirt: 0x6e3434, pants: 0x3a2626, vest: 0x542a2a, helmet: 0x2e1c1c, accent: 0xff6a6a, skin: 0xd8a888, wrap: null },
  { shirt: 0x5e6064, pants: 0x333333, vest: 0x45474a, helmet: null, accent: 0xdddddd, skin: 0x7a5a42, wrap: 0x222222 },
];

const LIMB = { upperArm: 0.31, foreArm: 0.3, thigh: 0.44, shin: 0.42 };

function limb(len, w, d, mat) {
  // boîte qui s'étend le long de +Z depuis l'origine (orientée ensuite vers une cible)
  const g = new THREE.BoxGeometry(w, d, len);
  g.translate(0, 0, len / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export function buildAvatar(outfitIdx) {
  const o = OUTFITS[outfitIdx % OUTFITS.length];
  const mat = (c, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const M = {
    shirt: mat(o.shirt), pants: mat(o.pants), vest: mat(o.vest, 0.8), skin: mat(o.skin, 0.75), accent: mat(o.accent, 0.5, 0.2),
    boots: mat(0x1a1816, 0.7), glove: mat(0x1c1c1c, 0.8), helmet: mat(o.helmet || 0x222222, 0.55, 0.15), wrap: mat(o.wrap || 0x222222, 0.95),
    pad: mat(0x2a2a2a, 0.6), lens: new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.1, metalness: 0.8 }), strap: mat(0x111111, 0.9),
  };
  const box = (w, h, d, m, x = 0, y = 0, z = 0, parent = null) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z); me.castShadow = true;
    if (parent) parent.add(me);
    return me;
  };
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  box(0.36, 0.2, 0.22, M.pants, 0, 0.02, 0, hips);
  box(0.38, 0.06, 0.24, M.strap, 0, 0.1, 0, hips); // ceinture

  // jambes : pivot hanche -> genou
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.1 * side, -0.04, 0); hips.add(hip);
    box(0.17, LIMB.thigh, 0.19, M.pants, 0, -LIMB.thigh / 2, 0, hip);
    if (side === 1) box(0.06, 0.12, 0.12, M.vest, 0.1, -0.15, 0, hip); // poche de cuisse
    const knee = new THREE.Group(); knee.position.y = -LIMB.thigh; hip.add(knee);
    box(0.15, LIMB.shin, 0.17, M.pants, 0, -LIMB.shin / 2, 0, knee);
    box(0.16, 0.12, 0.06, M.pad, 0, -0.04, -0.1, knee); // genouillère
    const foot = box(0.16, 0.1, 0.28, M.boots, 0, -LIMB.shin - 0.01, -0.05, knee);
    void foot;
    legs.push({ hip, knee });
  }

  // colonne -> buste -> tête
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  box(0.42, 0.5, 0.24, M.shirt, 0, 0.27, 0, spine);
  box(0.46, 0.36, 0.3, M.vest, 0, 0.3, 0, spine);
  for (const x of [-0.13, 0, 0.13]) box(0.1, 0.12, 0.06, M.vest, x, 0.2, -0.17, spine); // poches
  box(0.08, 0.05, 0.01, M.accent, 0.12, 0.42, -0.156, spine); // écusson
  box(0.3, 0.34, 0.12, M.vest, 0, 0.32, 0.2, spine); // sac
  box(0.04, 0.3, 0.04, M.strap, 0.1, 0.62, 0.22, spine); // antenne radio
  const neck = box(0.12, 0.08, 0.12, M.skin, 0, 0.54, 0, spine);
  void neck;
  const head = new THREE.Group(); head.position.y = 0.66; spine.add(head);
  box(0.22, 0.25, 0.24, M.skin, 0, 0, 0, head);
  if (o.wrap) {
    box(0.235, 0.27, 0.25, M.wrap, 0, 0.01, 0.005, head);
    box(0.17, 0.05, 0.02, M.skin, 0, 0.03, -0.128, head); // fente des yeux
  } else {
    box(0.18, 0.08, 0.02, M.wrap, 0, -0.07, -0.125, head); // cache-cou
  }
  if (o.helmet) {
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.helmet);
    hm.scale.set(1, 0.9, 1.05); hm.position.y = 0.05; hm.castShadow = true; head.add(hm);
    box(0.2, 0.05, 0.04, M.lens, 0, 0.1, -0.13, head); // lunettes sur le casque
  }
  box(0.2, 0.045, 0.03, M.lens, 0, 0.03, -0.13, head); // lunettes de protection

  // bras + arme : groupe de visée pivotant aux épaules
  const aim = new THREE.Group(); aim.position.set(0, 0.5, 0); spine.add(aim);
  const shoulders = [new THREE.Vector3(-0.22, 0, 0), new THREE.Vector3(0.22, 0, 0)];
  box(0.14, 0.12, 0.16, M.shirt, -0.22, 0, 0, aim);
  box(0.14, 0.12, 0.16, M.shirt, 0.22, 0, 0, aim);
  const arms = shoulders.map(() => {
    const up = limb(LIMB.upperArm, 0.11, 0.11, M.shirt);
    const fore = limb(LIMB.foreArm, 0.1, 0.1, M.shirt);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), M.glove);
    hand.castShadow = true;
    aim.add(up, fore, hand);
    return { up, fore, hand };
  });
  const weaponAnchor = new THREE.Group(); weaponAnchor.position.set(0.1, -0.1, -0.22); aim.add(weaponAnchor);

  root.userData = { hips, spine, head, aim, legs, arms, shoulders, weaponAnchor, leftZ: -0.32, mats: Object.values(M) };
  return root;
}

// IK à deux os : place coude et main pour que la main atteigne `target` (espace du groupe de visée)
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
function solveArm(arm, S, T, side) {
  const a = LIMB.upperArm, b = LIMB.foreArm;
  _d.copy(T).sub(S);
  let d = _d.length();
  d = Math.min(d, a + b - 0.001);
  _d.normalize();
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  // le coude part vers le bas et vers l'extérieur
  _p.set(side * 0.6, -1, 0.2).normalize();
  _p.addScaledVector(_d, -_p.dot(_d)).normalize();
  _e.copy(S).addScaledVector(_d, a * cosA).addScaledVector(_p, a * sinA);
  arm.up.position.copy(S);
  arm.up.quaternion.setFromUnitVectors(_z, _v.copy(_e).sub(S).normalize());
  arm.fore.position.copy(_e);
  _v.copy(S).addScaledVector(_d, d);
  arm.fore.quaternion.setFromUnitVectors(_z, _p.copy(_v).sub(_e).normalize());
  arm.hand.position.copy(_v);
  arm.hand.quaternion.copy(arm.fore.quaternion);
}

const LEFT_Z = { rifle: -0.28, sniper: -0.3, smg: -0.2, shotgun: -0.28, pistol: -0.02, knife: null };
const _S = new THREE.Vector3(), _T = new THREE.Vector3();

/**
 * Pose de l'avatar.
 * st : { walk (phase), move (0..1), crouch (0..1), air (bool), pitch, kind, dead (0..1 ou -1), t }
 */
export function poseAvatar(av, st) {
  const u = av.userData;
  const c = st.crouch, mv = st.move;
  const sw = Math.sin(st.walk) * mv;
  const bob = Math.abs(Math.cos(st.walk)) * 0.04 * mv;
  // hanches et colonne
  u.hips.position.y = 0.92 - 0.4 * c - bob * (1 - c);
  u.spine.rotation.x = -0.35 * c - 0.06 * mv;
  u.head.rotation.x = 0.3 * c + st.pitch * 0.35;
  // jambes
  u.legs.forEach((L, i) => {
    const s = i === 0 ? 1 : -1;
    let thigh = sw * 0.7 * s, knee = Math.max(0, -Math.sin(st.walk + (i ? Math.PI : 0)) * 1.1) * mv;
    thigh = thigh * (1 - c) - (i ? 1.42 : 1.5) * c;
    knee = knee * (1 - c) + (i ? 1.62 : 1.6) * c;
    if (st.air) { thigh = -0.7 + (i ? 0.3 : 0); knee = 1.2; }
    L.hip.rotation.x = -thigh;
    L.knee.rotation.x = -knee; // le tibia part vers l'arrière
  });
  // visée : le groupe des bras suit le pitch (compensé par l'inclinaison du buste)
  u.aim.rotation.x = st.pitch - u.spine.rotation.x;
  // IK des bras vers la poignée et le garde-main de l'arme
  const wa = u.weaponAnchor.position;
  _T.set(wa.x, wa.y - 0.03, wa.z + 0.05);
  solveArm(u.arms[1], _S.copy(u.shoulders[1]), _T, 1);
  const lz = LEFT_Z[st.kind];
  if (lz === null || lz === undefined) {
    _T.set(-0.25, -0.38, -0.08);
  } else {
    _T.set(wa.x - 0.02, wa.y + 0.02, wa.z + lz);
  }
  solveArm(u.arms[0], _S.copy(u.shoulders[0]), _T, -1);
  // mort : chute en arrière, membres relâchés
  if (st.dead >= 0) {
    const t = st.dead;
    av.rotation.x = t * Math.PI / 2 * 0.95;
    u.legs.forEach((L, i) => { L.hip.rotation.x = 0.3 * t * (i ? 1 : 0.6); L.knee.rotation.x = -0.6 * t; });
    u.aim.rotation.x = -0.6 * t;
    u.head.rotation.x = -0.4 * t;
  } else av.rotation.x = 0;
}
