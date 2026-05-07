// TS Navigator/js/charts.js

const TSNCharts = {
  charts: {},
  elements: {
    dashboardGrid: null,
    addRegionButton: null,
    resetChartButton: null,
    uploadedFileName: null,
    uploadedFileSummary: null,
    dateColumnSelect: null,
    valueColumnSelect: null,
    applyColumnButton: null,
  },

  chartData: {
    original: [],
    preprocessed: [],
    forecast: [],
  },

  init() {
    this.cacheElements();
    this.loadInitialData();
    this.bindEvents();
    this.renderFileSummary();
    this.renderColumnSelects();
    this.renderAllCharts();
  },

  cacheElements() {
    this.elements.dashboardGrid = document.getElementById('dashboardGrid');
    this.elements.addRegionButton = document.getElementById('addRegionButton');
    this.elements.resetChartButton = document.getElementById('resetChartButton');
    this.elements.uploadedFileName = document.getElementById('uploadedFileName');
    this.elements.uploadedFileSummary = document.getElementById('uploadedFileSummary');
    this.elements.dateColumnSelect = document.getElementById('dateColumnSelect');
    this.elements.valueColumnSelect = document.getElementById('valueColumnSelect');
    this.elements.applyColumnButton = document.getElementById('applyColumnButton');
  },

  loadInitialData() {
    const state = window.TSNApp.state;
    const { dateColumn, valueColumn } = state.selectedColumns;

    this.chartData.original = this.makeSeriesFromRows(
      state.parsedData,
      dateColumn,
      valueColumn
    );

    const savedPreprocessed = localStorage.getItem('tsn_preprocessed_data');
    const savedForecast = localStorage.getItem('tsn_forecast_data');

    this.chartData.preprocessed = savedPreprocessed
      ? JSON.parse(savedPreprocessed)
      : [];

    this.chartData.forecast = savedForecast
      ? JSON.parse(savedForecast)
      : [];
  },

  bindEvents() {
    if (this.elements.addRegionButton) {
      this.elements.addRegionButton.addEventListener('click', () => {
        this.addChartRegion();
      });
    }

    if (this.elements.resetChartButton) {
      this.elements.resetChartButton.addEventListener('click', () => {
        this.resetChartRegions();
      });
    }

    if (this.elements.applyColumnButton) {
      this.elements.applyColumnButton.addEventListener('click', () => {
        this.applySelectedColumns();
      });
    }

    document.addEventListener('change', (event) => {
      if (event.target.classList.contains('series-toggle')) {
        this.updateRegionChart(event.target.closest('.chart-region'));
      }
    });

    window.addEventListener('tsn:preprocessed', (event) => {
      this.setPreprocessedData(event.detail.data);
    });

    window.addEventListener('tsn:forecast', (event) => {
      this.setForecastData(event.detail.data);
    });
  },

  renderFileSummary() {
    const state = window.TSNApp.state;
    const rows = state.parsedData || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    if (this.elements.uploadedFileName) {
      this.elements.uploadedFileName.textContent = state.rawFileName || '-';
    }

    if (this.elements.uploadedFileSummary) {
      this.elements.uploadedFileSummary.textContent =
        `${rows.length}개 행 · ${columns.length}개 컬럼`;
    }
  },

  renderColumnSelects() {
    const state = window.TSNApp.state;
    const rows = state.parsedData || [];

    if (rows.length === 0) {
      return;
    }

    const columns = Object.keys(rows[0]);

    this.fillSelect(
      this.elements.dateColumnSelect,
      columns,
      state.selectedColumns.dateColumn
    );

    this.fillSelect(
      this.elements.valueColumnSelect,
      columns,
      state.selectedColumns.valueColumn
    );
  },

  fillSelect(selectElement, options, selectedValue) {
    if (!selectElement) {
      return;
    }

    selectElement.innerHTML = '';

    options.forEach((option) => {
      const optionElement = document.createElement('option');

      optionElement.value = option;
      optionElement.textContent = option;

      if (option === selectedValue) {
        optionElement.selected = true;
      }

      selectElement.appendChild(optionElement);
    });
  },

  applySelectedColumns() {
    const dateColumn = this.elements.dateColumnSelect.value;
    const valueColumn = this.elements.valueColumnSelect.value;

    if (!dateColumn || !valueColumn) {
      alert('날짜/시간 컬럼과 값 컬럼을 선택해주세요.');
      return;
    }

    if (dateColumn === valueColumn) {
      alert('날짜/시간 컬럼과 값 컬럼은 서로 달라야 합니다.');
      return;
    }

    window.TSNApp.updateState({
      selectedColumns: {
        dateColumn,
        valueColumn,
      },
    });

    this.chartData.original = this.makeSeriesFromRows(
      window.TSNApp.state.parsedData,
      dateColumn,
      valueColumn
    );

    this.chartData.preprocessed = [];
    this.chartData.forecast = [];

    localStorage.removeItem('tsn_preprocessed_data');
    localStorage.removeItem('tsn_forecast_data');

    this.renderAllCharts();
  },

  makeSeriesFromRows(rows, dateColumn, valueColumn) {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .map((row, index) => {
        return {
          x: row[dateColumn] ?? index + 1,
          y: Number(row[valueColumn]),
        };
      })
      .filter((point) => Number.isFinite(point.y));
  },

  renderAllCharts() {
    const regions = document.querySelectorAll('.chart-region');

    regions.forEach((region) => {
      this.renderRegionChart(region);
    });
  },

  renderRegionChart(regionElement) {
    if (!regionElement) {
      return;
    }

    const canvas = regionElement.querySelector('canvas');

    if (!canvas) {
      return;
    }

    const chartId = canvas.id;
    const selectedSeries = this.getSelectedSeries(regionElement);

    if (this.charts[chartId]) {
      this.charts[chartId].destroy();
    }

    this.charts[chartId] = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: this.createDatasets(selectedSeries),
      },
      options: this.getChartOptions(),
    });
  },

  updateRegionChart(regionElement) {
    if (!regionElement) {
      return;
    }

    const canvas = regionElement.querySelector('canvas');

    if (!canvas || !this.charts[canvas.id]) {
      return;
    }

    const selectedSeries = this.getSelectedSeries(regionElement);

    this.charts[canvas.id].data.datasets = this.createDatasets(selectedSeries);
    this.charts[canvas.id].update();
  },

  getSelectedSeries(regionElement) {
    const checkedInputs = regionElement.querySelectorAll('.series-toggle:checked');

    return Array.from(checkedInputs).map((input) => input.value);
  },

  createDatasets(selectedSeries) {
    const datasets = [];

    if (selectedSeries.includes('original')) {
      datasets.push({
        label: '원본 데이터',
        data: this.chartData.original,
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 2,
      });
    }

    if (selectedSeries.includes('preprocessed')) {
      datasets.push({
        label: '전처리 데이터',
        data: this.chartData.preprocessed,
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 2,
      });
    }

    if (selectedSeries.includes('forecast')) {
      datasets.push({
        label: '예측 데이터',
        data: this.chartData.forecast,
        borderWidth: 2,
        borderDash: [6, 6],
        tension: 0.25,
        pointRadius: 2,
      });
    }

    return datasets;
  },

  getChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#b9c0cc',
            boxWidth: 14,
            boxHeight: 14,
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y;
              return `${context.dataset.label}: ${Number(value).toFixed(4)}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          ticks: {
            color: '#7f8796',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
        y: {
          ticks: {
            color: '#7f8796',
          },
          grid: {
            color: 'rgba(255,255,255,0.06)',
          },
        },
      },
    };
  },

  addChartRegion() {
    const chartCount = document.querySelectorAll('.chart-region').length + 1;
    const regionId = `region-${chartCount}`;
    const canvasId = `chart-${chartCount}`;

    const region = document.createElement('article');

    region.className = 'chart-region fade-in';
    region.dataset.regionId = regionId;

    region.innerHTML = `
      <div class="chart-header">
        <div>
          <span>Region ${String(chartCount).padStart(2, '0')}</span>
          <h3>사용자 그래프 비교 영역</h3>
        </div>

        <div class="chart-actions">
          <label>
            <input type="checkbox" class="series-toggle" value="original" checked />
            원본
          </label>

          <label>
            <input type="checkbox" class="series-toggle" value="preprocessed" checked />
            전처리
          </label>

          <label>
            <input type="checkbox" class="series-toggle" value="forecast" checked />
            예측
          </label>

          <button type="button" class="remove-region-button">
            삭제
          </button>
        </div>
      </div>

      <div class="chart-body">
        <canvas id="${canvasId}"></canvas>
      </div>
    `;

    const metricRegion = document.querySelector('.metric-region');

    this.elements.dashboardGrid.insertBefore(region, metricRegion);

    region.querySelector('.remove-region-button').addEventListener('click', () => {
      this.removeChartRegion(region);
    });

    this.renderRegionChart(region);
  },

  removeChartRegion(regionElement) {
    const canvas = regionElement.querySelector('canvas');

    if (canvas && this.charts[canvas.id]) {
      this.charts[canvas.id].destroy();
      delete this.charts[canvas.id];
    }

    regionElement.remove();
  },

  resetChartRegions() {
    const regions = document.querySelectorAll('.chart-region');

    regions.forEach((region, index) => {
      if (index > 0) {
        this.removeChartRegion(region);
      }
    });

    this.renderAllCharts();
  },

  setPreprocessedData(data) {
    this.chartData.preprocessed = data || [];
    localStorage.setItem(
      'tsn_preprocessed_data',
      JSON.stringify(this.chartData.preprocessed)
    );

    this.renderAllCharts();
  },

  setForecastData(data) {
    this.chartData.forecast = data || [];
    localStorage.setItem(
      'tsn_forecast_data',
      JSON.stringify(this.chartData.forecast)
    );

    this.renderAllCharts();
  },

  getCurrentSeries() {
    return {
      original: this.chartData.original,
      preprocessed: this.chartData.preprocessed,
      forecast: this.chartData.forecast,
    };
  },
};

window.TSNCharts = TSNCharts;

document.addEventListener('DOMContentLoaded', () => {
  TSNCharts.init();
});