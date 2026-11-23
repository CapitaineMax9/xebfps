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
