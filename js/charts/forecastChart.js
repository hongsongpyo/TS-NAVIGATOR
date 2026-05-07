/* =========================================================
   TS Navigator - forecastChart.js
   예측 그래프 / 신뢰구간 / 실제값-예측값 비교
   ========================================================= */

/* =========================================================
   예측 결과 통합 그래프
   원본 + 테스트 예측 + 미래 예측 + 신뢰구간
   ========================================================= */

function renderForecastChart({
  element,
  sourceTrack,
  forecastTrack = null,
  forecastResult = null,
  title = "Forecast Result",
  showRangeSlider = true,
}) {
  if (!element || !sourceTrack) {
    TSChartCore.showChartEmpty(element, "예측 그래프를 표시할 Track이 없습니다.");
    return null;
  }

  const traces = [];

  const originalTrace = TSChartCore.createLineTrace({
    x: sourceTrack.x || [],
    y: sourceTrack.y || [],
    name: "Actual",
    color: TSChartCore.getTrackColor(sourceTrack),
    mode: "lines+markers",
    width: 2,
  });

  traces.push(originalTrace);

  const result = forecastResult || createForecastResultFromTrack(forecastTrack);

  if (result?.fittedSeries?.length > 0) {
    const fittedTrace = TSChartCore.createLineTrace({
      x: result.fittedSeries.map((item) => item.date),
      y: result.fittedSeries.map((item) => item.value),
      name: "Test Forecast",
      color: "#ff922b",
      mode: "lines+markers",
      width: 2,
      dash: "dash",
    });

    traces.push(fittedTrace);
  }

  if (result?.futureSeries?.length > 0) {
    const futureX = result.futureSeries.map((item) => item.date);
    const futureY = result.futureSeries.map((item) => item.value);
    const lower = result.futureSeries.map((item) => item.lower);
    const upper = result.futureSeries.map((item) => item.upper);

    const hasInterval = lower.some((value) => value !== null && value !== undefined)
      && upper.some((value) => value !== null && value !== undefined);

    if (hasInterval) {
      const intervalTraces = TSChartCore.createConfidenceIntervalTraces({
        x: futureX,
        lower,
        upper,
        color: "rgba(245, 159, 0, 0.18)",
        name: "Prediction Interval",
      });

      traces.push(...intervalTraces);
    }

    const futureTrace = TSChartCore.createLineTrace({
      x: futureX,
      y: futureY,
      name: "Future Forecast",
      color: TSChartCore.TSChartColors.forecast,
      mode: "lines+markers",
      width: 3,
      dash: "dash",
    });

    traces.push(futureTrace);
  } else if (forecastTrack) {
    const forecastTrace = TSChartCore.createLineTrace({
      x: forecastTrack.x || [],
      y: forecastTrack.y || [],
      name: forecastTrack.name || "Forecast",
      color: TSChartCore.TSChartColors.forecast,
      mode: "lines+markers",
      width: 3,
      dash: "dash",
    });

    traces.push(forecastTrace);
  }

  const layout = createForecastLayout({
    title,
    showRangeSlider,
  });

  const yRange = TSChartCore.getYRangeFromTraces(traces);

  if (yRange) {
    layout.yaxis.range = yRange;
  }

  return TSChartCore.renderPlot(element, traces, layout);
}

/* =========================================================
   Forecast Track 기준 그래프
   ========================================================= */

function renderForecastTrackChart({
  element,
  forecastTrack,
  title = null,
}) {
  if (!forecastTrack) {
    TSChartCore.showChartEmpty(element, "Forecast Track이 없습니다.");
    return null;
  }

  const sourceTrackId = forecastTrack.metadata?.sourceTrackId;
  const sourceTrack = sourceTrackId ? TSStore.getTrackById(sourceTrackId) : null;

  return renderForecastChart({
    element,
    sourceTrack,
    forecastTrack,
    forecastResult: createForecastResultFromTrack(forecastTrack),
    title: title || forecastTrack.name,
  });
}

/* =========================================================
   Region 내 Forecast 자동 탐색 그래프
   ========================================================= */

function renderRegionForecastChart({
  element,
  regionId,
  title = "Forecast View",
}) {
  const region = TSStore.getRegionById(regionId);

  if (!region) {
    TSChartCore.showChartEmpty(element, "Region을 찾을 수 없습니다.");
    return null;
  }

  const tracks = region.trackIds
    .map((trackId) => TSStore.getTrackById(trackId))
    .filter(Boolean);

  const forecastTrack = [...tracks]
    .reverse()
    .find((track) => track.type === "Forecast Data");

  if (!forecastTrack) {
    TSChartCore.showChartEmpty(element, "예측 Track이 없습니다.");
    return null;
  }

  const sourceTrack = TSStore.getTrackById(forecastTrack.metadata?.sourceTrackId)
    || tracks.find((track) => track.type !== "Forecast Data");

  return renderForecastChart({
    element,
    sourceTrack,
    forecastTrack,
    forecastResult: createForecastResultFromTrack(forecastTrack),
    title,
  });
}

/* =========================================================
   실제값 vs 예측값 비교 그래프
   ========================================================= */

