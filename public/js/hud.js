// Interface en jeu (DOM).
import { WEAPONS } from '/shared/weapons.js';
import { TEAM_NAMES, TEAM_COLORS } from '/shared/constants.js';
import { MODES, GUNGAME_LADDER } from '/shared/modes.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

let centerTimer = 0, subTimer = 0;

export const hud = {
  root: $('hud'),
  show() { $('hud').classList.remove('hidden'); },
  hide() { $('hud').classList.add('hidden'); },

  setHp(hp) {
    $('hp-val').textContent = Math.max(0, Math.round(hp));
    $('hp-bar').firstElementChild.style.width = Math.max(0, hp) + '%';
    $('hp-box').classList.toggle('low', hp <= 25);
  },

  setAmmo(wid, mag, res, weapons, cur) {
    const w = WEAPONS[wid];
    $('weap-name').textContent = w ? w.name : '';
    const m = $('ammo-mag');
    if (!w || w.kind === 'knife' || w.kind === 'magic') { m.textContent = w && w.kind === 'magic' ? '✦' : '∞'; $('ammo-res').textContent = ''; m.classList.remove('low'); }
    else {
      m.textContent = mag;
      $('ammo-res').textContent = ' / ' + res;
      m.classList.toggle('low', mag <= Math.ceil(w.mag * 0.2));
    }
    const slots = $('weap-slots');
    const html = weapons.map((id) => `<span class="${id === cur ? 'on' : ''}">${WEAPONS[id].slot} ${esc(WEAPONS[id].name)}</span>`).join('');
    if (slots.innerHTML !== html) slots.innerHTML = html;
  },

  setMana(cur, max, show) {
    const box = $('mana-box');
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const pct = Math.max(0, Math.min(1, cur / max));
    $('mana-bar').firstElementChild.style.width = (pct * 100) + '%';
    $('mana-val').textContent = Math.round(cur);
  },

  setShield(val) {
    const el = $('shield-ind');
    el.classList.toggle('hidden', !(val > 0));
    if (val > 0) $('shield-val').textContent = Math.round(val);
  },

  // belt = [{type, icon, name, count, sel}]
  nades(belt) {
    const el = $('nade-belt');
    if (!belt || !belt.length) { el.innerHTML = ''; return; }
    el.innerHTML = belt.map((n) => `<div class="nade-slot ${n.count > 0 ? 'has' : ''} ${n.sel ? 'sel' : ''}"><div class="ni">${n.icon}</div><div class="nc">${n.count}</div><div class="nk">${n.key}</div></div>`).join('');
  },

  flash(dur, intensity) {
    const el = $('flash-overlay');
    el.style.transition = 'none';
    el.style.opacity = String(Math.min(1, 0.6 + intensity * 0.4));
    requestAnimationFrame(() => { el.style.transition = `opacity ${(dur / 1000).toFixed(2)}s ease-out`; el.style.opacity = '0'; });
  },

  setTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    $('tb-time').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  },

  setTop(left, right, modeText) {
    $('tb-left').innerHTML = left;
    $('tb-right').innerHTML = right;
    $('tb-mode').textContent = modeText;
  },

  killfeed(k, isMe) {
    const kf = $('killfeed');
    const el = document.createElement('div');
    el.className = 'kf' + (isMe ? ' me' : '');
    const icons = [];
    if (k.ns) icons.push('<span class="ki" title="No-scope">◎̸</span>');
    if (k.hs) icons.push('<span class="ki" title="Headshot">🎯</span>');
    if (k.bs) icons.push('<span class="ki" title="Dans le dos">🗡</span>');
    el.innerHTML = `<span style="color:${k.kc}">${esc(k.kn)}</span>${k.an ? ` <span style="opacity:.8">+ ${esc(k.an)}</span>` : ''} <span class="kw">${esc(k.wn)}</span>${icons.join('')} <span style="color:${k.vc}">${esc(k.vn)}</span>`;
    kf.appendChild(el);
    while (kf.children.length > 6) kf.firstChild.remove();
    setTimeout(() => el.remove(), 7000);
  },

  center(text, sub = '', dur = 2000, color = '#fff') {
    const c = $('center-msg');
    c.innerHTML = text; c.style.color = color; c.style.opacity = text ? 1 : 0;
    clearTimeout(centerTimer);
    if (dur) centerTimer = setTimeout(() => { c.style.opacity = 0; }, dur);
    const s = $('sub-msg');
    s.innerHTML = sub; s.style.opacity = sub ? 1 : 0;
    clearTimeout(subTimer);
    if (dur) subTimer = setTimeout(() => { s.style.opacity = 0; }, dur);
  },

  creditPop(n, why) {
    const el = document.createElement('div');
    el.className = 'cpop';
    el.textContent = `+${n} ◈  ${why}`;
    $('credit-pops').appendChild(el);
    setTimeout(() => el.remove(), 2500);
  },

  hitmarker(hs, kill) {
    const h = $('hitmarker');
    h.classList.toggle('hs', !!hs || !!kill);
    h.style.transition = 'none';
    h.style.opacity = 1;
    h.style.transform = kill ? 'scale(1.4)' : 'scale(1)';
    requestAnimationFrame(() => { h.style.transition = 'opacity .35s'; h.style.opacity = 0; });
  },

  damageFlash(amount) {
    const f = $('dmg-flash');
    f.style.transition = 'none';
    f.style.opacity = Math.min(1, 0.3 + amount / 60);
    requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = 0; });
  },

  damageDir(angle) {
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `rotate(${angle}rad)`;
    $('dmg-dirs').appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = 0; });
    setTimeout(() => el.remove(), 1300);
  },

  scope(level) {
    $('scope').classList.toggle('hidden', !level);
    $('crosshair').style.display = level ? 'none' : '';
  },

  crosshair(st, spreadPx) {
    const c = $('crosshair');
    c.style.setProperty('--col', st.crossColor);
    c.style.setProperty('--len', st.crossSize + 'px');
    c.style.setProperty('--th', st.crossThick + 'px');
    const gap = st.crossGap + (st.crossDynamic ? Math.min(40, spreadPx) : 0);
    c.style.setProperty('--gap', gap + 'px');
    c.classList.toggle('dot', !!st.crossDot);
  },

  death(show, info = '') {
    $('death-panel').classList.toggle('hidden', !show);
    if (show && info) {
      $('dp-killer').innerHTML = info.killer;
      $('dp-skin').innerHTML = info.skin || '';
    }
  },
  deathTimer(sec) { $('dp-timer').textContent = sec > 0 ? `Réapparition dans ${sec.toFixed(1)} s` : 'Réapparition…'; },

  chatLine(html, sys = false) {
    const log = $('chat-log');
    const d = document.createElement('div');
    if (sys) d.className = 'sys';
    d.innerHTML = html;
    log.appendChild(d);
    while (log.children.length > 12) log.firstChild.remove();
  },

  fps(v) { $('fps').textContent = v ? v + ' FPS' : ''; },

  scoreboard(show, data) {
    const sb = $('scoreboard');
    sb.classList.toggle('hidden', !show);
    if (!show || !data) return;
    sb.innerHTML = renderBoard(data, false);
  },

  endScreen(show, data) {
    const es = $('end-screen');
    es.classList.toggle('hidden', !show);
    if (!show) return;
    es.innerHTML = data.html;
  },
};

