// Tests unitaires — fonctions de calcul portefeuille
// Exécuter avec : node tests/core.test.js

let passedTestsCount = 0,
  failedTestsCount = 0;

function test(testName, testFunction) {
  try {
    testFunction();
    console.log("✓", testName);
    passedTestsCount++;
  } catch (error) {
    console.error("✗", testName, "-", error.message);
    failedTestsCount++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function assertEqual(actualValue, expectedValue, message) {
  if (actualValue !== expectedValue)
    throw new Error(
      (message || "") +
        ` expected ${JSON.stringify(expectedValue)} got ${JSON.stringify(actualValue)}`,
    );
}

function assertClose(actualValue, expectedValue, epsilon = 0.01, message) {
  if (Math.abs(actualValue - expectedValue) > epsilon)
    throw new Error(
      (message || "") + ` expected ~${expectedValue} got ${actualValue}`,
    );
}

// --- Fonctions extraites de l'application ---
const num = (value) => {
  const parsedNumber = parseFloat(value);
  return isNaN(parsedNumber) ? 0 : parsedNumber;
};

const calculateInvestCore = (
  currentAmount,
  targetPercent,
  coreTotal,
  monthlyContribution,
) =>
  Math.max(
    0,
    ((coreTotal + monthlyContribution) * targetPercent) / 100 - currentAmount,
  );

const calculateInvestSatellite = (
  currentAmount,
  targetPercent,
  coreTotal,
  monthlyContribution,
) => ((coreTotal + monthlyContribution) * targetPercent) / 100 - currentAmount;

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let currentRow = [],
    field = "",
    insideQuotes = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (insideQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else insideQuotes = false;
      } else field += character;
    } else if (character === '"') insideQuotes = true;
    else if (character === ",") {
      currentRow.push(field);
      field = "";
    } else if (character === "\n") {
      currentRow.push(field);
      rows.push(currentRow);
      currentRow = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field.length || currentRow.length) {
    currentRow.push(field);
    rows.push(currentRow);
  }
  const headers = (rows.shift() || []).map((header) => header.trim());
  return rows
    .filter((row) => row.length > 1)
    .map((row) => {
      const rowObject = {};
      headers.forEach(
        (header, index) => (rowObject[header] = (row[index] ?? "").trim()),
      );
      return rowObject;
    });
}

function vixRegime(vixValue) {
  if (vixValue <= 0) return { label: "—" };
  if (vixValue < 15) return { label: "CALME" };
  if (vixValue < 20) return { label: "NORMAL" };
  if (vixValue < 28) return { label: "ÉLEVÉ" };
  return { label: "STRESS" };
}

function calculateCompoundInterest(
  initialCapital,
  monthlyContribution,
  annualRatePercent,
  years,
  taxRatePercent = 0,
) {
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
}

// --- Tests ---

test("num: string numérique → nombre", () => {
  assertClose(num("12.5"), 12.5);
});
test("num: vide → 0", () => {
  assertEqual(num(""), 0);
});
test("num: NaN → 0", () => {
  assertEqual(num("abc"), 0);
});
test("num: entier string → nombre", () => {
  assertEqual(num("42"), 42);
});

test("calculateInvestCore: cas DCA standard", () => {
  // 800€ investi, cible 50%, total cœur 1600€, apport 100€ → (1700*0.5) - 800 = 50
  assertClose(calculateInvestCore(800, 50, 1600, 100), 50);
});
test("calculateInvestCore: déjà au-dessus cible → 0", () => {
  // 900€, cible 50%, total 1600€, apport 100€ → (1700*0.5) - 900 = -50 → max(0) = 0
  assertEqual(calculateInvestCore(900, 50, 1600, 100), 0);
});
test("calculateInvestCore: cible à 0% → 0", () => {
  assertEqual(calculateInvestCore(200, 0, 1600, 100), 0);
});
test("calculateInvestCore: conservation de l'apport total (3 positions équilibrées)", () => {
  const positions = [
    { amount: 800, target: 50 },
    { amount: 480, target: 30 },
    { amount: 320, target: 20 },
  ];
  const coreTotal = positions.reduce(
    (sum, position) => sum + position.amount,
    0,
  ); // 1600
  const total = positions.reduce(
    (sum, position) =>
      sum +
      calculateInvestCore(position.amount, position.target, coreTotal, 100),
    0,
  );
  assertClose(total, 100, 1); // somme ≈ allocation mensuelle
});

test("calculateInvestSatellite: peut être négatif (surpondéré)", () => {
  // 200€ dans satellite, cible 10% du cœur (1600€), apport 100€ → (1700*0.1) - 200 = -30
  const investment = calculateInvestSatellite(200, 10, 1600, 100);
  assert(investment < 0, `satellite surpondéré: ${investment} doit être < 0`);
});
test("calculateInvestSatellite: sous-pondéré → positif", () => {
  // 50€ dans satellite, cible 10% du cœur (1600€), apport 100€ → 170 - 50 = 120
  assertClose(calculateInvestSatellite(50, 10, 1600, 100), 120);
});

