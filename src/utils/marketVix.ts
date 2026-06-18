export interface VixRegime {
  label: string;
  color: string;
  note: string;
}

export function vixRegime(vixValue: number): VixRegime {
  if (vixValue <= 0)
    return {
      label: "—",
      color: "var(--muted)",
      note: "Aucune valeur disponible pour l'instant.",
    };
  if (vixValue < 15)
    return {
      label: "CALME",
      color: "var(--teal)",
      note: "Volatilité faible — conditions sereines.",
    };
  if (vixValue < 20)
    return {
      label: "NORMAL",
      color: "var(--cobalt)",
      note: "Régime de volatilité habituel.",
    };
  if (vixValue < 28)
    return {
      label: "ÉLEVÉ",
      color: "var(--gold)",
      note: "Volatilité élevée — marché nerveux ; certains lissent leurs achats.",
    };
  return {
    label: "STRESS",
    color: "var(--coral)",
    note: "Forte volatilité — phase de stress, à aborder avec discipline.",
  };
}

const CBOE_VIX_CSV =
  "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";

async function fetchWithTimeout(
  url: string,
  timeoutMilliseconds = 7000,
): Promise<Response> {
  const abortController = new AbortController();
  const timeoutIdentifier = setTimeout(
    () => abortController.abort(),
    timeoutMilliseconds,
  );
  try {
    return await fetch(url, { signal: abortController.signal });
  } finally {
    clearTimeout(timeoutIdentifier);
  }
}

function parseCboeCsv(textResult: string): { vix: number; date: string } {
  const lines = textResult.trim().split("\n");
  const lastLineFields = lines[lines.length - 1].split(",");
  const vix = parseFloat(lastLineFields[lastLineFields.length - 1]);
  const date = (lastLineFields[0] || "").slice(0, 10);
  if (!isFinite(vix) || vix <= 0)
    throw new Error("valeur invalide dans le CSV");
  return { vix: Math.round(vix * 100) / 100, date };
}

async function fetchViaWorker(
  workerUrl: string,
): Promise<{ vix: number; date: string }> {
  const response = await fetchWithTimeout(workerUrl);
  if (!response.ok) throw new Error(`Worker HTTP ${response.status}`);
  const jsonResult = await response.json();
  const vix = parseFloat(jsonResult.vix);
  const date = typeof jsonResult.date === "string" ? jsonResult.date : "";
  if (!isFinite(vix) || vix <= 0)
    throw new Error("valeur invalide depuis le worker");
  return { vix: Math.round(vix * 100) / 100, date };
}

export async function fetchVixFromServer(vixConfiguration: {
  source: string;
  proxyUrl?: string;
  apiKey?: string;
}): Promise<{ vix: number; date: string }> {
  const source = vixConfiguration.source;

  // Source Twelve Data (clé API requise)
  if (source === "twelvedata") {
    const apiKey = vixConfiguration.apiKey || "";
    const response = await fetchWithTimeout(
      `https://api.twelvedata.com/quote?symbol=VIX&apikey=${encodeURIComponent(apiKey)}`,
    );
    if (!response.ok) throw new Error(`Twelve Data HTTP ${response.status}`);
    const jsonResult = await response.json();
    if (jsonResult.status === "error")
      throw new Error(jsonResult.message || "réponse Twelve Data invalide");
    const vix = parseFloat(jsonResult.close);
    const date =
      typeof jsonResult.datetime === "string" ? jsonResult.datetime : "";
    if (!isFinite(vix) || vix <= 0)
      throw new Error("valeur invalide depuis Twelve Data");
    return { vix: Math.round(vix * 100) / 100, date };
  }

  // Source Worker Cloudflare configuré (proxyUrl requis)
  if (source === "proxy") {
    const workerUrl = vixConfiguration.proxyUrl || "";
    if (!workerUrl)
      throw new Error("proxyUrl manquant — configurez-le dans config.js");
    return fetchViaWorker(workerUrl);
  }

  // Source CBOE — essai direct puis repli sur le Worker si configuré
  let directError: unknown;
  try {
    const response = await fetchWithTimeout(CBOE_VIX_CSV);
    if (!response.ok) throw new Error(`CBOE HTTP ${response.status}`);
    const textResult = await response.text();
    return parseCboeCsv(textResult);
  } catch (error) {
    directError = error;
    console.warn("Accès CBOE direct bloqué (CORS probable) :", error);
  }

  // Repli sur le Worker Cloudflare si proxyUrl configuré
  const workerUrl = vixConfiguration.proxyUrl || "";
  if (workerUrl) {
    try {
      return await fetchViaWorker(workerUrl);
    } catch (workerError) {
      console.warn("Worker Cloudflare inaccessible :", workerError);
      const workerErrorMessage =
        workerError instanceof Error ? workerError.message : "erreur inconnue";
      throw new Error(
        `CBOE bloqué (CORS) et worker inaccessible — ${workerErrorMessage}`,
      );
    }
  }

  // Aucun proxy configuré — guider l'utilisateur
  const directErrorMessage =
    directError instanceof Error ? directError.message : "CORS";
  throw new Error(
    `CBOE inaccessible (${directErrorMessage}) — configurez source:"proxy" + proxyUrl dans config.js`,
  );
}
