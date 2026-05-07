/* =========================================================
   TS Navigator - autoAnalysis.js
   ---------------------------------------------------------
   역할
   1. Structure → Missing → Outlier → Resampling → Stationarity
      → Forecast → Metrics → Residual 순서 자동 실행
   2. 데이터 상태에 따라 필요한 단계만 선택 실행
   3. 여러 Forecast 후보 중 가장 좋은 모델 선택
   4. Auto Analysis Result Track 생성
   5. 검증 결과 + 예측 + 평가지표를 한 번에 저장
========================================================= */

/* =========================================================
   1. Auto Analysis 실행
========================================================= */

function runAutoAnalysis(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return createAutoAnalysisErrorResult("자동 분석할 데이터가 없습니다.");
  }

  const horizon = Math.max(1, Number(options.horizon || 12));
  const modelSelection = options.modelSelection || "auto";

  const steps = [];
  let workingRows = cloneRows(rows);

  const structureResult = runAutoStep("Structure", () => {
    if (!window.TSStructureAnalysis) return null;

    return window.TSStructureAnalysis.runStructureAnalysis(workingRows, {
      datetimeColumn: options.datetimeColumn || "auto",
      targetColumn: options.targetColumn || "auto"
    });
  });

  steps.push(structureResult.step);

  if (structureResult.result?.status === "error") {
    return createAutoAnalysisErrorResult("Structure 분석 실패로 자동 분석을 중단했습니다.", {
      steps
    });
  }

  const datetimeColumn = structureResult.result.datetimeColumn;
  const targetColumn = structureResult.result.targetColumn;
  const frequency = structureResult.result.frequency;

  if (structureResult.result.outputRows) {
    workingRows = structureResult.result.outputRows;
  }

  const needMissing =
    Boolean(options.runMissing ?? true) &&
    shouldRunMissing(structureResult.result, workingRows, targetColumn);

  if (needMissing && window.TSMissingAnalysis) {
    const missingResult = runAutoStep("Missing", () => {
      return window.TSMissingAnalysis.runMissingAnalysis(workingRows, {
        method: options.missingMethod || "linear",
        windowSize: options.missingWindowSize || 3,
        datetimeColumn,
        targetColumn,
        frequency,
        createMissingTimestamp: true
      });
    });

    steps.push(missingResult.step);

    if (missingResult.result?.status === "done") {
      workingRows = missingResult.result.outputRows;
    }
  }

  const needOutlier = Boolean(options.runOutlier ?? true);

  if (needOutlier && window.TSOutlierAnalysis) {
    const outlierResult = runAutoStep("Outlier", () => {
      return window.TSOutlierAnalysis.runOutlierAnalysis(workingRows, {
        method: options.outlierMethod || "hampel",
        threshold: options.outlierThreshold || 3,
        windowSize: options.outlierWindowSize || 7,
        replaceWith: options.outlierReplaceWith || "linear-interpolation",
        datetimeColumn,
        targetColumn
      });
    });

    steps.push(outlierResult.step);

    if (outlierResult.result?.status === "done") {
      workingRows = outlierResult.result.outputRows;
    }
  }

  const needResampling =
    Boolean(options.runResampling ?? true) &&
    frequency &&
    frequency.isRegular === false;

  if (needResampling && window.TSResamplingAnalysis) {
    const resamplingResult = runAutoStep("Resampling", () => {
      return window.TSResamplingAnalysis.runResamplingAnalysis(workingRows, {
        frequency: options.frequency || frequency.code || "D",
        method: options.resamplingMethod || "asfreq",
        fillMethod: options.resamplingFillMethod || "interpolate",
        datetimeColumn,
        targetColumn
      });
    });

    steps.push(resamplingResult.step);

    if (resamplingResult.result?.status === "done") {
      workingRows = resamplingResult.result.outputRows;
    }
  }

  let stationarityResult = null;

  if (Boolean(options.runStationarity ?? true) && window.TSStationarityAnalysis) {
    const stationarityStep = runAutoStep("Stationarity", () => {
      return window.TSStationarityAnalysis.runStationarityAnalysis(workingRows, {
        test: "ADF",
        alpha: 0.05,
        transform: options.stationarityTransform || "none",
        differencingOrder: options.differencingOrder || 1,
        rollingWindow: options.rollingWindow || 12,
        datetimeColumn,
        targetColumn
      });
    });

    steps.push(stationarityStep.step);
    stationarityResult = stationarityStep.result;
  }

  const modelCandidates = selectForecastModelCandidates({
    modelSelection,
    stationarityResult,
    frequency,
    rows: workingRows,
    targetColumn
  });

  const forecastEvaluations = evaluateForecastCandidates(workingRows, {
    candidates: modelCandidates,
    horizon,
    datetimeColumn,
    targetColumn,
    frequency
  });

  if (forecastEvaluations.length === 0) {
    return createAutoAnalysisErrorResult("Forecast 후보 모델을 평가하지 못했습니다.", {
      steps
    });
  }

  const bestEvaluation = selectBestForecastEvaluation(forecastEvaluations);

  steps.push({
    name: "Forecast",
    status: bestEvaluation.forecastResult?.status || "done",
    summary: `${bestEvaluation.model} selected`,
    result: bestEvaluation.forecastResult
  });

  steps.push({
    name: "Metrics",
    status: bestEvaluation.metricsResult?.status || "done",
    summary: createMetricSummary(bestEvaluation.metricsResult?.metrics),
    result: bestEvaluation.metricsResult
  });

  let residualResult = null;

  if (Boolean(options.runResidual ?? true) && window.TSResidualAnalysis) {
    const residualStep = runAutoStep("Residual", () => {
      return window.TSResidualAnalysis.runResidualAnalysis(workingRows, {
        predicted: bestEvaluation.forecastResult.fitted,
        lag: options.residualLag || 12,
        whiteNoiseTest: "ljung-box",
        datetimeColumn,
        targetColumn
      });
    });

    steps.push(residualStep.step);
    residualResult = residualStep.result;
  }

  const result = {
    type: "Auto Analysis",
    status: "done",

    modelSelection,
    horizon,

    datetimeColumn,
    targetColumn,
    frequency,

    steps,

    selectedModel: bestEvaluation.model,
    forecast: bestEvaluation.forecastResult.forecast,
    forecastDates: bestEvaluation.forecastResult.forecastDates,
    fitted: bestEvaluation.forecastResult.fitted,
    lower: bestEvaluation.forecastResult.lower,
    upper: bestEvaluation.forecastResult.upper,

    metrics: bestEvaluation.metricsResult.metrics,
    allModelEvaluations: forecastEvaluations,

    residual: residualResult,
    residuals: residualResult?.residuals || [],

    outputRows: workingRows,

    messages: createAutoAnalysisMessages({
      steps,
      selectedModel: bestEvaluation.model,
      metrics: bestEvaluation.metricsResult.metrics,
      horizon
    }),

    recommendation: createAutoAnalysisRecommendation({
      bestEvaluation,
      residualResult
    })
  };

  return result;
}

