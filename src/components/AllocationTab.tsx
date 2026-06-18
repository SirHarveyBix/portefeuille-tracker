import React, { useState, useRef } from "react";
import { AllocationConfig, AllocationLine } from "../types";
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

export const AllocationTab: React.FC<AllocationTabProps> = ({
  allocation: allocation,
  onAllocationChange,
  onReset,
}) => {
  const [isCoreEditing, setIsCoreEditing] = useState(false);
  const [isSatelliteEditing, setIsSatelliteEditing] = useState(false);

  const [vixManual, setVixManual] = useState(false);
  const [vixStatus, setVixStatus] = useState<string | null>(null);
  const [ordersButtonText, setOrdersButtonText] = useState("⎘ Ordres du mois");

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simulatorAnnualRate, setSimulatorAnnualRate] = useState(7);
  const [simulatorYears, setSimulatorYears] = useState(15);
  const [taxationRegime, setTaxationRegime] = useState("flat-tax");
  const [customTaxRate, setCustomTaxRate] = useState(30);

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
    // In original code, Satellites are computed with coreTotalAmount as denominator for percentReal
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

  // Handlers for inputs
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

  const handleDelRow = (type: "core" | "sat", index: number) => {
    const list = [...allocation[type]];
    list.splice(index, 1);
    onAllocationChange({ ...allocation, [type]: list });
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

  // VIX manual entry change
  const handleVixInputChange = (value: number) => {
    onAllocationChange({
      ...allocation,
      vix: value,
      vixTimestamp: Date.now(),
      vixDate: "",
    });
    setVixStatus(null);
  };

  // Export orders to clipboard
  const handleCopyOrders = () => {
    const today = new Date().toLocaleDateString("fr-FR");
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

  // Export orders as CSV
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
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = URL.createObjectURL(blob);
    downloadAnchor.download = `ordres-${today}.csv`;
    downloadAnchor.click();
    setTimeout(() => URL.revokeObjectURL(downloadAnchor.href), 100);
  };

  // Export allocation config
  const handleExportConfig = () => {
    const blob = new Blob([JSON.stringify(allocation, null, 2)], {
      type: "application/json",
    });
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = URL.createObjectURL(blob);
    downloadAnchor.download = "portefeuille-allocation.json";
    downloadAnchor.click();
    setTimeout(() => URL.revokeObjectURL(downloadAnchor.href), 100);
  };

  // Import allocation config
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

  // Alert chips
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

  // Donut values
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

  // VIX card rendering variables
  const vixValue = +allocation.vix || 0;
  const marketRegime = vixRegime(vixValue);
  const vixGaugePos = Math.max(0, Math.min(100, (vixValue / 50) * 100));
  const isVixActive =
    vixConfiguration.source && vixConfiguration.source !== "off";
  const showInput = vixManual || !isVixActive;

  const sourceLabels: Record<string, string> = {
    convextrade: "ConvexTrade",
    cboe: "ConvexTrade", // Compatibilité ascendante
  };
  const vixStatusLabel = vixStatus
    ? vixStatus
    : allocation.vixTimestamp
      ? `${sourceLabels[vixConfiguration.source] ?? "source"} · ${allocation.vixDate || new Date(allocation.vixTimestamp).toLocaleDateString("fr-FR")}`
      : isVixActive
        ? "prêt à récupérer"
        : "saisie manuelle";

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

        {/* Chips */}
        <div className="achips" id="a-chips">
          {alertChips.map((chip, index) => (
            <div className={`achip ${chip.colorClass}`} key={index}>
              <div className="cl">{chip.label}</div>
              <div className="cv">{chip.value}</div>
            </div>
          ))}
        </div>

        {/* Tools */}
        <div className="atools">
          <button id="a-orders" className="atbtn" onClick={handleCopyOrders}>
            {ordersButtonText}
          </button>
          <button
            id="a-orders-csv"
            className="atbtn"
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
        {/* Colonne gauche : Cœur + Satellite */}
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
                {processedCoreLines.map((row, index) => (
                  <div
                    className={`hold ${row.under ? "under" : ""} ${row.over ? "over" : ""}`}
                    key={index}
                  >
                    <div className="hc hc-name">
                      <label className="h-lab" htmlFor={`hn-core-${index}`}>
                        Titre
                      </label>
                      <input
                        className="h-name"
                        id={`hn-core-${index}`}
                        value={row.name}
                        onChange={(e) =>
                          handleRowChange("core", index, "name", e.target.value)
                        }
                        placeholder="Titre"
                        readOnly={!isCoreEditing}
                        tabIndex={isCoreEditing ? 0 : -1}
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
                          handleRowChange(
                            "core",
                            index,
                            "amount",
                            e.target.value,
                          )
                        }
                        readOnly={!isCoreEditing}
                        tabIndex={isCoreEditing ? 0 : -1}
                        inputMode="decimal"
                        step="1"
                        aria-label={`Montant — ${row.name || `Ligne ${index + 1}`}`}
                      />
                    </div>
                    <div className="hc hc-num hc-reel">
                      <span className="h-lab">% réel</span>
                      <span className="calc pctreel">
                        {row.percentReal.toFixed(2)} %
                      </span>
                    </div>
                    <div className="hc hc-num hc-cible">
                      <label className="h-lab" htmlFor={`hc-core-${index}`}>
                        % cible
                      </label>
                      <input
                        className="h-target"
                        id={`hc-core-${index}`}
                        type="number"
                        value={row.target || ""}
                        onChange={(e) =>
                          handleRowChange(
                            "core",
                            index,
                            "target",
                            e.target.value,
                          )
                        }
                        readOnly={!isCoreEditing}
                        tabIndex={isCoreEditing ? 0 : -1}
                        inputMode="decimal"
                        step="0.5"
                        aria-label={`Cible — ${row.name || `Ligne ${index + 1}`}`}
                      />
                    </div>
                    <div className="hc hc-num hc-band">
                      <span className="h-lab">Bande %</span>
                      {isCoreEditing ? (
                        <input
                          className="h-band-input"
                          id={`hb-core-${index}`}
                          type="number"
                          value={row.band !== undefined ? row.band : 5}
                          onChange={(e) =>
                            handleRowChange(
                              "core",
                              index,
                              "band",
                              +e.target.value || 0,
                            )
                          }
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          aria-label={`Bande — ${row.name || `Ligne ${index + 1}`}`}
                        />
                      ) : (
                        <span className={`badge-drift ${Math.abs(row.percentReal - row.target) > (row.band !== undefined ? row.band : 5) ? "drift" : "ok"}`}>
                          {Math.abs(row.percentReal - row.target) > (row.band !== undefined ? row.band : 5) ? "🔴 Dérive" : "🟢 OK"}
                        </span>
                      )}
                    </div>
                    <div className="hc hc-num hc-ainv">
                      <span className="h-lab">À investir</span>
                      <span
                        className={`ainv ${row.investAmount >= 1 ? "go" : "zero"}`}
                      >
                        {roundToZeroDecimals(row.investAmount)} €
                      </span>
                    </div>
                    <div className="hc hc-del">
                      {isCoreEditing && (
                        <button
                          className="delrow"
                          title="Supprimer"
                          onClick={() => handleDelRow("core", index)}
                          aria-label={`Supprimer ${row.name || `Ligne ${index + 1}`}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div id="core-foot">
                <div className="holds-foot">
                  <div className="hc">Portefeuille</div>
                  <div className="hc num">
                    {roundToZeroDecimals(coreTotalAmount)} €
                  </div>
                  <div className="hc num">100 %</div>
                  <div
                    className={`hc num tsum ${Math.abs(targetPercentSum - 100) < 0.5 ? "good" : "bad"}`}
                  >
                    {targetPercentSum.toFixed(0)} %
                  </div>
                  <div className="hc" />
                  <div className="hc num" style={{ color: "var(--gold)" }}>
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

          {/* Satellite panel — sous le cœur dans la colonne gauche */}
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
                {processedSatelliteLines.map((row, index) => (
                  <div
                    className={`hold ${row.under ? "under" : ""} ${row.over ? "over" : ""}`}
                    key={index}
                  >
                    <div className="hc hc-name">
                      <label className="h-lab" htmlFor={`hn-sat-${index}`}>
                        Titre
                      </label>
                      <input
                        className="h-name"
                        id={`hn-sat-${index}`}
                        value={row.name}
                        onChange={(e) =>
                          handleRowChange("sat", index, "name", e.target.value)
                        }
                        placeholder="Titre"
                        readOnly={!isSatelliteEditing}
                        tabIndex={isSatelliteEditing ? 0 : -1}
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
                          handleRowChange(
                            "sat",
                            index,
                            "amount",
                            e.target.value,
                          )
                        }
                        readOnly={!isSatelliteEditing}
                        tabIndex={isSatelliteEditing ? 0 : -1}
                        inputMode="decimal"
                        step="1"
                        aria-label={`Montant — ${row.name || `Ligne ${index + 1}`}`}
                      />
                    </div>
                    <div className="hc hc-num hc-reel">
                      <span className="h-lab">% réel</span>
                      <span className="calc pctreel">
                        {row.percentReal.toFixed(2)} %
                      </span>
                    </div>
                    <div className="hc hc-num hc-cible">
                      <label className="h-lab" htmlFor={`hc-sat-${index}`}>
                        % cible
                      </label>
                      <input
                        className="h-target"
                        id={`hc-sat-${index}`}
                        type="number"
                        value={row.target || ""}
                        onChange={(e) =>
                          handleRowChange(
                            "sat",
                            index,
                            "target",
                            e.target.value,
                          )
                        }
                        readOnly={!isSatelliteEditing}
                        tabIndex={isSatelliteEditing ? 0 : -1}
                        inputMode="decimal"
                        step="0.5"
                        aria-label={`Cible — ${row.name || `Ligne ${index + 1}`}`}
                      />
                    </div>
                    <div className="hc hc-num hc-band">
                      <span className="h-lab">Bande %</span>
                      {isSatelliteEditing ? (
                        <input
                          className="h-band-input"
                          id={`hb-sat-${index}`}
                          type="number"
                          value={row.band !== undefined ? row.band : 5}
                          onChange={(e) =>
                            handleRowChange(
                              "sat",
                              index,
                              "band",
                              +e.target.value || 0,
                            )
                          }
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          aria-label={`Bande — ${row.name || `Ligne ${index + 1}`}`}
                        />
                      ) : (
                        <span className={`badge-drift ${Math.abs(row.percentReal - row.target) > (row.band !== undefined ? row.band : 5) ? "drift" : "ok"}`}>
                          {Math.abs(row.percentReal - row.target) > (row.band !== undefined ? row.band : 5) ? "🔴 Dérive" : "🟢 OK"}
                        </span>
                      )}
                    </div>
                    <div className="hc hc-num hc-ainv">
                      <span className="h-lab">À investir</span>
                      <span
                        className={`ainv ${row.investAmount >= 1 ? "go" : row.investAmount <= -1 ? "neg" : "zero"}`}
                      >
                        {row.investAmount >= 0 ? "" : "−"}
                        {Math.abs(roundToZeroDecimals(row.investAmount))} €
                      </span>
                    </div>
                    <div className="hc hc-del">
                      {isSatelliteEditing && (
                        <button
                          className="delrow"
                          title="Supprimer"
                          onClick={() => handleDelRow("sat", index)}
                          aria-label={`Supprimer ${row.name || `Ligne ${index + 1}`}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div id="sat-foot">
                <div className="holds-foot">
                  <div className="hc">Satellites</div>
                  <div className="hc num">
                    {roundToZeroDecimals(satelliteTotalAmount)} €
                  </div>
                  <div className="hc num">
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
          {/* Target Donut Chart */}
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

          {/* VIX volatility panel */}
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
                style={{
                  background: `${marketRegime.color}22`,
                  color: marketRegime.color,
                }}
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
          onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <span className="ptitle">📈 Simulateur d'intérêts composés</span>
          <span className={`simulator-arrow ${isSimulatorOpen ? "open" : ""}`}>
            ▶
          </span>
        </div>
        {isSimulatorOpen && (
          <div className="simulator-content">
            <div className="sim-inputs" style={{ display: "flex", flexWrap: "wrap", gap: "15px", marginBottom: "8px" }}>
              <div className="sim-input-group" style={{ flex: "1 1 200px" }}>
                <label className="h-lab" htmlFor="sim-initial-capital" style={{ fontSize: "11px" }}>
                  Capital initial (pré-rempli)
                </label>
                <input
                  id="sim-initial-capital"
                  type="text"
                  value={formatEuro(coreTotalAmount + satelliteTotalAmount)}
                  readOnly
                  style={{
                    background: "var(--bg-2)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    color: "var(--muted)",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "14px",
                    width: "100%",
                    marginTop: "4px",
                    outline: "none",
                    cursor: "not-allowed"
                  }}
                />
                <span style={{ fontSize: "10px", color: "var(--muted-2)", display: "block", marginTop: "4px" }}>
                  Calculé automatiquement à partir du total actuel du portefeuille (Cœur + Satellite).
                </span>
              </div>

              <div className="sim-input-group" style={{ flex: "1 1 200px" }}>
                <label className="h-lab" htmlFor="sim-monthly-contribution" style={{ fontSize: "11px" }}>
                  Versement mensuel (pré-rempli)
                </label>
                <input
                  id="sim-monthly-contribution"
                  type="text"
                  value={formatEuro(allocation.monthly || 0)}
                  readOnly
                  style={{
                    background: "var(--bg-2)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    color: "var(--muted)",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "14px",
                    width: "100%",
                    marginTop: "4px",
                    outline: "none",
                    cursor: "not-allowed"
                  }}
                />
                <span style={{ fontSize: "10px", color: "var(--muted-2)", display: "block", marginTop: "4px" }}>
                  Calculé automatiquement à partir de l'allocation mensuelle configurée ci-dessus.
                </span>
              </div>

              <div className="sim-input-group" style={{ flex: "1 1 140px" }}>
                <label className="h-lab" htmlFor="sim-rate" style={{ fontSize: "11px" }}>
                  Taux annuel estimé (%)
                </label>
                <input
                  id="sim-rate"
                  type="number"
                  value={simulatorAnnualRate}
                  onChange={(e) => setSimulatorAnnualRate(+e.target.value || 0)}
                  style={{
                    background: "var(--bg-2)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    color: "var(--ink)",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "14px",
                    width: "100%",
                    marginTop: "4px",
                    outline: "none"
                  }}
                  step="0.5"
                  min="0"
                />
                <span style={{ fontSize: "10px", color: "var(--muted-2)", display: "block", marginTop: "4px" }}>
                  Rendement annuel attendu du portefeuille.
                </span>
              </div>

              <div className="sim-input-group" style={{ flex: "1 1 140px" }}>
                <label className="h-lab" htmlFor="sim-years" style={{ fontSize: "11px" }}>
                  Durée (années)
                </label>
                <input
                  id="sim-years"
                  type="number"
                  value={simulatorYears}
                  onChange={(e) => setSimulatorYears(+e.target.value || 0)}
                  style={{
                    background: "var(--bg-2)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    color: "var(--ink)",
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "14px",
                    width: "100%",
                    marginTop: "4px",
                    outline: "none"
                  }}
                  step="1"
                  min="0"
                />
                <span style={{ fontSize: "10px", color: "var(--muted-2)", display: "block", marginTop: "4px" }}>
                  Horizon d'investissement pour la projection.
                </span>
              </div>

              <div className="sim-input-group" style={{ flex: "1 1 200px" }}>
                <label className="h-lab" htmlFor="sim-tax-regime" style={{ fontSize: "11px" }}>
                  Fiscalité
                </label>
                <select
                  id="sim-tax-regime"
                  value={taxationRegime}
                  onChange={(e) => setTaxationRegime(e.target.value)}
                  style={{
                    background: "var(--bg-2)",
                    border: "none",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    color: "var(--ink)",
                    fontFamily: "inherit",
                    fontSize: "14px",
                    width: "100%",
                    marginTop: "4px",
                    outline: "none",
                    cursor: "pointer",
                    height: "37px"
                  }}
                >
                  <option value="flat-tax">Flat Tax / PFU (30%)</option>
                  <option value="pea">PEA &gt; 5 ans (17,2% prélèvements sociaux)</option>
                  <option value="none">Sans fiscalité (0%)</option>
                  <option value="custom">Personnalisée</option>
                </select>
                <span style={{ fontSize: "10px", color: "var(--muted-2)", display: "block", marginTop: "4px" }}>
                  Régime fiscal de retrait ou de capitalisation.
                </span>
              </div>

              {taxationRegime === "custom" && (
                <div className="sim-input-group" style={{ flex: "1 1 200px" }}>
                  <label className="h-lab" htmlFor="sim-custom-tax" style={{ fontSize: "11px" }}>
                    Taux d'imposition personnalisé (%)
                  </label>
                  <input
                    id="sim-custom-tax"
                    type="number"
                    value={customTaxRate}
                    onChange={(e) => setCustomTaxRate(+e.target.value || 0)}
                    style={{
                      background: "var(--bg-2)",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 10px",
                      color: "var(--ink)",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "14px",
                      width: "100%",
                      marginTop: "4px",
                      outline: "none"
                    }}
                    step="0.1"
                    min="0"
                    max="100"
                  />
                  <span style={{ fontSize: "10px", color: "var(--muted-2)", display: "block", marginTop: "4px" }}>
                    Saisir un taux d'imposition global à appliquer.
                  </span>
                </div>
              )}
            </div>

            {(() => {
              const initialCapital = coreTotalAmount + satelliteTotalAmount;
              const monthlyContrib = allocation.monthly || 0;
              const taxRatePercent =
                taxationRegime === "flat-tax"
                  ? 30
                  : taxationRegime === "pea"
                    ? 17.2
                    : taxationRegime === "none"
                      ? 0
                      : customTaxRate;

              const simResult = calculateCompoundInterest(
                initialCapital,
                monthlyContrib,
                simulatorAnnualRate,
                simulatorYears,
                taxRatePercent,
              );

              return (
                <div className="sim-results-grid">
                  <div className="sim-result-card-primary">
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "JetBrains Mono, monospace" }}>
                        Capital net final (après impôts)
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--gold)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                        {formatEuro(simResult.netFinalValue)}
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted-2)", marginTop: "6px", fontFamily: "inherit" }}>
                      Valeur brute : {formatEuro(simResult.finalValue)}
                    </div>
                  </div>

                  <div className="sim-result-card" style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "JetBrains Mono, monospace" }}>
                      Total versements
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--ink)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                      {formatEuro(simResult.totalContributions)}
                    </div>
                  </div>

                  <div className="sim-result-card" style={{ background: "rgba(91, 141, 239, 0.05)", border: "1px solid var(--line)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "JetBrains Mono, monospace" }}>
                      Intérêts bruts
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--cobalt)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                      {formatEuro(simResult.totalInterest)}
                    </div>
                  </div>

                  <div className="sim-result-card" style={{ background: "rgba(224, 112, 92, 0.05)", border: "1px solid var(--line)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "JetBrains Mono, monospace" }}>
                      Impôts estimés
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--coral)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                      {formatEuro(simResult.estimatedTaxes)}
                    </div>
                  </div>

                  <div className="sim-result-card" style={{ background: "rgba(70, 204, 163, 0.05)", border: "1px solid var(--line)", borderRadius: "10px", padding: "12px" }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "JetBrains Mono, monospace" }}>
                      Intérêts nets
                    </div>
                    <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--teal)", marginTop: "4px", fontFamily: "JetBrains Mono, monospace" }}>
                      {formatEuro(simResult.netInterest)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <p className="anote">
        Sauvegarde automatique (locale, ou en ligne si Firebase est configuré).
        Export/import JSON disponible pour la sauvegarde et le transfert.
      </p>
    </>
  );
};
