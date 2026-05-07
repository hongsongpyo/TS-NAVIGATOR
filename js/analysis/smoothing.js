/* =========================================================
   TS Navigator - smoothing.js
   ---------------------------------------------------------
   역할
   1. 시계열 노이즈 완화
   2. Moving Average / Centered Moving Average
   3. Exponential Smoothing / Holt Linear Smoothing
   4. Holt-Winters 기반 smoothing
   5. 처리 결과를 새 Preprocessed Track으로 생성
========================================================= */

/* =========================================================
   1. Smoothing 분석 실행
========================================================= */

function runSmoothingAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createSmoothingErrorResult("Smoothing할 데이터가 없습니다.");
  }

  const datetimeColumn =
    options.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn ||
    inferDatetimeColumn(rows);

  const targetColumn =
    options.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    inferTargetColumn(rows, datetimeColumn);

  if (!targetColumn) {
    return createSmoothingErrorResult("target column을 찾지 못했습니다.");
  }

  const method = options.method || "moving-average";
  const windowSize = Number(options.windowSize || 3);
  const alpha = Number(options.alpha || 0.3);
  const beta = Number(options.beta || 0.1);
  const gamma = Number(options.gamma || 0.1);
  const seasonalPeriod = Number(options.seasonalPeriod || 12);

  const values = getTargetValues(rows, targetColumn).map(toNumber);

  const smoothedValues = smoothValues(values, {
    method,
    windowSize,
    alpha,
    beta,
    gamma,
    seasonalPeriod
  });

  const outputRows = rows.map((row, index) => ({
    ...row,
    [targetColumn]: Number.isFinite(smoothedValues[index])
      ? smoothedValues[index]
      : row[targetColumn],
    __smoothed: true,
    __smoothingMethod: method
  }));

  const result = {
    type: "Smoothing",
    status: "done",

    method,
    windowSize,
    alpha,
    beta,
    gamma,
    seasonalPeriod,

    datetimeColumn,
    targetColumn,

    before: {
      rowCount: rows.length,
      summary: summarizeValues(values)
    },

    after: {
      rowCount: outputRows.length,
      summary: summarizeValues(smoothedValues)
    },

    originalValues: values,
    smoothedValues,
    outputRows,

    messages: createSmoothingMessages({
      method,
      windowSize,
      alpha,
      beta,
      gamma,
      seasonalPeriod
    }),

    recommendation: createSmoothingRecommendation({
      method,
      beforeSummary: summarizeValues(values),
      afterSummary: summarizeValues(smoothedValues)
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Smoothing 분석
========================================================= */

function runSmoothingAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runSmoothingAnalysis(sourceTrack.data || [], {
    ...params,
    datetimeColumn:
      params.datetimeColumn ||
      sourceTrack.metadata?.datetimeColumn ||
      window.TSState?.dataset?.datetimeColumn,
    targetColumn:
      params.targetColumn ||
      sourceTrack.metadata?.targetColumn ||
      window.TSState?.dataset?.targetColumn
  });

  if (result.status === "error") {
    markLatestSmoothingStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createSmoothingTrackName(sourceTrack, result),
    type: "Preprocessed Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      smoothing: result,
      lastAnalysis: "Smoothing",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Smoothing", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      smoothing: result
    },
    result
  });

  markLatestSmoothingStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. Smoothing Method
========================================================= */

function smoothValues(values, options = {}) {
  const method = options.method || "moving-average";

  if (method === "centered-moving-average") {
    return window.TSMathUtils
      ? window.TSMathUtils.centeredMovingAverage(values, options.windowSize || 3)
      : centeredMovingAverageLocal(values, options.windowSize || 3);
  }

  if (method === "exponential") {
    return window.TSMathUtils
      ? window.TSMathUtils.exponentialMovingAverage(values, options.alpha || 0.3)
      : exponentialMovingAverageLocal(values, options.alpha || 0.3);
  }

  if (method === "holt") {
    return window.TSMathUtils
      ? window.TSMathUtils.holtLinearSmoothing(values, options.alpha || 0.3, options.beta || 0.1)
      : holtLinearSmoothingLocal(values, options.alpha || 0.3, options.beta || 0.1);
  }

  if (method === "holt-winters") {
    return holtWintersSmoothing(values, {
      alpha: options.alpha || 0.3,
      beta: options.beta || 0.1,
      gamma: options.gamma || 0.1,
      seasonalPeriod: options.seasonalPeriod || 12
    });
  }

  return window.TSMathUtils
    ? window.TSMathUtils.movingAverage(values, options.windowSize || 3)
    : movingAverageLocal(values, options.windowSize || 3);
}

/* =========================================================
   4. Local Moving Average
========================================================= */

function movingAverageLocal(values, windowSize = 3) {
  const nums = values.map(toNumber);
  const result = [];

  for (let i = 0; i < nums.length; i += 1) {
    const start = Math.max(0, i - windowSize + 1);
    const localValues = nums.slice(start, i + 1).filter(Number.isFinite);

    result.push(localValues.length > 0 ? meanLocal(localValues) : NaN);
  }

  return result;
}

function centeredMovingAverageLocal(values, windowSize = 3) {
  const nums = values.map(toNumber);
  const result = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < nums.length; i += 1) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(nums.length, i + halfWindow + 1);
    const localValues = nums.slice(start, end).filter(Number.isFinite);

    result.push(localValues.length > 0 ? meanLocal(localValues) : NaN);
  }

  return result;
}

