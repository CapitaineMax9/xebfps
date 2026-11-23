// Physique de déplacement partagée (client pour le joueur local, serveur pour les bots).
// Les boîtes de collision sont des AABB : {x0,y0,z0,x1,y1,z1}.
import { PLAYER, PHYS } from './constants.js';

const EPS = 1e-4;

export function createBody(x = 0, y = 0, z = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, crouch: false, crouchT: 0 };
}

export function bodyHeight(b) {
  return b.crouch ? PLAYER.crouchHeight : PLAYER.height;
}

// Hauteur des yeux lissée (crouchT passe de 0 à 1 progressivement)
export function eyeHeight(b) {
  return PLAYER.eye + (PLAYER.crouchEye - PLAYER.eye) * b.crouchT;
}

export function collides(boxes, x, y, z, h) {
  const hw = PLAYER.halfWidth;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x + hw > b.x0 && x - hw < b.x1 && y + h > b.y0 && y < b.y1 && z + hw > b.z0 && z - hw < b.z1) return b;
  }
  return null;
}

function collidingList(boxes, x, y, z, h, out) {
  out.length = 0;
  const hw = PLAYER.halfWidth;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x + hw > b.x0 && x - hw < b.x1 && y + h > b.y0 && y < b.y1 && z + hw > b.z0 && z - hw < b.z1) out.push(b);
  }
  return out;
}

const tmpList = [];

function accelerate(b, dx, dz, wishCap, wishFull, accel, dt) {
  const cur = b.vx * dx + b.vz * dz;
  const add = wishCap - cur;
  if (add <= 0) return;
  let a = accel * wishFull * dt;
  if (a > add) a = add;
  b.vx += a * dx;
  b.vz += a * dz;
}

function moveHorizontal(b, axis, d, h, boxes, canStep) {
  if (d === 0) return;
  const nx = axis === 0 ? b.x + d : b.x;
  const nz = axis === 1 ? b.z + d : b.z;
  const hits = collidingList(boxes, nx, b.y, nz, h, tmpList);
  if (hits.length === 0) { b.x = nx; b.z = nz; return; }

  // Tentative de monter une marche
  if (canStep) {
    let top = -Infinity;
    for (const hb of hits) if (hb.y1 > top) top = hb.y1;
    if (top - b.y <= PHYS.stepHeight && top > b.y && !collides(boxes, nx, top + EPS, nz, h)) {
      b.y = top + EPS;
      b.x = nx; b.z = nz;
      if (b.vy < 0) b.vy = 0;
      return;
    }
  }

  // Bloqué : on se colle contre l'obstacle le plus proche
  const hw = PLAYER.halfWidth;
  if (axis === 0) {
    let lim = nx;
    for (const hb of hits) {
      if (d > 0) lim = Math.min(lim, hb.x0 - hw - EPS); else lim = Math.max(lim, hb.x1 + hw + EPS);
    }
    if (d > 0) lim = Math.max(lim, b.x); else lim = Math.min(lim, b.x);
    if (!collides(boxes, lim, b.y, b.z, h)) b.x = lim;
    b.vx = 0;
  } else {
    let lim = nz;
    for (const hb of hits) {
      if (d > 0) lim = Math.min(lim, hb.z0 - hw - EPS); else lim = Math.max(lim, hb.z1 + hw + EPS);
    }
    if (d > 0) lim = Math.max(lim, b.z); else lim = Math.min(lim, b.z);
    if (!collides(boxes, b.x, b.y, lim, h)) b.z = lim;
    b.vz = 0;
  }
}

function moveVertical(b, d, h, boxes) {
  if (d === 0) return;
  const ny = b.y + d;
  const hits = collidingList(boxes, b.x, ny, b.z, h, tmpList);
  if (hits.length === 0) { b.y = ny; return; }
  if (d < 0) {
    let top = -Infinity;
    for (const hb of hits) if (hb.y1 > top) top = hb.y1;
    b.y = Math.min(b.y, top + EPS);
    b.vy = 0;
    b.onGround = true;
  } else {
    let bottom = Infinity;
    for (const hb of hits) if (hb.y0 < bottom) bottom = hb.y0;
    b.y = Math.max(b.y, bottom - h - EPS);
    b.vy = 0;
  }
}

