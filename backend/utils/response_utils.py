# =========================================================
# TS Navigator - response_utils.py
# ---------------------------------------------------------
# 역할
# 1. pandas / numpy 값을 JSON 응답 가능한 형태로 변환
# 2. Forecast / Metrics / Decomposition 응답 생성 보조
# 3. Frontend Plotly 차트가 바로 사용할 수 있는 리스트 구조 생성
# =========================================================

from __future__ import annotations

from typing import Any, Dict, List, Optional

import math
import numpy as np
import pandas as pd


# =========================================================
# 1. JSON 안전 변환
# =========================================================

def to_json_safe(value: Any) -> Any:
    """
    numpy / pandas / datetime 값을 JSON 직렬화 가능한 값으로 변환.
    """

    if value is None:
        return None

    if isinstance(value, (np.integer,)):
        return int(value)

    if isinstance(value, (np.floating,)):
        value = float(value)

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value

    if isinstance(value, (np.ndarray,)):
        return [to_json_safe(item) for item in value.tolist()]

    if isinstance(value, (pd.Series,)):
        return [to_json_safe(item) for item in value.tolist()]

    if isinstance(value, (pd.Index,)):
        return [to_json_safe(item) for item in value.tolist()]

    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()

    if isinstance(value, (pd.Period,)):
        return str(value)

    if isinstance(value, dict):
        return {
            str(key): to_json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, list):
        return [to_json_safe(item) for item in value]

    if isinstance(value, tuple):
        return [to_json_safe(item) for item in value]

    if pd.isna(value):
        return None

    return value


def list_to_json_safe(values: List[Any]) -> List[Any]:
    """
    리스트 전체 JSON 안전 변환.
    """

    return [to_json_safe(value) for value in values]


