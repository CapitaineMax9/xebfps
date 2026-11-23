// Menus : jouer, inventaire, caisses, contrat d'échange, paramètres.
import { MODES, MODE_ORDER } from '/shared/modes.js';
import { MAPS, MAP_LIST } from '/shared/maps.js';
import { WEAPONS, SKINNABLE } from '/shared/weapons.js';
import { SKINS, CASES, RARITIES, RARITY_ORDER, KNIVES, wearOf, rollCase, itemValue, itemFullName, weaponLabel, tradeUpResult } from '/shared/skins.js';
import * as P from './profile.js';
import { request } from './net.js';
import { thumbnail, Viewer } from './preview.js';
import * as A from './audio.js';
import { esc } from './hud.js';
import { GFX_PRESETS } from './gfx.js';

const $ = (id) => document.getElementById(id);
let cb = {};
let rooms = [];
let viewer = null;

export function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

// ── Miniatures différées (pour ne pas bloquer l'interface) ─────────────────
const thumbQueue = [];
function lazyThumb(img, item, weaponId, w = 256, h = 150) {
  thumbQueue.push({ img, item, weaponId, w, h });
  if (thumbQueue.length === 1) requestAnimationFrame(processThumbs);
}
function processThumbs() {
  const t0 = performance.now();
  while (thumbQueue.length && performance.now() - t0 < 24) {
    const j = thumbQueue.shift();
    if (!j.img.isConnected && !j.force) continue;
    try { j.img.src = thumbnail(j.item, j.weaponId, j.w, j.h); } catch (e) { console.warn(e); }
  }
  if (thumbQueue.length) requestAnimationFrame(processThumbs);
}
function thumbImg(item, weaponId, cls = 'thumb') {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  lazyThumb(img, item, weaponId);
  return img;
}

function rarityColor(item) { return RARITIES[SKINS[item.skin].rarity].color; }

function itemCard(item, { onClick, selected = false } = {}) {
  const s = SKINS[item.skin];
  const el = document.createElement('div');
  el.className = 'item' + (selected ? ' selected' : '');
  el.appendChild(thumbImg(item));
  const bar = document.createElement('div');
  bar.className = 'rbar';
  bar.style.background = RARITIES[s.rarity].color;
  el.appendChild(bar);
  const wear = wearOf(item.float);
  el.insertAdjacentHTML('beforeend', `<div class="iname" style="color:${s.rarity === 'gold' ? '#e4ae39' : '#fff'}">${esc(s.weapon === 'knife' ? '★ ' + KNIVES[s.knife].name : weaponLabel(s.weapon))} | ${esc(s.name)}</div>
    <div class="iwear"><span>${esc(wear.name)}</span><span>${item.float.toFixed(4)}</span></div>
    ${item.st ? '<span class="st-badge">StatKill™</span>' : ''}${P.isEquipped(item.uid) ? '<span class="eq-badge">ÉQUIPÉ</span>' : ''}`);
  if (onClick) el.onclick = () => onClick(item);
  return el;
}

// ════════════════════════════════════════════════════════════════════════
export function initMenu(callbacks) {
  cb = callbacks;
  const prof = P.profile();
  // onglets
  document.querySelectorAll('.tab').forEach((b) => {
    b.onclick = () => { showTab(b.dataset.tab); A.initAudio(); A.playUi(); };
  });
  // pseudo
  const ni = $('name-input');
  ni.value = prof.name;
  ni.onchange = async () => {
    const v = ni.value.replace(/[<>]/g, '').trim().slice(0, 16);
    if (v && !P.profile().registered) await request('name', { name: v });
    ni.value = P.profile().name;
  };
  initAccountUI();
  P.onChange(() => { renderCredits(); renderAccount(); });
  // formulaire de création
  $('cr-mode').innerHTML = MODE_ORDER.map((m) => `<option value="${m}">${esc(MODES[m].name)}</option>`).join('');
  const fillMaps = () => {
    const m = MODES[$('cr-mode').value];
    $('cr-map').innerHTML = m.maps.map((id) => `<option value="${id}">${esc(MAPS[id].name)}</option>`).join('');
  };
  $('cr-mode').onchange = fillMaps; fillMaps();
  $('btn-create').onclick = () => {
    A.initAudio();
    cb.onCreate({ name: $('cr-name').value, mode: $('cr-mode').value, map: $('cr-map').value, max: +$('cr-max').value, bots: +$('cr-bots').value, difficulty: $('cr-diff').value });
  };
  $('btn-refresh').onclick = () => cb.onRefresh();
  renderModeCards();
  renderCredits();
  // fenêtres modales
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeModal; });
  $('item-modal').addEventListener('click', (e) => { if (e.target.id === 'item-modal') closeModal(); });
  viewer = new Viewer($('preview-canvas'));
  // inventaire
  $('inv-filter').innerHTML = '<option value="all">Toutes les armes</option>' + SKINNABLE.map((w) => `<option value="${w}">${esc(weaponLabel(w))}</option>`).join('');
  $('inv-filter').onchange = renderInventory;
  $('inv-sort').onchange = renderInventory;
  $('btn-tradeup').onclick = doTradeUp;
  renderSettings();
}

