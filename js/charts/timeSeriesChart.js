/* =========================================================
   TS Navigator - timeSeriesChart.js
   시계열 라인 그래프 렌더링
   ========================================================= */

/* =========================================================
   단일 Track 시계열 그래프
   ========================================================= */

function renderTimeSeriesChart({
  element,
  track,
  title = null,
  showRangeSlider = false,
  editable = true,
}) {
  if (!element || !track) {
    TSChartCore.showChartEmpty(element, "표시할 시계열 Track이 없습니다.");
    return null;
  }

  const trace = TSChartCore.trackToLineTrace(track);

  const layout = createTimeSeriesLayout({
    title: title || track.name,
    showRangeSlider,
  });

  const config = {
    ...TSChartCore.createBaseConfig(),
    editable,
  };

  return TSChartCore.renderPlot(element, [trace], layout, config);
}

/* =========================================================
   여러 Track 비교 그래프
   ========================================================= */

function renderMultiTrackTimeSeriesChart({
  element,
  tracks = [],
  title = "Time Series Comparison",
  showRangeSlider = false,
  editable = true,
}) {
  if (!element || tracks.length === 0) {
    TSChartCore.showChartEmpty(element, "표시할 Track이 없습니다.");
    return null;
  }

  const visibleTracks = tracks.filter((track) => track.visible !== false);

  if (visibleTracks.length === 0) {
    TSChartCore.showChartEmpty(element, "표시 중인 Track이 없습니다.");
    return null;
  }

  const traces = TSChartCore.tracksToTraces(visibleTracks);

  const layout = createTimeSeriesLayout({
    title,
    showRangeSlider,
  });

  const yRange = TSChartCore.getYRangeFromTraces(traces);

  if (yRange) {
    layout.yaxis.range = yRange;
  }

  const config = {
    ...TSChartCore.createBaseConfig(),
    editable,
  };

  return TSChartCore.renderPlot(element, traces, layout, config);
}

/* =========================================================
   Region 기준 시계열 그래프
   ========================================================= */

function renderRegionTimeSeriesChart({
  element,
  regionId,
  title = null,
}) {
  const region = TSStore.getRegionById(regionId);

  if (!region) {
    TSChartCore.showChartEmpty(element, "Region을 찾을 수 없습니다.");
    return null;
  }

  const tracks = region.trackIds
    .map((trackId) => TSStore.getTrackById(trackId))
    .filter(Boolean)
    .filter((track) => track.type !== "Evaluation Result");

  return renderMultiTrackTimeSeriesChart({
    element,
    tracks,
    title: title || region.name,
    showRangeSlider: true,
    editable: true,
  });
}

/* =========================================================
   전체 Region 다시 렌더링
   ========================================================= */

function renderAllRegionTimeSeriesCharts() {
  document.querySelectorAll("[data-region-chart]").forEach((element) => {
    const regionId = element.dataset.regionChart;

    renderRegionTimeSeriesChart({
      element,
      regionId,
    });
  });
}

/* =========================================================
   Time Series Layout
   ========================================================= */

function createTimeSeriesLayout({
  title = "Time Series",
  showRangeSlider = false,
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
    rangeselector: {
      buttons: [
        {
          count: 7,
          label: "7D",
          step: "day",
          stepmode: "backward",
        },
        {
          count: 1,
          label: "1M",
          step: "month",
          stepmode: "backward",
        },
        {
          count: 3,
          label: "3M",
          step: "month",
          stepmode: "backward",
        },
        {
          step: "all",
          label: "ALL",
        },
      ],
      font: {
        size: 10,
      },
    },
  };

  return layout;
}

/* =========================================================
   Track Type별 시각화 Trace 보정
   ========================================================= */

function createTimeSeriesTraceByTrackType(track) {
  if (!track) return null;

  const baseTrace = TSChartCore.trackToLineTrace(track);

  if (track.type === "Original Data") {
    baseTrace.mode = "lines+markers";
    baseTrace.marker.size = 5;
  }

  if (track.type === "Preprocessed Data") {
    baseTrace.mode = "lines";
    baseTrace.line.width = 2.4;
  }

  if (track.type === "Feature Data") {
    baseTrace.mode = "lines";
    baseTrace.line.dash = "dot";
  }

  if (track.type === "Residual Data") {
    baseTrace.mode = "lines+markers";
    baseTrace.line.dash = "dash";
    baseTrace.marker.size = 4;
  }

  return baseTrace;
}

function tracksToTimeSeriesTraces(tracks = []) {
  return tracks
    .filter(Boolean)
    .filter((track) => track.visible !== false)
    .map((track) => createTimeSeriesTraceByTrackType(track))
    .filter(Boolean);
}

