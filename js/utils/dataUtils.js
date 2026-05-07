/* =========================================================
   TS Navigator - dateUtils.js
   날짜/주기(Frequency)/시계열 시간 처리 유틸
   ========================================================= */

/* =========================================================
   기본 Date 변환
   ========================================================= */

function toDate(value) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toISOStringSafe(value) {
  const date = toDate(value);

  if (!date) return null;

  return date.toISOString();
}

function isValidDate(value) {
  return toDate(value) !== null;
}

/* =========================================================
   날짜 포맷
   ========================================================= */

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatDate(dateValue, format = "YYYY-MM-DD HH:mm:ss") {
  const date = toDate(dateValue);

  if (!date) return "-";

  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());

  const hour = padNumber(date.getHours());
  const minute = padNumber(date.getMinutes());
  const second = padNumber(date.getSeconds());

  switch (format) {
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;

    case "YYYY/MM/DD":
      return `${year}/${month}/${day}`;

    case "HH:mm:ss":
      return `${hour}:${minute}:${second}`;

    case "YYYY-MM-DD HH:mm":
      return `${year}-${month}-${day} ${hour}:${minute}`;

    case "YYYY-MM-DD HH:mm:ss":
    default:
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
}

/* =========================================================
   날짜 차이
   ========================================================= */

function diffMilliseconds(dateA, dateB) {
  const a = toDate(dateA);
  const b = toDate(dateB);

  if (!a || !b) return null;

  return b.getTime() - a.getTime();
}

function diffSeconds(dateA, dateB) {
  const diff = diffMilliseconds(dateA, dateB);

  if (diff === null) return null;

  return diff / 1000;
}

function diffMinutes(dateA, dateB) {
  const diff = diffMilliseconds(dateA, dateB);

  if (diff === null) return null;

  return diff / (1000 * 60);
}

function diffHours(dateA, dateB) {
  const diff = diffMilliseconds(dateA, dateB);

  if (diff === null) return null;

  return diff / (1000 * 60 * 60);
}

function diffDays(dateA, dateB) {
  const diff = diffMilliseconds(dateA, dateB);

  if (diff === null) return null;

  return diff / (1000 * 60 * 60 * 24);
}

/* =========================================================
   날짜 추가
   ========================================================= */

function addMilliseconds(dateValue, milliseconds) {
  const date = toDate(dateValue);

  if (!date) return null;

  return new Date(date.getTime() + milliseconds);
}

function addSeconds(dateValue, seconds) {
  return addMilliseconds(dateValue, seconds * 1000);
}

function addMinutes(dateValue, minutes) {
  return addMilliseconds(dateValue, minutes * 60 * 1000);
}

function addHours(dateValue, hours) {
  return addMilliseconds(dateValue, hours * 60 * 60 * 1000);
}

function addDays(dateValue, days) {
  return addMilliseconds(dateValue, days * 24 * 60 * 60 * 1000);
}

function addWeeks(dateValue, weeks) {
  return addDays(dateValue, weeks * 7);
}

function addMonths(dateValue, months) {
  const date = toDate(dateValue);

  if (!date) return null;

  const result = new Date(date.getTime());

  result.setMonth(result.getMonth() + months);

  return result;
}

function addYears(dateValue, years) {
  const date = toDate(dateValue);

  if (!date) return null;

  const result = new Date(date.getTime());

  result.setFullYear(result.getFullYear() + years);

  return result;
}

/* =========================================================
   정렬 / 범위
   ========================================================= */

function sortDates(dates = []) {
  return [...dates]
    .map((date) => toDate(date))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
}

function getMinDate(dates = []) {
  const sorted = sortDates(dates);

  return sorted[0] || null;
}

function getMaxDate(dates = []) {
  const sorted = sortDates(dates);

  return sorted[sorted.length - 1] || null;
}

/* =========================================================
   Frequency 탐지
   ========================================================= */

function inferFrequency(dateValues = []) {
  if (!Array.isArray(dateValues) || dateValues.length < 2) {
    return {
      label: "unknown",
      milliseconds: null,
    };
  }

  const dates = sortDates(dateValues);

  const diffs = [];

  for (let i = 1; i < dates.length; i += 1) {
    const diff = dates[i].getTime() - dates[i - 1].getTime();

    if (diff > 0) {
      diffs.push(diff);
    }
  }

  if (diffs.length === 0) {
    return {
      label: "unknown",
      milliseconds: null,
    };
  }

  const medianDiff = median(diffs);

  return classifyFrequency(medianDiff);
}

