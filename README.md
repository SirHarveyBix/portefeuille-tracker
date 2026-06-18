# Suivi de portefeuille

Tableau de bord personnel pour suivre ses transactions et piloter le rééquilibrage
de son portefeuille. **100 % local, sans serveur, sans base de données.** Un fichier
HTML que l'on ouvre dans un navigateur ou que l'on héberge en statique.

---

## Sommaire

- [En bref](#en-bref)
- [Confidentialité](#confidentialité)
- [Les trois vues](#les-trois-vues)
- [Format du CSV attendu](#format-du-csv-attendu)
- [Utilisation locale (Mac)](#utilisation-locale-mac)
- [Hébergement (accès iPhone + Mac)](#hébergement-accès-iphone--mac)
- [Synchroniser ses données entre appareils](#synchroniser-ses-données-entre-appareils)
- [Indicateur VIX](#indicateur-vix)
- [Structure du projet](#structure-du-projet)
- [Développement](#développement)
- [Changelog](#changelog)

---

## En bref

- **Vue d'ensemble** — KPIs, capital déployé dans le temps, répartition par classe
  d'actif, investissement net par mois (reventes déduites), PRU par position, journal filtrable.
- **Constellation** — visualisation animée où chaque position est une bulle
  dimensionnée par le montant investi.
- **Allocation** — outil de rééquilibrage par cible : on saisit ses montants et ses
  cibles, l'app calcule combien investir sur chaque ligne ce mois-ci et exporte la
  liste d'ordres.

### Installation en 30 secondes (le plus simple)
Décompresser le dossier et **double-cliquer sur `index.html`**. C'est tout : ça s'ouvre
dans le navigateur, en local, sans rien installer. Charger son CSV, c'est prêt.
Pour y accéder depuis le téléphone ou synchroniser, voir [Hébergement](#hébergement-accès-iphone--mac).

Aucune dépendance, aucun build.

## Confidentialité

- Le **CSV de transactions n'est jamais téléversé ni stocké en ligne.** Il est lu en
  mémoire dans le navigateur, le temps d'une session. Recharger la page le « oublie ».
- Le dépôt et le site hébergé ne contiennent **aucune** donnée personnelle.
- Seules les **valeurs d'allocation saisies à la main** sont conservées, et uniquement
  dans le stockage local du navigateur de l'appareil (`localStorage`). Elles peuvent
  être exportées/importées en JSON pour la sauvegarde et le transfert entre appareils.

## Les trois vues

### Vue d'ensemble
Calculée à partir du CSV. « Capital net déployé » = somme des achats − somme des ventes
(flux, pas valorisation de marché). La moyenne mensuelle est **nette** : les reventes
d'un mois sont déduites de ses achats.

### Constellation
Rendu d'une simulation physique légère (gravité + collisions) en SVG. La plus grosse
bulle = le plus gros investissement. Survol → détail de la position. L'animation se met
en pause automatiquement hors écran (onglet inactif).

### Allocation (rééquilibrage)
Pour chaque ligne : `% réel = Montant / Total du cœur`. Le montant à investir suit la
logique de rééquilibrage par apport (sans vente) :

```
À investir = max(0 ; (Total_cœur + Allocation_mensuelle) × %cible − Montant)
```

Le bloc **satellite** (crypto, métaux…) exprime ses cibles en % du cœur ; son
« à investir » n'est pas borné et peut être négatif (ligne surpondérée).

## Format du CSV attendu

Export type Trade Republic. Les colonnes utilisées sont :
`date`, `category`, `type` (`BUY`/`SELL`), `asset_class` (`FUND`/`STOCK`/`CRYPTO`),
`name`, `symbol`, `shares`, `price`, `amount` (négatif à l'achat), `fee`.
Seules les lignes `category = TRADING` sont prises en compte.

Un fichier `sample-data/sample.csv` (factice) permet de tester sans données réelles.

## Utilisation locale (Mac)

Double-cliquer sur `index.html` : il s'ouvre dans le navigateur par défaut. Charger son
CSV via la zone « Charger un CSV » (glisser-déposer ou clic). C'est tout.

## Hébergement (accès iPhone + Mac)

Le projet est un site statique : n'importe quel hébergeur statique convient. Deux modes
de stockage sont possibles selon `assets/config.js` :

- **Local** (par défaut) : les valeurs d'allocation restent dans le navigateur de
  l'appareil ; transfert entre appareils via export/import JSON.
- **En ligne sécurisé** (Firebase) : connexion Google, données synchronisées et
  réservées à ton seul compte.

### Option A — GitHub Pages / Cloudflare Pages (mode local)
1. Pousser ce dossier dans un dépôt, ou le glisser dans Cloudflare Pages (*Upload assets*).
2. Pour GitHub Pages : *Settings → Pages → Deploy from a branch → `main` / `/ (root)`*.
3. L'URL obtenue est l'application.

### Option B — Firebase (mode en ligne, accès privé)
1. Créer un projet sur [console.firebase.google.com](https://console.firebase.google.com).
2. *Authentication → Sign-in method →* activer **Google**.
3. *Firestore Database →* créer la base (mode production).
4. *Project settings → Tes applications → Web →* copier la config dans
   `assets/config.js` (objet `FIREBASE`) et renseigner `OWNER_EMAIL`.
5. Déployer les règles de `firestore.rules` (y mettre **le même e-mail**) :
   - soit dans la console (*Firestore → Rules*), soit via la CLI :
     ```
     npm i -g firebase-tools
     firebase login
     firebase init firestore hosting   # pointer "public" sur ce dossier
     firebase deploy
     ```
6. Firebase Hosting sert alors l'app en HTTPS. À la première ouverture, se connecter
   avec le compte propriétaire.

### Installer sur l'iPhone
Ouvrir l'URL dans **Safari → Partager → Ajouter à l'écran d'accueil**. L'app se lance
en plein écran avec son icône.

## Sécurité (mode en ligne)

Le contrôle d'accès repose sur **deux verrous complémentaires** :

1. **Interface** — seule l'adresse `OWNER_EMAIL` est acceptée ; tout autre compte est
   immédiatement déconnecté avec un message « Compte non autorisé ».
2. **Règles Firestore** (`firestore.rules`) — c'est la vraie barrière, côté serveur :
   l'accès n'est accordé que si l'utilisateur est connecté, n'agit que sur son propre
   document, **et** que son e-mail correspond au propriétaire. Même quelqu'un qui
   connaît l'URL et se connecte avec son propre Google ne lit ni n'écrit rien.

Les clés Web Firebase présentes dans `config.js` ne sont **pas** des secrets : elles
identifient le projet, la sécurité venant des règles ci-dessus. Le **CSV de
transactions n'est jamais envoyé à Firebase** : seules les valeurs d'allocation y sont
stockées, dans `portfolios/{uid}`.

## Synchroniser ses données entre appareils

- **Mode Firebase** : automatique. Connecte le même compte sur Mac et iPhone.
- **Mode local** : via export/import du JSON (onglet Allocation → ⤓ / ⤒), par ex. en le
  posant dans iCloud Drive.

## Indicateur VIX

La carte « régime de marché » affiche le **VIX récupéré depuis une source réelle**
(jamais une valeur inventée) et en déduit le régime (calme < 15, normal < 20, élevé < 28,
stress au-delà). La source se choisit dans `assets/config.js` (`VIX.source`) :

- **`cboe`** (défaut) — fichier officiel CBOE, gratuit, sans clé
  (`cdn.cboe.com/.../VIX_History.csv`), clôture quotidienne. Idéal pour du DCA.
- **`proxy`** — si le navigateur bloque l'appel direct au CSV (CORS), déploie le petit
  Cloudflare Worker fourni (`vix-proxy.worker.js`, ~10 lignes, gratuit) et mets son URL
  dans `VIX.proxyUrl`. Il relaie le CSV CBOE en JSON propre, sans souci de CORS.
- **`twelvedata`** — alternative avec clé gratuite (`VIX.apiKey`).
- **`off`** — saisie manuelle.

La valeur est récupérée automatiquement à l'ouverture de l'onglet Allocation (puis mise
en cache 6 h), avec un bouton « actualiser » et une saisie manuelle de secours.

## Structure du projet

```
.
├── index.html                 coquille (aucune donnée)
├── assets/
│   ├── styles.css             styles (desktop + mobile repensé)
│   ├── app.js                 logique (script classique, sans build)
│   ├── config.js              configuration (stockage + source VIX)
│   └── apple-touch-icon.png   icône écran d'accueil
├── sample-data/
│   └── sample.csv             jeu de test factice
├── firestore.rules            règles de sécurité (mode en ligne)
├── vix-proxy.worker.js        proxy VIX optionnel (Cloudflare Worker)
├── spec.md                    spécification technique complète
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## Développement

- Pas de build, pas de bundler. `app.js` est un script classique encapsulé dans une IIFE,
  organisé en sections numérotées (constantes, utilitaires, stockage, vues…).
- La couche de persistance est isolée dans l'objet `Store` (méthodes `load`/`save`
  asynchrones). Mode `local` (localStorage) par défaut, ou `firebase` (Firestore) si
  `config.js` fournit une config et que l'utilisateur propriétaire est connecté.
  Pour brancher un autre backend (par ex. Node + SQLite sur le Mac Mini, exposé via
  Tailscale), il suffit de réécrire `Store` sans toucher au reste de l'interface.
- Le système de version : constante `APP_VERSION` + tableau `CHANGELOG` dans `app.js`
  (affichés via le bouton de version en pied de page). Garder `CHANGELOG.md` aligné.

## Changelog

Voir [CHANGELOG.md](CHANGELOG.md).
