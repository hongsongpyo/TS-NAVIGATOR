// TS Navigator/js/preprocessing.js

const TSNPreprocessing = {
  elements: {},

  result: {
    data: [],
    report: null,
  },

  init() {
    this.cacheElements();
    this.bindEvents();
    this.loadConfigToInputs();
  },

  cacheElements() {
    this.elements.runPreprocessingButton = document.getElementById('runPreprocessingButton');

    this.elements.missingEnabledSelect = document.getElementById('missingEnabledSelect');
    this.elements.missingMethodSelect = document.getElementById('missingMethodSelect');
    this.elements.saveMissingConfigButton = document.getElementById('saveMissingConfigButton');

    this.elements.outlierEnabledSelect = document.getElementById('outlierEnabledSelect');
    this.elements.outlierMethodSelect = document.getElementById('outlierMethodSelect');
    this.elements.outlierReplaceSelect = document.getElementById('outlierReplaceSelect');
    this.elements.saveOutlierConfigButton = document.getElementById('saveOutlierConfigButton');

    this.elements.resamplingEnabledSelect = document.getElementById('resamplingEnabledSelect');
    this.elements.resamplingFrequencySelect = document.getElementById('resamplingFrequencySelect');
    this.elements.resamplingMethodSelect = document.getElementById('resamplingMethodSelect');
    this.elements.saveResamplingConfigButton = document.getElementById('saveResamplingConfigButton');

    this.elements.denoisingEnabledSelect = document.getElementById('denoisingEnabledSelect');
    this.elements.denoisingMethodSelect = document.getElementById('denoisingMethodSelect');
    this.elements.denoisingWindowInput = document.getElementById('denoisingWindowInput');
    this.elements.saveDenoisingConfigButton = document.getElementById('saveDenoisingConfigButton');
  },

  bindEvents() {
    if (this.elements.runPreprocessingButton) {
      this.elements.runPreprocessingButton.addEventListener('click', () => {
        this.run();
      });
    }

    if (this.elements.saveMissingConfigButton) {
      this.elements.saveMissingConfigButton.addEventListener('click', () => {
        this.saveMissingConfig();
      });
    }

    if (this.elements.saveOutlierConfigButton) {
      this.elements.saveOutlierConfigButton.addEventListener('click', () => {
        this.saveOutlierConfig();
      });
    }

    if (this.elements.saveResamplingConfigButton) {
      this.elements.saveResamplingConfigButton.addEventListener('click', () => {
        this.saveResamplingConfig();
      });
    }

    if (this.elements.saveDenoisingConfigButton) {
      this.elements.saveDenoisingConfigButton.addEventListener('click', () => {
        this.saveDenoisingConfig();
      });
    }

    document.addEventListener('click', (event) => {
      const modalTarget = event.target.dataset.modalTarget;

      if (modalTarget) {
        this.openModal(modalTarget);
      }

      if (event.target.hasAttribute('data-modal-close')) {
        this.closeModal(event.target.closest('.modal'));
      }

      if (event.target.classList.contains('modal')) {
        this.closeModal(event.target);
      }
    });

    document.addEventListener('click', (event) => {
      const accordionButton = event.target.closest('.accordion-button');

      if (!accordionButton) {
        return;
      }

      const targetId = accordionButton.dataset.accordion;
      const targetContent = document.getElementById(targetId);

      accordionButton.classList.toggle('active');

      if (targetContent) {
        targetContent.classList.toggle('active');
      }
    });
  },

  loadConfigToInputs() {
    const config = window.TSNApp.state.preprocessingConfig;

    if (!config) {
      return;
    }

    if (this.elements.missingEnabledSelect) {
      this.elements.missingEnabledSelect.value = String(config.missing.enabled);
      this.elements.missingMethodSelect.value = config.missing.method;
    }

    if (this.elements.outlierEnabledSelect) {
      this.elements.outlierEnabledSelect.value = String(config.outlier.enabled);
      this.elements.outlierMethodSelect.value = config.outlier.method;
      this.elements.outlierReplaceSelect.value = config.outlier.replaceMethod;
    }

    if (this.elements.resamplingEnabledSelect) {
      this.elements.resamplingEnabledSelect.value = String(config.resampling.enabled);
      this.elements.resamplingFrequencySelect.value = config.resampling.frequency;
      this.elements.resamplingMethodSelect.value = config.resampling.method;
    }

    if (this.elements.denoisingEnabledSelect) {
      this.elements.denoisingEnabledSelect.value = String(config.denoising.enabled);
      this.elements.denoisingMethodSelect.value = config.denoising.method;
      this.elements.denoisingWindowInput.value = config.denoising.window;
    }
  },

  saveMissingConfig() {
    window.TSNApp.updatePreprocessingConfig('missing', {
      enabled: this.elements.missingEnabledSelect.value === 'true',
      method: this.elements.missingMethodSelect.value,
    });

    this.closeModal(document.getElementById('missingModal'));
  },

  saveOutlierConfig() {
    window.TSNApp.updatePreprocessingConfig('outlier', {
      enabled: this.elements.outlierEnabledSelect.value === 'true',
      method: this.elements.outlierMethodSelect.value,
      replaceMethod: this.elements.outlierReplaceSelect.value,
    });

    this.closeModal(document.getElementById('outlierModal'));
  },

  saveResamplingConfig() {
    window.TSNApp.updatePreprocessingConfig('resampling', {
      enabled: this.elements.resamplingEnabledSelect.value === 'true',
      frequency: this.elements.resamplingFrequencySelect.value,
      method: this.elements.resamplingMethodSelect.value,
    });

    this.closeModal(document.getElementById('resamplingModal'));
  },

  saveDenoisingConfig() {
    window.TSNApp.updatePreprocessingConfig('denoising', {
      enabled: this.elements.denoisingEnabledSelect.value === 'true',
      method: this.elements.denoisingMethodSelect.value,
      window: Number(this.elements.denoisingWindowInput.value),
    });

    this.closeModal(document.getElementById('denoisingModal'));
  },

  run() {
    const state = window.TSNApp.state;
    const rows = state.parsedData;
    const { dateColumn, valueColumn } = state.selectedColumns;
    const config = state.preprocessingConfig;

    if (!rows || rows.length === 0) {
      alert('전처리할 데이터가 없습니다.');
      return;
    }

    if (!dateColumn || !valueColumn) {
      alert('날짜/시간 컬럼과 값 컬럼을 먼저 선택해주세요.');
      return;
    }

    let series = this.makeSeries(rows, dateColumn, valueColumn);

    const report = {
      originalCount: series.length,
      missingCount: this.countMissing(series),
      outlierCount: 0,
      resampledCount: null,
      denoisingWindow: null,
      steps: [],
    };

    if (config.missing.enabled) {
      series = this.handleMissing(series, config.missing.method);
      report.steps.push(`결측값 처리: ${config.missing.method}`);
    }

    if (config.outlier.enabled) {
      const outlierResult = this.handleOutliers(
        series,
        config.outlier.method,
        config.outlier.replaceMethod
      );

      series = outlierResult.series;
      report.outlierCount = outlierResult.outlierCount;
      report.steps.push(
        `이상치 처리: ${config.outlier.method}, 대체: ${config.outlier.replaceMethod}`
      );
    }

    if (config.resampling.enabled) {
      series = this.resampleSeries(
        series,
        config.resampling.frequency,
        config.resampling.method
      );

      report.resampledCount = series.length;
      report.steps.push(
        `리샘플링: ${config.resampling.frequency}, 집계: ${config.resampling.method}`
      );
    }

    if (config.denoising.enabled) {
      series = this.denoiseSeries(series, config.denoising.window);
      report.denoisingWindow = config.denoising.window;
      report.steps.push(`디노이징: 이동평균 window ${config.denoising.window}`);
    }

    this.result = {
      data: series,
      report,
    };

    localStorage.setItem('tsn_preprocessing_report', JSON.stringify(report));

    window.dispatchEvent(
      new CustomEvent('tsn:preprocessed', {
        detail: {
          data: series,
          report,
        },
      })
    );

    alert('전처리가 완료되었습니다.');
  },

  makeSeries(rows, dateColumn, valueColumn) {
    return rows.map((row, index) => {
      return {
        x: row[dateColumn] ?? index + 1,
        y: this.toNumberOrNull(row[valueColumn]),
      };
    });
  },

  toNumberOrNull(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return null;
    }

    return number;
  },

  countMissing(series) {
    return series.filter((point) => point.y === null).length;
  },

  handleMissing(series, method) {
    if (method === 'linear') {
      return this.linearInterpolate(series);
    }

    if (method === 'ffill') {
      return this.forwardFill(series);
    }

    if (method === 'bfill') {
      return this.backwardFill(series);
    }

    if (method === 'mean') {
      return this.fillWithMean(series);
    }

    if (method === 'zero') {
      return series.map((point) => {
        return {
          ...point,
          y: point.y === null ? 0 : point.y,
        };
      });
    }

    return series;
  },

  linearInterpolate(series) {
    const result = series.map((point) => ({ ...point }));

    for (let i = 0; i < result.length; i += 1) {
      if (result[i].y !== null) {
        continue;
      }

      let previousIndex = i - 1;
      let nextIndex = i + 1;

      while (previousIndex >= 0 && result[previousIndex].y === null) {
        previousIndex -= 1;
      }

      while (nextIndex < result.length && result[nextIndex].y === null) {
        nextIndex += 1;
      }

      if (previousIndex >= 0 && nextIndex < result.length) {
        const previousValue = result[previousIndex].y;
        const nextValue = result[nextIndex].y;
        const ratio = (i - previousIndex) / (nextIndex - previousIndex);

        result[i].y = previousValue + (nextValue - previousValue) * ratio;
      } else if (previousIndex >= 0) {
        result[i].y = result[previousIndex].y;
      } else if (nextIndex < result.length) {
        result[i].y = result[nextIndex].y;
      } else {
        result[i].y = 0;
      }
    }

    return result;
  },

  forwardFill(series) {
    let lastValue = null;

    return series.map((point) => {
      if (point.y !== null) {
        lastValue = point.y;
        return { ...point };
      }

      return {
        ...point,
        y: lastValue === null ? 0 : lastValue,
      };
    });
  },

  backwardFill(series) {
    let nextValue = null;
    const result = [];

    for (let i = series.length - 1; i >= 0; i -= 1) {
      const point = series[i];

      if (point.y !== null) {
        nextValue = point.y;
        result.unshift({ ...point });
        continue;
      }

      result.unshift({
        ...point,
        y: nextValue === null ? 0 : nextValue,
      });
    }

    return result;
  },

  fillWithMean(series) {
    const validValues = series
      .map((point) => point.y)
      .filter((value) => value !== null);

    const mean = this.mean(validValues);

    return series.map((point) => {
      return {
        ...point,
        y: point.y === null ? mean : point.y,
      };
    });
  },

  handleOutliers(series, method, replaceMethod) {
    const values = series
      .map((point) => point.y)
      .filter((value) => value !== null);

    if (values.length < 4) {
      return {
        series,
        outlierCount: 0,
      };
    }

    let lowerBound = null;
    let upperBound = null;

    if (method === 'iqr') {
      const q1 = this.quantile(values, 0.25);
      const q3 = this.quantile(values, 0.75);
      const iqr = q3 - q1;

      lowerBound = q1 - 1.5 * iqr;
      upperBound = q3 + 1.5 * iqr;
    }

    if (method === 'zscore') {
      const mean = this.mean(values);
      const std = this.standardDeviation(values);

      lowerBound = mean - 3 * std;
      upperBound = mean + 3 * std;
    }

    const markedSeries = series.map((point) => {
      const isOutlier =
        point.y !== null &&
        (point.y < lowerBound || point.y > upperBound);

      return {
        ...point,
        y: isOutlier ? null : point.y,
        isOutlier,
      };
    });

    const outlierCount = markedSeries.filter((point) => point.isOutlier).length;

    let replacedSeries = markedSeries;

    if (replaceMethod === 'linear') {
      replacedSeries = this.linearInterpolate(markedSeries);
    }

    if (replaceMethod === 'mean') {
      replacedSeries = this.fillWithMean(markedSeries);
    }

    if (replaceMethod === 'median') {
      replacedSeries = this.fillWithMedian(markedSeries);
    }

    return {
      series: replacedSeries.map((point) => {
        return {
          x: point.x,
          y: point.y,
        };
      }),
      outlierCount,
    };
  },

  fillWithMedian(series) {
    const validValues = series
      .map((point) => point.y)
      .filter((value) => value !== null);

    const median = this.quantile(validValues, 0.5);

    return series.map((point) => {
      return {
        ...point,
        y: point.y === null ? median : point.y,
      };
    });
  },

  resampleSeries(series, frequency, method) {
    const groups = {};

    series.forEach((point) => {
      const date = new Date(point.x);

      if (Number.isNaN(date.getTime())) {
        return;
      }

      const key = this.getResampleKey(date, frequency);

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(point.y);
    });

    return Object.keys(groups)
      .sort()
      .map((key) => {
        const values = groups[key].filter((value) => value !== null);

        return {
          x: key,
          y: this.aggregate(values, method),
        };
      });
  },

  getResampleKey(date, frequency) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (frequency === 'D') {
      return `${year}-${month}-${day}`;
    }

    if (frequency === 'W') {
      const firstDay = new Date(date.getFullYear(), 0, 1);
      const pastDays = Math.floor((date - firstDay) / 86400000);
      const week = String(Math.ceil((pastDays + firstDay.getDay() + 1) / 7)).padStart(2, '0');

      return `${year}-W${week}`;
    }

    if (frequency === 'M') {
      return `${year}-${month}`;
    }

    return `${year}-${month}-${day}`;
  },

  aggregate(values, method) {
    if (values.length === 0) {
      return null;
    }

    if (method === 'sum') {
      return values.reduce((sum, value) => sum + value, 0);
    }

    if (method === 'median') {
      return this.quantile(values, 0.5);
    }

    return this.mean(values);
  },

  denoiseSeries(series, windowSize) {
    const safeWindow = Math.max(2, Number(windowSize) || 3);

    return series.map((point, index) => {
      const start = Math.max(0, index - safeWindow + 1);
      const windowValues = series
        .slice(start, index + 1)
        .map((item) => item.y)
        .filter((value) => value !== null);

      return {
        x: point.x,
        y: this.mean(windowValues),
      };
    });
  },

  mean(values) {
    if (!values || values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  },

  standardDeviation(values) {
    if (!values || values.length === 0) {
      return 0;
    }

    const mean = this.mean(values);
    const variance = this.mean(
      values.map((value) => {
        return (value - mean) ** 2;
      })
    );

    return Math.sqrt(variance);
  },

  quantile(values, q) {
    if (!values || values.length === 0) {
      return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;

    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }

    return sorted[base];
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);

    if (!modal) {
      return;
    }

    modal.classList.remove('hidden');
  },

  closeModal(modal) {
    if (!modal) {
      return;
    }

    modal.classList.add('hidden');
  },

  getPreprocessedData() {
    return this.result.data;
  },

  getPreprocessingReport() {
    return this.result.report;
  },
};

window.TSNPreprocessing = TSNPreprocessing;

document.addEventListener('DOMContentLoaded', () => {
  TSNPreprocessing.init();
});