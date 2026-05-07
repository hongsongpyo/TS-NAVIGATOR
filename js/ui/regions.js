/* =========================================================
   TS Navigator - regions.js
   Visualization Region 생성/삭제/분할/렌더링
   ========================================================= */

/* =========================================================
   Region 전체 렌더링
   ========================================================= */

function renderRegions() {
  const container = document.getElementById("visualizationRegions");

  if (!container) return;

  container.innerHTML = `
    <div class="regions-header">
      <div>
        <p class="section-kicker">VISUALIZATION REGION</p>
        <h2 class="section-title">Regions</h2>
      </div>

      <div class="regions-header-actions">
        <button 
          type="button" 
          class="region-header-button"
          id="splitRegionButton"
          title="Region 분할"
        >
          분할
        </button>

        <button 
          type="button" 
          class="region-header-button primary"
          id="addRegionButton"
          title="Region 추가"
        >
          +
        </button>
      </div>
    </div>

    <div class="regions-grid ${getRegionGridClass()}" id="regionsGrid">
      ${createRegionsHTML()}
    </div>
  `;

  bindRegionEvents();

  renderRegionCharts();
}

/* =========================================================
   Region Grid Class
   ========================================================= */

function getRegionGridClass() {
  const count = TSState.regions.length;

  if (count <= 1) return "one-region";
  if (count === 2) return "two-regions";
  if (count === 3) return "three-regions";
  if (count === 4) return "four-regions";

  return "multi-regions";
}

/* =========================================================
   Regions HTML
   ========================================================= */

function createRegionsHTML() {
  if (!TSState.regions || TSState.regions.length === 0) {
    return `
      <div class="region-empty">
        <p>Region이 없습니다.</p>
      </div>
    `;
  }

  return TSState.regions
    .map((region, index) => createRegionPanelHTML(region, index))
    .join("");
}

/* =========================================================
   Region Panel HTML
   ========================================================= */

function createRegionPanelHTML(region, index) {
  const isSelected = TSState.selectedRegionId === region.id;
  const tracks = getTracksInRegion(region.id);
  const chartType = getRegionChartType(region);

  return `
    <section 
      class="region-panel ${isSelected ? "selected" : ""}"
      data-region-id="${region.id}"
    >
      <div class="region-panel-header">
        <div class="region-title-wrap">
          <span class="region-index">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>${escapeRegionHTML(region.name)}</h3>
            <p>${tracks.length} Tracks · ${getRegionChartTypeLabel(chartType)}</p>
          </div>
        </div>

        <div class="region-actions">
          <button 
            type="button"
            class="region-action-button"
            data-region-action="change-chart-type"
            data-region-id="${region.id}"
            title="Chart Type 변경"
          >
            View
          </button>

          <button 
            type="button"
            class="region-action-button"
            data-region-action="rename-region"
            data-region-id="${region.id}"
            title="Region 이름 변경"
          >
            Rename
          </button>

          <button 
            type="button"
            class="region-action-button danger"
            data-region-action="delete-region"
            data-region-id="${region.id}"
            title="Region 삭제"
          >
            ×
          </button>
        </div>
      </div>

      <div class="region-track-tags">
        ${createRegionTrackTagsHTML(tracks)}
      </div>

      <div 
        class="region-chart plotly-chart"
        data-region-chart="${region.id}"
        data-chart-type="${chartType}"
      ></div>
    </section>
  `;
}

/* =========================================================
   Region Track Tags
   ========================================================= */

function createRegionTrackTagsHTML(tracks = []) {
  if (tracks.length === 0) {
    return `
      <span class="region-track-tag empty">
        Track 없음
      </span>
    `;
  }

  return tracks
    .map((track) => {
      return `
        <button 
          type="button"
          class="region-track-tag ${TSState.selectedTrackId === track.id ? "selected" : ""}"
          data-region-track-id="${track.id}"
          title="${escapeRegionHTML(track.name)}"
        >
          <span style="background:${track.color || "#2f80ed"}"></span>
          ${escapeRegionHTML(track.name)}
        </button>
      `;
    })
    .join("");
}

/* =========================================================
   Region Chart Type
   ========================================================= */

function getRegionChartType(region) {
  if (!region) return "timeseries";

  return region.chartType || "timeseries";
}

