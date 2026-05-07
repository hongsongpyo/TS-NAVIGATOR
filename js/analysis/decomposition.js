/* =========================================================
   TS Navigator - decomposition.js
   ---------------------------------------------------------
   역할
   1. 시계열을 Trend / Seasonal / Residual로 분해
   2. Additive / Multiplicative 분해 지원
   3. Classical Decomposition 기반 구현
   4. STL에 가까운 robust 옵션 구조 제공
   5. 분해 결과를 Track metadata/result에 저장
========================================================= */

/* =========================================================
   1. Decomposition 분석 실행
========================================================= */

function runDecompositionAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createDecompositionErrorResult("분해할 데이터가 없습니다.");
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
    return createDecompositionErrorResult("target column을 찾지 못했습니다.");
  }

  const method = options.method || "STL";
  const model = options.model || "additive";
  const seasonalPeriod = Number(options.seasonalPeriod || 12);
  const robust = Boolean(options.robust ?? true);

  const values = getTargetValues(rows, targetColumn).map(toNumber);

  if (values.filter(Number.isFinite).length < seasonalPeriod * 2) {
    return createDecompositionErrorResult(
      "분해를 수행하기에는 데이터 길이가 부족합니다. 최소 2개 이상의 계절 주기가 필요합니다."
    );
  }

  const decomposition = decomposeValues(values, {
    method,
    model,
    seasonalPeriod,
    robust
  });

  const outputRows = rows.map((row, index) => ({
    ...row,
    __trend: decomposition.trend[index],
    __seasonal: decomposition.seasonal[index],
    __residual: decomposition.residual[index],
    __decomposed: true,
    __decompositionModel: model
  }));

  const result = {
    type: "Decomposition",
    status: "done",

    method,
    model,
    seasonalPeriod,
    robust,

    datetimeColumn,
    targetColumn,

    components: decomposition,
    outputRows,

    before: {
      rowCount: rows.length,
      summary: summarizeValues(values)
    },

    after: {
      trendSummary: summarizeValues(decomposition.trend),
      seasonalSummary: summarizeValues(decomposition.seasonal),
      residualSummary: summarizeValues(decomposition.residual)
    },

    messages: createDecompositionMessages({
      method,
      model,
      seasonalPeriod,
      robust
    }),

    recommendation: createDecompositionRecommendation({
      model,
      residual: decomposition.residual,
      seasonal: decomposition.seasonal
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Decomposition 분석
========================================================= */

function runDecompositionAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runDecompositionAnalysis(sourceTrack.data || [], {
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
    markLatestDecompositionStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createDecompositionTrackName(sourceTrack, result),
    type: "Preprocessed Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      decomposition: result,
      components: result.components,
      lastAnalysis: "Decomposition",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Decomposition", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      decomposition: result,
      components: result.components
    },
    result
  });

  markLatestDecompositionStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. Decomposition Core
========================================================= */

function decomposeValues(values, options = {}) {
  const method = options.method || "STL";
  const model = options.model || "additive";
  const seasonalPeriod = Number(options.seasonalPeriod || 12);
  const robust = Boolean(options.robust ?? true);

  if (method === "STL") {
    return stlLikeDecomposition(values, {
      model,
      seasonalPeriod,
      robust
    });
  }

  return classicalDecomposition(values, {
    model,
    seasonalPeriod
  });
}

function classicalDecomposition(values, options = {}) {
  const model = options.model || "additive";
  const seasonalPeriod = Number(options.seasonalPeriod || 12);

  const nums = values.map(toNumber);
  const trend = centeredMovingAverage(nums, seasonalPeriod);
  const detrended = removeTrend(nums, trend, model);
  const seasonalPattern = estimateSeasonalPattern(detrended, seasonalPeriod, model);
  const seasonal = expandSeasonalPattern(seasonalPattern, nums.length);
  const residual = calculateResidual(nums, trend, seasonal, model);

  return {
    observed: nums,
    trend,
    seasonal,
    residual,
    seasonalPattern
  };
}

function stlLikeDecomposition(values, options = {}) {
  const model = options.model || "additive";
  const seasonalPeriod = Number(options.seasonalPeriod || 12);
  const robust = Boolean(options.robust ?? true);

  const nums = values.map(toNumber);

  let trend = centeredMovingAverage(nums, Math.max(3, seasonalPeriod));
  let detrended = removeTrend(nums, trend, model);
  let seasonalPattern = estimateSeasonalPattern(detrended, seasonalPeriod, model);
  let seasonal = expandSeasonalPattern(seasonalPattern, nums.length);
  let residual = calculateResidual(nums, trend, seasonal, model);

  if (robust) {
    const weights = robustWeights(residual);

    const weightedValues = nums.map((value, index) => {
      if (!Number.isFinite(value)) return value;

      const fitted = composeValue(trend[index], seasonal[index], model);
      const weight = weights[index];

      return weight * value + (1 - weight) * fitted;
    });

    trend = centeredMovingAverage(weightedValues, Math.max(3, seasonalPeriod));
    detrended = removeTrend(weightedValues, trend, model);
    seasonalPattern = estimateSeasonalPattern(detrended, seasonalPeriod, model);
    seasonal = expandSeasonalPattern(seasonalPattern, nums.length);
    residual = calculateResidual(nums, trend, seasonal, model);
  }

  return {
    observed: nums,
    trend,
    seasonal,
    residual,
    seasonalPattern
  };
}

/* =========================================================
   4. Trend / Seasonal / Residual 계산
========================================================= */

function centeredMovingAverage(values, windowSize = 12) {
  const nums = values.map(toNumber);
  const result = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < nums.length; i += 1) {
    const start = Math.max(0, i - half);
    const end = Math.min(nums.length, i + half + 1);
    const localValues = nums.slice(start, end).filter(Number.isFinite);

    result.push(localValues.length > 0 ? meanLocal(localValues) : NaN);
  }

  return result;
}

function removeTrend(values, trend, model = "additive") {
  return values.map((value, index) => {
    const trendValue = trend[index];

    if (!Number.isFinite(value) || !Number.isFinite(trendValue)) return NaN;

    if (model === "multiplicative") {
      if (trendValue === 0) return NaN;
      return value / trendValue;
    }

    return value - trendValue;
  });
}

function estimateSeasonalPattern(detrended, seasonalPeriod, model = "additive") {
  const pattern = [];

  for (let seasonIndex = 0; seasonIndex < seasonalPeriod; seasonIndex += 1) {
    const valuesAtSeason = [];

    for (let i = seasonIndex; i < detrended.length; i += seasonalPeriod) {
      if (Number.isFinite(detrended[i])) {
        valuesAtSeason.push(detrended[i]);
      }
    }

    pattern.push(valuesAtSeason.length > 0 ? meanLocal(valuesAtSeason) : NaN);
  }

  return normalizeSeasonalPattern(pattern, model);
}

function normalizeSeasonalPattern(pattern, model = "additive") {
  const clean = pattern.filter(Number.isFinite);

  if (clean.length === 0) return pattern.map(() => model === "multiplicative" ? 1 : 0);

  if (model === "multiplicative") {
    const avg = meanLocal(clean);
    if (!Number.isFinite(avg) || avg === 0) {
      return pattern.map(value => Number.isFinite(value) ? value : 1);
    }

    return pattern.map(value => {
      if (!Number.isFinite(value)) return 1;
      return value / avg;
    });
  }

  const avg = meanLocal(clean);

  return pattern.map(value => {
    if (!Number.isFinite(value)) return 0;
    return value - avg;
  });
}

function expandSeasonalPattern(pattern, length) {
  const result = [];

  for (let i = 0; i < length; i += 1) {
    result.push(pattern[i % pattern.length]);
  }

  return result;
}

function calculateResidual(values, trend, seasonal, model = "additive") {
  return values.map((value, index) => {
    const trendValue = trend[index];
    const seasonalValue = seasonal[index];

    if (
      !Number.isFinite(value) ||
      !Number.isFinite(trendValue) ||
      !Number.isFinite(seasonalValue)
    ) {
      return NaN;
    }

    if (model === "multiplicative") {
      const fitted = trendValue * seasonalValue;
      if (fitted === 0) return NaN;
      return value / fitted;
    }

    return value - trendValue - seasonalValue;
  });
}

function composeValue(trendValue, seasonalValue, model = "additive") {
  if (!Number.isFinite(trendValue) || !Number.isFinite(seasonalValue)) return NaN;

  if (model === "multiplicative") {
    return trendValue * seasonalValue;
  }

  return trendValue + seasonalValue;
}

/* =========================================================
   5. Robust Weight
========================================================= */

function robustWeights(residual) {
  const cleanResidual = residual.filter(Number.isFinite);

  if (cleanResidual.length === 0) {
    return residual.map(() => 1);
  }

  const absResidual = cleanResidual.map(value => Math.abs(value));
  const mad = medianLocal(absResidual);

  if (!Number.isFinite(mad) || mad === 0) {
    return residual.map(() => 1);
  }

  return residual.map(value => {
    if (!Number.isFinite(value)) return 1;

    const u = Math.abs(value) / (6 * mad);

    if (u >= 1) return 0;

    return Math.pow(1 - u * u, 2);
  });
}

/* =========================================================
   6. 메시지 / 추천
========================================================= */

function createDecompositionMessages({ method, model, seasonalPeriod, robust }) {
  return [
    `Decomposition 방법은 ${method}입니다.`,
    `분해 모형은 ${model}입니다.`,
    `계절 주기는 ${seasonalPeriod}로 설정되었습니다.`,
    `Robust 옵션은 ${robust ? "활성화" : "비활성화"}되었습니다.`
  ];
}

function createDecompositionRecommendation({ model, residual, seasonal }) {
  const recommendation = [];

  const residualSummary = summarizeValues(residual);
  const seasonalSummary = summarizeValues(seasonal);

  if (Number.isFinite(seasonalSummary.std) && seasonalSummary.std > 0) {
    recommendation.push({
      nextStep: "Forecast",
      priority: "normal",
      message: "계절 성분이 확인되므로 Holt-Winters 또는 계절성을 반영한 예측 모델을 검토하세요."
    });
  }

  if (Number.isFinite(residualSummary.std)) {
    recommendation.push({
      nextStep: "Residual",
      priority: "normal",
      message: "분해 후 잔차가 백색잡음에 가까운지 Residual 분석으로 확인하는 것이 좋습니다."
    });
  }

  if (model === "multiplicative") {
    recommendation.push({
      nextStep: "Stationarity",
      priority: "normal",
      message: "Multiplicative 구조는 로그 변환 후 정상성 확인과 함께 비교하면 좋습니다."
    });
  }

  return recommendation;
}

/* =========================================================
   7. Track / Stack 보조
========================================================= */

function createDecompositionTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Decomposition ${result.model}`;
}

function markLatestDecompositionStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Decomposition");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createDecompositionShortSummary(result)
  );
}

function createDecompositionShortSummary(result) {
  if (!result || result.status !== "done") return "Decomposition 실패";

  return `${result.method} · ${result.model} · season ${result.seasonalPeriod}`;
}

/* =========================================================
   8. UI 표시용 HTML
========================================================= */

function createDecompositionResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Decomposition 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Decomposition Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Decomposition Summary</strong><br />
      Method: ${escapeHTML(result.method)}<br />
      Model: ${escapeHTML(result.model)}<br />
      Seasonal Period: ${result.seasonalPeriod}<br />
      Trend Std: ${formatNumber(result.after.trendSummary.std)}<br />
      Seasonal Std: ${formatNumber(result.after.seasonalSummary.std)}<br />
      Residual Std: ${formatNumber(result.after.residualSummary.std)}
    </div>
  `;
}