function classifyFrequency(milliseconds) {
  const second = 1000;
  const minute = second * 60;
  const hour = minute * 60;
  const day = hour * 24;

  if (milliseconds <= second * 2) {
    return {
      label: "second",
      milliseconds,
    };
  }

  if (milliseconds <= minute * 2) {
    return {
      label: "minute",
      milliseconds,
    };
  }

  if (milliseconds <= hour * 2) {
    return {
      label: "hour",
      milliseconds,
    };
  }

  if (milliseconds <= day * 2) {
    return {
      label: "daily",
      milliseconds,
    };
  }

  if (milliseconds <= day * 10) {
    return {
      label: "weekly",
      milliseconds,
    };
  }

  if (milliseconds <= day * 40) {
    return {
      label: "monthly",
      milliseconds,
    };
  }

  if (milliseconds <= day * 370) {
    return {
      label: "yearly",
      milliseconds,
    };
  }

  return {
    label: "custom",
    milliseconds,
  };
}

/* =========================================================
   Missing Timestamp 생성
   ========================================================= */

function generateDateRange(startDate, endDate, frequency) {
  const start = toDate(startDate);
  const end = toDate(endDate);

  if (!start || !end || !frequency) {
    return [];
  }

  const result = [];

  let current = new Date(start.getTime());

  while (current.getTime() <= end.getTime()) {
    result.push(current.toISOString());

    current = incrementByFrequency(current, frequency);
  }

  return result;
}

function incrementByFrequency(dateValue, frequency) {
  const date = toDate(dateValue);

  if (!date) return null;

  switch (frequency) {
    case "second":
      return addSeconds(date, 1);

    case "minute":
      return addMinutes(date, 1);

    case "hour":
      return addHours(date, 1);

    case "daily":
      return addDays(date, 1);

    case "weekly":
      return addWeeks(date, 1);

    case "monthly":
      return addMonths(date, 1);

    case "yearly":
      return addYears(date, 1);

    default:
      return addDays(date, 1);
  }
}

/* =========================================================
   Timestamp 정리
   ========================================================= */

function removeDuplicateDates(rows, datetimeColumn) {
  const seen = new Set();

  return rows.filter((row) => {
    const value = row[datetimeColumn];

    if (!value) return false;

    const iso = toISOStringSafe(value);

    if (!iso) return false;

    if (seen.has(iso)) {
      return false;
    }

    seen.add(iso);

    return true;
  });
}

function sortRowsByDatetime(rows, datetimeColumn) {
  return [...rows].sort((a, b) => {
    const dateA = toDate(a[datetimeColumn]);
    const dateB = toDate(b[datetimeColumn]);

    if (!dateA || !dateB) return 0;

    return dateA.getTime() - dateB.getTime();
  });
}

/* =========================================================
   시계열 Index 생성
   ========================================================= */

function createSequentialTimeIndex(length) {
  return Array.from({ length }, (_, index) => index);
}

/* =========================================================
   주기 문자열
   ========================================================= */

function frequencyToText(label) {
  switch (label) {
    case "second":
      return "1초";

    case "minute":
      return "1분";

    case "hour":
      return "1시간";

    case "daily":
      return "1일";

    case "weekly":
      return "1주";

    case "monthly":
      return "1개월";

    case "yearly":
      return "1년";

    default:
      return "사용자 정의";
  }
}

/* =========================================================
   Helper
   ========================================================= */

function median(values = []) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);

  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSDateUtils = {
  toDate,
  toISOStringSafe,
  isValidDate,

  formatDate,

  diffMilliseconds,
  diffSeconds,
  diffMinutes,
  diffHours,
  diffDays,

  addMilliseconds,
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addYears,

  sortDates,
  getMinDate,
  getMaxDate,

  inferFrequency,
  classifyFrequency,

  generateDateRange,
  incrementByFrequency,

  removeDuplicateDates,
  sortRowsByDatetime,

  createSequentialTimeIndex,

  frequencyToText,

  median,
};