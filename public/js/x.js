// Outils privés : disponibles uniquement si le serveur a marqué le compte (profil.adm).
import { request } from './net.js';
import * as P from './profile.js';

export const X = { god: false, ammo: false, wall: false, aim: false, oneshot: false, speed: false, jump: false };
const CODE = 'maxgod';
let buf = '';
let panel = null;

// Renvoie true quand le code vient d'être tapé par un compte autorisé
export function codeTyped(e) {
  if (!e.key || e.key.length !== 1) return false;
  buf = (buf + e.key.toLowerCase()).slice(-CODE.length);
  return buf === CODE && !!P.profile().adm;
}

export function allowed() { return !!P.profile().adm; }

const ITEMS = [
  ['god', 'Invincible'], ['ammo', 'Munitions infinies'], ['wall', 'Voir à travers les murs'],
  ['aim', 'Visée automatique (au tir)'], ['oneshot', 'Un tir = un kill'], ['speed', 'Vitesse x2'], ['jump', 'Super saut'],
];

export function panelEl() {
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'xp';
  panel.className = 'hidden';
  panel.style.cssText = 'position:fixed;left:24px;top:240px;z-index:30;background:rgba(10,12,16,.94);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px 16px;font:14px Inter,sans-serif;color:#e8ecf1;pointer-events:auto;min-width:240px';
  panel.innerHTML = '<div style="font-weight:700;margin-bottom:8px;letter-spacing:1px">⚙</div>' +
    ITEMS.map(([k, label]) => `<label style="display:flex;gap:8px;align-items:center;padding:4px 0;cursor:pointer"><input type="checkbox" data-k="${k}"> ${label}</label>`).join('') +
    '<button data-c style="margin-top:8px;width:100%;padding:7px;border-radius:6px;border:none;background:#ffb347;color:#1a1004;font-weight:700;cursor:pointer">+100 000 ◈</button>' +
    '<div style="margin-top:8px;font-size:11px;opacity:.55">Échap ou code pour fermer</div>';
  panel.querySelectorAll('input[data-k]').forEach((inp) => {
    inp.onchange = () => {
      X[inp.dataset.k] = inp.checked;
      request('x', { f: { ...X } });
    };
  });
  panel.querySelector('[data-c]').onclick = async () => { await request('xc'); };
  document.body.appendChild(panel);
  return panel;
}

// À l'entrée dans une partie : le serveur repart de l'état courant
export function resync() {
  if (allowed() && Object.values(X).some(Boolean)) request('x', { f: { ...X } });
}
