// Boucle de jeu côté client.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { WEAPONS, recoilOffset, currentSpread, spreadDir, dirFromAngles, weaponSpeed, PRIMARIES, SECONDARIES, MELEES, MAGIC, GRENADES, GRENADE_STOCK } from '/shared/weapons.js';
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
    mana: PLAYER.manaMax, manaMax: PLAYER.manaMax, nades: {}, curNade: 'he',
    slowUntil: 0, slowMul: 1, shield: 0, nextCast: 0, nextThrow: 0, curSpell: null, eliminated: false,
  };
}

const NADE_ICON = { he: '💣', flash: '⚡', smoke: '☁', molotov: '🔥' };
const NADE_KEY = { he: '4', flash: '5', smoke: '6', molotov: '7' };

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
  S.recBuf = []; S.killcam = null; S.pendingDeath = null; S.pendingSpawn = null; S._recLast = 0; S._kcManual = false;
  if (S.meAvatar) { S.scene.remove(S.meAvatar); S.meAvatar = null; }
  for (const p of msg.players) if (p.id !== S.me.id) addRemote(p); else S.me.team = p.team;
  loadMap(msg.map);
  if (S.cfg.br) setupBR(msg.zone, msg.loot); else clearBR();
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
  S.killcam = null; S.recBuf = []; S.pendingDeath = null; S.pendingSpawn = null;
  hud.killcam(false); hud.mlgStop();
  clearBR();
  if (S.meAvatar) { S.scene.remove(S.meAvatar); S.meAvatar = null; }
  clearProjectiles();
  clearWorldFx();
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
  pistol: [0.12, -0.12, -0.38], knife: [0.14, -0.13, -0.34], lmg: [0.16, -0.18, -0.44], launcher: [0.22, -0.19, -0.36], magic: [0.17, -0.16, -0.34], grenade: [0.15, -0.14, -0.3],
};

function setViewWeapon(wid) {
  if (S.vm) S.vmCamera.remove(S.vm.root);
  const w = WEAPONS[wid];
  // magie : le modèle (élément + skin) suit le sort actif de la barre
  const buildId = (w.kind === 'magic' && MAGIC.includes(S.me.curSpell)) ? S.me.curSpell : wid;
  const item = P.equippedItem(buildId);
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const model = buildWeapon(buildId, item, { statTrak: true });
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
  // canons rotatifs du minigun (tournent quand on vient de tirer)
  if (vm.model.userData.spin) { const firing = now - me.lastShot < 180 ? 1 : 0.15; vm.spinV = (vm.spinV || 0) * 0.9 + firing * 30 * 0.1; vm.model.userData.spin.rotation.z += vm.spinV * dt; }
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
  // magie : on garde le sort actif (ou on démarre sur le bâton équipé)
  if (w.kind === 'magic' && !MAGIC.includes(me.curSpell)) me.curSpell = MAGIC.includes(id) ? id : 'fireball';
  me.drawUntil = performance.now() + (w.draw || 0.5) * 1000;
  me.nextFire = Math.max(me.nextFire, me.drawUntil);
  setViewWeapon(id);
  refreshSpellBelt();
  hud.scope(0);
  A.playClick(null, 0.7);
}

