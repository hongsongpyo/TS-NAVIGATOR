/* =========================================================
   TS Navigator - popup.js
   Process Popup 공통 구조
   전처리 / 잡음 완화 / 분해 / 예측 설정 및 실행
   ========================================================= */

/* =========================================================
   Popup 열기 / 닫기
   ========================================================= */

function openPopup(processId, type = null) {
  const process = TSStore.getProcessById(processId);

  if (!process) return;

  TSStore.openProcessPopup(processId, type || process.type);

  renderPopup();
}

function closePopup() {
  TSStore.closeProcessPopup();

  const container = document.getElementById("processPopupRoot");

  if (container) {
    container.innerHTML = "";
  }
}

/* =========================================================
   Popup 렌더링
   ========================================================= */

function renderPopup() {
  let container = document.getElementById("processPopupRoot");

  if (!container) {
    container = document.createElement("div");
    container.id = "processPopupRoot";
    document.body.appendChild(container);
  }

  if (!TSState.activePopup.isOpen) {
    container.innerHTML = "";
    return;
  }

  const process = TSStore.getProcessById(TSState.activePopup.processId);

  if (!process) {
    closePopup();
    return;
  }

  const track = TSStore.getTrackById(process.trackId);
  const type = TSState.activePopup.type || process.type;

  container.innerHTML = `
    <div class="popup-backdrop" id="processPopupBackdrop">
      <section class="process-popup" role="dialog" aria-modal="true">
        <div class="process-popup-header">
          <div>
            <p class="section-kicker">PROCESS POPUP</p>
            <h2>${escapePopupHTML(getPopupTitle(type))}</h2>
            <span>${escapePopupHTML(track?.name || "No Track")}</span>
          </div>

          <button 
            type="button" 
            class="popup-close-button" 
            id="popupCloseButton"
          >
            ×
          </button>
        </div>

        <div class="process-popup-body">
          ${createPopupBodyHTML(process, type)}
        </div>

        <div class="process-popup-footer">
          <button 
            type="button" 
            class="popup-footer-button"
            id="popupCancelButton"
          >
            취소
          </button>

          <button 
            type="button" 
            class="popup-footer-button primary"
            id="popupRunButton"
            data-process-id="${process.id}"
            data-process-type="${type}"
          >
            적용 및 Track 생성
          </button>
        </div>
      </section>
    </div>
  `;

  bindPopupEvents();
}

/* =========================================================
   Popup Body
   ========================================================= */

function createPopupBodyHTML(process, type) {
  switch (type) {
    case "preprocessing":
      return createPreprocessingPopupHTML(process);

    case "denoising":
      return createDenoisingPopupHTML(process);

    case "decomposition":
      return createDecompositionPopupHTML(process);

    case "forecasting":
      return createForecastingPopupHTML(process);

    default:
      return `
        <div class="popup-empty">
          지원하지 않는 Process입니다.
        </div>
      `;
  }
}

/* =========================================================
   Preprocessing Popup
   ========================================================= */

