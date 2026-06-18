import React, { useState, useRef, useEffect } from "react";
import {
  CurvePoint,
  Instrument,
  MonthSummary,
  Transaction,
  AssetClass,
} from "../types";
import { formatEuro, formatNumber, formatDate } from "../utils/financeMath";

// ==========================================
// 1. DONUT CHART
// ==========================================
export interface DonutSegment {
  value: number;
  color: string;
}

interface DonutProps {
  segments: DonutSegment[];
  centerTop: string;
  centerBottom?: string;
}

export const DonutChart: React.FC<DonutProps> = ({
  segments,
  centerTop,
  centerBottom,
}) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const circumference = 2 * Math.PI * 48;
  let offset = 0;

  return (
    <svg viewBox="0 0 140 140" width={140} height={140}>
      {segments.map((segment, index) => {
        const fraction = segment.value / total;
        const dashOffset = -offset * circumference;
        offset += fraction;
        return (
          <circle
            key={index}
            cx={70}
            cy={70}
            r={48}
            fill="none"
            stroke={segment.color}
            strokeWidth={20}
            strokeDasharray={`${fraction * circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 70 70)"
          />
        );
      })}
      <g className="donut-center">
        <text
          x={70}
          y={centerBottom ? 66 : 74}
          style={{
            fontFamily: "'Space Grotesk'",
            fontWeight: 600,
            fontSize: centerBottom ? "19px" : "13px",
            fill: centerBottom ? "var(--ink)" : "var(--muted)",
            textAnchor: "middle",
          }}
        >
          {centerTop}
        </text>
        {centerBottom && (
          <text
            x={70}
            y={84}
            style={{
              fontFamily: "'JetBrains Mono'",
              fontSize: "9.5px",
              fill: "var(--muted)",
              textAnchor: "middle",
            }}
          >
            {centerBottom}
          </text>
        )}
      </g>
    </svg>
  );
};

// ==========================================
// 2. LEGEND
// ==========================================
interface LegendRow {
  color: string;
  name: string;
  val?: string;
  right?: string;
  title?: string;
  rightColor?: string;
}

interface LegendProps {
  rows: LegendRow[];
}

export const Legend: React.FC<LegendProps> = ({ rows }) => {
  return (
    <div className="legend-list">
      {rows.map((row, index) => (
        <div className="lrow" key={index}>
          <span className="lswatch" style={{ background: row.color }} />
          <span className="lname">{row.name}</span>
          {row.val != null && <span className="lval">{row.val}</span>}
          {row.right != null && (
            <span
              className="lpct"
              title={row.title}
              style={row.rightColor ? { color: row.rightColor } : undefined}
            >
              {row.right}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// ==========================================
// 3. LINE CHART (Net Capital Deployed)
// ==========================================
interface LineChartProps {
  series: CurvePoint[];
  sells: Transaction[];
}

export const LineChart: React.FC<LineChartProps> = ({ series, sells }) => {
  const [tooltip, setTooltip] = useState<{
    positionX: number;
    positionY: number;
    date: string;
    value: number;
    leftPercent: number;
    topPercent: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!pathRef.current) return;
    const length = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = String(length);
    pathRef.current.style.strokeDashoffset = String(length);
    // Trigger animation
    const requestFrameId = requestAnimationFrame(() => {
      if (pathRef.current) {
        pathRef.current.style.transition = "stroke-dashoffset 1s ease";
        pathRef.current.style.strokeDashoffset = "0";
      }
    });
    return () => cancelAnimationFrame(requestFrameId);
  }, [series]);

  if (!series.length) return null;

  const width = 680;
  const height = 240;
  const padding = { top: 14, right: 14, bottom: 26, left: 50 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const startTime = new Date(series[0].date).getTime();
  const endTime = new Date(series[series.length - 1].date).getTime();
  const timeSpan = Math.max(1, endTime - startTime);
  const maxValue = Math.max(...series.map((point) => point.net)) * 1.08 || 1;

  const calculateX = (dateString: string) =>
    padding.left +
    ((new Date(dateString).getTime() - startTime) / timeSpan) * innerWidth;
  const calculateY = (value: number) =>
    padding.top + innerHeight - (value / maxValue) * innerHeight;

  // Grid lines
  const gridLines = [];
  for (let index = 0; index <= 4; index++) {
    const value = (maxValue * index) / 4;
    const positionY = calculateY(value);
    gridLines.push({ value, y: positionY });
  }

  // X Labels
  const midIndex = Math.floor(series.length / 2);
  const xLabels = [series[0], series[midIndex], series[series.length - 1]];

  // Generate SVG path string
  let pathString = `M ${calculateX(series[0].date)} ${calculateY(series[0].net)}`;
  series.forEach((point) => {
    pathString += ` L ${calculateX(point.date)} ${calculateY(point.net)}`;
  });

  const fillPathString = `${pathString} L ${calculateX(series[series.length - 1].date)} ${calculateY(0)} L ${calculateX(series[0].date)} ${calculateY(0)} Z`;

  const handleMouseMove = (
    event: React.MouseEvent<SVGSVGElement, MouseEvent>,
  ) => {
    if (!containerRef.current) return;
    const containerRect = event.currentTarget.getBoundingClientRect();
    const pixelX =
      ((event.clientX - containerRect.left) / containerRect.width) * width;

    let closestPoint = series[0];
    let bestDistance = 1e9;
    series.forEach((point) => {
      const currentDistance = Math.abs(calculateX(point.date) - pixelX);
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        closestPoint = point;
      }
    });

    const xCoord = calculateX(closestPoint.date);
    const yCoord = calculateY(closestPoint.net);

    setTooltip({
      positionX: xCoord,
      positionY: yCoord,
      date: closestPoint.date,
      value: closestPoint.net,
      leftPercent: (xCoord / width) * 100,
      topPercent: (yCoord / height) * 100,
    });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div
      className="curve-chart-container"
      ref={containerRef}
      style={{ position: "relative" }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8b339" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#e8b339" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines & labels */}
        {gridLines.map((gridLine, index) => (
          <g key={index}>
            <line
              className="grid-line"
              x1={padding.left}
              x2={width - padding.right}
              y1={gridLine.y}
              y2={gridLine.y}
            />
            <text
              className="axis-label"
              x={padding.left - 8}
              y={gridLine.y + 3}
              textAnchor="end"
            >
              {Math.round(gridLine.value)}€
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map((point, index) => (
          <text
            key={index}
            className="axis-label"
            x={calculateX(point.date)}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
          >
            {formatDate(point.date)}
          </text>
        ))}

        {/* Fill area */}
        <path d={fillPathString} fill="url(#ag)" />

        {/* Line */}
        <path ref={pathRef} d={pathString} className="area-line" />

        {/* Sells dots */}
        {sells.map((sellTransaction, index) => {
          const matchingPoint = series.find(
            (point) => point.date === sellTransaction.date,
          );
          if (matchingPoint) {
            return (
              <circle
                key={index}
                className="sell-dot"
                cx={calculateX(matchingPoint.date)}
                cy={calculateY(matchingPoint.net)}
                r={4}
              />
            );
          }
          return null;
        })}

        {/* Hover Line */}
        {tooltip && (
          <line
            className="hover-line"
            x1={tooltip.positionX}
            x2={tooltip.positionX}
            y1={padding.top}
            y2={padding.top + innerHeight}
            style={{ opacity: 1 }}
          />
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="tip"
          style={{
            opacity: 1,
            left: `${tooltip.leftPercent}%`,
            top: `${tooltip.topPercent}%`,
            transform: "translate(-50%, -120%)",
            pointerEvents: "none",
          }}
        >
          <div className="tdate">{formatDate(tooltip.date)}</div>
          <div className="tval">{formatEuro(tooltip.value)}</div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 4. BAR CHART (Monthly Net Invested)
// ==========================================
interface BarChartProps {
  months: MonthSummary[];
  avgMonth: number;
}

export const BarChart: React.FC<BarChartProps> = ({ months, avgMonth }) => {
  const [animate, setAnimate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 50);
    return () => clearTimeout(timer);
  }, [months]);

  if (!months.length) return null;

  const values = months.map((month) => month.net);
  const maxAbsoluteValue = Math.max(...values.map((val) => Math.abs(val)), 1);
  const peakValue = Math.max(...values);

  // Calculate avg line position
  const containerHeight = 150; // default height in stylesheet
  const innerHeight = containerHeight - 22;
  const avgLinePixels =
    22 + Math.max(0, Math.min(1, avgMonth / maxAbsoluteValue)) * innerHeight;

  return (
    <div className="mbars" ref={containerRef} style={{ position: "relative" }}>
      {months.map((month, index) => {
        const isNegative = month.net < 0;
        const isPeak = month.net === peakValue && !isNegative;
        const classNameString =
          `${isNegative ? "neg" : ""} ${isPeak ? "peak" : ""}`.trim();
        const barHeightPercent = Math.max(
          3,
          (Math.abs(month.net) / maxAbsoluteValue) * 100,
        );

        return (
          <div className={`mcol ${classNameString}`} key={index}>
            <span className="mval">{formatEuro(month.net)}</span>
            <div
              className="mbar"
              style={{ height: animate ? `${barHeightPercent}%` : "0%" }}
            />
            <span className="mlab">{month.month}</span>
          </div>
        );
      })}

      {/* Avg line */}
      <div className="mavg-line" style={{ bottom: `${avgLinePixels}px` }} />
      <div className="mavg-tag" style={{ bottom: `${avgLinePixels}px` }}>
        moy. nette {formatEuro(avgMonth)}
      </div>
    </div>
  );
};

// ==========================================
// 5. INSTRUMENT BARS
// ==========================================
interface InstrumentBarsProps {
  instruments: Instrument[];
}

export const InstrumentBars: React.FC<InstrumentBarsProps> = ({
  instruments,
}) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 50);
    return () => clearTimeout(timer);
  }, [instruments]);

  const maxNet = Math.max(
    ...instruments.map((instrument) => instrument.net),
    1,
  );

  const CLASS_META: Record<AssetClass, { label: string; hex: string }> = {
    FUND: { label: "Fonds / ETF", hex: "#e8b339" },
    STOCK: { label: "Actions", hex: "#5b8def" },
    CRYPTO: { label: "Crypto", hex: "#a07bf0" },
    OTHER: { label: "Autre", hex: "#8093b3" },
  };
  const getColorHex = (assetClass: AssetClass) =>
    CLASS_META[assetClass]?.hex || CLASS_META.OTHER.hex;

  return (
    <div id="bars">
      {instruments.map((instrument, index) => {
        const pruText = instrument.avgCost
          ? `PRU ${formatNumber(instrument.avgCost, instrument.avgCost < 10 ? 4 : 2)} € · ${formatNumber(Math.abs(instrument.shares), instrument.shares < 1 ? 4 : 2)} parts`
          : "";
        const percentWidth = (instrument.net / maxNet) * 100;

        return (
          <div className="bar" key={index}>
            <div className="btop">
              <span className="bname" title={instrument.name}>
                {instrument.name}
              </span>
              <span className="bval">{formatEuro(instrument.net)}</span>
            </div>
            {pruText && <div className="bsub">{pruText}</div>}
            <div className="btrack">
              <div
                className="bfill"
                style={{
                  background: getColorHex(instrument.assetClass),
                  width: animate ? `${percentWidth}%` : "0%",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
