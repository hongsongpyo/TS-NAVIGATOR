/* =========================================================
   TS Navigator - api.js
   ---------------------------------------------------------
   역할
   1. Frontend JS와 FastAPI Backend 연결
   2. Forecast API 요청
   3. Health Check 요청
   4. 공통 fetch 처리
========================================================= */

/* =========================================================
   1. API 기본 설정
========================================================= */

const TS_API_BASE_URL = "http://127.0.0.1:8000";

/* =========================================================
   2. 공통 Fetch 함수
========================================================= */

async function requestAPI(endpoint, options = {}) {
  const url = `${TS_API_BASE_URL}${endpoint}`;

  const fetchOptions = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, fetchOptions);

    const data = await response.json();

    if (!response.ok) {
      return {
        status: "error",
        error_message:
          data?.detail ||
          data?.error_message ||
          `API 요청 실패: ${response.status}`,
        messages: [
          {
            type: "error",
            message:
              data?.detail ||
              data?.error_message ||
              `API 요청 실패: ${response.status}`
          }
        ]
      };
    }

    return data;
  } catch (error) {
    return {
      status: "error",
      error_message: error.message,
      messages: [
        {
          type: "error",
          message: `Backend 연결 실패: ${error.message}`
        }
      ]
    };
  }
}

/* =========================================================
   3. Health Check
========================================================= */

async function checkBackendHealth() {
  return requestAPI("/health", {
    method: "GET"
  });
}

/* =========================================================
   4. Forecast API
========================================================= */

async function requestForecast(payload) {
  return requestAPI("/forecast", {
    method: "POST",
    body: payload
  });
}

/* =========================================================
   5. Forecast Payload 생성
========================================================= */

function createForecastPayload({
  rows,
  datetimeColumn,
  targetColumn,
  frequency = null,
  model = "auto-arima",
  horizon = 12,
  horizonType = "relative",
  seasonalPeriod = 12,
  seasonalModel = "additive",
  alpha = 0.3,
  beta = 0.1,
  gamma = 0.1,
  windowSize = 3,
  arimaOrder = [1, 1, 1],
  sarimaOrder = [1, 1, 1],
  sarimaSeasonalOrder = [1, 1, 1, 12],
  testSize = 0.2,
  confidenceLevel = 0.95
}) {
  return {
    rows: rows || [],
    datetime_column: datetimeColumn,
    target_column: targetColumn,
    frequency,

    options: {
      model,
      horizon: Number(horizon),
      horizon_type: horizonType,

      seasonal_period: Number(seasonalPeriod),
      seasonal_model: seasonalModel,

      alpha: Number(alpha),
      beta: Number(beta),
      gamma: Number(gamma),

      window_size: Number(windowSize),

      arima_order: arimaOrder,
      sarima_order: sarimaOrder,
      sarima_seasonal_order: sarimaSeasonalOrder,

      test_size: Number(testSize),
      confidence_level: Number(confidenceLevel)
    }
  };
}

/* =========================================================
   6. Track 기반 Forecast 요청 Payload
========================================================= */

function createForecastPayloadFromTrack(track, params = {}) {
  const rows = track?.data || [];

  const datetimeColumn =
    params.datetimeColumn ||
    track?.metadata?.datetimeColumn ||
    window.TSState?.dataset?.datetimeColumn;

  const targetColumn =
    params.targetColumn ||
    track?.metadata?.targetColumn ||
    window.TSState?.dataset?.targetColumn;

  const frequency =
    params.frequency ||
    track?.metadata?.frequency ||
    window.TSState?.dataset?.frequency?.code ||
    window.TSState?.dataset?.frequency ||
    null;

  return createForecastPayload({
    rows,
    datetimeColumn,
    targetColumn,
    frequency,

    model: params.model || "auto-arima",
    horizon: params.horizon || 12,
    horizonType: params.horizonType || "relative",

    seasonalPeriod: params.seasonalPeriod || 12,
    seasonalModel: params.seasonalModel || "additive",

    alpha: params.alpha ?? 0.3,
    beta: params.beta ?? 0.1,
    gamma: params.gamma ?? 0.1,

    windowSize: params.windowSize || 3,

    arimaOrder: params.arimaOrder || [1, 1, 1],
    sarimaOrder: params.sarimaOrder || [1, 1, 1],
    sarimaSeasonalOrder: params.sarimaSeasonalOrder || [1, 1, 1, 12],

    testSize: params.testSize || 0.2,
    confidenceLevel: params.confidenceLevel || 0.95
  });
}

/* =========================================================
   7. API 상태 표시 보조
========================================================= */

function isAPIError(result) {
  return !result || result.status === "error";
}

function getAPIErrorMessage(result) {
  if (!result) {
    return "알 수 없는 API 오류가 발생했습니다.";
  }

  return (
    result.error_message ||
    result.message ||
    result.messages?.[0]?.message ||
    "API 요청 중 오류가 발생했습니다."
  );
}

/* =========================================================
   8. 외부 접근용 객체
========================================================= */

window.TSApi = {
  baseURL: TS_API_BASE_URL,

  requestAPI,
  checkBackendHealth,

  requestForecast,
  createForecastPayload,
  createForecastPayloadFromTrack,

  isAPIError,
  getAPIErrorMessage
};