/* =========================================================
   TS Navigator - mathUtils.js
   수치 계산 / 통계 / 스케일링 / 예측 보조 유틸
   ========================================================= */

/* =========================================================
   기본 수치 처리
   ========================================================= */

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(String(value).replace(/,/g, ""));

  if (!Number.isFinite(number)) return null;

  return number;
}

function isValidNumber(value) {
  return toNumber(value) !== null;
}

function cleanNumberArray(values = []) {
  return values.map(toNumber).filter((value) => value !== null);
}

function replaceInvalidWithNull(values = []) {
  return values.map((value) => toNumber(value));
}

/* =========================================================
   기초 통계
   ========================================================= */

function sum(values = []) {
  return cleanNumberArray(values).reduce((total, value) => total + value, 0);
}

function mean(values = []) {
  const numbers = cleanNumberArray(values);

  if (numbers.length === 0) return null;

  return sum(numbers) / numbers.length;
}

function median(values = []) {
  const numbers = cleanNumberArray(values).sort((a, b) => a - b);

  if (numbers.length === 0) return null;

  const middle = Math.floor(numbers.length / 2);

  if (numbers.length % 2 === 0) {
    return (numbers[middle - 1] + numbers[middle]) / 2;
  }

  return numbers[middle];
}

function min(values = []) {
  const numbers = cleanNumberArray(values);

  if (numbers.length === 0) return null;

  return Math.min(...numbers);
}

function max(values = []) {
  const numbers = cleanNumberArray(values);

  if (numbers.length === 0) return null;

  return Math.max(...numbers);
}

function range(values = []) {
  const minValue = min(values);
  const maxValue = max(values);

  if (minValue === null || maxValue === null) return null;

  return maxValue - minValue;
}

function variance(values = [], sample = true) {
  const numbers = cleanNumberArray(values);

  if (numbers.length === 0) return null;
  if (sample && numbers.length < 2) return null;

  const avg = mean(numbers);
  const squaredDiffSum = numbers.reduce(
    (total, value) => total + Math.pow(value - avg, 2),
    0
  );

  return squaredDiffSum / (sample ? numbers.length - 1 : numbers.length);
}

function standardDeviation(values = [], sample = true) {
  const value = variance(values, sample);

  if (value === null) return null;

  return Math.sqrt(value);
}

function quantile(values = [], q = 0.5) {
  const numbers = cleanNumberArray(values).sort((a, b) => a - b);

  if (numbers.length === 0) return null;

  const position = (numbers.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;

  if (numbers[base + 1] !== undefined) {
    return numbers[base] + rest * (numbers[base + 1] - numbers[base]);
  }

  return numbers[base];
}

function iqr(values = []) {
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);

  if (q1 === null || q3 === null) return null;

  return q3 - q1;
}

/* =========================================================
   이동 통계
   ========================================================= */

function movingAverage(values = [], windowSize = 3) {
  const numbers = replaceInvalidWithNull(values);

  return numbers.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = numbers.slice(start, index + 1).filter((value) => value !== null);

    if (window.length === 0) return null;

    return mean(window);
  });
}

function centeredMovingAverage(values = [], windowSize = 3) {
  const numbers = replaceInvalidWithNull(values);
  const half = Math.floor(windowSize / 2);

  return numbers.map((_, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(numbers.length, index + half + 1);
    const window = numbers.slice(start, end).filter((value) => value !== null);

    if (window.length === 0) return null;

    return mean(window);
  });
}

