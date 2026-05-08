/* =========================================================
   TS Navigator - forecasting.js
   ---------------------------------------------------------
   역할
   1. Forecast 분석 실행 진입점
   2. 기존 JS 수식 계산 제거
   3. FastAPI Backend Forecast API 호출
   4. Forecast Track 생성 및 Region 반영
   5. 기존 UI 코드와 호환되는 결과 구조 유지
========================================================= */

/* =========================================================
   1. Forecast 분석 실행
========================================================= */

async function runForecastAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createForecastErrorResult("예측할 데이터가 없습니다.");
  }

  if (!window.TSApi) {
    return createForecastErrorResult("TSApi가 로드되지 않았습니다. js/api.js를 먼저 연결하세요.");
  }

  const datetimeColumn =
    options.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn ||
    inferDatetimeColumn(rows);

  const targetColumn =
    options.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    inferTargetColumn(rows, datetimeColumn);

  if (!datetimeColumn || !targetColumn) {
    return createForecastErrorResult("datetime column 또는 target column을 찾지 못했습니다.");
  }

  const sortedRows = datetimeColumn && window.TSDateUtils
    ? window.TSDateUtils.sortRowsByDate(rows, datetimeColumn)
    : [...rows];

  const payload = window.TSApi.createForecastPayload({
    rows: sortedRows,
    datetimeColumn,
    targetColumn,
    frequency:
      options.frequency ||
      window.TSState?.dataset?.frequency?.code ||
      window.TSState?.dataset?.frequency ||
      null,

    model: options.model || "auto-arima",
    horizon: options.horizon || 12,
    horizonType: options.horizonType || "relative",

    seasonalPeriod: options.seasonalPeriod || 12,
    seasonalModel: options.seasonalModel || "additive",

    alpha: options.alpha ?? 0.3,
    beta: options.beta ?? 0.1,
    gamma: options.gamma ?? 0.1,

    windowSize: options.windowSize || 3,

    arimaOrder: normalizeOrder(options.arimaOrder, [1, 1, 1]),
    sarimaOrder: normalizeOrder(options.sarimaOrder, [1, 1, 1]),
    sarimaSeasonalOrder: normalizeOrder(options.sarimaSeasonalOrder, [1, 1, 1, 12]),

    testSize: options.testSize || 0.2,
    confidenceLevel: options.confidenceLevel || 0.95
  });

  const apiResult = await window.TSApi.requestForecast(payload);

  if (window.TSApi.isAPIError(apiResult)) {
    return createForecastErrorResult(
      window.TSApi.getAPIErrorMessage(apiResult),
      {
        apiResult
      }
    );
  }

  return normalizeForecastResult(apiResult, {
    originalRows: sortedRows,
    datetimeColumn,
    targetColumn,
    options
  });
}

/* =========================================================
   2. Track 기반 Forecast 분석
========================================================= */

async function runForecastAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) {
    return {
      status: "error",
      message: "TSStore가 로드되지 않았습니다."
    };
  }

  const sourceTrack = window.TSStore.getTrack(trackId);

  if (!sourceTrack) {
    return {
      status: "error",
      message: "기준 Track을 찾을 수 없습니다."
    };
  }

  const rows = sourceTrack.data || [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      status: "error",
      message: "기준 Track에 데이터가 없습니다."
    };
  }

  const datetimeColumn =
    params.datetimeColumn ||
    sourceTrack.metadata?.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn ||
    inferDatetimeColumn(rows);

  const targetColumn =
    params.targetColumn ||
    sourceTrack.metadata?.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    inferTargetColumn(rows, datetimeColumn);

  if (!datetimeColumn || !targetColumn) {
    return {
      status: "error",
      message: "예측에 필요한 날짜/값 컬럼이 없습니다."
    };
  }

  const result = await runForecastAnalysis(rows, {
    ...params,
    datetimeColumn,
    targetColumn,
    frequency:
      params.frequency ||
      sourceTrack.metadata?.frequency ||
      window.TSState?.dataset?.frequency?.code ||
      window.TSState?.dataset?.frequency ||
      null
  });

  if (result.status === "error") {
    markLatestForecastStack(trackId, result);

    return {
      status: "error",
      type: "Forecast",
      message: result.message || result.error_message || "Forecast 실패",
      result
    };
  }

  const forecastRows = createForecastRowsFromResult(result, {
    datetimeColumn,
    targetColumn,
    sourceTrackId: sourceTrack.id
  });

  const forecastTrack = window.TSStore.addTrack({
    name: createForecastTrackName(sourceTrack, result),
    type: "Forecast Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: forecastRows,
    metadata: {
      ...sourceTrack.metadata,
      datetimeColumn,
      targetColumn,
      forecastHorizon: result.horizon,
      forecastModel: result.model,
      frequency: result.frequency,
      backend: "FastAPI",
      createdBy: "Forecast"
    }
  });

  window.TSStore.commitTrackResult(forecastTrack.id, {
    data: forecastRows,
    metadata: forecastTrack.metadata,
    result
  });

  markLatestForecastStack(trackId, result);

  if (window.TSRegions?.renderAllRegions) {
    window.TSRegions.renderAllRegions();
  }

  if (window.TSTimeline?.renderTimeline) {
    window.TSTimeline.renderTimeline();
  }

  if (window.TSInspector?.renderInspector) {
    window.TSInspector.renderInspector();
  }

  return {
    status: "done",
    type: "Forecast",
    forecastTrackId: forecastTrack.id,
    model: result.model,
    horizon: result.horizon,
    result,
    messages: result.messages?.map(item => item.message) || [
      "Forecast Track이 생성되었습니다."
    ]
  };
}

