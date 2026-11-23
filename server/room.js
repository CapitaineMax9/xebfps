// Salle de jeu : gère un match, ses joueurs (humains + bots), les modes et le combat.
import { TICK_RATE, SNAPSHOT_RATE, MAX_REWIND, PLAYER, CREDITS } from '../shared/constants.js';
import { MAPS } from '../shared/maps.js';
import { MODES, ggLevelWeapon, GUNGAME_LADDER } from '../shared/modes.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from '../shared/weapons.js';
import { SKINS } from '../shared/skins.js';
import { raycastMap, rayPlayer, HIT_HEAD, HIT_MULT } from '../shared/raycast.js';
import { createBody, eyeHeight } from '../shared/physics.js';
import { NavGrid } from './nav.js';
import { BotBrain, BOT_NAMES } from './bot.js';

export const WEAPON_IDS = Object.keys(WEAPONS);
const navCache = {};
function navFor(mapId) {
  if (!navCache[mapId]) navCache[mapId] = new NavGrid(MAPS[mapId]);
  return navCache[mapId];
}

const now = () => performance.now();
let nextPlayerId = 1;

function sanitizeSkins(skins) {
  const out = {};
  if (!skins || typeof skins !== 'object') return out;
  for (const wid of Object.keys(skins)) {
    if (!WEAPONS[wid]) continue;
    const s = skins[wid];
    if (!s || typeof s !== 'object') continue;
    const def = SKINS[s.skin];
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
    this.mode = MODES[opts.mode] ? opts.mode : 'ffa';
    this.cfg = MODES[this.mode];
    this.name = opts.name || this.cfg.name;
    this.maxPlayers = Math.max(2, Math.min(16, opts.maxPlayers || 12));
    this.botTarget = Math.max(0, Math.min(this.maxPlayers - 1, opts.bots ?? 5));
    this.difficulty = ['easy', 'normal', 'hard'].includes(opts.difficulty) ? opts.difficulty : 'normal';
    this.persistent = !!opts.persistent;
    this.mapRotation = opts.map && MAPS[opts.map] ? [opts.map, ...this.cfg.maps.filter((m) => m !== opts.map)] : this.cfg.maps.slice();
    this.mapIndex = 0;
    this.mapId = this.mapRotation[0];
    this.players = new Map();
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
  addHuman(ws, name, skins, loadout) {
    const p = new Player(String(name || 'Joueur').slice(0, 16), ws);
    p.skins = sanitizeSkins(skins);
    if (loadout) this.setLoadout(p, loadout, false);
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
    const prim = ['ak47', 'm4a1s', 'awp', 'ak47', 'm4a1s', 'mp9', 'p90', 'ssg08', 'awp', 'nova'];
    p.loadout = { primary: prim[Math.floor(Math.random() * prim.length)], secondary: SECONDARIES[Math.floor(Math.random() * SECONDARIES.length)] };
    this.assignTeam(p);
    this.players.set(p.id, p);
    this.broadcast({ t: 'pjoin', p: p.info() });
    this.scheduleRespawn(p, 0.3 + Math.random());
    return p;
  }

  removePlayer(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
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
    const prim = PRIMARIES.includes(lo.primary) ? lo.primary : p.loadout.primary;
    const sec = SECONDARIES.includes(lo.secondary) ? lo.secondary : p.loadout.secondary;
    p.loadout = { primary: prim, secondary: sec };
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
    return [p.loadout.primary, p.loadout.secondary, 'knife'];
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
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.hs = 0; p.assists = 0; p.ggLevel = 0; p.ggKills = 0; p.streak = 0;
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
      if (p.isBot) continue;
      let n = CREDITS.participation;
      const why = ['participation'];
      const won = winTeam >= 0 ? p.team === winTeam : (winner && winner.id === p.id);
      if (won) { n += CREDITS.win; why.push('victoire'); }
      if (top.includes(p.id) && !this.cfg.teams) { n += CREDITS.podium; why.push('podium'); }
      p.send({ t: 'credits', n, why: 'Fin de match : ' + why.join(' + '), drop: true });
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
    p.weapons = this.weaponsFor(p);
    p.cur = p.weapons[0];
    p.history.length = 0;
    if (p.brain) p.brain.onSpawn();
    p.send({ t: 'spawn', x: b.x, y: b.y, z: b.z, yaw: p.yaw, weapons: p.weapons, hp: p.hp, seq: p.spawnSeq, protect: this.cfg.protect, gg: p.ggLevel });
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
        p.history.push({ t, x: p.body.x, y: p.body.y, z: p.body.z, c: p.body.crouch });
        if (p.history.length > 40) p.history.shift();
      }
    }
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / SNAPSHOT_RATE) { this.snapAcc = 0; this.sendSnapshot(t); }
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

  // ── Messages des clients ─────────────────────────────────────────────────
  handle(p, m) {
    switch (m.t) {
      case 'st': this.onState(p, m); break;
      case 'shot': this.onShot(p, m); break;
      case 'knife': this.onKnife(p, m); break;
      case 'loadout': this.setLoadout(p, m.lo); break;
      case 'skins':
        p.skins = sanitizeSkins(m.skins);
        this.broadcast({ t: 'pinfo', p: p.info() });
        break;
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
    if (!h.length) return { x: p.body.x, y: p.body.y, z: p.body.z, c: p.body.crouch };
    if (t >= h[h.length - 1].t) return h[h.length - 1];
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t && t <= b.t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: k < 0.5 ? a.c : b.c };
      }
    }
    return h[0];
  }

  canFire(p, wid, heavy = false) {
    const w = WEAPONS[wid];
    if (!w || !p.weapons.includes(wid)) return false;
    const t = now();
    const delay = (heavy ? w.heavyDelay : w.fireDelay) * 1000;
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
    const w = WEAPONS[wid];
    if (!w || w.kind === 'knife') return;
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
      let best = mh.t, bestQ = null, bestG = -1;
      for (const { q, s } of enemies) {
        const r = rayPlayer(o[0], o[1], o[2], dx, dy, dz, best, s.x, s.y, s.z, s.c);
        if (r && r.t < best) { best = r.t; bestQ = q; bestG = r.g; }
      }
      const tEnd = Math.min(best, w.range);
      ends.push([+(o[0] + dx * tEnd).toFixed(2), +(o[1] + dy * tEnd).toFixed(2), +(o[2] + dz * tEnd).toFixed(2), bestQ ? 1 : 0]);
      if (bestQ) {
        if (this.cfg.hsOnly && bestG !== HIT_HEAD) continue;
        let amount = w.damage * HIT_MULT[bestG] * Math.pow(w.rangeMod, best / 10);
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
    if (!this.canFire(p, 'knife', heavy)) return;
    const o = m.o, d = m.d;
    if (!Array.isArray(o) || !Array.isArray(d) || o.length !== 3 || d.length !== 3) return;
    if (![...o, ...d].every(Number.isFinite)) return;
    if (Math.hypot(o[0] - p.body.x, o[1] - p.eye(), o[2] - p.body.z) > 1.5) return;
    const t = now();
    let rt = Number(m.rt); if (!Number.isFinite(rt)) rt = t;
    rt = Math.max(t - MAX_REWIND, Math.min(t, rt));
    this.knife(p, heavy, o, d, rt);
  }

  knife(p, heavy, o, d, rt) {
    const w = WEAPONS.knife;
    p.hasShot = true;
    p.protectUntil = 0;
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    const dx = d[0] / l, dy = d[1] / l, dz = d[2] / l;
    const range = heavy ? w.heavyRange : w.range;
    const mh = raycastMap(this.map.boxes, o[0], o[1], o[2], dx, dy, dz, range);
    let best = mh.t < range ? mh.t : range, bestQ = null;
    for (const q of this.enemiesOf(p)) {
      const s = this.stateAt(q, rt);
      const r = rayPlayer(o[0], o[1], o[2], dx, dy, dz, best, s.x, s.y, s.z, s.c, 0.22);
      if (r && r.t < best) { best = r.t; bestQ = q; }
    }
    this.broadcast({ t: 'kn', id: p.id, heavy, hit: !!bestQ }, p);
    if (!bestQ) return;
    // coup dans le dos ?
    const fx = -Math.sin(bestQ.yaw), fz = -Math.cos(bestQ.yaw);
    const tx = p.body.x - bestQ.body.x, tz = p.body.z - bestQ.body.z;
    const behind = (fx * tx + fz * tz) < 0;
    let diff = Math.abs(((p.yaw - bestQ.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const back = behind && diff < 1.2;
    const amount = back ? (heavy ? w.heavyBackstab : w.backstab) : (heavy ? w.heavyDamage : w.damage);
    this.damage(bestQ, p, amount, 'knife', false, { backstab: back });
  }

  damage(q, attacker, amount, wid, hs, extra = {}) {
    if (!q.alive || amount <= 0) return;
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
    // crédits
    if (!killer.isBot && !selfKill) {
      let n = CREDITS.kill;
      const why = ['kill'];
      if (hs) { n += CREDITS.headshot; why.push('headshot'); }
      if (wid === 'knife') { n += CREDITS.knife; why.push('couteau'); }
      if (extra.noscope) { n += CREDITS.noscope; why.push('no-scope'); }
      killer.send({ t: 'credits', n, why: why.join(' + '), w: wid });
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
