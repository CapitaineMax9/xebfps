// Décors purement visuels générés à partir de la géométrie des cartes.
// Rien ici n'a de collision : tout est hors de portée des joueurs ou plaqué contre les murs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './skinTex.js';

const std = (color, rough = 0.85, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

// Regroupe des boîtes instanciées par matériau (un seul appel de dessin chacun)
const SHADOW_KEYS = new Set(['cornice', 'trim', 'pillar', 'crane', 'dist', 'dist2', 'hull', 'hullTop']);

class Instancer {
  constructor() { this.sets = new Map(); }
  add(key, mat, x, y, z, sx, sy, sz, ry = 0, rx = 0) {
    if (!this.sets.has(key)) this.sets.set(key, { mat, list: [] });
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    this.sets.get(key).list.push(m);
  }
  build(group, geo = new THREE.BoxGeometry(1, 1, 1)) {
    for (const [key, { mat, list }] of this.sets) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      // seuls les grands éléments projettent une ombre (les petits détails coûtent cher pour rien)
      im.castShadow = SHADOW_KEYS.has(key); im.receiveShadow = true;
      group.add(im);
    }
  }
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const TEX = {};
function textures() {
  if (TEX.ready) return TEX;
  TEX.leaf = canvasTex(128, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#3e5a1e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const y = 8 + i * 9, len = (w / 2 - 6) * Math.sin((i / 26) * Math.PI) + 6;
      ctx.strokeStyle = i % 2 ? '#4f7a26' : '#5f8c2e'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(w / 2, y); ctx.lineTo(w / 2 - len, y + 14); ctx.moveTo(w / 2, y); ctx.lineTo(w / 2 + len, y + 14); ctx.stroke();
    }
  });
  TEX.barrelR = canvasTex(128, 128, (ctx, w, h) => barrelPaint(ctx, w, h, '#a8321e'));
  TEX.barrelB = canvasTex(128, 128, (ctx, w, h) => barrelPaint(ctx, w, h, '#2a5a8a'));
  TEX.barrelY = canvasTex(128, 128, (ctx, w, h) => { barrelPaint(ctx, w, h, '#c8a02a'); ctx.fillStyle = '#111'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('⚠', 48, 78); });
  TEX.decal = canvasTex(256, 256, (ctx, w, h) => {
    const r = mulberry32(5);
    for (let i = 0; i < 30; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.6, y = h / 2 + (r() - 0.5) * h * 0.6, rad = 20 + r() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(40,30,20,0.18)'); g.addColorStop(1, 'rgba(40,30,20,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = 'rgba(30,22,15,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); let x = w / 2, y = h / 2; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) ctx.lineTo(x += (r() - 0.5) * 70, y += (r() - 0.5) * 70); ctx.stroke(); }
  });
  TEX.ready = true;
  return TEX;
}

function barrelPaint(ctx, w, h, col) {
  ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 14, w, 6); ctx.fillRect(0, h - 20, w, 6); ctx.fillRect(0, h / 2 - 3, w, 6);
  const r = mulberry32(col.length * 7);
  for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(90,50,20,${r() * 0.3})`; ctx.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
}

// ── Point d'entrée ───────────────────────────────────────────────────────
export function buildDecor(map, group, quality) {
  const T = textures();
  const rnd = mulberry32(map.id.length * 1000 + map.boxes.length);
  const inst = new Instancer();
  const dec = new THREE.Group();
  dec.name = 'decor';
  const rich = quality !== 'low';

  const M = {
    frame: std(0x3a2a1c, 0.8),
    glass: std(0x1c2a36, 0.15, 0.7, { envMapIntensity: 2.5 }),
    shutterA: std(0x2f7f86, 0.8), shutterB: std(0x2d5d9a, 0.8), shutterC: std(0x8a4a2a, 0.8),
    door: std(0x6a4024, 0.75),
    cornice: std(0xc8ae84, 0.95),
    trim: std(0x9a8462, 0.95),
    lampBody: std(0x222222, 0.5, 0.6),
    bulb: new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc870, emissiveIntensity: 3 }),
    awningA: std(0xb8442a, 0.9), awningB: std(0x2a6aa0, 0.9), awningC: std(0xd0b040, 0.9),
    pillar: std(0x8f7b5e, 0.95),
    metalDark: std(0x2c3036, 0.6, 0.5),
    crane: std(0xd0a020, 0.55, 0.4),
    hull: std(0x6a1f1a, 0.7, 0.2),
    hullTop: std(0xdcdcdc, 0.7),
    distant: std(0xc8b088, 1),
    distant2: std(0x9a8a70, 1),
    dome: std(0x4a8aa0, 0.4, 0.3),
  };

  const isDesert = map.id !== 'docks';
  const inside = (b) => b.m !== 'floor';
  const H = map.wallHeight;
  const [SX, SZ] = map.size;

  // ── Bâtiments : fenêtres, volets, portes, lampes, corniches ────────────
  const buildings = map.boxes.filter((b) => inside(b) && (b.m === 'wall') && b.y1 - b.y0 >= 5 && Math.abs(b.x1) <= SX / 2 && Math.abs(b.z1) <= SZ / 2);
  for (const b of buildings) {
    const h = b.y1;
    // corniche en haut et soubassement
    inst.add('cornice', M.cornice, (b.x0 + b.x1) / 2, h - 0.12, (b.z0 + b.z1) / 2, b.x1 - b.x0 + 0.3, 0.28, b.z1 - b.z0 + 0.3);
    inst.add('cornice', M.cornice, (b.x0 + b.x1) / 2, h - 1.2, (b.z0 + b.z1) / 2, b.x1 - b.x0 + 0.12, 0.12, b.z1 - b.z0 + 0.12);
    inst.add('trim', M.trim, (b.x0 + b.x1) / 2, 0.22, (b.z0 + b.z1) / 2, b.x1 - b.x0 + 0.08, 0.44, b.z1 - b.z0 + 0.08);
    const shutter = [M.shutterA, M.shutterB, M.shutterC][Math.floor(rnd() * 3)];
    const shKey = shutter === M.shutterA ? 'shA' : shutter === M.shutterB ? 'shB' : 'shC';
    // 4 faces : [normale x, normale z, coordonnée fixe, début, fin]
    const faces = [
      [1, 0, b.x1, b.z0, b.z1], [-1, 0, b.x0, b.z0, b.z1],
      [0, 1, b.z1, b.x0, b.x1], [0, -1, b.z0, b.x0, b.x1],
    ];
    faces.forEach(([nx, nz, fixed, a0, a1], fi) => {
      const L = a1 - a0;
      const ry = nx ? Math.PI / 2 : 0;
      const place = (along, y, sx, sy, depth, key, mat, out = 0) => {
        const off = depth / 2 + out;
        if (nx) inst.add(key, mat, fixed + nx * off, y, along, sx, sy, depth, ry);
        else inst.add(key, mat, along, y, fixed + nz * off, sx, sy, depth, ry);
      };
      const n = Math.floor((L - 1.5) / 3.4);
      const winY = h - 2.4;
      for (let i = 0; i < n; i++) {
        const along = a0 + (L - (n - 1) * 3.4) / 2 + i * 3.4;
        if (rnd() < 0.15) continue;
        place(along, winY, 1.05, 1.35, 0.1, 'frame', M.frame);
        place(along, winY, 0.85, 1.15, 0.04, 'glass', M.glass, 0.02);
        if (rnd() < 0.7) { place(along - 0.78, winY, 0.45, 1.3, 0.06, shKey, shutter); place(along + 0.78, winY, 0.45, 1.3, 0.06, shKey, shutter); }
        place(along, winY - 0.75, 1.25, 0.1, 0.22, 'cornice', M.cornice);
      }
      // une porte par bâtiment, sur la face la plus longue, avec lampe et auvent
      if (fi === (L >= 8 ? fi : -1) && rnd() < 0.6) {
        const along = a0 + L * (0.3 + rnd() * 0.4);
        place(along, 1.15, 1.4, 2.3, 0.08, 'frame', M.frame);
        place(along, 1.1, 1.15, 2.15, 0.06, 'door', M.door, 0.02);
        place(along + 1.1, 2.7, 0.18, 0.26, 0.2, 'lamp', M.lampBody);
        place(along + 1.1, 2.6, 0.12, 0.12, 0.12, 'bulb', M.bulb, 0.12);
        if (rich) {
          const aw = [M.awningA, M.awningB, M.awningC][Math.floor(rnd() * 3)];
          const key = aw === M.awningA ? 'awA' : aw === M.awningB ? 'awB' : 'awC';
          if (nx) inst.add(key, aw, fixed + nx * 0.45, 3.15, along, 0.9, 0.05, 1.9, 0, 0);
          else inst.add(key, aw, along, 3.15, fixed + nz * 0.45, 1.9, 0.05, 0.9, 0, 0);
        }
      }
    });
  }

  // ── Piliers contre les murs extérieurs ────────────────────────────────
  const halfX = SX / 2, halfZ = SZ / 2;
  for (let x = -halfX + 4; x < halfX - 2; x += 8) {
    inst.add('pillar', M.pillar, x, H / 2 + 0.2, -halfZ + 0.06, 0.7, H + 0.4, 0.12);
    inst.add('pillar', M.pillar, x, H / 2 + 0.2, halfZ - 0.06, 0.7, H + 0.4, 0.12);
  }
  for (let z = -halfZ + 4; z < halfZ - 2; z += 8) {
    inst.add('pillar', M.pillar, -halfX + 0.06, H / 2 + 0.2, z, 0.12, H + 0.4, 0.7);
    inst.add('pillar', M.pillar, halfX - 0.06, H / 2 + 0.2, z, 0.12, H + 0.4, 0.7);
  }
  // couronnement des murs extérieurs
  inst.add('cornice', M.cornice, 0, H + 0.1, -halfZ - 1, SX + 4.4, 0.3, 2.4);
  inst.add('cornice', M.cornice, 0, H + 0.1, halfZ + 1, SX + 4.4, 0.3, 2.4);
  inst.add('cornice', M.cornice, -halfX - 1, H + 0.1, 0, 2.4, 0.3, SZ);
  inst.add('cornice', M.cornice, halfX + 1, H + 0.1, 0, 2.4, 0.3, SZ);

  // ── Tonneaux ──────────────────────────────────────────────────────────
  const barrels = map.boxes.filter((b) => b.m === 'barrel');
  if (barrels.length) {
    const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.95, 16);
    const mats = [T.barrelR, T.barrelB, T.barrelY].map((t) => std(0xffffff, 0.6, 0.35, { map: t }));
    const groups = [[], [], []];
    barrels.forEach((b, i) => groups[(Math.round(b.x0 * 7 + b.z0 * 3) % 3 + 3) % 3].push(b));
    groups.forEach((list, k) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mats[k], list.length);
      list.forEach((b, i) => im.setMatrixAt(i, new THREE.Matrix4().makeRotationY(i * 1.7).setPosition((b.x0 + b.x1) / 2, 0.475, (b.z0 + b.z1) / 2)));
      im.castShadow = im.receiveShadow = true;
      dec.add(im);
    });
    // couvercles
    const lid = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 16), M.metalDark, barrels.length);
    barrels.forEach((b, i) => lid.setMatrixAt(i, new THREE.Matrix4().setPosition((b.x0 + b.x1) / 2, 0.96, (b.z0 + b.z1) / 2)));
    dec.add(lid);
  }

  // ── Guirlandes de fanions entre les bâtiments (désert) ────────────────
  if (isDesert && rich) {
    const tall = map.boxes.filter((b) => inside(b) && b.y1 >= 5);
    const cableMat = std(0x222222, 0.8);
    const flagMats = [0xd84a2a, 0xe8c030, 0x2a8ad0, 0x3aa050, 0xffffff].map((c) => std(c, 0.9, 0, { side: THREE.DoubleSide }));
    const flagGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.3, 0], 3));
    flagGeo.computeVertexNormals();
    const flags = flagMats.map(() => []);
    let count = 0;
    for (let i = 0; i < tall.length && count < 14; i++) {
      for (let j = i + 1; j < tall.length && count < 14; j++) {
        const a = tall[i], b = tall[j];
        const pa = new THREE.Vector3(Math.min(Math.max((b.x0 + b.x1) / 2, a.x0), a.x1), Math.min(a.y1, b.y1) - 0.6, Math.min(Math.max((b.z0 + b.z1) / 2, a.z0), a.z1));
        const pb = new THREE.Vector3(Math.min(Math.max(pa.x, b.x0), b.x1), pa.y, Math.min(Math.max(pa.z, b.z0), b.z1));
        const d = pa.distanceTo(pb);
        if (d < 5 || d > 16 || rnd() < 0.35) continue;
        count++;
        const pts = [];
        for (let k = 0; k <= 12; k++) { const t = k / 12; const p = pa.clone().lerp(pb, t); p.y -= Math.sin(t * Math.PI) * d * 0.08; pts.push(p); }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.015, 4), cableMat);
        dec.add(tube);
        const nf = Math.floor(d / 0.5);
        const dir = pb.clone().sub(pa).normalize();
        const ang = Math.atan2(dir.x, dir.z) + Math.PI / 2;
        for (let k = 1; k < nf; k++) {
          const p = curve.getPoint(k / nf);
          flags[k % flagMats.length].push(new THREE.Matrix4().makeRotationY(ang).setPosition(p));
        }
      }
    }
    flags.forEach((list, k) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(flagGeo, flagMats[k], list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      dec.add(im);
    });
  }

  // ── Au-delà des murs : sol, palmiers, silhouettes ──────────────────────
  const outsideGround = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), std(isDesert ? 0xcdb48a : 0x6a6e72, 1));
  outsideGround.rotation.x = -Math.PI / 2;
  outsideGround.position.y = -0.02;
  outsideGround.receiveShadow = true;
  dec.add(outsideGround);

  const ring = (n, dMin, dMax, fn) => {
    for (let i = 0; i < n; i++) {
      const side = Math.floor(rnd() * 4), t = rnd() * 2 - 1, d = dMin + rnd() * (dMax - dMin);
      let x, z;
      if (side === 0) { x = t * (halfX + d); z = -halfZ - 2 - d; } else if (side === 1) { x = t * (halfX + d); z = halfZ + 2 + d; }
      else if (side === 2) { x = -halfX - 2 - d; z = t * (halfZ + d); } else { x = halfX + 2 + d; z = t * (halfZ + d); }
      fn(x, z, i);
    }
  };

  if (isDesert) {
    // silhouettes de maisons et dômes
    ring(rich ? 40 : 18, 8, 60, (x, z) => {
      const w = 6 + rnd() * 10, d = 6 + rnd() * 10, h = H + 1 + rnd() * 8;
      inst.add(rnd() < 0.5 ? 'dist' : 'dist2', rnd() < 0.5 ? M.distant : M.distant2, x, h / 2, z, w, h, d, rnd() * 0.3);
      if (rnd() < 0.2) {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.dome);
        dome.position.set(x, h, z);
        dec.add(dome);
      }
    });
    // palmiers
    const palms = buildPalms(rich ? 34 : 16, (fn) => ring(rich ? 34 : 16, 3, 30, fn), rnd, T.leaf);
    dec.add(palms);
  } else {
    // entrepôts et grues au loin
    ring(rich ? 30 : 14, 10, 70, (x, z) => {
      const w = 12 + rnd() * 20, d = 10 + rnd() * 16, h = 10 + rnd() * 14;
      inst.add('dist2', M.distant2, x, h / 2, z, w, h, d, rnd() * 0.2);
    });
    // grue sur les piliers
    for (const sgn of [-1, 1]) {
      const px = 14 * sgn, pz = 21 * sgn;
      inst.add('crane', M.crane, px, 7.4, pz, 0.9, 0.9, 0.9);
      inst.add('crane', M.crane, px - 6 * sgn, 7.9, pz, 16, 0.6, 0.7);
      inst.add('crane', M.crane, px + 3 * sgn, 7.9, pz, 4, 1.4, 1.2);
      inst.add('crane', M.crane, px - 13 * sgn, 6.6, pz, 0.15, 2.4, 0.15);
      inst.add('metal', M.metalDark, px - 13 * sgn, 5.2, pz, 0.6, 0.4, 0.6);
    }
    // navire à quai derrière le mur sud
    const sx = 0, sz = halfZ + 30;
    inst.add('hull', M.hull, sx, 4, sz, 120, 12, 22);
    inst.add('hullTop', M.hullTop, sx + 40, 14, sz, 18, 10, 18);
    inst.add('hullTop', M.hullTop, sx + 40, 20, sz, 10, 3, 10);
    for (let i = 0; i < 8; i++) inst.add('cont' + (i % 3), [M.awningA, M.awningB, M.awningC][i % 3], sx - 40 + i * 9, 11.3, sz + (i % 2 ? 4 : -4), 8, 2.6, 2.5);
  }

  // ── Taches et fissures au sol ─────────────────────────────────────────
  const decalMat = new THREE.MeshStandardMaterial({ map: T.decal, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const nDec = rich ? 50 : 20;
  const decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), decalMat, nDec);
  for (let i = 0; i < nDec; i++) {
    const s = 1.5 + rnd() * 3;
    decals.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3((rnd() - 0.5) * SX * 0.95, 0.012, (rnd() - 0.5) * SZ * 0.95), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), new THREE.Vector3(s, 1, s)));
  }
  decals.receiveShadow = true;
  dec.add(decals);

  inst.build(dec);
  group.add(dec);
  return dec;
}

function buildPalms(n, ringFn, rnd, leafTex) {
  const trunkGeos = [], leafGeos = [];
  ringFn((x, z) => {
    const h = 9 + rnd() * 6, lean = (rnd() - 0.5) * 0.25, leanDir = rnd() * Math.PI * 2;
    const segs = 8;
    let px = x, pz = z;
    for (let i = 0; i < segs; i++) {
      const g = new THREE.CylinderGeometry(0.22 - i * 0.012, 0.26 - i * 0.012, h / segs + 0.05, 7);
      const y = (i + 0.5) * h / segs;
      const off = Math.pow(i / segs, 2) * lean * h;
      g.translate(px + Math.cos(leanDir) * off, y, pz + Math.sin(leanDir) * off);
      trunkGeos.push(g);
    }
    const tx = px + Math.cos(leanDir) * lean * h, tz = pz + Math.sin(leanDir) * lean * h;
    const nl = 9;
    for (let k = 0; k < nl; k++) {
      const g = new THREE.PlaneGeometry(1.1, 4.2, 1, 4);
      // courbure de la feuille
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) { const yy = pos.getY(v); pos.setZ(v, -Math.pow((yy + 2.1) / 4.2, 2) * 1.6); }
      g.translate(0, 2.1, 0);
      g.rotateX(-1.1 + rnd() * 0.3);
      g.rotateY((k / nl) * Math.PI * 2 + rnd() * 0.3);
      g.translate(tx, h, tz);
      leafGeos.push(g);
    }
  });
  const grp = new THREE.Group();
  if (!trunkGeos.length) return grp;
  const trunk = new THREE.Mesh(mergeGeometries(trunkGeos), std(0x7a5a3a, 1));
  const leaves = new THREE.Mesh(mergeGeometries(leafGeos), new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }));
  trunk.castShadow = leaves.castShadow = false;
  grp.add(trunk, leaves);
  void n;
  return grp;
}
