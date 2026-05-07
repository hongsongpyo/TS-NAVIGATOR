/* =========================================================
   TS Navigator - compare.js
   ---------------------------------------------------------
   역할
   1. 여러 Track 비교
   2. Metrics 기준 모델 성능 비교
   3. Forecast 값 비교
   4. Residual 비교
   5. Compare Result Track 생성
========================================================= */

/* =========================================================
   1. Compare 분석 실행
========================================================= */

function runCompareAnalysis(rows, options = {}) {
  const compareBy = options.compareBy || "metrics";

  const targetTrackIds = resolveTargetTrackIds(options);
  const tracks = targetTrackIds
    .map(trackId => window.TSStore?.getTrack(trackId))
    .filter(Boolean);

  if (tracks.length === 0) {
    return createCompareErrorResult("비교할 Track이 없습니다.");
  }

  let compareResult = null;

  if (compareBy === "forecast") {
    compareResult = compareForecastTracks(tracks, options);
  } else if (compareBy === "residual") {
    compareResult = compareResidualTracks(tracks, options);
  } else {
    compareResult = compareMetricTracks(tracks, options);
  }

  const result = {
    type: "Compare",
    status: "done",

    compareBy,
    targetTrackIds,
    trackCount: tracks.length,

    baselineTrackId: options.baselineTrackId || null,
    baselineTrackName: getBaselineTrackName(tracks, options.baselineTrackId),

    comparison: compareResult,
    outputRows: createCompareRows(compareResult),

    messages: createCompareMessages(compareBy, compareResult),
    recommendation: createCompareRecommendation(compareBy, compareResult)
  };

  return result;
}

/* =========================================================
   2. Track 기반 Compare 분석
========================================================= */

function runCompareAnalysisOnTrack(trackId, params = {}) {
  if (!window.TSStore) return null;

  const sourceTrack = window.TSStore.getTrack(trackId);
  if (!sourceTrack) return null;

  const result = runCompareAnalysis(sourceTrack.data || [], {
    ...params,
    baselineTrackId: params.baselineTrackId || trackId
  });

  if (result.status === "error") {
    markLatestCompareStack(trackId, result);
    return result;
  }

  const newTrack = window.TSStore.addTrack({
    name: createCompareTrackName(sourceTrack, result),
    type: "Compare Result",
    sourceTrackId: sourceTrack.id,
    regionId: sourceTrack.regionId,
    data: result.outputRows,
    metadata: {
      ...sourceTrack.metadata,
      compare: result,
      lastAnalysis: "Compare",
      lastParams: params
    }
  });

  window.TSStore.addAnalysisToTrack(newTrack.id, "Compare", params);

  window.TSStore.commitTrackResult(newTrack.id, {
    data: result.outputRows,
    metadata: {
      ...newTrack.metadata,
      compare: result
    },
    result
  });

  markLatestCompareStack(newTrack.id, result);
  window.TSStore.selectTrack?.(newTrack.id);

  return result;
}

/* =========================================================
   3. 비교 대상 Track 결정
========================================================= */

function resolveTargetTrackIds(options = {}) {
  if (Array.isArray(options.targetTrackIds) && options.targetTrackIds.length > 0) {
    return options.targetTrackIds;
  }

  const tracks = window.TSState?.tracks || [];

  if (options.compareBy === "forecast") {
    return tracks
      .filter(track => track.type === "Forecast Data" || track.result?.forecast)
      .map(track => track.id);
  }

  if (options.compareBy === "residual") {
    return tracks
      .filter(track => track.type === "Residual Data" || track.residuals || track.result?.residuals)
      .map(track => track.id);
  }

  return tracks
    .filter(track => track.metrics || track.result?.metrics || track.metadata?.metrics)
    .map(track => track.id);
}

/* =========================================================
   4. Metrics 비교
========================================================= */

function compareMetricTracks(tracks, options = {}) {
  const metricName = options.metricName || "RMSE";

  const items = tracks
    .map(track => {
      const metrics = extractMetrics(track);

      return {
        trackId: track.id,
        trackName: track.name,
        type: track.type,
        metrics,
        selectedMetric: metricName,
        selectedValue: metrics?.[metricName],
        updatedAt: track.updatedAt
      };
    })
    .filter(item => item.metrics && Object.keys(item.metrics).length > 0);

  const ranked = rankMetricCompareItems(items, metricName);
  const best = ranked[0] || null;

  return {
    mode: "metrics",
    metricName,
    items: ranked,
    best,
    summary: {
      comparedCount: ranked.length,
      bestTrackName: best?.trackName || null,
      bestValue: best?.selectedValue ?? null
    }
  };
}