function exponentialMovingAverage(values = [], alpha = 0.3) {
  const numbers = replaceInvalidWithNull(values);
  const result = [];

  let previous = null;

  numbers.forEach((value) => {
    if (value === null) {
      result.push(previous);
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

/* =========================================================
   스케일링
   ========================================================= */

function minMaxScale(values = []) {
  const numbers = replaceInvalidWithNull(values);
  const minValue = min(numbers);
  const maxValue = max(numbers);

  if (minValue === null || maxValue === null || maxValue === minValue) {
    return numbers.map(() => 0);
  }

  return numbers.map((value) => {
    if (value === null) return null;

    return (value - minValue) / (maxValue - minValue);
  });
}

function zScoreScale(values = []) {
  const numbers = replaceInvalidWithNull(values);
  const avg = mean(numbers);
  const sd = standardDeviation(numbers, false);

  if (avg === null || sd === null || sd === 0) {
    return numbers.map(() => 0);
  }

  return numbers.map((value) => {
    if (value === null) return null;

    return (value - avg) / sd;
  });
}

function robustScale(values = []) {
  const numbers = replaceInvalidWithNull(values);
  const med = median(numbers);
  const iqrValue = iqr(numbers);

  if (med === null || iqrValue === null || iqrValue === 0) {
    return numbers.map(() => 0);
  }

  return numbers.map((value) => {
    if (value === null) return null;

    return (value - med) / iqrValue;
  });
}

/* =========================================================
   결측치 처리 보조
   ========================================================= */

function forwardFill(values = []) {
  const numbers = replaceInvalidWithNull(values);
  let lastValue = null;

  return numbers.map((value) => {
    if (value !== null) {
      lastValue = value;
      return value;
    }

    return lastValue;
  });
}

function backwardFill(values = []) {
  const numbers = replaceInvalidWithNull(values);
  let nextValue = null;
  const result = [];

  for (let i = numbers.length - 1; i >= 0; i -= 1) {
    const value = numbers[i];

    if (value !== null) {
      nextValue = value;
      result.unshift(value);
    } else {
      result.unshift(nextValue);
    }
  }

  return result;
}

function linearInterpolate(values = []) {
  const numbers = replaceInvalidWithNull(values);
  const result = [...numbers];

  for (let i = 0; i < result.length; i += 1) {
    if (result[i] !== null) continue;

    let leftIndex = i - 1;
    let rightIndex = i + 1;

    while (leftIndex >= 0 && result[leftIndex] === null) {
      leftIndex -= 1;
    }

    while (rightIndex < result.length && result[rightIndex] === null) {
      rightIndex += 1;
    }

    if (leftIndex >= 0 && rightIndex < result.length) {
      const leftValue = result[leftIndex];
      const rightValue = result[rightIndex];
      const ratio = (i - leftIndex) / (rightIndex - leftIndex);

      result[i] = leftValue + ratio * (rightValue - leftValue);
    } else if (leftIndex >= 0) {
      result[i] = result[leftIndex];
    } else if (rightIndex < result.length) {
      result[i] = result[rightIndex];
    }
  }

  return result;
}

/* =========================================================
   이상치 탐지
   ========================================================= */

function detectOutliersIQR(values = [], multiplier = 1.5) {
  const numbers = replaceInvalidWithNull(values);
  const q1 = quantile(numbers, 0.25);
  const q3 = quantile(numbers, 0.75);
  const iqrValue = iqr(numbers);

  if (q1 === null || q3 === null || iqrValue === null) {
    return numbers.map(() => false);
  }

  const lowerBound = q1 - multiplier * iqrValue;
  const upperBound = q3 + multiplier * iqrValue;

  return numbers.map((value) => {
    if (value === null) return false;

    return value < lowerBound || value > upperBound;
  });
}

function detectOutliersZScore(values = [], threshold = 3) {
  const numbers = replaceInvalidWithNull(values);
  const avg = mean(numbers);
  const sd = standardDeviation(numbers, false);

  if (avg === null || sd === null || sd === 0) {
    return numbers.map(() => false);
  }

  return numbers.map((value) => {
    if (value === null) return false;

    return Math.abs((value - avg) / sd) > threshold;
  });
}

function replaceOutliersWithNull(values = [], outlierFlags = []) {
  return values.map((value, index) => {
    if (outlierFlags[index]) return null;

    return toNumber(value);
  });
}

/* =========================================================
   오차 계산
   ========================================================= */

function absoluteError(actual, predicted) {
  const a = toNumber(actual);
  const p = toNumber(predicted);

  if (a === null || p === null) return null;

  return Math.abs(a - p);
}

function squaredError(actual, predicted) {
  const a = toNumber(actual);
  const p = toNumber(predicted);

  if (a === null || p === null) return null;

  return Math.pow(a - p, 2);
}

function percentageError(actual, predicted) {
  const a = toNumber(actual);
  const p = toNumber(predicted);

  if (a === null || p === null || a === 0) return null;

  return Math.abs((a - p) / a) * 100;
}

function symmetricPercentageError(actual, predicted) {
  const a = toNumber(actual);
  const p = toNumber(predicted);

  if (a === null || p === null) return null;

  const denominator = (Math.abs(a) + Math.abs(p)) / 2;

  if (denominator === 0) return null;

  return (Math.abs(a - p) / denominator) * 100;
}

/* =========================================================
   간단 예측 보조
   ========================================================= */

function repeatLastValue(values = [], horizon = 1) {
  const numbers = cleanNumberArray(values);
  const lastValue = numbers[numbers.length - 1] ?? null;

  return Array.from({ length: horizon }, () => lastValue);
}

function repeatMeanValue(values = [], horizon = 1) {
  const avg = mean(values);

  return Array.from({ length: horizon }, () => avg);
}

function createSequence(length, start = 0, step = 1) {
  return Array.from({ length }, (_, index) => start + index * step);
}

/* =========================================================
   반올림 / 표시용
   ========================================================= */

function roundNumber(value, digits = 4) {
  const number = toNumber(value);

  if (number === null) return null;

  const factor = Math.pow(10, digits);

  return Math.round(number * factor) / factor;
}

function formatNumber(value, digits = 4) {
  const rounded = roundNumber(value, digits);

  if (rounded === null) return "-";

  return rounded.toLocaleString();
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSMathUtils = {
  toNumber,
  isValidNumber,
  cleanNumberArray,
  replaceInvalidWithNull,

  sum,
  mean,
  median,
  min,
  max,
  range,
  variance,
  standardDeviation,
  quantile,
  iqr,

  movingAverage,
  centeredMovingAverage,
  exponentialMovingAverage,

  minMaxScale,
  zScoreScale,
  robustScale,

  forwardFill,
  backwardFill,
  linearInterpolate,

  detectOutliersIQR,
  detectOutliersZScore,
  replaceOutliersWithNull,

  absoluteError,
  squaredError,
  percentageError,
  symmetricPercentageError,

  repeatLastValue,
  repeatMeanValue,
  createSequence,

  roundNumber,
  formatNumber,
};