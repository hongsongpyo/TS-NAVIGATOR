/* =========================================================
   TS Navigator - regions.js
   ---------------------------------------------------------
   역할
   1. Visualization Region UI 렌더링
   2. Region 추가 / 삭제 / 선택
   3. Region별 Track 표시
   4. 원본 / 전처리 / 예측 / 잔차 / 평가지표 간단 시각화
   5. 마지막 업데이트 Track 결과가 Region에 반영되도록 표시
========================================================= */

/* =========================================================
   1. DOM 참조
========================================================= */

let visualRoot = null;
let visualHeader = null;
let regionsRoot = null;

/* =========================================================
   2. 초기화
========================================================= */

function initRegions() {
  visualRoot = document.querySelector(".visualization-panel");
  visualHeader = document.querySelector(".visualization-header");
  regionsRoot = document.getElementById("visualizationRegionGrid");

  if (!regionsRoot) {
    console.warn("Visualization Region 영역을 찾지 못했습니다.");
    return;
  }

  renderRegions();
  bindRegionEvents();
}

function bindRegionEvents() {
  if (visualRoot) {
    visualRoot.addEventListener("click", handleRegionClick);
    visualRoot.addEventListener("change", handleRegionChange);
  }
}

/* =========================================================
   3. Region 렌더링
========================================================= */

function renderRegions() {
  visualRoot = document.querySelector(".visualization-panel");
  visualHeader = document.querySelector(".visualization-header");
  regionsRoot = document.getElementById("visualizationRegionGrid");

  if (!regionsRoot || !window.TSState) return;

  renderVisualHeader();

  const regions = window.TSState.regions || [];

  regionsRoot.innerHTML = regions.length > 0
    ? regions.map(region => createRegionHTML(region)).join("")
    : createEmptyRegionsHTML();

  applyRegionGridLayout(regions.length);
}

function renderVisualHeader() {
  if (!visualHeader) return;

  const selectedTrack = window.TSStore?.getSelectedTrack();
  const label = selectedTrack
    ? `Visualization Region · ${escapeHTML(selectedTrack.name)}`
    : "Visualization Region · Last Track Update";

  visualHeader.innerHTML = `
    <span>${label}</span>
    <button class="add-region" data-action="add-region">+ ˅</button>
  `;
}

/* =========================================================
   4. Region HTML
========================================================= */

function createRegionHTML(region) {
  const selectedClass = region.id === window.TSState.selectedRegionId ? "selected" : "";
  const tracks = getVisibleTracksByRegion(region.id);
  const latestTrack = getLatestTrackInRegion(region.id);

  return `
    <article
      class="region ${selectedClass}"
      data-action="select-region"
      data-region-id="${region.id}"
    >
      <div class="region-bar">
        <div class="region-name">
          <span class="region-dot"></span>
          <span>${escapeHTML(createRegionTitle(region, latestTrack))}</span>
        </div>

        <div class="region-tools">
          <span
            data-action="focus-region"
            data-region-id="${region.id}"
            title="Focus Region"
          >⤢</span>
          <span
            data-action="region-setting"
            data-region-id="${region.id}"
            title="Region Setting"
          >⚙</span>
          <span
            data-action="delete-region"
            data-region-id="${region.id}"
            title="Delete Region"
          >×</span>
        </div>
      </div>

      <div class="chart-area">
        ${createRegionContentHTML(region, tracks)}
      </div>
    </article>
  `;
}

function createEmptyRegionsHTML() {
  return `
    <article class="region empty">
      <div class="region-bar">
        <div class="region-name">
          <span class="region-dot"></span>
          <span>No Region</span>
        </div>
      </div>
      <div class="chart-area empty-chart">
        Region이 없습니다. + 버튼으로 Region을 추가하세요.
      </div>
    </article>
  `;
}

function createRegionTitle(region, latestTrack) {
  if (!latestTrack) {
    return `${region.name} · Empty`;
  }

  return `${region.name} · ${latestTrack.name || latestTrack.type}`;
}

/* =========================================================
   5. Region Content
========================================================= */

function createRegionContentHTML(region, tracks) {
  if (!tracks || tracks.length === 0) {
    return createEmptyChartHTML();
  }

  const latestTrack = getLatestTrack(tracks);

  if (latestTrack.metrics || latestTrack.type === "Evaluation Result") {
    return createMetricChartHTML(latestTrack);
  }

  if (latestTrack.residuals || latestTrack.type === "Residual Data") {
    return createResidualChartHTML(latestTrack);
  }

  if (latestTrack.type === "Compare Result") {
    return createCompareChartHTML(tracks);
  }

  if (latestTrack.type === "Forecast Data" || hasForecastResult(latestTrack)) {
    return createForecastChartHTML(tracks, latestTrack);
  }

  return createTimeSeriesChartHTML(tracks);
}