function rankMetricCompareItems(items, metricName) {
  const direction = getMetricDirection(metricName);

  const sorted = [...items].sort((a, b) => {
    const valueA = Math.abs(toNumber(a.selectedValue));
    const valueB = Math.abs(toNumber(b.selectedValue));

    if (direction === "higher is better") {
      return valueB - valueA;
    }

    return valueA - valueB;
  });

  return sorted.map((item, index) => ({
    ...item,
    rank: index + 1
  }));
}

/* =========================================================
   5. Forecast 비교
========================================================= */

function compareForecastTracks(tracks, options = {}) {
  const items = tracks
    .map(track => {
      const forecast = extractForecast(track);
      const summary = summarizeValues(forecast);

      return {
        trackId: track.id,
        trackName: track.name,
        type: track.type,
        model: track.result?.model || track.metadata?.model || track.metadata?.lastParams?.model || "-",
        horizon: forecast.length,
        forecast,
        summary,
        updatedAt: track.updatedAt
      };
    })
    .filter(item => item.forecast.length > 0);

  return {
    mode: "forecast",
    items,
    summary: {
      comparedCount: items.length,
      maxHorizon: Math.max(...items.map(item => item.horizon), 0),
      models: items.map(item => item.model)
    }
  };
}

/* =========================================================
   6. Residual 비교
========================================================= */

function compareResidualTracks(tracks, options = {}) {
  const items = tracks
    .map(track => {
      const residuals = extractResiduals(track);
      const summary = summarizeValues(residuals);
      const meanAbs = meanLocal(residuals.map(value => Math.abs(toNumber(value))).filter(Number.isFinite));

      return {
        trackId: track.id,
        trackName: track.name,
        type: track.type,
        residuals,
        meanAbs,
        summary,
        updatedAt: track.updatedAt
      };
    })
    .filter(item => item.residuals.length > 0);

  const ranked = [...items]
    .sort((a, b) => toNumber(a.meanAbs) - toNumber(b.meanAbs))
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));

  return {
    mode: "residual",
    items: ranked,
    best: ranked[0] || null,
    summary: {
      comparedCount: ranked.length,
      bestTrackName: ranked[0]?.trackName || null,
      bestMeanAbsResidual: ranked[0]?.meanAbs ?? null
    }
  };
}

/* =========================================================
   7. 값 추출
========================================================= */

function extractMetrics(track) {
  return (
    track.metrics ||
    track.result?.metrics ||
    track.metadata?.metrics ||
    null
  );
}

function extractForecast(track) {
  const values =
    track.result?.forecast ||
    track.result?.predicted ||
    track.metadata?.forecast ||
    [];

  return Array.isArray(values)
    ? values.map(toNumber).filter(Number.isFinite)
    : [];
}

function extractResiduals(track) {
  const values =
    track.residuals ||
    track.result?.residuals ||
    track.metadata?.residuals ||
    track.metadata?.residual?.residuals ||
    [];

  return Array.isArray(values)
    ? values.map(toNumber).filter(Number.isFinite)
    : [];
}

/* =========================================================
   8. Compare Rows
========================================================= */

function createCompareRows(compareResult) {
  if (!compareResult || !Array.isArray(compareResult.items)) return [];

  return compareResult.items.map(item => {
    if (compareResult.mode === "metrics") {
      return {
        rank: item.rank,
        trackName: item.trackName,
        metric: compareResult.metricName,
        value: item.selectedValue,
        MAE: item.metrics?.MAE ?? "",
        RMSE: item.metrics?.RMSE ?? "",
        MAPE: item.metrics?.MAPE ?? "",
        MASE: item.metrics?.MASE ?? ""
      };
    }

    if (compareResult.mode === "forecast") {
      return {
        trackName: item.trackName,
        model: item.model,
        horizon: item.horizon,
        meanForecast: item.summary.mean,
        minForecast: item.summary.min,
        maxForecast: item.summary.max
      };
    }

    return {
      rank: item.rank,
      trackName: item.trackName,
      meanResidual: item.summary.mean,
      stdResidual: item.summary.std,
      meanAbsResidual: item.meanAbs
    };
  });
}

/* =========================================================
   9. 메시지 / 추천
========================================================= */

function createCompareMessages(compareBy, compareResult) {
  if (!compareResult) {
    return ["Compare 결과가 없습니다."];
  }

  if (compareBy === "metrics") {
    return [
      `${compareResult.summary.comparedCount}개 Track의 Metrics를 비교했습니다.`,
      `비교 기준 지표는 ${compareResult.metricName}입니다.`,
      `가장 좋은 Track은 ${compareResult.summary.bestTrackName || "-"}입니다.`
    ];
  }

  if (compareBy === "forecast") {
    return [
      `${compareResult.summary.comparedCount}개 Forecast Track을 비교했습니다.`,
      `최대 예측 시평은 ${compareResult.summary.maxHorizon}입니다.`,
      `비교 모델: ${compareResult.summary.models.join(", ")}`
    ];
  }

  return [
    `${compareResult.summary.comparedCount}개 Residual Track을 비교했습니다.`,
    `평균 절대 잔차가 가장 낮은 Track은 ${compareResult.summary.bestTrackName || "-"}입니다.`
  ];
}

