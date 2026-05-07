/* =========================================================
   TS Navigator - inspector.js
   Track Inspector 렌더링 / 선택 Track 정보 / 처리 버튼
   ========================================================= */

/* =========================================================
   Inspector 전체 렌더링
   ========================================================= */

function renderInspector() {
  const container = document.getElementById("trackInspector");

  if (!container) return;

  const selectedTrack = TSStore.getSelectedTrack();

  container.innerHTML = `
    <div class="inspector-header">
      <div>
        <p class="section-kicker">TRACK INSPECTOR</p>
        <h2 class="section-title">Inspector</h2>
      </div>

      <button 
        type="button" 
        class="inspector-toggle-button"
        id="inspectorToggleButton"
        title="Inspector 열기/닫기"
      >
        ${TSState.app.inspectorOpen ? "◀" : "▶"}
      </button>
    </div>

    ${
      selectedTrack
        ? createSelectedTrackInspectorHTML(selectedTrack)
        : createEmptyInspectorHTML()
    }
  `;

  bindInspectorEvents();
}

/* =========================================================
   Empty 상태
   ========================================================= */

function createEmptyInspectorHTML() {
  return `
    <div class="inspector-empty">
      <p>선택된 Track이 없습니다.</p>
      <span>Timeline에서 Track을 선택하면 상세 정보가 표시됩니다.</span>
    </div>
  `;
}

/* =========================================================
   선택 Track Inspector HTML
   ========================================================= */

function createSelectedTrackInspectorHTML(track) {
  const region = TSStore.getRegionById(track.regionId);
  const process = track.processId ? TSStore.getProcessById(track.processId) : null;

  return `
    <div class="selected-track-panel">
      <div class="selected-track-summary">
        <span 
          class="selected-track-color"
          style="background:${track.color || "#2f80ed"}"
        ></span>

        <div>
          <p class="selected-track-label">Selected Track</p>
          <h3>${escapeInspectorHTML(track.name)}</h3>
        </div>
      </div>

      <div class="inspector-status-row">
        <span class="status-pill ${getProjectStatusClass()}">
          ${getProjectStatusText()}
        </span>

        <span class="status-pill">
          ${track.locked ? "Locked" : "Editable"}
        </span>
      </div>

      <div class="inspector-section">
        <div class="inspector-section-title">Track Info</div>

        <label class="inspector-field">
          <span>Track Name</span>
          <input 
            type="text" 
            id="trackNameInput"
            value="${escapeInspectorHTML(track.name)}"
          />
        </label>

        <label class="inspector-field">
          <span>Track Color</span>
          <input 
            type="color" 
            id="trackColorInput"
            value="${track.color || "#2f80ed"}"
          />
        </label>

        <label class="inspector-field">
          <span>Track Type</span>
          <select id="trackTypeSelect">
            ${createTrackTypeOptionsHTML(track.type)}
          </select>
        </label>

        <label class="inspector-field">
          <span>Region Assignment</span>
          <select id="trackRegionSelect">
            ${createRegionOptionsHTML(track.regionId)}
          </select>
        </label>
      </div>

      <div class="inspector-section">
        <div class="inspector-section-title">Track Control</div>

        <div class="inspector-button-grid">
          <button 
            type="button" 
            class="inspector-action-button"
            data-inspector-action="toggle-visible"
          >
            ${track.visible !== false ? "Visibility OFF" : "Visibility ON"}
          </button>

          <button 
            type="button" 
            class="inspector-action-button"
            data-inspector-action="toggle-lock"
          >
            ${track.locked ? "Unlock Track" : "Lock Track"}
          </button>

          <button 
            type="button" 
            class="inspector-action-button"
            data-inspector-action="duplicate-track"
          >
            Duplicate
          </button>

          <button 
            type="button" 
            class="inspector-action-button danger"
            data-inspector-action="delete-track"
          >
            Delete
          </button>
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-section-title">Process</div>

        <div class="inspector-process-list">
          ${createProcessButtonsHTML(track)}
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-section-title">Data Summary</div>

        <div class="inspector-summary-list">
          ${createTrackSummaryHTML(track, region, process)}
        </div>
      </div>

      <div class="inspector-section">
        <div class="inspector-section-title">AI Guide</div>

        <button 
          type="button" 
          class="inspector-wide-button primary"
          data-inspector-action="ask-ai"
        >
          이 Track 기준으로 분석 추천 받기
        </button>
      </div>
    </div>
  `;
}