/* =========================================================
   9. Error
========================================================= */

function createDecompositionErrorResult(message, extra = {}) {
  return {
    type: "Decomposition",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Structure",
        priority: "high",
        message: "Decomposition에 필요한 target column과 충분한 데이터 길이를 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   10. 보조 함수
========================================================= */

function summarizeValues(values) {
  if (window.TSMathUtils) {
    return window.TSMathUtils.describe(values);
  }

  const clean = values.map(toNumber).filter(Number.isFinite);

  return {
    count: clean.length,
    mean: meanLocal(clean),
    median: medianLocal(clean),
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

function medianLocal(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) return NaN;

  const middle = Math.floor(clean.length / 2);

  if (clean.length % 2 === 0) {
    return (clean[middle - 1] + clean[middle]) / 2;
  }

  return clean[middle];
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
   11. 외부 접근용 객체
========================================================= */

window.TSDecompositionAnalysis = {
  runDecompositionAnalysis,
  runDecompositionAnalysisOnTrack,

  decomposeValues,
  classicalDecomposition,
  stlLikeDecomposition,

  centeredMovingAverage,
  removeTrend,
  estimateSeasonalPattern,
  expandSeasonalPattern,
  calculateResidual,

  createDecompositionMessages,
  createDecompositionRecommendation,
  createDecompositionShortSummary,
  createDecompositionResultHTML
};