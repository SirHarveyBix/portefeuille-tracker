# 📈 Suivi de Portefeuille (v2.0.1)

Tableau de bord personnel et privé pour suivre ses transactions et piloter le rééquilibrage de ses investissements.
Hébergement statique simple ou synchronisation sécurisée via **Firebase (Cloud Firestore)**.

---

## 🌟 Fonctionnalités

| Onglet               | Description                                                                                                                                                  |
| :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **▦ Vue d'ensemble** | Indicateurs clés (KPI), courbe de capital, répartition par classe d'actifs (Donut), barres de versement mensuel et journal des transactions.                 |
| **✦ Constellation**  | Visualisation interactive des positions sous forme de bulles animées proportionnelles et analyse détaillée de l'efficacité des frais de transaction.         |
| **◎ Allocation**     | Calculateur de rééquilibrage (DCA cible), génération automatique d'ordres, import/export JSON de la configuration et indicateur du régime de volatilité VIX. |

---

## 🚀 Démarrage Rapide

Cette application est une **Single-Page Application (SPA)** construite avec **React**, **Vite** et **TypeScript**.

### 1. Mode Local (Données stockées uniquement sur le navigateur)

1. **Installer les dépendances** : `npm install`
2. **Lancer le serveur de développement** : `npm run dev` (l'application tourne sur [http://localhost:3000](http://localhost:3000))
3. **Compiler pour la production** : `npm run build`

### 2. Mode Cloud (Synchronisation multi-appareils via Firebase)

1. **Créer un projet Firebase** sur la [Console Firebase](https://console.firebase.google.com/).
   - Activer **Google Authentication** (dans _Authentication_ > _Sign-in method_).
   - Activer **Cloud Firestore** en mode production.
2. **Configurer l'application** :
   - Copier `public/assets/config.example.js` vers `public/assets/config.js`.
   - Remplir les clés `FIREBASE` et renseigner ton e-mail dans `OWNER_EMAIL`.
3. **Déployer sur Firebase Hosting** :
   - Se connecter : `npx firebase login`
   - Associer au projet : `npx firebase use --add`
   - Compiler et déployer : `npm run build && npx firebase deploy`

---

## 🔒 Confidentialité & Sécurité

> [!IMPORTANT]
> **Le fichier de transactions CSV ne quitte jamais ton appareil.** L'analyse est effectuée en mémoire directement par le navigateur.
> Seules les cibles d'allocation et la configuration sont sauvegardées (dans le LocalStorage ou Firestore).

- **Sécurité Firestore** : Accès doublement sécurisé par validation de l'adresse e-mail applicative (`OWNER_EMAIL`) et par des règles Firestore robustes exigeant l'UID et la vérification de l'e-mail au niveau du serveur.

---

## 📂 Format d'Importation CSV

L'application accepte l'export standard de **Trade Republic**.

- **Colonnes requises** : `date`, `category`, `type` (`BUY` ou `SELL`), `asset_class` (`FUND`, `STOCK`, `CRYPTO`, `OTHER`), `name`, `symbol`, `shares`, `price`, `amount` (négatif pour un achat, positif pour une vente), `fee`.
- Seules les transactions de la catégorie `TRADING` sont prises en compte.
- Un fichier de démonstration est disponible dans [sample-data/sample.csv](sample-data/sample.csv).

---

## 📐 Logique de Rééquilibrage

L'algorithme de rééquilibrage DCA calcule l'apport optimal par ligne selon deux règles :

- **Cœur** : `À investir = Max(0, ((Total Cœur + Apport) × % Cible) - Montant Actuel)` (évite les reventes forcées).
- **Satellite** : `À investir = ((Total Cœur + Apport) × % Cible) - Montant Actuel` (non borné, peut être négatif si surpondéré).

---

## 🏛️ Architecture Hexagonale (Ports & Adaptateurs)

L'application découple ses règles métier de l'infrastructure pour faciliter la maintenance et le test :

- **Noyau Métier (Core Domain)** (100% découplé de React/Firebase) :
  - [src/types.ts](src/types.ts) : Modèles et structures de données.
  - [src/utils/financeMath.ts](src/utils/financeMath.ts) : Formules d'allocation et utilitaires de formatage.
  - [src/utils/csvParser.ts](src/utils/csvParser.ts) : Analyseur syntaxique du CSV et désérialisation.
- **Ports (Interfaces)** :
  - Définit les signatures pour la persistance ([src/utils/storage.ts](src/utils/storage.ts)) et la récupération VIX ([src/utils/marketVix.ts](src/utils/marketVix.ts)).
- **Adaptateurs** :
  - **Stockage** : Implémentations interchangeables LocalStorage / Cloud Firestore.
  - **API Marché** : Récupération du VIX en temps réel via l'API de ConvexTrade (CORS natif).
  - **Interface Utilisateur** : Composants React ([src/components/](src/components/)) et orchestrateur principal [src/App.tsx](src/App.tsx).

---

## 🛠️ Commandes utiles

```bash
npm install      # Installe l'environnement de développement
npm run dev      # Lance le serveur local (Vite)
npm run build    # Compile l'application pour la production dans dist/
npm test         # Lance les 25 tests unitaires automatiques
```
