# =========================================================
# TS Navigator - data_service.py
# ---------------------------------------------------------
# 역할
# 1. Frontend JSON rows를 pandas DataFrame으로 변환
# 2. datetime column / target column 검증
# 3. pandas Series 생성
# 4. sktime / statsmodels에서 사용할 수 있는 시계열 형태로 정리
# 5. frequency 자동 탐지 및 보정
# =========================================================

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from backend.utils.time_utils import (
    infer_frequency,
    safe_frequency,
    set_datetime_index,
    sort_by_datetime,
)


# =========================================================
# 1. rows → DataFrame 변환
# =========================================================

def rows_to_dataframe(
    rows: List[Dict[str, Any]],
) -> pd.DataFrame:
    """
    Frontend에서 전달된 rows를 pandas DataFrame으로 변환.
    """

    if rows is None or len(rows) == 0:
        raise ValueError("데이터가 비어 있습니다.")

    df = pd.DataFrame(rows)

    if df.empty:
        raise ValueError("DataFrame이 비어 있습니다.")

    return df


# =========================================================
# 2. 컬럼 검증
# =========================================================

def validate_columns(
    df: pd.DataFrame,
    datetime_column: str,
    target_column: str,
) -> None:
    """
    datetime column과 target column 존재 여부 확인.
    """

    if datetime_column not in df.columns:
        raise ValueError(f"datetime column을 찾을 수 없습니다: {datetime_column}")

    if target_column not in df.columns:
        raise ValueError(f"target column을 찾을 수 없습니다: {target_column}")

    if datetime_column == target_column:
        raise ValueError("datetime column과 target column은 서로 달라야 합니다.")


# =========================================================
# 3. target 수치 변환
# =========================================================

def convert_target_to_numeric(
    df: pd.DataFrame,
    target_column: str,
) -> pd.DataFrame:
    """
    target column을 numeric으로 변환.
    """

    result = df.copy()

    result[target_column] = (
        result[target_column]
        .astype(str)
        .str.replace(",", "", regex=False)
        .replace(["", "nan", "None", "null"], np.nan)
    )

    result[target_column] = pd.to_numeric(
        result[target_column],
        errors="coerce",
    )

    return result


# =========================================================
# 4. datetime 변환 및 정렬
# =========================================================

def prepare_datetime_dataframe(
    df: pd.DataFrame,
    datetime_column: str,
) -> pd.DataFrame:
    """
    datetime column 변환 후 정렬.
    """

    result = df.copy()

    result[datetime_column] = pd.to_datetime(
        result[datetime_column],
        errors="coerce",
    )

    result = result.dropna(subset=[datetime_column])

    if result.empty:
        raise ValueError("유효한 datetime 값이 없습니다.")

    result = sort_by_datetime(result, datetime_column)

    return result


# =========================================================
# 5. 중복 timestamp 처리
# =========================================================

def aggregate_duplicate_timestamps(
    df: pd.DataFrame,
    datetime_column: str,
    target_column: str,
    method: str = "mean",
) -> pd.DataFrame:
    """
    중복 datetime이 있을 경우 하나의 값으로 집계.
    """

    result = df.copy()

    numeric_columns = result.select_dtypes(include=[np.number]).columns.tolist()

    if method == "sum":
        aggregated = (
            result
            .groupby(datetime_column, as_index=False)[numeric_columns]
            .sum()
        )

    elif method == "first":
        aggregated = (
            result
            .groupby(datetime_column, as_index=False)
            .first()
        )

    elif method == "last":
        aggregated = (
            result
            .groupby(datetime_column, as_index=False)
            .last()
        )

    else:
        aggregated = (
            result
            .groupby(datetime_column, as_index=False)[numeric_columns]
            .mean()
        )

    if target_column not in aggregated.columns:
        raise ValueError("중복 timestamp 처리 후 target column이 사라졌습니다.")

    return aggregated


# =========================================================
# 6. frequency 탐지
# =========================================================

def detect_frequency(
    df: pd.DataFrame,
    datetime_column: str,
    frequency: Optional[str] = None,
) -> str:
    """
    frequency가 주어지면 사용하고, 없으면 pandas 기준으로 자동 탐지.
    """

    if frequency is not None and str(frequency).strip() != "":
        return safe_frequency(frequency)

    datetime_index = pd.DatetimeIndex(df[datetime_column])

    inferred = infer_frequency(datetime_index)

    return safe_frequency(inferred, fallback="D")


# =========================================================
# 7. 완전한 시계열 index 생성
# =========================================================

def reindex_to_frequency(
    df: pd.DataFrame,
    datetime_column: str,
    target_column: str,
    frequency: str,
) -> pd.DataFrame:
    """
    frequency 기준으로 누락 timestamp를 포함한 DataFrame 생성.
    """

    result = set_datetime_index(df, datetime_column)

    full_index = pd.date_range(
        start=result.index.min(),
        end=result.index.max(),
        freq=frequency,
    )

    result = result.reindex(full_index)

    result.index.name = datetime_column

    result = result.reset_index()

    if target_column not in result.columns:
        raise ValueError("reindex 이후 target column을 찾을 수 없습니다.")

    return result


# =========================================================
# 8. 분석용 DataFrame 생성
# =========================================================

