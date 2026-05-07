/* =========================================================
   TS Navigator - decomposition.js
   시계열 분해: Trend, Seasonal, Residual
   가법 모형 중심 간이 구현
   ========================================================= */

/* =========================================================
   분해 전체 실행
   ========================================================= */

function runDecomposition({
  trackId,
  model = "additive",
  period = 12,
  trendWindow = null,
  createTracks = true,
}) {
  const sourceTrack = TSStore.getTrackById(trackId);

  if (!sourceTrack) {
    return null;
  }

  const process = TSStore.createProcess({
    name: "Decomposition",
    type: "decomposition",
    trackId,
    parameters: {
      model,
      period,
      trendWindow,
    },
    status: "running",
  });

  const series = TSPreprocessing.trackToSeries(sourceTrack);
  const values = series.map((item) => item.value);
  const dates = series.map((item) => item.date);

  const result = decomposeSeries({
    values,
    dates,
    model,
    period,
    trendWindow,
  });

  let resultTracks = [];

  if (createTracks) {
    const trendTrack = TSStore.createTrack({
      name: "Trend",
      type: "Feature Data",
      data: valuesToSeries(dates, result.trend, "trend"),
      x: dates,
      y: result.trend,
      color: "#7950f2",
      regionId: sourceTrack.regionId,
      processId: process.id,
      metadata: {
        sourceTrackId: trackId,
        processType: "decomposition",
        component: "trend",
        parameters: process.parameters,
        report: result.report,
      },
    });

    const seasonalTrack = TSStore.createTrack({
      name: "Seasonal",
      type: "Feature Data",
      data: valuesToSeries(dates, result.seasonal, "seasonal"),
      x: dates,
      y: result.seasonal,
      color: "#f59f00",
      regionId: sourceTrack.regionId,
      processId: process.id,
      metadata: {
        sourceTrackId: trackId,
        processType: "decomposition",
        component: "seasonal",
        parameters: process.parameters,
        report: result.report,
      },
    });

    const residualTrack = TSStore.createTrack({
      name: "Residual",
      type: "Residual Data",
      data: valuesToSeries(dates, result.residual, "residual"),
      x: dates,
      y: result.residual,
      color: "#e03131",
      regionId: sourceTrack.regionId,
      processId: process.id,
      metadata: {
        sourceTrackId: trackId,
        processType: "decomposition",
        component: "residual",
        parameters: process.parameters,
        report: result.report,
      },
    });

    resultTracks = [trendTrack, seasonalTrack, residualTrack];

    process.resultTrackId = residualTrack.id;
  }

  TSStore.updateProcess(process.id, {
    status: "completed",
    resultTrackId: resultTracks[resultTracks.length - 1]?.id || null,
  });

  return {
    process,
    tracks: resultTracks,
    result,
  };
}

/* =========================================================
   시계열 분해 계산
   ========================================================= */

function decomposeSeries({
  values = [],
  dates = [],
  model = "additive",
  period = 12,
  trendWindow = null,
}) {
  const filledValues = TSMathUtils.linearInterpolate(values);
  const windowSize = trendWindow || period;

  const trend = estimateTrend(filledValues, windowSize);

  let detrended = [];

  if (model === "multiplicative") {
    detrended = filledValues.map((value, index) => {
      const trendValue = trend[index];

      if (value === null || trendValue === null || trendValue === 0) {
        return null;
      }

      return value / trendValue;
    });
  } else {
    detrended = filledValues.map((value, index) => {
      const trendValue = trend[index];

      if (value === null || trendValue === null) {
        return null;
      }

      return value - trendValue;
    });
  }

  const seasonalPattern = estimateSeasonalPattern({
    detrended,
    period,
    model,
  });

  const seasonal = createSeasonalComponent({
    length: filledValues.length,
    seasonalPattern,
    period,
  });

  const residual = calculateResidual({
    values: filledValues,
    trend,
    seasonal,
    model,
  });

  const reconstructed = reconstructSeries({
    trend,
    seasonal,
    residual,
    model,
  });

  const report = createDecompositionReport({
    model,
    period,
    trendWindow: windowSize,
    values: filledValues,
    trend,
    seasonal,
    residual,
    reconstructed,
  });

  return {
    model,
    period,
    trendWindow: windowSize,
    trend,
    seasonal,
    residual,
    reconstructed,
    seasonalPattern,
    report,
    dates,
  };
}