// Sélection du sort actif dans la barre (molette / direct)
function selectSpell(idOrDir) {
  const me = S.me;
  if (!me.alive || !WEAPONS[me.cur] || WEAPONS[me.cur].kind !== 'magic') return;
  let next;
  if (idOrDir === 1 || idOrDir === -1) {
    const i = Math.max(0, MAGIC.indexOf(me.curSpell));
    next = MAGIC[(i + idOrDir + MAGIC.length) % MAGIC.length];
  } else if (MAGIC.includes(idOrDir)) next = idOrDir;
  else return;
  if (next === me.curSpell) return;
  me.curSpell = next;
  me.inspectT = -1;
  setViewWeapon(me.cur); // reconstruit le bâton selon le sort actif
  refreshSpellBelt();
  A.playClick(null, 1.1);
}
function refreshSpellBelt() {
  const me = S.me;
  const on = me.alive && WEAPONS[me.cur] && WEAPONS[me.cur].kind === 'magic';
  if (!on) { hud.spells([]); return; }
  hud.spells(MAGIC.map((id) => {
    const w = WEAPONS[id];
    return { id, icon: SPELL_ICON[id], name: w.name, mana: w.mana, sel: me.curSpell === id, low: me.mana < w.mana };
  }));
}
const SPELL_ICON = { fireball: '🔥', chainbolt: '⚡', frostbeam: '❄', arcaneorb: '🔮', healstaff: '✚', aegis: '🛡', blink: '✦', totem: '🗿' };

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
  const magicCol = { fireball: 0xff6a1a, orb: 0xb06bff }[w.projectile.model];
  projs.set(m.id, { mesh, v: new THREE.Vector3(m.v[0], m.v[1], m.v[2]), g: w.projectile.gravity, bounce: w.projectile.bounce || 0, smoke: 0, rocket: w.projectile.model === 'rocket', spin: w.projectile.model === 'grenade', trail: magicCol, age: 0 });
  const by = S.players.get(m.by);
  if (by) A.playShot(w.sound, { x: m.o[0], y: m.o[1], z: m.o[2] });
}
const _look = new THREE.Vector3();
function updateProjectiles(dt) {
  for (const [id, p] of projs) {
    p.age += dt;
    if (p.stuck) { if (p.age > 5) { S.scene.remove(p.mesh); projs.delete(id); } continue; }
    p.v.y -= p.g * dt;
    const step = p.v.clone().multiplyScalar(dt);
    const sp = step.length();
    if (p.bounce && sp > 1e-4) {
      // rebond visuel contre le décor
      const dir = step.clone().multiplyScalar(1 / sp);
      const mh = raycastMap(S.map.boxes, p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, dir.x, dir.y, dir.z, sp);
      if (mh.t < sp) {
        const n = new THREE.Vector3(mh.nx, mh.ny, mh.nz);
        p.mesh.position.addScaledVector(dir, Math.max(0, mh.t - 0.02));
        p.v.reflect(n).multiplyScalar(p.bounce);
        p.mesh.position.addScaledVector(n, 0.05);
      } else p.mesh.position.add(step);
    } else p.mesh.position.add(step);
    if (p.spin) { p.mesh.rotation.x += dt * 9; p.mesh.rotation.z += dt * 6; }
    else p.mesh.lookAt(_look.copy(p.mesh.position).sub(p.v));
    if (p.rocket) { p.smoke += dt; if (p.smoke > 0.03) { p.smoke = 0; S.effects.burst(p.mesh.position, null, 0x8a8580, 1, 0.3, 0.25, 0.9, -0.5); } }
    if (p.trail) { p.smoke += dt; if (p.smoke > 0.02) { p.smoke = 0; S.effects.burst(p.mesh.position, null, p.trail, 1, 0.6, 0.08, 0.3, 0); } }
    if (p.age > 7) { S.scene.remove(p.mesh); projs.delete(id); }
  }
}
function projectileHit(m) {
  const p = projs.get(m.id);
  const pos = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
  const n = m.n ? new THREE.Vector3(m.n[0], m.n[1], m.n[2]) : new THREE.Vector3(0, 1, 0);
  if (m.g) {
    // grenade (flash/smoke/molotov) : on retire le projectile, l'effet arrive via smoke/fire/flash
    if (p) { S.scene.remove(p.mesh); projs.delete(m.id); }
    if (m.g === 'flash') { S.effects.burst(pos, null, 0xffffff, 10, 5, 0.1, 0.25, 0); A.playFlashbang(m.p, 0.6); }
    else if (m.g === 'smoke') A.playImpact(m.p);
    else A.playImpact(m.p);
    return;
  }
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

// ── Effets de zone (fumée, feu, tourelles) ───────────────────────────────────
const smokes = new Map(), fires = new Map(), turrets = new Map();
function smokeTex() {
  if (smokeTex._t) return smokeTex._t;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(210,210,214,0.9)'); g.addColorStop(1, 'rgba(210,210,214,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  smokeTex._t = new THREE.CanvasTexture(c); return smokeTex._t;
}
function spawnSmoke(m) {
  killSmoke(m.id);
  const grp = new THREE.Group(); grp.position.set(m.p[0], Math.max(0.3, m.p[1]) + 0.3, m.p[2]);
  const mat = new THREE.SpriteMaterial({ map: smokeTex(), color: 0xd0d0d4, transparent: true, opacity: 0, depthWrite: false });
  const puffs = [];
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Sprite(mat.clone());
    const a = Math.random() * 6.28, r = Math.random() * m.r * 0.8;
    sp.position.set(Math.cos(a) * r, (Math.random() - 0.3) * m.r, Math.sin(a) * r);
    const sz = m.r * (0.9 + Math.random() * 0.6); sp.scale.set(sz, sz, 1);
    sp.userData.spin = (Math.random() - 0.5) * 0.4;
    grp.add(sp); puffs.push(sp);
  }
  grp.userData = { noAO: true, t: 0, puffs, r: m.r };
  S.scene.add(grp);
  smokes.set(m.id, grp);
  A.playImpact(m.p);
}
function killSmoke(id) { const g = smokes.get(id); if (g) { g.userData.dying = true; } }
function spawnFireArea(m) {
  killFire(m.id);
  const grp = new THREE.Group(); grp.position.set(m.p[0], Math.max(0.05, m.p[1]), m.p[2]);
  const light = new THREE.PointLight(0xff7a20, 2.2, m.r * 3); light.position.y = 0.6; grp.add(light);
  grp.userData = { noAO: true, t: 0, r: m.r, light, acc: 0 };
  S.scene.add(grp);
  fires.set(m.id, grp);
}
function killFire(id) { const g = fires.get(id); if (g) { S.scene.remove(g); fires.delete(id); } }
function spawnTurret(m) {
  killTurret(m.id);
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.7, metalness: 0.3 })); base.position.y = 0.1;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a3e })); post.position.y = 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshStandardMaterial({ color: 0x4a5a4e, metalness: 0.4 })); head.position.y = 0.72;
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0x6affc0 })); gem.material.toneMapped = false; gem.position.y = 0.78;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 })); gun.position.set(0, 0.72, -0.18);
  g.add(base, post, head, gem, gun);
  g.position.set(m.p[0], m.p[1], m.p[2]);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { head, gun, gem, t: 0 };
  S.scene.add(g);
  turrets.set(m.id, g);
  S.effects.burst(g.position.clone().setY(g.position.y + 0.6), null, 0x6affc0, 14, 3, 0.09, 0.6, 0);
}
function killTurret(id) { const g = turrets.get(id); if (g) { S.effects.burst(g.position.clone().setY(g.position.y + 0.6), null, 0x6affc0, 10, 3, 0.08, 0.5, 0); S.scene.remove(g); turrets.delete(id); } }
function updateWorldFx(dt) {
  for (const [id, g] of smokes) {
    const u = g.userData; u.t += dt;
    const grow = Math.min(1, u.t / 1.2);
    const fade = u.dying ? Math.max(0, 1 - (u.t - u.fadeStart || 0)) : 1;
    if (u.dying && u.fadeStart === undefined) u.fadeStart = u.t;
    const op = u.dying ? Math.max(0, 1 - (u.t - u.fadeStart) / 1.2) : grow;
    for (const sp of u.puffs) { sp.material.opacity = 0.82 * op; sp.material.rotation += sp.userData.spin * dt; }
    g.scale.setScalar(0.5 + grow * 0.5);
    if (u.dying && op <= 0.01) { S.scene.remove(g); smokes.delete(id); }
  }
  for (const [, g] of fires) {
    const u = g.userData; u.t += dt; u.acc += dt;
    u.light.intensity = 1.8 + Math.sin(u.t * 18) * 0.5;
    if (u.acc > 0.03) { u.acc = 0; const a = Math.random() * 6.28, r = Math.random() * u.r * 0.9; S.effects.burst(g.position.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.05, Math.sin(a) * r)), new THREE.Vector3(0, 1, 0), Math.random() < 0.5 ? 0xff6a1a : 0xffb020, 1, 1.5, 0.14, 0.6, -2.5); }
  }
  for (const [, g] of turrets) {
    const u = g.userData; u.t += dt;
    g.userData.gem.material.color.setHSL(0.45, 1, 0.5 + Math.sin(u.t * 4) * 0.15);
    // oriente la tête vers l'ennemi le plus proche
    let best = null, bd = 42;
    for (const p of S.players.values()) { if (!p.alive) continue; if (S.cfg.teams && p.team === S.me.team) continue; const d = Math.hypot(p.x - g.position.x, p.z - g.position.z); if (d < bd) { bd = d; best = p; } }
    if (best) { const a = Math.atan2(best.x - g.position.x, best.z - g.position.z); u.head.rotation.y = a; u.gun.position.x = g.position.x * 0 + Math.sin(a) * 0.18; u.gun.position.z = Math.cos(a) * 0.18; u.gun.rotation.y = a; }
  }
}
function clearWorldFx() {
  for (const g of smokes.values()) S.scene.remove(g); smokes.clear();
  for (const g of fires.values()) S.scene.remove(g); fires.clear();
  for (const g of turrets.values()) S.scene.remove(g); turrets.clear();
}

