// Auto-test : valide les cartes et simule des matchs entre bots en temps accéléré.
// Usage : npm test
import { MAPS } from '../shared/maps.js';
import { collides } from '../shared/physics.js';
import { PLAYER } from '../shared/constants.js';
import { MODE_ORDER } from '../shared/modes.js';
import { SKINS, CASES, rollCase, RARITIES, tradeUpResult, makeItem } from '../shared/skins.js';

let fake = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => fake }, configurable: true, writable: true });

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xebfps-'));
process.env.DATA_FILE = path.join(tmpDir, 'accounts.json');
if (!process.env.TEST_PG) delete process.env.DATABASE_URL;
const { NavGrid } = await import('../server/nav.js');
const { Room } = await import('../server/room.js');
const ACC = await import('../server/accounts.js');
await ACC.initAccounts();

let errors = 0;
const fail = (m) => { errors++; console.error('  ✗', m); };
const ok = (m) => console.log('  ✓', m);

console.log('Cartes');
for (const map of Object.values(MAPS)) {
  const nav = new NavGrid(map);
  // plus grande composante
  const sizes = new Array(nav.compCount).fill(0);
  for (const k of nav.walkList) sizes[nav.comp[k]]++;
  const main = sizes.indexOf(Math.max(...sizes));
  let bad = 0;
  for (const [key, list] of Object.entries(map.spawns)) {
    for (const s of list) {
      const y = (s[2] || 0) + 0.01;
      if (collides(map.boxes, s[0], y, s[1], PLAYER.height)) { fail(`${map.id} spawn ${key} ${s} dans un mur`); bad++; continue; }
      if (!collides(map.boxes, s[0], y - 0.05, s[1], PLAYER.height)) { fail(`${map.id} spawn ${key} ${s} dans le vide`); bad++; continue; }
      const k = nav.nearest(s[0], s[1]);
      if (k < 0 || nav.comp[k] !== main) { fail(`${map.id} spawn ${key} ${s} hors de la zone principale`); bad++; }
    }
  }
  // chemin entre deux spawns éloignés
  const a = map.spawns.t0[0], b = map.spawns.t1[0];
  const path = nav.findPath(a[0], a[1], b[0], b[1]);
  if (!path) fail(`${map.id} : pas de chemin entre les camps`);
  if (!bad) ok(`${map.id} : ${map.boxes.length} boîtes, ${nav.walkList.length} cellules, composante principale ${sizes[main]}, chemin ${path ? path.length : 0} points`);
}

console.log('Skins');
for (const c of CASES) {
  for (const id of c.items) if (!SKINS[id]) fail(`caisse ${c.id} : skin ${id} inconnu`);
  for (const r of Object.keys(RARITIES)) {
    if (!c.items.some((id) => SKINS[id].rarity === r)) fail(`caisse ${c.id} : aucune rareté ${r}`);
  }
}
const counts = {};
const N = 100000;
for (let i = 0; i < N; i++) { const it = rollCase(CASES[0]); const r = SKINS[it.skin].rarity; counts[r] = (counts[r] || 0) + 1; }
ok('taux de drop sur ' + N + ' ouvertures : ' + Object.entries(counts).map(([r, n]) => `${r} ${(n / N * 100).toFixed(2)}%`).join(', '));
const tu = tradeUpResult(Array.from({ length: 10 }, () => makeItem('glock_sable')));
if (!tu || SKINS[tu.skin].rarity !== 'restricted') fail('contrat d\'échange invalide'); else ok('contrat d\'échange : ' + tu.skin);

