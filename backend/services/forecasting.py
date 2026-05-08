# =========================================================
# TS Navigator - forecasting.py
# ---------------------------------------------------------
# 역할
# 1. sktime / statsmodels 기반 시계열 예측 수행
# 2. Naive / Mean / Moving Average / SES / Holt / Holt-Winters
# 3. ARIMA / SARIMA / AutoARIMA / STL Forecast 지원
# 4. Forecast 결과를 Frontend Plotly용 JSON 구조로 반환
# =========================================================

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from sktime.forecasting.base import ForecastingHorizon
from sktime.forecasting.naive import NaiveForecaster
from sktime.forecasting.exp_smoothing import ExponentialSmoothing
from sktime.forecasting.trend import STLForecaster
from sktime.forecasting.arima import ARIMA, AutoARIMA

from statsmodels.tsa.arima.model import ARIMA as StatsARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX

from backend.schemas import ForecastRequest
from backend.services.data_service import (
    prepare_forecast_input,
    series_index_to_list,
    series_values_to_list,
)
from backend.utils.time_utils import create_future_dates
from backend.utils.response_utils import (
    create_forecast_error_response,
    create_forecast_success_response,
    create_message,
    create_success_message,
    create_warning_message,
)


# =========================================================
# 1. Forecast 메인 실행 함수
# =========================================================

def run_forecast(request: ForecastRequest) -> Dict[str, Any]:
    """
    Frontend 요청을 받아 예측을 수행하고 JSON 응답을 반환.
    """

    try:
        options = request.options

        df, y, frequency = prepare_forecast_input(
            rows=request.rows,
            datetime_column=request.datetime_column,
            target_column=request.target_column,
            frequency=request.frequency,
            fill_missing=True,
            missing_method="linear",
        )

        model = options.model
        horizon = options.horizon

        forecast_values, fitted_values, lower_values, upper_values = forecast_by_model(
            y=y,
            model=model,
            horizon=horizon,
            seasonal_period=options.seasonal_period,
            seasonal_model=options.seasonal_model,
            alpha=options.alpha,
            beta=options.beta,
            gamma=options.gamma,
            window_size=options.window_size,
            arima_order=options.arima_order,
            sarima_order=options.sarima_order,
            sarima_seasonal_order=options.sarima_seasonal_order,
            confidence_level=options.confidence_level,
        )

        observed_dates = series_index_to_list(y)
        observed_values = series_values_to_list(y)

        forecast_dates = create_forecast_dates_from_series(
            y=y,
            horizon=horizon,
            frequency=frequency,
        )

        messages = [
            create_success_message("예측이 완료되었습니다."),
            create_message(f"사용 모델: {model}"),
            create_message(f"예측 시평: {horizon}"),
            create_message(f"탐지/적용 frequency: {frequency}"),
        ]

        if model in ["arima", "sarima", "auto-arima"]:
            messages.append(
                create_warning_message(
                    "ARIMA 계열 모델은 데이터 길이와 정상성에 따라 결과가 달라질 수 있습니다."
                )
            )

        return create_forecast_success_response(
            model=model,
            horizon=horizon,
            horizon_type=options.horizon_type,
            datetime_column=request.datetime_column,
            target_column=request.target_column,
            frequency=frequency,
            observed_dates=observed_dates,
            observed_values=observed_values,
            fitted_values=fitted_values,
            forecast_dates=forecast_dates,
            forecast_values=forecast_values,
            lower_values=lower_values,
            upper_values=upper_values,
            metrics={},
            messages=messages,
        )

    except Exception as error:
        return create_forecast_error_response(str(error))


# =========================================================
# 2. 모델 분기
# =========================================================

