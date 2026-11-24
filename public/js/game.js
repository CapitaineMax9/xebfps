// Boucle de jeu côté client.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEAPONS, recoilOffset, currentSpread, spreadDir, dirFromAngles, weaponSpeed, PRIMARIES, SECONDARIES, MELEES } from '/shared/weapons.js';
import { MAPS } from '/shared/maps.js';
import { MODES, GUNGAME_LADDER } from '/shared/modes.js';
import { PLAYER, INTERP_DELAY, CLIENT_SEND_RATE, TEAM_NAMES, TEAM_COLORS } from '/shared/constants.js';
import { createBody, stepBody, wishFromKeys, eyeHeight } from '/shared/physics.js';
import { PHYS } from '/shared/constants.js';
import { raycastMap, rayPlayer, HIT_HEAD } from '/shared/raycast.js';
import { SKINS, itemFullName } from '/shared/skins.js';
import { buildWorld, disposeWorld } from './world.js';
import { buildWeapon, buildArms, buildAvatar, poseAvatar, buildProjectile } from './models.js';
import { Effects } from './effects.js';
import { Pipeline, GFX_PRESETS, GFX_LEVELS } from './gfx.js';
import { X, codeTyped, panelEl, allowed, resync } from './x.js';

// ── Qualité graphique « Auto » : s'adapte aux FPS réels ────────────────────
const AUTO_KEY = 'xebfps_autolevel';
let autoLevel = (() => { try { const v = localStorage.getItem(AUTO_KEY); return GFX_LEVELS.includes(v) ? v : 'medium'; } catch { return 'medium'; } })();
let autoCeiling = 'high';
function gfxLevel() { const g = P.profile().settings.gfx; return g === 'auto' || !GFX_PRESETS[g] ? autoLevel : g; }
function worldSettings() { return { ...P.profile().settings, gfx: gfxLevel() }; }
import * as A from './audio.js';
import { hud, drawRadar, renderBoard, esc } from './hud.js';
import { send, on, serverNow, dispatch } from './net.js';
import * as P from './profile.js';

const WEAPON_IDS = Object.keys(WEAPONS);
const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const OUTFIT_COLORS = ['#5aa9ff', '#ffb347', '#c06bff', '#5be08a', '#ff6a6a', '#dddddd'];

// hFOV (sur une base 4:3, comme les FPS tactiques) -> vFOV
const vfovFrom = (h) => 2 * Math.atan(Math.tan(h * DEG / 2) * 3 / 4) / DEG;

// ════════════════════════════════════════════════════════════════════════
// État
// ════════════════════════════════════════════════════════════════════════
const S = {
  active: false,
  canvas: null, renderer: null, scene: null, camera: null,
  vmScene: null, vmCamera: null, env: null,
  world: null, map: null, mapId: null, mode: 'ffa', cfg: MODES.ffa,
  effects: null,
  players: new Map(),
  me: null,
  matchEnd: 0, state: 'playing', teamScore: [0, 0],
  board: [],
  keys: new Set(),
  mouse: { left: false, right: false },
  ui: null,                 // null | 'pause' | 'loadout' | 'chat'
  locked: false,
  sendAcc: 0,
  hudAcc: 0,
  fpsAcc: 0, fpsN: 0,
  last: 0,
  vm: null,
  jumpQueued: 0,
  killer: null,
  deathPos: null,
  tabHeld: false,
  endData: null,
  onExit: null,
};

function settings() { return P.profile().settings; }

// ════════════════════════════════════════════════════════════════════════
// Initialisation du rendu
// ════════════════════════════════════════════════════════════════════════
export function initGame(canvas, onExit) {
  S.canvas = canvas;
  S.onExit = onExit;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer = r;
  S.scene = new THREE.Scene();
  S.camera = new THREE.PerspectiveCamera(vfovFrom(90), 16 / 9, 0.05, 600);
  S.camera.rotation.order = 'YXZ';
  S.scene.add(S.camera);

  const pm = new THREE.PMREMGenerator(r);
  S.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;

  // scène du viewmodel (rendue par-dessus, sans traverser les murs)
  S.vmScene = new THREE.Scene();
  S.vmScene.environment = S.env;
  S.vmCamera = new THREE.PerspectiveCamera(68, 16 / 9, 0.01, 10);
  S.vmScene.add(S.vmCamera);
  const vh = new THREE.HemisphereLight(0xffffff, 0x60584a, 1.6);
  const vd = new THREE.DirectionalLight(0xfff1dd, 1.6); vd.position.set(1, 2, 1);
  S.vmScene.add(vh, vd);
  S.vmLight = vh;
  S.vmSun = vd;

  S.effects = new Effects(S.scene);
  S.effects.group.userData.noAO = true;
  S.pipeline = new Pipeline(r, S.scene, S.camera, S.vmScene, S.vmCamera);
  S.pipeline.setQuality(gfxLevel(), window.innerWidth, window.innerHeight);
  resize();
  window.addEventListener('resize', resize);
  setupInput();
  setupNet();
  requestAnimationFrame(loop);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (S.pipeline) S.pipeline.setSize(w, h);
  S.camera.aspect = w / h;
  S.camera.updateProjectionMatrix();
  S.vmCamera.aspect = w / h;
  S.vmCamera.updateProjectionMatrix();
}

export function applySettings() {
  const st = settings();
  A.setVolume(st.volume);
  if (S.world && S.world.userData.sun) S.world.userData.sun.castShadow = !!st.shadows;
  S.renderer.shadowMap.enabled = !!st.shadows;
  S.vmCamera.fov = st.viewmodelFov;
  S.vmCamera.updateProjectionMatrix();
  if (S.pipeline && S.pipeline.name !== gfxLevel()) applyLevel();
  resize();
  hud.fps(0);
}

// ════════════════════════════════════════════════════════════════════════
// Entrée / sortie de partie
// ════════════════════════════════════════════════════════════════════════
function newMe(id) {
  return {
    id, body: createBody(), yaw: 0, pitch: 0, alive: false, hp: 100,
    weapons: ['knife'], cur: 'knife', last: 'knife', ammo: {},
    reloadUntil: 0, reloadStart: 0, drawUntil: 0, nextFire: 0,
    recoilIdx: 0, shotAccum: 0, lastShot: 0, scoped: 0, rezoomAt: 0, rezoomLvl: 0,
    spawnSeq: 0, protectUntil: 0, firedPress: false, altPress: false,
    inspectT: -1, stepAcc: 0, wasGround: true, team: -1, gg: 0, punch: 0, punchYaw: 0,
    kills: 0, deaths: 0, respawnAt: 0, flinch: 0,
  };
}

export function enterGame(msg) {
  S.active = true;
  view.rt = 0; view.latest = 0; view.last = 0;
  resync();
  S.me = newMe(msg.you);
  S.mode = msg.mode;
  S.cfg = MODES[msg.mode];
  S.state = msg.state || 'playing';
  S.teamScore = msg.teamScore || [0, 0];
  S.matchEnd = msg.endsAt;
  S.players.clear();
  S.ui = null;
  for (const p of msg.players) if (p.id !== S.me.id) addRemote(p); else S.me.team = p.team;
  loadMap(msg.map);
  hud.show();
  hud.endScreen(false);
  hud.death(false);
  hud.scope(0);
  $('chat-log').innerHTML = '';
  $('killfeed').innerHTML = '';
  hud.chatLine(`Bienvenue dans <b>${esc(msg.room.name)}</b> — ${esc(S.cfg.name)} sur <b>${esc(MAPS[msg.map].name)}</b>. Clique pour jouer.`, true);
  applySettings();
  buildLoadoutUI();
  setViewWeapon('knife');
  lockPointer();
}

export function exitGame() {
  S.active = false;
  clearProjectiles();
  for (const p of S.players.values()) removeAvatar(p);
  S.players.clear();
  if (S.world) { disposeWorld(S.scene, S.world); S.world = null; }
  S.effects.clear();
  hud.hide();
  if (document.pointerLockElement) document.exitPointerLock();
  setUi(null);
}

function loadMap(mapId) {
  if (S.world) disposeWorld(S.scene, S.world);
  S.mapId = mapId;
  S.map = MAPS[mapId];
  S.world = buildWorld(S.scene, S.map, worldSettings());
  S.scene.environment = S.env;
  S.scene.environmentIntensity = 0.12;
  // l'arme en main est éclairée comme la carte
  const sun = S.world.userData.sun;
  S.vmSun.color.copy(sun.color); S.vmSun.intensity = sun.intensity * 0.75;
  S.world.traverse((o) => { if (o.isHemisphereLight) { S.vmLight.color.copy(o.color); S.vmLight.groundColor.copy(o.groundColor); S.vmLight.intensity = o.intensity * 1.6; } });
  S.effects.clear();
}

// ════════════════════════════════════════════════════════════════════════
// Joueurs distants
// ════════════════════════════════════════════════════════════════════════
function outfitFor(p) {
  if (S.cfg.teams) return p.team === 0 ? 0 : 1;
  return p.color % 6;
}

