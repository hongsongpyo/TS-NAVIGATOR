/* =========================================================
   TS Navigator - timeSeriesChart.js
   ---------------------------------------------------------
   역할
   1. 원본 / 전처리 / Feature Track 시계열 그래프 생성
   2. Track 데이터를 ChartCore series 형태로 변환
   3. 하나의 Region 안에서 여러 Track 비교 표시
   4. 결측치 / 이상치 / 수정 지점 marker 표시
   5. 점 클릭 기반 값 수정 기능의 기반 제공
========================================================= */

/* =========================================================
   1. 기본 설정
========================================================= */

const TSTimeSeriesChartConfig = {
  showPoints: true,
  showLegend: true,
  showBadge: true,
  showXLabels: true,
  showMissingMarkers: true,
  showOutlierMarkers: true,
  editable: true
};

/* =========================================================
   2. Region용 시계열 차트 생성
========================================================= */

function createTimeSeriesChartForRegion(regionId, options = {}) {
  const tracks = getTracksForRegion(regionId);

  return createTimeSeriesChartFromTracks(tracks, options);
}

function createTimeSeriesChartFromTracks(tracks, options = {}) {
  const config = {
    ...TSTimeSeriesChartConfig,
    ...options
  };

  const visibleTracks = (tracks || []).filter(track => track.visible !== false);

  if (visibleTracks.length === 0) {
    return createEmptyTimeSeriesChartHTML();
  }

  const seriesList = visibleTracks
    .map((track, index) => createSeriesFromTrack(track, index))
    .filter(series => series.points.length > 0);

  if (seriesList.length === 0) {
    return createEmptyTimeSeriesChartHTML();
  }

  const chartOptions = {
    points: config.showPoints,
    legend: config.showLegend,
    showXLabels: config.showXLabels,
    area: false,
    includeZero: false,
    config: config.chartConfig || {}
  };

  const lineChartHTML = window.TSChartCore
    ? window.TSChartCore.createLineChart(seriesList, chartOptions)
    : createFallbackLineChart(seriesList);

  const markerHTML = createMarkerOverlayHTML(visibleTracks, seriesList, config);
  const badgeHTML = config.showBadge ? createTimeSeriesBadgeHTML(visibleTracks) : "";

  return `
    ${badgeHTML}
    <div class="ts-chart-layer" data-chart-type="time-series">
      ${lineChartHTML}
      ${markerHTML}
    </div>
  `;
}

/* =========================================================
   3. Track → Series 변환
========================================================= */

function createSeriesFromTrack(track, index = 0) {
  const datetimeColumn = getDatetimeColumn(track);
  const targetColumn = getTargetColumn(track);
  const rows = track.data || [];

  const points = rows
    .map((row, rowIndex) => {
      const date = parseTrackDate(row, datetimeColumn);
      const value = parseTrackValue(row, targetColumn);

      return {
        x: date ? date.getTime() : rowIndex,
        y: value,
        rowIndex,
        date,
        raw: row,
        isMissing: Boolean(row.__missingTimestamp) || !Number.isFinite(value),
        isEdited: Boolean(row.__edited),
        isOutlier: Boolean(row.__outlier)
      };
    })
    .filter(point => Number.isFinite(point.y));

  return {
    id: track.id,
    name: track.name || `Track ${index + 1}`,
    type: track.type || "Time Series",
    color: track.color || getDefaultColor(index),
    dashed: track.type === "Forecast Data",
    points,
    track
  };
}

function createMultipleSeriesFromRows(rows, columns, datetimeColumn, options = {}) {
  const targetColumns = columns.filter(column => column !== datetimeColumn);

  return targetColumns.map((targetColumn, index) => {
    const points = rows
      .map((row, rowIndex) => {
        const date = parseTrackDate(row, datetimeColumn);
        const value = parseTrackValue(row, targetColumn);

        return {
          x: date ? date.getTime() : rowIndex,
          y: value,
          rowIndex,
          date,
          raw: row
        };
      })
      .filter(point => Number.isFinite(point.y));

    return {
      id: `series_${targetColumn}`,
      name: targetColumn,
      type: "Time Series",
      color: getDefaultColor(index),
      dashed: false,
      points,
      targetColumn
    };
  });
}

/* =========================================================
   4. Marker Overlay
========================================================= */

