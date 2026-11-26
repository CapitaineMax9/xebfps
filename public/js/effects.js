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

  tracer(from, to, speed = 300, color = null) {
    const d = to.clone().sub(from);
    const len = d.length();
    if (len < 1.5) return;
    const m = new THREE.Mesh(this.tracerGeo, color ? this.colorMat(color) : this.tracerMat);
    m.position.copy(from);
    m.lookAt(to);
    const segLen = Math.min(len, 6);
    m.scale.set(1, 1, segLen);
    this.group.add(m);
    this.tracers.push({ m, from: from.clone(), dir: d.normalize(), len, t: 0, speed, segLen });
  }

  colorMat(color) {
    this.mats = this.mats || new Map();
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    return this.mats.get(color);
  }

  // rayon du railgun : faisceau épais qui s'estompe
  beam(from, to, color = 0x40d8ff) {
    const d = to.clone().sub(from);
    const len = d.length();
    const geo = new THREE.CylinderGeometry(0.045, 0.045, len, 6, 1, true);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, len / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(geo, mat);
    core.position.copy(from); core.lookAt(to);
    const glow = core.clone(); glow.material = mat.clone(); glow.scale.set(4, 4, 1); glow.material.opacity = 0.35;
    this.group.add(core, glow);
    this.beams = this.beams || [];
    this.beams.push({ meshes: [core, glow], t: 0, life: 0.6 });
    for (let i = 0; i < 12; i++) this.burst(from.clone().lerp(to, Math.random()), null, color, 2, 0.8, 0.05, 0.6, 0);
  }

  // gerbe de confettis qui sort du canon
  confettiSpray(from, dir, count = 40) {
    const cols = [0xff3fa4, 0xffd23f, 0x22e0ff, 0x7a3cff, 0x3ff0a0, 0xff6a13];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.particleTex, color: cols[i % cols.length], transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.copy(from);
      const sz = 0.04 + Math.random() * 0.04;
      s.scale.set(sz, sz, sz);
      const v = dir.clone().multiplyScalar(8 + Math.random() * 10).add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.2) * 3, (Math.random() - 0.5) * 4));
      this.group.add(s);
      this.particles.push({ s, v, t: 0, life: 1.2 + Math.random() * 0.8, g: 5, sz });
    }
  }

  confetti(pos, normal, count = 10) {
    const cols = [0xff3fa4, 0xffd23f, 0x22e0ff, 0x7a3cff, 0x3ff0a0, 0xff6a13];
    for (let i = 0; i < count; i++) this.burst(pos, normal, cols[i % cols.length], 1, 3, 0.07, 1.4, 3);
  }

  explosion(pos) {
    // flash central
    const f = new THREE.Sprite(this.flashMat);
    f.position.copy(pos); f.scale.set(5, 5, 5);
    this.group.add(f);
    this.particles.push({ s: f, v: new THREE.Vector3(), t: 0, life: 0.14, g: 0, sz: 5, flash: true });
    this.burst(pos, null, 0xffcc66, 30, 8, 0.6, 0.7, 0);
    this.burst(pos, new THREE.Vector3(0, 0.6, 0), 0xff6a20, 24, 5, 0.9, 0.9, -1.5);
    this.burst(pos, new THREE.Vector3(0, 1, 0), 0x7a7068, 22, 2.5, 1.3, 2.4, -0.6);
    this.light.position.copy(pos); this.light.intensity = 60; this.light.distance = 18; this.lightT = 0.18;
    const scorch = new THREE.Mesh(this.decalGeo, this.decalMat);
    scorch.position.copy(pos).setY(Math.max(0.015, pos.y)); scorch.rotation.x = -Math.PI / 2; scorch.scale.set(22, 22, 22);
    this.group.add(scorch); this.decals.push(scorch);
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
      const mat = new THREE.SpriteMaterial({ map: this.particleTex, color, transparent: true, depthWrite: false, blending: color === 0xffcc66 || color === 0xff6a20 ? THREE.AdditiveBlending : THREE.NormalBlending });
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
    this.light.color.setHex(0xffc070);
    this.light.position.copy(worldPos);
    this.light.intensity = 6 * scale;
    this.lightT = 0.05;
  }

  // Éclat lumineux coloré au lancer d'un sort
  castFlash(worldPos, color = 0x9bd1ff) {
    const s = new THREE.Sprite(this.flashMat);
    s.position.copy(worldPos);
    const sz = 0.34;
    s.scale.set(sz, sz, sz);
    s.material.rotation = Math.random() * 6.28;
    this.group.add(s);
    this.particles.push({ s, v: new THREE.Vector3(), t: 0, life: 0.09, g: 0, sz, flash: true });
    this.light.color.setHex(color);
    this.light.position.copy(worldPos);
    this.light.intensity = 12;
    this.light.distance = 11;
    this.lightT = 0.14;
  }

  // Anneau de choc qui s'étend puis s'estompe (AoE, soin, bouclier, impacts)
  ring(pos, color = 0x9bd1ff, maxR = 1, life = 0.4) {
    const geo = new THREE.RingGeometry(0.4, 0.5, 28);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos); m.rotation.x = -Math.PI / 2;
    this.group.add(m);
    this.rings = this.rings || [];
    this.rings.push({ m, t: 0, life, maxR });
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
      if (p.g < 0) p.v.multiplyScalar(1 - dt * 1.5); // fumée : ralentit et monte
      p.s.position.addScaledVector(p.v, dt);
      if (p.g < 0) p.s.scale.setScalar(p.sz * (1 + p.t * 1.5));
      if (!p.flash) p.s.material.opacity = 1 - p.t / p.life;
    }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) { this.light.intensity = 0; this.light.distance = 8; } }
    if (this.rings) {
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.t += dt;
        const k = r.t / r.life;
        const s = 0.15 + k * r.maxR;
        r.m.scale.set(s, s, s);
        r.m.material.opacity = Math.max(0, 0.85 * (1 - k));
        if (r.t >= r.life) { this.group.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
      }
    }
    if (this.beams) {
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.t += dt;
        const k = 1 - b.t / b.life;
        b.meshes[0].material.opacity = Math.max(0, k);
        b.meshes[1].material.opacity = Math.max(0, k * 0.35);
        if (b.t >= b.life) { for (const m of b.meshes) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); } this.beams.splice(i, 1); }
      }
    }
  }

  clear() {
    for (const t of this.tracers) this.group.remove(t.m);
    for (const p of this.particles) this.group.remove(p.s);
    for (const d of this.decals) this.group.remove(d);
    if (this.rings) { for (const r of this.rings) { this.group.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); } this.rings = []; }
    this.tracers = []; this.particles = []; this.decals = [];
  }
}
