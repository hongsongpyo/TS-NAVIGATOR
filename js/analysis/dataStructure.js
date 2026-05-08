/* =========================================================
   TS Navigator - structure.js
   ---------------------------------------------------------
   역할
   1. 업로드된 CSV의 시계열 구조 자동 분석
   2. datetime column / target column 확인
   3. 정렬 여부, 중복 timestamp, missing timestamp 확인
   4. frequency 자동 탐지
   5. 분석 결과를 Track / Region에 반영할 수 있는 형태로 반환
========================================================= */

/* =========================================================
   1. Structure 분석 실행
========================================================= */

function runStructureAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createStructureErrorResult("분석할 데이터가 없습니다.");
  }

  const columns = options.columns || inferColumns(rows);

  const datetimeColumn =
    options.datetimeColumn && options.datetimeColumn !== "auto"
      ? options.datetimeColumn
      : detectDatetimeColumnSafe(rows, columns);

  const targetColumn =
    options.targetColumn && options.targetColumn !== "auto"
      ? options.targetColumn
      : detectTargetColumnSafe(rows, columns, datetimeColumn);

  if (!datetimeColumn) {
    return createStructureErrorResult("날짜 컬럼을 찾지 못했습니다.", {
      columns,
      datetimeColumn: null,
      targetColumn
    });
  }

  const sortedRows = window.TSDateUtils.sortRowsByDate(rows, datetimeColumn);
  const frequency = window.TSDateUtils.detectFrequency(sortedRows, datetimeColumn);
  const duplicates = window.TSDateUtils.findDuplicateTimestamps(sortedRows, datetimeColumn);
  const missingTimestamps = window.TSDateUtils.findMissingTimestamps(
    sortedRows,
    datetimeColumn,
    frequency.code
  );

  const numericColumns = detectNumericColumnsSafe(sortedRows, columns);
  const categoricalColumns = columns.filter(column => !numericColumns.includes(column));

  const targetValues = targetColumn && window.TSMathUtils
    ? window.TSMathUtils.getColumnValues(sortedRows, targetColumn)
    : [];

  const numericSummary = targetColumn && window.TSMathUtils
    ? window.TSMathUtils.describe(targetValues)
    : null;

  const result = {
    type: "Structure",
    status: "done",

    columns,
    rowCount: sortedRows.length,
    columnCount: columns.length,

    datetimeColumn,
    targetColumn,
    numericColumns,
    categoricalColumns,

    frequency,

    dateStructure: {
      isSorted: window.TSDateUtils.isSortedByDate(rows, datetimeColumn),
      startDate: getStartDate(sortedRows, datetimeColumn),
      endDate: getEndDate(sortedRows, datetimeColumn),
      duplicateCount: duplicates.length,
      missingTimestampCount: missingTimestamps.length,
      isRegular: frequency.isRegular,
      confidence: frequency.confidence
    },

    duplicates,
    missingTimestamps,

    targetSummary: numericSummary,

    previewRows: sortedRows.slice(0, 10),

    messages: createStructureMessages({
      datetimeColumn,
      targetColumn,
      frequency,
      duplicates,
      missingTimestamps,
      numericSummary
    }),

    recommendation: createStructureRecommendation({
      frequency,
      duplicates,
      missingTimestamps,
      numericSummary
    }),

    outputRows: sortedRows
  };

  return result;
}

/* =========================================================
   2. Track 기반 Structure 분석
========================================================= */

function runStructureAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const track = window.TSStore.getTrack(trackId);
  if (!track) return null;

  const rows = track.data || [];

  const result = runStructureAnalysis(rows, {
    columns: params.columns || window.TSState?.dataset?.columns,
    datetimeColumn: params.datetimeColumn || "auto",
    targetColumn: params.targetColumn || "auto"
  });

  window.TSStore.commitTrackResult(trackId, {
    data: result.outputRows || rows,
    metadata: {
      datetimeColumn: result.datetimeColumn,
      targetColumn: result.targetColumn,
      frequency: result.frequency,
      structure: result
    },
    result
  });

  const stackItem = track.analysisStack
    .slice()
    .reverse()
    .find(item => item.analysisType === "Structure");

  if (stackItem) {
    if (result.status === "done") {
      window.TSStore.markStackItemDone(trackId, stackItem.id, createStructureShortSummary(result));
    } else {
      window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    }
  }

  return result;
}

