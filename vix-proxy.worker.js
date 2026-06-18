/* =============================================================
   Proxy VIX — Cloudflare Worker (optionnel)

   À déployer SEULEMENT si l'appel direct au CSV CBOE est bloqué
   par le navigateur (CORS). Le Worker récupère le fichier officiel
   côté serveur et renvoie un JSON propre, avec en-têtes CORS.

   Déploiement le plus simple (interface web) :
   1. dash.cloudflare.com → Workers & Pages → Create → Worker.
   2. Colle ce fichier, déploie. Tu obtiens une URL
      https://vix-proxy.<compte>.workers.dev
   3. Dans public/assets/config.js : VIX.proxyUrl = cette URL
      (et VIX.source = "cboe" ou "proxy").

   Réponse : { "vix": 18.42, "date": "2026-06-17", "source": "cboe" }
   ============================================================= */
const CBOE =
  "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";

export default {
  async fetch() {
    try {
      const response = await fetch(CBOE, { cf: { cacheTtl: 1800 } });
      const textResult = await response.text();
      const lines = textResult.trim().split("\n");
      const lastLineFields = lines[lines.length - 1].split(",");
      const vix = parseFloat(lastLineFields[lastLineFields.length - 1]);
      const date = (lastLineFields[0] || "").slice(0, 10);
      return json({ vix, date, source: "cboe" });
    } catch (error) {
      return json({ error: String(error) }, 502);
    }
  },
};
function json(responseObject, status = 200) {
  return new Response(JSON.stringify(responseObject), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=1800",
    },
  });
}