/* =========================================================
   3. Backend 결과 정규화
========================================================= */

function normalizeForecastResult(apiResult, context = {}) {
  const datetimeColumn = context.datetimeColumn;
  const targetColumn = context.targetColumn;
  const originalRows = context.originalRows || [];
  const options = context.options || {};

  const forecast = apiResult.forecast || [];
  const fitted = apiResult.fitted || [];
  const lower = apiResult.lower || [];
  const upper = apiResult.upper || [];
  const forecastDates = apiResult.forecast_dates || [];
  const observedDates = apiResult.observed_dates || [];
  const observed = apiResult.observed || [];

  const forecastRows = createForecastRowsFromResult(apiResult, {
    datetimeColumn,
    targetColumn
  });

  return {
    type: "Forecast",
    status: apiResult.status || "done",

    model: apiResult.model || options.model || "auto-arima",
    horizon: apiResult.horizon || options.horizon || forecast.length,
    horizonType: apiResult.horizon_type || options.horizonType || "relative",
    frequency: apiResult.frequency || options.frequency || null,

    datetimeColumn,
    targetColumn,

    observed,
    fitted,
    forecast,
    predicted: forecast,
    forecastDates,
    observedDates,
    forecastRows,

    lower,
    upper,

    rows: apiResult.rows || [],
    metrics: apiResult.metrics || {},

    before: {
      rowCount: originalRows.length,
      summary: apiResult.summary || summarizeValues(observed)
    },

    after: {
      forecastCount: forecast.length,
      lastObserved: getLastFiniteValue(observed),
      firstForecast: getFirstFiniteValue(forecast),
      lastForecast: getLastFiniteValue(forecast)
    },

    outputRows: originalRows,

    messages: normalizeMessages(apiResult.messages),
    recommendation: normalizeRecommendations(apiResult.recommendation),

    apiResult
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map(item => {
    if (typeof item === "string") return item;
    return item.message || "";
  }).filter(Boolean);
}

function normalizeRecommendations(recommendation) {
  if (!Array.isArray(recommendation)) {
    return [];
  }

  return recommendation.map(item => ({
    nextStep: item.next_step || item.nextStep || "Forecast",
    priority: item.priority || "normal",
    message: item.message || ""
  }));
}

/* =========================================================
   4. Forecast Row 변환
========================================================= */

function createForecastRowsFromResult(result, options = {}) {
  const datetimeColumn = options.datetimeColumn || result.datetimeColumn || "datetime";
  const targetColumn = options.targetColumn || result.targetColumn || "value";

  const rows = [];

  const forecastDates =
    result.forecast_dates ||
    result.forecastDates ||
    [];

  const forecastValues =
    result.forecast ||
    result.predicted ||
    [];

  const lowerValues = result.lower || [];
  const upperValues = result.upper || [];

  for (let index = 0; index < forecastValues.length; index += 1) {
    rows.push({
      [datetimeColumn]: forecastDates[index] ?? index + 1,
      [targetColumn]: forecastValues[index],
      forecast: forecastValues[index],
      lower: lowerValues[index],
      upper: upperValues[index],
      __forecast: true,
      __forecastIndex: index,
      __sourceTrackId: options.sourceTrackId || null
    });
  }

  return rows;
}

/* =========================================================
   5. 기존 코드 호환용 함수
========================================================= */

async function forecastValues(values, options = {}) {
  const rows = values.map((value, index) => ({
    index,
    value
  }));

  const result = await runForecastAnalysis(rows, {
    ...options,
    datetimeColumn: "index",
    targetColumn: "value"
  });

  if (result.status === "error") {
    return [];
  }

  return result.forecast || [];
}

function createFittedValues(values, options = {}) {
  /*
    기존 JS 수식 기반 fitted 계산은 제거.
    Backend API 응답의 fitted 값을 사용하는 구조로 변경.
    동기 함수 호환을 위해 단순 NaN 배열을 반환.
  */

  return values.map(() => NaN);
}

/* =========================================================
   6. Track / Stack 보조
========================================================= */

function createForecastTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  const model = result?.model || "Forecast";

  return `${baseName} · Forecast ${model}`;
}