function createMarkerOverlayHTML(tracks, seriesList, config) {
  if (!window.TSChartCore || (!config.showMissingMarkers && !config.showOutlierMarkers)) {
    return "";
  }

  const bounds = window.TSChartCore.calculateBounds(seriesList);
  const context = window.TSChartCore.createChartContext({}, bounds);

  const markers = [];

  tracks.forEach(track => {
    const series = createSeriesFromTrack(track);
    const allRows = track.data || [];
    const datetimeColumn = getDatetimeColumn(track);
    const targetColumn = getTargetColumn(track);

    allRows.forEach((row, rowIndex) => {
      const date = parseTrackDate(row, datetimeColumn);
      const value = parseTrackValue(row, targetColumn);

      if (!date && !Number.isFinite(value)) return;

      const xValue = date ? date.getTime() : rowIndex;
      const yValue = Number.isFinite(value) ? value : estimateMarkerY(series);

      if (!Number.isFinite(yValue)) return;

      if (config.showMissingMarkers && (row.__missingTimestamp || !Number.isFinite(value))) {
        markers.push(createMarkerSVG({
          x: xValue,
          y: yValue,
          context,
          type: "missing",
          trackId: track.id,
          rowIndex
        }));
      }

      if (config.showOutlierMarkers && row.__outlier) {
        markers.push(createMarkerSVG({
          x: xValue,
          y: yValue,
          context,
          type: "outlier",
          trackId: track.id,
          rowIndex
        }));
      }

      if (row.__edited) {
        markers.push(createMarkerSVG({
          x: xValue,
          y: yValue,
          context,
          type: "edited",
          trackId: track.id,
          rowIndex
        }));
      }
    });
  });

  if (markers.length === 0) return "";

  return `
    <svg
      class="ts-marker-overlay"
      viewBox="0 0 720 260"
      preserveAspectRatio="none"
    >
      ${markers.join("")}
    </svg>
  `;
}

function createMarkerSVG({ x, y, context, type, trackId, rowIndex }) {
  const cx = window.TSChartCore.scaleX(x, context);
  const cy = window.TSChartCore.scaleY(y, context);

  const markerClass = `ts-marker ${type}`;

  const labelMap = {
    missing: "M",
    outlier: "!",
    edited: "E"
  };

  return `
    <g
      class="${markerClass}"
      data-marker-type="${type}"
      data-track-id="${trackId}"
      data-row-index="${rowIndex}"
    >
      <circle cx="${cx}" cy="${cy}" r="5"></circle>
      <text x="${cx}" y="${cy + 3}" text-anchor="middle">${labelMap[type] || "•"}</text>
    </g>
  `;
}

function estimateMarkerY(series) {
  if (!series || !series.points || series.points.length === 0) return NaN;

  const values = series.points.map(point => point.y).filter(Number.isFinite);

  if (window.TSMathUtils) {
    return window.TSMathUtils.mean(values);
  }

  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

/* =========================================================
   5. Badge
========================================================= */

function createTimeSeriesBadgeHTML(tracks) {
  const latestTrack = getLatestTrack(tracks);

  if (!latestTrack) return "";

  const rowCount = latestTrack.data?.length || 0;
  const datetimeColumn = getDatetimeColumn(latestTrack) || "-";
  const targetColumn = getTargetColumn(latestTrack) || "-";
  const stackCount = latestTrack.analysisStack?.length || 0;

  return `
    <div class="result-badge">
      <strong>Time Series</strong><br />
      Track: ${escapeHTML(shortText(latestTrack.name, 24))}<br />
      Rows: ${rowCount}<br />
      Date/Target: ${escapeHTML(datetimeColumn)} / ${escapeHTML(targetColumn)}<br />
      Stack: ${stackCount} steps
    </div>
  `;
}

/* =========================================================
   6. 값 수정 기능 기반
========================================================= */

function attachTimeSeriesInteraction(container, options = {}) {
  if (!container) return;

  container.addEventListener("click", event => {
    const point = event.target.closest(".chart-point");
    const marker = event.target.closest(".ts-marker");

    if (point) {
      handlePointClick(point, options);
      return;
    }

    if (marker) {
      handleMarkerClick(marker, options);
    }
  });
}

function handlePointClick(pointElement, options = {}) {
  const seriesId = pointElement.dataset.seriesId;
  const pointIndex = Number(pointElement.dataset.pointIndex);
  const x = Number(pointElement.dataset.x);
  const y = Number(pointElement.dataset.y);

  if (!options.editable && !TSTimeSeriesChartConfig.editable) return;

  const track = window.TSStore?.getTrack(seriesId);
  if (!track) return;

  const series = createSeriesFromTrack(track);
  const point = series.points[pointIndex];

  if (!point) return;

  const newValue = prompt(
    `값을 수정하세요\n현재 값: ${formatNumber(point.y, 4)}`,
    String(point.y)
  );

  if (newValue === null) return;

  const parsedValue = window.TSMathUtils
    ? window.TSMathUtils.toNumber(newValue)
    : Number(newValue);

  if (!Number.isFinite(parsedValue)) {
    alert("숫자 값을 입력해야 합니다.");
    return;
  }

  updateTrackPointValue(track.id, point.rowIndex, parsedValue);
}

function handleMarkerClick(markerElement, options = {}) {
  const trackId = markerElement.dataset.trackId;
  const rowIndex = Number(markerElement.dataset.rowIndex);

  const track = window.TSStore?.getTrack(trackId);
  if (!track) return;

  const row = track.data?.[rowIndex];

  if (!row) return;

  const targetColumn = getTargetColumn(track);
  const currentValue = row[targetColumn];

  const newValue = prompt(
    `표시된 지점의 값을 수정하세요\n현재 값: ${currentValue}`,
    String(currentValue ?? "")
  );

  if (newValue === null) return;

  const parsedValue = window.TSMathUtils
    ? window.TSMathUtils.toNumber(newValue)
    : Number(newValue);

  if (!Number.isFinite(parsedValue)) {
    alert("숫자 값을 입력해야 합니다.");
    return;
  }

  updateTrackPointValue(trackId, rowIndex, parsedValue);
}

function updateTrackPointValue(trackId, rowIndex, value) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track) return;

  const targetColumn = getTargetColumn(track);
  if (!targetColumn) return;

  const updatedRows = [...track.data];

  updatedRows[rowIndex] = {
    ...updatedRows[rowIndex],
    [targetColumn]: value,
    __edited: true
  };

  window.TSStore.commitTrackResult(trackId, {
    data: updatedRows,
    metadata: {
      ...track.metadata,
      lastEditedRowIndex: rowIndex,
      lastEditedAt: new Date().toISOString()
    },
    result: {
      ...(track.result || {}),
      type: track.result?.type || "Time Series Edit",
      messages: [`${rowIndex + 1}번째 데이터 값이 ${value}로 수정되었습니다.`]
    }
  });

  if (window.TSLayout) {
    window.TSLayout.dispatchStateChange("EDIT_TIME_SERIES_POINT");
  }
}

