/* =========================================================
   TS Navigator - interaction.js
   ---------------------------------------------------------
   역할
   1. 시계열 그래프 상호작용 관리
   2. 점 클릭 → 값 수정
   3. 마커 클릭 → 결측/이상치 값 수정
   4. Region focus / reset
   5. Chart tooltip 표시
   6. Track 수정 후 Region / Timeline / Inspector 갱신
========================================================= */

/* =========================================================
   1. 기본 상태
========================================================= */

const TSChartInteractionState = {
  activeTooltip: null,
  activeRegionId: null,
  activeTrackId: null,
  editable: true,
  tooltipEnabled: true
};

/* =========================================================
   2. 초기화
========================================================= */

function initChartInteraction() {
  injectInteractionStyle();
  bindGlobalChartEvents();
}

function bindGlobalChartEvents() {
  document.addEventListener("click", handleGlobalChartClick);
  document.addEventListener("mousemove", handleGlobalChartMouseMove);
  document.addEventListener("mouseleave", hideTooltip, true);
  document.addEventListener("keydown", handleChartShortcut);
}

/* =========================================================
   3. 전역 클릭 처리
========================================================= */

function handleGlobalChartClick(event) {
  const chartPoint = event.target.closest(".chart-point");
  const marker = event.target.closest(".ts-marker");
  const region = event.target.closest(".region");
  const focusButton = event.target.closest("[data-action='focus-region']");

  if (chartPoint) {
    handleChartPointClick(chartPoint);
    return;
  }

  if (marker) {
    handleChartMarkerClick(marker);
    return;
  }

  if (focusButton) {
    const regionId = focusButton.dataset.regionId;
    toggleRegionFocus(regionId);
    return;
  }

  if (region) {
    const regionId = region.dataset.regionId;
    selectRegionForInteraction(regionId);
  }
}

/* =========================================================
   4. 점 클릭 → 값 수정
========================================================= */

function handleChartPointClick(pointElement) {
  if (!TSChartInteractionState.editable) return;

  const trackId = pointElement.dataset.seriesId;
  const pointIndex = Number(pointElement.dataset.pointIndex);

  if (!trackId || !Number.isFinite(pointIndex)) return;

  const track = window.TSStore?.getTrack(trackId);
  if (!track) return;

  const pointInfo = findPointInfo(track, pointIndex);
  if (!pointInfo) return;

  openValueEditPrompt({
    track,
    rowIndex: pointInfo.rowIndex,
    currentValue: pointInfo.value,
    reason: "point"
  });
}

function handleChartMarkerClick(markerElement) {
  if (!TSChartInteractionState.editable) return;

  const trackId = markerElement.dataset.trackId;
  const rowIndex = Number(markerElement.dataset.rowIndex);
  const markerType = markerElement.dataset.markerType || "marker";

  if (!trackId || !Number.isFinite(rowIndex)) return;

  const track = window.TSStore?.getTrack(trackId);
  if (!track || !track.data?.[rowIndex]) return;

  const targetColumn = getTargetColumn(track);
  const currentValue = track.data[rowIndex]?.[targetColumn];

  openValueEditPrompt({
    track,
    rowIndex,
    currentValue,
    reason: markerType
  });
}

function openValueEditPrompt({ track, rowIndex, currentValue, reason }) {
  const targetColumn = getTargetColumn(track);

  if (!targetColumn) {
    alert("target column을 찾지 못했습니다.");
    return;
  }

  const titleMap = {
    point: "시계열 값 수정",
    missing: "결측값 수정",
    outlier: "이상치 수정",
    edited: "수정값 재수정"
  };

  const input = prompt(
    `${titleMap[reason] || "값 수정"}\n` +
    `Track: ${track.name}\n` +
    `Column: ${targetColumn}\n` +
    `현재 값: ${currentValue}\n\n` +
    `새 값을 입력하세요.`,
    String(currentValue ?? "")
  );

  if (input === null) return;

  const value = toNumber(input);

  if (!Number.isFinite(value)) {
    alert("숫자 값을 입력해야 합니다.");
    return;
  }

  updateTrackValue({
    trackId: track.id,
    rowIndex,
    targetColumn,
    value,
    reason
  });
}

/* =========================================================
   5. Track 값 수정
========================================================= */

