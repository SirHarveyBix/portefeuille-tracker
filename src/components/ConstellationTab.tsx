import React, { useState, useCallback, useEffect, useRef } from "react";
import { PortfolioModel, AllocationConfig, Instrument } from "../types";
import {
  formatEuro,
  formatNumber,
  shortName,
  normalizeKey,
} from "../utils/financeMath";
import { getAssetMeta } from "../utils/assetMeta";

interface ConstellationTabProps {
  model: PortfolioModel;
  allocation: AllocationConfig;
  onAliasChange: (csvName: string, allocName: string) => void;
  onAliasUnlink: (csvName: string) => void;
}

const getMeta = getAssetMeta;

interface PhysicsNode extends Instrument {
  radius: number;
  positionX: number;
  positionY: number;
  velocityX: number;
  velocityY: number;
  isTop: boolean;
}

export const ConstellationTab: React.FC<ConstellationTabProps> = ({
  model,
  allocation,
  onAliasChange,
  onAliasUnlink,
}) => {
  const [hoveredNode, setHoveredNode] = useState<PhysicsNode | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    positionX: number;
    positionY: number;
    name: string;
    net: number;
  } | null>(null);

  const [activeSelectCsv, setActiveSelectCsv] = useState<string | null>(null);
  const [expandedInstrument, setExpandedInstrument] = useState<string | null>(
    null,
  );
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  const [renderNodes, setRenderNodes] = useState<PhysicsNode[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const nodesRef = useRef<PhysicsNode[]>([]);

  const width = 720;
  const height = 470;

  // Shared physics tick — mutates nodesRef and paints DOM directly for framerate
  const runSimulation = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    let alpha = 1;
    const cx = width / 2;
    const cy = height / 2;

    const tick = () => {
      alpha *= 0.992;
      const nodes = nodesRef.current;

      for (const node of nodes) {
        node.velocityX += (cx - node.positionX) * 0.0016;
        node.velocityY += (cy - node.positionY) * 0.0016;
        node.velocityX += (Math.random() - 0.5) * 0.05 * alpha;
        node.velocityY += (Math.random() - 0.5) * 0.05 * alpha;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.positionX - a.positionX;
          const dy = b.positionY - a.positionY;
          const dist = Math.hypot(dx, dy) || 0.01;
          const minDist = a.radius + b.radius + 3;
          if (dist < minDist) {
            const r = ((minDist - dist) / dist) * 0.5;
            a.positionX -= dx * r;
            a.positionY -= dy * r;
            b.positionX += dx * r;
            b.positionY += dy * r;
          }
        }
      }

      for (const node of nodes) {
        node.positionX += node.velocityX;
        node.positionY += node.velocityY;
        node.velocityX *= 0.86;
        node.velocityY *= 0.86;
        node.positionX = Math.max(
          node.radius + 4,
          Math.min(width - node.radius - 4, node.positionX),
        );
        node.positionY = Math.max(
          node.radius + 4,
          Math.min(height - node.radius - 4, node.positionY),
        );
      }

      nodes.forEach((node, idx) => {
        const el = svgRef.current?.querySelector(`[data-idx="${idx}"]`);
        if (el)
          el.setAttribute(
            "transform",
            `translate(${node.positionX}, ${node.positionY})`,
          );
      });

      if (alpha > 0.002) animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1. Setup physics simulation nodes
  useEffect(() => {
    if (!model.instruments.length) return;

    const base = Math.min(width, height);
    const maxRadius = Math.max(34, Math.min(78, base * 0.2));
    const minRadius = Math.max(13, maxRadius * 0.34);

    const values = model.instruments.map((i) => i.net);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    const calcRadius = (v: number) =>
      maxVal === minVal
        ? (minRadius + maxRadius) / 2
        : minRadius +
          ((Math.sqrt(v) - Math.sqrt(minVal)) /
            (Math.sqrt(maxVal) - Math.sqrt(minVal))) *
            (maxRadius - minRadius);

    nodesRef.current = model.instruments.map((instrument, index) => ({
      ...instrument,
      radius: calcRadius(instrument.net),
      positionX: width / 2 + (Math.random() - 0.5) * Math.min(120, width * 0.3),
      positionY: -40 - Math.random() * 260,
      velocityX: 0,
      velocityY: 0,
      isTop: index === 0,
    }));

    setRenderNodes([...nodesRef.current]);
    runSimulation();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [model, runSimulation]);

  const triggerReplay = () => {
    nodesRef.current = nodesRef.current.map((node) => ({
      ...node,
      positionX: width / 2 + (Math.random() - 0.5) * 120,
      positionY: -40 - Math.random() * 260,
      velocityX: 0,
      velocityY: 0,
    }));
    setRenderNodes([...nodesRef.current]);
    runSimulation();
  };

  // Pause animation when stage scrolls out of view
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 2. Tooltip & Sidebar logic
  const handleMouseEnter = (node: PhysicsNode) => {
    setHoveredNode(node);
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
    setTooltip(null);
  };

  const handleMouseMove = (
    event: React.MouseEvent<SVGGElement, MouseEvent>,
    node: PhysicsNode,
  ) => {
    if (!stageRef.current) return;
    const stageRect = stageRef.current.getBoundingClientRect();
    setTooltip({
      visible: true,
      positionX: event.clientX - stageRect.left,
      positionY: event.clientY - stageRect.top - 12,
      name: node.name,
      net: node.net,
    });
  };

  const topNode = renderNodes[0] || null;
  const smallNode = renderNodes[renderNodes.length - 1] || null;

  // 3. Fee table data
  const feeByInstrument: Record<string, number> = {};
  model.transactions.forEach((transaction) => {
    feeByInstrument[transaction.name] =
      (feeByInstrument[transaction.name] || 0) + Math.abs(transaction.fee);
  });

  const allocList = [...(allocation.core || []), ...(allocation.sat || [])];
  const allocByNorm = new Map(
    allocList.map((line) => [normalizeKey(line.name), line]),
  );

  const findAllocMatch = (csvName: string) => {
    const aliasTarget = allocation.aliases?.[csvName];
    if (aliasTarget !== undefined) {
      if (aliasTarget === "") return null; // force-unlinked by user
      const found = allocList.find((line) => line.name === aliasTarget);
      if (found) return found;
    }
    return allocByNorm.get(normalizeKey(csvName)) || null;
  };

  const allCostRows = model.instruments.map((instrument) => {
    const fees = feeByInstrument[instrument.name] || 0;
    const feeRatio =
      instrument.buyAmount > 0 ? (fees / instrument.buyAmount) * 100 : 0;
    const realPercent =
      model.totalNet > 0 ? (instrument.net / model.totalNet) * 100 : 0;
    const match = findAllocMatch(instrument.name);
    // Guard: only use allocation amount when it's > 0 (0 = seed/unset)
    const currentValue = match && +match.amount > 0 ? +match.amount : null;
    const profitAndLoss =
      currentValue !== null ? currentValue - instrument.net : null;
    const profitAndLossPercent =
      currentValue !== null && instrument.net > 0
        ? ((currentValue - instrument.net) / instrument.net) * 100
        : null;
    const calculatedPrice =
      currentValue !== null && Math.abs(instrument.shares) > 0
        ? currentValue / Math.abs(instrument.shares)
        : null;
    const isAliasLinked =
      !!allocation.aliases?.[instrument.name] &&
      allocation.aliases[instrument.name] !== "";
    const linked = !!match || isAliasLinked;
    return {
      ...instrument,
      fees,
      feeRatio,
      realPercent,
      currentValue,
      profitAndLoss,
      profitAndLossPercent,
      calculatedPrice,
      isAliasLinked,
      linked,
    };
  });

  const activeCostRows = allCostRows
    .filter((row) => Math.abs(row.shares) >= 0.0001 || row.linked)
    .sort((rowA, rowB) => rowA.feeRatio - rowB.feeRatio);

  const archivedRows = allCostRows.filter(
    (row) => Math.abs(row.shares) < 0.0001 && !row.linked,
  );

  const maxFee = Math.max(...activeCostRows.map((row) => row.feeRatio), 0.01);

  const feeBadge = (ratio: number) => {
    if (ratio < 0.3) return { label: "Efficace", color: "var(--teal)" };
    if (ratio < 1.0) return { label: "Modéré", color: "var(--gold)" };
    return { label: "Gourmand", color: "var(--coral)" };
  };

  const getBuyTransactions = (instrumentName: string) =>
    model.transactions
      .filter((t) => t.name === instrumentName && t.type === "BUY")
      .sort((a, b) => a.date.localeCompare(b.date));

  const getSellProceeds = (instrumentName: string) =>
    model.transactions
      .filter((t) => t.name === instrumentName && t.type === "SELL")
      .reduce((sum, t) => sum + t.amount, 0);

  return (
    <>
      {/* Constellation Grid (Stage + Sidebar) */}
      <div className="const-grid">
        {/* Animated Physics Stage */}
        <div
          className={`panel const-stage ${hoveredNode ? "dim" : ""}`}
          id="stage"
          ref={stageRef}
          style={{ position: "relative" }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Constellation du portefeuille — bulles proportionnelles aux montants investis"
            style={{ width: "100%", height: "100%" }}
          >
            {renderNodes.map((node, index) => {
              const meta = getMeta(node.assetClass);
              const isHot = hoveredNode?.name === node.name;
              return (
                <g
                  key={index}
                  data-idx={index}
                  className={`bubble ${isHot ? "hot" : ""}`}
                  style={{ "--glow": meta.hex }}
                  onMouseEnter={() => handleMouseEnter(node)}
                  onMouseLeave={handleMouseLeave}
                  onMouseMove={(event) => handleMouseMove(event, node)}
                >
                  <circle r={node.radius} fill={meta.hex} fillOpacity={0.92} />
                  {node.radius > 30 && (
                    <text
                      fontSize={Math.min(15, node.radius / 3.4)}
                      dy={node.radius > 44 ? "-2" : "3"}
                      textAnchor="middle"
                      fill="#fff"
                    >
                      {shortName(node.name).slice(
                        0,
                        node.radius > 52 ? 16 : 11,
                      )}
                    </text>
                  )}
                  {node.radius > 44 && (
                    <text
                      className="bsub"
                      fontSize={Math.min(12, node.radius / 5)}
                      dy="15"
                      textAnchor="middle"
                      fill="#ffffffb2"
                    >
                      {formatEuro(node.net)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip */}
          {tooltip && tooltip.visible && (
            <div
              className="tip"
              style={{
                opacity: 1,
                left: `${tooltip.positionX}px`,
                top: `${tooltip.positionY}px`,
                position: "absolute",
                pointerEvents: "none",
              }}
            >
              <div className="tdate">{shortName(tooltip.name)}</div>
              <div className="tval">{formatEuro(tooltip.net)}</div>
            </div>
          )}

          {/* Replay Button */}
          <button className="replay" id="replay" onClick={triggerReplay}>
            ⟳ Rejouer l'animation
          </button>
        </div>

        {/* Sidebar Info Panels */}
        <div className="const-side">
          {/* Dynamic Hover Details */}
          <div className="ccard live" id="live">
            {hoveredNode ? (
              <>
                <div className="ck">
                  <span
                    className="cdot"
                    style={{ background: getMeta(hoveredNode.assetClass).hex }}
                  />
                  {getMeta(hoveredNode.assetClass).label}
                </div>
                <div className="cname">{shortName(hoveredNode.name)}</div>
                <div
                  className="camt"
                  style={{ color: getMeta(hoveredNode.assetClass).hex }}
                >
                  {formatEuro(hoveredNode.net)}
                </div>
                <div className="cmeta">
                  {((hoveredNode.net / model.totalNet) * 100).toFixed(1)}% du
                  portefeuille ·{" "}
                  {formatNumber(
                    Math.abs(hoveredNode.shares),
                    hoveredNode.shares < 1 ? 4 : 2,
                  )}{" "}
                  parts
                  {hoveredNode.avgCost &&
                    ` · PRU ${formatNumber(hoveredNode.avgCost, hoveredNode.avgCost < 10 ? 4 : 2)} €`}
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--muted)",
                  fontSize: "12px",
                }}
              >
                Survole une bulle pour voir ses détails en direct.
              </div>
            )}
          </div>

          {/* Default Portefeuille Stats */}
          <div className="ccard feature" id="feature">
            {topNode && (
              <>
                <div className="ck">
                  <span
                    className="cdot"
                    style={{ background: getMeta(topNode.assetClass).hex }}
                  />
                  Plus gros investissement
                </div>
                <div className="cname">{shortName(topNode.name)}</div>
                <div className="camt">{formatEuro(topNode.net)}</div>
                <div className="cmeta">
                  {((topNode.net / model.totalNet) * 100).toFixed(1)}% du
                  portefeuille · {getMeta(topNode.assetClass).label} ·{" "}
                  {topNode.buys} achat
                  {topNode.buys > 1 ? "s" : ""}
                </div>
              </>
            )}
          </div>

          <div className="ccard" id="cstats">
            {smallNode && (
              <>
                Plus petite position :{" "}
                <b style={{ color: "var(--ink)" }}>
                  {shortName(smallNode.name)}
                </b>{" "}
                ({formatEuro(smallNode.net)})
                <br />
                {model.instruments.length} positions · moyenne{" "}
                <b style={{ color: "var(--ink)" }}>
                  {formatEuro(model.avgMonth)}
                </b>
                /mois investis
              </>
            )}
          </div>
        </div>
      </div>

      {/* Positions / Fee efficiency Table */}
      <div className="panel" id="cost-analysis" style={{ marginTop: "14px" }}>
        <div className="phead">
          <span className="ptitle">Positions · efficacité des frais</span>
          <span className="phint">
            montant net · PRU · frais de transaction
          </span>
        </div>
        <div className="cost-head">
          <span />
          <span />
          <span>Instrument</span>
          <span className="num">Net investi</span>
          <span className="num">Parts</span>
          <span className="num">PRU</span>
          <span
            className="num"
            title="Prix unitaire calculé : valorisation saisie dans l'Allocation ÷ parts détenues"
          >
            Cours *
          </span>
          <span
            className="num"
            title="P&L estimé : valorisation Allocation − net investi CSV"
          >
            P&L *
          </span>
          <span className="num">Frais €</span>
          <span className="num">Frais %</span>
          <span className="center">Score</span>
        </div>
        <div id="cost-list">
          {activeCostRows.map((row, index) => {
            const badge = feeBadge(row.feeRatio);
            const barWidth = ((row.feeRatio / maxFee) * 100).toFixed(0);
            const pruText = row.avgCost
              ? formatNumber(row.avgCost, row.avgCost < 10 ? 4 : 2) + " €"
              : "—";
            const sharesText = formatNumber(
              Math.abs(row.shares),
              row.shares < 1 ? 4 : 2,
            );

            const priceText =
              row.calculatedPrice !== null
                ? formatNumber(
                    row.calculatedPrice,
                    row.calculatedPrice < 10 ? 4 : 2,
                  ) + " €"
                : "—";

            let pnlText = "—";
            let pnlColor = "var(--muted-2)";
            if (row.profitAndLoss !== null) {
              const sign = row.profitAndLoss >= 0 ? "+" : "";
              pnlText = `${sign}${formatEuro(row.profitAndLoss, 2)} (${sign}${(row.profitAndLossPercent ?? 0).toFixed(1)}%)`;
              if (row.profitAndLoss > 0.01) pnlColor = "var(--teal)";
              else if (row.profitAndLoss < -0.01) pnlColor = "var(--coral)";
            }

            const isSelectOpen = activeSelectCsv === row.name;
            const isExpanded = expandedInstrument === row.name;
            const buyTxs = isExpanded ? getBuyTransactions(row.name) : [];

            return (
              <div
                className={`cost-row expandable ${isExpanded ? "expanded" : ""}`}
                key={index}
                onClick={() =>
                  setExpandedInstrument(isExpanded ? null : row.name)
                }
              >
                <span className="cr-rank">
                  <span className="cr-expand">▶</span>
                </span>
                <span
                  className="cr-dot"
                  style={{ background: getMeta(row.assetClass).hex }}
                />
                <span className="cr-name" title={row.name}>
                  <span className="cr-name-text">{shortName(row.name)}</span>
                  {row.linked && (
                    <button
                      className="cr-unlink-btn"
                      title="Délier de l'allocation"
                      aria-label="Délier de l'allocation"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAliasUnlink(row.name);
                      }}
                    >
                      ⇥
                    </button>
                  )}
                  {!row.linked && allocList.length > 0 && (
                    <span className="cr-link">
                      <button
                        className="cr-link-btn"
                        title="Lier à une ligne d'allocation"
                        aria-label="Lier à une ligne d'allocation"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveSelectCsv(isSelectOpen ? null : row.name);
                        }}
                      >
                        ⇤
                      </button>
                      <select
                        className="cr-link-sel"
                        style={{
                          display: isSelectOpen ? "inline-block" : "none",
                        }}
                        value=""
                        onChange={(event) => {
                          if (event.target.value) {
                            onAliasChange(row.name, event.target.value);
                          }
                          setActiveSelectCsv(null);
                        }}
                      >
                        <option value="">— lier —</option>
                        {allocList.map((allocLine, idx) => (
                          <option value={allocLine.name} key={idx}>
                            {allocLine.name}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                </span>
                <span className="cr-net">{formatEuro(row.net)}</span>
                <span className="cr-shares">{sharesText}</span>
                <span className="cr-pru">{pruText}</span>
                <span className="cr-price">{priceText}</span>
                <span className="cr-pnl" style={{ color: pnlColor }}>
                  {pnlText}
                </span>
                <span className="cr-fees">{formatEuro(row.fees, 1)}</span>
                <div className="cr-fee">
                  <div className="cr-fbar">
                    <div
                      className="cr-ffill"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="cr-fval">{row.feeRatio.toFixed(2)} %</span>
                </div>
                <span
                  className="cr-score"
                  style={{ background: `${badge.color}22`, color: badge.color }}
                >
                  {badge.label}
                </span>

                {/* Buy history — spans full grid width via grid-column: 1 / -1 */}
                {isExpanded && buyTxs.length > 0 && (
                  <div className="buy-history">
                    <div className="buy-history-head">
                      <span>Date</span>
                      <span>Instrument</span>
                      <span className="bh-parts-h">Parts</span>
                      <span className="bh-price-h">Prix unit.</span>
                      <span>Montant</span>
                      <span>Frais</span>
                    </div>
                    {buyTxs.map((tx, txIdx) => (
                      <div className="buy-history-row" key={txIdx}>
                        <span className="bh-date">{tx.date}</span>
                        <span>{tx.symbol || shortName(tx.name)}</span>
                        <span className="bh-shares">
                          {formatNumber(tx.shares, tx.shares < 1 ? 4 : 2)}
                        </span>
                        <span className="bh-price">
                          {formatNumber(tx.price, tx.price < 10 ? 4 : 2)} €
                        </span>
                        <span className="bh-amount">
                          {formatEuro(Math.abs(tx.amount), 2)}
                        </span>
                        <span className="bh-fee">
                          {tx.fee > 0 ? formatEuro(tx.fee, 2) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Archive — fully sold positions */}
      {archivedRows.length > 0 && (
        <div className="panel archive-section" style={{ marginTop: "14px" }}>
          <div
            className="archive-header"
            role="button"
            tabIndex={0}
            aria-expanded={isArchiveOpen}
            onClick={() => setIsArchiveOpen((open) => !open)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsArchiveOpen((open) => !open);
              }
            }}
          >
            <div>
              <span className="ptitle">
                Archive · positions soldées ({archivedRows.length})
              </span>
              <span className="phint" style={{ marginLeft: "10px" }}>
                instruments entièrement revendus
              </span>
            </div>
            <span className={`archive-arrow ${isArchiveOpen ? "open" : ""}`}>
              ▶
            </span>
          </div>

          {isArchiveOpen && (
            <div className="archive-list">
              <div className="archive-head">
                <span />
                <span>Instrument</span>
                <span>Investi</span>
                <span>Produit</span>
                <span>P&L réalisé</span>
              </div>
              {archivedRows.map((row, idx) => {
                const sellProceeds = getSellProceeds(row.name);
                const realizedPnL = sellProceeds - row.buyAmount;
                const isArchiveExpanded = expandedArchive === row.name;
                const archiveBuyTxs = isArchiveExpanded
                  ? getBuyTransactions(row.name)
                  : [];
                return (
                  <div
                    className={`archive-row expandable ${isArchiveExpanded ? "expanded" : ""}`}
                    key={idx}
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      setExpandedArchive(isArchiveExpanded ? null : row.name)
                    }
                  >
                    <span className="cr-expand" style={{ fontSize: "9px" }}>
                      ▶
                    </span>
                    <span className="ar-name" title={row.name}>
                      {shortName(row.name)}
                    </span>
                    <span className="ar-bought">
                      {formatEuro(row.buyAmount)}
                    </span>
                    <span className="ar-sold">{formatEuro(sellProceeds)}</span>
                    <span
                      className={`ar-pnl ${realizedPnL >= 0 ? "pos" : "neg"}`}
                    >
                      {realizedPnL >= 0 ? "+" : ""}
                      {formatEuro(realizedPnL, 2)}
                    </span>

                    {/* Buy history for archived position */}
                    {isArchiveExpanded && archiveBuyTxs.length > 0 && (
                      <div className="buy-history">
                        <div className="buy-history-head">
                          <span>Date</span>
                          <span>Instrument</span>
                          <span>Parts</span>
                          <span>Prix unit.</span>
                          <span>Montant</span>
                          <span>Frais</span>
                        </div>
                        {archiveBuyTxs.map((tx, txIdx) => (
                          <div className="buy-history-row" key={txIdx}>
                            <span className="bh-date">{tx.date}</span>
                            <span>{tx.symbol || shortName(tx.name)}</span>
                            <span className="bh-shares">
                              {formatNumber(tx.shares, tx.shares < 1 ? 4 : 2)}
                            </span>
                            <span className="bh-price">
                              {formatNumber(tx.price, tx.price < 10 ? 4 : 2)} €
                            </span>
                            <span className="bh-amount">
                              {formatEuro(Math.abs(tx.amount), 2)}
                            </span>
                            <span className="bh-fee">
                              {tx.fee > 0 ? formatEuro(tx.fee, 2) : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
};
