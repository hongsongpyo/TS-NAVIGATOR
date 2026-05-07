/* =========================================================
   TS Navigator - metrics.js
   예측 성능평가: MAE, MSE, RMSE, MAPE, SMAPE
   ========================================================= */

/* =========================================================
   전체 평가지표 계산
   ========================================================= */

function calculateMetrics(actual = [], predicted = []) {
  const pairs = createValidPairs(actual, predicted);

  if (pairs.length === 0) {
    return {
      mae: null,
      mse: null,
      rmse: null,
      mape: null,
      smape: null,
      count: 0,
    };
  }

  const actualValues = pairs.map((pair) => pair.actual);
  const predictedValues = pairs.map((pair) => pair.predicted);

  return {
    mae: calculateMAE(actualValues, predictedValues),
    mse: calculateMSE(actualValues, predictedValues),
    rmse: calculateRMSE(actualValues, predictedValues),
    mape: calculateMAPE(actualValues, predictedValues),
    smape: calculateSMAPE(actualValues, predictedValues),
    count: pairs.length,
  };
}

/* =========================================================
   Valid Pair 생성
   ========================================================= */

function createValidPairs(actual = [], predicted = []) {
  const length = Math.min(actual.length, predicted.length);
  const pairs = [];

  for (let i = 0; i < length; i += 1) {
    const actualValue = TSMathUtils.toNumber(actual[i]);
    const predictedValue = TSMathUtils.toNumber(predicted[i]);

    if (actualValue === null || predictedValue === null) continue;

    pairs.push({
      index: i,
      actual: actualValue,
      predicted: predictedValue,
      error: actualValue - predictedValue,
    });
  }

  return pairs;
}

/* =========================================================
   MAE
   ========================================================= */

function calculateMAE(actual = [], predicted = []) {
  const pairs = createValidPairs(actual, predicted);

  if (pairs.length === 0) return null;

  const errors = pairs.map((pair) => Math.abs(pair.error));

  return TSMathUtils.mean(errors);
}

/* =========================================================
   MSE
   ========================================================= */

function calculateMSE(actual = [], predicted = []) {
  const pairs = createValidPairs(actual, predicted);

  if (pairs.length === 0) return null;

  const errors = pairs.map((pair) => Math.pow(pair.error, 2));

  return TSMathUtils.mean(errors);
}

/* =========================================================
   RMSE
   ========================================================= */

function calculateRMSE(actual = [], predicted = []) {
  const mse = calculateMSE(actual, predicted);

  if (mse === null) return null;

  return Math.sqrt(mse);
}

/* =========================================================
   MAPE
   실제값이 0인 경우 계산에서 제외
   ========================================================= */

function calculateMAPE(actual = [], predicted = []) {
  const pairs = createValidPairs(actual, predicted).filter((pair) => {
    return pair.actual !== 0;
  });

  if (pairs.length === 0) return null;

  const errors = pairs.map((pair) => {
    return Math.abs(pair.error / pair.actual) * 100;
  });

  return TSMathUtils.mean(errors);
}

/* =========================================================
   SMAPE
   실제값과 예측값이 모두 0인 경우 계산에서 제외
   ========================================================= */

function calculateSMAPE(actual = [], predicted = []) {
  const pairs = createValidPairs(actual, predicted).filter((pair) => {
    return Math.abs(pair.actual) + Math.abs(pair.predicted) !== 0;
  });

  if (pairs.length === 0) return null;

  const errors = pairs.map((pair) => {
    const denominator = (Math.abs(pair.actual) + Math.abs(pair.predicted)) / 2;

    return (Math.abs(pair.error) / denominator) * 100;
  });

  return TSMathUtils.mean(errors);
}

/* =========================================================
   잔차 분석
   ========================================================= */