console.log('Simulation de matchs');
function fakeWs(log) {
  return { readyState: 1, send: (s) => { log.push(JSON.parse(s)); } };
}
for (const mode of MODE_ORDER) {
  fake = 1000;
  const room = new Room('t_' + mode, { mode, bots: 9, maxPlayers: 12, difficulty: 'hard' });
  const log = [];
  const { acc } = await ACC.authenticate(null, 'Testeur');
  acc.loadout = { primary: 'awp', secondary: 'deagle' };
  const human = room.addHuman(fakeWs(log), acc);
  const dt = 1 / 30;
  let kills = 0, ended = null, maxGG = 0, steps = 0;
  const start = performance.now();
  const startPos = new Map();
  try {
    for (let i = 0; i < 30 * 240; i++) {
      fake += dt * 1000;
      room.tick(dt);
      steps++;
      if (i === 30 * 5) for (const p of room.players.values()) startPos.set(p.id, [p.body.x, p.body.z]);
      for (const m of log.splice(0)) {
        if (m.t === 'kill') kills++;
        if (m.t === 'end') ended = m;
        if (m.t === 'ggup') maxGG = Math.max(maxGG, m.level);
      }
      if (ended) break;
    }
  } catch (e) { fail(mode + ' : exception ' + e.stack); continue; }
  let moved = 0;
  for (const p of room.players.values()) {
    const s = startPos.get(p.id);
    if (s && p.isBot && Math.hypot(p.body.x - s[0], p.body.z - s[1]) > 2) moved++;
  }
  const simSec = (steps / 30).toFixed(0);
  const msg = `${mode} : ${room.players.size} joueurs, ${kills} kills en ${simSec}s simulées, ${moved} bots ont bougé` +
    (maxGG ? `, niveau Gun Game max ${maxGG}` : '') + (ended ? `, match terminé (gagnant : ${ended.winnerName ?? 'équipe ' + ended.winTeam})` : '') +
    ` [humain : ${human.kills}K/${human.deaths}D]`;
  if (kills === 0) fail(msg); else ok(msg);
  void start;
}

await accountTests();
await weaponTests();
await weaponTests2();
await grenadeMagicTests();
await boardTests();
await skinGenTests();
await ACC.store.close();
console.log(errors ? `\n${errors} erreur(s)` : '\nTout est OK');
process.exit(errors ? 1 : 0);

// ── Comptes et économie ───────────────────────────────────────────────────
async function accountTests() {
  console.log('Comptes (' + ACC.store.kind + ')');
  const a = (await ACC.authenticate(null, 'Invité')).acc;
  const imported = ACC.importLocal(a, { credits: 999999, name: 'Ancien', inventory: [{ uid: 'x1', skin: 'awp_dragon', float: 5, seed: 3, st: true, kills: 7 }, { uid: 'bad', skin: '__proto__' }], equipped: { awp: 'x1' } });
  if (!imported || a.credits !== 50000 || a.inventory.length !== 1 || !a.equipped.awp || a.inventory[0].float > 1) fail('import du profil local incorrect'); else ok('import local validé et plafonné');
  if (ACC.importLocal(a, { credits: 1 })) fail('import possible deux fois');
  let r = await ACC.register(a, 'ab', 'secret1'); if (!r.error) fail('pseudo trop court accepté');
  r = await ACC.register(a, 'Sniper_FR', '123'); if (!r.error) fail('mot de passe trop court accepté');
  r = await ACC.register(a, 'Sniper_FR', 'motdepasse'); if (!r.ok) fail('inscription : ' + r.error); else ok('inscription');
  const b = (await ACC.authenticate(null, 'X')).acc;
  r = await ACC.register(b, 'sniper_fr', 'autre123'); if (!r.error) fail('pseudo en double accepté'); else ok('pseudo unique (insensible à la casse)');
  r = await ACC.login('SNIPER_FR', 'mauvais'); if (!r.error) fail('mauvais mot de passe accepté');
  r = await ACC.login('sniper_fr', 'motdepasse'); if (r.acc !== a) fail('connexion échouée'); else ok('connexion');
  const again = await ACC.authenticate(r.token); if (again.acc !== a || again.created) fail('reconnexion par jeton échouée'); else ok('reconnexion automatique par jeton');
  await ACC.logout(r.token);
  const after = await ACC.authenticate(r.token); if (after.acc === a) fail('jeton encore valide après déconnexion'); else ok('déconnexion');
  // économie
  a.credits = 300;
  r = ACC.openCase(a, 'prelude'); if (!r.item || a.credits !== 50) fail('ouverture de caisse'); else ok('ouverture de caisse (crédits débités côté serveur)');
  r = ACC.openCase(a, 'prelude'); if (!r.error) fail('caisse ouverte sans crédits');
  r = ACC.openCase(a, '__proto__'); if (!r.error) fail('caisse inconnue acceptée');
  const it = a.inventory[a.inventory.length - 1];
  ACC.equip(a, it.uid);
  const v = ACC.sell(a, it.uid).value;
  if (a.credits !== 50 + v || Object.values(a.equipped).includes(it.uid)) fail('vente'); else ok('vente + déséquipement');
  for (let i = 0; i < 10; i++) a.inventory.push((await import('../shared/skins.js')).makeItem('glock_sable'));
  const uids = a.inventory.filter((i) => i.skin === 'glock_sable').slice(0, 10).map((i) => i.uid);
  r = ACC.tradeUp(a, uids); if (!r.item) fail('contrat : ' + r.error); else ok('contrat d\'échange');
  r = ACC.tradeUp(a, uids); if (!r.error) fail('contrat rejoué');
  ACC.equip(a, a.inventory[0].uid);
  const st = ACC.recordKill(a, 'awp', true); if (st !== 8) fail('StatKill : ' + st); else ok('compteur StatKill™');
}

