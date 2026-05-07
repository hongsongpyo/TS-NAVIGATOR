/* =========================================================
   TS Navigator - chartCore.js
   Plotly 공통 옵션 / 테마 / 렌더링 보조 함수
   ========================================================= */

/* =========================================================
   Plotly 존재 확인
   ========================================================= */

function isPlotlyReady() {
  return typeof window.Plotly !== "undefined";
}

/* =========================================================
   공통 색상
   ========================================================= */

const TSChartColors = {
  original: "#2f80ed",
  preprocessed: "#12b886",
  forecast: "#f59f00",
  residual: "#e03131",
  metric: "#7950f2",
  auto: "#00a6a6",
  grid: "#edf0f4",
  text: "#1f2933",
  muted: "#8a94a3",
  surface: "#ffffff",
};

/* =========================================================
   Track Type별 색상
   ========================================================= */

function getTrackColor(track) {
  if (track?.color) return track.color;

  switch (track?.type) {
    case "Original Data":
      return TSChartColors.original;

    case "Preprocessed Data":
      return TSChartColors.preprocessed;

    case "Forecast Data":
      return TSChartColors.forecast;

    case "Residual Data":
      return TSChartColors.residual;

    case "Evaluation Result":
      return TSChartColors.metric;

    default:
      return TSChartColors.original;
  }
}

/* =========================================================
   공통 Layout
   ========================================================= */

function createBaseLayout({
  title = "",
  xTitle = "Time",
  yTitle = "Value",
  showLegend = true,
  height = null,
} = {}) {
  return {
    title: {
      text: title,
      font: {
        size: 14,
        color: TSChartColors.text,
      },
      x: 0,
      xanchor: "left",
    },

    paper_bgcolor: TSChartColors.surface,
    plot_bgcolor: TSChartColors.surface,

    margin: {
      l: 48,
      r: 24,
      t: title ? 48 : 24,
      b: 42,
    },

    height,

    xaxis: {
      title: {
        text: xTitle,
        font: {
          size: 12,
          color: TSChartColors.muted,
        },
      },
      showgrid: true,
      gridcolor: TSChartColors.grid,
      zeroline: false,
      tickfont: {
        size: 11,
        color: TSChartColors.muted,
      },
      rangeslider: {
        visible: false,
      },
    },

    yaxis: {
      title: {
        text: yTitle,
        font: {
          size: 12,
          color: TSChartColors.muted,
        },
      },
      showgrid: true,
      gridcolor: TSChartColors.grid,
      zeroline: false,
      tickfont: {
        size: 11,
        color: TSChartColors.muted,
      },
    },

    showlegend: showLegend,

    legend: {
      orientation: "h",
      x: 0,
      y: 1.12,
      font: {
        size: 11,
        color: TSChartColors.text,
      },
    },

    hovermode: "x unified",

    transition: {
      duration: 250,
      easing: "cubic-in-out",
    },
  };
}

/* =========================================================
   공통 Config
   ========================================================= */

function createBaseConfig() {
  return {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: [
      "lasso2d",
      "select2d",
      "autoScale2d",
      "toggleSpikelines",
    ],
    toImageButtonOptions: {
      format: "png",
      filename: "ts-navigator-chart",
      height: 720,
      width: 1280,
      scale: 2,
    },
  };
}

/* =========================================================
   Trace 공통 생성
   ========================================================= */

function createLineTrace({
  x = [],
  y = [],
  name = "Track",
  color = TSChartColors.original,
  mode = "lines",
  width = 2,
  dash = "solid",
  visible = true,
  customdata = null,
}) {
  return {
    type: "scatter",
    mode,
    x,
    y,
    name,
    visible: visible ? true : "legendonly",
    customdata,
    line: {
      color,
      width,
      dash,
    },
    marker: {
      color,
      size: 6,
    },
    hovertemplate:
      "<b>%{fullData.name}</b><br>" +
      "Time: %{x}<br>" +
      "Value: %{y:.4f}<extra></extra>",
  };
}

function createMarkerTrace({
  x = [],
  y = [],
  name = "Point",
  color = TSChartColors.residual,
  size = 8,
  symbol = "circle",
}) {
  return {
    type: "scatter",
    mode: "markers",
    x,
    y,
    name,
    marker: {
      color,
      size,
      symbol,
      line: {
        width: 1,
        color: "#ffffff",
      },
    },
    hovertemplate:
      "<b>%{fullData.name}</b><br>" +
      "Time: %{x}<br>" +
      "Value: %{y:.4f}<extra></extra>",
  };
}