function createEmptyChartHTML() {
  return `
    <div class="empty-chart">
      <div class="empty-chart-title">No Track Assigned</div>
      <div class="empty-chart-sub">
        Track Timeline에서 Region을 선택하면 그래프가 표시됩니다.
      </div>
    </div>
  `;
}

/* =========================================================
   6. Time Series Chart
========================================================= */

function createTimeSeriesChartHTML(tracks) {
  const chartSeries = tracks
    .filter(track => track.visible)
    .map(track => createChartSeriesFromTrack(track))
    .filter(series => series.points.length > 0);

  if (chartSeries.length === 0) {
    return createEmptyChartHTML();
  }

  const bounds = calculateChartBounds(chartSeries);
  const svgSeries = chartSeries
    .map(series => createPolylineSVG(series, bounds))
    .join("");

  return `
    ${createResultBadgeHTML(tracks)}
    ${createLegendHTML(chartSeries)}

    <svg viewBox="0 0 720 260" preserveAspectRatio="none">
      ${createGridSVG()}
      ${createAxisLabelsSVG(bounds)}
      ${svgSeries}
    </svg>
  `;
}

function createForecastChartHTML(tracks, latestTrack) {
  const normalTracks = tracks
    .filter(track => track.visible && track.id !== latestTrack.id)
    .map(track => createChartSeriesFromTrack(track, "actual"))
    .filter(series => series.points.length > 0);

  const forecastSeries = createForecastSeriesFromTrack(latestTrack);

  const chartSeries = [
    ...normalTracks,
    forecastSeries
  ].filter(series => series && series.points.length > 0);

  if (chartSeries.length === 0) {
    return createEmptyChartHTML();
  }

  const bounds = calculateChartBounds(chartSeries);

  return `
    ${createResultBadgeHTML([latestTrack])}
    ${createLegendHTML(chartSeries)}

    <svg viewBox="0 0 720 260" preserveAspectRatio="none">
      ${createGridSVG()}
      ${createAxisLabelsSVG(bounds)}
      ${createForecastBandSVG(forecastSeries, bounds)}
      ${normalTracks.map(series => createPolylineSVG(series, bounds)).join("")}
      ${forecastSeries ? createPolylineSVG(forecastSeries, bounds, true) : ""}
    </svg>
  `;
}

function createResidualChartHTML(track) {
  const residualValues = Array.isArray(track.residuals)
    ? track.residuals
    : track.result?.residuals || [];

  const points = residualValues
    .map((value, index) => ({
      x: index,
      y: window.TSMathUtils ? window.TSMathUtils.toNumber(value) : Number(value)
    }))
    .filter(point => Number.isFinite(point.y));

  if (points.length === 0) {
    return createEmptyChartHTML();
  }

  const series = {
    name: "Residual",
    type: "residual",
    color: track.color || "#b49a72",
    points
  };

  const bounds = calculateChartBounds([series], true);

  return `
    ${createResultBadgeHTML([track])}
    ${createLegendHTML([series])}

    <svg viewBox="0 0 720 260" preserveAspectRatio="none">
      ${createGridSVG()}
      ${createZeroLineSVG(bounds)}
      ${createAxisLabelsSVG(bounds)}
      ${createPolylineSVG(series, bounds)}
    </svg>
  `;
}

function createMetricChartHTML(track) {
  const metrics = track.metrics || track.result?.metrics || {};

  const entries = Object.entries(metrics)
    .filter(([, value]) => Number.isFinite(value))
    .slice(0, 8);

  if (entries.length === 0) {
    return createEmptyChartHTML();
  }

  const maxValue = Math.max(...entries.map(([, value]) => Math.abs(value))) || 1;

  const bars = entries.map(([key, value], index) => {
    const x = 70 + index * 75;
    const barHeight = Math.max(4, Math.abs(value) / maxValue * 150);
    const y = 210 - barHeight;

    return `
      <rect x="${x}" y="${y}" width="42" height="${barHeight}" rx="5" class="metric-bar"></rect>
      <text x="${x + 21}" y="232" text-anchor="middle" class="axis-label">${escapeHTML(key)}</text>
      <text x="${x + 21}" y="${y - 8}" text-anchor="middle" class="axis-label">${formatNumber(value, 2)}</text>
    `;
  }).join("");

  return `
    ${createResultBadgeHTML([track])}

    <svg viewBox="0 0 720 260" preserveAspectRatio="none">
      ${createGridSVG()}
      ${bars}
    </svg>
  `;
}

