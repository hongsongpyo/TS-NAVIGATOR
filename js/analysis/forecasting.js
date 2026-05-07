/* =========================================================
   TS Navigator - forecasting.js
   Naive, SMA, ES, Holt, ARIMA 간이 구현
   ========================================================= */

/* =========================================================
   예측 전체 실행
   ========================================================= */

function runForecasting({
  trackId,
  method = "holt",
  horizon = 12,
  trainRatio = 0.8,
  windowSize = 5,
  alpha = 0.3,
  beta = 0.1,
  arimaP = 1,
  arimaD = 1,
  arimaQ = 0,
  createTrack = true,
}) {
  const sourceTrack = TSStore.getTrackById(trackId);

  if (!sourceTrack) {
    return null;
  }

  const process = TSStore.createProcess({
    name: "Forecasting",
    type: "forecasting",
    trackId,
    parameters: {
      method,
      horizon,
      trainRatio,
      windowSize,
      alpha,
      beta,
      arimaP,
      arimaD,
      arimaQ,
    },
    status: "running",
  });

  const series = TSPreprocessing.trackToSeries(sourceTrack);
  const cleanedSeries = series.filter((item) => item.value !== null);

  const split = splitTrainTest(cleanedSeries, trainRatio);
  const trainValues = split.train.map((item) => item.value);
  const testValues = split.test.map((item) => item.value);

  const forecastResult = forecastValues({
    values: trainValues,
    method,
    horizon: Math.max(horizon, testValues.length),
    windowSize,
    alpha,
    beta,
    arimaP,
    arimaD,
    arimaQ,
  });

  const testForecast = forecastResult.forecast.slice(0, testValues.length);
  const futureForecast = forecastResult.forecast.slice(
    testValues.length,
    testValues.length + horizon
  );

  const futureDates = createFutureDates({
    sourceDates: cleanedSeries.map((item) => item.date),
    horizon,
  });

  const futureSeries = futureDates.map((date, index) => ({
    date,
    value: futureForecast[index],
    forecast: true,
    lower: forecastResult.lower[testValues.length + index],
    upper: forecastResult.upper[testValues.length + index],
  }));

  const fittedSeries = split.test.map((item, index) => ({
    date: item.date,
    actual: item.value,
    value: testForecast[index],
    forecast: true,
    lower: forecastResult.lower[index],
    upper: forecastResult.upper[index],
  }));

  const residuals = calculateForecastResiduals(testValues, testForecast);

  const result = {
    sourceTrackId: trackId,
    processId: process.id,
    method,
    train: split.train,
    test: split.test,
    fittedSeries,
    futureSeries,
    forecast: futureForecast,
    testForecast,
    lower: futureSeries.map((item) => item.lower),
    upper: futureSeries.map((item) => item.upper),
    residuals,
    report: createForecastReport({
      method,
      trainValues,
      testValues,
      testForecast,
      futureForecast,
      residuals,
      parameters: process.parameters,
    }),
  };

  let resultTrack = null;

  if (createTrack) {
    resultTrack = TSStore.createTrack({
      name: "Forecast Data",
      type: "Forecast Data",
      data: futureSeries,
      x: futureSeries.map((item) => item.date),
      y: futureSeries.map((item) => item.value),
      color: "#f59f00",
      regionId: sourceTrack.regionId,
      processId: process.id,
      metadata: {
        sourceTrackId: trackId,
        processType: "forecasting",
        parameters: process.parameters,
        fittedSeries,
        futureSeries,
        report: result.report,
      },
    });

    process.resultTrackId = resultTrack.id;
  }

  TSStore.updateProcess(process.id, {
    status: "completed",
    resultTrackId: resultTrack ? resultTrack.id : null,
  });

  return {
    process,
    track: resultTrack,
    result,
  };
}

/* =========================================================
   Train / Test Split
   ========================================================= */

function splitTrainTest(series = [], trainRatio = 0.8) {
  const safeRatio = Math.min(Math.max(trainRatio, 0.5), 0.95);
  const splitIndex = Math.max(1, Math.floor(series.length * safeRatio));

  return {
    train: series.slice(0, splitIndex),
    test: series.slice(splitIndex),
    splitIndex,
    trainRatio: safeRatio,
  };
}

/* =========================================================
   예측 Method Router
   ========================================================= */

