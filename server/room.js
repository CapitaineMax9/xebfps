// Salle de jeu : gère un match, ses joueurs (humains + bots), les modes et le combat.
import { TICK_RATE, SNAPSHOT_RATE, MAX_REWIND, PLAYER, CREDITS } from '../shared/constants.js';
import { MAPS } from '../shared/maps.js';
import { MODES, ggLevelWeapon, GUNGAME_LADDER } from '../shared/modes.js';
import { WEAPONS, PRIMARIES, SECONDARIES, MELEES, MAGIC, GRENADES, GRENADE_STOCK, minFireDelay } from '../shared/weapons.js';
import { SKINS } from '../shared/skins.js';
import { raycastMap, rayPlayer, lineOfSight, HIT_HEAD, HIT_MULT } from '../shared/raycast.js';
import { createBody, eyeHeight, collides } from '../shared/physics.js';
import { NavGrid } from './nav.js';
import { BotBrain, BOT_NAMES } from './bot.js';
import * as ACC from './accounts.js';

export const WEAPON_IDS = Object.keys(WEAPONS);
const navCache = {};
function navFor(mapId) {
  if (!navCache[mapId]) navCache[mapId] = new NavGrid(MAPS[mapId]);
  return navCache[mapId];
}

const now = () => performance.now();
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
// un joueur avec au moins un outil privé actif ne compte pas dans le classement
const cheating = (p) => {
  const on = !!p.cheats && Object.values(p.cheats).some(Boolean);
  if (on) p.cheatedMatch = true;
  return on;
};
let nextPlayerId = 1;

function sanitizeSkins(skins) {
  const out = {};
  if (!skins || typeof skins !== 'object') return out;
  for (const wid of Object.keys(skins)) {
    if (!has(WEAPONS, wid)) continue;
    const s = skins[wid];
    if (!s || typeof s !== 'object') continue;
    const def = has(SKINS, s.skin) ? SKINS[s.skin] : null;
    if (!def || def.weapon !== wid) continue;
    out[wid] = {
      skin: def.id,
      float: Math.min(1, Math.max(0, Number(s.float) || 0)),
      seed: Math.floor(Number(s.seed) || 0) % 1000,
      st: !!s.st,
      kills: Math.max(0, Math.floor(Number(s.kills) || 0)),
    };
  }
  return out;
}

export class Player {
  constructor(name, ws = null) {
    this.id = nextPlayerId++;
    this.name = name;
    this.ws = ws;
    this.isBot = !ws;
    this.team = -1;
    this.body = createBody(0, 0, 0);
    this.yaw = 0; this.pitch = 0;
    this.alive = false;
    this.hp = PLAYER.maxHp;
    this.kills = 0; this.deaths = 0; this.hs = 0; this.assists = 0;
    this.weapons = ['knife'];
    this.cur = 'knife';
    this.loadout = { primary: 'ak47', secondary: 'usp' };
    this.skins = {};
    this.respawnAt = 0;
    this.spawnedAt = 0;
    this.protectUntil = 0;
    this.history = [];
    this.lastShot = {};
    this.ggLevel = 0; this.ggKills = 0;
    this.ping = 0;
    this.scoped = false;
    this.spawnSeq = 0;
    this.hasShot = false;
    this.lastFired = 0;
    this.damageBy = new Map();
    this.color = Math.floor(Math.random() * 6);
    this.streak = 0;
    this.cheats = {};
    this.mana = PLAYER.manaMax;
    this.nades = {};
    this.slowUntil = 0; this.slowMul = 1;
    this.shield = 0; this.shieldUntil = 0;
    this.blindUntil = 0;
  }
  get x() { return this.body.x; } get y() { return this.body.y; } get z() { return this.body.z; }
  eye() { return this.body.y + eyeHeight(this.body); }
  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
    }
  }
  info() {
    return { id: this.id, name: this.name, team: this.team, bot: this.isBot, skins: this.skins, color: this.color };
  }
}

export class Room {
  constructor(id, opts) {
    this.id = id;
    this.mode = has(MODES, opts.mode) ? opts.mode : 'ffa';
    this.cfg = MODES[this.mode];
    this.name = opts.name || this.cfg.name;
    this.maxPlayers = Math.max(2, Math.min(16, opts.maxPlayers || 12));
    this.botTarget = Math.max(0, Math.min(this.maxPlayers - 1, opts.bots ?? 5));
    this.difficulty = ['easy', 'normal', 'hard'].includes(opts.difficulty) ? opts.difficulty : 'normal';
    this.persistent = !!opts.persistent;
    this.mapRotation = has(MAPS, opts.map) && this.cfg.maps.includes(opts.map) ? [opts.map, ...this.cfg.maps.filter((m) => m !== opts.map)] : this.cfg.maps.slice();
    this.mapIndex = 0;
    this.mapId = this.mapRotation[0];
    this.players = new Map();
    this.projectiles = [];
    this.projSeq = 0;
    this.fires = [];
    this.smokes = [];
    this.turrets = [];
    this.fxSeq = 0;
    this.state = 'idle';
    this.matchStart = 0;
    this.matchEnd = 0;
    this.nextMatchAt = 0;
    this.teamScore = [0, 0];
    this.snapAcc = 0;
    this.boardAcc = 0;
    this.emptySince = now();
    this.botNameIdx = Math.floor(Math.random() * BOT_NAMES.length);
  }

  get map() { return MAPS[this.mapId]; }
  get nav() { return navFor(this.mapId); }
  humans() { let n = 0; for (const p of this.players.values()) if (!p.isBot) n++; return n; }
  bots() { let n = 0; for (const p of this.players.values()) if (p.isBot) n++; return n; }

  summary() {
    return {
      id: this.id, name: this.name, mode: this.mode, map: this.mapId,
      humans: this.humans(), bots: this.bots(), max: this.maxPlayers, difficulty: this.difficulty,
    };
  }

