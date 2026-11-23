// Effets : traçantes, impacts, particules, flash de bouche.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
    this.decals = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
    this.tracerGeo.translate(0, 0, 0.5); // lookAt oriente +Z vers la cible

    this.decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
    const dc = document.createElement('canvas'); dc.width = dc.height = 64;
    const dctx = dc.getContext('2d');
    const g = dctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(10,8,6,1)'); g.addColorStop(0.35, 'rgba(30,25,20,0.9)'); g.addColorStop(1, 'rgba(30,25,20,0)');
    dctx.fillStyle = g; dctx.fillRect(0, 0, 64, 64);
    const dtex = new THREE.CanvasTexture(dc);
    this.decalMat = new THREE.MeshBasicMaterial({ map: dtex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });

    const pc = document.createElement('canvas'); pc.width = pc.height = 32;
    const pctx = pc.getContext('2d');
    const pg = pctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    pg.addColorStop(0, 'rgba(255,255,255,1)'); pg.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = pg; pctx.fillRect(0, 0, 32, 32);
    this.particleTex = new THREE.CanvasTexture(pc);

    // flash de bouche
    const fc = document.createElement('canvas'); fc.width = fc.height = 64;
    const fctx = fc.getContext('2d');
    const fg = fctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    fg.addColorStop(0, 'rgba(255,255,230,1)'); fg.addColorStop(0.3, 'rgba(255,200,90,0.9)'); fg.addColorStop(1, 'rgba(255,120,20,0)');
    fctx.fillStyle = fg; fctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 6; i++) { fctx.strokeStyle = 'rgba(255,220,140,0.8)'; fctx.lineWidth = 3; fctx.beginPath(); fctx.moveTo(32, 32); const a = i / 6 * Math.PI * 2; fctx.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); fctx.stroke(); }
    this.flashTex = new THREE.CanvasTexture(fc);
    this.flashMat = new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

    this.light = new THREE.PointLight(0xffc070, 0, 8, 2);
    scene.add(this.light);
    this.lightT = 0;
  }

  tracer(from, to, speed = 300) {
    const d = to.clone().sub(from);
    const len = d.length();
    if (len < 1.5) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    m.position.copy(from);
    m.lookAt(to);
    const segLen = Math.min(len, 6);
    m.scale.set(1, 1, segLen);
    this.group.add(m);
    this.tracers.push({ m, from: from.clone(), dir: d.normalize(), len, t: 0, speed, segLen });
  }

  decal(pos, normal) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat);
    m.position.copy(pos).addScaledVector(normal, 0.01);
    m.lookAt(pos.clone().add(normal));
    m.rotateZ(Math.random() * 6.28);
    const s = 0.7 + Math.random() * 0.6;
    m.scale.set(s, s, s);
    this.group.add(m);
    this.decals.push(m);
    if (this.decals.length > 120) { const old = this.decals.shift(); this.group.remove(old); }
  }

  burst(pos, normal, color, count = 8, speed = 2.5, size = 0.06, life = 0.5, gravity = 6) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.particleTex, color, transparent: true, depthWrite: false, blending: color === 0xffcc66 ? THREE.AdditiveBlending : THREE.NormalBlending });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos);
      const sz = size * (0.6 + Math.random() * 0.8);
      s.scale.set(sz, sz, sz);
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(speed);
      if (normal) v.addScaledVector(normal, speed * 0.8);
      this.group.add(s);
      this.particles.push({ s, v, t: 0, life: life * (0.6 + Math.random() * 0.8), g: gravity, sz });
    }
  }

  impact(pos, normal) {
    this.decal(pos, normal);
    this.burst(pos, normal, 0xbba98a, 6, 1.8, 0.08, 0.6, 5);
    this.burst(pos, normal, 0xffcc66, 3, 4, 0.03, 0.15, 0);
  }

  blood(pos, dir, headshot) {
    this.burst(pos, dir ? dir.clone().multiplyScalar(-0.3) : null, 0x9a0b0b, headshot ? 16 : 8, headshot ? 3 : 2, headshot ? 0.12 : 0.09, 0.5, 8);
  }

  muzzleFlash(worldPos, scale = 1) {
    const s = new THREE.Sprite(this.flashMat);
    s.position.copy(worldPos);
    const sz = (0.25 + Math.random() * 0.15) * scale;
    s.scale.set(sz, sz, sz);
    s.material.rotation = Math.random() * 6.28;
    this.group.add(s);
    this.particles.push({ s, v: new THREE.Vector3(), t: 0, life: 0.05, g: 0, sz, flash: true });
    this.light.position.copy(worldPos);
    this.light.intensity = 6 * scale;
    this.lightT = 0.05;
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt;
      const head = Math.min(tr.len, tr.t * tr.speed);
      const tail = Math.max(0, head - tr.segLen);
      tr.m.position.copy(tr.from).addScaledVector(tr.dir, tail);
      tr.m.scale.z = Math.max(0.01, head - tail);
      if (tail >= tr.len - 0.01 || tr.t > 1) { this.group.remove(tr.m); this.tracers.splice(i, 1); }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt;
      if (p.t >= p.life) { this.group.remove(p.s); if (!p.flash) p.s.material.dispose(); this.particles.splice(i, 1); continue; }
      p.v.y -= p.g * dt;
      p.s.position.addScaledVector(p.v, dt);
      if (!p.flash) p.s.material.opacity = 1 - p.t / p.life;
    }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) this.light.intensity = 0; }
  }

  clear() {
    for (const t of this.tracers) this.group.remove(t.m);
    for (const p of this.particles) this.group.remove(p.s);
    for (const d of this.decals) this.group.remove(d);
    this.tracers = []; this.particles = []; this.decals = [];
  }
}