// ── Armes spéciales (serveur) ─────────────────────────────────────────────
async function weaponTests() {
  console.log('Armes spéciales');
  fake = 5000;
  const room = new Room('t_armes', { mode: 'ffa', map: 'oasis', bots: 0, maxPlayers: 8 });
  const mk = async (name) => { const { acc } = await ACC.authenticate(null, name); return room.addHuman(fakeWs([]), acc); };
  const [a, b, c, d] = [await mk('A'), await mk('B'), await mk('C'), await mk('D')];
  for (let i = 0; i < 60; i++) { fake += 33; room.tick(1 / 30); }
  const place = (p, x, z, yaw = 0) => { p.body.x = x; p.body.y = 0; p.body.z = z; p.body.crouch = false; p.yaw = yaw; p.hp = 100; p.alive = true; p.protectUntil = 0; p.history.length = 0; };
  const reset = () => { place(a, 0, 20); place(b, 0, 12); place(c, 0, 8); place(d, 30, 40); for (const p of [a, b, c, d]) { p.weapons = ['railgun', 'rpg', 'crossbow', 'famas', 'pan']; p.lastShot = {}; } };
  const eye = (p) => [p.body.x, p.body.y + 1.62, p.body.z];
  // railgun : traverse B puis C (alignés)
  reset(); fake += 3000;
  room.fire(a, 'railgun', eye(a), [[0, 0, -1]], fake, true);
  if (!b.alive && !c.alive) ok('railgun : 2 joueurs alignés tués d\'un tir'); else fail(`railgun : B ${b.hp} PV, C ${c.hp} PV`);
  // roquette : touche B, souffle sur C (4 m derrière), D trop loin
  reset(); fake += 3000;
  room.fire(a, 'rpg', eye(a), [[0, -0.05, -1]], fake, false);
  for (let i = 0; i < 40 && room.projectiles.length; i++) { fake += 33; room.stepProjectiles(1 / 30); }
  if (b.hp <= 0 && c.hp < 100 && c.hp > 0 && d.hp === 100) ok(`roquette : impact direct mortel, souffle sur le voisin (C à ${c.hp} PV), joueur lointain épargné`);
  else fail(`roquette : B ${b.hp} PV, C ${c.hp} PV, D ${d.hp} PV`);
  // souffle bloqué par un mur : C caché derrière la grosse caisse du site A
  reset(); fake += 3000;
  place(a, 20, 0); place(c, 27.6, 0); place(b, 30, 30);
  room.fire(a, 'rpg', eye(a), [[1, -0.1, 0]], fake, false);
  for (let i = 0; i < 40 && room.projectiles.length; i++) { fake += 33; room.stepProjectiles(1 / 30); }
  if (c.hp === 100) ok('roquette : le souffle ne traverse pas les murs'); else fail(`souffle à travers une caisse : C ${c.hp} PV`);
  // arbalète : carreau dans la tête à 8 m
  reset(); fake += 3000;
  const hy = 1.68 - 1.62;
  room.fire(a, 'crossbow', eye(a), [[0, hy / 8 + 0.004, -1]], fake, false);
  for (let i = 0; i < 40 && room.projectiles.length; i++) { fake += 33; room.stepProjectiles(1 / 30); }
  if (b.hp <= 0) ok('arbalète : carreau mortel (avec la chute due à la gravité)'); else fail(`arbalète : B ${b.hp} PV`);
  // poêle au corps à corps
  reset(); fake += 3000; place(b, 0, 18.8, Math.PI); // B face à A (sinon c'est un coup dans le dos)
  room.knife(a, true, eye(a), [0, -0.2, -1], fake, 'pan');
  if (b.hp === 5) ok('poêle : coup lourd = 95 dégâts'); else fail(`poêle : B ${b.hp} PV`);
  reset(); fake += 3000; place(b, 0, 18.8, 0);
  room.knife(a, true, eye(a), [0, -0.2, -1], fake, 'pan');
  if (!b.alive) ok('poêle dans le dos : mortel'); else fail(`poêle dans le dos : B ${b.hp} PV`);
  // FAMAS : les 3 balles d'une rafale sont acceptées par le serveur
  reset(); fake += 3000;
  let accepted = 0;
  for (let i = 0; i < 3; i++) { if (room.canFire(a, 'famas')) accepted++; fake += 66; }
  if (accepted === 3) ok('FAMAS : rafale de 3 balles acceptée'); else fail(`FAMAS : ${accepted}/3 balles acceptées`);
}

