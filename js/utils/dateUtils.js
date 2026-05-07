/* =========================================================
   TS Navigator - dateUtils.js
   ---------------------------------------------------------
   역할
   1. CSV 날짜 컬럼 자동 탐지
   2. 날짜 문자열 파싱
   3. timestamp 정렬 / 중복 확인
   4. 시계열 frequency 자동 탐지
   5. missing timestamp 생성
   6. resampling / 날짜 범위 생성 보조
========================================================= */

/* =========================================================
   1. 날짜 관련 기본 상수
========================================================= */

const TS_DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,
  /^\d{4}\/\d{2}\/\d{2}$/,
  /^\d{4}\.\d{2}\.\d{2}$/,
  /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/,
  /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/,
  /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}$/,
  /^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}$/,
  /^\d{4}-\d{2}$/,
  /^\d{4}\/\d{2}$/,
  /^\d{4}$/
];

const TS_FREQUENCY_RULES = [
  { name: "secondly", label: "초 단위", ms: 1000, code: "S" },
  { name: "minutely", label: "분 단위", ms: 60 * 1000, code: "min" },
  { name: "hourly", label: "시간 단위", ms: 60 * 60 * 1000, code: "H" },
  { name: "daily", label: "일 단위", ms: 24 * 60 * 60 * 1000, code: "D" },
  { name: "weekly", label: "주 단위", ms: 7 * 24 * 60 * 60 * 1000, code: "W" },
  { name: "monthly", label: "월 단위", ms: 30 * 24 * 60 * 60 * 1000, code: "M" },
  { name: "quarterly", label: "분기 단위", ms: 91 * 24 * 60 * 60 * 1000, code: "Q" },
  { name: "yearly", label: "연 단위", ms: 365 * 24 * 60 * 60 * 1000, code: "Y" }
];

/* =========================================================
   2. 날짜 파싱
========================================================= */

function parseDateValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const text = String(value).trim();

  if (!text) return null;

  const normalizedText = normalizeDateText(text);
  const parsedDate = new Date(normalizedText);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  return parseDateManually(text);
}

