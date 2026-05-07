/* =========================================================
   TS Navigator - resampling.js
   ---------------------------------------------------------
   역할
   1. 불규칙 시계열을 일정한 주기로 변환
   2. Daily / Weekly / Monthly / Quarterly / Yearly 지원
   3. asfreq / mean / sum / last 집계 지원
   4. resampling 이후 결측값 보간 옵션 제공
   5. 처리 결과를 새 Preprocessed Track으로 생성
========================================================= */

/* =========================================================
   1. Resampling 분석 실행
========================================================= */

function runResamplingAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createResamplingErrorResult("Resampling할 데이터가 없습니다.");
  }

  const datetimeColumn =
    options.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn ||
    inferDatetimeColumn(rows);

  const targetColumn =
    options.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    inferTargetColumn(rows, datetimeColumn);

  if (!datetimeColumn || !targetColumn) {
    return createResamplingErrorResult("datetime column 또는 target column을 찾지 못했습니다.");
  }

  const frequency =
    options.frequency && options.frequency !== "auto"
      ? options.frequency
      : detectTargetFrequency(rows, datetimeColumn);

  const method = options.method || "asfreq";
  const fillMethod = options.fillMethod || "interpolate";

  const sortedRows = window.TSDateUtils
    ? window.TSDateUtils.sortRowsByDate(rows, datetimeColumn)
    : [...rows];

  const groupedRows = groupRowsByFrequency(sortedRows, datetimeColumn, targetColumn, frequency);
  let outputRows = aggregateGroupedRows(groupedRows, datetimeColumn, targetColumn, {
    method,
    frequency
  });

  outputRows = createRegularRows(outputRows, datetimeColumn, targetColumn, frequency);

  if (fillMethod !== "none") {
    outputRows = fillResampledMissingValues(outputRows, targetColumn, fillMethod);
  }

  const beforeFrequency = window.TSDateUtils
    ? window.TSDateUtils.detectFrequency(sortedRows, datetimeColumn)
    : null;

  const afterFrequency = window.TSDateUtils
    ? window.TSDateUtils.detectFrequency(outputRows, datetimeColumn)
    : null;

  const result = {
    type: "Resampling",
    status: "done",

    datetimeColumn,
    targetColumn,

    frequency,
    method,
    fillMethod,

    before: {
      rowCount: rows.length,
      frequency: beforeFrequency
    },

    after: {
      rowCount: outputRows.length,
      frequency: afterFrequency,
      missingValueCount: countMissingValues(outputRows, targetColumn)
    },

    outputRows,

    messages: createResamplingMessages({
      beforeRowCount: rows.length,
      afterRowCount: outputRows.length,
      frequency,
      method,
      fillMethod
    }),

    recommendation: createResamplingRecommendation({
      fillMethod,
      missingCount: countMissingValues(outputRows, targetColumn)
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Resampling 분석
========================================================= */

function runResamplingAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runResamplingAnalysis(sourceTrack.data || [], {
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
    markLatestResamplingStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createResamplingTrackName(sourceTrack, result),
    type: "Preprocessed Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      frequency: result.after.frequency,
      resampling: result,
      lastAnalysis: "Resampling",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Resampling", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      resampling: result
    },
    result
  });

  markLatestResamplingStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. Frequency 결정
========================================================= */

function detectTargetFrequency(rows, datetimeColumn) {
  if (!window.TSDateUtils) return "D";

  const detected = window.TSDateUtils.detectFrequency(rows, datetimeColumn);

  return detected?.code || "D";
}

function getBucketKey(date, frequency) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (frequency === "Y") {
    return `${year}`;
  }

  if (frequency === "Q") {
    const quarter = Math.floor(month / 3) + 1;
    return `${year}-Q${quarter}`;
  }

  if (frequency === "M") {
    return `${year}-${pad2(month + 1)}`;
  }

  if (frequency === "W") {
    const weekStart = new Date(date);
    weekStart.setDate(day - weekStart.getDay());
    return `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;
  }

  if (frequency === "H") {
    return `${year}-${pad2(month + 1)}-${pad2(day)} ${pad2(date.getHours())}:00`;
  }

  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function getBucketDate(bucketKey, frequency) {
  if (frequency === "Q") {
    const [yearText, quarterText] = bucketKey.split("-Q");
    const month = (Number(quarterText) - 1) * 3;
    return new Date(Number(yearText), month, 1);
  }

  if (frequency === "Y") {
    return new Date(Number(bucketKey), 0, 1);
  }

  return window.TSDateUtils
    ? window.TSDateUtils.parseDateValue(bucketKey)
    : new Date(bucketKey);
}

/* =========================================================
   4. Group / Aggregate
========================================================= */

function groupRowsByFrequency(rows, datetimeColumn, targetColumn, frequency) {
  const groups = new Map();

  rows.forEach(row => {
    const date = window.TSDateUtils
      ? window.TSDateUtils.parseDateValue(row[datetimeColumn])
      : new Date(row[datetimeColumn]);

    if (!date || Number.isNaN(date.getTime())) return;

    const key = getBucketKey(date, frequency);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  });

  return groups;
}

function aggregateGroupedRows(groups, datetimeColumn, targetColumn, options = {}) {
  const method = options.method || "asfreq";
  const frequency = options.frequency || "D";

  const rows = [];

  groups.forEach((groupRows, key) => {
    const values = groupRows
      .map(row => toNumber(row[targetColumn]))
      .filter(Number.isFinite);

    const date = getBucketDate(key, frequency);
    let value = NaN;

    if (method === "sum") {
      value = values.reduce((acc, item) => acc + item, 0);
    } else if (method === "last") {
      value = values[values.length - 1];
    } else if (method === "mean") {
      value = meanLocal(values);
    } else {
      value = values[0];
    }

    rows.push({
      ...groupRows[groupRows.length - 1],
      [datetimeColumn]: window.TSDateUtils
        ? window.TSDateUtils.formatDate(date, frequency)
        : String(key),
      [targetColumn]: Number.isFinite(value) ? value : "",
      __resampled: true,
      __resampleMethod: method
    });
  });

  return window.TSDateUtils
    ? window.TSDateUtils.sortRowsByDate(rows, datetimeColumn)
    : rows;
}

/* =========================================================
   5. Regular Index 생성
========================================================= */

function createRegularRows(rows, datetimeColumn, targetColumn, frequency) {
  if (!window.TSDateUtils || rows.length < 2) return rows;

  const regularRows = window.TSDateUtils.buildRegularTimeIndexRows(
    rows,
    datetimeColumn,
    frequency
  );

  return regularRows.map(row => {
    if (row.__missingTimestamp) {
      return {
        ...row,
        [targetColumn]: "",
        __resampled: true,
        __missingTimestamp: true
      };
    }

    return {
      ...row,
      __resampled: true
    };
  });
}

/* =========================================================
   6. Resampling 이후 결측 보간
========================================================= */

function fillResampledMissingValues(rows, targetColumn, fillMethod = "interpolate") {
  const values = rows.map(row => row[targetColumn]);

  let filledValues = values;

  if (fillMethod === "locf") {
    filledValues = window.TSMathUtils
      ? window.TSMathUtils.fillForward(values)
      : fillForwardLocal(values);
  } else if (fillMethod === "nocb") {
    filledValues = window.TSMathUtils
      ? window.TSMathUtils.fillBackward(values)
      : fillBackwardLocal(values);
  } else {
    filledValues = window.TSMathUtils
      ? window.TSMathUtils.linearInterpolate(values)
      : linearInterpolateLocal(values);
  }

  return rows.map((row, index) => {
    const wasMissing = !Number.isFinite(toNumber(row[targetColumn]));

    return {
      ...row,
      [targetColumn]: Number.isFinite(filledValues[index])
        ? filledValues[index]
        : row[targetColumn],
      __filledAfterResampling: wasMissing,
      __fillMethod: wasMissing ? fillMethod : row.__fillMethod || null
    };
  });
}

/* =========================================================
   7. 메시지 / 추천
========================================================= */

function createResamplingMessages({ beforeRowCount, afterRowCount, frequency, method, fillMethod }) {
  return [
    `Resampling 주기는 ${frequency}입니다.`,
    `집계 방식은 ${method}입니다.`,
    `결측 보간 방식은 ${fillMethod}입니다.`,
    `행 수가 ${beforeRowCount}개에서 ${afterRowCount}개로 변경되었습니다.`
  ];
}

function createResamplingRecommendation({ fillMethod, missingCount }) {
  const recommendation = [];

  if (missingCount > 0) {
    recommendation.push({
      nextStep: "Missing",
      priority: "high",
      message: "Resampling 이후에도 결측값이 남아 있으므로 Missing 처리를 다시 수행하세요."
    });
  } else {
    recommendation.push({
      nextStep: "Smoothing",
      priority: "normal",
      message: "주기가 정리되었으므로 smoothing, decomposition, forecast 단계로 진행할 수 있습니다."
    });
  }

  if (fillMethod !== "none") {
    recommendation.push({
      nextStep: "Compare",
      priority: "normal",
      message: "Resampling 전후 Track을 비교하여 값의 변화가 적절한지 확인하세요."
    });
  }

  return recommendation;
}

/* =========================================================
   8. Track / Stack 보조
========================================================= */

function createResamplingTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Resampling ${result.frequency}`;
}

function markLatestResamplingStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Resampling");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createResamplingShortSummary(result)
  );
}

