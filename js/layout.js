/* =========================================================
   TS Navigator - layout.js
   ---------------------------------------------------------
   역할
   1. workspace.html 전체 레이아웃 초기화
   2. sessionStorage에 저장된 데이터 / 상태 복원
   3. Inspector 접기 / 펼치기
   4. Track Timeline / Visualization Region 비율 유지
   5. Home 이동, Workspace 상태 저장
   6. 각 UI 모듈 렌더링 호출
========================================================= */

/* =========================================================
   1. DOM 요소 참조
========================================================= */

let workspaceRoot = null;
let mainLayout = null;

let homeBtn = null;
let collapseRail = null;
let inspectorPanel = null;
let timelinePanel = null;
let visualizationPanel = null;

let workspaceTitle = null;
let statusDot = null;
let statusText = null;

let saveBtn = null;
let exportBtn = null;

/* =========================================================
   2. Layout 상태
========================================================= */

const TSLayoutState = {
  inspectorCollapsed: false,

  ratio: {
    collapseRail: 26,
    inspector: 170,
    timeline: 220,
    visualization: "1fr"
  },

  autosaveKey: "TS_NAVIGATOR_STATE",
  datasetKey: "TS_NAVIGATOR_DATASET"
};

/* =========================================================
   3. 초기화
========================================================= */

function initLayout() {
  cacheLayoutElements();
  restoreWorkspaceState();
  bindLayoutEvents();

  renderWorkspaceStatus();
  renderAllWorkspaceUI();

  saveWorkspaceState();
}

function cacheLayoutElements() {
  workspaceRoot = document.querySelector(".workspace-shell");
  mainLayout = document.querySelector(".workspace-body");

  homeBtn = document.getElementById("goHomeBtn");
  collapseRail = document.getElementById("toggleInspectorBtn");
  inspectorPanel = document.getElementById("trackInspector");
  timelinePanel = document.querySelector(".timeline-panel");
  visualizationPanel = document.querySelector(".visualization-panel");

  workspaceTitle = document.querySelector(".topbar-brand");
  statusDot = null;
  statusText = document.getElementById("projectStateText");

  saveBtn = document.getElementById("saveProjectBtn");
  exportBtn = document.getElementById("exportProjectBtn");
}

function bindLayoutEvents() {
  if (homeBtn) {
    homeBtn.addEventListener("click", goHome);
  }

  if (collapseRail) {
    collapseRail.addEventListener("click", toggleInspector);
  }

  window.addEventListener("beforeunload", saveWorkspaceState);

  document.addEventListener("keydown", handleWorkspaceShortcut);

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveWorkspaceState();

      if (window.TSState?.project) {
        window.TSState.project.status = "saved";
        window.TSState.project.updatedAt = new Date().toISOString();
      }

      renderWorkspaceStatus();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", exportWorkspaceState);
  }
}