function addRemote(info) {
  const p = {
    id: info.id, name: info.name, team: info.team, bot: info.bot, skins: info.skins || {}, color: info.color || 0,
    snaps: [], alive: false, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, ct: 0, flags: 0, wid: 'knife',
    walk: 0, stepAcc: 0, deadT: -1, avatar: null, weapon: null, weaponKey: '', tag: null, lastX: 0, lastZ: 0, spotted: 0, wasAir: false,
  };
  S.players.set(p.id, p);
  buildAvatarFor(p);
  return p;
}

function buildAvatarFor(p) {
  removeAvatar(p);
  p.avatar = buildAvatar(outfitFor(p));
  if (!GFX_PRESETS[gfxLevel()].avatarShadows) p.avatar.traverse((o) => { o.castShadow = false; });
  p.avatar.visible = false;
  S.scene.add(p.avatar);
  p.tag = makeNameTag(p.name, S.cfg.teams ? TEAM_COLORS[p.team] || '#fff' : '#fff');
  p.tag.position.y = 2.05;
  p.avatar.add(p.tag);
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.55).translate(0, 0.9, 0), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }));
  ghost.renderOrder = 9; ghost.visible = false; ghost.userData.noAO = true;
  p.avatar.add(ghost);
  p.ghost = ghost;
  p.weaponKey = '';
}

function removeAvatar(p) {
  if (p.avatar) { S.scene.remove(p.avatar); p.avatar = null; }
}

function makeNameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 30px Rajdhani, Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(name, 128, 32);
  ctx.fillStyle = color; ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.2, 0.3, 1);
  s.renderOrder = 10;
  s.visible = false;
  return s;
}

function remoteWeapon(p, wid) {
  const sk = p.skins[wid];
  const key = wid + ':' + (sk ? sk.skin + sk.seed + Math.round(sk.float * 20) : '');
  if (p.weaponKey === key) return;
  p.weaponKey = key;
  const anchor = p.avatar.userData.weaponAnchor;
  if (p.weapon) anchor.remove(p.weapon);
  p.weapon = buildWeapon(wid, sk || null, { statTrak: false, shadows: GFX_PRESETS[gfxLevel()].avatarShadows, detail: false });
  anchor.add(p.weapon);
}

// Horloge d'affichage des autres joueurs : calée sur le dernier snapshot reçu
// (marche quelle que soit la latence ; les tirs envoient exactement ce temps au serveur)
const view = { rt: 0, latest: 0, last: 0 };
function renderClock() {
  const now = performance.now();
  const el = view.last ? Math.min(250, now - view.last) : 0;
  view.last = now;
  if (!view.latest) return 0;
  const target = view.latest - INTERP_DELAY;
  if (!view.rt || Math.abs(view.rt - target) > 250) view.rt = target;
  else view.rt += el + (target - view.rt) * 0.08;
  return view.rt;
}
export function viewTime() { return view.rt || serverNow() - INTERP_DELAY; }

function updateRemotes(dt) {
  const rt = renderClock() || serverNow() - INTERP_DELAY;
  const me = S.me;
  for (const p of S.players.values()) {
    const sn = p.snaps;
    while (sn.length > 2 && sn[1].t <= rt) sn.shift();
    if (!sn.length) continue;
    let a = sn[0], b = sn[1] || sn[0];
    let k = 0;
    if (b !== a && b.t > a.t) k = Math.max(0, Math.min(1.2, (rt - a.t) / (b.t - a.t)));
    if (rt < a.t) k = 0;
    const lerp = (u, v) => u + (v - u) * k;
    // un snapshot antérieur à la mort ne doit pas « ressusciter » le joueur
    const alive = !!(b.f & 1) && !(p.diedAt && b.t <= p.diedAt + 60);
    if (alive && p.diedAt && b.t > p.diedAt + 60) p.diedAt = 0;
    p.x = lerp(a.x, b.x); p.y = lerp(a.y, b.y); p.z = lerp(a.z, b.z);
    let dy = b.yaw - a.yaw; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw = a.yaw + dy * Math.min(1, k);
    p.pitch = lerp(a.pitch, b.pitch);
    p.ct = lerp(a.ct, b.ct);
    p.flags = b.f;
    const wasAlive = p.alive;
    p.alive = alive;
    if (alive && !wasAlive) p.deadT = -1;
    const av = p.avatar;
    if (!av) continue;
    const wid = WEAPON_IDS[b.w] || 'knife';
    if (wid !== p.wid) { p.wid = wid; }
    if (p.alive || p.deadT >= 0) remoteWeapon(p, p.wid);

    const sp = Math.hypot(p.x - p.lastX, p.z - p.lastZ) / Math.max(dt, 1e-3);
    p.lastX = p.x; p.lastZ = p.z;
    const air = !!(p.flags & 16);
    const kind = WEAPONS[p.wid] ? WEAPONS[p.wid].kind : 'rifle';
    if (p.deadT >= 0) {
      // animation de mort
      p.deadT += dt;
      const t = Math.min(1, p.deadT / 0.5);
      poseAvatar(av, { walk: p.walk, move: 0, crouch: p.ct, air: false, pitch: 0, kind, dead: t * t });
      av.position.y = p.deathY + Math.sin(t * Math.PI) * 0.1;
      av.visible = p.deadT < 4;
      p.tag.visible = false;
      if (p.ghost) p.ghost.visible = false;
      continue;
    }
    av.visible = alive;
    if (!alive) continue;
    av.rotation.y = p.yaw;
    av.position.set(p.x, p.y, p.z);
    const move = air ? 0 : Math.min(1, sp / 5);
    p.walk += dt * Math.min(sp, 7) * 1.7;
    poseAvatar(av, { walk: p.walk, move: sp > 0.4 ? move : 0, crouch: p.ct, air, pitch: p.pitch, kind, dead: -1 });
    const moving = sp > 0.5 && !air;
    // protection d'apparition : clignote
    if (p.flags & 8) av.visible = Math.floor(performance.now() / 120) % 2 === 0;
    // bruits de pas
    if (moving && sp > 3.5) {
      p.stepAcc += sp * dt;
      if (p.stepAcc > 2.3) { p.stepAcc = 0; A.playStep({ x: p.x, y: p.y, z: p.z }, 0.6); }
    }
    if (p.wasAir && !air) A.playLand({ x: p.x, y: p.y, z: p.z });
    p.wasAir = air;
    // étiquette de nom
    const mate = S.cfg.teams && p.team === me.team;
    const seeAll = X.wall && allowed() && !mate;
    p.tag.visible = mate || p.aimed || seeAll;
    if (p.ghost) { p.ghost.visible = seeAll; p.ghost.scale.y = 1 - 0.3 * p.ct; }
    if (p.spotted > 0) p.spotted -= dt;
  }
}

// ════════════════════════════════════════════════════════════════════════
// Viewmodel
// ════════════════════════════════════════════════════════════════════════
const VM_POS = {
  rifle: [0.15, -0.16, -0.42], sniper: [0.16, -0.18, -0.48], smg: [0.14, -0.15, -0.38], shotgun: [0.15, -0.16, -0.42],
  pistol: [0.12, -0.12, -0.38], knife: [0.14, -0.13, -0.34], lmg: [0.16, -0.18, -0.44], launcher: [0.22, -0.19, -0.36],
};

function setViewWeapon(wid) {
  if (S.vm) S.vmCamera.remove(S.vm.root);
  const w = WEAPONS[wid];
  const item = P.equippedItem(wid);
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const model = buildWeapon(wid, item, { statTrak: true });
  pivot.add(model);
  const arms = buildArms();
  pivot.add(arms);
  // mains
  const R = arms.userData.right, L = arms.userData.left;
  R.position.set(0.005, -0.04, 0.04); R.rotation.set(0.35, -0.15, 0);
  if (w.dual) { L.position.set(-0.255, -0.04, 0.04); L.rotation.set(0.35, 0.15, 0); root.userData.dual = true; }
  else if (w.kind === 'pistol') { L.position.set(-0.03, -0.06, 0.02); L.rotation.set(0.4, 0.35, 0); }
  else if (w.kind === 'knife') { L.visible = false; }
  else {
    const lz = { rifle: -0.33, sniper: -0.5, smg: -0.2, shotgun: -0.36, lmg: -0.36, launcher: -0.3 }[w.kind] || -0.3;
    L.position.set(-0.01, -0.0, lz); L.rotation.set(0.25, 0.55, 0);
  }
  root.add(pivot);
  const base = VM_POS[w.kind] || VM_POS.rifle;
  root.position.set(base[0], base[1], base[2]);
  if (w.kind === 'knife') { model.rotation.set(0.1, 0.25, -0.15); }
  // flash de bouche
  const flash = new THREE.Sprite(S.effects.flashMat);
  flash.scale.set(0.12, 0.12, 0.12);
  flash.visible = false;
  model.userData.muzzle.add(flash);
  S.vmCamera.add(root);
  S.vm = { root, pivot, model, arms, wid, item, flash, flashT: 0, kick: 0, kickRot: 0, drawT: 0, swayX: 0, swayY: 0, bob: 0, swing: 0, swingHeavy: false, base };
}

