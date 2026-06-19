import {
  Transaction,
  Instrument,
  PortfolioModel,
  AssetClass,
  CurvePoint,
  MonthSummary,
  SerializedPortfolioModel,
} from "../types";

export const num = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const parsedNumber = parseFloat(String(value));
  return isNaN(parsedNumber) ? 0 : parsedNumber;
};

export function parseCSV(text: string): Record<string, string>[] {
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [],
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
      const rowObject: Record<string, string> = {};
      headers.forEach(
        (header, index) => (rowObject[header] = (row[index] ?? "").trim()),
      );
      return rowObject;
    });
}

const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function parseTransactionType(typeStr: string): "BUY" | "SELL" {
  return typeStr.toUpperCase() === "SELL" ? "SELL" : "BUY";
}

function parseAssetClass(classStr: string): AssetClass {
  const rawClass = classStr.toUpperCase();
  if (
    rawClass === "FUND" ||
    rawClass === "STOCK" ||
    rawClass === "CRYPTO" ||
    rawClass === "OTHER"
  ) {
    return rawClass;
  }
  return "OTHER";
}

export function build(rows: Record<string, string>[]): PortfolioModel {
  const transactions: Transaction[] = rows
    .filter((row) => (row.category || "").toUpperCase() === "TRADING")
    .map((row) => ({
      date: row.date || "",
      type: parseTransactionType(row.type || ""),
      assetClass: parseAssetClass(row.asset_class || ""),
      name: row.name || row.symbol || "—",
      symbol: row.symbol || "",
      shares: Math.abs(num(row.shares)),
      price: num(row.price),
      amount: num(row.amount),
      fee: num(row.fee),
    }))
    .sort((transactionA, transactionB) =>
      transactionA.date < transactionB.date
        ? -1
        : transactionA.date > transactionB.date
          ? 1
          : 0,
    );

  if (!transactions.length) {
    return {
      transactions: [],
      buys: [],
      sells: [],
      bought: 0,
      sold: 0,
      fees: 0,
      netDeployed: 0,
      instruments: [],
      totalNet: 0,
      classes: [],
      series: [],
      months: [],
      avgMonth: 0,
    };
  }

  const buys = transactions.filter((transaction) => transaction.type === "BUY");
  const sells = transactions.filter(
    (transaction) => transaction.type === "SELL",
  );
  const bought = buys.reduce((sum, transaction) => sum - transaction.amount, 0);
  const sold = sells.reduce((sum, transaction) => sum + transaction.amount, 0);
  const fees = transactions.reduce(
    (sum, transaction) => sum - transaction.fee,
    0,
  );
  const netDeployed = bought - sold;

  const instrumentsByName: Record<string, Instrument> = {};
  transactions.forEach((transaction) => {
    instrumentsByName[transaction.name] ||= {
      name: transaction.name,
      assetClass: transaction.assetClass,
      net: 0,
      shares: 0,
      buys: 0,
      buyAmount: 0,
      buyShares: 0,
      avgCost: 0,
    };
    const instrument = instrumentsByName[transaction.name];
    instrument.net += -transaction.amount;
    instrument.shares +=
      (transaction.type === "SELL" ? -1 : 1) * transaction.shares;
    if (transaction.type === "BUY") {
      instrument.buys++;
      instrument.buyAmount += -transaction.amount;
      instrument.buyShares += transaction.shares;
    }
  });

  const instruments = Object.values(instrumentsByName)
    .filter((instrument) => instrument.net > 1)
    .map((instrument) => ({
      ...instrument,
      avgCost:
        instrument.buyShares > 0
          ? instrument.buyAmount / instrument.buyShares
          : 0,
    }))
    .sort((instrumentA, instrumentB) => instrumentB.net - instrumentA.net);

  const totalNet = instruments.reduce(
    (sum, instrument) => sum + instrument.net,
    0,
  );

  const netByClass: Partial<Record<AssetClass, number>> = {};
  instruments.forEach(
    (instrument) =>
      (netByClass[instrument.assetClass] =
        (netByClass[instrument.assetClass] || 0) + instrument.net),
  );
  const assetClasses: AssetClass[] = ["FUND", "STOCK", "CRYPTO", "OTHER"];
  const classes = assetClasses
    .map((assetClass) => ({
      assetClass,
      value: netByClass[assetClass] || 0,
    }))
    .filter((classItem) => classItem.value !== 0)
    .sort((classA, classB) => classB.value - classA.value);

  const dailyAmountMap: Record<string, number> = {};
  const sellDates = new Set<string>();
  transactions.forEach((transaction) => {
    dailyAmountMap[transaction.date] =
      (dailyAmountMap[transaction.date] || 0) + -transaction.amount;
    if (transaction.type === "SELL") sellDates.add(transaction.date);
  });
  let cumulativeAmount = 0;
  const series: CurvePoint[] = Object.keys(dailyAmountMap)
    .sort()
    .map((date) => {
      cumulativeAmount += dailyAmountMap[date];
      return { date, net: cumulativeAmount, isSale: sellDates.has(date) };
    });

  const monthlyAmountMap: Record<string, number> = {};
  transactions.forEach((transaction) => {
    const monthKey = transaction.date.slice(0, 7);
    monthlyAmountMap[monthKey] =
      (monthlyAmountMap[monthKey] || 0) + -transaction.amount;
  });

  const months: MonthSummary[] = Object.keys(monthlyAmountMap)
    .sort()
    .map((monthKey) => {
      const year = parseInt(monthKey.slice(0, 4), 10);
      const monthIdx = parseInt(monthKey.slice(5, 7), 10) - 1;
      return {
        month: MONTHS[monthIdx],
        year,
        label: `${MONTHS[monthIdx]} ${year}`,
        net: monthlyAmountMap[monthKey],
      };
    });

  const avgMonth = months.length
    ? months.reduce((sum, month) => sum + month.net, 0) / months.length
    : 0;

  return {
    transactions,
    buys,
    sells,
    bought,
    sold,
    fees,
    netDeployed,
    instruments,
    totalNet,
    classes,
    series,
    months,
    avgMonth,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTransaction(value: unknown): value is Transaction {
  return (
    isRecord(value) &&
    typeof value["date"] === "string" &&
    (value["type"] === "BUY" || value["type"] === "SELL") &&
    typeof value["assetClass"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["symbol"] === "string" &&
    typeof value["shares"] === "number" &&
    typeof value["price"] === "number" &&
    typeof value["amount"] === "number" &&
    typeof value["fee"] === "number"
  );
}

function isInstrument(value: unknown): value is Instrument {
  return (
    isRecord(value) &&
    typeof value["name"] === "string" &&
    typeof value["assetClass"] === "string" &&
    typeof value["net"] === "number" &&
    typeof value["shares"] === "number" &&
    typeof value["buys"] === "number" &&
    typeof value["avgCost"] === "number" &&
    typeof value["buyAmount"] === "number" &&
    typeof value["buyShares"] === "number"
  );
}

function migrateClass(
  raw: unknown,
): { assetClass: AssetClass; value: number } | null {
  if (!isRecord(raw)) return null;
  if (typeof raw["assetClass"] === "string") {
    return {
      assetClass: parseAssetClass(raw["assetClass"]),
      value: typeof raw["value"] === "number" ? raw["value"] : 0,
    };
  }
  // Ancien format vanilla JS stocké sous { ac: string, val: number }
  const codeRaw = typeof raw["ac"] === "string" ? raw["ac"] : "OTHER";
  const netValue = typeof raw["val"] === "number" ? raw["val"] : 0;
  return { assetClass: parseAssetClass(codeRaw), value: netValue };
}

function migrateSeries(raw: unknown): CurvePoint | null {
  if (!isRecord(raw) || typeof raw["date"] !== "string") return null;
  if (typeof raw["net"] === "number") {
    return {
      date: raw["date"],
      net: raw["net"],
      isSale: raw["isSale"] === true,
    };
  }
  // Ancien format vanilla JS stocké sous { date: string, val: number }
  const netValue = typeof raw["val"] === "number" ? raw["val"] : 0;
  return { date: raw["date"], net: netValue, isSale: false };
}

function migrateMonth(raw: unknown): MonthSummary | null {
  if (!isRecord(raw)) return null;
  if (typeof raw["net"] === "number" && typeof raw["month"] === "string") {
    return {
      month: raw["month"],
      year: typeof raw["year"] === "number" ? raw["year"] : 0,
      label: typeof raw["label"] === "string" ? raw["label"] : "",
      net: raw["net"],
    };
  }
  // Ancien format vanilla JS stocké sous { key: "2024-01", val: number, label: string }
  const monthKey = typeof raw["key"] === "string" ? raw["key"] : "";
  const year = parseInt(monthKey.slice(0, 4), 10) || 0;
  const monthIndex = parseInt(monthKey.slice(5, 7), 10) - 1;
  const netValue = typeof raw["val"] === "number" ? raw["val"] : 0;
  return {
    month: MONTHS[monthIndex] ?? "",
    year,
    label: typeof raw["label"] === "string" ? raw["label"] : "",
    net: netValue,
  };
}

export function restoreModel(
  savedModel: Partial<SerializedPortfolioModel> | null | undefined,
): PortfolioModel | null {
  if (!savedModel) return null;
  // Élargissement vers unknown pour validation runtime sans cast
  const raw: unknown = savedModel;
  if (!isRecord(raw)) return null;

  const rawTransactions = Array.isArray(raw["transactions"])
    ? raw["transactions"]
    : Array.isArray(raw["t"])
      ? raw["t"]
      : [];
  const transactions = rawTransactions.filter(isTransaction);

  const rawClasses = Array.isArray(raw["classes"]) ? raw["classes"] : [];
  const classes = rawClasses
    .map(migrateClass)
    .filter(
      (item): item is { assetClass: AssetClass; value: number } =>
        item !== null,
    );

  const rawSeries = Array.isArray(raw["series"]) ? raw["series"] : [];
  const series = rawSeries
    .map(migrateSeries)
    .filter((point): point is CurvePoint => point !== null);

  const rawMonths = Array.isArray(raw["months"]) ? raw["months"] : [];
  const months = rawMonths
    .map(migrateMonth)
    .filter((summary): summary is MonthSummary => summary !== null);

  const rawInstruments = Array.isArray(raw["instruments"])
    ? raw["instruments"]
    : [];
  const instruments = rawInstruments.filter(isInstrument);

  const netDeployed =
    typeof raw["netDeployed"] === "number" ? raw["netDeployed"] : 0;
  const sold = typeof raw["sold"] === "number" ? raw["sold"] : 0;
  const fees = typeof raw["fees"] === "number" ? raw["fees"] : 0;
  const totalNet = typeof raw["totalNet"] === "number" ? raw["totalNet"] : 0;
  const avgMonth = typeof raw["avgMonth"] === "number" ? raw["avgMonth"] : 0;
  const savedAt =
    typeof raw["savedAt"] === "number" ? raw["savedAt"] : undefined;

  return {
    transactions,
    buys: transactions.filter((transaction) => transaction.type === "BUY"),
    sells: transactions.filter((transaction) => transaction.type === "SELL"),
    bought: netDeployed + sold,
    sold,
    fees,
    netDeployed,
    instruments,
    totalNet,
    classes,
    series,
    months,
    avgMonth,
    _fromCache: true,
    _savedAt: savedAt,
  };
}

export function serializeModel(
  model: PortfolioModel,
): SerializedPortfolioModel {
  return {
    netDeployed: model.netDeployed,
    sold: model.sold,
    fees: model.fees,
    totalNet: model.totalNet,
    instruments: model.instruments,
    classes: model.classes,
    series: model.series,
    months: model.months,
    transactions: model.transactions,
    avgMonth: model.avgMonth,
    savedAt: Date.now(),
  };
}