function exportWorkspaceState() {
  if (!window.TSState) return;

  const blob = new Blob(
    [JSON.stringify(window.TSState, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "ts-navigator-project.json";
  link.click();

  URL.revokeObjectURL(url);
}
/* =========================================================
   4. Workspace 상태 복원
========================================================= */

function restoreWorkspaceState() {
  restoreProjectStateFromSession();

  if (!window.TSState || !window.TSStore) {
    console.warn("TSState 또는 TSStore가 없습니다. state.js 로드 순서를 확인하세요.");
    return;
  }

  const hasDataset =
    window.TSState.dataset &&
    window.TSState.dataset.isUploaded &&
    Array.isArray(window.TSState.dataset.rows) &&
    window.TSState.dataset.rows.length > 0;

  if (!hasDataset) {
    restoreDatasetOnlyFromSession();
  }

  ensureDefaultWorkspaceObjects();
}

function restoreProjectStateFromSession() {
  const savedStateText = sessionStorage.getItem(TSLayoutState.autosaveKey);

  if (!savedStateText || !window.TSState) return;

  try {
    const savedState = JSON.parse(savedStateText);

    Object.keys(savedState).forEach(key => {
      window.TSState[key] = savedState[key];
    });
  } catch (error) {
    console.warn("Workspace 상태를 복원하지 못했습니다.", error);
    sessionStorage.removeItem(TSLayoutState.autosaveKey);
  }
}

function restoreDatasetOnlyFromSession() {
  const savedDatasetText = sessionStorage.getItem(TSLayoutState.datasetKey);

  if (!savedDatasetText || !window.TSStore) return;

  try {
    const dataset = JSON.parse(savedDatasetText);

    window.TSStore.initProject();

    window.TSStore.setDataset({
      fileName: dataset.fileName,
      rawText: dataset.rawText || "",
      rows: dataset.rows || [],
      columns: dataset.columns || [],
      datetimeColumn: dataset.datetimeColumn || null,
      targetColumn: dataset.targetColumn || null,
      frequency: dataset.frequency || null,
      structureSummary: dataset.structureSummary || null
    });

    const originalTrack = window.TSStore.createOriginalTrack(dataset.rows || []);

    window.TSStore.commitTrackResult(originalTrack.id, {
      data: dataset.rows || [],
      metadata: {
        fileName: dataset.fileName,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        datetimeColumn: dataset.datetimeColumn,
        targetColumn: dataset.targetColumn,
        frequency: dataset.frequency,
        numericColumns: dataset.numericColumns,
        categoricalColumns: dataset.categoricalColumns
      },
      result: {
        type: "Structure",
        summary: dataset.structureSummary,
        previewRows: dataset.previewRows || []
      }
    });
  } catch (error) {
    console.warn("Dataset 정보를 복원하지 못했습니다.", error);
    sessionStorage.removeItem(TSLayoutState.datasetKey);
  }
}

function ensureDefaultWorkspaceObjects() {
  if (!window.TSState || !window.TSStore) return;

  if (!Array.isArray(window.TSState.regions) || window.TSState.regions.length === 0) {
    window.TSStore.addRegion("time-series");
  }

  if (
    window.TSState.dataset?.isUploaded &&
    (!Array.isArray(window.TSState.tracks) || window.TSState.tracks.length === 0)
  ) {
    window.TSStore.createOriginalTrack(window.TSState.dataset.rows);
  }

  if (!window.TSState.selectedTrackId && window.TSState.tracks.length > 0) {
    window.TSStore.selectTrack(window.TSState.tracks[0].id);
  }

  if (!window.TSState.selectedRegionId && window.TSState.regions.length > 0) {
    window.TSState.selectedRegionId = window.TSState.regions[0].id;
  }
}

/* =========================================================
   5. Inspector 접기 / 펼치기
========================================================= */

function toggleInspector() {
  TSLayoutState.inspectorCollapsed = !TSLayoutState.inspectorCollapsed;
  applyLayoutRatio();
  saveLayoutPreference();
}

function setInspectorCollapsed(collapsed) {
  TSLayoutState.inspectorCollapsed = Boolean(collapsed);
  applyLayoutRatio();
  saveLayoutPreference();
}

function applyLayoutRatio() {
  if (!mainLayout) return;

  if (TSLayoutState.inspectorCollapsed) {
    mainLayout.style.gridTemplateColumns = "44px 10% 1fr";

    if (collapseRail) collapseRail.textContent = ">";
    if (inspectorPanel) inspectorPanel.classList.add("collapsed");

    return;
  }

  mainLayout.style.gridTemplateColumns = "18% 10% 72%";

  if (collapseRail) collapseRail.textContent = "<";
  if (inspectorPanel) inspectorPanel.classList.remove("collapsed");
}

function saveLayoutPreference() {
  localStorage.setItem(
    "TS_NAVIGATOR_LAYOUT",
    JSON.stringify({
      inspectorCollapsed: TSLayoutState.inspectorCollapsed
    })
  );
}

function restoreLayoutPreference() {
  const text = localStorage.getItem("TS_NAVIGATOR_LAYOUT");

  if (!text) return;

  try {
    const preference = JSON.parse(text);
    TSLayoutState.inspectorCollapsed = Boolean(preference.inspectorCollapsed);
  } catch (error) {
    localStorage.removeItem("TS_NAVIGATOR_LAYOUT");
  }
}

/* =========================================================
   6. Workspace 전체 렌더링
========================================================= */

function renderAllWorkspaceUI() {
  restoreLayoutPreference();
  applyLayoutRatio();

  renderWorkspaceStatus();

  if (window.TSInspectorUI) {
    window.TSInspectorUI.renderInspector();
  }

  if (window.TSTimelineUI) {
    window.TSTimelineUI.renderTimeline();
  }

  if (window.TSRegionUI) {
    window.TSRegionUI.renderRegions();
  }

  if (window.TSPopupUI) {
    window.TSPopupUI.renderPopup();
  }

  if (window.TSAssistantUI) {
    window.TSAssistantUI.renderAssistant();
  }
}

function requestWorkspaceRender() {
  renderWorkspaceStatus();

  if (window.TSInspectorUI) {
    window.TSInspectorUI.renderInspector();
  }

  if (window.TSTimelineUI) {
    window.TSTimelineUI.renderTimeline();
  }

  if (window.TSRegionUI) {
    window.TSRegionUI.renderRegions();
  }

  if (window.TSPopupUI) {
    window.TSPopupUI.renderPopup();
  }

  saveWorkspaceState();
}

/* =========================================================
   7. 상단 상태 표시
========================================================= */

function renderWorkspaceStatus() {
  if (!window.TSState) return;

  const status = window.TSState.project?.status || "empty";

  if (workspaceTitle) {
    workspaceTitle.textContent = "TS Navigator Workspace";
  }

  if (statusDot) {
    statusDot.className = `status-dot ${status}`;
  }

  if (statusText) {
    statusText.textContent = createStatusLabel(status);
  }
}

function createStatusLabel(status) {
  const labelMap = {
    empty: "Empty",
    ready: "Ready",
    modified: "Modified",
    "need-recalculation": "Need Recalculation",
    saved: "Saved"
  };

  return labelMap[status] || status;
}

/* =========================================================
   8. Home 이동
========================================================= */

function goHome() {
  saveWorkspaceState();
  window.location.href = "index.html";
}

/* =========================================================
   9. Workspace 저장
========================================================= */

function saveWorkspaceState() {
  if (!window.TSState) return;

  try {
    sessionStorage.setItem(
      TSLayoutState.autosaveKey,
      JSON.stringify(window.TSState)
    );
  } catch (error) {
    console.warn("Workspace 상태 저장 실패", error);
  }
}

function clearWorkspaceState() {
  sessionStorage.removeItem(TSLayoutState.autosaveKey);
  sessionStorage.removeItem(TSLayoutState.datasetKey);
}

/* =========================================================
   10. 단축키
========================================================= */

function handleWorkspaceShortcut(event) {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const commandKey = isMac ? event.metaKey : event.ctrlKey;

  if (!commandKey) return;

  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveWorkspaceState();

    if (window.TSState?.project) {
      window.TSState.project.status = "saved";
      window.TSState.project.updatedAt = new Date().toISOString();
    }

    renderWorkspaceStatus();
  }

  if (event.key.toLowerCase() === "b") {
    event.preventDefault();
    toggleInspector();
  }

  if (event.key.toLowerCase() === "h") {
    event.preventDefault();
    goHome();
  }
}

/* =========================================================
   11. 공통 상태 변경 후 렌더링
========================================================= */

function dispatchStateChange(actionName = "STATE_CHANGE") {
  saveWorkspaceState();
  renderAllWorkspaceUI();

  document.dispatchEvent(
    new CustomEvent("ts-state-change", {
      detail: {
        action: actionName,
        state: window.TSState
      }
    })
  );
}

/* =========================================================
   12. 외부 접근용 객체
========================================================= */

window.TSLayout = {
  state: TSLayoutState,

  initLayout,

  restoreWorkspaceState,
  saveWorkspaceState,
  clearWorkspaceState,

  renderAllWorkspaceUI,
  requestWorkspaceRender,
  dispatchStateChange,

  toggleInspector,
  setInspectorCollapsed,
  applyLayoutRatio,

  goHome
};

/* =========================================================
   13. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initLayout();
});