function createBarTrace({
  x = [],
  y = [],
  name = "Metric",
  color = TSChartColors.metric,
}) {
  return {
    type: "bar",
    x,
    y,
    name,
    marker: {
      color,
      line: {
        width: 0,
      },
    },
    hovertemplate:
      "<b>%{x}</b><br>" +
      "Value: %{y:.4f}<extra></extra>",
  };
}

/* =========================================================
   Confidence Interval Trace
   ========================================================= */

function createConfidenceIntervalTraces({
  x = [],
  lower = [],
  upper = [],
  color = "rgba(245, 159, 0, 0.18)",
  name = "Prediction Interval",
}) {
  const upperTrace = {
    type: "scatter",
    mode: "lines",
    x,
    y: upper,
    name: `${name} Upper`,
    line: {
      width: 0,
      color: "rgba(0,0,0,0)",
    },
    hoverinfo: "skip",
    showlegend: false,
  };

  const lowerTrace = {
    type: "scatter",
    mode: "lines",
    x,
    y: lower,
    name,
    fill: "tonexty",
    fillcolor: color,
    line: {
      width: 0,
      color: "rgba(0,0,0,0)",
    },
    hoverinfo: "skip",
    showlegend: true,
  };

  return [upperTrace, lowerTrace];
}

/* =========================================================
   렌더링 함수
   ========================================================= */

function renderPlot(element, traces = [], layout = {}, config = {}) {
  if (!element) return null;

  if (!isPlotlyReady()) {
    element.innerHTML =
      '<div class="chart-empty">Plotly 라이브러리를 불러오지 못했습니다.</div>';
    return null;
  }

  const finalLayout = {
    ...createBaseLayout(),
    ...layout,
  };

  const finalConfig = {
    ...createBaseConfig(),
    ...config,
  };

  return Plotly.react(element, traces, finalLayout, finalConfig);
}

function clearPlot(element) {
  if (!element) return;

  if (isPlotlyReady()) {
    Plotly.purge(element);
  }

  element.innerHTML = "";
}

function resizePlot(element) {
  if (!element || !isPlotlyReady()) return;

  Plotly.Plots.resize(element);
}

function resizeAllPlots() {
  if (!isPlotlyReady()) return;

  document.querySelectorAll(".plotly-chart").forEach((element) => {
    resizePlot(element);
  });
}

/* =========================================================
   Empty / Loading
   ========================================================= */

function showChartEmpty(element, message = "표시할 그래프가 없습니다.") {
  if (!element) return;

  element.innerHTML = `
    <div class="chart-empty">
      <p>${message}</p>
    </div>
  `;
}

function showChartLoading(element, message = "그래프를 생성하는 중입니다.") {
  if (!element) return;

  element.innerHTML = `
    <div class="chart-loading">
      <div class="chart-loading-dot"></div>
      <p>${message}</p>
    </div>
  `;
}

/* =========================================================
   Track → Trace 변환
   ========================================================= */

function trackToLineTrace(track) {
  if (!track) return null;

  return createLineTrace({
    x: track.x || [],
    y: track.y || [],
    name: track.name,
    color: getTrackColor(track),
    mode: track.type === "Forecast Data" ? "lines+markers" : "lines",
    dash: track.type === "Forecast Data" ? "dash" : "solid",
    visible: track.visible !== false,
    customdata: track.data || null,
  });
}

function tracksToTraces(tracks = []) {
  return tracks
    .filter((track) => track)
    .map((track) => trackToLineTrace(track))
    .filter(Boolean);
}

/* =========================================================
   축 범위 계산
   ========================================================= */

function getYRangeFromTraces(traces = [], paddingRatio = 0.08) {
  const values = [];

  traces.forEach((trace) => {
    if (!Array.isArray(trace.y)) return;

    trace.y.forEach((value) => {
      const number = TSMathUtils.toNumber(value);

      if (number !== null) values.push(number);
    });
  });

  if (values.length === 0) return null;

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = (maxValue - minValue) * paddingRatio || 1;

  return [minValue - padding, maxValue + padding];
}

/* =========================================================
   HTML Escape
   ========================================================= */

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSChartCore = {
  TSChartColors,

  isPlotlyReady,
  getTrackColor,

  createBaseLayout,
  createBaseConfig,

  createLineTrace,
  createMarkerTrace,
  createBarTrace,
  createConfidenceIntervalTraces,

  renderPlot,
  clearPlot,
  resizePlot,
  resizeAllPlots,

  showChartEmpty,
  showChartLoading,

  trackToLineTrace,
  tracksToTraces,

  getYRangeFromTraces,

  escapeHTML,
};