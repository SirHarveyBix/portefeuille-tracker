# Spécification — Suivi de portefeuille

> Document de référence pour le développement futur. Version applicative courante : **2.4.0**.
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
- **Mobile en premier & PWA** : l'expérience mobile est prioritaire — navigation basse fixe, carrousel KPIs, cartes d'allocation tactiles, cibles tactiles ≥ 36 px. L'application est une Progressive Web App (PWA) installable sur iOS et Android (manifest.json + Service Worker). En mode standalone, le comportement est natif : pas de sélection accidentelle, overscroll bloqué, safe-area gérée. Toute fonctionnalité desktop doit être pleinement utilisable sur mobile.

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
- Par instrument : montant net, **Prix de Revient Unitaire** et **quantité nette** (positions actives uniquement). Section **Archive repliable** listant les positions entièrement revendues avec montant investi, produit des ventes et P&L réalisé.
- Journal des transactions filtrable et triable.

### 3.2 Constellation

- Visualisation animée (bulles dimensionnées par le montant), dimensions adaptatives, animation suspendue automatiquement via IntersectionObserver lorsque la scène sort de l'écran. Survol d'une bulle → détail (montant, pourcentage, parts, Prix de Revient Unitaire).

**Panel « Positions · efficacité des frais »** (sous la constellation) :

