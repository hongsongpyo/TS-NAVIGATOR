/* =========================================================
   TS Navigator - popup.js
   ---------------------------------------------------------
   역할
   1. Add Analysis 팝업 렌더링
   2. 각 분석 항목별 파라미터 팝업 렌더링
   3. Structure, Missing, Outlier, Resampling, Smoothing,
      Decomposition, Stationarity, Feature, Forecast,
      Validation, Residual, Metrics, Compare, Auto Analysis 연결
   4. 파라미터 저장
   5. 분석 실행 후 Track / Region 갱신
========================================================= */

/* =========================================================
   1. DOM 참조
========================================================= */

let popupRoot = null;

/* =========================================================
   2. 분석 메뉴 구성
========================================================= */

const TSPopupAnalysisGroups = [
  {
    label: "Required",
    items: [
      { type: "Structure", icon: "▣" },
      { type: "Missing", icon: "∅" },
      { type: "Forecast", icon: "↗" },
      { type: "Metrics", icon: "▤" }
    ]
  },
  {
    label: "Optional",
    items: [
      { type: "Outlier", icon: "!" },
      { type: "Resampling", icon: "↔" },
      { type: "Smoothing", icon: "⌁" },
      { type: "Decomposition", icon: "≋" },
      { type: "Stationarity", icon: "Δ" },
      { type: "Feature", icon: "ƒ" },
      { type: "Validation", icon: "✓" },
      { type: "Residual", icon: "ε" },
      { type: "Compare", icon: "⇄" }
    ]
  },
  {
    label: "Auto",
    items: [
      { type: "Auto Analysis", icon: "✦" }
    ]
  }
];

/* =========================================================
   3. 초기화
========================================================= */

function initPopup() {
  ensurePopupRoot();
  bindPopupEvents();
  renderPopup();
}

function ensurePopupRoot() {
  popupRoot = document.getElementById("tsPopupRoot");

  if (!popupRoot) {
    popupRoot = document.createElement("div");
    popupRoot.id = "tsPopupRoot";
    document.body.appendChild(popupRoot);
  }
}

function bindPopupEvents() {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handlePopupKeydown);
}

/* =========================================================
   4. Popup 렌더링
========================================================= */

function renderPopup() {
  ensurePopupRoot();

  if (!window.TSState?.popup?.isOpen) {
    popupRoot.innerHTML = "";
    return;
  }

  const popupState = window.TSState.popup;

  if (popupState.mode === "add-analysis") {
    popupRoot.innerHTML = createAddAnalysisPopupHTML(popupState);
    return;
  }

  if (popupState.mode === "region-setting") {
    popupRoot.innerHTML = createRegionSettingPopupHTML(popupState);
    return;
  }

  popupRoot.innerHTML = createParameterPopupHTML(popupState);
}

/* =========================================================
   5. Add Analysis 팝업
========================================================= */

