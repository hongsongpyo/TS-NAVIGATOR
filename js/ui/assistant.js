// TS Navigator/js/assistant.js

const TSNAssistant = {
  elements: {},

  init() {
    this.cacheElements();
    this.bindEvents();
    this.renderInitialGuide();
  },

  cacheElements() {
    this.elements.assistantButton = document.getElementById('assistantButton');
    this.elements.assistantPopup = document.getElementById('assistantPopup');
    this.elements.closeAssistantButton = document.getElementById('closeAssistantButton');
    this.elements.assistantBody = document.getElementById('assistantBody');
    this.elements.assistantInput = document.getElementById('assistantInput');
    this.elements.assistantAskButton = document.getElementById('assistantAskButton');
  },

  bindEvents() {
    if (this.elements.assistantButton) {
      this.elements.assistantButton.addEventListener('click', () => {
        this.togglePopup();
      });
    }

    if (this.elements.closeAssistantButton) {
      this.elements.closeAssistantButton.addEventListener('click', () => {
        this.closePopup();
      });
    }

    if (this.elements.assistantAskButton) {
      this.elements.assistantAskButton.addEventListener('click', () => {
        this.answerQuestion();
      });
    }

    if (this.elements.assistantInput) {
      this.elements.assistantInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          this.answerQuestion();
        }
      });
    }

    window.addEventListener('tsn:preprocessed', () => {
      this.renderInitialGuide();
    });

    window.addEventListener('tsn:forecast', () => {
      this.renderInitialGuide();
    });
  },

  togglePopup() {
    if (!this.elements.assistantPopup) {
      return;
    }

    this.elements.assistantPopup.classList.toggle('hidden');

    if (!this.elements.assistantPopup.classList.contains('hidden')) {
      this.renderInitialGuide();
    }
  },

  closePopup() {
    if (!this.elements.assistantPopup) {
      return;
    }

    this.elements.assistantPopup.classList.add('hidden');
  },

  renderInitialGuide() {
    if (!this.elements.assistantBody) {
      return;
    }

    const context = this.getAnalysisContext();
    const guide = this.makeGuide(context);

    this.elements.assistantBody.innerHTML = guide;
  },

  answerQuestion() {
    const question = this.elements.assistantInput.value.trim();

    if (!question) {
      alert('질문을 입력해주세요.');
      return;
    }

    const context = this.getAnalysisContext();
    const answer = this.makeAnswer(question, context);

    this.appendMessage('user', question);
    this.appendMessage('assistant', answer);

    this.elements.assistantInput.value = '';
  },

  appendMessage(role, content) {
    const message = document.createElement('div');

    message.className = `assistant-message ${role}`;

    const title = role === 'user' ? '질문' : 'AI Assistant';

    message.innerHTML = `
      <strong>${title}</strong>
      <p>${this.escapeHtml(content).replace(/\n/g, '<br>')}</p>
    `;

    this.elements.assistantBody.appendChild(message);
    this.elements.assistantBody.scrollTop = this.elements.assistantBody.scrollHeight;
  },

  getAnalysisContext() {
    const state = window.TSNApp?.state || {};

    const originalSeries = window.TSNCharts?.chartData?.original || [];
    const preprocessedSeries = window.TSNCharts?.chartData?.preprocessed || [];
    const forecastSeries = window.TSNCharts?.chartData?.forecast || [];

    const preprocessingReport = this.getJson('tsn_preprocessing_report');
    const forecastReport = this.getJson('tsn_forecast_report');
    const metricsResult = this.getJson('tsn_metrics_result');

    const sourceSeries =
      preprocessedSeries.length > 0
        ? preprocessedSeries
        : originalSeries;

    return {
      fileName: state.rawFileName || '-',
      selectedColumns: state.selectedColumns || {},
      preprocessingConfig: state.preprocessingConfig || {},
      forecastingConfig: state.forecastingConfig || {},
      originalSeries,
      preprocessedSeries,
      forecastSeries,
      sourceSeries,
      preprocessingReport,
      forecastReport,
      metricsResult,
      profile: this.profileSeries(sourceSeries),
    };
  },

  profileSeries(series) {
    const values = series
      .map((point) => Number(point.y))
      .filter((value) => Number.isFinite(value));

    if (values.length === 0) {
      return {
        count: 0,
        missingRatio: 0,
        mean: null,
        min: null,
        max: null,
        std: null,
        trend: 'unknown',
        volatility: 'unknown',
        hasNegative: false,
        hasZero: false,
      };
    }

    const mean = this.mean(values);
    const std = this.standardDeviation(values);
    const min = Math.min(...values);
    const max = Math.max(...values);

    const firstMean = this.mean(values.slice(0, Math.max(1, Math.floor(values.length * 0.3))));
    const lastMean = this.mean(values.slice(Math.max(0, Math.floor(values.length * 0.7))));

    let trend = 'stable';

    if (lastMean > firstMean * 1.05) {
      trend = 'increasing';
    }

    if (lastMean < firstMean * 0.95) {
      trend = 'decreasing';
    }

    const coefficientOfVariation = mean === 0
      ? 0
      : Math.abs(std / mean);

    let volatility = 'low';

    if (coefficientOfVariation > 0.5) {
      volatility = 'high';
    } else if (coefficientOfVariation > 0.2) {
      volatility = 'medium';
    }

    return {
      count: values.length,
      mean,
      min,
      max,
      std,
      trend,
      volatility,
      hasNegative: values.some((value) => value < 0),
      hasZero: values.some((value) => value === 0),
    };
  },

  makeGuide(context) {
    const profile = context.profile;
    const rows = [];

    rows.push(`
      <div class="assistant-guide-card">
        <h4>현재 데이터 요약</h4>
        <p>
          파일명은 <strong>${this.escapeHtml(context.fileName)}</strong>이고,
          선택된 값 컬럼은 <strong>${this.escapeHtml(context.selectedColumns.valueColumn || '-')}</strong>입니다.
          현재 분석 기준 데이터는 <strong>${profile.count}</strong>개입니다.
        </p>
      </div>
    `);

    rows.push(`
      <div class="assistant-guide-card">
        <h4>전처리 추천</h4>
        <p>${this.makePreprocessingRecommendation(context)}</p>
      </div>
    `);

    rows.push(`
      <div class="assistant-guide-card">
        <h4>모델 추천</h4>
        <p>${this.makeModelRecommendation(context)}</p>
      </div>
    `);

    rows.push(`
      <div class="assistant-guide-card">
        <h4>성능평가 해석</h4>
        <p>${this.makeMetricRecommendation(context)}</p>
      </div>
    `);

    return rows.join('');
  },

  makePreprocessingRecommendation(context) {
    const profile = context.profile;
    const report = context.preprocessingReport;

    if (profile.count === 0) {
      return '아직 분석 가능한 데이터가 없습니다. CSV 업로드 후 날짜/시간 컬럼과 값 컬럼을 먼저 확인해야 합니다.';
    }

    const lines = [];

    if (!report) {
      lines.push('전처리를 아직 실행하지 않았습니다. 먼저 결측값 처리와 이상치 처리를 적용하는 것이 좋습니다.');
    } else {
      lines.push(`현재 전처리 단계는 ${report.steps?.join(', ') || '기록 없음'}입니다.`);
    }

    if (profile.volatility === 'high') {
      lines.push('변동성이 큰 데이터이므로 이상치 처리와 이동평균 디노이징을 함께 확인하는 것이 좋습니다.');
    }

    if (profile.trend === 'increasing') {
      lines.push('후반부 평균이 초반부보다 높아 증가 추세가 있습니다. 단순 평균 모델보다 추세 반영 모델이 적절합니다.');
    } else if (profile.trend === 'decreasing') {
      lines.push('후반부 평균이 초반부보다 낮아 감소 추세가 있습니다. 추세를 반영하는 모델을 우선 비교하는 것이 좋습니다.');
    } else {
      lines.push('큰 추세 변화가 약하면 Naive 또는 Moving Average를 기준 모델로 사용해도 됩니다.');
    }

    if (profile.hasZero) {
      lines.push('실제값에 0이 포함되어 MAPE가 불안정할 수 있으므로 MAE, RMSE도 함께 확인해야 합니다.');
    }

    return lines.join(' ');
  },

  makeModelRecommendation(context) {
    const profile = context.profile;
    const config = context.forecastingConfig;

    if (profile.count < 5) {
      return '데이터 수가 부족합니다. 최소 5개 이상의 값이 있어야 예측을 안정적으로 실행할 수 있습니다.';
    }

    if (profile.count < 20) {
      return '데이터 수가 적기 때문에 복잡한 모델보다 Naive Forecast 또는 Moving Average를 먼저 사용하는 것이 좋습니다.';
    }

    if (profile.trend === 'increasing' || profile.trend === 'decreasing') {
      return '추세가 관찰되므로 Exponential Smoothing 또는 Polynomial Trend 모델을 우선 비교하는 것이 좋습니다. 현재 선택 모델은 ' +
        `${this.getModelName(config.model)}입니다.`;
    }

    if (profile.volatility === 'high') {
      return '변동성이 크므로 Moving Average로 노이즈를 완화한 뒤, Exponential Smoothing 모델과 비교하는 것이 좋습니다. 현재 선택 모델은 ' +
        `${this.getModelName(config.model)}입니다.`;
    }

    return '추세와 변동성이 크지 않다면 Naive Forecast를 기준 모델로 두고 Moving Average, Exponential Smoothing 순서로 비교하는 것이 좋습니다. 현재 선택 모델은 ' +
      `${this.getModelName(config.model)}입니다.`;
  },

  makeMetricRecommendation(context) {
    const metrics = context.metricsResult;

    if (!metrics || metrics.count === 0) {
      return '아직 평가지표가 계산되지 않았습니다. 예측 실행 후 MAE, MSE, RMSE, MAPE를 계산해 모델이 적절한지 확인하세요.';
    }

    const lines = [];

    lines.push(`검증 데이터 ${metrics.count}개를 기준으로 성능이 계산되었습니다.`);

    if (metrics.mape === null) {
      lines.push('MAPE는 실제값이 0인 경우 안정적으로 해석하기 어렵습니다.');
    } else if (metrics.mape < 10) {
      lines.push(`MAPE가 ${this.format(metrics.mape)}%로 낮아 예측이 비교적 안정적입니다.`);
    } else if (metrics.mape < 20) {
      lines.push(`MAPE가 ${this.format(metrics.mape)}%로 보통 수준입니다. 그래프에서 특정 구간의 오차를 확인해야 합니다.`);
    } else {
      lines.push(`MAPE가 ${this.format(metrics.mape)}%로 높습니다. 전처리 방식, 학습 비율, 모델 파라미터를 다시 조정하는 것이 좋습니다.`);
    }

    lines.push(`RMSE는 ${this.format(metrics.rmse)}로 큰 오차에 민감하므로 급격한 변동 구간의 예측 실패를 확인하는 데 사용하면 됩니다.`);

    return lines.join(' ');
  },

  makeAnswer(question, context) {
    const lowerQuestion = question.toLowerCase();

    if (
      lowerQuestion.includes('전처리') ||
      lowerQuestion.includes('결측') ||
      lowerQuestion.includes('이상치') ||
      lowerQuestion.includes('보간')
    ) {
      return this.makePreprocessingRecommendation(context);
    }

    if (
      lowerQuestion.includes('모델') ||
      lowerQuestion.includes('예측') ||
      lowerQuestion.includes('arima') ||
      lowerQuestion.includes('평활') ||
      lowerQuestion.includes('moving') ||
      lowerQuestion.includes('naive')
    ) {
      return this.makeModelRecommendation(context);
    }

    if (
      lowerQuestion.includes('성능') ||
      lowerQuestion.includes('평가') ||
      lowerQuestion.includes('mae') ||
      lowerQuestion.includes('mape') ||
      lowerQuestion.includes('rmse') ||
      lowerQuestion.includes('mse')
    ) {
      return this.makeMetricRecommendation(context);
    }

    if (
      lowerQuestion.includes('복사') ||
      lowerQuestion.includes('보고서') ||
      lowerQuestion.includes('제출')
    ) {
      return '왼쪽 메뉴의 [분석 및 검정]에서 [결과 복사]를 누르면 현재 파일명, 컬럼, 전처리 단계, 예측 모델, 평가지표, 해석 문장을 한 번에 복사할 수 있습니다.';
    }

    return [
      '현재 데이터 기준으로는 다음 순서로 진행하는 것이 좋습니다.',
      '',
      '1. 날짜/시간 컬럼과 값 컬럼이 올바르게 선택되었는지 확인합니다.',
      '2. 결측값이 있으면 선형 보간 또는 이전값 대체를 적용합니다.',
      '3. 변동성이 크면 IQR 기반 이상치 처리와 이동평균 디노이징을 비교합니다.',
      '4. 추세가 있으면 Exponential Smoothing 또는 Polynomial Trend를 우선 사용합니다.',
      '5. 예측 후 MAE, RMSE, MAPE를 함께 확인합니다.',
      '',
      this.makeModelRecommendation(context),
    ].join('\n');
  },

  getModelName(model) {
    const names = {
      naive: 'Naive Forecast',
      movingAverage: 'Moving Average',
      exponentialSmoothing: 'Exponential Smoothing',
      polynomialTrend: 'Polynomial Trend',
      arima: 'ARIMA 간이 모델',
    };

    return names[model] || model || '-';
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

  format(value, digits = 4) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return '-';
    }

    return number.toFixed(digits);
  },

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },
};

window.TSNAssistant = TSNAssistant;

document.addEventListener('DOMContentLoaded', () => {
  TSNAssistant.init();
});