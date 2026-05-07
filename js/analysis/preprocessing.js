/* =========================================================
   TS Navigator - preprocessing.js
   결측치, 이상치, 리샘플링, 정규화 전처리
   ========================================================= */

/* =========================================================
   전처리 전체 실행
   ========================================================= */

function runPreprocessing({
  trackId,
  missingMethod = "linear",
  outlierMethod = "iqr",
  outlierAction = "interpolate",
  scaleMethod = "none",
  resampleFrequency = null,
  createTrack = true,
}) {
  const sourceTrack = TSStore.getTrackById(trackId);

  if (!sourceTrack) {
    return null;
  }

  const process = TSStore.createProcess({
    name: "Preprocessing",
    type: "preprocessing",
    trackId,
    parameters: {
      missingMethod,
      outlierMethod,
      outlierAction,
      scaleMethod,
      resampleFrequency,
    },
    status: "running",
  });

  let series = trackToSeries(sourceTrack);

  if (resampleFrequency) {
    series = resampleSeries(series, resampleFrequency);
  }

  const missingResult = handleMissingValues(series, missingMethod);
  series = missingResult.series;

  const outlierResult = handleOutliers(series, outlierMethod, outlierAction);
  series = outlierResult.series;

  const scaleResult = scaleSeries(series, scaleMethod);
  series = scaleResult.series;

  const result = {
    sourceTrackId: trackId,
    processId: process.id,
    series,
    x: series.map((item) => item.date),
    y: series.map((item) => item.value),
    report: {
      missing: missingResult.report,
      outlier: outlierResult.report,
      scale: scaleResult.report,
      resample: {
        applied: Boolean(resampleFrequency),
        frequency: resampleFrequency,
      },
    },
  };

  let resultTrack = null;

  if (createTrack) {
    resultTrack = TSStore.createTrack({
      name: "Preprocessed Data",
      type: "Preprocessed Data",
      data: result.series,
      x: result.x,
      y: result.y,
      color: "#12b886",
      regionId: sourceTrack.regionId,
      processId: process.id,
      metadata: {
        sourceTrackId: trackId,
        processType: "preprocessing",
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
   Track → Series 변환
   ========================================================= */

function trackToSeries(track) {
  if (Array.isArray(track.data) && track.data.length > 0) {
    return track.data
      .map((item, index) => {
        return {
          date: item.date || track.x[index],
          value: TSMathUtils.toNumber(item.value ?? track.y[index]),
          originalIndex: index,
        };
      })
      .filter((item) => item.date !== null && item.date !== undefined);
  }

  return track.x.map((date, index) => {
    return {
      date,
      value: TSMathUtils.toNumber(track.y[index]),
      originalIndex: index,
    };
  });
}

/* =========================================================
   결측치 처리
   ========================================================= */

function handleMissingValues(series = [], method = "linear") {
  const values = series.map((item) => item.value);
  const beforeMissingCount = values.filter((value) => value === null).length;

  let filledValues = [...values];

  switch (method) {
    case "locf":
      filledValues = TSMathUtils.forwardFill(values);
      break;

    case "nocb":
      filledValues = TSMathUtils.backwardFill(values);
      break;

    case "mean":
      filledValues = fillMissingWithMean(values);
      break;

    case "moving-average":
      filledValues = fillMissingWithMovingAverage(values, 3);
      break;

    case "drop":
      return {
        series: series.filter((item) => item.value !== null),
        report: {
          method,
          beforeMissingCount,
          afterMissingCount: 0,
          message: "결측치가 있는 행을 제거했습니다.",
        },
      };

    case "linear":
    default:
      filledValues = TSMathUtils.linearInterpolate(values);
      break;
  }

  const processedSeries = series.map((item, index) => {
    return {
      ...item,
      value: filledValues[index],
      missingFilled: item.value === null && filledValues[index] !== null,
    };
  });

  const afterMissingCount = processedSeries.filter(
    (item) => item.value === null
  ).length;

  return {
    series: processedSeries,
    report: {
      method,
      beforeMissingCount,
      afterMissingCount,
      message: createMissingMessage(method, beforeMissingCount, afterMissingCount),
    },
  };
}

function fillMissingWithMean(values = []) {
  const avg = TSMathUtils.mean(values);

  return values.map((value) => {
    if (value === null || value === undefined) {
      return avg;
    }

    return value;
  });
}

function fillMissingWithMovingAverage(values = [], windowSize = 3) {
  const interpolated = TSMathUtils.linearInterpolate(values);
  const movingAvg = TSMathUtils.movingAverage(interpolated, windowSize);

  return values.map((value, index) => {
    if (value === null || value === undefined) {
      return movingAvg[index];
    }

    return value;
  });
}

function createMissingMessage(method, beforeCount, afterCount) {
  if (beforeCount === 0) {
    return "결측치가 없어 결측치 처리를 적용하지 않았습니다.";
  }

  if (afterCount === 0) {
    return `${method} 방법으로 결측치 ${beforeCount}개를 처리했습니다.`;
  }

  return `${method} 방법 적용 후에도 결측치 ${afterCount}개가 남아 있습니다.`;
}

/* =========================================================
   이상치 처리
   ========================================================= */

function handleOutliers(series = [], method = "iqr", action = "interpolate") {
  const values = series.map((item) => item.value);

  let outlierFlags = [];

  switch (method) {
    case "z-score":
      outlierFlags = TSMathUtils.detectOutliersZScore(values, 3);
      break;

    case "none":
      outlierFlags = values.map(() => false);
      break;

    case "iqr":
    default:
      outlierFlags = TSMathUtils.detectOutliersIQR(values, 1.5);
      break;
  }

  const outlierCount = outlierFlags.filter(Boolean).length;

  if (method === "none" || outlierCount === 0) {
    return {
      series: series.map((item) => ({
        ...item,
        isOutlier: false,
        outlierProcessed: false,
      })),
      report: {
        method,
        action,
        outlierCount,
        message:
          outlierCount === 0
            ? "탐지된 이상치가 없습니다."
            : "이상치 처리를 적용하지 않았습니다.",
      },
    };
  }

  let processedValues = [...values];

  switch (action) {
    case "remove":
      return {
        series: series
          .map((item, index) => ({
            ...item,
            isOutlier: outlierFlags[index],
          }))
          .filter((_, index) => !outlierFlags[index]),
        report: {
          method,
          action,
          outlierCount,
          message: `이상치 ${outlierCount}개를 제거했습니다.`,
        },
      };

    case "winsorize":
      processedValues = winsorizeOutliers(values, outlierFlags);
      break;

    case "mean":
      processedValues = replaceOutliersWithMean(values, outlierFlags);
      break;

    case "interpolate":
    default:
      processedValues = TSMathUtils.linearInterpolate(
        TSMathUtils.replaceOutliersWithNull(values, outlierFlags)
      );
      break;
  }

  const processedSeries = series.map((item, index) => ({
    ...item,
    value: processedValues[index],
    isOutlier: outlierFlags[index],
    outlierProcessed: outlierFlags[index],
  }));

  return {
    series: processedSeries,
    report: {
      method,
      action,
      outlierCount,
      message: `${method} 기준으로 이상치 ${outlierCount}개를 탐지하고 ${action} 방식으로 처리했습니다.`,
    },
  };
}

function winsorizeOutliers(values = [], outlierFlags = []) {
  const normalValues = values.filter((value, index) => {
    return !outlierFlags[index] && value !== null;
  });

  const lower = TSMathUtils.quantile(normalValues, 0.05);
  const upper = TSMathUtils.quantile(normalValues, 0.95);

  return values.map((value, index) => {
    if (!outlierFlags[index]) return value;

    if (value < lower) return lower;
    if (value > upper) return upper;

    return value;
  });
}

function replaceOutliersWithMean(values = [], outlierFlags = []) {
  const normalValues = values.filter((value, index) => {
    return !outlierFlags[index] && value !== null;
  });

  const avg = TSMathUtils.mean(normalValues);

  return values.map((value, index) => {
    if (outlierFlags[index]) return avg;

    return value;
  });
}

/* =========================================================
   리샘플링
   ========================================================= */

function resampleSeries(series = [], frequency = "daily") {
  if (!Array.isArray(series) || series.length === 0) {
    return [];
  }

  const sortedSeries = [...series].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const startDate = sortedSeries[0].date;
  const endDate = sortedSeries[sortedSeries.length - 1].date;

  const dateRange = TSDateUtils.generateDateRange(
    startDate,
    endDate,
    frequency
  );

  const valueMap = {};

  sortedSeries.forEach((item) => {
    const iso = TSDateUtils.toISOStringSafe(item.date);

    if (!iso) return;

    if (!valueMap[iso]) {
      valueMap[iso] = [];
    }

    valueMap[iso].push(item.value);
  });

  return dateRange.map((date) => {
    const values = valueMap[date] || [];

    return {
      date,
      value: values.length > 0 ? TSMathUtils.mean(values) : null,
      resampled: true,
    };
  });
}

/* =========================================================
   정규화 / 스케일링
   ========================================================= */

function scaleSeries(series = [], method = "none") {
  const values = series.map((item) => item.value);

  let scaledValues = [...values];

  switch (method) {
    case "minmax":
      scaledValues = TSMathUtils.minMaxScale(values);
      break;

    case "zscore":
      scaledValues = TSMathUtils.zScoreScale(values);
      break;

    case "robust":
      scaledValues = TSMathUtils.robustScale(values);
      break;

    case "none":
    default:
      return {
        series,
        report: {
          method,
          applied: false,
          message: "정규화를 적용하지 않았습니다.",
        },
      };
  }

  return {
    series: series.map((item, index) => ({
      ...item,
      value: scaledValues[index],
      scaled: true,
      scaleMethod: method,
    })),
    report: {
      method,
      applied: true,
      message: `${method} 정규화를 적용했습니다.`,
    },
  };
}

/* =========================================================
   중복 Timestamp 처리
   ========================================================= */

function aggregateDuplicateTimestamps(series = [], method = "mean") {
  const grouped = {};

  series.forEach((item) => {
    const iso = TSDateUtils.toISOStringSafe(item.date);

    if (!iso) return;

    if (!grouped[iso]) {
      grouped[iso] = [];
    }

    grouped[iso].push(item.value);
  });

  return Object.entries(grouped)
    .map(([date, values]) => {
      let value = values[0];

      if (method === "mean") {
        value = TSMathUtils.mean(values);
      }

      if (method === "sum") {
        value = TSMathUtils.sum(values);
      }

      if (method === "last") {
        value = values[values.length - 1];
      }

      return {
        date,
        value,
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* =========================================================
   자동 전처리
   ========================================================= */

function runAutoPreprocessing(trackId) {
  const sourceTrack = TSStore.getTrackById(trackId);

  if (!sourceTrack) return null;

  const values = sourceTrack.y || [];
  const missingCount = values.filter((value) => value === null).length;
  const outlierCount = TSMathUtils.detectOutliersIQR(values, 1.5).filter(Boolean)
    .length;

  const missingMethod = missingCount > 0 ? "linear" : "linear";
  const outlierMethod = outlierCount > 0 ? "iqr" : "none";
  const outlierAction = outlierCount > 0 ? "interpolate" : "interpolate";

  return runPreprocessing({
    trackId,
    missingMethod,
    outlierMethod,
    outlierAction,
    scaleMethod: "none",
    resampleFrequency: null,
    createTrack: true,
  });
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSPreprocessing = {
  runPreprocessing,

  trackToSeries,

  handleMissingValues,
  fillMissingWithMean,
  fillMissingWithMovingAverage,

  handleOutliers,
  winsorizeOutliers,
  replaceOutliersWithMean,

  resampleSeries,
  scaleSeries,
  aggregateDuplicateTimestamps,

  runAutoPreprocessing,
};