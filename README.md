# XEB FPS

FPS multijoueur **en ligne**, jouable directement dans le navigateur (aucune installation pour les joueurs).
Style low-poly, gameplay inspiré des FPS tactiques : recul à maîtriser, headshots, **AWP** avec lunette à 2 zooms,
et un système de **skins façon CS2** (caisses, raretés, usure/float, StatKill™, contrat d'échange).

## Modes de jeu

| Mode | Description |
|---|---|
| **FFA — Chacun pour soi** (mode principal) | Tout le monde contre tout le monde, premier à 30 kills. Choix des armes avec **B**. |
| **TDM — Match à mort en équipe** | Défense contre Assaut, première équipe à 75 kills. |
| **Gun Game — Course à l'armement** | 2 kills = arme suivante (MP9 → P90 → Nova → M4A1-S → AK-47 → SSG 08 → AWP → Deagle → Glock → Couteau). Un kill au couteau fait reculer la victime. |
| **AWP Only** | AWP + couteau uniquement (cartes Duel puis Oasis). Un tir, un kill. |
| **Headshot Only** | Seuls les tirs à la tête font des dégâts. |

Des **bots** (3 niveaux de difficulté) complètent automatiquement les parties quand il n'y a pas assez de joueurs,
et laissent leur place dès qu'un humain arrive.

**Cartes :** Oasis (village du désert, longs couloirs pour l'AWP), Docks (conteneurs, combats rapprochés), Duel (carte longue type « awp_ »).

**Armes :** AWP, SSG 08, AK-47, M4A1-S, MP9, P90, Nova, Desert Eagle, USP-S, Glock-18, couteau (Karambit, Baïonnette, Papillon avec un skin ★).

## Skins

- 3 caisses (Prélude, Néon, Prédateur), 45 skins dont **6 skins d'AWP** et 9 couteaux ★.
- Raretés et probabilités : Militaire 79,92 %, Restreint 15,98 %, Classifié 3,2 %, Secret 0,64 %, ★ 0,26 %.
- Usure (float) de *Neuve* à *Marquée par les combats* : les rayures et la perte de peinture se voient sur l'arme.
- 10 % des objets sont **StatKill™** : un compteur de kills s'affiche sur l'arme.
- Tu gagnes des crédits ◈ en jouant (kill +25, headshot +10, couteau +50, no-scope +15, fin de match +50, victoire +200).
- Les autres joueurs voient tes skins. **F** pour inspecter ton arme en jeu.
- Contrat d'échange : 10 objets d'une rareté → 1 objet de la rareté supérieure.

> Les crédits et l'inventaire sont sauvegardés **dans le navigateur** (localStorage). Changer de navigateur ou vider ses données repart de zéro.

## Commandes

| Touche | Action |
|---|---|
| Z Q S D (AZERTY) / W A S D | Se déplacer |
| Espace / Ctrl ou C / Maj | Sauter / s'accroupir / marcher |
| Clic gauche / clic droit | Tirer / lunette (AWP, SSG) ou coup lourd au couteau |
| R / 1 2 3 / molette / A (AZERTY) | Recharger / changer d'arme / dernière arme |
| F / B / Tab / Entrée | Inspecter / choix des armes / scores / chat |

## Lancer en local

Prérequis : [Node.js](https://nodejs.org) 18 ou plus.

```bash
npm install
```

```bash
npm start
```

Puis ouvre http://localhost:3000. Pour jouer à plusieurs sur le même réseau, les autres ouvrent `http://<ton-ip-locale>:3000`.

## Mettre le jeu en ligne (gratuit)

### Render (recommandé)
1. Pousse ce dépôt sur GitHub.
2. Sur [render.com](https://render.com) : **New → Blueprint**, choisis le dépôt (le fichier `render.yaml` configure tout).
3. Une fois déployé, Render te donne une URL du type `https://xebfps.onrender.com` : partage-la avec tes amis.

Sur l'offre gratuite, le serveur s'endort après 15 min sans visite : le premier chargement peut prendre ~1 minute.

### Railway
**New Project → Deploy from GitHub repo** : Railway détecte Node.js et lance `npm start` automatiquement.
Ensuite, dans *Settings → Networking*, clique sur **Generate Domain** pour obtenir l'URL publique.

Le serveur écoute sur le port fourni par la variable `PORT` (sinon 3000).

## Développement

```bash
npm test
```

Lance l'auto-test : validation des cartes (points d'apparition, navigation des bots), statistiques des caisses
et simulation accélérée de matchs entre bots dans chaque mode.

Organisation :
- `shared/` — code commun client/serveur (physique, armes, raycasts, cartes, modes, skins)
- `server/` — serveur HTTP + WebSocket, salles, bots (A* sur grille), validation des tirs avec compensation de latence
- `public/` — client Three.js (rendu, viewmodel, HUD, menus, génération procédurale des skins, sons synthétisés)

L'URL `/?test=1` expose un objet `window.__xeb` utilisé par les tests automatisés.
