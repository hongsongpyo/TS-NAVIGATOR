/* =========================================================
   TS Navigator - app.js
   전역 초기 실행 / Home-Workspace 화면 연결
   ========================================================= */

/* =========================================================
   App 초기화
   ========================================================= */

function initializeApp() {
  const page = detectCurrentPage();

  if (page === "home") {
    initializeHome();
  }

  if (page === "workspace") {
    initializeWorkspace();
  }

  bindGlobalEvents();
}

/* =========================================================
   현재 페이지 감지
   ========================================================= */

function detectCurrentPage() {
  const path = window.location.pathname;

  if (path.endsWith("workspace.html")) {
    return "workspace";
  }

  return "home";
}

/* =========================================================
   Home 초기화
   ========================================================= */

function initializeHome() {
  TSState.app.currentPage = "home";

  if (window.TSUpload) {
    TSUpload.initializeUpload();
  }
}

/* =========================================================
   Workspace 초기화
   ========================================================= */

function initializeWorkspace() {
  TSState.app.currentPage = "workspace";

  const restored = window.TSUpload
    ? TSUpload.loadProjectFromSession()
    : false;

  if (!restored && TSState.tracks.length === 0) {
    createFallbackSampleProject();
  }

  if (window.TSRegionsUI) {
    TSRegionsUI.ensureDefaultRegion();
  }

  renderWorkspace();

  if (window.TSLayout) {
    TSLayout.initializeWorkspaceLayout();
  }

  if (window.TSChartInteraction) {
    TSChartInteraction.bindAllChartInteractions();
  }
}

/* =========================================================
   Workspace 전체 렌더링
   ========================================================= */

function renderWorkspace() {
  renderWorkspaceHeader();

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }

  if (window.TSTimelineUI) {
    TSTimelineUI.renderTimeline();
  }

  if (window.TSRegionsUI) {
    TSRegionsUI.renderRegions();
  }

  if (window.TSAssistantUI) {
    TSAssistantUI.renderAssistant();
  }
}

/* =========================================================
   Header 렌더링
   ========================================================= */

function renderWorkspaceHeader() {
  const fileNameElement = document.getElementById("workspaceFileName");
  const statusElement = document.getElementById("workspaceProjectStatus");

  if (fileNameElement) {
    fileNameElement.textContent =
      TSState.uploadedData.fileName || "No file loaded";
  }

  if (statusElement) {
    statusElement.textContent = getAppProjectStatusText();
    statusElement.className = `workspace-status ${getAppProjectStatusClass()}`;
  }
}

function getAppProjectStatusText() {
  switch (TSState.app.projectStatus) {
    case "empty":
      return "Empty";

    case "loaded":
      return "Loaded";

    case "modified":
      return "Modified";

    case "saved":
      return "Saved";

    case "need-recalculate":
      return "Recalculate";

    default:
      return "Unknown";
  }
}

function getAppProjectStatusClass() {
  switch (TSState.app.projectStatus) {
    case "saved":
      return "success";

    case "loaded":
      return "primary";

    case "modified":
    case "need-recalculate":
      return "warning";

    default:
      return "";
  }
}

/* =========================================================
   Fallback Sample Project
   workspace.html 직접 접근 시 빈 화면 방지
   ========================================================= */

function createFallbackSampleProject() {
  if (!window.TSSampleData || !window.TSUpload) return;

  const dataset = TSSampleData.createSampleDataset({
    length: 120,
    startDate: "2024-01-01",
    frequency: "daily",
    missingRatio: 0.08,
    outlierRatio: 0.05,
    duplicateRatio: 0.03,
  });

  TSUpload.applyDatasetToProject(dataset);
}

/* =========================================================
   Global Events
   ========================================================= */

function bindGlobalEvents() {
  bindSaveEvent();
  bindResetEvent();
  bindHomeNavigationEvent();
  bindBeforeUnloadEvent();
}

/* =========================================================
   저장
   ========================================================= */

function bindSaveEvent() {
  const saveButton = document.getElementById("saveProjectButton");

  if (!saveButton) return;

  saveButton.addEventListener("click", () => {
    saveProject();
  });
}