def dict_to_json_safe(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    dict 전체 JSON 안전 변환.
    """

    return {
        str(key): to_json_safe(value)
        for key, value in data.items()
    }


# =========================================================
# 2. Summary 생성
# =========================================================

def create_value_summary(values: List[Any]) -> Dict[str, Optional[float]]:
    """
    수치형 시계열 요약 통계 생성.
    """

    series = pd.Series(values, dtype="float64").dropna()

    if len(series) == 0:
        return {
            "count": 0,
            "mean": None,
            "std": None,
            "min": None,
            "max": None,
        }

    return {
        "count": int(series.count()),
        "mean": to_json_safe(series.mean()),
        "std": to_json_safe(series.std(ddof=1)),
        "min": to_json_safe(series.min()),
        "max": to_json_safe(series.max()),
    }


# =========================================================
# 3. 메시지 생성
# =========================================================

def create_message(
    message: str,
    message_type: str = "info",
) -> Dict[str, str]:
    """
    공통 메시지 객체 생성.
    """

    return {
        "type": message_type,
        "message": message,
    }


def create_error_message(message: str) -> Dict[str, str]:
    """
    에러 메시지 객체 생성.
    """

    return create_message(message, "error")


def create_success_message(message: str) -> Dict[str, str]:
    """
    성공 메시지 객체 생성.
    """

    return create_message(message, "success")


def create_warning_message(message: str) -> Dict[str, str]:
    """
    경고 메시지 객체 생성.
    """

    return create_message(message, "warning")


# =========================================================
# 4. 추천 생성
# =========================================================

def create_recommendation(
    next_step: str,
    message: str,
    priority: str = "normal",
) -> Dict[str, str]:
    """
    다음 분석 추천 객체 생성.
    """

    return {
        "next_step": next_step,
        "priority": priority,
        "message": message,
    }


# =========================================================
# 5. Forecast Row 생성
# =========================================================

def create_forecast_rows(
    observed_dates: List[Any],
    observed_values: List[Any],
    fitted_values: Optional[List[Any]] = None,
    forecast_dates: Optional[List[Any]] = None,
    forecast_values: Optional[List[Any]] = None,
    lower_values: Optional[List[Any]] = None,
    upper_values: Optional[List[Any]] = None,
) -> List[Dict[str, Any]]:
    """
    observed + fitted + forecast를 하나의 rows 구조로 변환.

    Frontend forecastChart.js에서 바로 사용 가능.
    """

    fitted_values = fitted_values or []
    forecast_dates = forecast_dates or []
    forecast_values = forecast_values or []
    lower_values = lower_values or []
    upper_values = upper_values or []

    rows = []

    for index, date in enumerate(observed_dates):
        rows.append({
            "datetime": to_json_safe(date),
            "observed": to_json_safe(
                observed_values[index]
                if index < len(observed_values)
                else None
            ),
            "fitted": to_json_safe(
                fitted_values[index]
                if index < len(fitted_values)
                else None
            ),
            "forecast": None,
            "lower": None,
            "upper": None,
            "is_forecast": False,
            "forecast_index": None,
        })

    for index, date in enumerate(forecast_dates):
        rows.append({
            "datetime": to_json_safe(date),
            "observed": None,
            "fitted": None,
            "forecast": to_json_safe(
                forecast_values[index]
                if index < len(forecast_values)
                else None
            ),
            "lower": to_json_safe(
                lower_values[index]
                if index < len(lower_values)
                else None
            ),
            "upper": to_json_safe(
                upper_values[index]
                if index < len(upper_values)
                else None
            ),
            "is_forecast": True,
            "forecast_index": index,
        })

    return rows


# =========================================================
# 6. Decomposition Row 생성
# =========================================================

def create_decomposition_rows(
    dates: List[Any],
    observed: List[Any],
    trend: List[Any],
    seasonal: List[Any],
    residual: List[Any],
) -> List[Dict[str, Any]]:
    """
    decomposition 결과를 row list로 변환.
    """

    rows = []

    max_length = max(
        len(dates),
        len(observed),
        len(trend),
        len(seasonal),
        len(residual),
    )

    for index in range(max_length):
        rows.append({
            "datetime": to_json_safe(dates[index]) if index < len(dates) else None,
            "observed": to_json_safe(observed[index]) if index < len(observed) else None,
            "trend": to_json_safe(trend[index]) if index < len(trend) else None,
            "seasonal": to_json_safe(seasonal[index]) if index < len(seasonal) else None,
            "residual": to_json_safe(residual[index]) if index < len(residual) else None,
        })

    return rows


# =========================================================
# 7. Metrics 정리
# =========================================================

def create_metrics_table_rows(
    metrics: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    metrics dict를 테이블 row 구조로 변환.
    """

    rows = []

    for metric_name, metric_value in metrics.items():
        rows.append({
            "metric": metric_name.upper(),
            "value": to_json_safe(metric_value),
        })

    return rows


# =========================================================
# 8. 공통 Error Response
# =========================================================

def create_error_response(
    analysis_type: str,
    message: str,
) -> Dict[str, Any]:
    """
    공통 에러 응답 생성.
    """

    return {
        "type": analysis_type,
        "status": "error",
        "error_message": message,
        "messages": [
            create_error_message(message)
        ],
    }


# =========================================================
# 9. Forecast Error Response
# =========================================================

def create_forecast_error_response(
    message: str,
) -> Dict[str, Any]:
    """
    Forecast 전용 에러 응답 생성.
    """

    return {
        "type": "Forecast",
        "status": "error",
        "model": None,
        "horizon": None,
        "horizon_type": None,
        "datetime_column": None,
        "target_column": None,
        "frequency": None,
        "observed": [],
        "fitted": [],
        "forecast": [],
        "lower": [],
        "upper": [],
        "observed_dates": [],
        "forecast_dates": [],
        "rows": [],
        "summary": None,
        "metrics": {},
        "messages": [
            create_error_message(message)
        ],
        "recommendation": [
            create_recommendation(
                next_step="Forecast",
                priority="high",
                message="날짜 컬럼, target 컬럼, 데이터 길이를 확인하세요.",
            )
        ],
        "error_message": message,
    }


# =========================================================
# 10. Forecast Success Response
# =========================================================

def create_forecast_success_response(
    model: str,
    horizon: int,
    horizon_type: str,
    datetime_column: str,
    target_column: str,
    frequency: Optional[str],
    observed_dates: List[Any],
    observed_values: List[Any],
    fitted_values: List[Any],
    forecast_dates: List[Any],
    forecast_values: List[Any],
    lower_values: Optional[List[Any]] = None,
    upper_values: Optional[List[Any]] = None,
    metrics: Optional[Dict[str, Any]] = None,
    messages: Optional[List[Dict[str, str]]] = None,
    recommendation: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Forecast 성공 응답 생성.
    """

    lower_values = lower_values or []
    upper_values = upper_values or []
    metrics = metrics or {}

    if messages is None:
        messages = [
            create_success_message("예측이 완료되었습니다."),
            create_message(f"사용 모델: {model}"),
            create_message(f"예측 시평: {horizon}"),
        ]

    if recommendation is None:
        recommendation = [
            create_recommendation(
                next_step="Metrics",
                priority="normal",
                message="Validation 구간이 있다면 예측 성능 지표를 확인하세요.",
            )
        ]

    rows = create_forecast_rows(
        observed_dates=observed_dates,
        observed_values=observed_values,
        fitted_values=fitted_values,
        forecast_dates=forecast_dates,
        forecast_values=forecast_values,
        lower_values=lower_values,
        upper_values=upper_values,
    )

    return {
        "type": "Forecast",
        "status": "done",
        "model": model,
        "horizon": horizon,
        "horizon_type": horizon_type,
        "datetime_column": datetime_column,
        "target_column": target_column,
        "frequency": frequency,
        "observed": list_to_json_safe(observed_values),
        "fitted": list_to_json_safe(fitted_values),
        "forecast": list_to_json_safe(forecast_values),
        "lower": list_to_json_safe(lower_values),
        "upper": list_to_json_safe(upper_values),
        "observed_dates": list_to_json_safe(observed_dates),
        "forecast_dates": list_to_json_safe(forecast_dates),
        "rows": rows,
        "summary": create_value_summary(observed_values),
        "metrics": dict_to_json_safe(metrics),
        "messages": messages,
        "recommendation": recommendation,
        "error_message": None,
    }


# =========================================================
# 11. Metrics Success Response
# =========================================================

def create_metrics_success_response(
    metrics: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Metrics 성공 응답 생성.
    """

    return {
        "type": "Metrics",
        "status": "done",
        "metrics": dict_to_json_safe(metrics),
        "messages": [
            create_success_message("평가지표 계산이 완료되었습니다.")
        ],
        "error_message": None,
    }


# =========================================================
# 12. Preprocessing Success Response
# =========================================================

def create_preprocessing_success_response(
    rows: List[Dict[str, Any]],
    datetime_column: str,
    target_column: str,
    frequency: Optional[str],
    before_values: List[Any],
    after_values: List[Any],
    messages: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Preprocessing 성공 응답 생성.
    """

    if messages is None:
        messages = [
            create_success_message("전처리가 완료되었습니다.")
        ]

    return {
        "type": "Preprocessing",
        "status": "done",
        "rows": list_to_json_safe(rows),
        "datetime_column": datetime_column,
        "target_column": target_column,
        "frequency": frequency,
        "before": create_value_summary(before_values),
        "after": create_value_summary(after_values),
        "messages": messages,
        "error_message": None,
    }


# =========================================================
# 13. Decomposition Success Response
# =========================================================

def create_decomposition_success_response(
    dates: List[Any],
    observed: List[Any],
    trend: List[Any],
    seasonal: List[Any],
    residual: List[Any],
    messages: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Decomposition 성공 응답 생성.
    """

    if messages is None:
        messages = [
            create_success_message("시계열 분해가 완료되었습니다.")
        ]

    return {
        "type": "Decomposition",
        "status": "done",
        "dates": list_to_json_safe(dates),
        "observed": list_to_json_safe(observed),
        "trend": list_to_json_safe(trend),
        "seasonal": list_to_json_safe(seasonal),
        "residual": list_to_json_safe(residual),
        "rows": create_decomposition_rows(
            dates=dates,
            observed=observed,
            trend=trend,
            seasonal=seasonal,
            residual=residual,
        ),
        "messages": messages,
        "error_message": None,
    }