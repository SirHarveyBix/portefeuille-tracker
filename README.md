# Suivi de portefeuille

Tableau de bord personnel pour suivre ses transactions et piloter le rééquilibrage. Hébergé sur Firebase, données synchronisées entre appareils.

---

## Vues de l'application

| Vue                | Ce qu'elle fait                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Vue d'ensemble** | Indicateurs Clés de Performance (Key Performance Indicators / KPI), courbe de capital, répartition par classe d'actif, barres mensuelles, journal des transactions |
| **Constellation**  | Visualisation animée — chaque position = une bulle proportionnelle au montant                                                                                      |
| **Allocation**     | Rééquilibrage par cible : calcule combien investir par ligne ce mois, exporte les ordres                                                                           |

## Démarrage rapide

L'application est une application monopage (Single-Page Application / SPA) construite avec la bibliothèque React, l'outil de construction Vite et typée en langage TypeScript.

1. **Installer les dépendances** : utiliser le gestionnaire de paquets Node Package Manager en lançant la commande `npm install`
2. **Lancer le serveur de développement** : lancer la commande `npm run dev` (ouvre le navigateur à l'adresse http://localhost:3000)
3. **Compiler pour la production** : lancer la commande `npm run build`

**Avec Firebase (synchronisation multi-appareils)** :

1. **Créer le projet** : Aller sur la [Console Firebase](https://console.firebase.google.com/) et créer un projet.
   - Activer **Authentification Google (Google Auth)** (dans _Authentication_ > _Sign-in method_).
   - Activer **Cloud Firestore** (base de données en mode production, région au choix).
   - Enregistrer une application Web dans le projet pour générer le bloc de clés de configuration.
2. **Configurer l'application** :
   - Copier le fichier `public/assets/config.example.js` vers `public/assets/config.js`.
   - Remplir le bloc `FIREBASE` avec les clés générées par la console, et indiquer votre adresse de messagerie de connexion Google dans `OWNER_EMAIL`.
3. **Déployer sur le Cloud** :
   - Se connecter à la CLI : `npx firebase login`
   - Associer à votre projet : `npx firebase use --add` (choisir le projet créé).
   - Compiler l'application : `npm run build`
   - Déployer (code compilé + règles de sécurité Firestore) : `npx firebase deploy`
4. **Installer l'application** : Ouvrir l'URL d'hébergement générée par Firebase (e.g. `https://<projet>.web.app`) dans Safari sur iPhone → bouton _Partager_ → _Ajouter sur l'écran d'accueil_ (fonctionne en PWA hors-ligne).

## Architecture Hexagonale (Ports et Adaptateurs)

L'application suit les principes de l'architecture hexagonale afin de découpler les règles métier des technologies d'infrastructure et de présentation :

- **Noyau Métier (Core Domain)** : Contient les règles d'allocation, de rééquilibrage et la modélisation financière. Totalement découplé de la bibliothèque React et de la base de données Firebase.
  - [types.ts](src/types.ts) : Définitions et structures de données.
  - [financeMath.ts](src/utils/financeMath.ts) : Formules mathématiques et logiques d'allocation de capital.
  - [csvParser.ts](src/utils/csvParser.ts) : Analyseur syntaxique pour les fichiers de transactions.
- **Ports (Interfaces d'accès)** :
  - Définit les signatures pour le chargement et la persistance des données ([storage.ts](src/utils/storage.ts)) et la récupération des données de marché externe ([marketVix.ts](src/utils/marketVix.ts)).
- **Adaptateurs (Adapters)** :
  - **Adaptateur de stockage** : Implémenté pour la mémoire locale du navigateur (Local Storage) et pour la base de données distante (Cloud Firestore).
  - **Adaptateur d'API de marché** : Récupère l'indice de volatilité (Volatility Index / VIX) depuis le Chicago Board Options Exchange (CBOE) ou Twelve Data.
  - **Adaptateur d'Interface Utilisateur (UI Adapter)** : Les composants React réactifs présents dans le dossier `src/components/` et le composant racine `src/App.tsx`.

## Confidentialité

- **Le fichier de transactions (Comma-Separated Values / CSV) ne quitte jamais l'appareil.** Il est lu uniquement en mémoire par le navigateur, jamais téléversé sur un serveur tiers.
- Seules les **valeurs d'allocation** (montants et cibles) et le **modèle calculé** (positions agrégées) sont sauvegardés — en mémoire locale (Local Storage) ou dans la base de données Cloud Firestore selon votre configuration.
- Accès à la base de données Cloud Firestore doublement verrouillé : validation de l'adresse de messagerie électronique du propriétaire au niveau applicatif et vérification de l'identifiant unique de l'utilisateur (Unique Identifier / UID) au niveau des règles de sécurité du serveur.

## Format d'importation CSV

Export de la plateforme de courtage Trade Republic. Colonnes utilisées : `date`, `category`, `type` (BUY/SELL), `asset_class`, `name`, `symbol`, `shares`, `price`, `amount`, `fee`. Seules les lignes dont la catégorie (`category`) est égale à `TRADING` sont prises en compte par l'application.

Un fichier d'exemple `sample-data/sample.csv` permet de tester l'application sans importer vos propres données réelles.

## Allocation — logique de rééquilibrage

```
Portefeuille Cœur      : À investir = valeur maximale entre 0 et ((Total du cœur + Apport mensuel) × % cible − Montant actuel)
Portefeuille Satellite : À investir = ((Total du cœur + Apport mensuel) × % cible − Montant actuel (cette valeur peut être négative)
```

## Indicateur d'Indice de Volatilité (Volatility Index / VIX)

Valeur récupérée automatiquement depuis le Chicago Board Options Exchange (CBOE) (gratuit, sans clé de sécurité requise), mise en cache pour une durée de 6 heures. Un bouton "↻ actualiser" ou une option de saisie manuelle est disponible si le service est indisponible. La source est paramétrable dans le fichier de configuration `public/assets/config.js`.

## Commandes de Développement

```bash
npm install       # Installe l'environnement de développement React/TypeScript
npm run dev       # Démarre le serveur de développement local rapide (Vite)
npm run build     # Compile et minifie l'application de production dans le dossier dist/
npm test          # Lance les 25 tests unitaires des formules mathématiques
npx firebase deploy # Déploie la configuration et le site compilé sur les serveurs Firebase
```

Structure des fichiers du projet :

```
public/assets/
  config.js        # Fichier de configuration web Firebase & VIX (modifiable directement en production)
  apple-touch-icon.png
src/
  main.tsx         # Point d'entrée principal de l'application React
  App.tsx          # Orchestrateur central de l'interface utilisateur
  types.ts         # Définitions des types TypeScript
  components/      # Composants graphiques de l'interface utilisateur (onglets, graphiques)
  utils/           # Moteurs de calculs, stockage, analyseur CSV, et volatilité
assets/
  styles.css       # Feuilles de style en cascade (Cascading Style Sheets / CSS)
index.html         # Point d'entrée principal de type HyperText Markup Language (HTML)
firestore.rules    # Règles de sécurité de la base de données Firestore
tests/core.test.js # Suite de tests unitaires pour valider les calculs mathématiques
```