/* =========================================================
   원본 + 처리 결과 비교 그래프
   ========================================================= */

function renderBeforeAfterChart({
  element,
  beforeTrack,
  afterTrack,
  title = "Before / After",
}) {
  if (!beforeTrack || !afterTrack) {
    TSChartCore.showChartEmpty(element, "비교할 Track이 부족합니다.");
    return null;
  }

  const beforeTrace = createTimeSeriesTraceByTrackType(beforeTrack);
  const afterTrace = createTimeSeriesTraceByTrackType(afterTrack);

  beforeTrace.name = `Before - ${beforeTrack.name}`;
  beforeTrace.line.dash = "dot";

  afterTrace.name = `After - ${afterTrack.name}`;
  afterTrace.line.width = 2.8;

  const layout = createTimeSeriesLayout({
    title,
    showRangeSlider: true,
  });

  return TSChartCore.renderPlot(element, [beforeTrace, afterTrace], layout);
}

/* =========================================================
   이상치 표시 그래프
   ========================================================= */

function renderOutlierChart({
  element,
  track,
  title = "Outlier Detection",
}) {
  if (!track) {
    TSChartCore.showChartEmpty(element, "Track이 없습니다.");
    return null;
  }

  const baseTrace = createTimeSeriesTraceByTrackType(track);

  const outlierPoints = (track.data || []).filter((item) => item.isOutlier);

  const outlierTrace = TSChartCore.createMarkerTrace({
    x: outlierPoints.map((item) => item.date),
    y: outlierPoints.map((item) => item.originalValue ?? item.value),
    name: "Outlier",
    color: TSChartCore.TSChartColors.residual,
    size: 9,
    symbol: "x",
  });

  const layout = createTimeSeriesLayout({
    title,
    showRangeSlider: true,
  });

  return TSChartCore.renderPlot(element, [baseTrace, outlierTrace], layout);
}

/* =========================================================
   결측치 보간 표시 그래프
   ========================================================= */

function renderMissingFilledChart({
  element,
  track,
  title = "Missing Value Filled",
}) {
  if (!track) {
    TSChartCore.showChartEmpty(element, "Track이 없습니다.");
    return null;
  }

  const baseTrace = createTimeSeriesTraceByTrackType(track);

  const filledPoints = (track.data || []).filter((item) => item.missingFilled);

  const filledTrace = TSChartCore.createMarkerTrace({
    x: filledPoints.map((item) => item.date),
    y: filledPoints.map((item) => item.value),
    name: "Filled Missing",
    color: TSChartCore.TSChartColors.auto,
    size: 8,
    symbol: "diamond",
  });

  const layout = createTimeSeriesLayout({
    title,
    showRangeSlider: true,
  });

  return TSChartCore.renderPlot(element, [baseTrace, filledTrace], layout);
}

/* =========================================================
   선택 Track 강조
   ========================================================= */

function highlightSelectedTrackInChart(element, selectedTrackId) {
  if (!element || !TSChartCore.isPlotlyReady()) return;

  const traces = element.data || [];

  const widths = traces.map((trace) => {
    const track = TSState.tracks.find((item) => item.name === trace.name);

    if (track && track.id === selectedTrackId) {
      return 4;
    }

    return 2;
  });

  Plotly.restyle(element, {
    "line.width": widths,
  });
}

/* =========================================================
   Chart 클릭 이벤트 연결
   ========================================================= */

function bindTimeSeriesChartEvents(element) {
  if (!element || !TSChartCore.isPlotlyReady()) return;

  element.on("plotly_click", (eventData) => {
    if (!eventData.points || eventData.points.length === 0) return;

    const point = eventData.points[0];
    const trackName = point.data.name;

    const track = TSState.tracks.find((item) => item.name === trackName);

    if (track) {
      TSStore.selectTrack(track.id);

      if (window.TSInspectorUI) {
        TSInspectorUI.renderInspector();
      }

      highlightSelectedTrackInChart(element, track.id);
    }
  });
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSTimeSeriesChart = {
  renderTimeSeriesChart,
  renderMultiTrackTimeSeriesChart,
  renderRegionTimeSeriesChart,
  renderAllRegionTimeSeriesCharts,

  createTimeSeriesLayout,
  createTimeSeriesTraceByTrackType,
  tracksToTimeSeriesTraces,

  renderBeforeAfterChart,
  renderOutlierChart,
  renderMissingFilledChart,

  highlightSelectedTrackInChart,
  bindTimeSeriesChartEvents,
};