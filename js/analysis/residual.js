/* =========================================================
   TS Navigator - residual.js
   ---------------------------------------------------------
   역할
   1. 실제값 - 예측값 잔차 계산
   2. fitted / validation predicted / forecast predicted 기반 잔차 지원
   3. 잔차 평균, 분산, 표준편차, 자기상관 확인
   4. 간이 Ljung-Box 방식의 백색잡음 판단
   5. Residual Data Track 생성
========================================================= */

/* =========================================================
   1. Residual 분석 실행
========================================================= */

function runResidualAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createResidualErrorResult("Residual 분석할 데이터가 없습니다.");
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
    return createResidualErrorResult("target column을 찾지 못했습니다.");
  }

  const predicted =
    options.predicted ||
    options.fitted ||
    options.validationPredicted ||
    [];

  if (!Array.isArray(predicted) || predicted.length === 0) {
    return createResidualErrorResult("잔차 계산에 필요한 predicted 값이 없습니다.");
  }

  const lag = Number(options.lag || 12);
  const whiteNoiseTest = options.whiteNoiseTest || "ljung-box";

  const actual = getTargetValues(rows, targetColumn).map(toNumber);
  const residualValues = calculateResidualValues(actual, predicted);
  const residualRows = createResidualRows(rows, residualValues, {
    datetimeColumn,
    targetColumn
  });

  const acfValues = calculateResidualACF(residualValues, lag);
  const whiteNoise = evaluateWhiteNoise(residualValues, {
    lag,
    test: whiteNoiseTest
  });

  const result = {
    type: "Residual",
    status: "done",

    datetimeColumn,
    targetColumn,

    lag,
    whiteNoiseTest,

    actual,
    predicted,
    residuals: residualValues,
    acf: acfValues,
    whiteNoise,

    outputRows: residualRows,

    summary: summarizeResiduals(residualValues),

    messages: createResidualMessages({
      residuals: residualValues,
      whiteNoise
    }),

    recommendation: createResidualRecommendation({
      whiteNoise,
      residuals: residualValues
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Residual 분석
========================================================= */

function runResidualAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const predicted = resolvePredictedValues(sourceTrack, params);

  const result = runResidualAnalysis(sourceTrack.data || [], {
    ...params,
    predicted,
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
    markLatestResidualStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createResidualTrackName(sourceTrack, result),
    type: "Residual Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      residual: result,
      residuals: result.residuals,
      targetColumn: "__residual",
      lastAnalysis: "Residual",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Residual", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    residuals: result.residuals,
    metadata: {
      ...newTrack.metadata,
      residual: result,
      residuals: result.residuals
    },
    result
  });

  markLatestResidualStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. Predicted 값 확인
========================================================= */

function resolvePredictedValues(track, params = {}) {
  if (Array.isArray(params.predicted) && params.predicted.length > 0) {
    return params.predicted;
  }

  if (Array.isArray(track.result?.fitted) && track.result.fitted.length > 0) {
    return track.result.fitted;
  }

  if (Array.isArray(track.result?.validationPredicted) && track.result.validationPredicted.length > 0) {
    return track.result.validationPredicted;
  }

  if (Array.isArray(track.result?.testPredicted) && track.result.testPredicted.length > 0) {
    return track.result.testPredicted;
  }

  if (Array.isArray(track.metadata?.fitted) && track.metadata.fitted.length > 0) {
    return track.metadata.fitted;
  }

  if (Array.isArray(track.metadata?.validationPredicted) && track.metadata.validationPredicted.length > 0) {
    return track.metadata.validationPredicted;
  }

  if (track.result?.forecast && Array.isArray(track.result.forecast)) {
    return alignForecastToTail(track.data || [], track.result.forecast);
  }

  return [];
}

function alignForecastToTail(rows, forecast) {
  const paddingLength = Math.max(0, rows.length - forecast.length);
  return [
    ...Array.from({ length: paddingLength }, () => NaN),
    ...forecast
  ];
}

/* =========================================================
   4. 잔차 계산
========================================================= */

function calculateResidualValues(actual, predicted) {
  const result = [];
  const length = Math.min(actual.length, predicted.length);

  for (let i = 0; i < length; i += 1) {
    const a = toNumber(actual[i]);
    const p = toNumber(predicted[i]);

    if (Number.isFinite(a) && Number.isFinite(p)) {
      result.push(a - p);
    } else {
      result.push(NaN);
    }
  }

  if (actual.length > length) {
    for (let i = length; i < actual.length; i += 1) {
      result.push(NaN);
    }
  }

  return result;
}

function createResidualRows(rows, residualValues, options = {}) {
  const datetimeColumn = options.datetimeColumn;
  const targetColumn = options.targetColumn;

  return rows.map((row, index) => ({
    ...row,
    __actual: targetColumn ? row[targetColumn] : "",
    __predicted: "",
    __residual: Number.isFinite(residualValues[index]) ? residualValues[index] : "",
    __residualIndex: index,
    __residualComputed: true,
    [targetColumn]: Number.isFinite(residualValues[index]) ? residualValues[index] : ""
  }));
}

/* =========================================================
   5. 잔차 ACF / 백색잡음
========================================================= */

function calculateResidualACF(residualValues, maxLag = 12) {
  const clean = residualValues.map(toNumber);

  const result = [];

  for (let lag = 1; lag <= maxLag; lag += 1) {
    const value = window.TSMathUtils
      ? window.TSMathUtils.autocorrelation(clean, lag)
      : autocorrelationLocal(clean, lag);

    result.push({
      lag,
      value
    });
  }

  return result;
}

function evaluateWhiteNoise(residualValues, options = {}) {
  const lag = Number(options.lag || 12);
  const test = options.test || "ljung-box";

  const clean = residualValues.map(toNumber).filter(Number.isFinite);

  if (clean.length < lag + 2) {
    return {
      test,
      isWhiteNoise: false,
      statistic: NaN,
      pValueApprox: NaN,
      reason: "잔차 데이터 길이가 부족합니다."
    };
  }

  const acf = calculateResidualACF(clean, lag);
  const n = clean.length;

  let qStatistic = 0;

  acf.forEach(item => {
    if (!Number.isFinite(item.value)) return;

    qStatistic +=
      (item.value * item.value) /
      Math.max(1, n - item.lag);
  });

  qStatistic = n * (n + 2) * qStatistic;

  const pValueApprox = Math.exp(-qStatistic / Math.max(1, lag * 2));
  const isWhiteNoise = pValueApprox > 0.05;

  return {
    test,
    isWhiteNoise,
    statistic: qStatistic,
    pValueApprox,
    lag,
    reason: isWhiteNoise
      ? "잔차 자기상관이 크지 않아 백색잡음에 가깝습니다."
      : "잔차에 자기상관이 남아 있어 모델 개선이 필요할 수 있습니다."
  };
}

/* =========================================================
   6. Summary
========================================================= */

function summarizeResiduals(residualValues) {
  const clean = residualValues.map(toNumber).filter(Number.isFinite);

  if (window.TSMathUtils) {
    const summary = window.TSMathUtils.describe(clean);

    return {
      ...summary,
      meanNearZero: Math.abs(summary.mean) < summary.std,
      positiveCount: clean.filter(value => value > 0).length,
      negativeCount: clean.filter(value => value < 0).length
    };
  }

  const avg = meanLocal(clean);
  const std = standardDeviationLocal(clean);

  return {
    count: clean.length,
    mean: avg,
    median: medianLocal(clean),
    min: clean.length ? Math.min(...clean) : NaN,
    max: clean.length ? Math.max(...clean) : NaN,
    std,
    meanNearZero: Math.abs(avg) < std,
    positiveCount: clean.filter(value => value > 0).length,
    negativeCount: clean.filter(value => value < 0).length
  };
}

/* =========================================================
   7. 메시지 / 추천
========================================================= */

function createResidualMessages({ residuals, whiteNoise }) {
  const summary = summarizeResiduals(residuals);

  return [
    `잔차 ${summary.count}개가 계산되었습니다.`,
    `잔차 평균은 ${formatNumber(summary.mean)}입니다.`,
    `잔차 표준편차는 ${formatNumber(summary.std)}입니다.`,
    `백색잡음 판단: ${whiteNoise.isWhiteNoise ? "white noise에 가까움" : "자기상관 가능성 있음"}.`
  ];
}

function createResidualRecommendation({ whiteNoise, residuals }) {
  const recommendation = [];
  const summary = summarizeResiduals(residuals);

  if (!summary.meanNearZero) {
    recommendation.push({
      nextStep: "Forecast",
      priority: "medium",
      message: "잔차 평균이 0에서 멀어 예측 편향이 있을 수 있습니다. 모델 또는 파라미터를 조정하세요."
    });
  }

  if (!whiteNoise.isWhiteNoise) {
    recommendation.push({
      nextStep: "Forecast",
      priority: "high",
      message: "잔차에 자기상관이 남아 있습니다. ARIMA 차수, 계절성, Holt-Winters 등을 다시 검토하세요."
    });
  }

  recommendation.push({
    nextStep: "Metrics",
    priority: "normal",
    message: "잔차 분석과 함께 MAE, RMSE, MAPE 등 성능평가지표를 확인하세요."
  });

  return recommendation;
}

/* =========================================================
   8. Track / Stack 보조
========================================================= */

function createResidualTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Residual`;
}

function markLatestResidualStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Residual");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createResidualShortSummary(result)
  );
}

function createResidualShortSummary(result) {
  if (!result || result.status !== "done") return "Residual 실패";

  return `residual ${result.summary.count} · mean ${formatNumber(result.summary.mean)} · white ${result.whiteNoise.isWhiteNoise ? "yes" : "no"}`;
}

/* =========================================================
   9. UI 표시용 HTML
========================================================= */

function createResidualResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Residual 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Residual Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Residual Summary</strong><br />
      Count: ${result.summary.count}<br />
      Mean: ${formatNumber(result.summary.mean)}<br />
      Std: ${formatNumber(result.summary.std)}<br />
      White Noise: ${result.whiteNoise.isWhiteNoise ? "Yes" : "No"}<br />
      p≈${formatNumber(result.whiteNoise.pValueApprox, 4)}
    </div>
  `;
}

/* =========================================================
   10. Error
========================================================= */

function createResidualErrorResult(message, extra = {}) {
  return {
    type: "Residual",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Forecast",
        priority: "high",
        message: "Residual 분석에는 실제값과 예측값이 모두 필요합니다."
      }
    ],
    ...extra
  };
}

/* =========================================================
   11. 보조 함수
========================================================= */

function getTargetValues(rows, targetColumn) {
  if (!Array.isArray(rows) || !targetColumn) return [];
  return rows.map(row => row[targetColumn]);
}

function inferColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return Object.keys(rows[0]).filter(column => !column.startsWith("__"));
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
   12. 외부 접근용 객체
========================================================= */

window.TSResidualAnalysis = {
  runResidualAnalysis,
  runResidualAnalysisOnTrack,

  resolvePredictedValues,
  calculateResidualValues,
  createResidualRows,

  calculateResidualACF,
  evaluateWhiteNoise,
  summarizeResiduals,

  createResidualMessages,
  createResidualRecommendation,
  createResidualShortSummary,
  createResidualResultHTML
};