function getRegionChartTypeLabel(type) {
  switch (type) {
    case "forecast":
      return "Forecast";

    case "metric":
      return "Metrics";

    case "timeseries":
    default:
      return "Time Series";
  }
}

function cycleRegionChartType(regionId) {
  const region = TSStore.getRegionById(regionId);

  if (!region) return null;

  const currentType = getRegionChartType(region);

  let nextType = "timeseries";

  if (currentType === "timeseries") {
    nextType = "forecast";
  } else if (currentType === "forecast") {
    nextType = "metric";
  } else {
    nextType = "timeseries";
  }

  region.chartType = nextType;

  return region;
}

/* =========================================================
   Region Chart 렌더링
   ========================================================= */

function renderRegionCharts() {
  document.querySelectorAll("[data-region-chart]").forEach((element) => {
    const regionId = element.dataset.regionChart;
    const chartType = element.dataset.chartType || "timeseries";

    renderSingleRegionChart(element, regionId, chartType);
  });

  if (window.TSChartInteraction) {
    TSChartInteraction.bindAllChartInteractions();
  }
}

function renderSingleRegionChart(element, regionId, chartType = "timeseries") {
  if (!element) return null;

  if (chartType === "forecast" && window.TSForecastChart) {
    return TSForecastChart.renderRegionForecastChart({
      element,
      regionId,
      title: "Forecast View",
    });
  }

  if (chartType === "metric" && window.TSMetricChart) {
    return TSMetricChart.renderRegionMetricChart({
      element,
      regionId,
      title: "Evaluation Metrics",
    });
  }

  if (window.TSTimeSeriesChart) {
    return TSTimeSeriesChart.renderRegionTimeSeriesChart({
      element,
      regionId,
      title: TSStore.getRegionById(regionId)?.name || "Region",
    });
  }

  return null;
}

/* =========================================================
   Region Event 연결
   ========================================================= */

function bindRegionEvents() {
  const addButton = document.getElementById("addRegionButton");
  const splitButton = document.getElementById("splitRegionButton");
  const grid = document.getElementById("regionsGrid");

  if (addButton) {
    addButton.addEventListener("click", handleAddRegion);
  }

  if (splitButton) {
    splitButton.addEventListener("click", handleSplitRegion);
  }

  if (grid) {
    grid.addEventListener("click", handleRegionGridClick);
  }
}

/* =========================================================
   Region Click Handler
   ========================================================= */

function handleRegionGridClick(event) {
  const trackTag = event.target.closest("[data-region-track-id]");
  const actionButton = event.target.closest("[data-region-action]");
  const panel = event.target.closest(".region-panel");

  if (trackTag) {
    const trackId = trackTag.dataset.regionTrackId;

    TSStore.selectTrack(trackId);
    refreshRegionConnectedUI();

    return;
  }

  if (actionButton) {
    const action = actionButton.dataset.regionAction;
    const regionId = actionButton.dataset.regionId;

    handleRegionAction(action, regionId);

    return;
  }

  if (panel) {
    const regionId = panel.dataset.regionId;

    TSStore.selectRegion(regionId);
    refreshRegionConnectedUI();
  }
}

/* =========================================================
   Region Action
   ========================================================= */

function handleRegionAction(action, regionId) {
  if (!regionId) return;

  switch (action) {
    case "change-chart-type":
      cycleRegionChartType(regionId);
      break;

    case "rename-region":
      renameRegionByPrompt(regionId);
      break;

    case "delete-region":
      deleteRegionByConfirm(regionId);
      break;

    default:
      break;
  }

  refreshRegionConnectedUI();
}

function renameRegionByPrompt(regionId) {
  const region = TSStore.getRegionById(regionId);

  if (!region) return;

  const input = window.prompt("Region 이름을 입력하세요.", region.name);

  if (input === null) return;

  const nextName = input.trim();

  if (!nextName) return;

  region.name = nextName;
  TSState.app.projectStatus = "modified";
}

function deleteRegionByConfirm(regionId) {
  const region = TSStore.getRegionById(regionId);

  if (!region) return;

  if (TSState.regions.length <= 1) {
    alert("Region은 최소 1개 이상 필요합니다.");
    return;
  }

  const confirmed = window.confirm(
    `"${region.name}" Region을 삭제할까요?\n포함된 Track은 다른 Region으로 이동됩니다.`
  );

  if (!confirmed) return;

  TSStore.removeRegion(regionId);
}

