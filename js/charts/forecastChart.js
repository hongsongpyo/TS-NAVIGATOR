/* =========================================================
   TS Navigator - forecastChart.js
   ---------------------------------------------------------
   역할
   1. 예측 결과 시각화
   2. 실제값 + 예측값 + 검증 구간 + 예측 구간 표시
   3. Forecast Track / Validation Track / Auto Analysis Track 지원
   4. 예측 신뢰구간 형태의 forecast band 표시
   5. MAE, RMSE, MAPE 등 주요 성능 결과 badge 표시
========================================================= */

/* =========================================================
   1. 기본 설정
========================================================= */

const TSForecastChartConfig = {
  showLegend: true,
  showBadge: true,
  showXLabels: false,
  showPoints: false,
  showForecastBand: true,
  showValidationSplit: true,
  actualColor: "#8d8d8d",
  fittedColor: "#76a878",
  forecastColor: "#9b8db7",
  validationColor: "#b49a72"
};

/* =========================================================
   2. Region용 Forecast Chart
========================================================= */

function createForecastChartForRegion(regionId, options = {}) {
  const tracks = getTracksForRegion(regionId);
  const forecastTrack = findForecastTrack(tracks);

  if (!forecastTrack) {
    return createEmptyForecastChartHTML();
  }

  return createForecastChartFromTrack(forecastTrack, tracks, options);
}

function createForecastChartFromTrack(forecastTrack, allTracks = [], options = {}) {
  const config = {
    ...TSForecastChartConfig,
    ...options
  };

  if (!forecastTrack) {
    return createEmptyForecastChartHTML();
  }

  const seriesList = createForecastSeriesList(forecastTrack, allTracks, config);

  if (seriesList.length === 0) {
    return createEmptyForecastChartHTML();
  }

  const bounds = window.TSChartCore
    ? window.TSChartCore.calculateBounds(seriesList, { includeZero: false })
    : null;

  const context = window.TSChartCore
    ? window.TSChartCore.createChartContext(config.chartConfig || {}, bounds)
    : null;

  const chartHTML = window.TSChartCore && context
    ? createForecastSVG(seriesList, context, forecastTrack, config)
    : createFallbackForecastChart();

  const badgeHTML = config.showBadge
    ? createForecastBadgeHTML(forecastTrack)
    : "";

  const legendHTML = config.showLegend && window.TSChartCore
    ? window.TSChartCore.createLegend(seriesList)
    : "";

  return `
    ${badgeHTML}
    <div class="ts-chart-layer forecast-chart" data-chart-type="forecast">
      ${legendHTML}
      ${chartHTML}
    </div>
  `;
}

/* =========================================================
   3. Forecast Series 구성
========================================================= */

function createForecastSeriesList(forecastTrack, allTracks = [], config = {}) {
  const baseTrack = findBaseActualTrack(forecastTrack, allTracks);
  const actualSeries = baseTrack
    ? createActualSeries(baseTrack, config)
    : createActualSeries(forecastTrack, config);

  const fittedSeries = createFittedSeries(forecastTrack, config);
  const forecastSeries = createForecastSeries(forecastTrack, config);
  const validationSeries = createValidationSeries(forecastTrack, config);

  return [
    actualSeries,
    fittedSeries,
    validationSeries,
    forecastSeries
  ].filter(series => series && series.points && series.points.length > 0);
}

function createActualSeries(track, config = {}) {
  const rows = track.data || [];
  const datetimeColumn = getDatetimeColumn(track);
  const targetColumn = getTargetColumn(track);

  const points = rows
    .map((row, index) => {
      const date = parseDate(row, datetimeColumn);
      const value = parseValue(row, targetColumn);

      return {
        x: date ? date.getTime() : index,
        y: value,
        rowIndex: index,
        raw: row
      };
    })
    .filter(point => Number.isFinite(point.y));

  return {
    id: `${track.id}_actual`,
    name: "Actual",
    type: "actual",
    color: config.actualColor,
    dashed: false,
    points
  };
}