/* =========================================================
   Option HTML
   ========================================================= */

function createTrackTypeOptionsHTML(selectedType) {
  const types = [
    "Original Data",
    "Preprocessed Data",
    "Feature Data",
    "Forecast Data",
    "Residual Data",
    "Evaluation Result",
  ];

  return types
    .map((type) => {
      return `
        <option value="${type}" ${type === selectedType ? "selected" : ""}>
          ${type}
        </option>
      `;
    })
    .join("");
}

function createRegionOptionsHTML(selectedRegionId) {
  return TSState.regions
    .map((region) => {
      return `
        <option value="${region.id}" ${
        region.id === selectedRegionId ? "selected" : ""
      }>
          ${escapeInspectorHTML(region.name)}
        </option>
      `;
    })
    .join("");
}

/* =========================================================
   Process Buttons
   ========================================================= */

function createProcessButtonsHTML(track) {
  if (!track || track.type === "Evaluation Result") {
    return `
      <button 
        type="button" 
        class="process-button disabled"
        disabled
      >
        평가지표 Track은 추가 처리를 지원하지 않습니다.
      </button>
    `;
  }

  return `
    <button 
      type="button" 
      class="process-button"
      data-inspector-action="open-preprocessing"
    >
      전처리 설정
    </button>

    <button 
      type="button" 
      class="process-button"
      data-inspector-action="open-denoising"
    >
      잡음 완화
    </button>

    <button 
      type="button" 
      class="process-button"
      data-inspector-action="open-decomposition"
    >
      분해
    </button>

    <button 
      type="button" 
      class="process-button"
      data-inspector-action="open-forecasting"
    >
      예측 모델
    </button>

    <button 
      type="button" 
      class="process-button primary"
      data-inspector-action="run-auto-analysis"
    >
      자동분석 실행
    </button>
  `;
}

/* =========================================================
   Summary HTML
   ========================================================= */

