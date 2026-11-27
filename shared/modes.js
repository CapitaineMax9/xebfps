// Modes de jeu
export const GUNGAME_LADDER = ['mp7', 'ump45', 'xm1014', 'famas', 'ak47', 'm249', 'aug', 'awp', 'railgun', 'rpg', 'crossbow', 'deagle', 'knife'];

export const MODES = {
  ffa: {
    id: 'ffa', name: 'Chacun pour soi', short: 'FFA',
    desc: 'Tout le monde contre tout le monde. Premier à 30 kills ou meilleur score à la fin du temps.',
    teams: false, killLimit: 30, timeLimit: 600, respawn: 2, protect: 2, choice: true,
    maps: ['oasis', 'docks', 'duel', 'entrepot', 'temple'],
  },
  tdm: {
    id: 'tdm', name: 'Match à mort en équipe', short: 'TDM',
    desc: 'Défense contre Assaut. La première équipe à 75 kills gagne.',
    teams: true, killLimit: 75, timeLimit: 600, respawn: 3, protect: 2, choice: true,
    maps: ['oasis', 'docks', 'temple', 'entrepot'],
  },
  gungame: {
    id: 'gungame', name: 'Course à l\'armement', short: 'GUN GAME',
    desc: 'Chaque série de kills te donne l\'arme suivante. Le premier qui tue au couteau final gagne. Un kill au couteau fait reculer la victime.',
    teams: false, ladder: GUNGAME_LADDER, killsPerLevel: 2, timeLimit: 900, respawn: 1.5, protect: 1.5, choice: false,
    maps: ['docks', 'oasis', 'entrepot'],
  },
  awp: {
    id: 'awp', name: 'AWP Only', short: 'AWP',
    desc: 'Uniquement l\'AWP et le couteau. Un tir, un kill.',
    teams: false, killLimit: 25, timeLimit: 600, respawn: 2, protect: 2, choice: false, fixed: ['awp', 'knife'],
    maps: ['duel', 'oasis', 'temple'],
  },
  hs: {
    id: 'hs', name: 'Headshot Only', short: 'HS ONLY',
    desc: 'Seuls les tirs à la tête infligent des dégâts (le couteau fonctionne toujours).',
    teams: false, killLimit: 30, timeLimit: 600, respawn: 2, protect: 2, choice: true, hsOnly: true,
    maps: ['oasis', 'docks', 'duel', 'temple'],
  },
  br: {
    id: 'br', name: 'Battle Royale', short: 'BR',
    desc: 'Solo, dernier survivant. Tu démarres au couteau : ramasse des armes au sol et reste dans la zone qui rétrécit. Aucune réapparition.',
    teams: false, timeLimit: 600, respawn: 0, protect: 1.2, choice: false,
    br: true, loot: true, maps: ['royaume', 'oasis', 'docks'],
  },
};

export const MODE_ORDER = ['ffa', 'br', 'tdm', 'gungame', 'awp', 'hs'];

export function ggLevelWeapon(level) {
  return GUNGAME_LADDER[Math.min(level, GUNGAME_LADDER.length - 1)];
}
