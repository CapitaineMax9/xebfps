// Modes de jeu
export const GUNGAME_LADDER = ['mp9', 'p90', 'nova', 'm4a1s', 'ak47', 'ssg08', 'awp', 'deagle', 'glock', 'knife'];

export const MODES = {
  ffa: {
    id: 'ffa', name: 'Chacun pour soi', short: 'FFA',
    desc: 'Tout le monde contre tout le monde. Premier à 30 kills ou meilleur score à la fin du temps.',
    teams: false, killLimit: 30, timeLimit: 600, respawn: 2, protect: 2, choice: true,
    maps: ['oasis', 'docks', 'duel'],
  },
  tdm: {
    id: 'tdm', name: 'Match à mort en équipe', short: 'TDM',
    desc: 'Défense contre Assaut. La première équipe à 75 kills gagne.',
    teams: true, killLimit: 75, timeLimit: 600, respawn: 3, protect: 2, choice: true,
    maps: ['oasis', 'docks'],
  },
  gungame: {
    id: 'gungame', name: 'Course à l\'armement', short: 'GUN GAME',
    desc: 'Chaque série de kills te donne l\'arme suivante. Le premier qui tue au couteau final gagne. Un kill au couteau fait reculer la victime.',
    teams: false, ladder: GUNGAME_LADDER, killsPerLevel: 2, timeLimit: 900, respawn: 1.5, protect: 1.5, choice: false,
    maps: ['docks', 'oasis'],
  },
  awp: {
    id: 'awp', name: 'AWP Only', short: 'AWP',
    desc: 'Uniquement l\'AWP et le couteau. Un tir, un kill.',
    teams: false, killLimit: 25, timeLimit: 600, respawn: 2, protect: 2, choice: false, fixed: ['awp', 'knife'],
    maps: ['duel', 'oasis'],
  },
  hs: {
    id: 'hs', name: 'Headshot Only', short: 'HS ONLY',
    desc: 'Seuls les tirs à la tête infligent des dégâts (le couteau fonctionne toujours).',
    teams: false, killLimit: 30, timeLimit: 600, respawn: 2, protect: 2, choice: true, hsOnly: true,
    maps: ['oasis', 'docks', 'duel'],
  },
};

export const MODE_ORDER = ['ffa', 'tdm', 'gungame', 'awp', 'hs'];

export function ggLevelWeapon(level) {
  return GUNGAME_LADDER[Math.min(level, GUNGAME_LADDER.length - 1)];
}