function forecastValues({
  values = [],
  method = "holt",
  horizon = 12,
  windowSize = 5,
  alpha = 0.3,
  beta = 0.1,
  arimaP = 1,
  arimaD = 1,
  arimaQ = 0,
}) {
  const cleanValues = TSMathUtils.linearInterpolate(values).filter(
    (value) => value !== null
  );

  let forecast = [];

  switch (method) {
    case "naive":
      forecast = naiveForecast(cleanValues, horizon);
      break;

    case "sma":
      forecast = simpleMovingAverageForecast(cleanValues, horizon, windowSize);
      break;

    case "es":
      forecast = exponentialSmoothingForecast(cleanValues, horizon, alpha);
      break;

    case "holt":
      forecast = holtLinearForecast(cleanValues, horizon, alpha, beta);
      break;

    case "arima":
      forecast = simpleARIMAForecast({
        values: cleanValues,
        horizon,
        p: arimaP,
        d: arimaD,
        q: arimaQ,
      });
      break;

    default:
      forecast = holtLinearForecast(cleanValues, horizon, alpha, beta);
      break;
  }

  const interval = createPredictionInterval(cleanValues, forecast);

  return {
    forecast,
    lower: interval.lower,
    upper: interval.upper,
  };
}

/* =========================================================
   Naive Forecast
   ========================================================= */

function naiveForecast(values = [], horizon = 1) {
  const lastValue = values[values.length - 1] ?? null;

  return Array.from({ length: horizon }, () => lastValue);
}

/* =========================================================
   Simple Moving Average Forecast
   ========================================================= */

function simpleMovingAverageForecast(values = [], horizon = 1, windowSize = 5) {
  const result = [];
  const history = [...values];
  const safeWindowSize = Math.max(1, Number(windowSize) || 1);

  for (let i = 0; i < horizon; i += 1) {
    const window = history.slice(-safeWindowSize);
    const nextValue = TSMathUtils.mean(window);

    result.push(nextValue);
    history.push(nextValue);
  }

  return result;
}

/* =========================================================
   Exponential Smoothing Forecast
   ========================================================= */

function exponentialSmoothingForecast(values = [], horizon = 1, alpha = 0.3) {
  if (values.length === 0) {
    return Array.from({ length: horizon }, () => null);
  }

  const safeAlpha = Math.min(Math.max(alpha, 0.01), 0.99);

  let level = values[0];

  for (let i = 1; i < values.length; i += 1) {
    level = safeAlpha * values[i] + (1 - safeAlpha) * level;
  }

  return Array.from({ length: horizon }, () => level);
}

/* =========================================================
   Holt Linear Forecast
   ========================================================= */

function holtLinearForecast(
  values = [],
  horizon = 1,
  alpha = 0.3,
  beta = 0.1
) {
  if (values.length === 0) {
    return Array.from({ length: horizon }, () => null);
  }

  if (values.length === 1) {
    return Array.from({ length: horizon }, () => values[0]);
  }

  const safeAlpha = Math.min(Math.max(alpha, 0.01), 0.99);
  const safeBeta = Math.min(Math.max(beta, 0.01), 0.99);

  let level = values[0];
  let trend = values[1] - values[0];

  for (let i = 1; i < values.length; i += 1) {
    const previousLevel = level;

    level = safeAlpha * values[i] + (1 - safeAlpha) * (level + trend);
    trend = safeBeta * (level - previousLevel) + (1 - safeBeta) * trend;
  }

  return Array.from({ length: horizon }, (_, index) => {
    return level + (index + 1) * trend;
  });
}

/* =========================================================
   ARIMA 간이 구현
   ARIMA(p,d,q) 중 q는 간단 버전에서 직접 사용하지 않고
   differencing + AR(p) 회귀 기반으로 근사
   ========================================================= */

function simpleARIMAForecast({
  values = [],
  horizon = 1,
  p = 1,
  d = 1,
  q = 0,
}) {
  if (values.length === 0) {
    return Array.from({ length: horizon }, () => null);
  }

  const safeP = Math.max(1, Number(p) || 1);
  const safeD = Math.max(0, Number(d) || 0);

  const differenced = differenceSeries(values, safeD);

  if (differenced.length <= safeP) {
    return naiveForecast(values, horizon);
  }

  const arForecast = autoregressiveForecast(differenced, horizon, safeP);

  return invertDifferencing({
    originalValues: values,
    differencedForecast: arForecast,
    d: safeD,
  });
}

function differenceSeries(values = [], d = 1) {
  let result = [...values];

  for (let order = 0; order < d; order += 1) {
    const next = [];

    for (let i = 1; i < result.length; i += 1) {
      next.push(result[i] - result[i - 1]);
    }

    result = next;
  }

  return result;
}

function autoregressiveForecast(values = [], horizon = 1, p = 1) {
  const history = [...values];
  const result = [];

  const coefficients = estimateARCoefficients(values, p);

  for (let step = 0; step < horizon; step += 1) {
    const recent = history.slice(-p).reverse();

    let nextValue = coefficients.intercept;

    recent.forEach((value, index) => {
      nextValue += coefficients.phi[index] * value;
    });

    result.push(nextValue);
    history.push(nextValue);
  }

  return result;
}

