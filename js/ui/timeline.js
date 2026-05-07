/* =========================================================
   TS Navigator - timeline.js
   Track Timeline 렌더링 / Track 카드 / 자동분석 Track 생성 버튼
   ========================================================= */

/* =========================================================
   Timeline 전체 렌더링
   ========================================================= */

function renderTimeline() {
  const container = document.getElementById("trackTimeline");

  if (!container) return;

  container.innerHTML = `
    <div class="timeline-header">
      <div>
        <p class="section-kicker">TRACK TIMELINE</p>
        <h2 class="section-title">Tracks</h2>
      </div>

      <button 
        type="button" 
        class="timeline-add-button" 
        id="addTrackButton"
        title="새 Track 추가"
      >
        +
      </button>
    </div>

    <div class="timeline-actions">
      <button 
        type="button" 
        class="timeline-action-button primary"
        id="autoAnalysisButton"
      >
        자동분석
      </button>

      <button 
        type="button" 
        class="timeline-action-button"
        id="addRegionButtonInTimeline"
      >
        Region 추가
      </button>
    </div>

    <div class="timeline-track-list" id="timelineTrackList">
      ${createTimelineTrackListHTML()}
    </div>
  `;

  bindTimelineEvents();
}

/* =========================================================
   Track List HTML
   ========================================================= */

function createTimelineTrackListHTML() {
  if (!TSState.tracks || TSState.tracks.length === 0) {
    return `
      <div class="timeline-empty">
        <p>아직 생성된 Track이 없습니다.</p>
        <span>CSV 업로드 후 Original Data Track이 생성됩니다.</span>
      </div>
    `;
  }

  return TSState.tracks
    .map((track, index) => createTrackCardHTML(track, index))
    .join("");
}

/* =========================================================
   Track Card HTML
   ========================================================= */

function createTrackCardHTML(track, index) {
  const isSelected = TSState.selectedTrackId === track.id;
  const region = TSStore.getRegionById(track.regionId);

  return `
    <article 
      class="track-card ${isSelected ? "selected" : ""} ${
    track.visible === false ? "hidden-track" : ""
  }"
      data-track-id="${track.id}"
    >
      <div class="track-card-top">
        <div class="track-card-title-wrap">
          <span 
            class="track-color-dot" 
            style="background:${track.color || "#2f80ed"}"
          ></span>

          <div>
            <p class="track-index">Track ${String(index + 1).padStart(2, "0")}</p>
            <h3 class="track-name">${escapeTimelineHTML(track.name)}</h3>
          </div>
        </div>

        <button 
          type="button" 
          class="track-delete-button" 
          data-action="delete-track"
          data-track-id="${track.id}"
          title="Track 삭제"
        >
          ×
        </button>
      </div>

      <div class="track-meta">
        <span>${escapeTimelineHTML(track.type)}</span>
        <span>${escapeTimelineHTML(region?.name || "No Region")}</span>
      </div>

      <div class="track-mini-info">
        <span>${track.y?.length || 0} points</span>
        <span>${track.locked ? "Locked" : "Editable"}</span>
      </div>

      <div class="track-card-actions">
        <button 
          type="button" 
          class="track-chip ${track.visible !== false ? "active" : ""}"
          data-action="toggle-visible"
          data-track-id="${track.id}"
        >
          ${track.visible !== false ? "ON" : "OFF"}
        </button>

        <button 
          type="button" 
          class="track-chip"
          data-action="assign-region"
          data-track-id="${track.id}"
        >
          Region
        </button>

        <button 
          type="button" 
          class="track-chip"
          data-action="duplicate-track"
          data-track-id="${track.id}"
        >
          Copy
        </button>
      </div>
    </article>
  `;
}

/* =========================================================
   Timeline Event 연결
   ========================================================= */

function bindTimelineEvents() {
  const list = document.getElementById("timelineTrackList");
  const addTrackButton = document.getElementById("addTrackButton");
  const autoAnalysisButton = document.getElementById("autoAnalysisButton");
  const addRegionButton = document.getElementById("addRegionButtonInTimeline");

  if (list) {
    list.addEventListener("click", handleTimelineClick);
  }

  if (addTrackButton) {
    addTrackButton.addEventListener("click", handleAddTrack);
  }

  if (autoAnalysisButton) {
    autoAnalysisButton.addEventListener("click", handleAutoAnalysis);
  }

  if (addRegionButton) {
    addRegionButton.addEventListener("click", handleAddRegion);
  }
}

/* =========================================================
   Timeline Click Handler
   ========================================================= */

function handleTimelineClick(event) {
  const actionButton = event.target.closest("[data-action]");
  const trackCard = event.target.closest(".track-card");

  if (actionButton) {
    event.stopPropagation();

    const action = actionButton.dataset.action;
    const trackId = actionButton.dataset.trackId;

    handleTrackAction(action, trackId);
    return;
  }

  if (trackCard) {
    const trackId = trackCard.dataset.trackId;

    TSStore.selectTrack(trackId);

    refreshTimelineConnectedUI();
  }
}