function calculateResidualSeries(actual = [], predicted = [], dates = []) {
  const length = Math.min(actual.length, predicted.length);

  const residuals = [];

  for (let i = 0; i < length; i += 1) {
    const actualValue = TSMathUtils.toNumber(actual[i]);
    const predictedValue = TSMathUtils.toNumber(predicted[i]);

    if (actualValue === null || predictedValue === null) {
      residuals.push({
        date: dates[i] || i,
        actual: actualValue,
        predicted: predictedValue,
        value: null,
      });
      continue;
    }

    residuals.push({
      date: dates[i] || i,
      actual: actualValue,
      predicted: predictedValue,
      value: actualValue - predictedValue,
    });
  }

  return residuals;
}

function summarizeResiduals(residuals = []) {
  const values = residuals.map((item) => item.value);

  return {
    mean: TSMathUtils.mean(values),
    median: TSMathUtils.median(values),
    min: TSMathUtils.min(values),
    max: TSMathUtils.max(values),
    standardDeviation: TSMathUtils.standardDeviation(values, false),
    variance: TSMathUtils.variance(values, false),
  };
}

/* =========================================================
   Metric 등급 해석
   ========================================================= */

function interpretMetrics(metrics = {}) {
  const interpretations = [];

  if (metrics.mae !== null && metrics.mae !== undefined) {
    interpretations.push({
      metric: "MAE",
      value: metrics.mae,
      label: "절대 오차 평균",
      description:
        "실제값과 예측값의 차이를 절댓값으로 계산한 평균입니다. 값이 작을수록 좋습니다.",
    });
  }

  if (metrics.rmse !== null && metrics.rmse !== undefined) {
    interpretations.push({
      metric: "RMSE",
      value: metrics.rmse,
      label: "제곱 오차 기반 평균",
      description:
        "큰 오차에 더 민감한 지표입니다. 값이 작을수록 좋고, 큰 예측 실패를 확인하는 데 유용합니다.",
    });
  }

  if (metrics.mape !== null && metrics.mape !== undefined) {
    interpretations.push({
      metric: "MAPE",
      value: metrics.mape,
      label: "비율 기반 오차",
      description:
        "실제값 대비 예측 오차를 백분율로 나타냅니다. 실제값이 0에 가까우면 불안정할 수 있습니다.",
    });
  }

  if (metrics.smape !== null && metrics.smape !== undefined) {
    interpretations.push({
      metric: "SMAPE",
      value: metrics.smape,
      label: "대칭 비율 오차",
      description:
        "실제값과 예측값의 평균 크기를 기준으로 오차율을 계산합니다. MAPE보다 0 근방에서 비교적 안정적입니다.",
    });
  }

  return interpretations;
}

function getMetricQualityLabel(metricName, value) {
  if (value === null || value === undefined) return "계산 불가";

  if (metricName === "MAPE" || metricName === "SMAPE") {
    if (value < 10) return "매우 좋음";
    if (value < 20) return "좋음";
    if (value < 50) return "보통";
    return "주의 필요";
  }

  return "값이 작을수록 좋음";
}

/* =========================================================
   Forecast 결과에서 Metric 생성
   ========================================================= */

function createMetricsFromForecastResult(forecastResult) {
  if (!forecastResult) return null;

  const actual = forecastResult.test?.map((item) => item.value) || [];
  const predicted = forecastResult.testForecast || [];
  const dates = forecastResult.test?.map((item) => item.date) || [];

  const metrics = calculateMetrics(actual, predicted);
  const residuals = calculateResidualSeries(actual, predicted, dates);
  const residualSummary = summarizeResiduals(residuals);
  const interpretation = interpretMetrics(metrics);

  return {
    actual,
    predicted,
    dates,
    metrics,
    residuals,
    residualSummary,
    interpretation,
  };
}

/* =========================================================
   Metric Track 생성
   ========================================================= */