function normalizeDateText(text) {
  let value = text.trim();

  value = value.replace(/\./g, "-");
  value = value.replace(/\//g, "-");

  if (/^\d{4}-\d{1,2}$/.test(value)) {
    const [year, month] = value.split("-");
    return `${year}-${month.padStart(2, "0")}-01`;
  }

  if (/^\d{4}$/.test(value)) {
    return `${value}-01-01`;
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{1,2}$/.test(value)) {
    const [datePart, timePart] = value.split(/\s+/);
    const [year, month, day] = datePart.split("-");
    const [hour, minute] = timePart.split(":");

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00`;
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{1,2}:\d{1,2}$/.test(value)) {
    const [datePart, timePart] = value.split(/\s+/);
    const [year, month, day] = datePart.split("-");
    const [hour, minute, second] = timePart.split(":");

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
  }

  return value;
}

function parseDateManually(text) {
  const compactDateMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDateMatch) {
    const [, year, month, day] = compactDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const compactMonthMatch = text.match(/^(\d{4})(\d{2})$/);
  if (compactMonthMatch) {
    const [, year, month] = compactMonthMatch;
    return new Date(Number(year), Number(month) - 1, 1);
  }

  return null;
}

function isValidDateValue(value) {
  return parseDateValue(value) !== null;
}

/* =========================================================
   3. 날짜 컬럼 자동 탐지
========================================================= */

function detectDatetimeColumn(rows, columns) {
  if (!rows || rows.length === 0 || !columns || columns.length === 0) {
    return null;
  }

  const dateColumnKeywords = [
    "date",
    "datetime",
    "time",
    "timestamp",
    "period",
    "day",
    "month",
    "year",
    "날짜",
    "시간",
    "일자",
    "월",
    "연도",
    "시점"
  ];

  const sampleRows = rows.slice(0, Math.min(rows.length, 30));

  let bestColumn = null;
  let bestScore = -1;

  columns.forEach(column => {
    const columnName = String(column).toLowerCase();

    const keywordScore = dateColumnKeywords.some(keyword => {
      return columnName.includes(keyword.toLowerCase());
    }) ? 0.25 : 0;

    const validCount = sampleRows.reduce((count, row) => {
      return count + (isValidDateValue(row[column]) ? 1 : 0);
    }, 0);

    const validRatio = validCount / sampleRows.length;
    const score = validRatio + keywordScore;

    if (score > bestScore && validRatio >= 0.6) {
      bestScore = score;
      bestColumn = column;
    }
  });

  return bestColumn;
}

/* =========================================================
   4. 날짜 정렬 / 중복 확인
========================================================= */

function sortRowsByDate(rows, datetimeColumn) {
  if (!rows || !datetimeColumn) return rows || [];

  return [...rows].sort((a, b) => {
    const dateA = parseDateValue(a[datetimeColumn]);
    const dateB = parseDateValue(b[datetimeColumn]);

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    return dateA.getTime() - dateB.getTime();
  });
}

function findDuplicateTimestamps(rows, datetimeColumn) {
  const timestampMap = new Map();
  const duplicates = [];

  rows.forEach((row, index) => {
    const date = parseDateValue(row[datetimeColumn]);
    if (!date) return;

    const key = date.getTime();

    if (!timestampMap.has(key)) {
      timestampMap.set(key, []);
    }

    timestampMap.get(key).push(index);
  });

  timestampMap.forEach((indices, timestamp) => {
    if (indices.length > 1) {
      duplicates.push({
        timestamp: Number(timestamp),
        date: new Date(Number(timestamp)),
        indices,
        count: indices.length
      });
    }
  });

  return duplicates;
}

function isSortedByDate(rows, datetimeColumn) {
  if (!rows || rows.length <= 1) return true;

  for (let i = 1; i < rows.length; i += 1) {
    const prevDate = parseDateValue(rows[i - 1][datetimeColumn]);
    const currentDate = parseDateValue(rows[i][datetimeColumn]);

    if (!prevDate || !currentDate) continue;

    if (currentDate.getTime() < prevDate.getTime()) {
      return false;
    }
  }

  return true;
}

/* =========================================================
   5. 시간 간격 계산
========================================================= */

function getTimeDifferences(rows, datetimeColumn) {
  const sortedRows = sortRowsByDate(rows, datetimeColumn);
  const diffs = [];

  for (let i = 1; i < sortedRows.length; i += 1) {
    const prevDate = parseDateValue(sortedRows[i - 1][datetimeColumn]);
    const currentDate = parseDateValue(sortedRows[i][datetimeColumn]);

    if (!prevDate || !currentDate) continue;

    const diff = currentDate.getTime() - prevDate.getTime();

    if (diff > 0) {
      diffs.push(diff);
    }
  }

  return diffs;
}

function getMedian(values) {
  if (!values || values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function getMode(values) {
  if (!values || values.length === 0) return null;

  const counter = new Map();

  values.forEach(value => {
    const rounded = Math.round(value);
    counter.set(rounded, (counter.get(rounded) || 0) + 1);
  });

  let mode = null;
  let maxCount = -1;

  counter.forEach((count, value) => {
    if (count > maxCount) {
      maxCount = count;
      mode = value;
    }
  });

  return mode;
}

/* =========================================================
   6. Frequency 자동 탐지
========================================================= */

function detectFrequency(rows, datetimeColumn) {
  const diffs = getTimeDifferences(rows, datetimeColumn);

  if (diffs.length === 0) {
    return {
      code: null,
      name: "unknown",
      label: "알 수 없음",
      milliseconds: null,
      isRegular: false,
      confidence: 0
    };
  }

  const medianDiff = getMedian(diffs);
  const modeDiff = getMode(diffs);
  const representativeDiff = modeDiff || medianDiff;

  const matchedRule = findClosestFrequencyRule(representativeDiff);
  const regularity = calculateRegularity(diffs, representativeDiff);

  return {
    code: matchedRule.code,
    name: matchedRule.name,
    label: matchedRule.label,
    milliseconds: matchedRule.ms,
    detectedMilliseconds: representativeDiff,
    medianMilliseconds: medianDiff,
    modeMilliseconds: modeDiff,
    isRegular: regularity.ratio >= 0.8,
    confidence: regularity.ratio,
    irregularCount: regularity.irregularCount,
    totalIntervals: diffs.length
  };
}

function findClosestFrequencyRule(milliseconds) {
  let bestRule = TS_FREQUENCY_RULES[0];
  let bestGap = Math.abs(milliseconds - bestRule.ms);

  TS_FREQUENCY_RULES.forEach(rule => {
    const gap = Math.abs(milliseconds - rule.ms);

    if (gap < bestGap) {
      bestGap = gap;
      bestRule = rule;
    }
  });

  return bestRule;
}

function calculateRegularity(diffs, expectedDiff) {
  if (!diffs || diffs.length === 0 || !expectedDiff) {
    return {
      ratio: 0,
      irregularCount: 0
    };
  }

  const tolerance = expectedDiff * 0.1;

  const regularCount = diffs.filter(diff => {
    return Math.abs(diff - expectedDiff) <= tolerance;
  }).length;

  return {
    ratio: regularCount / diffs.length,
    irregularCount: diffs.length - regularCount
  };
}

/* =========================================================
   7. 날짜 범위 생성
========================================================= */

function createDateRange(startDate, endDate, frequencyCode = "D") {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);

  if (!start || !end) return [];

  const range = [];
  let current = new Date(start.getTime());

  while (current.getTime() <= end.getTime()) {
    range.push(new Date(current.getTime()));
    current = addFrequency(current, frequencyCode, 1);
  }

  return range;
}

function createDateRangeByPeriods(startDate, periods, frequencyCode = "D") {
  const start = parseDateValue(startDate);

  if (!start || !periods || periods <= 0) return [];

  const range = [];
  let current = new Date(start.getTime());

  for (let i = 0; i < periods; i += 1) {
    range.push(new Date(current.getTime()));
    current = addFrequency(current, frequencyCode, 1);
  }

  return range;
}

function addFrequency(date, frequencyCode, step = 1) {
  const next = new Date(date.getTime());

  switch (frequencyCode) {
    case "S":
      next.setSeconds(next.getSeconds() + step);
      break;

    case "min":
      next.setMinutes(next.getMinutes() + step);
      break;

    case "H":
      next.setHours(next.getHours() + step);
      break;

    case "D":
      next.setDate(next.getDate() + step);
      break;

    case "W":
      next.setDate(next.getDate() + 7 * step);
      break;

    case "M":
      next.setMonth(next.getMonth() + step);
      break;

    case "Q":
      next.setMonth(next.getMonth() + 3 * step);
      break;

    case "Y":
      next.setFullYear(next.getFullYear() + step);
      break;

    default:
      next.setDate(next.getDate() + step);
      break;
  }

  return next;
}

/* =========================================================
   8. Missing Timestamp 확인
========================================================= */

function findMissingTimestamps(rows, datetimeColumn, frequencyCode = null) {
  if (!rows || rows.length < 2 || !datetimeColumn) return [];

  const sortedRows = sortRowsByDate(rows, datetimeColumn);
  const frequencyInfo = frequencyCode
    ? getFrequencyInfoByCode(frequencyCode)
    : detectFrequency(sortedRows, datetimeColumn);

  if (!frequencyInfo || !frequencyInfo.code) return [];

  const startDate = parseDateValue(sortedRows[0][datetimeColumn]);
  const endDate = parseDateValue(sortedRows[sortedRows.length - 1][datetimeColumn]);

  const fullRange = createDateRange(startDate, endDate, frequencyInfo.code);
  const existingSet = new Set(
    sortedRows
      .map(row => parseDateValue(row[datetimeColumn]))
      .filter(Boolean)
      .map(date => date.getTime())
  );

  return fullRange.filter(date => !existingSet.has(date.getTime()));
}

function getFrequencyInfoByCode(code) {
  return TS_FREQUENCY_RULES.find(rule => rule.code === code) || null;
}

/* =========================================================
   9. Timestamp 채우기용 보조 함수
========================================================= */

function buildRegularTimeIndexRows(rows, datetimeColumn, frequencyCode = null) {
  if (!rows || rows.length === 0 || !datetimeColumn) return [];

  const sortedRows = sortRowsByDate(rows, datetimeColumn);
  const frequencyInfo = frequencyCode
    ? getFrequencyInfoByCode(frequencyCode)
    : detectFrequency(sortedRows, datetimeColumn);

  if (!frequencyInfo || !frequencyInfo.code) {
    return sortedRows;
  }

  const startDate = parseDateValue(sortedRows[0][datetimeColumn]);
  const endDate = parseDateValue(sortedRows[sortedRows.length - 1][datetimeColumn]);
  const fullRange = createDateRange(startDate, endDate, frequencyInfo.code);

  const rowMap = new Map();

  sortedRows.forEach(row => {
    const date = parseDateValue(row[datetimeColumn]);
    if (!date) return;

    rowMap.set(date.getTime(), row);
  });

  return fullRange.map(date => {
    const existingRow = rowMap.get(date.getTime());

    if (existingRow) {
      return existingRow;
    }

    return {
      [datetimeColumn]: formatDate(date, frequencyInfo.code),
      __missingTimestamp: true
    };
  });
}

/* =========================================================
   10. 날짜 포맷
========================================================= */

function formatDate(dateValue, frequencyCode = "D") {
  const date = parseDateValue(dateValue);
  if (!date) return "";

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());

  switch (frequencyCode) {
    case "Y":
      return `${year}`;

    case "Q":
      return `${year}-Q${Math.floor(date.getMonth() / 3) + 1}`;

    case "M":
      return `${year}-${month}`;

    case "D":
    case "W":
      return `${year}-${month}-${day}`;

    case "H":
      return `${year}-${month}-${day} ${hour}:00`;

    case "min":
      return `${year}-${month}-${day} ${hour}:${minute}`;

    case "S":
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;

    default:
      return `${year}-${month}-${day}`;
  }
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

/* =========================================================
   11. 시계열 구조 요약
========================================================= */

function summarizeDateStructure(rows, datetimeColumn) {
  if (!rows || rows.length === 0 || !datetimeColumn) {
    return {
      hasDatetimeColumn: false,
      message: "날짜 컬럼이 없습니다."
    };
  }

  const sorted = sortRowsByDate(rows, datetimeColumn);
  const validDates = sorted
    .map(row => parseDateValue(row[datetimeColumn]))
    .filter(Boolean);

  const frequency = detectFrequency(sorted, datetimeColumn);
  const duplicates = findDuplicateTimestamps(sorted, datetimeColumn);
  const missingTimestamps = findMissingTimestamps(sorted, datetimeColumn, frequency.code);

  return {
    hasDatetimeColumn: true,
    datetimeColumn,
    startDate: validDates[0] || null,
    endDate: validDates[validDates.length - 1] || null,
    totalRows: rows.length,
    validDateCount: validDates.length,
    invalidDateCount: rows.length - validDates.length,
    isSorted: isSortedByDate(rows, datetimeColumn),
    frequency,
    duplicateCount: duplicates.length,
    duplicates,
    missingTimestampCount: missingTimestamps.length,
    missingTimestamps
  };
}

/* =========================================================
   12. 외부 접근용 객체
========================================================= */

window.TSDateUtils = {
  constants: {
    TS_DATE_PATTERNS,
    TS_FREQUENCY_RULES
  },

  parseDateValue,
  normalizeDateText,
  isValidDateValue,

  detectDatetimeColumn,

  sortRowsByDate,
  findDuplicateTimestamps,
  isSortedByDate,

  getTimeDifferences,
  getMedian,
  getMode,

  detectFrequency,
  findClosestFrequencyRule,
  calculateRegularity,

  createDateRange,
  createDateRangeByPeriods,
  addFrequency,

  findMissingTimestamps,
  getFrequencyInfoByCode,
  buildRegularTimeIndexRows,

  formatDate,
  summarizeDateStructure
};