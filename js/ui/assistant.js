/* =========================================================
   TS Navigator - assistant.js
   AI Assistant UI / 데이터 기반 분석 가이드 팝업
   ========================================================= */

/* =========================================================
   Assistant 전체 렌더링
   ========================================================= */

function renderAssistant() {
  const container = document.getElementById("aiAssistantRoot");

  if (!container) return;

  container.innerHTML = `
    <button 
      type="button" 
      class="assistant-floating-button"
      id="assistantFloatingButton"
      title="AI Assistant"
    >
      AI
    </button>

    ${
      TSState.assistant.isOpen
        ? createAssistantPanelHTML()
        : ""
    }
  `;

  bindAssistantEvents();
}

/* =========================================================
   Assistant Panel HTML
   ========================================================= */

function createAssistantPanelHTML() {
  return `
    <section class="assistant-panel">
      <div class="assistant-header">
        <div>
          <p class="section-kicker">AI ASSISTANT</p>
          <h2>Analysis Guide</h2>
        </div>

        <button 
          type="button" 
          class="assistant-close-button"
          id="assistantCloseButton"
        >
          ×
        </button>
      </div>

      <div class="assistant-body" id="assistantMessageList">
        ${createAssistantMessagesHTML()}
      </div>

      <div class="assistant-quick-actions">
        <button type="button" data-assistant-action="guide">
          분석 추천
        </button>
        <button type="button" data-assistant-action="data-summary">
          데이터 요약
        </button>
        <button type="button" data-assistant-action="metric-help">
          평가지표 해석
        </button>
      </div>

      <form class="assistant-input-row" id="assistantInputForm">
        <textarea 
          id="assistantInput"
          rows="2"
          placeholder="분석 결과를 붙여넣거나 질문을 입력하세요."
        ></textarea>

        <button type="submit">
          전송
        </button>
      </form>
    </section>
  `;
}

/* =========================================================
   Message HTML
   ========================================================= */

function createAssistantMessagesHTML() {
  const messages = TSState.assistant.messages || [];

  if (messages.length === 0) {
    const intro = createDefaultAssistantMessage();

    return createAssistantMessageHTML({
      role: "assistant",
      content: intro,
    });
  }

  return messages.map((message) => createAssistantMessageHTML(message)).join("");
}

function createAssistantMessageHTML(message) {
  return `
    <div class="assistant-message ${message.role}">
      <div class="assistant-message-role">
        ${message.role === "user" ? "User" : "Assistant"}
      </div>
      <pre>${escapeAssistantHTML(message.content)}</pre>
    </div>
  `;
}

function createDefaultAssistantMessage() {
  return [
    "CSV 데이터 업로드 후 Track을 선택하면 분석 방법을 추천할 수 있습니다.",
    "",
    "가능한 도움:",
    "- 데이터 구조 확인",
    "- 결측치/이상치 전처리 추천",
    "- 분해, 예측 모델 추천",
    "- MAE, RMSE, MAPE, SMAPE 해석",
  ].join("\n");
}

/* =========================================================
   Event 연결
   ========================================================= */

function bindAssistantEvents() {
  const floatingButton = document.getElementById("assistantFloatingButton");
  const closeButton = document.getElementById("assistantCloseButton");
  const inputForm = document.getElementById("assistantInputForm");
  const panel = document.querySelector(".assistant-panel");

  if (floatingButton) {
    floatingButton.addEventListener("click", handleAssistantToggle);
  }

  if (closeButton) {
    closeButton.addEventListener("click", handleAssistantClose);
  }

  if (inputForm) {
    inputForm.addEventListener("submit", handleAssistantSubmit);
  }

  if (panel) {
    panel.addEventListener("click", handleAssistantQuickAction);
  }
}

/* =========================================================
   Open / Close
   ========================================================= */

function handleAssistantToggle() {
  TSStore.toggleAssistant();

  renderAssistant();
}

function handleAssistantClose() {
  TSStore.closeAssistant();

  renderAssistant();
}

function openAssistantWithMessage(message) {
  TSStore.openAssistant();

  if (message) {
    TSStore.addAssistantMessage("user", message);
    TSStore.addAssistantMessage("assistant", generateAssistantResponse(message));
  }

  renderAssistant();
  scrollAssistantToBottom();
}

