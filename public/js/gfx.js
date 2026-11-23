// Chaîne de rendu : post-traitement (AO, bloom, étalonnage) selon la qualité choisie.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// maxDpr : résolution de rendu maximale (1 = résolution de l'écran, 0.75 = 75 %)
// shadows : taille de la carte d'ombres (0 = pas d'ombres) ; shadowEvery : ombres recalculées 1 image sur N
export const GFX_PRESETS = {
  low: { label: 'Bas', post: false, ao: 0, bloom: false, samples: 0, maxDpr: 0.75, dust: false, shadows: 0, shadowEvery: 1, avatarShadows: false, decor: 'low' },
  medium: { label: 'Moyen', post: false, ao: 0, bloom: false, samples: 0, maxDpr: 1, dust: true, shadows: 1024, shadowEvery: 2, avatarShadows: false, decor: 'medium' },
  high: { label: 'Élevé', post: true, ao: 0, bloom: true, samples: 4, maxDpr: 1, dust: true, shadows: 2048, shadowEvery: 1, avatarShadows: true, decor: 'high' },
  ultra: { label: 'Ultra', post: true, ao: 0.5, bloom: true, samples: 4, maxDpr: 1.5, dust: true, shadows: 4096, shadowEvery: 1, avatarShadows: true, decor: 'high' },
};
export const GFX_LEVELS = ['low', 'medium', 'high', 'ultra'];

// Étalonnage final : contraste, saturation, teinte chaude, vignette, léger grain
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 },
    contrast: { value: 1.08 }, saturation: { value: 1.05 }, tint: { value: new THREE.Vector3(1.02, 1.0, 0.97) }, vignette: { value: 0.32 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, contrast, saturation, vignette; uniform vec3 tint; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * tint;
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      vec2 d = vUv - 0.5;
      col *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d) * 1.25);
      col += (rand(vUv * 1000.0 + time) - 0.5) * 0.012;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export class Pipeline {
  constructor(renderer, scene, camera, vmScene, vmCamera) {
    Object.assign(this, { renderer, scene, camera, vmScene, vmCamera });
    this.preset = null;
    this.composer = null;
    this.dust = makeDust();
    scene.add(this.dust);
  }

  setQuality(name, w, h) {
    const p = GFX_PRESETS[name] || GFX_PRESETS.high;
    this.preset = p;
    this.name = name;
    const r = this.renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, p.maxDpr);
    r.setPixelRatio(dpr);
    r.setSize(w, h, false);
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    this.dust.visible = p.dust;
    if (!p.post) return;
    const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType, samples: p.samples });
    const c = new EffectComposer(r, rt);
    c.setPixelRatio(dpr);
    c.setSize(w, h);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (p.ao) {
      const ao = new GTAOPass(this.scene, this.camera, w * dpr * p.ao, h * dpr * p.ao);
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      ao.blendIntensity = 0.85;
      // les sprites, le ciel et les effets ne doivent pas produire d'occlusion
      const orig = ao.overrideVisibility.bind(ao);
      ao.overrideVisibility = function () {
        orig();
        this.scene.traverse((o) => { if (o.isSprite || (o.userData && o.userData.noAO)) o.visible = false; });
      };
      const scale = p.ao;
      ao.setSize = function (W, H) { GTAOPass.prototype.setSize.call(this, Math.max(1, Math.floor(W * scale)), Math.max(1, Math.floor(H * scale))); };
      c.addPass(ao);
      this.ao = ao;
    } else this.ao = null;
    const vm = new RenderPass(this.vmScene, this.vmCamera);
    vm.clear = false;
    vm.clearDepth = true;
    c.addPass(vm);
    this.vmPass = vm;
    if (p.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.45, 0.5, 1.5);
      c.addPass(bloom);
    }
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    this.composer = c;
  }

  setSize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.preset.maxDpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(w, h); }
  }

  render(showVm, dt) {
    updateDust(this.dust, this.camera, dt);
    const r = this.renderer;
    // ombres recalculées moins souvent sur les qualités basses
    this.frame = (this.frame || 0) + 1;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = this.frame % (this.preset.shadowEvery || 1) === 0;
    if (!this.composer) {
      r.autoClear = false;
      r.clear();
      r.render(this.scene, this.camera);
      if (showVm) { r.clearDepth(); r.render(this.vmScene, this.vmCamera); }
      return;
    }
    this.vmPass.enabled = showVm;
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt) % 100;
    this.composer.render(dt);
  }
}

// ── Poussière en suspension autour du joueur ─────────────────────────────
const DUST_N = 600, DUST_R = 18;
function makeDust() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(DUST_N * 3);
  const seed = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N * 3; i++) { seed[i] = Math.random(); pos[i] = 0; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData.seed = seed;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,245,220,1)'); g.addColorStop(1, 'rgba(255,245,220,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({ size: 0.05, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.noAO = true;
  pts.userData.t = 0;
  return pts;
}

function updateDust(pts, cam, dt) {
  if (!pts.visible) return;
  pts.userData.t += dt || 0;
  const t = pts.userData.t;
  const pos = pts.geometry.attributes.position.array;
  const s = pts.geometry.userData.seed;
  const D = DUST_R * 2;
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  for (let i = 0; i < DUST_N; i++) {
    const k = i * 3;
    // dérive lente + enroulement autour de la caméra
    const x = s[k] * D + t * (0.15 + s[k + 1] * 0.2), y = s[k + 1] * 10 + Math.sin(t * 0.3 + s[k] * 20) * 0.4, z = s[k + 2] * D + t * 0.08;
    pos[k] = cx + (((x - cx) % D) + D) % D - DUST_R;
    pos[k + 1] = Math.max(0.05, cy - 2 + (((y) % 10) + 10) % 10 - 3);
    pos[k + 2] = cz + (((z - cz) % D) + D) % D - DUST_R;
  }
  pts.geometry.attributes.position.needsUpdate = true;
}
