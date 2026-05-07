/* =========================================================
   TS Navigator - assistant.js
   ---------------------------------------------------------
   역할
   1. 오른쪽 하단 AI Assistant 원형 버튼 렌더링
   2. 클릭 시 작은 팝업 형태의 도움말 창 표시
   3. 현재 Track / 분석 결과 / Metrics / Recommendation 요약 복사
   4. 사용자가 분석 결과를 붙여넣고 질문할 수 있는 입력창 제공
   5. 실제 외부 AI API 없이, 프로젝트 내부 상태 기반 안내 응답 제공
========================================================= */

/* =========================================================
   1. DOM / 상태
========================================================= */

let assistantRoot = null;

const TSAssistantState = {
  isOpen: false,
  draft: "",
  copiedAt: null
};

/* =========================================================
   2. 초기화
========================================================= */

function initAssistant() {
  ensureAssistantRoot();
  restoreAssistantState();
  renderAssistant();
  bindAssistantEvents();
}

function ensureAssistantRoot() {
  assistantRoot = document.getElementById("tsAssistantRoot");

  if (!assistantRoot) {
    assistantRoot = document.createElement("div");
    assistantRoot.id = "tsAssistantRoot";
    document.body.appendChild(assistantRoot);
  }
}

function bindAssistantEvents() {
  if (!assistantRoot) return;

  assistantRoot.addEventListener("click", handleAssistantClick);
  assistantRoot.addEventListener("input", handleAssistantInput);
  assistantRoot.addEventListener("keydown", handleAssistantKeydown);
}

/* =========================================================
   3. 상태 복원 / 저장
========================================================= */

function restoreAssistantState() {
  if (window.TSState?.assistant) {
    TSAssistantState.isOpen = Boolean(window.TSState.assistant.isOpen);
  }
}

function syncAssistantState() {
  if (!window.TSState) return;

  window.TSState.assistant = {
    ...(window.TSState.assistant || {}),
    isOpen: TSAssistantState.isOpen
  };

  if (window.TSLayout) {
    window.TSLayout.saveWorkspaceState();
  }
}

/* =========================================================
   4. 렌더링
========================================================= */

function renderAssistant() {
  ensureAssistantRoot();

  assistantRoot.innerHTML = `
    <button
      class="ai-floating-btn"
      data-assistant-action="toggle"
      title="AI Assistant"
    >
      AI
    </button>

    ${TSAssistantState.isOpen ? createAssistantPanelHTML() : ""}
  `;

  injectAssistantStyle();
}

function createAssistantPanelHTML() {
  const messages = window.TSState?.assistant?.messages || [];

  return `
    <section class="ai-panel">
      <div class="ai-panel-head">
        <div>
          <strong>AI Assistant</strong>
          <span>분석 결과를 복사해서 질문하세요.</span>
        </div>
        <button class="ai-close" data-assistant-action="close">×</button>
      </div>

      <div class="ai-quick-actions">
        <button data-assistant-action="copy-current-summary">현재 Track 요약 복사</button>
        <button data-assistant-action="copy-metrics">Metrics 복사</button>
        <button data-assistant-action="copy-recommendation">추천 단계 복사</button>
      </div>

      <div class="ai-context-box">
        ${createCurrentContextHTML()}
      </div>

      <div class="ai-message-list">
        ${messages.length > 0
          ? messages.map(createMessageHTML).join("")
          : createEmptyMessageHTML()}
      </div>

      <div class="ai-input-area">
        <textarea
          class="ai-textarea"
          data-assistant-input="draft"
          placeholder="분석 결과를 붙여넣거나, 어떤 분석을 해야 할지 질문하세요."
        >${escapeHTML(TSAssistantState.draft)}</textarea>

        <div class="ai-input-actions">
          <button data-assistant-action="clear-chat">Clear</button>
          <button class="primary" data-assistant-action="send-message">Ask</button>
        </div>
      </div>
    </section>
  `;
}

