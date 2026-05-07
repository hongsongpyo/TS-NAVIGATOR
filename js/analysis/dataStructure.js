/* =========================================================
   TS Navigator - dataStructure.js
   데이터 구조 확인 / datetime, target, frequency 자동 처리
   ========================================================= */

/* =========================================================
   전체 데이터 구조 분석
   ========================================================= */

function analyzeDataStructure({
  rows = [],
  columns = [],
  datetimeColumn = null,
  targetColumn = null,
}) {
  const columnTypes = TSCSVUtils.inferColumnTypes(rows, columns);

  const detectedDatetimeColumn =
    datetimeColumn || TSCSVUtils.guessDatetimeColumn(columns, columnTypes);

  const detectedTargetColumn =
    targetColumn ||
    TSCSVUtils.guessTargetColumn(columns, columnTypes, detectedDatetimeColumn);

  const sortedRows = detectedDatetimeColumn
    ? TSDateUtils.sortRowsByDatetime(rows, detectedDatetimeColumn)
    : [...rows];

  const datetimeReport = analyzeDatetimeColumn(
    sortedRows,
    detectedDatetimeColumn
  );

  const targetReport = analyzeTargetColumn(
    sortedRows,
    detectedTargetColumn
  );

  const frequencyReport = detectFrequencyFromRows(
    sortedRows,
    detectedDatetimeColumn
  );

  const missingReport = analyzeMissingValues(
    sortedRows,
    columns
  );

  const duplicateReport = analyzeDuplicateTimestamps(
    sortedRows,
    detectedDatetimeColumn
  );

  const recommendation = createDataStructureRecommendation({
    datetimeReport,
    targetReport,
    frequencyReport,
    missingReport,
    duplicateReport,
  });

  return {
    columnTypes,
    datetimeColumn: detectedDatetimeColumn,
    targetColumn: detectedTargetColumn,
    rowCount: rows.length,
    columnCount: columns.length,
    datetimeReport,
    targetReport,
    frequencyReport,
    missingReport,
    duplicateReport,
    recommendation,
  };
}

/* =========================================================
   Datetime Column 분석
   ========================================================= */

function analyzeDatetimeColumn(rows = [], datetimeColumn = null) {
  if (!datetimeColumn) {
    return {
      column: null,
      valid: false,
      validCount: 0,
      invalidCount: rows.length,
      startDate: null,
      endDate: null,
      message: "datetime column을 찾지 못했습니다.",
    };
  }

  const dates = rows.map((row) => TSDateUtils.toDate(row[datetimeColumn]));

  const validDates = dates.filter(Boolean);
  const invalidCount = dates.length - validDates.length;

  const startDate = TSDateUtils.getMinDate(validDates);
  const endDate = TSDateUtils.getMaxDate(validDates);

  return {
    column: datetimeColumn,
    valid: validDates.length > 0 && invalidCount === 0,
    validCount: validDates.length,
    invalidCount,
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    message:
      invalidCount === 0
        ? "datetime column이 정상적으로 인식되었습니다."
        : "일부 datetime 값이 올바르게 인식되지 않았습니다.",
  };
}

/* =========================================================
   Target Column 분석
   ========================================================= */

function analyzeTargetColumn(rows = [], targetColumn = null) {
  if (!targetColumn) {
    return {
      column: null,
      valid: false,
      validCount: 0,
      invalidCount: rows.length,
      missingCount: rows.length,
      min: null,
      max: null,
      mean: null,
      message: "target column을 찾지 못했습니다.",
    };
  }

  const values = rows.map((row) => TSMathUtils.toNumber(row[targetColumn]));

  const validValues = values.filter((value) => value !== null);
  const missingCount = values.filter((value) => value === null).length;

  return {
    column: targetColumn,
    valid: validValues.length > 0,
    validCount: validValues.length,
    invalidCount: missingCount,
    missingCount,
    min: TSMathUtils.min(validValues),
    max: TSMathUtils.max(validValues),
    mean: TSMathUtils.mean(validValues),
    standardDeviation: TSMathUtils.standardDeviation(validValues, false),
    message:
      validValues.length > 0
        ? "target column이 수치형 변수로 인식되었습니다."
        : "target column이 수치형으로 인식되지 않았습니다.",
  };
}

/* =========================================================
   Frequency 탐지
   ========================================================= */

