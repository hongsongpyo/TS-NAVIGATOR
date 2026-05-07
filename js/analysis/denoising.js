/* =========================================================
   TS Navigator - denoising.js
   이동평균, EMA, Fourier/Filter 기반 잡음 완화
   ========================================================= */

/* =========================================================
   Denoising 전체 실행
   ========================================================= */

function runDenoising({
  trackId,
  method = "moving-average",
  windowSize = 5,
  alpha = 0.3,
  fourierKeepRatio = 0.2,
  createTrack = true,
}) {
  const sourceTrack = TSStore.getTrackById(trackId);

  if (!sourceTrack) {
    return null;
  }

  const process = TSStore.createProcess({
    name: "Denoising",
    type: "denoising",
    trackId,
    parameters: {
      method,
      windowSize,
      alpha,
      fourierKeepRatio,
    },
    status: "running",
  });

  const series = TSPreprocessing.trackToSeries(sourceTrack);
  const values = series.map((item) => item.value);

  let denoisedValues = [];

  switch (method) {
    case "centered-moving-average":
      denoisedValues = TSMathUtils.centeredMovingAverage(values, windowSize);
      break;

    case "ema":
      denoisedValues = TSMathUtils.exponentialMovingAverage(values, alpha);
      break;

    case "fourier":
      denoisedValues = fourierDenoise(values, fourierKeepRatio);
      break;

    case "low-pass":
      denoisedValues = lowPassFilter(values, alpha);
      break;

    case "moving-average":
    default:
      denoisedValues = TSMathUtils.movingAverage(values, windowSize);
      break;
  }

  const denoisedSeries = series.map((item, index) => ({
    ...item,
    value: denoisedValues[index],
    originalValue: values[index],
    denoised: true,
  }));

  const result = {
    sourceTrackId: trackId,
    processId: process.id,
    series: denoisedSeries,
    x: denoisedSeries.map((item) => item.date),
    y: denoisedSeries.map((item) => item.value),
    report: createDenoisingReport({
      method,
      values,
      denoisedValues,
      windowSize,
      alpha,
      fourierKeepRatio,
    }),
  };

  let resultTrack = null;

  if (createTrack) {
    resultTrack = TSStore.createTrack({
      name: "Denoised Data",
      type: "Preprocessed Data",
      data: result.series,
      x: result.x,
      y: result.y,
      color: "#20c997",
      regionId: sourceTrack.regionId,
      processId: process.id,
      metadata: {
        sourceTrackId: trackId,
        processType: "denoising",
        parameters: process.parameters,
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
   Low-pass Filter
   ========================================================= */

function lowPassFilter(values = [], alpha = 0.3) {
  const numbers = TSMathUtils.replaceInvalidWithNull(values);
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
      previous = previous + alpha * (value - previous);
    }

    result.push(previous);
  });

  return result;
}

/* =========================================================
   Fourier Denoising
   간단 DFT/IDFT 기반 구현
   ========================================================= */

function fourierDenoise(values = [], keepRatio = 0.2) {
  const filledValues = TSMathUtils.linearInterpolate(values);
  const numbers = filledValues.map((value) => value ?? 0);

  if (numbers.length === 0) {
    return [];
  }

  const coefficients = discreteFourierTransform(numbers);
  const filteredCoefficients = keepLowFrequencyComponents(
    coefficients,
    keepRatio
  );

  return inverseDiscreteFourierTransform(filteredCoefficients);
}

function discreteFourierTransform(values = []) {
  const n = values.length;
  const result = [];

  for (let k = 0; k < n; k += 1) {
    let real = 0;
    let imag = 0;

    for (let t = 0; t < n; t += 1) {
      const angle = (-2 * Math.PI * k * t) / n;

      real += values[t] * Math.cos(angle);
      imag += values[t] * Math.sin(angle);
    }

    result.push({
      real,
      imag,
    });
  }

  return result;
}

function inverseDiscreteFourierTransform(coefficients = []) {
  const n = coefficients.length;
  const result = [];

  for (let t = 0; t < n; t += 1) {
    let value = 0;

    for (let k = 0; k < n; k += 1) {
      const angle = (2 * Math.PI * k * t) / n;

      value +=
        coefficients[k].real * Math.cos(angle) -
        coefficients[k].imag * Math.sin(angle);
    }

    result.push(value / n);
  }

  return result;
}

function keepLowFrequencyComponents(coefficients = [], keepRatio = 0.2) {
  const n = coefficients.length;
  const keepCount = Math.max(1, Math.floor(n * keepRatio));

  return coefficients.map((coefficient, index) => {
    const isLowFrequency =
      index <= keepCount || index >= n - keepCount;

    if (isLowFrequency) {
      return { ...coefficient };
    }

    return {
      real: 0,
      imag: 0,
    };
  });
}

/* =========================================================
   잔차 계산
   ========================================================= */

function calculateDenoisingResiduals(originalValues = [], denoisedValues = []) {
  return originalValues.map((value, index) => {
    const original = TSMathUtils.toNumber(value);
    const denoised = TSMathUtils.toNumber(denoisedValues[index]);

    if (original === null || denoised === null) {
      return null;
    }

    return original - denoised;
  });
}

/* =========================================================
   Denoising Report
   ========================================================= */

function createDenoisingReport({
  method,
  values,
  denoisedValues,
  windowSize,
  alpha,
  fourierKeepRatio,
}) {
  const residuals = calculateDenoisingResiduals(values, denoisedValues);

  return {
    method,
    windowSize,
    alpha,
    fourierKeepRatio,
    originalStd: TSMathUtils.standardDeviation(values, false),
    denoisedStd: TSMathUtils.standardDeviation(denoisedValues, false),
    residualStd: TSMathUtils.standardDeviation(residuals, false),
    message: createDenoisingMessage(method),
  };
}

function createDenoisingMessage(method) {
  switch (method) {
    case "moving-average":
      return "단순 이동평균으로 단기 변동을 완화했습니다.";

    case "centered-moving-average":
      return "중심 이동평균으로 주변 구간의 평균 흐름을 반영했습니다.";

    case "ema":
      return "지수이동평균으로 최근 값에 더 높은 가중치를 부여했습니다.";

    case "fourier":
      return "Fourier 기반 저주파 성분을 남겨 고주파 잡음을 완화했습니다.";

    case "low-pass":
      return "Low-pass filter로 급격한 변동을 부드럽게 처리했습니다.";

    default:
      return "선택한 방법으로 잡음 완화를 수행했습니다.";
  }
}

/* =========================================================
   자동 Denoising 추천
   ========================================================= */

function recommendDenoisingMethod(values = []) {
  const cleanValues = TSMathUtils.cleanNumberArray(values);

  if (cleanValues.length < 10) {
    return {
      method: "moving-average",
      windowSize: 3,
      alpha: 0.3,
      reason: "데이터 길이가 짧아 작은 window의 이동평균을 권장합니다.",
    };
  }

  const sd = TSMathUtils.standardDeviation(cleanValues, false);
  const avg = Math.abs(TSMathUtils.mean(cleanValues));
  const coefficientOfVariation = avg === 0 ? 0 : sd / avg;

  if (coefficientOfVariation > 0.4) {
    return {
      method: "ema",
      windowSize: 5,
      alpha: 0.25,
      reason: "변동성이 큰 데이터로 판단되어 EMA 기반 완화를 권장합니다.",
    };
  }

  return {
    method: "moving-average",
    windowSize: 5,
    alpha: 0.3,
    reason: "일반적인 변동 완화를 위해 이동평균을 권장합니다.",
  };
}

function runAutoDenoising(trackId) {
  const sourceTrack = TSStore.getTrackById(trackId);

  if (!sourceTrack) return null;

  const recommendation = recommendDenoisingMethod(sourceTrack.y);

  return runDenoising({
    trackId,
    method: recommendation.method,
    windowSize: recommendation.windowSize,
    alpha: recommendation.alpha,
    createTrack: true,
  });
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSDenoising = {
  runDenoising,

  lowPassFilter,

  fourierDenoise,
  discreteFourierTransform,
  inverseDiscreteFourierTransform,
  keepLowFrequencyComponents,

  calculateDenoisingResiduals,

  createDenoisingReport,
  createDenoisingMessage,

  recommendDenoisingMethod,
  runAutoDenoising,
};