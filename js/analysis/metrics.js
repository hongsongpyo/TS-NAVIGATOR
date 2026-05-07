/* =========================================================
   TS Navigator - metrics.js
   ---------------------------------------------------------
   역할
   1. 예측 성능평가지표 계산
   2. MAE / MSE / RMSE / MAPE / SMAPE / MASE / RSFE / TS
   3. Forecast / Validation 결과와 연결
   4. Metric Result Track 생성
========================================================= */

/* =========================================================
   1. Metrics 분석 실행
========================================================= */

function runMetricsAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createMetricsErrorResult("Metrics를 계산할 데이터가 없습니다.");
  }

  const targetColumn =
    options.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    inferTargetColumn(rows);

  if (!targetColumn) {
    return createMetricsErrorResult("target column을 찾지 못했습니다.");
  }

  const actual = resolveActualValues(rows, targetColumn, options);
  const predicted = resolvePredictedValues(options);

  if (!Array.isArray(predicted) || predicted.length === 0) {
    return createMetricsErrorResult("평가지표 계산에 필요한 predicted 값이 없습니다.");
  }

  const metricSet = options.metricSet || "full";
  const zeroHandling = options.zeroHandling || "safe";
  const seasonality = Number(options.seasonality || 1);

  const aligned = alignActualPredicted(actual, predicted);
  const metrics = calculateAllMetrics(aligned.actual, aligned.predicted, {
    seasonality,
    zeroHandling
  });

  const selectedMetrics = selectMetricSet(metrics, metricSet);

  const result = {
    type: "Metrics",
    status: "done",

    targetColumn,
    metricSet,
    zeroHandling,
    seasonality,

    actual: aligned.actual,
    predicted: aligned.predicted,
    errors: aligned.actual.map((value, index) => value - aligned.predicted[index]),

    metrics: selectedMetrics,
    allMetrics: metrics,

    before: {
      actualCount: actual.length,
      predictedCount: predicted.length
    },

    after: {
      validPairCount: aligned.actual.length,
      metricCount: Object.keys(selectedMetrics).length
    },

    messages: createMetricsMessages(selectedMetrics),
    recommendation: createMetricsRecommendation(selectedMetrics),

    outputRows: createMetricRows(selectedMetrics)
  };

  return result;
}

/* =========================================================
   2. Track 기반 Metrics 분석
========================================================= */

function runMetricsAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const predicted = resolvePredictedFromTrack(sourceTrack, params);

  const result = runMetricsAnalysis(sourceTrack.data || [], {
    ...params,
    predicted,
    targetColumn:
      params.targetColumn ||
      sourceTrack.metadata?.targetColumn ||
      window.TSState?.dataset?.targetColumn,
    seasonality:
      params.seasonality ||
      sourceTrack.metadata?.frequency?.seasonality ||
      1
  });

  if (result.status === "error") {
    markLatestMetricsStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createMetricsTrackName(sourceTrack, result),
    type: "Evaluation Result",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: sourceTrack.data,
    metadata: {
      ...sourceTrack.metadata,
      metrics: result.metrics,
      metricsResult: result,
      lastAnalysis: "Metrics",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Metrics", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: sourceTrack.data,
    metrics: result.metrics,
    metadata: {
      ...newTrack.metadata,
      metrics: result.metrics,
      metricsResult: result
    },
    result
  });

  markLatestMetricsStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. Actual / Predicted 값 추출
========================================================= */

function resolveActualValues(rows, targetColumn, options = {}) {
  if (Array.isArray(options.actual) && options.actual.length > 0) {
    return options.actual.map(toNumber);
  }

  return rows.map(row => toNumber(row[targetColumn]));
}