  broadcast(obj, except = null) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p === except || !p.ws || p.ws.readyState !== 1) continue;
      try { p.ws.send(s); } catch { /* ignore */ }
    }
  }

  isFull() { return this.humans() >= this.maxPlayers; }

  // ── Gestion des joueurs ───────────────────────────────────────────────────
  addHuman(ws, acc) {
    const p = new Player(acc.name, ws);
    p.acc = acc;
    p.skins = sanitizeSkins(ACC.equippedSkins(acc));
    this.setLoadout(p, acc.loadout, false);
    if (this.state === 'idle') this.startMatch(false);
    this.assignTeam(p);
    this.players.set(p.id, p);
    this.balanceBots();
    p.send({
      t: 'joined', you: p.id, room: this.summary(), mode: this.mode, map: this.mapId,
      players: [...this.players.values()].map((q) => q.info()),
      endsAt: this.matchEnd, serverTime: now(), state: this.state, teamScore: this.teamScore,
    });
    this.broadcast({ t: 'pjoin', p: p.info() }, p);
    this.broadcast({ t: 'chat', sys: true, msg: `${p.name} a rejoint la partie.` });
    this.scheduleRespawn(p, 0.5);
    this.sendBoard();
    return p;
  }

  addBot() {
    const name = 'BOT ' + BOT_NAMES[this.botNameIdx++ % BOT_NAMES.length];
    const p = new Player(name, null);
    p.brain = new BotBrain(this, p, this.difficulty);
    // Les bots ont aussi des skins
    const skins = {};
    for (const s of Object.values(SKINS)) {
      if (s.weapon === 'knife') continue;
      if (Math.random() < 0.35 && !skins[s.weapon]) skins[s.weapon] = { skin: s.id, float: Math.random() * (s.maxF - s.minF) + s.minF, seed: Math.floor(Math.random() * 1000), st: false, kills: 0 };
    }
    if (Math.random() < 0.25) {
      const knives = Object.values(SKINS).filter((s) => s.weapon === 'knife');
      const k = knives[Math.floor(Math.random() * knives.length)];
      skins.knife = { skin: k.id, float: Math.random() * (k.maxF - k.minF) + k.minF, seed: Math.floor(Math.random() * 1000), st: false, kills: 0 };
    }
    p.skins = skins;
    const prim = ['ak47', 'm4a1s', 'm4a4', 'awp', 'ak47', 'm4a4', 'sg553', 'mp9', 'p90', 'bizon', 'mp5sd', 'ssg08', 'g3sg1', 'awp', 'nova', 'mag7', 'famas', 'galil', 'aug', 'mac10', 'mp7', 'ump45', 'm249', 'negev', 'xm1014', 'sawedoff', 'scar20', 'railgun', 'rpg', 'gl', 'minigun', 'crossbow', 'confetti'];
    const secs = ['usp', 'glock', 'deagle', 'fiveseven', 'tec9', 'r8', 'dualies'];
    p.loadout = { primary: prim[Math.floor(Math.random() * prim.length)], secondary: secs[Math.floor(Math.random() * secs.length)], melee: Math.random() < 0.15 ? 'saber' : Math.random() < 0.25 ? 'pan' : 'knife' };
    this.assignTeam(p);
    this.players.set(p.id, p);
    this.broadcast({ t: 'pjoin', p: p.info() });
    this.scheduleRespawn(p, 0.3 + Math.random());
    return p;
  }

  removePlayer(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    for (const tr of this.turrets) if (tr.owner === p) tr.owner = null;
    this.broadcast({ t: 'pleave', id: p.id });
    if (!p.isBot) {
      this.broadcast({ t: 'chat', sys: true, msg: `${p.name} a quitté la partie.` });
      this.balanceBots();
      if (this.humans() === 0) {
        this.emptySince = now();
        // plus personne : on retire les bots et on met la salle en veille
        for (const q of [...this.players.values()]) if (q.isBot) this.players.delete(q.id);
        this.state = 'idle';
      }
    }
  }

  assignTeam(p) {
    if (!this.cfg.teams) { p.team = -1; return; }
    const c = [0, 0];
    for (const q of this.players.values()) if (q.team >= 0) c[q.team]++;
    p.team = c[0] <= c[1] ? 0 : 1;
  }

  balanceBots() {
    if (this.humans() === 0) return;
    const want = Math.max(0, Math.min(this.botTarget, this.maxPlayers) - this.humans());
    let cur = this.bots();
    while (cur < want) { this.addBot(); cur++; }
    while (cur > want) {
      // retire un bot de l'équipe la plus nombreuse
      let victim = null;
      if (this.cfg.teams) {
        const c = [0, 0];
        for (const q of this.players.values()) if (q.team >= 0) c[q.team]++;
        const big = c[0] >= c[1] ? 0 : 1;
        for (const q of this.players.values()) if (q.isBot && q.team === big) { victim = q; break; }
      }
      if (!victim) for (const q of this.players.values()) if (q.isBot) { victim = q; break; }
      if (!victim) break;
      this.removePlayer(victim);
      cur--;
    }
  }

  setLoadout(p, lo, applyNow = true) {
    if (!lo) return;
    if (typeof lo !== 'object') return;
    const prim = PRIMARIES.includes(lo.primary) ? lo.primary : p.loadout.primary;
    const sec = SECONDARIES.includes(lo.secondary) ? lo.secondary : p.loadout.secondary;
    const mel = MELEES.includes(lo.melee) ? lo.melee : (p.loadout.melee || 'knife');
    p.loadout = { primary: prim, secondary: sec, melee: mel };
    // Dans les premières secondes après l'apparition on peut changer directement
    if (applyNow && this.cfg.choice && p.alive && !p.hasShot && now() - p.spawnedAt < 10000) {
      p.weapons = this.weaponsFor(p);
      p.cur = p.weapons[0];
      p.send({ t: 'weapons', list: p.weapons, refill: true });
    }
  }

  weaponsFor(p) {
    if (this.cfg.fixed) return this.cfg.fixed.slice();
    if (this.cfg.ladder) {
      const w = ggLevelWeapon(p.ggLevel);
      return w === 'knife' ? ['knife'] : [w, 'knife'];
    }
    return [p.loadout.primary, p.loadout.secondary, MELEES.includes(p.loadout.melee) ? p.loadout.melee : 'knife'];
  }

  // ── Match ────────────────────────────────────────────────────────────────
  startMatch(nextMap) {
    if (nextMap) {
      this.mapIndex = (this.mapIndex + 1) % this.mapRotation.length;
      this.mapId = this.mapRotation[this.mapIndex];
    }
    this.state = 'playing';
    this.matchStart = now();
    this.matchEnd = this.matchStart + this.cfg.timeLimit * 1000;
    this.teamScore = [0, 0];
    this.projectiles = [];
    this.fires = []; this.smokes = []; this.turrets = [];
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.hs = 0; p.assists = 0; p.ggLevel = 0; p.ggKills = 0; p.streak = 0; p.cheatedMatch = false;
      p.alive = false;
      p.damageBy.clear();
      if (p.brain) p.brain.reset();
    }
    // rééquilibrage des équipes
    if (this.cfg.teams) {
      const list = [...this.players.values()];
      list.forEach((p) => { p.team = -1; });
      list.sort((a, b) => (a.isBot ? 1 : 0) - (b.isBot ? 1 : 0));
      for (const p of list) this.assignTeam(p);
    }
    this.broadcast({
      t: 'match', map: this.mapId, mode: this.mode, endsAt: this.matchEnd, serverTime: now(),
      players: [...this.players.values()].map((q) => q.info()),
    });
    for (const p of this.players.values()) this.scheduleRespawn(p, 0.2 + (p.isBot ? Math.random() * 0.8 : 0));
    this.sendBoard();
  }

  endMatch(winner, winTeam = -1) {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.nextMatchAt = now() + 12000;
    const board = this.boardRows();
    const sorted = [...this.players.values()].sort((a, b) => this.rank(b) - this.rank(a));
    const top = sorted.slice(0, 3).map((p) => p.id);
    this.broadcast({
      t: 'end', winner: winner ? winner.id : null, winnerName: winner ? winner.name : null, winTeam,
      teamScore: this.teamScore, board, top, nextIn: 12, nextMap: this.mapRotation[(this.mapIndex + 1) % this.mapRotation.length],
    });
    // Récompenses
    for (const p of this.players.values()) {
      if (p.isBot || !p.acc) continue;
      let n = CREDITS.participation;
      const why = ['participation'];
      const won = winTeam >= 0 ? p.team === winTeam : !!(winner && winner.id === p.id);
      if (won) { n += CREDITS.win; why.push('victoire'); }
      if (top.includes(p.id) && !this.cfg.teams) { n += CREDITS.podium; why.push('podium'); }
      const total = ACC.reward(p.acc, n);
      ACC.recordMatch(p.acc, won, !(cheating(p) || p.cheatedMatch));
      p.send({ t: 'credits', n, why: 'Fin de match : ' + why.join(' + '), total });
      const item = ACC.drop(p.acc);
      if (item) p.send({ t: 'drop', item });
    }
    for (const p of this.players.values()) { p.alive = false; }
  }

  rank(p) {
    if (this.cfg.ladder) return p.ggLevel * 1000 + p.ggKills * 100 + p.kills - p.deaths * 0.01;
    return p.kills * 100 - p.deaths + p.hs * 0.01;
  }

  // ── Apparition ────────────────────────────────────────────────────────────
  scheduleRespawn(p, delay) {
    p.respawnAt = now() + delay * 1000;
  }

  pickSpawn(p) {
    const sp = this.map.spawns;
    let list = sp.ffa;
    if (this.cfg.teams && p.team >= 0) list = p.team === 0 ? sp.t0 : sp.t1;
    // on maximise la distance au plus proche ennemi (avec un peu d'aléatoire)
    const enemies = [...this.players.values()].filter((q) => q !== p && q.alive && (!this.cfg.teams || q.team !== p.team));
    const scored = list.map((s) => {
      let md = 999;
      for (const e of enemies) md = Math.min(md, Math.hypot(e.x - s[0], e.z - s[1]));
      // évite d'apparaître sur un allié
      for (const q of this.players.values()) if (q !== p && q.alive && Math.hypot(q.x - s[0], q.z - s[1]) < 1) md -= 50;
      return { s, score: md + Math.random() * 8 };
    });
    scored.sort((a, b) => b.score - a.score);
    const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
    return pick;
  }

  spawn(p) {
    const s = this.pickSpawn(p);
    const b = p.body;
    b.x = s[0] + (Math.random() - 0.5) * 0.4; b.z = s[1] + (Math.random() - 0.5) * 0.4; b.y = (s[2] || 0) + 0.01;
    b.vx = b.vy = b.vz = 0; b.crouch = false; b.crouchT = 0; b.onGround = true;
    // regarde vers le centre de la carte
    p.yaw = Math.atan2(b.x, b.z) + (Math.random() - 0.5) * 0.6;
    p.pitch = 0;
    p.alive = true;
    p.hp = PLAYER.maxHp;
    p.spawnSeq++;
    p.spawnedAt = now();
    p.protectUntil = now() + this.cfg.protect * 1000;
    p.hasShot = false;
    p.scoped = false;
    p.damageBy.clear();
    p.mana = PLAYER.manaMax;
    p.slowUntil = 0; p.slowMul = 1; p.shield = 0; p.shieldUntil = 0; p.blindUntil = 0;
    p.nades = this.cfg.choice ? { ...GRENADE_STOCK } : {};
    p.weapons = this.weaponsFor(p);
    p.cur = p.weapons[0];
    p.history.length = 0;
    if (p.brain) p.brain.onSpawn();
    p.send({ t: 'spawn', x: b.x, y: b.y, z: b.z, yaw: p.yaw, weapons: p.weapons, hp: p.hp, seq: p.spawnSeq, protect: this.cfg.protect, gg: p.ggLevel, nades: p.nades, mana: p.mana });
  }

  // ── Boucle ───────────────────────────────────────────────────────────────
  tick(dt) {
    if (this.state === 'idle') return;
    const t = now();
    if (this.state === 'ended') {
      if (t >= this.nextMatchAt) this.startMatch(true);
      return;
    }
    if (t >= this.matchEnd) {
      this.endByTime();
      return;
    }
    for (const p of this.players.values()) {
      if (!p.alive && p.respawnAt && t >= p.respawnAt) { p.respawnAt = 0; this.spawn(p); }
      if (p.isBot && p.alive) p.brain.update(dt, t);
      // historique pour la compensation de latence
      if (p.alive) {
        p.history.push({ t, x: p.body.x, y: p.body.y, z: p.body.z, c: p.body.crouch, yaw: p.yaw });
        if (p.history.length > 40) p.history.shift();
      }
    }
    this.stepProjectiles(dt);
    this.updateWorldEffects(dt, t);
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / SNAPSHOT_RATE - 1e-4) { this.snapAcc = Math.min(this.snapAcc - 1 / SNAPSHOT_RATE, 1 / SNAPSHOT_RATE); this.sendSnapshot(t); }
    this.boardAcc += dt;
    if (this.boardAcc >= 1) { this.boardAcc = 0; this.sendBoard(); }
  }

  endByTime() {
    if (this.cfg.teams) {
      const wt = this.teamScore[0] === this.teamScore[1] ? -1 : (this.teamScore[0] > this.teamScore[1] ? 0 : 1);
      this.endMatch(null, wt === -1 ? -2 : wt);
    } else {
      const sorted = [...this.players.values()].sort((a, b) => this.rank(b) - this.rank(a));
      this.endMatch(sorted[0] || null);
    }
  }

  sendSnapshot(t) {
    const arr = [];
    for (const p of this.players.values()) {
      const b = p.body;
      let flags = 0;
      if (p.alive) flags |= 1;
      if (b.crouch) flags |= 2;
      if (p.scoped) flags |= 4;
      if (p.alive && t < p.protectUntil) flags |= 8;
      if (!b.onGround) flags |= 16;
      arr.push([p.id, Math.round(b.x * 100), Math.round(b.y * 100), Math.round(b.z * 100),
        Math.round(p.yaw * 1000), Math.round(p.pitch * 1000), flags, WEAPON_IDS.indexOf(p.cur), Math.round(b.crouchT * 100)]);
    }
    this.broadcast({ t: 's', st: t, p: arr });
  }

  boardRows() {
    return [...this.players.values()].map((p) => [p.id, p.kills, p.deaths, p.hs, p.ping, p.ggLevel, p.team, p.alive ? 1 : 0, p.assists]);
  }

  sendBoard() {
    this.broadcast({ t: 'board', rows: this.boardRows(), ts: this.teamScore, endsAt: this.matchEnd, serverTime: now() });
  }

  // Skins ou nom modifiés depuis le menu (compte)
  refreshPlayer(p) {
    if (p.acc) { p.skins = sanitizeSkins(ACC.equippedSkins(p.acc)); p.name = p.acc.name; }
    this.broadcast({ t: 'pinfo', p: p.info() });
  }

  // ── Messages des clients ─────────────────────────────────────────────────
  handle(p, m) {
    switch (m.t) {
      case 'st': this.onState(p, m); break;
      case 'shot': this.onShot(p, m); break;
      case 'knife': this.onKnife(p, m); break;
      case 'nade': this.onNade(p, m); break;
      case 'cast': this.onCast(p, m); break;
      case 'loadout': this.setLoadout(p, m.lo); break;
      case 'chat': {
        const msg = String(m.msg || '').slice(0, 140).trim();
        if (msg) this.broadcast({ t: 'chat', id: p.id, name: p.name, team: p.team, msg });
        break;
      }
      case 'reload': this.broadcast({ t: 'rl', id: p.id }, p); break;
      default: break;
    }
  }

  onState(p, m) {
    if (!p.alive || m.sq !== p.spawnSeq) return;
    const x = +m.x, y = +m.y, z = +m.z;
    if (![x, y, z].every(Number.isFinite)) return;
    const b = p.body;
    const d = Math.hypot(x - b.x, z - b.z);
    if (d > 10 || y < -5 || y > 30) {
      // déplacement impossible : on corrige le client
      p.send({ t: 'correct', x: b.x, y: b.y, z: b.z, seq: p.spawnSeq });
      return;
    }
    b.x = x; b.y = y; b.z = z;
    b.crouch = !!m.c;
    b.crouchT = b.crouch ? 1 : 0;
    b.onGround = !!m.g;
    p.yaw = Number(m.yw) || 0;
    p.pitch = Math.max(-1.6, Math.min(1.6, Number(m.pt) || 0));
    p.scoped = !!m.sc;
    const w = WEAPON_IDS[m.w];
    if (w && p.weapons.includes(w)) p.cur = w;
  }

  // Position d'un joueur à l'instant t (interpolation de l'historique)
  stateAt(p, t) {
    const h = p.history;
    if (!h.length) return { x: p.body.x, y: p.body.y, z: p.body.z, c: p.body.crouch, yaw: p.yaw };
    if (t >= h[h.length - 1].t) return h[h.length - 1];
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t && t <= b.t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: k < 0.5 ? a.c : b.c, yaw: k < 0.5 ? a.yaw : b.yaw };
      }
    }
    return h[0];
  }

  canFire(p, wid, heavy = false) {
    if (!has(WEAPONS, wid) || !p.weapons.includes(wid)) return false;
    const w = WEAPONS[wid];
    const t = now();
    const delay = (heavy ? w.heavyDelay : minFireDelay(w)) * 1000;
    const last = p.lastShot[wid] || 0;
    if (t - last < delay * 0.75) return false;
    p.lastShot[wid] = t;
    return true;
  }

  enemiesOf(p) {
    const out = [];
    for (const q of this.players.values()) {
      if (q === p || !q.alive) continue;
      if (this.cfg.teams && q.team === p.team) continue;
      out.push(q);
    }
    return out;
  }

  onShot(p, m) {
    if (this.state !== 'playing' || !p.alive) return;
    const wid = m.w;
    if (!has(WEAPONS, wid)) return;
    const w = WEAPONS[wid];
    if (w.kind === 'knife' || w.kind === 'magic' || w.kind === 'grenade') return;
    if (!this.canFire(p, wid)) return;
    const o = m.o;
    if (!Array.isArray(o) || o.length !== 3 || !o.every(Number.isFinite)) return;
    // l'origine doit être proche des yeux du joueur
    if (Math.hypot(o[0] - p.body.x, o[1] - p.eye(), o[2] - p.body.z) > 1.5) return;
    const dirs = Array.isArray(m.d) ? m.d.slice(0, w.pellets || 1) : [];
    const t = now();
    let rt = Number(m.rt);
    if (!Number.isFinite(rt)) rt = t;
    rt = Math.max(t - MAX_REWIND, Math.min(t, rt));
    this.fire(p, wid, o, dirs, rt, !!m.sc);
  }

  // Tir (humains et bots). dirs = directions normalisées.
  fire(p, wid, o, dirs, rt, scoped) {
    const w = WEAPONS[wid];
    p.hasShot = true;
    p.protectUntil = 0;
    p.lastFired = now();
    if (w.projectile) { for (const d0 of dirs) this.launch(p, wid, o, d0); return; }
    const boxes = this.map.boxes;
    const enemies = this.enemiesOf(p).map((q) => ({ q, s: this.stateAt(q, rt) }));
    const dmg = new Map();
    const ends = [];
    for (const d0 of dirs) {
      if (!Array.isArray(d0) || d0.length !== 3) continue;
      let [dx, dy, dz] = d0.map(Number);
      const l = Math.hypot(dx, dy, dz);
      if (!(l > 0.5 && l < 1.5)) continue;
      dx /= l; dy /= l; dz /= l;
      const mh = raycastMap(boxes, o[0], o[1], o[2], dx, dy, dz, w.range);
      if (w.pierce) {
        // le railgun traverse tous les joueurs alignés (mais pas les murs)
        const wallT = Math.min(mh.t, w.range);
        let any = 0;
        for (const { q, s } of enemies) {
          const r = rayPlayer(o[0], o[1], o[2], dx, dy, dz, wallT, s.x, s.y, s.z, s.c, 0, s.yaw);
          if (!r) continue;
          any = 1;
          if (this.cfg.hsOnly && r.g !== HIT_HEAD) continue;
          const cur = dmg.get(q) || { amount: 0, hs: false };
          cur.amount += p.cheats && p.cheats.oneshot ? 999 : w.damage * HIT_MULT[r.g];
          if (r.g === HIT_HEAD) cur.hs = true;
          dmg.set(q, cur);
        }
        ends.push([+(o[0] + dx * wallT).toFixed(2), +(o[1] + dy * wallT).toFixed(2), +(o[2] + dz * wallT).toFixed(2), any]);
        continue;
      }
      let best = mh.t, bestQ = null, bestG = -1;
      for (const { q, s } of enemies) {
        const r = rayPlayer(o[0], o[1], o[2], dx, dy, dz, best, s.x, s.y, s.z, s.c, 0, s.yaw);
        if (r && r.t < best) { best = r.t; bestQ = q; bestG = r.g; }
      }
      const tEnd = Math.min(best, w.range);
      ends.push([+(o[0] + dx * tEnd).toFixed(2), +(o[1] + dy * tEnd).toFixed(2), +(o[2] + dz * tEnd).toFixed(2), bestQ ? 1 : 0]);
      if (bestQ) {
        if (this.cfg.hsOnly && bestG !== HIT_HEAD) continue;
        let amount = w.damage * HIT_MULT[bestG] * Math.pow(w.rangeMod, best / 10);
        if (p.cheats && p.cheats.oneshot) amount = 999;
        const cur = dmg.get(bestQ) || { amount: 0, hs: false, g: bestG };
        cur.amount += amount;
        if (bestG === HIT_HEAD) cur.hs = true;
        dmg.set(bestQ, cur);
      }
    }
    this.broadcast({ t: 'fx', id: p.id, w: wid, o: o.map((v) => +v.toFixed(2)), e: ends }, p);
    for (const [q, d] of dmg) {
      this.damage(q, p, d.amount, wid, d.hs, { noscope: w.kind === 'sniper' && !scoped });
    }
  }

  onKnife(p, m) {
    if (this.state !== 'playing' || !p.alive) return;
    const heavy = !!m.heavy;
    const wid = has(WEAPONS, m.w) && WEAPONS[m.w].kind === 'knife' ? m.w : 'knife';
    if (!this.canFire(p, wid, heavy)) return;
    const o = m.o, d = m.d;
    if (!Array.isArray(o) || !Array.isArray(d) || o.length !== 3 || d.length !== 3) return;
    if (![...o, ...d].every(Number.isFinite)) return;
    if (Math.hypot(o[0] - p.body.x, o[1] - p.eye(), o[2] - p.body.z) > 1.5) return;
    const t = now();
    let rt = Number(m.rt); if (!Number.isFinite(rt)) rt = t;
    rt = Math.max(t - MAX_REWIND, Math.min(t, rt));
    this.knife(p, heavy, o, d, rt, wid);
  }

  knife(p, heavy, o, d, rt, wid = 'knife') {
    const w = WEAPONS[wid];
    p.hasShot = true;
    p.protectUntil = 0;
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    const dx = d[0] / l, dy = d[1] / l, dz = d[2] / l;
    const range = heavy ? w.heavyRange : w.range;
    const mh = raycastMap(this.map.boxes, o[0], o[1], o[2], dx, dy, dz, range);
    let best = mh.t < range ? mh.t : range, bestQ = null;
    for (const q of this.enemiesOf(p)) {
      const s = this.stateAt(q, rt);
      const r = rayPlayer(o[0], o[1], o[2], dx, dy, dz, best, s.x, s.y, s.z, s.c, 0.22, s.yaw);
      if (r && r.t < best) { best = r.t; bestQ = q; }
    }
    this.broadcast({ t: 'kn', id: p.id, heavy, hit: !!bestQ, w: wid }, p);
    if (!bestQ) return;
    // coup dans le dos ?
    const fx = -Math.sin(bestQ.yaw), fz = -Math.cos(bestQ.yaw);
    const tx = p.body.x - bestQ.body.x, tz = p.body.z - bestQ.body.z;
    const behind = (fx * tx + fz * tz) < 0;
    let diff = Math.abs(((p.yaw - bestQ.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const back = behind && diff < 1.2;
    let amount = back ? (heavy ? w.heavyBackstab : w.backstab) : (heavy ? w.heavyDamage : w.damage);
    if (p.cheats && p.cheats.oneshot) amount = 999;
    this.damage(bestQ, p, amount, wid, false, { backstab: back });
  }

  // ── Projectiles (roquettes, carreaux d'arbalète) ─────────────────────────
  launch(p, wid, o, d0, speedMul = 1) {
    if (!Array.isArray(d0) || d0.length !== 3) return;
    let [dx, dy, dz] = d0.map(Number);
    const l = Math.hypot(dx, dy, dz);
    if (!(l > 0.5 && l < 1.5)) return;
    dx /= l; dy /= l; dz /= l;
    const P = WEAPONS[wid].projectile;
    const sp = P.speed * speedMul;
    const pr = {
      id: ++this.projSeq, owner: p, wid, born: now(),
      x: o[0] + dx * 0.4, y: o[1] + dy * 0.4 - 0.05, z: o[2] + dz * 0.4,
      vx: dx * sp, vy: dy * sp, vz: dz * sp,
    };
    this.projectiles.push(pr);
    this.broadcast({ t: 'pj', id: pr.id, by: p.id, w: wid, o: [pr.x, pr.y, pr.z].map((v) => +v.toFixed(3)), v: [pr.vx, pr.vy, pr.vz].map((v) => +v.toFixed(3)) });
  }

  stepProjectiles(dt) {
    if (!this.projectiles.length) return;
    const boxes = this.map.boxes;
    const t = now();
    for (const pr of this.projectiles) {
      const P = WEAPONS[pr.wid].projectile;
      const steps = Math.max(1, Math.ceil(Math.hypot(pr.vx, pr.vy, pr.vz) * dt / 0.8));
      const h = dt / steps;
      for (let i = 0; i < steps && !pr.done; i++) {
        pr.vy -= P.gravity * h;
        const sp = Math.hypot(pr.vx, pr.vy, pr.vz);
        const L = sp * h, dx = pr.vx / sp, dy = pr.vy / sp, dz = pr.vz / sp;
        const mh = raycastMap(boxes, pr.x, pr.y, pr.z, dx, dy, dz, L);
        let best = mh.t, hitQ = null, hitG = -1;
        const n = [mh.nx, mh.ny, mh.nz];
        for (const q of this.players.values()) {
          if (!q.alive || q === pr.owner) continue;
          if (this.cfg.teams && q.team === pr.owner.team) continue;
          const r = rayPlayer(pr.x, pr.y, pr.z, dx, dy, dz, Math.min(best, L), q.body.x, q.body.y, q.body.z, q.body.crouch, 0.05, q.yaw);
          if (r && r.t < best) { best = r.t; hitQ = q; hitG = r.g; }
        }
        if (best <= L) {
          pr.x += dx * best; pr.y += dy * best; pr.z += dz * best;
          if (!hitQ && P.bounce && t - pr.born < (P.fuse || 6000) - 50) {
            // rebond sur le décor (grenade) : on réfléchit la vitesse
            const dot2 = (pr.vx * n[0] + pr.vy * n[1] + pr.vz * n[2]) * 2;
            pr.vx = (pr.vx - dot2 * n[0]) * P.bounce;
            pr.vy = (pr.vy - dot2 * n[1]) * P.bounce;
            pr.vz = (pr.vz - dot2 * n[2]) * P.bounce;
            pr.x += n[0] * 0.06; pr.y += n[1] * 0.06; pr.z += n[2] * 0.06;
            this.broadcast({ t: 'pb', id: pr.id, p: [pr.x, pr.y, pr.z].map((v) => +v.toFixed(2)), v: [pr.vx, pr.vy, pr.vz].map((v) => +v.toFixed(2)) });
          } else {
            this.impact(pr, hitQ, hitG, hitQ ? [-dx, -dy, -dz] : n);
          }
        } else { pr.x += dx * L; pr.y += dy * L; pr.z += dz * L; }
      }
      if (!pr.done && (t - pr.born > (P.fuse || 6000) || pr.y < -5)) this.impact(pr, null, -1, [0, 1, 0]);
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.done);
  }

  impact(pr, hitQ, g, n) {
    pr.done = true;
    const w = WEAPONS[pr.wid], P = w.projectile, owner = pr.owner;
    const pt = [pr.x, pr.y, pr.z];
    const gr = w.grenade;
    if (gr === 'flash' || gr === 'smoke' || gr === 'molotov') {
      if (this.state === 'playing') {
        if (gr === 'flash') this.flashbang(pt);
        else if (gr === 'smoke') this.spawnSmoke(pt);
        else this.spawnFire(pt, owner);
      }
      this.broadcast({ t: 'px', id: pr.id, p: pt.map((v) => +v.toFixed(2)), n: n.map((v) => +v.toFixed(2)), g: gr });
      return;
    }
    const one = owner.cheats && owner.cheats.oneshot;
    if (this.state === 'playing') {
      if (P.splash > 0) {
        const ox = pt[0] + n[0] * 0.15, oy = pt[1] + n[1] * 0.15, oz = pt[2] + n[2] * 0.15;
        for (const q of [...this.players.values()]) {
          if (!q.alive) continue;
          if (this.cfg.teams && q !== owner && q.team === owner.team) continue;
          const cy = q.body.y + (q.body.crouch ? 0.7 : 1.0);
          const d = Math.hypot(q.body.x - ox, cy - oy, q.body.z - oz);
          if (d > P.splash && q !== hitQ) continue;
          if (q !== hitQ && !lineOfSight(this.map.boxes, ox, oy, oz, q.body.x, cy, q.body.z)) continue;
          // souffle : projette le joueur (« rocket jump » possible)
          const k = Math.max(0, 1 - d / P.splash);
          const kx = (q.body.x - ox) / (d || 1), kz = (q.body.z - oz) / (d || 1);
          const imp = [kx * 9 * k, 4 + 6 * k, kz * 9 * k];
          if (q.isBot) { q.body.vx += imp[0]; q.body.vy = Math.max(q.body.vy, imp[1]); q.body.vz += imp[2]; q.body.onGround = false; }
          else q.send({ t: 'kb', v: imp.map((v) => +v.toFixed(2)) });
          if (this.cfg.hsOnly) continue;
          let amount = q === hitQ ? w.damage : w.damage * k;
          if (q === owner) amount *= P.self;
          else if (one) amount = 999;
          this.damage(q, owner, amount, pr.wid, false, {});
        }
      } else if (hitQ && !(this.cfg.hsOnly && g !== HIT_HEAD)) {
        this.damage(hitQ, owner, one ? 999 : w.damage * HIT_MULT[g], pr.wid, g === HIT_HEAD, {});
      }
    }
    this.broadcast({ t: 'px', id: pr.id, p: pt.map((v) => +v.toFixed(2)), n: n.map((v) => +v.toFixed(2)), hit: !!hitQ, boom: P.splash > 0 });
  }

  // ── Grenades à lancer ────────────────────────────────────────────────────
  onNade(p, m) {
    if (this.state !== 'playing' || !p.alive) return;
    const type = m.g;
    if (!GRENADES.includes(type) || !(p.nades[type] > 0)) return;
    const o = m.o, d = m.d;
    if (!Array.isArray(o) || o.length !== 3 || !o.every(Number.isFinite)) return;
    if (!Array.isArray(d) || d.length !== 3) return;
    if (Math.hypot(o[0] - p.body.x, o[1] - p.eye(), o[2] - p.body.z) > 1.6) return;
    const t = now();
    if (t - (p.lastShot._nade || 0) < 500) return;
    p.lastShot._nade = t;
    p.nades = { ...p.nades, [type]: p.nades[type] - 1 };
    this.launch(p, type, o, d, m.under ? 0.5 : 1);
    this.broadcast({ t: 'nadefx', id: p.id }, p);
    p.send({ t: 'nades', n: p.nades });
  }

  flashbang(pt) {
    const t = now();
    for (const q of this.players.values()) {
      if (!q.alive) continue;
      const ex = q.body.x, ey = q.eye(), ez = q.body.z;
      const dx = pt[0] - ex, dy = pt[1] - ey, dz = pt[2] - ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 20) continue;
      if (!lineOfSight(this.map.boxes, ex, ey, ez, pt[0], pt[1], pt[2])) continue;
      const cp = Math.cos(q.pitch);
      const fx = -Math.sin(q.yaw) * cp, fy = Math.sin(q.pitch), fz = -Math.cos(q.yaw) * cp;
      const dot = (dx * fx + dy * fy + dz * fz) / (dist || 1);
      const facing = Math.max(0, (dot + 0.3) / 1.3);
      const inten = Math.max(0, facing * (1 - dist / 20));
      if (inten < 0.08) continue;
      const dur = Math.round(500 + inten * 3200);
      if (q.isBot) q.blindUntil = Math.max(q.blindUntil, t + dur * 0.7);
      else q.send({ t: 'flash', dur, i: +inten.toFixed(2) });
    }
  }

  spawnSmoke(pt) {
    const id = ++this.fxSeq;
    const sm = { id, x: pt[0], y: Math.max(0.1, pt[1]), z: pt[2], r: 3.6, until: now() + 15000 };
    this.smokes.push(sm);
    this.broadcast({ t: 'smoke', id, p: [sm.x, sm.y, sm.z].map((v) => +v.toFixed(2)), r: sm.r, add: true });
  }

  spawnFire(pt, owner) {
    const id = ++this.fxSeq;
    const fr = { id, x: pt[0], y: Math.max(0.05, pt[1]), z: pt[2], r: 2.6, until: now() + 7000, owner, nextTick: now() + 300 };
    this.fires.push(fr);
    this.broadcast({ t: 'fire', id, p: [fr.x, fr.y, fr.z].map((v) => +v.toFixed(2)), r: fr.r, add: true });
  }

  // La fumée bloque-t-elle la ligne A→B ? (utilisé par les bots)
  smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const sm of this.smokes) {
      const dx = bx - ax, dy = by - ay, dz = bz - az; const len2 = dx * dx + dy * dy + dz * dz || 1;
      let tt = ((sm.x - ax) * dx + (sm.y - ay) * dy + (sm.z - az) * dz) / len2; tt = Math.max(0, Math.min(1, tt));
      if (Math.hypot(sm.x - (ax + dx * tt), sm.y - (ay + dy * tt), sm.z - (az + dz * tt)) < sm.r * 0.9) return true;
    }
    return false;
  }

  // ── Sorts (magie) ──────────────────────────────────────────────────────────
  onCast(p, m) {
    if (this.state !== 'playing' || !p.alive) return;
    const wid = m.w, w = WEAPONS[wid];
    // barre de sorts : n'importe quel sort tant que la magie est l'arme principale
    const hasMagic = p.weapons.some((id) => WEAPONS[id] && WEAPONS[id].kind === 'magic');
    if (!w || w.kind !== 'magic' || !MAGIC.includes(wid) || !hasMagic) return;
    const o = m.o;
    if (!Array.isArray(o) || o.length !== 3 || !o.every(Number.isFinite)) return;
    if (Math.hypot(o[0] - p.body.x, o[1] - p.eye(), o[2] - p.body.z) > 1.6) return;
    const t = now();
    if (t - (p.lastShot[wid] || 0) < w.fireDelay * 1000 * 0.8) return;
    if (p.mana < w.mana) { p.send({ t: 'mana', m: Math.round(p.mana) }); return; }
    const d = Array.isArray(m.d) && m.d.length === 3 && m.d.every(Number.isFinite) ? m.d : null;
    if ((w.cast === 'proj' || w.cast === 'chain' || w.cast === 'beam' || w.cast === 'blink' || w.cast === 'turret') && !d) return;
    p.lastShot[wid] = t; p.mana -= w.mana; p.hasShot = true; p.protectUntil = 0;
    let rt = Number(m.rt); if (!Number.isFinite(rt)) rt = t; rt = Math.max(t - MAX_REWIND, Math.min(t, rt));
    switch (w.cast) {
      case 'proj': this.launch(p, wid, o, d); break;
      case 'chain': this.castChain(p, w, o, d, rt); break;
      case 'beam': this.castBeam(p, w, o, d, rt); break;
      case 'heal': this.castHeal(p, w); break;
      case 'shield': p.shield = w.shield; p.shieldUntil = t + w.dur; p.send({ t: 'shield', s: p.shield }); this.broadcast({ t: 'sp', k: 'shield', id: p.id }); break;
      case 'blink': this.castBlink(p, d, w.dist); break;
      case 'turret': this.spawnTurret(p, o, d, w); break;
    }
    p.send({ t: 'mana', m: Math.round(p.mana) });
    this.broadcast({ t: 'cfx', id: p.id, w: wid, o: o.map((v) => +v.toFixed(2)) }, p);
  }

  castChain(p, w, o, d, rt) {
    let [dx, dy, dz] = d; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const mh = raycastMap(this.map.boxes, o[0], o[1], o[2], dx, dy, dz, w.range);
    let best = mh.t, first = null;
    for (const q of this.enemiesOf(p)) { const s = this.stateAt(q, rt); const r = rayPlayer(o[0], o[1], o[2], dx, dy, dz, best, s.x, s.y, s.z, s.c, 0, s.yaw); if (r && r.t < best) { best = r.t; first = q; } }
    const pts = [o.slice(), [o[0] + dx * Math.min(best, w.range), o[1] + dy * Math.min(best, w.range), o[2] + dz * Math.min(best, w.range)]];
    if (first) {
      const seen = new Set([first]); let dmg = w.damage;
      this.damage(first, p, dmg, w.id, false, {});
      let cx = first.body.x, cy = first.body.y + 1.0, cz = first.body.z;
      pts[1] = [cx, cy, cz];
      for (let j = 0; j < w.chain.jumps; j++) {
        dmg *= w.chain.falloff; let nx = null, nd = w.chain.radius;
        for (const q of this.enemiesOf(p)) { if (seen.has(q)) continue; const dd = Math.hypot(q.body.x - cx, q.body.z - cz); if (dd < nd && lineOfSight(this.map.boxes, cx, cy, cz, q.body.x, q.body.y + 1.0, q.body.z)) { nd = dd; nx = q; } }
        if (!nx) break;
        seen.add(nx); this.damage(nx, p, dmg, w.id, false, {});
        cx = nx.body.x; cy = nx.body.y + 1.0; cz = nx.body.z; pts.push([cx, cy, cz]);
      }
    }
    this.broadcast({ t: 'sp', k: 'chain', pts: pts.map((pp) => pp.map((v) => +v.toFixed(2))) });
  }

  castBeam(p, w, o, d, rt) {
    let [dx, dy, dz] = d; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const mh = raycastMap(this.map.boxes, o[0], o[1], o[2], dx, dy, dz, w.range);
    let best = mh.t, tq = null;
    for (const q of this.enemiesOf(p)) { const s = this.stateAt(q, rt); const r = rayPlayer(o[0], o[1], o[2], dx, dy, dz, best, s.x, s.y, s.z, s.c, 0, s.yaw); if (r && r.t < best) { best = r.t; tq = q; } }
    if (tq) {
      this.damage(tq, p, w.damage, w.id, false, {});
      tq.slowUntil = now() + w.slow.dur; tq.slowMul = w.slow.mul;
      if (!tq.isBot) tq.send({ t: 'slow', mul: w.slow.mul, dur: w.slow.dur });
    }
    this.broadcast({ t: 'sp', k: 'beam', o: o.map((v) => +v.toFixed(2)), e: [o[0] + dx * Math.min(best, w.range), o[1] + dy * Math.min(best, w.range), o[2] + dz * Math.min(best, w.range)].map((v) => +v.toFixed(2)) });
  }

  castHeal(p, w) {
    const targets = [p];
    if (this.cfg.teams) for (const q of this.players.values()) if (q !== p && q.alive && q.team === p.team && Math.hypot(q.body.x - p.body.x, q.body.z - p.body.z) < w.radius) targets.push(q);
    for (const q of targets) { if (!q.alive) continue; q.hp = Math.min(PLAYER.maxHp, q.hp + w.heal); if (!q.isBot) q.send({ t: 'heal', hp: q.hp }); }
    this.broadcast({ t: 'sp', k: 'heal', id: p.id });
  }

  castBlink(p, d, dist) {
    let dx = d[0], dz = d[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const b = p.body, h = b.crouch ? PLAYER.crouchHeight : PLAYER.height;
    let moved = 0;
    for (let step = 0.4; step <= dist; step += 0.4) { if (collides(this.map.boxes, b.x + dx * step, b.y + 0.05, b.z + dz * step, h)) break; moved = step; }
    if (moved > 0.3) { b.x += dx * moved; b.z += dz * moved; p.history.length = 0; if (!p.isBot) p.send({ t: 'tp', x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2) }); }
    this.broadcast({ t: 'sp', k: 'blink', id: p.id, p: [b.x, b.y, b.z].map((v) => +v.toFixed(2)) });
  }

  spawnTurret(p, o, d, w) {
    let [dx, dy, dz] = d; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const fx = o[0] + dx * 2.2, fz = o[2] + dz * 2.2, fy = o[1];
    const down = raycastMap(this.map.boxes, fx, fy, fz, 0, -1, 0, 4);
    const gy = down.t < 4 ? fy - down.t + 0.01 : p.body.y;
    const id = ++this.fxSeq;
    this.turrets.push({ id, owner: p, x: fx, y: gy, z: fz, until: now() + w.turret.life, nextFire: now() + 500, def: w.turret });
    this.broadcast({ t: 'turret', id, by: p.id, p: [fx, gy, fz].map((v) => +v.toFixed(2)), add: true });
  }

  updateWorldEffects(dt, t) {
    for (const p of this.players.values()) {
      if (p.alive) p.mana = Math.min(PLAYER.manaMax, p.mana + PLAYER.manaRegen * dt);
      if (p.slowUntil && t > p.slowUntil) { p.slowUntil = 0; p.slowMul = 1; }
      if (p.shieldUntil && t > p.shieldUntil) { p.shield = 0; p.shieldUntil = 0; }
    }
    for (const fr of this.fires) {
      if (t > fr.until) { fr.dead = true; this.broadcast({ t: 'fire', id: fr.id, add: false }); continue; }
      if (t >= fr.nextTick) {
        fr.nextTick = t + 400;
        for (const q of this.players.values()) { if (!q.alive) continue; if (Math.hypot(q.body.x - fr.x, q.body.z - fr.z) <= fr.r && q.body.y < fr.y + 2.2) this.damage(q, fr.owner, 9, 'molotov', false, {}); }
      }
    }
    if (this.fires.some((f) => f.dead)) this.fires = this.fires.filter((f) => !f.dead);
    for (const sm of this.smokes) if (t > sm.until) { sm.dead = true; this.broadcast({ t: 'smoke', id: sm.id, add: false }); }
    if (this.smokes.some((x) => x.dead)) this.smokes = this.smokes.filter((x) => !x.dead);
    for (const tr of this.turrets) {
      if (t > tr.until || !tr.owner || !this.players.has(tr.owner.id)) { tr.dead = true; this.broadcast({ t: 'turret', id: tr.id, add: false }); continue; }
      if (t < tr.nextFire) continue;
      let best = null, bd = tr.def.range;
      for (const q of this.players.values()) { if (!q.alive || q === tr.owner) continue; if (this.cfg.teams && q.team === tr.owner.team) continue; const dd = Math.hypot(q.body.x - tr.x, q.body.z - tr.z); if (dd < bd && lineOfSight(this.map.boxes, tr.x, tr.y + 0.6, tr.z, q.body.x, q.body.y + 1.0, q.body.z)) { bd = dd; best = q; } }
      if (best) { tr.nextFire = t + tr.def.rof * 1000; this.damage(best, tr.owner, tr.def.dmg, 'totem', false, {}); this.broadcast({ t: 'tfx', id: tr.id, e: [+best.body.x.toFixed(2), +(best.body.y + 1).toFixed(2), +best.body.z.toFixed(2)] }); }
    }
    if (this.turrets.some((x) => x.dead)) this.turrets = this.turrets.filter((x) => !x.dead);
  }

  damage(q, attacker, amount, wid, hs, extra = {}) {
    if (!q.alive || amount <= 0) return;
    if (q.cheats && q.cheats.god && q !== attacker) return;
    // bouclier arcanique : absorbe les dégâts
    if (q.shield > 0 && now() < q.shieldUntil) {
      const absorb = Math.min(q.shield, amount);
      q.shield -= absorb; amount -= absorb;
      if (!q.isBot) q.send({ t: 'shield', s: Math.round(q.shield) });
      if (amount <= 0) { attacker.send({ t: 'hit', id: q.id, dmg: 0, hs, shield: true }); return; }
    }
    if (now() < q.protectUntil) {
      attacker.send({ t: 'hit', id: q.id, dmg: 0, hs, prot: true });
      return;
    }
    const dmg = Math.min(q.hp, Math.round(amount));
    q.hp -= dmg;
    q.damageBy.set(attacker.id, (q.damageBy.get(attacker.id) || 0) + dmg);
    attacker.send({ t: 'hit', id: q.id, dmg, hs, hp: q.hp, kill: q.hp <= 0 });
    q.send({ t: 'dmg', from: attacker.id, fx: attacker.body.x, fz: attacker.body.z, dmg, hp: q.hp, hs });
    if (q.brain) q.brain.onDamaged(attacker);
    if (q.hp <= 0) this.kill(q, attacker, wid, hs, extra);
  }

  kill(victim, killer, wid, hs, extra) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.streak = 0;
    this.scheduleRespawn(victim, this.cfg.respawn);
    // assistance : >= 40 dégâts infligés par un autre joueur
    let assister = null;
    for (const [aid, d] of victim.damageBy) {
      if (aid !== killer.id && d >= 40) { assister = this.players.get(aid); break; }
    }
    if (assister) assister.assists++;
    const selfKill = victim === killer;
    if (!selfKill) {
      killer.kills++;
      killer.streak++;
      if (hs) killer.hs++;
      if (this.cfg.teams && killer.team >= 0) this.teamScore[killer.team]++;
    }
    this.broadcast({
      t: 'kill', k: killer.id, v: victim.id, w: wid, hs: !!hs, ns: !!extra.noscope, bs: !!extra.backstab,
      a: assister ? assister.id : null, kh: killer.hp, streak: killer.streak,
    });
    // crédits, statistiques et compteur StatKill™
    if (victim.acc) ACC.recordDeath(victim.acc, !cheating(victim));
    if (killer.acc && !selfKill) {
      let n = CREDITS.kill;
      const why = ['kill'];
      if (hs) { n += CREDITS.headshot; why.push('headshot'); }
      if (WEAPONS[wid] && WEAPONS[wid].kind === 'knife') { n += CREDITS.knife; why.push(wid === 'pan' ? 'poêle' : 'couteau'); }
      if (extra.noscope) { n += CREDITS.noscope; why.push('no-scope'); }
      const total = ACC.reward(killer.acc, n);
      const st = ACC.recordKill(killer.acc, wid, hs, !cheating(killer));
      killer.send({ t: 'credits', n, why: why.join(' + '), w: wid, total, st });
      if (st !== null && killer.skins[wid]) killer.skins[wid].kills = st;
    }
    // Gun Game
    if (this.cfg.ladder && !selfKill) {
      const last = GUNGAME_LADDER.length - 1;
      if (wid === 'knife' && victim.ggLevel > 0 && killer.ggLevel < last) {
        victim.ggLevel--; victim.ggKills = 0;
        victim.send({ t: 'gg', level: victim.ggLevel, demoted: true });
      }
      if (killer.ggLevel >= last && wid === 'knife') {
        this.sendBoard();
        this.endMatch(killer);
        return;
      }
      const curW = ggLevelWeapon(killer.ggLevel);
      if (wid === curW || wid === 'knife') {
        killer.ggKills++;
        const need = this.cfg.killsPerLevel;
        if (killer.ggKills >= need || wid === 'knife') {
          killer.ggLevel = Math.min(last, killer.ggLevel + 1);
          killer.ggKills = 0;
          if (killer.alive) {
            killer.weapons = this.weaponsFor(killer);
            killer.cur = killer.weapons[0];
            killer.send({ t: 'weapons', list: killer.weapons, refill: true, gg: killer.ggLevel });
          }
          this.broadcast({ t: 'ggup', id: killer.id, level: killer.ggLevel });
        }
      }
    }
    // victoire ?
    if (!this.cfg.ladder) {
      if (this.cfg.teams) {
        for (const tm of [0, 1]) if (this.teamScore[tm] >= this.cfg.killLimit) { this.sendBoard(); this.endMatch(null, tm); return; }
      } else if (killer.kills >= this.cfg.killLimit) {
        this.sendBoard();
        this.endMatch(killer);
        return;
      }
    }
  }
}
