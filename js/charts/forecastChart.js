/* =========================================================
   TS Navigator - forecastChart.js
   ---------------------------------------------------------
   역할
   1. Forecast 결과 Plotly 시각화
   2. Observed / Fitted / Forecast / Confidence Interval 표시
   3. Backend FastAPI Forecast 응답 구조 지원
   4. Region 내부 차트 렌더링 지원
   5. 기존 Track 기반 Forecast Data 표시 지원
========================================================= */

/* =========================================================
   1. Forecast 차트 렌더링
========================================================= */

function renderForecastChart(containerId, result, options = {}) {
  const container = getChartContainer(containerId);

  if (!container) {
    console.warn("Forecast chart container를 찾지 못했습니다:", containerId);
    return;
  }

  if (!window.Plotly) {
    container.innerHTML = `
      <div class="chart-empty-message">
        Plotly가 로드되지 않았습니다.
      </div>
    `;
    return;
  }

  if (!result || result.status === "error") {
    container.innerHTML = `
      <div class="chart-empty-message">
        ${escapeChartHTML(result?.message || result?.error_message || "Forecast 결과가 없습니다.")}
      </div>
    `;
    return;
  }

  const chartData = normalizeForecastChartData(result);

  if (chartData.observedX.length === 0 && chartData.forecastX.length === 0) {
    container.innerHTML = `
      <div class="chart-empty-message">
        표시할 Forecast 데이터가 없습니다.
      </div>
    `;
    return;
  }

  const traces = createForecastTraces(chartData, options);
  const layout = createForecastLayout(result, options);
  const config = createForecastConfig(options);

  Plotly.react(container, traces, layout, config);
}

/* =========================================================
   2. Region용 렌더링
========================================================= */

function renderForecastChartInRegion(regionId, result, options = {}) {
  const containerId =
    options.containerId ||
    `forecast-chart-${regionId}`;

  let container = document.getElementById(containerId);

  if (!container) {
    const regionElement = document.getElementById(regionId);

    if (!regionElement) {
      console.warn("Region을 찾지 못했습니다:", regionId);
      return;
    }

    container = document.createElement("div");
    container.id = containerId;
    container.className = "forecast-chart-container";

    regionElement.innerHTML = "";
    regionElement.appendChild(container);
  }

  renderForecastChart(container.id, result, options);
}

/* =========================================================
   3. Track 기반 렌더링
========================================================= */

function renderForecastTrackChart(containerId, track, options = {}) {
  if (!track) {
    renderForecastChart(containerId, null, options);
    return;
  }

  const result =
    track.result ||
    track.metadata?.result ||
    buildForecastResultFromTrack(track);

  renderForecastChart(containerId, result, {
    ...options,
    title: options.title || track.name || "Forecast"
  });
}

/* =========================================================
   4. Forecast 결과 정규화
========================================================= */

function normalizeForecastChartData(result) {
  const observedDates =
    result.observedDates ||
    result.observed_dates ||
    [];

  const observedValues =
    result.observed ||
    result.values ||
    [];

  const fittedValues =
    result.fitted ||
    [];

  const forecastDates =
    result.forecastDates ||
    result.forecast_dates ||
    [];

  const forecastValues =
    result.forecast ||
    result.predicted ||
    [];

  const lowerValues =
    result.lower ||
    [];

  const upperValues =
    result.upper ||
    [];

  const rows =
    result.rows ||
    result.forecastRows ||
    [];

  if (
    observedDates.length === 0 &&
    forecastDates.length === 0 &&
    Array.isArray(rows) &&
    rows.length > 0
  ) {
    return normalizeForecastChartDataFromRows(rows);
  }

  return {
    observedX: observedDates,
    observedY: observedValues,

    fittedX: observedDates.slice(0, fittedValues.length),
    fittedY: fittedValues,

    forecastX: forecastDates,
    forecastY: forecastValues,

    lowerX: forecastDates.slice(0, lowerValues.length),
    lowerY: lowerValues,

    upperX: forecastDates.slice(0, upperValues.length),
    upperY: upperValues
  };
}

function normalizeForecastChartDataFromRows(rows) {
  const observedX = [];
  const observedY = [];

  const fittedX = [];
  const fittedY = [];

  const forecastX = [];
  const forecastY = [];

  const lowerX = [];
  const lowerY = [];

  const upperX = [];
  const upperY = [];

  rows.forEach((row, index) => {
    const datetime =
      row.datetime ||
      row.date ||
      row.time ||
      row.index ||
      index + 1;

    if (row.observed !== undefined && row.observed !== null) {
      observedX.push(datetime);
      observedY.push(row.observed);
    }

    if (row.fitted !== undefined && row.fitted !== null) {
      fittedX.push(datetime);
      fittedY.push(row.fitted);
    }

    if (row.forecast !== undefined && row.forecast !== null) {
      forecastX.push(datetime);
      forecastY.push(row.forecast);
    }

    if (row.lower !== undefined && row.lower !== null) {
      lowerX.push(datetime);
      lowerY.push(row.lower);
    }

    if (row.upper !== undefined && row.upper !== null) {
      upperX.push(datetime);
      upperY.push(row.upper);
    }
  });

  return {
    observedX,
    observedY,
    fittedX,
    fittedY,
    forecastX,
    forecastY,
    lowerX,
    lowerY,
    upperX,
    upperY
  };
}

/* =========================================================
   5. Trace 생성
========================================================= */

