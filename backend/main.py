# =========================================================
# TS Navigator - main.py
# ---------------------------------------------------------
# 역할
# 1. FastAPI 서버 실행 진입점
# 2. Frontend JS와 Backend Python 연결
# 3. Forecast API 제공
# 4. Health Check 제공
# =========================================================

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import (
    API_HOST,
    API_PORT,
    API_TITLE,
    API_VERSION,
    ALLOWED_ORIGINS,
)
from backend.schemas import (
    ForecastRequest,
    ForecastResponse,
    HealthResponse,
)
from backend.services.forecasting import run_forecast


# =========================================================
# 1. FastAPI App 생성
# =========================================================

app = FastAPI(
    title=API_TITLE,
    version=API_VERSION,
    description="TS Navigator FastAPI Backend",
)


# =========================================================
# 2. CORS 설정
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# 3. Health Check
# =========================================================

@app.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """
    서버 연결 상태 확인.
    """

    return HealthResponse(
        status="ok",
        app=API_TITLE,
        version=API_VERSION,
    )


# =========================================================
# 4. Forecast API
# =========================================================

@app.post("/forecast", response_model=ForecastResponse)
def forecast(request: ForecastRequest):
    """
    시계열 예측 API.

    Frontend에서 rows, datetime_column, target_column, options를 전달하면
    Python backend에서 sktime / statsmodels 기반 예측을 수행한다.
    """

    result = run_forecast(request)

    return result


# =========================================================
# 5. Root
# =========================================================

@app.get("/")
def root():
    """
    API 기본 안내.
    """

    return {
        "app": API_TITLE,
        "version": API_VERSION,
        "status": "running",
        "endpoints": {
            "health": "/health",
            "forecast": "/forecast",
            "docs": "/docs",
        },
    }


# =========================================================
# 6. 직접 실행
# =========================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
    )