export function showTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-page').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
  if (tab === 'inventory') renderInventory();
  if (tab === 'cases') renderCases();
  if (tab === 'tradeup') renderTradeUp();
  if (tab === 'settings') renderSettings();
}

export function showMenu(tab) {
  $('menu').classList.remove('hidden');
  renderCredits();
  if (tab) showTab(tab);
  cb.onRefresh && cb.onRefresh();
}
export function hideMenu() { $('menu').classList.add('hidden'); closeModal(); }

export function setStatus(s) {
  const el = $('net-status');
  el.className = 'net-status ' + (s === 'ok' ? 'ok' : s === 'closed' || s === 'error' ? 'err' : '');
  el.textContent = s === 'ok' ? '● Connecté au serveur' : s === 'closed' ? '● Déconnecté — reconnexion…' : s === 'error' ? '● Erreur de connexion' : 'Connexion…';
}

export function renderCredits() { $('credits').textContent = P.profile().credits.toLocaleString('fr-FR'); }

// Re-dessine tout après connexion / changement de compte
export function renderAll() {
  renderCredits();
  renderAccount();
  const active = document.querySelector('.tab.active');
  if (active) showTab(active.dataset.tab);
}

// ── Compte ───────────────────────────────────────────────────────────────
let accMode = 'register';
function renderAccount() {
  const p = P.profile();
  const ni = $('name-input');
  if (document.activeElement !== ni) ni.value = p.name;
  ni.disabled = !!p.registered;
  ni.title = p.registered ? 'Le pseudo d\'un compte enregistré ne peut pas être modifié' : '';
  const box = $('acc-box');
  if (p.registered) {
    box.innerHTML = `<span class="acc-badge ok">● Compte : <b>${esc(p.name)}</b></span>
      <button class="btn small" id="acc-pass">Mot de passe</button><button class="btn small danger" id="acc-logout">Se déconnecter</button>`;
    $('acc-logout').onclick = async () => {
      if (!confirm('Se déconnecter ? Tu repasseras en invité sur ce navigateur.')) return;
      const r = await request('logout');
      if (r.token) P.setToken(r.token);
      P.setProfile(r.profile, { fromLogin: true });
      cb.onSkins(); renderAll(); toast('Déconnecté.');
    };
    $('acc-pass').onclick = () => openAccount('password');
  } else {
    box.innerHTML = `<span class="acc-badge">Invité — ta progression est liée à ce navigateur</span>
      <button class="btn small primary" id="acc-reg">Créer un compte</button><button class="btn small" id="acc-log">Se connecter</button>`;
    $('acc-reg').onclick = () => openAccount('register');
    $('acc-log').onclick = () => openAccount('login');
  }
}

