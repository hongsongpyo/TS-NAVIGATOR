/* =========================================================
   TS Navigator - state.js
   ---------------------------------------------------------
   역할
   1. 업로드 데이터 상태 관리
   2. Track / Region / Analysis Stack 관리
   3. Popup 파라미터 저장
   4. 마지막 업데이트 Track → Region 반영
   5. 모든 분석 모듈이 공유하는 중앙 상태 저장소
========================================================= */

/* =========================================================
   1. 기본 상수
========================================================= */

const TS_ANALYSIS_ITEMS = [
  "Structure",
  "Missing",
  "Outlier",
  "Resampling",
  "Smoothing",
  "Decomposition",
  "Stationarity",
  "Feature",
  "Forecast",
  "Validation",
  "Residual",
  "Metrics",
  "Compare",
  "Auto Analysis"
];

const TS_TRACK_TYPES = {
  ORIGINAL: "Original Data",
  PREPROCESSED: "Preprocessed Data",
  FEATURE: "Feature Data",
  FORECAST: "Forecast Data",
  RESIDUAL: "Residual Data",
  METRICS: "Evaluation Result",
  COMPARE: "Compare Result",
  AUTO: "Auto Analysis Result"
};

const TS_REGION_TYPES = {
  TIMESERIES: "time-series",
  FORECAST: "forecast",
  METRICS: "metrics",
  RESIDUAL: "residual",
  COMPARE: "compare"
};

const TS_PROJECT_STATUS = {
  EMPTY: "empty",
  READY: "ready",
  MODIFIED: "modified",
  NEED_RECALCULATION: "need-recalculation",
  SAVED: "saved"
};

/* =========================================================
   2. 중앙 상태 객체
========================================================= */

const TSState = {
  project: {
    name: "TS Navigator Project",
    status: TS_PROJECT_STATUS.EMPTY,
    createdAt: null,
    updatedAt: null
  },

  dataset: {
    fileName: null,
    rawText: null,
    rows: [],
    columns: [],
    datetimeColumn: null,
    targetColumn: null,
    frequency: null,
    isUploaded: false,
    structureSummary: null
  },

  tracks: [],
  regions: [],
  selectedTrackId: null,
  selectedRegionId: null,

  popup: {
    isOpen: false,
    mode: null,
    targetTrackId: null,
    targetStackId: null,
    analysisType: null,
    position: {
      x: 0,
      y: 0
    }
  },

  assistant: {
    isOpen: false,
    messages: []
  },

  history: []
};

/* =========================================================
   3. ID 생성
========================================================= */

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

/* =========================================================
   4. 상태 변경 기록
========================================================= */

function touchProject(status = TS_PROJECT_STATUS.MODIFIED) {
  TSState.project.status = status;
  TSState.project.updatedAt = new Date().toISOString();
}

function pushHistory(action, payload = {}) {
  TSState.history.push({
    id: createId("history"),
    action,
    payload,
    createdAt: new Date().toISOString()
  });

  if (TSState.history.length > 100) {
    TSState.history.shift();
  }
}

/* =========================================================
   5. 프로젝트 초기화
========================================================= */

function initProject() {
  const now = new Date().toISOString();

  TSState.project.createdAt = now;
  TSState.project.updatedAt = now;
  TSState.project.status = TS_PROJECT_STATUS.EMPTY;

  TSState.tracks = [];
  TSState.regions = [];
  TSState.selectedTrackId = null;
  TSState.selectedRegionId = null;
  TSState.history = [];

  createDefaultRegions();

  pushHistory("INIT_PROJECT");
}

/* =========================================================
   6. 데이터셋 상태 관리
========================================================= */

function setDataset(datasetInfo) {
  TSState.dataset = {
    ...TSState.dataset,
    ...datasetInfo,
    isUploaded: true
  };

  touchProject(TS_PROJECT_STATUS.READY);
  pushHistory("SET_DATASET", datasetInfo);
}

