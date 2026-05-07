/* =========================================================
   TS Navigator - inspector.js
   ---------------------------------------------------------
   역할
   1. 왼쪽 Inspector UI 렌더링
   2. 선택된 Track 정보 표시
   3. Analysis Stack 표시
   4. 빈 Slot 클릭 시 Add Analysis 팝업 열기
   5. Stack 항목 클릭 시 Parameter 팝업 열기
   6. Track 이름 / 색상 / 표시 / 잠금 / 복제 / 삭제 관리
========================================================= */

/* =========================================================
   1. DOM 참조
========================================================= */

let inspectorRoot = null;

/* =========================================================
   2. Inspector 초기화
========================================================= */

function initInspector() {
  inspectorRoot = document.querySelector(".inspector .panel-inner");

  if (!inspectorRoot) {
    console.warn("Inspector 영역을 찾지 못했습니다.");
    return;
  }

  renderInspector();
  bindInspectorEvents();
}

function bindInspectorEvents() {
  if (!inspectorRoot) return;

  inspectorRoot.addEventListener("click", handleInspectorClick);
  inspectorRoot.addEventListener("change", handleInspectorChange);
  inspectorRoot.addEventListener("input", handleInspectorInput);
}

/* =========================================================
   3. Inspector 렌더링
========================================================= */

function renderInspector() {
  inspectorRoot = document.querySelector(".inspector .panel-inner");

  if (!inspectorRoot || !window.TSState) return;

  const selectedTrack = window.TSStore?.getSelectedTrack();

  inspectorRoot.innerHTML = `
    <div class="panel-title">Inspector</div>

    ${selectedTrack ? createSelectedTrackHTML(selectedTrack) : createEmptyTrackHTML()}

    <div class="section-title">Analysis Stack</div>
    ${selectedTrack ? createAnalysisStackHTML(selectedTrack) : createDisabledStackHTML()}

    ${selectedTrack ? createTrackActionHTML(selectedTrack) : ""}
  `;
}

/* =========================================================
   4. 선택 Track 영역
========================================================= */

function createSelectedTrackHTML(track) {
  const region = window.TSStore.getRegion(track.regionId);
  const regionName = region ? region.name : "No Region";

  return `
    <div class="selected-track inspector-selected-track" data-track-id="${track.id}">
      <strong>${escapeHTML(getShortTrackName(track.name))}</strong>
      <span>Last updated → Region</span>
    </div>

    <div class="track-info-panel">
      <div class="section-title">Selected Track</div>

      <label class="inspector-label">Track Name</label>
      <input
        class="inspector-input"
        data-action="rename-track"
        data-track-id="${track.id}"
        value="${escapeHTML(track.name)}"
      />

      <label class="inspector-label">Track Type</label>
      <select
        class="inspector-select"
        data-action="change-track-type"
        data-track-id="${track.id}"
      >
        ${createTrackTypeOptions(track.type)}
      </select>

      <label class="inspector-label">Region Assignment</label>
      <select
        class="inspector-select"
        data-action="change-region"
        data-track-id="${track.id}"
      >
        ${createRegionOptions(track.regionId)}
      </select>

      <div class="inspector-mini-grid">
        <button
          class="inspector-mini-btn"
          data-action="toggle-visible"
          data-track-id="${track.id}"
        >
          ${track.visible ? "Visible ON" : "Visible OFF"}
        </button>

        <button
          class="inspector-mini-btn"
          data-action="toggle-lock"
          data-track-id="${track.id}"
        >
          ${track.locked ? "Locked" : "Unlocked"}
        </button>
      </div>

      <div class="track-meta-box">
        <div>Region: ${escapeHTML(regionName)}</div>
        <div>Stack: ${track.analysisStack?.length || 0} steps</div>
        <div>Updated: ${formatDateTime(track.updatedAt)}</div>
      </div>
    </div>
  `;
}

