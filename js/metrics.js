// TS Navigator/js/metrics.js

const TSNMetrics = {
  elements: {},

  result: {
    mae: null,
    mse: null,
    rmse: null,
    mape: null,
    count: 0,
    note: '',
  },

  init() {
    this.cacheElements();
    this.bindEvents();
    this.loadSavedMetrics();
  },

  cacheElements() {
    this.elements.runMetricsButton = document.getElementById('runMetricsButton');
    this.elements.copyReportButton = document.getElementById('copyReportButton');

    this.elements.maeValue = document.getElementById('maeValue');
    this.elements.mseValue = document.getElementById('mseValue');
    this.elements.rmseValue = document.getElementById('rmseValue');
    this.elements.mapeValue = document.getElementById('mapeValue');
    this.elements.analysisNote = document.getElementById('analysisNote');
  },

  bindEvents() {
    if (this.elements.runMetricsButton) {
      this.elements.runMetricsButton.addEventListener('click', () => {
        this.run();
      });
    }

    if (this.elements.copyReportButton) {
      this.elements.copyReportButton.addEventListener('click', () => {
        this.copyReport();
      });
    }

    window.addEventListener('tsn:forecast', () => {
      this.run(false);
    });
  },

  loadSavedMetrics() {
    const savedMetrics = localStorage.getItem('tsn_metrics_result');

    if (!savedMetrics) {
      return;
    }

    try {
      this.result = JSON.parse(savedMetrics);
      this.render();
    } catch (error) {
      console.warn('저장된 평가지표를 불러오지 못했습니다.', error);
    }
  },

  run(showAlert = true) {
    const actual = this.getStoredSeries('tsn_test_data');
    const predicted = this.getStoredSeries('tsn_test_forecast_data');

    if (!actual.length || !predicted.length) {
      if (showAlert) {
        alert('먼저 예측을 실행해야 평가지표를 계산할 수 있습니다.');
      }

      return;
    }

    const pairs = this.makeValidPairs(actual, predicted);

    if (pairs.length === 0) {
      if (showAlert) {
        alert('실제값과 예측값을 비교할 수 없습니다.');
      }

      return;
    }

    const errors = pairs.map((pair) => {
      return pair.actual - pair.predicted;
    });

    const absoluteErrors = errors.map((error) => {
      return Math.abs(error);
    });

    const squaredErrors = errors.map((error) => {
      return error ** 2;
    });

    const percentageErrors = pairs
      .filter((pair) => pair.actual !== 0)
      .map((pair) => {
        return Math.abs((pair.actual - pair.predicted) / pair.actual) * 100;
      });

    const mae = this.mean(absoluteErrors);
    const mse = this.mean(squaredErrors);
    const rmse = Math.sqrt(mse);
    const mape = percentageErrors.length > 0
      ? this.mean(percentageErrors)
      : null;

    this.result = {
      mae,
      mse,
      rmse,
      mape,
      count: pairs.length,
      note: this.makeAnalysisNote({
        mae,
        mse,
        rmse,
        mape,
        count: pairs.length,
        zeroActualCount: pairs.length - percentageErrors.length,
      }),
    };

    localStorage.setItem('tsn_metrics_result', JSON.stringify(this.result));

    this.render();

    if (showAlert) {
      alert('평가지표 계산이 완료되었습니다.');
    }
  },

  getStoredSeries(key) {
    const saved = localStorage.getItem(key);

    if (!saved) {
      return [];
    }

    try {
      const parsed = JSON.parse(saved);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed;
    } catch (error) {
      console.warn(`${key} 데이터를 불러오지 못했습니다.`, error);
      return [];
    }
  },

  makeValidPairs(actualSeries, predictedSeries) {
    const length = Math.min(actualSeries.length, predictedSeries.length);
    const pairs = [];

    for (let i = 0; i < length; i += 1) {
      const actual = Number(actualSeries[i].y);
      const predicted = Number(predictedSeries[i].y);

      if (!Number.isFinite(actual) || !Number.isFinite(predicted)) {
        continue;
      }

      pairs.push({
        x: actualSeries[i].x,
        actual,
        predicted,
      });
    }

    return pairs;
  },

  makeAnalysisNote({ mae, rmse, mape, count, zeroActualCount }) {
    const lines = [];

    lines.push(`${count}개의 검증 구간을 기준으로 예측 성능을 계산했습니다.`);

    if (mape === null) {
      lines.push(
        '실제값이 0인 구간이 많아 MAPE는 안정적으로 계산되지 않았습니다.'
      );
    } else if (mape < 10) {
      lines.push(
        `MAPE가 ${this.format(mape)}%로 낮아, 실제값 대비 예측 오차가 작은 편입니다.`
      );
    } else if (mape < 20) {
      lines.push(
        `MAPE가 ${this.format(mape)}%로 보통 수준이며, 추세는 어느 정도 따라가지만 일부 구간의 오차를 확인해야 합니다.`
      );
    } else {
      lines.push(
        `MAPE가 ${this.format(mape)}%로 큰 편이므로, 전처리 방식이나 예측 모델을 다시 조정하는 것이 좋습니다.`
      );
    }

    lines.push(
      `RMSE는 ${this.format(rmse)}이며, 큰 오차에 더 민감하게 반응하므로 급격한 변동 구간의 예측 실패 여부를 확인하는 데 활용할 수 있습니다.`
    );

    if (zeroActualCount > 0) {
      lines.push(
        `실제값이 0인 ${zeroActualCount}개 구간은 MAPE 계산에서 제외했습니다.`
      );
    }

    return lines.join(' ');
  },

  render() {
    if (this.elements.maeValue) {
      this.elements.maeValue.textContent = this.format(this.result.mae);
    }

    if (this.elements.mseValue) {
      this.elements.mseValue.textContent = this.format(this.result.mse);
    }

    if (this.elements.rmseValue) {
      this.elements.rmseValue.textContent = this.format(this.result.rmse);
    }

    if (this.elements.mapeValue) {
      this.elements.mapeValue.textContent =
        this.result.mape === null
          ? '-'
          : `${this.format(this.result.mape)}%`;
    }

    if (this.elements.analysisNote) {
      this.elements.analysisNote.textContent = this.result.note;
    }
  },

  copyReport() {
    const report = this.makeCopyText();

    if (!report) {
      alert('복사할 분석 결과가 없습니다.');
      return;
    }

    navigator.clipboard
      .writeText(report)
      .then(() => {
        alert('분석 결과가 복사되었습니다.');
      })
      .catch(() => {
        alert('복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
      });
  },

  makeCopyText() {
    const fileName = window.TSNApp?.state?.rawFileName || '-';
    const selectedColumns = window.TSNApp?.state?.selectedColumns || {};
    const forecastingConfig = window.TSNApp?.state?.forecastingConfig || {};
    const preprocessingReport = this.getJson('tsn_preprocessing_report');
    const forecastReport = this.getJson('tsn_forecast_report');

    if (!this.result || this.result.count === 0) {
      return '';
    }

    const preprocessingSteps =
      preprocessingReport && preprocessingReport.steps
        ? preprocessingReport.steps.join(', ')
        : '전처리 미실행 또는 기록 없음';

    return [
      '[TS Navigator 분석 결과]',
      '',
      `파일명: ${fileName}`,
      `날짜/시간 컬럼: ${selectedColumns.dateColumn || '-'}`,
      `값 컬럼: ${selectedColumns.valueColumn || '-'}`,
      '',
      '[전처리]',
      `적용 단계: ${preprocessingSteps}`,
      '',
      '[예측 설정]',
      `모델: ${forecastReport?.model || forecastingConfig.model || '-'}`,
      `예측 시평: ${forecastReport?.horizon || forecastingConfig.horizon || '-'}`,
      `학습 데이터 수: ${forecastReport?.trainCount || '-'}`,
      `검증 데이터 수: ${forecastReport?.testCount || '-'}`,
      '',
      '[평가지표]',
      `MAE: ${this.format(this.result.mae)}`,
      `MSE: ${this.format(this.result.mse)}`,
      `RMSE: ${this.format(this.result.rmse)}`,
      `MAPE: ${
        this.result.mape === null
          ? '-'
          : `${this.format(this.result.mape)}%`
      }`,
      '',
      '[해석]',
      this.result.note,
    ].join('\n');
  },

  getJson(key) {
    const saved = localStorage.getItem(key);

    if (!saved) {
      return null;
    }

    try {
      return JSON.parse(saved);
    } catch (error) {
      return null;
    }
  },

  mean(values) {
    if (!values || values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  },

  format(value, digits = 4) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '-';
    }

    return number.toFixed(digits);
  },

  getMetricsResult() {
    return this.result;
  },
};

window.TSNMetrics = TSNMetrics;

document.addEventListener('DOMContentLoaded', () => {
  TSNMetrics.init();
});