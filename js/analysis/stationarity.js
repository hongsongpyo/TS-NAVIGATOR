/* =========================================================
   TS Navigator - stationarity.js
   ---------------------------------------------------------
   역할
   1. 시계열 정상성 확인
   2. Rolling Mean / Rolling Std 기반 정상성 판단
   3. ADF Test에 가까운 간이 정상성 점수 계산
   4. Log / Difference / Log + Difference 변환
   5. 정상성 처리 결과를 새 Preprocessed Track으로 생성
========================================================= */

/* =========================================================
   1. Stationarity 분석 실행
========================================================= */

function runStationarityAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createStationarityErrorResult("정상성 분석할 데이터가 없습니다.");
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
    return createStationarityErrorResult("target column을 찾지 못했습니다.");
  }

  const test = options.test || "ADF";
  const alpha = Number(options.alpha || 0.05);
  const transform = options.transform || "none";
  const differencingOrder = Number(options.differencingOrder || 1);
  const rollingWindow = Number(options.rollingWindow || 12);

  const values = getTargetValues(rows, targetColumn).map(toNumber);
  const transformedValues = transformValues(values, {
    transform,
    differencingOrder
  });

  const stationarity = evaluateStationarity(transformedValues, {
    test,
    alpha,
    rollingWindow
  });

  const outputRows = buildOutputRows(rows, targetColumn, transformedValues, {
    transform,
    differencingOrder
  });

  const result = {
    type: "Stationarity",
    status: "done",

    test,
    alpha,
    transform,
    differencingOrder,
    rollingWindow,

    datetimeColumn,
    targetColumn,

    before: {
      rowCount: rows.length,
      summary: summarizeValues(values),
      stationarity: evaluateStationarity(values, {
        test,
        alpha,
        rollingWindow
      })
    },

    after: {
      rowCount: outputRows.length,
      summary: summarizeValues(transformedValues),
      stationarity
    },

    originalValues: values,
    transformedValues,
    outputRows,

    messages: createStationarityMessages({
      test,
      transform,
      differencingOrder,
      stationarity
    }),

    recommendation: createStationarityRecommendation({
      stationarity,
      transform,
      differencingOrder
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Stationarity 분석
========================================================= */

function runStationarityAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runStationarityAnalysis(sourceTrack.data || [], {
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
    markLatestStationarityStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createStationarityTrackName(sourceTrack, result),
    type: "Preprocessed Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      stationarity: result,
      lastAnalysis: "Stationarity",
      lastParams: params,
      transformedTargetColumn: sourceTrack.metadata?.targetColumn || window.TSState?.dataset?.targetColumn
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Stationarity", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      stationarity: result
    },
    result
  });

  markLatestStationarityStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. 정상성 평가
========================================================= */

function evaluateStationarity(values, options = {}) {
  const test = options.test || "ADF";
  const alpha = Number(options.alpha || 0.05);
  const rollingWindow = Number(options.rollingWindow || 12);

  const clean = values.map(toNumber).filter(Number.isFinite);

  if (clean.length < Math.max(8, rollingWindow)) {
    return {
      test,
      isStationary: false,
      score: 0,
      pValueApprox: 1,
      reason: "데이터 길이가 부족합니다.",
      rollingMeanStable: false,
      rollingStdStable: false,
      autocorrelationLow: false
    };
  }

  const rollingMean = calculateRollingMean(clean, rollingWindow);
  const rollingStd = calculateRollingStd(clean, rollingWindow);
  const rollingMeanStable = isRollingSeriesStable(rollingMean);
  const rollingStdStable = isRollingSeriesStable(rollingStd);

  const acf1 = window.TSMathUtils
    ? window.TSMathUtils.autocorrelation(clean, 1)
    : autocorrelationLocal(clean, 1);

  const acf2 = window.TSMathUtils
    ? window.TSMathUtils.autocorrelation(clean, 2)
    : autocorrelationLocal(clean, 2);

  const autocorrelationLow =
    Math.abs(acf1 || 0) < 0.75 &&
    Math.abs(acf2 || 0) < 0.65;

  const trendStrength = estimateTrendStrength(clean);
  const varianceRatio = estimateVarianceStability(clean, rollingWindow);

  const score = calculateStationarityScore({
    rollingMeanStable,
    rollingStdStable,
    autocorrelationLow,
    trendStrength,
    varianceRatio
  });

  const pValueApprox = approximatePValue(score);
  const isStationary = pValueApprox < alpha;

  return {
    test,
    isStationary,
    score,
    pValueApprox,
    alpha,

    rollingWindow,
    rollingMean,
    rollingStd,

    rollingMeanStable,
    rollingStdStable,
    autocorrelationLow,

    acf1,
    acf2,
    trendStrength,
    varianceRatio,

    reason: createStationarityReason({
      isStationary,
      rollingMeanStable,
      rollingStdStable,
      autocorrelationLow,
      trendStrength
    })
  };
}

function calculateStationarityScore({
  rollingMeanStable,
  rollingStdStable,
  autocorrelationLow,
  trendStrength,
  varianceRatio
}) {
  let score = 0;

  if (rollingMeanStable) score += 0.25;
  if (rollingStdStable) score += 0.25;
  if (autocorrelationLow) score += 0.25;

  if (Number.isFinite(trendStrength)) {
    score += Math.max(0, 0.15 * (1 - Math.min(1, trendStrength)));
  }

  if (Number.isFinite(varianceRatio)) {
    score += Math.max(0, 0.10 * (1 - Math.min(1, Math.abs(1 - varianceRatio))));
  }

  return Math.max(0, Math.min(1, score));
}

function approximatePValue(score) {
  return Math.max(0.001, Math.min(1, 1 - score));
}

function createStationarityReason({
  isStationary,
  rollingMeanStable,
  rollingStdStable,
  autocorrelationLow,
  trendStrength
}) {
  if (isStationary) {
    return "평균과 분산의 변화가 비교적 작고 자기상관이 낮아 정상 시계열에 가깝습니다.";
  }

  const reasons = [];

  if (!rollingMeanStable) {
    reasons.push("rolling mean이 안정적이지 않습니다");
  }

  if (!rollingStdStable) {
    reasons.push("rolling std가 안정적이지 않습니다");
  }

  if (!autocorrelationLow) {
    reasons.push("자기상관이 높습니다");
  }

  if (Number.isFinite(trendStrength) && trendStrength > 0.35) {
    reasons.push("추세 성분이 강합니다");
  }

  return reasons.join(", ") || "정상성이 충분하지 않습니다.";
}

/* =========================================================
   4. 변환
========================================================= */

function transformValues(values, options = {}) {
  const transform = options.transform || "none";
  const differencingOrder = Number(options.differencingOrder || 1);

  let result = values.map(toNumber);

  if (transform === "log") {
    result = logTransform(result);
  }

  if (transform === "difference") {
    result = differenceWithPadding(result, differencingOrder);
  }

  if (transform === "log-difference") {
    result = logTransform(result);
    result = differenceWithPadding(result, differencingOrder);
  }

  return result;
}

function logTransform(values) {
  return values.map(value => {
    if (!Number.isFinite(value) || value <= 0) return NaN;
    return Math.log(value);
  });
}

function differenceWithPadding(values, order = 1) {
  let result = values.map(toNumber);

  for (let step = 0; step < order; step += 1) {
    const diffed = [NaN];

    for (let i = 1; i < result.length; i += 1) {
      if (Number.isFinite(result[i]) && Number.isFinite(result[i - 1])) {
        diffed.push(result[i] - result[i - 1]);
      } else {
        diffed.push(NaN);
      }
    }

    result = diffed;
  }

  return result;
}

function buildOutputRows(rows, targetColumn, transformedValues, options = {}) {
  return rows.map((row, index) => ({
    ...row,
    [targetColumn]: Number.isFinite(transformedValues[index])
      ? transformedValues[index]
      : "",
    __stationarityTransformed: true,
    __stationarityTransform: options.transform || "none",
    __differencingOrder: options.differencingOrder || 0
  }));
}

/* =========================================================
   5. Rolling 계산
========================================================= */

function calculateRollingMean(values, windowSize = 12) {
  const nums = values.map(toNumber);
  const result = [];

  for (let i = 0; i < nums.length; i += 1) {
    const start = Math.max(0, i - windowSize + 1);
    const localValues = nums.slice(start, i + 1).filter(Number.isFinite);

    result.push(localValues.length > 0 ? meanLocal(localValues) : NaN);
  }

  return result;
}

function calculateRollingStd(values, windowSize = 12) {
  const nums = values.map(toNumber);
  const result = [];

  for (let i = 0; i < nums.length; i += 1) {
    const start = Math.max(0, i - windowSize + 1);
    const localValues = nums.slice(start, i + 1).filter(Number.isFinite);

    result.push(localValues.length > 1 ? standardDeviationLocal(localValues) : NaN);
  }

  return result;
}

function isRollingSeriesStable(values) {
  const clean = values.filter(Number.isFinite);

  if (clean.length < 3) return false;

  const firstHalf = clean.slice(0, Math.floor(clean.length / 2));
  const secondHalf = clean.slice(Math.floor(clean.length / 2));

  const firstMean = meanLocal(firstHalf);
  const secondMean = meanLocal(secondHalf);
  const overallStd = standardDeviationLocal(clean);

  if (!Number.isFinite(overallStd) || overallStd === 0) {
    return Math.abs(firstMean - secondMean) < 1e-8;
  }

  return Math.abs(firstMean - secondMean) / overallStd < 0.5;
}

/* =========================================================
   6. 추세 / 분산 안정성
========================================================= */

function estimateTrendStrength(values) {
  const clean = values.map(toNumber).filter(Number.isFinite);

  if (clean.length < 3) return NaN;

  const n = clean.length;
  const x = Array.from({ length: n }, (_, index) => index);
  const y = clean;

  const xMean = meanLocal(x);
  const yMean = meanLocal(y);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i += 1) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    denominator += Math.pow(x[i] - xMean, 2);
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const yStd = standardDeviationLocal(y);

  if (!Number.isFinite(yStd) || yStd === 0) return 0;

  return Math.abs(slope) * n / yStd;
}

function estimateVarianceStability(values, windowSize = 12) {
  const clean = values.map(toNumber).filter(Number.isFinite);

  if (clean.length < windowSize * 2) return NaN;

  const first = clean.slice(0, Math.floor(clean.length / 2));
  const second = clean.slice(Math.floor(clean.length / 2));

  const firstStd = standardDeviationLocal(first);
  const secondStd = standardDeviationLocal(second);

  if (!Number.isFinite(firstStd) || !Number.isFinite(secondStd) || firstStd === 0) {
    return NaN;
  }

  return secondStd / firstStd;
}

function autocorrelationLocal(values, lag = 1) {
  const clean = values.map(toNumber);

  if (lag <= 0 || lag >= clean.length) return NaN;

  const x = clean.slice(lag);
  const y = clean.slice(0, clean.length - lag);

  return correlationLocal(x, y);
}

function correlationLocal(xValues, yValues) {
  const pairs = [];

  for (let i = 0; i < Math.min(xValues.length, yValues.length); i += 1) {
    const x = toNumber(xValues[i]);
    const y = toNumber(yValues[i]);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      pairs.push({ x, y });
    }
  }

  if (pairs.length <= 1) return NaN;

  const xs = pairs.map(pair => pair.x);
  const ys = pairs.map(pair => pair.y);

  const xMean = meanLocal(xs);
  const yMean = meanLocal(ys);
  const xStd = standardDeviationLocal(xs);
  const yStd = standardDeviationLocal(ys);

  if (!Number.isFinite(xStd) || !Number.isFinite(yStd) || xStd === 0 || yStd === 0) {
    return NaN;
  }

  const covariance =
    pairs.reduce((acc, pair) => acc + (pair.x - xMean) * (pair.y - yMean), 0) /
    (pairs.length - 1);

  return covariance / (xStd * yStd);
}

