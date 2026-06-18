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

const CONVEX_TRADE_VIX_URL = "https://convextrade.com/api/public/data/VIXCLS";

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

async function fetchFromConvexTrade(): Promise<{ vix: number; date: string }> {
  const response = await fetchWithTimeout(CONVEX_TRADE_VIX_URL);

  if (!response.ok) throw new Error(`ConvexTrade HTTP ${response.status}`);
  const result = await response.json();
  const dataArray = result?.data;

  if (Array.isArray(dataArray) && dataArray.length > 0) {
    const lastItem = dataArray[dataArray.length - 1];
    const vix = parseFloat(lastItem.value);
    const date = typeof lastItem.date === "string" ? lastItem.date : "";

    if (!isFinite(vix) || vix <= 0) {
      throw new Error("valeur VIX invalide de ConvexTrade");
    }
    return { vix: Math.round(vix * 100) / 100, date };
  }
  throw new Error("Format de réponse ConvexTrade invalide");
}

export async function fetchVixFromServer(vixConfiguration: {
  source: string;
}): Promise<{ vix: number; date: string }> {
  if (vixConfiguration.source === "off") {
    throw new Error("Suivi automatique du VIX désactivé");
  }
  return await fetchFromConvexTrade();
}
