/* =========================================================
   TS Navigator - chartCore.js
   ---------------------------------------------------------
   역할
   1. 모든 차트가 공통으로 사용하는 SVG 기반 차트 코어
   2. 좌표 스케일링 / 축 / 그리드 / 범례 / 툴팁 생성
   3. 시계열, 예측, 잔차, 평가지표 차트의 공통 기반
   4. 외부 라이브러리 없이 GitHub Pages에서 바로 동작
========================================================= */

/* =========================================================
   1. 기본 설정
========================================================= */

const TSChartDefaultConfig = {
  width: 720,
  height: 260,

  margin: {
    top: 22,
    right: 20,
    bottom: 32,
    left: 45
  },

  grid: {
    xCount: 6,
    yCount: 4
  },

  style: {
    axisColor: "#a0a0a0",
    gridColor: "rgba(255,255,255,.075)",
    zeroLineColor: "rgba(255,255,255,.28)",
    lineWidth: 2.3,
    pointRadius: 3
  }
};

/* =========================================================
   2. 차트 데이터 정규화
========================================================= */

function normalizeSeries(seriesList) {
  if (!Array.isArray(seriesList)) return [];

  return seriesList
    .map((series, index) => {
      const points = normalizePoints(series.points || []);

      return {
        id: series.id || `series_${index + 1}`,
        name: series.name || `Series ${index + 1}`,
        type: series.type || "line",
        color: series.color || getDefaultSeriesColor(index),
        dashed: Boolean(series.dashed),
        points
      };
    })
    .filter(series => series.points.length > 0);
}

function normalizePoints(points) {
  if (!Array.isArray(points)) return [];

  return points
    .map((point, index) => {
      if (Array.isArray(point)) {
        return {
          x: toFiniteNumber(point[0], index),
          y: toFiniteNumber(point[1], NaN),
          raw: point
        };
      }

      return {
        x: toFiniteNumber(point.x, index),
        y: toFiniteNumber(point.y, NaN),
        raw: point
      };
    })
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function toFiniteNumber(value, fallback = NaN) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : fallback;
  }

  const number = window.TSMathUtils
    ? window.TSMathUtils.toNumber(value)
    : Number(value);

  return Number.isFinite(number) ? number : fallback;
}

/* =========================================================
   3. Bounds 계산
========================================================= */

function calculateBounds(seriesList, options = {}) {
  const normalizedSeries = normalizeSeries(seriesList);
  const allPoints = normalizedSeries.flatMap(series => series.points);

  if (allPoints.length === 0) {
    return createEmptyBounds(options);
  }

  const xValues = allPoints.map(point => point.x);
  const yValues = allPoints.map(point => point.y);

  let xMin = Math.min(...xValues);
  let xMax = Math.max(...xValues);
  let yMin = Math.min(...yValues);
  let yMax = Math.max(...yValues);

  if (options.includeZero) {
    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, 0);
  }

  if (Number.isFinite(options.yMin)) yMin = options.yMin;
  if (Number.isFinite(options.yMax)) yMax = options.yMax;
  if (Number.isFinite(options.xMin)) xMin = options.xMin;
  if (Number.isFinite(options.xMax)) xMax = options.xMax;

  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }

  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const xPadding = (xMax - xMin) * (options.xPadding ?? 0.02);
  const yPadding = (yMax - yMin) * (options.yPadding ?? 0.12);

  return {
    xMin: xMin - xPadding,
    xMax: xMax + xPadding,
    yMin: yMin - yPadding,
    yMax: yMax + yPadding
  };
}

function createEmptyBounds(options = {}) {
  return {
    xMin: options.xMin ?? 0,
    xMax: options.xMax ?? 1,
    yMin: options.yMin ?? 0,
    yMax: options.yMax ?? 1
  };
}

/* =========================================================
   4. ViewBox / Plot 영역
========================================================= */

