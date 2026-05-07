/* =========================================================
   TS Navigator - state.js
   전역 상태 관리
   tracks, regions, processes, uploadedData, selectedTrack 관리
   ========================================================= */

const TSState = {
  /* ---------- 기본 상태 ---------- */
  app: {
    currentPage: "home",
    projectStatus: "empty", // empty, loaded, modified, saved, need-recalculate
    inspectorOpen: true,
  },

  /* ---------- 업로드 데이터 ---------- */
  uploadedData: {
    fileName: null,
    rawText: null,
    rows: [],
    columns: [],
    datetimeColumn: null,
    targetColumn: null,
    frequency: null,
    summary: {
      rowCount: 0,
      columnCount: 0,
      missingCount: 0,
      duplicateTimestampCount: 0,
      startDate: null,
      endDate: null,
    },
  },

  /* ---------- Track 상태 ---------- */
  tracks: [],

  selectedTrackId: null,

  /* ---------- Region 상태 ---------- */
  regions: [
    {
      id: "region-1",
      name: "Region 01",
      trackIds: [],
      layout: {
        row: 1,
        col: 1,
      },
    },
  ],

  selectedRegionId: "region-1",

  /* ---------- Process Popup 상태 ---------- */
  processes: [],

  activePopup: {
    isOpen: false,
    processId: null,
    type: null,
  },

  /* ---------- 자동 분석 상태 ---------- */
  autoAnalysis: {
    isCompleted: false,
    createdTrackIds: [],
    result: null,
    recommendation: {
      preprocessing: [],
      forecasting: [],
      metrics: [],
    },
  },

  /* ---------- AI Assistant 상태 ---------- */
  assistant: {
    isOpen: false,
    messages: [],
  },
};

/* =========================================================
   ID 생성
   ========================================================= */

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/* =========================================================
   Uploaded Data
   ========================================================= */

function setUploadedData(data) {
  TSState.uploadedData = {
    ...TSState.uploadedData,
    ...data,
  };

  TSState.app.currentPage = "workspace";
  TSState.app.projectStatus = "loaded";
}

function resetUploadedData() {
  TSState.uploadedData = {
    fileName: null,
    rawText: null,
    rows: [],
    columns: [],
    datetimeColumn: null,
    targetColumn: null,
    frequency: null,
    summary: {
      rowCount: 0,
      columnCount: 0,
      missingCount: 0,
      duplicateTimestampCount: 0,
      startDate: null,
      endDate: null,
    },
  };
}

/* =========================================================
   Track
   ========================================================= */