const _qInv = new THREE.Quaternion();
function updateViewmodel(dt) {
  const vm = S.vm, me = S.me;
  if (!vm) return;
  const w = WEAPONS[vm.wid];
  const now = performance.now();
  vm.root.visible = me.alive && !me.scoped && S.state === 'playing';
  vm.flashT -= dt;
  vm.flash.visible = vm.flashT > 0;
  vm.kick *= Math.exp(-dt * 14);
  vm.kickRot *= Math.exp(-dt * 12);
  vm.swayX *= Math.exp(-dt * 8); vm.swayY *= Math.exp(-dt * 8);
  const b = me.body;
  const hs = Math.hypot(b.vx, b.vz);
  if (b.onGround && hs > 0.5) vm.bob += dt * hs * 1.7;
  const bobAmt = settings().bob ? Math.min(1, hs / 6) : 0;
  const bx = Math.sin(vm.bob) * 0.008 * bobAmt, by = -Math.abs(Math.cos(vm.bob)) * 0.01 * bobAmt;

  let px = vm.base[0] + bx + vm.swayX, py = vm.base[1] + by + vm.swayY - (b.onGround ? 0 : 0.01), pz = vm.base[2] + vm.kick;
  let rx = vm.kickRot, ry = 0, rz = 0;

  // dégainer
  const draw = Math.max(0, (me.drawUntil - now) / ((w.draw || 0.5) * 1000));
  rx -= draw * 1.1; py -= draw * 0.12;

  // rechargement
  if (me.reloadUntil > now) {
    const dur = me.reloadUntil - me.reloadStart;
    const t = (now - me.reloadStart) / Math.max(1, dur);
    const s = Math.sin(Math.min(1, t) * Math.PI);
    if (w.shellReload) { rz += s * 0.25; rx += s * 0.2; py -= s * 0.02; }
    else { rz += s * 0.55; rx += s * 0.35; py -= s * 0.06; }
    const mags = vm.model.userData.mag || [];
    for (const m of mags) { m.visible = !(t > 0.25 && t < 0.6); }
  } else {
    for (const m of vm.model.userData.mag || []) m.visible = true;
  }
  // roquette / carreau visibles seulement quand l'arme est chargée
  if (w.projectile) {
    const loaded = (me.ammo[me.cur]?.mag || 0) > 0 && !(me.reloadUntil > now && (now - me.reloadStart) / (me.reloadUntil - me.reloadStart) < 0.6);
    for (const m of vm.model.userData.mag || []) m.visible = loaded;
  }

  // culasse (AWP / SSG) après le tir
  if (vm.model.userData.bolt) {
    const since = (now - me.lastShot) / 1000;
    const bolt = vm.model.userData.bolt;
    if (w.kind === 'sniper' && since > 0.3 && since < w.fireDelay - 0.1) {
      const t = (since - 0.3) / (w.fireDelay - 0.4);
      const s = Math.sin(t * Math.PI);
      bolt.rotation.z = s * 1.2;
      bolt.position.z = 0.02 + Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - 0.2) / 0.6)) * Math.PI)) * 0.07;
      rz += s * 0.12;
    } else { bolt.rotation.z = 0; bolt.position.z = 0.02; }
  }
  // pompe du Nova
  if (vm.model.userData.pump) {
    const since = (now - me.lastShot) / 1000;
    const pump = vm.model.userData.pump;
    pump.position.z = -0.36 + (since > 0.25 && since < 0.7 ? Math.sin((since - 0.25) / 0.45 * Math.PI) * 0.08 : 0);
  }

  // inspection
  if (me.inspectT >= 0) {
    me.inspectT += dt;
    const T = 4.2;
    const t = me.inspectT / T;
    if (t >= 1) me.inspectT = -1;
    else {
      const e = (x) => x * x * (3 - 2 * x);
      const inA = e(Math.min(1, t / 0.15)), outA = e(Math.min(1, Math.max(0, (1 - t) / 0.12)));
      const amt = Math.min(inA, outA);
      const phase = Math.min(1, Math.max(0, (t - 0.15) / 0.7));
      ry += amt * (0.9 + Math.sin(phase * Math.PI) * 0.0) - Math.sin(phase * Math.PI) * 1.9 * amt;
      rz += amt * 0.5 + Math.sin(phase * Math.PI * 2) * 0.3 * amt;
      rx += amt * 0.15;
      px -= amt * 0.05; py += amt * 0.04; pz += amt * 0.06;
    }
  }

  // coup de couteau
  if (vm.swing > 0) {
    vm.swing = Math.max(0, vm.swing - dt / (vm.swingHeavy ? 0.5 : 0.3));
    const t = 1 - vm.swing;
    const s = Math.sin(t * Math.PI);
    if (vm.swingHeavy) { pz -= s * 0.12; rx -= s * 0.4; }
    else { px -= s * 0.12; ry += s * 1.0; rz -= s * 0.6; }
  }

  vm.root.position.set(px, py, pz);
  vm.pivot.rotation.set(rx, ry, rz);
  // direction du soleil dans l'espace de la caméra
  if (S.world && S.world.userData.sunDir) {
    S.vmSun.position.copy(S.world.userData.sunDir).applyQuaternion(_qInv.copy(S.camera.quaternion).invert());
  }
}

// ════════════════════════════════════════════════════════════════════════
// Joueur local
// ════════════════════════════════════════════════════════════════════════
function giveWeapons(list, refill) {
  const me = S.me;
  me.weapons = list.slice();
  for (const id of list) {
    const w = WEAPONS[id];
    if (refill || !me.ammo[id]) me.ammo[id] = { mag: w.mag || 0, res: w.reserve || 0 };
  }
  switchWeapon(list[0], true);
}

function switchWeapon(id, force = false) {
  const me = S.me;
  if (!me.weapons.includes(id)) return;
  if (id === me.cur && !force) return;
  if (id !== me.cur) me.last = me.cur;
  me.cur = id;
  me.reloadUntil = 0;
  me.scoped = 0; me.rezoomAt = 0;
  me.inspectT = -1;
  me.recoilIdx = 0;
  const w = WEAPONS[id];
  me.drawUntil = performance.now() + (w.draw || 0.5) * 1000;
  me.nextFire = Math.max(me.nextFire, me.drawUntil);
  setViewWeapon(id);
  hud.scope(0);
  A.playClick(null, 0.7);
}

function startReload() {
  const me = S.me, w = WEAPONS[me.cur];
  if (!w.mag || me.reloadUntil > performance.now()) return;
  const a = me.ammo[me.cur];
  if (a.mag >= w.mag || a.res <= 0) return;
  const now = performance.now();
  me.reloadStart = now;
  me.reloadUntil = now + w.reload * 1000;
  me.scoped = 0; me.rezoomAt = 0;
  me.inspectT = -1;
  hud.scope(0);
  A.playReload(w.kind, null, w.reload);
  send({ t: 'reload' });
}

function finishReload() {
  const me = S.me, w = WEAPONS[me.cur];
  const a = me.ammo[me.cur];
  if (w.shellReload) {
    if (a.res > 0 && a.mag < w.mag) { a.mag++; a.res--; }
    if (a.mag < w.mag && a.res > 0 && !S.mouse.left) {
      const now = performance.now();
      me.reloadStart = now; me.reloadUntil = now + w.reload * 1000;
      A.playReload('shotgun');
      return;
    }
  } else {
    const take = Math.min(w.mag - a.mag, a.res);
    a.mag += take; a.res -= take;
  }
  me.reloadUntil = 0;
}

function eyePos() {
  const b = S.me.body;
  return new THREE.Vector3(b.x, b.y + eyeHeight(b), b.z);
}