def prepare_timeseries_dataframe(
    rows: List[Dict[str, Any]],
    datetime_column: str,
    target_column: str,
    frequency: Optional[str] = None,
    duplicate_method: str = "mean",
    fill_missing: bool = False,
) -> Tuple[pd.DataFrame, str]:
    """
    Frontend rows를 분석 가능한 DataFrame으로 정리.

    반환:
    - 정리된 DataFrame
    - frequency
    """

    df = rows_to_dataframe(rows)

    validate_columns(df, datetime_column, target_column)

    df = convert_target_to_numeric(df, target_column)

    df = prepare_datetime_dataframe(df, datetime_column)

    df = aggregate_duplicate_timestamps(
        df=df,
        datetime_column=datetime_column,
        target_column=target_column,
        method=duplicate_method,
    )

    detected_frequency = detect_frequency(
        df=df,
        datetime_column=datetime_column,
        frequency=frequency,
    )

    if fill_missing:
        df = reindex_to_frequency(
            df=df,
            datetime_column=datetime_column,
            target_column=target_column,
            frequency=detected_frequency,
        )

    return df, detected_frequency


# =========================================================
# 9. pandas Series 생성
# =========================================================

def dataframe_to_series(
    df: pd.DataFrame,
    datetime_column: str,
    target_column: str,
    frequency: Optional[str] = None,
) -> pd.Series:
    """
    DataFrame을 pandas Series로 변환.

    sktime / statsmodels 입력용.
    """

    result = df.copy()

    result[datetime_column] = pd.to_datetime(
        result[datetime_column],
        errors="coerce",
    )

    result = result.dropna(subset=[datetime_column])

    result = result.sort_values(datetime_column)

    y = pd.Series(
        data=result[target_column].astype(float).values,
        index=pd.DatetimeIndex(result[datetime_column]),
        name=target_column,
    )

    if frequency is not None:
        try:
            y = y.asfreq(frequency)
        except Exception:
            pass

    return y


# =========================================================
# 10. sktime용 Series 생성
# =========================================================

def dataframe_to_sktime_series(
    df: pd.DataFrame,
    datetime_column: str,
    target_column: str,
    frequency: Optional[str] = None,
) -> pd.Series:
    """
    sktime Forecasting 입력용 Series 생성.

    PeriodIndex 기반으로 변환.
    """

    y = dataframe_to_series(
        df=df,
        datetime_column=datetime_column,
        target_column=target_column,
        frequency=frequency,
    )

    if frequency is None:
        frequency = infer_frequency(pd.DatetimeIndex(y.index))

    frequency = safe_frequency(frequency)

    try:
        y.index = y.index.to_period(frequency)
    except Exception:
        pass

    return y


# =========================================================
# 11. statsmodels용 Series 생성
# =========================================================

def dataframe_to_statsmodels_series(
    df: pd.DataFrame,
    datetime_column: str,
    target_column: str,
    frequency: Optional[str] = None,
) -> pd.Series:
    """
    statsmodels 입력용 Series 생성.

    DatetimeIndex 기반 유지.
    """

    y = dataframe_to_series(
        df=df,
        datetime_column=datetime_column,
        target_column=target_column,
        frequency=frequency,
    )

    return y.astype(float)


# =========================================================
# 12. train/test 분리
# =========================================================

def split_train_test(
    y: pd.Series,
    test_size: float = 0.2,
) -> Tuple[pd.Series, pd.Series]:
    """
    시계열 순서를 유지한 train/test split.
    """

    if len(y) < 3:
        raise ValueError("train/test 분리를 수행하기에는 데이터가 너무 적습니다.")

    if test_size <= 0 or test_size >= 1:
        test_size = 0.2

    test_count = max(1, int(round(len(y) * test_size)))

    train_count = len(y) - test_count

    if train_count < 2:
        raise ValueError("train 데이터가 너무 적습니다.")

    y_train = y.iloc[:train_count]
    y_test = y.iloc[train_count:]

    return y_train, y_test


# =========================================================
# 13. 결측값 제거 / 보간
# =========================================================

def clean_series_missing(
    y: pd.Series,
    method: str = "linear",
) -> pd.Series:
    """
    Series 결측값 처리.
    """

    result = y.copy()

    if method == "drop":
        return result.dropna()

    if method == "ffill":
        return result.ffill().bfill()

    if method == "bfill":
        return result.bfill().ffill()

    if method == "mean":
        return result.fillna(result.mean())

    # 기본 linear interpolation
    result = result.interpolate(method="linear")

    result = result.ffill().bfill()

    return result


# =========================================================
# 14. 전체 Forecast 입력 생성
# =========================================================

def prepare_forecast_input(
    rows: List[Dict[str, Any]],
    datetime_column: str,
    target_column: str,
    frequency: Optional[str] = None,
    fill_missing: bool = True,
    missing_method: str = "linear",
) -> Tuple[pd.DataFrame, pd.Series, str]:
    """
    Forecast 서비스에서 바로 사용할 수 있는 입력 생성.

    반환:
    - 정리된 DataFrame
    - y Series
    - frequency
    """

    df, detected_frequency = prepare_timeseries_dataframe(
        rows=rows,
        datetime_column=datetime_column,
        target_column=target_column,
        frequency=frequency,
        fill_missing=fill_missing,
    )

    y = dataframe_to_sktime_series(
        df=df,
        datetime_column=datetime_column,
        target_column=target_column,
        frequency=detected_frequency,
    )

    y = clean_series_missing(
        y=y,
        method=missing_method,
    )

    if len(y.dropna()) < 3:
        raise ValueError("예측을 수행하기에는 유효한 수치 데이터가 부족합니다.")

    return df, y, detected_frequency


# =========================================================
# 15. Series → list 변환
# =========================================================

def series_values_to_list(y: pd.Series) -> List[Optional[float]]:
    """
    Series 값을 list로 변환.
    """

    result = []

    for value in y.values:
        if pd.isna(value):
            result.append(None)
        else:
            result.append(float(value))

    return result


def series_index_to_list(y: pd.Series) -> List[Any]:
    """
    Series index를 list로 변환.
    """

    result = []

    for value in y.index:
        result.append(value)

    return result