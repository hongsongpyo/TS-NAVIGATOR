/* =========================================================
   TS Navigator - metricChart.js
   평가지표 그래프 / 테이블 / 비교 시각화
   ========================================================= */

/* =========================================================
   Metric Bar Chart
   ========================================================= */

function renderMetricChart({
  element,
  metricTrack = null,
  metrics = null,
  title = "Evaluation Metrics",
}) {
  if (!element) return null;

  const metricRows = metricTrack
    ? metricTrack.data || []
    : TSMetrics.metricsToRows(metrics || {});

  const validRows = metricRows.filter((row) => {
    return row.value !== null && row.value !== undefined && Number.isFinite(Number(row.value));
  });

  if (validRows.length === 0) {
    TSChartCore.showChartEmpty(element, "표시할 평가지표가 없습니다.");
    return null;
  }

  const trace = TSChartCore.createBarTrace({
    x: validRows.map((row) => row.metric),
    y: validRows.map((row) => row.value),
    name: "Metric",
    color: TSChartCore.TSChartColors.metric,
  });

  trace.text = validRows.map((row) => TSMathUtils.formatNumber(row.value, 4));
  trace.textposition = "auto";

  const layout = TSChartCore.createBaseLayout({
    title,
    xTitle: "Metric",
    yTitle: "Error",
    showLegend: false,
  });

  layout.yaxis.rangemode = "tozero";

  return TSChartCore.renderPlot(element, [trace], layout);
}

/* =========================================================
   Metric Track 기준 렌더링
   ========================================================= */

function renderMetricTrackChart({
  element,
  metricTrack,
  title = null,
}) {
  if (!metricTrack) {
    TSChartCore.showChartEmpty(element, "Metric Track이 없습니다.");
    return null;
  }

  return renderMetricChart({
    element,
    metricTrack,
    title: title || metricTrack.name || "Evaluation Metrics",
  });
}

/* =========================================================
   Region 내 Metric Track 자동 탐색
   ========================================================= */

function renderRegionMetricChart({
  element,
  regionId,
  title = "Evaluation Metrics",
}) {
  const region = TSStore.getRegionById(regionId);

  if (!region) {
    TSChartCore.showChartEmpty(element, "Region을 찾을 수 없습니다.");
    return null;
  }

  const metricTrack = region.trackIds
    .map((trackId) => TSStore.getTrackById(trackId))
    .filter(Boolean)
    .reverse()
    .find((track) => track.type === "Evaluation Result");

  if (!metricTrack) {
    TSChartCore.showChartEmpty(element, "평가지표 Track이 없습니다.");
    return null;
  }

  return renderMetricTrackChart({
    element,
    metricTrack,
    title,
  });
}

/* =========================================================
   Metric Table HTML
   ========================================================= */

