/* =========================================================
   TS Navigator - csvUtils.js
   ---------------------------------------------------------
   역할
   1. CSV 파일 읽기
   2. CSV 문자열 파싱
   3. 컬럼명 정리
   4. 날짜 컬럼 / target 컬럼 자동 탐지
   5. 시계열 분석용 데이터셋 구조 생성
   6. CSV 내보내기
========================================================= */

/* =========================================================
   1. 파일 읽기
========================================================= */

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("파일이 선택되지 않았습니다."));
      return;
    }

    const reader = new FileReader();

    reader.onload = event => {
      resolve(event.target.result);
    };

    reader.onerror = () => {
      reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
    };

    reader.readAsText(file, "UTF-8");
  });
}

async function readCSVFile(file) {
  const rawText = await readTextFile(file);
  return parseCSV(rawText, {
    fileName: file.name
  });
}

/* =========================================================
   2. CSV 파싱
========================================================= */

function parseCSV(rawText, options = {}) {
  if (!rawText || typeof rawText !== "string") {
    return createEmptyCSVResult(options.fileName);
  }

  const delimiter = options.delimiter || detectDelimiter(rawText);
  const lines = splitCSVLines(rawText);

  if (lines.length === 0) {
    return createEmptyCSVResult(options.fileName);
  }

  const headerLine = lines[0];
  const rawColumns = parseCSVLine(headerLine, delimiter);
  const columns = normalizeColumnNames(rawColumns);

  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line || line.trim() === "") continue;

    const values = parseCSVLine(line, delimiter);
    const row = {};

    columns.forEach((column, index) => {
      row[column] = values[index] !== undefined ? values[index] : "";
    });

    row.__rowIndex = i - 1;
    rows.push(row);
  }

  const dataset = createDatasetSummary({
    fileName: options.fileName || null,
    rawText,
    delimiter,
    columns,
    rows
  });

  return dataset;
}

function createEmptyCSVResult(fileName = null) {
  return {
    fileName,
    rawText: "",
    delimiter: ",",
    columns: [],
    rows: [],
    rowCount: 0,
    columnCount: 0,
    datetimeColumn: null,
    targetColumn: null,
    frequency: null,
    structureSummary: null,
    numericColumns: [],
    categoricalColumns: [],
    previewRows: [],
    errors: ["CSV 데이터가 비어 있습니다."]
  };
}

/* =========================================================
   3. 구분자 탐지
========================================================= */

function detectDelimiter(rawText) {
  const candidates = [",", ";", "\t", "|"];
  const firstLines = splitCSVLines(rawText).slice(0, 5);

  let bestDelimiter = ",";
  let bestScore = -1;

  candidates.forEach(delimiter => {
    const counts = firstLines.map(line => parseCSVLine(line, delimiter).length);
    const averageCount = counts.reduce((acc, count) => acc + count, 0) / counts.length;
    const isStable = counts.every(count => count === counts[0]);

    const score = averageCount + (isStable ? 2 : 0);

    if (score > bestScore && averageCount > 1) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  });

  return bestDelimiter;
}

/* =========================================================
   4. CSV 줄 / 셀 파싱
========================================================= */

function splitCSVLines(rawText) {
  const text = rawText.replace(/^\uFEFF/, "");
  const lines = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && insideQuote && nextChar === '"') {
      current += '""';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuote = !insideQuote;
      current += char;
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuote) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }

      lines.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

function parseCSVLine(line, delimiter = ",") {
  const values = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && insideQuote && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuote = !insideQuote;
      continue;
    }

    if (char === delimiter && !insideQuote) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());

  return values;
}

/* =========================================================
   5. 컬럼명 정리
========================================================= */

function normalizeColumnNames(rawColumns) {
  const usedNames = new Map();

  return rawColumns.map((column, index) => {
    let name = String(column || "").trim();

    if (!name) {
      name = `column_${index + 1}`;
    }

    name = name.replace(/^\uFEFF/, "");

    const baseName = name;
    const usedCount = usedNames.get(baseName) || 0;

    usedNames.set(baseName, usedCount + 1);

    if (usedCount > 0) {
      name = `${baseName}_${usedCount + 1}`;
    }

    return name;
  });
}

/* =========================================================
   6. 데이터셋 구조 생성
========================================================= */