// ── Nouvelles armes (lot 2) ───────────────────────────────────────────────
async function weaponTests2() {
  console.log('Nouvelles armes');
  const W = (await import('../shared/weapons.js'));
  fake = 9000;
  const room = new Room('t_armes2', { mode: 'ffa', map: 'oasis', bots: 0, maxPlayers: 8 });
  const mk = async (name) => { const { acc } = await ACC.authenticate(null, name); return room.addHuman(fakeWs([]), acc); };
  const [a, b] = [await mk('A2'), await mk('B2')];
  for (let i = 0; i < 60; i++) { fake += 33; room.tick(1 / 30); }
  const place = (p, x, z, yaw = 0) => { p.body.x = x; p.body.y = 0; p.body.z = z; p.body.crouch = false; p.yaw = yaw; p.hp = 100; p.alive = true; p.protectUntil = 0; p.history.length = 0; };
  const eye = (p) => [p.body.x, p.body.y + 1.62, p.body.z];
  const give = (p, list) => { p.weapons = list; p.lastShot = {}; };
  // toutes les nouvelles armes à tir instantané touchent une cible proche
  const hitscan = ['m4a4', 'sg553', 'bizon', 'mp5sd', 'mag7', 'sawedoff', 'negev', 'g3sg1', 'p250', 'cz75', 'p2000', 'minigun'];
  let okGuns = 0, total = 0;
  for (const wid of hitscan) {
    total++;
    place(a, 0, 14); place(b, 0, 10); give(a, [wid]); fake += 2000;
    const dir = W.dirFromAngles(a.yaw, a.pitch);
    room.fire(a, wid, eye(a), [dir], fake, false);
    if (b.hp < 100) okGuns++; else fail(`${wid} : cible intacte (${b.hp} PV)`);
  }
  if (okGuns === total) ok(`${total} nouvelles armes à tir instantané touchent leur cible`);
  // lance-grenades : touche directe explose et tue
  place(a, 0, 14); place(b, 0, 9); give(a, ['gl']); fake += 2000;
  room.fire(a, 'gl', eye(a), [[0, 0, -1]], fake, false);
  for (let i = 0; i < 60 && room.projectiles.length; i++) { fake += 33; room.stepProjectiles(1 / 30); }
  if (b.hp <= 0) ok('lance-grenades : touche directe explose et tue'); else fail(`lance-grenades : B ${b.hp} PV, projectiles restants ${room.projectiles.length}`);
  // lance-grenades : la grenade rebondit sur un mur puis explose (fuse)
  place(a, 20, 0); place(b, 24, 0); give(a, ['gl']); fake += 2000;
  room.fire(a, 'gl', eye(a), [[1, 0.3, 0]], fake, false); // tir en cloche vers le mur/sol
  let exploded = false;
  for (let i = 0; i < 120 && room.projectiles.length; i++) { fake += 33; room.stepProjectiles(1 / 30); }
  exploded = room.projectiles.length === 0;
  if (exploded) ok('lance-grenades : la grenade finit par exploser (mèche)'); else fail('grenade jamais explosée');
  // sabre laser : coup lourd dans le dos tue
  place(a, 0, 14); place(b, 0, 12.6, 0); give(a, ['saber']); fake += 2000;
  room.knife(a, true, eye(a), [0, -0.1, -1], fake, 'saber');
  if (!b.alive) ok('sabre laser : coup lourd mortel'); else fail(`sabre : B ${b.hp} PV`);
  // chaque arme a bien des stats cohérentes
  let miss = 0;
  for (const [id, w] of Object.entries(W.WEAPONS)) { if (!w.sound && w.kind !== 'knife') miss++; if (!['knife', 'grenade', 'magic'].includes(w.kind) && w.mag === undefined) miss++; }
  if (!miss) ok(`${Object.keys(W.WEAPONS).length} armes définies, stats complètes`); else fail(miss + ' armes incomplètes');
}