/* =========================================================
   7. Track / Column 보조
========================================================= */

function getTracksForRegion(regionId) {
  const tracks = window.TSState?.tracks || [];

  return tracks.filter(track => track.regionId === regionId);
}

function getDatetimeColumn(track) {
  return (
    track?.metadata?.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn ||
    null
  );
}

function getTargetColumn(track) {
  return (
    track?.metadata?.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    null
  );
}

function parseTrackDate(row, datetimeColumn) {
  if (!row || !datetimeColumn) return null;

  if (window.TSDateUtils) {
    return window.TSDateUtils.parseDateValue(row[datetimeColumn]);
  }

  const date = new Date(row[datetimeColumn]);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTrackValue(row, targetColumn) {
  if (!row || !targetColumn) return NaN;

  if (window.TSMathUtils) {
    return window.TSMathUtils.toNumber(row[targetColumn]);
  }

  return Number(row[targetColumn]);
}

/* =========================================================
   8. Fallback Chart
========================================================= */

function createFallbackLineChart(seriesList) {
  return `
    <div class="empty-chart">
      ChartCore가 로드되지 않았습니다.
    </div>
  `;
}

function createEmptyTimeSeriesChartHTML() {
  return `
    <div class="empty-chart">
      <div class="empty-chart-title">No Time Series Data</div>
      <div class="empty-chart-sub">
        Track에 표시할 수 있는 시계열 데이터가 없습니다.
      </div>
    </div>
  `;
}

/* =========================================================
   9. 최신 Track
========================================================= */

function getLatestTrack(tracks) {
  if (!tracks || tracks.length === 0) return null;

  return [...tracks].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();

    return timeB - timeA;
  })[0];
}

/* =========================================================
   10. 스타일 주입
========================================================= */

function injectTimeSeriesChartStyle() {
  if (document.getElementById("ts-time-series-chart-style")) return;

  const style = document.createElement("style");
  style.id = "ts-time-series-chart-style";
  style.textContent = `
    .ts-chart-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .ts-marker-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .ts-marker {
      pointer-events: auto;
      cursor: pointer;
    }

    .ts-marker circle {
      fill: rgba(32,32,32,.94);
      stroke-width: 1.4;
    }

    .ts-marker text {
      fill: #f1f1f1;
      font-size: 7px;
      font-weight: 700;
    }

    .ts-marker.missing circle {
      stroke: #b9a17d;
    }

    .ts-marker.outlier circle {
      stroke: #c98282;
    }

    .ts-marker.edited circle {
      stroke: #76a878;
    }

    .empty-chart {
      height: 100%;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 5px;
      color: #9d9d9d;
      font-size: 10px;
      text-align: center;
    }

    .empty-chart-title {
      color: #d5d5d5;
      font-weight: 700;
    }

    .empty-chart-sub {
      color: #8d8d8d;
      font-size: 9px;
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   11. 유틸
========================================================= */

function getDefaultColor(index) {
  if (window.TSChartCore) {
    return window.TSChartCore.getDefaultSeriesColor(index);
  }

  const colors = [
    "#8d8d8d",
    "#76a878",
    "#9b8db7",
    "#b49a72",
    "#5b8fd6"
  ];

  return colors[index % colors.length];
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toFixed(digits);
}

function shortText(text, maxLength = 18) {
  const value = String(text ?? "");

  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength)}…`;
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

window.TSTimeSeriesChart = {
  config: TSTimeSeriesChartConfig,

  createTimeSeriesChartForRegion,
  createTimeSeriesChartFromTracks,

  createSeriesFromTrack,
  createMultipleSeriesFromRows,

  createMarkerOverlayHTML,
  attachTimeSeriesInteraction,

  updateTrackPointValue,

  getTracksForRegion,
  getDatetimeColumn,
  getTargetColumn,

  injectTimeSeriesChartStyle
};

/* =========================================================
   13. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  injectTimeSeriesChartStyle();
});