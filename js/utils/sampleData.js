/* =========================================================
   TS Navigator - sampleData.js
   샘플 시계열 데이터 생성 유틸
   ========================================================= */

/* =========================================================
   기본 랜덤 함수
   ========================================================= */

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function randomNoise(scale = 1) {
  return (Math.random() - 0.5) * scale;
}

/* =========================================================
   날짜 생성
   ========================================================= */

function generateDateSeries({
  startDate = "2024-01-01",
  length = 100,
  frequency = "daily",
}) {
  const dates = [];

  let current = new Date(startDate);

  for (let i = 0; i < length; i += 1) {
    dates.push(current.toISOString());

    switch (frequency) {
      case "second":
        current = TSDateUtils.addSeconds(current, 1);
        break;

      case "minute":
        current = TSDateUtils.addMinutes(current, 1);
        break;

      case "hour":
        current = TSDateUtils.addHours(current, 1);
        break;

      case "weekly":
        current = TSDateUtils.addWeeks(current, 1);
        break;

      case "monthly":
        current = TSDateUtils.addMonths(current, 1);
        break;

      case "yearly":
        current = TSDateUtils.addYears(current, 1);
        break;

      case "daily":
      default:
        current = TSDateUtils.addDays(current, 1);
        break;
    }
  }

  return dates;
}

/* =========================================================
   Trend 생성
   ========================================================= */

function generateTrend({
  length = 100,
  slope = 1,
  intercept = 0,
}) {
  return Array.from({ length }, (_, index) => {
    return intercept + slope * index;
  });
}

/* =========================================================
   Seasonal 생성
   ========================================================= */

function generateSeasonality({
  length = 100,
  amplitude = 10,
  period = 12,
}) {
  return Array.from({ length }, (_, index) => {
    return (
      amplitude *
      Math.sin((2 * Math.PI * index) / period)
    );
  });
}

/* =========================================================
   Noise 생성
   ========================================================= */

function generateNoise({
  length = 100,
  scale = 5,
}) {
  return Array.from({ length }, () => {
    return randomNoise(scale);
  });
}

/* =========================================================
   단순 시계열 생성
   ========================================================= */

function generateSimpleSeries({
  length = 100,
  startDate = "2024-01-01",
  frequency = "daily",

  trendSlope = 0.5,
  trendIntercept = 50,

  seasonalAmplitude = 10,
  seasonalPeriod = 12,

  noiseScale = 5,
}) {
  const dates = generateDateSeries({
    startDate,
    length,
    frequency,
  });

  const trend = generateTrend({
    length,
    slope: trendSlope,
    intercept: trendIntercept,
  });

  const seasonal = generateSeasonality({
    length,
    amplitude: seasonalAmplitude,
    period: seasonalPeriod,
  });

  const noise = generateNoise({
    length,
    scale: noiseScale,
  });

  const values = Array.from({ length }, (_, index) => {
    return trend[index] + seasonal[index] + noise[index];
  });

  return {
    dates,
    values,
  };
}

/* =========================================================
   결측치 추가
   ========================================================= */

function injectMissingValues(values = [], missingRatio = 0.1) {
  const result = [...values];

  const missingCount = Math.floor(values.length * missingRatio);

  for (let i = 0; i < missingCount; i += 1) {
    const randomIndex = randomInt(0, values.length - 1);

    result[randomIndex] = null;
  }

  return result;
}

/* =========================================================
   이상치 추가
   ========================================================= */

function injectOutliers({
  values = [],
  outlierRatio = 0.05,
  scale = 3,
}) {
  const result = [...values];

  const outlierCount = Math.floor(values.length * outlierRatio);

  const sd = TSMathUtils.standardDeviation(values, false) || 10;

  for (let i = 0; i < outlierCount; i += 1) {
    const randomIndex = randomInt(0, values.length - 1);

    if (result[randomIndex] === null) continue;

    const direction = Math.random() > 0.5 ? 1 : -1;

    result[randomIndex] += direction * sd * scale;
  }

  return result;
}

