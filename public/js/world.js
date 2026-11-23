// Construction visuelle de la carte (meshes, textures, ciel, lumières).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32 } from './skinTex.js';

// Ambiance de chaque carte : position du soleil, atmosphère, brouillard
const SKY = {
  oasis: { elev: 42, az: 120, turbidity: 4, rayleigh: 1.0, mie: 0.004, sun: '#fff0d8', sunI: 3.4, skyLight: '#9cc4ff', ground: '#b89a6a', hemi: 0.42, fog: '#d8d0bc', fogD: 0.0055, clouds: '#ffffff', cloudN: 22 },
  docks: { elev: 26, az: 215, turbidity: 9, rayleigh: 2.0, mie: 0.008, sun: '#ffd9b0', sunI: 3.0, skyLight: '#9ab0cc', ground: '#8a8478', hemi: 0.5, fog: '#a8b0b8', fogD: 0.0105, clouds: '#e8e4e0', cloudN: 34 },
  duel: { elev: 9, az: 255, turbidity: 8, rayleigh: 3.0, mie: 0.01, sun: '#ffb070', sunI: 3.4, skyLight: '#a8a8c0', ground: '#b08a68', hemi: 0.45, fog: '#e0a888', fogD: 0.0075, clouds: '#ffc8a0', cloudN: 26 },
};

// Nuages : sprites doux générés une fois
let cloudTex = null;
function makeClouds(sunDir, sk) {
  if (!cloudTex) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    const r = mulberry32(42);
    for (let i = 0; i < 26; i++) {
      const x = 40 + r() * 176, y = 50 + r() * 40, rad = 18 + r() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
    }
    cloudTex = new THREE.CanvasTexture(c);
    cloudTex.colorSpace = THREE.SRGBColorSpace;
  }
  const g = new THREE.Group();
  g.userData.noAO = true;
  const r = mulberry32(7);
  for (let i = 0; i < sk.cloudN; i++) {
    const a = r() * Math.PI * 2, d = 230 + r() * 180;
    const mat = new THREE.SpriteMaterial({ map: cloudTex, color: new THREE.Color(sk.clouds), transparent: true, opacity: 0.55 + r() * 0.35, depthWrite: false, fog: false });
    const s = new THREE.Sprite(mat);
    s.position.set(Math.cos(a) * d, 70 + r() * 90, Math.sin(a) * d);
    const w = 90 + r() * 140;
    s.scale.set(w, w * (0.3 + r() * 0.2), 1);
    s.renderOrder = -1;
    g.add(s);
  }
  return g;
}

function canvasTex(size, draw, repeatMeters = 2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size, mulberry32(size * 13 + draw.length));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.userData.metersPerRepeat = repeatMeters;
  return t;
}

function speckle(ctx, s, rnd, n, cols, size = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
    ctx.globalAlpha = 0.15 + rnd() * 0.35;
    const w = size * (0.5 + rnd());
    ctx.fillRect(rnd() * s, rnd() * s, w, w);
  }
  ctx.globalAlpha = 1;
}