function createDatasetSummary({ fileName, rawText, delimiter, columns, rows }) {
  const numericColumns = detectNumericColumns(rows, columns);
  const categoricalColumns = columns.filter(column => !numericColumns.includes(column));

  const datetimeColumn = window.TSDateUtils
    ? window.TSDateUtils.detectDatetimeColumn(rows, columns)
    : null;

  const targetColumn = detectTargetColumn(rows, columns, datetimeColumn, numericColumns);

  const sortedRows = datetimeColumn && window.TSDateUtils
    ? window.TSDateUtils.sortRowsByDate(rows, datetimeColumn)
    : rows;

  const frequency = datetimeColumn && window.TSDateUtils
    ? window.TSDateUtils.detectFrequency(sortedRows, datetimeColumn)
    : null;

  const structureSummary = datetimeColumn && window.TSDateUtils
    ? window.TSDateUtils.summarizeDateStructure(sortedRows, datetimeColumn)
    : null;

  return {
    fileName,
    rawText,
    delimiter,
    columns,
    rows: sortedRows,
    rowCount: sortedRows.length,
    columnCount: columns.length,
    datetimeColumn,
    targetColumn,
    frequency,
    structureSummary,
    numericColumns,
    categoricalColumns,
    previewRows: sortedRows.slice(0, 10),
    errors: validateDataset({
      columns,
      rows: sortedRows,
      datetimeColumn,
      targetColumn
    })
  };
}

/* =========================================================
   7. 숫자 컬럼 / target 컬럼 탐지
========================================================= */

function detectNumericColumns(rows, columns) {
  if (!rows || rows.length === 0 || !columns || columns.length === 0) {
    return [];
  }

  const sampleRows = rows.slice(0, Math.min(rows.length, 50));

  return columns.filter(column => {
    const validCount = sampleRows.reduce((count, row) => {
      const value = row[column];

      if (value === null || value === undefined || value === "") {
        return count;
      }

      const number = window.TSMathUtils
        ? window.TSMathUtils.toNumber(value)
        : Number(String(value).replace(/,/g, ""));

      return count + (Number.isFinite(number) ? 1 : 0);
    }, 0);

    const validRatio = validCount / sampleRows.length;

    return validRatio >= 0.6;
  });
}

function detectTargetColumn(rows, columns, datetimeColumn, numericColumns = []) {
  if (!rows || rows.length === 0) return null;

  const targetKeywords = [
    "value",
    "target",
    "y",
    "sales",
    "demand",
    "amount",
    "count",
    "price",
    "close",
    "수요",
    "값",
    "목표",
    "판매",
    "매출",
    "가격",
    "종가",
    "카운트"
  ];

  const candidates = numericColumns.filter(column => column !== datetimeColumn);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let bestColumn = candidates[0];
  let bestScore = -1;

  candidates.forEach(column => {
    const columnName = String(column).toLowerCase();

    const keywordScore = targetKeywords.some(keyword => {
      return columnName.includes(keyword.toLowerCase());
    }) ? 1 : 0;

    const validValues = rows
      .map(row => {
        if (window.TSMathUtils) {
          return window.TSMathUtils.toNumber(row[column]);
        }

        return Number(String(row[column]).replace(/,/g, ""));
      })
      .filter(Number.isFinite);

    const varianceValue = window.TSMathUtils
      ? window.TSMathUtils.variance(validValues)
      : calculateSimpleVariance(validValues);

    const variationScore = Number.isFinite(varianceValue) && varianceValue > 0 ? 0.5 : 0;
    const completenessScore = validValues.length / rows.length;

    const score = keywordScore + variationScore + completenessScore;

    if (score > bestScore) {
      bestScore = score;
      bestColumn = column;
    }
  });

  return bestColumn;
}

function calculateSimpleVariance(values) {
  if (!values || values.length <= 1) return NaN;

  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;

  return values.reduce((acc, value) => {
    return acc + Math.pow(value - avg, 2);
  }, 0) / (values.length - 1);
}

/* =========================================================
   8. 데이터셋 검증
========================================================= */

function validateDataset({ columns, rows, datetimeColumn, targetColumn }) {
  const errors = [];

  if (!columns || columns.length === 0) {
    errors.push("컬럼이 없습니다.");
  }

  if (!rows || rows.length === 0) {
    errors.push("데이터 행이 없습니다.");
  }

  if (!datetimeColumn) {
    errors.push("날짜 컬럼을 자동으로 찾지 못했습니다.");
  }

  if (!targetColumn) {
    errors.push("분석 대상 숫자 컬럼을 자동으로 찾지 못했습니다.");
  }

  if (datetimeColumn && rows.length > 0) {
    const invalidDateCount = rows.filter(row => {
      return !window.TSDateUtils || !window.TSDateUtils.isValidDateValue(row[datetimeColumn]);
    }).length;

    if (invalidDateCount > 0) {
      errors.push(`날짜로 변환할 수 없는 값이 ${invalidDateCount}개 있습니다.`);
    }
  }

  if (targetColumn && rows.length > 0) {
    const invalidNumberCount = rows.filter(row => {
      const value = window.TSMathUtils
        ? window.TSMathUtils.toNumber(row[targetColumn])
        : Number(row[targetColumn]);

      return !Number.isFinite(value);
    }).length;

    if (invalidNumberCount > 0) {
      errors.push(`숫자로 변환할 수 없는 target 값이 ${invalidNumberCount}개 있습니다.`);
    }
  }

  return errors;
}