function shoot() {
  const me = S.me, w = WEAPONS[me.cur];
  const now = performance.now();
  const a = me.ammo[me.cur];
  me.nextFire = now + w.fireDelay * 1000;
  if (!(X.ammo && allowed())) a.mag--;
  me.lastShot = now;
  me.inspectT = -1;
  me.protectUntil = 0;
  const b = me.body;
  const speedRatio = Math.hypot(b.vx, b.vz) / Math.max(1, w.speed);
  const spread = currentSpread(w, { speedRatio, onGround: b.onGround, crouch: b.crouch, scoped: me.scoped > 0, shotAccum: me.shotAccum });
  me.shotAccum += w.spread.shot || 0;
  const [rp, ry] = recoilOffset(w, me.recoilIdx);
  me.recoilIdx++;
  let base = dirFromAngles(me.yaw + ry, me.pitch + rp);
  const o = eyePos();
  const lock = X.aim && allowed() ? aimTarget(o) : null;
  if (lock) {
    me.yaw = lock.yaw; me.pitch = lock.pitch;
    base = dirFromAngles(lock.yaw, lock.pitch);
  }
  const dirs = [];
  const n = w.pellets || 1;
  for (let i = 0; i < n; i++) dirs.push(lock ? base.slice() : spreadDir(base[0], base[1], base[2], spread + (w.pelletSpread || 0)));
  const scopedShot = me.scoped > 0;
  send({ t: 'shot', w: me.cur, o: [o.x, o.y, o.z], d: dirs.map((d) => d.map((v) => +v.toFixed(5))), rt: viewTime(), sc: scopedShot });

  // recul visuel (le viseur ne montre pas exactement l'impact)
  const r = w.recoil;
  me.punch += r.v * (w.kind === 'sniper' ? 1.2 : 0.55);
  me.punchYaw += (Math.random() - 0.5) * r.h;

  // effets locaux
  const vm = S.vm;
  if (vm) {
    vm.kick += w.kind === 'sniper' ? 0.08 : w.kind === 'shotgun' ? 0.07 : w.kind === 'pistol' ? 0.035 : 0.025;
    vm.kickRot += w.kind === 'sniper' ? 0.15 : w.kind === 'pistol' ? 0.12 : 0.05;
    if (!w.silenced) vm.flashT = 0.05;
  }
  A.playShot(w.sound);
  const muzzleWorld = muzzleWorldPos();
  if (!w.silenced && !w.taser) S.effects.muzzleFlash(muzzleWorld.clone().addScaledVector(dirVec(base), 0.3), w.kind === 'sniper' || w.projectile ? 1.4 : 0.8);
  if (!w.projectile) {
    for (let i = 0; i < dirs.length; i++) {
      const d = new THREE.Vector3(...dirs[i]);
      const hit = localTrace(o, d, w.pierce ? Math.min(raycastMap(S.map.boxes, o.x, o.y, o.z, d.x, d.y, d.z, w.range).t, w.range) : w.range, w.pierce);
      shotVisual(w, muzzleWorld, hit.point, i, hit.normal, hit.map);
      if (hit.player) S.effects.blood(hit.point, d, hit.head);
    }
  }
  // AWP / SSG : on dézoome après le tir, et on rezoome automatiquement (pas les fusils semi-auto)
  if (w.kind === 'sniper' && !w.semiAuto) {
    if (me.scoped) { me.rezoomLvl = me.scoped; me.rezoomAt = me.nextFire; }
    me.scoped = 0;
    hud.scope(0);
    A.playBolt();
  }
  if (a.mag <= 0 && a.res > 0) setTimeout(() => { if (S.me && S.me.alive && S.me.ammo[S.me.cur]?.mag === 0) startReload(); }, w.kind === 'sniper' ? 400 : 200);
}

// cible la plus proche du viseur (tête visible, 40° max)
function aimTarget(o) {
  const me = S.me;
  const f = dirFromAngles(me.yaw, me.pitch);
  let best = null, bestA = 40 * DEG;
  for (const p of S.players.values()) {
    if (!p.alive || (p.flags & 8) || (S.cfg.teams && p.team === me.team)) continue;
    const c = p.ct > 0.5;
    const hx = p.x + (c ? -Math.sin(p.yaw) * 0.2 : 0), hz = p.z + (c ? -Math.cos(p.yaw) * 0.2 : 0), hy = p.y + (c ? 1.18 : 1.68);
    const dx = hx - o.x, dy = hy - o.y, dz = hz - o.z, L = Math.hypot(dx, dy, dz);
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * f[0] + dy * f[1] + dz * f[2]) / L)));
    if (ang >= bestA) continue;
    if (raycastMap(S.map.boxes, o.x, o.y, o.z, dx / L, dy / L, dz / L, L).t < L - 0.1) continue;
    bestA = ang;
    best = { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }
  return best;
}

// traçante adaptée à l'arme (rayon du railgun, confettis, arc électrique…)
function shotVisual(w, from, to, i, normal, wall) {
  if (w.pierce) { S.effects.beam(from, to); if (wall && normal) S.effects.impact(to, normal); return; }
  if (w.taser) { S.effects.beam(from, to, 0x9fd8ff); return; }
  if (w.confetti) {
    const cols = [0xff3fa4, 0xffd23f, 0x22e0ff, 0x7a3cff, 0x3ff0a0];
    if (i === 0) S.effects.confettiSpray(from, to.clone().sub(from).normalize());
    S.effects.tracer(from, to, 60, cols[i % cols.length]);
    if (i % 2 === 0) S.effects.confetti(to, normal || null, 3);
    return;
  }
  if (i < 3 || i % 3 === 0) S.effects.tracer(from, to, w.kind === 'sniper' ? 500 : 280);
  if (wall && normal) S.effects.impact(to, normal);
}

// ── Projectiles en vol (affichage) ─────────────────────────────────────────
const projs = new Map();
function spawnProjectile(m) {
  const w = WEAPONS[m.w];
  if (!w || !w.projectile) return;
  const mesh = buildProjectile(w.projectile.model);
  mesh.position.set(m.o[0], m.o[1], m.o[2]);
  S.scene.add(mesh);
  projs.set(m.id, { mesh, v: new THREE.Vector3(m.v[0], m.v[1], m.v[2]), g: w.projectile.gravity, smoke: 0, rocket: w.projectile.model === 'rocket', age: 0 });
  const by = S.players.get(m.by);
  if (by) A.playShot(w.sound, { x: m.o[0], y: m.o[1], z: m.o[2] });
}
const _look = new THREE.Vector3();
function updateProjectiles(dt) {
  for (const [id, p] of projs) {
    p.age += dt;
    if (p.stuck) { if (p.age > 5) { S.scene.remove(p.mesh); projs.delete(id); } continue; }
    p.v.y -= p.g * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    p.mesh.lookAt(_look.copy(p.mesh.position).sub(p.v));
    if (p.rocket) { p.smoke += dt; if (p.smoke > 0.03) { p.smoke = 0; S.effects.burst(p.mesh.position, null, 0x8a8580, 1, 0.3, 0.25, 0.9, -0.5); } }
    if (p.age > 7) { S.scene.remove(p.mesh); projs.delete(id); }
  }
}
function projectileHit(m) {
  const p = projs.get(m.id);
  const pos = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
  const n = new THREE.Vector3(m.n[0], m.n[1], m.n[2]);
  if (m.boom) {
    if (p) { S.scene.remove(p.mesh); projs.delete(m.id); }
    S.effects.explosion(pos);
    const d = pos.distanceTo(S.camera.position);
    A.playExplosion(pos, 1);
    if (S.me.alive && d < 14) { S.me.flinch += (1 - d / 14) * 0.08; S.me.punchYaw += (Math.random() - 0.5) * (1 - d / 14) * 0.06; }
  } else if (p) {
    if (m.hit) { S.scene.remove(p.mesh); projs.delete(m.id); S.effects.blood(pos, n, false); }
    else { p.mesh.position.copy(pos); p.stuck = true; p.age = 0; S.effects.impact(pos, n); A.playImpact(pos); }
  }
}
function clearProjectiles() { for (const p of projs.values()) S.scene.remove(p.mesh); projs.clear(); }