function markLatestForecastStack(trackId, result) {
  if (!window.TSStore) return;

  const track = window.TSStore.getTrack(trackId);

  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Forecast");

  if (!stackItem) return;

  if (result.status === "error") {
    if (window.TSStore.markStackItemError) {
      window.TSStore.markStackItemError(
        trackId,
        stackItem.id,
        result.message || result.error_message || "Forecast 실패"
      );
    }

    return;
  }

  if (window.TSStore.markStackItemDone) {
    window.TSStore.markStackItemDone(
      trackId,
      stackItem.id,
      createForecastShortSummary(result)
    );
  }
}

function createForecastShortSummary(result) {
  if (!result || result.status !== "done") {
    return "Forecast 실패";
  }

  return `${result.model} · horizon ${result.horizon} · first ${formatNumber(result.after?.firstForecast)}`;
}

/* =========================================================
   7. UI 표시용 HTML
========================================================= */

function createForecastResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Forecast 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Forecast Error</strong><br />
        ${escapeHTML(result.message || result.error_message)}
      </div>
    `;
  }

  const messages = Array.isArray(result.messages)
    ? result.messages.map(message => `<li>${escapeHTML(message)}</li>`).join("")
    : "";

  return `
    <div class="result-box">
      <strong>Forecast Summary</strong><br />
      Model: ${escapeHTML(result.model)}<br />
      Horizon: ${result.horizon}<br />
      First Forecast: ${formatNumber(result.after?.firstForecast)}<br />
      Last Forecast: ${formatNumber(result.after?.lastForecast)}
      ${
        messages
          ? `<ul class="result-message-list">${messages}</ul>`
          : ""
      }
    </div>
  `;
}

/* =========================================================
   8. Error
========================================================= */

function createForecastErrorResult(message, extra = {}) {
  return {
    type: "Forecast",
    status: "error",
    message,
    error_message: message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Forecast",
        priority: "high",
        message: "Forecast에 필요한 target column, datetime column, Backend 연결 상태를 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   9. 보조 함수
========================================================= */

function normalizeOrder(order, fallback) {
  if (!Array.isArray(order)) {
    return fallback;
  }

  if (order.length !== fallback.length) {
    return fallback;
  }

  return order.map(value => Number(value));
}

function getFirstFiniteValue(values) {
  if (!Array.isArray(values)) return null;

  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function getLastFiniteValue(values) {
  if (!Array.isArray(values)) return null;

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const number = Number(values[index]);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function summarizeValues(values) {
  const clean = (values || [])
    .map(toNumber)
    .filter(Number.isFinite);

  if (clean.length === 0) {
    return {
      count: 0,
      mean: null,
      min: null,
      max: null,
      std: null
    };
  }

  const mean = meanLocal(clean);

  const variance = clean.length > 1
    ? clean.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / (clean.length - 1)
    : 0;

  return {
    count: clean.length,
    mean,
    min: Math.min(...clean),
    max: Math.max(...clean),
    std: Math.sqrt(variance)
  };
}

function getTargetValues(rows, targetColumn) {
  if (!Array.isArray(rows) || !targetColumn) return [];
  return rows.map(row => row[targetColumn]);
}

function inferDatetimeColumn(rows) {
  const columns = inferColumns(rows);

  if (window.TSDateUtils?.detectDatetimeColumn) {
    return window.TSDateUtils.detectDatetimeColumn(rows, columns);
  }

  return columns.find(column => {
    const lower = String(column).toLowerCase();
    return (
      lower.includes("date") ||
      lower.includes("time") ||
      lower.includes("datetime")
    );
  }) || columns[0] || null;
}

function inferTargetColumn(rows, datetimeColumn) {
  const columns = inferColumns(rows);

  if (window.TSCSVUtils) {
    const numericColumns = window.TSCSVUtils.detectNumericColumns?.(rows, columns) || [];

    if (window.TSCSVUtils.detectTargetColumn) {
      return window.TSCSVUtils.detectTargetColumn(
        rows,
        columns,
        datetimeColumn,
        numericColumns
      );
    }
  }

  return columns.find(column => column !== datetimeColumn) || null;
}

function inferColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return Object.keys(rows[0]).filter(column => {
    return !String(column).startsWith("__");
  });
}

function toNumber(value) {
  if (window.TSMathUtils?.toNumber) {
    return window.TSMathUtils.toNumber(value);
  }

  if (value === null || value === undefined || value === "") {
    return NaN;
  }

  const number = Number(String(value).replace(/,/g, ""));

  return Number.isFinite(number) ? number : NaN;
}

function meanLocal(values) {
  const clean = values.filter(Number.isFinite);

  if (clean.length === 0) return NaN;

  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function formatNumber(value, digits = 3) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "-";

  return number.toFixed(digits);
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
   10. 외부 접근용 객체
========================================================= */

window.TSForecastAnalysis = {
  runForecastAnalysis,
  runForecastAnalysisOnTrack,

  forecastValues,
  createFittedValues,

  createForecastRowsFromResult,
  normalizeForecastResult,

  createForecastTrackName,
  markLatestForecastStack,
  createForecastShortSummary,
  createForecastResultHTML
};