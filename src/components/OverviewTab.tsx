import React, { useState } from "react";
import { PortfolioModel, Transaction } from "../types";
import {
  LineChart,
  BarChart,
  DonutChart,
  Legend,
  InstrumentBars,
} from "./Charts";
import { formatEuro, formatNumber, formatDate } from "../utils/financeMath";

interface OverviewTabProps {
  model: PortfolioModel;
}

const CLASS_META = {
  FUND: { label: "Fonds / ETF", hex: "#e8b339" },
  STOCK: { label: "Actions", hex: "#5b8def" },
  CRYPTO: { label: "Crypto", hex: "#a07bf0" },
  OTHER: { label: "Autre", hex: "#8093b3" },
};

export const OverviewTab: React.FC<OverviewTabProps> = ({ model }) => {
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [sortKey, setSortKey] = useState<keyof Transaction>("date");
  const [sortDirection, setSortDirection] = useState<-1 | 1>(-1);

  // 1. Filtered and sorted transactions
  const filteredTransactions = model.transactions.filter(
    (transaction) => filter === "ALL" || transaction.type === filter,
  );
  const sortedTransactions = [...filteredTransactions].sort(
    (transactionA, transactionB) => {
      const valueA = transactionA[sortKey];
      const valueB = transactionB[sortKey];
      if (typeof valueA === "string" && typeof valueB === "string") {
        return (valueA < valueB ? -1 : valueA > valueB ? 1 : 0) * sortDirection;
      } else if (typeof valueA === "number" && typeof valueB === "number") {
        return (valueA - valueB) * sortDirection;
      }
      return 0;
    },
  );

  const handleHeaderClick = (key: keyof Transaction) => {
    if (sortKey === key) {
      setSortDirection((prevDirection) => (prevDirection === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDirection(key === "date" ? -1 : 1);
    }
  };

  const getSortArrow = (key: keyof Transaction) => {
    if (sortKey !== key) return null;
    return sortDirection === -1 ? " ▾" : " ▴";
  };

  // 2. Asset class donut segments & legend
  const donutSegments = model.classes.map((classItem) => ({
    value: classItem.value,
    color: CLASS_META[classItem.assetClass]?.hex || CLASS_META.OTHER.hex,
  }));

  const legendRows = model.classes.map((classItem) => {
    const meta = CLASS_META[classItem.assetClass] || CLASS_META.OTHER;
    const total = model.totalNet || 1;
    return {
      color: meta.hex,
      name: meta.label,
      val: formatEuro(classItem.value),
      right: ((classItem.value / total) * 100).toFixed(1) + "%",
    };
  });

  return (
    <>
      {/* KPIs Grid */}
      <div className="kpis" id="kpis">
        <div className="kpi" style={{ "--accent": "var(--gold)" }}>
          <div className="klabel">
            <span className="kdot" />
            Capital net déployé
          </div>
          <div className="kval">{formatEuro(model.netDeployed)}</div>
          <div className="ksub">{model.transactions.length} transactions</div>
        </div>
        <div className="kpi" style={{ "--accent": "var(--teal)" }}>
          <div className="klabel">
            <span className="kdot" />
            Moyenne nette / mois
          </div>
          <div className="kval">{formatEuro(model.avgMonth)}</div>
          <div className="ksub">
            ventes déduites · {model.months.length} mois
          </div>
        </div>
        <div className="kpi" style={{ "--accent": "var(--cobalt)" }}>
          <div className="klabel">
            <span className="kdot" />
            Positions
          </div>
          <div className="kval">{model.instruments.length}</div>
          <div className="ksub">{model.classes.length} classes d'actif</div>
        </div>
        <div className="kpi" style={{ "--accent": "var(--violet)" }}>
          <div className="klabel">
            <span className="kdot" />
            Produit des ventes
          </div>
          <div className="kval">{formatEuro(model.sold)}</div>
          <div className="ksub">{model.sells.length} ventes</div>
        </div>
        <div className="kpi" style={{ "--accent": "var(--coral)" }}>
          <div className="klabel">
            <span className="kdot" />
            Frais payés
          </div>
          <div className="kval">{formatEuro(model.fees, 2)}</div>
          <div className="ksub">ordres + plan d'épargne</div>
        </div>
      </div>

      {/* Main dashboard grid */}
      <div className="grid cols-2" style={{ marginTop: "14px" }}>
        {/* Net Capital Deployed Curve */}
        <div className="panel" id="overview-curve">
          <div className="phead">
            <span className="ptitle">Capital net déployé</span>
            <span className="phint">
              cumul achats − ventes · points de vente
            </span>
          </div>
          <div id="chart">
            <LineChart series={model.series} sells={model.sells} />
          </div>
        </div>

        {/* Assets Allocation Donut */}
        <div className="panel" id="overview-donut">
          <div className="phead">
            <span className="ptitle">Répartition des positions</span>
            <span className="phint">par classe d'actifs</span>
          </div>
          <div className="donut-wrap">
            <div
              id="donut"
              style={{ display: "flex", justifyContent: "center" }}
            >
              <DonutChart
                segments={donutSegments}
                centerTop={formatEuro(model.totalNet)}
                centerBottom="net investi"
              />
            </div>
            <div id="legend">
              <Legend rows={legendRows} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: "14px" }}>
        {/* Monthly Bar Chart */}
        <div className="panel">
          <div className="phead">
            <span className="ptitle">Investi par mois</span>
            <span className="phint" id="month-hint">
              achats − reventes · moyenne {formatEuro(model.avgMonth)} / mois
            </span>
          </div>
          <BarChart months={model.months} avgMonth={model.avgMonth} />
        </div>

        {/* Instruments list */}
        <div className="panel">
          <div className="phead">
            <span className="ptitle">Par instrument</span>
            <span className="phint">montant net · PRU · quantité</span>
          </div>
          <InstrumentBars instruments={model.instruments} />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="panel" style={{ marginTop: "14px" }}>
        <div className="phead">
          <div>
            <span className="ptitle">Journal des transactions</span>
            <span className="phint">historique des ordres exécutés</span>
          </div>
          <div className="filters" id="filters">
            <button
              className={filter === "ALL" ? "active" : ""}
              onClick={() => setFilter("ALL")}
            >
              Tout
            </button>
            <button
              className={filter === "BUY" ? "active" : ""}
              onClick={() => setFilter("BUY")}
            >
              Achats
            </button>
            <button
              className={filter === "SELL" ? "active" : ""}
              onClick={() => setFilter("SELL")}
            >
              Ventes
            </button>
          </div>
        </div>
        <div className="tbl-scroll">
          <table id="tbl">
            <thead id="tbl-head">
              <tr>
                <th
                  className="num"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleHeaderClick("date")}
                >
                  Date{getSortArrow("date")}
                </th>
                <th
                  style={{ cursor: "pointer" }}
                  onClick={() => handleHeaderClick("name")}
                >
                  Instrument{getSortArrow("name")}
                </th>
                <th
                  style={{ cursor: "pointer" }}
                  onClick={() => handleHeaderClick("type")}
                >
                  Sens{getSortArrow("type")}
                </th>
                <th
                  className="num"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleHeaderClick("shares")}
                >
                  Parts{getSortArrow("shares")}
                </th>
                <th
                  className="num"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleHeaderClick("price")}
                >
                  Prix{getSortArrow("price")}
                </th>
                <th
                  className="num"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleHeaderClick("amount")}
                >
                  Montant €{getSortArrow("amount")}
                </th>
                <th
                  className="num"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleHeaderClick("fee")}
                >
                  Frais €{getSortArrow("fee")}
                </th>
              </tr>
            </thead>
            <tbody id="tbody">
              {sortedTransactions.length > 0 ? (
                sortedTransactions.map((transaction, index) => (
                  <tr key={index}>
                    <td
                      className="num"
                      data-label="Date"
                      style={{ color: "var(--muted)" }}
                    >
                      {formatDate(transaction.date)}
                    </td>
                    <td
                      className="name"
                      data-label="Instrument"
                      title={transaction.name}
                    >
                      {transaction.name}
                    </td>
                    <td data-label="Sens">
                      <span
                        className={`badge ${transaction.type === "BUY" ? "buy" : "sell"}`}
                      >
                        {transaction.type === "BUY" ? "Achat" : "Vente"}
                      </span>
                    </td>
                    <td className="num" data-label="Parts">
                      {transaction.shares
                        ? formatNumber(
                            transaction.shares,
                            transaction.shares < 1 ? 4 : 2,
                          )
                        : "—"}
                    </td>
                    <td className="num" data-label="Prix">
                      {transaction.price
                        ? formatNumber(transaction.price)
                        : "—"}
                    </td>
                    <td
                      className={`num ${transaction.amount >= 0 ? "pos" : "neg"}`}
                      data-label="Montant €"
                    >
                      {formatNumber(transaction.amount)}
                    </td>
                    <td
                      className="num"
                      data-label="Frais €"
                      style={{ color: "var(--muted)" }}
                    >
                      {transaction.fee ? formatNumber(transaction.fee) : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={7}>
                    Aucune transaction
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