/* =========================================================
   2. Track 기반 Auto Analysis
========================================================= */

function runAutoAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runAutoAnalysis(sourceTrack.data || [], {
    ...params,
    datetimeColumn:
      params.datetimeColumn ||
      sourceTrack.metadata?.datetimeColumn ||
      window.TSState?.dataset?.datetimeColumn ||
      "auto",
    targetColumn:
      params.targetColumn ||
      sourceTrack.metadata?.targetColumn ||
      window.TSState?.dataset?.targetColumn ||
      "auto"
  });

  if (result.status === "error") {
    markLatestAutoAnalysisStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createAutoAnalysisTrackName(sourceTrack, result),
    type: "Auto Analysis Result",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      datetimeColumn: result.datetimeColumn,
      targetColumn: result.targetColumn,
      frequency: result.frequency,
      forecast: result.forecast,
      forecastDates: result.forecastDates,
      fitted: result.fitted,
      predictionLower: result.lower,
      predictionUpper: result.upper,
      metrics: result.metrics,
      residuals: result.residuals,
      autoAnalysis: result,
      model: result.selectedModel,
      horizon: result.horizon,
      lastAnalysis: "Auto Analysis",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Auto Analysis", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metrics: result.metrics,
    residuals: result.residuals,
    metadata: {
      ...newTrack.metadata,
      autoAnalysis: result
    },
    result
  });

  markLatestAutoAnalysisStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. 자동 단계 실행 Wrapper
========================================================= */

function runAutoStep(name, runner) {
  try {
    const result = runner();

    if (!result) {
      return {
        step: {
          name,
          status: "skipped",
          summary: `${name} module not available`,
          result: null
        },
        result: null
      };
    }

    return {
      step: {
        name,
        status: result.status || "done",
        summary: createStepSummary(name, result),
        result
      },
      result
    };
  } catch (error) {
    return {
      step: {
        name,
        status: "error",
        summary: error.message,
        result: null
      },
      result: {
        type: name,
        status: "error",
        message: error.message
      }
    };
  }
}