/* =========================================================
   Submit
   ========================================================= */

function handleAssistantSubmit(event) {
  event.preventDefault();

  const input = document.getElementById("assistantInput");

  if (!input) return;

  const content = input.value.trim();

  if (!content) return;

  TSStore.addAssistantMessage("user", content);

  const response = generateAssistantResponse(content);

  TSStore.addAssistantMessage("assistant", response);

  input.value = "";

  renderAssistant();
  scrollAssistantToBottom();
}

/* =========================================================
   Quick Action
   ========================================================= */

function handleAssistantQuickAction(event) {
  const button = event.target.closest("[data-assistant-action]");

  if (!button) return;

  const action = button.dataset.assistantAction;

  let userMessage = "";

  switch (action) {
    case "guide":
      userMessage = createAnalysisGuideQuestion();
      break;

    case "data-summary":
      userMessage = createDataSummaryQuestion();
      break;

    case "metric-help":
      userMessage = createMetricHelpQuestion();
      break;

    default:
      return;
  }

  TSStore.addAssistantMessage("user", userMessage);
  TSStore.addAssistantMessage("assistant", generateAssistantResponse(userMessage));

  renderAssistant();
  scrollAssistantToBottom();
}

/* =========================================================
   Rule-based Assistant Response
   실제 API 없이 브라우저 내부에서 동작하는 가이드
   ========================================================= */

function generateAssistantResponse(userMessage = "") {
  const lower = userMessage.toLowerCase();

  if (
    lower.includes("평가지표") ||
    lower.includes("metric") ||
    lower.includes("mae") ||
    lower.includes("rmse") ||
    lower.includes("mape") ||
    lower.includes("smape")
  ) {
    return generateMetricGuideResponse();
  }

  if (
    lower.includes("데이터 요약") ||
    lower.includes("summary") ||
    lower.includes("구조") ||
    lower.includes("datetime") ||
    lower.includes("target")
  ) {
    return generateDataSummaryResponse();
  }

  if (
    lower.includes("전처리") ||
    lower.includes("결측") ||
    lower.includes("이상치") ||
    lower.includes("preprocessing")
  ) {
    return generatePreprocessingGuideResponse();
  }

  if (
    lower.includes("예측") ||
    lower.includes("forecast") ||
    lower.includes("모델") ||
    lower.includes("arima") ||
    lower.includes("holt")
  ) {
    return generateForecastGuideResponse();
  }

  return generateGeneralAnalysisGuideResponse();
}

/* =========================================================
   데이터 요약 응답
   ========================================================= */

function generateDataSummaryResponse() {
  const uploaded = TSState.uploadedData;
  const selectedTrack = TSStore.getSelectedTrack();

  const lines = [];

  lines.push("현재 데이터 구조 요약입니다.");
  lines.push("");

  if (uploaded.fileName) {
    lines.push(`파일명: ${uploaded.fileName}`);
  }

  lines.push(`행 개수: ${uploaded.summary?.rowCount ?? uploaded.rows?.length ?? 0}`);
  lines.push(`열 개수: ${uploaded.summary?.columnCount ?? uploaded.columns?.length ?? 0}`);
  lines.push(`Datetime Column: ${uploaded.datetimeColumn || "-"}`);
  lines.push(`Target Column: ${uploaded.targetColumn || "-"}`);
  lines.push(`Frequency: ${uploaded.frequency || "-"}`);
  lines.push(`결측치 수: ${uploaded.summary?.missingCount ?? "-"}`);
  lines.push(`중복 Timestamp 수: ${uploaded.summary?.duplicateTimestampCount ?? "-"}`);

  if (selectedTrack) {
    const values = selectedTrack.y || [];
    const validValues = TSMathUtils.cleanNumberArray(values);

    lines.push("");
    lines.push("선택 Track 요약:");
    lines.push(`Track: ${selectedTrack.name}`);
    lines.push(`Type: ${selectedTrack.type}`);
    lines.push(`Points: ${values.length}`);
    lines.push(`Mean: ${TSMathUtils.formatNumber(TSMathUtils.mean(validValues), 4)}`);
    lines.push(`Min: ${TSMathUtils.formatNumber(TSMathUtils.min(validValues), 4)}`);
    lines.push(`Max: ${TSMathUtils.formatNumber(TSMathUtils.max(validValues), 4)}`);
    lines.push(`Std: ${TSMathUtils.formatNumber(TSMathUtils.standardDeviation(validValues, false), 4)}`);
  }

  lines.push("");
  lines.push("권장 순서:");
  lines.push("1. datetime/target column 확인");
  lines.push("2. 결측치와 중복 timestamp 확인");
  lines.push("3. 이상치 처리");
  lines.push("4. 필요 시 분해 또는 잡음 완화");
  lines.push("5. 예측 모델 적용 후 평가지표 확인");

  return lines.join("\n");
}

