/* =========================================================
   TS Navigator - timeline.js
   ---------------------------------------------------------
   역할
   1. Track Timeline UI 렌더링
   2. Track 선택 / 삭제 / 표시 ON-OFF
   3. Track별 Region 배정
   4. + Track 버튼 처리
   5. 마지막 업데이트 Track이 Region에 표시되도록 상태 갱신
========================================================= */

/* =========================================================
   1. DOM 참조
========================================================= */

let timelineRoot = null;

/* =========================================================
   2. 초기화
========================================================= */

function initTimeline() {
  timelineRoot = document.querySelector(".timeline .panel-inner");

  if (!timelineRoot) {
    console.warn("Timeline 영역을 찾지 못했습니다.");
    return;
  }

  renderTimeline();
  bindTimelineEvents();
}

function bindTimelineEvents() {
  if (!timelineRoot) return;

  timelineRoot.addEventListener("click", handleTimelineClick);
  timelineRoot.addEventListener("change", handleTimelineChange);
}

/* =========================================================
   3. Timeline 렌더링
========================================================= */

function renderTimeline() {
  timelineRoot = document.querySelector(".timeline .panel-inner");

  if (!timelineRoot || !window.TSState) return;

  const tracks = window.TSState.tracks || [];

  timelineRoot.innerHTML = `
    <div class="timeline-head">
      <div class="panel-title" style="margin:0">Track Timeline</div>
      <button class="add-track" data-action="add-track">+ Track</button>
    </div>

    <div class="timeline-list">
      ${
        tracks.length > 0
          ? tracks.map((track, index) => createTrackCardHTML(track, index)).join("")
          : createEmptyTimelineHTML()
      }
    </div>
  `;
}

/* =========================================================
   4. Track Card 생성
========================================================= */

function createTrackCardHTML(track, index) {
  const selectedClass = track.id === window.TSState.selectedTrackId ? "selected" : "";
  const colorClass = getTrackColorClass(track);
  const toggleClass = track.visible ? "" : "off";
  const icon = getTrackIcon(track.type);
  const miniText = createTrackMiniText(track);

  return `
    <div
      class="track-card ${colorClass} ${selectedClass}"
      data-action="select-track"
      data-track-id="${track.id}"
      style="--track-color:${escapeHTML(track.color || "#8d8d8d")};"
    >
      <div class="track-icon">${icon}</div>

      <button
        class="track-close"
        data-action="delete-track"
        data-track-id="${track.id}"
        title="Delete Track"
      >
        ×
      </button>

      <div class="track-name">
        Track ${String(index + 1).padStart(2, "0")}<br />
        ${escapeHTML(getTrackDisplayName(track))}
      </div>

      <div class="track-mini">
        ${escapeHTML(miniText)}
      </div>

      <div class="track-control">
        <span
          class="toggle ${toggleClass}"
          data-action="toggle-visible"
          data-track-id="${track.id}"
          title="Track Visibility"
        ></span>

        <select
          data-action="change-region"
          data-track-id="${track.id}"
          title="Region Assignment"
        >
          ${createRegionOptions(track.regionId)}
        </select>
      </div>
    </div>
  `;
}

function createEmptyTimelineHTML() {
  return `
    <div class="track-card empty">
      <div class="track-icon">+</div>
      <div class="track-name">
        No Track<br />
        Upload CSV First
      </div>
      <div class="track-mini">
        Home에서 CSV 파일을 업로드하세요.
      </div>
    </div>
  `;
}

/* =========================================================
   5. 이벤트 처리
========================================================= */

function handleTimelineClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const trackId = target.dataset.trackId;

  if (action === "select-track") {
    selectTrackFromTimeline(trackId);
    return;
  }

  if (action === "toggle-visible") {
    event.stopPropagation();
    toggleTrackVisible(trackId);
    return;
  }

  if (action === "delete-track") {
    event.stopPropagation();
    deleteTrackFromTimeline(trackId);
    return;
  }

  if (action === "add-track") {
    createManualTrack();
  }
}

function handleTimelineChange(event) {
  const target = event.target;
  const action = target.dataset.action;
  const trackId = target.dataset.trackId;

  if (!action || !trackId) return;

  if (action === "change-region") {
    changeTrackRegion(trackId, target.value);
  }
}

/* =========================================================
   6. Track 선택 / 변경
========================================================= */

function selectTrackFromTimeline(trackId) {
  if (!window.TSStore) return;

  window.TSStore.selectTrack(trackId);
  refreshWorkspace("SELECT_TRACK");
}