function createStepSummary(name, result) {
  if (!result) return `${name} skipped`;

  if (result.status === "error") {
    return result.message || `${name} error`;
  }

  if (name === "Structure") {
    return `${result.rowCount} rows · ${result.datetimeColumn}/${result.targetColumn}`;
  }

  if (name === "Missing") {
    return `filled ${result.after?.filledCount || 0}`;
  }

  if (name === "Outlier") {
    return `outliers ${result.before?.outlierCount || 0}`;
  }

  if (name === "Resampling") {
    return `${result.frequency} · rows ${result.before?.rowCount}→${result.after?.rowCount}`;
  }

  if (name === "Stationarity") {
    return result.after?.stationarity?.isStationary ? "stationary" : "non-stationary";
  }

  if (name === "Residual") {
    return result.whiteNoise?.isWhiteNoise ? "white noise" : "autocorrelation";
  }

  return `${name} done`;
}

/* =========================================================
   4. 필요한 단계 판단
========================================================= */

function shouldRunMissing(structureResult, rows, targetColumn) {
  if (!structureResult || !targetColumn) return true;

  const hasMissingTimestamp =
    structureResult.dateStructure?.missingTimestampCount > 0;

  const targetValues = rows.map(row => toNumber(row[targetColumn]));
  const hasMissingValue = targetValues.some(value => !Number.isFinite(value));

  return hasMissingTimestamp || hasMissingValue;
}

/* =========================================================
   5. Forecast 후보 선택
========================================================= */

function selectForecastModelCandidates({ modelSelection, stationarityResult, frequency, rows, targetColumn }) {
  if (modelSelection === "fast") {
    return ["naive", "moving-average", "exponential-smoothing"];
  }

  if (modelSelection === "accurate") {
    return ["exponential-smoothing", "holt", "holt-winters", "arima"];
  }

  const values = rows.map(row => toNumber(row[targetColumn])).filter(Number.isFinite);
  const hasEnoughSeason = values.length >= 24;
  const isStationary = stationarityResult?.after?.stationarity?.isStationary;

  const candidates = ["naive", "mean", "moving-average", "exponential-smoothing"];

  if (values.length >= 8) {
    candidates.push("holt");
  }

  if (hasEnoughSeason) {
    candidates.push("holt-winters");
  }

  if (isStationary || values.length >= 20) {
    candidates.push("arima");
  }

  return [...new Set(candidates)];
}

/* =========================================================
   6. Forecast 후보 평가
========================================================= */

function evaluateForecastCandidates(rows, options = {}) {
  const candidates = options.candidates || ["exponential-smoothing"];
  const horizon = Number(options.horizon || 12);
  const targetColumn = options.targetColumn;
  const datetimeColumn = options.datetimeColumn;
  const frequency = options.frequency;

  const evaluations = [];

  candidates.forEach(model => {
    if (!window.TSForecastAnalysis || !window.TSMetricsAnalysis) return;

    const forecastResult = window.TSForecastAnalysis.runForecastAnalysis(rows, {
      model,
      horizon,
      seasonalPeriod: guessSeasonalPeriod(rows, frequency),
      datetimeColumn,
      targetColumn
    });

    if (forecastResult.status === "error") return;

    const fitted = forecastResult.fitted || [];
    const metricsResult = window.TSMetricsAnalysis.runMetricsAnalysis(rows, {
      predicted: fitted,
      metricSet: "full",
      targetColumn
    });

    if (metricsResult.status === "error") return;

    evaluations.push({
      model,
      forecastResult,
      metricsResult,
      score: calculateModelScore(metricsResult.metrics)
    });
  });

  return evaluations;
}

function calculateModelScore(metrics) {
  if (!metrics) return Infinity;

  const rmse = Number.isFinite(metrics.RMSE) ? metrics.RMSE : Infinity;
  const mae = Number.isFinite(metrics.MAE) ? metrics.MAE : Infinity;
  const mape = Number.isFinite(metrics.MAPE) ? metrics.MAPE : 1;

  return rmse + mae * 0.5 + mape * 10;
}

function selectBestForecastEvaluation(evaluations) {
  return [...evaluations].sort((a, b) => a.score - b.score)[0];
}

function guessSeasonalPeriod(rows, frequency) {
  const code = frequency?.code || window.TSState?.dataset?.frequency?.code || "D";

  if (code === "M") return 12;
  if (code === "Q") return 4;
  if (code === "W") return 52;
  if (code === "D") return 7;
  if (code === "H") return 24;

  return 12;
}

/* =========================================================
   7. 메시지 / 추천
========================================================= */