function detectFrequencyFromRows(rows = [], datetimeColumn = null) {
  if (!datetimeColumn) {
    return {
      label: "unknown",
      milliseconds: null,
      regular: false,
      gapCount: 0,
      message: "datetime column이 없어 frequency를 탐지할 수 없습니다.",
    };
  }

  const dateValues = rows
    .map((row) => row[datetimeColumn])
    .filter((value) => value !== null && value !== undefined);

  const frequency = TSDateUtils.inferFrequency(dateValues);

  const gapReport = analyzeTimeGaps(dateValues, frequency.milliseconds);

  return {
    ...frequency,
    regular: gapReport.gapCount === 0,
    gapCount: gapReport.gapCount,
    gaps: gapReport.gaps,
    message:
      frequency.label === "unknown"
        ? "frequency를 탐지하지 못했습니다."
        : `${TSDateUtils.frequencyToText(frequency.label)} 단위 시계열로 추정됩니다.`,
  };
}

function analyzeTimeGaps(dateValues = [], expectedMilliseconds = null) {
  const dates = TSDateUtils.sortDates(dateValues);

  if (!expectedMilliseconds || dates.length < 2) {
    return {
      gapCount: 0,
      gaps: [],
    };
  }

  const gaps = [];

  for (let i = 1; i < dates.length; i += 1) {
    const diff = dates[i].getTime() - dates[i - 1].getTime();

    if (diff > expectedMilliseconds * 1.5) {
      gaps.push({
        from: dates[i - 1].toISOString(),
        to: dates[i].toISOString(),
        diffMilliseconds: diff,
      });
    }
  }

  return {
    gapCount: gaps.length,
    gaps,
  };
}

/* =========================================================
   결측치 분석
   ========================================================= */

function analyzeMissingValues(rows = [], columns = []) {
  const byColumn = {};

  columns.forEach((column) => {
    const missingCount = rows.filter((row) => {
      const value = row[column];

      return value === null || value === undefined || value === "";
    }).length;

    byColumn[column] = {
      missingCount,
      missingRatio: rows.length > 0 ? missingCount / rows.length : 0,
    };
  });

  const totalMissingCount = Object.values(byColumn).reduce(
    (total, item) => total + item.missingCount,
    0
  );

  return {
    totalMissingCount,
    byColumn,
    hasMissing: totalMissingCount > 0,
  };
}

/* =========================================================
   중복 Timestamp 분석
   ========================================================= */

function analyzeDuplicateTimestamps(rows = [], datetimeColumn = null) {
  if (!datetimeColumn) {
    return {
      duplicateCount: 0,
      duplicates: [],
      hasDuplicate: false,
    };
  }

  const countMap = {};

  rows.forEach((row) => {
    const iso = TSDateUtils.toISOStringSafe(row[datetimeColumn]);

    if (!iso) return;

    countMap[iso] = (countMap[iso] || 0) + 1;
  });

  const duplicates = Object.entries(countMap)
    .filter(([, count]) => count > 1)
    .map(([timestamp, count]) => ({
      timestamp,
      count,
    }));

  return {
    duplicateCount: duplicates.reduce(
      (total, item) => total + item.count - 1,
      0
    ),
    duplicates,
    hasDuplicate: duplicates.length > 0,
  };
}

/* =========================================================
   데이터 구조 정리
   ========================================================= */

function normalizeDataStructure({
  rows = [],
  datetimeColumn,
  targetColumn,
}) {
  const cleanedRows = rows
    .map((row) => {
      const datetime = TSDateUtils.toISOStringSafe(row[datetimeColumn]);
      const value = TSMathUtils.toNumber(row[targetColumn]);

      return {
        ...row,
        [datetimeColumn]: datetime,
        [targetColumn]: value,
      };
    })
    .filter((row) => row[datetimeColumn] !== null)
    .sort((a, b) => {
      return (
        new Date(a[datetimeColumn]).getTime() -
        new Date(b[datetimeColumn]).getTime()
      );
    });

  return cleanedRows;
}

function createTimeSeriesFromStructure({
  rows = [],
  datetimeColumn,
  targetColumn,
}) {
  const normalizedRows = normalizeDataStructure({
    rows,
    datetimeColumn,
    targetColumn,
  });

  const series = TSCSVUtils.rowsToTimeSeries(
    normalizedRows,
    datetimeColumn,
    targetColumn
  );

  const { x, y } = TSCSVUtils.timeSeriesToXY(series);

  return {
    rows: normalizedRows,
    series,
    x,
    y,
  };
}

