/* =========================================================
   TS Navigator - missing.js
   ---------------------------------------------------------
   역할
   1. target 값 결측치 탐지
   2. missing timestamp 생성
   3. LOCF / NOCB / Linear / Mean / Moving Average 보간
   4. 결측 처리 결과를 새 Track 또는 기존 Track에 반영
   5. Structure 이후 전처리 단계로 사용
========================================================= */

/* =========================================================
   1. Missing 분석 실행
========================================================= */

function runMissingAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createMissingErrorResult("결측 처리할 데이터가 없습니다.");
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
    return createMissingErrorResult("target column을 찾지 못했습니다.");
  }

  let workingRows = cloneRows(rows);

  if (datetimeColumn && options.createMissingTimestamp !== false) {
    workingRows = createMissingTimestampRows(workingRows, datetimeColumn, options);
  }

  const beforeValues = getTargetValues(workingRows, targetColumn);
  const missingIndices = findMissingValueIndices(beforeValues);

  const filledValues = fillMissingValues(beforeValues, {
    method: options.method || "linear",
    windowSize: Number(options.windowSize || 3)
  });

  const outputRows = workingRows.map((row, index) => {
    const wasMissing = missingIndices.includes(index);
    const value = filledValues[index];

    return {
      ...row,
      [targetColumn]: Number.isFinite(value) ? value : row[targetColumn],
      __missingValue: wasMissing,
      __filled: wasMissing,
      __fillMethod: wasMissing ? options.method || "linear" : row.__fillMethod || null
    };
  });

  const afterValues = getTargetValues(outputRows, targetColumn);
  const remainingMissingIndices = findMissingValueIndices(afterValues);

  const result = {
    type: "Missing",
    status: "done",

    method: options.method || "linear",
    datetimeColumn,
    targetColumn,

    before: {
      rowCount: rows.length,
      missingValueCount: missingIndices.length,
      missingRatio: rows.length > 0 ? missingIndices.length / rows.length : 0
    },

    after: {
      rowCount: outputRows.length,
      remainingMissingValueCount: remainingMissingIndices.length,
      filledCount: missingIndices.length - remainingMissingIndices.length
    },

    missingIndices,
    remainingMissingIndices,

    outputRows,

    messages: createMissingMessages({
      method: options.method || "linear",
      beforeCount: missingIndices.length,
      afterCount: remainingMissingIndices.length,
      outputRowCount: outputRows.length
    }),

    recommendation: createMissingRecommendation({
      method: options.method || "linear",
      remainingMissingCount: remainingMissingIndices.length,
      filledCount: missingIndices.length - remainingMissingIndices.length
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Missing 분석
========================================================= */

function runMissingAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runMissingAnalysis(sourceTrack.data || [], {
    ...params,
    datetimeColumn:
      params.datetimeColumn ||
      sourceTrack.metadata?.datetimeColumn ||
      window.TSState?.dataset?.datetimeColumn,
    targetColumn:
      params.targetColumn ||
      sourceTrack.metadata?.targetColumn ||
      window.TSState?.dataset?.targetColumn,
    frequency:
      params.frequency ||
      sourceTrack.metadata?.frequency ||
      window.TSState?.dataset?.frequency
  });

  if (result.status === "error") {
    markLatestMissingStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createMissingTrackName(sourceTrack, result),
    type: "Preprocessed Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      datetimeColumn: result.datetimeColumn,
      targetColumn: result.targetColumn,
      missing: result,
      lastAnalysis: "Missing",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Missing", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      missing: result
    },
    result
  });

  markLatestMissingStack(newTrack.id, result);

  if (window.TSStore.selectTrack) {
    window.TSStore.selectTrack(newTrack.id);
  }

  return result;
}

/* =========================================================
   3. Missing Timestamp 생성
========================================================= */

function createMissingTimestampRows(rows, datetimeColumn, options = {}) {
  if (!window.TSDateUtils || !datetimeColumn) return rows;

  const frequencyCode =
    options.frequency?.code ||
    options.frequency ||
    window.TSState?.dataset?.frequency?.code ||
    null;

  const regularRows = window.TSDateUtils.buildRegularTimeIndexRows(
    rows,
    datetimeColumn,
    frequencyCode
  );

  return mergeMissingTimestampRows(regularRows, rows, datetimeColumn);
}

function mergeMissingTimestampRows(regularRows, originalRows, datetimeColumn) {
  const originalMap = new Map();

  originalRows.forEach(row => {
    const date = window.TSDateUtils.parseDateValue(row[datetimeColumn]);
    if (!date) return;

    originalMap.set(date.getTime(), row);
  });

  return regularRows.map(row => {
    const date = window.TSDateUtils.parseDateValue(row[datetimeColumn]);
    if (!date) return row;

    const original = originalMap.get(date.getTime());

    if (original) {
      return {
        ...original,
        __missingTimestamp: false
      };
    }

    return {
      ...row,
      __missingTimestamp: true
    };
  });
}

/* =========================================================
   4. 결측 인덱스 확인
========================================================= */

function findMissingValueIndices(values) {
  if (!Array.isArray(values)) return [];

  const indices = [];

  values.forEach((value, index) => {
    if (!Number.isFinite(toNumber(value))) {
      indices.push(index);
    }
  });

  return indices;
}

function hasMissingValues(values) {
  return findMissingValueIndices(values).length > 0;
}

function summarizeMissingValues(rows, targetColumn) {
  const values = getTargetValues(rows, targetColumn);
  const missingIndices = findMissingValueIndices(values);

  return {
    totalCount: values.length,
    missingCount: missingIndices.length,
    missingRatio: values.length > 0 ? missingIndices.length / values.length : 0,
    missingIndices
  };
}

