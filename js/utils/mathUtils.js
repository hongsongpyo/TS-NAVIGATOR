/* =========================================================
   TS Navigator - mathUtils.js
   ---------------------------------------------------------
   역할
   1. 기초 통계 계산
   2. 결측치 / 이상치 / 스케일 확인
   3. 이동평균, 지수평활, 차분 등 시계열 수학 처리
   4. 예측 성능평가지표 계산
   5. 상관, ACF, PACF 보조 계산
========================================================= */

/* =========================================================
   1. 숫자 변환 / 배열 정리
========================================================= */

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return NaN;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  const cleaned = String(value)
    .trim()
    .replace(/,/g, "");

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

function isValidNumber(value) {
  return Number.isFinite(toNumber(value));
}

function toNumericArray(values) {
  if (!Array.isArray(values)) return [];

  return values.map(toNumber);
}

function cleanNumericArray(values) {
  return toNumericArray(values).filter(Number.isFinite);
}

function getColumnValues(rows, columnName) {
  if (!Array.isArray(rows) || !columnName) return [];

  return rows.map(row => toNumber(row[columnName]));
}

function getValidPairs(actual, predicted) {
  const yTrue = toNumericArray(actual);
  const yPred = toNumericArray(predicted);

  const pairs = [];

  for (let i = 0; i < Math.min(yTrue.length, yPred.length); i += 1) {
    if (Number.isFinite(yTrue[i]) && Number.isFinite(yPred[i])) {
      pairs.push({
        actual: yTrue[i],
        predicted: yPred[i],
        error: yTrue[i] - yPred[i]
      });
    }
  }

  return pairs;
}

/* =========================================================
   2. 기초 통계량
========================================================= */

function sum(values) {
  return cleanNumericArray(values).reduce((acc, value) => acc + value, 0);
}

function mean(values) {
  const clean = cleanNumericArray(values);
  if (clean.length === 0) return NaN;

  return sum(clean) / clean.length;
}

function median(values) {
  const clean = cleanNumericArray(values).sort((a, b) => a - b);
  if (clean.length === 0) return NaN;

  const middle = Math.floor(clean.length / 2);

  if (clean.length % 2 === 0) {
    return (clean[middle - 1] + clean[middle]) / 2;
  }

  return clean[middle];
}

function min(values) {
  const clean = cleanNumericArray(values);
  if (clean.length === 0) return NaN;

  return Math.min(...clean);
}

function max(values) {
  const clean = cleanNumericArray(values);
  if (clean.length === 0) return NaN;

  return Math.max(...clean);
}

function variance(values, sample = true) {
  const clean = cleanNumericArray(values);
  if (clean.length <= 1) return NaN;

  const avg = mean(clean);
  const squaredDiffSum = clean.reduce((acc, value) => {
    return acc + Math.pow(value - avg, 2);
  }, 0);

  return squaredDiffSum / (sample ? clean.length - 1 : clean.length);
}

function standardDeviation(values, sample = true) {
  const varValue = variance(values, sample);
  return Number.isFinite(varValue) ? Math.sqrt(varValue) : NaN;
}