function initAccountUI() {
  $('account-modal').addEventListener('click', (e) => { if (e.target.id === 'account-modal') closeAccount(); });
  $('acc-close').onclick = closeAccount;
  $('acc-form').onsubmit = async (e) => {
    e.preventDefault();
    const user = $('acc-user').value.trim(), pass = $('acc-pass1').value, pass2 = $('acc-pass2').value;
    const err = $('acc-error');
    err.textContent = '';
    if ((accMode === 'register' || accMode === 'password') && pass !== pass2) { err.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
    $('acc-submit').disabled = true;
    let r;
    if (accMode === 'register') r = await request('register', { username: user, password: pass });
    else if (accMode === 'login') r = await request('login', { username: user, password: pass });
    else r = await request('password', { old: $('acc-old').value, password: pass });
    $('acc-submit').disabled = false;
    if (r.error) { err.textContent = r.error; return; }
    if (r.token) P.setToken(r.token);
    if (accMode === 'login') { P.setProfile(r.profile, { fromLogin: true }); cb.onSkins(); cb.onSettings(); }
    closeAccount();
    renderAll();
    toast(accMode === 'register' ? 'Compte créé ! Ta progression est sauvegardée sur le serveur.' : accMode === 'login' ? `Bienvenue ${P.profile().name} !` : 'Mot de passe modifié.');
  };
}

function openAccount(mode) {
  accMode = mode;
  $('account-modal').classList.remove('hidden');
  $('acc-title').textContent = { register: 'Créer un compte', login: 'Se connecter', password: 'Changer le mot de passe' }[mode];
  $('acc-hint').textContent = {
    register: 'Ton inventaire, tes crédits et tes skins actuels sont conservés dans le nouveau compte. Tu pourras te connecter depuis n\'importe quel PC.',
    login: 'Connecte-toi pour retrouver ta progression. (La progression de l\'invité actuel reste sur ce navigateur.)',
    password: '',
  }[mode];
  $('acc-user-row').classList.toggle('hidden', mode === 'password');
  $('acc-old-row').classList.toggle('hidden', mode !== 'password');
  $('acc-pass2-row').classList.toggle('hidden', mode === 'login');
  $('acc-user').value = mode === 'register' ? P.profile().name.replace(/[^\p{L}\p{N}_-]/gu, '') : '';
  $('acc-pass1').value = ''; $('acc-pass2').value = ''; $('acc-old').value = '';
  $('acc-error').textContent = '';
  $('acc-submit').textContent = { register: 'Créer le compte', login: 'Connexion', password: 'Valider' }[mode];
  setTimeout(() => (mode === 'password' ? $('acc-old') : $('acc-user')).focus(), 0);
}
function closeAccount() { $('account-modal').classList.add('hidden'); }

// ── Jouer ────────────────────────────────────────────────────────────────
const MODE_ART = {
  ffa: 'linear-gradient(135deg, #ff8a1f 0%, #b8311f 55%, #2a0f12 100%)',
  tdm: 'linear-gradient(135deg, #3f7fd8 0%, #1d2f5a 60%, #0f1424 100%)',
  gungame: 'linear-gradient(135deg, #42b86a 0%, #1d5a3a 60%, #0f1a14 100%)',
  awp: 'linear-gradient(135deg, #a07cff 0%, #4a2a8a 60%, #140f24 100%)',
  hs: 'linear-gradient(135deg, #ff4f6a 0%, #7a1f3a 60%, #1f0f14 100%)',
};

function renderModeCards() {
  const wrap = $('mode-cards');
  wrap.innerHTML = '';
  for (const m of MODE_ORDER) {
    const cfg = MODES[m];
    const players = rooms.filter((r) => r.mode === m).reduce((a, r) => a + r.humans, 0);
    const el = document.createElement('div');
    el.className = 'mode-card' + (m === 'ffa' ? ' featured' : '');
    el.innerHTML = `<div class="mc-bg" style="background:${MODE_ART[m]}"></div>
      ${m === 'ffa' ? '<span class="mc-tag">MODE PRINCIPAL</span>' : ''}
      <span class="mc-players">${players} en ligne</span>
      <h4>${esc(cfg.short)}</h4><p><b>${esc(cfg.name)}</b> — ${esc(cfg.desc)}</p>`;
    el.onclick = () => { A.initAudio(); A.playUi(); cb.onQuick(m); };
    wrap.appendChild(el);
  }
}

export function updateRooms(list) {
  rooms = list;
  renderModeCards();
  const tb = $('rooms').querySelector('tbody');
  tb.innerHTML = '';
  for (const r of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(r.name)}</td><td>${esc(MODES[r.mode].short)}</td><td>${esc(MAPS[r.map].name)}</td><td>${r.humans}/${r.max} <small style="opacity:.6">+${r.bots} bots</small></td><td></td>`;
    const b = document.createElement('button');
    b.className = 'btn small primary';
    b.textContent = 'Rejoindre';
    b.disabled = r.humans >= r.max;
    b.onclick = () => { A.initAudio(); cb.onJoin(r.id); };
    tr.lastChild.appendChild(b);
    tb.appendChild(tr);
  }
}

// ── Inventaire ───────────────────────────────────────────────────────────
function renderInventory() {
  const prof = P.profile();
  // équipement
  const eq = $('equip-list');
  eq.innerHTML = '';
  for (const w of SKINNABLE) {
    const it = P.equippedItem(w);
    const row = document.createElement('div');
    row.className = 'equip-row';
    row.innerHTML = `<span class="dot" style="background:${it ? rarityColor(it) : '#555'}"></span><span class="ew">${esc(weaponLabel(w))}</span><span class="es">${it ? esc(itemFullName(it).replace(/^.*\| /, '')) : '<span style="opacity:.5">Par défaut</span>'}</span>`;
    row.onclick = () => { $('inv-filter').value = w; renderInventory(); };
    eq.appendChild(row);
  }
  const filter = $('inv-filter').value, sort = $('inv-sort').value;
  let items = prof.inventory.slice();
  if (filter !== 'all') items = items.filter((i) => SKINS[i.skin].weapon === filter);
  if (sort === 'rarity') items.sort((a, b) => RARITY_ORDER.indexOf(SKINS[b.skin].rarity) - RARITY_ORDER.indexOf(SKINS[a.skin].rarity) || a.float - b.float);
  else if (sort === 'value') items.sort((a, b) => itemValue(b) - itemValue(a));
  else items.reverse();
  const grid = $('inv-grid');
  grid.innerHTML = '';
  $('inv-count').textContent = `${prof.inventory.length} objet(s)`;
  if (!items.length) {
    grid.innerHTML = `<p class="hint">Aucun objet ici. Ouvre des caisses dans l'onglet <b>CAISSES</b> — tu gagnes des crédits en faisant des kills !</p>`;
    return;
  }
  for (const it of items) grid.appendChild(itemCard(it, { onClick: openItem }));
}