function createMetricTrack({
  sourceTrackId,
  forecastResult,
  regionId = null,
}) {
  const sourceTrack = TSStore.getTrackById(sourceTrackId);

  if (!sourceTrack || !forecastResult) {
    return null;
  }

  const metricResult = createMetricsFromForecastResult(forecastResult);

  const process = TSStore.createProcess({
    name: "Evaluation Metrics",
    type: "metrics",
    trackId: sourceTrackId,
    parameters: {
      method: forecastResult.method,
    },
    status: "completed",
  });

  const metricRows = metricsToRows(metricResult.metrics);

  const track = TSStore.createTrack({
    name: "Evaluation Result",
    type: "Evaluation Result",
    data: metricRows,
    x: metricRows.map((item) => item.metric),
    y: metricRows.map((item) => item.value),
    color: "#7950f2",
    regionId: regionId || sourceTrack.regionId,
    processId: process.id,
    metadata: {
      sourceTrackId,
      processType: "metrics",
      forecastMethod: forecastResult.method,
      residuals: metricResult.residuals,
      residualSummary: metricResult.residualSummary,
      interpretation: metricResult.interpretation,
    },
  });

  TSStore.updateProcess(process.id, {
    resultTrackId: track.id,
  });

  return {
    process,
    track,
    result: metricResult,
  };
}

function metricsToRows(metrics = {}) {
  return [
    {
      metric: "MAE",
      value: metrics.mae,
      description: "평균 절대 오차",
      quality: getMetricQualityLabel("MAE", metrics.mae),
    },
    {
      metric: "MSE",
      value: metrics.mse,
      description: "평균 제곱 오차",
      quality: getMetricQualityLabel("MSE", metrics.mse),
    },
    {
      metric: "RMSE",
      value: metrics.rmse,
      description: "제곱근 평균 제곱 오차",
      quality: getMetricQualityLabel("RMSE", metrics.rmse),
    },
    {
      metric: "MAPE",
      value: metrics.mape,
      description: "평균 절대 백분율 오차",
      quality: getMetricQualityLabel("MAPE", metrics.mape),
    },
    {
      metric: "SMAPE",
      value: metrics.smape,
      description: "대칭 평균 절대 백분율 오차",
      quality: getMetricQualityLabel("SMAPE", metrics.smape),
    },
  ];
}

/* =========================================================
   여러 모델 Metric 비교
   ========================================================= */

function compareMetricResults(results = []) {
  return results
    .map((item) => {
      const metrics = item.metrics || item.result?.metrics || {};

      return {
        name: item.name || item.method || "Model",
        method: item.method || item.result?.method || "unknown",
        mae: metrics.mae,
        mse: metrics.mse,
        rmse: metrics.rmse,
        mape: metrics.mape,
        smape: metrics.smape,
      };
    })
    .sort((a, b) => {
      const aValue = a.rmse ?? Number.POSITIVE_INFINITY;
      const bValue = b.rmse ?? Number.POSITIVE_INFINITY;

      return aValue - bValue;
    });
}

function getBestMetricResult(results = [], metric = "rmse") {
  const validResults = results.filter((item) => {
    const value = item[metric];

    return value !== null && value !== undefined;
  });

  if (validResults.length === 0) return null;

  return [...validResults].sort((a, b) => a[metric] - b[metric])[0];
}

/* =========================================================
   자동 평가 실행
   ========================================================= */

function runAutoMetrics({
  sourceTrackId,
  forecastResult,
  regionId = null,
}) {
  return createMetricTrack({
    sourceTrackId,
    forecastResult,
    regionId,
  });
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSMetrics = {
  calculateMetrics,
  createValidPairs,

  calculateMAE,
  calculateMSE,
  calculateRMSE,
  calculateMAPE,
  calculateSMAPE,

  calculateResidualSeries,
  summarizeResiduals,

  interpretMetrics,
  getMetricQualityLabel,

  createMetricsFromForecastResult,
  createMetricTrack,
  metricsToRows,

  compareMetricResults,
  getBestMetricResult,

  runAutoMetrics,
};