function createFittedSeries(track, config = {}) {
  const fittedValues =
    track.result?.fitted ||
    track.result?.trainPredicted ||
    track.metadata?.fitted ||
    [];

  if (!Array.isArray(fittedValues) || fittedValues.length === 0) {
    return null;
  }

  const baseRows = track.data || [];
  const datetimeColumn = getDatetimeColumn(track);

  const points = fittedValues
    .map((value, index) => {
      const row = baseRows[index];
      const date = row ? parseDate(row, datetimeColumn) : null;

      return {
        x: date ? date.getTime() : index,
        y: toNumber(value),
        rowIndex: index
      };
    })
    .filter(point => Number.isFinite(point.y));

  return {
    id: `${track.id}_fitted`,
    name: "Fitted",
    type: "fitted",
    color: config.fittedColor,
    dashed: true,
    points
  };
}

function createValidationSeries(track, config = {}) {
  const validationValues =
    track.result?.validationPredicted ||
    track.result?.testPredicted ||
    track.metadata?.validationPredicted ||
    [];

  if (!Array.isArray(validationValues) || validationValues.length === 0) {
    return null;
  }

  const baseRows = track.data || [];
  const datetimeColumn = getDatetimeColumn(track);
  const splitIndex =
    track.result?.splitIndex ||
    track.metadata?.splitIndex ||
    Math.max(0, baseRows.length - validationValues.length);

  const points = validationValues
    .map((value, index) => {
      const rowIndex = splitIndex + index;
      const row = baseRows[rowIndex];
      const date = row ? parseDate(row, datetimeColumn) : null;

      return {
        x: date ? date.getTime() : rowIndex,
        y: toNumber(value),
        rowIndex
      };
    })
    .filter(point => Number.isFinite(point.y));

  return {
    id: `${track.id}_validation`,
    name: "Validation",
    type: "validation",
    color: config.validationColor,
    dashed: true,
    points
  };
}

function createForecastSeries(track, config = {}) {
  const forecastValues =
    track.result?.forecast ||
    track.result?.predicted ||
    track.metadata?.forecast ||
    [];

  if (!Array.isArray(forecastValues) || forecastValues.length === 0) {
    return null;
  }

  const rows = track.data || [];
  const datetimeColumn = getDatetimeColumn(track);
  const frequencyCode = getFrequencyCode(track);

  const lastDate = getLastValidDate(rows, datetimeColumn);
  const startDate = lastDate && window.TSDateUtils
    ? window.TSDateUtils.addFrequency(lastDate, frequencyCode, 1)
    : null;

  const forecastDates = startDate && window.TSDateUtils
    ? window.TSDateUtils.createDateRangeByPeriods(
        startDate,
        forecastValues.length,
        frequencyCode
      )
    : [];

  const points = forecastValues
    .map((value, index) => ({
      x: forecastDates[index] ? forecastDates[index].getTime() : rows.length + index,
      y: toNumber(value),
      rowIndex: rows.length + index,
      forecastIndex: index
    }))
    .filter(point => Number.isFinite(point.y));

  return {
    id: `${track.id}_forecast`,
    name: "Forecast",
    type: "forecast",
    color: config.forecastColor,
    dashed: true,
    points
  };
}

/* =========================================================
   4. SVG 생성
========================================================= */

function createForecastSVG(seriesList, context, forecastTrack, config) {
  const forecastSeries = seriesList.find(series => series.type === "forecast");
  const validationSeries = seriesList.find(series => series.type === "validation");

  const forecastBand = config.showForecastBand && forecastSeries
    ? createForecastBand(forecastSeries, context, forecastTrack)
    : "";

  const validationSplit = config.showValidationSplit && validationSeries
    ? createValidationSplitLine(validationSeries, context)
    : "";

  const content = `
    ${window.TSChartCore.createGrid(context)}
    ${window.TSChartCore.createAxisFrame(context)}
    ${window.TSChartCore.createYAxisLabels(context, 0)}
    ${config.showXLabels ? window.TSChartCore.createXAxisLabels(context) : ""}
    ${forecastBand}
    ${validationSplit}
    ${seriesList.map(series => window.TSChartCore.createPolyline(series, context, {
      dashed: series.dashed,
      strokeWidth: series.type === "actual" ? 2.4 : 2.1
    })).join("")}
    ${config.showPoints ? seriesList.map(series => window.TSChartCore.createPoints(series, context)).join("") : ""}
  `;

  return window.TSChartCore.createSVG(content, config.chartConfig || {});
}