// ── Grenades + magie ──────────────────────────────────────────────────────
async function grenadeMagicTests() {
  console.log('Grenades et magie');
  const W = await import('../shared/weapons.js');
  const { PLAYER } = await import('../shared/constants.js');
  fake = 12000;
  const room = new Room('t_magic', { mode: 'ffa', map: 'oasis', bots: 0, maxPlayers: 8 });
  const mk = async (name) => { const { acc } = await ACC.authenticate(null, name); return room.addHuman(fakeWs([]), acc); };
  const [a, b, c] = [await mk('M1'), await mk('M2'), await mk('M3')];
  for (let i = 0; i < 60; i++) { fake += 33; room.tick(1 / 30); }
  const place = (p, x, z, yaw = 0) => { p.body.x = x; p.body.y = 0; p.body.z = z; p.body.crouch = false; p.yaw = yaw; p.pitch = 0; p.hp = 100; p.alive = true; p.protectUntil = 0; p.history.length = 0; };
  const eye = (p) => [p.body.x, p.body.y + 1.62, p.body.z];
  const stepProj = (max = 80) => { for (let i = 0; i < max && room.projectiles.length; i++) { fake += 33; room.stepProjectiles(1 / 30); } };
  // HE : lancée au pied d'un ennemi
  place(a, 0, 20); place(b, 0, 9.5); place(c, 30, 40);
  a.nades = { he: 1, flash: 1, smoke: 1, molotov: 1 };
  room.onNade(a, { g: 'he', o: eye(a), d: [0, -0.25, -1] });
  stepProj();
  if (b.hp < 100) ok(`grenade HE : explosion inflige des dégâts (cible à ${b.hp} PV)`); else fail('HE sans effet');
  if (a.nades.he === 0) ok('grenade HE : stock décrémenté'); else fail('stock HE non décrémenté');
  // Flash : un bot qui regarde est aveuglé
  place(a, 0, 20); b.isBot = true; b.blindUntil = 0; place(b, 0, 14, Math.PI); // B regarde vers A/la grenade
  room.flashbang([0, 1.6, 17]);
  if (b.blindUntil > fake) ok('flash : un bot qui regarde est aveuglé'); else fail('flash : bot non aveuglé');
  b.isBot = false;
  // Fumigène : bloque la ligne de vue
  room.smokes = []; room.spawnSmoke([0, 1, 12]);
  if (room.smokeBlocks(0, 1.6, 20, 0, 1.6, 4)) ok('fumigène : bloque la ligne de vue'); else fail('fumée ne bloque pas');
  if (!room.smokeBlocks(20, 1.6, 20, 24, 1.6, 20)) ok('fumigène : ne bloque pas ailleurs'); else fail('fumée bloque partout');
  room.smokes = [];
  // Molotov : feu au sol qui brûle
  place(b, 5, 5); room.fires = []; room.spawnFire([5, 0, 5], a);
  const hp0 = b.hp; for (let i = 0; i < 90; i++) { fake += 33; room.updateWorldEffects(1 / 30, fake); }
  if (b.hp < hp0) ok(`molotov : le feu brûle ceux qui restent dedans (${hp0} -> ${b.hp} PV)`); else fail('molotov sans dégâts');
  room.fires = [];
  // Mana : coûte du mana, refusé si vide
  place(a, 0, 20); a.weapons = ['fireball', 'usp', 'knife']; a.mana = PLAYER.manaMax; a.lastShot = {};
  const m0 = a.mana;
  room.onCast(a, { w: 'fireball', o: eye(a), d: [0, 0, -1] });
  if (a.mana === m0 - W.WEAPONS.fireball.mana) ok(`mana : la boule de feu coûte ${W.WEAPONS.fireball.mana} mana`); else fail('mana non décompté : ' + a.mana);
  a.mana = 5; a.lastShot = {};
  room.onCast(a, { w: 'fireball', o: eye(a), d: [0, 0, -1] });
  if (a.mana === 5) ok('mana : sort refusé si mana insuffisant'); else fail('sort lancé sans mana');
  room.projectiles = [];
  // Éclair en chaîne : touche plusieurs ennemis
  place(a, 0, 20); place(b, 0, 12); place(c, 2, 11); a.weapons = ['chainbolt', 'usp', 'knife']; a.mana = PLAYER.manaMax; a.lastShot = {};
  room.onCast(a, { w: 'chainbolt', o: eye(a), d: [0, 0, -1] });
  if (b.hp < 100 && c.hp < 100) ok(`éclair en chaîne : rebondit sur 2 ennemis (B ${b.hp}, C ${c.hp} PV)`); else fail(`chaîne : B ${b.hp}, C ${c.hp}`);
  // Rayon de givre : dégâts + ralentit
  place(a, 0, 20); place(b, 0, 12); a.weapons = ['frostbeam', 'usp', 'knife']; a.mana = PLAYER.manaMax; a.lastShot = {}; b.slowUntil = 0; b.slowMul = 1;
  room.onCast(a, { w: 'frostbeam', o: eye(a), d: [0, 0, -1] });
  if (b.hp < 100 && b.slowMul < 1 && b.slowUntil > fake) ok(`givre : dégâts + ralentissement (x${b.slowMul})`); else fail(`givre : hp ${b.hp}, slow ${b.slowMul}`);
  // Bâton de soin
  place(a, 0, 20); a.hp = 40; a.weapons = ['healstaff', 'usp', 'knife']; a.mana = PLAYER.manaMax; a.lastShot = {};
  room.onCast(a, { w: 'healstaff', o: eye(a), d: [0, 0, -1] });
  if (a.hp === 64) ok('bâton de soin : +24 PV'); else fail('soin : ' + a.hp + ' PV');
  // Bouclier : absorbe les dégâts
  place(a, 0, 20); a.hp = 100; a.weapons = ['aegis', 'usp', 'knife']; a.mana = PLAYER.manaMax; a.lastShot = {};
  room.onCast(a, { w: 'aegis', o: eye(a), d: [0, 0, -1] });
  const sh = a.shield; room.damage(a, b, 50, 'usp', false, {});
  if (sh === 80 && a.hp === 100 && a.shield === 30) ok('bouclier : absorbe 50 dégâts (reste 30 de bouclier, PV intacts)'); else fail(`bouclier : shield ${a.shield}, hp ${a.hp}`);
  // Blink : téléportation
  place(a, 0, 20); a.weapons = ['blink', 'usp', 'knife']; a.mana = PLAYER.manaMax; a.lastShot = {};
  const z0 = a.body.z; room.onCast(a, { w: 'blink', o: eye(a), d: [0, 0, -1] });
  if (Math.abs(a.body.z - z0) > 2) ok(`blink : téléportation de ${(z0 - a.body.z).toFixed(1)} m`); else fail('blink : pas de déplacement');
  // Totem : tourelle qui tire
  place(a, 0, 20); place(b, 2, 20); a.weapons = ['totem', 'usp', 'knife']; a.mana = PLAYER.manaMax; a.lastShot = {};
  room.turrets = []; room.onCast(a, { w: 'totem', o: eye(a), d: [1, 0, 0] });
  const bhp = b.hp; for (let i = 0; i < 120; i++) { fake += 33; room.updateWorldEffects(1 / 30, fake); }
  if (room.turrets.length && b.hp < bhp) ok(`totem : la tourelle tire sur l'ennemi (${bhp} -> ${b.hp} PV)`); else fail(`totem : tourelles ${room.turrets.length}, B ${b.hp}`);
}

