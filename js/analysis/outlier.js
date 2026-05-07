/* =========================================================
   TS Navigator - outlier.js
   ---------------------------------------------------------
   역할
   1. 시계열 target 값의 이상치 탐지
   2. Z-score / IQR / Hampel Filter 지원
   3. 이상치 유지 / 평균 / 중앙값 / 선형보간 대체
   4. 이상치 지점을 __outlier marker로 저장
   5. 처리 결과를 새 Preprocessed Track으로 생성
========================================================= */

/* =========================================================
   1. Outlier 분석 실행
========================================================= */

function runOutlierAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createOutlierErrorResult("이상치 탐지할 데이터가 없습니다.");
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
    return createOutlierErrorResult("target column을 찾지 못했습니다.");
  }

  const method = options.method || "hampel";
  const threshold = Number(options.threshold || 3);
  const windowSize = Number(options.windowSize || 7);
  const replaceWith = options.replaceWith || "linear-interpolation";

  const values = getTargetValues(rows, targetColumn);
  const outliers = detectOutliers(values, {
    method,
    threshold,
    windowSize
  });

  const outlierIndices = outliers.map(item => item.index);

  const outputRows = replaceOutlierValues(rows, targetColumn, outlierIndices, {
    replaceWith,
    windowSize
  });

  const result = {
    type: "Outlier",
    status: "done",

    method,
    threshold,
    windowSize,
    replaceWith,

    datetimeColumn,
    targetColumn,

    before: {
      rowCount: rows.length,
      outlierCount: outlierIndices.length,
      outlierRatio: rows.length > 0 ? outlierIndices.length / rows.length : 0
    },

    after: {
      rowCount: outputRows.length,
      replacedCount: replaceWith === "keep" ? 0 : outlierIndices.length
    },

    outliers,
    outlierIndices,
    outputRows,

    messages: createOutlierMessages({
      method,
      outlierCount: outlierIndices.length,
      replaceWith
    }),

    recommendation: createOutlierRecommendation({
      outlierCount: outlierIndices.length,
      replaceWith
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Outlier 분석
========================================================= */

function runOutlierAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runOutlierAnalysis(sourceTrack.data || [], {
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
    markLatestOutlierStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createOutlierTrackName(sourceTrack, result),
    type: "Preprocessed Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      outlier: result,
      lastAnalysis: "Outlier",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Outlier", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      outlier: result
    },
    result
  });

  markLatestOutlierStack(newTrack.id, result);

  if (window.TSStore.selectTrack) {
    window.TSStore.selectTrack(newTrack.id);
  }

  return result;
}

/* =========================================================
   3. 이상치 탐지
========================================================= */

function detectOutliers(values, options = {}) {
  const method = options.method || "hampel";
  const threshold = Number(options.threshold || 3);
  const windowSize = Number(options.windowSize || 7);

  if (method === "z-score") {
    return window.TSMathUtils
      ? window.TSMathUtils.detectOutliersZScore(values, threshold)
      : detectOutliersZScoreLocal(values, threshold);
  }

  if (method === "iqr") {
    return window.TSMathUtils
      ? window.TSMathUtils.detectOutliersIQR(values, 1.5)
      : detectOutliersIQRLocal(values, 1.5);
  }

  return window.TSMathUtils
    ? window.TSMathUtils.detectOutliersHampel(values, windowSize, threshold)
    : detectOutliersHampelLocal(values, windowSize, threshold);
}

/* =========================================================
   4. 이상치 대체
========================================================= */

function replaceOutlierValues(rows, targetColumn, outlierIndices, options = {}) {
  const replaceWith = options.replaceWith || "linear-interpolation";
  const outlierSet = new Set(outlierIndices);
  const values = getTargetValues(rows, targetColumn).map(toNumber);

  let replacedValues = [...values];

  if (replaceWith === "keep") {
    return rows.map((row, index) => ({
      ...row,
      __outlier: outlierSet.has(index),
      __outlierHandled: false
    }));
  }

  if (replaceWith === "mean") {
    const normalValues = values.filter((value, index) => {
      return Number.isFinite(value) && !outlierSet.has(index);
    });

    const meanValue = meanLocal(normalValues);

    replacedValues = values.map((value, index) => {
      return outlierSet.has(index) ? meanValue : value;
    });
  }

  if (replaceWith === "median") {
    const normalValues = values.filter((value, index) => {
      return Number.isFinite(value) && !outlierSet.has(index);
    });

    const medianValue = medianLocal(normalValues);

    replacedValues = values.map((value, index) => {
      return outlierSet.has(index) ? medianValue : value;
    });
  }

  if (replaceWith === "linear-interpolation") {
    const maskedValues = values.map((value, index) => {
      return outlierSet.has(index) ? NaN : value;
    });

    replacedValues = window.TSMathUtils
      ? window.TSMathUtils.linearInterpolate(maskedValues)
      : linearInterpolateLocal(maskedValues);
  }

  return rows.map((row, index) => ({
    ...row,
    [targetColumn]: Number.isFinite(replacedValues[index])
      ? replacedValues[index]
      : row[targetColumn],
    __outlier: outlierSet.has(index),
    __outlierHandled: outlierSet.has(index) && replaceWith !== "keep",
    __outlierReplaceMethod: outlierSet.has(index) ? replaceWith : null
  }));
}

/* =========================================================
   5. Local 이상치 탐지 Fallback
========================================================= */

function detectOutliersZScoreLocal(values, threshold = 3) {
  const nums = values.map(toNumber);
  const avg = meanLocal(nums);
  const std = standardDeviationLocal(nums);

  if (!Number.isFinite(std) || std === 0) return [];

  return nums
    .map((value, index) => {
      const score = Number.isFinite(value) ? (value - avg) / std : NaN;

      return {
        index,
        value,
        score,
        isOutlier: Number.isFinite(score) && Math.abs(score) > threshold
      };
    })
    .filter(item => item.isOutlier);
}

function detectOutliersIQRLocal(values, multiplier = 1.5) {
  const nums = values.map(toNumber).filter(Number.isFinite);

  if (nums.length === 0) return [];

  const q1 = quantileLocal(nums, 0.25);
  const q3 = quantileLocal(nums, 0.75);
  const iqrValue = q3 - q1;

  const lower = q1 - multiplier * iqrValue;
  const upper = q3 + multiplier * iqrValue;

  return values
    .map((value, index) => {
      const number = toNumber(value);

      return {
        index,
        value: number,
        lower,
        upper,
        isOutlier: Number.isFinite(number) && (number < lower || number > upper)
      };
    })
    .filter(item => item.isOutlier);
}

function detectOutliersHampelLocal(values, windowSize = 7, threshold = 3) {
  const nums = values.map(toNumber);
  const halfWindow = Math.floor(windowSize / 2);
  const result = [];

  for (let i = 0; i < nums.length; i += 1) {
    if (!Number.isFinite(nums[i])) continue;

    const start = Math.max(0, i - halfWindow);
    const end = Math.min(nums.length, i + halfWindow + 1);

    const windowValues = nums
      .slice(start, end)
      .filter(Number.isFinite);

    if (windowValues.length < 3) continue;

    const med = medianLocal(windowValues);
    const absDeviations = windowValues.map(value => Math.abs(value - med));
    const mad = medianLocal(absDeviations);

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
   6. 메시지 / 추천
========================================================= */

function createOutlierMessages({ method, outlierCount, replaceWith }) {
  return [
    `Outlier 탐지 방법은 ${method}입니다.`,
    `탐지된 이상치는 ${outlierCount}개입니다.`,
    `이상치 처리 방식은 ${replaceWith}입니다.`
  ];
}

function createOutlierRecommendation({ outlierCount, replaceWith }) {
  const recommendation = [];

  if (outlierCount === 0) {
    recommendation.push({
      nextStep: "Smoothing",
      priority: "normal",
      message: "탐지된 이상치가 없으므로 smoothing 또는 decomposition 단계로 진행할 수 있습니다."
    });

    return recommendation;
  }

  if (replaceWith === "keep") {
    recommendation.push({
      nextStep: "Smoothing",
      priority: "medium",
      message: "이상치를 유지했으므로 이동평균 또는 지수평활로 영향 정도를 비교하는 것이 좋습니다."
    });
  } else {
    recommendation.push({
      nextStep: "Stationarity",
      priority: "normal",
      message: "이상치 보정 후 정상성 확인 또는 예측 모델링으로 진행할 수 있습니다."
    });
  }

  recommendation.push({
    nextStep: "Compare",
    priority: "normal",
    message: "이상치 처리 전후 Track을 비교하여 처리 효과를 확인하세요."
  });

  return recommendation;
}

/* =========================================================
   7. Track / Stack 보조
========================================================= */

function createOutlierTrackName(sourceTrack, result) {
  const method = result.method || "outlier";
  const baseName = sourceTrack?.name || "Track";

  return `${baseName} · Outlier ${method}`;
}

function markLatestOutlierStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Outlier");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createOutlierShortSummary(result)
  );
}

function createOutlierShortSummary(result) {
  if (!result || result.status !== "done") {
    return "Outlier 탐지 실패";
  }

  return `${result.method} · outliers ${result.before.outlierCount} · ${result.replaceWith}`;
}

/* =========================================================
   8. UI 표시용 HTML
========================================================= */

function createOutlierResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Outlier 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Outlier Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Outlier Summary</strong><br />
      Method: ${escapeHTML(result.method)}<br />
      Threshold: ${escapeHTML(result.threshold)}<br />
      Outliers: ${result.before.outlierCount}<br />
      Replace: ${escapeHTML(result.replaceWith)}<br />
      Replaced: ${result.after.replacedCount}
    </div>
  `;
}

/* =========================================================
   9. Error
========================================================= */

function createOutlierErrorResult(message, extra = {}) {
  return {
    type: "Outlier",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Outlier",
        priority: "high",
        message: "이상치 탐지에 필요한 target column을 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   10. Column / Value 보조
========================================================= */

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
  if (window.TSMathUtils) {
    return window.TSMathUtils.toNumber(value);
  }

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

function quantileLocal(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length === 0) return NaN;

  const position = (clean.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;

  if (lower === upper) return clean[lower];

  return clean[lower] * (1 - weight) + clean[upper] * weight;
}

function linearInterpolateLocal(values) {
  const result = values.map(toNumber);

  for (let i = 0; i < result.length; i += 1) {
    if (Number.isFinite(result[i])) continue;

    let left = i - 1;
    let right = i + 1;

    while (left >= 0 && !Number.isFinite(result[left])) {
      left -= 1;
    }

    while (right < result.length && !Number.isFinite(result[right])) {
      right += 1;
    }

    if (left >= 0 && right < result.length) {
      const ratio = (i - left) / (right - left);
      result[i] = result[left] + ratio * (result[right] - result[left]);
    } else if (left >= 0) {
      result[i] = result[left];
    } else if (right < result.length) {
      result[i] = result[right];
    }
  }

  return result;
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
   11. 외부 접근용 객체
========================================================= */

window.TSOutlierAnalysis = {
  runOutlierAnalysis,
  runOutlierAnalysisOnTrack,

  detectOutliers,
  replaceOutlierValues,

  createOutlierMessages,
  createOutlierRecommendation,
  createOutlierShortSummary,
  createOutlierResultHTML
};