function createAutoAnalysisMessages({ steps, selectedModel, metrics, horizon }) {
  const completedCount = steps.filter(step => step.status === "done").length;

  const messages = [
    `Auto Analysis가 완료되었습니다.`,
    `${completedCount}개 단계가 실행되었습니다.`,
    `선택된 예측 모델은 ${selectedModel}입니다.`,
    `예측 시평은 ${horizon}입니다.`
  ];

  if (metrics) {
    if (Number.isFinite(metrics.RMSE)) {
      messages.push(`RMSE: ${formatNumber(metrics.RMSE)}`);
    }

    if (Number.isFinite(metrics.MAPE)) {
      messages.push(`MAPE: ${(metrics.MAPE * 100).toFixed(2)}%`);
    }
  }

  return messages;
}

function createAutoAnalysisRecommendation({ bestEvaluation, residualResult }) {
  const recommendation = [];

  const metrics = bestEvaluation?.metricsResult?.metrics || {};

  if (Number.isFinite(metrics.MAPE) && metrics.MAPE > 0.2) {
    recommendation.push({
      nextStep: "Forecast",
      priority: "medium",
      message: "MAPE가 높은 편입니다. Forecast 팝업에서 모델과 시평을 조정해보세요."
    });
  }

  if (residualResult && residualResult.whiteNoise && !residualResult.whiteNoise.isWhiteNoise) {
    recommendation.push({
      nextStep: "Residual",
      priority: "high",
      message: "잔차에 자기상관이 남아 있습니다. ARIMA 차수 또는 계절성 모델을 다시 검토하세요."
    });
  }

  recommendation.push({
    nextStep: "Compare",
    priority: "normal",
    message: "자동 분석 결과와 수동 설정 모델을 Compare에서 비교해 최종 모델을 선택하세요."
  });

  return recommendation;
}

/* =========================================================
   8. Track / Stack 보조
========================================================= */

function createAutoAnalysisTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Auto ${result.selectedModel}`;
}

function markLatestAutoAnalysisStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Auto Analysis");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createAutoAnalysisShortSummary(result)
  );
}

function createAutoAnalysisShortSummary(result) {
  if (!result || result.status !== "done") return "Auto Analysis 실패";

  const rmseText = Number.isFinite(result.metrics?.RMSE)
    ? `RMSE ${formatNumber(result.metrics.RMSE)}`
    : "RMSE -";

  return `${result.selectedModel} · horizon ${result.horizon} · ${rmseText}`;
}

/* =========================================================
   9. UI 표시용 HTML
========================================================= */

function createAutoAnalysisResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Auto Analysis 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Auto Analysis Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  return `
    <div class="result-box">
      <strong>Auto Analysis Summary</strong><br />
      Model: ${escapeHTML(result.selectedModel)}<br />
      Horizon: ${result.horizon}<br />
      Steps: ${result.steps.length}<br />
      RMSE: ${formatNumber(result.metrics?.RMSE)}<br />
      MAPE: ${Number.isFinite(result.metrics?.MAPE) ? `${(result.metrics.MAPE * 100).toFixed(2)}%` : "-"}
    </div>
  `;
}

/* =========================================================
   10. Error
========================================================= */

function createAutoAnalysisErrorResult(message, extra = {}) {
  return {
    type: "Auto Analysis",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Structure",
        priority: "high",
        message: "자동 분석을 위해 datetime column과 target column을 먼저 확인하세요."
      }
    ],
    ...extra
  };
}

/* =========================================================
   11. 보조 함수
========================================================= */

function cloneRows(rows) {
  return rows.map(row => ({ ...row }));
}

function toNumber(value) {
  if (window.TSMathUtils) return window.TSMathUtils.toNumber(value);

  if (value === null || value === undefined || value === "") return NaN;

  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : NaN;
}

function createMetricSummary(metrics) {
  if (!metrics) return "Metrics -";

  const rmse = Number.isFinite(metrics.RMSE)
    ? `RMSE ${formatNumber(metrics.RMSE)}`
    : "RMSE -";

  const mape = Number.isFinite(metrics.MAPE)
    ? `MAPE ${(metrics.MAPE * 100).toFixed(2)}%`
    : "MAPE -";

  return `${rmse} · ${mape}`;
}

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
   12. 외부 접근용 객체
========================================================= */

window.TSAutoAnalysis = {
  runAutoAnalysis,
  runAutoAnalysisOnTrack,

  shouldRunMissing,
  selectForecastModelCandidates,
  evaluateForecastCandidates,
  calculateModelScore,
  selectBestForecastEvaluation,

  createAutoAnalysisMessages,
  createAutoAnalysisRecommendation,
  createAutoAnalysisShortSummary,
  createAutoAnalysisResultHTML
};