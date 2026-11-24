// Point d'entrée du client.
import * as P from './profile.js';
import { connect, on, send, request, setProfileHandler } from './net.js';
import { initGame, enterGame, exitGame, applySettings, refreshViewSkin, isActive } from './game.js';
import { initMenu, showMenu, hideMenu, updateRooms, setStatus, toast, renderAll } from './menu.js';

P.load();

function hello() {
  const legacy = P.legacyProfile();
  send({ t: 'hello', token: P.getToken(), name: P.profile().name, local: legacy || undefined });
}

setProfileHandler((p, m) => { P.setProfile(p); if (m) P.applyInvDelta(m.invAdd, m.invDel); });

initGame(document.getElementById('game'), (tab) => {
  showMenu(tab);
  request('profile'); // statistiques à jour
});

initMenu({
  onQuick: (mode) => send({ t: 'join', mode }),
  onJoin: (room) => send({ t: 'join', room }),
  onCreate: (opts) => send({ t: 'create', opts }),
  onRefresh: () => send({ t: 'list' }),
  onSettings: () => applySettings(),
  onSkins: () => refreshViewSkin(),
});

on('welcome', (m) => {
  P.setToken(m.token);
  P.setProfile(m.profile);
  P.legacyDone();
  updateRooms(m.rooms);
  applySettings();
  renderAll();
});
on('rooms', (m) => updateRooms(m.rooms));
on('joined', (m) => { hideMenu(); enterGame(m); });
on('left', () => {});
on('error', (m) => toast(m.msg));
on('disconnect', () => {
  if (isActive()) { exitGame(); showMenu(); toast('Connexion au serveur perdue — reconnexion…', 3500); }
});

connect(hello, setStatus);

// rafraîchit la liste des salons quand le menu est ouvert
setInterval(() => {
  if (!document.getElementById('menu').classList.contains('hidden')) send({ t: 'list' });
}, 5000);

document.getElementById('loading').remove();
