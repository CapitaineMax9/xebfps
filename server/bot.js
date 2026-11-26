// Intelligence artificielle des bots (côté serveur).
import { WEAPONS, currentSpread, spreadDir, dirFromAngles, weaponSpeed } from '../shared/weapons.js';
import { stepBody, eyeHeight } from '../shared/physics.js';
import { lineOfSight } from '../shared/raycast.js';
import { PLAYER } from '../shared/constants.js';

export const BOT_NAMES = ['Lucas', 'Hugo', 'Léa', 'Inès', 'Nathan', 'Jade', 'Enzo', 'Chloé', 'Sacha', 'Malo', 'Zoé', 'Noah', 'Lina', 'Tom', 'Rayan', 'Manon'];

const DIFF = {
  easy:   { react: 0.6,  noise: 0.06,  turn: 4.5, fovCos: Math.cos(1.0), head: 0.12, tol: 0.06, counter: 0.3, burst: [2, 4] },
  normal: { react: 0.38, noise: 0.032, turn: 7.5, fovCos: Math.cos(1.1), head: 0.28, tol: 0.04, counter: 0.6, burst: [3, 6] },
  hard:   { react: 0.24, noise: 0.016, turn: 11,  fovCos: Math.cos(1.25), head: 0.45, tol: 0.03, counter: 0.9, burst: [4, 8] },
};

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class BotBrain {
  constructor(room, player, difficulty) {
    this.room = room;
    this.p = player;
    this.cfg = DIFF[difficulty] || DIFF.normal;
    this.reset();
  }

  reset() {
    this.path = null; this.pathIdx = 0; this.goal = null;
    this.target = null; this.visible = false; this.reactAt = 0;
    this.lastSeen = null; this.lastSeenUntil = 0;
    this.senseT = 0;
    this.strafe = 1; this.strafeUntil = 0;
    this.noiseYaw = 0; this.noisePitch = 0; this.noiseUntil = 0;
    this.ammo = 0; this.ammoW = null; this.reloadUntil = 0; this.nextFire = 0;
    this.burst = 0; this.burstMax = 4; this.burstPauseUntil = 0;
    this.shotAccum = 0;
    this.stuckT = 0; this.stuckX = 0; this.stuckZ = 0; this.stuckCount = 0;
    this.jumpWant = false;
    this.scopeAt = 0;
    this.aimHead = false;
    this.crouchSpray = false;
  }

  onSpawn() {
    this.reset();
    this.crouchSpray = Math.random() < 0.3;
    this.stuckX = this.p.body.x; this.stuckZ = this.p.body.z;
  }

  onDamaged(attacker) {
    if (!attacker || attacker === this.p) return;
    // se retourne vers l'attaquant
    if (!this.target || !this.visible) {
      this.lastSeen = [attacker.body.x, attacker.body.z];
      this.lastSeenUntil = performance.now() + 3000;
      const dx = attacker.body.x - this.p.body.x, dz = attacker.body.z - this.p.body.z;
      this.lookYaw = Math.atan2(-dx, -dz);
      this.path = null;
    }
  }

  sense(t) {
    const p = this.p, b = p.body, room = this.room;
    if (p.blindUntil && t < p.blindUntil) { this.visible = false; this.target = null; return; }
    const boxes = room.map.boxes;
    const ex = b.x, ey = p.eye(), ez = b.z;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bd = Infinity;
    for (const q of room.enemiesOf(p)) {
      const dx = q.body.x - ex, dz = q.body.z - ez;
      const dist = Math.hypot(dx, dz);
      if (dist > 95) continue;
      const qw = WEAPONS[q.cur];
      const heard = t - q.lastFired < 1200 && dist < (qw && qw.silenced ? 12 : 45);
      const dot = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
      if (dot < this.cfg.fovCos && dist > 3 && !heard) continue;
      const h = q.body.crouch ? PLAYER.crouchHeight : PLAYER.height;
      const vis = (lineOfSight(boxes, ex, ey, ez, q.body.x, q.body.y + h - 0.15, q.body.z) ||
                  lineOfSight(boxes, ex, ey, ez, q.body.x, q.body.y + h * 0.6, q.body.z)) &&
                  !(room.smokes.length && room.smokeBlocks(ex, ey, ez, q.body.x, q.body.y + h * 0.6, q.body.z));
      if (!vis) {
        if (heard && (!this.lastSeen || t > this.lastSeenUntil)) {
          this.lastSeen = [q.body.x, q.body.z];
          this.lastSeenUntil = t + 4000;
          this.path = null;
        }
        continue;
      }
      if (dot < this.cfg.fovCos && dist > 3) {
        // entendu et visible mais derrière : on se retourne, pas encore de tir
        this.lookYaw = Math.atan2(-dx, -dz);
        continue;
      }
      if (dist < bd) { bd = dist; best = q; }
    }
    if (best) {
      if (best !== this.target || !this.visible) {
        this.reactAt = t + this.cfg.react * 1000 * (0.75 + Math.random() * 0.5);
        this.aimHead = Math.random() < this.cfg.head;
      }
      this.target = best;
      this.visible = true;
      this.lastSeen = [best.body.x, best.body.z];
      this.lastSeenUntil = t + 4000;
    } else {
      this.visible = false;
    }
  }

  turnToward(yaw, pitch, dt, mult = 1) {
    const p = this.p;
    const maxT = this.cfg.turn * dt * mult;
    const dy = wrap(yaw - p.yaw);
    p.yaw = wrap(p.yaw + Math.max(-maxT, Math.min(maxT, dy)));
    const dp = pitch - p.pitch;
    p.pitch += Math.max(-maxT, Math.min(maxT, dp));
    return Math.hypot(wrap(yaw - p.yaw), pitch - p.pitch);
  }

  update(dt, t) {
    const p = this.p, b = p.body, room = this.room;
    const boxes = room.map.boxes;
    const input = { wx: 0, wz: 0, jump: false, crouch: false, walk: false };

    // arme courante
    p.cur = p.weapons[0];
    const w = WEAPONS[p.cur];
    if (this.ammoW !== p.cur) { this.ammoW = p.cur; this.ammo = w.mag || 0; this.reloadUntil = 0; }
    if (this.reloadUntil && t >= this.reloadUntil) { this.reloadUntil = 0; this.ammo = w.mag; }
    this.shotAccum *= Math.exp(-(w.spread ? w.spread.recover : 5) * dt);

    this.senseT -= dt;
    if (this.senseT <= 0) { this.senseT = 0.1 + Math.random() * 0.08; this.sense(t); }

    const tgt = this.target && this.target.alive && this.visible ? this.target : null;
    let wantFire = false;

    if (tgt) {
      const qb = tgt.body;
      const h = qb.crouch ? PLAYER.crouchHeight : PLAYER.height;
      const aimY = qb.y + (this.aimHead ? h - 0.16 : h * 0.62);
      const ex = b.x, ey = p.eye(), ez = b.z;
      const dx = qb.x - ex, dy = aimY - ey, dz = qb.z - ez;
      const hd = Math.hypot(dx, dz);
      if (t > this.noiseUntil) {
        this.noiseUntil = t + 250 + Math.random() * 400;
        const n = this.cfg.noise * (w.kind === 'sniper' ? 0.6 : 1);
        this.noiseYaw = (Math.random() - 0.5) * 2 * n;
        this.noisePitch = (Math.random() - 0.5) * 2 * n * 0.6;
      }
      // l'erreur de visée diminue avec le temps d'engagement
      const settle = Math.min(1, Math.max(0.25, (this.reactAt + 600 - t) / 600));
      const dYaw = Math.atan2(-dx, -dz) + this.noiseYaw * settle;
      const dPitch = Math.atan2(dy, hd) + this.noisePitch * settle;
      const err = this.turnToward(dYaw, dPitch, dt, 1.4);
      const tol = this.cfg.tol + Math.min(0.08, 0.6 / Math.max(hd, 1)) + (w.kind === 'shotgun' ? 0.05 : 0);

      if (w.kind === 'knife') {
        // fonce sur la cible
        input.wx = dx; input.wz = dz;
        if (hd > 4 && Math.random() < 0.01) input.jump = true;
        if (hd < 1.7 && t >= this.nextFire && t >= this.reactAt) {
          const heavy = Math.random() < 0.4;
          this.nextFire = t + (heavy ? w.heavyDelay : w.fireDelay) * 1000 + 100;
          room.knife(p, heavy, [b.x, ey, b.z], dirFromAngles(p.yaw, p.pitch), t, p.cur);
        }
      } else if (w.kind === 'sniper') {
        // s'arrête, zoome, tire
        if (t >= this.scopeAt && !this.reloadUntil) p.scoped = true;
        if (!p.scoped) {
          if (t > this.strafeUntil) { this.strafe = -this.strafe; this.strafeUntil = t + 300 + Math.random() * 500; }
          const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
          input.wx = rx * this.strafe; input.wz = rz * this.strafe;
          input.walk = true;
        }
        if (p.scoped && err < tol * 0.8 && t >= this.reactAt + 120) wantFire = true;
      } else {
        // strafe gauche/droite
        if (t > this.strafeUntil) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeUntil = t + 350 + Math.random() * 600; }
        const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
        const aboutToShoot = err < tol * 1.5 && t >= this.reactAt;
        const stop = aboutToShoot && Math.random() < this.cfg.counter;
        if (!stop) { input.wx = rx * this.strafe; input.wz = rz * this.strafe; }
        if (w.kind === 'shotgun' && hd > 8) { input.wx += dx / hd; input.wz += dz / hd; }
        if (w.kind === 'smg' && hd > 18) { input.wx += dx / hd * 0.7; input.wz += dz / hd * 0.7; }
        if (this.crouchSpray && this.burst > 2) input.crouch = true;
        if (err < tol && t >= this.reactAt && t >= this.burstPauseUntil) wantFire = true;
        // pas de roquette à bout portant (le bot se ferait exploser)
        if (w.projectile && w.projectile.splash && hd < 6) { wantFire = false; input.wx -= dx / hd; input.wz -= dz / hd; }
      }
    } else {
      p.scoped = false;
      // recherche / déplacement
      let goalX, goalZ;
      if (this.lastSeen && t < this.lastSeenUntil) { goalX = this.lastSeen[0]; goalZ = this.lastSeen[1]; }
      if (goalX !== undefined && (!this.goal || Math.hypot(this.goal[0] - goalX, this.goal[1] - goalZ) > 3)) {
        this.setGoal(goalX, goalZ);
      }
      if (!this.path || this.pathIdx >= this.path.length) {
        if (this.lastSeen && t < this.lastSeenUntil && Math.hypot(b.x - this.lastSeen[0], b.z - this.lastSeen[1]) < 2) {
          this.lastSeen = null;
        }
        this.pickGoal();
      }
      if (this.path && this.pathIdx < this.path.length) {
        const [tx, tz] = this.path[this.pathIdx];
        const dx = tx - b.x, dz = tz - b.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) this.pathIdx++;
        else { input.wx = dx; input.wz = dz; }
        // regarde dans la direction du déplacement (ou vers un bruit)
        let ly = this.lookYaw !== undefined ? this.lookYaw : Math.atan2(-dx, -dz);
        if (this.lookYaw !== undefined && Math.abs(wrap(ly - p.yaw)) < 0.1) this.lookYaw = undefined;
        this.turnToward(ly, 0, dt, 0.6);
      }
      // recharge pendant les déplacements
      if (this.ammo < (w.mag || 0) * 0.5 && !this.reloadUntil && w.mag) this.startReload(t, w);
    }

    if (wantFire) this.fire(t, w);

    // anti-blocage
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      const moved = Math.hypot(b.x - this.stuckX, b.z - this.stuckZ);
      const trying = Math.hypot(input.wx, input.wz) > 0.1 && !tgt;
      if (trying && moved < 0.35) {
        this.stuckCount++;
        this.jumpWant = true;
        if (this.stuckCount > 2) { this.path = null; this.goal = null; this.stuckCount = 0; }
      } else this.stuckCount = 0;
      this.stuckT = 0; this.stuckX = b.x; this.stuckZ = b.z;
    }
    if (this.jumpWant && b.onGround) { input.jump = true; this.jumpWant = false; }

    stepBody(b, input, dt, boxes, weaponSpeed(p.cur, p.scoped) * (p.slowUntil && t < p.slowUntil ? p.slowMul : 1));
    if (b.y < -10) { room.damage(p, p, 999, 'knife', false, {}); }
  }

  startReload(t, w) {
    this.reloadUntil = t + (w.shellReload ? w.reload * (w.mag - this.ammo) : w.reload) * 1000;
    p_scopedOff(this.p);
    this.room.broadcast({ t: 'rl', id: this.p.id });
  }

  fire(t, w) {
    const p = this.p, b = p.body;
    if (this.reloadUntil) return;
    if (t < this.nextFire) return;
    if (this.ammo <= 0) { this.startReload(t, w); return; }
    const semi = !w.auto;
    this.nextFire = t + w.fireDelay * 1000 + (semi ? 60 + Math.random() * 160 : 0);
    this.ammo--;
    const speedRatio = Math.hypot(b.vx, b.vz) / Math.max(1, w.speed);
    let spread = currentSpread(w, { speedRatio, onGround: b.onGround, crouch: b.crouch, scoped: p.scoped, shotAccum: this.shotAccum });
    spread += (w.recoil ? w.recoil.v : 0) * Math.min(this.burst, 8) * 0.35;
    this.shotAccum += w.spread ? w.spread.shot : 0;
    this.burst++;
    if (w.auto && this.burst >= this.burstMax) {
      this.burst = 0;
      this.burstMax = this.cfg.burst[0] + Math.floor(Math.random() * (this.cfg.burst[1] - this.cfg.burst[0] + 1));
      this.burstPauseUntil = t + 220 + Math.random() * 250;
    }
    if (!w.auto) this.burst = 0;
    const dir = dirFromAngles(p.yaw, p.pitch);
    const dirs = [];
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) dirs.push(spreadDir(dir[0], dir[1], dir[2], spread + (w.pelletSpread || 0)));
    p.lastShot[p.cur] = t;
    this.room.fire(p, p.cur, [b.x, b.y + eyeHeight(b), b.z], dirs, t, p.scoped);
    if (w.kind === 'sniper') { p.scoped = false; this.scopeAt = t + w.fireDelay * 1000; }
  }

  setGoal(x, z) {
    const b = this.p.body;
    this.goal = [x, z];
    this.path = this.room.nav.findPath(b.x, b.z, x, z);
    this.pathIdx = 0;
  }

  pickGoal() {
    const nav = this.room.nav, b = this.p.body;
    const k = nav.nearest(b.x, b.z);
    const comp = k >= 0 ? nav.comp[k] : -1;
    // Battle Royale : rejoindre la zone quand on est dehors ou au bord
    const z = this.room.zone;
    if (z && this.room.cfg.br) {
      const d = Math.hypot(b.x - z.cx, b.z - z.cz);
      if (d > z.r - 3) {
        const ang = Math.random() * Math.PI * 2, rr = z.r * 0.5;
        this.setGoal(z.cx + Math.cos(ang) * rr, z.cz + Math.sin(ang) * rr);
        if (this.path) return;
      }
    }
    let gx, gz;
    const enemies = this.room.enemiesOf(this.p);
    if (enemies.length && Math.random() < 0.45) {
      const e = enemies[Math.floor(Math.random() * enemies.length)];
      gx = e.body.x + (Math.random() - 0.5) * 6; gz = e.body.z + (Math.random() - 0.5) * 6;
    } else {
      const n = nav.randomNode(comp);
      [gx, gz] = nav.center(n);
    }
    this.setGoal(gx, gz);
    if (!this.path) {
      const n = nav.randomNode(comp);
      const [x, z] = nav.center(n);
      this.setGoal(x, z);
    }
  }
}

function p_scopedOff(p) { p.scoped = false; }