function estimateARCoefficients(values = [], p = 1) {
  if (p === 1) {
    return estimateAR1Coefficient(values);
  }

  return estimateARMeanCoefficients(values, p);
}

function estimateAR1Coefficient(values = []) {
  const x = [];
  const y = [];

  for (let i = 1; i < values.length; i += 1) {
    x.push(values[i - 1]);
    y.push(values[i]);
  }

  const xMean = TSMathUtils.mean(x);
  const yMean = TSMathUtils.mean(y);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < x.length; i += 1) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    denominator += Math.pow(x[i] - xMean, 2);
  }

  const phi = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - phi * xMean;

  return {
    intercept,
    phi: [phi],
  };
}

function estimateARMeanCoefficients(values = [], p = 1) {
  /*
     브라우저에서 가볍게 실행하기 위한 단순 근사.
     p개 lag에 동일 가중치를 주고 평균회귀 형태로 예측한다.
  */
  const avg = TSMathUtils.mean(values) ?? 0;
  const weight = 1 / p;

  return {
    intercept: avg * 0.1,
    phi: Array.from({ length: p }, () => weight * 0.9),
  };
}

function invertDifferencing({
  originalValues = [],
  differencedForecast = [],
  d = 1,
}) {
  if (d === 0) {
    return differencedForecast;
  }

  if (d === 1) {
    let lastValue = originalValues[originalValues.length - 1];

    return differencedForecast.map((diff) => {
      lastValue += diff;
      return lastValue;
    });
  }

  /*
     d >= 2인 경우 간단 복원:
     마지막 1차 차분값을 유지하며 누적 복원
  */
  const firstDiff = differenceSeries(originalValues, 1);
  let lastValue = originalValues[originalValues.length - 1];
  let lastDiff = firstDiff[firstDiff.length - 1] ?? 0;

  return differencedForecast.map((diff) => {
    lastDiff += diff;
    lastValue += lastDiff;
    return lastValue;
  });
}

/* =========================================================
   예측 날짜 생성
   ========================================================= */

function createFutureDates({
  sourceDates = [],
  horizon = 12,
  frequency = null,
}) {
  const validDates = sourceDates
    .map((date) => TSDateUtils.toISOStringSafe(date))
    .filter(Boolean);

  if (validDates.length === 0) {
    return Array.from({ length: horizon }, (_, index) => String(index + 1));
  }

  const inferredFrequency =
    frequency || TSDateUtils.inferFrequency(validDates).label || "daily";

  let current = validDates[validDates.length - 1];

  const futureDates = [];

  for (let i = 0; i < horizon; i += 1) {
    const nextDate = TSDateUtils.incrementByFrequency(
      current,
      inferredFrequency
    );

    current = nextDate ? nextDate.toISOString() : current;
    futureDates.push(current);
  }

  return futureDates;
}

/* =========================================================
   Prediction Interval
   ========================================================= */

function createPredictionInterval(values = [], forecast = []) {
  const fittedNaive = values.slice(0, -1);
  const actual = values.slice(1);

  const residuals = actual.map((value, index) => {
    return value - fittedNaive[index];
  });

  const residualStd = TSMathUtils.standardDeviation(residuals, false) || 1;

  const lower = forecast.map((value, index) => {
    if (value === null) return null;

    const width = 1.96 * residualStd * Math.sqrt(index + 1);

    return value - width;
  });

  const upper = forecast.map((value, index) => {
    if (value === null) return null;

    const width = 1.96 * residualStd * Math.sqrt(index + 1);

    return value + width;
  });

  return {
    lower,
    upper,
  };
}

/* =========================================================
   Residual
   ========================================================= */

function calculateForecastResiduals(actual = [], predicted = []) {
  return actual.map((value, index) => {
    const a = TSMathUtils.toNumber(value);
    const p = TSMathUtils.toNumber(predicted[index]);

    if (a === null || p === null) return null;

    return a - p;
  });
}

/* =========================================================
   Forecast Report
   ========================================================= */

function createForecastReport({
  method,
  trainValues,
  testValues,
  testForecast,
  futureForecast,
  residuals,
  parameters,
}) {
  const metrics =
    window.TSMetrics && typeof TSMetrics.calculateMetrics === "function"
      ? TSMetrics.calculateMetrics(testValues, testForecast)
      : null;

  return {
    method,
    parameters,
    trainCount: trainValues.length,
    testCount: testValues.length,
    forecastCount: futureForecast.length,
    residualMean: TSMathUtils.mean(residuals),
    residualStd: TSMathUtils.standardDeviation(residuals, false),
    metrics,
    message: createForecastMessage(method, metrics),
  };
}