function createPreprocessingPopupHTML(process) {
  const p = process.parameters || {};

  return `
    <div class="popup-form-grid">
      <label class="popup-field">
        <span>결측치 처리</span>
        <select name="missingMethod">
          ${createOptionHTML("linear", "Linear Interpolation", p.missingMethod)}
          ${createOptionHTML("locf", "LOCF", p.missingMethod)}
          ${createOptionHTML("nocb", "NOCB", p.missingMethod)}
          ${createOptionHTML("mean", "Mean Fill", p.missingMethod)}
          ${createOptionHTML("moving-average", "Moving Average Fill", p.missingMethod)}
          ${createOptionHTML("drop", "Drop Missing Rows", p.missingMethod)}
        </select>
      </label>

      <label class="popup-field">
        <span>이상치 탐지</span>
        <select name="outlierMethod">
          ${createOptionHTML("iqr", "IQR", p.outlierMethod)}
          ${createOptionHTML("z-score", "Z-Score", p.outlierMethod)}
          ${createOptionHTML("none", "None", p.outlierMethod)}
        </select>
      </label>

      <label class="popup-field">
        <span>이상치 처리</span>
        <select name="outlierAction">
          ${createOptionHTML("interpolate", "Interpolate", p.outlierAction)}
          ${createOptionHTML("winsorize", "Winsorize", p.outlierAction)}
          ${createOptionHTML("mean", "Replace with Mean", p.outlierAction)}
          ${createOptionHTML("remove", "Remove", p.outlierAction)}
        </select>
      </label>

      <label class="popup-field">
        <span>정규화</span>
        <select name="scaleMethod">
          ${createOptionHTML("none", "None", p.scaleMethod)}
          ${createOptionHTML("minmax", "Min-Max Scaling", p.scaleMethod)}
          ${createOptionHTML("zscore", "Z-Score Scaling", p.scaleMethod)}
          ${createOptionHTML("robust", "Robust Scaling", p.scaleMethod)}
        </select>
      </label>

      <label class="popup-field">
        <span>리샘플링 주기</span>
        <select name="resampleFrequency">
          ${createOptionHTML("", "사용 안 함", p.resampleFrequency)}
          ${createOptionHTML("daily", "Daily", p.resampleFrequency)}
          ${createOptionHTML("weekly", "Weekly", p.resampleFrequency)}
          ${createOptionHTML("monthly", "Monthly", p.resampleFrequency)}
          ${createOptionHTML("hour", "Hourly", p.resampleFrequency)}
        </select>
      </label>
    </div>

    <div class="popup-guide-box">
      결측치, 이상치, 리샘플링, 정규화를 한 번에 적용하여 새로운 Preprocessed Data Track을 생성합니다.
    </div>
  `;
}

/* =========================================================
   Denoising Popup
   ========================================================= */

function createDenoisingPopupHTML(process) {
  const p = process.parameters || {};

  return `
    <div class="popup-form-grid">
      <label class="popup-field">
        <span>잡음 완화 방법</span>
        <select name="method">
          ${createOptionHTML("moving-average", "Moving Average", p.method)}
          ${createOptionHTML("centered-moving-average", "Centered Moving Average", p.method)}
          ${createOptionHTML("ema", "EMA", p.method)}
          ${createOptionHTML("low-pass", "Low-pass Filter", p.method)}
          ${createOptionHTML("fourier", "Fourier Denoising", p.method)}
        </select>
      </label>

      <label class="popup-field">
        <span>Window Size</span>
        <input 
          type="number" 
          name="windowSize" 
          min="2" 
          value="${p.windowSize ?? 5}"
        />
      </label>

      <label class="popup-field">
        <span>Alpha</span>
        <input 
          type="number" 
          name="alpha" 
          min="0.01" 
          max="0.99" 
          step="0.01" 
          value="${p.alpha ?? 0.3}"
        />
      </label>

      <label class="popup-field">
        <span>Fourier Keep Ratio</span>
        <input 
          type="number" 
          name="fourierKeepRatio" 
          min="0.05" 
          max="0.9" 
          step="0.05" 
          value="${p.fourierKeepRatio ?? 0.2}"
        />
      </label>
    </div>

    <div class="popup-guide-box">
      단기 변동을 완화하여 추세와 계절성을 더 보기 쉽게 만드는 Track을 생성합니다.
    </div>
  `;
}

/* =========================================================
   Decomposition Popup
   ========================================================= */

function createDecompositionPopupHTML(process) {
  const p = process.parameters || {};

  return `
    <div class="popup-form-grid">
      <label class="popup-field">
        <span>분해 모형</span>
        <select name="model">
          ${createOptionHTML("additive", "Additive", p.model)}
          ${createOptionHTML("multiplicative", "Multiplicative", p.model)}
        </select>
      </label>

      <label class="popup-field">
        <span>Seasonal Period</span>
        <input 
          type="number" 
          name="period" 
          min="2" 
          value="${p.period ?? 12}"
        />
      </label>

      <label class="popup-field">
        <span>Trend Window</span>
        <input 
          type="number" 
          name="trendWindow" 
          min="2" 
          value="${p.trendWindow ?? p.period ?? 12}"
        />
      </label>
    </div>

    <div class="popup-guide-box">
      시계열을 Trend, Seasonal, Residual Track으로 나누어 생성합니다.
    </div>
  `;
}

/* =========================================================
   Forecasting Popup
   ========================================================= */

