import { AssetClass } from "../types";

export const CLASS_META: Record<AssetClass, { label: string; hex: string }> = {
  FUND: { label: "Fonds / ETF", hex: "#e8b339" },
  STOCK: { label: "Actions", hex: "#5b8def" },
  CRYPTO: { label: "Crypto", hex: "#a07bf0" },
  OTHER: { label: "Autre", hex: "#8093b3" },
};

export const getAssetMeta = (assetClass: AssetClass) =>
  CLASS_META[assetClass] ?? CLASS_META.OTHER;