/* =========================================================
   중복 Timestamp 추가
   ========================================================= */

function injectDuplicateTimestamps(dates = [], ratio = 0.03) {
  const result = [...dates];

  const duplicateCount = Math.floor(dates.length * ratio);

  for (let i = 0; i < duplicateCount; i += 1) {
    const randomIndex = randomInt(1, dates.length - 1);

    result[randomIndex] = result[randomIndex - 1];
  }

  return result;
}

/* =========================================================
   실제 CSV 형태 데이터 생성
   ========================================================= */

function createSampleCSVRows({
  length = 100,
  startDate = "2024-01-01",
  frequency = "daily",

  missingRatio = 0.08,
  outlierRatio = 0.05,
  duplicateRatio = 0.03,
}) {
  const series = generateSimpleSeries({
    length,
    startDate,
    frequency,
  });

  let values = [...series.values];
  let dates = [...series.dates];

  values = injectMissingValues(values, missingRatio);

  values = injectOutliers({
    values,
    outlierRatio,
  });

  dates = injectDuplicateTimestamps(dates, duplicateRatio);

  return dates.map((date, index) => {
    return {
      datetime: date,
      value:
        values[index] !== null
          ? TSMathUtils.roundNumber(values[index], 3)
          : null,
    };
  });
}

/* =========================================================
   CSV 문자열 생성
   ========================================================= */

function createSampleCSVText(options = {}) {
  const rows = createSampleCSVRows(options);

  const columns = ["datetime", "value"];

  return TSCSVUtils.exportRowsToCSV(rows, columns);
}

/* =========================================================
   업로드용 샘플 데이터 객체
   ========================================================= */

function createSampleDataset(options = {}) {
  const rows = createSampleCSVRows(options);

  const columns = ["datetime", "value"];

  const summary = TSCSVUtils.summarizeCSVData(
    rows,
    columns,
    "datetime"
  );

  return {
    fileName: "sample_timeseries.csv",
    columns,
    rows,
    datetimeColumn: "datetime",
    targetColumn: "value",
    frequency: options.frequency || "daily",
    summary,
  };
}

/* =========================================================
   트랙용 샘플 데이터
   ========================================================= */

function createSampleTrackData(options = {}) {
  const dataset = createSampleDataset(options);

  const series = TSCSVUtils.rowsToTimeSeries(
    dataset.rows,
    dataset.datetimeColumn,
    dataset.targetColumn
  );

  const { x, y } = TSCSVUtils.timeSeriesToXY(series);

  return {
    dataset,
    x,
    y,
  };
}

/* =========================================================
   자동 분석 테스트용 데이터
   ========================================================= */

function createAutoAnalysisDemoData() {
  return createSampleTrackData({
    length: 180,
    frequency: "daily",
    missingRatio: 0.12,
    outlierRatio: 0.08,
    duplicateRatio: 0.04,
  });
}

/* =========================================================
   다양한 패턴 샘플
   ========================================================= */

function createTrendOnlyData() {
  return createSampleTrackData({
    length: 120,
    frequency: "daily",
    missingRatio: 0,
    outlierRatio: 0,
  });
}

function createSeasonalData() {
  return createSampleTrackData({
    length: 240,
    frequency: "daily",
    missingRatio: 0.03,
    outlierRatio: 0.02,
  });
}

function createNoisyData() {
  return createSampleTrackData({
    length: 150,
    frequency: "daily",
    missingRatio: 0.05,
    outlierRatio: 0.1,
  });
}

/* =========================================================
   전역 노출
   ========================================================= */

window.TSSampleData = {
  randomBetween,
  randomInt,
  randomNoise,

  generateDateSeries,
  generateTrend,
  generateSeasonality,
  generateNoise,

  generateSimpleSeries,

  injectMissingValues,
  injectOutliers,
  injectDuplicateTimestamps,

  createSampleCSVRows,
  createSampleCSVText,
  createSampleDataset,
  createSampleTrackData,

  createAutoAnalysisDemoData,

  createTrendOnlyData,
  createSeasonalData,
  createNoisyData,
};