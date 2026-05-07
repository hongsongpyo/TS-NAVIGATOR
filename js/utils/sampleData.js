/* =========================================================
   TS Navigator - sampleData.js
   ---------------------------------------------------------
   역할
   1. 시계열 샘플 데이터 생성
   2. 결측치 / 이상치 / 추세 / 계절성 포함 데이터 생성
   3. 테스트용 CSV 생성
   4. 다양한 frequency 데이터 생성
========================================================= */

/* =========================================================
   1. 기본 설정
========================================================= */

const TSSamplePresets = {
  SIMPLE: "simple",
  TREND: "trend",
  SEASONAL: "seasonal",
  TREND_SEASONAL: "trend-seasonal",
  MISSING: "missing",
  OUTLIER: "outlier",
  FULL: "full"
};

const TSSampleFrequency = {
  DAILY: "D",
  WEEKLY: "W",
  MONTHLY: "M",
  HOURLY: "H"
};

/* =========================================================
   2. 날짜 시계열 생성
========================================================= */

function generateDateSeries({
  startDate = "2024-01-01",
  periods = 30,
  frequency = TSSampleFrequency.DAILY
} = {}) {
  if (!window.TSDateUtils) {
    throw new Error("TSDateUtils가 로드되지 않았습니다.");
  }

  return window.TSDateUtils.createDateRangeByPeriods(
    startDate,
    periods,
    frequency
  );
}

/* =========================================================
   3. 기본 노이즈 생성
========================================================= */