function createChartContext(config = {}, bounds = {}) {
  const mergedConfig = mergeChartConfig(config);
  const margin = mergedConfig.margin;

  const plot = {
    x: margin.left,
    y: margin.top,
    width: mergedConfig.width - margin.left - margin.right,
    height: mergedConfig.height - margin.top - margin.bottom
  };

  return {
    config: mergedConfig,
    bounds,
    plot
  };
}

function mergeChartConfig(config = {}) {
  return {
    ...TSChartDefaultConfig,
    ...config,
    margin: {
      ...TSChartDefaultConfig.margin,
      ...(config.margin || {})
    },
    grid: {
      ...TSChartDefaultConfig.grid,
      ...(config.grid || {})
    },
    style: {
      ...TSChartDefaultConfig.style,
      ...(config.style || {})
    }
  };
}

/* =========================================================
   5. Scale 함수
========================================================= */

function scaleX(value, context) {
  const { bounds, plot } = context;

  if (bounds.xMax === bounds.xMin) return plot.x;

  return plot.x + ((value - bounds.xMin) / (bounds.xMax - bounds.xMin)) * plot.width;
}

function scaleY(value, context) {
  const { bounds, plot } = context;

  if (bounds.yMax === bounds.yMin) return plot.y + plot.height;

  return plot.y + (1 - ((value - bounds.yMin) / (bounds.yMax - bounds.yMin))) * plot.height;
}

function invertX(pixelX, context) {
  const { bounds, plot } = context;
  const ratio = (pixelX - plot.x) / plot.width;

  return bounds.xMin + ratio * (bounds.xMax - bounds.xMin);
}

function invertY(pixelY, context) {
  const { bounds, plot } = context;
  const ratio = 1 - ((pixelY - plot.y) / plot.height);

  return bounds.yMin + ratio * (bounds.yMax - bounds.yMin);
}

/* =========================================================
   6. SVG Wrapper
========================================================= */

function createSVG(content, config = {}) {
  const mergedConfig = mergeChartConfig(config);

  return `
    <svg
      class="ts-chart-svg"
      viewBox="0 0 ${mergedConfig.width} ${mergedConfig.height}"
      preserveAspectRatio="none"
      data-chart-width="${mergedConfig.width}"
      data-chart-height="${mergedConfig.height}"
    >
      ${content}
    </svg>
  `;
}

/* =========================================================
   7. Grid / Axis
========================================================= */

function createGrid(context) {
  const { config, plot } = context;
  const xCount = config.grid.xCount;
  const yCount = config.grid.yCount;

  const verticalLines = [];

  for (let i = 0; i <= xCount; i += 1) {
    const x = plot.x + (plot.width / xCount) * i;

    verticalLines.push(`
      <line
        x1="${x}"
        y1="${plot.y}"
        x2="${x}"
        y2="${plot.y + plot.height}"
        class="grid-line"
      ></line>
    `);
  }

  const horizontalLines = [];

  for (let i = 0; i <= yCount; i += 1) {
    const y = plot.y + (plot.height / yCount) * i;

    horizontalLines.push(`
      <line
        x1="${plot.x}"
        y1="${y}"
        x2="${plot.x + plot.width}"
        y2="${y}"
        class="grid-line"
      ></line>
    `);
  }

  return [...verticalLines, ...horizontalLines].join("");
}

function createYAxisLabels(context, digits = 0) {
  const { config, bounds, plot } = context;
  const labels = [];

  for (let i = 0; i <= config.grid.yCount; i += 1) {
    const ratio = i / config.grid.yCount;
    const value = bounds.yMax - (bounds.yMax - bounds.yMin) * ratio;
    const y = plot.y + plot.height * ratio;

    labels.push(`
      <text
        x="${plot.x - 35}"
        y="${y + 3}"
        class="axis-label"
      >
        ${formatNumber(value, digits)}
      </text>
    `);
  }

  return labels.join("");
}

