/**
 * Setup Wizard HTML 템플릿
 *
 * 추가 템플릿 엔진 없이 템플릿 리터럴로 HTML을 생성합니다.
 * 선택 화면과 Setup 폼 화면을 제공합니다.
 *
 * @module setup
 */

import {
  ENV_DEFINITIONS,
  ENV_GROUPS,
  type EnvDefinition,
} from './env-definitions';

/**
 * 선택 화면 HTML을 생성합니다. (.env 존재 시)
 */
export function renderChoicePage(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NestJS Engine - Setup</title>
  <style>${getBaseStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>NestJS Engine</h1>
      <p class="subtitle">NestJS Backend Engine</p>
    </div>
    <div class="choice-card">
      <h2>기존 설정 파일이 감지되었습니다</h2>
      <p class="choice-desc">.env 파일이 이미 존재합니다. 기존 설정으로 바로 시작하거나, Setup Wizard에서 설정을 수정할 수 있습니다.</p>
      <div class="choice-buttons">
        <button class="btn btn-primary" onclick="skipSetup()">
          <span class="btn-icon">▶</span>
          기존 설정으로 시작
        </button>
        <button class="btn btn-secondary" onclick="location.href='/?mode=setup'">
          <span class="btn-icon">⚙</span>
          Setup Wizard 진입
        </button>
      </div>
    </div>
  </div>
  <script>
    async function skipSetup() {
      const btn = event.target.closest('.btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> 시작 중...';
      try {
        const res = await fetch('/setup/skip', { method: 'POST' });
        if (res.ok) {
          document.querySelector('.choice-card').innerHTML =
            '<div class="success-message"><h2>NestJS 앱을 시작합니다...</h2><p>잠시만 기다려주세요.</p></div>';
        } else {
          const data = await res.json();
          alert('오류: ' + (data.error || '알 수 없는 오류'));
          btn.disabled = false;
          btn.innerHTML = '<span class="btn-icon">▶</span> 기존 설정으로 시작';
        }
      } catch (e) {
        alert('서버 연결에 실패했습니다.');
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">▶</span> 기존 설정으로 시작';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Setup 폼 HTML을 생성합니다.
 */
export function renderSetupPage(
  existingValues: Record<string, string>,
): string {
  const groupsHtml = ENV_GROUPS.map(
    (group, idx) => `
    <div class="form-group" data-group="${group.id}">
      <div class="group-header" onclick="toggleGroup('${group.id}')">
        <span class="group-icon">${group.icon}</span>
        <span class="group-label">${group.label}</span>
        <span class="group-toggle" id="toggle-${group.id}">${idx === 0 ? '▼' : '▶'}</span>
      </div>
      <div class="group-body${idx === 0 ? ' open' : ''}" id="body-${group.id}">
        ${renderGroupFields(group.id, existingValues)}
      </div>
    </div>`,
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NestJS Engine - Setup Wizard</title>
  <style>${getBaseStyles()}${getFormStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>NestJS Engine Setup Wizard</h1>
      <p class="subtitle">환경변수를 설정하여 프로젝트를 초기화합니다</p>
    </div>
    <form id="setupForm" onsubmit="return handleSubmit(event)">
      ${groupsHtml}

      <div class="form-group" data-group="database-url-preview">
        <div class="db-url-preview">
          <label>DATABASE_URL (자동 생성)</label>
          <code id="dbUrlPreview">mysql://root:@localhost:3306/nestjs_engine_db</code>
          <div class="db-test-row">
            <button type="button" class="btn btn-secondary btn-test" id="dbTestBtn" onclick="testDbConnection()">
              DB 연결 테스트
            </button>
            <span id="dbTestResult" class="db-test-result"></span>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-lg" id="submitBtn">
          <span class="btn-icon">🚀</span>
          설정 저장 및 초기화 시작
        </button>
      </div>
    </form>

    <div id="progressArea" class="progress-area" style="display:none;">
      <h3>초기화 진행 중...</h3>
      <div id="progressSteps" class="progress-steps"></div>
      <div id="progressError" class="progress-error" style="display:none;"></div>
    </div>
  </div>

  <script>
    // Accordion toggle
    function toggleGroup(groupId) {
      const body = document.getElementById('body-' + groupId);
      const toggle = document.getElementById('toggle-' + groupId);
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open');
      toggle.textContent = isOpen ? '▶' : '▼';
    }

    // Auto-generate random key
    function autoGenerate(fieldId, length) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      let result = '';
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
      }
      const input = document.getElementById(fieldId);
      input.value = result;
      input.type = 'text';
      setTimeout(() => { input.type = 'password'; }, 2000);
      updateDbUrl();
    }

    // Update DATABASE_URL preview
    function updateDbUrl() {
      const host = document.getElementById('DB_HOST')?.value || 'localhost';
      const port = document.getElementById('DB_PORT')?.value || '3306';
      const user = document.getElementById('DB_USER')?.value || 'root';
      const pass = document.getElementById('DB_PASSWORD')?.value || '';
      const db = document.getElementById('DB_NAME')?.value || 'nestjs_engine_db';
      const encoded = encodeURIComponent(pass);
      document.getElementById('dbUrlPreview').textContent =
        'mysql://' + user + ':' + encoded + '@' + host + ':' + port + '/' + db;
    }

    // Hide/show fields based on NODE_ENV
    function applyEnvVisibility() {
      const env = document.getElementById('NODE_ENV')?.value || 'local';
      document.querySelectorAll('[data-hide-env]').forEach(function(el) {
        if (el.getAttribute('data-hide-env') === env) {
          el.style.display = 'none';
        } else {
          el.style.display = '';
        }
      });
    }

    // Attach DB field listeners + NODE_ENV listener
    document.addEventListener('DOMContentLoaded', function() {
      ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateDbUrl);
      });
      updateDbUrl();

      var envSelect = document.getElementById('NODE_ENV');
      if (envSelect) envSelect.addEventListener('change', applyEnvVisibility);
      applyEnvVisibility();
    });

    // DB connection test
    async function testDbConnection() {
      const btn = document.getElementById('dbTestBtn');
      const result = document.getElementById('dbTestResult');
      btn.disabled = true;
      btn.textContent = '테스트 중...';
      result.textContent = '';
      result.className = 'db-test-result';

      const data = {
        DB_HOST: document.getElementById('DB_HOST')?.value || 'localhost',
        DB_PORT: document.getElementById('DB_PORT')?.value || '3306',
        DB_USER: document.getElementById('DB_USER')?.value || 'root',
        DB_PASSWORD: document.getElementById('DB_PASSWORD')?.value || '',
        DB_NAME: document.getElementById('DB_NAME')?.value || 'nestjs_engine_db',
      };

      try {
        const res = await fetch('/setup/test-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        result.textContent = json.message;
        result.className = 'db-test-result ' + (json.success ? 'test-ok' : 'test-fail');
      } catch (e) {
        result.textContent = '서버 연결 실패: ' + e.message;
        result.className = 'db-test-result test-fail';
      }
      btn.disabled = false;
      btn.textContent = 'DB 연결 테스트';
    }

    // Form submission with SSE progress
    async function handleSubmit(e) {
      e.preventDefault();
      const form = document.getElementById('setupForm');
      const submitBtn = document.getElementById('submitBtn');
      const progressArea = document.getElementById('progressArea');
      const progressSteps = document.getElementById('progressSteps');
      const progressError = document.getElementById('progressError');

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> 처리 중...';

      // Collect form data
      const formData = new FormData(form);
      const data = {};
      formData.forEach(function(value, key) { data[key] = value; });

      // Show progress area
      progressArea.style.display = 'block';
      progressSteps.innerHTML = '';
      progressError.style.display = 'none';

      // Start SSE for progress
      const evtSource = new EventSource('/setup/status');
      evtSource.onmessage = function(event) {
        const step = JSON.parse(event.data);
        addProgressStep(step);
        if (step.status === 'complete') {
          evtSource.close();
        }
        if (step.status === 'error') {
          evtSource.close();
          progressError.style.display = 'block';
          progressError.textContent = step.message;
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="btn-icon">🚀</span> 설정 저장 및 초기화 시작';
        }
      };
      evtSource.onerror = function() {
        evtSource.close();
      };

      // POST setup data
      try {
        const res = await fetch('/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) {
          progressError.style.display = 'block';
          progressError.textContent = result.error || '설정 중 오류가 발생했습니다.';
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="btn-icon">🚀</span> 설정 저장 및 초기화 시작';
        }
      } catch (err) {
        progressError.style.display = 'block';
        progressError.textContent = '서버 연결에 실패했습니다: ' + err.message;
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="btn-icon">🚀</span> 설정 저장 및 초기화 시작';
      }
    }

    function addProgressStep(step) {
      const container = document.getElementById('progressSteps');
      const icons = { pending: '⏳', running: '🔄', done: '✅', error: '❌', complete: '🎉' };
      const existing = document.getElementById('step-' + step.step);
      const html = '<div class="step-item step-' + step.status + '" id="step-' + step.step + '">' +
        '<span class="step-icon">' + (icons[step.status] || '⏳') + '</span>' +
        '<span class="step-text">' + step.message + '</span>' +
        '</div>';
      if (existing) {
        existing.outerHTML = html;
      } else {
        container.innerHTML += html;
      }
    }
  </script>
</body>
</html>`;
}

function renderGroupFields(
  groupId: string,
  existingValues: Record<string, string>,
): string {
  const fields = ENV_DEFINITIONS.filter((d) => d.group === groupId);
  return fields.map((field) => renderField(field, existingValues)).join('\n');
}

function renderField(
  def: EnvDefinition,
  existingValues: Record<string, string>,
): string {
  const value = existingValues[def.key] ?? def.defaultValue;
  const requiredMark = def.required
    ? '<span class="required">*</span>'
    : '';
  const autoBtn = def.autoGenerate
    ? `<button type="button" class="btn-auto" onclick="autoGenerate('${def.key}', ${def.autoGenerateLength || 32})">자동 생성</button>`
    : '';

  let inputHtml: string;
  if (def.type === 'select' && def.options) {
    const optionsHtml = def.options
      .map(
        (opt) =>
          `<option value="${opt}"${opt === value ? ' selected' : ''}>${opt}</option>`,
      )
      .join('');
    inputHtml = `<select id="${def.key}" name="${def.key}" class="form-input">${optionsHtml}</select>`;
  } else {
    inputHtml = `<input
      type="${def.type}"
      id="${def.key}"
      name="${def.key}"
      class="form-input"
      value="${escapeHtml(value)}"
      placeholder="${escapeHtml(def.placeholder)}"
      ${def.required ? 'required' : ''}
    />`;
  }

  const hideAttr = def.hideWhenEnv
    ? ` data-hide-env="${def.hideWhenEnv}"`
    : '';

  return `
    <div class="field-row"${hideAttr}>
      <label for="${def.key}" class="field-label">
        ${def.label} ${requiredMark}
      </label>
      <div class="field-input-wrap">
        ${inputHtml}
        ${autoBtn}
      </div>
      ${def.description ? `<p class="field-desc">${def.description}</p>` : ''}
    </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getBaseStyles(): string {
  return `
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface-hover: #22252f;
      --border: #2d3040;
      --text: #e4e6ed;
      --text-muted: #8b8fa3;
      --primary: #6366f1;
      --primary-hover: #818cf8;
      --success: #22c55e;
      --error: #ef4444;
      --warning: #f59e0b;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f5f5f7;
        --surface: #ffffff;
        --surface-hover: #f0f0f2;
        --border: #e0e0e5;
        --text: #1a1a2e;
        --text-muted: #6b7085;
        --primary: #6366f1;
        --primary-hover: #4f46e5;
        --success: #16a34a;
        --error: #dc2626;
        --warning: #d97706;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary), var(--primary-hover));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
      margin-top: 4px;
    }
    .choice-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      text-align: center;
    }
    .choice-card h2 { font-size: 20px; margin-bottom: 12px; }
    .choice-desc { color: var(--text-muted); margin-bottom: 24px; font-size: 14px; }
    .choice-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
    .btn-secondary {
      background: var(--surface-hover);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover:not(:disabled) { background: var(--border); }
    .btn-lg { padding: 14px 32px; font-size: 16px; width: 100%; justify-content: center; }
    .btn-icon { font-size: 18px; }
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .success-message { padding: 20px; }
    .success-message h2 { color: var(--success); }
    .progress-area {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-top: 20px;
    }
    .progress-area h3 { margin-bottom: 16px; font-size: 16px; }
    .progress-steps { display: flex; flex-direction: column; gap: 8px; }
    .step-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--surface-hover);
      font-size: 14px;
    }
    .step-done { opacity: 0.7; }
    .step-error { background: rgba(239,68,68,0.1); color: var(--error); }
    .step-complete { background: rgba(34,197,94,0.1); color: var(--success); font-weight: 600; }
    .progress-error {
      margin-top: 12px;
      padding: 12px;
      background: rgba(239,68,68,0.1);
      border: 1px solid var(--error);
      border-radius: 8px;
      color: var(--error);
      font-size: 14px;
    }
  `;
}

function getFormStyles(): string {
  return `
    .form-group {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .group-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }
    .group-header:hover { background: var(--surface-hover); }
    .group-icon { font-size: 18px; }
    .group-label { font-weight: 600; font-size: 15px; flex: 1; }
    .group-toggle { font-size: 12px; color: var(--text-muted); }
    .group-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
      padding: 0 18px;
    }
    .group-body.open {
      max-height: 2000px;
      padding: 0 18px 18px;
    }
    .field-row {
      margin-bottom: 16px;
    }
    .field-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--text);
    }
    .required { color: var(--error); margin-left: 2px; }
    .field-input-wrap {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .form-input {
      flex: 1;
      padding: 10px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 14px;
      font-family: 'SF Mono', Menlo, Monaco, monospace;
      transition: border-color 0.15s;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(99,102,241,0.2);
    }
    select.form-input { cursor: pointer; }
    .btn-auto {
      padding: 8px 14px;
      background: var(--surface-hover);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--primary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .btn-auto:hover { background: var(--border); }
    .field-desc {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .db-url-preview {
      padding: 14px 18px;
    }
    .db-url-preview label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text-muted);
    }
    .db-url-preview code {
      display: block;
      padding: 10px 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 13px;
      font-family: 'SF Mono', Menlo, Monaco, monospace;
      word-break: break-all;
      color: var(--primary);
    }
    .form-actions {
      margin-top: 20px;
    }
    [data-group="database-url-preview"] {
      border: 1px dashed var(--border);
    }
    .db-test-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
    }
    .btn-test {
      padding: 8px 16px;
      font-size: 13px;
      white-space: nowrap;
    }
    .db-test-result {
      font-size: 13px;
      line-height: 1.4;
    }
    .db-test-result.test-ok { color: var(--success); }
    .db-test-result.test-fail { color: var(--error); }
  `;
}