function createForecastBand(forecastSeries, context, track) {
  if (!forecastSeries || forecastSeries.points.length === 0) return "";

  const startX = forecastSeries.points[0].x;
  const band = window.TSChartCore.createForecastBand(startX, context);

  const interval = createPredictionIntervalSVG(forecastSeries, context, track);

  return `
    ${band}
    ${interval}
  `;
}

function createPredictionIntervalSVG(forecastSeries, context, track) {
  const lower =
    track.result?.lower ||
    track.result?.predictionLower ||
    track.metadata?.predictionLower ||
    null;

  const upper =
    track.result?.upper ||
    track.result?.predictionUpper ||
    track.metadata?.predictionUpper ||
    null;

  if (!Array.isArray(lower) || !Array.isArray(upper)) {
    return "";
  }

  if (lower.length === 0 || upper.length === 0) return "";

  const areaPointsUpper = [];
  const areaPointsLower = [];

  forecastSeries.points.forEach((point, index) => {
    const lowerValue = toNumber(lower[index]);
    const upperValue = toNumber(upper[index]);

    if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) return;

    areaPointsUpper.push(`${window.TSChartCore.scaleX(point.x, context)},${window.TSChartCore.scaleY(upperValue, context)}`);
    areaPointsLower.unshift(`${window.TSChartCore.scaleX(point.x, context)},${window.TSChartCore.scaleY(lowerValue, context)}`);
  });

  if (areaPointsUpper.length === 0 || areaPointsLower.length === 0) return "";

  return `
    <polygon
      class="prediction-interval"
      points="${[...areaPointsUpper, ...areaPointsLower].join(" ")}"
    ></polygon>
  `;
}

function createValidationSplitLine(validationSeries, context) {
  if (!validationSeries || validationSeries.points.length === 0) return "";

  const firstX = validationSeries.points[0].x;
  const x = window.TSChartCore.scaleX(firstX, context);

  return `
    <line
      class="validation-split-line"
      x1="${x}"
      y1="${context.plot.y}"
      x2="${x}"
      y2="${context.plot.y + context.plot.height}"
    ></line>
    <text
      class="axis-label"
      x="${x + 6}"
      y="${context.plot.y + 12}"
    >validation</text>
  `;
}

/* =========================================================
   5. Badge
========================================================= */

function createForecastBadgeHTML(track) {
  const model =
    track.result?.model ||
    track.metadata?.model ||
    track.metadata?.lastParams?.model ||
    "Forecast";

  const horizon =
    track.result?.horizon ||
    track.metadata?.horizon ||
    track.metadata?.lastParams?.horizon ||
    track.result?.forecast?.length ||
    "-";

  const metrics = track.metrics || track.result?.metrics || {};
  const metricText = createMetricText(metrics);

  return `
    <div class="result-badge">
      <strong>Forecast</strong><br />
      Model: ${escapeHTML(model)}<br />
      Horizon: ${escapeHTML(horizon)}<br />
      ${metricText}
    </div>
  `;
}

function createMetricText(metrics) {
  if (!metrics || Object.keys(metrics).length === 0) {
    return "Metrics: -";
  }

  const keys = ["MAE", "RMSE", "MAPE"];

  return keys
    .filter(key => Number.isFinite(metrics[key]))
    .map(key => `${key}: ${formatNumber(metrics[key], key === "MAPE" ? 3 : 2)}`)
    .join("<br />") || "Metrics: -";
}

/* =========================================================
   6. Track 조회
========================================================= */

