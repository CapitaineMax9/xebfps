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

**30 armes :**
- Fusils : AK-47, M4A1-S, FAMAS (rafales de 3), Galil AR, AUG (lunette)
- Snipers : AWP, SSG 08, SCAR-20 (semi-automatique)
- Mitraillettes : MP9, MAC-10, MP7, UMP-45, P90
- Lourdes : Nova, XM1014, M249
- Pistolets : USP-S, Glock-18, Desert Eagle, Five-SeveN, Tec-9, R8 Revolver, Dual Berettas
- **Loufoques** : Railgun (traverse les joueurs alignés), Lance-roquettes (explosion, souffle, rocket jump), Arbalète (carreau soumis à la gravité), Lance-confettis, Taser Zeus (une charge, un kill)
- Corps à corps : couteau (Karambit, Baïonnette, Papillon, Couteau pliant avec un skin ★) ou **poêle** (BONK).

Choix de l'arme principale, du pistolet et de l'arme de corps à corps avec **B**.

## Skins

- 8 caisses, **135 skins** dont **21 skins d'AWP**, des couteaux ★ et des **poêles ★** (Or Massif, Doppler, Fondu).
- **Ouverture en masse** : x1 (avec la roulette), x5, x10 ou **x100** d'un coup, avec écran de résultats, meilleur objet et vente groupée des objets courants.
- **Caisse Arsenal** et **Caisse Loufoque** pour les nouvelles armes.
- Inventaire jusqu'à **10 000 objets**, avec pagination et 3 façons de vendre vite : **tout vendre par rareté**
  (les objets équipés, StatKill™ et ★ sont protégés), **mode sélection** (cocher puis vendre) et un bouton
  **« Vendre »** au survol de chaque objet.
- **Caisse Sniper 100 % AWP** : 13 AWP (Wyrm Royal, Feuille d'Or, Kaléidoscope, Toile Pourpre, Aztèque, Koï…) + couteaux.
- Caisses Prélude, Néon, Prédateur, Street et Safari pour toutes les autres armes ; 37 motifs générés procéduralement.
- Raretés et probabilités : Militaire 79,92 %, Restreint 15,98 %, Classifié 3,2 %, Secret 0,64 %, ★ 0,26 %.
- Usure (float) de *Neuve* à *Marquée par les combats* : les rayures et la perte de peinture se voient sur l'arme.
- 10 % des objets sont **StatKill™** : un compteur de kills s'affiche sur l'arme.
- Tu gagnes des crédits ◈ en jouant (kill +25, headshot +10, couteau +50, no-scope +15, fin de match +50, victoire +200).
- Tous les tirages (caisses, objets de fin de match, contrats) sont faits **par le serveur** : impossible de tricher sur ses crédits.
- Les autres joueurs voient tes skins. **F** pour inspecter ton arme en jeu.
- Contrat d'échange : 10 objets d'une rareté → 1 objet de la rareté supérieure.

## Comptes

- En arrivant, tu joues en **invité** : ta progression est déjà sauvegardée sur le serveur, liée à ton navigateur.
- **Créer un compte** (pseudo + mot de passe, onglet JOUER) garde ton inventaire actuel et te permet de te connecter depuis n'importe quel PC.
- Les mots de passe sont chiffrés (scrypt) ; la session reste ouverte sur le navigateur.
- La progression de l'ancienne version (stockée dans le navigateur) est importée automatiquement la première fois.

Stockage : fichier `data/accounts.json` par défaut (parfait en local ou sur un VPS), ou **PostgreSQL** si la variable
`DATABASE_URL` est définie (indispensable sur Render gratuit, dont le disque est effacé à chaque redémarrage).

## Classement

Onglet **CLASSEMENT** : top 50 des comptes enregistrés par **Kills**, **Victoires**, **K/D** et **Headshots %**
(minimum 20 kills pour le K/D et les headshots), avec ta position même hors du top 50.

## Graphismes

Onglet **PARAMÈTRES → Qualité graphique** : Bas, Moyen, Élevé (par défaut) ou Ultra.
Ciel atmosphérique avec soleil et nuages, ombres, occlusion ambiante (GTAO), bloom, étalonnage des couleurs,
poussière dans l'air, textures avec relief, décors (fenêtres, volets, guirlandes, palmiers, grue, navire…),
personnages articulés (course, accroupi, saut, chute) et armes détaillées. Si ton PC rame, passe en *Moyen* ou *Bas*.

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

### 1. Créer la base de données gratuite (pour garder les comptes)
1. Va sur [neon.tech](https://neon.tech), crée un compte gratuit puis un projet (région Europe).
2. Copie la **connection string** (elle ressemble à `postgresql://user:motdepasse@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`).

Les tables sont créées automatiquement au premier démarrage.

### 2. Render (recommandé)
1. Pousse ce dépôt sur GitHub.
2. Sur [render.com](https://render.com) : **New → Blueprint**, choisis le dépôt (le fichier `render.yaml` configure tout).
3. Render te demande la valeur de `DATABASE_URL` : colle la connection string de Neon.
4. Une fois déployé, Render te donne une URL du type `https://xebfps.onrender.com` : partage-la avec tes amis.

Sur l'offre gratuite, le serveur s'endort après 15 min sans visite : le premier chargement peut prendre ~1 minute.

### Railway
**New Project → Deploy from GitHub repo** : Railway détecte Node.js et lance `npm start` automatiquement.
Ensuite, dans *Settings → Networking*, clique sur **Generate Domain** pour obtenir l'URL publique.

Ajoute aussi la variable `DATABASE_URL` dans *Variables* (ou crée une base PostgreSQL directement dans Railway).

Variables d'environnement : `PORT` (sinon 3000), `DATABASE_URL` (PostgreSQL, optionnel), `DATA_FILE` (chemin du fichier de comptes, optionnel).

## Développement

```bash
npm test
```

Lance l'auto-test : validation des cartes (points d'apparition, navigation des bots), statistiques des caisses,
simulation accélérée de matchs entre bots dans chaque mode, et tests des comptes (inscription, connexion, jetons,
caisses, ventes, contrats, StatKill™). Avec `TEST_PG=1 DATABASE_URL=postgres://… npm test`, les comptes sont testés sur PostgreSQL.

Organisation :
- `shared/` — code commun client/serveur (physique, armes, raycasts, cartes, modes, skins)
- `server/` — serveur HTTP + WebSocket, salles, bots (A* sur grille), validation des tirs avec compensation de latence,
  comptes et économie (`accounts.js`), stockage fichier/PostgreSQL (`store.js`)
- `public/` — client Three.js (rendu et post-traitement `gfx.js`, décors `decor.js`, viewmodel, HUD, menus,
  génération procédurale des skins, sons synthétisés)

L'URL `/?test=1` expose un objet `window.__xeb` utilisé par les tests automatisés.
