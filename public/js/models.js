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
  glove: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x3e4a3a, roughness: 0.95 }),
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
    const m = new THREE.MeshStandardMaterial({ map: tex, metalness: fin.metalness, roughness: fin.roughness });
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
  const mk = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const right = new THREE.Group();
  const rFore = mk(0.07, 0.07, 0.32, M.sleeve); rFore.position.set(0, -0.02, 0.17);
  const rHand = mk(0.06, 0.075, 0.08, M.glove); rHand.position.set(0, 0, 0);
  right.add(rFore, rHand);
  const left = new THREE.Group();
  const lFore = mk(0.07, 0.07, 0.34, M.sleeve); lFore.position.set(0, -0.02, 0.18);
  const lHand = mk(0.06, 0.07, 0.08, M.glove);
  left.add(lFore, lHand);
  g.add(right, left);
  g.userData.right = right; g.userData.left = left;
  return g;
}

// ── Personnage (troisième personne) ────────────────────────────────────────
const OUTFITS = [
  { shirt: 0x37506e, pants: 0x2a3340, vest: 0x1f2a36, head: 0x22303f, accent: 0x5aa9ff },   // Défense
  { shirt: 0x8a6a3e, pants: 0x4a3c2a, vest: 0x5b4a30, head: 0x3a2f22, accent: 0xffb347 },   // Assaut
  { shirt: 0x5b3a6e, pants: 0x2e2638, vest: 0x3b2a48, head: 0x2a2030, accent: 0xc06bff },
  { shirt: 0x3e6b4a, pants: 0x2a3a2e, vest: 0x2b4a34, head: 0x1f2e24, accent: 0x5be08a },
  { shirt: 0x7a3a3a, pants: 0x3a2626, vest: 0x542a2a, head: 0x2e1c1c, accent: 0xff6a6a },
  { shirt: 0x6e6e6e, pants: 0x333333, vest: 0x454545, head: 0x222222, accent: 0xdddddd },
];

export function buildAvatar(outfitIdx) {
  const o = OUTFITS[outfitIdx % OUTFITS.length];
  const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const shirt = mat(o.shirt), pants = mat(o.pants), vest = mat(o.vest), head = mat(o.head), skin = mat(0xc89878), accent = mat(o.accent, 0.5), boots = mat(0x161616);
  const root = new THREE.Group();
  root.rotation.order = 'YXZ'; // la chute (axe X) se fait par rapport à l'orientation du joueur
  const box = (w, h, d, m) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.castShadow = true; return me; };

  // jambes (pivot à la hanche)
  const legs = new THREE.Group();
  const mkLeg = (x) => {
    const p = new THREE.Group(); p.position.set(x, 0.85, 0);
    const thigh = box(0.17, 0.46, 0.2, pants); thigh.position.y = -0.23;
    const shin = box(0.16, 0.36, 0.18, pants); shin.position.y = -0.62;
    const boot = box(0.17, 0.1, 0.27, boots); boot.position.set(0, -0.8, -0.04);
    p.add(thigh, shin, boot);
    return p;
  };
  const legL = mkLeg(-0.11), legR = mkLeg(0.11);
  legs.add(legL, legR);
  root.add(legs);

  // haut du corps (pivot aux hanches)
  const upper = new THREE.Group(); upper.position.y = 0.85;
  const torso = box(0.46, 0.6, 0.26, shirt); torso.position.y = 0.32;
  const vestM = box(0.48, 0.42, 0.3, vest); vestM.position.y = 0.36;
  const patch = box(0.1, 0.06, 0.01, accent); patch.position.set(0.12, 0.48, -0.155);
  const neck = box(0.12, 0.06, 0.12, skin); neck.position.y = 0.65;
  const headG = new THREE.Group(); headG.position.y = 0.8;
  const headM = box(0.26, 0.28, 0.27, head); headM.position.y = 0.0;
  const face = box(0.2, 0.08, 0.02, skin); face.position.set(0, 0.03, -0.14);
  const goggles = box(0.22, 0.05, 0.03, accent); goggles.position.set(0, 0.04, -0.145);
  headG.add(headM, face, goggles);
  upper.add(torso, vestM, patch, neck, headG);

  // bras + arme (pivot aux épaules, suivent le pitch)
  const arms = new THREE.Group(); arms.position.set(0, 0.55, 0);
  const armR = box(0.12, 0.12, 0.42, shirt); armR.position.set(0.2, -0.05, -0.17);
  const armL = box(0.12, 0.12, 0.46, shirt); armL.position.set(-0.1, -0.06, -0.28); armL.rotation.y = -0.45;
  const handR = box(0.09, 0.09, 0.09, mat(0x222222)); handR.position.set(0.17, -0.08, -0.4);
  arms.add(armR, armL, handR);
  const weaponAnchor = new THREE.Group(); weaponAnchor.position.set(0.15, -0.06, -0.38);
  arms.add(weaponAnchor);
  upper.add(arms);
  root.add(upper);

  root.userData = { legs, legL, legR, upper, arms, headG, weaponAnchor, mats: [shirt, pants, vest, head, skin, accent, boots] };
  return root;
}