function clearDataset() {
  TSState.dataset = {
    fileName: null,
    rawText: null,
    rows: [],
    columns: [],
    datetimeColumn: null,
    targetColumn: null,
    frequency: null,
    isUploaded: false,
    structureSummary: null
  };

  TSState.tracks = [];
  TSState.selectedTrackId = null;

  touchProject(TS_PROJECT_STATUS.EMPTY);
  pushHistory("CLEAR_DATASET");
}

/* =========================================================
   7. Region 관리
========================================================= */

function createDefaultRegions() {
  TSState.regions = [
    createRegion("Region 01", TS_REGION_TYPES.TIMESERIES),
    createRegion("Region 02", TS_REGION_TYPES.FORECAST)
  ];

  TSState.selectedRegionId = TSState.regions[0].id;
}

function createRegion(name, type = TS_REGION_TYPES.TIMESERIES) {
  return {
    id: createId("region"),
    name,
    type,
    trackIds: [],
    layout: {
      row: 1,
      col: 1
    },
    options: {
      showLegend: true,
      showGrid: true,
      syncZoom: false
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function addRegion(type = TS_REGION_TYPES.TIMESERIES) {
  const regionNumber = TSState.regions.length + 1;
  const region = createRegion(`Region ${String(regionNumber).padStart(2, "0")}`, type);

  TSState.regions.push(region);
  TSState.selectedRegionId = region.id;

  touchProject();
  pushHistory("ADD_REGION", region);

  return region;
}

function removeRegion(regionId) {
  TSState.regions = TSState.regions.filter(region => region.id !== regionId);

  TSState.tracks.forEach(track => {
    if (track.regionId === regionId) {
      track.regionId = TSState.regions[0]?.id || null;
    }
  });

  if (TSState.selectedRegionId === regionId) {
    TSState.selectedRegionId = TSState.regions[0]?.id || null;
  }

  touchProject();
  pushHistory("REMOVE_REGION", { regionId });
}

function assignTrackToRegion(trackId, regionId) {
  const track = getTrack(trackId);
  const region = getRegion(regionId);

  if (!track || !region) return;

  TSState.regions.forEach(item => {
    item.trackIds = item.trackIds.filter(id => id !== trackId);
  });

  region.trackIds.push(trackId);
  region.updatedAt = new Date().toISOString();

  track.regionId = regionId;
  track.updatedAt = new Date().toISOString();

  TSState.selectedTrackId = trackId;
  TSState.selectedRegionId = regionId;

  touchProject();
  pushHistory("ASSIGN_TRACK_TO_REGION", { trackId, regionId });
}

function getRegion(regionId) {
  return TSState.regions.find(region => region.id === regionId) || null;
}

/* =========================================================
   8. Track 관리
========================================================= */

function createTrack({
  name,
  type = TS_TRACK_TYPES.PREPROCESSED,
  sourceTrackId = null,
  regionId = null,
  data = [],
  metadata = {}
}) {
  const targetRegionId = regionId || TSState.selectedRegionId || TSState.regions[0]?.id || null;

  const track = {
    id: createId("track"),
    name,
    type,
    sourceTrackId,
    regionId: targetRegionId,

    visible: true,
    locked: false,
    color: getDefaultTrackColor(type),

    data,
    metadata,

    analysisStack: [],
    result: null,
    metrics: null,
    residuals: null,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return track;
}

function addTrack(trackConfig) {
  const track = createTrack(trackConfig);

  TSState.tracks.push(track);
  TSState.selectedTrackId = track.id;

  if (track.regionId) {
    const region = getRegion(track.regionId);
    if (region && !region.trackIds.includes(track.id)) {
      region.trackIds.push(track.id);
    }
  }

  touchProject();
  pushHistory("ADD_TRACK", track);

  return track;
}

function createOriginalTrack(data = TSState.dataset.rows) {
  const track = addTrack({
    name: "Track 01 Original Data",
    type: TS_TRACK_TYPES.ORIGINAL,
    data,
    metadata: {
      fileName: TSState.dataset.fileName,
      datetimeColumn: TSState.dataset.datetimeColumn,
      targetColumn: TSState.dataset.targetColumn,
      frequency: TSState.dataset.frequency
    }
  });

  selectTrack(track.id);
  return track;
}

function updateTrack(trackId, updates = {}) {
  const track = getTrack(trackId);
  if (!track || track.locked) return null;

  Object.assign(track, updates, {
    updatedAt: new Date().toISOString()
  });

  TSState.selectedTrackId = trackId;

  touchProject();
  pushHistory("UPDATE_TRACK", { trackId, updates });

  return track;
}

function removeTrack(trackId) {
  TSState.tracks = TSState.tracks.filter(track => track.id !== trackId);

  TSState.regions.forEach(region => {
    region.trackIds = region.trackIds.filter(id => id !== trackId);
  });

  if (TSState.selectedTrackId === trackId) {
    TSState.selectedTrackId = TSState.tracks[0]?.id || null;
  }

  touchProject();
  pushHistory("REMOVE_TRACK", { trackId });
}

function duplicateTrack(trackId) {
  const track = getTrack(trackId);
  if (!track) return null;

  const duplicatedTrack = addTrack({
    name: `${track.name} Copy`,
    type: track.type,
    sourceTrackId: track.sourceTrackId,
    regionId: track.regionId,
    data: structuredCloneSafe(track.data),
    metadata: structuredCloneSafe(track.metadata)
  });

  duplicatedTrack.analysisStack = structuredCloneSafe(track.analysisStack);
  duplicatedTrack.result = structuredCloneSafe(track.result);
  duplicatedTrack.metrics = structuredCloneSafe(track.metrics);
  duplicatedTrack.residuals = structuredCloneSafe(track.residuals);

  touchProject();
  pushHistory("DUPLICATE_TRACK", { from: trackId, to: duplicatedTrack.id });

  return duplicatedTrack;
}

function selectTrack(trackId) {
  const track = getTrack(trackId);
  if (!track) return null;

  TSState.selectedTrackId = trackId;
  TSState.selectedRegionId = track.regionId;

  pushHistory("SELECT_TRACK", { trackId });

  return track;
}

function getTrack(trackId) {
  return TSState.tracks.find(track => track.id === trackId) || null;
}

function getSelectedTrack() {
  return getTrack(TSState.selectedTrackId);
}

function toggleTrackVisibility(trackId) {
  const track = getTrack(trackId);
  if (!track) return null;

  track.visible = !track.visible;
  track.updatedAt = new Date().toISOString();

  touchProject();
  pushHistory("TOGGLE_TRACK_VISIBILITY", { trackId, visible: track.visible });

  return track;
}

function lockTrack(trackId, locked = true) {
  const track = getTrack(trackId);
  if (!track) return null;

  track.locked = locked;
  track.updatedAt = new Date().toISOString();

  touchProject();
  pushHistory("LOCK_TRACK", { trackId, locked });

  return track;
}

/* =========================================================
   9. Analysis Stack 관리
========================================================= */

function createStackItem(analysisType, params = {}) {
  return {
    id: createId("stack"),
    analysisType,
    params,
    status: "ready",
    resultSummary: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function addAnalysisToTrack(trackId, analysisType, params = {}) {
  const track = getTrack(trackId);
  if (!track || track.locked) return null;

  if (!TS_ANALYSIS_ITEMS.includes(analysisType)) {
    console.warn(`Unknown analysis type: ${analysisType}`);
  }

  const stackItem = createStackItem(analysisType, params);

  track.analysisStack.push(stackItem);
  track.updatedAt = new Date().toISOString();

  TSState.selectedTrackId = trackId;

  touchProject(TS_PROJECT_STATUS.NEED_RECALCULATION);
  pushHistory("ADD_ANALYSIS_TO_TRACK", { trackId, stackItem });

  return stackItem;
}

function updateStackItem(trackId, stackId, updates = {}) {
  const track = getTrack(trackId);
  if (!track || track.locked) return null;

  const stackItem = track.analysisStack.find(item => item.id === stackId);
  if (!stackItem) return null;

  Object.assign(stackItem, updates, {
    updatedAt: new Date().toISOString()
  });

  track.updatedAt = new Date().toISOString();

  touchProject(TS_PROJECT_STATUS.NEED_RECALCULATION);
  pushHistory("UPDATE_STACK_ITEM", { trackId, stackId, updates });

  return stackItem;
}

function removeStackItem(trackId, stackId) {
  const track = getTrack(trackId);
  if (!track || track.locked) return;

  track.analysisStack = track.analysisStack.filter(item => item.id !== stackId);
  track.updatedAt = new Date().toISOString();

  touchProject(TS_PROJECT_STATUS.NEED_RECALCULATION);
  pushHistory("REMOVE_STACK_ITEM", { trackId, stackId });
}

function markStackItemDone(trackId, stackId, resultSummary = null) {
  return updateStackItem(trackId, stackId, {
    status: "done",
    resultSummary
  });
}

function markStackItemError(trackId, stackId, errorMessage) {
  return updateStackItem(trackId, stackId, {
    status: "error",
    resultSummary: errorMessage
  });
}

/* =========================================================
   10. 마지막 Track 업데이트 → Region 반영
========================================================= */

function commitTrackResult(trackId, resultPayload = {}) {
  const track = getTrack(trackId);
  if (!track || track.locked) return null;

  track.result = resultPayload.result || track.result;
  track.data = resultPayload.data || track.data;
  track.metrics = resultPayload.metrics || track.metrics;
  track.residuals = resultPayload.residuals || track.residuals;
  track.metadata = {
    ...track.metadata,
    ...(resultPayload.metadata || {})
  };
  track.updatedAt = new Date().toISOString();

  const region = getRegion(track.regionId);
  if (region) {
    if (!region.trackIds.includes(track.id)) {
      region.trackIds.push(track.id);
    }
    region.updatedAt = new Date().toISOString();
  }

  TSState.selectedTrackId = trackId;
  TSState.selectedRegionId = track.regionId;

  touchProject(TS_PROJECT_STATUS.MODIFIED);
  pushHistory("COMMIT_TRACK_RESULT", { trackId });

  return track;
}

/* =========================================================
   11. Popup 상태 관리
========================================================= */

function openAnalysisPopup({
  mode = "parameter",
  trackId = TSState.selectedTrackId,
  stackId = null,
  analysisType = null,
  x = 0,
  y = 0
}) {
  TSState.popup = {
    isOpen: true,
    mode,
    targetTrackId: trackId,
    targetStackId: stackId,
    analysisType,
    position: { x, y }
  };

  pushHistory("OPEN_ANALYSIS_POPUP", TSState.popup);
}

function closeAnalysisPopup() {
  TSState.popup.isOpen = false;
  pushHistory("CLOSE_ANALYSIS_POPUP");
}

function savePopupParams(params = {}) {
  const { targetTrackId, targetStackId, analysisType } = TSState.popup;

  if (!targetTrackId) return null;

  if (targetStackId) {
    return updateStackItem(targetTrackId, targetStackId, {
      params
    });
  }

  if (analysisType) {
    return addAnalysisToTrack(targetTrackId, analysisType, params);
  }

  return null;
}

/* =========================================================
   12. AI Assistant 상태
========================================================= */

function openAssistant() {
  TSState.assistant.isOpen = true;
  pushHistory("OPEN_ASSISTANT");
}

function closeAssistant() {
  TSState.assistant.isOpen = false;
  pushHistory("CLOSE_ASSISTANT");
}

function addAssistantMessage(role, content) {
  const message = {
    id: createId("msg"),
    role,
    content,
    createdAt: new Date().toISOString()
  };

  TSState.assistant.messages.push(message);
  pushHistory("ADD_ASSISTANT_MESSAGE", message);

  return message;
}

/* =========================================================
   13. 기본 파라미터
========================================================= */

function getDefaultParams(analysisType) {
  const params = {
    Structure: {
      datetimeColumn: "auto",
      targetColumn: "auto",
      parseDatetime: true,
      detectFrequency: true,
      handleDuplicateTimestamp: "mean"
    },

    Missing: {
      method: "linear",
      scope: "entire-series",
      limitDirection: "both",
      windowSize: 3
    },

    Outlier: {
      method: "hampel",
      windowSize: 7,
      threshold: 3,
      replaceWith: "linear-interpolation"
    },

    Resampling: {
      frequency: "auto",
      method: "asfreq",
      fillMethod: "interpolate"
    },

    Smoothing: {
      method: "moving-average",
      windowSize: 3,
      alpha: 0.3,
      trend: "none",
      seasonal: "none",
      seasonalPeriod: 12
    },

    Decomposition: {
      method: "STL",
      model: "additive",
      seasonalPeriod: 12,
      robust: true
    },

    Stationarity: {
      test: "ADF",
      alpha: 0.05,
      transform: "none",
      differencingOrder: 1,
      useLogTransform: false
    },

    Feature: {
      lagCount: 3,
      rollingWindow: 3,
      includeTimeFeatures: true,
      includeSeasonalFeatures: true
    },

    Forecast: {
      model: "exponential-smoothing",
      horizon: 12,
      testSize: 0.2,
      horizonType: "relative",
      trend: "additive",
      seasonal: "additive",
      seasonalPeriod: 12,
      arimaOrder: {
        p: 1,
        d: 1,
        q: 1
      }
    },

    Validation: {
      method: "train-test-split",
      testSize: 0.2,
      rollingWindow: 12,
      expanding: false
    },

    Residual: {
      calculateResidual: true,
      whiteNoiseTest: "ljung-box",
      lag: 12
    },

    Metrics: {
      metrics: ["MAE", "MSE", "RMSE", "MAPE", "SMAPE", "MASE"],
      zeroHandling: "safe"
    },

    Compare: {
      compareBy: "metrics",
      baselineTrackId: null,
      targetTrackIds: []
    },

    "Auto Analysis": {
      runStructure: true,
      runMissing: true,
      runOutlier: true,
      runStationarity: true,
      runForecast: true,
      runMetrics: true,
      modelSelection: "auto",
      horizon: 12
    }
  };

  return structuredCloneSafe(params[analysisType] || {});
}

/* =========================================================
   14. 색상 설정
========================================================= */

function getDefaultTrackColor(type) {
  const colorMap = {
    [TS_TRACK_TYPES.ORIGINAL]: "#8d8d8d",
    [TS_TRACK_TYPES.PREPROCESSED]: "#76a878",
    [TS_TRACK_TYPES.FEATURE]: "#9dbb9b",
    [TS_TRACK_TYPES.FORECAST]: "#9b8db7",
    [TS_TRACK_TYPES.RESIDUAL]: "#b49a72",
    [TS_TRACK_TYPES.METRICS]: "#5b8fd6",
    [TS_TRACK_TYPES.COMPARE]: "#afa4c5",
    [TS_TRACK_TYPES.AUTO]: "#b9a17d"
  };

  return colorMap[type] || "#8d8d8d";
}

/* =========================================================
   15. 안전 복사
========================================================= */

function structuredCloneSafe(value) {
  if (value === undefined || value === null) return value;

  try {
    return structuredClone(value);
  } catch (error) {
    return JSON.parse(JSON.stringify(value));
  }
}

/* =========================================================
   16. 외부 접근용 객체
========================================================= */

window.TSState = TSState;

window.TSStore = {
  constants: {
    TS_ANALYSIS_ITEMS,
    TS_TRACK_TYPES,
    TS_REGION_TYPES,
    TS_PROJECT_STATUS
  },

  initProject,

  setDataset,
  clearDataset,

  addRegion,
  removeRegion,
  getRegion,
  assignTrackToRegion,

  addTrack,
  createOriginalTrack,
  updateTrack,
  removeTrack,
  duplicateTrack,
  selectTrack,
  getTrack,
  getSelectedTrack,
  toggleTrackVisibility,
  lockTrack,

  addAnalysisToTrack,
  updateStackItem,
  removeStackItem,
  markStackItemDone,
  markStackItemError,

  commitTrackResult,

  openAnalysisPopup,
  closeAnalysisPopup,
  savePopupParams,

  openAssistant,
  closeAssistant,
  addAssistantMessage,

  getDefaultParams,
  createId,
  structuredCloneSafe
};

/* =========================================================
   17. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  if (!TSState.project.createdAt) {
    initProject();
  }
});