/* =========================================================
   전처리 가이드 응답
   ========================================================= */

function generatePreprocessingGuideResponse() {
  const track = TSStore.getSelectedTrack();

  if (!track) {
    return [
      "전처리 추천을 위해 먼저 Track을 선택해야 합니다.",
      "",
      "일반적인 전처리 순서:",
      "1. timestamp 정렬",
      "2. missing timestamp 생성",
      "3. 결측치 처리",
      "4. 이상치 탐지 및 처리",
      "5. 필요할 경우 정규화",
    ].join("\n");
  }

  const values = track.y || [];
  const missingCount = values.filter((value) => value === null || value === undefined).length;
  const outlierCount = TSMathUtils.detectOutliersIQR(values, 1.5).filter(Boolean).length;

  const lines = [];

  lines.push(`"${track.name}" Track 전처리 추천입니다.`);
  lines.push("");

  if (missingCount > 0) {
    lines.push(`결측치가 ${missingCount}개 있습니다.`);
    lines.push("추천: Linear Interpolation 또는 LOCF");
    lines.push("- 연속적인 수요/관측값이면 Linear Interpolation");
    lines.push("- 직전 상태 유지 의미가 강하면 LOCF");
  } else {
    lines.push("결측치는 현재 Track 기준으로 크게 보이지 않습니다.");
  }

  lines.push("");

  if (outlierCount > 0) {
    lines.push(`IQR 기준 이상치가 ${outlierCount}개 탐지됩니다.`);
    lines.push("추천: 이상치를 null로 바꾼 뒤 선형보간 또는 winsorize");
  } else {
    lines.push("IQR 기준 뚜렷한 이상치는 많지 않습니다.");
  }

  lines.push("");
  lines.push("실행 위치:");
  lines.push("Track Inspector → 전처리 설정 → 적용 및 Track 생성");

  return lines.join("\n");
}

/* =========================================================
   예측 가이드 응답
   ========================================================= */

function generateForecastGuideResponse() {
  const track = TSStore.getSelectedTrack();

  if (!track) {
    return [
      "예측 모델 추천을 위해 먼저 Track을 선택해야 합니다.",
      "",
      "일반적인 기준:",
      "- 데이터가 짧으면 Naive",
      "- 추세가 약하면 SMA 또는 ES",
      "- 추세가 있으면 Holt",
      "- 정상성/차분 개념을 설명할 수 있으면 ARIMA 간이 적용",
    ].join("\n");
  }

  const values = TSMathUtils.cleanNumberArray(track.y || []);
  const frequency = track.metadata?.frequency || TSState.uploadedData.frequency || "daily";
  const recommendation = TSForecasting.recommendForecastMethod(values, frequency);

  return [
    `"${track.name}" Track 예측 추천입니다.`,
    "",
    `추천 모델: ${TSForecasting.getForecastMethodName(recommendation.method)}`,
    `예측 기간: ${recommendation.horizon}`,
    `학습 비율: ${recommendation.trainRatio}`,
    "",
    `추천 이유: ${recommendation.reason}`,
    "",
    "실행 위치:",
    "Track Inspector → 예측 모델 → 적용 및 Track 생성",
    "",
    "예측 후에는 Evaluation Result Track에서 MAE, RMSE, MAPE, SMAPE를 함께 확인하세요.",
  ].join("\n");
}

/* =========================================================
   평가지표 가이드 응답
   ========================================================= */