/* =========================================================
   3. 자동 컬럼 탐지 보조
========================================================= */

function inferColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const columnSet = new Set();

  rows.forEach(row => {
    Object.keys(row).forEach(column => {
      if (!column.startsWith("__")) {
        columnSet.add(column);
      }
    });
  });

  return Array.from(columnSet);
}

function detectDatetimeColumnSafe(rows, columns) {
  if (window.TSDateUtils) {
    return window.TSDateUtils.detectDatetimeColumn(rows, columns);
  }

  return columns.find(column => {
    const lower = String(column).toLowerCase();
    return lower.includes("date") || lower.includes("time") || lower.includes("날짜");
  }) || null;
}

function detectTargetColumnSafe(rows, columns, datetimeColumn) {
  if (window.TSCSVUtils) {
    const numericColumns = window.TSCSVUtils.detectNumericColumns(rows, columns);
    return window.TSCSVUtils.detectTargetColumn(rows, columns, datetimeColumn, numericColumns);
  }

  return columns.find(column => column !== datetimeColumn) || null;
}

function detectNumericColumnsSafe(rows, columns) {
  if (window.TSCSVUtils) {
    return window.TSCSVUtils.detectNumericColumns(rows, columns);
  }

  return columns.filter(column => {
    const validCount = rows.filter(row => {
      const value = Number(row[column]);
      return Number.isFinite(value);
    }).length;

    return validCount / rows.length >= 0.6;
  });
}

/* =========================================================
   4. 날짜 범위 보조
========================================================= */

function getStartDate(rows, datetimeColumn) {
  if (!rows.length || !datetimeColumn) return null;

  return window.TSDateUtils.parseDateValue(rows[0][datetimeColumn]);
}

function getEndDate(rows, datetimeColumn) {
  if (!rows.length || !datetimeColumn) return null;

  return window.TSDateUtils.parseDateValue(rows[rows.length - 1][datetimeColumn]);
}

/* =========================================================
   5. 결과 메시지 생성
========================================================= */

function createStructureMessages({
  datetimeColumn,
  targetColumn,
  frequency,
  duplicates,
  missingTimestamps,
  numericSummary
}) {
  const messages = [];

  messages.push(`날짜 컬럼은 ${datetimeColumn}으로 인식되었습니다.`);

  if (targetColumn) {
    messages.push(`분석 대상 컬럼은 ${targetColumn}으로 인식되었습니다.`);
  } else {
    messages.push("분석 대상 숫자 컬럼을 찾지 못했습니다.");
  }

  if (frequency?.code) {
    messages.push(
      `시계열 주기는 ${frequency.label}(${frequency.code})로 추정됩니다.`
    );
  } else {
    messages.push("시계열 주기를 자동으로 판단하지 못했습니다.");
  }

  if (frequency && !frequency.isRegular) {
    messages.push("시간 간격이 불규칙합니다. Resampling 검토가 필요합니다.");
  }

  if (duplicates.length > 0) {
    messages.push(`중복 timestamp가 ${duplicates.length}개 발견되었습니다.`);
  }

  if (missingTimestamps.length > 0) {
    messages.push(`누락된 timestamp가 ${missingTimestamps.length}개 발견되었습니다.`);
  }

  if (numericSummary) {
    messages.push(
      `target 평균은 ${formatNumber(numericSummary.mean)}, 표준편차는 ${formatNumber(numericSummary.std)}입니다.`
    );
  }

  return messages;
}

/* =========================================================
   6. 추천 생성
========================================================= */