/* =========================================================
   5. Exponential / Holt
========================================================= */

function exponentialMovingAverageLocal(values, alpha = 0.3) {
  const nums = values.map(toNumber);
  const result = [];

  let previous = null;

  nums.forEach(value => {
    if (!Number.isFinite(value)) {
      result.push(previous === null ? NaN : previous);
      return;
    }

    if (previous === null) {
      previous = value;
    } else {
      previous = alpha * value + (1 - alpha) * previous;
    }

    result.push(previous);
  });

  return result;
}

function holtLinearSmoothingLocal(values, alpha = 0.3, beta = 0.1) {
  const nums = values.map(toNumber);
  const clean = nums.filter(Number.isFinite);

  if (clean.length === 0) return nums.map(() => NaN);

  const result = [];

  let level = clean[0];
  let trend = clean.length > 1 ? clean[1] - clean[0] : 0;

  nums.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      result.push(level + trend);
      return;
    }

    if (index === 0) {
      result.push(value);
      return;
    }

    const previousLevel = level;

    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;

    result.push(level + trend);
  });

  return result;
}

/* =========================================================
   6. Holt-Winters Smoothing
========================================================= */

function holtWintersSmoothing(values, options = {}) {
  const nums = values.map(toNumber);
  const alpha = Number(options.alpha || 0.3);
  const beta = Number(options.beta || 0.1);
  const gamma = Number(options.gamma || 0.1);
  const seasonLength = Math.max(2, Number(options.seasonalPeriod || 12));

  const clean = nums.filter(Number.isFinite);

  if (clean.length < seasonLength * 2) {
    return holtLinearSmoothingLocal(nums, alpha, beta);
  }

  let level = meanLocal(clean.slice(0, seasonLength));
  let trend =
    (meanLocal(clean.slice(seasonLength, seasonLength * 2)) -
      meanLocal(clean.slice(0, seasonLength))) /
    seasonLength;

  const seasonal = initializeSeasonalFactors(clean, seasonLength);
  const result = [];

  nums.forEach((value, index) => {
    const seasonIndex = index % seasonLength;
    const seasonalValue = seasonal[seasonIndex] || 0;

    if (!Number.isFinite(value)) {
      result.push(level + trend + seasonalValue);
      return;
    }

    const previousLevel = level;

    level = alpha * (value - seasonalValue) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    seasonal[seasonIndex] =
      gamma * (value - level) + (1 - gamma) * seasonalValue;

    result.push(level + trend + seasonal[seasonIndex]);
  });

  return result;
}

function initializeSeasonalFactors(values, seasonLength) {
  const seasonal = Array.from({ length: seasonLength }, () => 0);
  const seasons = Math.floor(values.length / seasonLength);

  if (seasons <= 0) return seasonal;

  const seasonMeans = [];

  for (let season = 0; season < seasons; season += 1) {
    const start = season * seasonLength;
    const seasonValues = values
      .slice(start, start + seasonLength)
      .filter(Number.isFinite);

    seasonMeans.push(meanLocal(seasonValues));
  }

  for (let i = 0; i < seasonLength; i += 1) {
    const deviations = [];

    for (let season = 0; season < seasons; season += 1) {
      const index = season * seasonLength + i;

      if (Number.isFinite(values[index]) && Number.isFinite(seasonMeans[season])) {
        deviations.push(values[index] - seasonMeans[season]);
      }
    }

    seasonal[i] = deviations.length > 0 ? meanLocal(deviations) : 0;
  }

  return seasonal;
}

/* =========================================================
   7. 메시지 / 추천
========================================================= */

function createSmoothingMessages({ method, windowSize, alpha, beta, gamma, seasonalPeriod }) {
  const messages = [`Smoothing 방법은 ${method}입니다.`];

  if (method.includes("moving-average")) {
    messages.push(`이동평균 window size는 ${windowSize}입니다.`);
  }

  if (method === "exponential") {
    messages.push(`지수평활 alpha는 ${alpha}입니다.`);
  }

  if (method === "holt") {
    messages.push(`Holt smoothing alpha=${alpha}, beta=${beta}입니다.`);
  }

  if (method === "holt-winters") {
    messages.push(`Holt-Winters alpha=${alpha}, beta=${beta}, gamma=${gamma}, season=${seasonalPeriod}입니다.`);
  }

  return messages;
}

