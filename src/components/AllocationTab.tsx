import React, { useState, useRef, useEffect } from "react";
import { AllocationConfig, AllocationLine, RebalanceEntry } from "../types";
import {
  calculateInvestCore,
  calculateInvestSatellite,
  roundToZeroDecimals,
  formatEuro,
  calculateCompoundInterest,
} from "../utils/financeMath";
import { DonutChart, Legend } from "./Charts";
import { vixRegime, fetchVixFromServer } from "../utils/marketVix";

interface AllocationTabProps {
  allocation: AllocationConfig;
  onAllocationChange: (newAllocation: AllocationConfig) => void;
  onReset: () => void;
}

const ALLOCATION_COLORS = [
  "#5b8def",
  "#9aa3b2",
  "#e8b339",
  "#e0705c",
  "#46cca3",
  "#a07bf0",
  "#e879c9",
  "#5fd0e0",
];

const TAX_RATES: Record<string, number> = {
  "flat-tax": 30,
  pea: 17.2,
  none: 0,
};

interface SimulatorResultsProps {
  initialCapital: number;
  monthlyContrib: number;
  annualRate: number;
  years: number;
  taxRegime: string;
  customTaxRate: number;
}

const SimulatorResults: React.FC<SimulatorResultsProps> = ({
  initialCapital,
  monthlyContrib,
  annualRate,
  years,
  taxRegime,
  customTaxRate,
}) => {
  const taxRate = TAX_RATES[taxRegime] ?? customTaxRate;
  const r = calculateCompoundInterest(
    initialCapital,
    monthlyContrib,
    annualRate,
    years,
    taxRate,
  );
  return (
    <div className="sim-results-grid">
      <div className="sim-result-card-primary">
        <div>
          <div className="sim-result-label sim-result-label--lg">
            Capital net final (après impôts)
          </div>
          <div className="sim-result-value sim-result-value--primary">
            {formatEuro(r.netFinalValue)}
          </div>
        </div>
        <div className="sim-result-meta">
          Valeur brute : {formatEuro(r.finalValue)}
        </div>
      </div>
      <div className="sim-result-card">
        <div className="sim-result-label">Total versements</div>
        <div className="sim-result-value">
          {formatEuro(r.totalContributions)}
        </div>
      </div>
      <div className="sim-result-card sim-result-card--interest">
        <div className="sim-result-label">Intérêts bruts</div>
        <div className="sim-result-value sim-result-value--interest">
          {formatEuro(r.totalInterest)}
        </div>
      </div>
      <div className="sim-result-card sim-result-card--tax">
        <div className="sim-result-label">Impôts estimés</div>
        <div className="sim-result-value sim-result-value--tax">
          {formatEuro(r.estimatedTaxes)}
        </div>
      </div>
      <div className="sim-result-card sim-result-card--net">
        <div className="sim-result-label">Intérêts nets</div>
        <div className="sim-result-value sim-result-value--net">
          {formatEuro(r.netInterest)}
        </div>
      </div>
    </div>
  );
};