function quantile(values, q) {
  const clean = cleanNumericArray(values).sort((a, b) => a - b);
  if (clean.length === 0) return NaN;

  if (q <= 0) return clean[0];
  if (q >= 1) return clean[clean.length - 1];

  const position = (clean.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;

  if (lower === upper) {
    return clean[lower];
  }

  return clean[lower] * (1 - weight) + clean[upper] * weight;
}

function iqr(values) {
  return quantile(values, 0.75) - quantile(values, 0.25);
}

function range(values) {
  return max(values) - min(values);
}

function describe(values) {
  const clean = cleanNumericArray(values);

  return {
    count: clean.length,
    missingCount: Array.isArray(values) ? values.length - clean.length : 0,
    mean: mean(clean),
    median: median(clean),
    min: min(clean),
    max: max(clean),
    variance: variance(clean),
    std: standardDeviation(clean),
    q1: quantile(clean, 0.25),
    q3: quantile(clean, 0.75),
    iqr: iqr(clean),
    range: range(clean)
  };
}

/* =========================================================
   3. 결측치 확인
========================================================= */

function countMissing(values) {
  if (!Array.isArray(values)) return 0;

  return values.filter(value => {
    return !Number.isFinite(toNumber(value));
  }).length;
}

function missingRatio(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;

  return countMissing(values) / values.length;
}

function hasMissing(values) {
  return countMissing(values) > 0;
}

/* =========================================================
   4. 이상치 탐지
========================================================= */

function zScores(values) {
  const nums = toNumericArray(values);
  const avg = mean(nums);
  const std = standardDeviation(nums);

  if (!Number.isFinite(std) || std === 0) {
    return nums.map(() => 0);
  }

  return nums.map(value => {
    if (!Number.isFinite(value)) return NaN;
    return (value - avg) / std;
  });
}

function detectOutliersZScore(values, threshold = 3) {
  const scores = zScores(values);

  return scores
    .map((score, index) => ({
      index,
      value: toNumber(values[index]),
      score,
      isOutlier: Number.isFinite(score) && Math.abs(score) > threshold
    }))
    .filter(item => item.isOutlier);
}

function detectOutliersIQR(values, multiplier = 1.5) {
  const nums = toNumericArray(values);
  const q1 = quantile(nums, 0.25);
  const q3 = quantile(nums, 0.75);
  const iqrValue = q3 - q1;

  const lower = q1 - multiplier * iqrValue;
  const upper = q3 + multiplier * iqrValue;

  return nums
    .map((value, index) => ({
      index,
      value,
      lower,
      upper,
      isOutlier: Number.isFinite(value) && (value < lower || value > upper)
    }))
    .filter(item => item.isOutlier);
}

function detectOutliersHampel(values, windowSize = 7, threshold = 3) {
  const nums = toNumericArray(values);
  const halfWindow = Math.floor(windowSize / 2);
  const result = [];

  for (let i = 0; i < nums.length; i += 1) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(nums.length, i + halfWindow + 1);
    const windowValues = nums.slice(start, end).filter(Number.isFinite);

    if (windowValues.length < 3 || !Number.isFinite(nums[i])) continue;

    const med = median(windowValues);
    const absDeviations = windowValues.map(value => Math.abs(value - med));
    const mad = median(absDeviations);

    if (!Number.isFinite(mad) || mad === 0) continue;

    const score = Math.abs(nums[i] - med) / (1.4826 * mad);

    if (score > threshold) {
      result.push({
        index: i,
        value: nums[i],
        median: med,
        mad,
        score,
        isOutlier: true
      });
    }
  }

  return result;
}

/* =========================================================
   5. 보간 / 결측 대체
========================================================= */

function fillForward(values) {
  const nums = toNumericArray(values);
  const result = [];

  let lastValue = NaN;

  nums.forEach(value => {
    if (Number.isFinite(value)) {
      lastValue = value;
      result.push(value);
    } else {
      result.push(lastValue);
    }
  });

  return result;
}

function fillBackward(values) {
  const nums = toNumericArray(values);
  const result = [...nums];

  let nextValue = NaN;

  for (let i = nums.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(nums[i])) {
      nextValue = nums[i];
      result[i] = nums[i];
    } else {
      result[i] = nextValue;
    }
  }

  return result;
}

function fillMean(values) {
  const nums = toNumericArray(values);
  const avg = mean(nums);

  return nums.map(value => Number.isFinite(value) ? value : avg);
}

function linearInterpolate(values) {
  const nums = toNumericArray(values);
  const result = [...nums];

  for (let i = 0; i < result.length; i += 1) {
    if (Number.isFinite(result[i])) continue;

    let prevIndex = i - 1;
    let nextIndex = i + 1;

    while (prevIndex >= 0 && !Number.isFinite(result[prevIndex])) {
      prevIndex -= 1;
    }

    while (nextIndex < result.length && !Number.isFinite(result[nextIndex])) {
      nextIndex += 1;
    }

    if (prevIndex >= 0 && nextIndex < result.length) {
      const prevValue = result[prevIndex];
      const nextValue = result[nextIndex];
      const ratio = (i - prevIndex) / (nextIndex - prevIndex);
      result[i] = prevValue + ratio * (nextValue - prevValue);
    } else if (prevIndex >= 0) {
      result[i] = result[prevIndex];
    } else if (nextIndex < result.length) {
      result[i] = result[nextIndex];
    }
  }

  return result;
}

/* =========================================================
   6. 시계열 변환
========================================================= */