function saveProject() {
  if (window.TSUpload) {
    TSUpload.saveProjectToSession();
  }

  TSState.app.projectStatus = "saved";

  renderWorkspaceHeader();

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }
}

/* =========================================================
   초기화
   ========================================================= */

function bindResetEvent() {
  const resetButton = document.getElementById("resetProjectButton");

  if (!resetButton) return;

  resetButton.addEventListener("click", () => {
    const confirmed = window.confirm(
      "현재 프로젝트를 초기화하고 Home으로 돌아갈까요?"
    );

    if (!confirmed) return;

    resetProjectAndGoHome();
  });
}

function resetProjectAndGoHome() {
  TSStore.resetProject();

  if (window.TSUpload) {
    TSUpload.clearProjectSession();
  }

  window.location.href = "./index.html";
}

/* =========================================================
   Home 이동
   ========================================================= */

function bindHomeNavigationEvent() {
  const homeButton = document.getElementById("homeButton");

  if (!homeButton) return;

  homeButton.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
}

/* =========================================================
   페이지 이탈 전 저장
   ========================================================= */

function bindBeforeUnloadEvent() {
  window.addEventListener("beforeunload", () => {
    if (TSState.app.currentPage === "workspace" && window.TSUpload) {
      TSUpload.saveProjectToSession();
    }
  });
}

/* =========================================================
   전체 UI Refresh
   ========================================================= */

function refreshAll() {
  if (TSState.app.currentPage === "workspace") {
    renderWorkspace();

    if (window.TSLayout) {
      TSLayout.applyWorkspaceLayout();
    }

    if (window.TSChartInteraction) {
      TSChartInteraction.bindAllChartInteractions();
    }

    return;
  }

  if (TSState.app.currentPage === "home" && window.TSUpload) {
    TSUpload.initializeUpload();
  }
}

/* =========================================================
   자동분석 실행
   외부 버튼에서 호출 가능
   ========================================================= */

function runAutoAnalysis() {
  const sourceTrack =
    TSStore.getSelectedTrack() ||
    TSState.tracks.find((track) => track.type === "Original Data") ||
    TSState.tracks[0];

  if (!sourceTrack || !window.TSTimelineUI) {
    alert("자동분석을 실행할 Track이 없습니다.");
    return null;
  }

  const result = TSTimelineUI.runTimelineAutoAnalysis(sourceTrack.id);

  if (!result) {
    alert("자동분석 실행에 실패했습니다.");
    return null;
  }

  TSStore.setAutoAnalysisResult(result);

  result.createdTrackIds.forEach((trackId) => {
    TSStore.addAutoAnalysisTrackId(trackId);
  });

  if (window.TSRegionsUI) {
    TSRegionsUI.arrangeAutoAnalysisRegions();
  }

  refreshAll();

  return result;
}

/* =========================================================
   현재 상태 Export
   ========================================================= */

function exportProjectSnapshot() {
  return {
    app: TSState.app,
    uploadedData: TSState.uploadedData,
    tracks: TSState.tracks,
    selectedTrackId: TSState.selectedTrackId,
    regions: TSState.regions,
    selectedRegionId: TSState.selectedRegionId,
    processes: TSState.processes,
    activePopup: TSState.activePopup,
    autoAnalysis: TSState.autoAnalysis,
    assistant: TSState.assistant,
  };
}

/* =========================================================
   Debug
   ========================================================= */

function printAppStatus() {
  console.log("TS Navigator State:", exportProjectSnapshot());

  if (window.TSLayout) {
    console.log(TSLayout.getLayoutSummaryText());
  }
}

/* =========================================================
   DOMContentLoaded
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});

/* =========================================================
   전역 노출
   ========================================================= */

window.TSApp = {
  initializeApp,
  detectCurrentPage,

  initializeHome,
  initializeWorkspace,

  renderWorkspace,
  renderWorkspaceHeader,

  getAppProjectStatusText,
  getAppProjectStatusClass,

  createFallbackSampleProject,

  bindGlobalEvents,

  saveProject,
  resetProjectAndGoHome,

  refreshAll,
  runAutoAnalysis,

  exportProjectSnapshot,
  printAppStatus,
};