function createXAxisLabels(context, formatter = null) {
  const { config, bounds, plot } = context;
  const labels = [];

  for (let i = 0; i <= config.grid.xCount; i += 1) {
    const ratio = i / config.grid.xCount;
    const value = bounds.xMin + (bounds.xMax - bounds.xMin) * ratio;
    const x = plot.x + plot.width * ratio;

    const text = formatter ? formatter(value) : formatXAxisValue(value);

    labels.push(`
      <text
        x="${x}"
        y="${plot.y + plot.height + 22}"
        text-anchor="middle"
        class="axis-label"
      >
        ${escapeHTML(text)}
      </text>
    `);
  }

  return labels.join("");
}

function createZeroLine(context) {
  const { bounds, plot } = context;

  if (bounds.yMin > 0 || bounds.yMax < 0) return "";

  const y = scaleY(0, context);

  return `
    <line
      x1="${plot.x}"
      y1="${y}"
      x2="${plot.x + plot.width}"
      y2="${y}"
      class="zero-line"
    ></line>
  `;
}

function createAxisFrame(context) {
  const { plot } = context;

  return `
    <line x1="${plot.x}" y1="${plot.y + plot.height}" x2="${plot.x + plot.width}" y2="${plot.y + plot.height}" class="axis-line"></line>
    <line x1="${plot.x}" y1="${plot.y}" x2="${plot.x}" y2="${plot.y + plot.height}" class="axis-line"></line>
  `;
}

/* =========================================================
   8. Line / Area / Point
========================================================= */

function createPolyline(series, context, options = {}) {
  if (!series || !series.points || series.points.length === 0) return "";

  const pointsText = series.points
    .map(point => `${scaleX(point.x, context)},${scaleY(point.y, context)}`)
    .join(" ");

  const dashed = options.dashed || series.dashed;
  const dashAttr = dashed ? `stroke-dasharray="7 6"` : "";

  return `
    <polyline
      class="chart-line"
      points="${pointsText}"
      fill="none"
      stroke="${escapeHTML(series.color)}"
      stroke-width="${options.strokeWidth || context.config.style.lineWidth}"
      ${dashAttr}
      opacity="${options.opacity ?? 0.92}"
      data-series-id="${escapeHTML(series.id)}"
    ></polyline>
  `;
}

function createAreaUnderLine(series, context, options = {}) {
  if (!series || !series.points || series.points.length === 0) return "";

  const first = series.points[0];
  const last = series.points[series.points.length - 1];

  const baselineY = Number.isFinite(options.baseline)
    ? scaleY(options.baseline, context)
    : context.plot.y + context.plot.height;

  const linePoints = series.points
    .map(point => `${scaleX(point.x, context)},${scaleY(point.y, context)}`)
    .join(" ");

  const areaPoints = `
    ${scaleX(first.x, context)},${baselineY}
    ${linePoints}
    ${scaleX(last.x, context)},${baselineY}
  `;

  return `
    <polygon
      class="chart-area-fill"
      points="${areaPoints}"
      fill="${escapeHTML(options.fill || series.color)}"
      opacity="${options.opacity ?? 0.12}"
    ></polygon>
  `;
}

function createPoints(series, context, options = {}) {
  if (!series || !series.points || series.points.length === 0) return "";

  const radius = options.radius || context.config.style.pointRadius;

  return series.points.map((point, index) => `
    <circle
      class="chart-point"
      cx="${scaleX(point.x, context)}"
      cy="${scaleY(point.y, context)}"
      r="${radius}"
      fill="${escapeHTML(series.color)}"
      opacity="${options.opacity ?? 0.9}"
      data-series-id="${escapeHTML(series.id)}"
      data-point-index="${index}"
      data-x="${point.x}"
      data-y="${point.y}"
    ></circle>
  `).join("");
}

function createForecastBand(startXValue, context, options = {}) {
  const startX = scaleX(startXValue, context);
  const width = context.plot.x + context.plot.width - startX;

  if (width <= 0) return "";

  return `
    <rect
      class="forecast-band"
      x="${startX}"
      y="${context.plot.y}"
      width="${width}"
      height="${context.plot.height}"
      opacity="${options.opacity ?? 1}"
    ></rect>
  `;
}

/* =========================================================
   9. Bar
========================================================= */

