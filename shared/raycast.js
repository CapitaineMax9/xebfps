// Raycasts contre la carte (AABB) et contre les hitbox des joueurs.
import { PLAYER } from './constants.js';

// Résultat partagé pour éviter les allocations
export const rayHit = { t: Infinity, nx: 0, ny: 0, nz: 0, box: null };

// Slab test. Renvoie t d'entrée (ou Infinity). Écrit la normale dans out si fourni.
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT, out) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  // X
  if (Math.abs(dx) < 1e-12) { if (ox < b.x0 || ox > b.x1) return Infinity; }
  else {
    const inv = 1 / dx;
    let t1 = (b.x0 - ox) * inv, t2 = (b.x1 - ox) * inv;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = dx > 0 ? -1 : 1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Y
  if (Math.abs(dy) < 1e-12) { if (oy < b.y0 || oy > b.y1) return Infinity; }
  else {
    const inv = 1 / dy;
    let t1 = (b.y0 - oy) * inv, t2 = (b.y1 - oy) * inv;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = dy > 0 ? -1 : 1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Z
  if (Math.abs(dz) < 1e-12) { if (oz < b.z0 || oz > b.z1) return Infinity; }
  else {
    const inv = 1 / dz;
    let t1 = (b.z0 - oz) * inv, t2 = (b.z1 - oz) * inv;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = dz > 0 ? -1 : 1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  if (out) {
    out.nx = axis === 0 ? sign : 0;
    out.ny = axis === 1 ? sign : 0;
    out.nz = axis === 2 ? sign : 0;
  }
  return tmin;
}

const tmpN = { nx: 0, ny: 0, nz: 0 };

// Raycast contre toutes les boîtes de la carte. Renvoie rayHit (t = Infinity si rien).
export function raycastMap(boxes, ox, oy, oz, dx, dy, dz, maxT) {
  rayHit.t = Infinity; rayHit.box = null;
  let best = maxT;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const t = rayBox(ox, oy, oz, dx, dy, dz, b, best, tmpN);
    if (t < best) {
      best = t;
      rayHit.t = t; rayHit.box = b;
      rayHit.nx = tmpN.nx; rayHit.ny = tmpN.ny; rayHit.nz = tmpN.nz;
    }
  }
  return rayHit;
}

// Ligne de vue dégagée entre deux points ?
export function lineOfSight(boxes, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const h = raycastMap(boxes, ax, ay, az, dx / len, dy / len, dz / len, len);
  return h.t >= len;
}

export const HIT_HEAD = 0, HIT_BODY = 1, HIT_LEGS = 2;

// Hitbox d'un joueur (pieds en x,y,z)
export function playerHitboxes(x, y, z, crouch, inflate = 0, out = []) {
  const h = crouch ? PLAYER.crouchHeight : PLAYER.height;
  const legTop = h * 0.47;
  const headBottom = h - 0.3;
  out.length = 3;
  out[0] = { g: HIT_HEAD, x0: x - 0.15 - inflate, x1: x + 0.15 + inflate, y0: y + headBottom, y1: y + h - 0.02 + inflate, z0: z - 0.15 - inflate, z1: z + 0.15 + inflate };
  out[1] = { g: HIT_BODY, x0: x - 0.25 - inflate, x1: x + 0.25 + inflate, y0: y + legTop, y1: y + headBottom, z0: z - 0.25 - inflate, z1: z + 0.25 + inflate };
  out[2] = { g: HIT_LEGS, x0: x - 0.2 - inflate, x1: x + 0.2 + inflate, y0: y, y1: y + legTop, z0: z - 0.2 - inflate, z1: z + 0.2 + inflate };
  return out;
}

const hbTmp = [];
// Raycast contre un joueur. Renvoie {t, g} ou null.
export function rayPlayer(ox, oy, oz, dx, dy, dz, maxT, px, py, pz, crouch, inflate = 0) {
  const boxes = playerHitboxes(px, py, pz, crouch, inflate, hbTmp);
  let best = Infinity, g = -1;
  for (const b of boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b, maxT, null);
    if (t < best) { best = t; g = b.g; }
  }
  return best < Infinity ? { t: best, g } : null;
}

export const HIT_MULT = [4, 1, 0.75];
export const HIT_NAMES = ['tête', 'torse', 'jambes'];
