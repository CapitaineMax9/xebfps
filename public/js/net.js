// Connexion WebSocket au serveur + synchronisation d'horloge.
const handlers = new Map();
let onProfile = null;
export function setProfileHandler(fn) { onProfile = fn; }
let ws = null;
let openCb = null;
let retry = 0;
let helloFn = null;

export const net = {
  connected: false,
  offset: 0,         // serverTime ≈ performance.now() + offset
  bestRtt: Infinity,
  rtt: 0,
};

export function on(type, fn) { handlers.set(type, fn); }

// Requête au serveur avec réponse (comptes, caisses, inventaire…)
let rid = 0;
const pending = new Map();
export function request(op, payload = {}) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== 1) { resolve({ error: 'Pas de connexion au serveur.' }); return; }
    const id = ++rid;
    const timer = setTimeout(() => { pending.delete(id); resolve({ error: 'Le serveur ne répond pas.' }); }, 10000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    send({ t: 'req', rid: id, op, ...payload });
  });
}

export function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

export function serverNow() { return performance.now() + net.offset; }

export function connect(onHello, onStatus) {
  helloFn = onHello;
  openCb = onStatus;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onopen = () => {
    net.connected = true; retry = 0;
    openCb && openCb('ok');
    helloFn && helloFn();
    syncClock();
  };
  ws.onclose = () => {
    net.connected = false;
    openCb && openCb('closed');
    const h = handlers.get('disconnect'); h && h();
    retry = Math.min(retry + 1, 6);
    setTimeout(() => connect(helloFn, openCb), 500 * retry);
  };
  ws.onerror = () => { openCb && openCb('error'); };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'sync') {
      const t = performance.now();
      const rtt = t - m.c;
      net.rtt = rtt;
      // on garde l'échantillon au plus faible RTT (le plus fiable)
      if (rtt < net.bestRtt * 1.25 || net.bestRtt === Infinity) {
        net.bestRtt = Math.min(net.bestRtt, rtt);
        const off = m.s + rtt / 2 - t;
        net.offset = net.offset === 0 ? off : net.offset * 0.7 + off * 0.3;
      }
      return;
    }
    if (m.t === 'ping') { send({ t: 'pong', s: m.s }); return; }
    if (m.t === 'res') { const cb = pending.get(m.rid); if (cb) { pending.delete(m.rid); if (m.profile && onProfile) onProfile(m.profile, m); cb(m); } return; }
    const h = handlers.get(m.t);
    if (h) h(m);
  };
}

// utilisé par le mode test pour simuler un message du serveur
export function dispatch(m) { const h = handlers.get(m.t); if (h) h(m); }

export function syncClock() {
  for (let i = 0; i < 4; i++) setTimeout(() => send({ t: 'sync', c: performance.now() }), i * 150);
}
setInterval(() => { if (net.connected) send({ t: 'sync', c: performance.now() }); }, 5000);