function createForecastingPopupHTML(process) {
  const p = process.parameters || {};

  return `
    <div class="popup-form-grid">
      <label class="popup-field">
        <span>예측 모델</span>
        <select name="method">
          ${createOptionHTML("naive", "Naive", p.method)}
          ${createOptionHTML("sma", "Simple Moving Average", p.method)}
          ${createOptionHTML("es", "Exponential Smoothing", p.method)}
          ${createOptionHTML("holt", "Holt Linear", p.method)}
          ${createOptionHTML("arima", "ARIMA 간이", p.method)}
        </select>
      </label>

      <label class="popup-field">
        <span>예측 기간 Horizon</span>
        <input 
          type="number" 
          name="horizon" 
          min="1" 
          value="${p.horizon ?? 12}"
        />
      </label>

      <label class="popup-field">
        <span>학습 데이터 비율</span>
        <input 
          type="number" 
          name="trainRatio" 
          min="0.5" 
          max="0.95" 
          step="0.05" 
          value="${p.trainRatio ?? 0.8}"
        />
      </label>

      <label class="popup-field">
        <span>SMA Window</span>
        <input 
          type="number" 
          name="windowSize" 
          min="2" 
          value="${p.windowSize ?? 5}"
        />
      </label>

      <label class="popup-field">
        <span>Alpha</span>
        <input 
          type="number" 
          name="alpha" 
          min="0.01" 
          max="0.99" 
          step="0.01" 
          value="${p.alpha ?? 0.3}"
        />
      </label>

      <label class="popup-field">
        <span>Beta</span>
        <input 
          type="number" 
          name="beta" 
          min="0.01" 
          max="0.99" 
          step="0.01" 
          value="${p.beta ?? 0.1}"
        />
      </label>

      <label class="popup-field">
        <span>ARIMA p</span>
        <input 
          type="number" 
          name="arimaP" 
          min="0" 
          value="${p.arimaP ?? 1}"
        />
      </label>

      <label class="popup-field">
        <span>ARIMA d</span>
        <input 
          type="number" 
          name="arimaD" 
          min="0" 
          value="${p.arimaD ?? 1}"
        />
      </label>

      <label class="popup-field">
        <span>ARIMA q</span>
        <input 
          type="number" 
          name="arimaQ" 
          min="0" 
          value="${p.arimaQ ?? 0}"
        />
      </label>
    </div>

    <div class="popup-guide-box">
      예측 Track과 검증용 Evaluation Result Track을 함께 생성합니다.
    </div>
  `;
}

/* =========================================================
   Event 연결
   ========================================================= */

