export type AssetClass = "FUND" | "STOCK" | "CRYPTO" | "OTHER";

export interface Transaction {
  date: string; // YYYY-MM-DD
  type: "BUY" | "SELL";
  assetClass: AssetClass;
  name: string;
  symbol: string;
  shares: number;
  price: number;
  amount: number; // Negative for BUY, positive for SELL
  fee: number;
}

export interface Instrument {
  name: string;
  assetClass: AssetClass;
  net: number;
  shares: number;
  buys: number;
  avgCost: number; // PRU
  buyAmount: number; // total buy amount
  buyShares: number; // total buy shares
}

export interface MonthSummary {
  month: string; // e.g. "janv.", "févr."
  year: number; // e.g. 2026
  label: string; // e.g. "janv. 2026"
  net: number;
}

export interface CurvePoint {
  date: string;
  net: number;
  isSale: boolean;
}

export interface PortfolioModel {
  transactions: Transaction[];
  buys: Transaction[];
  sells: Transaction[];
  bought: number;
  sold: number;
  fees: number;
  netDeployed: number;
  instruments: Instrument[];
  totalNet: number;
  classes: { assetClass: AssetClass; value: number }[];
  series: CurvePoint[];
  months: MonthSummary[];
  avgMonth: number;
  _fromCache?: boolean;
  _savedAt?: number;
}

export interface SerializedPortfolioModel {
  netDeployed: number;
  sold: number;
  fees: number;
  totalNet: number;
  instruments: Instrument[];
  classes: { assetClass: AssetClass; value: number }[];
  series: CurvePoint[];
  months: MonthSummary[];
  transactions: Transaction[];
  avgMonth: number;
  savedAt: number;
}

export interface AllocationLine {
  name: string;
  amount: number; // current manual amount
  target: number; // target %
}

export interface AllocationConfig {
  monthly: number;
  core: AllocationLine[];
  sat: AllocationLine[];
  aliases: Record<string, string>; // CSV name -> Alloc name
  vix: number;
  vixTimestamp: number;
  vixDate: string;
}

export interface VixDetails {
  vix: number;
  vixTimestamp: number;
  vixDate: string;
  manual?: boolean;
}

declare module "react" {
  interface CSSProperties {
    "--glow"?: string;
    "--accent"?: string;
  }
}
