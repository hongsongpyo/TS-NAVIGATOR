/* =========================================================
   TS Navigator - upload.js
   ---------------------------------------------------------
   역할
   1. Home 화면 CSV 업로드 처리
   2. CSV 파싱 후 중앙 상태(state.js)에 저장
   3. Original Track 자동 생성
   4. 업로드 파일 목록 UI 갱신
   5. 분석 화면(workspace.html)으로 이동
========================================================= */

/* =========================================================
   1. DOM 요소 참조
========================================================= */

let csvInput = null;
let uploadText = null;
let fileNameText = null;
let startBtn = null;
let fileListToggle = null;
let filePreview = null;

/* =========================================================
   2. 업로드 상태
========================================================= */

const TSUploadState = {
  currentFile: null,
  currentDataset: null,
  isLoaded: false,
  error: null
};

/* =========================================================
   3. 초기화
========================================================= */

function initUpload() {
  csvInput = document.getElementById("csvInput");
  uploadText = document.getElementById("uploadText");
  fileNameText = document.getElementById("fileName");
  startBtn = document.getElementById("startBtn");
  fileListToggle = document.getElementById("fileListToggle");
  filePreview = document.getElementById("filePreview");

  bindUploadEvents();
  restoreUploadedDatasetSummary();
  renderUploadState();
}

function bindUploadEvents() {
  if (csvInput) {
    csvInput.addEventListener("change", handleCSVFileChange);
  }

  if (startBtn) {
    startBtn.addEventListener("click", handleStartWorkspace);
  }

  if (fileListToggle) {
    fileListToggle.addEventListener("click", toggleFilePreview);
  }
}

/* =========================================================
   4. CSV 파일 선택 처리
========================================================= */

async function handleCSVFileChange(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!isCSVFile(file)) {
    setUploadError("CSV 파일만 업로드할 수 있습니다.");
    return;
  }

  try {
    setUploadLoading(file.name);

    const dataset = await window.TSCSVUtils.readCSVFile(file);

    applyDatasetToProject(file, dataset);
    saveDatasetSummaryToSession(dataset);

    TSUploadState.currentFile = file;
    TSUploadState.currentDataset = dataset;
    TSUploadState.isLoaded = true;
    TSUploadState.error = null;

    renderUploadState();
  } catch (error) {
    console.error(error);
    setUploadError("CSV 파일을 불러오는 중 오류가 발생했습니다.");
  }
}

function isCSVFile(file) {
  const fileName = file.name.toLowerCase();

  return (
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    fileName.endsWith(".csv")
  );
}

/* =========================================================
   5. 프로젝트 상태 반영
========================================================= */

function applyDatasetToProject(file, dataset) {
  if (!window.TSStore) {
    throw new Error("TSStore가 로드되지 않았습니다. state.js를 먼저 연결하세요.");
  }

  window.TSStore.initProject();

  window.TSStore.setDataset({
    fileName: file.name,
    rawText: dataset.rawText,
    rows: dataset.rows,
    columns: dataset.columns,
    datetimeColumn: dataset.datetimeColumn,
    targetColumn: dataset.targetColumn,
    frequency: dataset.frequency,
    structureSummary: dataset.structureSummary
  });

  const originalTrack = window.TSStore.createOriginalTrack(dataset.rows);

  const structureParams = window.TSStore.getDefaultParams("Structure");

  window.TSStore.addAnalysisToTrack(originalTrack.id, "Structure", {
    ...structureParams,
    datetimeColumn: dataset.datetimeColumn || "auto",
    targetColumn: dataset.targetColumn || "auto",
    detectedFrequency: dataset.frequency?.code || null
  });

  window.TSStore.commitTrackResult(originalTrack.id, {
    data: dataset.rows,
    metadata: {
      fileName: file.name,
      rowCount: dataset.rowCount,
      columnCount: dataset.columnCount,
      datetimeColumn: dataset.datetimeColumn,
      targetColumn: dataset.targetColumn,
      frequency: dataset.frequency,
      numericColumns: dataset.numericColumns,
      categoricalColumns: dataset.categoricalColumns,
      errors: dataset.errors
    },
    result: {
      type: "structure",
      summary: dataset.structureSummary,
      previewRows: dataset.previewRows
    }
  });
}

/* =========================================================
   6. 화면 표시 갱신
========================================================= */

function renderUploadState() {
  if (!fileNameText || !uploadText || !startBtn) return;

  if (TSUploadState.error) {
    uploadText.textContent = "다시 CSV 파일 업로드하기";
    fileNameText.textContent = TSUploadState.error;
    startBtn.disabled = true;
    startBtn.classList.add("disabled");
    return;
  }

  if (!TSUploadState.isLoaded || !TSUploadState.currentDataset) {
    uploadText.textContent = "분석할 CSV 파일을 업로드하기";
    fileNameText.textContent = "아직 업로드된 파일이 없습니다.";
    startBtn.disabled = true;
    startBtn.classList.add("disabled");
    return;
  }

  const dataset = TSUploadState.currentDataset;

  uploadText.textContent = dataset.fileName || "CSV 파일 업로드 완료";
  fileNameText.textContent = createUploadedFileLabel(dataset);

  startBtn.disabled = false;
  startBtn.classList.remove("disabled");
}