function createEmptyTrackHTML() {
  return `
    <div class="selected-track">
      <strong>No Track</strong>
      <span>Upload CSV first</span>
    </div>

    <div class="result-box">
      선택된 Track이 없습니다.<br />
      Home에서 CSV 파일을 업로드하거나 Track Timeline에서 Track을 선택하세요.
    </div>
  `;
}

/* =========================================================
   5. Analysis Stack 영역
========================================================= */

function createAnalysisStackHTML(track) {
  const stackItems = track.analysisStack || [];

  return `
    <div class="stack-panel">
      <div class="stack-head">
        <span>Process Chain</span>
        <span
          class="stack-head-action"
          data-action="add-empty-slot"
          data-track-id="${track.id}"
        >
          + Empty Slot
        </span>
      </div>

      <div class="stack-body">
        ${stackItems.map((item, index) => createStackSlotHTML(item, index, track.id)).join("")}

        ${createEmptyStackSlotHTML(track.id, stackItems.length)}
      </div>
    </div>
  `;
}

function createStackSlotHTML(item, index, trackId) {
  const stateClass = getStackStateClass(item.status);
  const statusSymbol = getStackStatusSymbol(item.status);

  return `
    <div
      class="stack-slot ${stateClass}"
      data-action="open-stack-popup"
      data-track-id="${trackId}"
      data-stack-id="${item.id}"
      data-analysis-type="${escapeHTML(item.analysisType)}"
    >
      <span class="slot-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="slot-name">
        ${escapeHTML(createStackDisplayName(item))}
      </span>
      <span class="slot-state">${statusSymbol}</span>
    </div>
  `;
}

function createEmptyStackSlotHTML(trackId, index) {
  return `
    <div
      class="stack-slot empty"
      data-action="open-add-analysis-menu"
      data-track-id="${trackId}"
    >
      <span class="slot-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="slot-name">Click to add analysis...</span>
      <span class="slot-state">+</span>
    </div>
  `;
}

