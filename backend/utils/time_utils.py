# =========================================================
# TS Navigator - time_utils.py
# ---------------------------------------------------------
# 역할
# 1. 시계열 datetime 처리
# 2. frequency 탐지
# 3. datetime index 생성
# 4. forecast date 생성
# 5. pandas datetime 변환 보조
# =========================================================

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

import numpy as np
import pandas as pd
from pandas.tseries.frequencies import to_offset


# =========================================================
# 1. datetime 변환
# =========================================================

def to_datetime_series(values: List[Any]) -> pd.Series:
    """
    다양한 datetime 입력을 pandas datetime Series로 변환.
    """

    return pd.to_datetime(
        values,
        errors="coerce",
        infer_datetime_format=True,
    )


def to_datetime_index(values: List[Any]) -> pd.DatetimeIndex:
    """
    DatetimeIndex 생성.
    """

    series = to_datetime_series(values)

    return pd.DatetimeIndex(series.dropna())


# =========================================================
# 2. datetime 컬럼 판별
# =========================================================

def is_datetime_column(series: pd.Series) -> bool:
    """
    datetime 컬럼 여부 판단.
    """

    try:
        parsed = pd.to_datetime(series, errors="coerce")

        valid_ratio = parsed.notna().mean()

        return valid_ratio >= 0.8

    except Exception:
        return False


# =========================================================
# 3. frequency 추정
# =========================================================

def infer_frequency(datetime_index: pd.DatetimeIndex) -> Optional[str]:
    """
    pandas frequency 자동 탐지.

    반환 예:
    D, W, M, Q, Y, H
    """

    if len(datetime_index) < 3:
        return None

    try:
        freq = pd.infer_freq(datetime_index)

        if freq is None:
            return None

        return normalize_frequency(freq)

    except Exception:
        return None


def normalize_frequency(freq: str) -> str:
    """
    pandas frequency 문자열 정규화.
    """

    freq = str(freq).upper()

    # 월말/월초 등 처리
    if freq.startswith("ME"):
        return "M"

    if freq.startswith("MS"):
        return "M"

    if freq.startswith("QE"):
        return "Q"

    if freq.startswith("QS"):
        return "Q"

    if freq.startswith("YE"):
        return "Y"

    if freq.startswith("YS"):
        return "Y"

    if freq.startswith("MIN"):
        return "T"

    if freq.startswith("H"):
        return "H"

    if freq.startswith("D"):
        return "D"

    if freq.startswith("W"):
        return "W"

    if freq.startswith("M"):
        return "M"

    if freq.startswith("Q"):
        return "Q"

    if freq.startswith("Y"):
        return "Y"

    if freq.startswith("T"):
        return "T"

    if freq.startswith("S"):
        return "S"

    return freq


# =========================================================
# 4. frequency offset 생성
# =========================================================

def get_frequency_offset(freq: str):
    """
    pandas offset 객체 반환.
    """

    return to_offset(freq)


# =========================================================
# 5. 미래 날짜 생성
# =========================================================

def create_future_dates(
    last_date: Any,
    horizon: int,
    frequency: str,
) -> List[pd.Timestamp]:
    """
    Forecast 미래 datetime 생성.
    """

    if horizon <= 0:
        return []

    last_date = pd.to_datetime(last_date)

    future_index = pd.date_range(
        start=last_date,
        periods=horizon + 1,
        freq=frequency,
    )

    return list(future_index[1:])


# =========================================================
# 6. datetime 정렬
# =========================================================

def sort_by_datetime(
    df: pd.DataFrame,
    datetime_column: str,
) -> pd.DataFrame:
    """
    datetime 기준 정렬.
    """

    result = df.copy()

    result[datetime_column] = pd.to_datetime(
        result[datetime_column],
        errors="coerce",
    )

    result = result.sort_values(datetime_column)

    result = result.reset_index(drop=True)

    return result


# =========================================================
# 7. datetime index 설정
# =========================================================

def set_datetime_index(
    df: pd.DataFrame,
    datetime_column: str,
) -> pd.DataFrame:
    """
    datetime index 설정.
    """

    result = df.copy()

    result[datetime_column] = pd.to_datetime(
        result[datetime_column],
        errors="coerce",
    )

    result = result.set_index(datetime_column)

    result = result.sort_index()

    return result


# =========================================================
# 8. datetime → 문자열 변환
# =========================================================

def datetime_to_string(values: List[Any]) -> List[str]:
    """
    datetime 리스트를 ISO 문자열로 변환.
    """

    result = []

    for value in values:
        if pd.isna(value):
            result.append(None)
            continue

        timestamp = pd.Timestamp(value)

        result.append(timestamp.isoformat())

    return result


# =========================================================
# 9. PeriodIndex 생성
# =========================================================

def create_period_index(
    dates: List[Any],
    frequency: Optional[str] = None,
) -> pd.PeriodIndex:
    """
    sktime용 PeriodIndex 생성.
    """

    datetime_index = pd.DatetimeIndex(
        pd.to_datetime(dates, errors="coerce")
    )

    if frequency is None:
        frequency = infer_frequency(datetime_index)

    if frequency is None:
        frequency = "D"

    return datetime_index.to_period(frequency)


# =========================================================
# 10. 시계열 연속성 검사
# =========================================================

def is_regular_timeseries(
    datetime_index: pd.DatetimeIndex,
) -> bool:
    """
    시계열 간격 일정 여부 검사.
    """

    if len(datetime_index) < 3:
        return True

    diffs = np.diff(datetime_index.astype(np.int64))

    return np.all(diffs == diffs[0])


# =========================================================
# 11. missing timestamp 생성
# =========================================================

def create_complete_datetime_index(
    datetime_index: pd.DatetimeIndex,
    frequency: str,
) -> pd.DatetimeIndex:
    """
    누락 timestamp 포함 전체 datetime index 생성.
    """

    if len(datetime_index) == 0:
        return pd.DatetimeIndex([])

    return pd.date_range(
        start=datetime_index.min(),
        end=datetime_index.max(),
        freq=frequency,
    )


# =========================================================
# 12. frequency 안전 처리
# =========================================================

def safe_frequency(
    frequency: Optional[str],
    fallback: str = "D",
) -> str:
    """
    frequency None 방지.
    """

    if frequency is None:
        return fallback

    if not isinstance(frequency, str):
        return fallback

    frequency = frequency.strip()

    if frequency == "":
        return fallback

    return normalize_frequency(frequency)


# =========================================================
# 13. datetime 유효성 검사
# =========================================================

def is_valid_datetime(value: Any) -> bool:
    """
    datetime 변환 가능 여부 검사.
    """

    try:
        parsed = pd.to_datetime(value, errors="coerce")

        return not pd.isna(parsed)

    except Exception:
        return False


# =========================================================
# 14. 마지막 datetime 추출
# =========================================================

def get_last_datetime(values: List[Any]) -> Optional[pd.Timestamp]:
    """
    마지막 유효 datetime 반환.
    """

    parsed = pd.to_datetime(values, errors="coerce")

    parsed = parsed[~pd.isna(parsed)]

    if len(parsed) == 0:
        return None

    return pd.Timestamp(parsed[-1])


# =========================================================
# 15. datetime 범위 생성
# =========================================================

def create_datetime_range(
    start: Any,
    periods: int,
    frequency: str,
) -> List[pd.Timestamp]:
    """
    datetime range 생성.
    """

    if periods <= 0:
        return []

    result = pd.date_range(
        start=pd.to_datetime(start),
        periods=periods,
        freq=frequency,
    )

    return list(result)