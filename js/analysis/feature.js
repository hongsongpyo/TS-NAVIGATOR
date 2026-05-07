/* =========================================================
   TS Navigator - feature.js
   ---------------------------------------------------------
   역할
   1. 시계열 Feature 생성
   2. Lag Feature 생성
   3. Rolling Mean / Rolling Std 생성
   4. 날짜 기반 Time Feature 생성
   5. 계절성 Feature 생성
   6. Feature Data Track 생성
========================================================= */

/* =========================================================
   1. Feature 분석 실행
========================================================= */

function runFeatureAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createFeatureErrorResult("Feature를 생성할 데이터가 없습니다.");
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
    return createFeatureErrorResult("target column을 찾지 못했습니다.");
  }

  const lagCount = Number(options.lagCount || 3);
  const rollingWindow = Number(options.rollingWindow || 3);
  const includeTimeFeatures = Boolean(options.includeTimeFeatures ?? true);
  const includeSeasonalFeatures = Boolean(options.includeSeasonalFeatures ?? true);

  let outputRows = cloneRows(rows);

  outputRows = addLagFeatures(outputRows, targetColumn, lagCount);
  outputRows = addRollingFeatures(outputRows, targetColumn, rollingWindow);

  if (includeTimeFeatures && datetimeColumn) {
    outputRows = addTimeFeatures(outputRows, datetimeColumn);
  }

  if (includeSeasonalFeatures && datetimeColumn) {
    outputRows = addSeasonalFeatures(outputRows, datetimeColumn);
  }

  const featureColumns = inferColumns(outputRows).filter(column => {
    return (
      column.startsWith(`${targetColumn}_lag_`) ||
      column.startsWith(`${targetColumn}_rolling_`) ||
      column.startsWith("time_") ||
      column.startsWith("season_")
    );
  });

  const result = {
    type: "Feature",
    status: "done",

    datetimeColumn,
    targetColumn,

    lagCount,
    rollingWindow,
    includeTimeFeatures,
    includeSeasonalFeatures,

    featureColumns,
    featureCount: featureColumns.length,
    outputRows,

    before: {
      rowCount: rows.length,
      columnCount: inferColumns(rows).length
    },

    after: {
      rowCount: outputRows.length,
      columnCount: inferColumns(outputRows).length
    },

    messages: createFeatureMessages({
      lagCount,
      rollingWindow,
      includeTimeFeatures,
      includeSeasonalFeatures,
      featureCount: featureColumns.length
    }),

    recommendation: createFeatureRecommendation({
      featureCount: featureColumns.length,
      lagCount,
      rollingWindow
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Feature 분석
========================================================= */

function runFeatureAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runFeatureAnalysis(sourceTrack.data || [], {
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
    markLatestFeatureStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createFeatureTrackName(sourceTrack, result),
    type: "Feature Data",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      feature: result,
      featureColumns: result.featureColumns,
      lastAnalysis: "Feature",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Feature", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      feature: result,
      featureColumns: result.featureColumns
    },
    result
  });

  markLatestFeatureStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. Lag Feature
========================================================= */

function addLagFeatures(rows, targetColumn, lagCount = 3) {
  const values = rows.map(row => toNumber(row[targetColumn]));

  return rows.map((row, index) => {
    const featureRow = { ...row };

    for (let lag = 1; lag <= lagCount; lag += 1) {
      const value = values[index - lag];
      featureRow[`${targetColumn}_lag_${lag}`] = Number.isFinite(value) ? value : "";
    }

    return featureRow;
  });
}

/* =========================================================
   4. Rolling Feature
========================================================= */

function addRollingFeatures(rows, targetColumn, rollingWindow = 3) {
  const values = rows.map(row => toNumber(row[targetColumn]));

  return rows.map((row, index) => {
    const start = Math.max(0, index - rollingWindow + 1);
    const localValues = values.slice(start, index + 1).filter(Number.isFinite);

    const rollingMean = localValues.length > 0 ? meanLocal(localValues) : NaN;
    const rollingStd = localValues.length > 1 ? standardDeviationLocal(localValues) : NaN;
    const rollingMin = localValues.length > 0 ? Math.min(...localValues) : NaN;
    const rollingMax = localValues.length > 0 ? Math.max(...localValues) : NaN;

    return {
      ...row,
      [`${targetColumn}_rolling_mean_${rollingWindow}`]: Number.isFinite(rollingMean) ? rollingMean : "",
      [`${targetColumn}_rolling_std_${rollingWindow}`]: Number.isFinite(rollingStd) ? rollingStd : "",
      [`${targetColumn}_rolling_min_${rollingWindow}`]: Number.isFinite(rollingMin) ? rollingMin : "",
      [`${targetColumn}_rolling_max_${rollingWindow}`]: Number.isFinite(rollingMax) ? rollingMax : ""
    };
  });
}

/* =========================================================
   5. Time Feature
========================================================= */

function addTimeFeatures(rows, datetimeColumn) {
  return rows.map(row => {
    const date = parseDate(row[datetimeColumn]);

    if (!date) {
      return {
        ...row,
        time_year: "",
        time_month: "",
        time_day: "",
        time_dayofweek: "",
        time_quarter: "",
        time_index: ""
      };
    }

    return {
      ...row,
      time_year: date.getFullYear(),
      time_month: date.getMonth() + 1,
      time_day: date.getDate(),
      time_dayofweek: date.getDay(),
      time_quarter: Math.floor(date.getMonth() / 3) + 1,
      time_index: date.getTime()
    };
  });
}

/* =========================================================
   6. Seasonal Feature
========================================================= */

function addSeasonalFeatures(rows, datetimeColumn) {
  return rows.map(row => {
    const date = parseDate(row[datetimeColumn]);

    if (!date) {
      return {
        ...row,
        season_month_sin: "",
        season_month_cos: "",
        season_dayofweek_sin: "",
        season_dayofweek_cos: ""
      };
    }

    const month = date.getMonth() + 1;
    const dayOfWeek = date.getDay();

    return {
      ...row,
      season_month_sin: Math.sin((2 * Math.PI * month) / 12),
      season_month_cos: Math.cos((2 * Math.PI * month) / 12),
      season_dayofweek_sin: Math.sin((2 * Math.PI * dayOfWeek) / 7),
      season_dayofweek_cos: Math.cos((2 * Math.PI * dayOfWeek) / 7)
    };
  });
}

/* =========================================================
   7. Feature Matrix 생성
========================================================= */

function createFeatureMatrix(rows, targetColumn, featureColumns = null) {
  const columns = featureColumns || inferFeatureColumns(rows, targetColumn);

  const X = rows.map(row => {
    return columns.map(column => toNumber(row[column]));
  });

  const y = rows.map(row => toNumber(row[targetColumn]));

  const validRows = [];

  X.forEach((features, index) => {
    const isFeatureValid = features.every(Number.isFinite);
    const isTargetValid = Number.isFinite(y[index]);

    if (isFeatureValid && isTargetValid) {
      validRows.push({
        index,
        X: features,
        y: y[index],
        row: rows[index]
      });
    }
  });

  return {
    featureColumns: columns,
    X: validRows.map(item => item.X),
    y: validRows.map(item => item.y),
    validRows
  };
}

function inferFeatureColumns(rows, targetColumn) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return inferColumns(rows).filter(column => {
    return (
      column !== targetColumn &&
      !column.startsWith("__") &&
      (
        column.includes("_lag_") ||
        column.includes("_rolling_") ||
        column.startsWith("time_") ||
        column.startsWith("season_")
      )
    );
  });
}

/* =========================================================
   8. 메시지 / 추천
========================================================= */

function createFeatureMessages({
  lagCount,
  rollingWindow,
  includeTimeFeatures,
  includeSeasonalFeatures,
  featureCount
}) {
  return [
    `Lag feature는 ${lagCount}개 생성되었습니다.`,
    `Rolling window는 ${rollingWindow}로 설정되었습니다.`,
    `Time feature는 ${includeTimeFeatures ? "포함" : "제외"}되었습니다.`,
    `Seasonal feature는 ${includeSeasonalFeatures ? "포함" : "제외"}되었습니다.`,
    `총 ${featureCount}개의 feature column이 생성되었습니다.`
  ];
}

function createFeatureRecommendation({ featureCount, lagCount, rollingWindow }) {
  const recommendation = [];

  if (featureCount === 0) {
    recommendation.push({
      nextStep: "Feature",
      priority: "high",
      message: "생성된 feature가 없습니다. lagCount와 rollingWindow 설정을 확인하세요."
    });

    return recommendation;
  }

  if (lagCount > 0) {
    recommendation.push({
      nextStep: "Forecast",
      priority: "normal",
      message: "Lag feature가 생성되었으므로 지도학습 기반 예측 모델과 연결할 수 있습니다."
    });
  }

  if (rollingWindow > 1) {
    recommendation.push({
      nextStep: "Compare",
      priority: "normal",
      message: "Rolling feature가 생성되었으므로 원본과 feature 기반 예측 결과를 비교하세요."
    });
  }

  return recommendation;
}

/* =========================================================
   9. Track / Stack 보조
========================================================= */

function createFeatureTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Feature ${result.featureCount}`;
}

function markLatestFeatureStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Feature");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createFeatureShortSummary(result)
  );
}

function createFeatureShortSummary(result) {
  if (!result || result.status !== "done") return "Feature 생성 실패";

  return `features ${result.featureCount} · lag ${result.lagCount} · rolling ${result.rollingWindow}`;
}

/* =========================================================
   10. UI 표시용 HTML
========================================================= */

function createFeatureResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Feature 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Feature Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Feature Summary</strong><br />
      Feature Count: ${result.featureCount}<br />
      Lag Count: ${result.lagCount}<br />
      Rolling Window: ${result.rollingWindow}<br />
      Time Feature: ${result.includeTimeFeatures ? "Yes" : "No"}<br />
      Seasonal Feature: ${result.includeSeasonalFeatures ? "Yes" : "No"}
    </div>
  `;
}

/* =========================================================
   11. Error
========================================================= */

function createFeatureErrorResult(message, extra = {}) {
  return {
    type: "Feature",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Structure",
        priority: "high",
        message: "Feature 생성에 필요한 datetime column과 target column을 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   12. 보조 함수
========================================================= */

function cloneRows(rows) {
  return rows.map(row => ({ ...row }));
}

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

function parseDate(value) {
  if (window.TSDateUtils) {
    return window.TSDateUtils.parseDateValue(value);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function standardDeviationLocal(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length <= 1) return NaN;

  const avg = meanLocal(clean);

  const variance =
    clean.reduce((acc, value) => acc + Math.pow(value - avg, 2), 0) /
    (clean.length - 1);

  return Math.sqrt(variance);
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

window.TSFeatureAnalysis = {
  runFeatureAnalysis,
  runFeatureAnalysisOnTrack,

  addLagFeatures,
  addRollingFeatures,
  addTimeFeatures,
  addSeasonalFeatures,

  createFeatureMatrix,
  inferFeatureColumns,

  createFeatureMessages,
  createFeatureRecommendation,
  createFeatureShortSummary,
  createFeatureResultHTML
};