/* =========================================================
   Add / Split Region
   ========================================================= */

function handleAddRegion() {
  TSStore.createRegion();

  refreshRegionConnectedUI();
}

function handleSplitRegion() {
  const selectedRegion = TSStore.getSelectedRegion();

  if (!selectedRegion) {
    TSStore.createRegion();
    refreshRegionConnectedUI();
    return;
  }

  const newRegion = TSStore.createRegion();

  const selectedTracks = [...selectedRegion.trackIds];
  const halfIndex = Math.ceil(selectedTracks.length / 2);
  const moveTrackIds = selectedTracks.slice(halfIndex);

  moveTrackIds.forEach((trackId) => {
    TSStore.assignTrackToRegion(trackId, newRegion.id);
  });

  refreshRegionConnectedUI();
}

/* =========================================================
   Region Data Helper
   ========================================================= */

function getTracksInRegion(regionId) {
  const region = TSStore.getRegionById(regionId);

  if (!region) return [];

  return region.trackIds
    .map((trackId) => TSStore.getTrackById(trackId))
    .filter(Boolean);
}

function getVisibleTracksInRegion(regionId) {
  return getTracksInRegion(regionId).filter((track) => track.visible !== false);
}

function moveSelectedTrackToRegion(regionId) {
  const selectedTrack = TSStore.getSelectedTrack();

  if (!selectedTrack) return null;

  return TSStore.assignTrackToRegion(selectedTrack.id, regionId);
}

/* =========================================================
   Region 초기 구성
   ========================================================= */

function ensureDefaultRegion() {
  if (!TSState.regions || TSState.regions.length === 0) {
    TSState.regions = [
      {
        id: "region-1",
        name: "Region 01",
        trackIds: [],
        layout: {
          row: 1,
          col: 1,
        },
        chartType: "timeseries",
      },
    ];

    TSState.selectedRegionId = "region-1";
  }

  TSState.regions.forEach((region, index) => {
    if (!region.name) {
      region.name = `Region ${String(index + 1).padStart(2, "0")}`;
    }

    if (!region.trackIds) {
      region.trackIds = [];
    }

    if (!region.chartType) {
      region.chartType = "timeseries";
    }
  });
}

/* =========================================================
   자동분석 결과 표시용 Region 구성
   ========================================================= */

function arrangeAutoAnalysisRegions() {
  const autoTrackIds = TSState.autoAnalysis.createdTrackIds || [];

  if (autoTrackIds.length === 0) return;

  let forecastRegion =
    TSState.regions.find((region) => region.chartType === "forecast") ||
    TSStore.createRegion("Forecast Region");

  forecastRegion.chartType = "forecast";

  let metricRegion =
    TSState.regions.find((region) => region.chartType === "metric") ||
    TSStore.createRegion("Metric Region");

  metricRegion.chartType = "metric";

  autoTrackIds.forEach((trackId) => {
    const track = TSStore.getTrackById(trackId);

    if (!track) return;

    if (track.type === "Forecast Data") {
      TSStore.assignTrackToRegion(trackId, forecastRegion.id);
    }

    if (track.type === "Evaluation Result") {
      TSStore.assignTrackToRegion(trackId, metricRegion.id);
    }
  });
}

/* =========================================================
   연결 UI 새로고침
   ========================================================= */

function refreshRegionConnectedUI() {
  renderRegions();

  if (window.TSTimelineUI) {
    TSTimelineUI.renderTimeline();
  }

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }

  if (window.TSChartCore) {
    TSChartCore.resizeAllPlots();
  }
}

/* =========================================================
   HTML Escape
   ========================================================= */

function escapeRegionHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSRegionsUI = {
  renderRegions,

  getRegionGridClass,
  createRegionsHTML,
  createRegionPanelHTML,
  createRegionTrackTagsHTML,

  getRegionChartType,
  getRegionChartTypeLabel,
  cycleRegionChartType,

  renderRegionCharts,
  renderSingleRegionChart,

  bindRegionEvents,
  handleRegionGridClick,
  handleRegionAction,

  renameRegionByPrompt,
  deleteRegionByConfirm,

  handleAddRegion,
  handleSplitRegion,

  getTracksInRegion,
  getVisibleTracksInRegion,
  moveSelectedTrackToRegion,

  ensureDefaultRegion,
  arrangeAutoAnalysisRegions,

  refreshRegionConnectedUI,
};