const TEX = {};
function textures() {
  if (TEX.ready) return TEX;
  TEX.sand = canvasTex(256, (ctx, s, r) => {
    ctx.fillStyle = '#d2b98a'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, r, 4000, ['#c4a874', '#e0cba0', '#b89a66', '#a88d5c'], 2);
    for (let i = 0; i < 30; i++) { ctx.strokeStyle = 'rgba(160,130,90,0.15)'; ctx.lineWidth = 2; ctx.beginPath(); const y = r() * s; ctx.moveTo(0, y); ctx.bezierCurveTo(s * 0.3, y + 6, s * 0.6, y - 6, s, y); ctx.stroke(); }
  }, 4);
  TEX.concrete = canvasTex(256, (ctx, s, r) => {
    ctx.fillStyle = '#8d8f91'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, r, 3500, ['#7a7c7e', '#a2a4a6', '#6b6d70'], 2);
    ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(60,55,50,0.08)'; ctx.beginPath(); ctx.arc(r() * s, r() * s, 20 + r() * 40, 0, 7); ctx.fill(); }
  }, 4);
  TEX.wall = canvasTex(256, (ctx, s, r) => {
    ctx.fillStyle = '#d9c29a'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, r, 3000, ['#cbb185', '#e6d3ad', '#c2a676'], 3);
    for (let i = 0; i < 14; i++) { ctx.fillStyle = 'rgba(150,110,70,0.06)'; ctx.beginPath(); ctx.ellipse(r() * s, r() * s, 20 + r() * 40, 10 + r() * 20, r() * 3, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(120,90,60,0.25)'; ctx.fillRect(0, s - 18, s, 18);
  }, 3);
  TEX.wall2 = canvasTex(256, (ctx, s, r) => {
    ctx.fillStyle = '#b89c72'; ctx.fillRect(0, 0, s, s);
    const bh = 32, bw = 64;
    for (let y = 0; y < s; y += bh) for (let x = -(y / bh % 2) * bw / 2; x < s; x += bw) {
      const v = 0.85 + r() * 0.25;
      ctx.fillStyle = `rgb(${184 * v | 0},${156 * v | 0},${114 * v | 0})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
    speckle(ctx, s, r, 1500, ['#9c8460', '#d0b88e'], 2);
  }, 2.5);
  TEX.stone = canvasTex(256, (ctx, s, r) => {
    ctx.fillStyle = '#9a8f80'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 64) for (let x = 0; x < s; x += 64) {
      const v = 0.85 + r() * 0.25;
      ctx.fillStyle = `rgb(${154 * v | 0},${143 * v | 0},${128 * v | 0})`;
      ctx.fillRect(x + 3, y + 3, 58, 58);
    }
    speckle(ctx, s, r, 2000, ['#7f766a', '#b5aa9a'], 2);
  }, 2);
  const crateTex = (base, plank) => canvasTex(256, (ctx, s, r) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = plank; ctx.globalAlpha = 0.3 + r() * 0.3; ctx.fillRect(0, i * s / 5 + 2, s, s / 5 - 4); ctx.globalAlpha = 1;
      for (let k = 0; k < 14; k++) { ctx.strokeStyle = 'rgba(60,35,15,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); const y = i * s / 5 + r() * s / 5; ctx.moveTo(0, y); ctx.lineTo(s, y + (r() - 0.5) * 4); ctx.stroke(); }
    }
    ctx.strokeStyle = 'rgba(40,22,8,0.9)'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, s - 14, s - 14);
    ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(s - 10, s - 10); ctx.stroke();
    ctx.fillStyle = 'rgba(30,20,10,0.6)'; ctx.font = 'bold 22px monospace'; ctx.fillText('XEB', s * 0.62, s * 0.3);
  }, 1);
  TEX.crate = crateTex('#a0703c', '#b8854a');
  TEX.crate2 = crateTex('#7f8a4a', '#949f5a');
  TEX.sandbag = canvasTex(128, (ctx, s, r) => {
    ctx.fillStyle = '#b5a070'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) for (let x = -(y / 32 % 2) * 24; x < s; x += 48) {
      ctx.fillStyle = `rgba(${150 + r() * 30},${130 + r() * 25},${90 + r() * 20},1)`;
      ctx.beginPath(); ctx.ellipse(x + 24, y + 16, 23, 14, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(80,60,30,0.5)'; ctx.stroke();
    }
  }, 1.2);
  TEX.metal = canvasTex(256, (ctx, s, r) => {
    ctx.fillStyle = '#5d636b'; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 32) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, 0, 4, s); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 4, 0, 3, s); }
    speckle(ctx, s, r, 1500, ['#7b5a3a', '#4a4f55', '#8a9098'], 2);
  }, 2);
  const container = (col) => canvasTex(256, (ctx, s, r) => {
    ctx.fillStyle = col; ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x, 0, 5, s); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x + 8, 0, 3, s); }
    speckle(ctx, s, r, 900, ['#6b4a2a', '#3a2a1a'], 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, s, 8); ctx.fillRect(0, s - 8, s, 8);
  }, 2.6);
  TEX.container_r = container('#a83a2a');
  TEX.container_b = container('#2a5a8a');
  TEX.container_g = container('#3a7a4a');
  TEX.container_y = container('#c89a2a');
  TEX.ready = true;
  return TEX;
}

// Construit une boîte avec des UV en mètres
function boxGeometry(b, mpr) {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h, b.z0, b.y0], [d, h, b.z0, b.y0], [w, d, b.x0, b.z0], [w, d, b.x0, b.z0], [w, h, b.x0, b.y0], [w, h, b.x0, b.y0]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * dims[f][0] + dims[f][2]) / mpr, (uv.getY(i) * dims[f][1] + dims[f][3]) / mpr);
  }
  g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  return g;
}

export function buildWorld(scene, map, settings) {
  const T = textures();
  const group = new THREE.Group();
  group.name = 'world';
  const byMat = new Map();
  for (const b of map.boxes) {
    let key = b.m;
    if (key === 'floor') key = map.theme.floor === 'concrete' ? 'concrete' : 'sand';
    if (!byMat.has(key)) byMat.set(key, []);
    byMat.get(key).push(b);
  }
  for (const [key, list] of byMat) {
    const tex = T[key] || T.wall;
    // les caisses : texture par face entière
    const crateLike = key.startsWith('crate');
    const geos = list.map((b) => {
      if (crateLike) {
        const g = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
        g.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
        return g;
      }
      return boxGeometry(b, tex.userData.metersPerRepeat || 2);
    });
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const metalLike = key === 'metal' || key.startsWith('container');
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: metalLike ? 0.6 : 0.92, metalness: metalLike ? 0.3 : 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = key !== 'sand' && key !== 'concrete';
    mesh.receiveShadow = true;
    mesh.name = key;
    group.add(mesh);
  }

  // ── Ciel atmosphérique + soleil ────────────────────────────────────────
  const sk = SKY[map.id] || SKY.oasis;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sk.elev), THREE.MathUtils.degToRad(sk.az));
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = sk.turbidity; u.rayleigh.value = sk.rayleigh;
  u.mieCoefficient.value = sk.mie; u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir);
  // le ciel est trop lumineux pour notre exposition : on le tempère
  sky.material.fragmentShader = sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * 0.42, 1.0 );');
  sky.name = 'sky';
  sky.userData.noAO = true;
  sky.frustumCulled = false;
  group.add(sky);
  group.add(makeClouds(sunDir, sk));

  // Lumières
  const hemi = new THREE.HemisphereLight(new THREE.Color(sk.skyLight), new THREE.Color(sk.ground), sk.hemi);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(sk.sun), sk.sunI);
  const half = Math.max(map.size[0], map.size[1]) / 2 + 4;
  sun.position.copy(sunDir).multiplyScalar(130);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = !!settings.shadows;
  const ss = settings.gfx === 'ultra' ? 4096 : settings.gfx === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(ss, ss);
  const ext = half * 1.45;
  sun.shadow.camera.left = -ext; sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext; sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 280;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2;
  group.add(sun, sun.target);
  group.userData.sun = sun;
  group.userData.sunDir = sunDir;
  // léger rebond de lumière depuis le sol, à l'opposé du soleil
  const bounce = new THREE.DirectionalLight(new THREE.Color(sk.ground), sk.hemi * 0.35);
  bounce.position.set(-sunDir.x, 0.2, -sunDir.z).multiplyScalar(50);
  group.add(bounce);

  scene.fog = new THREE.FogExp2(new THREE.Color(sk.fog), sk.fogD);
  scene.add(group);
  return group;
}

export function disposeWorld(scene, group) {
  if (!group) return;
  scene.remove(group);
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !o.material.map) o.material.dispose?.();
  });
}