function toggleTrackVisible(trackId) {
  if (!window.TSStore) return;

  window.TSStore.toggleTrackVisibility(trackId);
  refreshWorkspace("TOGGLE_TRACK_VISIBLE");
}

function deleteTrackFromTimeline(trackId) {
  if (!window.TSStore) return;

  window.TSStore.removeTrack(trackId);
  refreshWorkspace("DELETE_TRACK");
}

function changeTrackRegion(trackId, regionId) {
  if (!window.TSStore) return;

  window.TSStore.assignTrackToRegion(trackId, regionId);
  refreshWorkspace("CHANGE_TRACK_REGION");
}

/* =========================================================
   7. + Track 생성
========================================================= */

function createManualTrack() {
  if (!window.TSStore || !window.TSState) return;

  const selectedTrack = window.TSStore.getSelectedTrack();
  const sourceData = selectedTrack?.data || window.TSState.dataset?.rows || [];

  const trackNumber = (window.TSState.tracks?.length || 0) + 1;

  const newTrack = window.TSStore.addTrack({
    name: `Track ${String(trackNumber).padStart(2, "0")} Updated Analysis`,
    type: "Preprocessed Data",
    sourceTrackId: selectedTrack?.id || null,
    regionId: selectedTrack?.regionId || window.TSState.selectedRegionId,
    data: window.TSStore.structuredCloneSafe(sourceData),
    metadata: {
      createdBy: "manual",
      baseTrack: selectedTrack?.name || "dataset"
    }
  });

  window.TSStore.addAnalysisToTrack(
    newTrack.id,
    "Structure",
    window.TSStore.getDefaultParams("Structure")
  );

  window.TSStore.commitTrackResult(newTrack.id, {
    data: newTrack.data,
    metadata: {
      note: "Manual Track created from selected data"
    },
    result: {
      type: "Manual Track",
      messages: ["선택된 Track을 기준으로 새 분석 Track이 생성되었습니다."]
    }
  });

  refreshWorkspace("ADD_MANUAL_TRACK");
}

/* =========================================================
   8. Option 생성
========================================================= */

function createRegionOptions(selectedRegionId) {
  const regions = window.TSState?.regions || [];

  return regions
    .map(region => {
      const selected = region.id === selectedRegionId ? "selected" : "";
      return `
        <option value="${region.id}" ${selected}>
          ${escapeHTML(region.name)}
        </option>
      `;
    })
    .join("");
}

/* =========================================================
   9. Track 표시 텍스트
========================================================= */

function getTrackDisplayName(track) {
  if (!track) return "Unknown Track";

  const name = String(track.name || track.type || "Track");

  return name
    .replace(/^Track\s+\d+\s*/i, "")
    .trim() || track.type;
}

function createTrackMiniText(track) {
  if (!track) return "";

  if (track.result?.messages?.length > 0) {
    return track.result.messages[0];
  }

  if (track.analysisStack?.length > 0) {
    return track.analysisStack
      .map(item => item.analysisType)
      .join(" → ");
  }

  if (track.metadata?.fileName) {
    return track.metadata.fileName;
  }

  return track.type || "track";
}

function getTrackIcon(type) {
  const iconMap = {
    "Original Data": "~",
    "Preprocessed Data": "∿",
    "Feature Data": "ƒ",
    "Forecast Data": "↗",
    "Residual Data": "ε",
    "Evaluation Result": "▤",
    "Compare Result": "⇄",
    "Auto Analysis Result": "✦"
  };

  return iconMap[type] || "~";
}

function getTrackColorClass(track) {
  const type = track.type;

  if (type === "Preprocessed Data") return "green";
  if (type === "Forecast Data") return "purple";
  if (type === "Residual Data") return "amber";
  if (type === "Auto Analysis Result") return "amber";
  if (type === "Feature Data") return "green";
  if (type === "Evaluation Result") return "purple";

  return "";
}

/* =========================================================
   10. Workspace 새로고침
========================================================= */

function refreshWorkspace(actionName) {
  renderTimeline();

  if (window.TSLayout) {
    window.TSLayout.dispatchStateChange(actionName);
    return;
  }

  if (window.TSInspectorUI) {
    window.TSInspectorUI.renderInspector();
  }

  if (window.TSRegionUI) {
    window.TSRegionUI.renderRegions();
  }
}

/* =========================================================
   11. 유틸
========================================================= */

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

window.TSTimelineUI = {
  initTimeline,
  renderTimeline,

  createTrackCardHTML,
  createManualTrack,

  selectTrackFromTimeline,
  toggleTrackVisible,
  deleteTrackFromTimeline,
  changeTrackRegion
};

/* =========================================================
   13. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initTimeline();
});