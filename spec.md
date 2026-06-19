# Spécification — Suivi de portefeuille

> Document de référence pour le développement futur. Version applicative courante : **2.1.1**.
> Tenir ce fichier et la version dans le fichier App.tsx et le fichier package.json cohérents.

## 1. Objet & principes

Tableau de bord personnel pour suivre ses transactions (Investissement programmé / Dollar Cost Averaging)
et piloter le rééquilibrage d'un portefeuille. Construit comme une **Application Monopage (Single-Page Application)**
robuste, performante et typée.

Principes directeurs :

- **Simplicité & déploiement** : s'installe via le gestionnaire de paquets Node Package Manager et se déploie via la compilation de production et l'hébergement de fichiers Firebase.
- **Confidentialité** : le fichier de transactions (Valeurs Séparées par des Virgules / Comma-Separated Values) ne quitte jamais l'appareil.
- **Données réelles** : les chiffres de marché de l'Indice de Volatilité (Volatility Index) viennent d'une source réelle,
  jamais d'une valeur inventée ou calculée localement.
- **Type Safety** : base de code typée en langage TypeScript pour éviter toute régression ou erreur silencieuse.

## 2. Personas

- **Investisseur (utilisateur principal)** — investit un montant régulier, suit son
  Prix de Revient Unitaire, rééquilibre vers des cibles d'allocation. Utilisait un tableur ; veut les
  mêmes réflexes (montants, cibles, « combien investir ce mois ») en plus lisible, et
  la liste d'ordres prête à passer chez le courtier.
- **Lead technique** — exige une solution simple, sûre et sans pièges (Partage des ressources entre origines multiples / Cross-Origin Resource Sharing, secrets
  exposés, écritures de données coûteuses, accès non autorisé).

## 3. Périmètre fonctionnel

### 3.1 Vue d'ensemble (dérivée des transactions)

- Indicateurs Clés de Performance (Key Performance Indicators) : capital net déployé, moyenne nette par mois, nombre de positions, produit des ventes, frais.
- Courbe du capital net déployé (cumul des achats moins les ventes), points de vente marqués.
- Répartition par classe d'actif (représentation en anneau).
- Montant investi par mois (histogramme de barres) + ligne de moyenne nette.
- Par instrument : montant net, **Prix de Revient Unitaire** et **quantité nette**.
- Journal des transactions filtrable et triable.

### 3.2 Constellation

- Visualisation animée (bulles dimensionnées par le montant), dimensions adaptatives,
  animation suspendue hors écran. Survol d'une bulle → détail (montant, pourcentage, parts, Prix de Revient Unitaire).

**Panel « Positions · efficacité des frais »** (sous la constellation) :