function dirVec(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

function muzzleWorldPos() {
  const vm = S.vm;
  S.camera.updateMatrixWorld();
  if (!vm || !vm.root.visible) {
    return eyePos().add(new THREE.Vector3(0.15, -0.12, -0.4).applyQuaternion(S.camera.quaternion));
  }
  vm.root.updateMatrixWorld(true);
  const local = new THREE.Vector3();
  vm.model.userData.muzzle.getWorldPosition(local); // dans l'espace du vmCamera (placée à l'origine)
  const inv = new THREE.Matrix4().copy(S.vmCamera.matrixWorld).invert();
  local.applyMatrix4(inv);
  return local.applyMatrix4(S.camera.matrixWorld);
}

const tmpHB = new THREE.Vector3();
function localTrace(o, d, range, pierce = false) {
  const mh = raycastMap(S.map.boxes, o.x, o.y, o.z, d.x, d.y, d.z, range);
  let best = Math.min(mh.t, range), pl = null, head = false;
  const normal = new THREE.Vector3(mh.nx, mh.ny, mh.nz);
  for (const p of S.players.values()) {
    if (pierce) break; // le rayon du railgun va jusqu'au mur
    if (!p.alive || (S.cfg.teams && p.team === S.me.team)) continue;
    const r = rayPlayer(o.x, o.y, o.z, d.x, d.y, d.z, best, p.x, p.y, p.z, p.ct > 0.5, 0, p.yaw);
    if (r && r.t < best) { best = r.t; pl = p; head = r.g === HIT_HEAD; }
  }
  tmpHB.copy(o).addScaledVector(d, best);
  return { point: tmpHB.clone(), normal, player: pl, head, map: !pl && mh.t <= range };
}

function knifeAttack(heavy) {
  const me = S.me, w = WEAPONS[me.cur];
  const now = performance.now();
  me.nextFire = now + (heavy ? w.heavyDelay : w.fireDelay) * 1000;
  me.inspectT = -1;
  me.protectUntil = 0;
  const o = eyePos();
  const d = dirFromAngles(me.yaw, me.pitch);
  send({ t: 'knife', heavy, w: me.cur, o: [o.x, o.y, o.z], d, rt: viewTime() });
  if (S.vm) { S.vm.swing = 1; S.vm.swingHeavy = heavy; }
  A.playKnife(null, false);
  // impact sur mur
  const dv = dirVec(d);
  const mh = raycastMap(S.map.boxes, o.x, o.y, o.z, dv.x, dv.y, dv.z, heavy ? w.heavyRange : w.range);
  if (mh.t < 2) {
    const pt = o.clone().addScaledVector(dv, mh.t);
    setTimeout(() => { S.effects.impact(pt, new THREE.Vector3(mh.nx, mh.ny, mh.nz)); if (w.id === 'pan') A.playBonk(pt); else A.playImpact(pt); }, heavy ? 180 : 90);
  }
}

function updateWeapon(dt) {
  const me = S.me;
  if (!me.alive || S.state !== 'playing') return;
  const w = WEAPONS[me.cur];
  const now = performance.now();
  if (me.reloadUntil && now >= me.reloadUntil) finishReload();
  me.shotAccum *= Math.exp(-(w.spread ? w.spread.recover : 5) * dt);
  if (now - me.lastShot > w.fireDelay * 1000 * 1.6 + 60) me.recoilIdx = Math.max(0, me.recoilIdx - dt * 18);
  me.punch *= Math.exp(-dt * (w.kind === 'sniper' ? 6 : 9));
  me.punchYaw *= Math.exp(-dt * 9);
  me.flinch *= Math.exp(-dt * 10);

  // rezoom automatique
  if (me.rezoomAt && now >= me.rezoomAt) {
    me.scoped = me.rezoomLvl; hud.scope(me.scoped);
    me.rezoomAt = 0;
  }

  const canAct = now >= me.drawUntil && S.ui === null && S.locked;
  if (!canAct) { me.burstLeft = 0; return; }
  // suite d'une rafale (FAMAS)
  if (me.burstLeft > 0 && now >= me.nextFire) {
    const a = me.ammo[me.cur];
    if (a.mag > 0 && me.reloadUntil <= now) { shoot(); me.burstLeft--; me.nextFire = now + (me.burstLeft > 0 ? w.burstDelay : w.fireDelay) * 1000; }
    else me.burstLeft = 0;
    return;
  }

  if (w.kind === 'knife') {
    if (S.mouse.left && now >= me.nextFire) knifeAttack(false);
    else if (S.mouse.right && now >= me.nextFire) knifeAttack(true);
    return;
  }
  const a = me.ammo[me.cur];
  const reloading = me.reloadUntil > now;
  if (S.mouse.left && (w.auto || !me.firedPress) && now >= me.nextFire) {
    if (reloading && w.shellReload && a.mag > 0) { me.reloadUntil = 0; }
    if (me.reloadUntil > now) return;
    me.firedPress = true;
    if (a.mag <= 0) {
      A.playClick(null, 1.4);
      me.nextFire = now + 250;
      if (a.res > 0) startReload();
      return;
    }
    shoot();
    if (w.burst) { me.burstLeft = w.burst - 1; me.nextFire = now + w.burstDelay * 1000; }
  }
}

function toggleScope() {
  const me = S.me, w = WEAPONS[me.cur];
  if (!w.scope || me.reloadUntil > performance.now() || performance.now() < me.drawUntil) return;
  me.rezoomAt = 0;
  me.scoped = (me.scoped + 1) % 3;
  hud.scope(me.scoped);
  A.playZoom();
}

function updateMovement(dt) {
  const me = S.me;
  const b = me.body;
  if (!me.alive) return;
  const k = S.keys;
  const typing = S.ui === 'chat';
  let fwd = 0, side = 0;
  if (!typing && S.ui === null) {
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) side += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) side -= 1;
  }
  const wish = wishFromKeys(me.yaw, fwd, side);
  const now = performance.now();
  const input = {
    wx: wish.wx, wz: wish.wz,
    jump: S.jumpQueued > now && b.onGround,
    crouch: !typing && (k.has('ControlLeft') || k.has('KeyC') || k.has('ControlRight')),
    walk: !typing && (k.has('ShiftLeft') || k.has('ShiftRight')),
  };
  if (input.jump) S.jumpQueued = 0;
  if (S.state !== 'playing') { input.wx = input.wz = 0; input.jump = false; }
  const wasGround = b.onGround;
  const vyBefore = b.vy;
  const boost = X.speed && allowed() ? 2 : 1;
  stepBody(b, input, dt, S.map.boxes, weaponSpeed(me.cur, me.scoped > 0) * boost);
  if (input.jump && X.jump && allowed()) b.vy = PHYS.jumpVel * 1.9;
  if (!wasGround && b.onGround && vyBefore < -6) A.playLand();
  const hs = Math.hypot(b.vx, b.vz);
  if (b.onGround && hs > 3.2 && !input.walk && !b.crouch) {
    me.stepAcc += hs * dt;
    if (me.stepAcc > 2.4) { me.stepAcc = 0; A.playStep(null, 0.22); }
  }
  if (b.y < -15) { b.x = 0; b.y = 2; b.z = 0; }
}

function sendState(dt) {
  S.sendAcc += dt;
  if (S.sendAcc < 1 / CLIENT_SEND_RATE) return;
  S.sendAcc = 0;
  const me = S.me, b = me.body;
  if (!me.alive) return;
  send({
    t: 'st', x: +b.x.toFixed(3), y: +b.y.toFixed(3), z: +b.z.toFixed(3),
    yw: +me.yaw.toFixed(4), pt: +me.pitch.toFixed(4), c: b.crouch ? 1 : 0, g: b.onGround ? 1 : 0,
    sc: me.scoped > 0 ? 1 : 0, w: WEAPON_IDS.indexOf(me.cur), sq: me.spawnSeq,
  });
}

function updateCamera(dt) {
  const me = S.me;
  const cam = S.camera;
  const st = settings();
  let fov = vfovFrom(st.fov);
  const w = WEAPONS[me.cur];
  if (me.alive && me.scoped && w.scope) fov = vfovFrom(w.scope[me.scoped - 1]);
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

  if (me.alive || S.state !== 'playing') {
    const b = me.body;
    cam.position.set(b.x, b.y + eyeHeight(b), b.z);
    // la caméra suit la moitié du recul : les balles montent au-dessus du viseur (à compenser en tirant vers le bas)
    const [rp, ryw] = me.alive ? recoilOffset(w, me.recoilIdx) : [0, 0];
    cam.rotation.set(me.pitch + rp * 0.5 + me.punch + me.flinch, me.yaw + ryw * 0.5 + me.punchYaw, 0);
  } else {
    // caméra de mort : se lève et regarde le tueur
    const dp = S.deathPos || cam.position;
    const target = new THREE.Vector3(dp.x, dp.y + 3.2, dp.z);
    cam.position.lerp(target, 1 - Math.exp(-dt * 3));
    const k = S.killer && S.players.get(S.killer);
    if (k && k.alive) {
      const look = new THREE.Vector3(k.x, k.y + 1.4, k.z).sub(cam.position);
      const yaw = Math.atan2(-look.x, -look.z);
      const pitch = Math.atan2(look.y, Math.hypot(look.x, look.z));
      let dyw = yaw - cam.rotation.y; while (dyw > Math.PI) dyw -= Math.PI * 2; while (dyw < -Math.PI) dyw += Math.PI * 2;
      cam.rotation.y += dyw * (1 - Math.exp(-dt * 5));
      cam.rotation.x += (pitch - cam.rotation.x) * (1 - Math.exp(-dt * 5));
    }
  }
  // écouteur audio
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  A.setListener(cam.position, fwd, up);
}

// Joueur visé (pour afficher son nom)
function updateAimTarget() {
  const me = S.me;
  for (const p of S.players.values()) p.aimed = false;
  if (!me.alive) return;
  const o = eyePos();
  const d = dirFromAngles(me.yaw, me.pitch);
  const mh = raycastMap(S.map.boxes, o.x, o.y, o.z, d[0], d[1], d[2], 120);
  let best = mh.t, bp = null;
  for (const p of S.players.values()) {
    if (!p.alive) continue;
    const r = rayPlayer(o.x, o.y, o.z, d[0], d[1], d[2], best, p.x, p.y, p.z, p.ct > 0.5, 0, p.yaw);
    if (r && r.t < best) { best = r.t; bp = p; }
  }
  if (bp) bp.aimed = true;
}

// ════════════════════════════════════════════════════════════════════════
// HUD
// ════════════════════════════════════════════════════════════════════════
function nameOf(id) {
  if (id === S.me.id) return P.profile().name;
  const p = S.players.get(id);
  return p ? p.name : '?';
}
function colorOf(id) {
  if (S.cfg.teams) {
    const team = id === S.me.id ? S.me.team : S.players.get(id)?.team;
    return TEAM_COLORS[team] || '#fff';
  }
  if (id === S.me.id) return '#ffe28a';
  return '#ff8f8f';
}

function boardData(title) {
  const rows = S.board.map((r) => {
    const [id, kills, deaths, hs, ping, gg, team, alive, assists] = r;
    const p = S.players.get(id);
    return { id, name: nameOf(id), kills, deaths, hs, ping, gg, team, alive: !!alive, assists, bot: p ? p.bot : false, me: id === S.me.id };
  });
  return { mode: S.mode, rows, teamScore: S.teamScore, title };
}

