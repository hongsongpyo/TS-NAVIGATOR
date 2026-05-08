# =========================================================
# TS Navigator - config.py
# ---------------------------------------------------------
# 역할
# 1. FastAPI Backend 전역 설정
# 2. Forecast / Analysis 기본 파라미터
# 3. CORS / 서버 주소 관리
# 4. 시계열 기본 설정 관리
# =========================================================

from pathlib import Path

# =========================================================
# 1. 프로젝트 경로
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

# =========================================================
# 2. FastAPI 서버 설정
# =========================================================

API_HOST = "0.0.0.0"
API_PORT = 8000

API_TITLE = "TS Navigator API"
API_VERSION = "1.0.0"

# =========================================================
# 3. Frontend 연결 설정
# =========================================================

ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:5501",
    "http://localhost:5501",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

# =========================================================
# 4. 시계열 기본 설정
# =========================================================

DEFAULT_FORECAST_HORIZON = 12

DEFAULT_SEASONAL_PERIOD = 12

DEFAULT_TEST_SIZE = 0.2

DEFAULT_CONFIDENCE_LEVEL = 0.95

# =========================================================
# 5. 기본 Forecast 모델 설정
# =========================================================

DEFAULT_FORECAST_MODEL = "auto-arima"

SUPPORTED_FORECAST_MODELS = [
    "naive",
    "mean",
    "moving-average",
    "exponential-smoothing",
    "holt",
    "holt-winters",
    "arima",
    "sarima",
    "auto-arima",
    "stl-forecast",
]

# =========================================================
# 6. 기본 파라미터
# =========================================================

DEFAULT_ALPHA = 0.3
DEFAULT_BETA = 0.1
DEFAULT_GAMMA = 0.1

DEFAULT_ARIMA_ORDER = (1, 1, 1)

DEFAULT_SARIMA_ORDER = (1, 1, 1)
DEFAULT_SARIMA_SEASONAL_ORDER = (1, 1, 1, 12)

# =========================================================
# 7. Auto Analysis 설정
# =========================================================

AUTO_ANALYSIS_CANDIDATE_MODELS = [
    "naive",
    "exponential-smoothing",
    "holt",
    "holt-winters",
    "auto-arima",
]

AUTO_ANALYSIS_METRIC = "rmse"

# =========================================================
# 8. 허용 Frequency
# =========================================================

SUPPORTED_FREQUENCIES = [
    "Y",   # Year
    "Q",   # Quarter
    "M",   # Month
    "W",   # Week
    "D",   # Day
    "H",   # Hour
    "T",   # Minute
    "S",   # Second
]

# =========================================================
# 9. 결측치 처리 기본값
# =========================================================

DEFAULT_MISSING_METHOD = "linear"

SUPPORTED_MISSING_METHODS = [
    "drop",
    "ffill",
    "bfill",
    "linear",
    "moving-average",
]

# =========================================================
# 10. 이상치 처리 기본값
# =========================================================

DEFAULT_OUTLIER_METHOD = "iqr"

SUPPORTED_OUTLIER_METHODS = [
    "iqr",
    "zscore",
    "winsorize",
]

# =========================================================
# 11. Decomposition 설정
# =========================================================

SUPPORTED_DECOMPOSITION_MODELS = [
    "additive",
    "multiplicative",
]

DEFAULT_DECOMPOSITION_MODEL = "additive"

# =========================================================
# 12. Metric 설정
# =========================================================

SUPPORTED_METRICS = [
    "mae",
    "mse",
    "rmse",
    "mape",
    "smape",
    "mase",
]

# =========================================================
# 13. 로그 / 디버그
# =========================================================

DEBUG_MODE = True

LOG_LEVEL = "info"

# =========================================================
# 14. Plot 설정
# =========================================================

MAX_PLOT_POINTS = 10000

ENABLE_CONFIDENCE_INTERVAL = True

# =========================================================
# 15. 파일 업로드 제한
# =========================================================

MAX_UPLOAD_ROWS = 1_000_000

MAX_UPLOAD_FILE_SIZE_MB = 100