function openItem(item, extraActions = null) {
  const s = SKINS[item.skin];
  const r = RARITIES[s.rarity];
  const wear = wearOf(item.float);
  $('item-modal').classList.remove('hidden');
  viewer.show(item);
  $('item-info').innerHTML = `<h2 style="color:${s.rarity === 'gold' ? '#e4ae39' : '#fff'}">${esc(itemFullName(item))}</h2>
    <div class="meta"><span style="color:${r.color};font-weight:700">${esc(r.name)}</span><span>${esc(wear.name)}</span><span>Float : <b>${item.float.toFixed(6)}</b></span><span>Motif n° ${item.seed}</span>${item.st ? `<span style="color:#cf6a32">StatKill™ : <b>${item.kills}</b> kills confirmés</span>` : ''}<span>Valeur : <b style="color:var(--acc)">${itemValue(item)} ◈</b></span></div>
    <div class="float-bar"><i style="left:calc(${(item.float * 100).toFixed(2)}% - 1.5px)"></i></div>
    <p class="hint">Glisse pour tourner l'arme · molette pour zoomer.</p>`;
  const act = $('item-actions');
  act.innerHTML = '';
  const add = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; act.appendChild(b); };
  if (extraActions) extraActions(add);
  else {
    if (P.isEquipped(item.uid)) add('Déséquiper', '', async () => { await request('unequip', { weapon: s.weapon }); cb.onSkins(); closeModal(); renderInventory(); });
    else add('Équiper', 'primary', async () => {
      const r = await request('equip', { uid: item.uid });
      if (r.error) { toast(r.error); return; }
      cb.onSkins(); A.playUi(); toast('Équipé : ' + itemFullName(item)); closeModal(); renderInventory();
    });
    add(`Vendre (+${itemValue(item)} ◈)`, 'danger', async () => {
      if (!confirm(`Vendre ${itemFullName(item)} pour ${itemValue(item)} crédits ?`)) return;
      const wasEq = P.isEquipped(item.uid);
      const r = await request('sell', { uid: item.uid });
      if (r.error) { toast(r.error); return; }
      if (wasEq) cb.onSkins();
      closeModal(); renderInventory();
    });
    add('Fermer', '', closeModal);
  }
}

function closeModal() {
  $('item-modal').classList.add('hidden');
  if (viewer) viewer.stop();
}