function randomNoise(scale = 1) {
  return (Math.random() - 0.5) * scale;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/* =========================================================
   4. 단순 시계열
========================================================= */

function generateSimpleSeries({
  periods = 30,
  baseValue = 100,
  noiseScale = 5
} = {}) {
  const values = [];

  for (let i = 0; i < periods; i += 1) {
    values.push(baseValue + randomNoise(noiseScale));
  }

  return values;
}

/* =========================================================
   5. 추세 시계열
========================================================= */

function generateTrendSeries({
  periods = 50,
  baseValue = 100,
  slope = 2,
  noiseScale = 5
} = {}) {
  const values = [];

  for (let i = 0; i < periods; i += 1) {
    const trend = baseValue + slope * i;
    values.push(trend + randomNoise(noiseScale));
  }

  return values;
}

/* =========================================================
   6. 계절성 시계열
========================================================= */

function generateSeasonalSeries({
  periods = 60,
  baseValue = 100,
  seasonalAmplitude = 20,
  seasonalPeriod = 12,
  noiseScale = 3
} = {}) {
  const values = [];

  for (let i = 0; i < periods; i += 1) {
    const seasonal =
      seasonalAmplitude *
      Math.sin((2 * Math.PI * i) / seasonalPeriod);

    values.push(baseValue + seasonal + randomNoise(noiseScale));
  }

  return values;
}

/* =========================================================
   7. 추세 + 계절성
========================================================= */

function generateTrendSeasonalSeries({
  periods = 72,
  baseValue = 100,
  slope = 1.5,
  seasonalAmplitude = 15,
  seasonalPeriod = 12,
  noiseScale = 4
} = {}) {
  const values = [];

  for (let i = 0; i < periods; i += 1) {
    const trend = slope * i;

    const seasonal =
      seasonalAmplitude *
      Math.sin((2 * Math.PI * i) / seasonalPeriod);

    values.push(
      baseValue +
      trend +
      seasonal +
      randomNoise(noiseScale)
    );
  }

  return values;
}

/* =========================================================
   8. 결측치 삽입
========================================================= */

function insertMissingValues(
  values,
  missingRatio = 0.1
) {
  const result = [...values];

  const missingCount = Math.max(
    1,
    Math.floor(values.length * missingRatio)
  );

  const usedIndices = new Set();

  while (usedIndices.size < missingCount) {
    const index = Math.floor(Math.random() * values.length);

    if (!usedIndices.has(index)) {
      usedIndices.add(index);
      result[index] = "";
    }
  }

  return result;
}

/* =========================================================
   9. 이상치 삽입
========================================================= */

function insertOutliers(
  values,
  outlierRatio = 0.05,
  scale = 3
) {
  const result = [...values];

  const outlierCount = Math.max(
    1,
    Math.floor(values.length * outlierRatio)
  );

  const avg = window.TSMathUtils
    ? window.TSMathUtils.mean(values)
    : 100;

  const std = window.TSMathUtils
    ? window.TSMathUtils.standardDeviation(values)
    : 10;

  const usedIndices = new Set();

  while (usedIndices.size < outlierCount) {
    const index = Math.floor(Math.random() * values.length);

    if (!usedIndices.has(index)) {
      usedIndices.add(index);

      const direction = Math.random() > 0.5 ? 1 : -1;

      result[index] =
        avg + direction * scale * std;
    }
  }

  return result;
}

/* =========================================================
   10. 누락 timestamp 삽입
========================================================= */

function removeRandomDates(
  dates,
  values,
  missingRatio = 0.1
) {
  const resultDates = [];
  const resultValues = [];

  for (let i = 0; i < dates.length; i += 1) {
    if (Math.random() > missingRatio) {
      resultDates.push(dates[i]);
      resultValues.push(values[i]);
    }
  }

  return {
    dates: resultDates,
    values: resultValues
  };
}

/* =========================================================
   11. row 생성
========================================================= */

function createRows({
  dates,
  values,
  datetimeColumn = "date",
  targetColumn = "value"
}) {
  return dates.map((date, index) => {
    return {
      [datetimeColumn]: window.TSDateUtils
        ? window.TSDateUtils.formatDate(date, "D")
        : String(date),

      [targetColumn]:
        typeof values[index] === "number"
          ? Number(values[index].toFixed(3))
          : values[index]
    };
  });
}

/* =========================================================
   12. FULL 샘플 데이터 생성
========================================================= */

function generateFullSampleDataset({
  periods = 72,
  frequency = TSSampleFrequency.DAILY
} = {}) {
  const dates = generateDateSeries({
    startDate: "2024-01-01",
    periods,
    frequency
  });

  let values = generateTrendSeasonalSeries({
    periods,
    baseValue: 100,
    slope: 0.8,
    seasonalAmplitude: 20,
    seasonalPeriod: 12,
    noiseScale: 5
  });

  values = insertMissingValues(values, 0.08);
  values = insertOutliers(values, 0.05, 4);

  const filtered = removeRandomDates(
    dates,
    values,
    0.05
  );

  return createRows({
    dates: filtered.dates,
    values: filtered.values,
    datetimeColumn: "date",
    targetColumn: "demand"
  });
}

/* =========================================================
   13. preset 기반 생성
========================================================= */

function generatePresetDataset(
  preset = TSSamplePresets.SIMPLE,
  options = {}
) {
  const periods = options.periods || 50;

  const dates = generateDateSeries({
    startDate: options.startDate || "2024-01-01",
    periods,
    frequency:
      options.frequency ||
      TSSampleFrequency.DAILY
  });

  let values = [];

  switch (preset) {
    case TSSamplePresets.TREND:
      values = generateTrendSeries({
        periods
      });
      break;

    case TSSamplePresets.SEASONAL:
      values = generateSeasonalSeries({
        periods
      });
      break;

    case TSSamplePresets.TREND_SEASONAL:
      values = generateTrendSeasonalSeries({
        periods
      });
      break;

    case TSSamplePresets.MISSING:
      values = generateTrendSeasonalSeries({
        periods
      });

      values = insertMissingValues(
        values,
        0.15
      );
      break;

    case TSSamplePresets.OUTLIER:
      values = generateTrendSeries({
        periods
      });

      values = insertOutliers(
        values,
        0.08,
        5
      );
      break;

    case TSSamplePresets.FULL:
      return generateFullSampleDataset({
        periods
      });

    case TSSamplePresets.SIMPLE:
    default:
      values = generateSimpleSeries({
        periods
      });
      break;
  }

  return createRows({
    dates,
    values,
    datetimeColumn:
      options.datetimeColumn || "date",
    targetColumn:
      options.targetColumn || "value"
  });
}

/* =========================================================
   14. CSV 문자열 생성
========================================================= */

function createSampleCSVRows(
  preset = TSSamplePresets.FULL,
  options = {}
) {
  return generatePresetDataset(
    preset,
    options
  );
}

function createSampleCSVText(
  preset = TSSamplePresets.FULL,
  options = {}
) {
  const rows = createSampleCSVRows(
    preset,
    options
  );

  if (!window.TSCSVUtils) {
    throw new Error("TSCSVUtils가 로드되지 않았습니다.");
  }

  return window.TSCSVUtils.rowsToCSV(rows);
}

/* =========================================================
   15. dataset 객체 생성
========================================================= */

function createSampleDataset(
  preset = TSSamplePresets.FULL,
  options = {}
) {
  if (!window.TSCSVUtils) {
    throw new Error("TSCSVUtils가 로드되지 않았습니다.");
  }

  const csvText = createSampleCSVText(
    preset,
    options
  );

  return window.TSCSVUtils.parseCSV(
    csvText,
    {
      fileName: `sample_${preset}.csv`
    }
  );
}

/* =========================================================
   16. 다운로드
========================================================= */

function downloadSampleCSV(
  preset = TSSamplePresets.FULL,
  options = {}
) {
  const rows = createSampleCSVRows(
    preset,
    options
  );

  if (!window.TSCSVUtils) {
    throw new Error("TSCSVUtils가 로드되지 않았습니다.");
  }

  window.TSCSVUtils.downloadCSV(
    rows,
    `sample_${preset}.csv`
  );
}

/* =========================================================
   17. 외부 접근용 객체
========================================================= */

window.TSSampleData = {
  presets: TSSamplePresets,
  frequency: TSSampleFrequency,

  generateDateSeries,

  generateSimpleSeries,
  generateTrendSeries,
  generateSeasonalSeries,
  generateTrendSeasonalSeries,

  insertMissingValues,
  insertOutliers,
  removeRandomDates,

  createRows,

  generateFullSampleDataset,
  generatePresetDataset,

  createSampleCSVRows,
  createSampleCSVText,
  createSampleDataset,

  downloadSampleCSV
};