function createBars(items, context, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return "";

  const gap = options.gap ?? 20;
  const barWidth = options.barWidth ?? 42;
  const baseline = options.baseline ?? 0;
  const baselineY = scaleY(baseline, context);

  return items.map((item, index) => {
    const x = context.plot.x + gap + index * (barWidth + gap);
    const yValue = toFiniteNumber(item.value, 0);
    const y = scaleY(yValue, context);
    const height = Math.abs(baselineY - y);

    const rectY = yValue >= baseline ? y : baselineY;

    return `
      <rect
        class="metric-bar"
        x="${x}"
        y="${rectY}"
        width="${barWidth}"
        height="${Math.max(3, height)}"
        rx="5"
        fill="${escapeHTML(item.color || getDefaultSeriesColor(index))}"
        opacity="${options.opacity ?? 0.72}"
        data-bar-index="${index}"
      ></rect>

      <text
        x="${x + barWidth / 2}"
        y="${context.plot.y + context.plot.height + 22}"
        text-anchor="middle"
        class="axis-label"
      >
        ${escapeHTML(shortText(item.label || item.name || index, 8))}
      </text>

      <text
        x="${x + barWidth / 2}"
        y="${rectY - 8}"
        text-anchor="middle"
        class="axis-label"
      >
        ${formatNumber(yValue, options.digits ?? 2)}
      </text>
    `;
  }).join("");
}

/* =========================================================
   10. Legend / Badge
========================================================= */

function createLegend(seriesList, options = {}) {
  const normalizedSeries = normalizeSeries(seriesList);
  const maxItems = options.maxItems || 5;

  const items = normalizedSeries.slice(0, maxItems).map(series => `
    <div class="legend-item">
      <span
        class="legend-line"
        style="background:${escapeHTML(series.color)}"
      ></span>
      <span>${escapeHTML(shortText(series.name, options.textLength || 16))}</span>
    </div>
  `).join("");

  return `<div class="legend">${items}</div>`;
}

function createBadge(title, rows = []) {
  const rowHTML = rows
    .filter(row => row !== null && row !== undefined && row !== "")
    .map(row => escapeHTML(row))
    .join("<br />");

  return `
    <div class="result-badge">
      <strong>${escapeHTML(title)}</strong><br />
      ${rowHTML}
    </div>
  `;
}

/* =========================================================
   11. Tooltip
========================================================= */

function createTooltipHTML(point, seriesName = "") {
  if (!point) return "";

  return `
    <div class="chart-tooltip">
      <strong>${escapeHTML(seriesName)}</strong><br />
      x: ${escapeHTML(formatXAxisValue(point.x))}<br />
      y: ${formatNumber(point.y, 4)}
    </div>
  `;
}

function findNearestPoint(seriesList, targetX, context, maxPixelDistance = 24) {
  const normalizedSeries = normalizeSeries(seriesList);
  let nearest = null;
  let nearestDistance = Infinity;

  normalizedSeries.forEach(series => {
    series.points.forEach((point, index) => {
      const px = scaleX(point.x, context);
      const targetPx = scaleX(targetX, context);
      const distance = Math.abs(px - targetPx);

      if (distance < nearestDistance && distance <= maxPixelDistance) {
        nearestDistance = distance;
        nearest = {
          series,
          point,
          index,
          distance
        };
      }
    });
  });

  return nearest;
}

/* =========================================================
   12. 완성형 Line Chart 생성
========================================================= */

function createLineChart(seriesList, options = {}) {
  const series = normalizeSeries(seriesList);
  const bounds = calculateBounds(series, options);
  const context = createChartContext(options.config || {}, bounds);

  const content = `
    ${createGrid(context)}
    ${options.includeZero ? createZeroLine(context) : ""}
    ${createAxisFrame(context)}
    ${createYAxisLabels(context, options.yDigits ?? 0)}
    ${options.showXLabels ? createXAxisLabels(context, options.xFormatter) : ""}
    ${options.area ? series.map(item => createAreaUnderLine(item, context)).join("") : ""}
    ${series.map(item => createPolyline(item, context)).join("")}
    ${options.points ? series.map(item => createPoints(item, context)).join("") : ""}
  `;

  return `
    ${options.legend === false ? "" : createLegend(series)}
    ${createSVG(content, options.config)}
  `;
}