// data = { mode, rows:[{id,name,kills,deaths,hs,ping,gg,team,alive,assists,bot,me}], teamScore, title }
export function renderBoard(data, ending) {
  const cfg = MODES[data.mode];
  const row = (r, i) => `<tr class="${r.me ? 'me' : ''} ${r.alive || ending ? '' : 'dead'}">
    <td class="rank">${i + 1}</td>
    <td>${r.bot ? '<span style="opacity:.6">🤖</span> ' : ''}${esc(r.name)}</td>
    ${cfg.ladder ? `<td>${r.gg + 1}/${GUNGAME_LADDER.length} <small style="opacity:.6">${esc(WEAPONS[GUNGAME_LADDER[Math.min(r.gg, GUNGAME_LADDER.length - 1)]].name)}</small></td>` : ''}
    <td>${r.kills}</td><td>${r.assists}</td><td>${r.deaths}</td><td>${r.kills ? Math.round(r.hs / r.kills * 100) : 0}%</td><td>${(r.kills / Math.max(1, r.deaths)).toFixed(2)}</td><td>${r.bot ? 'BOT' : r.ping}</td></tr>`;
  const head = `<tr><th></th><th>Joueur</th>${cfg.ladder ? '<th>Niveau</th>' : ''}<th>K</th><th>A</th><th>M</th><th>HS%</th><th>K/D</th><th>Ping</th></tr>`;
  const sorter = cfg.ladder ? (a, b) => (b.gg - a.gg) || (b.kills - a.kills) : (a, b) => (b.kills - a.kills) || (a.deaths - b.deaths);
  let html = `<h2>${esc(data.title || cfg.name)}</h2>`;
  if (cfg.teams) {
    for (const tm of [0, 1]) {
      const rows = data.rows.filter((r) => r.team === tm).sort(sorter);
      html += `<div class="sb-team"><h3 style="color:${TEAM_COLORS[tm]}">${TEAM_NAMES[tm]} — ${data.teamScore[tm]}</h3><table class="sb-table">${head}${rows.map(row).join('')}</table></div>`;
    }
  } else {
    const rows = data.rows.slice().sort(sorter);
    html += `<table class="sb-table">${head}${rows.map(row).join('')}</table>`;
  }
  return html;
}

// ── Radar ────────────────────────────────────────────────────────────────
export function drawRadar(canvas, map, me, others, teams) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, R = W / 2;
  const scale = 2.4; // pixels par mètre
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(20,24,30,0.6)'; ctx.fillRect(0, 0, W, W);
  ctx.translate(R, R);
  ctx.rotate(me.yaw);
  ctx.scale(scale, scale);
  ctx.translate(-me.x, -me.z);
  for (const b of map.boxes) {
    if (b.m === 'floor' || b.y1 < 0.3) continue;
    ctx.fillStyle = b.y1 > 2 ? 'rgba(200,205,215,0.55)' : 'rgba(160,165,175,0.35)';
    ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  }
  for (const o of others) {
    ctx.fillStyle = o.color;
    ctx.beginPath(); ctx.arc(o.x, o.z, o.big ? 1.6 : 1.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // joueur au centre
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(R, R - 7); ctx.lineTo(R - 5, R + 5); ctx.lineTo(R + 5, R + 5); ctx.closePath(); ctx.fill();
  void teams;
}