function createCompareChartHTML(tracks) {
  const compareTracks = tracks.filter(track => track.metrics || track.result?.metrics);

  if (compareTracks.length === 0) {
    return createTimeSeriesChartHTML(tracks);
  }

  const metricName = "RMSE";

  const entries = compareTracks
    .map(track => ({
      name: track.name,
      value: track.metrics?.[metricName] || track.result?.metrics?.[metricName],
      color: track.color || "#8d8d8d"
    }))
    .filter(item => Number.isFinite(item.value));

  if (entries.length === 0) {
    return createTimeSeriesChartHTML(tracks);
  }

  const maxValue = Math.max(...entries.map(item => item.value)) || 1;

  const bars = entries.map((item, index) => {
    const x = 90 + index * 110;
    const barHeight = Math.max(4, item.value / maxValue * 150);
    const y = 210 - barHeight;

    return `
      <rect x="${x}" y="${y}" width="56" height="${barHeight}" rx="5" fill="${escapeHTML(item.color)}" opacity="0.72"></rect>
      <text x="${x + 28}" y="232" text-anchor="middle" class="axis-label">${escapeHTML(shortText(item.name, 8))}</text>
      <text x="${x + 28}" y="${y - 8}" text-anchor="middle" class="axis-label">${formatNumber(item.value, 2)}</text>
    `;
  }).join("");

  return `
    <div class="result-badge">
      <strong>Compare</strong><br />
      Metric: ${metricName}
    </div>

    <svg viewBox="0 0 720 260" preserveAspectRatio="none">
      ${createGridSVG()}
      ${bars}
    </svg>
  `;
}

/* =========================================================
   7. Chart Series 생성
========================================================= */

function createChartSeriesFromTrack(track, label = null) {
  const datetimeColumn =
    track.metadata?.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn;

  const targetColumn =
    track.metadata?.targetColumn ||
    window.TSState?.dataset?.targetColumn;

  const rows = track.data || [];

  const points = rows
    .map((row, index) => {
      const date = datetimeColumn && window.TSDateUtils
        ? window.TSDateUtils.parseDateValue(row[datetimeColumn])
        : null;

      const value = targetColumn && window.TSMathUtils
        ? window.TSMathUtils.toNumber(row[targetColumn])
        : Number(row[targetColumn]);

      return {
        x: date ? date.getTime() : index,
        y: value
      };
    })
    .filter(point => Number.isFinite(point.y));

  return {
    name: label || track.name || track.type,
    type: track.type,
    color: track.color || "#8d8d8d",
    points
  };
}

function createForecastSeriesFromTrack(track) {
  const forecastValues =
    track.result?.forecast ||
    track.result?.predicted ||
    track.metadata?.forecast ||
    [];

  const baseRows = track.data || [];
  const datetimeColumn =
    track.metadata?.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn;

  const frequencyCode =
    track.metadata?.frequency?.code ||
    window.TSState?.dataset?.frequency?.code ||
    "D";

  if (!Array.isArray(forecastValues) || forecastValues.length === 0) {
    return createChartSeriesFromTrack(track, "Forecast");
  }

  const lastDate = getLastValidDate(baseRows, datetimeColumn);
  const forecastDates = lastDate && window.TSDateUtils
    ? window.TSDateUtils.createDateRangeByPeriods(
        window.TSDateUtils.addFrequency(lastDate, frequencyCode, 1),
        forecastValues.length,
        frequencyCode
      )
    : [];

  const points = forecastValues
    .map((value, index) => ({
      x: forecastDates[index] ? forecastDates[index].getTime() : baseRows.length + index,
      y: window.TSMathUtils ? window.TSMathUtils.toNumber(value) : Number(value)
    }))
    .filter(point => Number.isFinite(point.y));

  return {
    name: "Forecast",
    type: "Forecast Data",
    color: track.color || "#9b8db7",
    points
  };
}

/* =========================================================
   8. SVG 생성
========================================================= */

function calculateChartBounds(seriesList, includeZero = false) {
  const allPoints = seriesList.flatMap(series => series.points);

  const xValues = allPoints.map(point => point.x);
  const yValues = allPoints.map(point => point.y);

  let xMin = Math.min(...xValues);
  let xMax = Math.max(...xValues);
  let yMin = Math.min(...yValues);
  let yMax = Math.max(...yValues);

  if (includeZero) {
    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, 0);
  }

  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }

  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const yPadding = (yMax - yMin) * 0.12;

  return {
    xMin,
    xMax,
    yMin: yMin - yPadding,
    yMax: yMax + yPadding,
    width: 720,
    height: 260,
    left: 45,
    right: 20,
    top: 22,
    bottom: 32
  };
}

