// Point d'entrée du client.
import * as P from './profile.js';
import { connect, on, send } from './net.js';
import { initGame, enterGame, exitGame, applySettings, refreshViewSkin, isActive } from './game.js';
import { initMenu, showMenu, hideMenu, updateRooms, setStatus, toast, renderCredits } from './menu.js';

P.load();

function hello() {
  const prof = P.profile();
  send({ t: 'hello', name: prof.name, skins: P.equippedSkins(), loadout: prof.loadout });
}

initGame(document.getElementById('game'), (tab) => {
  showMenu(tab);
});

initMenu({
  onQuick: (mode) => send({ t: 'join', mode }),
  onJoin: (room) => send({ t: 'join', room }),
  onCreate: (opts) => send({ t: 'create', opts }),
  onRefresh: () => send({ t: 'list' }),
  onName: () => hello(),
  onSettings: () => applySettings(),
  onSkins: () => { send({ t: 'skins', skins: P.equippedSkins() }); refreshViewSkin(); },
});

on('welcome', (m) => updateRooms(m.rooms));
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
  renderCredits();
}, 5000);

document.getElementById('loading').remove();