function updateHud(dt) {
  const me = S.me;
  S.hudAcc += dt;
  const st = settings();
  // FPS
  S.fpsAcc += dt; S.fpsN++;
  if (S.fpsAcc > 0.5) { hud.fps(st.showFps ? Math.round(S.fpsN / S.fpsAcc) : 0); S.fpsAcc = 0; S.fpsN = 0; }
  if (S.hudAcc < 0.05) return;
  S.hudAcc = 0;
  hud.setHp(me.alive ? me.hp : 0);
  const a = me.ammo[me.cur] || { mag: 0, res: 0 };
  hud.setAmmo(me.cur, a.mag, a.res, me.weapons, me.cur);
  hud.setTime((S.matchEnd - serverNow()) / 1000);
  // score en haut
  const myRow = S.board.find((r) => r[0] === me.id);
  if (S.cfg.teams) {
    const mine = me.team >= 0 ? me.team : 0;
    hud.setTop(`<span style="color:${TEAM_COLORS[mine]}">${S.teamScore[mine]}</span><small>${TEAM_NAMES[mine]}</small>`,
      `<span style="color:${TEAM_COLORS[1 - mine]}">${S.teamScore[1 - mine]}</span><small>${TEAM_NAMES[1 - mine]}</small>`,
      `${S.cfg.short} · objectif ${S.cfg.killLimit}`);
  } else if (S.cfg.ladder) {
    const lvl = myRow ? myRow[5] : 0;
    hud.setTop(`${lvl + 1}/${GUNGAME_LADDER.length}<small>NIVEAU</small>`, `${esc(WEAPONS[GUNGAME_LADDER[Math.min(lvl + 1, GUNGAME_LADDER.length - 1)]].name)}<small>SUIVANTE</small>`, S.cfg.short);
  } else {
    const best = S.board.reduce((m, r) => Math.max(m, r[1]), 0);
    hud.setTop(`${myRow ? myRow[1] : 0}<small>TOI</small>`, `${best}<small>MEILLEUR</small>`, `${S.cfg.short} · objectif ${S.cfg.killLimit}`);
  }
  // viseur dynamique
  const w = WEAPONS[me.cur];
  let spreadPx = 0;
  if (w.spread && me.alive) {
    const b = me.body;
    const sp = currentSpread(w, { speedRatio: Math.hypot(b.vx, b.vz) / Math.max(1, w.speed), onGround: b.onGround, crouch: b.crouch, scoped: me.scoped > 0, shotAccum: me.shotAccum });
    spreadPx = sp / Math.tan(S.camera.fov * DEG / 2) * window.innerHeight / 2 * 0.6;
  }
  hud.crosshair(st, spreadPx);
  $('crosshair').style.visibility = (w.kind === 'sniper' && !me.scoped) || !me.alive ? 'hidden' : 'visible';
  if (S.tabHeld) hud.scoreboard(true, boardData());
  // radar
  const others = [];
  for (const p of S.players.values()) {
    if (!p.alive) continue;
    const mate = S.cfg.teams && p.team === me.team;
    if (mate) others.push({ x: p.x, z: p.z, color: TEAM_COLORS[p.team] });
    else if (p.spotted > 0 || p.aimed || (X.wall && allowed())) others.push({ x: p.x, z: p.z, color: '#ff4d4d', big: true });
  }
  const pos = me.alive ? me.body : (S.deathPos || me.body);
  drawRadar($('radar'), S.map, { x: pos.x, z: pos.z, yaw: me.yaw }, others, S.cfg.teams);
  // mort
  if (!me.alive && S.state === 'playing') hud.deathTimer(Math.max(0, (me.respawnAt - performance.now()) / 1000));
}

// ════════════════════════════════════════════════════════════════════════
// Boucle
// ════════════════════════════════════════════════════════════════════════
// applique le niveau de qualité effectif (reconstruit la carte pour les ombres)
function applyLevel() {
  const lvl = gfxLevel();
  S.pipeline.setQuality(lvl, window.innerWidth, window.innerHeight);
  if (S.map) loadMap(S.mapId);
  for (const p of S.players.values()) { buildAvatarFor(p); }
  fpsWin.t0 = 0; // on remesure après le changement
}

// mesure des FPS réels pendant la partie et ajustement automatique
const fpsWin = { t0: 0, n: 0, good: 0 };
function autoQuality(now) {
  const playing = S.active && S.locked && S.ui === null && !document.hidden;
  if (!playing) { fpsWin.t0 = 0; return; }
  if (!fpsWin.t0) { fpsWin.t0 = now; fpsWin.n = 0; return; }
  fpsWin.n++;
  const el = now - fpsWin.t0;
  if (el < 2500) return;
  const fps = fpsWin.n * 1000 / el;
  fpsWin.t0 = now; fpsWin.n = 0;
  if (P.profile().settings.gfx !== 'auto') return;
  const i = GFX_LEVELS.indexOf(autoLevel);
  if (fps < 42 && i > 0) {
    autoLevel = GFX_LEVELS[i - 1];
    autoCeiling = autoLevel;
    fpsWin.good = 0;
    try { localStorage.setItem(AUTO_KEY, autoLevel); } catch { /* ignore */ }
    applyLevel();
    hud.center('', `Qualité graphique réduite automatiquement : ${GFX_PRESETS[autoLevel].label} (${Math.round(fps)} FPS)`, 2500);
  } else if (fps > 95 && GFX_LEVELS.indexOf(autoCeiling) > i) {
    if (++fpsWin.good >= 3) {
      autoLevel = GFX_LEVELS[i + 1];
      fpsWin.good = 0;
      try { localStorage.setItem(AUTO_KEY, autoLevel); } catch { /* ignore */ }
      applyLevel();
    }
  } else fpsWin.good = 0;
}

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - (S.last || t)) / 1000);
  S.last = t;
  if (!S.active || !S.map) return;
  autoQuality(t);
  const tj = performance.now();
  updateMovement(dt);
  updateWeapon(dt);
  sendState(dt);
  updateRemotes(dt);
  updateAimTarget();
  updateCamera(dt);
  updateViewmodel(dt);
  updateProjectiles(dt);
  S.effects.update(dt);
  updateHud(dt);
  const tr = performance.now();
  const r = S.renderer;
  S.pipeline.render(!!(S.vm && S.vm.root.visible), dt);
  if (S.perf) { S.perf.js += tr - tj; S.perf.render += performance.now() - tr; S.perf.n++; S.perf.calls = r.info.render.calls; }
}

// ════════════════════════════════════════════════════════════════════════
// Entrées
// ════════════════════════════════════════════════════════════════════════
function lockPointer() {
  if (!S.active) return;
  const c = S.canvas;
  try {
    const p = c.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch { /* ignore */ } });
  } catch { try { c.requestPointerLock(); } catch { /* ignore */ } }
}

function setUi(ui) {
  S.ui = ui;
  $('pause').classList.toggle('hidden', ui !== 'pause');
  $('loadout').classList.toggle('hidden', ui !== 'loadout');
  $('chat').classList.toggle('open', ui === 'chat');
  if (allowed() || ui !== 'x') { const xp = document.getElementById('xp'); if (xp) xp.classList.toggle('hidden', ui !== 'x'); }
  if (ui === 'chat') { const i = $('chat-input'); i.value = ''; setTimeout(() => i.focus(), 0); }
  else $('chat-input').blur();
  if (ui) { S.mouse.left = S.mouse.right = false; }
}

