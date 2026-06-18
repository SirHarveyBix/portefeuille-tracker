/* =============================================================
   Configuration — copier ce fichier en config.js et remplir.

   DÉPLOIEMENT FIREBASE HOSTING
   Si tu déploies sur Firebase Hosting, tu n'as PAS besoin de
   remplir l'objet FIREBASE — la config est injectée automatiquement
   par Firebase à l'URL /__/firebase/init.json.
   Tu dois seulement renseigner VIX si tu veux une source différente.

   MODE LOCAL (open index.html)
   Remplis FIREBASE + OWNER_EMAIL pour activer Firestore.
   Sans config → mode local (localStorage uniquement).
   ============================================================= */
window.APP_CONFIG = {
  // Laisser vide si hébergé sur Firebase Hosting (auto-détecté)
  FIREBASE: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  },

  // E-mail du compte Google autorisé (doit correspondre aux règles Firestore)
  OWNER_EMAIL: "",

  // VIX : "cboe" (défaut, gratuit) | "proxy" | "twelvedata" | "off"
  VIX: {
    source: "cboe",
    proxyUrl: "", // URL du Cloudflare Worker si source "proxy"
    apiKey: "", // Clé API si source "twelvedata"
  },
};