def forecast_by_model(
    y: pd.Series,
    model: str,
    horizon: int,
    seasonal_period: int = 12,
    seasonal_model: str = "additive",
    alpha: float = 0.3,
    beta: float = 0.1,
    gamma: float = 0.1,
    window_size: int = 3,
    arima_order: Tuple[int, int, int] = (1, 1, 1),
    sarima_order: Tuple[int, int, int] = (1, 1, 1),
    sarima_seasonal_order: Tuple[int, int, int, int] = (1, 1, 1, 12),
    confidence_level: float = 0.95,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    model 이름에 따라 예측 모델 실행.
    """

    if model == "naive":
        return forecast_naive(y, horizon)

    if model == "mean":
        return forecast_mean(y, horizon)

    if model == "moving-average":
        return forecast_moving_average(y, horizon, window_size)

    if model == "exponential-smoothing":
        return forecast_exponential_smoothing(
            y=y,
            horizon=horizon,
            trend=None,
            seasonal=None,
            seasonal_period=seasonal_period,
        )

    if model == "holt":
        return forecast_exponential_smoothing(
            y=y,
            horizon=horizon,
            trend="add",
            seasonal=None,
            seasonal_period=seasonal_period,
        )

    if model == "holt-winters":
        seasonal = "mul" if seasonal_model == "multiplicative" else "add"

        return forecast_exponential_smoothing(
            y=y,
            horizon=horizon,
            trend="add",
            seasonal=seasonal,
            seasonal_period=seasonal_period,
        )

    if model == "arima":
        return forecast_arima(
            y=y,
            horizon=horizon,
            order=arima_order,
            confidence_level=confidence_level,
        )

    if model == "sarima":
        return forecast_sarima(
            y=y,
            horizon=horizon,
            order=sarima_order,
            seasonal_order=sarima_seasonal_order,
            confidence_level=confidence_level,
        )

    if model == "auto-arima":
        return forecast_auto_arima(
            y=y,
            horizon=horizon,
        )

    if model == "stl-forecast":
        return forecast_stl(
            y=y,
            horizon=horizon,
            seasonal_period=seasonal_period,
        )

    return forecast_auto_arima(
        y=y,
        horizon=horizon,
    )


# =========================================================
# 3. Naive / Mean / Moving Average
# =========================================================

def forecast_naive(
    y: pd.Series,
    horizon: int,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    마지막 관측값을 미래 예측값으로 사용하는 Naive Forecast.
    """

    forecaster = NaiveForecaster(strategy="last")

    fh = ForecastingHorizon(
        np.arange(1, horizon + 1),
        is_relative=True,
    )

    forecaster.fit(y)

    y_pred = forecaster.predict(fh)

    fitted = create_one_step_naive_fitted(y)

    forecast_values = series_to_float_list(y_pred)

    lower, upper = create_residual_interval(
        y=y,
        fitted=fitted,
        forecast=forecast_values,
    )

    return forecast_values, fitted, lower, upper


def forecast_mean(
    y: pd.Series,
    horizon: int,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    전체 평균을 미래 예측값으로 사용하는 Mean Forecast.
    """

    forecaster = NaiveForecaster(strategy="mean")

    fh = ForecastingHorizon(
        np.arange(1, horizon + 1),
        is_relative=True,
    )

    forecaster.fit(y)

    y_pred = forecaster.predict(fh)

    fitted = create_expanding_mean_fitted(y)

    forecast_values = series_to_float_list(y_pred)

    lower, upper = create_residual_interval(
        y=y,
        fitted=fitted,
        forecast=forecast_values,
    )

    return forecast_values, fitted, lower, upper


def forecast_moving_average(
    y: pd.Series,
    horizon: int,
    window_size: int = 3,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    최근 window_size개 평균을 이용한 이동평균 예측.
    """

    values = y.astype(float).tolist()

    fitted = []

    for index in range(len(values)):
        if index == 0:
            fitted.append(None)
            continue

        start = max(0, index - window_size)
        window = values[start:index]

        fitted.append(float(np.nanmean(window)))

    history = values.copy()
    forecast_values = []

    for _ in range(horizon):
        window = history[-window_size:]
        next_value = float(np.nanmean(window))

        forecast_values.append(next_value)
        history.append(next_value)

    lower, upper = create_residual_interval(
        y=y,
        fitted=fitted,
        forecast=forecast_values,
    )

    return forecast_values, fitted, lower, upper


# =========================================================
# 4. Exponential Smoothing / Holt / Holt-Winters
# =========================================================

def forecast_exponential_smoothing(
    y: pd.Series,
    horizon: int,
    trend: Optional[str] = None,
    seasonal: Optional[str] = None,
    seasonal_period: int = 12,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    sktime ExponentialSmoothing 기반 예측.

    trend=None:
        Simple Exponential Smoothing

    trend="add":
        Holt linear trend

    trend="add", seasonal="add" 또는 "mul":
        Holt-Winters
    """

    if seasonal is not None and len(y) < seasonal_period * 2:
        seasonal = None

    forecaster = ExponentialSmoothing(
        trend=trend,
        seasonal=seasonal,
        sp=seasonal_period if seasonal is not None else None,
    )

    fh = ForecastingHorizon(
        np.arange(1, horizon + 1),
        is_relative=True,
    )

    forecaster.fit(y)

    y_pred = forecaster.predict(fh)

    fitted = get_sktime_fitted_values(
        forecaster=forecaster,
        y=y,
    )

    forecast_values = series_to_float_list(y_pred)

    lower, upper = create_residual_interval(
        y=y,
        fitted=fitted,
        forecast=forecast_values,
    )

    return forecast_values, fitted, lower, upper


# =========================================================
# 5. ARIMA / SARIMA / AutoARIMA
# =========================================================

def forecast_arima(
    y: pd.Series,
    horizon: int,
    order: Tuple[int, int, int] = (1, 1, 1),
    confidence_level: float = 0.95,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    statsmodels ARIMA 기반 예측.
    """

    y_dt = ensure_datetime_index_series(y)

    model = StatsARIMA(
        y_dt,
        order=order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )

    fitted_model = model.fit()

    forecast_result = fitted_model.get_forecast(steps=horizon)

    forecast_values = series_to_float_list(forecast_result.predicted_mean)

    conf_int = forecast_result.conf_int(alpha=1 - confidence_level)

    lower = series_to_float_list(conf_int.iloc[:, 0])
    upper = series_to_float_list(conf_int.iloc[:, 1])

    fitted = series_to_float_list(fitted_model.fittedvalues)

    fitted = align_fitted_length(
        fitted=fitted,
        target_length=len(y),
    )

    return forecast_values, fitted, lower, upper


def forecast_sarima(
    y: pd.Series,
    horizon: int,
    order: Tuple[int, int, int] = (1, 1, 1),
    seasonal_order: Tuple[int, int, int, int] = (1, 1, 1, 12),
    confidence_level: float = 0.95,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    statsmodels SARIMA 기반 예측.
    """

    y_dt = ensure_datetime_index_series(y)

    model = SARIMAX(
        y_dt,
        order=order,
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )

    fitted_model = model.fit(disp=False)

    forecast_result = fitted_model.get_forecast(steps=horizon)

    forecast_values = series_to_float_list(forecast_result.predicted_mean)

    conf_int = forecast_result.conf_int(alpha=1 - confidence_level)

    lower = series_to_float_list(conf_int.iloc[:, 0])
    upper = series_to_float_list(conf_int.iloc[:, 1])

    fitted = series_to_float_list(fitted_model.fittedvalues)

    fitted = align_fitted_length(
        fitted=fitted,
        target_length=len(y),
    )

    return forecast_values, fitted, lower, upper


def forecast_auto_arima(
    y: pd.Series,
    horizon: int,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    sktime AutoARIMA 기반 예측.
    """

    fh = ForecastingHorizon(
        np.arange(1, horizon + 1),
        is_relative=True,
    )

    forecaster = AutoARIMA(
        suppress_warnings=True,
        error_action="ignore",
        stepwise=True,
    )

    forecaster.fit(y)

    y_pred = forecaster.predict(fh)

    fitted = get_sktime_fitted_values(
        forecaster=forecaster,
        y=y,
    )

    forecast_values = series_to_float_list(y_pred)

    lower, upper = create_residual_interval(
        y=y,
        fitted=fitted,
        forecast=forecast_values,
    )

    return forecast_values, fitted, lower, upper


# =========================================================
# 6. STL Forecast
# =========================================================

def forecast_stl(
    y: pd.Series,
    horizon: int,
    seasonal_period: int = 12,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """
    STL 분해 + NaiveForecaster 기반 예측.
    """

    fh = ForecastingHorizon(
        np.arange(1, horizon + 1),
        is_relative=True,
    )

    forecaster = STLForecaster(
        forecaster=NaiveForecaster(strategy="last"),
        sp=seasonal_period,
    )

    forecaster.fit(y)

    y_pred = forecaster.predict(fh)

    fitted = get_sktime_fitted_values(
        forecaster=forecaster,
        y=y,
    )

    forecast_values = series_to_float_list(y_pred)

    lower, upper = create_residual_interval(
        y=y,
        fitted=fitted,
        forecast=forecast_values,
    )

    return forecast_values, fitted, lower, upper


# =========================================================
# 7. fitted value 생성 보조
# =========================================================

def create_one_step_naive_fitted(y: pd.Series) -> List[Optional[float]]:
    """
    y_t의 예측값을 y_{t-1}로 설정.
    """

    values = y.astype(float).tolist()

    fitted = [None]

    for index in range(1, len(values)):
        fitted.append(float(values[index - 1]))

    return fitted


def create_expanding_mean_fitted(y: pd.Series) -> List[Optional[float]]:
    """
    t 시점 이전까지의 평균을 fitted value로 설정.
    """

    values = y.astype(float).tolist()

    fitted = []

    for index in range(len(values)):
        if index == 0:
            fitted.append(None)
            continue

        fitted.append(float(np.nanmean(values[:index])))

    return fitted


def get_sktime_fitted_values(
    forecaster: Any,
    y: pd.Series,
) -> List[Optional[float]]:
    """
    sktime forecaster에서 fitted value를 추출.
    """

    try:
        fitted = forecaster.predict_residuals(y)

        fitted_values = y - fitted

        return series_to_float_list(fitted_values)

    except Exception:
        return create_one_step_naive_fitted(y)


def align_fitted_length(
    fitted: List[Optional[float]],
    target_length: int,
) -> List[Optional[float]]:
    """
    fitted 리스트 길이를 observed 길이에 맞춤.
    """

    if len(fitted) == target_length:
        return fitted

    if len(fitted) > target_length:
        return fitted[-target_length:]

    padding = [None] * (target_length - len(fitted))

    return padding + fitted


# =========================================================
# 8. 예측 구간
# =========================================================

def create_residual_interval(
    y: pd.Series,
    fitted: List[Optional[float]],
    forecast: List[Optional[float]],
    z_value: float = 1.96,
) -> Tuple[List[Optional[float]], List[Optional[float]]]:
    """
    잔차 표준편차 기반 간단 예측구간 생성.
    """

    y_values = y.astype(float).tolist()

    residuals = []

    for actual, pred in zip(y_values, fitted):
        if pred is None:
            continue

        if pd.isna(actual) or pd.isna(pred):
            continue

        residuals.append(float(actual) - float(pred))

    if len(residuals) <= 1:
        return [None for _ in forecast], [None for _ in forecast]

    std = float(np.nanstd(residuals, ddof=1))

    lower = []
    upper = []

    for index, value in enumerate(forecast):
        if value is None:
            lower.append(None)
            upper.append(None)
            continue

        scale = np.sqrt(index + 1)

        lower.append(float(value - z_value * std * scale))
        upper.append(float(value + z_value * std * scale))

    return lower, upper


# =========================================================
# 9. 날짜 생성
# =========================================================

def create_forecast_dates_from_series(
    y: pd.Series,
    horizon: int,
    frequency: str,
) -> List[Any]:
    """
    Series의 마지막 index를 기준으로 미래 날짜 생성.
    """

    last_index = y.index[-1]

    if isinstance(last_index, pd.Period):
        future_periods = pd.period_range(
            start=last_index + 1,
            periods=horizon,
            freq=last_index.freq,
        )

        return list(future_periods)

    return create_future_dates(
        last_date=last_index,
        horizon=horizon,
        frequency=frequency,
    )


# =========================================================
# 10. Series 변환 보조
# =========================================================

def series_to_float_list(
    values: Any,
) -> List[Optional[float]]:
    """
    Series / ndarray / list 값을 float list로 변환.
    """

    if isinstance(values, pd.Series):
        raw_values = values.tolist()

    elif isinstance(values, pd.DataFrame):
        raw_values = values.iloc[:, 0].tolist()

    elif isinstance(values, np.ndarray):
        raw_values = values.tolist()

    else:
        raw_values = list(values)

    result = []

    for value in raw_values:
        if value is None or pd.isna(value):
            result.append(None)
        else:
            result.append(float(value))

    return result


def ensure_datetime_index_series(
    y: pd.Series,
) -> pd.Series:
    """
    statsmodels ARIMA/SARIMA용 DatetimeIndex Series로 변환.
    """

    result = y.copy()

    if isinstance(result.index, pd.PeriodIndex):
        result.index = result.index.to_timestamp()

    result = result.astype(float)

    return result