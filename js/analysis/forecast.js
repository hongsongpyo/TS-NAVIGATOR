/* =========================================================
   TS Navigator - forecast.js
   ---------------------------------------------------------
   역할
   1. 시계열 예측 수행
   2. Naive / Mean / Moving Average / Exponential Smoothing
   3. Holt / Holt-Winters / 간이 ARIMA 지원
   4. Validation 구간 예측값 생성
   5. Forecast Track 생성 및 Region에 반영
========================================================= */

/* =========================================================
   1. Forecast 분석 실행
========================================================= */

function runForecastAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createForecastErrorResult("예측할 데이터가 없습니다.");
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
    return createForecastErrorResult("target column을 찾지 못했습니다.");
  }

  const model = options.model || "exponential-smoothing";
  const horizon = Math.max(1, Number(options.horizon || 12));
  const horizonType = options.horizonType || "relative";
  const seasonalPeriod = Math.max(2, Number(options.seasonalPeriod || 12));
  const alpha = Number(options.alpha || 0.3);
  const beta = Number(options.beta || 0.1);
  const gamma = Number(options.gamma || 0.1);
  const arimaOrder = options.arimaOrder || { p: 1, d: 1, q: 1 };

  const sortedRows = datetimeColumn && window.TSDateUtils
    ? window.TSDateUtils.sortRowsByDate(rows, datetimeColumn)
    : [...rows];

  const values = getTargetValues(sortedRows, targetColumn).map(toNumber);
  const cleanValues = values.filter(Number.isFinite);

  if (cleanValues.length < 3) {
    return createForecastErrorResult("예측을 수행하기에는 유효한 수치 데이터가 부족합니다.");
  }

  const forecast = forecastValues(cleanValues, {
    model,
    horizon,
    seasonalPeriod,
    alpha,
    beta,
    gamma,
    arimaOrder
  });

  const fitted = createFittedValues(cleanValues, {
    model,
    seasonalPeriod,
    alpha,
    beta,
    gamma,
    arimaOrder
  });

  const forecastDates = createForecastDates(sortedRows, datetimeColumn, horizon);
  const forecastRows = createForecastRows({
    baseRows: sortedRows,
    forecastValues: forecast,
    forecastDates,
    datetimeColumn,
    targetColumn
  });

  const predictionInterval = createPredictionInterval(cleanValues, forecast);

  const result = {
    type: "Forecast",
    status: "done",

    model,
    horizon,
    horizonType,
    seasonalPeriod,
    alpha,
    beta,
    gamma,
    arimaOrder,

    datetimeColumn,
    targetColumn,

    fitted,
    forecast,
    predicted: forecast,
    forecastDates,
    forecastRows,

    lower: predictionInterval.lower,
    upper: predictionInterval.upper,

    before: {
      rowCount: sortedRows.length,
      summary: summarizeValues(cleanValues)
    },

    after: {
      forecastCount: forecast.length,
      lastObserved: cleanValues[cleanValues.length - 1],
      firstForecast: forecast[0],
      lastForecast: forecast[forecast.length - 1]
    },

    outputRows: sortedRows,

    messages: createForecastMessages({
      model,
      horizon,
      seasonalPeriod
    }),

    recommendation: createForecastRecommendation({
      model,
      horizon,
      forecast,
      cleanValues
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Forecast 분석
========================================================= */

function runForecastAnalysisOnTrack(trackId, params = {}) {
  const sourceTrack = window.TSStore.getTrack(trackId);

  if (!sourceTrack) {
    return {
      status: "error",
      message: "기준 Track을 찾을 수 없습니다."
    };
  }

  const rows = sourceTrack.data || [];
  const datetimeColumn =
    sourceTrack.metadata?.datetimeColumn ||
    window.TSState.dataset.datetimeColumn;

  const targetColumn =
    sourceTrack.metadata?.targetColumn ||
    window.TSState.dataset.targetColumn;

  if (!datetimeColumn || !targetColumn || rows.length === 0) {
    return {
      status: "error",
      message: "예측에 필요한 날짜/값 컬럼이 없습니다."
    };
  }

  const horizon = Number(params.horizon || 12);

  const values = rows
    .map(row => Number(row[targetColumn]))
    .filter(value => Number.isFinite(value));

  if (values.length < 3) {
    return {
      status: "error",
      message: "예측을 수행하기 위한 데이터가 부족합니다."
    };
  }

  const lastValue = values[values.length - 1];
  const recentValues = values.slice(-Math.min(6, values.length));
  const recentMean =
    recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length;

  const trend =
    (values[values.length - 1] - values[Math.max(0, values.length - 6)]) /
    Math.min(6, values.length - 1);

  const lastDate = new Date(rows[rows.length - 1][datetimeColumn]);

  const forecastRows = [];

  for (let i = 1; i <= horizon; i += 1) {
    const nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + i);

    forecastRows.push({
      [datetimeColumn]: nextDate.toISOString().slice(0, 10),
      [targetColumn]: recentMean + trend * i,
      __forecast: true
    });
  }

  const forecastTrack = window.TSStore.addTrack({
    name: `Forecast · ${sourceTrack.name}`,
    type: "Forecast Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: forecastRows,
    metadata: {
      ...sourceTrack.metadata,
      forecastHorizon: horizon,
      forecastModel: params.model || "auto"
    }
  });

  window.TSStore.commitTrackResult(forecastTrack.id, {
    data: forecastRows,
    metadata: forecastTrack.metadata,
    result: {
      type: "Forecast",
      status: "done",
      params,
      messages: [
        `${horizon}개 시점에 대한 예측 Track이 생성되었습니다.`
      ]
    }
  });

  return {
    status: "done",
    type: "Forecast",
    forecastTrackId: forecastTrack.id,
    messages: [
      `${horizon}개 시점에 대한 예측 Track이 생성되었습니다.`
    ]
  };
}

window.TSForecastAnalysis = {
  runForecastAnalysisOnTrack
};

/* =========================================================
   3. Forecast Values
========================================================= */

function forecastValues(values, options = {}) {
  const model = options.model || "exponential-smoothing";
  const horizon = Math.max(1, Number(options.horizon || 12));

  if (model === "naive") {
    return naiveForecast(values, horizon);
  }

  if (model === "mean") {
    return meanForecast(values, horizon);
  }

  if (model === "moving-average") {
    return movingAverageForecast(values, horizon, options.windowSize || 3);
  }

  if (model === "holt") {
    return holtForecast(values, horizon, {
      alpha: options.alpha || 0.3,
      beta: options.beta || 0.1
    });
  }

  if (model === "holt-winters") {
    return holtWintersForecast(values, horizon, {
      alpha: options.alpha || 0.3,
      beta: options.beta || 0.1,
      gamma: options.gamma || 0.1,
      seasonalPeriod: options.seasonalPeriod || 12
    });
  }

  if (model === "arima") {
    return simpleARIMAForecast(values, horizon, options.arimaOrder || { p: 1, d: 1, q: 1 });
  }

  return exponentialSmoothingForecast(values, horizon, options.alpha || 0.3);
}

function createFittedValues(values, options = {}) {
  const model = options.model || "exponential-smoothing";

  if (model === "naive") {
    return values.map((value, index) => index === 0 ? NaN : values[index - 1]);
  }

  if (model === "mean") {
    return values.map((_, index) => {
      if (index === 0) return NaN;
      return meanLocal(values.slice(0, index));
    });
  }

  if (model === "moving-average") {
    return movingAverageFitted(values, options.windowSize || 3);
  }

  if (model === "holt") {
    return holtFitted(values, {
      alpha: options.alpha || 0.3,
      beta: options.beta || 0.1
    });
  }

  if (model === "holt-winters") {
    return holtWintersFitted(values, {
      alpha: options.alpha || 0.3,
      beta: options.beta || 0.1,
      gamma: options.gamma || 0.1,
      seasonalPeriod: options.seasonalPeriod || 12
    });
  }

  if (model === "arima") {
    return simpleARIMAFitted(values, options.arimaOrder || { p: 1, d: 1, q: 1 });
  }

  return exponentialSmoothingFitted(values, options.alpha || 0.3);
}

/* =========================================================
   4. 기본 예측 모델
========================================================= */

function naiveForecast(values, horizon = 1) {
  const clean = values.filter(Number.isFinite);
  const lastValue = clean[clean.length - 1];

  return Array.from({ length: horizon }, () => lastValue);
}

function meanForecast(values, horizon = 1) {
  const avg = meanLocal(values.filter(Number.isFinite));

  return Array.from({ length: horizon }, () => avg);
}

function movingAverageForecast(values, horizon = 1, windowSize = 3) {
  const history = values.filter(Number.isFinite);
  const forecast = [];

  for (let i = 0; i < horizon; i += 1) {
    const recent = history.slice(-windowSize);
    const next = meanLocal(recent);

    forecast.push(next);
    history.push(next);
  }

  return forecast;
}

function exponentialSmoothingForecast(values, horizon = 1, alpha = 0.3) {
  const smoothed = exponentialSmoothingFitted(values, alpha);
  const clean = smoothed.filter(Number.isFinite);
  const last = clean[clean.length - 1];

  return Array.from({ length: horizon }, () => last);
}

/* =========================================================
   5. Fitted 모델
========================================================= */

function movingAverageFitted(values, windowSize = 3) {
  return values.map((_, index) => {
    if (index === 0) return NaN;

    const start = Math.max(0, index - windowSize);
    const history = values.slice(start, index).filter(Number.isFinite);

    return history.length > 0 ? meanLocal(history) : NaN;
  });
}

function exponentialSmoothingFitted(values, alpha = 0.3) {
  const clean = values.map(toNumber);
  const fitted = [];

  let level = clean.find(Number.isFinite);

  clean.forEach((value, index) => {
    if (index === 0) {
      fitted.push(NaN);
      return;
    }

    fitted.push(level);

    if (Number.isFinite(value)) {
      level = alpha * value + (1 - alpha) * level;
    }
  });

  return fitted;
}

/* =========================================================
   6. Holt 예측
========================================================= */

function holtForecast(values, horizon = 1, options = {}) {
  const clean = values.filter(Number.isFinite);
  const alpha = Number(options.alpha || 0.3);
  const beta = Number(options.beta || 0.1);

  let level = clean[0];
  let trend = clean.length > 1 ? clean[1] - clean[0] : 0;

  for (let i = 1; i < clean.length; i += 1) {
    const value = clean[i];
    const previousLevel = level;

    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
  }

  return Array.from({ length: horizon }, (_, index) => {
    const step = index + 1;
    return level + step * trend;
  });
}

function holtFitted(values, options = {}) {
  const clean = values.map(toNumber);
  const alpha = Number(options.alpha || 0.3);
  const beta = Number(options.beta || 0.1);

  const first = clean.find(Number.isFinite);
  if (!Number.isFinite(first)) return clean.map(() => NaN);

  let level = first;
  let trend = 0;
  let initialized = false;

  const fitted = [];

  clean.forEach((value, index) => {
    if (index === 0) {
      fitted.push(NaN);
      return;
    }

    fitted.push(level + trend);

    if (!Number.isFinite(value)) return;

    if (!initialized) {
      trend = value - level;
      initialized = true;
    }

    const previousLevel = level;

    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
  });

  return fitted;
}

/* =========================================================
   7. Holt-Winters 예측
========================================================= */

function holtWintersForecast(values, horizon = 1, options = {}) {
  const clean = values.filter(Number.isFinite);
  const alpha = Number(options.alpha || 0.3);
  const beta = Number(options.beta || 0.1);
  const gamma = Number(options.gamma || 0.1);
  const seasonLength = Math.max(2, Number(options.seasonalPeriod || 12));

  if (clean.length < seasonLength * 2) {
    return holtForecast(clean, horizon, { alpha, beta });
  }

  let level = meanLocal(clean.slice(0, seasonLength));
  let trend =
    (meanLocal(clean.slice(seasonLength, seasonLength * 2)) -
      meanLocal(clean.slice(0, seasonLength))) /
    seasonLength;

  const seasonal = initializeSeasonalFactors(clean, seasonLength);

  clean.forEach((value, index) => {
    const seasonIndex = index % seasonLength;
    const seasonalValue = seasonal[seasonIndex] || 0;
    const previousLevel = level;

    level = alpha * (value - seasonalValue) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    seasonal[seasonIndex] =
      gamma * (value - level) + (1 - gamma) * seasonalValue;
  });

  return Array.from({ length: horizon }, (_, index) => {
    const step = index + 1;
    const seasonIndex = (clean.length + index) % seasonLength;

    return level + step * trend + seasonal[seasonIndex];
  });
}

function holtWintersFitted(values, options = {}) {
  const clean = values.map(toNumber);
  const alpha = Number(options.alpha || 0.3);
  const beta = Number(options.beta || 0.1);
  const gamma = Number(options.gamma || 0.1);
  const seasonLength = Math.max(2, Number(options.seasonalPeriod || 12));

  const valid = clean.filter(Number.isFinite);

  if (valid.length < seasonLength * 2) {
    return holtFitted(clean, { alpha, beta });
  }

  let level = meanLocal(valid.slice(0, seasonLength));
  let trend =
    (meanLocal(valid.slice(seasonLength, seasonLength * 2)) -
      meanLocal(valid.slice(0, seasonLength))) /
    seasonLength;

  const seasonal = initializeSeasonalFactors(valid, seasonLength);
  const fitted = [];

  clean.forEach((value, index) => {
    const seasonIndex = index % seasonLength;
    const seasonalValue = seasonal[seasonIndex] || 0;

    fitted.push(index === 0 ? NaN : level + trend + seasonalValue);

    if (!Number.isFinite(value)) return;

    const previousLevel = level;

    level = alpha * (value - seasonalValue) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    seasonal[seasonIndex] =
      gamma * (value - level) + (1 - gamma) * seasonalValue;
  });

  return fitted;
}

function initializeSeasonalFactors(values, seasonLength) {
  const seasonal = Array.from({ length: seasonLength }, () => 0);
  const seasons = Math.floor(values.length / seasonLength);

  const seasonMeans = [];

  for (let season = 0; season < seasons; season += 1) {
    const start = season * seasonLength;
    seasonMeans.push(meanLocal(values.slice(start, start + seasonLength)));
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
   8. 간이 ARIMA
========================================================= */

function simpleARIMAForecast(values, horizon = 1, arimaOrder = { p: 1, d: 1, q: 1 }) {
  const clean = values.filter(Number.isFinite);
  const d = Number(arimaOrder.d || 1);

  let diffed = [...clean];

  for (let i = 0; i < d; i += 1) {
    diffed = difference(diffed);
  }

  const diffForecast = autoregressiveForecast(diffed, horizon, Number(arimaOrder.p || 1));

  return invertDifferenceForecast(clean, diffForecast, d);
}

function simpleARIMAFitted(values, arimaOrder = { p: 1, d: 1, q: 1 }) {
  const clean = values.map(toNumber);
  const fitted = clean.map(() => NaN);

  for (let i = 1; i < clean.length; i += 1) {
    if (Number.isFinite(clean[i - 1])) {
      fitted[i] = clean[i - 1];
    }
  }

  return fitted;
}

function autoregressiveForecast(values, horizon = 1, p = 1) {
  const history = values.filter(Number.isFinite);
  const forecast = [];

  if (history.length === 0) {
    return Array.from({ length: horizon }, () => 0);
  }

  for (let i = 0; i < horizon; i += 1) {
    const recent = history.slice(-Math.max(1, p));
    const next = meanLocal(recent);

    forecast.push(next);
    history.push(next);
  }

  return forecast;
}

function difference(values) {
  const result = [];

  for (let i = 1; i < values.length; i += 1) {
    result.push(values[i] - values[i - 1]);
  }

  return result;
}

function invertDifferenceForecast(originalValues, diffForecast, d = 1) {
  if (d <= 0) return diffForecast;

  let lastValue = originalValues[originalValues.length - 1];

  const result = diffForecast.map(diffValue => {
    lastValue += diffValue;
    return lastValue;
  });

  return result;
}

/* =========================================================
   9. Forecast Rows / Dates
========================================================= */

function createForecastDates(rows, datetimeColumn, horizon) {
  if (!window.TSDateUtils || !datetimeColumn || rows.length === 0) {
    return Array.from({ length: horizon }, (_, index) => index + 1);
  }

  const lastDate = getLastValidDate(rows, datetimeColumn);
  const frequencyCode =
    window.TSState?.dataset?.frequency?.code ||
    "D";

  if (!lastDate) {
    return Array.from({ length: horizon }, (_, index) => index + 1);
  }

  const startDate = window.TSDateUtils.addFrequency(lastDate, frequencyCode, 1);

  return window.TSDateUtils.createDateRangeByPeriods(
    startDate,
    horizon,
    frequencyCode
  );
}

function createForecastRows({
  baseRows,
  forecastValues,
  forecastDates,
  datetimeColumn,
  targetColumn
}) {
  return forecastValues.map((value, index) => ({
    [datetimeColumn]: forecastDates[index] instanceof Date && window.TSDateUtils
      ? window.TSDateUtils.formatDate(forecastDates[index], window.TSState?.dataset?.frequency?.code || "D")
      : forecastDates[index],
    [targetColumn]: value,
    __forecast: true,
    __forecastIndex: index
  }));
}

function getLastValidDate(rows, datetimeColumn) {
  if (!datetimeColumn) return null;

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const date = window.TSDateUtils
      ? window.TSDateUtils.parseDateValue(rows[i][datetimeColumn])
      : new Date(rows[i][datetimeColumn]);

    if (date && !Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

/* =========================================================
   10. Prediction Interval
========================================================= */

function createPredictionInterval(values, forecast) {
  const fitted = exponentialSmoothingFitted(values, 0.3);
  const residuals = [];

  for (let i = 0; i < values.length; i += 1) {
    if (Number.isFinite(values[i]) && Number.isFinite(fitted[i])) {
      residuals.push(values[i] - fitted[i]);
    }
  }

  const residualStd = standardDeviationLocal(residuals);
  const safeStd = Number.isFinite(residualStd) ? residualStd : 0;

  const lower = forecast.map((value, index) => {
    const scale = Math.sqrt(index + 1);
    return value - 1.96 * safeStd * scale;
  });

  const upper = forecast.map((value, index) => {
    const scale = Math.sqrt(index + 1);
    return value + 1.96 * safeStd * scale;
  });

  return { lower, upper };
}

/* =========================================================
   11. 메시지 / 추천
========================================================= */

function createForecastMessages({ model, horizon, seasonalPeriod }) {
  return [
    `Forecast 모델은 ${model}입니다.`,
    `예측 시평은 ${horizon}입니다.`,
    `계절 주기는 ${seasonalPeriod}로 설정되었습니다.`
  ];
}

function createForecastRecommendation({ model, horizon, forecast, cleanValues }) {
  const recommendation = [];

  if (forecast.length > 0) {
    recommendation.push({
      nextStep: "Metrics",
      priority: "normal",
      message: "예측 결과가 생성되었습니다. Validation 구간이 있다면 Metrics로 예측 성능을 확인하세요."
    });
  }

  if (model === "holt-winters") {
    recommendation.push({
      nextStep: "Residual",
      priority: "normal",
      message: "Holt-Winters는 추세와 계절성을 반영하므로 잔차가 무작위적인지 확인하는 것이 좋습니다."
    });
  }

  if (model === "arima") {
    recommendation.push({
      nextStep: "Residual",
      priority: "high",
      message: "ARIMA 예측 후에는 잔차 자기상관을 확인해야 합니다."
    });
  }

  if (horizon > cleanValues.length * 0.5) {
    recommendation.push({
      nextStep: "Validation",
      priority: "medium",
      message: "예측 시평이 데이터 길이에 비해 깁니다. 검증 구간을 설정해 안정성을 확인하세요."
    });
  }

  return recommendation;
}

/* =========================================================
   12. Track / Stack 보조
========================================================= */

function createForecastTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Forecast ${result.model}`;
}

function markLatestForecastStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Forecast");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createForecastShortSummary(result)
  );
}

function createForecastShortSummary(result) {
  if (!result || result.status !== "done") return "Forecast 실패";

  return `${result.model} · horizon ${result.horizon} · first ${formatNumber(result.after.firstForecast)}`;
}

/* =========================================================
   13. UI 표시용 HTML
========================================================= */

function createForecastResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Forecast 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Forecast Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Forecast Summary</strong><br />
      Model: ${escapeHTML(result.model)}<br />
      Horizon: ${result.horizon}<br />
      First Forecast: ${formatNumber(result.after.firstForecast)}<br />
      Last Forecast: ${formatNumber(result.after.lastForecast)}
    </div>
  `;
}

/* =========================================================
   14. Error
========================================================= */

function createForecastErrorResult(message, extra = {}) {
  return {
    type: "Forecast",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Forecast",
        priority: "high",
        message: "Forecast에 필요한 target column과 충분한 데이터 길이를 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   15. 보조 함수
========================================================= */

function summarizeValues(values) {
  if (window.TSMathUtils) {
    return window.TSMathUtils.describe(values);
  }

  const clean = values.map(toNumber).filter(Number.isFinite);

  return {
    count: clean.length,
    mean: meanLocal(clean),
    min: clean.length ? Math.min(...clean) : NaN,
    max: clean.length ? Math.max(...clean) : NaN,
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
   16. 외부 접근용 객체
========================================================= */

window.TSForecastAnalysis = {
  runForecastAnalysis,
  runForecastAnalysisOnTrack,

  forecastValues,
  createFittedValues,

  naiveForecast,
  meanForecast,
  movingAverageForecast,
  exponentialSmoothingForecast,
  holtForecast,
  holtWintersForecast,
  simpleARIMAForecast,

  createForecastDates,
  createForecastRows,
  createPredictionInterval,

  createForecastMessages,
  createForecastRecommendation,
  createForecastShortSummary,
  createForecastResultHTML
};