function difference(values, order = 1) {
  let result = toNumericArray(values);

  for (let step = 0; step < order; step += 1) {
    const diffed = [];

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

function seasonalDifference(values, period = 12) {
  const nums = toNumericArray(values);
  const result = [];

  for (let i = period; i < nums.length; i += 1) {
    if (Number.isFinite(nums[i]) && Number.isFinite(nums[i - period])) {
      result.push(nums[i] - nums[i - period]);
    } else {
      result.push(NaN);
    }
  }

  return result;
}

function logTransform(values) {
  return toNumericArray(values).map(value => {
    if (!Number.isFinite(value) || value <= 0) return NaN;
    return Math.log(value);
  });
}

function inverseLogTransform(values) {
  return toNumericArray(values).map(value => {
    if (!Number.isFinite(value)) return NaN;
    return Math.exp(value);
  });
}

function normalizeMinMax(values) {
  const nums = toNumericArray(values);
  const minValue = min(nums);
  const maxValue = max(nums);
  const denominator = maxValue - minValue;

  if (!Number.isFinite(denominator) || denominator === 0) {
    return nums.map(() => 0);
  }

  return nums.map(value => {
    if (!Number.isFinite(value)) return NaN;
    return (value - minValue) / denominator;
  });
}

function standardize(values) {
  const nums = toNumericArray(values);
  const avg = mean(nums);
  const std = standardDeviation(nums);

  if (!Number.isFinite(std) || std === 0) {
    return nums.map(() => 0);
  }

  return nums.map(value => {
    if (!Number.isFinite(value)) return NaN;
    return (value - avg) / std;
  });
}

/* =========================================================
   7. 이동평균 / 지수평활
========================================================= */

function movingAverage(values, windowSize = 3) {
  const nums = toNumericArray(values);
  const result = [];

  for (let i = 0; i < nums.length; i += 1) {
    const start = Math.max(0, i - windowSize + 1);
    const windowValues = nums.slice(start, i + 1).filter(Number.isFinite);

    result.push(windowValues.length > 0 ? mean(windowValues) : NaN);
  }

  return result;
}

function centeredMovingAverage(values, windowSize = 3) {
  const nums = toNumericArray(values);
  const result = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < nums.length; i += 1) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(nums.length, i + halfWindow + 1);
    const windowValues = nums.slice(start, end).filter(Number.isFinite);

    result.push(windowValues.length > 0 ? mean(windowValues) : NaN);
  }

  return result;
}

function exponentialMovingAverage(values, alpha = 0.3) {
  const nums = toNumericArray(values);
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

function simpleExponentialSmoothing(values, alpha = 0.3) {
  return exponentialMovingAverage(values, alpha);
}

function holtLinearSmoothing(values, alpha = 0.3, beta = 0.1) {
  const nums = toNumericArray(values);
  const result = [];

  const clean = nums.filter(Number.isFinite);
  if (clean.length === 0) return nums.map(() => NaN);

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

    const prevLevel = level;
    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;

    result.push(level + trend);
  });

  return result;
}

/* =========================================================
   8. 상관 / ACF
========================================================= */

function covariance(xValues, yValues) {
  const pairs = getValidPairs(xValues, yValues);

  if (pairs.length <= 1) return NaN;

  const xs = pairs.map(pair => pair.actual);
  const ys = pairs.map(pair => pair.predicted);

  const xMean = mean(xs);
  const yMean = mean(ys);

  const covSum = pairs.reduce((acc, pair) => {
    return acc + (pair.actual - xMean) * (pair.predicted - yMean);
  }, 0);

  return covSum / (pairs.length - 1);
}

function correlation(xValues, yValues) {
  const pairs = getValidPairs(xValues, yValues);

  if (pairs.length <= 1) return NaN;

  const xs = pairs.map(pair => pair.actual);
  const ys = pairs.map(pair => pair.predicted);

  const stdX = standardDeviation(xs);
  const stdY = standardDeviation(ys);

  if (!Number.isFinite(stdX) || !Number.isFinite(stdY) || stdX === 0 || stdY === 0) {
    return NaN;
  }

  return covariance(xs, ys) / (stdX * stdY);
}

function autocorrelation(values, lag = 1) {
  const nums = toNumericArray(values);

  if (lag <= 0 || lag >= nums.length) return NaN;

  const x = nums.slice(lag);
  const y = nums.slice(0, nums.length - lag);

  return correlation(x, y);
}

function acf(values, maxLag = 24) {
  const result = [];

  for (let lag = 1; lag <= maxLag; lag += 1) {
    result.push({
      lag,
      value: autocorrelation(values, lag)
    });
  }

  return result;
}

/* =========================================================
   9. 잔차 계산
========================================================= */

function residuals(actual, predicted) {
  const pairs = getValidPairs(actual, predicted);

  return pairs.map(pair => pair.actual - pair.predicted);
}

function residualSummary(actual, predicted) {
  const res = residuals(actual, predicted);

  return {
    residuals: res,
    mean: mean(res),
    median: median(res),
    std: standardDeviation(res),
    min: min(res),
    max: max(res),
    isCenteredNearZero: Math.abs(mean(res)) < standardDeviation(res)
  };
}

/* =========================================================
   10. 예측 성능평가지표
========================================================= */

function mae(actual, predicted) {
  const pairs = getValidPairs(actual, predicted);
  if (pairs.length === 0) return NaN;

  return mean(pairs.map(pair => Math.abs(pair.error)));
}

function mse(actual, predicted) {
  const pairs = getValidPairs(actual, predicted);
  if (pairs.length === 0) return NaN;

  return mean(pairs.map(pair => Math.pow(pair.error, 2)));
}

