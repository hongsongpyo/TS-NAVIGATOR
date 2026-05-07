/* =========================================================
   TS Navigator - metricChart.js
   ---------------------------------------------------------
   역할
   1. MAE, MSE, RMSE, MAPE, SMAPE, MASE, RSFE, TS 시각화
   2. 단일 Track의 평가 결과 표시
   3. 여러 Forecast Track 간 성능 비교 표시
   4. Metric table + bar chart 동시 제공
   5. Validation / Compare / Auto Analysis 결과와 연결
========================================================= */

/* =========================================================
   1. 기본 설정
========================================================= */

const TSMetricChartConfig = {
  metricOrder: ["MAE", "MSE", "RMSE", "MAPE", "SMAPE", "MASE", "RSFE", "TS"],
  primaryMetrics: ["MAE", "RMSE", "MAPE"],
  showBadge: true,
  showTable: true,
  showBars: true,
  maxBars: 8,
  compareMetric: "RMSE"
};

/* =========================================================
   2. Region용 Metric Chart
========================================================= */

function createMetricChartForRegion(regionId, options = {}) {
  const tracks = getTracksForRegion(regionId);
  const metricTracks = getMetricTracks(tracks);

  if (metricTracks.length === 0) {
    return createEmptyMetricChartHTML();
  }

  if (metricTracks.length === 1) {
    return createMetricChartFromTrack(metricTracks[0], options);
  }

  return createMetricCompareChart(metricTracks, options);
}

/* =========================================================
   3. 단일 Track Metric Chart
========================================================= */

function createMetricChartFromTrack(track, options = {}) {
  const config = {
    ...TSMetricChartConfig,
    ...options
  };

  const metrics = extractMetrics(track);

  if (!metrics || Object.keys(metrics).length === 0) {
    return createEmptyMetricChartHTML();
  }

  const metricItems = createMetricItems(metrics, config);

  const badgeHTML = config.showBadge
    ? createMetricBadgeHTML(track, metricItems)
    : "";

  const barHTML = config.showBars
    ? createMetricBarChartHTML(metricItems, config)
    : "";

  const tableHTML = config.showTable
    ? createMetricTableHTML(metricItems)
    : "";

  return `
    ${badgeHTML}
    <div class="metric-chart-layout" data-chart-type="metrics">
      <div class="metric-chart-main">
        ${barHTML}
      </div>
      ${tableHTML}
    </div>
  `;
}

function createMetricItems(metrics, config = TSMetricChartConfig) {
  return config.metricOrder
    .filter(metricName => Number.isFinite(metrics[metricName]))
    .map(metricName => ({
      name: metricName,
      value: metrics[metricName],
      label: metricName,
      description: getMetricDescription(metricName),
      better: getMetricDirection(metricName)
    }));
}

/* =========================================================
   4. Bar Chart
========================================================= */

function createMetricBarChartHTML(metricItems, config = {}) {
  const items = metricItems.slice(0, config.maxBars || 8);

  if (items.length === 0) {
    return createEmptyMetricChartHTML();
  }

  if (window.TSChartCore) {
    return window.TSChartCore.createBarChart(
      items.map((item, index) => ({
        name: item.name,
        label: item.label,
        value: normalizeMetricValueForChart(item),
        rawValue: item.value,
        color: getMetricColor(item.name, index)
      })),
      {
        yDigits: 2,
        digits: 2,
        barWidth: 44,
        gap: 26,
        config: {
          height: 210,
          margin: {
            top: 22,
            right: 16,
            bottom: 34,
            left: 42
          }
        }
      }
    );
  }

  return createMetricBarFallbackHTML(items);
}

function normalizeMetricValueForChart(item) {
  if (!Number.isFinite(item.value)) return 0;

  if (item.name === "MAPE" || item.name === "SMAPE") {
    return item.value * 100;
  }

  return Math.abs(item.value);
}