function createStructureRecommendation({
  frequency,
  duplicates,
  missingTimestamps,
  numericSummary
}) {
  const recommendation = [];

  if (duplicates.length > 0) {
    recommendation.push({
      nextStep: "Structure",
      priority: "high",
      message: "중복 timestamp가 있으므로 평균 또는 마지막 값 기준으로 병합하는 처리가 필요합니다."
    });
  }

  if (missingTimestamps.length > 0) {
    recommendation.push({
      nextStep: "Missing",
      priority: "high",
      message: "누락된 timestamp가 있으므로 결측 timestamp 생성 후 보간을 수행하는 것이 좋습니다."
    });
  }

  if (frequency && !frequency.isRegular) {
    recommendation.push({
      nextStep: "Resampling",
      priority: "high",
      message: "시간 간격이 불규칙하므로 동일한 주기로 resampling하는 것이 좋습니다."
    });
  }

  if (numericSummary && numericSummary.missingCount > 0) {
    recommendation.push({
      nextStep: "Missing",
      priority: "medium",
      message: "target 값에 결측치가 있으므로 LOCF, Linear Interpolation, Moving Average 보간을 검토하세요."
    });
  }

  if (numericSummary && numericSummary.std > 0) {
    recommendation.push({
      nextStep: "Outlier",
      priority: "medium",
      message: "수치형 데이터의 변동성이 있으므로 이상치 탐지를 함께 수행하는 것이 좋습니다."
    });
  }

  if (recommendation.length === 0) {
    recommendation.push({
      nextStep: "Forecast",
      priority: "normal",
      message: "기본 구조가 안정적이므로 예측 모델 설정으로 넘어갈 수 있습니다."
    });
  }

  return recommendation;
}

/* =========================================================
   7. 짧은 요약
========================================================= */

function createStructureShortSummary(result) {
  if (!result || result.status !== "done") {
    return "Structure 분석 실패";
  }

  const frequencyLabel = result.frequency?.code || "unknown";
  const missingCount = result.dateStructure?.missingTimestampCount || 0;
  const duplicateCount = result.dateStructure?.duplicateCount || 0;

  return `${result.rowCount} rows · ${result.datetimeColumn} / ${result.targetColumn} · ${frequencyLabel} · missing time ${missingCount} · duplicate ${duplicateCount}`;
}

/* =========================================================
   8. 에러 결과
========================================================= */

function createStructureErrorResult(message, extra = {}) {
  return {
    type: "Structure",
    status: "error",
    message,
    messages: [message],
    recommendation: [
      {
        nextStep: "Structure",
        priority: "high",
        message: "datetime column과 target column을 직접 선택해야 합니다."
      }
    ],
    ...extra
  };
}

/* =========================================================
   9. UI 표시용 결과 변환
========================================================= */

function createStructureResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Structure 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Structure Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Structure Summary</strong><br />
      Rows: ${result.rowCount}<br />
      Columns: ${result.columnCount}<br />
      Datetime: ${escapeHTML(result.datetimeColumn)}<br />
      Target: ${escapeHTML(result.targetColumn || "-")}<br />
      Frequency: ${escapeHTML(result.frequency?.label || "unknown")}<br />
      Regular: ${result.frequency?.isRegular ? "Yes" : "No"}<br />
      Missing Timestamp: ${result.dateStructure.missingTimestampCount}<br />
      Duplicate Timestamp: ${result.dateStructure.duplicateCount}
    </div>
  `;
}

/* =========================================================
   10. 유틸
========================================================= */

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toFixed(digits);
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

window.TSStructureAnalysis = {
  runStructureAnalysis,
  runStructureAnalysisOnTrack,

  inferColumns,
  detectDatetimeColumnSafe,
  detectTargetColumnSafe,
  detectNumericColumnsSafe,

  createStructureMessages,
  createStructureRecommendation,
  createStructureShortSummary,
  createStructureResultHTML
};