function rmse(actual, predicted) {
  const value = mse(actual, predicted);
  return Number.isFinite(value) ? Math.sqrt(value) : NaN;
}

function mape(actual, predicted) {
  const pairs = getValidPairs(actual, predicted)
    .filter(pair => pair.actual !== 0);

  if (pairs.length === 0) return NaN;

  return mean(
    pairs.map(pair => Math.abs(pair.error / pair.actual))
  );
}

function smape(actual, predicted) {
  const pairs = getValidPairs(actual, predicted)
    .filter(pair => Math.abs(pair.actual) + Math.abs(pair.predicted) !== 0);

  if (pairs.length === 0) return NaN;

  return mean(
    pairs.map(pair => {
      return Math.abs(pair.error) / ((Math.abs(pair.actual) + Math.abs(pair.predicted)) / 2);
    })
  );
}

function mase(actual, predicted, seasonality = 1) {
  const pairs = getValidPairs(actual, predicted);
  const yTrue = toNumericArray(actual).filter(Number.isFinite);

  if (pairs.length === 0 || yTrue.length <= seasonality) return NaN;

  const forecastError = mae(actual, predicted);

  const naiveErrors = [];

  for (let i = seasonality; i < yTrue.length; i += 1) {
    naiveErrors.push(Math.abs(yTrue[i] - yTrue[i - seasonality]));
  }

  const scale = mean(naiveErrors);

  if (!Number.isFinite(scale) || scale === 0) return NaN;

  return forecastError / scale;
}

function rsfe(actual, predicted) {
  const pairs = getValidPairs(actual, predicted);
  if (pairs.length === 0) return NaN;

  return pairs.reduce((acc, pair) => acc + pair.error, 0);
}

function trackingSignal(actual, predicted) {
  const rsfeValue = rsfe(actual, predicted);
  const maeValue = mae(actual, predicted);

  if (!Number.isFinite(maeValue) || maeValue === 0) return NaN;

  return rsfeValue / maeValue;
}

function calculateMetrics(actual, predicted, options = {}) {
  const seasonality = options.seasonality || 1;

  return {
    MAE: mae(actual, predicted),
    MSE: mse(actual, predicted),
    RMSE: rmse(actual, predicted),
    MAPE: mape(actual, predicted),
    SMAPE: smape(actual, predicted),
    MASE: mase(actual, predicted, seasonality),
    RSFE: rsfe(actual, predicted),
    TS: trackingSignal(actual, predicted)
  };
}

/* =========================================================
   11. 단순 예측 보조
========================================================= */

function naiveForecast(values, horizon = 1) {
  const clean = cleanNumericArray(values);
  const lastValue = clean[clean.length - 1];

  return Array.from({ length: horizon }, () => lastValue);
}

function meanForecast(values, horizon = 1) {
  const avg = mean(values);

  return Array.from({ length: horizon }, () => avg);
}

function movingAverageForecast(values, horizon = 1, windowSize = 3) {
  const nums = cleanNumericArray(values);
  const result = [];
  let history = [...nums];

  for (let i = 0; i < horizon; i += 1) {
    const recent = history.slice(-windowSize);
    const nextValue = mean(recent);

    result.push(nextValue);
    history.push(nextValue);
  }

  return result;
}

function exponentialSmoothingForecast(values, horizon = 1, alpha = 0.3) {
  const smoothed = simpleExponentialSmoothing(values, alpha);
  const clean = cleanNumericArray(smoothed);
  const lastValue = clean[clean.length - 1];

  return Array.from({ length: horizon }, () => lastValue);
}

/* =========================================================
   12. 외부 접근용 객체
========================================================= */

window.TSMathUtils = {
  toNumber,
  isValidNumber,
  toNumericArray,
  cleanNumericArray,
  getColumnValues,
  getValidPairs,

  sum,
  mean,
  median,
  min,
  max,
  variance,
  standardDeviation,
  quantile,
  iqr,
  range,
  describe,

  countMissing,
  missingRatio,
  hasMissing,

  zScores,
  detectOutliersZScore,
  detectOutliersIQR,
  detectOutliersHampel,

  fillForward,
  fillBackward,
  fillMean,
  linearInterpolate,

  difference,
  seasonalDifference,
  logTransform,
  inverseLogTransform,
  normalizeMinMax,
  standardize,

  movingAverage,
  centeredMovingAverage,
  exponentialMovingAverage,
  simpleExponentialSmoothing,
  holtLinearSmoothing,

  covariance,
  correlation,
  autocorrelation,
  acf,

  residuals,
  residualSummary,

  mae,
  mse,
  rmse,
  mape,
  smape,
  mase,
  rsfe,
  trackingSignal,
  calculateMetrics,

  naiveForecast,
  meanForecast,
  movingAverageForecast,
  exponentialSmoothingForecast
};