function resolvePredictedValues(options = {}) {
  if (Array.isArray(options.predicted) && options.predicted.length > 0) {
    return options.predicted.map(toNumber);
  }

  if (Array.isArray(options.fitted) && options.fitted.length > 0) {
    return options.fitted.map(toNumber);
  }

  if (Array.isArray(options.validationPredicted) && options.validationPredicted.length > 0) {
    return options.validationPredicted.map(toNumber);
  }

  if (Array.isArray(options.testPredicted) && options.testPredicted.length > 0) {
    return options.testPredicted.map(toNumber);
  }

  return [];
}

function resolvePredictedFromTrack(track, params = {}) {
  if (Array.isArray(params.predicted) && params.predicted.length > 0) {
    return params.predicted;
  }

  if (Array.isArray(track.result?.validationPredicted)) {
    return track.result.validationPredicted;
  }

  if (Array.isArray(track.result?.testPredicted)) {
    return track.result.testPredicted;
  }

  if (Array.isArray(track.result?.fitted)) {
    return track.result.fitted;
  }

  if (Array.isArray(track.metadata?.validationPredicted)) {
    return track.metadata.validationPredicted;
  }

  if (Array.isArray(track.metadata?.fitted)) {
    return track.metadata.fitted;
  }

  if (Array.isArray(track.result?.forecast)) {
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

function alignActualPredicted(actual, predicted) {
  const alignedActual = [];
  const alignedPredicted = [];

  const length = Math.min(actual.length, predicted.length);

  for (let i = 0; i < length; i += 1) {
    const a = toNumber(actual[i]);
    const p = toNumber(predicted[i]);

    if (Number.isFinite(a) && Number.isFinite(p)) {
      alignedActual.push(a);
      alignedPredicted.push(p);
    }
  }

  return {
    actual: alignedActual,
    predicted: alignedPredicted
  };
}

/* =========================================================
   4. Metrics 계산
========================================================= */

function calculateAllMetrics(actual, predicted, options = {}) {
  if (window.TSMathUtils) {
    return window.TSMathUtils.calculateMetrics(actual, predicted, {
      seasonality: options.seasonality || 1
    });
  }

  return {
    MAE: mae(actual, predicted),
    MSE: mse(actual, predicted),
    RMSE: rmse(actual, predicted),
    MAPE: mape(actual, predicted, options.zeroHandling),
    SMAPE: smape(actual, predicted),
    MASE: mase(actual, predicted, options.seasonality || 1),
    RSFE: rsfe(actual, predicted),
    TS: trackingSignal(actual, predicted)
  };
}

function mae(actual, predicted) {
  const errors = getErrors(actual, predicted).map(Math.abs);
  return meanLocal(errors);
}

function mse(actual, predicted) {
  const errors = getErrors(actual, predicted).map(error => error * error);
  return meanLocal(errors);
}

function rmse(actual, predicted) {
  const value = mse(actual, predicted);
  return Number.isFinite(value) ? Math.sqrt(value) : NaN;
}

function mape(actual, predicted, zeroHandling = "safe") {
  const values = [];

  for (let i = 0; i < Math.min(actual.length, predicted.length); i += 1) {
    const a = toNumber(actual[i]);
    const p = toNumber(predicted[i]);

    if (!Number.isFinite(a) || !Number.isFinite(p)) continue;

    if (a === 0) {
      if (zeroHandling === "epsilon") {
        values.push(Math.abs((a - p) / 1e-8));
      }
      continue;
    }

    values.push(Math.abs((a - p) / a));
  }

  return meanLocal(values);
}

function smape(actual, predicted) {
  const values = [];

  for (let i = 0; i < Math.min(actual.length, predicted.length); i += 1) {
    const a = toNumber(actual[i]);
    const p = toNumber(predicted[i]);
    const denominator = (Math.abs(a) + Math.abs(p)) / 2;

    if (!Number.isFinite(a) || !Number.isFinite(p) || denominator === 0) continue;

    values.push(Math.abs(a - p) / denominator);
  }

  return meanLocal(values);
}

function mase(actual, predicted, seasonality = 1) {
  const maeValue = mae(actual, predicted);
  const naiveErrors = [];

  for (let i = seasonality; i < actual.length; i += 1) {
    const current = toNumber(actual[i]);
    const previous = toNumber(actual[i - seasonality]);

    if (Number.isFinite(current) && Number.isFinite(previous)) {
      naiveErrors.push(Math.abs(current - previous));
    }
  }

  const scale = meanLocal(naiveErrors);

  if (!Number.isFinite(scale) || scale === 0) return NaN;

  return maeValue / scale;
}

function rsfe(actual, predicted) {
  return getErrors(actual, predicted).reduce((acc, error) => acc + error, 0);
}

function trackingSignal(actual, predicted) {
  const maeValue = mae(actual, predicted);
  const rsfeValue = rsfe(actual, predicted);

  if (!Number.isFinite(maeValue) || maeValue === 0) return NaN;

  return rsfeValue / maeValue;
}

function getErrors(actual, predicted) {
  const errors = [];

  for (let i = 0; i < Math.min(actual.length, predicted.length); i += 1) {
    const a = toNumber(actual[i]);
    const p = toNumber(predicted[i]);

    if (Number.isFinite(a) && Number.isFinite(p)) {
      errors.push(a - p);
    }
  }

  return errors;
}

/* =========================================================
   5. Metric Set
========================================================= */

function selectMetricSet(metrics, metricSet = "full") {
  const basic = ["MAE", "RMSE", "MAPE"];
  const scaleFree = ["MAPE", "SMAPE", "MASE"];
  const full = ["MAE", "MSE", "RMSE", "MAPE", "SMAPE", "MASE", "RSFE", "TS"];

  let keys = full;

  if (metricSet === "basic") keys = basic;
  if (metricSet === "scale-free") keys = scaleFree;

  const selected = {};

  keys.forEach(key => {
    if (Number.isFinite(metrics[key])) {
      selected[key] = metrics[key];
    }
  });

  return selected;
}

function createMetricRows(metrics) {
  return Object.entries(metrics).map(([name, value]) => ({
    metric: name,
    value,
    direction: getMetricDirection(name),
    description: getMetricDescription(name)
  }));
}

/* =========================================================
   6. 메시지 / 추천
========================================================= */

function createMetricsMessages(metrics) {
  const messages = ["Forecast metrics가 계산되었습니다."];

  if (Number.isFinite(metrics.MAE)) {
    messages.push(`MAE는 ${formatNumber(metrics.MAE)}입니다.`);
  }

  if (Number.isFinite(metrics.RMSE)) {
    messages.push(`RMSE는 ${formatNumber(metrics.RMSE)}입니다.`);
  }

  if (Number.isFinite(metrics.MAPE)) {
    messages.push(`MAPE는 ${(metrics.MAPE * 100).toFixed(2)}%입니다.`);
  }

  if (Number.isFinite(metrics.TS)) {
    messages.push(`Tracking Signal은 ${formatNumber(metrics.TS)}입니다.`);
  }

  return messages;
}

function createMetricsRecommendation(metrics) {
  const recommendation = [];

  if (Number.isFinite(metrics.MAPE)) {
    if (metrics.MAPE < 0.1) {
      recommendation.push({
        nextStep: "Compare",
        priority: "normal",
        message: "MAPE가 낮아 예측 성능이 비교적 좋습니다. 다른 모델과 비교해 최종 모델을 선택하세요."
      });
    } else {
      recommendation.push({
        nextStep: "Forecast",
        priority: "medium",
        message: "MAPE가 다소 높습니다. Holt-Winters, ARIMA 또는 전처리 방법을 다시 검토하세요."
      });
    }
  }

  if (Number.isFinite(metrics.TS) && Math.abs(metrics.TS) > 4) {
    recommendation.push({
      nextStep: "Residual",
      priority: "high",
      message: "Tracking Signal 절댓값이 커 예측 편향 가능성이 있습니다. 잔차 분석을 확인하세요."
    });
  }

  recommendation.push({
    nextStep: "Compare",
    priority: "normal",
    message: "여러 모델의 Metrics Track을 Compare에서 비교하세요."
  });

  return recommendation;
}

/* =========================================================
   7. Metric 정보
========================================================= */

function getMetricDescription(metricName) {
  const descriptions = {
    MAE: "오차 절대값의 평균",
    MSE: "오차 제곱의 평균",
    RMSE: "MSE의 제곱근",
    MAPE: "실제값 대비 절대 오차 비율",
    SMAPE: "실제값과 예측값 평균 대비 절대 오차 비율",
    MASE: "naive 예측 대비 상대 오차",
    RSFE: "예측 오차 누적합",
    TS: "예측 편향 확인 지표"
  };

  return descriptions[metricName] || "Forecast metric";
}

function getMetricDirection(metricName) {
  if (["MAE", "MSE", "RMSE", "MAPE", "SMAPE", "MASE"].includes(metricName)) {
    return "lower is better";
  }

  if (["RSFE", "TS"].includes(metricName)) {
    return "near zero";
  }

  return "check";
}

/* =========================================================
   8. Track / Stack 보조
========================================================= */

function createMetricsTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Metrics`;
}

function markLatestMetricsStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Metrics");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createMetricsShortSummary(result)
  );
}

function createMetricsShortSummary(result) {
  if (!result || result.status !== "done") return "Metrics 계산 실패";

  const rmseText = Number.isFinite(result.metrics.RMSE)
    ? `RMSE ${formatNumber(result.metrics.RMSE)}`
    : "RMSE -";

  const mapeText = Number.isFinite(result.metrics.MAPE)
    ? `MAPE ${(result.metrics.MAPE * 100).toFixed(2)}%`
    : "MAPE -";

  return `${rmseText} · ${mapeText}`;
}

/* =========================================================
   9. UI 표시용 HTML
========================================================= */

function createMetricsResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Metrics 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Metrics Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Metrics Summary</strong><br />
      ${Object.entries(result.metrics)
        .map(([key, value]) => `${escapeHTML(key)}: ${formatMetricValue(key, value)}`)
        .join("<br />")}
    </div>
  `;
}

/* =========================================================
   10. Error
========================================================= */

function createMetricsErrorResult(message, extra = {}) {
  return {
    type: "Metrics",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Forecast",
        priority: "high",
        message: "Metrics 계산에는 실제값과 예측값이 모두 필요합니다."
      }
    ],
    ...extra
  };
}

/* =========================================================
   11. 보조 함수
========================================================= */

function inferColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return Object.keys(rows[0]).filter(column => !column.startsWith("__"));
}

function inferTargetColumn(rows) {
  const columns = inferColumns(rows);

  if (window.TSCSVUtils) {
    const numericColumns = window.TSCSVUtils.detectNumericColumns(rows, columns);
    return numericColumns[0] || null;
  }

  return columns[0] || null;
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

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toFixed(digits);
}

function formatMetricValue(metricName, value) {
  if (!Number.isFinite(value)) return "-";

  if (metricName === "MAPE" || metricName === "SMAPE") {
    return `${(value * 100).toFixed(2)}%`;
  }

  return value.toFixed(3);
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

window.TSMetricsAnalysis = {
  runMetricsAnalysis,
  runMetricsAnalysisOnTrack,

  resolveActualValues,
  resolvePredictedValues,
  resolvePredictedFromTrack,
  alignActualPredicted,

  calculateAllMetrics,
  selectMetricSet,

  mae,
  mse,
  rmse,
  mape,
  smape,
  mase,
  rsfe,
  trackingSignal,

  createMetricsMessages,
  createMetricsRecommendation,
  createMetricsShortSummary,
  createMetricsResultHTML
};