function setupInput() {
  const c = S.canvas;
  c.addEventListener('click', () => {
    A.initAudio();
    if (S.active && !S.locked && (S.ui === null || S.ui === 'pause')) { setUi(null); lockPointer(); }
  });
  document.addEventListener('pointerlockchange', () => {
    S.locked = document.pointerLockElement === c;
    if (!S.active) return;
    if (S.locked) { if (S.ui === 'pause') setUi(null); }
    else if (S.ui === null || S.ui === 'chat') setUi(S.state === 'ended' ? null : 'pause');
  });
  document.addEventListener('mousemove', (e) => {
    if (!S.active || !S.locked || S.ui) return;
    const me = S.me, st = settings();
    let k = st.sens * 0.022 * DEG;
    const w = WEAPONS[me.cur];
    if (me.scoped && w.scope) k *= (Math.tan(w.scope[me.scoped - 1] * DEG / 2) / Math.tan(st.fov * DEG / 2)) * st.scopeSens;
    me.yaw -= e.movementX * k;
    me.pitch -= e.movementY * k;
    me.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, me.pitch));
    if (S.vm) { S.vm.swayX = Math.max(-0.02, Math.min(0.02, S.vm.swayX + e.movementX * 0.00004)); S.vm.swayY = Math.max(-0.02, Math.min(0.02, S.vm.swayY - e.movementY * 0.00004)); }
  });
  document.addEventListener('mousedown', (e) => {
    if (!S.active || !S.locked || S.ui) return;
    if (e.button === 0) { S.mouse.left = true; S.me.firedPress = false; }
    if (e.button === 2) {
      S.mouse.right = true;
      if (WEAPONS[S.me.cur].scope && S.me.alive) toggleScope();
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) { S.mouse.left = false; if (S.me) S.me.firedPress = false; }
    if (e.button === 2) S.mouse.right = false;
  });
  document.addEventListener('contextmenu', (e) => { if (S.active) e.preventDefault(); });
  document.addEventListener('wheel', (e) => {
    if (!S.active || !S.locked || S.ui || !S.me.alive) return;
    const list = S.me.weapons.slice().sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);
    const i = list.indexOf(S.me.cur);
    const n = list[(i + (e.deltaY > 0 ? 1 : -1) + list.length) % list.length];
    switchWeapon(n);
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (!S.active) return;
    if (S.ui !== 'chat' && codeTyped(e)) {
      panelEl();
      if (S.ui === 'x') { setUi(null); lockPointer(); } else { setUi('x'); document.exitPointerLock(); }
      return;
    }
    if (S.ui === 'chat') {
      if (e.code === 'Enter') {
        const msg = $('chat-input').value.trim();
        if (msg) send({ t: 'chat', msg });
        setUi(null);
      } else if (e.code === 'Escape') setUi(null);
      return;
    }
    if (e.code === 'Escape' && (S.ui === 'loadout' || S.ui === 'x')) { setUi('pause'); return; }
    if (e.code === 'Tab') { e.preventDefault(); S.tabHeld = true; hud.scoreboard(true, boardData()); return; }
    if (e.code === 'KeyB' && S.cfg.choice) {
      if (S.ui === 'loadout') { setUi(null); lockPointer(); }
      else { setUi('loadout'); document.exitPointerLock(); }
      return;
    }
    if (S.ui) return;
    S.keys.add(e.code);
    if (['Space', 'ControlLeft', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault();
    const me = S.me;
    if (e.code === 'Space') S.jumpQueued = performance.now() + 150;
    if (e.code === 'Enter' || e.code === 'KeyY' || e.code === 'KeyT') { e.preventDefault(); setUi('chat'); return; }
    if (!me.alive) return;
    const bySlot = (s) => me.weapons.find((id) => WEAPONS[id].slot === s);
    if (e.code === 'Digit1' || e.code === 'Numpad1') { const id = bySlot(1); if (id) switchWeapon(id); }
    if (e.code === 'Digit2' || e.code === 'Numpad2') { const id = bySlot(2); if (id) switchWeapon(id); }
    if (e.code === 'Digit3' || e.code === 'Numpad3') { const id = bySlot(3); if (id) switchWeapon(id); }
    if (e.code === 'KeyQ') { if (me.weapons.includes(me.last)) switchWeapon(me.last); }
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyF' && me.reloadUntil < performance.now() && !me.scoped) me.inspectT = 0;
  });
  document.addEventListener('keyup', (e) => {
    S.keys.delete(e.code);
    if (e.code === 'Tab') { S.tabHeld = false; hud.scoreboard(false); }
  });
  window.addEventListener('blur', () => { S.keys.clear(); S.mouse.left = S.mouse.right = false; });

  $('btn-resume').onclick = () => { setUi(null); lockPointer(); };
  $('btn-loadout').onclick = () => { if (S.cfg.choice) setUi('loadout'); else hud.center('Ce mode impose les armes', '', 1500); };
  $('btn-quit').onclick = () => { send({ t: 'leave' }); exitGame(); S.onExit && S.onExit(); };
  $('btn-settings-ig').onclick = () => { send({ t: 'leave' }); exitGame(); S.onExit && S.onExit('settings'); };
  window.addEventListener('beforeunload', (e) => { if (S.active) { e.preventDefault(); e.returnValue = ''; } });
}

function buildLoadoutUI() {
  const lo = P.profile().loadout;
  if (!lo.melee) lo.melee = 'knife';
  const mk = (list, el, key) => {
    el.innerHTML = '';
    for (const id of list) {
      const w = WEAPONS[id];
      const b = document.createElement('button');
      b.className = 'lo-btn' + (lo[key] === id ? ' on' : '');
      const it = P.equippedItem(id);
      b.innerHTML = `${esc(w.name)}<small>${it ? esc(SKINS[it.skin].name) : 'Par défaut'} · ${w.damage} dég.</small>`;
      b.onclick = () => {
        lo[key] = id;
        send({ t: 'loadout', lo });
        buildLoadoutUI();
        A.playUi();
      };
      el.appendChild(b);
    }
  };
  mk(PRIMARIES, $('lo-prim'), 'primary');
  mk(SECONDARIES, $('lo-sec'), 'secondary');
  // ligne « mêlée » créée à la volée
  let mel = document.getElementById('lo-mel');
  if (!mel) {
    const row = document.createElement('div');
    row.className = 'lo-row';
    row.innerHTML = '<h3>Corps à corps</h3><div id="lo-mel" class="lo-list"></div>';
    document.getElementById('lo-sec').parentElement.after(row);
    mel = document.getElementById('lo-mel');
  }
  mk(MELEES, mel, 'melee');
}

// ════════════════════════════════════════════════════════════════════════
// Réseau
// ════════════════════════════════════════════════════════════════════════
function pushSnap(p, e, st) {
  p.snaps.push({ t: st, x: e[1] / 100, y: e[2] / 100, z: e[3] / 100, yaw: e[4] / 1000, pitch: e[5] / 1000, f: e[6], w: e[7], ct: e[8] / 100 });
  if (p.snaps.length > 30) p.snaps.shift();
}