/* =========================================================
   7. 메시지 / 추천
========================================================= */

function createStationarityMessages({ test, transform, differencingOrder, stationarity }) {
  return [
    `Stationarity test는 ${test} 기준으로 수행되었습니다.`,
    `변환 방식은 ${transform}입니다.`,
    `차분 차수는 ${differencingOrder}입니다.`,
    `정상성 판단 결과: ${stationarity.isStationary ? "stationary" : "non-stationary"}.`,
    `Approx. p-value: ${formatNumber(stationarity.pValueApprox, 4)}`
  ];
}

function createStationarityRecommendation({ stationarity, transform, differencingOrder }) {
  const recommendation = [];

  if (!stationarity.isStationary) {
    recommendation.push({
      nextStep: "Stationarity",
      priority: "high",
      message: "정상성이 충분하지 않습니다. 차분 또는 로그 차분을 적용해 다시 확인하세요."
    });

    if (transform === "none") {
      recommendation.push({
        nextStep: "Stationarity",
        priority: "medium",
        message: "추세가 있는 경우 difference, 분산이 커지는 경우 log-difference를 우선 검토하세요."
      });
    }
  } else {
    recommendation.push({
      nextStep: "Forecast",
      priority: "normal",
      message: "정상성 조건이 개선되었으므로 ARIMA 또는 예측 모델 단계로 진행할 수 있습니다."
    });
  }

  if (differencingOrder >= 2) {
    recommendation.push({
      nextStep: "Compare",
      priority: "normal",
      message: "과도한 차분은 정보 손실이 생길 수 있으므로 원본/1차 차분/2차 차분 Track을 비교하세요."
    });
  }

  return recommendation;
}