test("parseCSV: enlève BOM UTF-8", () => {
  const csv = "﻿date,name\n2024-01-01,Test";
  const rows = parseCSV(csv);
  assertEqual(rows.length, 1);
  assertEqual(rows[0].date, "2024-01-01");
  assertEqual(rows[0].name, "Test");
});
test("parseCSV: gère les guillemets doubles", () => {
  const csv = 'date,name\n2024-01-01,"iShares Core MSCI World"';
  const rows = parseCSV(csv);
  assertEqual(rows[0].name, "iShares Core MSCI World");
});
test("parseCSV: guillemets avec virgule interne", () => {
  const csv = 'date,name\n2024-01-01,"Smith, John"';
  const rows = parseCSV(csv);
  assertEqual(rows[0].name, "Smith, John");
});
test("parseCSV: guillemets doublés dans la valeur", () => {
  const csv = 'date,name\n2024-01-01,"iShares ""World"""';
  const rows = parseCSV(csv);
  assertEqual(rows[0].name, 'iShares "World"');
});
test("parseCSV: ignore lignes vides (1 seul champ)", () => {
  const csv = "date,name\n\n2024-01-01,Test\n";
  const rows = parseCSV(csv);
  assertEqual(rows.length, 1);
});
test("parseCSV: trim les noms de colonnes", () => {
  const csv = " date , name \n2024-01-01,Test";
  const rows = parseCSV(csv);
  assertEqual(rows[0].date, "2024-01-01");
});

test("vixRegime: 0 → —", () => {
  assertEqual(vixRegime(0).label, "—");
});
test("vixRegime: 12 → CALME", () => {
  assertEqual(vixRegime(12).label, "CALME");
});
test("vixRegime: 14.9 → CALME", () => {
  assertEqual(vixRegime(14.9).label, "CALME");
});
test("vixRegime: 15 → NORMAL", () => {
  assertEqual(vixRegime(15).label, "NORMAL");
});
test("vixRegime: 19.9 → NORMAL", () => {
  assertEqual(vixRegime(19.9).label, "NORMAL");
});
test("vixRegime: 20 → ÉLEVÉ", () => {
  assertEqual(vixRegime(20).label, "ÉLEVÉ");
});
test("vixRegime: 27.9 → ÉLEVÉ", () => {
  assertEqual(vixRegime(27.9).label, "ÉLEVÉ");
});
test("vixRegime: 28 → STRESS", () => {
  assertEqual(vixRegime(28).label, "STRESS");
});
test("vixRegime: 50 → STRESS", () => {
  assertEqual(vixRegime(50).label, "STRESS");
});

test("calculateCompoundInterest: 0% interest rate", () => {
  const result = calculateCompoundInterest(1000, 100, 0, 5);
  assertClose(result.finalValue, 7000);
  assertEqual(result.totalContributions, 7000);
  assertEqual(result.totalInterest, 0);
});

test("calculateCompoundInterest: standard compounding 10% rate", () => {
  const result = calculateCompoundInterest(10000, 500, 10, 10);
  assertClose(result.finalValue, 129492.91, 1);
  assertEqual(result.totalContributions, 70000);
  assertClose(result.totalInterest, 59492.91, 1);
});

test("calculateCompoundInterest: compounding with Flat Tax (30%)", () => {
  const result = calculateCompoundInterest(10000, 500, 10, 10, 30);
  assertClose(result.finalValue, 129492.91, 1);
  assertEqual(result.totalContributions, 70000);
  assertClose(result.totalInterest, 59492.91, 1);
  assertClose(result.estimatedTaxes, 17847.87, 1);
  assertClose(result.netFinalValue, 111645.04, 1);
  assertClose(result.netInterest, 41645.04, 1);
});

test("calculateCompoundInterest: compounding with PEA > 5 years (17.2%)", () => {
  const result = calculateCompoundInterest(10000, 500, 10, 10, 17.2);
  assertClose(result.finalValue, 129492.91, 1);
  assertEqual(result.totalContributions, 70000);
  assertClose(result.totalInterest, 59492.91, 1);
  assertClose(result.estimatedTaxes, 10232.78, 1);
  assertClose(result.netFinalValue, 119260.13, 1);
  assertClose(result.netInterest, 49260.13, 1);
});

function calculateDriftCount(lines, coreTotalAmount) {
  let driftCount = 0;
  lines.forEach((line) => {
    const amount = parseFloat(line.amount) || 0;
    const target = parseFloat(line.target) || 0;
    const percentReal = coreTotalAmount ? (amount / coreTotalAmount) * 100 : 0;
    const band = line.band !== undefined ? line.band : 5;
    if (Math.abs(percentReal - target) > band) {
      driftCount++;
    }
  });
  return driftCount;
}

test("calculateDriftCount: uses custom band and defaults to 5", () => {
  const lines = [
    { amount: 100, target: 10, band: 2 }, // real = 10%, target = 10%, band = 2% -> no drift
    { amount: 130, target: 10, band: 2 }, // real = 13%, target = 10%, band = 2% -> drift (diff 3% > 2%)
    { amount: 140, target: 10 }, // real = 14%, target = 10%, no band (default 5%) -> no drift (diff 4% <= 5%)
    { amount: 160, target: 10 }, // real = 16%, target = 10%, no band (default 5%) -> drift (diff 6% > 5%)
  ];
  assertEqual(calculateDriftCount(lines, 1000), 2);
});

console.log(`\n${passedTestsCount} passed, ${failedTestsCount} failed`);
if (failedTestsCount > 0) process.exit(1);
