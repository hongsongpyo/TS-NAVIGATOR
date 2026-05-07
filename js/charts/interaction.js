/* =========================================================
   TS Navigator - interaction.js
   zoom, hover, point edit, chart interaction
   ========================================================= */

/* =========================================================
   Chart Interaction 초기화
   ========================================================= */

function bindChartInteraction(element, options = {}) {
  if (!element || !TSChartCore.isPlotlyReady()) return;

  bindTrackSelection(element);
  bindHoverInfo(element);

  if (options.enablePointEdit !== false) {
    bindPointEdit(element);
  }

  if (options.enableRelayoutSync !== false) {
    bindRelayoutSync(element);
  }
}

/* =========================================================
   Track 선택
   ========================================================= */

function bindTrackSelection(element) {
  if (!element) return;

  element.on("plotly_click", (eventData) => {
    if (!eventData.points || eventData.points.length === 0) return;

    const point = eventData.points[0];
    const trackName = point.data.name;

    const track = findTrackByTraceName(trackName);

    if (!track) return;

    TSStore.selectTrack(track.id);

    highlightTraceByTrack(element, track.id);

    refreshWorkspaceUI();
  });
}

function findTrackByTraceName(traceName) {
  return TSState.tracks.find((track) => {
    return (
      track.name === traceName ||
      `Before - ${track.name}` === traceName ||
      `After - ${track.name}` === traceName
    );
  });
}

function highlightTraceByTrack(element, trackId) {
  if (!element || !element.data || !TSChartCore.isPlotlyReady()) return;

  const widths = element.data.map((trace) => {
    const track = findTrackByTraceName(trace.name);

    if (track && track.id === trackId) {
      return 4;
    }

    return 2;
  });

  Plotly.restyle(element, {
    "line.width": widths,
  });
}

/* =========================================================
   Hover 정보
   ========================================================= */

function bindHoverInfo(element) {
  if (!element) return;

  element.on("plotly_hover", (eventData) => {
    if (!eventData.points || eventData.points.length === 0) return;

    const point = eventData.points[0];

    const hoverInfo = {
      trackName: point.data.name,
      x: point.x,
      y: point.y,
      pointIndex: point.pointIndex,
    };

    element.dataset.hoverTrack = hoverInfo.trackName;
    element.dataset.hoverX = hoverInfo.x;
    element.dataset.hoverY = hoverInfo.y;
    element.dataset.hoverPointIndex = hoverInfo.pointIndex;
  });

  element.on("plotly_unhover", () => {
    delete element.dataset.hoverTrack;
    delete element.dataset.hoverX;
    delete element.dataset.hoverY;
    delete element.dataset.hoverPointIndex;
  });
}

/* =========================================================
   Point Edit
   그래프 점을 클릭 후 값 수정
   ========================================================= */

function bindPointEdit(element) {
  if (!element) return;

  element.on("plotly_doubleclick", () => {
    const trackName = element.dataset.hoverTrack;
    const pointIndex = Number(element.dataset.hoverPointIndex);

    if (!trackName || Number.isNaN(pointIndex)) return;

    const track = findTrackByTraceName(trackName);

    if (!track || track.locked) return;

    openPointEditPrompt({
      element,
      track,
      pointIndex,
    });
  });
}

function openPointEditPrompt({
  element,
  track,
  pointIndex,
}) {
  const currentValue = track.y[pointIndex];

  const input = window.prompt(
    `값을 수정합니다.\nTrack: ${track.name}\nIndex: ${pointIndex}`,
    currentValue
  );

  if (input === null) return;

  const nextValue = TSMathUtils.toNumber(input);

  if (nextValue === null) {
    alert("숫자 값을 입력해야 합니다.");
    return;
  }

  updateTrackPoint({
    trackId: track.id,
    pointIndex,
    value: nextValue,
  });

  rerenderChartElement(element);
  refreshWorkspaceUI();
}

function updateTrackPoint({
  trackId,
  pointIndex,
  value,
}) {
  const track = TSStore.getTrackById(trackId);

  if (!track || track.locked) return null;

  const nextY = [...track.y];
  nextY[pointIndex] = value;

  const nextData = (track.data || []).map((item, index) => {
    if (index !== pointIndex) return item;

    return {
      ...item,
      value,
      edited: true,
      editedAt: new Date().toISOString(),
    };
  });

  TSStore.updateTrack(trackId, {
    y: nextY,
    data: nextData,
    metadata: {
      ...track.metadata,
      edited: true,
      lastEditedPoint: {
        index: pointIndex,
        value,
        editedAt: new Date().toISOString(),
      },
    },
  });

  return TSStore.getTrackById(trackId);
}

/* =========================================================
   Zoom / Relayout Sync
   같은 workspace 내 chart x축 범위 동기화
   ========================================================= */

let isRelayoutSyncing = false;

function bindRelayoutSync(element) {
  if (!element) return;

  element.on("plotly_relayout", (eventData) => {
    if (isRelayoutSyncing) return;

    const range = extractXRangeFromRelayout(eventData);

    if (!range) return;

    syncXRangeToOtherCharts(element, range);
  });
}

function extractXRangeFromRelayout(eventData = {}) {
  const start =
    eventData["xaxis.range[0]"] ||
    eventData["xaxis.range"]?.[0] ||
    null;

  const end =
    eventData["xaxis.range[1]"] ||
    eventData["xaxis.range"]?.[1] ||
    null;

  if (!start || !end) return null;

  return [start, end];
}

