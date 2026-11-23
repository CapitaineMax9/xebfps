// Serveur HTTP (fichiers statiques) + WebSocket (jeu).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { TICK_RATE } from '../shared/constants.js';
import { MODES, MODE_ORDER } from '../shared/modes.js';
import { MAPS } from '../shared/maps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

// préfixe d'URL -> dossier sur le disque
const STATIC = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
  ['/', path.join(ROOT, 'public')],
];

function serveStatic(req, res) {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/api/rooms') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(roomList()));
    return;
  }
  for (const [prefix, dir] of STATIC) {
    if (!url.startsWith(prefix)) continue;
    let rel = url.slice(prefix.length);
    if (prefix === '/' && (rel === '' || rel.endsWith('/'))) rel += 'index.html';
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir + path.sep) && file !== dir) break;
    // three.js : on n'expose que build/ et examples/jsm/
    if (prefix === '/vendor/three/' && !(rel.startsWith('build/') || rel.startsWith('examples/jsm/'))) break;
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': prefix === '/vendor/three/' ? 'public, max-age=86400' : 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

// ── Salles ────────────────────────────────────────────────────────────────
const rooms = new Map();
let roomSeq = 1;
function createRoom(opts) {
  const id = 'r' + (roomSeq++);
  const r = new Room(id, opts);
  rooms.set(id, r);
  return r;
}
// Salles permanentes : une par mode (FFA en premier)
for (const m of MODE_ORDER) {
  createRoom({ mode: m, persistent: true, bots: m === 'tdm' ? 7 : 5, maxPlayers: m === 'tdm' ? 12 : 10, name: MODES[m].name + ' #1' });
}

function roomList() {
  return [...rooms.values()].map((r) => r.summary());
}

// ── Connexions ────────────────────────────────────────────────────────────
const clients = new Set();

wss.on('connection', (ws) => {
  const c = { ws, name: 'Joueur', skins: {}, loadout: null, room: null, player: null, missed: 0, msgCount: 0, msgWindow: Date.now() };
  clients.add(c);
  ws.on('pong', () => { c.missed = 0; });

  ws.on('message', (data) => {
    // limitation simple du débit
    const t = Date.now();
    if (t - c.msgWindow > 1000) { c.msgWindow = t; c.msgCount = 0; }
    if (++c.msgCount > 200) return;
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello':
        c.name = String(m.name || 'Joueur').replace(/[<>]/g, '').trim().slice(0, 16) || 'Joueur';
        c.skins = m.skins || {};
        c.loadout = m.loadout || null;
        send(ws, { t: 'welcome', rooms: roomList(), maps: Object.keys(MAPS) });
        break;
      case 'list':
        send(ws, { t: 'rooms', rooms: roomList() });
        break;
      case 'join': {
        leave(c);
        let r = rooms.get(m.room);
        if (!r && m.mode) {
          // partie rapide : la salle la plus remplie (non pleine) du mode
          const cands = [...rooms.values()].filter((x) => x.mode === m.mode && !x.isFull());
          cands.sort((a, b) => b.humans() - a.humans());
          r = cands[0] || createRoom({ mode: m.mode, persistent: false });
        }
        if (!r) { send(ws, { t: 'error', msg: 'Salle introuvable.' }); break; }
        if (r.isFull()) { send(ws, { t: 'error', msg: 'Salle pleine.' }); break; }
        c.room = r;
        c.player = r.addHuman(ws, c.name, c.skins, c.loadout);
        break;
      }
      case 'create': {
        leave(c);
        if (rooms.size > 60) { send(ws, { t: 'error', msg: 'Trop de salles ouvertes.' }); break; }
        const o = m.opts || {};
        const r = createRoom({
          mode: o.mode, map: o.map, name: String(o.name || '').replace(/[<>]/g, '').slice(0, 28) || undefined,
          bots: Number(o.bots), maxPlayers: Number(o.max), difficulty: o.difficulty, persistent: false,
        });
        c.room = r;
        c.player = r.addHuman(ws, c.name, c.skins, c.loadout);
        break;
      }
      case 'leave':
        leave(c);
        send(ws, { t: 'left' });
        break;
      case 'skins':
        c.skins = m.skins || {};
        if (c.room && c.player) c.room.handle(c.player, m);
        break;
      case 'loadout':
        c.loadout = m.lo || null;
        if (c.room && c.player) c.room.handle(c.player, m);
        break;
      case 'pong':
        if (c.player && typeof m.s === 'number') c.player.ping = Math.max(0, Math.round(performance.now() - m.s));
        break;
      case 'sync':
        send(ws, { t: 'sync', c: m.c, s: performance.now() });
        break;
      default:
        if (c.room && c.player) c.room.handle(c.player, m);
    }
  });

  ws.on('close', () => { leave(c); clients.delete(c); });
  ws.on('error', () => { /* ignore */ });
});

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function leave(c) {
  if (c.room && c.player) c.room.removePlayer(c.player);
  c.room = null; c.player = null;
}

// ── Boucle de jeu ─────────────────────────────────────────────────────────
let last = performance.now();
setInterval(() => {
  const t = performance.now();
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  for (const r of rooms.values()) {
    try { r.tick(dt); } catch (e) { console.error('Erreur dans la salle', r.id, e); }
  }
}, 1000 / TICK_RATE);

// ping + nettoyage
setInterval(() => {
  const t = performance.now();
  for (const c of clients) {
    if (++c.missed > 5) { try { c.ws.terminate(); } catch { /* ignore */ } continue; }
    try { c.ws.ping(); } catch { /* ignore */ }
    if (c.player) send(c.ws, { t: 'ping', s: t });
  }
  for (const r of [...rooms.values()]) {
    if (!r.persistent && r.humans() === 0 && t - r.emptySince > 60000) rooms.delete(r.id);
  }
}, 2000);

server.listen(PORT, () => {
  console.log(`XEB FPS en ligne sur http://localhost:${PORT}`);
});
