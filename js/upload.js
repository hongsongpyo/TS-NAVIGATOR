/* =========================================================
   TS Navigator - upload.js
   CSV 업로드 / 파싱 / Original Data Track 생성 / Workspace 이동
   ========================================================= */

/* =========================================================
   Upload 초기화
   ========================================================= */

function initializeUpload() {
  const fileInput = document.getElementById("csvFileInput");
  const uploadCard = document.getElementById("uploadCard");
  const sampleButton = document.getElementById("sampleDataButton");

  if (fileInput) {
    fileInput.addEventListener("change", handleCSVFileChange);
  }

  if (uploadCard) {
    bindUploadDragAndDrop(uploadCard);
  }

  if (sampleButton) {
    sampleButton.addEventListener("click", handleSampleDataLoad);
  }
}

/* =========================================================
   CSV 파일 선택
   ========================================================= */

async function handleCSVFileChange(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  await loadCSVFile(file);
}

async function loadCSVFile(file) {
  try {
    validateCSVFile(file);
    setUploadStatus("loading", `${file.name} 파일을 읽는 중입니다.`);

    const dataset = await TSCSVUtils.readCSVFile(file);

    applyDatasetToProject(dataset);

    setUploadStatus("success", `${file.name} 파일 업로드가 완료되었습니다.`);

    goToWorkspace();
  } catch (error) {
    console.error(error);
    setUploadStatus("error", error.message || "CSV 업로드 중 오류가 발생했습니다.");
  }
}

/* =========================================================
   CSV 파일 검증
   ========================================================= */

function validateCSVFile(file) {
  if (!file) {
    throw new Error("CSV 파일이 선택되지 않았습니다.");
  }

  const fileName = file.name.toLowerCase();

  if (!fileName.endsWith(".csv")) {
    throw new Error("CSV 파일만 업로드할 수 있습니다.");
  }

  if (file.size === 0) {
    throw new Error("빈 파일은 업로드할 수 없습니다.");
  }

  const maxSize = 10 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error("파일 크기는 10MB 이하만 권장합니다.");
  }
}

/* =========================================================
   Drag & Drop
   ========================================================= */

function bindUploadDragAndDrop(uploadCard) {
  uploadCard.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadCard.classList.add("drag-over");
  });

  uploadCard.addEventListener("dragleave", () => {
    uploadCard.classList.remove("drag-over");
  });

  uploadCard.addEventListener("drop", async (event) => {
    event.preventDefault();
    uploadCard.classList.remove("drag-over");

    const file = event.dataTransfer.files?.[0];

    if (!file) return;

    await loadCSVFile(file);
  });
}

/* =========================================================
   Dataset 적용
   ========================================================= */

function applyDatasetToProject(dataset) {
  if (!dataset || !dataset.rows || dataset.rows.length === 0) {
    throw new Error("CSV 데이터가 비어 있습니다.");
  }

  TSStore.resetProject();

  const created = TSDataStructure.createOriginalTrackFromDataset(dataset);

  if (!created || !created.track) {
    throw new Error("Original Data Track을 생성하지 못했습니다.");
  }

  TSStore.selectTrack(created.track.id);

  TSStore.setUploadedData({
    ...dataset,
    datetimeColumn: created.structure.datetimeColumn,
    targetColumn: created.structure.targetColumn,
    frequency: created.structure.frequencyReport.label,
    summary: {
      rowCount: created.structure.rowCount,
      columnCount: created.structure.columnCount,
      missingCount: created.structure.missingReport.totalMissingCount,
      duplicateTimestampCount: created.structure.duplicateReport.duplicateCount,
      startDate: created.structure.datetimeReport.startDate,
      endDate: created.structure.datetimeReport.endDate,
    },
  });

  saveProjectToSession();
}

/* =========================================================
   샘플 데이터 로드
   ========================================================= */

function handleSampleDataLoad() {
  const dataset = TSSampleData.createSampleDataset({
    length: 120,
    startDate: "2024-01-01",
    frequency: "daily",
    missingRatio: 0.08,
    outlierRatio: 0.05,
    duplicateRatio: 0.03,
  });

  applyDatasetToProject(dataset);

  setUploadStatus("success", "샘플 시계열 데이터가 생성되었습니다.");

  goToWorkspace();
}

/* =========================================================
   Workspace 이동
   ========================================================= */