function updateTrackValue({
  trackId,
  rowIndex,
  targetColumn,
  value,
  reason = "manual"
}) {
  const track = window.TSStore?.getTrack(trackId);
  if (!track || !Array.isArray(track.data)) return null;

  if (track.locked) {
    alert("잠긴 Track은 수정할 수 없습니다.");
    return null;
  }

  if (!track.data[rowIndex]) return null;

  const updatedRows = [...track.data];

  updatedRows[rowIndex] = {
    ...updatedRows[rowIndex],
    [targetColumn]: value,
    __edited: true,
    __editReason: reason,
    __editedAt: new Date().toISOString()
  };

  const updatedTrack = window.TSStore.commitTrackResult(trackId, {
    data: updatedRows,
    metadata: {
      ...track.metadata,
      lastEditedRowIndex: rowIndex,
      lastEditedColumn: targetColumn,
      lastEditedValue: value,
      lastEditedAt: new Date().toISOString()
    },
    result: {
      ...(track.result || {}),
      type: track.result?.type || "Time Series Edit",
      messages: [
        `${rowIndex + 1}번째 ${targetColumn} 값이 ${value}로 수정되었습니다.`,
        "값이 변경되었으므로 예측/평가지표는 재계산이 필요할 수 있습니다."
      ]
    }
  });

  markDependentTracksNeedRecalculation(trackId);
  refreshAfterInteraction("EDIT_TRACK_VALUE");

  return updatedTrack;
}

function markDependentTracksNeedRecalculation(sourceTrackId) {
  if (!window.TSState?.tracks) return;

  window.TSState.tracks.forEach(track => {
    if (track.sourceTrackId === sourceTrackId) {
      track.metadata = {
        ...track.metadata,
        needRecalculation: true
      };

      track.result = {
        ...(track.result || {}),
        messages: [
          ...(track.result?.messages || []),
          "원본 Track 값이 수정되어 재계산이 필요합니다."
        ]
      };
    }
  });

  if (window.TSState?.project) {
    window.TSState.project.status = "need-recalculation";
  }
}

/* =========================================================
   6. Tooltip
========================================================= */

function handleGlobalChartMouseMove(event) {
  if (!TSChartInteractionState.tooltipEnabled) return;

  const point = event.target.closest(".chart-point");
  const marker = event.target.closest(".ts-marker");

  if (point) {
    showPointTooltip(point, event);
    return;
  }

  if (marker) {
    showMarkerTooltip(marker, event);
    return;
  }

  hideTooltip();
}

function showPointTooltip(pointElement, event) {
  const trackId = pointElement.dataset.seriesId;
  const pointIndex = Number(pointElement.dataset.pointIndex);
  const x = Number(pointElement.dataset.x);
  const y = Number(pointElement.dataset.y);

  const track = window.TSStore?.getTrack(trackId);
  const trackName = track?.name || "Series";

  const dateText = formatTooltipX(x);
  const valueText = formatNumber(y, 4);

  showTooltip(
    `
      <strong>${escapeHTML(trackName)}</strong><br />
      Date: ${escapeHTML(dateText)}<br />
      Value: ${valueText}<br />
      Point: ${pointIndex + 1}
    `,
    event.clientX,
    event.clientY
  );
}

function showMarkerTooltip(markerElement, event) {
  const trackId = markerElement.dataset.trackId;
  const rowIndex = Number(markerElement.dataset.rowIndex);
  const markerType = markerElement.dataset.markerType;

  const track = window.TSStore?.getTrack(trackId);
  const targetColumn = getTargetColumn(track);
  const value = track?.data?.[rowIndex]?.[targetColumn];

  showTooltip(
    `
      <strong>${escapeHTML(markerType || "marker")}</strong><br />
      Track: ${escapeHTML(track?.name || "-")}<br />
      Row: ${rowIndex + 1}<br />
      Value: ${escapeHTML(value ?? "-")}
    `,
    event.clientX,
    event.clientY
  );
}

function showTooltip(html, x, y) {
  let tooltip = TSChartInteractionState.activeTooltip;

  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    document.body.appendChild(tooltip);
    TSChartInteractionState.activeTooltip = tooltip;
  }

  tooltip.innerHTML = html;
  tooltip.style.left = `${Math.min(x + 12, window.innerWidth - 190)}px`;
  tooltip.style.top = `${Math.min(y + 12, window.innerHeight - 110)}px`;
  tooltip.style.display = "block";
}

function hideTooltip() {
  const tooltip = TSChartInteractionState.activeTooltip;

  if (tooltip) {
    tooltip.style.display = "none";
  }
}

/* =========================================================
   7. Region Focus / Select
========================================================= */

function selectRegionForInteraction(regionId) {
  if (!regionId || !window.TSState) return;

  TSChartInteractionState.activeRegionId = regionId;
  window.TSState.selectedRegionId = regionId;

  document.querySelectorAll(".region").forEach(region => {
    region.classList.toggle("selected", region.dataset.regionId === regionId);
  });

  if (window.TSLayout) {
    window.TSLayout.saveWorkspaceState();
  }
}