export const AllocationTab: React.FC<AllocationTabProps> = ({
  allocation,
  onAllocationChange,
  onReset,
}) => {
  const [isCoreEditing, setIsCoreEditing] = useState(false);
  const [isSatelliteEditing, setIsSatelliteEditing] = useState(false);

  const [vixManual, setVixManual] = useState(false);
  const [vixStatus, setVixStatus] = useState<string | null>(null);
  const [ordersButtonText, setOrdersButtonText] = useState("⎘ Ordres du mois");

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [simulatorAnnualRate, setSimulatorAnnualRate] = useState(7);
  const [simulatorYears, setSimulatorYears] = useState(15);
  const [taxationRegime, setTaxationRegime] = useState("flat-tax");
  const [customTaxRate, setCustomTaxRate] = useState(30);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "core" | "sat";
    index: number;
    name: string;
  } | null>(null);

  const dragRef = useRef<{ type: "core" | "sat"; index: number } | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{
    type: "core" | "sat";
    index: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const vixConfiguration = window.APP_CONFIG?.VIX || { source: "convextrade" };

  // Recomputation variables
  const monthlyContribution = allocation.monthly || 0;
  const coreTotalAmount = allocation.core.reduce(
    (sum: number, line: AllocationLine) => sum + (+line.amount || 0),
    0,
  );
  const satelliteTotalAmount = allocation.sat.reduce(
    (sum: number, line: AllocationLine) => sum + (+line.amount || 0),
    0,
  );

  let coreInvestTotalAmount = 0;
  let targetPercentSum = 0;
  let driftCount = 0;

  const recommendedOrders: {
    core: { name: string; inv: number }[];
    satellite: { name: string; inv: number }[];
    total: number;
  } = {
    core: [],
    satellite: [],
    total: 0,
  };

  // 1. Process Core allocation rows
  const processedCoreLines = allocation.core.map((line: AllocationLine) => {
    const amount = +line.amount || 0;
    const target = +line.target || 0;
    const percentReal = coreTotalAmount ? (amount / coreTotalAmount) * 100 : 0;
    const investAmount = calculateInvestCore(
      amount,
      target,
      coreTotalAmount,
      monthlyContribution,
    );
    coreInvestTotalAmount += investAmount;
    targetPercentSum += target;
    const band = line.band !== undefined ? line.band : 5;
    if (Math.abs(percentReal - target) > band) driftCount++;
    if (roundToZeroDecimals(investAmount) >= 1) {
      recommendedOrders.core.push({
        name: line.name || "—",
        inv: roundToZeroDecimals(investAmount),
      });
    }
    return {
      ...line,
      percentReal,
      investAmount,
      under: percentReal < target - band,
      over: percentReal > target + band,
    };
  });

  // 2. Process Satellite allocation rows
  const processedSatelliteLines = allocation.sat.map((line: AllocationLine) => {
    const amount = +line.amount || 0;
    const target = +line.target || 0;
    const percentReal = coreTotalAmount ? (amount / coreTotalAmount) * 100 : 0;
    const investAmount = calculateInvestSatellite(
      amount,
      target,
      coreTotalAmount,
      monthlyContribution,
    );
    const band = line.band !== undefined ? line.band : 5;
    if (roundToZeroDecimals(investAmount) >= 1) {
      recommendedOrders.satellite.push({
        name: line.name || "—",
        inv: roundToZeroDecimals(investAmount),
      });
    }
    return {
      ...line,
      percentReal,
      investAmount,
      under: percentReal < target - band,
      over: percentReal > target + band,
    };
  });

  recommendedOrders.total = [
    ...recommendedOrders.core,
    ...recommendedOrders.satellite,
  ].reduce((sum: number, order: { inv: number }) => sum + order.inv, 0);

  const fetchVix = async () => {
    if (!vixConfiguration.source || vixConfiguration.source === "off") return;
    setVixStatus("récupération…");
    try {
      const vixResult = await fetchVixFromServer(vixConfiguration);
      onAllocationChange({
        ...allocation,
        vix: vixResult.vix,
        vixTimestamp: Date.now(),
        vixDate: vixResult.date,
      });
      setVixManual(false);
      setVixStatus(null);
    } catch {
      setVixManual(true);
      setVixStatus("indisponible — saisir manuellement");
    }
  };

  // Auto-fetch VIX on mount si données absentes ou > 24h
  useEffect(() => {
    const src = window.APP_CONFIG?.VIX?.source;
    if (src === "off") return;
    const isStale =
      !allocation.vixTimestamp ||
      Date.now() - allocation.vixTimestamp > 23 * 3600 * 1000;
    if (isStale) fetchVix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMonthlyChange = (value: number) => {
    onAllocationChange({ ...allocation, monthly: value });
  };

  const handleRowChange = (
    type: "core" | "sat",
    index: number,
    field: keyof AllocationLine,
    value: string | number,
  ) => {
    const list = [...allocation[type]];
    list[index] = {
      ...list[index],
      [field]: field === "name" ? value : +value || 0,
    };
    onAllocationChange({ ...allocation, [type]: list });
  };

  const handleAddRow = (type: "core" | "sat") => {
    const list = [
      ...allocation[type],
      { name: "", amount: 0, target: 0, band: 5 },
    ];
    onAllocationChange({ ...allocation, [type]: list });
  };

  // Opens confirm dialog instead of deleting immediately
  const handleDelRow = (type: "core" | "sat", index: number) => {
    const name = allocation[type][index]?.name || `Ligne ${index + 1}`;
    setDeleteConfirm({ type, index, name });
  };

  const confirmDeleteRow = () => {
    if (!deleteConfirm) return;
    const list = [...allocation[deleteConfirm.type]];
    list.splice(deleteConfirm.index, 1);
    onAllocationChange({ ...allocation, [deleteConfirm.type]: list });
    setDeleteConfirm(null);
  };

  const handleMoveRow = (type: "core" | "sat", index: number, dir: -1 | 1) => {
    const list = [...allocation[type]];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    [list[index], list[swapIdx]] = [list[swapIdx], list[index]];
    onAllocationChange({ ...allocation, [type]: list });
  };

  const handleDragStart = (
    e: React.DragEvent,
    type: "core" | "sat",
    index: number,
  ) => {
    dragRef.current = { type, index };
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (
    e: React.DragEvent,
    type: "core" | "sat",
    index: number,
  ) => {
    e.preventDefault();
    if (dragRef.current?.type === type) {
      setDragOverInfo({ type, index });
    }
  };

  const handleDrop = (
    e: React.DragEvent,
    type: "core" | "sat",
    toIndex: number,
  ) => {
    e.preventDefault();
    if (!dragRef.current || dragRef.current.type !== type) return;
    const fromIndex = dragRef.current.index;
    if (fromIndex !== toIndex) {
      const list = [...allocation[type]];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      onAllocationChange({ ...allocation, [type]: list });
    }
    dragRef.current = null;
    setDragOverInfo(null);
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDragOverInfo(null);
  };

  const handleReset = () => {
    if (
      window.confirm(
        "Réinitialiser avec les valeurs d'exemple ? Tes modifications seront perdues.",
      )
    ) {
      onReset();
    }
  };

  const handleVixInputChange = (value: number) => {
    onAllocationChange({
      ...allocation,
      vix: value,
      vixTimestamp: Date.now(),
      vixDate: "",
    });
    setVixStatus(null);
  };

  const handleCopyOrders = () => {
    const today = new Date().toLocaleDateString("fr-FR");
    const todayISO = new Date().toISOString().slice(0, 10);
    let ordersText = `Ordres du mois — ${today}\n`;
    if (recommendedOrders.core.length) {
      ordersText +=
        `\nCœur :\n` +
        recommendedOrders.core
          .map((order) => `  • ${order.name} : ${order.inv} €`)
          .join("\n");
    }
    if (recommendedOrders.satellite.length) {
      ordersText +=
        `\n\nSatellite :\n` +
        recommendedOrders.satellite
          .map((order) => `  • ${order.name} : ${order.inv} €`)
          .join("\n");
    }
    ordersText += `\n\nTotal à investir : ${recommendedOrders.total} €`;
    if (!recommendedOrders.core.length && !recommendedOrders.satellite.length) {
      ordersText = "Aucun ordre à passer ce mois (tout est à la cible).";
    }

    if (
      recommendedOrders.core.length > 0 ||
      recommendedOrders.satellite.length > 0
    ) {
      const entry: RebalanceEntry = {
        date: todayISO,
        orders: [
          ...recommendedOrders.core.map((order) => ({
            name: order.name,
            inv: order.inv,
            category: "core" as const,
          })),
          ...recommendedOrders.satellite.map((order) => ({
            name: order.name,
            inv: order.inv,
            category: "sat" as const,
          })),
        ],
        total: recommendedOrders.total,
      };
      const history = [...(allocation.rebalanceHistory || [])];
      const existingIdx = history.findIndex((e) => e.date === todayISO);
      if (existingIdx >= 0) history[existingIdx] = entry;
      else history.unshift(entry);
      if (history.length > 24) history.length = 24;
      onAllocationChange({ ...allocation, rebalanceHistory: history });
    }

    const copySuccessCallback = () => {
      setOrdersButtonText("✓ copié");
      setTimeout(() => setOrdersButtonText("⎘ Ordres du mois"), 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(ordersText)
        .then(copySuccessCallback)
        .catch(() => alert(ordersText));
    } else {
      alert(ordersText);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 100);
  };

  const handleExportOrdersCSV = () => {
    if (!recommendedOrders.core.length && !recommendedOrders.satellite.length) {
      alert("Aucun ordre à exporter.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    let csvContent = "Titre,Catégorie,Montant (€)\n";
    recommendedOrders.core.forEach((order) => {
      csvContent += `"${order.name.replace(/"/g, '""')}",Cœur,${order.inv}\n`;
    });
    recommendedOrders.satellite.forEach((order) => {
      csvContent += `"${order.name.replace(/"/g, '""')}",Satellite,${order.inv}\n`;
    });
    downloadBlob(
      new Blob([csvContent], { type: "text/csv;charset=utf-8" }),
      `ordres-${today}.csv`,
    );
  };

  const handleExportConfig = () => {
    downloadBlob(
      new Blob([JSON.stringify(allocation, null, 2)], {
        type: "application/json",
      }),
      "portefeuille-allocation.json",
    );
  };

  const handleImportConfigClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const fileReader = new FileReader();
    fileReader.onload = () => {
      if (typeof fileReader.result !== "string") return;
      try {
        const jsonData = JSON.parse(fileReader.result);
        if (
          jsonData &&
          Array.isArray(jsonData.core) &&
          Array.isArray(jsonData.sat)
        ) {
          jsonData.monthly = +jsonData.monthly || 0;
          onAllocationChange(jsonData);
        } else {
          alert("Format d'allocation invalide.");
        }
      } catch (error) {
        alert("JSON invalide.");
      }
      event.target.value = "";
    };
    fileReader.readAsText(file);
  };

  const alertChips = [
    {
      label: "Ordres recommandés",
      value: `${roundToZeroDecimals(recommendedOrders.total)} €`,
      colorClass: "ok",
    },
    {
      label: "Total portefeuille",
      value: `${roundToZeroDecimals(coreTotalAmount + satelliteTotalAmount)} €`,
      colorClass: "ok",
    },
    {
      label: `Hors bande`,
      value: `${driftCount} ${driftCount > 1 ? "lignes" : "ligne"}`,
      colorClass: driftCount ? "warn" : "ok",
    },
    {
      label: "Total cibles",
      value: `${targetPercentSum.toFixed(0)} %`,
      colorClass: Math.abs(targetPercentSum - 100) < 0.5 ? "ok" : "warn",
    },
  ];

  const donutData = allocation.core.filter(
    (line: AllocationLine) => (+line.target || 0) > 0,
  );
  const donutSegments = donutData.map(
    (line: AllocationLine, index: number) => ({
      value: +line.target || 0,
      color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
    }),
  );

  const legendRows = donutData.map((line: AllocationLine, index: number) => {
    const percentReal = coreTotalAmount
      ? ((+line.amount || 0) / coreTotalAmount) * 100
      : 0;
    const target = +line.target || 0;
    const gap = percentReal - target;
    return {
      color: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
      name: line.name || "—",
      right: (gap >= 0 ? "+" : "−") + Math.abs(gap).toFixed(1),
      rightColor: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
    };
  });

  const vixValue = +allocation.vix || 0;
  const marketRegime = vixRegime(vixValue);
  const vixGaugePos = Math.max(0, Math.min(100, (vixValue / 50) * 100));
  const isVixActive =
    vixConfiguration.source && vixConfiguration.source !== "off";
  const showInput = vixManual || !isVixActive;

  const sourceLabels: Record<string, string> = {
    convextrade: "ConvexTrade",
    cboe: "ConvexTrade",
  };
  const vixStatusLabel = (() => {
    if (vixStatus) return vixStatus;
    if (!allocation.vixTimestamp)
      return isVixActive ? "prêt à récupérer" : "saisie manuelle";
    const source = sourceLabels[vixConfiguration.source] ?? "source";
    let dataLabel = "";
    if (allocation.vixDate) {
      const d = new Date(allocation.vixDate + "T12:00:00Z");
      if (!isNaN(d.getTime()))
        dataLabel = `données ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`;
    }
    const fetchDate = new Date(allocation.vixTimestamp);
    const diffH = (Date.now() - fetchDate.getTime()) / 3600000;
    const fetchLabel =
      diffH < 1
        ? "à l'instant"
        : diffH < 24
          ? `il y a ${Math.round(diffH)}h`
          : fetchDate.toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
            });
    return [source, dataLabel, `vérifié ${fetchLabel}`]
      .filter(Boolean)
      .join(" · ");
  })();

  const renderHoldRow = (
    row: (typeof processedCoreLines)[0] & { investAmount: number },
    index: number,
    type: "core" | "sat",
    isEditing: boolean,
    totalRows: number,
  ) => {
    const isDragOver =
      dragOverInfo?.type === type && dragOverInfo.index === index;
    return (
      <div
        className={`hold ${row.under ? "under" : ""} ${row.over ? "over" : ""} ${isDragOver ? "drag-over" : ""}`}
        key={index}
        draggable={isEditing}
        onDragStart={
          isEditing ? (e) => handleDragStart(e, type, index) : undefined
        }
        onDragOver={
          isEditing ? (e) => handleDragOver(e, type, index) : undefined
        }
        onDrop={isEditing ? (e) => handleDrop(e, type, index) : undefined}
        onDragEnd={isEditing ? handleDragEnd : undefined}
      >
        <div className="hc hc-name">
          <label className="h-lab" htmlFor={`hn-${type}-${index}`}>
            Titre
          </label>
          <input
            className="h-name"
            id={`hn-${type}-${index}`}
            value={row.name}
            onChange={(e) =>
              handleRowChange(type, index, "name", e.target.value)
            }
            placeholder="Titre"
            readOnly={!isEditing}
            tabIndex={isEditing ? 0 : -1}
            aria-label={`Nom — ${row.name || `Ligne ${index + 1}`}`}
          />
        </div>
        <div className="hc hc-num hc-amt">
          <span className="h-lab">Montant €</span>
          <input
            className="h-amount"
            type="number"
            value={row.amount || ""}
            onChange={(e) =>
              handleRowChange(type, index, "amount", e.target.value)
            }
            inputMode="decimal"
            step="1"
            aria-label={`Montant — ${row.name || `Ligne ${index + 1}`}`}
          />
        </div>
        <div className="hc hc-num hc-reel">
          <span className="h-lab">% réel</span>
          <span className="calc pctreel">{row.percentReal.toFixed(2)} %</span>
        </div>
        <div className="hc hc-num hc-cible">
          <label className="h-lab" htmlFor={`hc-${type}-${index}`}>
            % cible
          </label>
          <input
            className="h-target"
            id={`hc-${type}-${index}`}
            type="number"
            value={row.target || ""}
            onChange={(e) =>
              handleRowChange(type, index, "target", e.target.value)
            }
            readOnly={!isEditing}
            tabIndex={isEditing ? 0 : -1}
            inputMode="decimal"
            step="0.5"
            aria-label={`Cible — ${row.name || `Ligne ${index + 1}`}`}
          />
        </div>
        <div className="hc hc-num hc-band">
          <span className="h-lab">Bande %</span>
          {isEditing ? (
            <input
              className="h-band-input"
              id={`hb-${type}-${index}`}
              type="number"
              value={row.band !== undefined ? row.band : 5}
              onChange={(e) =>
                handleRowChange(type, index, "band", +e.target.value || 0)
              }
              inputMode="decimal"
              step="0.5"
              min="0"
              aria-label={`Bande — ${row.name || `Ligne ${index + 1}`}`}
            />
          ) : (
            <span
              className={`badge-drift ${row.under || row.over ? "drift" : "ok"}`}
            >
              {row.under || row.over ? "Dérive" : "OK"}
            </span>
          )}
        </div>
        <div className="hc hc-num hc-ainv">
          <span className="h-lab">À investir</span>
          <span
            className={`ainv ${row.investAmount >= 1 ? "go" : row.investAmount <= -1 ? "neg" : "zero"}`}
          >
            {row.investAmount < 0 ? "−" : ""}
            {Math.abs(roundToZeroDecimals(row.investAmount))} €
          </span>
        </div>
        <div className="hc hc-del">
          {isEditing && (
            <div className="row-actions">
              <button
                className="moverow"
                onClick={() => handleMoveRow(type, index, -1)}
                disabled={index === 0}
                aria-label="Monter"
                title="Monter"
              >
                ↑
              </button>
              <button
                className="moverow"
                onClick={() => handleMoveRow(type, index, 1)}
                disabled={index === totalRows - 1}
                aria-label="Descendre"
                title="Descendre"
              >
                ↓
              </button>
              <button
                className="delrow"
                title="Supprimer"
                onClick={() => handleDelRow(type, index)}
                aria-label={`Supprimer ${row.name || `Ligne ${index + 1}`}`}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Top section: savings & tools */}
      <div className="allocation-top">
        <div className="allocation-budget">
          <label className="alabel" htmlFor="a-monthly">
            Allocation mensuelle
          </label>
          <div className="ainput">
            <input
              type="number"
              id="a-monthly"
              value={allocation.monthly || ""}
              onChange={(e) => handleMonthlyChange(+e.target.value || 0)}
              inputMode="decimal"
              step="10"
              min="0"
            />
            <span>€</span>
          </div>
        </div>

        <div className="achips" id="a-chips">
          {alertChips.map((chip, index) => (
            <div className={`achip ${chip.colorClass}`} key={index}>
              <div className="cl">{chip.label}</div>
              <div className="cv">{chip.value}</div>
            </div>
          ))}
        </div>

        <div className="atools">
          <button id="a-orders" className="atbtn" onClick={handleCopyOrders}>
            {ordersButtonText}
          </button>
          <button
            id="a-orders-csv"
            className="atbtn atbtn-desktop-only"
            onClick={handleExportOrdersCSV}
          >
            ⤓ CSV ordres
          </button>
          <button id="a-export" className="atbtn" onClick={handleExportConfig}>
            ⤓ Exporter
          </button>
          <button
            id="a-import"
            className="atbtn"
            onClick={handleImportConfigClick}
          >
            ⤒ Importer
          </button>
          <button id="a-reset" className="atbtn ghost" onClick={handleReset}>
            ↺ Réinitialiser
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleImportFileChange}
            accept=".json"
          />
        </div>
      </div>

      {/* Allocation grids */}
      <div className="allocation-grid">
        <div className="allocation-left">
          {/* Core panel */}
          <div
            className={`panel allocation-panel ${isCoreEditing ? "editing" : ""}`}
            id="core-panel"
          >
            <div className="phead">
              <span className="ptitle">Portefeuille cœur</span>
              <button
                className="btn-edit"
                onClick={() => setIsCoreEditing(!isCoreEditing)}
                aria-expanded={isCoreEditing}
              >
                {isCoreEditing ? "Fermer" : "Modifier"}
              </button>
            </div>
            <div className="holds">
              <div className="holds-head">
                <span>Titre</span>
                <span className="num">Montant €</span>
                <span className="num">% réel</span>
                <span className="num">% cible</span>
                <span className="center">Bande %</span>
                <span className="num">À investir</span>
                <span className="hd-del" />
              </div>

              <div id="core-list">
                {processedCoreLines.map((row, index) =>
                  renderHoldRow(
                    row,
                    index,
                    "core",
                    isCoreEditing,
                    processedCoreLines.length,
                  ),
                )}
              </div>

              <div id="core-foot">
                <div className="holds-foot">
                  <div className="hc" data-label="Portefeuille">
                    Portefeuille
                  </div>
                  <div className="hc num" data-label="Total €">
                    {roundToZeroDecimals(coreTotalAmount)} €
                  </div>
                  <div className="hc num" data-label="% réel">
                    100 %
                  </div>
                  <div
                    className={`hc num tsum ${Math.abs(targetPercentSum - 100) < 0.5 ? "good" : "bad"}`}
                    data-label="% cibles"
                  >
                    {targetPercentSum.toFixed(0)} %
                  </div>
                  <div className="hc" />
                  <div
                    className="hc num hc-ainv-foot"
                    data-label="À investir"
                    style={{ color: "var(--gold)" }}
                  >
                    {roundToZeroDecimals(coreInvestTotalAmount)} €
                  </div>
                  {isCoreEditing && <div className="hc" />}
                </div>
              </div>
            </div>

            <div className="edit-actions">
              <button className="addrow" onClick={() => handleAddRow("core")}>
                + Ajouter une ligne
              </button>
            </div>
          </div>

          {/* Satellite panel */}
          <div
            className={`panel allocation-panel ${isSatelliteEditing ? "editing" : ""}`}
            id="sat-panel"
          >
            <div className="phead">
              <span className="ptitle">
                Satellite <span className="phint">cibles en % du cœur</span>
              </span>
              <button
                className="btn-edit"
                onClick={() => setIsSatelliteEditing(!isSatelliteEditing)}
                aria-expanded={isSatelliteEditing}
              >
                {isSatelliteEditing ? "Fermer" : "Modifier"}
              </button>
            </div>
            <div className="holds">
              <div className="holds-head">
                <span>Titre</span>
                <span className="num">Montant €</span>
                <span className="num">% réel</span>
                <span className="num">% cible</span>
                <span className="center">Bande %</span>
                <span className="num">À investir</span>
                <span className="hd-del" />
              </div>

              <div id="sat-list">
                {processedSatelliteLines.map((row, index) =>
                  renderHoldRow(
                    row,
                    index,
                    "sat",
                    isSatelliteEditing,
                    processedSatelliteLines.length,
                  ),
                )}
              </div>

              <div id="sat-foot">
                <div className="holds-foot">
                  <div className="hc" data-label="Satellites">
                    Satellites
                  </div>
                  <div className="hc num" data-label="Total €">
                    {roundToZeroDecimals(satelliteTotalAmount)} €
                  </div>
                  <div className="hc num" data-label="% du cœur">
                    {coreTotalAmount
                      ? (
                          (satelliteTotalAmount / coreTotalAmount) *
                          100
                        ).toFixed(1)
                      : 0}{" "}
                    %
                  </div>
                  <div className="hc" />
                  <div className="hc" />
                  <div className="hc" />
                  {isSatelliteEditing && <div className="hc" />}
                </div>
              </div>
            </div>

            <div className="edit-actions">
              <button className="addrow" onClick={() => handleAddRow("sat")}>
                + Ajouter une ligne
              </button>
            </div>
          </div>
        </div>

        {/* Colonne droite : Donut cible + VIX */}
        <div className="allocation-side">
          <div className="panel" id="allocation-donut">
            <div className="phead">
              <span className="ptitle">Répartition cible</span>
              <span className="phint">réel vs cible (en points d'écart)</span>
            </div>
            <div className="donut-wrap" style={{ marginTop: "6px" }}>
              <div
                id="a-donut"
                style={{ display: "flex", justifyContent: "center" }}
              >
                <DonutChart
                  segments={donutSegments}
                  centerTop={`${targetPercentSum.toFixed(0)}%`}
                  centerBottom="cibles"
                />
              </div>
              <div id="a-legend">
                <Legend rows={legendRows} />
              </div>
            </div>
          </div>

          <div className="panel vixcard" id="vixcard">
            <div className="phead">
              <span className="ptitle">VIX · régime de marché</span>
            </div>
            <div className="vtop" style={{ marginTop: "6px" }}>
              <div className="vixval" style={{ color: marketRegime.color }}>
                {showInput ? (
                  <input
                    id="vix-in"
                    type="number"
                    value={allocation.vix || ""}
                    onChange={(e) => handleVixInputChange(+e.target.value || 0)}
                    inputMode="decimal"
                    step="0.1"
                    placeholder="—"
                    aria-label="Valeur du VIX"
                  />
                ) : (
                  <span>{vixValue ? vixValue.toFixed(2) : "—"}</span>
                )}
              </div>
              <span
                className="vregime"
                style={{ "--badge-color": marketRegime.color }}
              >
                {marketRegime.label}
              </span>
            </div>
            <div className="vgauge">
              <div
                className="vmarker"
                style={{ left: `calc(${vixGaugePos}% - 1.5px)` }}
              />
            </div>
            <div className="vscale">
              <span>0</span>
              <span>12</span>
              <span>20</span>
              <span>28</span>
              <span>50</span>
            </div>
            <div className="vnote">{marketRegime.note}</div>
            {vixValue > 0 && (
              <div className="vsug">
                {vixValue < 15 &&
                  "Conditions sereines — DCA habituel recommandé."}
                {vixValue >= 15 &&
                  vixValue < 20 &&
                  "Régime normal — maintenir le plan DCA."}
                {vixValue >= 20 &&
                  vixValue < 28 &&
                  "Volatilité élevée — lisser les achats sur 2 à 3 passages."}
                {vixValue >= 28 &&
                  "Marché sous stress — discipline DCA, éviter de modifier les cibles."}
              </div>
            )}
            <div className="vactions">
              <span className="vts" id="vix-ts">
                {vixStatusLabel}
              </span>
              {isVixActive && !vixManual && (
                <button className="atbtn" id="vix-fetch" onClick={fetchVix}>
                  ↻ actualiser
                </button>
              )}
              <button
                className="atbtn"
                id="vix-edit"
                onClick={() => setVixManual(!vixManual)}
                title={
                  vixManual
                    ? "Revenir à la valeur automatique"
                    : "Saisir manuellement"
                }
              >
                {vixManual ? "⟳ auto" : "✎ saisir"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Compound Interest Simulator Accordion */}
      <div className="panel simulator-card">
        <div
          className="simulator-header"
          role="button"
          tabIndex={0}
          aria-expanded={isSimulatorOpen}
          onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsSimulatorOpen(!isSimulatorOpen);
            }
          }}
        >
          <span className="ptitle">Simulateur d'intérêts composés</span>
          <span className={`simulator-arrow ${isSimulatorOpen ? "open" : ""}`}>
            ▶
          </span>
        </div>
        {isSimulatorOpen && (
          <div className="simulator-content">
            <div className="sim-inputs">
              <div className="sim-input-group">
                <label className="h-lab" htmlFor="sim-initial-capital">
                  Capital initial (pré-rempli)
                </label>
                <input
                  id="sim-initial-capital"
                  className="sim-input sim-input--readonly"
                  type="text"
                  value={formatEuro(coreTotalAmount + satelliteTotalAmount)}
                  readOnly
                />
                <span className="sim-input-hint">
                  Calculé à partir du total actuel (Cœur + Satellite).
                </span>
              </div>

              <div className="sim-input-group">
                <label className="h-lab" htmlFor="sim-monthly-contribution">
                  Versement mensuel (pré-rempli)
                </label>
                <input
                  id="sim-monthly-contribution"
                  className="sim-input sim-input--readonly"
                  type="text"
                  value={formatEuro(allocation.monthly || 0)}
                  readOnly
                />
                <span className="sim-input-hint">
                  Tiré de l'allocation mensuelle configurée ci-dessus.
                </span>
              </div>

              <div className="sim-input-group sim-input-group--narrow">
                <label className="h-lab" htmlFor="sim-rate">
                  Taux annuel estimé (%)
                </label>
                <input
                  id="sim-rate"
                  className="sim-input"
                  type="number"
                  value={simulatorAnnualRate}
                  onChange={(e) => setSimulatorAnnualRate(+e.target.value || 0)}
                  step="0.5"
                  min="0"
                />
                <span className="sim-input-hint">
                  Rendement annuel attendu du portefeuille.
                </span>
              </div>

              <div className="sim-input-group sim-input-group--narrow">
                <label className="h-lab" htmlFor="sim-years">
                  Durée (années)
                </label>
                <input
                  id="sim-years"
                  className="sim-input"
                  type="number"
                  value={simulatorYears}
                  onChange={(e) => setSimulatorYears(+e.target.value || 0)}
                  step="1"
                  min="0"
                />
                <span className="sim-input-hint">
                  Horizon d'investissement pour la projection.
                </span>
              </div>

              <div className="sim-input-group">
                <label className="h-lab" htmlFor="sim-tax-regime">
                  Fiscalité
                </label>
                <select
                  id="sim-tax-regime"
                  className="sim-select"
                  value={taxationRegime}
                  onChange={(e) => setTaxationRegime(e.target.value)}
                >
                  <option value="flat-tax">Flat Tax / PFU (30%)</option>
                  <option value="pea">
                    PEA &gt; 5 ans (17,2% prélèvements sociaux)
                  </option>
                  <option value="none">Sans fiscalité (0%)</option>
                  <option value="custom">Personnalisée</option>
                </select>
                <span className="sim-input-hint">
                  Régime fiscal de retrait ou de capitalisation.
                </span>
              </div>

              {taxationRegime === "custom" && (
                <div className="sim-input-group">
                  <label className="h-lab" htmlFor="sim-custom-tax">
                    Taux d'imposition personnalisé (%)
                  </label>
                  <input
                    id="sim-custom-tax"
                    className="sim-input"
                    type="number"
                    value={customTaxRate}
                    onChange={(e) => setCustomTaxRate(+e.target.value || 0)}
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <span className="sim-input-hint">
                    Taux d'imposition global à appliquer.
                  </span>
                </div>
              )}
            </div>

            <SimulatorResults
              initialCapital={coreTotalAmount + satelliteTotalAmount}
              monthlyContrib={allocation.monthly || 0}
              annualRate={simulatorAnnualRate}
              years={simulatorYears}
              taxRegime={taxationRegime}
              customTaxRate={customTaxRate}
            />
          </div>
        )}
      </div>

      {/* Rebalance History Accordion */}
      {(allocation.rebalanceHistory?.length ?? 0) > 0 && (
        <div className="panel rh-panel">
          <div
            className="rh-header"
            role="button"
            tabIndex={0}
            aria-expanded={isHistoryOpen}
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsHistoryOpen(!isHistoryOpen);
              }
            }}
          >
            <span className="ptitle">Historique des rééquilibrages</span>
            <div className="rh-header-right">
              <span className="phint">
                {allocation.rebalanceHistory?.length} ordre
                {(allocation.rebalanceHistory?.length ?? 0) > 1 ? "s" : ""}
              </span>
              <span className={`archive-arrow ${isHistoryOpen ? "open" : ""}`}>
                ▶
              </span>
            </div>
          </div>
          {isHistoryOpen && (
            <div className="rh-list">
              {allocation.rebalanceHistory?.map((entry, idx) => (
                <div className="rh-entry" key={idx}>
                  <div className="rh-entry-head">
                    <span className="rh-date">{entry.date}</span>
                    <span className="rh-total">{entry.total} €</span>
                  </div>
                  <div className="rh-orders">
                    {entry.orders.map((order, oidx) => (
                      <div className="rh-order" key={oidx}>
                        <span className={`rh-cat rh-cat--${order.category}`}>
                          {order.category === "core" ? "C" : "S"}
                        </span>
                        <span className="rh-name">{order.name}</span>
                        <span className="rh-inv">{order.inv} €</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="anote">
        Sauvegarde automatique (locale, ou en ligne si Firebase est configuré).
        Export/import JSON disponible pour la sauvegarde et le transfert.
      </p>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="overlay open" onClick={() => setDeleteConfirm(null)}>
          <div
            className="modal del-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="del-confirm-icon">⚠</div>
            <h2>Supprimer cette ligne ?</h2>
            <p className="msub">
              « {deleteConfirm.name} » sera définitivement retiré du
              portefeuille.
            </p>
            <div className="del-confirm-actions">
              <button
                className="del-confirm-yes"
                onClick={confirmDeleteRow}
                autoFocus
              >
                Supprimer
              </button>
              <button
                className="del-confirm-no"
                onClick={() => setDeleteConfirm(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