/* =========================================================
   Trend 추정
   ========================================================= */

function estimateTrend(values = [], windowSize = 12) {
  const adjustedWindow = Math.max(3, Number(windowSize) || 3);

  return TSMathUtils.centeredMovingAverage(values, adjustedWindow);
}

/* =========================================================
   Seasonal Pattern 추정
   ========================================================= */

function estimateSeasonalPattern({
  detrended = [],
  period = 12,
  model = "additive",
}) {
  const safePeriod = Math.max(2, Number(period) || 2);
  const pattern = [];

  for (let position = 0; position < safePeriod; position += 1) {
    const valuesAtPosition = [];

    for (let i = position; i < detrended.length; i += safePeriod) {
      const value = TSMathUtils.toNumber(detrended[i]);

      if (value !== null) {
        valuesAtPosition.push(value);
      }
    }

    if (model === "multiplicative") {
      pattern.push(TSMathUtils.mean(valuesAtPosition) ?? 1);
    } else {
      pattern.push(TSMathUtils.mean(valuesAtPosition) ?? 0);
    }
  }

  if (model === "multiplicative") {
    return normalizeMultiplicativeSeasonalPattern(pattern);
  }

  return normalizeAdditiveSeasonalPattern(pattern);
}

function normalizeAdditiveSeasonalPattern(pattern = []) {
  const avg = TSMathUtils.mean(pattern) ?? 0;

  return pattern.map((value) => {
    const number = TSMathUtils.toNumber(value);

    if (number === null) return 0;

    return number - avg;
  });
}

function normalizeMultiplicativeSeasonalPattern(pattern = []) {
  const avg = TSMathUtils.mean(pattern) ?? 1;

  if (avg === 0) {
    return pattern.map(() => 1);
  }

  return pattern.map((value) => {
    const number = TSMathUtils.toNumber(value);

    if (number === null) return 1;

    return number / avg;
  });
}

/* =========================================================
   Seasonal Component 생성
   ========================================================= */

function createSeasonalComponent({
  length = 0,
  seasonalPattern = [],
  period = 12,
}) {
  const safePeriod = Math.max(2, Number(period) || 2);

  return Array.from({ length }, (_, index) => {
    return seasonalPattern[index % safePeriod] ?? 0;
  });
}

/* =========================================================
   Residual 계산
   ========================================================= */

function calculateResidual({
  values = [],
  trend = [],
  seasonal = [],
  model = "additive",
}) {
  return values.map((value, index) => {
    const actual = TSMathUtils.toNumber(value);
    const trendValue = TSMathUtils.toNumber(trend[index]);
    const seasonalValue = TSMathUtils.toNumber(seasonal[index]);

    if (actual === null || trendValue === null || seasonalValue === null) {
      return null;
    }

    if (model === "multiplicative") {
      const base = trendValue * seasonalValue;

      if (base === 0) return null;

      return actual / base;
    }

    return actual - trendValue - seasonalValue;
  });
}

/* =========================================================
   재구성값 계산
   ========================================================= */

function reconstructSeries({
  trend = [],
  seasonal = [],
  residual = [],
  model = "additive",
}) {
  return trend.map((trendValue, index) => {
    const t = TSMathUtils.toNumber(trendValue);
    const s = TSMathUtils.toNumber(seasonal[index]);
    const r = TSMathUtils.toNumber(residual[index]);

    if (t === null || s === null || r === null) {
      return null;
    }

    if (model === "multiplicative") {
      return t * s * r;
    }

    return t + s + r;
  });
}

/* =========================================================
   Report 생성
   ========================================================= */

function createDecompositionReport({
  model,
  period,
  trendWindow,
  values,
  trend,
  seasonal,
  residual,
  reconstructed,
}) {
  const residualStd = TSMathUtils.standardDeviation(residual, false);
  const originalStd = TSMathUtils.standardDeviation(values, false);

  const residualRatio =
    originalStd === null || originalStd === 0 || residualStd === null
      ? null
      : residualStd / originalStd;

  const reconstructionError = calculateReconstructionError(
    values,
    reconstructed
  );

  return {
    model,
    period,
    trendWindow,
    originalStd,
    residualStd,
    residualRatio,
    reconstructionError,
    trendStrength: calculateComponentStrength(values, residual),
    seasonalStrength: calculateSeasonalStrength(values, trend, residual),
    message: createDecompositionMessage(model, period, residualRatio),
  };
}