function syncXRangeToOtherCharts(sourceElement, range) {
  if (!TSChartCore.isPlotlyReady()) return;

  const charts = document.querySelectorAll(".plotly-chart");

  isRelayoutSyncing = true;

  charts.forEach((chart) => {
    if (chart === sourceElement) return;

    Plotly.relayout(chart, {
      "xaxis.range": range,
    });
  });

  isRelayoutSyncing = false;
}

function resetChartZoom(element) {
  if (!element || !TSChartCore.isPlotlyReady()) return;

  Plotly.relayout(element, {
    "xaxis.autorange": true,
    "yaxis.autorange": true,
  });
}

function resetAllChartZoom() {
  document.querySelectorAll(".plotly-chart").forEach((element) => {
    resetChartZoom(element);
  });
}

/* =========================================================
   Chart 재렌더링
   ========================================================= */

function rerenderChartElement(element) {
  if (!element) return;

  const regionId = element.dataset.regionChart;
  const chartType = element.dataset.chartType || "timeseries";

  if (regionId && chartType === "forecast" && window.TSForecastChart) {
    TSForecastChart.renderRegionForecastChart({
      element,
      regionId,
    });
    bindChartInteraction(element);
    return;
  }

  if (regionId && chartType === "metric" && window.TSMetricChart) {
    TSMetricChart.renderRegionMetricChart({
      element,
      regionId,
    });
    bindChartInteraction(element, {
      enablePointEdit: false,
    });
    return;
  }

  if (regionId && window.TSTimeSeriesChart) {
    TSTimeSeriesChart.renderRegionTimeSeriesChart({
      element,
      regionId,
    });
    bindChartInteraction(element);
  }
}

function rerenderAllCharts() {
  document.querySelectorAll(".plotly-chart").forEach((element) => {
    rerenderChartElement(element);
  });
}

/* =========================================================
   Chart Context Menu
   ========================================================= */

function bindChartContextMenu(element) {
  if (!element) return;

  element.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    const trackName = element.dataset.hoverTrack;
    const pointIndex = Number(element.dataset.hoverPointIndex);

    if (!trackName || Number.isNaN(pointIndex)) return;

    const track = findTrackByTraceName(trackName);

    if (!track) return;

    showPointContextMenu({
      x: event.clientX,
      y: event.clientY,
      track,
      pointIndex,
      element,
    });
  });
}

function showPointContextMenu({
  x,
  y,
  track,
  pointIndex,
  element,
}) {
  removePointContextMenu();

  const menu = document.createElement("div");
  menu.className = "point-context-menu";
  menu.id = "pointContextMenu";

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  menu.innerHTML = `
    <button type="button" data-action="edit">값 수정</button>
    <button type="button" data-action="missing">결측치로 변경</button>
    <button type="button" data-action="outlier">이상치 표시</button>
  `;

  document.body.appendChild(menu);

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("button");

    if (!button) return;

    const action = button.dataset.action;

    if (action === "edit") {
      openPointEditPrompt({
        element,
        track,
        pointIndex,
      });
    }

    if (action === "missing") {
      updateTrackPoint({
        trackId: track.id,
        pointIndex,
        value: null,
      });
      rerenderChartElement(element);
      refreshWorkspaceUI();
    }

    if (action === "outlier") {
      markPointAsOutlier({
        trackId: track.id,
        pointIndex,
      });
      rerenderChartElement(element);
      refreshWorkspaceUI();
    }

    removePointContextMenu();
  });

  setTimeout(() => {
    document.addEventListener("click", removePointContextMenu, {
      once: true,
    });
  }, 0);
}

function removePointContextMenu() {
  const menu = document.getElementById("pointContextMenu");

  if (menu) {
    menu.remove();
  }
}

function markPointAsOutlier({
  trackId,
  pointIndex,
}) {
  const track = TSStore.getTrackById(trackId);

  if (!track || track.locked) return null;

  const nextData = (track.data || []).map((item, index) => {
    if (index !== pointIndex) return item;

    return {
      ...item,
      isOutlier: true,
      manuallyMarkedOutlier: true,
    };
  });

  TSStore.updateTrack(trackId, {
    data: nextData,
    metadata: {
      ...track.metadata,
      edited: true,
      lastMarkedOutlier: {
        index: pointIndex,
        markedAt: new Date().toISOString(),
      },
    },
  });

  return TSStore.getTrackById(trackId);
}

/* =========================================================
   전체 Chart 이벤트 연결
   ========================================================= */

function bindAllChartInteractions() {
  document.querySelectorAll(".plotly-chart").forEach((element) => {
    bindChartInteraction(element);
    bindChartContextMenu(element);
  });
}

/* =========================================================
   Workspace UI Refresh
   ========================================================= */

function refreshWorkspaceUI() {
  if (window.TSTimelineUI) {
    TSTimelineUI.renderTimeline();
  }

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }

  if (window.TSRegionsUI) {
    TSRegionsUI.renderRegions();
  }
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSChartInteraction = {
  bindChartInteraction,

  bindTrackSelection,
  findTrackByTraceName,
  highlightTraceByTrack,

  bindHoverInfo,

  bindPointEdit,
  openPointEditPrompt,
  updateTrackPoint,

  bindRelayoutSync,
  extractXRangeFromRelayout,
  syncXRangeToOtherCharts,
  resetChartZoom,
  resetAllChartZoom,

  rerenderChartElement,
  rerenderAllCharts,

  bindChartContextMenu,
  showPointContextMenu,
  removePointContextMenu,
  markPointAsOutlier,

  bindAllChartInteractions,
  refreshWorkspaceUI,
};