// ── Battle Royale (client) ───────────────────────────────────────────────────
let zoneMesh = null, zoneRing = null;
const lootMeshes = new Map();
function setupBR(zone, loot) {
  clearBR();
  S.zone = zone || null;
  if (!S.cfg || !S.cfg.br) return;
  const H = 70;
  zoneMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, H, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4bd6ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
  zoneMesh.position.y = H / 2 - 3; zoneMesh.renderOrder = 6; zoneMesh.userData.noAO = true;
  S.scene.add(zoneMesh);
  zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(0.955, 1.0, 96),
    new THREE.MeshBasicMaterial({ color: 0x9af6ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  zoneRing.rotation.x = -Math.PI / 2; zoneRing.position.y = 0.12; zoneRing.userData.noAO = true;
  S.scene.add(zoneRing);
  applyZone();
  if (loot) for (const l of loot) spawnLoot(l);
}
function applyZone() {
  if (!zoneMesh || !S.zone) return;
  const r = Math.max(0.5, S.zone.r);
  zoneMesh.scale.set(r, 1, r); zoneMesh.position.x = S.zone.cx; zoneMesh.position.z = S.zone.cz;
  zoneRing.scale.set(r, r, r); zoneRing.position.x = S.zone.cx; zoneRing.position.z = S.zone.cz;
}
function spawnLoot(l) {
  if (lootMeshes.has(l.id)) return;
  const g = new THREE.Group();
  g.position.set(l.p[0], l.p[1], l.p[2]);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 1.1; beam.userData.noAO = true; g.add(beam);
  let wm = null;
  try { wm = buildWeapon(l.w, null, { detail: false, shadows: false }); wm.scale.setScalar(0.7); wm.position.y = 0.6; g.add(wm); } catch { /* arme inconnue */ }
  g.userData.spin = wm; g.userData.base = l.p[1];
  S.scene.add(g);
  lootMeshes.set(l.id, g);
}
function removeLoot(id, pickedByMe) {
  const g = lootMeshes.get(id);
  if (!g) return;
  if (pickedByMe) S.effects.ring(g.position.clone().setY(g.position.y + 0.3), 0x7af2ff, 1.1, 0.4);
  S.scene.remove(g); lootMeshes.delete(id);
}
function clearBR() {
  if (zoneMesh) { S.scene.remove(zoneMesh); zoneMesh.geometry.dispose(); zoneMesh.material.dispose(); zoneMesh = null; }
  if (zoneRing) { S.scene.remove(zoneRing); zoneRing.geometry.dispose(); zoneRing.material.dispose(); zoneRing = null; }
  for (const g of lootMeshes.values()) S.scene.remove(g);
  lootMeshes.clear();
  S.zone = null;
  hud.brHide();
}
function brAliveCount() { return S.board ? S.board.filter((r) => r[7]).length : 0; }
function updateBRClient(dt) {
  if (!S.cfg || !S.cfg.br) return;
  const t = performance.now() / 1000;
  for (const g of lootMeshes.values()) {
    if (g.userData.spin) { g.userData.spin.rotation.y += dt * 1.8; g.userData.spin.position.y = 0.6 + Math.sin(t * 2 + g.position.x) * 0.08; }
  }
  if (S.zone && S.me.alive) {
    const d = Math.hypot(S.me.body.x - S.zone.cx, S.me.body.z - S.zone.cz);
    hud.zoneWarn(d > S.zone.r);
  } else hud.zoneWarn(false);
  hud.brInfo(brAliveCount(), S.zone);
}

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
  if (w.id === 'saber') A.playSaber(null, true); else A.playKnife(null, false);
  // impact sur mur
  const dv = dirVec(d);
  const mh = raycastMap(S.map.boxes, o.x, o.y, o.z, dv.x, dv.y, dv.z, heavy ? w.heavyRange : w.range);
  if (mh.t < 2) {
    const pt = o.clone().addScaledVector(dv, mh.t);
    setTimeout(() => { S.effects.impact(pt, new THREE.Vector3(mh.nx, mh.ny, mh.nz)); if (w.id === 'pan') A.playBonk(pt); else A.playImpact(pt); }, heavy ? 180 : 90);
  }
}

// ── Sorts (magie) ────────────────────────────────────────────────────────────
function castSpell(w) {
  const me = S.me, now = performance.now();
  me.nextFire = now + w.fireDelay * 1000;
  me.inspectT = -1; me.protectUntil = 0;
  me.mana -= w.mana; // prédiction locale, le serveur corrige
  refreshSpellBelt();
  const o = eyePos();
  const d = dirFromAngles(me.yaw, me.pitch);
  send({ t: 'cast', w: me.curSpell, o: [o.x, o.y, o.z], d, rt: viewTime() });
  A.playShot(w.sound);
  const col = ELEM_LOCAL[w.element] || 0xb06bff;
  // recul + grosse pulsation de l'orbe + flash lumineux au bout du bâton
  if (S.vm) { S.vm.kick += 0.05; S.vm.kickRot += 0.09; if (S.vm.model.userData.orb) pulseOrb(S.vm.model.userData.orb, 2.6); }
  const from = muzzleWorldPos();
  S.effects.castFlash(from, col);
  // cercle runique au sol sous le lanceur + cercle devant le bâton (style mod magie)
  const feet = new THREE.Vector3(me.body.x, me.body.y + 0.06, me.body.z);
  const big = w.cast === 'heal' || w.cast === 'shield' || w.cast === 'turret';
  S.effects.magicCircle(feet, col, { r: big ? (w.radius ? w.radius * 1.1 : 2.2) : 1.4, dur: big ? 0.9 : 0.6, up: true, spin: big ? 3 : 5 });
  if (w.cast === 'proj' || w.cast === 'chain' || w.cast === 'beam') {
    S.effects.magicCircle(from, col, { r: 0.8, dur: 0.5, dir: new THREE.Vector3(...d), spin: 8 });
    if (w.cast === 'beam') { const hit = localTrace(o, new THREE.Vector3(...d), w.range); S.effects.beam(from, hit.point, col); S.effects.ring(from, col, 0.9, 0.35); if (hit.map) { S.effects.impact(hit.point, hit.normal); S.effects.ring(hit.point, col, 1.2, 0.4); } }
    else if (w.cast === 'chain') { const hit = localTrace(o, new THREE.Vector3(...d), w.range); S.effects.beam(from, hit.point, col); S.effects.burst(from, null, col, 14, 4, 0.08, 0.4, 0); }
    else { S.effects.burst(from, new THREE.Vector3(...d), col, 16, 5, 0.1, 0.5, 0); S.effects.ring(from, col, 0.8, 0.3); }
  }
  if (w.cast === 'heal') { healAura(me.body.x, me.body.y, me.body.z, 0x4fe08a); S.effects.ring(new THREE.Vector3(me.body.x, me.body.y + 0.1, me.body.z), 0x4fe08a, w.radius * 0.9, 0.7, true); }
  if (w.cast === 'shield') { healAura(me.body.x, me.body.y, me.body.z, 0xffd23f); S.effects.ring(new THREE.Vector3(me.body.x, me.body.y + 0.1, me.body.z), 0xffd23f, 1.6, 0.6, true); }
  if (w.cast === 'blink') { S.effects.burst(o.clone(), null, col, 22, 6, 0.1, 0.6, 0); S.effects.ring(new THREE.Vector3(me.body.x, me.body.y + 0.1, me.body.z), col, 1.4, 0.5, true); }
  if (w.cast === 'turret') { const p = eyePos().add(new THREE.Vector3(...d).multiplyScalar(2.2)); S.effects.burst(p, null, 0x6affc0, 18, 3, 0.1, 0.7, 1); S.effects.ring(p, 0x6affc0, 1.2, 0.5); }
}
const ELEM_LOCAL = { fire: 0xff6a1a, bolt: 0x5ad0ff, ice: 0x9fe8ff, arcane: 0xb06bff, heal: 0x4fe08a, shield: 0xffd23f, tele: 0xc06bff, summon: 0x6affc0 };
function pulseOrb(orbArr, s = 1.8) { for (const o of orbArr) { o.scale.setScalar(s); } setTimeout(() => { for (const o of orbArr) o.scale.setScalar(1); }, 110); }
function healAura(x, y, z, col) { const p = new THREE.Vector3(x, y + 0.5, z); for (let i = 0; i < 16; i++) S.effects.burst(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 1.6, (Math.random() - 0.5) * 0.8)), new THREE.Vector3(0, 1, 0), col, 1, 0.6, 0.06, 0.8, -1.5); }