// ── Caisses ──────────────────────────────────────────────────────────────
function renderCases() {
  $('case-detail').classList.add('hidden');
  const list = $('case-list');
  list.classList.remove('hidden');
  list.innerHTML = '';
  for (const c of CASES) {
    const el = document.createElement('div');
    el.className = 'case-card';
    const awps = c.items.filter((id) => SKINS[id].weapon === 'awp').map((id) => SKINS[id].name);
    el.innerHTML = `<div class="case-art"><div class="case-box" style="background:linear-gradient(160deg, ${c.color}, #1a1208)"></div></div>
      ${c.tag ? `<span class="case-tag">${esc(c.tag)}</span>` : ''}<h4>${esc(c.name)}</h4><div class="price">${c.price} ◈</div><p class="hint">${c.items.length} objets · AWP : ${awps.map(esc).join(', ')}</p>`;
    el.onclick = () => { A.playUi(); showCase(c); };
    list.appendChild(el);
  }
}

function showCase(c) {
  $('case-list').classList.add('hidden');
  const d = $('case-detail');
  d.classList.remove('hidden');
  const odds = RARITY_ORDER.map((r) => `<span><i style="background:${RARITIES[r].color}"></i>${esc(RARITIES[r].name)} ${RARITIES[r].weight}%</span>`).join('');
  d.innerHTML = `<div class="cd-head"><button class="btn small" id="cd-back">← Retour</button><h2>${esc(c.name)}</h2>
    <button class="btn primary" id="cd-open">Ouvrir (${c.price} ◈)</button><div class="odds">${odds}</div></div><div class="item-grid" id="cd-grid"></div>`;
  $('cd-back').onclick = renderCases;
  $('cd-open').onclick = () => openCase(c);
  const grid = $('cd-grid');
  const sorted = c.items.slice().sort((a, b) => RARITY_ORDER.indexOf(SKINS[a].rarity) - RARITY_ORDER.indexOf(SKINS[b].rarity));
  for (const id of sorted) {
    const s = SKINS[id];
    const fake = { uid: 'x', skin: id, float: 0.05, seed: 0, st: false, kills: 0 };
    const card = itemCard(fake, { onClick: () => openItem(fake, (add) => add('Fermer', '', closeModal)) });
    card.querySelector('.iwear').innerHTML = `<span style="color:${RARITIES[s.rarity].color}">${esc(RARITIES[s.rarity].name)}</span>`;
    grid.appendChild(card);
  }
}

let opening = false;
async function openCase(c) {
  if (opening) return;
  const prof = P.profile();
  if (prof.credits < c.price) { toast(`Pas assez de crédits (il te faut ${c.price} ◈). Fais des kills en ligne pour en gagner !`); return; }
  opening = true;
  A.initAudio();
  // le tirage est fait par le serveur
  const res = await request('openCase', { caseId: c.id });
  if (res.error) { opening = false; toast(res.error); return; }
  const result = res.item;
  // bande de la roulette
  const N = 52, WIN = 45;
  const strip = $('roulette-strip');
  strip.innerHTML = '';
  strip.style.transition = 'none';
  strip.style.transform = 'translateX(0)';
  const cells = [];
  for (let i = 0; i < N; i++) {
    // les cases décoratives utilisent un motif canonique (plus rapide à générer)
    const it = i === WIN ? result : { ...rollCase(c), seed: 0, float: 0.05, st: false };
    const s = SKINS[it.skin];
    const el = document.createElement('div');
    el.className = 'ritem';
    if (s.rarity === 'gold') {
      el.innerHTML = `<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:64px;color:#e4ae39;background:radial-gradient(circle,#4a3a10,#1a1406)">★</div><div class="rn" style="color:#e4ae39">★ Objet rare spécial</div>`;
    } else {
      el.appendChild(thumbImg(it));
      el.insertAdjacentHTML('beforeend', `<div class="rn">${esc(weaponLabel(s.weapon))} | ${esc(s.name)}</div>`);
    }
    const bar = document.createElement('div'); bar.className = 'rbar'; bar.style.background = RARITIES[s.rarity].color;
    el.appendChild(bar);
    strip.appendChild(el);
    cells.push(el);
  }
  // les miniatures de la bande doivent être prêtes même hors écran
  for (const j of thumbQueue) j.force = true;
  $('op-title').textContent = 'Ouverture : ' + c.name;
  $('op-result').classList.add('hidden');
  $('opening').classList.remove('hidden');
  const cellW = 176;
  const box = $('roulette').getBoundingClientRect();
  const offset = WIN * cellW + cellW / 2 - box.width / 2 + (Math.random() - 0.5) * (cellW * 0.8);
  const dur = 6200;
  const t0 = performance.now();
  let lastIdx = -1;
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / dur);
    const x = offset * ease(t);
    strip.style.transform = `translateX(${-x}px)`;
    const idx = Math.floor((x + box.width / 2) / cellW);
    if (idx !== lastIdx) { lastIdx = idx; A.playTick(1 + t * 0.3); }
    if (t < 1) requestAnimationFrame(step);
    else reveal();
  };
  requestAnimationFrame(step);

  const reveal = () => {
    const s = SKINS[result.skin];
    const r = RARITIES[s.rarity];
    A.playReveal(s.rarity);
    const res = $('op-result');
    res.classList.remove('hidden');
    res.innerHTML = `<div class="res-card" style="border-color:${r.color}"><img alt="" src="${thumbnail(result, null, 512, 300)}"><div style="color:${r.color};font-weight:700">${esc(r.name)}</div>
      <h3 style="color:${s.rarity === 'gold' ? '#e4ae39' : '#fff'}">${esc(itemFullName(result))}</h3><div class="hint">${esc(wearOf(result.float).name)} · float ${result.float.toFixed(6)} · motif n° ${result.seed}</div>
      <div class="btns"><button class="btn primary" id="op-equip">Équiper</button><button class="btn" id="op-again">Ouvrir une autre (${c.price} ◈)</button><button class="btn danger" id="op-sell">Vendre (+${itemValue(result)} ◈)</button><button class="btn" id="op-close">Fermer</button></div></div>`;
    opening = false;
    $('op-equip').onclick = async () => { await request('equip', { uid: result.uid }); cb.onSkins(); toast('Équipé !'); closeOpening(); };
    $('op-again').onclick = () => { openCase(c); };
    $('op-sell').onclick = async () => { await request('sell', { uid: result.uid }); closeOpening(); };
    $('op-close').onclick = closeOpening;
  };
}