/* =========================================================
   자동 추천 문구
   ========================================================= */

function createDataStructureRecommendation({
  datetimeReport,
  targetReport,
  frequencyReport,
  missingReport,
  duplicateReport,
}) {
  const recommendations = [];

  if (!datetimeReport.valid) {
    recommendations.push({
      type: "datetime",
      level: "warning",
      title: "Datetime Column 확인 필요",
      message:
        "시간 인덱스가 정확하지 않으면 리샘플링, 예측, 검증이 불안정해질 수 있습니다.",
    });
  }

  if (!targetReport.valid) {
    recommendations.push({
      type: "target",
      level: "warning",
      title: "Target Column 확인 필요",
      message:
        "예측 대상 변수는 수치형이어야 하므로 target column을 다시 선택해야 합니다.",
    });
  }

  if (frequencyReport.label === "unknown") {
    recommendations.push({
      type: "frequency",
      level: "warning",
      title: "Frequency 자동 탐지 실패",
      message:
        "시계열 간격이 불규칙할 수 있으므로 리샘플링 기준을 직접 선택하는 것이 좋습니다.",
    });
  }

  if (frequencyReport.gapCount > 0) {
    recommendations.push({
      type: "missing-timestamp",
      level: "info",
      title: "Missing Timestamp 존재",
      message:
        "시간 간격 중 비어 있는 구간이 있어 missing timestamp 생성 후 결측치 처리를 권장합니다.",
    });
  }

  if (missingReport.hasMissing) {
    recommendations.push({
      type: "missing-value",
      level: "info",
      title: "결측치 처리 필요",
      message:
        "LOCF, NOCB, 선형보간, 이동평균 보간 중 데이터 특성에 맞는 방법을 선택할 수 있습니다.",
    });
  }

  if (duplicateReport.hasDuplicate) {
    recommendations.push({
      type: "duplicate",
      level: "info",
      title: "중복 Timestamp 처리 필요",
      message:
        "같은 시점에 여러 값이 존재하므로 평균 처리 또는 첫 번째 값 유지 방식이 필요합니다.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: "ready",
      level: "success",
      title: "데이터 구조 정상",
      message:
        "datetime, target, frequency가 정상적으로 인식되어 바로 분석을 진행할 수 있습니다.",
    });
  }

  return recommendations;
}

/* =========================================================
   원본 데이터 Track 생성
   ========================================================= */

function createOriginalTrackFromDataset(dataset) {
  const structure = analyzeDataStructure({
    rows: dataset.rows,
    columns: dataset.columns,
    datetimeColumn: dataset.datetimeColumn,
    targetColumn: dataset.targetColumn,
  });

  const timeSeries = createTimeSeriesFromStructure({
    rows: dataset.rows,
    datetimeColumn: structure.datetimeColumn,
    targetColumn: structure.targetColumn,
  });

  const track = TSStore.createTrack({
    name: "Original Data",
    type: "Original Data",
    data: timeSeries.series,
    x: timeSeries.x,
    y: timeSeries.y,
    color: "#2f80ed",
    regionId: "region-1",
    metadata: {
      structure,
      datetimeColumn: structure.datetimeColumn,
      targetColumn: structure.targetColumn,
      frequency: structure.frequencyReport.label,
    },
  });

  TSStore.setUploadedData({
    ...dataset,
    datetimeColumn: structure.datetimeColumn,
    targetColumn: structure.targetColumn,
    frequency: structure.frequencyReport.label,
    summary: {
      rowCount: structure.rowCount,
      columnCount: structure.columnCount,
      missingCount: structure.missingReport.totalMissingCount,
      duplicateTimestampCount: structure.duplicateReport.duplicateCount,
      startDate: structure.datetimeReport.startDate,
      endDate: structure.datetimeReport.endDate,
    },
  });

  return {
    track,
    structure,
    timeSeries,
  };
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSDataStructure = {
  analyzeDataStructure,

  analyzeDatetimeColumn,
  analyzeTargetColumn,

  detectFrequencyFromRows,
  analyzeTimeGaps,

  analyzeMissingValues,
  analyzeDuplicateTimestamps,

  normalizeDataStructure,
  createTimeSeriesFromStructure,

  createDataStructureRecommendation,
  createOriginalTrackFromDataset,
};