function regionScaleX(x, bounds) {
  const usableWidth = bounds.width - bounds.left - bounds.right;
  return bounds.left + ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * usableWidth;
}

function regionScaleY(y, bounds) {
  const usableHeight = bounds.height - bounds.top - bounds.bottom;
  return bounds.top + (1 - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin))) * usableHeight;
}

function createPolylineSVG(series, bounds, dashed = false) {
  const pointsText = series.points
    .map(point => `${regionScaleX(point.x, bounds)},${regionScaleY(point.y, bounds)}`)
    .join(" ");

  const dash = dashed ? `stroke-dasharray="7 6"` : "";

  return `
    <polyline
      points="${pointsText}"
      fill="none"
      stroke="${escapeHTML(series.color)}"
      stroke-width="2.3"
      ${dash}
      opacity="0.92"
    ></polyline>
  `;
}

function createGridSVG() {
  const horizontal = [55, 105, 155, 205]
    .map(y => `<line x1="45" y1="${y}" x2="700" y2="${y}" class="grid-line"></line>`)
    .join("");

  const vertical = [120, 220, 320, 420, 520, 620]
    .map(x => `<line x1="${x}" y1="22" x2="${x}" y2="228" class="grid-line"></line>`)
    .join("");

  return `${horizontal}${vertical}`;
}

function createAxisLabelsSVG(bounds) {
  const labels = [];

  for (let i = 0; i <= 4; i += 1) {
    const ratio = i / 4;
    const value = bounds.yMax - (bounds.yMax - bounds.yMin) * ratio;
    const y = bounds.top + (bounds.height - bounds.top - bounds.bottom) * ratio;

    labels.push(`
      <text x="10" y="${y + 3}" class="axis-label">
        ${formatNumber(value, 0)}
      </text>
    `);
  }

  return labels.join("");
}

function createZeroLineSVG(bounds) {
  if (bounds.yMin > 0 || bounds.yMax < 0) return "";

  const y = regionScaleY(0, bounds);

  return `
    <line
      x1="${bounds.left}"
      y1="${y}"
      x2="${bounds.width - bounds.right}"
      y2="${y}"
      class="zero-line"
    ></line>
  `;
}

function createForecastBandSVG(series, bounds) {
  if (!series || !series.points || series.points.length === 0) return "";

  const startX = regionScaleX(series.points[0].x, bounds);
  const width = bounds.width - bounds.right - startX;

  return `
    <rect
      x="${startX}"
      y="${bounds.top}"
      width="${width}"
      height="${bounds.height - bounds.top - bounds.bottom}"
      class="forecast-band"
    ></rect>
  `;
}

/* =========================================================
   9. Legend / Badge
========================================================= */

function createLegendHTML(seriesList) {
  const items = seriesList.slice(0, 5).map(series => {
    return `
      <div class="legend-item">
        <span class="legend-line" style="background:${escapeHTML(series.color)}"></span>
        <span>${escapeHTML(shortText(series.name, 16))}</span>
      </div>
    `;
  }).join("");

  return `<div class="legend">${items}</div>`;
}

function createResultBadgeHTML(tracks) {
  const latestTrack = getLatestTrack(tracks);

  if (!latestTrack) return "";

  const resultType = latestTrack.result?.type || latestTrack.type || "Track";
  const stackCount = latestTrack.analysisStack?.length || 0;
  const updated = formatTime(latestTrack.updatedAt);

  return `
    <div class="result-badge">
      <strong>${escapeHTML(resultType)}</strong><br />
      Track: ${escapeHTML(shortText(latestTrack.name, 24))}<br />
      Stack: ${stackCount} steps<br />
      Updated: ${updated}
    </div>
  `;
}

/* =========================================================
   10. Region 이벤트 처리
========================================================= */

function handleRegionClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const regionId = target.dataset.regionId;

  if (action === "add-region") {
    addRegionFromUI();
    return;
  }

  if (action === "select-region") {
    selectRegion(regionId);
    return;
  }

  if (action === "delete-region") {
    event.stopPropagation();
    deleteRegionFromUI(regionId);
    return;
  }

  if (action === "focus-region") {
    event.stopPropagation();
    focusRegion(regionId);
    return;
  }

  if (action === "region-setting") {
    event.stopPropagation();
    openRegionSetting(regionId);
  }
}