/**
 * Avance le corps d'un pas de temps.
 * input: { wx, wz : direction souhaitée dans le monde (pas forcément normalisée),
 *          jump, crouch, walk : booléens }
 * maxSpeed : vitesse max (dépend de l'arme)
 */
export function stepBody(b, input, dt, boxes, maxSpeed) {
  if (dt <= 0) return;
  // Accroupi
  if (input.crouch) {
    b.crouch = true;
  } else if (b.crouch) {
    if (!collides(boxes, b.x, b.y, b.z, PLAYER.height)) b.crouch = false;
  }
  const target = b.crouch ? 1 : 0;
  const cs = 8 * dt;
  b.crouchT += Math.max(-cs, Math.min(cs, target - b.crouchT));

  let speed = maxSpeed;
  if (b.crouch && b.onGround) speed *= PHYS.crouchMult;
  else if (input.walk) speed *= PHYS.walkMult;

  let wx = input.wx || 0, wz = input.wz || 0;
  const wl = Math.hypot(wx, wz);
  if (wl > 1e-6) { wx /= wl; wz /= wl; } else { wx = 0; wz = 0; }
  const wish = wl > 1e-6 ? speed : 0;

  const wasOnGround = b.onGround;
  if (b.onGround) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const drop = Math.max(sp, PHYS.stopSpeed) * PHYS.friction * dt;
      const ns = Math.max(0, sp - drop);
      b.vx *= ns / sp; b.vz *= ns / sp;
    }
    accelerate(b, wx, wz, wish, wish, PHYS.groundAccel, dt);
    if (input.jump) {
      b.vy = PHYS.jumpVel;
      b.onGround = false;
    }
  } else {
    accelerate(b, wx, wz, Math.min(wish, PHYS.airWishCap), wish, PHYS.airAccel, dt);
  }

  b.vy -= PHYS.gravity * dt;
  if (b.vy < -PHYS.maxFall) b.vy = -PHYS.maxFall;

  const h = bodyHeight(b);
  const dx = b.vx * dt, dy = b.vy * dt, dz = b.vz * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.15));
  const canStep = wasOnGround || b.onGround;
  b.onGround = false;
  for (let i = 0; i < steps; i++) {
    moveHorizontal(b, 0, dx / steps, h, boxes, canStep);
    moveHorizontal(b, 1, dz / steps, h, boxes, canStep);
    moveVertical(b, dy / steps, h, boxes);
  }

  // Détection du sol + accroche aux marches descendantes
  if (b.vy <= 0) {
    if (collides(boxes, b.x, b.y - 0.03, b.z, h)) {
      b.onGround = true;
      if (b.vy < 0) b.vy = 0;
    } else if (wasOnGround && !input.jump) {
      // descente de marche : on cherche un sol à moins de stepHeight
      const hits = collidingList(boxes, b.x, b.y - PHYS.stepHeight, b.z, h, tmpList);
      if (hits.length) {
        let top = -Infinity;
        for (const hb of hits) if (hb.y1 > top && hb.y1 <= b.y + EPS) top = hb.y1;
        if (top > -Infinity && !collides(boxes, b.x, top + EPS, b.z, h)) {
          b.y = top + EPS;
          b.vy = 0;
          b.onGround = true;
        }
      }
    }
  }
}

// Direction de déplacement à partir des touches et du yaw (caméra regardant -Z à yaw=0)
export function wishFromKeys(yaw, fwd, side) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  // avant = (-sin, -cos), droite = (cos, -sin)
  return { wx: -s * fwd + c * side, wz: -c * fwd - s * side };
}