// ── Grenades à lancer ────────────────────────────────────────────────────────
function throwGrenade(under) {
  const me = S.me, now = performance.now();
  if (!me.alive || S.ui !== null || now < me.nextThrow || now < me.drawUntil) return;
  const type = me.curNade;
  if (!(me.nades[type] > 0)) { A.playClick(null, 1.2); return; }
  me.nextThrow = now + 650;
  me.nades = { ...me.nades, [type]: me.nades[type] - 1 }; // prédiction, le serveur corrige
  const o = eyePos();
  const d = dirFromAngles(me.yaw, me.pitch);
  send({ t: 'nade', g: type, o: [o.x, o.y, o.z], d, under: !!under, rt: viewTime() });
  A.playShot('throw');
  if (S.vm) { S.vm.swing = 1; S.vm.swingHeavy = false; }
  refreshNadeBelt();
}
function selectNade(type) {
  if (!GRENADES.includes(type)) return;
  S.me.curNade = type;
  refreshNadeBelt();
  A.playUi && A.playClick(null, 0.9);
}
function refreshNadeBelt() {
  const me = S.me;
  if (!me.alive || !me.nades || !Object.keys(me.nades).length) { hud.nades([]); return; }
  hud.nades(GRENADES.map((t) => ({ type: t, icon: NADE_ICON[t], key: NADE_KEY[t], count: me.nades[t] || 0, sel: me.curNade === t })));
}