function createCompareRecommendation(compareBy, compareResult) {
  const recommendation = [];

  if (!compareResult || compareResult.summary.comparedCount === 0) {
    recommendation.push({
      nextStep: "Forecast",
      priority: "high",
      message: "비교 가능한 Track이 없습니다. Forecast 또는 Metrics를 먼저 실행하세요."
    });

    return recommendation;
  }

  if (compareBy === "metrics") {
    recommendation.push({
      nextStep: "Forecast",
      priority: "normal",
      message: "성능이 가장 좋은 모델의 예측 결과를 기준으로 최종 Forecast를 선택하세요."
    });
  }

  if (compareBy === "forecast") {
    recommendation.push({
      nextStep: "Metrics",
      priority: "normal",
      message: "Forecast 곡선 차이뿐 아니라 Metrics로 정량적 성능을 함께 확인하세요."
    });
  }

  if (compareBy === "residual") {
    recommendation.push({
      nextStep: "Metrics",
      priority: "normal",
      message: "잔차가 작은 모델과 Metrics가 좋은 모델이 일치하는지 확인하세요."
    });
  }

  return recommendation;
}

/* =========================================================
   10. Track / Stack 보조
========================================================= */

function createCompareTrackName(sourceTrack, result) {
  const baseName = sourceTrack?.name || "Track";
  return `${baseName} · Compare ${result.compareBy}`;
}

function markLatestCompareStack(trackId, result) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.analysisStack) return;

  const stackItem = [...track.analysisStack]
    .reverse()
    .find(item => item.analysisType === "Compare");

  if (!stackItem) return;

  if (result.status === "error") {
    window.TSStore.markStackItemError(trackId, stackItem.id, result.message);
    return;
  }

  window.TSStore.markStackItemDone(
    trackId,
    stackItem.id,
    createCompareShortSummary(result)
  );
}

function createCompareShortSummary(result) {
  if (!result || result.status !== "done") return "Compare 실패";

  return `${result.compareBy} · tracks ${result.trackCount}`;
}

/* =========================================================
   11. UI 표시용 HTML
========================================================= */

function createCompareResultHTML(result) {
  if (!result) {
    return `<div class="result-box">Compare 분석 결과가 없습니다.</div>`;
  }

  if (result.status === "error") {
    return `
      <div class="result-box">
        <strong>Compare Error</strong><br />
        ${escapeHTML(result.message)}
      </div>
    `;
  }

  const summary = result.comparison?.summary || {};

  return `
    <div class="result-box">
      <strong>Compare Summary</strong><br />
      Compare By: ${escapeHTML(result.compareBy)}<br />
      Tracks: ${result.trackCount}<br />
      Best: ${escapeHTML(summary.bestTrackName || "-")}<br />
      Count: ${summary.comparedCount ?? "-"}
    </div>
  `;
}

/* =========================================================
   12. Error
========================================================= */

function createCompareErrorResult(message, extra = {}) {
  return {
    type: "Compare",
    status: "error",
    message,
    messages: [message],
    outputRows: [],
    recommendation: [
      {
        nextStep: "Metrics",
        priority: "high",
        message: "Compare를 위해서는 비교 가능한 Forecast, Residual, Metrics Track이 필요합니다."
      }
    ],
    ...extra
  };
}

/* =========================================================
   13. 보조 함수
========================================================= */

function getBaselineTrackName(tracks, baselineTrackId) {
  if (!baselineTrackId) return null;

  return tracks.find(track => track.id === baselineTrackId)?.name || null;
}

function getMetricDirection(metricName) {
  if (["MAE", "MSE", "RMSE", "MAPE", "SMAPE", "MASE"].includes(metricName)) {
    return "lower is better";
  }

  if (["RSFE", "TS"].includes(metricName)) {
    return "near zero";
  }

  return "higher is better";
}

function summarizeValues(values) {
  const clean = values.map(toNumber).filter(Number.isFinite);

  if (window.TSMathUtils) {
    return window.TSMathUtils.describe(clean);
  }

  return {
    count: clean.length,
    mean: meanLocal(clean),
    min: clean.length ? Math.min(...clean) : NaN,
    max: clean.length ? Math.max(...clean) : NaN,
    std: standardDeviationLocal(clean)
  };
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
   14. 외부 접근용 객체
========================================================= */

window.TSCompareAnalysis = {
  runCompareAnalysis,
  runCompareAnalysisOnTrack,

  compareMetricTracks,
  compareForecastTracks,
  compareResidualTracks,

  extractMetrics,
  extractForecast,
  extractResiduals,

  createCompareRows,
  createCompareMessages,
  createCompareRecommendation,
  createCompareShortSummary,
  createCompareResultHTML
};