function goToWorkspace() {
  const currentPath = window.location.pathname;

  if (currentPath.endsWith("workspace.html")) {
    initializeWorkspaceAfterUpload();
    return;
  }

  window.location.href = "./workspace.html";
}

function initializeWorkspaceAfterUpload() {
  if (window.TSApp && typeof TSApp.initializeWorkspace === "function") {
    TSApp.initializeWorkspace();
  }
}

/* =========================================================
   Session Storage 저장 / 복원
   ========================================================= */

function saveProjectToSession() {
  try {
    const snapshot = {
      app: TSState.app,
      uploadedData: TSState.uploadedData,
      tracks: TSState.tracks,
      selectedTrackId: TSState.selectedTrackId,
      regions: TSState.regions,
      selectedRegionId: TSState.selectedRegionId,
      processes: TSState.processes,
      autoAnalysis: TSState.autoAnalysis,
    };

    sessionStorage.setItem("tsNavigatorProject", JSON.stringify(snapshot));
  } catch (error) {
    console.warn("프로젝트 상태를 sessionStorage에 저장하지 못했습니다.", error);
  }
}

function loadProjectFromSession() {
  try {
    const raw = sessionStorage.getItem("tsNavigatorProject");

    if (!raw) return false;

    const snapshot = JSON.parse(raw);

    restoreProjectSnapshot(snapshot);

    return true;
  } catch (error) {
    console.warn("프로젝트 상태를 복원하지 못했습니다.", error);
    return false;
  }
}

function restoreProjectSnapshot(snapshot) {
  if (!snapshot) return;

  TSState.app = {
    ...TSState.app,
    ...(snapshot.app || {}),
  };

  TSState.uploadedData = {
    ...TSState.uploadedData,
    ...(snapshot.uploadedData || {}),
  };

  TSState.tracks = snapshot.tracks || [];
  TSState.selectedTrackId = snapshot.selectedTrackId || TSState.tracks[0]?.id || null;

  TSState.regions = snapshot.regions || TSState.regions;
  TSState.selectedRegionId = snapshot.selectedRegionId || TSState.regions[0]?.id || null;

  TSState.processes = snapshot.processes || [];

  TSState.autoAnalysis = {
    ...TSState.autoAnalysis,
    ...(snapshot.autoAnalysis || {}),
  };

  TSState.app.currentPage = "workspace";
}

function clearProjectSession() {
  sessionStorage.removeItem("tsNavigatorProject");
}

/* =========================================================
   Upload 상태 표시
   ========================================================= */

function setUploadStatus(type, message) {
  const status = document.getElementById("uploadStatus");
  const selectedFileName = document.getElementById("selectedFileName");

  if (selectedFileName && message) {
    selectedFileName.textContent = message;
  }

  if (!status) return;

  status.className = `upload-status ${type}`;
  status.textContent = message;
}

function resetUploadStatus() {
  const status = document.getElementById("uploadStatus");
  const selectedFileName = document.getElementById("selectedFileName");

  if (selectedFileName) {
    selectedFileName.textContent = "파일";
  }

  if (status) {
    status.className = "upload-status";
    status.textContent = "";
  }
}

/* =========================================================
   업로드 후 데이터 정보
   ========================================================= */

function getUploadedFileSummaryText() {
  const data = TSState.uploadedData;

  if (!data.fileName) {
    return "업로드된 파일이 없습니다.";
  }

  return [
    `파일명: ${data.fileName}`,
    `행 개수: ${data.summary?.rowCount ?? 0}`,
    `열 개수: ${data.summary?.columnCount ?? 0}`,
    `Datetime Column: ${data.datetimeColumn || "-"}`,
    `Target Column: ${data.targetColumn || "-"}`,
    `Frequency: ${data.frequency || "-"}`,
    `결측치 수: ${data.summary?.missingCount ?? 0}`,
    `중복 Timestamp 수: ${data.summary?.duplicateTimestampCount ?? 0}`,
  ].join("\n");
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSUpload = {
  initializeUpload,

  handleCSVFileChange,
  loadCSVFile,
  validateCSVFile,

  bindUploadDragAndDrop,

  applyDatasetToProject,

  handleSampleDataLoad,

  goToWorkspace,
  initializeWorkspaceAfterUpload,

  saveProjectToSession,
  loadProjectFromSession,
  restoreProjectSnapshot,
  clearProjectSession,

  setUploadStatus,
  resetUploadStatus,

  getUploadedFileSummaryText,
};