/* =========================================================
   8. Track / Stack 보조
========================================================= */

function createStationarityTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Stationarity ${result.transform}`;
}

function markLatestStationarityStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Stationarity");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createStationarityShortSummary(result)
  );
}

function createStationarityShortSummary(result) {
  if (!result || result.status !== "done") return "Stationarity 실패";

  const label = result.after.stationarity.isStationary ? "stationary" : "non-stationary";

  return `${result.transform} · ${label} · p≈${formatNumber(result.after.stationarity.pValueApprox, 3)}`;
}

/* =========================================================
   9. UI 표시용 HTML
========================================================= */

function createStationarityResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Stationarity 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Stationarity Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  const stationarity = result.after.stationarity;

  return `
    <div class="result-box">
      <strong>Stationarity Summary</strong><br />
      Test: ${escapeHTML(result.test)}<br />
      Transform: ${escapeHTML(result.transform)}<br />
      Result: ${stationarity.isStationary ? "Stationary" : "Non-stationary"}<br />
      Approx. p-value: ${formatNumber(stationarity.pValueApprox, 4)}<br />
      Reason: ${escapeHTML(stationarity.reason)}
    </div>
  `;
}

/* =========================================================
   10. Error
========================================================= */

function createStationarityErrorResult(message, extra = {}) {
  return {
    type: "Stationarity",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Structure",
        priority: "high",
        message: "Stationarity 분석에 필요한 target column과 충분한 데이터 길이를 확인하세요."
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
   12. 외부 접근용 객체
========================================================= */

window.TSStationarityAnalysis = {
  runStationarityAnalysis,
  runStationarityAnalysisOnTrack,

  evaluateStationarity,
  transformValues,
  logTransform,
  differenceWithPadding,

  calculateRollingMean,
  calculateRollingStd,
  isRollingSeriesStable,

  estimateTrendStrength,
  estimateVarianceStability,

  createStationarityMessages,
  createStationarityRecommendation,
  createStationarityShortSummary,
  createStationarityResultHTML
};