function closeOpening() {
  $('opening').classList.add('hidden');
  renderCredits();
}

// ── Contrat d'échange ────────────────────────────────────────────────────
let tuSel = [];
function renderTradeUp() {
  const prof = P.profile();
  tuSel = tuSel.filter((uid) => prof.inventory.find((i) => i.uid === uid));
  const slots = $('tu-slots');
  slots.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const uid = tuSel[i];
    const el = document.createElement('div');
    el.className = 'tu-slot';
    if (uid) {
      const it = prof.inventory.find((x) => x.uid === uid);
      el.style.borderColor = rarityColor(it); el.style.borderStyle = 'solid';
      el.appendChild(thumbImg(it, null, ''));
      el.onclick = () => { tuSel.splice(i, 1); renderTradeUp(); };
    } else el.textContent = `${i + 1}`;
    slots.appendChild(el);
  }
  $('btn-tradeup').disabled = tuSel.length !== 10;
  const rar = tuSel.length ? SKINS[prof.inventory.find((i) => i.uid === tuSel[0]).skin].rarity : null;
  const grid = $('tu-grid');
  grid.innerHTML = '';
  const eligible = prof.inventory.filter((i) => {
    const r = SKINS[i.skin].rarity;
    return r !== 'gold' && r !== 'covert' && !tuSel.includes(i.uid) && (!rar || r === rar);
  });
  if (!eligible.length && !tuSel.length) grid.innerHTML = '<p class="hint">Aucun objet éligible (il faut des objets Militaire, Restreint ou Classifié).</p>';
  for (const it of eligible) {
    grid.appendChild(itemCard(it, { onClick: () => { if (tuSel.length < 10) { tuSel.push(it.uid); A.playUi(); renderTradeUp(); } } }));
  }
}

async function doTradeUp() {
  const prof = P.profile();
  const items = tuSel.map((uid) => prof.inventory.find((i) => i.uid === uid)).filter(Boolean);
  if (!tradeUpResult(items.map((i) => ({ ...i })), () => 0.5)) { toast('Contrat invalide.'); return; }
  if (!confirm('Échanger ces 10 objets contre 1 objet de rareté supérieure ?')) return;
  const unequip = items.some((it) => P.isEquipped(it.uid));
  const r = await request('tradeup', { uids: tuSel });
  if (r.error) { toast(r.error); return; }
  const res = r.item;
  if (unequip) cb.onSkins();
  tuSel = [];
  A.playReveal(SKINS[res.skin].rarity);
  renderTradeUp();
  openItem(res);
}