function getTracksForRegion(regionId) {
  const tracks = window.TSState?.tracks || [];

  return tracks.filter(track => {
    return track.regionId === regionId && track.visible !== false;
  });
}

function findForecastTrack(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const forecastTracks = tracks.filter(track => {
    return (
      track.type === "Forecast Data" ||
      track.type === "Auto Analysis Result" ||
      track.result?.forecast ||
      track.result?.predicted ||
      track.metadata?.forecast
    );
  });

  if (forecastTracks.length === 0) return null;

  return getLatestTrack(forecastTracks);
}

function findBaseActualTrack(forecastTrack, allTracks = []) {
  if (!forecastTrack) return null;

  if (forecastTrack.sourceTrackId) {
    const sourceTrack = allTracks.find(track => track.id === forecastTrack.sourceTrackId);
    if (sourceTrack) return sourceTrack;
  }

  const original = allTracks.find(track => track.type === "Original Data");
  if (original) return original;

  const preprocessed = allTracks.find(track => track.type === "Preprocessed Data");
  if (preprocessed) return preprocessed;

  return null;
}

function getLatestTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;

  return [...tracks].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();

    return timeB - timeA;
  })[0];
}

/* =========================================================
   7. Column / Date 보조
========================================================= */

function getDatetimeColumn(track) {
  return (
    track?.metadata?.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn ||
    null
  );
}

function getTargetColumn(track) {
  return (
    track?.metadata?.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    null
  );
}

function getFrequencyCode(track) {
  return (
    track?.metadata?.frequency?.code ||
    window.TSState?.dataset?.frequency?.code ||
    "D"
  );
}

function parseDate(row, datetimeColumn) {
  if (!row || !datetimeColumn) return null;

  if (window.TSDateUtils) {
    return window.TSDateUtils.parseDateValue(row[datetimeColumn]);
  }

  const date = new Date(row[datetimeColumn]);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseValue(row, targetColumn) {
  if (!row || !targetColumn) return NaN;

  return toNumber(row[targetColumn]);
}

function toNumber(value) {
  if (window.TSMathUtils) {
    return window.TSMathUtils.toNumber(value);
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function getLastValidDate(rows, datetimeColumn) {
  if (!Array.isArray(rows) || !datetimeColumn) return null;

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const date = parseDate(rows[i], datetimeColumn);
    if (date) return date;
  }

  return null;
}

/* =========================================================
   8. Empty / Fallback
========================================================= */

function createEmptyForecastChartHTML() {
  return `
    <div class="empty-chart">
      <div class="empty-chart-title">No Forecast Result</div>
      <div class="empty-chart-sub">
        Forecast 또는 Auto Analysis를 실행하면 예측 그래프가 표시됩니다.
      </div>
    </div>
  `;
}

function createFallbackForecastChart() {
  return `
    <div class="empty-chart">
      ChartCore가 로드되지 않았습니다.
    </div>
  `;
}

/* =========================================================
   9. 스타일 주입
========================================================= */

function injectForecastChartStyle() {
  if (document.getElementById("ts-forecast-chart-style")) return;

  const style = document.createElement("style");
  style.id = "ts-forecast-chart-style";
  style.textContent = `
    .forecast-chart {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .prediction-interval {
      fill: rgba(155,141,183,.18);
      stroke: none;
    }

    .validation-split-line {
      stroke: rgba(255,255,255,.32);
      stroke-width: 1.2;
      stroke-dasharray: 5 5;
      vector-effect: non-scaling-stroke;
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   10. 유틸
========================================================= */

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toFixed(digits);
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
   11. 외부 접근용 객체
========================================================= */

window.TSForecastChart = {
  config: TSForecastChartConfig,

  createForecastChartForRegion,
  createForecastChartFromTrack,
  createForecastSeriesList,

  createActualSeries,
  createFittedSeries,
  createValidationSeries,
  createForecastSeries,

  createForecastSVG,
  createForecastBadgeHTML,

  findForecastTrack,
  findBaseActualTrack,

  injectForecastChartStyle
};

/* =========================================================
   12. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  injectForecastChartStyle();
});