// ── Catalogue de skins généré ─────────────────────────────────────────────
async function skinGenTests() {
  console.log('Skins générés');
  const { SKINS, CASES, makeItem, rollCase, RARITY_ORDER } = await import('../shared/skins.js');
  const n = Object.keys(SKINS).length;
  if (n >= 500) ok(`${n} skins au catalogue (${CASES.length} caisses)`); else fail(`seulement ${n} skins`);
  // identifiants figés : repères stables pour ne pas casser les inventaires
  const anchors = ['g0_ak47', 'g0_awp', 'g9_awp', 'ak_inferno', 'awp_dragon', 'pan_fondu'];
  const missing = anchors.filter((id) => !SKINS[id]);
  if (!missing.length) ok('identifiants de skins figés présents'); else fail('ids manquants : ' + missing.join(','));
  // chaque skin référence une arme et un motif connus
  const { WEAPONS } = await import('../shared/weapons.js');
  let bad = 0;
  for (const s of Object.values(SKINS)) { if (!WEAPONS[s.weapon]) { bad++; } if (!s.colors || !s.colors.length) bad++; }
  if (!bad) ok('tous les skins pointent vers une arme valide'); else fail(bad + ' skins invalides');
  // toutes les caisses tirables sans crash
  let rolls = 0;
  for (const c of CASES) for (let i = 0; i < 200; i++) { const it = rollCase(c); if (!it || !SKINS[it.skin]) { fail('tirage cassé dans ' + c.id); break; } rolls++; }
  ok(`${rolls} tirages de caisses sans erreur`);
  // combien de skins par arme (min)
  const per = {}; for (const s of Object.values(SKINS)) per[s.weapon] = (per[s.weapon] || 0) + 1;
  const min = Math.min(...Object.values(per));
  if (min >= 4) ok(`chaque arme a au moins ${min} skins`); else fail('une arme a trop peu de skins');
  // skins des armes magiques
  const MAGIC_W = ['fireball', 'chainbolt', 'frostbeam', 'arcaneorb', 'healstaff', 'aegis', 'blink', 'totem'];
  const magMin = Math.min(...MAGIC_W.map((w) => per[w] || 0));
  if (magMin >= 4) ok(`chaque arme magique a au moins ${magMin} skins`); else fail('une arme magique manque de skins');
  const arc = CASES.find((c) => c.id === 'arcane');
  if (arc && arc.items.every((it) => SKINS[it] && MAGIC_W.includes(SKINS[it].weapon))) ok(`Caisse Arcane : ${arc.items.length} skins, 100 % magie`); else fail('Caisse Arcane invalide');
  // la caisse couvre bien milspec→secret et se tire sans crash
  const arcRar = new Set(arc ? arc.items.map((it) => SKINS[it].rarity) : []);
  if (['milspec', 'restricted', 'classified', 'covert'].every((r) => arcRar.has(r))) ok('Caisse Arcane : toutes les raretés présentes'); else fail('Caisse Arcane : rareté manquante');
  void makeItem; void RARITY_ORDER;
}

