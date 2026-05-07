/* =========================================================
   TS Navigator - layout.js
   Workspace 3분할 레이아웃
   Inspector open/close: 18/10/72, 3/10/87 비율 반영
   ========================================================= */

/* =========================================================
   레이아웃 상수
   ========================================================= */

const TSLayoutConfig = {
  open: {
    inspector: 18,
    timeline: 10,
    region: 72,
  },

  closed: {
    inspector: 3,
    timeline: 10,
    region: 87,
  },

  minWidth: {
    inspectorOpen: 220,
    inspectorClosed: 42,
    timeline: 120,
    region: 480,
  },
};

/* =========================================================
   Workspace Layout 적용
   ========================================================= */

function applyWorkspaceLayout() {
  const workspace = document.getElementById("workspaceLayout");
  const inspector = document.getElementById("trackInspector");
  const timeline = document.getElementById("trackTimeline");
  const regions = document.getElementById("visualizationRegions");

  if (!workspace || !inspector || !timeline || !regions) return;

  const ratio = TSState.app.inspectorOpen
    ? TSLayoutConfig.open
    : TSLayoutConfig.closed;

  workspace.style.gridTemplateColumns = `${ratio.inspector}% ${ratio.timeline}% ${ratio.region}%`;

  workspace.dataset.inspector = TSState.app.inspectorOpen ? "open" : "closed";

  inspector.classList.toggle("closed", !TSState.app.inspectorOpen);
  timeline.classList.toggle("inspector-closed", !TSState.app.inspectorOpen);
  regions.classList.toggle("inspector-closed", !TSState.app.inspectorOpen);

  updateInspectorCollapsedContent();
  resizeChartsAfterLayoutChange();
}

/* =========================================================
   Inspector 접힘 상태 표시
   ========================================================= */

function updateInspectorCollapsedContent() {
  const inspector = document.getElementById("trackInspector");

  if (!inspector) return;

  if (TSState.app.inspectorOpen) {
    inspector.dataset.collapsedLabel = "";
    return;
  }

  inspector.dataset.collapsedLabel = "TRACK INSPECTOR";
}

/* =========================================================
   Inspector Toggle
   ========================================================= */

function toggleInspectorLayout() {
  TSStore.toggleInspector();

  applyWorkspaceLayout();

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }
}

function openInspectorLayout() {
  TSStore.setInspectorOpen(true);

  applyWorkspaceLayout();

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }
}

function closeInspectorLayout() {
  TSStore.setInspectorOpen(false);

  applyWorkspaceLayout();

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }
}

/* =========================================================
   Workspace 높이 계산
   ========================================================= */

function updateWorkspaceHeight() {
  const header = document.querySelector(".workspace-header");
  const workspace = document.getElementById("workspaceLayout");

  if (!workspace) return;

  const headerHeight = header ? header.offsetHeight : 64;

  workspace.style.height = `calc(100vh - ${headerHeight}px)`;
}

/* =========================================================
   Resize 대응
   ========================================================= */

function bindLayoutResize() {
  window.addEventListener("resize", handleLayoutResize);
}

function handleLayoutResize() {
  updateWorkspaceHeight();
  applyResponsiveLayout();
  resizeChartsAfterLayoutChange();
}

function applyResponsiveLayout() {
  const workspace = document.getElementById("workspaceLayout");

  if (!workspace) return;

  const width = window.innerWidth;

  if (width < 900) {
    workspace.classList.add("compact-layout");
  } else {
    workspace.classList.remove("compact-layout");
  }
}

/* =========================================================
   Chart Resize
   ========================================================= */

function resizeChartsAfterLayoutChange() {
  window.setTimeout(() => {
    if (window.TSChartCore) {
      TSChartCore.resizeAllPlots();
    }
  }, 250);
}

/* =========================================================
   Region Layout 보조
   ========================================================= */

function setRegionLayoutMode(mode = "auto") {
  const grid = document.getElementById("regionsGrid");

  if (!grid) return;

  grid.dataset.layoutMode = mode;

  if (mode === "vertical") {
    grid.classList.add("vertical-layout");
    grid.classList.remove("horizontal-layout");
  } else if (mode === "horizontal") {
    grid.classList.add("horizontal-layout");
    grid.classList.remove("vertical-layout");
  } else {
    grid.classList.remove("vertical-layout");
    grid.classList.remove("horizontal-layout");
  }

  resizeChartsAfterLayoutChange();
}

function toggleRegionLayoutMode() {
  const grid = document.getElementById("regionsGrid");

  if (!grid) return;

  const current = grid.dataset.layoutMode || "auto";

  if (current === "auto") {
    setRegionLayoutMode("horizontal");
  } else if (current === "horizontal") {
    setRegionLayoutMode("vertical");
  } else {
    setRegionLayoutMode("auto");
  }
}

/* =========================================================
   Workspace 초기화
   ========================================================= */

function initializeWorkspaceLayout() {
  updateWorkspaceHeight();
  applyResponsiveLayout();
  applyWorkspaceLayout();
  bindLayoutResize();
  bindLayoutKeyboardShortcuts();
}

/* =========================================================
   Keyboard Shortcut
   ========================================================= */

function bindLayoutKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    const isInput =
      event.target.tagName === "INPUT" ||
      event.target.tagName === "TEXTAREA" ||
      event.target.tagName === "SELECT";

    if (isInput) return;

    if (event.key.toLowerCase() === "i") {
      toggleInspectorLayout();
    }

    if (event.key.toLowerCase() === "r") {
      toggleRegionLayoutMode();
    }

    if (event.key === "Escape") {
      if (window.TSPopupUI && TSState.activePopup.isOpen) {
        TSPopupUI.closePopup();
      }
    }
  });
}

/* =========================================================
   Layout 상태 표시
   ========================================================= */

function getCurrentLayoutRatio() {
  return TSState.app.inspectorOpen
    ? { ...TSLayoutConfig.open }
    : { ...TSLayoutConfig.closed };
}

function getLayoutSummaryText() {
  const ratio = getCurrentLayoutRatio();

  return [
    `TRACK INSPECTOR : ${ratio.inspector}%`,
    `TRACK TIMELINE : ${ratio.timeline}%`,
    `VISUALIZATION REGION : ${ratio.region}%`,
  ].join("\n");
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSLayout = {
  TSLayoutConfig,

  applyWorkspaceLayout,

  updateInspectorCollapsedContent,

  toggleInspectorLayout,
  openInspectorLayout,
  closeInspectorLayout,

  updateWorkspaceHeight,
  bindLayoutResize,
  handleLayoutResize,
  applyResponsiveLayout,

  resizeChartsAfterLayoutChange,

  setRegionLayoutMode,
  toggleRegionLayoutMode,

  initializeWorkspaceLayout,

  bindLayoutKeyboardShortcuts,

  getCurrentLayoutRatio,
  getLayoutSummaryText,
};