function createAddAnalysisPopupHTML(popupState) {
  const style = createPopupPositionStyle(popupState);

  return `
    <div class="popup-menu" style="${style}" data-popup="add-analysis">
      <div class="popup-title">
        <span>Add Analysis</span>
        <button class="popup-close" data-popup-action="close">×</button>
      </div>

      ${TSPopupAnalysisGroups.map(group => `
        <div class="popup-section">
          <div class="popup-section-label">${escapeHTML(group.label)}</div>

          ${group.items.map(item => `
            <div
              class="menu-item"
              data-popup-action="select-analysis"
              data-analysis-type="${escapeHTML(item.type)}"
            >
              <span class="menu-icon">${item.icon}</span>
              <span>${escapeHTML(item.type)}</span>
              <span class="menu-arrow">›</span>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

/* =========================================================
   6. Parameter 팝업
========================================================= */

function createParameterPopupHTML(popupState) {
  const track = window.TSStore?.getTrack(popupState.targetTrackId);
  const stackItem = track?.analysisStack?.find(item => item.id === popupState.targetStackId);

  const analysisType =
    popupState.analysisType ||
    stackItem?.analysisType ||
    "Structure";

  const params = {
    ...(window.TSStore?.getDefaultParams(analysisType) || {}),
    ...(stackItem?.params || {})
  };

  const resultHTML = createCurrentResultHTML(track, analysisType);
  const style = createPopupPositionStyle(popupState);

  return `
    <div class="analysis-popup" style="${style}" data-popup="parameter">
      <div class="analysis-popup-head">
        <span>${escapeHTML(analysisType)} Parameters</span>
        <button class="popup-close" data-popup-action="close">×</button>
      </div>

      <div class="analysis-popup-body">
        ${createParameterFieldsHTML(analysisType, params)}

        ${resultHTML}

        <button
          class="apply-btn"
          data-popup-action="apply-analysis"
          data-analysis-type="${escapeHTML(analysisType)}"
        >
          Apply Analysis
        </button>
      </div>
    </div>
  `;
}

/* =========================================================
   7. 분석별 파라미터 필드
========================================================= */

function createParameterFieldsHTML(analysisType, params) {
  if (analysisType === "Structure") {
    return `
      ${createSelectRow("datetimeColumn", "Date", params.datetimeColumn, createColumnOptions("auto"))}
      ${createSelectRow("targetColumn", "Target", params.targetColumn, createColumnOptions("auto"))}
      ${createSelectRow("handleDuplicateTimestamp", "Duplicate", params.handleDuplicateTimestamp, [
        ["mean", "mean"],
        ["first", "first"],
        ["last", "last"],
        ["sum", "sum"]
      ])}
    `;
  }

  if (analysisType === "Missing") {
    return `
      ${createSelectRow("method", "Method", params.method, [
        ["linear", "Linear"],
        ["locf", "LOCF"],
        ["nocb", "NOCB"],
        ["mean", "Mean"],
        ["moving-average", "Moving Average"]
      ])}
      ${createNumberRow("windowSize", "Window", params.windowSize || 3)}
      ${createSelectRow("scope", "Scope", params.scope, [
        ["entire-series", "Entire Series"],
        ["selected-range", "Selected Range"]
      ])}
    `;
  }

  if (analysisType === "Outlier") {
    return `
      ${createSelectRow("method", "Method", params.method, [
        ["hampel", "Hampel"],
        ["z-score", "Z-score"],
        ["iqr", "IQR"]
      ])}
      ${createNumberRow("windowSize", "Window", params.windowSize || 7)}
      ${createNumberRow("threshold", "Threshold", params.threshold || 3)}
      ${createSelectRow("replaceWith", "Replace", params.replaceWith, [
        ["linear-interpolation", "Linear"],
        ["median", "Median"],
        ["mean", "Mean"],
        ["keep", "Keep"]
      ])}
    `;
  }

  if (analysisType === "Resampling") {
    return `
      ${createSelectRow("frequency", "Freq", params.frequency, [
        ["auto", "Auto"],
        ["D", "Daily"],
        ["W", "Weekly"],
        ["M", "Monthly"],
        ["Q", "Quarterly"],
        ["Y", "Yearly"]
      ])}
      ${createSelectRow("method", "Method", params.method, [
        ["asfreq", "As Frequency"],
        ["mean", "Mean"],
        ["sum", "Sum"],
        ["last", "Last"]
      ])}
      ${createSelectRow("fillMethod", "Fill", params.fillMethod, [
        ["interpolate", "Interpolate"],
        ["locf", "LOCF"],
        ["nocb", "NOCB"],
        ["none", "None"]
      ])}
    `;
  }

  if (analysisType === "Smoothing") {
    return `
      ${createSelectRow("method", "Method", params.method, [
        ["moving-average", "Moving Average"],
        ["centered-moving-average", "Centered MA"],
        ["exponential", "Exponential"],
        ["holt", "Holt"],
        ["holt-winters", "Holt-Winters"]
      ])}
      ${createNumberRow("windowSize", "Window", params.windowSize || 3)}
      ${createNumberRow("alpha", "Alpha", params.alpha || 0.3, 0.01)}
      ${createNumberRow("seasonalPeriod", "Season", params.seasonalPeriod || 12)}
    `;
  }

  if (analysisType === "Decomposition") {
    return `
      ${createSelectRow("method", "Method", params.method, [
        ["STL", "STL"],
        ["classical", "Classical"]
      ])}
      ${createSelectRow("model", "Model", params.model, [
        ["additive", "Additive"],
        ["multiplicative", "Multiplicative"]
      ])}
      ${createNumberRow("seasonalPeriod", "Season", params.seasonalPeriod || 12)}
    `;
  }

  if (analysisType === "Stationarity") {
    return `
      ${createSelectRow("test", "Test", params.test, [
        ["ADF", "ADF"],
        ["rolling-stat", "Rolling Stat"]
      ])}
      ${createNumberRow("alpha", "Alpha", params.alpha || 0.05, 0.01)}
      ${createSelectRow("transform", "Transform", params.transform, [
        ["none", "None"],
        ["log", "Log"],
        ["difference", "Difference"],
        ["log-difference", "Log + Difference"]
      ])}
      ${createNumberRow("differencingOrder", "Diff", params.differencingOrder || 1)}
    `;
  }

  if (analysisType === "Feature") {
    return `
      ${createNumberRow("lagCount", "Lag", params.lagCount || 3)}
      ${createNumberRow("rollingWindow", "Rolling", params.rollingWindow || 3)}
      ${createSelectRow("includeTimeFeatures", "Time", String(params.includeTimeFeatures), [
        ["true", "Include"],
        ["false", "Exclude"]
      ])}
      ${createSelectRow("includeSeasonalFeatures", "Seasonal", String(params.includeSeasonalFeatures), [
        ["true", "Include"],
        ["false", "Exclude"]
      ])}
    `;
  }

  if (analysisType === "Forecast") {
    return `
      ${createSelectRow("model", "Model", params.model, [
        ["naive", "Naive"],
        ["mean", "Mean"],
        ["moving-average", "Moving Average"],
        ["exponential-smoothing", "Exp. Smoothing"],
        ["holt", "Holt"],
        ["holt-winters", "Holt-Winters"],
        ["arima", "ARIMA"]
      ])}
      ${createNumberRow("horizon", "Horizon", params.horizon || 12)}
      ${createSelectRow("horizonType", "Type", params.horizonType, [
        ["relative", "Relative"],
        ["absolute", "Absolute"]
      ])}
      ${createNumberRow("seasonalPeriod", "Season", params.seasonalPeriod || 12)}
    `;
  }

  if (analysisType === "Validation") {
    return `
      ${createSelectRow("method", "Method", params.method, [
        ["train-test-split", "Train/Test"],
        ["rolling", "Rolling"],
        ["expanding", "Expanding"]
      ])}
      ${createNumberRow("testSize", "Test", params.testSize || 0.2, 0.05)}
      ${createNumberRow("rollingWindow", "Window", params.rollingWindow || 12)}
    `;
  }

  if (analysisType === "Residual") {
    return `
      ${createSelectRow("whiteNoiseTest", "Test", params.whiteNoiseTest, [
        ["ljung-box", "Ljung-Box"],
        ["none", "None"]
      ])}
      ${createNumberRow("lag", "Lag", params.lag || 12)}
    `;
  }

  if (analysisType === "Metrics") {
    return `
      ${createSelectRow("metricSet", "Metrics", params.metricSet || "basic", [
        ["basic", "MAE/RMSE/MAPE"],
        ["full", "Full Metrics"],
        ["scale-free", "Scale Free"]
      ])}
      ${createSelectRow("zeroHandling", "Zero", params.zeroHandling, [
        ["safe", "Safe"],
        ["ignore", "Ignore"],
        ["epsilon", "Epsilon"]
      ])}
    `;
  }

  if (analysisType === "Compare") {
    return `
      ${createSelectRow("compareBy", "By", params.compareBy, [
        ["metrics", "Metrics"],
        ["forecast", "Forecast"],
        ["residual", "Residual"]
      ])}
      ${createSelectRow("baselineTrackId", "Base", params.baselineTrackId, createTrackOptions("none"))}
    `;
  }

  if (analysisType === "Auto Analysis") {
    return `
      ${createSelectRow("modelSelection", "Model", params.modelSelection, [
        ["auto", "Auto"],
        ["fast", "Fast"],
        ["accurate", "Accurate"]
      ])}
      ${createNumberRow("horizon", "Horizon", params.horizon || 12)}
      ${createSelectRow("runMissing", "Missing", String(params.runMissing), [
        ["true", "Run"],
        ["false", "Skip"]
      ])}
      ${createSelectRow("runOutlier", "Outlier", String(params.runOutlier), [
        ["true", "Run"],
        ["false", "Skip"]
      ])}
    `;
  }

  return `<div class="result-box">설정할 파라미터가 없습니다.</div>`;
}

/* =========================================================
   8. Region Setting 팝업
========================================================= */

function createRegionSettingPopupHTML(popupState) {
  const region = window.TSStore?.getRegion(window.TSState?.selectedRegionId);
  const style = createPopupPositionStyle(popupState);

  return `
    <div class="analysis-popup" style="${style}" data-popup="region-setting">
      <div class="analysis-popup-head">
        <span>Region Setting</span>
        <button class="popup-close" data-popup-action="close">×</button>
      </div>

      <div class="analysis-popup-body">
        <div class="result-box">
          <strong>${escapeHTML(region?.name || "Region")}</strong><br />
          Region Type: ${escapeHTML(region?.type || "time-series")}<br />
          Assigned Tracks: ${region?.trackIds?.length || 0}
        </div>

        ${createSelectRow("regionType", "Type", region?.type || "time-series", [
          ["time-series", "Time Series"],
          ["forecast", "Forecast"],
          ["metrics", "Metrics"],
          ["residual", "Residual"],
          ["compare", "Compare"]
        ])}

        <button class="apply-btn" data-popup-action="apply-region-setting">
          Apply Region Setting
        </button>
      </div>
    </div>
  `;
}

/* =========================================================
   9. Row 생성 유틸
========================================================= */

function createSelectRow(name, label, value, options) {
  return `
    <div class="param-row">
      <label>${escapeHTML(label)}</label>
      <select data-param="${escapeHTML(name)}">
        ${options.map(option => {
          const optionValue = Array.isArray(option) ? option[0] : option;
          const optionLabel = Array.isArray(option) ? option[1] : option;
          const selected = String(optionValue) === String(value) ? "selected" : "";

          return `
            <option value="${escapeHTML(optionValue)}" ${selected}>
              ${escapeHTML(optionLabel)}
            </option>
          `;
        }).join("")}
      </select>
    </div>
  `;
}

function createNumberRow(name, label, value, step = 1) {
  return `
    <div class="param-row">
      <label>${escapeHTML(label)}</label>
      <input
        type="number"
        step="${step}"
        value="${escapeHTML(value)}"
        data-param="${escapeHTML(name)}"
      />
    </div>
  `;
}

function createColumnOptions(first = "auto") {
  const columns = window.TSState?.dataset?.columns || [];
  const options = [[first, first]];

  columns.forEach(column => {
    options.push([column, column]);
  });

  return options;
}

function createTrackOptions(first = "none") {
  const tracks = window.TSState?.tracks || [];
  const options = [[first, first]];

  tracks.forEach(track => {
    options.push([track.id, track.name]);
  });

  return options;
}

/* =========================================================
   10. Popup 이벤트 처리
========================================================= */

function handleDocumentClick(event) {
  const actionTarget = event.target.closest("[data-popup-action]");

  if (actionTarget) {
    handlePopupAction(event, actionTarget);
    return;
  }

  const popupElement = event.target.closest(".popup-menu, .analysis-popup");
  const triggerElement = event.target.closest("[data-action]");

  if (!popupElement && !triggerElement && window.TSState?.popup?.isOpen) {
    closePopup();
  }
}

function handlePopupKeydown(event) {
  if (event.key === "Escape") {
    closePopup();
  }
}

function handlePopupAction(event, target) {
  event.preventDefault();
  event.stopPropagation();

  const action = target.dataset.popupAction;

  if (action === "close") {
    closePopup();
    return;
  }

  if (action === "select-analysis") {
    selectAnalysisType(target.dataset.analysisType);
    return;
  }

  if (action === "apply-analysis") {
    applyAnalysis(target.dataset.analysisType);
    return;
  }

  if (action === "apply-region-setting") {
    applyRegionSetting();
  }
}

/* =========================================================
   11. Add Analysis → Parameter Popup 전환
========================================================= */

function selectAnalysisType(analysisType) {
  const popupState = window.TSState.popup;
  const trackId = popupState.targetTrackId;
  const params = window.TSStore.getDefaultParams(analysisType);

  const stackItem = window.TSStore.addAnalysisToTrack(trackId, analysisType, params);

  window.TSStore.openAnalysisPopup({
    mode: "parameter",
    trackId,
    stackId: stackItem.id,
    analysisType,
    x: popupState.position.x + 235,
    y: popupState.position.y
  });

  refreshWorkspace("SELECT_ANALYSIS");
}

/* =========================================================
   12. 파라미터 수집 / 저장
========================================================= */

function collectPopupParams() {
  const popupElement = popupRoot.querySelector(".analysis-popup");
  if (!popupElement) return {};

  const fields = popupElement.querySelectorAll("[data-param]");
  const params = {};

  fields.forEach(field => {
    const key = field.dataset.param;
    let value = field.value;

    if (field.type === "number") {
      value = Number(value);
    }

    if (value === "true") value = true;
    if (value === "false") value = false;

    params[key] = value;
  });

  return params;
}

function saveCurrentParams() {
  const params = collectPopupParams();
  const popupState = window.TSState.popup;

  if (popupState.targetTrackId && popupState.targetStackId) {
    window.TSStore.updateStackItem(
      popupState.targetTrackId,
      popupState.targetStackId,
      { params }
    );
  }

  return params;
}

/* =========================================================
   13. 분석 실행
========================================================= */

function applyAnalysis(analysisType) {
  const popupState = window.TSState.popup;
  const trackId = popupState.targetTrackId;
  const stackId = popupState.targetStackId;
  const params = saveCurrentParams();

  if (!trackId) return;

  window.TSStore.updateStackItem(trackId, stackId, {
    status: "running"
  });

  let result = null;

  if (analysisType === "Structure" && window.TSStructureAnalysis) {
    result = window.TSStructureAnalysis.runStructureAnalysisOnTrack(trackId, params);
  } else if (analysisType === "Forecast" && window.TSForecastAnalysis) {
    result = window.TSForecastAnalysis.runForecastAnalysisOnTrack(trackId, params);
  } else if (analysisType === "Auto Analysis" && window.TSForecastAnalysis) {
    result = window.TSForecastAnalysis.runForecastAnalysisOnTrack(trackId, params);
  } else {
    result = runPlaceholderAnalysis(trackId, analysisType, params);
  }

  if (result?.status === "error") {
    window.TSStore.markStackItemError(trackId, stackId, result.message);
  } else {
    window.TSStore.markStackItemDone(
      trackId,
      stackId,
      createAnalysisSummary(analysisType, result)
    );
  }

  closePopup();

  if (window.TSLayout) {
    window.TSLayout.dispatchStateChange(`APPLY_${analysisType}`);
  } else {
    refreshWorkspace(`APPLY_${analysisType}`);
  }
}

/* =========================================================
   14. 아직 구현 전 분석 Placeholder
========================================================= */

function runPlaceholderAnalysis(trackId, analysisType, params) {
  const track = window.TSStore.getTrack(trackId);
  if (!track) return null;

  const result = {
    type: analysisType,
    status: "done",
    params,
    messages: [
      `${analysisType} 설정이 Track에 저장되었습니다.`,
      "실제 계산 로직은 해당 analysis 파일에서 이어서 연결됩니다."
    ]
  };

  const typeMap = {
    Missing: "Preprocessed Data",
    Outlier: "Preprocessed Data",
    Resampling: "Preprocessed Data",
    Smoothing: "Preprocessed Data",
    Decomposition: "Preprocessed Data",
    Stationarity: "Preprocessed Data",
    Feature: "Feature Data",
    Forecast: "Forecast Data",
    Validation: "Evaluation Result",
    Residual: "Residual Data",
    Metrics: "Evaluation Result",
    Compare: "Compare Result",
    "Auto Analysis": "Auto Analysis Result"
  };

  window.TSStore.updateTrack(trackId, {
    type: typeMap[analysisType] || track.type
  });

  window.TSStore.commitTrackResult(trackId, {
    data: track.data,
    metadata: {
      ...track.metadata,
      lastAnalysis: analysisType,
      lastParams: params
    },
    result
  });

  return result;
}

/* =========================================================
   15. Region Setting 적용
========================================================= */

function applyRegionSetting() {
  const regionId = window.TSState?.selectedRegionId;
  const region = window.TSStore?.getRegion(regionId);
  if (!region) return;

  const params = collectPopupParams();

  region.type = params.regionType || region.type;
  region.updatedAt = new Date().toISOString();

  closePopup();
  refreshWorkspace("APPLY_REGION_SETTING");
}

/* =========================================================
   16. 결과 표시
========================================================= */

function createCurrentResultHTML(track, analysisType) {
  if (!track?.result) {
    return `
      <div class="result-box">
        ${escapeHTML(analysisType)} 실행 전입니다.
      </div>
    `;
  }

  const resultType = track.result.type || "";

  if (resultType === "Structure" && window.TSStructureAnalysis) {
    return window.TSStructureAnalysis.createStructureResultHTML(track.result);
  }

  if (track.result.messages) {
    return `
      <div class="result-box">
        <strong>Current Result</strong><br />
        ${track.result.messages.map(escapeHTML).join("<br />")}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Current Result</strong><br />
      ${escapeHTML(JSON.stringify(track.result, null, 2)).replace(/\n/g, "<br />")}
    </div>
  `;
}

function createAnalysisSummary(analysisType, result) {
  if (result?.messages?.[0]) {
    return result.messages[0];
  }

  if (analysisType === "Structure" && window.TSStructureAnalysis) {
    return window.TSStructureAnalysis.createStructureShortSummary(result);
  }

  return `${analysisType} applied`;
}

/* =========================================================
   17. 닫기 / 위치
========================================================= */

function closePopup() {
  if (window.TSStore) {
    window.TSStore.closeAnalysisPopup();
  }

  renderPopup();
}

function createPopupPositionStyle(popupState) {
  const x = Math.min(
    Math.max(popupState.position?.x || 120, 12),
    window.innerWidth - 320
  );

  const y = Math.min(
    Math.max(popupState.position?.y || 80, 48),
    window.innerHeight - 420
  );

  return `left:${x}px; top:${y}px;`;
}

/* =========================================================
   18. Workspace 갱신
========================================================= */

function refreshWorkspace(actionName) {
  renderPopup();

  if (window.TSLayout) {
    window.TSLayout.dispatchStateChange(actionName);
    return;
  }

  if (window.TSInspectorUI) window.TSInspectorUI.renderInspector();
  if (window.TSTimelineUI) window.TSTimelineUI.renderTimeline();
  if (window.TSRegionUI) window.TSRegionUI.renderRegions();
}

/* =========================================================
   19. 유틸
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   20. 외부 접근용 객체
========================================================= */

window.TSPopupUI = {
  initPopup,
  renderPopup,
  closePopup,

  createAddAnalysisPopupHTML,
  createParameterPopupHTML,
  createParameterFieldsHTML,

  collectPopupParams,
  saveCurrentParams,
  applyAnalysis,
  selectAnalysisType
};

/* =========================================================
   21. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initPopup();
});