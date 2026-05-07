// TS Navigator/js/app.js

const TSN_STORAGE_KEYS = {
  rawFileName: 'tsn_raw_file_name',
  rawCsvText: 'tsn_raw_csv_text',
  parsedData: 'tsn_parsed_data',
  selectedColumns: 'tsn_selected_columns',
  preprocessingConfig: 'tsn_preprocessing_config',
  forecastingConfig: 'tsn_forecasting_config',
  chartRegions: 'tsn_chart_regions',
};

const TSN_DEFAULT_STATE = {
  rawFileName: null,
  rawCsvText: null,
  parsedData: [],
  selectedColumns: {
    dateColumn: null,
    valueColumn: null,
  },
  preprocessingConfig: {
    missing: {
      enabled: true,
      method: 'linear',
    },
    outlier: {
      enabled: true,
      method: 'iqr',
      replaceMethod: 'linear',
    },
    resampling: {
      enabled: false,
      frequency: 'D',
      method: 'mean',
    },
    denoising: {
      enabled: false,
      method: 'movingAverage',
      window: 3,
    },
  },
  forecastingConfig: {
    testRatio: 0.2,
    horizon: 12,
    model: 'naive',
    modelParams: {
      naive: {
        strategy: 'last',
        windowLength: 12,
      },
      movingAverage: {
        window: 5,
      },
      exponentialSmoothing: {
        alpha: 0.3,
        beta: 0.05,
        gamma: 0.05,
        trend: 'additive',
        seasonal: 'additive',
        seasonalPeriod: 12,
      },
      polynomialTrend: {
        degree: 1,
      },
      arima: {
        p: 1,
        d: 1,
        q: 1,
      },
    },
  },
  chartRegions: [
    {
      id: 'region-1',
      title: 'Main Chart',
      series: ['original'],
    },
  ],
};

