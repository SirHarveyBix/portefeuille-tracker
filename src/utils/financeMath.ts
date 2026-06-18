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

export interface CompoundInterestResult {
  finalValue: number;
  totalContributions: number;
  totalInterest: number;
  estimatedTaxes: number;
  netFinalValue: number;
  netInterest: number;
}

export const calculateCompoundInterest = (
  initialCapital: number,
  monthlyContribution: number,
  annualRatePercent: number,
  years: number,
  taxRatePercent: number = 0,
): CompoundInterestResult => {
  const months = years * 12;
  const monthlyRate = annualRatePercent / 12 / 100;

  let finalValue = 0;
  const totalContributions = initialCapital + monthlyContribution * months;

  if (monthlyRate === 0) {
    finalValue = totalContributions;
  } else {
    const compoundFactor = Math.pow(1 + monthlyRate, months);
    finalValue =
      initialCapital * compoundFactor +
      monthlyContribution * ((compoundFactor - 1) / monthlyRate);
  }

  const totalInterest = Math.max(0, finalValue - totalContributions);
  const estimatedTaxes = totalInterest * (taxRatePercent / 100);
  const netFinalValue = finalValue - estimatedTaxes;
  const netInterest = Math.max(0, totalInterest - estimatedTaxes);

  return {
    finalValue,
    totalContributions,
    totalInterest,
    estimatedTaxes,
    netFinalValue,
    netInterest,
  };
};
