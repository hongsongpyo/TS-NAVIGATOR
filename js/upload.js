// TS Navigator/js/upload.js

const TSNUpload = {
  elements: {
    csvInput: null,
    uploadButton: null,
    dropArea: null,
  },

  init() {
    this.elements.csvInput = document.getElementById('csvInput');
    this.elements.uploadButton = document.getElementById('uploadButton');
    this.elements.dropArea = document.getElementById('dropArea');

    if (!this.elements.csvInput || !this.elements.uploadButton || !this.elements.dropArea) {
      return;
    }

    this.bindEvents();
  },

  bindEvents() {
    this.elements.uploadButton.addEventListener('click', () => {
      this.elements.csvInput.click();
    });

    this.elements.dropArea.addEventListener('click', () => {
      this.elements.csvInput.click();
    });

    this.elements.csvInput.addEventListener('change', (event) => {
      const file = event.target.files[0];

      if (!file) {
        return;
      }

      this.handleFile(file);
    });

    this.elements.dropArea.addEventListener('dragover', (event) => {
      event.preventDefault();
      this.elements.dropArea.classList.add('dragover');
    });

    this.elements.dropArea.addEventListener('dragleave', () => {
      this.elements.dropArea.classList.remove('dragover');
    });

    this.elements.dropArea.addEventListener('drop', (event) => {
      event.preventDefault();
      this.elements.dropArea.classList.remove('dragover');

      const file = event.dataTransfer.files[0];

      if (!file) {
        return;
      }

      this.handleFile(file);
    });
  },

  handleFile(file) {
    if (!this.validateFile(file)) {
      return;
    }

    const reader = new FileReader();

    this.setUploadingState(true);

    reader.onload = (event) => {
      try {
        const csvText = event.target.result;
        const parsedData = this.parseCsv(csvText);

        this.validateParsedData(parsedData);

        window.TSNApp.setUploadedData({
          fileName: file.name,
          csvText,
          parsedData,
        });

        this.setUploadingState(false);
        this.showUploadComplete(file.name, parsedData.length);

        setTimeout(() => {
          window.TSNApp.moveToWorkspace();
        }, 600);
      } catch (error) {
        this.setUploadingState(false);
        alert(error.message);
      }
    };

    reader.onerror = () => {
      this.setUploadingState(false);
      alert('파일을 읽는 중 오류가 발생했습니다.');
    };

    reader.readAsText(file, 'UTF-8');
  },

  validateFile(file) {
    const isCsv =
      file.type === 'text/csv' ||
      file.name.toLowerCase().endsWith('.csv');

    if (!isCsv) {
      alert('CSV 파일만 업로드할 수 있습니다.');
      return false;
    }

    if (file.size === 0) {
      alert('비어있는 파일은 업로드할 수 없습니다.');
      return false;
    }

    return true;
  },

  parseCsv(csvText) {
    const cleanText = csvText
      .replace(/^\uFEFF/, '')
      .trim();

    if (!cleanText) {
      throw new Error('CSV 파일에 데이터가 없습니다.');
    }

    const rows = this.splitCsvRows(cleanText);

    if (rows.length < 2) {
      throw new Error('CSV 파일에는 헤더와 최소 1개 이상의 데이터 행이 필요합니다.');
    }

    const headers = this.parseCsvLine(rows[0]).map((header) => {
      return header.trim();
    });

    if (headers.some((header) => header === '')) {
      throw new Error('CSV 헤더에 빈 컬럼명이 있습니다.');
    }

    const data = [];

    for (let i = 1; i < rows.length; i += 1) {
      const values = this.parseCsvLine(rows[i]);

      if (values.length === 1 && values[0].trim() === '') {
        continue;
      }

      const row = {};

      headers.forEach((header, index) => {
        row[header] = this.normalizeValue(values[index]);
      });

      data.push(row);
    }

    return data;
  },

  splitCsvRows(csvText) {
    const rows = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i += 1) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"' && nextChar === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i += 1;
        }

        rows.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    if (current.length > 0) {
      rows.push(current);
    }

    return rows;
  },

  parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && nextChar === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    values.push(current);

    return values;
  },

  normalizeValue(value) {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmedValue = String(value).trim();

    if (
      trimmedValue === '' ||
      trimmedValue.toLowerCase() === 'na' ||
      trimmedValue.toLowerCase() === 'nan' ||
      trimmedValue.toLowerCase() === 'null' ||
      trimmedValue.toLowerCase() === 'undefined'
    ) {
      return null;
    }

    const numberValue = Number(trimmedValue.replace(/,/g, ''));

    if (Number.isFinite(numberValue) && trimmedValue.match(/^-?[\d,]+(\.\d+)?$/)) {
      return numberValue;
    }

    return trimmedValue;
  },

  validateParsedData(data) {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('CSV 데이터가 올바르게 변환되지 않았습니다.');
    }

    const columns = Object.keys(data[0]);

    if (columns.length < 2) {
      throw new Error('시계열 분석을 위해 날짜/시간 컬럼과 값 컬럼이 필요합니다.');
    }

    const numericColumns = columns.filter((column) => {
      return data.some((row) => {
        return Number.isFinite(Number(row[column]));
      });
    });

    if (numericColumns.length === 0) {
      throw new Error('예측에 사용할 숫자형 컬럼이 필요합니다.');
    }
  },

  setUploadingState(isUploading) {
    if (isUploading) {
      this.elements.uploadButton.textContent = '업로드 중...';
      this.elements.uploadButton.disabled = true;
      this.elements.dropArea.classList.add('uploading');
      return;
    }

    this.elements.uploadButton.textContent = '파일 선택';
    this.elements.uploadButton.disabled = false;
    this.elements.dropArea.classList.remove('uploading');
  },

  showUploadComplete(fileName, rowCount) {
    const message = document.createElement('div');

    message.className = 'upload-message fade-in';
    message.innerHTML = `
      <strong>${fileName}</strong>
      <span>${rowCount}개 행을 불러왔습니다. Workspace로 이동합니다.</span>
    `;

    const existingMessage = document.querySelector('.upload-message');

    if (existingMessage) {
      existingMessage.remove();
    }

    this.elements.dropArea.insertAdjacentElement('afterend', message);
  },
};

window.TSNUpload = TSNUpload;

document.addEventListener('DOMContentLoaded', () => {
  TSNUpload.init();
});