// ── Caisses en masse + classement ─────────────────────────────────────────
async function boardTests() {
  console.log('Caisses en masse et classement');
  const { acc } = await ACC.authenticate(null, 'Ouvreur');
  acc.credits = 400 * 100 + 50;
  let r = ACC.openCase(acc, 'sniper', 100);
  if (r.items && r.items.length === 100 && acc.credits === 50) ok('100 caisses ouvertes d\'un coup (crédits débités : 40 000 ◈)'); else fail('ouverture x100 : ' + (r.error || acc.credits));
  r = ACC.openCase(acc, 'sniper', 10); if (!r.error) fail('x10 sans crédits accepté');
  r = ACC.openCase(acc, 'sniper', 37); if (r.items && r.items.length !== 1) fail('quantité invalide non ramenée à 1');
  const cheap = acc.inventory.filter((i) => ['milspec', 'restricted'].includes(SKINS[i.skin].rarity)).map((i) => i.uid);
  const before = acc.inventory.length;
  r = ACC.sellMany(acc, cheap);
  if (r.count === cheap.length && acc.inventory.length === before - cheap.length) ok(`vente groupée : ${r.count} objets pour ${r.value} ◈`); else fail('vente groupée');
  // classement
  const mkReg = async (name) => { const { acc: x } = await ACC.authenticate(null, name); await ACC.register(x, name, 'secret123'); return x; };
  const p1 = await mkReg('Alpha'), p2 = await mkReg('Bravo'), p3 = await mkReg('Charlie');
  for (let i = 0; i < 30; i++) ACC.recordKill(p1, 'ak47', i % 2 === 0);
  for (let i = 0; i < 25; i++) ACC.recordKill(p2, 'awp', true);
  for (let i = 0; i < 500; i++) ACC.recordKill(p3, 'awp', true, false); // kills avec outils privés : non classés
  ACC.recordDeath(p1); ACC.recordDeath(p2); ACC.recordDeath(p2);
  ACC.recordMatch(p2, true);
  let lb = await ACC.leaderboard('kills', p1);
  const names = lb.top.map((e) => e.name);
  if (names[0] === 'Alpha' && names[1] === 'Bravo' && !names.includes('Charlie') && lb.me && lb.me.rank === 1) ok('classement Kills : ordre correct, kills sous cheat exclus, ma position');
  else fail('classement kills : ' + JSON.stringify(lb.top.map((e) => [e.name, e.value])));
  lb = await ACC.leaderboard('hs', p2);
  if (lb.top[0] && lb.top[0].name === 'Bravo' && lb.top[0].value === 100) ok('classement Headshots % : Bravo 100 %'); else fail('classement hs : ' + JSON.stringify(lb.top));
  lb = await ACC.leaderboard('wins', null);
  if (lb.top.length === 1 && lb.top[0].name === 'Bravo') ok('classement Victoires'); else fail('classement victoires');
  if (lb.top.some((e) => 'id' in e)) fail('identifiant interne envoyé dans le classement');
}
