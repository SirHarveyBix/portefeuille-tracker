export const calculateInvestCore = (
  currentAmount: number,
  targetPercent: number,
  coreTotal: number,
  monthlyContribution: number,
): number =>
  Math.max(
    0,
    ((coreTotal + monthlyContribution) * targetPercent) / 100 - currentAmount,
  );

export const calculateInvestSatellite = (
  currentAmount: number,
  targetPercent: number,
  coreTotal: number,
  monthlyContribution: number,
): number =>
  ((coreTotal + monthlyContribution) * targetPercent) / 100 - currentAmount;

export const roundToZeroDecimals = (value: number): number => Math.round(value);

export const shortName = (name: string): string =>
  name.replace(/\s*(USD|EUR)?\s*\(Acc\)\s*$/i, "").trim();

export const normalizeKey = (name: string): string =>
  shortName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const euroFormatterZeroDecimals = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});
const euroFormatterTwoDecimals = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatEuro = (
  value: number,
  useTwoDecimals: number | boolean = 0,
): string =>
  (useTwoDecimals
    ? euroFormatterTwoDecimals
    : euroFormatterZeroDecimals
  ).format(value) + " €";

export const formatNumber = (value: number, decimalPlaces = 2): string =>
  value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });

export const formatDate = (dateString: string): string => {
  if (!dateString || !dateString.includes("-")) return dateString;
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year.slice(2)}`;
};
