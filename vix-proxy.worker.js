/* =============================================================
   Proxy VIX — Cloudflare Worker (optionnel)

   À déployer SEULEMENT si l'appel direct au CSV CBOE est bloqué
   par le navigateur (CORS). Le Worker récupère le fichier officiel
   côté serveur et renvoie un JSON propre, avec en-têtes CORS.

   Déploiement le plus simple (interface web) :
   1. dash.cloudflare.com → Workers & Pages → Create → Worker.
   2. Colle ce fichier, déploie. Tu obtiens une URL
      https://vix-proxy.<compte>.workers.dev
   3. Dans assets/config.js : VIX.proxyUrl = cette URL
      (et VIX.source = "cboe" ou "proxy").

   Réponse : { "vix": 18.42, "date": "2026-06-17", "source": "cboe" }
   ============================================================= */
const CBOE = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";

export default {
  async fetch() {
    try {
      const r = await fetch(CBOE, { cf: { cacheTtl: 1800 } });
      const txt = await r.text();
      const lines = txt.trim().split("\n");
      const last = lines[lines.length - 1].split(",");
      const vix = parseFloat(last[last.length - 1]);
      const date = (last[0] || "").slice(0, 10);
      return json({ vix, date, source: "cboe" });
    } catch (e) {
      return json({ error: String(e) }, 502);
    }
  }
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=1800"
    }
  });
}