function createForecastTraces(chartData, options = {}) {
  const traces = [];

  if (chartData.observedX.length > 0) {
    traces.push({
      x: chartData.observedX,
      y: chartData.observedY,
      type: "scatter",
      mode: "lines+markers",
      name: "Observed",
      line: {
        width: 2
      },
      marker: {
        size: 5
      },
      hovertemplate:
        "<b>Observed</b><br>" +
        "Time: %{x}<br>" +
        "Value: %{y:.3f}<extra></extra>"
    });
  }

  if (chartData.fittedX.length > 0) {
    traces.push({
      x: chartData.fittedX,
      y: chartData.fittedY,
      type: "scatter",
      mode: "lines",
      name: "Fitted",
      line: {
        width: 2,
        dash: "dot"
      },
      hovertemplate:
        "<b>Fitted</b><br>" +
        "Time: %{x}<br>" +
        "Value: %{y:.3f}<extra></extra>"
    });
  }

  if (
    chartData.upperX.length > 0 &&
    chartData.lowerX.length > 0 &&
    chartData.upperY.length === chartData.lowerY.length
  ) {
    traces.push({
      x: chartData.upperX,
      y: chartData.upperY,
      type: "scatter",
      mode: "lines",
      name: "Upper",
      line: {
        width: 0
      },
      hoverinfo: "skip",
      showlegend: false
    });

    traces.push({
      x: chartData.lowerX,
      y: chartData.lowerY,
      type: "scatter",
      mode: "lines",
      name: "Prediction Interval",
      fill: "tonexty",
      line: {
        width: 0
      },
      hoverinfo: "skip"
    });
  }

  if (chartData.forecastX.length > 0) {
    traces.push({
      x: chartData.forecastX,
      y: chartData.forecastY,
      type: "scatter",
      mode: "lines+markers",
      name: "Forecast",
      line: {
        width: 2,
        dash: "dash"
      },
      marker: {
        size: 6
      },
      hovertemplate:
        "<b>Forecast</b><br>" +
        "Time: %{x}<br>" +
        "Value: %{y:.3f}<extra></extra>"
    });
  }

  return traces;
}

/* =========================================================
   6. Layout 생성
========================================================= */

function createForecastLayout(result, options = {}) {
  const title =
    options.title ||
    `Forecast · ${result?.model || "Model"}`;

  return {
    title: {
      text: title,
      font: {
        size: 14
      }
    },
    margin: {
      l: 50,
      r: 24,
      t: 44,
      b: 42
    },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    hovermode: "x unified",
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      y: 1.12
    },
    xaxis: {
      title: options.xTitle || "Time",
      showgrid: true,
      zeroline: false,
      rangeslider: {
        visible: options.rangeSlider ?? false
      }
    },
    yaxis: {
      title: options.yTitle || "Value",
      showgrid: true,
      zeroline: false
    },
    autosize: true
  };
}

/* =========================================================
   7. Config 생성
========================================================= */

function createForecastConfig(options = {}) {
  return {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    editable: options.editable ?? false,
    modeBarButtonsToRemove: [
      "lasso2d",
      "select2d"
    ]
  };
}

/* =========================================================
   8. Track Data → Forecast Result 변환
========================================================= */

function buildForecastResultFromTrack(track) {
  const rows = track?.data || [];

  const datetimeColumn =
    track?.metadata?.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn ||
    "datetime";

  const targetColumn =
    track?.metadata?.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    "value";

  const forecastDates = [];
  const forecast = [];
  const lower = [];
  const upper = [];

  rows.forEach((row, index) => {
    forecastDates.push(row[datetimeColumn] ?? index + 1);
    forecast.push(row[targetColumn] ?? row.forecast ?? null);
    lower.push(row.lower ?? null);
    upper.push(row.upper ?? null);
  });

  return {
    type: "Forecast",
    status: "done",
    model: track?.metadata?.forecastModel || "Forecast",
    horizon: forecast.length,
    datetimeColumn,
    targetColumn,
    observed: [],
    fitted: [],
    forecast,
    lower,
    upper,
    observedDates: [],
    forecastDates,
    rows: []
  };
}

/* =========================================================
   9. 빠른 테스트용 함수
========================================================= */

async function renderQuickForecastTest(containerId, rows, options = {}) {
  if (!window.TSForecastAnalysis) {
    console.warn("TSForecastAnalysis가 로드되지 않았습니다.");
    return;
  }

  const result = await window.TSForecastAnalysis.runForecastAnalysis(rows, options);

  renderForecastChart(containerId, result, options);

  return result;
}

/* =========================================================
   10. Resize
========================================================= */

function resizeForecastChart(containerId) {
  const container = getChartContainer(containerId);

  if (!container || !window.Plotly) return;

  Plotly.Plots.resize(container);
}

function resizeAllForecastCharts() {
  const containers = document.querySelectorAll(".forecast-chart-container");

  containers.forEach(container => {
    resizeForecastChart(container.id);
  });
}

/* =========================================================
   11. DOM 보조
========================================================= */

function getChartContainer(containerId) {
  if (!containerId) return null;

  if (typeof containerId === "string") {
    return document.getElementById(containerId);
  }

  return containerId;
}

function escapeChartHTML(value) {
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

window.TSForecastChart = {
  renderForecastChart,
  renderForecastChartInRegion,
  renderForecastTrackChart,

  normalizeForecastChartData,
  normalizeForecastChartDataFromRows,
  buildForecastResultFromTrack,

  renderQuickForecastTest,

  resizeForecastChart,
  resizeAllForecastCharts
};