- Tableau trié du moins au plus gourmand (ratio de frais).
- Colonnes : instrument, montant net investi, parts nettes, Prix de Revient Unitaire, cours calculé, Pertes et Profits (Profit and Loss / Plus ou Moins-values en euro et pourcentage), frais absolus (euro), frais en pourcentage du montant acheté, badge d'efficacité.
- Badge d'efficacité : « Efficace » (< 0,3 %), « Modéré » (< 1 %), « Gourmand » (≥ 1 %).
- Liaison optionnelle avec l'allocation (via mapping d'alias persistant dans la Configuration d'Allocation) : si lié, le **Cours \* (calculé)** et les **P&L \* (estimés)** — dérivés du montant de valorisation saisi manuellement dans l'allocation — s'affichent avec un astérisque et un tooltip explicitant leur source ; sinon, un bouton de liaison (⇤) permet de faire le lien. Un bouton de déliaison (⇥) permet de dissocier à tout moment une liaison explicite **ou** une correspondance automatique par nom. La déliaison est stockée comme alias vide (`""`) dans le champ `aliases`.
- **Guard valorisation nulle** : si le montant d'allocation d'une ligne liée est à 0 (non encore renseigné), les colonnes Cours et P&L affichent `—` au lieu de données erronées.
- **[Fait] Filtrage des positions vendues** : Exclut complètement du tableau les instruments dont les parts nettes sont nulles (`shares == 0`) s'ils ne sont pas liés ou présents dans la configuration d'allocation (évite d'afficher des positions passées et soldées chez le courtier CSV).
- **[Fait] Historique d'achat par indice** : Clic sur une ligne du tableau → déplie la liste chronologique des transactions d'achat (date, symbole, parts, prix unitaire, montant, frais). Disponible aussi sur les lignes de l'Archive.
- **[Fait] Section Archive** : Panneau repliable (accordéon) sous le tableau des frais, listant les instruments entièrement revendus avec montant total investi, produit des ventes et P&L réalisé. Chaque ligne est expansible pour accéder à l'historique des achats.

### 3.3 Allocation (rééquilibrage)

- Allocation mensuelle, lignes cœur + satellite (montant, pourcentage réel, pourcentage cible, montant à investir).
- Formules mathématiques :
  - `pourcentage réel = montant / total du cœur`
  - cœur : `à investir = maximum entre 0 et ((total du cœur + apport mensuel) × pourcentage cible − montant actuel)`
  - satellite : `(total du cœur + apport mensuel) × pourcentage cible − montant actuel` (non borné, peut être négatif)
- Indicateurs : total, à investir, somme des cibles, **nombre de lignes hors bande**.
- **[Fait] Bandes de rééquilibrage personnalisables par ligne** :
  - Remplacent la bande fixe de ±5 points.
  - Saisie uniquement disponible en Mode Édition (pour préserver la lisibilité et la clarté en mode lecture).
  - En lecture, affichage simplifié sous forme de badge de dérive (`OK` ou `Dérive`, rendu visuel via CSS `::before`).
- **[Fait] Simulateur d'intérêts composés** :
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
- **Hébergement statique simple** : compiler le projet en exécutant la commande `npm run build` et pousser le contenu du dossier de production `dist/` sur des plateformes d'hébergement statique (telles que GitHub Pages ou Cloudflare Pages). L'application est installable comme PWA depuis le navigateur mobile (icône sur écran d'accueil) — aucune configuration supplémentaire requise.
- **Mise à jour du Service Worker** : le nom du cache (`portefeuille-vX.Y.Z`) doit être incrémenté dans `public/sw.js` à chaque version pour invalider le cache des utilisateurs existants.
- **Hébergement avec base de données (Firebase)** : créer un projet sur la console Google Firebase, activer l'Authentification Google et la base de données Cloud Firestore, copier la configuration web dans `public/assets/config.js`, compiler le projet en exécutant la commande `npm run build` et déployer en lançant la commande `firebase deploy` (firebase-tools installé globalement via `npm install -g firebase-tools` — non inclus dans les devDependencies du projet ; la CI utilise l'action GitHub dédiée).

## 9. Conventions de développement

- Validation automatique par le compilateur TypeScript (`tsc`) lors du processus de construction pour s'assurer de l'absence totale d'erreurs de typage.
- Persistance isolée dans le magasin de données `Store` (méthodes asynchrones load et save) — point d'ancrage unique facilitant le changement de technologie de stockage de données.
- Versionnage sémantique. À chaque évolution applicative : incrémenter le numéro de version dans le fichier de configuration `package.json` et le composant racine `src/App.tsx`.
- Utilisation des rendus réactifs avec le format de syntaxe étendue JavaScript XML (JSX) de React, à l'exception du module de simulation physique (Constellation) qui réalise des manipulations directes du Modèle d'Objet de Document (Document Object Model) au sein d'une boucle d'animation (`requestAnimationFrame`) afin d'assurer une fréquence d'affichage fluide de 60 images par seconde.

## 10. Feuille de route

### Proposé par l'investisseur

- [Fait] **Suivi de la cadence d'investissement** : panneau dans Vue d'ensemble comparant le montant réellement investi à l'objectif cumulé (mensualité × mois actifs), avec barre de progression et delta en avance/retard.
- [Fait] **Historique des rééquilibrages** : chaque copie des ordres du mois sauvegarde automatiquement une entrée dans `rebalanceHistory` (max 24 entrées). Visualisable dans un accordion en bas de l'onglet Allocation.
- [Fait] **Suggestion DCA liée au VIX** : texte contextuel sous la note de régime — suggestion adaptée selon le niveau de volatilité (CALME/NORMAL/ÉLEVÉ/STRESS).
- **Gestion de portefeuilles multiples** (plusieurs fichiers de transactions différents) — complexité architecture, reporté.

> **Supprimé** : « Valeur de marché optionnelle par ligne » — nécessitait un appel à une API externe de prix (service tiers), incompatible avec le principe de confidentialité et de déploiement simple. Le Cours*/P&L* via valorisation manuelle dans l'allocation remplit cet objectif sans dépendance externe.

### Proposé par le lead technique

- [Fait] **API d'Indice de Volatilité par défaut** : intégration de l'API ConvexTrade avec CORS natif résolvant définitivement les blocages de requêtes directes.
- [Fait] **Revue de code complète (v2.2)** : CSS dupliqué supprimé, contraste KPI amélioré, `will-change` sur les transitions animées, cibles tactiles mobiles ≥ 44 px, `useMemo` sur les calculs coûteux de OverviewTab, `O(n)` dans csvParser (Set pour les dates de vente), extraction de `downloadBlob`, `effectiveBand` inline simplifié, attributs ARIA (`aria-controls`, `role="status"`, `role="button"`, `aria-label`) sur les éléments interactifs.
- [Fait] **Revue UI/UX & accessibilité (v2.3)** : boutons lier/délier déplacés dans la colonne nom (cr-name flex), `aria-expanded` sur tous les accordéons, `aria-hidden` sur les icônes décoratives, `aria-label` sur nav, guard montant=0 pour Cours/P&L, variables CSS `--font-sans`/`--font-mono`/`--font-display`/`--panel-gap`, règle CSS dupliquée supprimée, colonne P&L élargie (110px → 150px), touch targets mobiles boutons liaison ≥ 36 px, `data-label` sur les pieds de tableau d'allocation pour mobile, fix `prefers-reduced-motion` transform simulateur, sentinel `""` dans aliases pour déliaison force.
- [Fait] **Corrections CSS mobile & roadmap investisseur (v2.4)** : bug `ah-bought` classe manquante dans archive-head (mobile masquage colonne), bug `bh-parts-h`/`bh-price-h` dans buy-history-head de l'archive Constellation, padding-bottom `.wrap` mobile corrigé (`calc(--nav-h + 20px)`). Filtrage positions vendues (shares=0) marqué [Fait] — déjà implémenté.
- [Fait] **Audit UX mobile complet & PWA (v2.4)** : Anti-zoom iOS (toutes les `font-size` sur inputs ≥ 16px), `-webkit-tap-highlight-color: transparent` global, `touch-action: manipulation` sur 9 sélecteurs, `scroll-snap-stop: always` sur `.kpi`, `overscroll-behavior-x: contain` sur `.kpis`, grille `.atools` 2×2 mobile, cadence 3 colonnes, `sim-input`/`sim-select` 16px, scroll-to-top sur changement d'onglet. PWA : `manifest.json` (installable iOS/Android), Service Worker `sw.js` (network-first, fallback cache), optimisations mode standalone CSS (`overscroll: none`, safe-area-inset-top, user-select bloqué sauf inputs).
- **Tests unitaires** : s'assurer que les fonctions de calcul pures restent découplées et testables via la suite de tests unitaires automatique.
- **Validation du schéma des données d'importation** lors du chargement des fichiers de sauvegarde JavaScript Object Notation.
- **Mode hors-ligne via Service Worker** : déjà implémenté (network-first + fallback cache pour le shell). La persistance hors-ligne Firestore native reste envisageable pour les données cloud.
- **Indicateur visuel de synchronisation** (état connecté, hors ligne, ou synchronisé).
- **Mise en place de Firebase App Check** pour protéger l'accès aux services Firebase et limiter les abus.

## 11. Limites connues

- Indice de Volatilité : valeur de clôture quotidienne uniquement (pas de temps réel au cours de la journée) — suffisant pour de l'investissement programmé mensuel.
- Synchronisation multi-appareils : pas de mécanisme complexe de fusion des modifications (la dernière modification enregistrée remplace la précédente).
- « Capital net déployé » : correspond uniquement aux flux de capitaux cumulés (achats moins ventes), et non à la valorisation actuelle sur le marché financier.
