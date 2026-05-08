# =========================================================
# TS Navigator - schemas.py
# ---------------------------------------------------------
# 역할
# 1. FastAPI 요청 / 응답 데이터 구조 정의
# 2. Frontend JS ↔ Backend Python 간 JSON 형식 통일
# 3. Forecast / Metrics / Auto Analysis 결과 형식 관리
# =========================================================

from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field


# =========================================================
# 1. 공통 타입
# =========================================================

ForecastModel = Literal[
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

HorizonType = Literal[
    "relative",
    "absolute",
]

StatusType = Literal[
    "done",
    "error",
]

SeasonalModel = Literal[
    "additive",
    "multiplicative",
]

MetricName = Literal[
    "mae",
    "mse",
    "rmse",
    "mape",
    "smape",
    "mase",
]

MissingMethod = Literal[
    "drop",
    "ffill",
    "bfill",
    "linear",
    "moving-average",
]

OutlierMethod = Literal[
    "iqr",
    "zscore",
    "winsorize",
]


# =========================================================
# 2. 입력 Row 구조
# =========================================================

class TimeSeriesRow(BaseModel):
    """
    Frontend에서 전달되는 CSV row 1개.

    예:
    {
        "date": "2024-01-01",
        "value": 123.4
    }
    """

    data: Dict[str, Any]


# =========================================================
# 3. Forecast 요청 옵션
# =========================================================

class ForecastOptions(BaseModel):
    model: ForecastModel = Field(default="auto-arima")

    horizon: int = Field(default=12, ge=1)
    horizon_type: HorizonType = Field(default="relative")

    seasonal_period: int = Field(default=12, ge=1)
    seasonal_model: SeasonalModel = Field(default="additive")

    alpha: float = Field(default=0.3, ge=0.0, le=1.0)
    beta: float = Field(default=0.1, ge=0.0, le=1.0)
    gamma: float = Field(default=0.1, ge=0.0, le=1.0)

    window_size: int = Field(default=3, ge=1)

    arima_order: Tuple[int, int, int] = Field(default=(1, 1, 1))
    sarima_order: Tuple[int, int, int] = Field(default=(1, 1, 1))
    sarima_seasonal_order: Tuple[int, int, int, int] = Field(default=(1, 1, 1, 12))

    test_size: float = Field(default=0.2, gt=0.0, lt=1.0)

    confidence_level: float = Field(default=0.95, gt=0.0, lt=1.0)


# =========================================================
# 4. Forecast 요청
# =========================================================

class ForecastRequest(BaseModel):
    rows: List[Dict[str, Any]] = Field(default_factory=list)

    datetime_column: str
    target_column: str

    frequency: Optional[str] = None

    options: ForecastOptions = Field(default_factory=ForecastOptions)


# =========================================================
# 5. Forecast 응답용 Row
# =========================================================

class ForecastRow(BaseModel):
    datetime: Any
    observed: Optional[float] = None
    fitted: Optional[float] = None
    forecast: Optional[float] = None
    lower: Optional[float] = None
    upper: Optional[float] = None

    is_forecast: bool = False
    forecast_index: Optional[int] = None


# =========================================================
# 6. Summary / 메시지
# =========================================================

class ValueSummary(BaseModel):
    count: int = 0
    mean: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None


class AnalysisMessage(BaseModel):
    type: Literal["info", "warning", "error", "success"] = "info"
    message: str


class Recommendation(BaseModel):
    next_step: str
    priority: Literal["low", "normal", "medium", "high"] = "normal"
    message: str


# =========================================================
# 7. Forecast 응답
# =========================================================

class ForecastResponse(BaseModel):
    type: Literal["Forecast"] = "Forecast"
    status: StatusType = "done"

    model: Optional[str] = None
    horizon: Optional[int] = None
    horizon_type: Optional[str] = None

    datetime_column: Optional[str] = None
    target_column: Optional[str] = None
    frequency: Optional[str] = None

    observed: List[Optional[float]] = Field(default_factory=list)
    fitted: List[Optional[float]] = Field(default_factory=list)
    forecast: List[Optional[float]] = Field(default_factory=list)

    lower: List[Optional[float]] = Field(default_factory=list)
    upper: List[Optional[float]] = Field(default_factory=list)

    observed_dates: List[Any] = Field(default_factory=list)
    forecast_dates: List[Any] = Field(default_factory=list)

    rows: List[ForecastRow] = Field(default_factory=list)

    summary: Optional[ValueSummary] = None

    metrics: Dict[str, Optional[float]] = Field(default_factory=dict)

    messages: List[AnalysisMessage] = Field(default_factory=list)
    recommendation: List[Recommendation] = Field(default_factory=list)

    error_message: Optional[str] = None


# =========================================================
# 8. Metrics 요청 / 응답
# =========================================================

class MetricsRequest(BaseModel):
    y_true: List[float] = Field(default_factory=list)
    y_pred: List[float] = Field(default_factory=list)

    metrics: List[MetricName] = Field(
        default_factory=lambda: ["mae", "mse", "rmse", "mape", "smape"]
    )


class MetricsResponse(BaseModel):
    type: Literal["Metrics"] = "Metrics"
    status: StatusType = "done"

    metrics: Dict[str, Optional[float]] = Field(default_factory=dict)

    messages: List[AnalysisMessage] = Field(default_factory=list)
    error_message: Optional[str] = None


# =========================================================
# 9. Preprocessing 요청 / 응답
# =========================================================

class PreprocessingOptions(BaseModel):
    missing_method: MissingMethod = "linear"
    outlier_method: OutlierMethod = "iqr"

    resample_frequency: Optional[str] = None
    normalize: bool = False


class PreprocessingRequest(BaseModel):
    rows: List[Dict[str, Any]] = Field(default_factory=list)

    datetime_column: str
    target_column: str

    frequency: Optional[str] = None

    options: PreprocessingOptions = Field(default_factory=PreprocessingOptions)


class PreprocessingResponse(BaseModel):
    type: Literal["Preprocessing"] = "Preprocessing"
    status: StatusType = "done"

    rows: List[Dict[str, Any]] = Field(default_factory=list)

    datetime_column: Optional[str] = None
    target_column: Optional[str] = None
    frequency: Optional[str] = None

    before: Optional[ValueSummary] = None
    after: Optional[ValueSummary] = None

    messages: List[AnalysisMessage] = Field(default_factory=list)
    error_message: Optional[str] = None


# =========================================================
# 10. Decomposition 요청 / 응답
# =========================================================

class DecompositionRequest(BaseModel):
    rows: List[Dict[str, Any]] = Field(default_factory=list)

    datetime_column: str
    target_column: str

    frequency: Optional[str] = None

    seasonal_period: int = Field(default=12, ge=2)
    model: SeasonalModel = "additive"


class DecompositionResponse(BaseModel):
    type: Literal["Decomposition"] = "Decomposition"
    status: StatusType = "done"

    dates: List[Any] = Field(default_factory=list)

    observed: List[Optional[float]] = Field(default_factory=list)
    trend: List[Optional[float]] = Field(default_factory=list)
    seasonal: List[Optional[float]] = Field(default_factory=list)
    residual: List[Optional[float]] = Field(default_factory=list)

    messages: List[AnalysisMessage] = Field(default_factory=list)
    error_message: Optional[str] = None


# =========================================================
# 11. Auto Analysis 요청 / 응답
# =========================================================

class AutoAnalysisOptions(BaseModel):
    horizon: int = Field(default=12, ge=1)
    test_size: float = Field(default=0.2, gt=0.0, lt=1.0)

    seasonal_period: int = Field(default=12, ge=1)

    run_missing: bool = True
    run_outlier: bool = True
    run_decomposition: bool = True

    candidate_models: List[ForecastModel] = Field(
        default_factory=lambda: [
            "naive",
            "exponential-smoothing",
            "holt",
            "holt-winters",
            "auto-arima",
        ]
    )

    select_metric: MetricName = "rmse"


class AutoAnalysisRequest(BaseModel):
    rows: List[Dict[str, Any]] = Field(default_factory=list)

    datetime_column: str
    target_column: str

    frequency: Optional[str] = None

    options: AutoAnalysisOptions = Field(default_factory=AutoAnalysisOptions)


class ModelComparisonResult(BaseModel):
    model: str
    metrics: Dict[str, Optional[float]] = Field(default_factory=dict)
    rank: Optional[int] = None


class AutoAnalysisResponse(BaseModel):
    type: Literal["AutoAnalysis"] = "AutoAnalysis"
    status: StatusType = "done"

    best_model: Optional[str] = None
    select_metric: Optional[str] = None

    comparison: List[ModelComparisonResult] = Field(default_factory=list)

    forecast_result: Optional[ForecastResponse] = None
    preprocessing_result: Optional[PreprocessingResponse] = None
    decomposition_result: Optional[DecompositionResponse] = None

    messages: List[AnalysisMessage] = Field(default_factory=list)
    recommendation: List[Recommendation] = Field(default_factory=list)

    error_message: Optional[str] = None


# =========================================================
# 12. Health Check
# =========================================================

class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    app: str = "TS Navigator API"
    version: str = "1.0.0"