const TSNApp = {
  state: structuredClone(TSN_DEFAULT_STATE),

  init() {
    this.loadState();
    this.bindGlobalEvents();
  },

  loadState() {
    const loadedState = structuredClone(TSN_DEFAULT_STATE);

    loadedState.rawFileName = this.getStorage(TSN_STORAGE_KEYS.rawFileName, null);
    loadedState.rawCsvText = this.getStorage(TSN_STORAGE_KEYS.rawCsvText, null);
    loadedState.parsedData = this.getStorage(TSN_STORAGE_KEYS.parsedData, []);
    loadedState.selectedColumns = this.getStorage(
      TSN_STORAGE_KEYS.selectedColumns,
      TSN_DEFAULT_STATE.selectedColumns
    );
    loadedState.preprocessingConfig = this.getStorage(
      TSN_STORAGE_KEYS.preprocessingConfig,
      TSN_DEFAULT_STATE.preprocessingConfig
    );
    loadedState.forecastingConfig = this.getStorage(
      TSN_STORAGE_KEYS.forecastingConfig,
      TSN_DEFAULT_STATE.forecastingConfig
    );
    loadedState.chartRegions = this.getStorage(
      TSN_STORAGE_KEYS.chartRegions,
      TSN_DEFAULT_STATE.chartRegions
    );

    this.state = loadedState;
  },

  saveState() {
    this.setStorage(TSN_STORAGE_KEYS.rawFileName, this.state.rawFileName);
    this.setStorage(TSN_STORAGE_KEYS.rawCsvText, this.state.rawCsvText);
    this.setStorage(TSN_STORAGE_KEYS.parsedData, this.state.parsedData);
    this.setStorage(TSN_STORAGE_KEYS.selectedColumns, this.state.selectedColumns);
    this.setStorage(
      TSN_STORAGE_KEYS.preprocessingConfig,
      this.state.preprocessingConfig
    );
    this.setStorage(
      TSN_STORAGE_KEYS.forecastingConfig,
      this.state.forecastingConfig
    );
    this.setStorage(TSN_STORAGE_KEYS.chartRegions, this.state.chartRegions);
  },

  resetState() {
    this.state = structuredClone(TSN_DEFAULT_STATE);

    Object.values(TSN_STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
  },

  getStorage(key, fallback) {
    const savedValue = localStorage.getItem(key);

    if (savedValue === null || savedValue === undefined) {
      return structuredClone(fallback);
    }

    try {
      return JSON.parse(savedValue);
    } catch (error) {
      console.warn(`${key} 값을 불러오지 못했습니다.`, error);
      return structuredClone(fallback);
    }
  },

  setStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  updateState(partialState) {
    this.state = {
      ...this.state,
      ...partialState,
    };

    this.saveState();
  },

  updateNestedState(section, partialState) {
    if (!this.state[section]) {
      return;
    }

    this.state[section] = {
      ...this.state[section],
      ...partialState,
    };

    this.saveState();
  },

  updatePreprocessingConfig(type, partialConfig) {
    if (!this.state.preprocessingConfig[type]) {
      return;
    }

    this.state.preprocessingConfig[type] = {
      ...this.state.preprocessingConfig[type],
      ...partialConfig,
    };

    this.saveState();
  },

  updateForecastingConfig(partialConfig) {
    this.state.forecastingConfig = {
      ...this.state.forecastingConfig,
      ...partialConfig,
    };

    this.saveState();
  },

  updateModelParams(modelName, partialParams) {
    if (!this.state.forecastingConfig.modelParams[modelName]) {
      return;
    }

    this.state.forecastingConfig.modelParams[modelName] = {
      ...this.state.forecastingConfig.modelParams[modelName],
      ...partialParams,
    };

    this.saveState();
  },

  setUploadedData({ fileName, csvText, parsedData }) {
    this.state.rawFileName = fileName;
    this.state.rawCsvText = csvText;
    this.state.parsedData = parsedData;

    this.state.selectedColumns = this.detectDefaultColumns(parsedData);

    this.saveState();
  },

  detectDefaultColumns(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        dateColumn: null,
        valueColumn: null,
      };
    }

    const columns = Object.keys(data[0]);

    const dateColumn =
      columns.find((column) => {
        const lower = column.toLowerCase();

        return (
          lower.includes('date') ||
          lower.includes('time') ||
          lower.includes('period') ||
          lower.includes('datetime')
        );
      }) || columns[0];

    const valueColumn =
      columns.find((column) => {
        if (column === dateColumn) {
          return false;
        }

        return data.some((row) => {
          const value = Number(row[column]);
          return Number.isFinite(value);
        });
      }) || columns.find((column) => column !== dateColumn) || null;

    return {
      dateColumn,
      valueColumn,
    };
  },

  hasUploadedData() {
    return (
      Boolean(this.state.rawCsvText) &&
      Array.isArray(this.state.parsedData) &&
      this.state.parsedData.length > 0
    );
  },

  moveToWorkspace() {
    window.location.href = './workspace.html';
  },

  moveToHome() {
    window.location.href = './index.html';
  },

  requireUploadedData() {
    const currentPage = window.location.pathname.split('/').pop();

    if (currentPage === 'workspace.html' && !this.hasUploadedData()) {
      alert('먼저 CSV 파일을 업로드해주세요.');
      this.moveToHome();
    }
  },

  formatNumber(value, digits = 4) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '-';
    }

    return number.toFixed(digits);
  },

  downloadTextFile(fileName, content, mimeType = 'text/plain') {
    const blob = new Blob([content], {
      type: mimeType,
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  },

  exportStateAsJson() {
    const fileName = 'ts-navigator-state.json';
    const content = JSON.stringify(this.state, null, 2);

    this.downloadTextFile(fileName, content, 'application/json');
  },

  bindGlobalEvents() {
    document.addEventListener('DOMContentLoaded', () => {
      this.requireUploadedData();
    });
  },
};

window.TSNApp = TSNApp;

TSNApp.init();