function createTrackSummaryHTML(track, region, process) {
  const values = track.y || [];
  const validValues = TSMathUtils.cleanNumberArray(values);

  const rows = [
    ["Type", track.type],
    ["Region", region?.name || "-"],
    ["Points", values.length],
    ["Valid Values", validValues.length],
    ["Missing", values.length - validValues.length],
    ["Mean", TSMathUtils.formatNumber(TSMathUtils.mean(validValues), 4)],
    ["Min", TSMathUtils.formatNumber(TSMathUtils.min(validValues), 4)],
    ["Max", TSMathUtils.formatNumber(TSMathUtils.max(validValues), 4)],
    ["Process", process?.name || "-"],
  ];

  return rows
    .map(([label, value]) => {
      return `
        <div class="inspector-summary-row">
          <span>${escapeInspectorHTML(label)}</span>
          <strong>${escapeInspectorHTML(value)}</strong>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   Event 연결
   ========================================================= */

function bindInspectorEvents() {
  const toggleButton = document.getElementById("inspectorToggleButton");
  const nameInput = document.getElementById("trackNameInput");
  const colorInput = document.getElementById("trackColorInput");
  const typeSelect = document.getElementById("trackTypeSelect");
  const regionSelect = document.getElementById("trackRegionSelect");
  const container = document.getElementById("trackInspector");

  if (toggleButton) {
    toggleButton.addEventListener("click", handleInspectorToggle);
  }

  if (nameInput) {
    nameInput.addEventListener("change", handleTrackNameChange);
  }

  if (colorInput) {
    colorInput.addEventListener("change", handleTrackColorChange);
  }

  if (typeSelect) {
    typeSelect.addEventListener("change", handleTrackTypeChange);
  }

  if (regionSelect) {
    regionSelect.addEventListener("change", handleTrackRegionChange);
  }

  if (container) {
    container.addEventListener("click", handleInspectorActionClick);
  }
}

/* =========================================================
   기본 변경 Handler
   ========================================================= */

function handleInspectorToggle() {
  TSStore.toggleInspector();

  if (window.TSLayout) {
    TSLayout.applyWorkspaceLayout();
  }

  renderInspector();
}

function handleTrackNameChange(event) {
  const track = TSStore.getSelectedTrack();

  if (!track) return;

  TSStore.renameTrack(track.id, event.target.value.trim() || track.name);

  refreshInspectorConnectedUI();
}

function handleTrackColorChange(event) {
  const track = TSStore.getSelectedTrack();

  if (!track) return;

  TSStore.setTrackColor(track.id, event.target.value);

  refreshInspectorConnectedUI();
}

function handleTrackTypeChange(event) {
  const track = TSStore.getSelectedTrack();

  if (!track) return;

  TSStore.updateTrack(track.id, {
    type: event.target.value,
  });

  refreshInspectorConnectedUI();
}

function handleTrackRegionChange(event) {
  const track = TSStore.getSelectedTrack();

  if (!track) return;

  TSStore.assignTrackToRegion(track.id, event.target.value);

  refreshInspectorConnectedUI();
}

/* =========================================================
   Inspector Action
   ========================================================= */

function handleInspectorActionClick(event) {
  const button = event.target.closest("[data-inspector-action]");

  if (!button) return;

  const action = button.dataset.inspectorAction;
  const track = TSStore.getSelectedTrack();

  if (!track) return;

  switch (action) {
    case "toggle-visible":
      TSStore.toggleTrackVisibility(track.id);
      break;

    case "toggle-lock":
      TSStore.toggleTrackLock(track.id);
      break;

    case "duplicate-track":
      TSStore.duplicateTrack(track.id);
      break;

    case "delete-track":
      deleteSelectedTrack(track.id);
      break;

    case "open-preprocessing":
      openProcessPopupFromInspector(track.id, "preprocessing");
      break;

    case "open-denoising":
      openProcessPopupFromInspector(track.id, "denoising");
      break;

    case "open-decomposition":
      openProcessPopupFromInspector(track.id, "decomposition");
      break;

    case "open-forecasting":
      openProcessPopupFromInspector(track.id, "forecasting");
      break;

    case "run-auto-analysis":
      runAutoAnalysisFromInspector(track.id);
      break;

    case "ask-ai":
      askAIFromInspector(track);
      break;

    default:
      break;
  }

  refreshInspectorConnectedUI();
}

function deleteSelectedTrack(trackId) {
  const track = TSStore.getTrackById(trackId);

  if (!track) return;

  const confirmed = window.confirm(`"${track.name}" Track을 삭제할까요?`);

  if (!confirmed) return;

  TSStore.deleteTrack(trackId);
}

/* =========================================================
   Process Popup 연결
   ========================================================= */

function openProcessPopupFromInspector(trackId, type) {
  const process = TSStore.createProcess({
    name: getProcessNameByType(type),
    type,
    trackId,
    parameters: getDefaultProcessParameters(type),
    status: "ready",
  });

  if (window.TSPopupUI) {
    TSPopupUI.openPopup(process.id, type);
  }
}

function getProcessNameByType(type) {
  switch (type) {
    case "preprocessing":
      return "Preprocessing";

    case "denoising":
      return "Denoising";

    case "decomposition":
      return "Decomposition";

    case "forecasting":
      return "Forecasting";

    default:
      return "Process";
  }
}

function getDefaultProcessParameters(type) {
  switch (type) {
    case "preprocessing":
      return {
        missingMethod: "linear",
        outlierMethod: "iqr",
        outlierAction: "interpolate",
        scaleMethod: "none",
        resampleFrequency: "",
      };

    case "denoising":
      return {
        method: "moving-average",
        windowSize: 5,
        alpha: 0.3,
        fourierKeepRatio: 0.2,
      };

    case "decomposition":
      return {
        model: "additive",
        period: 12,
        trendWindow: 12,
      };

    case "forecasting":
      return {
        method: "holt",
        horizon: 12,
        trainRatio: 0.8,
        windowSize: 5,
        alpha: 0.3,
        beta: 0.1,
        arimaP: 1,
        arimaD: 1,
        arimaQ: 0,
      };

    default:
      return {};
  }
}

/* =========================================================
   자동분석
   ========================================================= */

function runAutoAnalysisFromInspector(trackId) {
  if (!window.TSTimelineUI) return;

  const result = TSTimelineUI.runTimelineAutoAnalysis(trackId);

  if (!result) {
    alert("자동분석을 실행할 수 없습니다.");
    return;
  }

  TSStore.setAutoAnalysisResult(result);

  result.createdTrackIds.forEach((createdTrackId) => {
    TSStore.addAutoAnalysisTrackId(createdTrackId);
  });
}

/* =========================================================
   AI Assistant 연결
   ========================================================= */

function askAIFromInspector(track) {
  if (!track) return;

  const summary = createAIQuestionFromTrack(track);

  if (window.TSAssistantUI) {
    TSAssistantUI.openAssistantWithMessage(summary);
  } else {
    TSStore.openAssistant();
    TSStore.addAssistantMessage("user", summary);
  }
}

function createAIQuestionFromTrack(track) {
  const values = track.y || [];
  const validValues = TSMathUtils.cleanNumberArray(values);

  return [
    `"${track.name}" Track을 기준으로 분석 방법을 추천해줘.`,
    "",
    `Track Type: ${track.type}`,
    `Data Points: ${values.length}`,
    `Valid Values: ${validValues.length}`,
    `Missing Values: ${values.length - validValues.length}`,
    `Mean: ${TSMathUtils.formatNumber(TSMathUtils.mean(validValues), 4)}`,
    `Min: ${TSMathUtils.formatNumber(TSMathUtils.min(validValues), 4)}`,
    `Max: ${TSMathUtils.formatNumber(TSMathUtils.max(validValues), 4)}`,
    "",
    "전처리, 분해, 예측 모델, 평가지표를 어떤 순서로 적용하면 좋을지 알려줘.",
  ].join("\n");
}

/* =========================================================
   Project Status
   ========================================================= */

function getProjectStatusText() {
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

function getProjectStatusClass() {
  switch (TSState.app.projectStatus) {
    case "saved":
      return "success";

    case "modified":
    case "need-recalculate":
      return "warning";

    case "loaded":
      return "primary";

    default:
      return "";
  }
}

/* =========================================================
   연결 UI 새로고침
   ========================================================= */

function refreshInspectorConnectedUI() {
  renderInspector();

  if (window.TSTimelineUI) {
    TSTimelineUI.renderTimeline();
  }

  if (window.TSRegionsUI) {
    TSRegionsUI.renderRegions();
  }

  if (window.TSChartInteraction) {
    TSChartInteraction.bindAllChartInteractions();
  }
}

/* =========================================================
   HTML Escape
   ========================================================= */

function escapeInspectorHTML(value) {
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

window.TSInspectorUI = {
  renderInspector,

  createEmptyInspectorHTML,
  createSelectedTrackInspectorHTML,

  createTrackTypeOptionsHTML,
  createRegionOptionsHTML,
  createProcessButtonsHTML,
  createTrackSummaryHTML,

  bindInspectorEvents,

  handleInspectorToggle,
  handleTrackNameChange,
  handleTrackColorChange,
  handleTrackTypeChange,
  handleTrackRegionChange,

  handleInspectorActionClick,
  deleteSelectedTrack,

  openProcessPopupFromInspector,
  getProcessNameByType,
  getDefaultProcessParameters,

  runAutoAnalysisFromInspector,

  askAIFromInspector,
  createAIQuestionFromTrack,

  getProjectStatusText,
  getProjectStatusClass,

  refreshInspectorConnectedUI,
};