// TS Navigator/js/forecasting.js

const TSNForecasting = {
  elements: {},

  result: {
    train: [],
    test: [],
    forecast: [],
    fitted: [],
    model: null,
    report: null,
  },

  init() {
    this.cacheElements();
    this.bindEvents();
    this.loadConfigToInputs();
    this.updateVisibleModelParams();
  },

  cacheElements() {
    this.elements.runForecastButton = document.getElementById('runForecastButton');

    this.elements.modelSelect = document.getElementById('modelSelect');
    this.elements.trainRatioInput = document.getElementById('trainRatioInput');
    this.elements.horizonInput = document.getElementById('horizonInput');

    this.elements.saveModelParamButton = document.getElementById('saveModelParamButton');

    this.elements.naiveStrategySelect = document.getElementById('naiveStrategySelect');
    this.elements.naiveWindowInput = document.getElementById('naiveWindowInput');

    this.elements.movingAverageWindowInput = document.getElementById('movingAverageWindowInput');

    this.elements.alphaInput = document.getElementById('alphaInput');
    this.elements.betaInput = document.getElementById('betaInput');
    this.elements.gammaInput = document.getElementById('gammaInput');
    this.elements.seasonalPeriodInput = document.getElementById('seasonalPeriodInput');

    this.elements.polynomialDegreeInput = document.getElementById('polynomialDegreeInput');

    this.elements.arimaPInput = document.getElementById('arimaPInput');
    this.elements.arimaDInput = document.getElementById('arimaDInput');
    this.elements.arimaQInput = document.getElementById('arimaQInput');
  },

  bindEvents() {
    if (this.elements.runForecastButton) {
      this.elements.runForecastButton.addEventListener('click', () => {
        this.run();
      });
    }

    if (this.elements.modelSelect) {
      this.elements.modelSelect.addEventListener('change', () => {
        this.saveBasicConfig();
        this.updateVisibleModelParams();
      });
    }

    if (this.elements.trainRatioInput) {
      this.elements.trainRatioInput.addEventListener('change', () => {
        this.saveBasicConfig();
      });
    }

    if (this.elements.horizonInput) {
      this.elements.horizonInput.addEventListener('change', () => {
        this.saveBasicConfig();
      });
    }

    if (this.elements.saveModelParamButton) {
      this.elements.saveModelParamButton.addEventListener('click', () => {
        this.saveModelParams();
        this.closeModal(document.getElementById('modelParamModal'));
      });
    }
  },

  loadConfigToInputs() {
    const config = window.TSNApp.state.forecastingConfig;

    if (!config) {
      return;
    }

    if (this.elements.modelSelect) {
      this.elements.modelSelect.value = config.model;
    }

    if (this.elements.trainRatioInput) {
      this.elements.trainRatioInput.value = Math.round((1 - config.testRatio) * 100);
    }

    if (this.elements.horizonInput) {
      this.elements.horizonInput.value = config.horizon;
    }

    const params = config.modelParams;

    if (this.elements.naiveStrategySelect) {
      this.elements.naiveStrategySelect.value = params.naive.strategy;
      this.elements.naiveWindowInput.value = params.naive.windowLength;
    }

    if (this.elements.movingAverageWindowInput) {
      this.elements.movingAverageWindowInput.value = params.movingAverage.window;
    }

    if (this.elements.alphaInput) {
      this.elements.alphaInput.value = params.exponentialSmoothing.alpha;
      this.elements.betaInput.value = params.exponentialSmoothing.beta;
      this.elements.gammaInput.value = params.exponentialSmoothing.gamma;
      this.elements.seasonalPeriodInput.value = params.exponentialSmoothing.seasonalPeriod;
    }

    if (this.elements.polynomialDegreeInput) {
      this.elements.polynomialDegreeInput.value = params.polynomialTrend.degree;
    }

    if (this.elements.arimaPInput) {
      this.elements.arimaPInput.value = params.arima.p;
      this.elements.arimaDInput.value = params.arima.d;
      this.elements.arimaQInput.value = params.arima.q;
    }
  },

  saveBasicConfig() {
    const trainRatio = Number(this.elements.trainRatioInput.value) / 100;
    const safeTrainRatio = Math.min(0.95, Math.max(0.5, trainRatio));

    window.TSNApp.updateForecastingConfig({
      model: this.elements.modelSelect.value,
      testRatio: 1 - safeTrainRatio,
      horizon: Math.max(1, Number(this.elements.horizonInput.value) || 1),
    });
  },

  saveModelParams() {
    window.TSNApp.updateModelParams('naive', {
      strategy: this.elements.naiveStrategySelect.value,
      windowLength: Math.max(1, Number(this.elements.naiveWindowInput.value) || 1),
    });

    window.TSNApp.updateModelParams('movingAverage', {
      window: Math.max(2, Number(this.elements.movingAverageWindowInput.value) || 5),
    });

    window.TSNApp.updateModelParams('exponentialSmoothing', {
      alpha: this.clamp(Number(this.elements.alphaInput.value), 0.01, 1),
      beta: this.clamp(Number(this.elements.betaInput.value), 0, 1),
      gamma: this.clamp(Number(this.elements.gammaInput.value), 0, 1),
      trend: 'additive',
      seasonal: 'additive',
      seasonalPeriod: Math.max(2, Number(this.elements.seasonalPeriodInput.value) || 12),
    });

    window.TSNApp.updateModelParams('polynomialTrend', {
      degree: Math.max(1, Math.min(5, Number(this.elements.polynomialDegreeInput.value) || 1)),
    });

    window.TSNApp.updateModelParams('arima', {
      p: Math.max(0, Number(this.elements.arimaPInput.value) || 0),
      d: Math.max(0, Number(this.elements.arimaDInput.value) || 0),
      q: Math.max(0, Number(this.elements.arimaQInput.value) || 0),
    });

    alert('모델 파라미터가 저장되었습니다.');
  },

  updateVisibleModelParams() {
    const selectedModel = this.elements.modelSelect
      ? this.elements.modelSelect.value
      : window.TSNApp.state.forecastingConfig.model;

    const sections = document.querySelectorAll('.model-param-section');

    sections.forEach((section) => {
      const modelName = section.dataset.modelParam;

      if (modelName === selectedModel) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    });
  },

  run() {
    this.saveBasicConfig();

    const sourceSeries = this.getSourceSeries();

    if (!sourceSeries || sourceSeries.length < 5) {
      alert('예측을 수행하려면 최소 5개 이상의 유효한 데이터가 필요합니다.');
      return;
    }

    const config = window.TSNApp.state.forecastingConfig;
    const split = this.splitTrainTest(sourceSeries, config.testRatio);

    if (split.train.length < 3) {
      alert('학습 데이터가 너무 적습니다. 학습 데이터 비율을 높여주세요.');
      return;
    }

    const model = config.model;
    const horizon = config.horizon;
    const params = config.modelParams[model];

    let futureForecast = [];
    let testForecast = [];

    if (model === 'naive') {
      futureForecast = this.forecastNaive(split.train.concat(split.test), horizon, params);
      testForecast = this.forecastNaive(split.train, split.test.length, params);
    }

    if (model === 'movingAverage') {
      futureForecast = this.forecastMovingAverage(split.train.concat(split.test), horizon, params);
      testForecast = this.forecastMovingAverage(split.train, split.test.length, params);
    }

    if (model === 'exponentialSmoothing') {
      futureForecast = this.forecastExponentialSmoothing(
        split.train.concat(split.test),
        horizon,
        params
      );
      testForecast = this.forecastExponentialSmoothing(split.train, split.test.length, params);
    }

    if (model === 'polynomialTrend') {
      futureForecast = this.forecastPolynomialTrend(
        split.train.concat(split.test),
        horizon,
        params
      );
      testForecast = this.forecastPolynomialTrend(split.train, split.test.length, params);
    }

    if (model === 'arima') {
      futureForecast = this.forecastSimpleARIMA(
        split.train.concat(split.test),
        horizon,
        params
      );
      testForecast = this.forecastSimpleARIMA(split.train, split.test.length, params);
    }

    const forecastSeries = this.attachFutureIndex(
      sourceSeries,
      futureForecast
    );

    const testForecastSeries = split.test.map((point, index) => {
      return {
        x: point.x,
        y: testForecast[index] ?? null,
      };
    });

    const report = {
      model,
      horizon,
      trainCount: split.train.length,
      testCount: split.test.length,
      generatedAt: new Date().toISOString(),
    };

    this.result = {
      train: split.train,
      test: split.test,
      forecast: forecastSeries,
      fitted: testForecastSeries,
      model,
      report,
    };

    localStorage.setItem('tsn_forecast_data', JSON.stringify(forecastSeries));
    localStorage.setItem('tsn_test_data', JSON.stringify(split.test));
    localStorage.setItem('tsn_test_forecast_data', JSON.stringify(testForecastSeries));
    localStorage.setItem('tsn_forecast_report', JSON.stringify(report));

    window.dispatchEvent(
      new CustomEvent('tsn:forecast', {
        detail: {
          data: forecastSeries,
          test: split.test,
          testForecast: testForecastSeries,
          report,
        },
      })
    );

    alert('예측이 완료되었습니다.');
  },

  getSourceSeries() {
    const savedPreprocessed = localStorage.getItem('tsn_preprocessed_data');

    if (savedPreprocessed) {
      const parsed = JSON.parse(savedPreprocessed);

      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((point) => Number.isFinite(Number(point.y)));
      }
    }

    if (window.TSNCharts) {
      return window.TSNCharts.chartData.original.filter((point) => {
        return Number.isFinite(Number(point.y));
      });
    }

    const state = window.TSNApp.state;
    const { dateColumn, valueColumn } = state.selectedColumns;

    return state.parsedData
      .map((row, index) => {
        return {
          x: row[dateColumn] ?? index + 1,
          y: Number(row[valueColumn]),
        };
      })
      .filter((point) => Number.isFinite(point.y));
  },

  splitTrainTest(series, testRatio) {
    const testCount = Math.max(1, Math.floor(series.length * testRatio));
    const trainCount = series.length - testCount;

    return {
      train: series.slice(0, trainCount),
      test: series.slice(trainCount),
    };
  },

  forecastNaive(series, horizon, params) {
    const values = this.getValues(series);

    if (params.strategy === 'mean') {
      const mean = this.mean(values);
      return Array.from({ length: horizon }, () => mean);
    }

    if (params.strategy === 'seasonal') {
      const windowLength = Math.max(1, params.windowLength || 1);

      return Array.from({ length: horizon }, (_, index) => {
        const sourceIndex = values.length - windowLength + (index % windowLength);
        return values[Math.max(0, sourceIndex)];
      });
    }

    const lastValue = values[values.length - 1];

    return Array.from({ length: horizon }, () => lastValue);
  },

  forecastMovingAverage(series, horizon, params) {
    const values = this.getValues(series);
    const windowSize = Math.max(2, params.window || 5);
    const forecast = [];
    const history = [...values];

    for (let i = 0; i < horizon; i += 1) {
      const windowValues = history.slice(-windowSize);
      const nextValue = this.mean(windowValues);

      forecast.push(nextValue);
      history.push(nextValue);
    }

    return forecast;
  },

  forecastExponentialSmoothing(series, horizon, params) {
    const values = this.getValues(series);

    const alpha = this.clamp(params.alpha ?? 0.3, 0.01, 1);
    const beta = this.clamp(params.beta ?? 0.05, 0, 1);
    const gamma = this.clamp(params.gamma ?? 0.05, 0, 1);
    const seasonLength = Math.max(2, params.seasonalPeriod || 12);

    if (values.length < seasonLength * 2) {
      return this.forecastHolt(values, horizon, alpha, beta);
    }

    return this.forecastHoltWintersAdditive(
      values,
      horizon,
      alpha,
      beta,
      gamma,
      seasonLength
    );
  },

  forecastHolt(values, horizon, alpha, beta) {
    let level = values[0];
    let trend = values[1] - values[0];

    for (let i = 1; i < values.length; i += 1) {
      const currentValue = values[i];
      const previousLevel = level;

      level = alpha * currentValue + (1 - alpha) * (level + trend);
      trend = beta * (level - previousLevel) + (1 - beta) * trend;
    }

    return Array.from({ length: horizon }, (_, index) => {
      return level + (index + 1) * trend;
    });
  },

  forecastHoltWintersAdditive(values, horizon, alpha, beta, gamma, seasonLength) {
    let level = this.mean(values.slice(0, seasonLength));
    let trend =
      (this.mean(values.slice(seasonLength, seasonLength * 2)) -
        this.mean(values.slice(0, seasonLength))) /
      seasonLength;

    const seasonals = [];

    for (let i = 0; i < seasonLength; i += 1) {
      seasonals[i] = values[i] - level;
    }

    for (let i = 0; i < values.length; i += 1) {
      const seasonalIndex = i % seasonLength;
      const value = values[i];
      const previousLevel = level;

      level = alpha * (value - seasonals[seasonalIndex]) +
        (1 - alpha) * (level + trend);

      trend = beta * (level - previousLevel) + (1 - beta) * trend;

      seasonals[seasonalIndex] =
        gamma * (value - level) +
        (1 - gamma) * seasonals[seasonalIndex];
    }

    return Array.from({ length: horizon }, (_, index) => {
      const step = index + 1;
      const seasonalIndex = (values.length + index) % seasonLength;

      return level + step * trend + seasonals[seasonalIndex];
    });
  },

  forecastPolynomialTrend(series, horizon, params) {
    const values = this.getValues(series);
    const degree = Math.max(1, Math.min(5, params.degree || 1));

    const x = values.map((_, index) => index);
    const coefficients = this.polynomialRegression(x, values, degree);

    return Array.from({ length: horizon }, (_, index) => {
      const nextX = values.length + index;
      return this.evaluatePolynomial(coefficients, nextX);
    });
  },

  forecastSimpleARIMA(series, horizon, params) {
    const values = this.getValues(series);
    const d = Math.max(0, Math.min(2, params.d || 0));
    const p = Math.max(0, params.p || 0);

    const differenced = this.difference(values, d);

    if (differenced.length < 2) {
      return this.forecastNaive(series, horizon, {
        strategy: 'last',
      });
    }

    const arForecast = this.forecastAutoRegressive(differenced, horizon, p);
    return this.inverseDifference(values, arForecast, d);
  },

  forecastAutoRegressive(values, horizon, p) {
    if (p <= 0 || values.length <= p) {
      const lastValue = values[values.length - 1];
      return Array.from({ length: horizon }, () => lastValue);
    }

    const history = [...values];
    const coefficients = this.estimateARCoefficients(values, p);
    const forecast = [];

    for (let step = 0; step < horizon; step += 1) {
      let nextValue = coefficients[0];

      for (let lag = 1; lag <= p; lag += 1) {
        nextValue += coefficients[lag] * history[history.length - lag];
      }

      forecast.push(nextValue);
      history.push(nextValue);
    }

    return forecast;
  },

  estimateARCoefficients(values, p) {
    const xRows = [];
    const yRows = [];

    for (let i = p; i < values.length; i += 1) {
      const row = [1];

      for (let lag = 1; lag <= p; lag += 1) {
        row.push(values[i - lag]);
      }

      xRows.push(row);
      yRows.push(values[i]);
    }

    return this.solveLeastSquares(xRows, yRows);
  },

  polynomialRegression(xValues, yValues, degree) {
    const xRows = xValues.map((x) => {
      const row = [];

      for (let power = 0; power <= degree; power += 1) {
        row.push(x ** power);
      }

      return row;
    });

    return this.solveLeastSquares(xRows, yValues);
  },

  solveLeastSquares(xRows, yRows) {
    const xt = this.transpose(xRows);
    const xtx = this.multiplyMatrices(xt, xRows);
    const xty = this.multiplyMatrixVector(xt, yRows);

    return this.solveLinearSystem(xtx, xty);
  },

  solveLinearSystem(matrix, vector) {
    const n = matrix.length;
    const augmented = matrix.map((row, index) => {
      return [...row, vector[index]];
    });

    for (let i = 0; i < n; i += 1) {
      let maxRow = i;

      for (let k = i + 1; k < n; k += 1) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }

      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      const pivot = augmented[i][i] || 1e-12;

      for (let j = i; j <= n; j += 1) {
        augmented[i][j] /= pivot;
      }

      for (let k = 0; k < n; k += 1) {
        if (k === i) {
          continue;
        }

        const factor = augmented[k][i];

        for (let j = i; j <= n; j += 1) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }

    return augmented.map((row) => row[n]);
  },

  transpose(matrix) {
    return matrix[0].map((_, columnIndex) => {
      return matrix.map((row) => row[columnIndex]);
    });
  },

  multiplyMatrices(a, b) {
    return a.map((row) => {
      return b[0].map((_, columnIndex) => {
        return row.reduce((sum, value, rowIndex) => {
          return sum + value * b[rowIndex][columnIndex];
        }, 0);
      });
    });
  },

  multiplyMatrixVector(matrix, vector) {
    return matrix.map((row) => {
      return row.reduce((sum, value, index) => {
        return sum + value * vector[index];
      }, 0);
    });
  },

  evaluatePolynomial(coefficients, x) {
    return coefficients.reduce((sum, coefficient, power) => {
      return sum + coefficient * x ** power;
    }, 0);
  },

  difference(values, order) {
    let result = [...values];

    for (let d = 0; d < order; d += 1) {
      result = result.slice(1).map((value, index) => {
        return value - result[index];
      });
    }

    return result;
  },

  inverseDifference(originalValues, forecastValues, order) {
    if (order === 0) {
      return forecastValues;
    }

    const restored = [];
    let lastValue = originalValues[originalValues.length - 1];

    if (order === 1) {
      forecastValues.forEach((diffValue) => {
        lastValue += diffValue;
        restored.push(lastValue);
      });

      return restored;
    }

    const firstDiff = this.difference(originalValues, 1);
    let lastFirstDiff = firstDiff[firstDiff.length - 1];

    forecastValues.forEach((secondDiffValue) => {
      lastFirstDiff += secondDiffValue;
      lastValue += lastFirstDiff;
      restored.push(lastValue);
    });

    return restored;
  },

  attachFutureIndex(sourceSeries, forecastValues) {
    const lastX = sourceSeries[sourceSeries.length - 1].x;

    return forecastValues.map((value, index) => {
      return {
        x: this.makeFutureLabel(lastX, index + 1),
        y: value,
      };
    });
  },

  makeFutureLabel(lastX, step) {
    const date = new Date(lastX);

    if (!Number.isNaN(date.getTime())) {
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + step);

      return nextDate.toISOString().slice(0, 10);
    }

    return `t+${step}`;
  },

  getValues(series) {
    return series
      .map((point) => Number(point.y))
      .filter((value) => Number.isFinite(value));
  },

  mean(values) {
    if (!values || values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  },

  clamp(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(max, Math.max(min, value));
  },

  closeModal(modal) {
    if (!modal) {
      return;
    }

    modal.classList.add('hidden');
  },

  getForecastResult() {
    return this.result;
  },
};

window.TSNForecasting = TSNForecasting;

document.addEventListener('DOMContentLoaded', () => {
  TSNForecasting.init();
});