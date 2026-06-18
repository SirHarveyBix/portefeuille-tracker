# Spécification — Suivi de portefeuille

> Document de référence pour le développement futur. Version applicative courante : **1.2.0**.
> Tenir ce fichier, `CHANGELOG.md` et le tableau `CHANGELOG` de `assets/app.js` cohérents.

## 1. Objet & principes

Tableau de bord personnel pour suivre ses transactions (DCA / investissement régulier)
et piloter le rééquilibrage d'un portefeuille. Pensé comme un **site statique**, sans
build, installable en quelques minutes par n'importe qui.

Principes directeurs :
- **Simplicité d'installation** avant tout : un dossier, un double-clic ou un dépôt.
- **Confidentialité** : le CSV de transactions ne quitte jamais l'appareil.
- **Données réelles** : les chiffres de marché (VIX) viennent d'une source réelle,
  jamais d'une valeur inventée ou calculée localement.
- **Pas de dépendance lourde** : aucun framework, aucun bundler.

## 2. Personas

- **Investisseur DCA (utilisateur principal)** — investit un montant régulier, suit son
  prix de revient (PRU), rééquilibre vers des cibles. Utilisait un tableur ; veut les
  mêmes réflexes (montants, cibles, « combien investir ce mois ») en plus lisible, et
  la liste d'ordres prête à passer chez le courtier.
- **Lead technique** — exige une solution simple, sûre et sans pièges (CORS, secrets
  exposés, écritures coûteuses, accès non autorisé).

## 3. Périmètre fonctionnel

### 3.1 Vue d'ensemble (dérivée du CSV)
- KPIs : capital net déployé, moyenne nette / mois, nb positions, produit des ventes, frais.
- Courbe du capital net déployé (cumul achats − ventes), points de vente marqués.
- Répartition par classe d'actif (donut).
- Investi par mois (barres) + ligne de moyenne nette.
- Par instrument : montant net, **PRU** (prix de revient unitaire) et **quantité nette**.
- Journal filtrable / triable.

### 3.2 Constellation
Visualisation animée (bulles dimensionnées par le montant), dimensions adaptatives,
animation suspendue hors écran. Survol → détail (montant, %, parts, PRU).

### 3.3 Allocation (rééquilibrage)
- Allocation mensuelle, lignes cœur + satellite (montant, % réel, % cible, à investir).
- Formules :
  - `% réel = montant / total_cœur`
  - cœur : `à investir = max(0 ; (total_cœur + mensuel) × %cible − montant)`
  - satellite : `(total_cœur + mensuel) × %cible − montant` (non borné, peut être négatif)
- Indicateurs : total, à investir, somme des cibles, **nb de lignes hors bande ±5 pts**.
- **Export des ordres du mois** (presse-papiers).
- Donut des cibles + écart réel/cible par ligne.
- VIX : régime de marché à partir d'une source réelle (voir §6).
- Sauvegarde auto (local ou Firestore) + export/import JSON.

## 4. Architecture

Site statique : `index.html` + `assets/{styles.css, app.js, config.js}`. `app.js` est un
script classique (IIFE, pas de module ES) pour fonctionner aussi en `file://`.

Découpage de `app.js` (sections numérotées) : version, constantes, utilitaires, stockage
+ auth, état, vue d'ensemble, constellation, allocation, VIX, navigation/init.

```
[ CSV local ] --parse--> MODEL (mémoire) --> vues (lecture seule)
[ saisie allocation ] --> ALLOC --> Store.save --> localStorage | Firestore
[ source VIX réelle ] --fetch--> ALLOC.vix
```

## 5. Modèle de données

`ALLOC` (persisté) :
```json
{
  "monthly": 100,
  "core": [ { "name": "ACWI", "amount": 800, "target": 50 } ],
  "sat":  [ { "name": "Bitcoin", "amount": 160, "target": 10 } ],
  "vix": 18.2, "vixTs": 1750000000000, "vixDate": "2026-06-17"
}
```
`MODEL` (volatile, dérivé du CSV) : `t, instruments[{name,ac,net,shares,buys,avgCost}],
classes, series, months, avgMonth, …`. Jamais persisté.

