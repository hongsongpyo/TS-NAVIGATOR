/* =========================================================
   TS Navigator - csvUtils.js
   CSV 업로드/파싱/타입 추정 유틸
   ========================================================= */

function parseCSVText(csvText) {
  const text = removeBOM(csvText).trim();

  if (!text) {
    return {
      columns: [],
      rows: [],
    };
  }

  const lines = splitCSVLines(text);

  if (lines.length === 0) {
    return {
      columns: [],
      rows: [],
    };
  }

  const columns = parseCSVLine(lines[0]).map((column) => column.trim());

  const rows = lines.slice(1).map((line, rowIndex) => {
    const values = parseCSVLine(line);
    const row = {};

    columns.forEach((column, columnIndex) => {
      row[column] = cleanCSVValue(values[columnIndex]);
    });

    row.__rowIndex = rowIndex;

    return row;
  });

  return {
    columns,
    rows,
  };
}

function removeBOM(text) {
  return text.replace(/^\uFEFF/, "");
}

function splitCSVLines(text) {
  const lines = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"' && nextChar === '"') {
      current += char + nextChar;
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuote = !insideQuote;
      current += char;
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuote) {
      if (current.trim() !== "") {
        lines.push(current);
      }

      current = "";

      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }

      continue;
    }

    current += char;
  }

  if (current.trim() !== "") {
    lines.push(current);
  }

  return lines;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuote = !insideQuote;
      continue;
    }

    if (char === "," && !insideQuote) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);

  return result;
}

function cleanCSVValue(value) {
  if (value === undefined || value === null) return null;

  const cleaned = String(value).trim();

  if (
    cleaned === "" ||
    cleaned.toLowerCase() === "na" ||
    cleaned.toLowerCase() === "nan" ||
    cleaned.toLowerCase() === "null" ||
    cleaned.toLowerCase() === "undefined"
  ) {
    return null;
  }

  return cleaned;
}

function inferColumnTypes(rows, columns) {
  const result = {};

  columns.forEach((column) => {
    const values = rows
      .map((row) => row[column])
      .filter((value) => value !== null && value !== "");

    const numericCount = values.filter((value) => isNumericValue(value)).length;
    const dateCount = values.filter((value) => isDateValue(value)).length;

    const total = values.length || 1;
    const numericRatio = numericCount / total;
    const dateRatio = dateCount / total;

    if (dateRatio >= 0.7) {
      result[column] = "datetime";
    } else if (numericRatio >= 0.7) {
      result[column] = "number";
    } else {
      result[column] = "string";
    }
  });

  return result;
}

function isNumericValue(value) {
  if (value === null || value === undefined || value === "") return false;

  const number = Number(String(value).replace(/,/g, ""));

  return Number.isFinite(number);
}

function isDateValue(value) {
  if (value === null || value === undefined || value === "") return false;

  const date = new Date(value);

  return !Number.isNaN(date.getTime());
}

function convertRowsByType(rows, columnTypes) {
  return rows.map((row) => {
    const converted = { ...row };

    Object.keys(columnTypes).forEach((column) => {
      const value = converted[column];

      if (value === null || value === undefined || value === "") {
        converted[column] = null;
        return;
      }

      if (columnTypes[column] === "number") {
        converted[column] = Number(String(value).replace(/,/g, ""));
      }

      if (columnTypes[column] === "datetime") {
        converted[column] = new Date(value).toISOString();
      }
    });

    return converted;
  });
}

function guessDatetimeColumn(columns, columnTypes) {
  const candidates = columns.filter((column) => columnTypes[column] === "datetime");

  if (candidates.length > 0) {
    return candidates[0];
  }

  const nameCandidates = columns.filter((column) => {
    const lower = column.toLowerCase();

    return (
      lower.includes("date") ||
      lower.includes("time") ||
      lower.includes("datetime") ||
      lower.includes("timestamp") ||
      lower.includes("period")
    );
  });

  return nameCandidates[0] || null;
}

function guessTargetColumn(columns, columnTypes, datetimeColumn = null) {
  const numericColumns = columns.filter(
    (column) => columnTypes[column] === "number" && column !== datetimeColumn
  );

  if (numericColumns.length > 0) {
    return numericColumns[0];
  }

  return columns.find((column) => column !== datetimeColumn) || null;
}

function summarizeCSVData(rows, columns, datetimeColumn = null) {
  const missingCount = rows.reduce((total, row) => {
    const rowMissingCount = columns.filter(
      (column) => row[column] === null || row[column] === undefined || row[column] === ""
    ).length;

    return total + rowMissingCount;
  }, 0);

  let duplicateTimestampCount = 0;
  let startDate = null;
  let endDate = null;

  if (datetimeColumn) {
    const timestamps = rows
      .map((row) => row[datetimeColumn])
      .filter((value) => value !== null)
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));

    const timestampSet = new Set(timestamps);
    duplicateTimestampCount = timestamps.length - timestampSet.size;

    if (timestamps.length > 0) {
      startDate = new Date(Math.min(...timestamps)).toISOString();
      endDate = new Date(Math.max(...timestamps)).toISOString();
    }
  }

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    missingCount,
    duplicateTimestampCount,
    startDate,
    endDate,
  };
}

function rowsToTimeSeries(rows, datetimeColumn, targetColumn) {
  return rows
    .map((row) => {
      const date = new Date(row[datetimeColumn]);
      const value = Number(row[targetColumn]);

      return {
        date: Number.isNaN(date.getTime()) ? null : date.toISOString(),
        value: Number.isFinite(value) ? value : null,
        originalRow: row,
      };
    })
    .filter((item) => item.date !== null)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function timeSeriesToXY(series) {
  return {
    x: series.map((item) => item.date),
    y: series.map((item) => item.value),
  };
}

function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("CSV 파일이 선택되지 않았습니다."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const rawText = reader.result;
        const parsed = parseCSVText(rawText);
        const columnTypes = inferColumnTypes(parsed.rows, parsed.columns);
        const datetimeColumn = guessDatetimeColumn(parsed.columns, columnTypes);
        const targetColumn = guessTargetColumn(
          parsed.columns,
          columnTypes,
          datetimeColumn
        );

        const convertedRows = convertRowsByType(parsed.rows, columnTypes);

        const summary = summarizeCSVData(
          convertedRows,
          parsed.columns,
          datetimeColumn
        );

        resolve({
          fileName: file.name,
          rawText,
          columns: parsed.columns,
          rows: convertedRows,
          columnTypes,
          datetimeColumn,
          targetColumn,
          summary,
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("CSV 파일을 읽는 중 오류가 발생했습니다."));
    };

    reader.readAsText(file, "UTF-8");
  });
}

function exportRowsToCSV(rows, columns) {
  const header = columns.join(",");

  const body = rows
    .map((row) =>
      columns
        .map((column) => {
          const value = row[column];

          if (value === null || value === undefined) return "";

          const text = String(value);

          if (text.includes(",") || text.includes('"') || text.includes("\n")) {
            return `"${text.replace(/"/g, '""')}"`;
          }

          return text;
        })
        .join(",")
    )
    .join("\n");

  return `${header}\n${body}`;
}

window.TSCSVUtils = {
  parseCSVText,
  removeBOM,
  splitCSVLines,
  parseCSVLine,
  cleanCSVValue,
  inferColumnTypes,
  isNumericValue,
  isDateValue,
  convertRowsByType,
  guessDatetimeColumn,
  guessTargetColumn,
  summarizeCSVData,
  rowsToTimeSeries,
  timeSeriesToXY,
  readCSVFile,
  exportRowsToCSV,
};