function calculateReconstructionError(values = [], reconstructed = []) {
  const errors = values.map((value, index) => {
    return TSMathUtils.absoluteError(value, reconstructed[index]);
  });

  return TSMathUtils.mean(errors);
}

function calculateComponentStrength(values = [], residual = []) {
  const originalVariance = TSMathUtils.variance(values, false);
  const residualVariance = TSMathUtils.variance(residual, false);

  if (
    originalVariance === null ||
    residualVariance === null ||
    originalVariance === 0
  ) {
    return null;
  }

  return Math.max(0, 1 - residualVariance / originalVariance);
}

function calculateSeasonalStrength(values = [], trend = [], residual = []) {
  const detrended = values.map((value, index) => {
    const actual = TSMathUtils.toNumber(value);
    const trendValue = TSMathUtils.toNumber(trend[index]);

    if (actual === null || trendValue === null) return null;

    return actual - trendValue;
  });

  const detrendedVariance = TSMathUtils.variance(detrended, false);
  const residualVariance = TSMathUtils.variance(residual, false);

  if (
    detrendedVariance === null ||
    residualVariance === null ||
    detrendedVariance === 0
  ) {
    return null;
  }

  return Math.max(0, 1 - residualVariance / detrendedVariance);
}

function createDecompositionMessage(model, period, residualRatio) {
  const modelText = model === "multiplicative" ? "승법" : "가법";

  if (residualRatio === null) {
    return `${modelText} 모형으로 period ${period} 기준 분해를 수행했습니다.`;
  }

  if (residualRatio < 0.3) {
    return `${modelText} 모형 분해 결과, 추세/계절 성분이 원자료 변동을 비교적 잘 설명합니다.`;
  }

  if (residualRatio < 0.6) {
    return `${modelText} 모형 분해 결과, 일부 변동은 설명되지만 잔차 변동도 남아 있습니다.`;
  }

  return `${modelText} 모형 분해 결과, 잔차 변동이 커서 period 또는 전처리 방법 조정이 필요할 수 있습니다.`;
}

/* =========================================================
   Series 변환
   ========================================================= */

function valuesToSeries(dates = [], values = [], component = "component") {
  return dates.map((date, index) => ({
    date,
    value: values[index],
    component,
  }));
}

/* =========================================================
   자동 분해 추천
   ========================================================= */

function recommendDecompositionParameters(values = [], frequency = "daily") {
  const cleanValues = TSMathUtils.cleanNumberArray(values);

  let period = 12;

  if (frequency === "daily") {
    period = 7;
  }

  if (frequency === "weekly") {
    period = 52;
  }

  if (frequency === "monthly") {
    period = 12;
  }

  if (frequency === "hour") {
    period = 24;
  }

  if (cleanValues.length < period * 2) {
    period = Math.max(2, Math.floor(cleanValues.length / 2));
  }

  return {
    model: "additive",
    period,
    trendWindow: period,
    reason: "기본적으로 해석이 쉬운 가법 분해를 우선 적용합니다.",
  };
}

function runAutoDecomposition(trackId) {
  const sourceTrack = TSStore.getTrackById(trackId);

  if (!sourceTrack) return null;

  const frequency =
    sourceTrack.metadata?.frequency ||
    TSState.uploadedData.frequency ||
    "daily";

  const recommendation = recommendDecompositionParameters(
    sourceTrack.y,
    frequency
  );

  return runDecomposition({
    trackId,
    model: recommendation.model,
    period: recommendation.period,
    trendWindow: recommendation.trendWindow,
    createTracks: true,
  });
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSDecomposition = {
  runDecomposition,
  decomposeSeries,

  estimateTrend,

  estimateSeasonalPattern,
  normalizeAdditiveSeasonalPattern,
  normalizeMultiplicativeSeasonalPattern,
  createSeasonalComponent,

  calculateResidual,
  reconstructSeries,

  createDecompositionReport,
  calculateReconstructionError,
  calculateComponentStrength,
  calculateSeasonalStrength,
  createDecompositionMessage,

  valuesToSeries,

  recommendDecompositionParameters,
  runAutoDecomposition,
};