function generateMetricGuideResponse() {
  const metricTrack = [...TSState.tracks]
    .reverse()
    .find((track) => track.type === "Evaluation Result");

  const lines = [];

  lines.push("평가지표 해석 기준입니다.");
  lines.push("");
  lines.push("MAE: 실제값과 예측값 차이의 절댓값 평균입니다. 작을수록 좋습니다.");
  lines.push("MSE: 오차를 제곱한 평균입니다. 큰 오차에 민감합니다.");
  lines.push("RMSE: MSE에 제곱근을 씌운 값입니다. 원래 데이터 단위와 비슷하게 해석할 수 있습니다.");
  lines.push("MAPE: 실제값 대비 오차율입니다. 실제값이 0 근방이면 불안정합니다.");
  lines.push("SMAPE: 실제값과 예측값을 함께 기준으로 보는 비율 오차입니다.");
  lines.push("");

  if (metricTrack) {
    lines.push("최근 Evaluation Result:");
    metricTrack.data.forEach((row) => {
      lines.push(
        `${row.metric}: ${TSMathUtils.formatNumber(row.value, 4)} (${row.quality})`
      );
    });
  } else {
    lines.push("아직 Evaluation Result Track이 없습니다.");
    lines.push("예측 모델을 실행하면 자동으로 평가지표 Track이 생성됩니다.");
  }

  return lines.join("\n");
}

/* =========================================================
   일반 분석 가이드 응답
   ========================================================= */

function generateGeneralAnalysisGuideResponse() {
  const selectedTrack = TSStore.getSelectedTrack();

  if (!selectedTrack) {
    return [
      "분석을 시작하려면 CSV 업로드 후 생성된 Original Data Track을 선택하세요.",
      "",
      "추천 흐름:",
      "1. 데이터 구조 확인",
      "2. 전처리 Track 생성",
      "3. 필요 시 분해 또는 잡음 완화 Track 생성",
      "4. 예측 Track 생성",
      "5. Evaluation Result Track으로 성능 확인",
    ].join("\n");
  }

  return [
    `"${selectedTrack.name}" Track 기준 추천 흐름입니다.`,
    "",
    "1. 결측치/이상치가 있으면 전처리 설정을 먼저 적용합니다.",
    "2. 추세와 계절성을 보고 싶으면 분해를 실행합니다.",
    "3. 단기 변동이 심하면 잡음 완화를 적용합니다.",
    "4. 예측 모델은 자동 추천 또는 Holt/ES/SMA 중 선택합니다.",
    "5. 예측 후 MAE, RMSE, MAPE, SMAPE를 확인합니다.",
    "",
    "빠르게 전체 과정을 실행하려면 Timeline 또는 Inspector의 자동분석 버튼을 누르면 됩니다.",
  ].join("\n");
}

/* =========================================================
   Quick Action 질문 생성
   ========================================================= */

function createAnalysisGuideQuestion() {
  const track = TSStore.getSelectedTrack();

  if (!track) {
    return "현재 데이터 기준으로 분석 순서를 추천해줘.";
  }

  return `"${track.name}" Track 기준으로 전처리, 분해, 예측, 평가지표 확인 순서를 추천해줘.`;
}

function createDataSummaryQuestion() {
  return "현재 업로드된 데이터 구조를 요약해줘.";
}

function createMetricHelpQuestion() {
  return "MAE, MSE, RMSE, MAPE, SMAPE 평가지표를 해석해줘.";
}

/* =========================================================
   Scroll
   ========================================================= */

function scrollAssistantToBottom() {
  const list = document.getElementById("assistantMessageList");

  if (!list) return;

  list.scrollTop = list.scrollHeight;
}

/* =========================================================
   HTML Escape
   ========================================================= */

function escapeAssistantHTML(value) {
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

window.TSAssistantUI = {
  renderAssistant,

  createAssistantPanelHTML,
  createAssistantMessagesHTML,
  createAssistantMessageHTML,
  createDefaultAssistantMessage,

  bindAssistantEvents,

  handleAssistantToggle,
  handleAssistantClose,
  openAssistantWithMessage,

  handleAssistantSubmit,
  handleAssistantQuickAction,

  generateAssistantResponse,
  generateDataSummaryResponse,
  generatePreprocessingGuideResponse,
  generateForecastGuideResponse,
  generateMetricGuideResponse,
  generateGeneralAnalysisGuideResponse,

  createAnalysisGuideQuestion,
  createDataSummaryQuestion,
  createMetricHelpQuestion,

  scrollAssistantToBottom,
};