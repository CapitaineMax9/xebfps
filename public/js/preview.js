// Rendu 3D hors-écran : miniatures des objets + aperçu interactif.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWeapon } from './models.js';
import { SKINS } from '/shared/skins.js';

let renderer = null, scene = null, camera = null, envTex = null;
const thumbCache = new Map();

function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 2);
  const rim = new THREE.DirectionalLight(0x9ac8ff, 1.2); rim.position.set(-3, 1, -2);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.4));
  camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.01, 20);
}

export function sharedEnv() { init(); return envTex; }

function framed(weaponId, item) {
  const g = buildWeapon(weaponId, item, { statTrak: true });
  // arme vue de profil, canon vers la gauche
  g.rotation.y = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(g);
  const box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  g.position.sub(c);
  const size = box.getSize(new THREE.Vector3());
  holder.userData.size = Math.max(size.x, size.y * 1.8, 0.2);
  return holder;
}

function placeCamera(size, aspect) {
  camera.aspect = aspect;
  const dist = (size / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(aspect, 1.9) * 1.25 + 0.1;
  camera.position.set(0, size * 0.08, dist);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

// Miniature (dataURL) d'un objet d'inventaire ou d'une arme par défaut
export function thumbnail(item, weaponId = null, w = 256, h = 150) {
  init();
  const wid = item ? SKINS[item.skin].weapon : weaponId;
  const key = (item ? `${item.skin}:${item.seed}:${Math.round(item.float * 20)}:${item.st ? 1 : 0}` : 'def:' + wid) + `:${w}x${h}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  renderer.setSize(w, h, false);
  const obj = framed(wid, item);
  obj.rotation.set(0.12, 0.25, 0.08);
  scene.add(obj);
  placeCamera(obj.userData.size, w / h);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  thumbCache.set(key, url);
  return url;
}

// Aperçu interactif dans un canvas (glisser pour tourner)
export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d');
    this.rotY = 0.4; this.rotX = 0.1;
    this.dragging = false;
    this.obj = null;
    this.raf = 0;
    this.auto = true;
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.auto = false; this.lx = e.clientX; this.ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.rotY += (e.clientX - this.lx) * 0.01; this.rotX += (e.clientY - this.ly) * 0.01;
      this.rotX = Math.max(-1.2, Math.min(1.2, this.rotX));
      this.lx = e.clientX; this.ly = e.clientY;
    });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.5, Math.min(1.6, (this.zoom || 1) * (e.deltaY > 0 ? 1.08 : 0.92))); }, { passive: false });
  }

  show(item, weaponId = null) {
    init();
    if (this.obj) scene.remove(this.obj);
    const wid = item ? SKINS[item.skin].weapon : weaponId;
    this.obj = framed(wid, item);
    this.rotY = 0.4; this.rotX = 0.1; this.auto = true; this.zoom = 1;
    if (!this.raf) this.loop();
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    if (!this.obj) return;
    const W = this.canvas.width, H = this.canvas.height;
    renderer.setSize(W, H, false);
    if (this.auto) this.rotY += 0.006;
    this.obj.rotation.set(this.rotX, this.rotY, 0);
    scene.add(this.obj);
    placeCamera(this.obj.userData.size * (this.zoom || 1), W / H);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    scene.remove(this.obj);
    this.ctx2d.clearRect(0, 0, W, H);
    this.ctx2d.drawImage(renderer.domElement, 0, 0, W, H);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.obj) this.obj = null;
  }
}