function createForecastMessage(method, metrics = null) {
  const methodName = getForecastMethodName(method);

  if (!metrics || metrics.rmse === null) {
    return `${methodName} 방법으로 예측을 수행했습니다.`;
  }

  return `${methodName} 방법으로 예측을 수행했습니다. RMSE는 ${TSMathUtils.formatNumber(
    metrics.rmse,
    4
  )}입니다.`;
}

function getForecastMethodName(method) {
  switch (method) {
    case "naive":
      return "Naive";

    case "sma":
      return "Simple Moving Average";

    case "es":
      return "Exponential Smoothing";

    case "holt":
      return "Holt Linear";

    case "arima":
      return "ARIMA 간이";

    default:
      return method;
  }
}

/* =========================================================
   자동 예측 추천
   ========================================================= */

function recommendForecastMethod(values = [], frequency = "daily") {
  const cleanValues = TSMathUtils.cleanNumberArray(values);

  if (cleanValues.length < 10) {
    return {
      method: "naive",
      horizon: 5,
      trainRatio: 0.8,
      reason: "데이터 길이가 짧아 마지막 값을 반복하는 Naive 예측을 권장합니다.",
    };
  }

  const trendStrength = estimateTrendStrength(cleanValues);
  const volatility = estimateVolatility(cleanValues);

  if (trendStrength > 0.5) {
    return {
      method: "holt",
      horizon: getDefaultHorizon(frequency),
      trainRatio: 0.8,
      alpha: 0.3,
      beta: 0.1,
      reason: "추세 성분이 있는 데이터로 판단되어 Holt Linear 예측을 권장합니다.",
    };
  }

  if (volatility > 0.4) {
    return {
      method: "es",
      horizon: getDefaultHorizon(frequency),
      trainRatio: 0.8,
      alpha: 0.25,
      reason: "변동성이 큰 데이터로 판단되어 지수평활 예측을 권장합니다.",
    };
  }

  return {
    method: "sma",
    horizon: getDefaultHorizon(frequency),
    trainRatio: 0.8,
    windowSize: 5,
    reason: "뚜렷한 추세가 크지 않아 이동평균 예측을 권장합니다.",
  };
}

function estimateTrendStrength(values = []) {
  if (values.length < 2) return 0;

  const x = TSMathUtils.createSequence(values.length);
  const y = values;

  const xMean = TSMathUtils.mean(x);
  const yMean = TSMathUtils.mean(y);

  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;

  for (let i = 0; i < values.length; i += 1) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    xDenominator += Math.pow(x[i] - xMean, 2);
    yDenominator += Math.pow(y[i] - yMean, 2);
  }

  const denominator = Math.sqrt(xDenominator * yDenominator);

  if (denominator === 0) return 0;

  return Math.abs(numerator / denominator);
}

function estimateVolatility(values = []) {
  const avg = Math.abs(TSMathUtils.mean(values) || 0);
  const sd = TSMathUtils.standardDeviation(values, false) || 0;

  if (avg === 0) return 0;

  return sd / avg;
}

function getDefaultHorizon(frequency = "daily") {
  switch (frequency) {
    case "hour":
      return 24;

    case "daily":
      return 14;

    case "weekly":
      return 8;

    case "monthly":
      return 12;

    case "yearly":
      return 5;

    default:
      return 12;
  }
}

function runAutoForecasting(trackId) {
  const sourceTrack = TSStore.getTrackById(trackId);

  if (!sourceTrack) return null;

  const frequency =
    sourceTrack.metadata?.frequency ||
    TSState.uploadedData.frequency ||
    "daily";

  const recommendation = recommendForecastMethod(sourceTrack.y, frequency);

  return runForecasting({
    trackId,
    method: recommendation.method,
    horizon: recommendation.horizon,
    trainRatio: recommendation.trainRatio,
    windowSize: recommendation.windowSize || 5,
    alpha: recommendation.alpha || 0.3,
    beta: recommendation.beta || 0.1,
    createTrack: true,
  });
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSForecasting = {
  runForecasting,

  splitTrainTest,
  forecastValues,

  naiveForecast,
  simpleMovingAverageForecast,
  exponentialSmoothingForecast,
  holtLinearForecast,

  simpleARIMAForecast,
  differenceSeries,
  autoregressiveForecast,
  estimateARCoefficients,
  estimateAR1Coefficient,
  estimateARMeanCoefficients,
  invertDifferencing,

  createFutureDates,
  createPredictionInterval,

  calculateForecastResiduals,

  createForecastReport,
  createForecastMessage,
  getForecastMethodName,

  recommendForecastMethod,
  estimateTrendStrength,
  estimateVolatility,
  getDefaultHorizon,
  runAutoForecasting,
};