// ── Paramètres ───────────────────────────────────────────────────────────
function renderSettings() {
  const st = P.profile().settings;
  const f = $('settings-form');
  const rows = [
    ['sens', 'Sensibilité souris', 'range', 0.2, 8, 0.05],
    ['scopeSens', 'Sensibilité en lunette (multiplicateur)', 'range', 0.3, 2, 0.05],
    ['fov', 'Champ de vision (FOV)', 'range', 70, 110, 1],
    ['viewmodelFov', 'FOV de l\'arme', 'range', 54, 82, 1],
    ['volume', 'Volume', 'range', 0, 1, 0.01],
    ['crossColor', 'Couleur du viseur', 'color'],
    ['crossSize', 'Longueur du viseur', 'range', 1, 20, 1],
    ['crossGap', 'Écart du viseur', 'range', 0, 16, 1],
    ['crossThick', 'Épaisseur du viseur', 'range', 1, 6, 1],
    ['crossDot', 'Point central', 'checkbox'],
    ['crossDynamic', 'Viseur dynamique (écart selon la précision)', 'checkbox'],
    ['bob', 'Balancement de l\'arme', 'checkbox'],
    ['shadows', 'Ombres', 'checkbox'],
    ['showFps', 'Afficher les FPS', 'checkbox'],
  ];
  f.innerHTML = '<h3>Paramètres</h3>';
  const gq = document.createElement('div');
  gq.className = 'set-row';
  gq.innerHTML = `<label for="set-gfx">Qualité graphique</label><select id="set-gfx">${Object.entries(GFX_PRESETS).map(([k, v]) => `<option value="${k}" ${st.gfx === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select><span></span>`;
  gq.querySelector('select').onchange = (e) => { st.gfx = e.target.value; P.save(); cb.onSettings(); };
  f.appendChild(gq);
  for (const [key, label, type, min, max, stp] of rows) {
    const row = document.createElement('div');
    row.className = 'set-row';
    const id = 'set-' + key;
    if (type === 'range') {
      row.innerHTML = `<label for="${id}">${esc(label)}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${stp}" value="${st[key]}"><span class="val">${fmt(key, st[key])}</span>`;
      const inp = row.querySelector('input');
      inp.oninput = () => { st[key] = +inp.value; row.querySelector('.val').textContent = fmt(key, st[key]); P.save(); cb.onSettings(); };
    } else if (type === 'color') {
      row.innerHTML = `<label for="${id}">${esc(label)}</label><input id="${id}" type="color" value="${st[key]}"><span></span>`;
      const inp = row.querySelector('input');
      inp.oninput = () => { st[key] = inp.value; P.save(); cb.onSettings(); };
    } else {
      row.innerHTML = `<label for="${id}">${esc(label)}</label><input id="${id}" type="checkbox" ${st[key] ? 'checked' : ''} style="width:20px;height:20px"><span></span>`;
      const inp = row.querySelector('input');
      inp.onchange = () => { st[key] = inp.checked; P.save(); cb.onSettings(); };
    }
    f.appendChild(row);
  }
  const stats = P.profile().stats || {};
  const n = (v) => v || 0;
  f.insertAdjacentHTML('beforeend', `<h3 style="margin-top:20px">Statistiques</h3><p class="hint">Kills : ${n(stats.kills)} · Morts : ${n(stats.deaths)} · Headshots : ${n(stats.hs)} · Caisses ouvertes : ${n(stats.cases)} · Matchs terminés : ${n(stats.matches)} · Victoires : ${n(stats.wins)}</p>
    <p class="hint">${P.profile().registered ? 'Ta progression est sauvegardée sur le serveur, dans ton compte.' : 'Tu joues en invité : ta progression est sauvegardée sur le serveur mais liée à ce navigateur. Crée un compte (onglet JOUER) pour la retrouver partout.'}</p>`);
  const reset = document.createElement('button');
  reset.className = 'btn';
  reset.textContent = 'Réinitialiser les paramètres';
  reset.onclick = () => {
    if (!confirm('Remettre tous les paramètres par défaut ?')) return;
    Object.assign(P.profile().settings, P.DEFAULT_SETTINGS);
    P.save(); cb.onSettings(); renderSettings();
  };
  f.appendChild(reset);
}

function fmt(key, v) {
  if (key === 'volume' || key === 'quality') return Math.round(v * 100) + '%';
  if (key === 'fov' || key === 'viewmodelFov') return v + '°';
  return (+v).toFixed(key === 'sens' || key === 'scopeSens' ? 2 : 0);
}