function createUploadedFileLabel(dataset) {
  const rowCount = dataset.rowCount ?? dataset.rows?.length ?? 0;
  const targetColumn = dataset.targetColumn || "target 미탐지";
  const datetimeColumn = dataset.datetimeColumn || "date 미탐지";
  const frequency = dataset.frequency?.label || "주기 미탐지";

  return `${dataset.fileName} · ${rowCount}행 · ${datetimeColumn} / ${targetColumn} · ${frequency}`;
}

function setUploadLoading(fileName) {
  TSUploadState.currentFile = null;
  TSUploadState.currentDataset = null;
  TSUploadState.isLoaded = false;
  TSUploadState.error = null;

  if (uploadText) uploadText.textContent = "CSV 파일을 불러오는 중...";
  if (fileNameText) fileNameText.textContent = `${fileName} 분석 준비 중`;
  if (startBtn) startBtn.disabled = true;
}

function setUploadError(message) {
  TSUploadState.currentFile = null;
  TSUploadState.currentDataset = null;
  TSUploadState.isLoaded = false;
  TSUploadState.error = message;

  renderUploadState();
}

function toggleFilePreview() {
  if (!filePreview) return;

  filePreview.classList.toggle("hidden");
}

/* =========================================================
   7. Workspace 이동
========================================================= */

function handleStartWorkspace() {
  if (!TSUploadState.isLoaded || !TSUploadState.currentDataset) {
    setUploadError("먼저 CSV 파일을 업로드하세요.");
    return;
  }

  saveDatasetSummaryToSession(TSUploadState.currentDataset);
  saveProjectStateToSession();

  window.location.href = "workspace.html";
}

/* =========================================================
   8. Session Storage 저장/복원
========================================================= */

function saveDatasetSummaryToSession(dataset) {
  const safeDataset = {
    fileName: dataset.fileName,
    delimiter: dataset.delimiter,
    columns: dataset.columns,
    rows: dataset.rows,
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    datetimeColumn: dataset.datetimeColumn,
    targetColumn: dataset.targetColumn,
    frequency: dataset.frequency,
    structureSummary: dataset.structureSummary,
    numericColumns: dataset.numericColumns,
    categoricalColumns: dataset.categoricalColumns,
    previewRows: dataset.previewRows,
    errors: dataset.errors
  };

  sessionStorage.setItem("TS_NAVIGATOR_DATASET", JSON.stringify(safeDataset));
}

function saveProjectStateToSession() {
  if (!window.TSState) return;

  sessionStorage.setItem("TS_NAVIGATOR_STATE", JSON.stringify(window.TSState));
}

function restoreUploadedDatasetSummary() {
  const savedDatasetText = sessionStorage.getItem("TS_NAVIGATOR_DATASET");

  if (!savedDatasetText) return;

  try {
    const dataset = JSON.parse(savedDatasetText);

    TSUploadState.currentDataset = dataset;
    TSUploadState.currentFile = null;
    TSUploadState.isLoaded = true;
    TSUploadState.error = null;
  } catch (error) {
    console.warn("저장된 데이터셋 정보를 복원하지 못했습니다.", error);
    sessionStorage.removeItem("TS_NAVIGATOR_DATASET");
  }
}

/* =========================================================
   9. 샘플 데이터 로드
========================================================= */

function loadSampleCSV() {
  if (!window.TSCSVUtils) {
    setUploadError("CSV 유틸리티가 로드되지 않았습니다.");
    return;
  }

  const rawText = window.TSCSVUtils.createSampleCSV();

  const dataset = window.TSCSVUtils.parseCSV(rawText, {
    fileName: "sample_time_series.csv"
  });

  const fakeFile = {
    name: "sample_time_series.csv"
  };

  applyDatasetToProject(fakeFile, dataset);
  saveDatasetSummaryToSession(dataset);

  TSUploadState.currentFile = fakeFile;
  TSUploadState.currentDataset = dataset;
  TSUploadState.isLoaded = true;
  TSUploadState.error = null;

  renderUploadState();
}

/* =========================================================
   10. 외부 접근용 객체
========================================================= */

window.TSUpload = {
  state: TSUploadState,

  initUpload,
  handleCSVFileChange,
  handleStartWorkspace,

  applyDatasetToProject,
  renderUploadState,

  saveDatasetSummaryToSession,
  saveProjectStateToSession,
  restoreUploadedDatasetSummary,

  loadSampleCSV
};

/* =========================================================
   11. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initUpload();
});