function handleRegionChange(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (!action) return;
}

/* =========================================================
   11. Region Action
========================================================= */

function addRegionFromUI() {
  if (!window.TSStore) return;

  window.TSStore.addRegion("time-series");
  refreshWorkspace("ADD_REGION");
}

function selectRegion(regionId) {
  if (!window.TSState) return;

  window.TSState.selectedRegionId = regionId;

  refreshWorkspace("SELECT_REGION");
}

function deleteRegionFromUI(regionId) {
  if (!window.TSStore) return;

  if ((window.TSState.regions || []).length <= 1) {
    return;
  }

  window.TSStore.removeRegion(regionId);
  refreshWorkspace("DELETE_REGION");
}

function focusRegion(regionId) {
  const regionElements = document.querySelectorAll(".region");

  regionElements.forEach(element => {
    const isTarget = element.dataset.regionId === regionId;
    element.classList.toggle("focused", isTarget);
    element.classList.toggle("dimmed", !isTarget);
  });
}

function openRegionSetting(regionId) {
  if (!window.TSStore) return;

  const region = window.TSStore.getRegion(regionId);
  if (!region) return;

  window.TSState.selectedRegionId = regionId;

  if (window.TSStore.openAnalysisPopup) {
    window.TSStore.openAnalysisPopup({
      mode: "region-setting",
      trackId: window.TSState.selectedTrackId,
      stackId: null,
      analysisType: "Region Setting",
      x: window.innerWidth - 360,
      y: 78
    });
  }

  if (window.TSPopupUI) {
    window.TSPopupUI.renderPopup();
  }
}

/* =========================================================
   12. Region Grid Layout
========================================================= */

function applyRegionGridLayout(regionCount) {
  if (!regionsRoot) return;

  if (regionCount <= 1) {
    regionsRoot.style.gridTemplateRows = "1fr";
    regionsRoot.style.gridTemplateColumns = "1fr";
    return;
  }

  if (regionCount === 2) {
    regionsRoot.style.gridTemplateRows = "1fr 1fr";
    regionsRoot.style.gridTemplateColumns = "1fr";
    return;
  }

  if (regionCount <= 4) {
    regionsRoot.style.gridTemplateRows = "1fr 1fr";
    regionsRoot.style.gridTemplateColumns = "1fr 1fr";
    return;
  }

  regionsRoot.style.gridTemplateRows = "1fr 1fr";
  regionsRoot.style.gridTemplateColumns = "1fr 1fr 1fr";
}

/* =========================================================
   13. Track 조회
========================================================= */

function getVisibleTracksByRegion(regionId) {
  const tracks = window.TSState?.tracks || [];

  return tracks.filter(track => {
    return track.regionId === regionId && track.visible;
  });
}

function getLatestTrackInRegion(regionId) {
  const tracks = getVisibleTracksByRegion(regionId);
  return getLatestTrack(tracks);
}

function getLatestTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;

  return [...tracks].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();

    return timeB - timeA;
  })[0];
}

function hasForecastResult(track) {
  return Boolean(
    track?.result?.forecast ||
    track?.result?.predicted ||
    track?.metadata?.forecast
  );
}

/* =========================================================
   14. 유틸
========================================================= */

function getLastValidDate(rows, datetimeColumn) {
  if (!rows || !datetimeColumn || !window.TSDateUtils) return null;

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const date = window.TSDateUtils.parseDateValue(rows[i][datetimeColumn]);

    if (date) return date;
  }

  return null;
}

function shortText(text, maxLength = 16) {
  const value = String(text || "");

  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength)}…`;
}

function formatTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

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

function refreshWorkspace(actionName) {
  renderRegions();

  if (window.TSLayout) {
    window.TSLayout.dispatchStateChange(actionName);
    return;
  }

  if (window.TSInspectorUI) {
    window.TSInspectorUI.renderInspector();
  }

  if (window.TSTimelineUI) {
    window.TSTimelineUI.renderTimeline();
  }
}

/* =========================================================
   15. 외부 접근용 객체
========================================================= */

window.TSRegionUI = {
  initRegions,
  renderRegions,

  createRegionHTML,
  createRegionContentHTML,

  createTimeSeriesChartHTML,
  createForecastChartHTML,
  createResidualChartHTML,
  createMetricChartHTML,
  createCompareChartHTML,

  addRegionFromUI,
  selectRegion,
  deleteRegionFromUI,
  focusRegion,
  openRegionSetting
};

/* =========================================================
   16. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initRegions();
});