- Tableau trié du moins au plus gourmand (ratio de frais).
- Colonnes : instrument, montant net investi, parts nettes, Prix de Revient Unitaire, cours calculé, Pertes et Profits (Profit and Loss / Plus ou Moins-values en euro et pourcentage), frais absolus (euro), frais en pourcentage du montant acheté, badge d'efficacité.
- Badge d'efficacité : « Efficace » (< 0,3 %), « Modéré » (< 1 %), « Gourmand » (≥ 1 %).
- Liaison optionnelle avec l'allocation (via mapping d'alias persistant dans la Configuration d'Allocation) : si lié, le cours et les Pertes et Profits (calculés en croisant les transactions issues du fichier de transactions avec les valeurs courantes saisies manuellement dans l'allocation) s'affichent ; sinon, un bouton de liaison permet de faire le lien.
- **Filtrage des positions vendues** : Exclut complètement du tableau les instruments dont les parts nettes sont nulles (`shares == 0`) s'ils ne sont pas liés ou présents dans la configuration d'allocation (évite d'afficher des positions passées et soldées chez le courtier CSV).

### 3.3 Allocation (rééquilibrage)

- Allocation mensuelle, lignes cœur + satellite (montant, pourcentage réel, pourcentage cible, montant à investir).
- Formules mathématiques :
  - `pourcentage réel = montant / total du cœur`
  - cœur : `à investir = maximum entre 0 et ((total du cœur + apport mensuel) × pourcentage cible − montant actuel)`
  - satellite : `(total du cœur + apport mensuel) × pourcentage cible − montant actuel` (non borné, peut être négatif)
- Indicateurs : total, à investir, somme des cibles, **nombre de lignes hors bande**.
- **Bandes de rééquilibrage personnalisables par ligne** :
  - Remplacent la bande fixe de ±5 points.
  - Saisie uniquement disponible en Mode Édition (pour préserver la lisibilité et la clarté en mode lecture).
  - En lecture, affichage simplifié sous forme de badge de dérive (`🟢 OK` ou `🔴 Dérive`).
- **Simulateur d'intérêts composés** :
  - Placé dans une section repliable (accordéon) en bas de l'onglet Allocation.
  - Permet de projeter la croissance future du capital (valeur actuelle et versements mensuels pré-remplis du portefeuille) selon un taux d'intérêt annuel, une durée et un régime fiscal (Flat Tax 30%, PEA 17,2%, aucun, ou taux personnalisé) personnalisables.
- **Export des ordres du mois** (copie dans le presse-papiers).
- Représentation en anneau des cibles + écart réel/cible par ligne.
- Indice de Volatilité (Volatility Index) : régime de marché à partir d'une source réelle (voir §6).
- Sauvegarde automatique (mémoire locale du navigateur ou base de données Cloud Firestore) + export/import au format JavaScript Object Notation.

## 4. Architecture

Application bâtie sur l'architecture hexagonale (Ports et Adaptateurs) pour isoler le domaine métier :

### 4.1 Noyau Métier (Core Domain)

Code pur et sans dépendance externe (sans bibliothèque d'interface utilisateur comme React, ni fournisseur d'infrastructure comme Firebase) :

- [types.ts](src/types.ts) : Déclarations de types pour le modèle de portefeuille, la configuration des allocations, les transactions et la volatilité.
- [financeMath.ts](src/utils/financeMath.ts) : Fonctions de calcul d'allocation de capital et de formatage des nombres.
- [csvParser.ts](src/utils/csvParser.ts) : Logique d'analyse de fichiers de transactions.

### 4.2 Ports

Définitions des comportements requis pour stocker ou extraire des données :

- Port de stockage : Les méthodes `loadAllocation`, `saveAllocation`, `loadModel` et `saveModel` de la classe `PortfolioStore` dans le fichier [storage.ts](src/utils/storage.ts).
- Port de données de marché : Les fonctions de récupération de la volatilité dans le fichier [marketVix.ts](src/utils/marketVix.ts).

### 4.3 Adaptateurs (Adapters)

- **Adaptateur de Présentation (UI Adapter)** : L'application React et ses composants (Charts, AuthHeader, OverviewTab, ConstellationTab, AllocationTab) qui réagissent aux changements de données et affichent les graphiques.
- **Adaptateur de Persistance** : Deux implémentations interchangeables dans le fichier [storage.ts](file:///Users/guillaume/code/portefeuille-tracker/src/utils/storage.ts) : la mémoire locale du navigateur (Local Storage) et le service Cloud Firestore.
- **Adaptateur d'Indice de Marché** : Récupère la valeur de l'Indice de Volatilité (Volatility Index) en temps réel via l'API de ConvexTrade.

Flux de données :

```
[ Fichier de transactions local ] --analyse/construction--> Modèle de Portefeuille (React State) --> Vues (lecture seule)
[ Allocation / Alias d'instruments ] --> Configuration d'Allocation (React State) --> Enregistrement --> Mémoire locale / Firestore
[ Source réelle de l'Indice de Volatilité ] --récupération--> Configuration d'Allocation (Vix)
```

## 5. Modèle de données

Configuration d'Allocation (persistée) :

```json
{
  "monthly": 100,
  "core": [{ "name": "ACWI", "amount": 800, "target": 50 }],
  "sat": [{ "name": "Bitcoin", "amount": 160, "target": 10 }],
  "aliases": { "iShares MSCI ACWI": "ACWI" },
  "vix": 18.2,
  "vixTimestamp": 1750000000000,
  "vixDate": "2026-06-17"
}
```

Modèle de Portefeuille (volatile, dérivé des transactions du fichier importé) : `transactions, instruments[{name, assetClass, net, shares, buys, avgCost, buyAmount, buyShares}], classes, series, months, avgMonth, …`. Jamais persisté directement.

Colonnes du fichier de transactions utilisées (format d'exportation type Trade Republic) : `date, category (=TRADING), type (BUY/SELL), asset_class (FUND/STOCK/CRYPTO), name, symbol, shares, price, amount (valeur négative à l'achat), fee`. **Hypothèse** : séparateur décimal sous forme de point (`.`).

## 6. Sources de l'Indice de Volatilité (Volatility Index / VIX)

Source paramétrable via `config.js → VIX.source` :

| Source          | Clé d'accès requise ? | CORS (Partage de ressources entre origines multiples) | Note                                                  |
| --------------- | --------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `cboe` (défaut) | non                   | OK (natif)                                            | Appelle l'API ConvexTrade (CORS ouvert, retour JSON). |
| `off`           | —                     | —                                                     | Saisie manuelle.                                      |

Repli : en cas d'indisponibilité de la source de données, l'utilisateur est invité à saisir manuellement la valeur. Valeur mise en cache temporaire (`vixTimestamp`) et rafraîchie toutes les 6 heures.

## 7. Sécurité

- **Le fichier de transactions n'est jamais envoyé en ligne** (ni vers la base de données Cloud Firestore, ni vers les serveurs de volatilité). Seule la Configuration d'Allocation est persistée.
- **Mode en ligne (Firebase)** — double sécurité :
  1. Interface utilisateur : seule l'adresse de messagerie électronique configurée dans le paramètre propriétaire (`OWNER_EMAIL`) est acceptée.
  2. Règles Firestore au niveau du serveur : `auth.uid == uid && email_verified == true && email == OWNER`. Tout autre accès est rejeté.
- Connexion Google : utilisation de la méthode popup (signInWithPopup), avec repli vers la redirection (signInWithRedirect) pour les navigateurs mobiles et les applications web progressives.
- Les clés de configuration présentes dans `public/assets/config.js` ne sont pas des secrets de sécurité critiques ; la protection repose sur les règles de sécurité Firestore et sur la restriction des noms de domaine autorisés chez Google Firebase.
- Écritures différées (debounce de 1,2 seconde) pour limiter la consommation des quotas d'écriture de la base de données.

## 8. Installation

- **Développement local** : exécuter la commande `npm run dev` pour démarrer le serveur local rapide (http://localhost:3000).
- **Hébergement statique simple** : compiler le projet en exécutant la commande `npm run build` et pousser le contenu du dossier de production `dist/` sur des plateformes d'hébergement statique (telles que GitHub Pages ou Cloudflare Pages).
- **Hébergement avec base de données (Firebase)** : créer un projet sur la console Google Firebase, activer l'Authentification Google et la base de données Cloud Firestore, copier la configuration web dans `public/assets/config.js`, compiler le projet en exécutant la commande `npm run build` et déployer en lançant la commande `firebase deploy` (firebase-tools installé globalement via `npm install -g firebase-tools` — non inclus dans les devDependencies du projet ; la CI utilise l'action GitHub dédiée).

## 9. Conventions de développement

- Validation automatique par le compilateur TypeScript (`tsc`) lors du processus de construction pour s'assurer de l'absence totale d'erreurs de typage.
- Persistance isolée dans le magasin de données `Store` (méthodes asynchrones load et save) — point d'ancrage unique facilitant le changement de technologie de stockage de données.
- Versionnage sémantique. À chaque évolution applicative : incrémenter le numéro de version dans le fichier de configuration `package.json` et le composant racine `src/App.tsx`.
- Utilisation des rendus réactifs avec le format de syntaxe étendue JavaScript XML (JSX) de React, à l'exception du module de simulation physique (Constellation) qui réalise des manipulations directes du Modèle d'Objet de Document (Document Object Model) au sein d'une boucle d'animation (`requestAnimationFrame`) afin d'assurer une fréquence d'affichage fluide de 60 images par seconde.

## 10. Feuille de route

### Proposé par l'investisseur

- **Valeur de marché optionnelle par ligne** → Rendement et plus-values ou moins-values latentes (Prix de Revient Unitaire vs cours actuel).
- **Suivi de la cadence d'investissement** : comparaison entre le montant total réellement investi et les objectifs cumulés au fil des mois.
- **Historique des rééquilibrages** (journal des ordres passés).
- **Bande de rééquilibrage ajustable** (par exemple de 5 % à 25 %) à la place de la bande fixe de ±5 points.
- **Alerte de niveau d'Indice de Volatilité** (suggestion d'ajustement de l'apport mensuel à titre informatif).
- **Gestion de portefeuilles multiples** (plusieurs fichiers de transactions différents).

### Proposé par le lead technique

- [Fait] **API d'Indice de Volatilité par défaut** : intégration de l'API ConvexTrade avec CORS natif résolvant définitivement les blocages de requêtes directes.
- **Tests unitaires** : s'assurer que les fonctions de calcul pures restent découplées et testables via la suite de tests unitaires automatique.
- **Validation du schéma des données d'importation** lors du chargement des fichiers de sauvegarde JavaScript Object Notation.
- **Mode hors-ligne pour Cloud Firestore** (via l'activation de la persistance hors ligne de Firebase) pour améliorer l'expérience mobile.
- **Indicateur visuel de synchronisation** (état connecté, hors ligne, ou synchronisé).
- **Mise en place de Firebase App Check** pour protéger l'accès aux services Firebase et limiter les abus.

## 11. Limites connues

- Indice de Volatilité : valeur de clôture quotidienne uniquement (pas de temps réel au cours de la journée) — suffisant pour de l'investissement programmé mensuel.
- Synchronisation multi-appareils : pas de mécanisme complexe de fusion des modifications (la dernière modification enregistrée remplace la précédente).
- « Capital net déployé » : correspond uniquement aux flux de capitaux cumulés (achats moins ventes), et non à la valorisation actuelle sur le marché financier.