function toggleRegionFocus(regionId) {
  if (!regionId) return;

  const currentFocus = TSChartInteractionState.activeRegionId;
  const shouldReset = currentFocus === regionId && document.querySelector(".region.focused");

  if (shouldReset) {
    resetRegionFocus();
    return;
  }

  TSChartInteractionState.activeRegionId = regionId;

  document.querySelectorAll(".region").forEach(region => {
    const isTarget = region.dataset.regionId === regionId;

    region.classList.toggle("focused", isTarget);
    region.classList.toggle("dimmed", !isTarget);
  });
}

function resetRegionFocus() {
  TSChartInteractionState.activeRegionId = null;

  document.querySelectorAll(".region").forEach(region => {
    region.classList.remove("focused");
    region.classList.remove("dimmed");
  });
}

/* =========================================================
   8. 단축키
========================================================= */

function handleChartShortcut(event) {
  if (event.key === "Escape") {
    hideTooltip();
    resetRegionFocus();
  }

  if (event.key.toLowerCase() === "e" && event.altKey) {
    TSChartInteractionState.editable = !TSChartInteractionState.editable;
    showTemporaryToast(
      TSChartInteractionState.editable
        ? "Chart edit mode ON"
        : "Chart edit mode OFF"
    );
  }

  if (event.key.toLowerCase() === "t" && event.altKey) {
    TSChartInteractionState.tooltipEnabled = !TSChartInteractionState.tooltipEnabled;
    hideTooltip();

    showTemporaryToast(
      TSChartInteractionState.tooltipEnabled
        ? "Tooltip ON"
        : "Tooltip OFF"
    );
  }
}

/* =========================================================
   9. Point 정보 찾기
========================================================= */

function findPointInfo(track, pointIndex) {
  if (!track) return null;

  if (window.TSTimeSeriesChart) {
    const series = window.TSTimeSeriesChart.createSeriesFromTrack(track);
    const point = series.points[pointIndex];

    if (point) {
      return {
        rowIndex: point.rowIndex,
        value: point.y,
        point
      };
    }
  }

  const targetColumn = getTargetColumn(track);
  const row = track.data?.[pointIndex];

  if (!row || !targetColumn) return null;

  return {
    rowIndex: pointIndex,
    value: row[targetColumn],
    point: null
  };
}

/* =========================================================
   10. Refresh
========================================================= */

function refreshAfterInteraction(actionName) {
  hideTooltip();

  if (window.TSLayout) {
    window.TSLayout.dispatchStateChange(actionName);
    return;
  }

  if (window.TSRegionUI) window.TSRegionUI.renderRegions();
  if (window.TSTimelineUI) window.TSTimelineUI.renderTimeline();
  if (window.TSInspectorUI) window.TSInspectorUI.renderInspector();
}

/* =========================================================
   11. Toast
========================================================= */

function showTemporaryToast(message) {
  let toast = document.getElementById("ts-interaction-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ts-interaction-toast";
    toast.className = "interaction-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1400);
}

/* =========================================================
   12. Column / Format 보조
========================================================= */

function getTargetColumn(track) {
  return (
    track?.metadata?.targetColumn ||
    window.TSState?.dataset?.targetColumn ||
    null
  );
}

function toNumber(value) {
  if (window.TSMathUtils) {
    return window.TSMathUtils.toNumber(value);
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function formatTooltipX(value) {
  if (!Number.isFinite(value)) return "-";

  if (value > 100000000000) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }
  }

  return String(value);
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
   13. 스타일 주입
========================================================= */

function injectInteractionStyle() {
  if (document.getElementById("ts-chart-interaction-style")) return;

  const style = document.createElement("style");
  style.id = "ts-chart-interaction-style";
  style.textContent = `
    .chart-point,
    .ts-marker {
      cursor: pointer;
    }

    .chart-point:hover {
      filter: drop-shadow(0 0 4px rgba(255,255,255,.5));
    }

    .region.focused {
      position: relative;
      z-index: 8;
      transform: scale(1.01);
      transition: transform .16s ease, opacity .16s ease;
    }

    .region.dimmed {
      opacity: .32;
      transition: opacity .16s ease;
    }

    .interaction-toast {
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translateX(-50%) translateY(12px);
      padding: 8px 12px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 999px;
      background: rgba(42,42,42,.96);
      color: #f1f1f1;
      font-size: 10px;
      opacity: 0;
      pointer-events: none;
      z-index: 90;
      box-shadow: 0 14px 34px rgba(0,0,0,.38);
      transition: opacity .18s ease, transform .18s ease;
    }

    .interaction-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   14. 외부 접근용 객체
========================================================= */

window.TSChartInteraction = {
  state: TSChartInteractionState,

  initChartInteraction,
  updateTrackValue,

  handleChartPointClick,
  handleChartMarkerClick,

  selectRegionForInteraction,
  toggleRegionFocus,
  resetRegionFocus,

  showTooltip,
  hideTooltip,
  showTemporaryToast
};

/* =========================================================
   15. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initChartInteraction();
});