function createCurrentContextHTML() {
  const track = window.TSStore?.getSelectedTrack();

  if (!track) {
    return `
      <strong>No selected track</strong><br />
      Track을 선택하면 현재 분석 상태가 여기에 표시됩니다.
    `;
  }

  const resultType = track.result?.type || track.type || "-";
  const stackCount = track.analysisStack?.length || 0;
  const metricText = track.metrics
    ? Object.entries(track.metrics)
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${formatNumber(value)}`)
        .join(" · ")
    : "Metrics 없음";

  return `
    <strong>${escapeHTML(track.name)}</strong><br />
    Type: ${escapeHTML(track.type)}<br />
    Result: ${escapeHTML(resultType)}<br />
    Stack: ${stackCount} steps<br />
    ${escapeHTML(metricText)}
  `;
}

function createMessageHTML(message) {
  return `
    <div class="ai-message ${escapeHTML(message.role)}">
      <div class="ai-message-role">${escapeHTML(message.role)}</div>
      <div class="ai-message-body">${formatMessageBody(message.content)}</div>
    </div>
  `;
}

function createEmptyMessageHTML() {
  return `
    <div class="ai-empty-message">
      예: “현재 RMSE가 큰 이유가 뭐야?”<br />
      예: “다음 분석 단계로 뭘 해야 해?”
    </div>
  `;
}

/* =========================================================
   5. 이벤트 처리
========================================================= */

function handleAssistantClick(event) {
  const target = event.target.closest("[data-assistant-action]");
  if (!target) return;

  const action = target.dataset.assistantAction;

  if (action === "toggle") {
    toggleAssistant();
    return;
  }

  if (action === "close") {
    closeAssistant();
    return;
  }

  if (action === "send-message") {
    sendAssistantMessage();
    return;
  }

  if (action === "clear-chat") {
    clearAssistantChat();
    return;
  }

  if (action === "copy-current-summary") {
    copyTextToClipboard(createCurrentTrackSummaryText());
    return;
  }

  if (action === "copy-metrics") {
    copyTextToClipboard(createCurrentMetricsText());
    return;
  }

  if (action === "copy-recommendation") {
    copyTextToClipboard(createCurrentRecommendationText());
  }
}

function handleAssistantInput(event) {
  const input = event.target.closest("[data-assistant-input='draft']");
  if (!input) return;

  TSAssistantState.draft = input.value;
}

function handleAssistantKeydown(event) {
  const input = event.target.closest("[data-assistant-input='draft']");
  if (!input) return;

  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    sendAssistantMessage();
  }
}

/* =========================================================
   6. 열기 / 닫기
========================================================= */

function toggleAssistant() {
  TSAssistantState.isOpen = !TSAssistantState.isOpen;

  if (window.TSStore) {
    if (TSAssistantState.isOpen) {
      window.TSStore.openAssistant();
    } else {
      window.TSStore.closeAssistant();
    }
  }

  syncAssistantState();
  renderAssistant();
}

function closeAssistant() {
  TSAssistantState.isOpen = false;

  if (window.TSStore) {
    window.TSStore.closeAssistant();
  }

  syncAssistantState();
  renderAssistant();
}

/* =========================================================
   7. 메시지 전송 / 내부 응답
========================================================= */

function sendAssistantMessage() {
  const text = TSAssistantState.draft.trim();
  if (!text) return;

  addAssistantMessage("user", text);

  const reply = createAssistantReply(text);
  addAssistantMessage("assistant", reply);

  TSAssistantState.draft = "";

  syncAssistantState();
  renderAssistant();
}

function addAssistantMessage(role, content) {
  if (window.TSStore) {
    window.TSStore.addAssistantMessage(role, content);
    return;
  }

  if (!window.TSState) return;

  if (!window.TSState.assistant) {
    window.TSState.assistant = {
      isOpen: true,
      messages: []
    };
  }

  window.TSState.assistant.messages.push({
    id: `msg_${Date.now()}`,
    role,
    content,
    createdAt: new Date().toISOString()
  });
}

function clearAssistantChat() {
  if (window.TSState?.assistant) {
    window.TSState.assistant.messages = [];
  }

  TSAssistantState.draft = "";
  syncAssistantState();
  renderAssistant();
}

/* =========================================================
   8. 내부 안내 응답 생성
========================================================= */

function createAssistantReply(userText) {
  const lower = userText.toLowerCase();
  const track = window.TSStore?.getSelectedTrack();

  if (!track) {
    return [
      "현재 선택된 Track이 없습니다.",
      "먼저 Track Timeline에서 분석할 Track을 선택한 뒤 질문하면, 현재 결과를 기준으로 다음 단계를 안내할 수 있습니다."
    ].join("\n");
  }

  if (lower.includes("rmse") || lower.includes("mae") || lower.includes("mape") || lower.includes("성능")) {
    return createMetricAdvice(track);
  }

  if (lower.includes("다음") || lower.includes("next") || lower.includes("해야") || lower.includes("추천")) {
    return createNextStepAdvice(track);
  }

  if (lower.includes("결측") || lower.includes("missing")) {
    return createMissingAdvice(track);
  }

  if (lower.includes("이상치") || lower.includes("outlier")) {
    return createOutlierAdvice(track);
  }

  if (lower.includes("정상성") || lower.includes("stationarity") || lower.includes("차분")) {
    return createStationarityAdvice(track);
  }

  if (lower.includes("예측") || lower.includes("forecast") || lower.includes("모델")) {
    return createForecastAdvice(track);
  }

  if (lower.includes("잔차") || lower.includes("residual")) {
    return createResidualAdvice(track);
  }

  return createGeneralAdvice(track);
}

function createMetricAdvice(track) {
  const metrics = track.metrics || track.result?.metrics || track.metadata?.metrics;

  if (!metrics) {
    return [
      "현재 Track에는 Metrics 결과가 없습니다.",
      "Forecast 실행 후 Metrics를 추가하면 MAE, RMSE, MAPE, SMAPE, MASE 등을 한 번에 확인할 수 있습니다.",
      "검증 구간이 없다면 Validation을 먼저 실행하는 것이 좋습니다."
    ].join("\n");
  }

  const lines = ["현재 Metrics 기준 해석입니다."];

  if (Number.isFinite(metrics.RMSE)) {
    lines.push(`RMSE는 ${formatNumber(metrics.RMSE)}입니다. 값이 작을수록 예측 오차가 작습니다.`);
  }

  if (Number.isFinite(metrics.MAPE)) {
    lines.push(`MAPE는 ${(metrics.MAPE * 100).toFixed(2)}%입니다. 0에 가까울수록 좋지만 실제값이 0 근처이면 불안정할 수 있습니다.`);
  }

  if (Number.isFinite(metrics.MASE)) {
    lines.push(`MASE는 ${formatNumber(metrics.MASE)}입니다. 1보다 작으면 naive 예측보다 좋다고 볼 수 있습니다.`);
  }

  if (Number.isFinite(metrics.TS) && Math.abs(metrics.TS) > 4) {
    lines.push("Tracking Signal 절댓값이 커서 예측 편향 가능성이 있습니다. Residual 분석을 권장합니다.");
  }

  lines.push("다른 모델과 비교하려면 Compare에서 Metrics 기준 비교를 실행하세요.");

  return lines.join("\n");
}

function createNextStepAdvice(track) {
  const result = track.result || {};
  const recommendations = result.recommendation || track.metadata?.recommendation || [];

  if (Array.isArray(recommendations) && recommendations.length > 0) {
    return [
      "현재 결과 기준 추천 단계입니다.",
      ...recommendations.map(item => `- ${item.nextStep}: ${item.message}`)
    ].join("\n");
  }

  if (track.type === "Original Data") {
    return "원본 데이터 Track입니다. Structure 확인 후 Missing, Outlier, Resampling 순서로 전처리를 진행하는 것이 좋습니다.";
  }

  if (track.type === "Preprocessed Data") {
    return "전처리된 Track입니다. Stationarity 또는 Forecast를 실행하고, 예측 후 Metrics와 Residual을 확인하세요.";
  }

  if (track.type === "Forecast Data") {
    return "예측 Track입니다. Metrics로 성능을 확인하고 Residual로 예측 오차 구조를 점검하세요.";
  }

  return "현재 Track에 맞는 다음 단계는 Forecast → Metrics → Residual → Compare 순서로 확인하는 것이 좋습니다.";
}

function createMissingAdvice(track) {
  return [
    "결측 처리는 데이터의 시간 간격과 값의 결측을 나누어 봐야 합니다.",
    "timestamp 자체가 빠져 있으면 Resampling 또는 Missing Timestamp 생성이 필요합니다.",
    "값만 비어 있다면 Linear Interpolation, LOCF, NOCB, Moving Average 방식 중 데이터 성격에 맞게 선택하세요.",
    "처리 후에는 Outlier와 Compare로 보간 영향이 과하지 않은지 확인하는 것이 좋습니다."
  ].join("\n");
}

function createOutlierAdvice(track) {
  return [
    "이상치는 Z-score, IQR, Hampel 방식으로 탐지할 수 있습니다.",
    "시계열에서는 주변 window 기준으로 판단하는 Hampel 방식이 급격한 튐을 찾기에 적합합니다.",
    "이상치를 무조건 제거하기보다 keep, median, mean, linear interpolation 결과를 Compare로 비교하는 것이 좋습니다."
  ].join("\n");
}

function createStationarityAdvice(track) {
  return [
    "정상성은 평균과 분산이 시간에 따라 크게 변하지 않는지 확인하는 과정입니다.",
    "추세가 강하면 difference를, 분산이 커지는 형태라면 log 또는 log-difference를 검토하세요.",
    "ARIMA 계열 모델을 사용할 때는 Stationarity 결과를 먼저 확인하는 것이 좋습니다."
  ].join("\n");
}

function createForecastAdvice(track) {
  return [
    "예측 모델 선택 기준입니다.",
    "추세가 거의 없으면 Naive, Mean, Moving Average를 기준선으로 사용하세요.",
    "추세가 있으면 Holt, 추세와 계절성이 함께 있으면 Holt-Winters가 적합합니다.",
    "정상성이 확보된 데이터라면 ARIMA도 비교 후보로 넣는 것이 좋습니다.",
    "Auto Analysis를 실행하면 여러 후보 모델을 비교해 자동으로 하나를 선택합니다."
  ].join("\n");
}

function createResidualAdvice(track) {
  return [
    "잔차는 실제값 - 예측값입니다.",
    "좋은 예측 모델이라면 잔차 평균이 0에 가깝고, 특정 패턴이나 자기상관이 적어야 합니다.",
    "잔차에 자기상관이 남아 있으면 모델이 아직 설명하지 못한 시간 구조가 있다는 뜻이므로 Forecast 모델을 조정하세요."
  ].join("\n");
}

function createGeneralAdvice(track) {
  return [
    `현재 선택된 Track은 "${track.name}"입니다.`,
    "분석 흐름은 보통 Structure → Missing → Outlier → Resampling → Smoothing/Decomposition → Stationarity → Forecast → Metrics → Residual → Compare 순서로 진행합니다.",
    "빠르게 전체 결과를 보고 싶다면 Auto Analysis를 실행하세요."
  ].join("\n");
}

/* =========================================================
   9. 복사용 텍스트 생성
========================================================= */

function createCurrentTrackSummaryText() {
  const track = window.TSStore?.getSelectedTrack();

  if (!track) {
    return "선택된 Track이 없습니다.";
  }

  const lines = [
    "[TS Navigator Track Summary]",
    `Track Name: ${track.name}`,
    `Track Type: ${track.type}`,
    `Rows: ${track.data?.length || 0}`,
    `Stack Count: ${track.analysisStack?.length || 0}`,
    `Updated At: ${track.updatedAt || "-"}`
  ];

  if (track.result) {
    lines.push("");
    lines.push("[Result]");
    lines.push(JSON.stringify(track.result, null, 2));
  }

  return lines.join("\n");
}

function createCurrentMetricsText() {
  const track = window.TSStore?.getSelectedTrack();
  const metrics = track?.metrics || track?.result?.metrics || track?.metadata?.metrics;

  if (!metrics) {
    return "현재 Track에는 Metrics 결과가 없습니다.";
  }

  return [
    "[TS Navigator Metrics]",
    ...Object.entries(metrics).map(([key, value]) => `${key}: ${formatNumber(value, 6)}`)
  ].join("\n");
}

function createCurrentRecommendationText() {
  const track = window.TSStore?.getSelectedTrack();
  const recommendation = track?.result?.recommendation || [];

  if (!Array.isArray(recommendation) || recommendation.length === 0) {
    return "현재 Track에는 추천 단계가 없습니다.";
  }

  return [
    "[TS Navigator Recommendation]",
    ...recommendation.map(item => `${item.nextStep} (${item.priority}): ${item.message}`)
  ].join("\n");
}

/* =========================================================
   10. Clipboard
========================================================= */

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    TSAssistantState.copiedAt = new Date().toISOString();
    showAssistantToast("복사되었습니다.");
  } catch (error) {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);

  TSAssistantState.copiedAt = new Date().toISOString();
  showAssistantToast("복사되었습니다.");
}

function showAssistantToast(message) {
  let toast = document.getElementById("ts-assistant-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ts-assistant-toast";
    toast.className = "assistant-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1300);
}

/* =========================================================
   11. Format
========================================================= */

function formatMessageBody(content) {
  return escapeHTML(content).replace(/\n/g, "<br />");
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
   12. 스타일 주입
========================================================= */

function injectAssistantStyle() {
  if (document.getElementById("ts-assistant-style")) return;

  const style = document.createElement("style");
  style.id = "ts-assistant-style";
  style.textContent = `
    #tsAssistantRoot {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 80;
      font-family: inherit;
    }

    .ai-floating-btn {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,.14);
      background: linear-gradient(145deg, #3b3b3b, #242424);
      color: #f3f3f3;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .04em;
      cursor: pointer;
      box-shadow: 0 14px 34px rgba(0,0,0,.45);
    }

    .ai-floating-btn:hover {
      background: linear-gradient(145deg, #464646, #292929);
    }

    .ai-panel {
      position: absolute;
      right: 0;
      bottom: 58px;
      width: 330px;
      max-height: 520px;
      display: grid;
      grid-template-rows: auto auto auto 1fr auto;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 10px;
      background: rgba(35,35,35,.97);
      color: #e8e8e8;
      box-shadow: 0 22px 54px rgba(0,0,0,.52);
      overflow: hidden;
    }

    .ai-panel-head {
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      background: linear-gradient(#3a3a3a, #2d2d2d);
    }

    .ai-panel-head strong {
      display: block;
      font-size: 12px;
    }

    .ai-panel-head span {
      display: block;
      margin-top: 3px;
      font-size: 9px;
      color: #a9a9a9;
    }

    .ai-close {
      border: none;
      background: transparent;
      color: #d8d8d8;
      font-size: 18px;
      cursor: pointer;
    }

    .ai-quick-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 5px;
      padding: 9px;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }

    .ai-quick-actions button,
    .ai-input-actions button {
      height: 26px;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 6px;
      background: #303030;
      color: #dcdcdc;
      font-size: 9px;
      cursor: pointer;
    }

    .ai-quick-actions button:hover,
    .ai-input-actions button:hover {
      background: #3a3a3a;
    }

    .ai-context-box {
      margin: 9px;
      padding: 8px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 7px;
      background: rgba(0,0,0,.14);
      color: #cfcfcf;
      font-size: 9px;
      line-height: 1.55;
    }

    .ai-message-list {
      min-height: 120px;
      max-height: 190px;
      overflow-y: auto;
      padding: 9px;
      display: grid;
      gap: 8px;
    }

    .ai-message {
      padding: 8px;
      border-radius: 7px;
      font-size: 9px;
      line-height: 1.55;
      border: 1px solid rgba(255,255,255,.07);
    }

    .ai-message.user {
      background: rgba(118,168,120,.13);
    }

    .ai-message.assistant {
      background: rgba(155,141,183,.13);
    }

    .ai-message-role {
      margin-bottom: 4px;
      color: #f1f1f1;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: .06em;
    }

    .ai-empty-message {
      display: grid;
      place-items: center;
      min-height: 84px;
      text-align: center;
      color: #9a9a9a;
      font-size: 9px;
      line-height: 1.6;
    }

    .ai-input-area {
      padding: 9px;
      border-top: 1px solid rgba(255,255,255,.08);
      background: rgba(0,0,0,.1);
    }

    .ai-textarea {
      width: 100%;
      height: 74px;
      resize: none;
      padding: 8px;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 7px;
      background: #1f1f1f;
      color: #f1f1f1;
      font-size: 10px;
      line-height: 1.45;
      outline: none;
      box-sizing: border-box;
    }

    .ai-textarea:focus {
      border-color: rgba(118,168,120,.45);
    }

    .ai-input-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      margin-top: 7px;
    }

    .ai-input-actions button {
      min-width: 62px;
    }

    .ai-input-actions button.primary {
      background: #5f8f63;
      color: #ffffff;
      border-color: rgba(255,255,255,.14);
    }

    .assistant-toast {
      position: fixed;
      right: 20px;
      bottom: 78px;
      padding: 8px 11px;
      border-radius: 999px;
      background: rgba(42,42,42,.96);
      color: #f1f1f1;
      border: 1px solid rgba(255,255,255,.12);
      font-size: 10px;
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
      z-index: 100;
      transition: opacity .18s ease, transform .18s ease;
    }

    .assistant-toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   13. 외부 접근용 객체
========================================================= */

window.TSAssistantUI = {
  state: TSAssistantState,

  initAssistant,
  renderAssistant,

  toggleAssistant,
  closeAssistant,

  sendAssistantMessage,
  clearAssistantChat,

  createCurrentTrackSummaryText,
  createCurrentMetricsText,
  createCurrentRecommendationText,

  createAssistantReply
};

/* =========================================================
   14. 자동 초기화
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initAssistant();
});