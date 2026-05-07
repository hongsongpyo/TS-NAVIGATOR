/* =========================================================
   TS Navigator - validation.js
   ---------------------------------------------------------
   역할
   1. 시계열 예측 검증 데이터 분리
   2. Train/Test Split
   3. Rolling Validation
   4. Expanding Validation
   5. Forecast / Metrics 단계에서 재사용할 검증 구조 생성
========================================================= */

/* =========================================================
   1. Validation 분석 실행
========================================================= */

function runValidationAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createValidationErrorResult("Validation할 데이터가 없습니다.");
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
    return createValidationErrorResult("target column을 찾지 못했습니다.");
  }

  const method = options.method || "train-test-split";
  const testSize = Number(options.testSize || 0.2);
  const rollingWindow = Number(options.rollingWindow || 12);
  const horizon = Number(options.horizon || 1);

  const sortedRows = datetimeColumn && window.TSDateUtils
    ? window.TSDateUtils.sortRowsByDate(rows, datetimeColumn)
    : [...rows];

  let validation = null;

  if (method === "rolling") {
    validation = createRollingValidation(sortedRows, {
      targetColumn,
      rollingWindow,
      horizon
    });
  } else if (method === "expanding") {
    validation = createExpandingValidation(sortedRows, {
      targetColumn,
      initialWindow: rollingWindow,
      horizon
    });
  } else {
    validation = createTrainTestSplit(sortedRows, {
      targetColumn,
      testSize
    });
  }

  const outputRows = markValidationRows(sortedRows, validation);

  const result = {
    type: "Validation",
    status: "done",

    method,
    testSize,
    rollingWindow,
    horizon,

    datetimeColumn,
    targetColumn,

    validation,
    outputRows,

    before: {
      rowCount: rows.length
    },

    after: {
      trainCount: validation.trainRows?.length || 0,
      testCount: validation.testRows?.length || 0,
      foldCount: validation.folds?.length || 0
    },

    messages: createValidationMessages({
      method,
      validation
    }),

    recommendation: createValidationRecommendation({
      method,
      validation
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Validation 분석
========================================================= */

function runValidationAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runValidationAnalysis(sourceTrack.data || [], {
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
    markLatestValidationStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createValidationTrackName(sourceTrack, result),
    type: "Evaluation Result",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      validation: result.validation,
      validationResult: result,
      lastAnalysis: "Validation",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Validation", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      validation: result.validation,
      validationResult: result
    },
    result
  });

  markLatestValidationStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. Train / Test Split
========================================================= */

function createTrainTestSplit(rows, options = {}) {
  const testSize = Number(options.testSize || 0.2);
  const n = rows.length;

  let testCount = Math.round(n * testSize);

  if (testSize >= 1) {
    testCount = Math.round(testSize);
  }

  testCount = Math.max(1, Math.min(n - 1, testCount));

  const splitIndex = n - testCount;

  const trainRows = rows.slice(0, splitIndex);
  const testRows = rows.slice(splitIndex);

  return {
    type: "train-test-split",
    splitIndex,
    trainRows,
    testRows,
    folds: [
      {
        foldIndex: 0,
        trainStart: 0,
        trainEnd: splitIndex - 1,
        testStart: splitIndex,
        testEnd: n - 1,
        trainRows,
        testRows
      }
    ]
  };
}

/* =========================================================
   4. Rolling Validation
========================================================= */

function createRollingValidation(rows, options = {}) {
  const rollingWindow = Number(options.rollingWindow || 12);
  const horizon = Number(options.horizon || 1);
  const n = rows.length;

  const folds = [];

  for (let start = 0; start + rollingWindow + horizon <= n; start += horizon) {
    const trainStart = start;
    const trainEnd = start + rollingWindow - 1;
    const testStart = trainEnd + 1;
    const testEnd = testStart + horizon - 1;

    folds.push({
      foldIndex: folds.length,
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      trainRows: rows.slice(trainStart, trainEnd + 1),
      testRows: rows.slice(testStart, testEnd + 1)
    });
  }

  const firstFold = folds[0] || null;
  const lastFold = folds[folds.length - 1] || null;

  return {
    type: "rolling",
    rollingWindow,
    horizon,
    trainRows: firstFold?.trainRows || [],
    testRows: lastFold?.testRows || [],
    folds
  };
}

/* =========================================================
   5. Expanding Validation
========================================================= */

function createExpandingValidation(rows, options = {}) {
  const initialWindow = Number(options.initialWindow || 12);
  const horizon = Number(options.horizon || 1);
  const n = rows.length;

  const folds = [];

  for (let trainEnd = initialWindow - 1; trainEnd + horizon < n; trainEnd += horizon) {
    const trainStart = 0;
    const testStart = trainEnd + 1;
    const testEnd = Math.min(testStart + horizon - 1, n - 1);

    folds.push({
      foldIndex: folds.length,
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      trainRows: rows.slice(trainStart, trainEnd + 1),
      testRows: rows.slice(testStart, testEnd + 1)
    });
  }

  const firstFold = folds[0] || null;
  const lastFold = folds[folds.length - 1] || null;

  return {
    type: "expanding",
    initialWindow,
    horizon,
    trainRows: firstFold?.trainRows || [],
    testRows: lastFold?.testRows || [],
    folds
  };
}

/* =========================================================
   6. Row에 Validation 구간 표시
========================================================= */

function markValidationRows(rows, validation) {
  if (!validation) return rows.map(row => ({ ...row }));

  const outputRows = rows.map((row, index) => ({
    ...row,
    __validationRole: "unused",
    __validationFold: ""
  }));

  if (validation.type === "train-test-split") {
    outputRows.forEach((row, index) => {
      row.__validationRole =
        index < validation.splitIndex ? "train" : "test";
      row.__validationFold = 0;
    });

    return outputRows;
  }

  validation.folds.forEach(fold => {
    for (let i = fold.trainStart; i <= fold.trainEnd; i += 1) {
      if (!outputRows[i]) continue;
      outputRows[i].__validationRole = "train";
      outputRows[i].__validationFold = fold.foldIndex;
    }

    for (let i = fold.testStart; i <= fold.testEnd; i += 1) {
      if (!outputRows[i]) continue;
      outputRows[i].__validationRole = "test";
      outputRows[i].__validationFold = fold.foldIndex;
    }
  });

  return outputRows;
}

/* =========================================================
   7. Forecast 평가용 데이터 생성
========================================================= */

function createValidationDatasetForForecast(rows, options = {}) {
  const validation = runValidationAnalysis(rows, options);

  if (validation.status === "error") {
    return validation;
  }

  return {
    status: "done",
    validation: validation.validation,
    trainRows: validation.validation.trainRows,
    testRows: validation.validation.testRows,
    folds: validation.validation.folds,
    targetColumn: validation.targetColumn,
    datetimeColumn: validation.datetimeColumn
  };
}

function getLastFold(validation) {
  if (!validation?.folds || validation.folds.length === 0) return null;

  return validation.folds[validation.folds.length - 1];
}

function getValidationActualValues(validation, targetColumn) {
  if (!validation || !targetColumn) return [];

  const testRows = validation.testRows || getLastFold(validation)?.testRows || [];

  return testRows.map(row => toNumber(row[targetColumn]));
}

/* =========================================================
   8. 메시지 / 추천
========================================================= */

function createValidationMessages({ method, validation }) {
  if (!validation) {
    return ["Validation 결과가 없습니다."];
  }

  if (method === "train-test-split") {
    return [
      "Train/Test Split 검증을 수행했습니다.",
      `Train rows: ${validation.trainRows.length}`,
      `Test rows: ${validation.testRows.length}`,
      `Split index: ${validation.splitIndex}`
    ];
  }

  return [
    `${method} validation을 수행했습니다.`,
    `Fold count: ${validation.folds.length}`,
    `Initial train rows: ${validation.trainRows.length}`,
    `Last test rows: ${validation.testRows.length}`
  ];
}

function createValidationRecommendation({ method, validation }) {
  const recommendation = [];

  if (!validation || validation.testRows?.length === 0) {
    recommendation.push({
      nextStep: "Validation",
      priority: "high",
      message: "검증용 test 구간이 부족합니다. testSize 또는 rollingWindow를 조정하세요."
    });

    return recommendation;
  }

  if (method === "train-test-split") {
    recommendation.push({
      nextStep: "Forecast",
      priority: "normal",
      message: "Train/Test 구간이 설정되었으므로 예측 모델을 학습하고 test 구간 성능을 평가하세요."
    });
  } else {
    recommendation.push({
      nextStep: "Metrics",
      priority: "normal",
      message: "여러 fold의 예측 성능을 평균하여 모델 안정성을 확인하세요."
    });
  }

  recommendation.push({
    nextStep: "Compare",
    priority: "normal",
    message: "검증 방식별 결과를 Compare에서 비교하면 예측 안정성을 판단하기 쉽습니다."
  });

  return recommendation;
}

/* =========================================================
   9. Track / Stack 보조
========================================================= */

function createValidationTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Validation ${result.method}`;
}

function markLatestValidationStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Validation");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createValidationShortSummary(result)
  );
}

function createValidationShortSummary(result) {
  if (!result || result.status !== "done") return "Validation 실패";

  return `${result.method} · train ${result.after.trainCount} · test ${result.after.testCount} · folds ${result.after.foldCount}`;
}

/* =========================================================
   10. UI 표시용 HTML
========================================================= */

function createValidationResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Validation 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Validation Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Validation Summary</strong><br />
      Method: ${escapeHTML(result.method)}<br />
      Train: ${result.after.trainCount}<br />
      Test: ${result.after.testCount}<br />
      Folds: ${result.after.foldCount}<br />
      Horizon: ${result.horizon}
    </div>
  `;
}

/* =========================================================
   11. Error
========================================================= */

function createValidationErrorResult(message, extra = {}) {
  return {
    type: "Validation",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Validation",
        priority: "high",
        message: "Validation에 필요한 target column과 충분한 데이터 길이를 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   12. 보조 함수
========================================================= */

function inferColumns(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return Object.keys(rows[0]).filter(column => !column.startsWith("__"));
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

function toNumber(value) {
  if (window.TSMathUtils) return window.TSMathUtils.toNumber(value);

  if (value === null || value === undefined || value === "") return NaN;

  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : NaN;
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
   13. 외부 접근용 객체
========================================================= */

window.TSValidationAnalysis = {
  runValidationAnalysis,
  runValidationAnalysisOnTrack,

  createTrainTestSplit,
  createRollingValidation,
  createExpandingValidation,
  markValidationRows,

  createValidationDatasetForForecast,
  getLastFold,
  getValidationActualValues,

  createValidationMessages,
  createValidationRecommendation,
  createValidationShortSummary,
  createValidationResultHTML
};