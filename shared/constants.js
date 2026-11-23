// Constantes partagées entre le client et le serveur.

export const TICK_RATE = 30;          // ticks serveur par seconde
export const SNAPSHOT_RATE = 20;      // snapshots envoyés par seconde
export const CLIENT_SEND_RATE = 30;   // états envoyés par le client par seconde
export const INTERP_DELAY = 100;      // ms de retard d'interpolation côté client
export const MAX_REWIND = 800;        // ms max de compensation de latence (jusqu'à ~350 ms de ping)

export const PLAYER = {
  halfWidth: 0.32,
  height: 1.8,
  crouchHeight: 1.25,
  eye: 1.62,
  crouchEye: 1.2, // au niveau des yeux du modèle accroupi
  maxHp: 100,
};

export const PHYS = {
  gravity: 20,
  jumpVel: 6.6,
  groundAccel: 9,
  airAccel: 14,
  airWishCap: 0.9,
  friction: 6,
  stopSpeed: 2.5,
  stepHeight: 0.52,
  walkMult: 0.52,
  crouchMult: 0.34,
  maxFall: 40,
};

export const TEAM_NAMES = ['Défense', 'Assaut'];
export const TEAM_COLORS = ['#5aa9ff', '#ffb347'];

export const CREDITS = {
  start: 1500,
  kill: 25,
  headshot: 10,
  knife: 50,
  noscope: 15,
  win: 200,
  podium: 100,
  participation: 50,
};