function createSmoothingRecommendation({ method, beforeSummary, afterSummary }) {
  const recommendation = [];

  if (
    Number.isFinite(beforeSummary?.std) &&
    Number.isFinite(afterSummary?.std) &&
    afterSummary.std < beforeSummary.std
  ) {
    recommendation.push({
      nextStep: "Decomposition",
      priority: "normal",
      message: "Smoothing 이후 변동성이 감소했습니다. 추세/계절성 분해를 진행해볼 수 있습니다."
    });
  }

  if (method === "holt-winters") {
    recommendation.push({
      nextStep: "Forecast",
      priority: "normal",
      message: "Holt-Winters는 추세와 계절성을 반영하므로 예측 단계와 자연스럽게 연결됩니다."
    });
  } else {
    recommendation.push({
      nextStep: "Compare",
      priority: "normal",
      message: "원본 Track과 smoothing Track을 비교하여 과도하게 평활화되지 않았는지 확인하세요."
    });
  }

  return recommendation;
}

/* =========================================================
   8. Track / Stack 보조
========================================================= */

function createSmoothingTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Smoothing ${result.method}`;
}

function markLatestSmoothingStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Smoothing");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createSmoothingShortSummary(result)
  );
}

function createSmoothingShortSummary(result) {
  if (!result || result.status !== "done") return "Smoothing 실패";

  return `${result.method} · rows ${result.after.rowCount}`;
}

/* =========================================================
   9. UI 표시용 HTML
========================================================= */

function createSmoothingResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Smoothing 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Smoothing Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Smoothing Summary</strong><br />
      Method: ${escapeHTML(result.method)}<br />
      Rows: ${result.after.rowCount}<br />
      Before Std: ${formatNumber(result.before.summary.std)}<br />
      After Std: ${formatNumber(result.after.summary.std)}
    </div>
  `;
}

/* =========================================================
   10. Error
========================================================= */

function createSmoothingErrorResult(message, extra = {}) {
  return {
    type: "Smoothing",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Structure",
        priority: "high",
        message: "Smoothing에 필요한 target column을 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   11. 보조 함수
========================================================= */

function summarizeValues(values) {
  if (window.TSMathUtils) {
    return window.TSMathUtils.describe(values);
  }

  const clean = values.map(toNumber).filter(Number.isFinite);

  return {
    count: clean.length,
    mean: meanLocal(clean),
    min: Math.min(...clean),
    max: Math.max(...clean),
    std: standardDeviationLocal(clean)
  };
}

function getTargetValues(rows, targetColumn) {
  if (!Array.isArray(rows) || !targetColumn) return [];

  return rows.map(row => row[targetColumn]);
}

function inferDatetimeColumn(rows) {
  const columns = inferColumns(rows);

  if (window.TSDateUtils) {
    return window.TSDateUtils.detectDatetimeColumn(rows, columns);
  }

  return columns.find(column => {
    const lower = String(column).toLowerCase();
    return lower.includes("date") || lower.includes("time");
  }) || null;
}

function inferTargetColumn(rows, datetimeColumn) {
  const columns = inferColumns(rows);

  if (window.TSCSVUtils) {
    const numericColumns = window.TSCSVUtils.detectNumericColumns(rows, columns);
    return window.TSCSVUtils.detectTargetColumn(rows, columns, datetimeColumn, numericColumns);
  }

  return columns.find(column => column !== datetimeColumn) || null;
}

function inferColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return Object.keys(rows[0]).filter(column => !column.startsWith("__"));
}

function toNumber(value) {
  if (window.TSMathUtils) return window.TSMathUtils.toNumber(value);

  if (value === null || value === undefined || value === "") return NaN;

  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : NaN;
}

function meanLocal(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) return NaN;

  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function standardDeviationLocal(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length <= 1) return NaN;

  const avg = meanLocal(clean);

  const variance =
    clean.reduce((acc, value) => acc + Math.pow(value - avg, 2), 0) /
    (clean.length - 1);

  return Math.sqrt(variance);
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
   12. 외부 접근용 객체
========================================================= */

window.TSSmoothingAnalysis = {
  runSmoothingAnalysis,
  runSmoothingAnalysisOnTrack,

  smoothValues,

  movingAverageLocal,
  centeredMovingAverageLocal,
  exponentialMovingAverageLocal,
  holtLinearSmoothingLocal,
  holtWintersSmoothing,

  createSmoothingMessages,
  createSmoothingRecommendation,
  createSmoothingShortSummary,
  createSmoothingResultHTML
};