function createMetricBarFallbackHTML(items) {
  const maxValue = Math.max(...items.map(item => Math.abs(item.value))) || 1;

  return `
    <div class="metric-bars-fallback">
      ${items.map(item => {
        const width = Math.max(4, Math.abs(item.value) / maxValue * 100);

        return `
          <div class="metric-bar-row">
            <span>${escapeHTML(item.name)}</span>
            <div class="metric-bar-track">
              <div class="metric-bar-fill" style="width:${width}%"></div>
            </div>
            <strong>${formatMetricValue(item.name, item.value)}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* =========================================================
   5. Metric Table
========================================================= */

function createMetricTableHTML(metricItems) {
  return `
    <div class="metric-table">
      <div class="metric-table-head">
        <span>Metric</span>
        <span>Value</span>
        <span>Direction</span>
      </div>

      ${metricItems.map(item => `
        <div class="metric-table-row">
          <span title="${escapeHTML(item.description)}">${escapeHTML(item.name)}</span>
          <strong>${formatMetricValue(item.name, item.value)}</strong>
          <span>${escapeHTML(item.better)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

/* =========================================================
   6. Compare Chart
========================================================= */

function createMetricCompareChart(tracks, options = {}) {
  const config = {
    ...TSMetricChartConfig,
    ...options
  };

  const metricName = config.compareMetric || "RMSE";

  const compareItems = tracks
    .map((track, index) => {
      const metrics = extractMetrics(track);
      const value = metrics?.[metricName];

      return {
        track,
        name: track.name || `Track ${index + 1}`,
        label: shortText(track.name || `Track ${index + 1}`, 12),
        value,
        color: track.color || getMetricColor(metricName, index)
      };
    })
    .filter(item => Number.isFinite(item.value));

  if (compareItems.length === 0) {
    return createEmptyMetricChartHTML();
  }

  const bestItem = findBestMetricItem(compareItems, metricName);

  const chartHTML = window.TSChartCore
    ? window.TSChartCore.createBarChart(
        compareItems.map(item => ({
          name: item.label,
          label: item.label,
          value: normalizeMetricValueForChart({
            name: metricName,
            value: item.value
          }),
          color: item.color
        })),
        {
          yDigits: 2,
          digits: 2,
          barWidth: 52,
          gap: 34,
          config: {
            height: 210,
            margin: {
              top: 22,
              right: 16,
              bottom: 36,
              left: 42
            }
          }
        }
      )
    : createMetricBarFallbackHTML(compareItems);

  const tableHTML = createCompareTableHTML(compareItems, metricName, bestItem);

  return `
    <div class="result-badge">
      <strong>Metric Compare</strong><br />
      Metric: ${escapeHTML(metricName)}<br />
      Best: ${escapeHTML(bestItem?.label || "-")}<br />
      Tracks: ${compareItems.length}
    </div>

    <div class="metric-chart-layout compare" data-chart-type="metric-compare">
      <div class="metric-chart-main">
        ${chartHTML}
      </div>
      ${tableHTML}
    </div>
  `;
}

function createCompareTableHTML(items, metricName, bestItem) {
  return `
    <div class="metric-table compare-table">
      <div class="metric-table-head">
        <span>Track</span>
        <span>${escapeHTML(metricName)}</span>
        <span>Rank</span>
      </div>

      ${rankMetricItems(items, metricName).map(item => `
        <div class="metric-table-row ${bestItem && item.track.id === bestItem.track.id ? "best" : ""}">
          <span>${escapeHTML(shortText(item.name, 16))}</span>
          <strong>${formatMetricValue(metricName, item.value)}</strong>
          <span>#${item.rank}</span>
        </div>
      `).join("")}
    </div>
  `;
}

/* =========================================================
   7. Badge
========================================================= */

function createMetricBadgeHTML(track, metricItems) {
  const metrics = extractMetrics(track);
  const primaryText = TSMetricChartConfig.primaryMetrics
    .filter(metric => Number.isFinite(metrics?.[metric]))
    .map(metric => `${metric}: ${formatMetricValue(metric, metrics[metric])}`)
    .join("<br />");

  return `
    <div class="result-badge">
      <strong>Metrics</strong><br />
      Track: ${escapeHTML(shortText(track.name, 24))}<br />
      ${primaryText || "No primary metrics"}<br />
      Total: ${metricItems.length}
    </div>
  `;
}

/* =========================================================
   8. Metric 추출
========================================================= */

function extractMetrics(track) {
  if (!track) return null;

  if (track.metrics && Object.keys(track.metrics).length > 0) {
    return track.metrics;
  }

  if (track.result?.metrics && Object.keys(track.result.metrics).length > 0) {
    return track.result.metrics;
  }

  if (track.metadata?.metrics && Object.keys(track.metadata.metrics).length > 0) {
    return track.metadata.metrics;
  }

  return null;
}

function getMetricTracks(tracks) {
  return (tracks || []).filter(track => {
    return (
      track.visible !== false &&
      (
        track.type === "Evaluation Result" ||
        track.type === "Compare Result" ||
        track.type === "Auto Analysis Result" ||
        extractMetrics(track)
      )
    );
  });
}

function getTracksForRegion(regionId) {
  const tracks = window.TSState?.tracks || [];

  return tracks.filter(track => track.regionId === regionId);
}

/* =========================================================
   9. Rank / Best
========================================================= */

function findBestMetricItem(items, metricName) {
  const ranked = rankMetricItems(items, metricName);

  return ranked[0] || null;
}

function rankMetricItems(items, metricName) {
  const direction = getMetricDirection(metricName);

  const sorted = [...items].sort((a, b) => {
    if (direction === "higher is better") {
      return b.value - a.value;
    }

    return a.value - b.value;
  });

  return sorted.map((item, index) => ({
    ...item,
    rank: index + 1
  }));
}

/* =========================================================
   10. Metric 정보
========================================================= */

function getMetricDescription(metricName) {
  const descriptions = {
    MAE: "Mean Absolute Error, 실제값과 예측값 차이의 절대값 평균",
    MSE: "Mean Squared Error, 오차 제곱의 평균",
    RMSE: "Root Mean Squared Error, MSE의 제곱근",
    MAPE: "Mean Absolute Percentage Error, 백분율 기반 오차",
    SMAPE: "Symmetric MAPE, 실제값과 예측값 평균 대비 오차",
    MASE: "Mean Absolute Scaled Error, naive 예측 대비 상대 오차",
    RSFE: "Running Sum of Forecast Errors, 예측 오차 누적합",
    TS: "Tracking Signal, 예측 편향 확인 지표"
  };

  return descriptions[metricName] || "Forecast evaluation metric";
}

function getMetricDirection(metricName) {
  const lowerBetter = ["MAE", "MSE", "RMSE", "MAPE", "SMAPE", "MASE"];
  const nearZeroBetter = ["RSFE", "TS"];

  if (lowerBetter.includes(metricName)) {
    return "lower is better";
  }

  if (nearZeroBetter.includes(metricName)) {
    return "near zero";
  }

  return "higher is better";
}

function getMetricColor(metricName, index = 0) {
  const colorMap = {
    MAE: "#8d8d8d",
    MSE: "#777777",
    RMSE: "#76a878",
    MAPE: "#9b8db7",
    SMAPE: "#afa4c5",
    MASE: "#5b8fd6",
    RSFE: "#b49a72",
    TS: "#b9a17d"
  };

  return colorMap[metricName] || getDefaultColor(index);
}

/* =========================================================
   11. Empty
========================================================= */

function createEmptyMetricChartHTML() {
  return `
    <div class="empty-chart">
      <div class="empty-chart-title">No Metrics Result</div>
      <div class="empty-chart-sub">
        Metrics 또는 Auto Analysis를 실행하면 평가 결과가 표시됩니다.
      </div>
    </div>
  `;
}

/* =========================================================
   12. 스타일 주입
========================================================= */

function injectMetricChartStyle() {
  if (document.getElementById("ts-metric-chart-style")) return;

  const style = document.createElement("style");
  style.id = "ts-metric-chart-style";
  style.textContent = `
    .metric-chart-layout {
      position: absolute;
      inset: 0;
      display: grid;
      grid-template-columns: 1fr 210px;
      gap: 10px;
      padding: 12px;
      padding-top: 44px;
      min-height: 0;
    }

    .metric-chart-layout.compare {
      grid-template-columns: 1fr 230px;
    }

    .metric-chart-main {
      min-width: 0;
      min-height: 0;
      position: relative;
    }

    .metric-table {
      align-self: start;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 5px;
      background: rgba(0,0,0,.12);
      overflow: hidden;
      font-size: 9px;
      color: #d7d7d7;
    }

    .metric-table-head,
    .metric-table-row {
      display: grid;
      grid-template-columns: 1fr 72px 76px;
      align-items: center;
      min-height: 24px;
      padding: 0 7px;
      gap: 6px;
      border-bottom: 1px solid rgba(255,255,255,.055);
    }

    .compare-table .metric-table-head,
    .compare-table .metric-table-row {
      grid-template-columns: 1fr 68px 36px;
    }

    .metric-table-head {
      background: linear-gradient(#3d3d3d, #2d2d2d);
      color: #eeeeee;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .metric-table-row:last-child {
      border-bottom: none;
    }

    .metric-table-row strong {
      color: #f1f1f1;
      font-weight: 700;
    }

    .metric-table-row.best {
      background: rgba(118,168,120,.14);
    }

    .metric-bars-fallback {
      display: grid;
      gap: 8px;
      padding: 10px;
      color: #d7d7d7;
      font-size: 9px;
    }

    .metric-bar-row {
      display: grid;
      grid-template-columns: 44px 1fr 58px;
      align-items: center;
      gap: 8px;
    }

    .metric-bar-track {
      height: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      overflow: hidden;
    }

    .metric-bar-fill {
      height: 100%;
      border-radius: 999px;
      background: #8d8d8d;
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   13. 유틸
========================================================= */

function formatMetricValue(metricName, value) {
  if (!Number.isFinite(value)) return "-";

  if (metricName === "MAPE" || metricName === "SMAPE") {
    return `${(value * 100).toFixed(2)}%`;
  }

  if (metricName === "TS") {
    return value.toFixed(3);
  }

  return value.toFixed(3);
}

function getDefaultColor(index) {
  if (window.TSChartCore) {
    return window.TSChartCore.getDefaultSeriesColor(index);
  }

  const colors = ["#8d8d8d", "#76a878", "#9b8db7", "#b49a72", "#5b8fd6"];
  return colors[index % colors.length];
}

function shortText(text, maxLength = 16) {
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
   14. 외부 접근용 객체
========================================================= */

window.TSMetricChart = {
  config: TSMetricChartConfig,

  createMetricChartForRegion,
  createMetricChartFromTrack,
  createMetricCompareChart,

  createMetricItems,
  createMetricBarChartHTML,
  createMetricTableHTML,

  extractMetrics,
  getMetricTracks,

  findBestMetricItem,
  rankMetricItems,

  getMetricDescription,
  getMetricDirection,

  injectMetricChartStyle
};

/* =========================================================
   15. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  injectMetricChartStyle();
});