/* =========================================================
   5. 결측치 보간
========================================================= */

function fillMissingValues(values, options = {}) {
  const method = options.method || "linear";
  const windowSize = Number(options.windowSize || 3);

  if (method === "locf") {
    return window.TSMathUtils
      ? window.TSMathUtils.fillForward(values)
      : fillForwardLocal(values);
  }

  if (method === "nocb") {
    return window.TSMathUtils
      ? window.TSMathUtils.fillBackward(values)
      : fillBackwardLocal(values);
  }

  if (method === "mean") {
    return window.TSMathUtils
      ? window.TSMathUtils.fillMean(values)
      : fillMeanLocal(values);
  }

  if (method === "moving-average") {
    return fillMovingAverage(values, windowSize);
  }

  return window.TSMathUtils
    ? window.TSMathUtils.linearInterpolate(values)
    : linearInterpolateLocal(values);
}

function fillMovingAverage(values, windowSize = 3) {
  const nums = values.map(toNumber);
  const result = [...nums];

  for (let i = 0; i < result.length; i += 1) {
    if (Number.isFinite(result[i])) continue;

    const start = Math.max(0, i - windowSize);
    const end = Math.min(result.length, i + windowSize + 1);

    const localValues = result
      .slice(start, end)
      .filter(Number.isFinite);

    if (localValues.length > 0) {
      result[i] = meanLocal(localValues);
    }
  }

  return linearInterpolateLocal(result);
}

/* =========================================================
   6. Local Fallback 보간
========================================================= */

function fillForwardLocal(values) {
  const result = values.map(toNumber);
  let lastValue = NaN;

  for (let i = 0; i < result.length; i += 1) {
    if (Number.isFinite(result[i])) {
      lastValue = result[i];
    } else {
      result[i] = lastValue;
    }
  }

  return result;
}

function fillBackwardLocal(values) {
  const result = values.map(toNumber);
  let nextValue = NaN;

  for (let i = result.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(result[i])) {
      nextValue = result[i];
    } else {
      result[i] = nextValue;
    }
  }

  return result;
}

function fillMeanLocal(values) {
  const nums = values.map(toNumber);
  const avg = meanLocal(nums.filter(Number.isFinite));

  return nums.map(value => Number.isFinite(value) ? value : avg);
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

/* =========================================================
   7. 메시지 / 추천
========================================================= */

function createMissingMessages({ method, beforeCount, afterCount, outputRowCount }) {
  return [
    `Missing 처리 방법은 ${method}입니다.`,
    `처리 전 결측값은 ${beforeCount}개입니다.`,
    `처리 후 남은 결측값은 ${afterCount}개입니다.`,
    `출력 데이터는 ${outputRowCount}행입니다.`
  ];
}

function createMissingRecommendation({ method, remainingMissingCount, filledCount }) {
  const recommendation = [];

  if (remainingMissingCount > 0) {
    recommendation.push({
      nextStep: "Missing",
      priority: "high",
      message: "일부 결측값이 남아 있습니다. LOCF 또는 NOCB 방식으로 다시 처리해보는 것이 좋습니다."
    });
  }

  if (filledCount > 0) {
    recommendation.push({
      nextStep: "Outlier",
      priority: "medium",
      message: "보간 이후 값의 급격한 변화가 생길 수 있으므로 이상치 탐지를 수행하는 것이 좋습니다."
    });
  }

  if (method === "moving-average") {
    recommendation.push({
      nextStep: "Smoothing",
      priority: "normal",
      message: "이동평균 기반 보간을 사용했으므로 smoothing 결과와 비교해볼 수 있습니다."
    });
  }

  if (recommendation.length === 0) {
    recommendation.push({
      nextStep: "Forecast",
      priority: "normal",
      message: "결측 처리가 완료되었으므로 예측 단계로 진행할 수 있습니다."
    });
  }

  return recommendation;
}

/* =========================================================
   8. Track / Stack 보조
========================================================= */

function createMissingTrackName(sourceTrack, result) {
  const method = result.method || "filled";
  const baseName = sourceTrack?.name || "Track";

  return `${baseName} · Missing ${method}`;
}

function markLatestMissingStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Missing");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createMissingShortSummary(result)
  );
}

function createMissingShortSummary(result) {
  if (!result || result.status !== "done") {
    return "Missing 처리 실패";
  }

  return `${result.method} · filled ${result.after.filledCount} · remaining ${result.after.remainingMissingValueCount}`;
}

/* =========================================================
   9. UI 표시용 HTML
========================================================= */

function createMissingResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Missing 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Missing Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Missing Summary</strong><br />
      Method: ${escapeHTML(result.method)}<br />
      Before Missing: ${result.before.missingValueCount}<br />
      Filled: ${result.after.filledCount}<br />
      Remaining: ${result.after.remainingMissingValueCount}<br />
      Rows: ${result.after.rowCount}
    </div>
  `;
}

/* =========================================================
   10. Error
========================================================= */

function createMissingErrorResult(message, extra = {}) {
  return {
    type: "Missing",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Missing",
        priority: "high",
        message: "결측 처리에 필요한 datetime column과 target column을 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   11. Column / Value 보조
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

function cloneRows(rows) {
  return rows.map(row => ({ ...row }));
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

window.TSMissingAnalysis = {
  runMissingAnalysis,
  runMissingAnalysisOnTrack,

  createMissingTimestampRows,
  mergeMissingTimestampRows,

  findMissingValueIndices,
  hasMissingValues,
  summarizeMissingValues,

  fillMissingValues,
  fillMovingAverage,

  createMissingMessages,
  createMissingRecommendation,
  createMissingShortSummary,
  createMissingResultHTML
};