/* =========================================================
   13. 완성형 Bar Chart 생성
========================================================= */

function createBarChart(items, options = {}) {
  const values = items.map(item => toFiniteNumber(item.value, 0));
  const seriesForBounds = [
    {
      name: "bar",
      points: items.map((item, index) => ({
        x: index,
        y: toFiniteNumber(item.value, 0)
      }))
    }
  ];

  const bounds = calculateBounds(seriesForBounds, {
    includeZero: true,
    yMin: options.yMin,
    yMax: options.yMax
  });

  const context = createChartContext(options.config || {}, bounds);

  const content = `
    ${createGrid(context)}
    ${createZeroLine(context)}
    ${createAxisFrame(context)}
    ${createYAxisLabels(context, options.yDigits ?? 2)}
    ${createBars(items, context, options)}
  `;

  return createSVG(content, options.config);
}

/* =========================================================
   14. CSS 주입
========================================================= */

function injectChartCoreStyle() {
  if (document.getElementById("ts-chart-core-style")) return;

  const style = document.createElement("style");
  style.id = "ts-chart-core-style";
  style.textContent = `
    .ts-chart-svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .grid-line {
      stroke: rgba(255,255,255,.075);
      stroke-width: 1;
    }

    .axis-line {
      stroke: rgba(255,255,255,.15);
      stroke-width: 1;
    }

    .axis-label {
      fill: #a0a0a0;
      font-size: 9px;
    }

    .zero-line {
      stroke: rgba(255,255,255,.28);
      stroke-width: 1.2;
      stroke-dasharray: 5 5;
    }

    .chart-line {
      vector-effect: non-scaling-stroke;
    }

    .chart-point {
      cursor: pointer;
    }

    .chart-point:hover {
      r: 5;
    }

    .metric-bar {
      fill: #3f3f3f;
    }

    .forecast-band {
      fill: rgba(160,160,160,.16);
    }

    .chart-tooltip {
      position: fixed;
      z-index: 50;
      padding: 7px 8px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 5px;
      background: rgba(36,36,36,.96);
      color: #ededed;
      font-size: 9px;
      line-height: 1.45;
      pointer-events: none;
      box-shadow: 0 12px 32px rgba(0,0,0,.4);
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   15. 유틸
========================================================= */

function getDefaultSeriesColor(index) {
  const colors = [
    "#8d8d8d",
    "#76a878",
    "#9b8db7",
    "#b49a72",
    "#5b8fd6",
    "#afa4c5",
    "#b9a17d"
  ];

  return colors[index % colors.length];
}

function formatXAxisValue(value) {
  if (!Number.isFinite(value)) return "-";

  if (value > 100000000000) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      return `${month}/${day}`;
    }
  }

  return formatNumber(value, 0);
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "-";

  return Number(value).toFixed(digits);
}

function shortText(text, maxLength = 12) {
  const value = String(text ?? "");

  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength)}…`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   16. 외부 접근용 객체
========================================================= */

window.TSChartCore = {
  defaultConfig: TSChartDefaultConfig,

  normalizeSeries,
  normalizePoints,
  calculateBounds,
  createChartContext,
  mergeChartConfig,

  scaleX,
  scaleY,
  invertX,
  invertY,

  createSVG,
  createGrid,
  createYAxisLabels,
  createXAxisLabels,
  createZeroLine,
  createAxisFrame,

  createPolyline,
  createAreaUnderLine,
  createPoints,
  createForecastBand,
  createBars,

  createLegend,
  createBadge,
  createTooltipHTML,
  findNearestPoint,

  createLineChart,
  createBarChart,

  injectChartCoreStyle,
  getDefaultSeriesColor,
  formatXAxisValue,
  formatNumber
};

/* =========================================================
   17. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  injectChartCoreStyle();
});