/* =========================================================
   Track Action
   ========================================================= */

function handleTrackAction(action, trackId) {
  if (!trackId) return;

  switch (action) {
    case "toggle-visible":
      TSStore.toggleTrackVisibility(trackId);
      break;

    case "assign-region":
      openRegionAssignPrompt(trackId);
      break;

    case "duplicate-track":
      TSStore.duplicateTrack(trackId);
      break;

    case "delete-track":
      confirmDeleteTrack(trackId);
      break;

    default:
      break;
  }

  refreshTimelineConnectedUI();
}

function confirmDeleteTrack(trackId) {
  const track = TSStore.getTrackById(trackId);

  if (!track) return;

  const confirmed = window.confirm(`"${track.name}" Track을 삭제할까요?`);

  if (!confirmed) return;

  TSStore.deleteTrack(trackId);
}

/* =========================================================
   Region Assign
   ========================================================= */

function openRegionAssignPrompt(trackId) {
  const track = TSStore.getTrackById(trackId);

  if (!track) return;

  const regionListText = TSState.regions
    .map((region, index) => `${index + 1}. ${region.name}`)
    .join("\n");

  const input = window.prompt(
    `Track을 배치할 Region 번호를 입력하세요.\n\n${regionListText}`,
    "1"
  );

  if (input === null) return;

  const regionIndex = Number(input) - 1;
  const region = TSState.regions[regionIndex];

  if (!region) {
    alert("올바른 Region 번호를 입력해야 합니다.");
    return;
  }

  TSStore.assignTrackToRegion(trackId, region.id);
}

/* =========================================================
   Add Track
   ========================================================= */

function handleAddTrack() {
  const sourceTrack = TSStore.getSelectedTrack() || TSState.tracks[0];

  if (!sourceTrack) {
    alert("기준이 되는 Track이 없습니다. CSV 파일을 먼저 업로드하세요.");
    return;
  }

  const newTrack = TSStore.duplicateTrack(sourceTrack.id);

  if (newTrack) {
    TSStore.renameTrack(newTrack.id, `${sourceTrack.name} Manual Copy`);
  }

  refreshTimelineConnectedUI();
}

/* =========================================================
   Add Region
   ========================================================= */

function handleAddRegion() {
  TSStore.createRegion();

  refreshTimelineConnectedUI();
}

/* =========================================================
   자동분석
   1차 수정안 반영:
   자동분석 클릭 시 자동분석 Track 생성
   검증 결과 + 예측 + 기존 그래프가 함께 표시될 수 있도록 구성
   ========================================================= */

function handleAutoAnalysis() {
  const sourceTrack = getAutoAnalysisSourceTrack();

  if (!sourceTrack) {
    alert("자동분석을 실행할 Track이 없습니다.");
    return;
  }

  const autoResult = runTimelineAutoAnalysis(sourceTrack.id);

  if (!autoResult) {
    alert("자동분석 중 오류가 발생했습니다.");
    return;
  }

  TSStore.setAutoAnalysisResult(autoResult);

  if (autoResult.createdTrackIds) {
    autoResult.createdTrackIds.forEach((trackId) => {
      TSStore.addAutoAnalysisTrackId(trackId);
    });
  }

  refreshTimelineConnectedUI();
}

function getAutoAnalysisSourceTrack() {
  const selectedTrack = TSStore.getSelectedTrack();

  if (selectedTrack && selectedTrack.type !== "Evaluation Result") {
    return selectedTrack;
  }

  return (
    TSState.tracks.find((track) => track.type === "Original Data") ||
    TSState.tracks.find((track) => track.type === "Preprocessed Data") ||
    TSState.tracks[0] ||
    null
  );
}