function createMetricTableHTML(metricsOrRows) {
  const rows = Array.isArray(metricsOrRows)
    ? metricsOrRows
    : TSMetrics.metricsToRows(metricsOrRows || {});

  if (!rows || rows.length === 0) {
    return `
      <div class="metric-table-empty">
        평가지표 결과가 없습니다.
      </div>
    `;
  }

  return `
    <table class="metric-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Value</th>
          <th>Quality</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            return `
              <tr>
                <td><strong>${TSChartCore.escapeHTML(row.metric)}</strong></td>
                <td>${TSMathUtils.formatNumber(row.value, 4)}</td>
                <td>${TSChartCore.escapeHTML(row.quality || "-")}</td>
                <td>${TSChartCore.escapeHTML(row.description || "")}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderMetricTable({
  element,
  metricTrack = null,
  metrics = null,
}) {
  if (!element) return;

  const rows = metricTrack ? metricTrack.data || [] : TSMetrics.metricsToRows(metrics || {});

  element.innerHTML = createMetricTableHTML(rows);
}

/* =========================================================
   Metric Interpretation HTML
   ========================================================= */

function createMetricInterpretationHTML(metrics = {}) {
  const interpretations = TSMetrics.interpretMetrics(metrics);

  if (interpretations.length === 0) {
    return `
      <div class="metric-interpretation-empty">
        해석할 평가지표가 없습니다.
      </div>
    `;
  }

  return `
    <div class="metric-interpretation-list">
      ${interpretations
        .map((item) => {
          return `
            <div class="metric-interpretation-item">
              <div class="metric-interpretation-header">
                <strong>${TSChartCore.escapeHTML(item.metric)}</strong>
                <span>${TSMathUtils.formatNumber(item.value, 4)}</span>
              </div>
              <p>${TSChartCore.escapeHTML(item.description)}</p>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderMetricInterpretation({
  element,
  metrics = null,
  metricTrack = null,
}) {
  if (!element) return;

  let metricObject = metrics;

  if (!metricObject && metricTrack) {
    metricObject = metricRowsToObject(metricTrack.data || []);
  }

  element.innerHTML = createMetricInterpretationHTML(metricObject || {});
}

/* =========================================================
   Residual Distribution
   ========================================================= */

function renderResidualHistogram({
  element,
  residuals = [],
  title = "Residual Distribution",
}) {
  if (!element) return null;

  const values = residuals
    .map((item) => {
      if (typeof item === "number") return item;
      return TSMathUtils.toNumber(item.value);
    })
    .filter((value) => value !== null);

  if (values.length === 0) {
    TSChartCore.showChartEmpty(element, "잔차 데이터가 없습니다.");
    return null;
  }

  const trace = {
    type: "histogram",
    x: values,
    name: "Residual",
    marker: {
      color: TSChartCore.TSChartColors.residual,
    },
    opacity: 0.75,
    hovertemplate: "Residual: %{x}<br>Count: %{y}<extra></extra>",
  };

  const layout = TSChartCore.createBaseLayout({
    title,
    xTitle: "Residual",
    yTitle: "Count",
    showLegend: false,
  });

  return TSChartCore.renderPlot(element, [trace], layout);
}

/* =========================================================
   Residual Summary HTML
   ========================================================= */

function createResidualSummaryHTML(residualSummary = {}) {
  const rows = [
    ["Mean", residualSummary.mean],
    ["Median", residualSummary.median],
    ["Min", residualSummary.min],
    ["Max", residualSummary.max],
    ["Std", residualSummary.standardDeviation],
    ["Variance", residualSummary.variance],
  ];

  return `
    <div class="residual-summary">
      ${rows
        .map(([label, value]) => {
          return `
            <div class="residual-summary-card">
              <span>${label}</span>
              <strong>${TSMathUtils.formatNumber(value, 4)}</strong>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderResidualSummary({
  element,
  residualSummary = {},
}) {
  if (!element) return;

  element.innerHTML = createResidualSummaryHTML(residualSummary);
}

/* =========================================================
   여러 모델 Metric 비교 Chart
   ========================================================= */

function renderMetricComparisonChart({
  element,
  results = [],
  metric = "rmse",
  title = "Model Comparison",
}) {
  if (!element) return null;

  const comparisonRows = TSMetrics.compareMetricResults(results);
  const validRows = comparisonRows.filter((row) => {
    return row[metric] !== null && row[metric] !== undefined;
  });

  if (validRows.length === 0) {
    TSChartCore.showChartEmpty(element, "비교할 모델 평가 결과가 없습니다.");
    return null;
  }

  const trace = TSChartCore.createBarTrace({
    x: validRows.map((row) => row.name),
    y: validRows.map((row) => row[metric]),
    name: metric.toUpperCase(),
    color: TSChartCore.TSChartColors.metric,
  });

  trace.text = validRows.map((row) => TSMathUtils.formatNumber(row[metric], 4));
  trace.textposition = "auto";

  const layout = TSChartCore.createBaseLayout({
    title,
    xTitle: "Model",
    yTitle: metric.toUpperCase(),
    showLegend: false,
  });

  layout.yaxis.rangemode = "tozero";

  return TSChartCore.renderPlot(element, [trace], layout);
}

/* =========================================================
   Metric Dashboard 패널
   ========================================================= */

function renderMetricDashboard({
  chartElement,
  tableElement,
  interpretationElement,
  residualElement,
  residualSummaryElement,
  metricTrack = null,
  metricResult = null,
}) {
  const metrics =
    metricResult?.metrics ||
    (metricTrack ? metricRowsToObject(metricTrack.data || []) : {});

  renderMetricChart({
    element: chartElement,
    metricTrack,
    metrics,
  });

  renderMetricTable({
    element: tableElement,
    metricTrack,
    metrics,
  });

  renderMetricInterpretation({
    element: interpretationElement,
    metrics,
    metricTrack,
  });

  if (residualElement && metricResult?.residuals) {
    renderResidualHistogram({
      element: residualElement,
      residuals: metricResult.residuals,
    });
  }

  if (residualSummaryElement && metricResult?.residualSummary) {
    renderResidualSummary({
      element: residualSummaryElement,
      residualSummary: metricResult.residualSummary,
    });
  }
}

/* =========================================================
   Metric Rows → Object
   ========================================================= */

function metricRowsToObject(rows = []) {
  const result = {};

  rows.forEach((row) => {
    if (!row.metric) return;

    result[row.metric.toLowerCase()] = row.value;
  });

  return {
    mae: result.mae ?? null,
    mse: result.mse ?? null,
    rmse: result.rmse ?? null,
    mape: result.mape ?? null,
    smape: result.smape ?? null,
  };
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSMetricChart = {
  renderMetricChart,
  renderMetricTrackChart,
  renderRegionMetricChart,

  createMetricTableHTML,
  renderMetricTable,

  createMetricInterpretationHTML,
  renderMetricInterpretation,

  renderResidualHistogram,
  createResidualSummaryHTML,
  renderResidualSummary,

  renderMetricComparisonChart,
  renderMetricDashboard,

  metricRowsToObject,
};