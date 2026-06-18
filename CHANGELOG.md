# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions suivant [SemVer](https://semver.org/lang/fr/).

> Source de vérité partagée avec le tableau `CHANGELOG` dans `assets/app.js`
> (affiché dans l'app via le bouton de version). Mettre les deux à jour ensemble.

## [Non publié]
### À venir (idées)
- Valeur de marché optionnelle par ligne → P&L latent et rendement.
- Bande de rééquilibrage configurable (5/25).
- Tests automatisés des fonctions pures (parsing, formules).

## [1.2.1] — 2026-06-18
### Modifié
- Le chargeur CSV est masqué dans l'onglet Allocation (il n'y est pas utile).
- Nouvelle icône de chargement, plus propre, à la place du symbole « ↻ ».

## [1.2.0] — 2026-06-18
### Ajouté
- **VIX depuis une source de marché réelle** : fichier officiel CBOE par défaut (sans
  clé), proxy Cloudflare fourni ou Twelve Data en option. Plus aucune valeur saisie à la
  main par défaut ; récupération auto + cache 6 h + repli manuel.
- **PRU (prix de revient unitaire)** et quantité nette affichés par position.
- **Export de la liste d'ordres du mois** (cœur + satellite) en un clic.
- Indicateur du **nombre de lignes hors bande de rééquilibrage** (±5 pts).
- **`spec.md`** : spécification technique complète pour les développements futurs.

### Sécurité / corrections (revue lead tech)
- Règle Firestore renforcée : e-mail **vérifié** exigé (`email_verified`).
- Connexion **par redirection en repli** si la fenêtre popup est bloquée (Safari/PWA).
- Écritures Firestore **espacées** (debounce 1,2 s) pour limiter coût et quota.
- Validation renforcée à l'import JSON ; libellés d'accessibilité sur les champs.

## [1.1.0] — 2026-06-18
### Ajouté
- **Interface mobile entièrement repensée** : KPIs en carrousel à faire défiler,
  lignes d'allocation en **cartes éditables** (fini le tableau réduit), constellation
  en plein écran, **barre de navigation basse**.
- **Stockage en ligne optionnel via Firebase** (Firestore) avec connexion Google.
- **Accès restreint au seul compte propriétaire** : vérification de l'e-mail côté
  interface + règles Firestore verrouillées côté serveur (`firestore.rules`).
- Repli automatique en stockage local si Firebase n'est pas configuré.

### Sécurité
- Le CSV n'est jamais envoyé à Firebase ; seules les valeurs d'allocation y sont
  écrites, dans `portfolios/{uid}`.
- Les clés Web Firebase de `config.js` ne sont pas des secrets ; la protection vient
  des règles Firestore (e-mail + uid).

## [1.0.0] — 2026-06-18
### Ajouté
- Première version publique du suivi de portefeuille.
- Trois vues : **Vue d'ensemble**, **Constellation** animée, **Allocation**.
- Chargement du CSV **100 % local** — aucune donnée envoyée en ligne.
- Sauvegarde locale automatique + **export / import JSON** (compatible iCloud Drive).
- Rééquilibrage par allocation cible (cœur + satellite), formule reprise de la feuille Numbers.
- Moyenne mensuelle **nette** (achats − reventes) et **indicateur de régime VIX**.
- **Interface mobile dédiée** : navigation basse, tableaux transformés en cartes.
- Icône d'écran d'accueil et mode plein écran iOS.

### Notes
- Le « capital net déployé » est un flux (achats − ventes), pas une valorisation de marché.
- La récupération automatique du VIX peut être bloquée par le navigateur (CORS) ;
  la saisie manuelle reste la référence.