function runTimelineAutoAnalysis(sourceTrackId) {
  const createdTrackIds = [];

  const preprocessingResult = TSPreprocessing.runAutoPreprocessing(sourceTrackId);

  const preprocessedTrack =
    preprocessingResult?.track || TSStore.getTrackById(sourceTrackId);

  if (preprocessingResult?.track) {
    createdTrackIds.push(preprocessingResult.track.id);
  }

  let decompositionResult = null;

  if (preprocessedTrack && preprocessedTrack.y.length >= 12) {
    decompositionResult = TSDecomposition.runAutoDecomposition(preprocessedTrack.id);

    if (decompositionResult?.tracks) {
      decompositionResult.tracks.forEach((track) => {
        createdTrackIds.push(track.id);
      });
    }
  }

  const forecastingResult = TSForecasting.runAutoForecasting(preprocessedTrack.id);

  if (forecastingResult?.track) {
    createdTrackIds.push(forecastingResult.track.id);
  }

  let metricResult = null;

  if (forecastingResult?.result) {
    metricResult = TSMetrics.runAutoMetrics({
      sourceTrackId: preprocessedTrack.id,
      forecastResult: forecastingResult.result,
      regionId: preprocessedTrack.regionId,
    });

    if (metricResult?.track) {
      createdTrackIds.push(metricResult.track.id);
    }
  }

  const autoProcess = TSStore.createProcess({
    name: "Auto Analysis",
    type: "auto-analysis",
    trackId: sourceTrackId,
    parameters: {
      preprocessing: "auto",
      decomposition: "auto",
      forecasting: "auto",
      metrics: "auto",
    },
    status: "completed",
  });

  const autoTrack = createAutoAnalysisSummaryTrack({
    sourceTrackId,
    processId: autoProcess.id,
    preprocessingResult,
    decompositionResult,
    forecastingResult,
    metricResult,
  });

  if (autoTrack) {
    createdTrackIds.push(autoTrack.id);
    TSStore.updateProcess(autoProcess.id, {
      resultTrackId: autoTrack.id,
    });
  }

  return {
    processId: autoProcess.id,
    createdTrackIds,
    preprocessingResult,
    decompositionResult,
    forecastingResult,
    metricResult,
    summaryTrack: autoTrack,
    recommendation: createAutoAnalysisRecommendation({
      preprocessingResult,
      decompositionResult,
      forecastingResult,
      metricResult,
    }),
  };
}

/* =========================================================
   자동분석 Summary Track
   ========================================================= */

function createAutoAnalysisSummaryTrack({
  sourceTrackId,
  processId,
  preprocessingResult,
  decompositionResult,
  forecastingResult,
  metricResult,
}) {
  const sourceTrack = TSStore.getTrackById(sourceTrackId);

  if (!sourceTrack) return null;

  const forecastSeries = forecastingResult?.result?.futureSeries || [];

  const summaryData = forecastSeries.map((item, index) => ({
    date: item.date,
    value: item.value,
    lower: item.lower,
    upper: item.upper,
    autoAnalysis: true,
    index,
  }));

  return TSStore.createTrack({
    name: "Auto Analysis Result",
    type: "Forecast Data",
    data: summaryData,
    x: summaryData.map((item) => item.date),
    y: summaryData.map((item) => item.value),
    color: "#00a6a6",
    regionId: sourceTrack.regionId,
    processId,
    metadata: {
      sourceTrackId,
      processType: "auto-analysis",
      preprocessingReport: preprocessingResult?.result?.report || null,
      decompositionReport: decompositionResult?.result?.report || null,
      forecastingReport: forecastingResult?.result?.report || null,
      metricReport: metricResult?.result?.metrics || null,
      fittedSeries: forecastingResult?.result?.fittedSeries || [],
      futureSeries: forecastingResult?.result?.futureSeries || [],
      report: {
        message:
          "자동분석으로 전처리, 분해, 예측, 평가지표 계산을 한 번에 수행했습니다.",
      },
    },
  });
}

function createAutoAnalysisRecommendation({
  preprocessingResult,
  decompositionResult,
  forecastingResult,
  metricResult,
}) {
  const recommendations = [];

  if (preprocessingResult?.result?.report?.missing) {
    recommendations.push({
      title: "전처리",
      message: preprocessingResult.result.report.missing.message,
    });
  }

  if (decompositionResult?.result?.report) {
    recommendations.push({
      title: "분해",
      message: decompositionResult.result.report.message,
    });
  }

  if (forecastingResult?.result?.report) {
    recommendations.push({
      title: "예측",
      message: forecastingResult.result.report.message,
    });
  }

  if (metricResult?.result?.metrics) {
    const metrics = metricResult.result.metrics;

    recommendations.push({
      title: "검증 결과",
      message: `MAE ${TSMathUtils.formatNumber(metrics.mae, 4)}, RMSE ${TSMathUtils.formatNumber(
        metrics.rmse,
        4
      )}, MAPE ${TSMathUtils.formatNumber(metrics.mape, 4)}%`,
    });
  }

  return recommendations;
}

/* =========================================================
   연결 UI 새로고침
   ========================================================= */

function refreshTimelineConnectedUI() {
  renderTimeline();

  if (window.TSInspectorUI) {
    TSInspectorUI.renderInspector();
  }

  if (window.TSRegionsUI) {
    TSRegionsUI.renderRegions();
  }

  if (window.TSChartInteraction) {
    TSChartInteraction.bindAllChartInteractions();
  }
}

/* =========================================================
   HTML Escape
   ========================================================= */

function escapeTimelineHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSTimelineUI = {
  renderTimeline,

  createTimelineTrackListHTML,
  createTrackCardHTML,

  bindTimelineEvents,
  handleTimelineClick,
  handleTrackAction,

  confirmDeleteTrack,
  openRegionAssignPrompt,

  handleAddTrack,
  handleAddRegion,

  handleAutoAnalysis,
  getAutoAnalysisSourceTrack,
  runTimelineAutoAnalysis,

  createAutoAnalysisSummaryTrack,
  createAutoAnalysisRecommendation,

  refreshTimelineConnectedUI,
};