function renderActualVsPredictedChart({
  element,
  forecastResult,
  title = "Actual vs Predicted",
}) {
  if (!element || !forecastResult || !forecastResult.fittedSeries) {
    TSChartCore.showChartEmpty(element, "실제값-예측값 비교 데이터가 없습니다.");
    return null;
  }

  const fitted = forecastResult.fittedSeries;

  const actualTrace = TSChartCore.createLineTrace({
    x: fitted.map((item) => item.date),
    y: fitted.map((item) => item.actual),
    name: "Actual",
    color: TSChartCore.TSChartColors.original,
    mode: "lines+markers",
    width: 2,
  });

  const predictedTrace = TSChartCore.createLineTrace({
    x: fitted.map((item) => item.date),
    y: fitted.map((item) => item.value),
    name: "Predicted",
    color: TSChartCore.TSChartColors.forecast,
    mode: "lines+markers",
    width: 2,
    dash: "dash",
  });

  const layout = createForecastLayout({
    title,
    showRangeSlider: false,
  });

  return TSChartCore.renderPlot(element, [actualTrace, predictedTrace], layout);
}

/* =========================================================
   잔차 그래프
   ========================================================= */

function renderForecastResidualChart({
  element,
  forecastResult,
  title = "Forecast Residual",
}) {
  if (!element || !forecastResult) {
    TSChartCore.showChartEmpty(element, "잔차를 표시할 데이터가 없습니다.");
    return null;
  }

  const fitted = forecastResult.fittedSeries || [];
  const residuals =
    forecastResult.residuals ||
    fitted.map((item) => {
      const actual = TSMathUtils.toNumber(item.actual);
      const predicted = TSMathUtils.toNumber(item.value);

      if (actual === null || predicted === null) return null;

      return actual - predicted;
    });

  const trace = TSChartCore.createLineTrace({
    x: fitted.map((item) => item.date),
    y: residuals,
    name: "Residual",
    color: TSChartCore.TSChartColors.residual,
    mode: "lines+markers",
    width: 2,
  });

  const zeroLine = {
    type: "scatter",
    mode: "lines",
    x: fitted.map((item) => item.date),
    y: fitted.map(() => 0),
    name: "Zero",
    line: {
      color: "#adb5bd",
      width: 1,
      dash: "dot",
    },
    hoverinfo: "skip",
  };

  const layout = createForecastLayout({
    title,
    showRangeSlider: false,
  });

  layout.yaxis.title.text = "Residual";

  return TSChartCore.renderPlot(element, [trace, zeroLine], layout);
}

/* =========================================================
   Forecast Layout
   ========================================================= */

function createForecastLayout({
  title = "Forecast",
  showRangeSlider = true,
}) {
  const layout = TSChartCore.createBaseLayout({
    title,
    xTitle: "Time",
    yTitle: "Value",
    showLegend: true,
  });

  layout.xaxis = {
    ...layout.xaxis,
    type: "date",
    rangeslider: {
      visible: showRangeSlider,
      thickness: 0.08,
    },
  };

  return layout;
}

/* =========================================================
   Forecast Track → Forecast Result 복원
   ========================================================= */

function createForecastResultFromTrack(forecastTrack) {
  if (!forecastTrack) return null;

  const metadata = forecastTrack.metadata || {};

  return {
    sourceTrackId: metadata.sourceTrackId || null,
    method: metadata.parameters?.method || metadata.forecastMethod || "unknown",
    fittedSeries: metadata.fittedSeries || [],
    futureSeries:
      metadata.futureSeries ||
      (forecastTrack.data || []).map((item, index) => ({
        date: item.date || forecastTrack.x[index],
        value: item.value ?? forecastTrack.y[index],
        lower: item.lower,
        upper: item.upper,
        forecast: true,
      })),
    report: metadata.report || null,
  };
}

/* =========================================================
   Forecast Summary HTML
   ========================================================= */

function createForecastSummaryHTML(forecastResult) {
  if (!forecastResult || !forecastResult.report) {
    return `
      <div class="forecast-summary empty">
        예측 요약 정보가 없습니다.
      </div>
    `;
  }

  const report = forecastResult.report;
  const metrics = report.metrics;

  return `
    <div class="forecast-summary">
      <div class="forecast-summary-row">
        <span>Method</span>
        <strong>${TSChartCore.escapeHTML(report.method || "-")}</strong>
      </div>
      <div class="forecast-summary-row">
        <span>Train</span>
        <strong>${report.trainCount ?? "-"}</strong>
      </div>
      <div class="forecast-summary-row">
        <span>Test</span>
        <strong>${report.testCount ?? "-"}</strong>
      </div>
      <div class="forecast-summary-row">
        <span>Forecast</span>
        <strong>${report.forecastCount ?? "-"}</strong>
      </div>
      <div class="forecast-summary-row">
        <span>RMSE</span>
        <strong>${metrics ? TSMathUtils.formatNumber(metrics.rmse, 4) : "-"}</strong>
      </div>
      <div class="forecast-summary-row">
        <span>MAPE</span>
        <strong>${metrics ? TSMathUtils.formatNumber(metrics.mape, 4) : "-"}%</strong>
      </div>
      <p class="forecast-summary-message">
        ${TSChartCore.escapeHTML(report.message || "")}
      </p>
    </div>
  `;
}

/* =========================================================
   Forecast Result 전체 패널 렌더링
   ========================================================= */

function renderForecastPanel({
  chartElement,
  summaryElement,
  sourceTrack,
  forecastTrack = null,
  forecastResult = null,
}) {
  const result = forecastResult || createForecastResultFromTrack(forecastTrack);

  renderForecastChart({
    element: chartElement,
    sourceTrack,
    forecastTrack,
    forecastResult: result,
    title: "Forecast Result",
  });

  if (summaryElement) {
    summaryElement.innerHTML = createForecastSummaryHTML(result);
  }
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSForecastChart = {
  renderForecastChart,
  renderForecastTrackChart,
  renderRegionForecastChart,

  renderActualVsPredictedChart,
  renderForecastResidualChart,

  createForecastLayout,
  createForecastResultFromTrack,

  createForecastSummaryHTML,
  renderForecastPanel,
};