function createResamplingShortSummary(result) {
  if (!result || result.status !== "done") return "Resampling 실패";

  return `${result.frequency} · ${result.method} · rows ${result.before.rowCount}→${result.after.rowCount}`;
}

/* =========================================================
   9. UI 표시용 HTML
========================================================= */

function createResamplingResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Resampling 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Resampling Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Resampling Summary</strong><br />
      Frequency: ${escapeHTML(result.frequency)}<br />
      Method: ${escapeHTML(result.method)}<br />
      Fill: ${escapeHTML(result.fillMethod)}<br />
      Rows: ${result.before.rowCount} → ${result.after.rowCount}<br />
      Remaining Missing: ${result.after.missingValueCount}
    </div>
  `;
}

/* =========================================================
   10. Error
========================================================= */

function createResamplingErrorResult(message, extra = {}) {
  return {
    type: "Resampling",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Structure",
        priority: "high",
        message: "Resampling에 필요한 datetime column과 target column을 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   11. 보조 함수
========================================================= */

function countMissingValues(rows, targetColumn) {
  return rows.filter(row => !Number.isFinite(toNumber(row[targetColumn]))).length;
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

function linearInterpolateLocal(values) {
  const result = values.map(toNumber);

  for (let i = 0; i < result.length; i += 1) {
    if (Number.isFinite(result[i])) continue;

    let left = i - 1;
    let right = i + 1;

    while (left >= 0 && !Number.isFinite(result[left])) left -= 1;
    while (right < result.length && !Number.isFinite(result[right])) right += 1;

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

function pad2(value) {
  return String(value).padStart(2, "0");
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

window.TSResamplingAnalysis = {
  runResamplingAnalysis,
  runResamplingAnalysisOnTrack,

  detectTargetFrequency,
  groupRowsByFrequency,
  aggregateGroupedRows,
  createRegularRows,
  fillResampledMissingValues,

  createResamplingMessages,
  createResamplingRecommendation,
  createResamplingShortSummary,
  createResamplingResultHTML
};