function createTrack({
  name,
  type = "Original Data",
  data = [],
  x = [],
  y = [],
  color = "#2f80ed",
  regionId = "region-1",
  processId = null,
  visible = true,
  locked = false,
  metadata = {},
}) {
  const track = {
    id: createId("track"),
    name,
    type,
    data,
    x,
    y,
    color,
    regionId,
    processId,
    visible,
    locked,
    metadata,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  TSState.tracks.push(track);
  TSState.selectedTrackId = track.id;

  assignTrackToRegion(track.id, regionId);

  TSState.app.projectStatus = "modified";

  return track;
}

function getTrackById(trackId) {
  return TSState.tracks.find((track) => track.id === trackId) || null;
}

function getSelectedTrack() {
  return getTrackById(TSState.selectedTrackId);
}

function selectTrack(trackId) {
  const track = getTrackById(trackId);

  if (!track) return null;

  TSState.selectedTrackId = trackId;
  TSState.selectedRegionId = track.regionId;

  return track;
}

function updateTrack(trackId, updates) {
  const track = getTrackById(trackId);

  if (!track || track.locked) return null;

  Object.assign(track, updates, {
    updatedAt: new Date().toISOString(),
  });

  TSState.app.projectStatus = "modified";

  return track;
}

function renameTrack(trackId, newName) {
  return updateTrack(trackId, { name: newName });
}

function setTrackColor(trackId, color) {
  return updateTrack(trackId, { color });
}

function toggleTrackVisibility(trackId) {
  const track = getTrackById(trackId);

  if (!track) return null;

  track.visible = !track.visible;
  track.updatedAt = new Date().toISOString();

  TSState.app.projectStatus = "modified";

  return track;
}

function toggleTrackLock(trackId) {
  const track = getTrackById(trackId);

  if (!track) return null;

  track.locked = !track.locked;
  track.updatedAt = new Date().toISOString();

  TSState.app.projectStatus = "modified";

  return track;
}

function duplicateTrack(trackId) {
  const track = getTrackById(trackId);

  if (!track) return null;

  return createTrack({
    name: `${track.name} Copy`,
    type: track.type,
    data: structuredCloneSafe(track.data),
    x: [...track.x],
    y: [...track.y],
    color: track.color,
    regionId: track.regionId,
    processId: track.processId,
    visible: track.visible,
    locked: false,
    metadata: structuredCloneSafe(track.metadata),
  });
}

function deleteTrack(trackId) {
  TSState.tracks = TSState.tracks.filter((track) => track.id !== trackId);

  TSState.regions.forEach((region) => {
    region.trackIds = region.trackIds.filter((id) => id !== trackId);
  });

  if (TSState.selectedTrackId === trackId) {
    TSState.selectedTrackId = TSState.tracks[0]?.id || null;
  }

  TSState.app.projectStatus = "modified";
}

/* =========================================================
   Region
   ========================================================= */

function createRegion(name = null) {
  const regionNumber = TSState.regions.length + 1;

  const region = {
    id: createId("region"),
    name: name || `Region ${String(regionNumber).padStart(2, "0")}`,
    trackIds: [],
    layout: {
      row: 1,
      col: regionNumber,
    },
  };

  TSState.regions.push(region);
  TSState.selectedRegionId = region.id;

  TSState.app.projectStatus = "modified";

  return region;
}

function getRegionById(regionId) {
  return TSState.regions.find((region) => region.id === regionId) || null;
}

function getSelectedRegion() {
  return getRegionById(TSState.selectedRegionId);
}

function selectRegion(regionId) {
  const region = getRegionById(regionId);

  if (!region) return null;

  TSState.selectedRegionId = regionId;

  return region;
}

function assignTrackToRegion(trackId, regionId) {
  const track = getTrackById(trackId);
  const region = getRegionById(regionId);

  if (!track || !region) return null;

  TSState.regions.forEach((item) => {
    item.trackIds = item.trackIds.filter((id) => id !== trackId);
  });

  region.trackIds.push(trackId);
  track.regionId = regionId;
  track.updatedAt = new Date().toISOString();

  return region;
}

function removeRegion(regionId) {
  if (TSState.regions.length <= 1) return false;

  const targetRegion = getRegionById(regionId);
  const firstRegion = TSState.regions.find((region) => region.id !== regionId);

  if (!targetRegion || !firstRegion) return false;

  targetRegion.trackIds.forEach((trackId) => {
    assignTrackToRegion(trackId, firstRegion.id);
  });

  TSState.regions = TSState.regions.filter((region) => region.id !== regionId);
  TSState.selectedRegionId = firstRegion.id;

  TSState.app.projectStatus = "modified";

  return true;
}

/* =========================================================
   Process
   ========================================================= */

function createProcess({
  name,
  type,
  trackId = null,
  parameters = {},
  resultTrackId = null,
  status = "ready",
}) {
  const process = {
    id: createId("process"),
    name,
    type,
    trackId,
    resultTrackId,
    parameters,
    status, // ready, running, completed, failed
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  TSState.processes.push(process);
  TSState.app.projectStatus = "modified";

  return process;
}

function getProcessById(processId) {
  return TSState.processes.find((process) => process.id === processId) || null;
}

function updateProcess(processId, updates) {
  const process = getProcessById(processId);

  if (!process) return null;

  Object.assign(process, updates, {
    updatedAt: new Date().toISOString(),
  });

  TSState.app.projectStatus = "modified";

  return process;
}

function openProcessPopup(processId, type = null) {
  const process = getProcessById(processId);

  if (!process) return null;

  TSState.activePopup = {
    isOpen: true,
    processId,
    type: type || process.type,
  };

  return process;
}

function closeProcessPopup() {
  TSState.activePopup = {
    isOpen: false,
    processId: null,
    type: null,
  };
}

/* =========================================================
   Auto Analysis
   ========================================================= */

function setAutoAnalysisResult(result) {
  TSState.autoAnalysis = {
    ...TSState.autoAnalysis,
    isCompleted: true,
    result,
  };

  TSState.app.projectStatus = "modified";
}

function addAutoAnalysisTrackId(trackId) {
  if (!TSState.autoAnalysis.createdTrackIds.includes(trackId)) {
    TSState.autoAnalysis.createdTrackIds.push(trackId);
  }
}

function setAutoAnalysisRecommendation(recommendation) {
  TSState.autoAnalysis.recommendation = {
    ...TSState.autoAnalysis.recommendation,
    ...recommendation,
  };
}

/* =========================================================
   Assistant
   ========================================================= */

function toggleAssistant() {
  TSState.assistant.isOpen = !TSState.assistant.isOpen;
}

function openAssistant() {
  TSState.assistant.isOpen = true;
}

function closeAssistant() {
  TSState.assistant.isOpen = false;
}

function addAssistantMessage(role, content) {
  const message = {
    id: createId("message"),
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  TSState.assistant.messages.push(message);

  return message;
}

/* =========================================================
   Layout
   ========================================================= */

function toggleInspector() {
  TSState.app.inspectorOpen = !TSState.app.inspectorOpen;
}

function setInspectorOpen(isOpen) {
  TSState.app.inspectorOpen = Boolean(isOpen);
}

/* =========================================================
   Project
   ========================================================= */

function resetProject() {
  TSState.app = {
    currentPage: "home",
    projectStatus: "empty",
    inspectorOpen: true,
  };

  resetUploadedData();

  TSState.tracks = [];
  TSState.selectedTrackId = null;

  TSState.regions = [
    {
      id: "region-1",
      name: "Region 01",
      trackIds: [],
      layout: {
        row: 1,
        col: 1,
      },
    },
  ];

  TSState.selectedRegionId = "region-1";
  TSState.processes = [];

  TSState.activePopup = {
    isOpen: false,
    processId: null,
    type: null,
  };

  TSState.autoAnalysis = {
    isCompleted: false,
    createdTrackIds: [],
    result: null,
    recommendation: {
      preprocessing: [],
      forecasting: [],
      metrics: [],
    },
  };

  TSState.assistant = {
    isOpen: false,
    messages: [],
  };
}

/* =========================================================
   Safe Clone
   ========================================================= */

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSState = TSState;

window.TSStore = {
  createId,

  setUploadedData,
  resetUploadedData,

  createTrack,
  getTrackById,
  getSelectedTrack,
  selectTrack,
  updateTrack,
  renameTrack,
  setTrackColor,
  toggleTrackVisibility,
  toggleTrackLock,
  duplicateTrack,
  deleteTrack,

  createRegion,
  getRegionById,
  getSelectedRegion,
  selectRegion,
  assignTrackToRegion,
  removeRegion,

  createProcess,
  getProcessById,
  updateProcess,
  openProcessPopup,
  closeProcessPopup,

  setAutoAnalysisResult,
  addAutoAnalysisTrackId,
  setAutoAnalysisRecommendation,

  toggleAssistant,
  openAssistant,
  closeAssistant,
  addAssistantMessage,

  toggleInspector,
  setInspectorOpen,

  resetProject,
};