function updateWeapon(dt) {
  const me = S.me;
  if (!me.alive || S.state !== 'playing') return;
  const w = WEAPONS[me.cur];
  const now = performance.now();
  // régénération du mana (local, le serveur corrige)
  me.mana = Math.min(me.manaMax, me.mana + PLAYER.manaRegen * dt);
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
  if (w.kind === 'magic') {
    const sw = WEAPONS[me.curSpell] || w; // sort actif de la barre
    if (S.mouse.left && !me.firedPress && now >= me.nextFire) {
      me.firedPress = true;
      if (me.mana < sw.mana) { A.playClick(null, 0.8); me.nextFire = now + 250; refreshSpellBelt(); return; }
      castSpell(sw);
    }
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
  const slow = me.slowUntil > performance.now() ? me.slowMul : 1;
  stepBody(b, input, dt, S.map.boxes, weaponSpeed(me.cur, me.scoped > 0) * boost * slow);
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

// ════════════════════════════════════════════════════════════════════════
// Killcam (mini-replay de ta mort, option MLG)
// ════════════════════════════════════════════════════════════════════════
const REC_HZ = 30, REC_SECONDS = 3.2;
function recordFrame() {
  if (!S.me) return;
  const now = performance.now();
  if (S._recLast && now - S._recLast < 1000 / REC_HZ) return;
  S._recLast = now;
  const me = S.me;
  const ents = [{ id: me.id, x: me.body.x, y: me.body.y, z: me.body.z, yaw: me.yaw, pitch: me.pitch, ct: me.body.crouchT || 0, wid: me.cur, air: !me.body.onGround, alive: me.alive, me: true }];
  for (const p of S.players.values()) ents.push({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, ct: p.ct, wid: p.wid, air: !!(p.flags & 16), alive: p.alive });
  S.recBuf.push({ t: now, ents });
  const cutoff = now - REC_SECONDS * 1000;
  while (S.recBuf.length && S.recBuf[0].t < cutoff) S.recBuf.shift();
}
const entAt = (frame, id) => frame.ents.find((e) => e.id === id);

function startKillcam(killerId) {
  const st = settings();
  if (!st.killcam || killerId === S.me.id || S.recBuf.length < 3) return false;
  const frames = S.recBuf.slice();
  if (!entAt(frames[frames.length - 1], killerId)) return false; // besoin du tueur enregistré
  if (!S.meAvatar) { S.meAvatar = buildAvatar(S.cfg.teams ? (S.me.team === 0 ? 0 : 1) : ((S.me.color || 0) % 6)); S.scene.add(S.meAvatar); }
  const dur = Math.min(2.6, Math.max(1.3, (S.cfg.respawn || 2) * 0.95));
  S.killcam = { frames, t0: frames[0].t, t1: frames[frames.length - 1].t, start: performance.now(), dur, killerId, mlg: !!st.mlg, hitAcc: 0, finished: false };
  if (S.vm) S.vm.root.visible = false;
  if (S.killcam.mlg) A.playAirhorn();
  hud.killcam(true, `tué par <b style="color:${colorOf(killerId)}">${esc(nameOf(killerId))}</b>`);
  return true;
}

function sampleFrames(frames, rt) {
  let a = frames[0], b = frames[frames.length - 1];
  for (let i = 0; i < frames.length - 1; i++) { if (frames[i].t <= rt && frames[i + 1].t >= rt) { a = frames[i]; b = frames[i + 1]; break; } }
  const k = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 0;
  return { a, b, k };
}

function updateKillcam(dt) {
  const kc = S.killcam;
  const el = (performance.now() - kc.start) / 1000;
  const inMontage = kc.mlg && el >= kc.dur;
  const prog = inMontage ? 1 : Math.min(1, el / kc.dur);
  const rt = kc.t0 + (kc.t1 - kc.t0) * prog;
  const { a, b, k } = sampleFrames(kc.frames, rt);
  const lerp = (u, v) => u + (v - u) * k;
  const yawLerp = (u, v) => { let d = v - u; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return u + d * k; };
  for (const ea of a.ents) {
    const av = ea.me ? S.meAvatar : (S.players.get(ea.id) && S.players.get(ea.id).avatar);
    if (!av) continue;
    if (!ea.alive && !ea.me) { av.visible = false; continue; }
    const eb = entAt(b, ea.id) || ea;
    av.visible = true;
    av.position.set(lerp(ea.x, eb.x), lerp(ea.y, eb.y), lerp(ea.z, eb.z));
    av.rotation.y = yawLerp(ea.yaw, eb.yaw);
    const kind = WEAPONS[ea.wid] ? WEAPONS[ea.wid].kind : 'rifle';
    const deadK = ea.me ? Math.max(-1, (prog - 0.82) / 0.18) : -1; // la victime s'effondre à la fin
    poseAvatar(av, { walk: performance.now() / 120, move: 0, crouch: ea.ct, air: ea.air, pitch: ea.pitch || 0, kind, dead: deadK });
    if (ea.me && S.players.get(ea.id)) { /* rien */ }
  }
  // caméra derrière le tueur, regarde la victime
  const kA = entAt(a, kc.killerId), vA = entAt(a, S.me.id), kB = entAt(b, kc.killerId) || kA, vB = entAt(b, S.me.id) || vA;
  const cam = S.camera;
  if (kA && vA) {
    const kpos = new THREE.Vector3(lerp(kA.x, kB.x), lerp(kA.y, kB.y) + 1.7, lerp(kA.z, kB.z));
    const vpos = new THREE.Vector3(lerp(vA.x, vB.x), lerp(vA.y, vB.y) + 1.1, lerp(vA.z, vB.z));
    const dir = vpos.clone().sub(kpos); dir.y = 0; if (dir.lengthSq() < 1e-3) dir.set(0, 0, 1); dir.normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const camPos = kpos.clone().addScaledVector(dir, -1.5).addScaledVector(right, 0.9).add(new THREE.Vector3(0, 0.3, 0));
    if (el < 0.05) cam.position.copy(camPos); else cam.position.lerp(camPos, 1 - Math.exp(-dt * (inMontage ? 6 : 10)));
    cam.lookAt(vpos);
    let fov = vfovFrom(settings().fov);
    if (inMontage) {
      const s = kc.shake || 0;
      cam.position.x += (Math.random() - 0.5) * s * 0.4;
      cam.position.y += (Math.random() - 0.5) * s * 0.4;
      cam.rotateZ((Math.random() - 0.5) * s * 0.12);
      fov *= 0.72 - s * 0.12; // cadrage serré + pulsation
    } else if (kc.mlg && prog > 0.8) fov *= 1 - (prog - 0.8) / 0.2 * 0.4;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    A.setListener(cam.position, fwd, new THREE.Vector3(0, 1, 0));
  }
  // phase replay MLG : hitmarkers « ding » de plus en plus serrés
  if (kc.mlg && !inMontage) {
    kc.hitAcc += dt;
    const dens = 0.32 - prog * 0.2;
    if (prog > 0.25 && kc.hitAcc > dens) { kc.hitAcc = 0; hud.hitmarker(true, prog > 0.8); A.playDing(1 + prog * 0.4); }
  }
  if (inMontage) {
    driveMlg(el - kc.dur, kc, dt);
    if (el - kc.dur >= MONTAGE_DUR) { endKillcam(); return; }
  } else if (!kc.mlg && el >= kc.dur + 0.25) { endKillcam(); return; }
}

const MONTAGE_DUR = 3.6;
const MLG_TEXTS = ['REKT', 'MLG PRO', '360 NO SCOPE', 'WOW', 'GET REKT', 'NO SCOPE', 'ILLUMINATI CONFIRMED'];
const MLG_SUBS = ['DORITOS', 'MOUNTAIN DEW', 'WOMBO COMBO', 'xX_PRO_Xx', 'DEAL WITH IT', 'SKRRT'];
const MLG_FLY = ['🔺', '🥤', '🌮', '💵', '🔥', '👌', '💯', '🌈'];
function driveMlg(mt, kc, dt) {
  if (!kc.mStarted) {
    kc.mStarted = true;
    hud.killcam(false); // le bandeau laisse place au montage
    hud.mlgStart(); hud.mlgText('GET REKT', '360 NO SCOPE'); hud.mlgFlash('#ff00e6');
    A.playMlgDrop(); A.playAirhorn();
    kc.beat = 0; kc.nextBeat = 0.55; kc.nextFling = 0.1; kc.nextHorn = 1.5; kc.shake = 0.9;
  }
  kc.shake = Math.max(0, (kc.shake || 0) - dt * 3);
  if (mt >= kc.nextBeat && mt < MONTAGE_DUR - 0.3) {
    kc.beat++; kc.nextBeat = mt + 0.5;
    hud.mlgText(MLG_TEXTS[kc.beat % MLG_TEXTS.length], MLG_SUBS[kc.beat % MLG_SUBS.length]);
    hud.mlgFlash(['#ff00e6', '#00e5ff', '#ffe600', '#37ff00'][kc.beat % 4]);
    hud.hitmarker(true, true); A.playDing(1 + (kc.beat % 3) * 0.25);
    kc.shake = 0.6;
    if (kc.beat % 3 === 0) A.playAirhorn();
  }
  if (mt >= kc.nextFling) { kc.nextFling = mt + 0.2; hud.mlgFling(MLG_FLY[Math.floor(Math.random() * MLG_FLY.length)]); }
  if (mt >= kc.nextHorn) { kc.nextHorn = mt + 1.3; A.playAirhorn(); }
}

function endKillcam() {
  if (!S.killcam) return;
  S.killcam = null;
  hud.killcam(false); hud.mlgStop();
  if (S.meAvatar) S.meAvatar.visible = false;
  const cam = S.camera, fov = vfovFrom(settings().fov);
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  if (S.pendingDeath) { hud.death(true, S.pendingDeath); S.pendingDeath = null; }
  if (S.pendingSpawn) { const m = S.pendingSpawn; S.pendingSpawn = null; applySpawn(m); }
}

function applySpawn(m) {
  S.pendingDeath = null;
  const me = S.me, b = me.body;
  b.x = m.x; b.y = m.y; b.z = m.z; b.vx = b.vy = b.vz = 0; b.crouch = false; b.crouchT = 0; b.onGround = true;
  me.yaw = m.yaw; me.pitch = 0;
  me.alive = true; me.eliminated = false; me.hp = m.hp; me.spawnSeq = m.seq;
  me.protectUntil = performance.now() + m.protect * 1000;
  me.punch = 0; me.punchYaw = 0; me.scoped = 0; me.rezoomAt = 0;
  me.gg = m.gg || 0;
  me.mana = m.mana !== undefined ? m.mana : PLAYER.manaMax;
  me.nades = m.nades ? { ...m.nades } : {};
  if (!GRENADES.includes(me.curNade) || !(me.nades[me.curNade] > 0)) { me.curNade = GRENADES.find((t) => me.nades[t] > 0) || 'he'; }
  me.slowUntil = 0; me.slowMul = 1; me.shield = 0;
  hud.setShield(0);
  refreshNadeBelt();
  giveWeapons(m.weapons, true);
  hud.death(false);
  hud.scope(0);
  if (S.cfg.ladder) hud.center(`Niveau ${me.gg + 1}`, esc(WEAPONS[m.weapons[0]].name), 1500, '#ffb347');
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
  const isMagic = me.alive && WEAPONS[me.cur] && WEAPONS[me.cur].kind === 'magic';
  // en magie, le nom affiché est celui du sort actif
  const dispId = isMagic && MAGIC.includes(me.curSpell) ? me.curSpell : me.cur;
  hud.setAmmo(dispId, a.mag, a.res, me.weapons, me.cur);
  hud.setMana(me.mana, me.manaMax, isMagic);
  hud.setShield(me.alive ? me.shield : 0);
  if (me.alive && me.nades && Object.keys(me.nades).length) refreshNadeBelt(); else hud.nades([]);
  if (isMagic) refreshSpellBelt(); else hud.spells([]);
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
  } else if (S.cfg.br) {
    hud.setTop(`${myRow ? myRow[1] : 0}<small>TES KILLS</small>`, `${brAliveCount()}<small>EN VIE</small>`, `${S.cfg.short} · dernier survivant`);
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
  if (!me.alive && S.state === 'playing') {
    if (me.eliminated) hud.deathText(`Éliminé — mode spectateur · ${brAliveCount()} survivant(s)`);
    else hud.deathTimer(Math.max(0, (me.respawnAt - performance.now()) / 1000));
  }
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
  recordFrame();
  if (S.killcam) {
    if (!S._kcManual) updateKillcam(dt);
    updateProjectiles(dt);
    updateWorldFx(dt);
    S.effects.update(dt);
    updateHud(dt);
    S.pipeline.render(false, dt);
    return;
  }
  updateMovement(dt);
  updateWeapon(dt);
  sendState(dt);
  updateRemotes(dt);
  updateAimTarget();
  updateCamera(dt);
  updateViewmodel(dt);
  updateProjectiles(dt);
  updateWorldFx(dt);
  updateBRClient(dt);
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
    // bâton sorti : la molette change de sort (barre), sinon d'arme
    if (WEAPONS[S.me.cur] && WEAPONS[S.me.cur].kind === 'magic') { selectSpell(e.deltaY > 0 ? 1 : -1); return; }
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
    // grenades : G lance, 4-7 choisissent le type
    if (e.code === 'KeyG') throwGrenade(false);
    if (e.code === 'Digit4' || e.code === 'Numpad4') selectNade('he');
    if (e.code === 'Digit5' || e.code === 'Numpad5') selectNade('flash');
    if (e.code === 'Digit6' || e.code === 'Numpad6') selectNade('smoke');
    if (e.code === 'Digit7' || e.code === 'Numpad7') selectNade('molotov');
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
      const info = w.kind === 'magic' ? `${w.mana} mana` : `${w.damage || '?'} dég.`;
      b.innerHTML = `${esc(w.name)}<small>${it ? esc(SKINS[it.skin].name) : 'Par défaut'} · ${info}</small>`;
      b.onclick = () => {
        lo[key] = id;
        send({ t: 'loadout', lo });
        buildLoadoutUI();
        A.playUi();
      };
      el.appendChild(b);
    }
  };
  mk(PRIMARIES.filter((id) => !MAGIC.includes(id)), $('lo-prim'), 'primary');
  mk(SECONDARIES, $('lo-sec'), 'secondary');
  // ligne « mêlée »
  let mel = document.getElementById('lo-mel');
  if (!mel) {
    const row = document.createElement('div');
    row.className = 'lo-row';
    row.innerHTML = '<h3>Corps à corps</h3><div id="lo-mel" class="lo-list"></div>';
    document.getElementById('lo-sec').parentElement.after(row);
    mel = document.getElementById('lo-mel');
  }
  mk(MELEES, mel, 'melee');
  // ligne « magie » (remplace l'arme principale)
  let mag = document.getElementById('lo-mag');
  if (!mag) {
    const row = document.createElement('div');
    row.className = 'lo-row';
    row.innerHTML = '<h3>Magie ✦ <small style="opacity:.6;font-size:12px">(remplace l\'arme principale — en jeu tu as les 8 sorts, molette pour changer)</small></h3><div id="lo-mag" class="lo-list"></div>';
    document.getElementById('lo-prim').parentElement.after(row);
    mag = document.getElementById('lo-mag');
  }
  mk(MAGIC, mag, 'primary');
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
    if (S.cfg.br) setupBR(m.zone, m.loot); else clearBR();
    S.me.alive = false; S.me.eliminated = false;
    hud.endScreen(false);
    hud.death(false);
    hud.center(`${esc(S.cfg.name)}`, `${esc(MAPS[m.map].name)} — c'est parti !`, 2500);
    $('killfeed').innerHTML = '';
    if (S.locked === false && S.ui === null) setUi('pause');
  });
  on('spawn', (m) => {
    if (!S.active) return;
    // pendant un montage MLG on diffère la réapparition jusqu'à la fin
    if (S.killcam && S.killcam.mlg) { S.pendingSpawn = m; return; }
    if (S.killcam) endKillcam();
    applySpawn(m);
  });
  on('weapons', (m) => {
    if (!S.active) return;
    if (m.gg !== undefined) {
      S.me.gg = m.gg;
      hud.center(`Niveau ${m.gg + 1} / ${GUNGAME_LADDER.length}`, esc(WEAPONS[m.list[0]].name), 1600, '#ffb347');
      A.playKill(true);
    }
    giveWeapons(m.list, m.refill);
    if (m.pickup && WEAPONS[m.pickup]) { hud.center('', `Ramassé : ${esc(WEAPONS[m.pickup].name)}`, 1100, '#7af2ff'); A.playReveal('restricted'); }
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
    if (m.w === 'pan' && m.hit) A.playBonk(pos); else if (m.w === 'saber') A.playSaber(pos, true); else A.playKnife(pos, m.hit);
  });
  on('pj', (m) => { if (S.active) spawnProjectile(m); });
  on('pb', (m) => {
    const p = projs.get(m.id);
    if (!p) return;
    p.mesh.position.set(m.p[0], m.p[1], m.p[2]);
    p.v.set(m.v[0], m.v[1], m.v[2]);
    A.playImpact({ x: m.p[0], y: m.p[1], z: m.p[2] });
  });
  on('px', (m) => { if (S.active) projectileHit(m); });
  on('kb', (m) => {
    if (!S.active || !S.me.alive) return;
    const b = S.me.body;
    b.vx += m.v[0]; b.vz += m.v[2]; b.vy = Math.max(b.vy, m.v[1]); b.onGround = false;
  });
  on('nades', (m) => { if (!S.active) return; S.me.nades = m.n || {}; if (!(S.me.nades[S.me.curNade] > 0)) { const t = GRENADES.find((x) => S.me.nades[x] > 0); if (t) S.me.curNade = t; } refreshNadeBelt(); });
  on('mana', (m) => { if (S.active) S.me.mana = m.m; });
  on('heal', (m) => { if (!S.active) return; S.me.hp = m.hp; healAura(S.me.body.x, S.me.body.y, S.me.body.z, 0x4fe08a); A.playShot && A.playHit(false); });
  on('shield', (m) => { if (!S.active) return; S.me.shield = m.s; hud.setShield(m.s); });
  on('slow', (m) => { if (!S.active) return; S.me.slowUntil = performance.now() + m.dur; S.me.slowMul = m.mul; S.me.frostUntil = performance.now() + m.dur; });
  on('tp', (m) => { if (!S.active) return; const b = S.me.body; const from = new THREE.Vector3(b.x, b.y + 1, b.z); b.x = m.x; b.z = m.z; if (m.y !== undefined) b.y = m.y; b.vx = b.vz = 0; S.effects.burst(from, null, 0xc06bff, 14, 4, 0.08, 0.5, 0); S.effects.burst(new THREE.Vector3(b.x, b.y + 1, b.z), null, 0xc06bff, 14, 4, 0.08, 0.5, 0); });
  on('flash', (m) => { if (!S.active) return; hud.flash(m.dur, m.i); A.playFlashbang(null, m.i); });
  on('smoke', (m) => { if (!S.active) return; if (m.add) spawnSmoke(m); else killSmoke(m.id); });
  on('fire', (m) => { if (!S.active) return; if (m.add) spawnFireArea(m); else killFire(m.id); });
  on('turret', (m) => { if (!S.active) return; if (m.add) spawnTurret(m); else killTurret(m.id); });
  on('zone', (m) => { if (!S.active || !m.z) return; S.zone = m.z; applyZone(); });
  on('loot', (m) => { if (!S.active) return; if (m.add === false) removeLoot(m.id, false); });
  on('tfx', (m) => { if (!S.active) return; const tr = turrets.get(m.id); if (tr) { const from = tr.mesh.position.clone().setY(tr.mesh.position.y + 0.55); S.effects.tracer(from, new THREE.Vector3(m.e[0], m.e[1], m.e[2]), 300, 0x6affc0); A.playShot('smg', tr.mesh.position); } });
  on('nadefx', (m) => { const p = S.players.get(m.id); if (p) A.playShot('throw', { x: p.x, y: p.y + 1.4, z: p.z }); });
  on('cfx', (m) => {
    const p = S.players.get(m.id); const w = WEAPONS[m.w];
    if (!p || !w) return;
    const col = ELEM_LOCAL[w.element] || 0xb06bff;
    let from = new THREE.Vector3(m.o[0], m.o[1], m.o[2]);
    if (p.weapon && p.avatar && p.avatar.visible) { p.weapon.updateMatrixWorld(true); p.weapon.userData.muzzle.getWorldPosition(from); }
    S.effects.burst(from, null, col, 10, 3, 0.08, 0.45, 0);
    S.effects.castFlash(from, col);
    S.effects.magicCircle(new THREE.Vector3(p.x, p.y + 0.06, p.z), col, { r: 1.4, dur: 0.6, up: true, spin: 5 });
    const dir = w.cast === 'proj' || w.cast === 'beam' || w.cast === 'chain';
    if (dir) S.effects.magicCircle(from, col, { r: 0.8, dur: 0.5, dir: new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw || 0), spin: 8 });
    A.playShot(w.sound, from);
  });
  on('sp', (m) => {
    if (!S.active) return;
    if (m.k === 'chain') { for (let i = 0; i < m.pts.length - 1; i++) { const a = new THREE.Vector3(...m.pts[i]), b = new THREE.Vector3(...m.pts[i + 1]); S.effects.beam(a, b, 0x5ad0ff); } const end = new THREE.Vector3(...m.pts[m.pts.length - 1]); S.effects.ring(end, 0x5ad0ff, 1.2, 0.4); A.playShot('cast_bolt', new THREE.Vector3(...m.pts[0])); }
    else if (m.k === 'beam') { const e = new THREE.Vector3(...m.e); S.effects.beam(new THREE.Vector3(...m.o), e, 0x9fe8ff); S.effects.ring(e, 0x9fe8ff, 1, 0.35); }
    else if (m.k === 'heal') { const p = m.id === S.me.id ? S.me.body : S.players.get(m.id); if (p) { healAura(p.x, p.y, p.z, 0x4fe08a); S.effects.magicCircle(new THREE.Vector3(p.x, p.y + 0.06, p.z), 0x4fe08a, { r: 2.4, dur: 0.9, up: true, spin: 3 }); } }
    else if (m.k === 'shield') { const p = m.id === S.me.id ? S.me.body : S.players.get(m.id); if (p) { healAura(p.x, p.y, p.z, 0xffd23f); S.effects.magicCircle(new THREE.Vector3(p.x, p.y + 0.06, p.z), 0xffd23f, { r: 2, dur: 0.9, up: true, spin: 3 }); } }
    else if (m.k === 'blink') { const pos = new THREE.Vector3(...m.p); S.effects.burst(pos.clone().setY(m.p[1] + 1), null, 0xc06bff, 18, 5, 0.1, 0.5, 0); S.effects.magicCircle(pos.clone().setY(m.p[1] + 0.06), 0xc06bff, { r: 1.5, dur: 0.6, up: true, spin: 7 }); }
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
    if (m.zone) return; // dégâts de zone : pas de son/flinch/direction
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
    const zoneDeath = m.w === 'zone';
    hud.killfeed({
      kn: zoneDeath ? '☁ la zone' : nameOf(m.k), kc: zoneDeath ? '#8fd8ff' : colorOf(m.k), vn: nameOf(m.v), vc: colorOf(m.v), wn: kw ? kw.name : (zoneDeath ? '' : m.w),
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
      me.eliminated = !!S.cfg.br;
      S.killer = m.k;
      S.deathPos = new THREE.Vector3(me.body.x, me.body.y + 1.2, me.body.z);
      const kp = S.players.get(m.k);
      const sk = kp && kp.skins[m.w];
      const place = me.eliminated ? brAliveCount() : 0;
      const killerLine = zoneDeath ? '☁ Éliminé par la zone'
        : (m.k === me.id ? 'Suicide' : `Tué par <b style="color:${colorOf(m.k)}">${esc(nameOf(m.k))}</b> avec <b>${esc(kw ? kw.name : m.w)}</b>${m.hs ? ' (headshot)' : ''}${m.k !== me.id ? ` — il lui reste ${m.kh} PV` : ''}`);
      const deathInfo = {
        killer: me.eliminated ? `${killerLine}<br><span style="color:#2ee6c0">${place}ᵉ place — il reste ${place} survivant(s)</span>` : killerLine,
        skin: sk ? `Skin : ${esc(itemFullName(sk))}` : '',
      };
      // killcam (mini-replay) : on diffère le panneau de mort jusqu'à la fin
      if (startKillcam(m.k)) S.pendingDeath = deathInfo;
      else hud.death(true, deathInfo);
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
    if (S.cfg.br) title = m.winner === S.me.id ? '👑 VICTOIRE ROYALE !' : `Victoire Royale de ${esc(m.winnerName || '?')}`;
    else if (m.winTeam >= 0) title = `Victoire : ${TEAM_NAMES[m.winTeam]}`;
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
    throwNade(type) { S.me.curNade = type; throwGrenade(false); },
    selectNade(type) { selectNade(type); },
    castNow() { const w = WEAPONS[S.me.cur]; if (w.kind === 'magic') { S.me.firedPress = false; S.me.nextFire = 0; castSpell(WEAPONS[S.me.curSpell] || w); } },
    selectSpell(id) { selectSpell(id); return S.me.curSpell; },
    settings() { return settings(); },
    kcManual(v) { S._kcManual = v; },
    mlgPreview() { hud.mlgStart(); hud.mlgText('GET REKT', '360 NO SCOPE'); for (let i = 0; i < 9; i++) hud.mlgFling(MLG_FLY[i % MLG_FLY.length]); hud.mlgFlash('#ff00e6'); },
    brZone(r) { if (S.zone) { S.zone.r = r; applyZone(); } },
    brNearestLoot() { let best = null, bd = 1e9; for (const g of lootMeshes.values()) { const d = Math.hypot(g.position.x - S.me.body.x, g.position.z - S.me.body.z); if (d < bd) { bd = d; best = g; } } return best ? { x: best.position.x, y: best.position.y, z: best.position.z } : null; },
    kcRender(prog) { const kc = S.killcam; if (!kc) return false; kc.start = performance.now() - prog * kc.dur * 1000; if (prog < 0.97) kc.finished = false; updateKillcam(0.016); S.pipeline.render(false, 0.016); return true; },
    me() { return S.me; },
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