Colonnes CSV utilisées (export type Trade Republic) : `date, category(=TRADING),
type(BUY/SELL), asset_class(FUND/STOCK/CRYPTO), name, symbol, shares, price, amount
(négatif à l'achat), fee`. **Hypothèse** : séparateur décimal `.` (point).

## 6. VIX — sources

`config.js → VIX.source` :
| source | clé ? | CORS | note |
|---|---|---|---|
| `cboe` (défaut) | non | parfois bloqué | CSV officiel `cdn.cboe.com/.../VIX_History.csv`, clôture quotidienne |
| `proxy` | non | OK | Cloudflare Worker fourni (`vix-proxy.worker.js`) qui relaie le CSV CBOE en JSON |
| `twelvedata` | oui (gratuite) | OK | `api.twelvedata.com/quote?symbol=VIX` |
| `off` | — | — | saisie manuelle |

Repli : si la source échoue, message explicite + saisie manuelle possible. Valeur mise
en cache (`vixTs`) ; ré-interrogation auto si > 6 h.

## 7. Sécurité

- **CSV jamais envoyé en ligne** (ni Firestore, ni VIX). Seul `ALLOC` est persisté.
- **Mode en ligne (Firebase)** — deux verrous :
  1. Interface : seul `OWNER_EMAIL` est accepté (sinon déconnexion).
  2. Règles Firestore : `auth.uid == uid && email_verified == true && email == OWNER`.
     Tout le reste : refusé.
- Connexion Google : `signInWithPopup`, repli `signInWithRedirect` (Safari/PWA).
- Les clés Web Firebase / VIX dans `config.js` **ne sont pas des secrets** ; la sécurité
  vient des règles et de la restriction de domaine côté fournisseur. Privilégier les
  sources VIX sans clé (cboe/proxy) pour ne rien exposer.
- Écritures Firestore espacées (debounce 1,2 s) pour limiter coût et quota.

## 8. Installation (résumé ; détails dans README)

- **Local** : double-clic sur `index.html`.
- **En ligne (local storage)** : pousser le dossier sur GitHub Pages / Cloudflare Pages.
- **En ligne (privé)** : projet Firebase (Auth Google + Firestore), remplir `config.js`,
  déployer `firestore.rules`. Proxy VIX en option (`vix-proxy.worker.js`).

## 9. Conventions de développement

- Pas de build. Édition directe des fichiers.
- Persistance isolée dans `Store` (`load`/`save` async) — un seul point à réécrire pour
  changer de backend.
- Versionnage SemVer. À chaque évolution : incrémenter `APP_VERSION`, ajouter une entrée
  au tableau `CHANGELOG` (app.js) **et** à `CHANGELOG.md`.
- Échapper toute valeur issue de données (`esc`) avant injection HTML.

## 10. Feuille de route (issue des deux relectures)

### Proposé par l'investisseur DCA
- **Valeur de marché optionnelle par ligne** → P&L latent (PRU vs cours), rendement.
- **Suivi de cadence** : investi réel vs objectif mensuel cumulé.
- **Historique des rééquilibrages** (journal des ordres passés).
- **Bande de rééquilibrage configurable** (5/25) au lieu du ±5 fixe.
- **Alerte VIX → inclinaison** (suggestion d'ajustement de cadence, informative).
- **Multi-portefeuilles / multi-CSV**.

### Proposé par le lead technique
- **Proxy VIX par défaut** si CORS CBOE s'avère systématiquement bloqué (basculer la
  reco vers `proxy`).
- **Tests** : extraire les fonctions pures (`build`, `parseCSV`, formules d'allocation)
  dans un module testable (Node) + jeu de tests.
- **Validation de schéma** à l'import JSON (au-delà du contrôle actuel core/sat).
- **Mode hors-ligne Firestore** (`enablePersistence`) si usage mobile fréquent.
- **Indicateur de synchro** (icône « enregistré » / « hors ligne »).
- **App Check** (Firebase) si l'app devient publiquement connue, pour limiter l'abus.

## 11. Limites connues
- VIX : clôture quotidienne (pas d'intraday) — suffisant pour du DCA.
- Synchro multi-appareils : dernier écrivain gagne (pas de fusion).
- « Capital net déployé » = flux (achats − ventes), pas une valorisation de marché.