function bindPopupEvents() {
  const backdrop = document.getElementById("processPopupBackdrop");
  const closeButton = document.getElementById("popupCloseButton");
  const cancelButton = document.getElementById("popupCancelButton");
  const runButton = document.getElementById("popupRunButton");

  if (backdrop) {
    backdrop.addEventListener("click", (event) => {
      if (event.target.id === "processPopupBackdrop") {
        closePopup();
      }
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", closePopup);
  }

  if (cancelButton) {
    cancelButton.addEventListener("click", closePopup);
  }

  if (runButton) {
    runButton.addEventListener("click", handleRunProcess);
  }

  document.addEventListener("keydown", handlePopupEscapeKey);
}

function handlePopupEscapeKey(event) {
  if (event.key === "Escape" && TSState.activePopup.isOpen) {
    closePopup();
  }
}

/* =========================================================
   Process 실행
   ========================================================= */

function handleRunProcess(event) {
  const processId = event.currentTarget.dataset.processId;
  const processType = event.currentTarget.dataset.processType;

  const process = TSStore.getProcessById(processId);

  if (!process) return;

  const parameters = readPopupParameters(processType);

  TSStore.updateProcess(processId, {
    parameters,
    status: "running",
  });

  let result = null;

  switch (processType) {
    case "preprocessing":
      result = TSPreprocessing.runPreprocessing({
        trackId: process.trackId,
        ...parameters,
        resampleFrequency: parameters.resampleFrequency || null,
        createTrack: true,
      });
      break;

    case "denoising":
      result = TSDenoising.runDenoising({
        trackId: process.trackId,
        ...parameters,
        createTrack: true,
      });
      break;

    case "decomposition":
      result = TSDecomposition.runDecomposition({
        trackId: process.trackId,
        ...parameters,
        createTracks: true,
      });
      break;

    case "forecasting":
      result = TSForecasting.runForecasting({
        trackId: process.trackId,
        ...parameters,
        createTrack: true,
      });

      if (result?.result) {
        TSMetrics.runAutoMetrics({
          sourceTrackId: process.trackId,
          forecastResult: result.result,
          regionId: TSStore.getTrackById(process.trackId)?.regionId,
        });
      }
      break;

    default:
      break;
  }

  if (!result) {
    TSStore.updateProcess(processId, {
      status: "failed",
    });

    alert("Process 실행에 실패했습니다.");
    return;
  }

  closePopup();
  refreshPopupConnectedUI();
}

/* =========================================================
   Parameter 읽기
   ========================================================= */

function readPopupParameters(type) {
  const root = document.querySelector(".process-popup");

  if (!root) return {};

  const formValues = {};

  root.querySelectorAll("input, select").forEach((field) => {
    const name = field.name;

    if (!name) return;

    formValues[name] = parsePopupFieldValue(field);
  });

  return normalizePopupParameters(type, formValues);
}

function parsePopupFieldValue(field) {
  if (field.type === "number") {
    const value = Number(field.value);

    return Number.isFinite(value) ? value : null;
  }

  return field.value;
}

function normalizePopupParameters(type, values) {
  if (type === "preprocessing") {
    return {
      missingMethod: values.missingMethod || "linear",
      outlierMethod: values.outlierMethod || "iqr",
      outlierAction: values.outlierAction || "interpolate",
      scaleMethod: values.scaleMethod || "none",
      resampleFrequency: values.resampleFrequency || "",
    };
  }

  if (type === "denoising") {
    return {
      method: values.method || "moving-average",
      windowSize: values.windowSize || 5,
      alpha: values.alpha || 0.3,
      fourierKeepRatio: values.fourierKeepRatio || 0.2,
    };
  }

  if (type === "decomposition") {
    return {
      model: values.model || "additive",
      period: values.period || 12,
      trendWindow: values.trendWindow || values.period || 12,
    };
  }

  if (type === "forecasting") {
    return {
      method: values.method || "holt",
      horizon: values.horizon || 12,
      trainRatio: values.trainRatio || 0.8,
      windowSize: values.windowSize || 5,
      alpha: values.alpha || 0.3,
      beta: values.beta || 0.1,
      arimaP: values.arimaP || 1,
      arimaD: values.arimaD || 1,
      arimaQ: values.arimaQ || 0,
    };
  }

  return values;
}

/* =========================================================
   연결 UI 새로고침
   ========================================================= */

function refreshPopupConnectedUI() {
  if (window.TSTimelineUI) {
    TSTimelineUI.renderTimeline();
  }

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }

  if (window.TSRegionsUI) {
    TSRegionsUI.renderRegions();
  }

  if (window.TSChartInteraction) {
    TSChartInteraction.bindAllChartInteractions();
  }
}

/* =========================================================
   Helper
   ========================================================= */

function getPopupTitle(type) {
  switch (type) {
    case "preprocessing":
      return "전처리 설정";

    case "denoising":
      return "잡음 완화 설정";

    case "decomposition":
      return "분해 설정";

    case "forecasting":
      return "예측 모델 설정";

    default:
      return "Process 설정";
  }
}

function createOptionHTML(value, label, selectedValue) {
  return `
    <option value="${value}" ${value === selectedValue ? "selected" : ""}>
      ${label}
    </option>
  `;
}

function escapePopupHTML(value) {
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

window.TSPopupUI = {
  openPopup,
  closePopup,
  renderPopup,

  createPopupBodyHTML,
  createPreprocessingPopupHTML,
  createDenoisingPopupHTML,
  createDecompositionPopupHTML,
  createForecastingPopupHTML,

  bindPopupEvents,
  handlePopupEscapeKey,

  handleRunProcess,

  readPopupParameters,
  parsePopupFieldValue,
  normalizePopupParameters,

  refreshPopupConnectedUI,

  getPopupTitle,
};