function createDisabledStackHTML() {
  return `
    <div class="stack-panel disabled">
      <div class="stack-head">
        <span>Process Chain</span>
        <span>Disabled</span>
      </div>
      <div class="stack-body">
        <div class="stack-slot empty">
          <span class="slot-index">--</span>
          <span class="slot-name">No selected track</span>
          <span class="slot-state">×</span>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   6. Track Action 영역
========================================================= */

function createTrackActionHTML(track) {
  return `
    <div class="section-title">Track Actions</div>

    <div class="inspector-action-grid">
      <button
        class="inspector-action-btn"
        data-action="duplicate-track"
        data-track-id="${track.id}"
      >
        Duplicate
      </button>

      <button
        class="inspector-action-btn danger"
        data-action="delete-track"
        data-track-id="${track.id}"
      >
        Delete
      </button>
    </div>

    <div class="section-title">Last Result</div>
    ${createLastResultHTML(track)}
  `;
}

function createLastResultHTML(track) {
  if (!track.result) {
    return `
      <div class="result-box">
        아직 실행된 분석 결과가 없습니다.
      </div>
    `;
  }

  const resultType = track.result.type || track.result.analysisType || track.type;

  if (resultType === "Structure" && window.TSStructureAnalysis) {
    return window.TSStructureAnalysis.createStructureResultHTML(track.result);
  }

  if (track.metrics) {
    return createMetricsMiniHTML(track.metrics);
  }

  return `
    <div class="result-box">
      <strong>${escapeHTML(resultType)}</strong><br />
      ${createResultSummaryText(track.result)}
    </div>
  `;
}

function createMetricsMiniHTML(metrics) {
  const entries = Object.entries(metrics)
    .filter(([, value]) => Number.isFinite(value))
    .slice(0, 6);

  if (entries.length === 0) {
    return `<div class="result-box">평가지표 결과가 없습니다.</div>`;
  }

  return `
    <div class="result-box">
      <strong>Metrics</strong><br />
      ${entries.map(([key, value]) => `${key}: ${formatNumber(value, 4)}`).join("<br />")}
    </div>
  `;
}

/* =========================================================
   7. 이벤트 처리
========================================================= */

function handleInspectorClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const trackId = target.dataset.trackId;
  const stackId = target.dataset.stackId;
  const analysisType = target.dataset.analysisType;

  if (action === "open-add-analysis-menu" || action === "add-empty-slot") {
    openAddAnalysisMenu(target, trackId);
    return;
  }

  if (action === "open-stack-popup") {
    openStackParameterPopup(target, trackId, stackId, analysisType);
    return;
  }

  if (action === "toggle-visible") {
    window.TSStore.toggleTrackVisibility(trackId);
    refreshWorkspace("TOGGLE_TRACK_VISIBLE");
    return;
  }

  if (action === "toggle-lock") {
    const track = window.TSStore.getTrack(trackId);
    window.TSStore.lockTrack(trackId, !track.locked);
    refreshWorkspace("TOGGLE_TRACK_LOCK");
    return;
  }

  if (action === "duplicate-track") {
    window.TSStore.duplicateTrack(trackId);
    refreshWorkspace("DUPLICATE_TRACK");
    return;
  }

  if (action === "delete-track") {
    window.TSStore.removeTrack(trackId);
    refreshWorkspace("DELETE_TRACK");
    return;
  }
}

function handleInspectorChange(event) {
  const target = event.target;
  const action = target.dataset.action;
  const trackId = target.dataset.trackId;

  if (!action || !trackId) return;

  if (action === "change-region") {
    window.TSStore.assignTrackToRegion(trackId, target.value);
    refreshWorkspace("CHANGE_TRACK_REGION");
    return;
  }

  if (action === "change-track-type") {
    window.TSStore.updateTrack(trackId, {
      type: target.value,
      color: window.TSStore
        ? getTrackColorByType(target.value)
        : "#8d8d8d"
    });

    refreshWorkspace("CHANGE_TRACK_TYPE");
  }
}

function handleInspectorInput(event) {
  const target = event.target;
  const action = target.dataset.action;
  const trackId = target.dataset.trackId;

  if (!action || !trackId) return;

  if (action === "rename-track") {
    window.TSStore.updateTrack(trackId, {
      name: target.value
    });

    if (window.TSTimelineUI) {
      window.TSTimelineUI.renderTimeline();
    }

    if (window.TSLayout) {
      window.TSLayout.saveWorkspaceState();
    }
  }
}

/* =========================================================
   8. Popup 연결
========================================================= */

function openAddAnalysisMenu(anchorElement, trackId) {
  const rect = anchorElement.getBoundingClientRect();

  if (window.TSStore) {
    window.TSStore.openAnalysisPopup({
      mode: "add-analysis",
      trackId,
      stackId: null,
      analysisType: null,
      x: rect.left + 28,
      y: rect.top + 4
    });
  }

  if (window.TSPopupUI) {
    window.TSPopupUI.renderPopup();
  }
}

function openStackParameterPopup(anchorElement, trackId, stackId, analysisType) {
  const rect = anchorElement.getBoundingClientRect();

  if (window.TSStore) {
    window.TSStore.openAnalysisPopup({
      mode: "parameter",
      trackId,
      stackId,
      analysisType,
      x: rect.right + 14,
      y: rect.top
    });
  }

  if (window.TSPopupUI) {
    window.TSPopupUI.renderPopup();
  }
}

/* =========================================================
   9. Option 생성
========================================================= */

function createTrackTypeOptions(selectedType) {
  const types = window.TSStore?.constants?.TS_TRACK_TYPES || {};

  return Object.values(types)
    .map(type => {
      const selected = type === selectedType ? "selected" : "";
      return `<option value="${escapeHTML(type)}" ${selected}>${escapeHTML(type)}</option>`;
    })
    .join("");
}

function createRegionOptions(selectedRegionId) {
  const regions = window.TSState?.regions || [];

  return regions
    .map(region => {
      const selected = region.id === selectedRegionId ? "selected" : "";
      return `<option value="${region.id}" ${selected}>${escapeHTML(region.name)}</option>`;
    })
    .join("");
}

/* =========================================================
   10. Stack 표시명
========================================================= */

function createStackDisplayName(item) {
  if (!item) return "Unknown";

  const type = item.analysisType;
  const params = item.params || {};

  if (type === "Missing") {
    return `Missing · ${params.method || "linear"}`;
  }

  if (type === "Outlier") {
    return `Outlier · ${params.method || "hampel"}`;
  }

  if (type === "Resampling") {
    return `Resampling · ${params.frequency || "auto"}`;
  }

  if (type === "Smoothing") {
    return `Smoothing · ${params.method || "moving-average"}`;
  }

  if (type === "Decomposition") {
    return `Decomposition · ${params.method || "STL"}`;
  }

  if (type === "Stationarity") {
    return `Stationarity · ${params.test || "ADF"}`;
  }

  if (type === "Forecast") {
    return `Forecast · ${params.model || "exponential-smoothing"}`;
  }

  if (type === "Validation") {
    return `Validation · ${params.method || "train-test-split"}`;
  }

  if (type === "Metrics") {
    return `Metrics · ${(params.metrics || ["MAE", "RMSE"]).slice(0, 2).join("/")}`;
  }

  if (type === "Auto Analysis") {
    return "Auto Analysis · full";
  }

  return type;
}

/* =========================================================
   11. 상태 표시
========================================================= */

function getStackStateClass(status) {
  const statusMap = {
    ready: "ready",
    running: "running",
    done: "done",
    error: "error"
  };

  return statusMap[status] || "ready";
}

function getStackStatusSymbol(status) {
  const symbolMap = {
    ready: "○",
    running: "…",
    done: "●",
    error: "!"
  };

  return symbolMap[status] || "○";
}

/* =========================================================
   12. 보조 함수
========================================================= */

function refreshWorkspace(actionName) {
  renderInspector();

  if (window.TSLayout) {
    window.TSLayout.dispatchStateChange(actionName);
  } else {
    if (window.TSTimelineUI) window.TSTimelineUI.renderTimeline();
    if (window.TSRegionUI) window.TSRegionUI.renderRegions();
  }
}

function getShortTrackName(name) {
  if (!name) return "Track";

  const text = String(name).replace(/\s+/g, " ").trim();

  if (text.length <= 18) return text;

  return `${text.slice(0, 18)}…`;
}

function getTrackColorByType(type) {
  const map = {
    "Original Data": "#8d8d8d",
    "Preprocessed Data": "#76a878",
    "Feature Data": "#9dbb9b",
    "Forecast Data": "#9b8db7",
    "Residual Data": "#b49a72",
    "Evaluation Result": "#5b8fd6",
    "Compare Result": "#afa4c5",
    "Auto Analysis Result": "#b9a17d"
  };

  return map[type] || "#8d8d8d";
}

function createResultSummaryText(result) {
  if (!result) return "결과 없음";

  if (Array.isArray(result.messages)) {
    return result.messages.map(escapeHTML).join("<br />");
  }

  if (result.summary) {
    return escapeHTML(JSON.stringify(result.summary, null, 2)).replace(/\n/g, "<br />");
  }

  return escapeHTML(JSON.stringify(result, null, 2)).replace(/\n/g, "<br />");
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${month}/${day} ${hour}:${minute}`;
}

function formatNumber(value, digits = 3) {
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
   13. 외부 접근용 객체
========================================================= */

window.TSInspectorUI = {
  initInspector,
  renderInspector,

  createSelectedTrackHTML,
  createAnalysisStackHTML,
  createStackSlotHTML,
  createEmptyStackSlotHTML,

  openAddAnalysisMenu,
  openStackParameterPopup
};

/* =========================================================
   14. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initInspector();
});