/* =========================================================
   9. 시계열 분석용 배열 변환
========================================================= */

function toTimeSeries(rows, datetimeColumn, targetColumn) {
  if (!rows || !datetimeColumn || !targetColumn) return [];

  return rows.map((row, index) => {
    const date = window.TSDateUtils
      ? window.TSDateUtils.parseDateValue(row[datetimeColumn])
      : new Date(row[datetimeColumn]);

    const value = window.TSMathUtils
      ? window.TSMathUtils.toNumber(row[targetColumn])
      : Number(row[targetColumn]);

    return {
      index,
      date,
      timestamp: date && !Number.isNaN(date.getTime()) ? date.getTime() : null,
      value,
      raw: row
    };
  });
}

function toXYSeries(rows, datetimeColumn, targetColumn) {
  const series = toTimeSeries(rows, datetimeColumn, targetColumn);

  return {
    x: series.map(item => item.date),
    y: series.map(item => item.value),
    series
  };
}

function extractTargetValues(rows, targetColumn) {
  if (!rows || !targetColumn) return [];

  return rows.map(row => {
    if (window.TSMathUtils) {
      return window.TSMathUtils.toNumber(row[targetColumn]);
    }

    return Number(row[targetColumn]);
  });
}

/* =========================================================
   10. 데이터 행 업데이트
========================================================= */

function updateCellValue(rows, rowIndex, columnName, value) {
  if (!rows || !rows[rowIndex] || !columnName) return rows;

  const updatedRows = [...rows];

  updatedRows[rowIndex] = {
    ...updatedRows[rowIndex],
    [columnName]: value
  };

  return updatedRows;
}

function updateTargetValue(rows, rowIndex, targetColumn, value) {
  return updateCellValue(rows, rowIndex, targetColumn, value);
}

/* =========================================================
   11. CSV 내보내기
========================================================= */

function escapeCSVValue(value) {
  if (value === null || value === undefined) return "";

  const text = String(value);

  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function rowsToCSV(rows, columns = null) {
  if (!rows || rows.length === 0) return "";

  const targetColumns = columns || Object.keys(rows[0]).filter(column => !column.startsWith("__"));

  const header = targetColumns.map(escapeCSVValue).join(",");
  const body = rows.map(row => {
    return targetColumns.map(column => escapeCSVValue(row[column])).join(",");
  });

  return [header, ...body].join("\n");
}

function downloadCSV(rows, fileName = "ts_navigator_export.csv", columns = null) {
  const csvText = rowsToCSV(rows, columns);
  const blob = new Blob([csvText], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

/* =========================================================
   12. 샘플 CSV 생성
========================================================= */

function createSampleCSV() {
  const rows = [
    { date: "2024-01-01", demand: 120 },
    { date: "2024-01-02", demand: 125 },
    { date: "2024-01-03", demand: "" },
    { date: "2024-01-04", demand: 131 },
    { date: "2024-01-05", demand: 129 },
    { date: "2024-01-06", demand: 180 },
    { date: "2024-01-07", demand: 134 },
    { date: "2024-01-08", demand: 138 },
    { date: "2024-01-09", demand: "" },
    { date: "2024-01-10", demand: 141 },
    { date: "2024-01-11", demand: 145 },
    { date: "2024-01-12", demand: 149 },
    { date: "2024-01-13", demand: 151 },
    { date: "2024-01-14", demand: 153 },
    { date: "2024-01-15", demand: 156 }
  ];

  return rowsToCSV(rows, ["date", "demand"]);
}

/* =========================================================
   13. 외부 접근용 객체
========================================================= */

window.TSCSVUtils = {
  readTextFile,
  readCSVFile,

  parseCSV,
  createEmptyCSVResult,

  detectDelimiter,
  splitCSVLines,
  parseCSVLine,

  normalizeColumnNames,
  createDatasetSummary,

  detectNumericColumns,
  detectTargetColumn,
  validateDataset,

  toTimeSeries,
  toXYSeries,
  extractTargetValues,

  updateCellValue,
  updateTargetValue,

  escapeCSVValue,
  rowsToCSV,
  downloadCSV,

  createSampleCSV
};