function setupNet() {
  on('s', (m) => {
    if (!S.active) return;
    if (m.st > view.latest || m.st < view.latest - 5000) view.latest = m.st; // (horloge du serveur redémarrée)
    for (const e of m.p) {
      if (e[0] === S.me.id) continue;
      const p = S.players.get(e[0]);
      if (p) pushSnap(p, e, m.st);
    }
  });
  on('pjoin', (m) => { if (S.active && m.p.id !== S.me.id && !S.players.has(m.p.id)) addRemote(m.p); });
  on('pleave', (m) => { const p = S.players.get(m.id); if (p) { removeAvatar(p); S.players.delete(m.id); } });
  on('pinfo', (m) => {
    const p = S.players.get(m.p.id);
    if (!p) return;
    const teamChanged = p.team !== m.p.team;
    Object.assign(p, { name: m.p.name, team: m.p.team, skins: m.p.skins || {}, color: m.p.color });
    p.weaponKey = '';
    if (teamChanged) buildAvatarFor(p);
  });
  on('match', (m) => {
    if (!S.active) return;
    S.state = 'playing';
    S.matchEnd = m.endsAt;
    S.teamScore = [0, 0];
    S.mode = m.mode; S.cfg = MODES[m.mode];
    for (const info of m.players) {
      if (info.id === S.me.id) { S.me.team = info.team; continue; }
      const p = S.players.get(info.id) || addRemote(info);
      p.team = info.team; p.name = info.name; p.skins = info.skins || {};
      buildAvatarFor(p);
      p.snaps.length = 0; p.alive = false; p.deadT = -1;
    }
    if (m.map !== S.mapId) loadMap(m.map);
    S.me.alive = false;
    hud.endScreen(false);
    hud.death(false);
    hud.center(`${esc(S.cfg.name)}`, `${esc(MAPS[m.map].name)} — c'est parti !`, 2500);
    $('killfeed').innerHTML = '';
    if (S.locked === false && S.ui === null) setUi('pause');
  });
  on('spawn', (m) => {
    if (!S.active) return;
    const me = S.me, b = me.body;
    b.x = m.x; b.y = m.y; b.z = m.z; b.vx = b.vy = b.vz = 0; b.crouch = false; b.crouchT = 0; b.onGround = true;
    me.yaw = m.yaw; me.pitch = 0;
    me.alive = true; me.hp = m.hp; me.spawnSeq = m.seq;
    me.protectUntil = performance.now() + m.protect * 1000;
    me.punch = 0; me.punchYaw = 0; me.scoped = 0; me.rezoomAt = 0;
    me.gg = m.gg || 0;
    giveWeapons(m.weapons, true);
    hud.death(false);
    hud.scope(0);
    if (S.cfg.ladder) hud.center(`Niveau ${me.gg + 1}`, esc(WEAPONS[m.weapons[0]].name), 1500, '#ffb347');
  });
  on('weapons', (m) => {
    if (!S.active) return;
    if (m.gg !== undefined) {
      S.me.gg = m.gg;
      hud.center(`Niveau ${m.gg + 1} / ${GUNGAME_LADDER.length}`, esc(WEAPONS[m.list[0]].name), 1600, '#ffb347');
      A.playKill(true);
    }
    giveWeapons(m.list, m.refill);
  });
  on('correct', (m) => {
    if (!S.active || m.seq !== S.me.spawnSeq) return;
    const b = S.me.body;
    b.x = m.x; b.y = m.y; b.z = m.z; b.vx = b.vy = b.vz = 0;
  });
  on('fx', (m) => {
    if (!S.active) return;
    const p = S.players.get(m.id);
    const w = WEAPONS[m.w];
    if (!w) return;
    const o = new THREE.Vector3(m.o[0], m.o[1], m.o[2]);
    if (p) p.spotted = 2.5;
    A.playShot(w.sound, o);
    let from = o.clone();
    if (p && p.weapon && p.avatar.visible) { p.weapon.updateMatrixWorld(true); p.weapon.userData.muzzle.getWorldPosition(from); }
    if (!w.silenced) S.effects.muzzleFlash(from, w.kind === 'sniper' ? 1.2 : 0.7);
    m.e.forEach((e, i) => {
      const end = new THREE.Vector3(e[0], e[1], e[2]);
      if (w.pierce || w.taser || w.confetti) shotVisual(w, from, end, i, null, false);
      else if (i < 3 || i % 3 === 0) S.effects.tracer(from, end, w.kind === 'sniper' ? 500 : 280);
      if (e[3] && !w.pierce) {
        // pas de sang collé à notre propre caméra quand c'est nous qui sommes touchés
        if (!(S.me.alive && end.distanceTo(eyePos()) < 1.6)) S.effects.blood(end, end.clone().sub(o).normalize(), false);
      }
      else {
        const d = end.clone().sub(o); const len = d.length(); d.normalize();
        const mh = raycastMap(S.map.boxes, o.x, o.y, o.z, d.x, d.y, d.z, len + 0.05);
        if (mh.t <= len + 0.04) S.effects.impact(end, new THREE.Vector3(mh.nx, mh.ny, mh.nz));
      }
    });
  });
  on('kn', (m) => {
    const p = S.players.get(m.id);
    if (!p) return;
    const pos = { x: p.x, y: p.y + 1.4, z: p.z };
    if (m.w === 'pan' && m.hit) A.playBonk(pos); else A.playKnife(pos, m.hit);
  });
  on('pj', (m) => { if (S.active) spawnProjectile(m); });
  on('px', (m) => { if (S.active) projectileHit(m); });
  on('kb', (m) => {
    if (!S.active || !S.me.alive) return;
    const b = S.me.body;
    b.vx += m.v[0]; b.vz += m.v[2]; b.vy = Math.max(b.vy, m.v[1]); b.onGround = false;
  });
  on('rl', (m) => { const p = S.players.get(m.id); if (p) A.playReload(WEAPONS[p.wid]?.kind, { x: p.x, y: p.y + 1.2, z: p.z }); });
  on('hit', (m) => {
    if (!S.active) return;
    if (m.prot) { hud.center('', 'Cible protégée (apparition)', 800); return; }
    hud.hitmarker(m.hs, m.kill);
    A.playHit(m.hs);
  });
  on('dmg', (m) => {
    if (!S.active) return;
    const me = S.me;
    me.hp = m.hp;
    hud.damageFlash(m.dmg);
    A.playHurt();
    me.flinch += Math.min(0.05, m.dmg * 0.0008);
    // direction de l'attaquant
    const dx = m.fx - me.body.x, dz = m.fz - me.body.z;
    const ang = Math.atan2(-dx, -dz) - me.yaw;
    hud.damageDir(-ang);
    const p = S.players.get(m.from);
    if (p) p.spotted = 3;
  });
  on('kill', (m) => {
    if (!S.active) return;
    const me = S.me;
    const kw = WEAPONS[m.w];
    hud.killfeed({
      kn: nameOf(m.k), kc: colorOf(m.k), vn: nameOf(m.v), vc: colorOf(m.v), wn: kw ? kw.name : m.w,
      hs: m.hs, ns: m.ns, bs: m.bs, an: m.a ? nameOf(m.a) : null,
    }, m.k === me.id || m.v === me.id);
    const victim = S.players.get(m.v);
    if (victim) { victim.deadT = 0; victim.deathY = victim.y; victim.alive = false; victim.diedAt = view.latest || serverNow(); if (victim.avatar) victim.avatar.position.set(victim.x, victim.y, victim.z); }
    if (m.k === me.id && m.v !== me.id) {
      A.playKill(m.hs);
      let txt = m.hs ? 'HEADSHOT' : '';
      if (m.ns) txt = 'NO-SCOPE !' + (m.hs ? ' HEADSHOT' : '');
      if (m.bs) txt = 'DANS LE DOS !';
      if (txt) hud.center('', txt, 1200);
    }
    if (m.v === me.id) {
      me.alive = false;
      me.scoped = 0; hud.scope(0);
      me.respawnAt = performance.now() + S.cfg.respawn * 1000;
      S.killer = m.k;
      S.deathPos = new THREE.Vector3(me.body.x, me.body.y + 1.2, me.body.z);
      const kp = S.players.get(m.k);
      const sk = kp && kp.skins[m.w];
      hud.death(true, {
        killer: m.k === me.id ? 'Suicide' : `Tué par <b style="color:${colorOf(m.k)}">${esc(nameOf(m.k))}</b> avec <b>${esc(kw ? kw.name : m.w)}</b>${m.hs ? ' (headshot)' : ''}${m.k !== me.id ? ` — il lui reste ${m.kh} PV` : ''}`,
        skin: sk ? `Skin : ${esc(itemFullName(sk))}` : '',
      });
    }
  });
  on('credits', (m) => {
    if (!S.active) return;
    P.setCredits(m.total);
    hud.creditPop(m.n, m.why);
    // compteur StatKill™ (valeur officielle venant du serveur)
    if (m.st !== null && m.st !== undefined) {
      const item = P.equippedItem(m.w);
      if (item) item.kills = m.st;
      if (S.vm && S.vm.wid === m.w && S.vm.model.userData.stDisplay) S.vm.model.userData.stDisplay.userData.update(m.st);
    }
  });
  on('drop', (m) => {
    if (!S.active || !m.item) return;
    P.addLocalItem(m.item);
    const show = () => {
      const el = document.querySelector('#end-screen .drop');
      if (el) el.innerHTML = `🎁 Objet obtenu : <b style="color:${dropColor(m.item)}">${esc(itemFullName(m.item))}</b>`;
    };
    show(); setTimeout(show, 300);
  });
  on('board', (m) => {
    S.board = m.rows;
    S.teamScore = m.ts;
    S.matchEnd = m.endsAt;
  });
  on('end', (m) => {
    if (!S.active) return;
    S.state = 'ended';
    S.board = m.board;
    S.teamScore = m.teamScore;
    S.me.scoped = 0; hud.scope(0);
    let title;
    if (m.winTeam >= 0) title = `Victoire : ${TEAM_NAMES[m.winTeam]}`;
    else if (m.winTeam === -2) title = 'Égalité';
    else title = m.winner === S.me.id ? 'TU AS GAGNÉ !' : `Victoire de ${esc(m.winnerName || '?')}`;
    const pod = m.top.map((id, i) => `<div><div style="font-size:24px">${['🥇', '🥈', '🥉'][i]}</div><b>${esc(nameOf(id))}</b></div>`).join('');
    const html = `<div class="winner">${title}</div>${S.cfg.teams ? '' : `<div class="podium">${pod}</div>`}
      ${renderBoard(boardData('Résultats'), true)}<div class="drop" style="margin-top:10px"></div>
      <div class="next">Prochain match sur <b>${esc(MAPS[m.nextMap].name)}</b> dans <span id="end-count">${m.nextIn}</span> s</div>`;
    hud.endScreen(true, { html });
    hud.death(false);
    let n = m.nextIn;
    const iv = setInterval(() => { n--; const el = $('end-count'); if (el) el.textContent = Math.max(0, n); if (n <= 0 || !S.active) clearInterval(iv); }, 1000);
    S.me.alive = false;
  });
  on('chat', (m) => {
    if (!S.active) return;
    if (m.sys) hud.chatLine(esc(m.msg), true);
    else {
      const col = S.cfg.teams ? TEAM_COLORS[m.team] : (m.id === S.me.id ? '#ffe28a' : '#9fd3ff');
      hud.chatLine(`<b style="color:${col}">${esc(m.name)}</b> : ${esc(m.msg)}`);
    }
  });
  on('gg', (m) => {
    if (m.demoted) { hud.center('RÉTROGRADÉ !', `Tué au couteau — niveau ${m.level + 1}`, 1800, '#ff6a6a'); }
  });
  on('ggup', (m) => {
    if (!S.active || m.id === S.me.id) return;
    if (m.level === GUNGAME_LADDER.length - 1) hud.chatLine(`<b>${esc(nameOf(m.id))}</b> est au couteau final !`, true);
  });
}

function dropColor(it) {
  return { milspec: '#4b69ff', restricted: '#8847ff' }[SKINS[it.skin].rarity] || '#fff';
}

export function refreshViewSkin() {
  if (S.active && S.me) { setViewWeapon(S.me.cur); buildLoadoutUI(); }
}

export function isActive() { return S.active; }

// Mode test (?test=1) : permet de piloter le jeu sans verrouillage du pointeur (tests automatisés)
if (new URLSearchParams(location.search).has('test')) {
  window.__xeb = {
    S,
    lock() { S.locked = true; setUi(null); },
    give(list) { giveWeapons(list, true); },
    switchTo(id) { switchWeapon(id, true); },
    scope() { toggleScope(); },
    inspect() { S.me.inspectT = 0; },
    look(yaw, pitch) { S.me.yaw = yaw; S.me.pitch = pitch; },
    emit(m) { dispatch(m); },
    aimAtNearest() {
      const me = S.me.body; let best = null, bd = 1e9;
      for (const p of S.players.values()) { if (!p.alive) continue; const d = Math.hypot(p.x - me.x, p.z - me.z); if (d < bd) { bd = d; best = p; } }
      if (!best) return null;
      const dx = best.x - me.x, dz = best.z - me.z, dy = best.y + 1.4 - (me.y + 1.62);
      S.me.yaw = Math.atan2(-dx, -dz); S.me.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return { name: best.name, d: bd };
    },
  };
}
