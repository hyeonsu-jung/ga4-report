'use strict';

/* ────────────────────────────────────────────────────────
 * 상태
 * ──────────────────────────────────────────────────────── */
const state = {
  authenticated: false,
  accounts: [],
  property: null,
  preset: 'last30',
  compareMode: 'previous',
  startDate: '',
  endDate: '',
  sectionKeys: [],
  sections: [],
  busy: false,
};

const $ = (id) => document.getElementById(id);

/* ────────────────────────────────────────────────────────
 * 공통 유틸
 * ──────────────────────────────────────────────────────── */
const nf = new Intl.NumberFormat('ko-KR');
const fmtNum = (v) => nf.format(Number(v) || 0);
const fmtPct = (v, d = 1) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(d)}%` : '-');

function fmtDelta(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return { text: '-', cls: 'flat' };
  }
  if (rate > 0) return { text: `▲ ${Math.abs(rate).toFixed(1)}%`, cls: 'up' };
  if (rate < 0) return { text: `▼ ${Math.abs(rate).toFixed(1)}%`, cls: 'down' };
  return { text: '0.0%', cls: 'flat' };
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const data = await res.json();
      message = data.message || message;
      if (data.error === 'NOT_AUTHENTICATED') {
        state.authenticated = false;
        renderAuth();
      }
    } catch (e) { /* 본문이 JSON 이 아닌 경우 */ }
    throw new Error(message);
  }
  return res;
}

const apiJson = (path, options) => api(path, options).then((r) => r.json());

function setStatus(message, type = '') {
  const bar = $('statusBar');
  bar.textContent = message;
  bar.className = `status ${type ? `is-${type}` : ''}`;
  bar.classList.toggle('hidden', !message);
}

function setBusy(busy, text) {
  state.busy = busy;
  $('overlay').classList.toggle('hidden', !busy);
  if (text) $('overlayText').textContent = text;
  $('previewBtn').disabled = busy;
  $('downloadBtn').disabled = busy;
}

/* ────────────────────────────────────────────────────────
 * 초기화
 * ──────────────────────────────────────────────────────── */
async function init() {
  bindEvents();
  handleAuthRedirect();

  const status = await apiJson('/api/auth/status');
  state.authenticated = status.authenticated;
  state.user = status.user;
  state.configured = status.configured;
  state.sections = status.sections;
  state.sectionKeys = status.sections.map((s) => s.key);

  renderAuth();
  renderPresets(status.presets);
  renderCompareModes(status.compareModes);
  renderSectionList(status.sections);

  if (!status.configured) {
    setStatus('서버에 Google OAuth 클라이언트 정보가 설정되지 않았습니다. .env 파일을 확인하세요.', 'error');
  }

  if (state.authenticated) {
    await loadProperties();
  }
}

function handleAuthRedirect() {
  const params = new URLSearchParams(location.search);
  if (params.has('auth_error')) {
    setTimeout(() => setStatus(`로그인 실패: ${params.get('auth_error')}`, 'error'), 100);
  }
  if (params.has('auth') || params.has('auth_error')) {
    history.replaceState(null, '', location.pathname);
  }
}

/* ────────────────────────────────────────────────────────
 * 렌더링 · 설정 영역
 * ──────────────────────────────────────────────────────── */
function renderAuth() {
  const area = $('authArea');
  if (state.authenticated) {
    const name = state.user?.email || state.user?.name || '로그인됨';
    area.innerHTML = `
      <span class="user">연결 계정 <b>${escapeHtml(name)}</b></span>
      <button class="btn btn--light btn--sm" id="logoutBtn">로그아웃</button>`;
    $('logoutBtn').addEventListener('click', logout);
  } else {
    area.innerHTML = `<a class="btn btn--light btn--sm" href="/auth/google">GA4 로그인</a>`;
  }
  $('loginGate').classList.toggle('hidden', state.authenticated);
  $('setupBody').classList.toggle('hidden', !state.authenticated);
}

function renderPresets(presets) {
  $('presetGroup').innerHTML = presets
    .map(
      (p) =>
        `<button type="button" class="chip ${p.value === state.preset ? 'is-active' : ''}" data-preset="${p.value}">${escapeHtml(p.label)}</button>`
    )
    .join('');
}

function renderCompareModes(modes) {
  $('compareMode').innerHTML = modes
    .map(
      (m) =>
        `<option value="${m.value}" ${m.value === state.compareMode ? 'selected' : ''}>${escapeHtml(m.label)}</option>`
    )
    .join('');
}

function renderSectionList(sections) {
  $('sectionList').innerHTML = sections
    .map(
      (s) => `
      <label class="section-item">
        <input type="checkbox" value="${s.key}" checked />
        <span>
          <strong>${escapeHtml(s.shortTitle)}</strong>
          <span>${escapeHtml(s.dimensions.join(', '))} · ${escapeHtml(s.metrics.join(', '))}</span>
        </span>
      </label>`
    )
    .join('');
}

async function loadProperties() {
  const select = $('propertySelect');
  select.innerHTML = '<option value="">불러오는 중…</option>';
  try {
    const { accounts } = await apiJson('/api/properties');
    state.accounts = accounts;
    if (accounts.length === 0) {
      select.innerHTML = '<option value="">접근 가능한 GA4 속성이 없습니다</option>';
      setStatus('로그인한 계정에 연결된 GA4 속성이 없습니다.', 'error');
      return;
    }
    renderPropertyOptions('');
    const first = accounts[0].properties[0];
    if (first) {
      select.value = first.propertyId;
      await selectProperty(first.propertyId);
    }
  } catch (err) {
    select.innerHTML = '<option value="">속성 조회 실패</option>';
    setStatus(err.message, 'error');
  }
}

function renderPropertyOptions(keyword) {
  const select = $('propertySelect');
  const kw = keyword.trim().toLowerCase();
  const html = state.accounts
    .map((account) => {
      const props = account.properties.filter(
        (p) =>
          !kw ||
          p.propertyName.toLowerCase().includes(kw) ||
          p.propertyId.includes(kw) ||
          account.accountName.toLowerCase().includes(kw)
      );
      if (props.length === 0) return '';
      return `<optgroup label="${escapeHtml(account.accountName)}">${props
        .map(
          (p) =>
            `<option value="${p.propertyId}">${escapeHtml(p.propertyName)} (${p.propertyId})</option>`
        )
        .join('')}</optgroup>`;
    })
    .join('');
  select.innerHTML = html || '<option value="">검색 결과 없음</option>';
}

async function selectProperty(propertyId) {
  if (!propertyId) {
    state.property = null;
    $('propertyMeta').classList.add('hidden');
    return;
  }
  const box = $('propertyMeta');
  box.classList.remove('hidden');
  box.innerHTML = '<span class="muted">속성 정보를 확인하는 중…</span>';
  try {
    const { property, access } = await apiJson(`/api/properties/${propertyId}`);
    state.property = property;
    box.innerHTML = `
      <dl>
        <dt>속성 ID</dt><dd>${escapeHtml(property.propertyId)}</dd>
        <dt>타임존</dt><dd>${escapeHtml(property.timeZone)}</dd>
        <dt>데이터 권한</dt>
        <dd class="${access.ok ? '' : 'warn'}">${access.ok ? '조회 가능' : escapeHtml(access.message)}</dd>
      </dl>`;
    await refreshRange();
  } catch (err) {
    box.innerHTML = `<span class="warn">${escapeHtml(err.message)}</span>`;
  }
}

async function refreshRange() {
  const body = {
    preset: state.preset,
    startDate: $('startDate').value,
    endDate: $('endDate').value,
    compareMode: state.compareMode,
    timeZone: state.property?.timeZone,
  };
  if (state.preset === 'custom' && (!body.startDate || !body.endDate)) {
    $('rangePreview').innerHTML = '<span class="muted">시작일과 종료일을 선택하세요.</span>';
    return;
  }
  try {
    const { range, compareRange } = await apiJson('/api/date-range/resolve', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    state.range = range;
    state.compareRange = compareRange;
    if (state.preset !== 'custom') {
      $('startDate').value = range.startDate;
      $('endDate').value = range.endDate;
    }
    $('rangePreview').innerHTML = `
      <dl>
        <dt>분석 기간</dt><dd>${range.startDate} ~ ${range.endDate} (${range.days}일)</dd>
        <dt>비교 기간</dt><dd>${
          compareRange
            ? `${compareRange.startDate} ~ ${compareRange.endDate} · ${escapeHtml(compareRange.label)}`
            : '비교 없음'
        }</dd>
      </dl>`;
  } catch (err) {
    $('rangePreview').innerHTML = `<span class="warn">${escapeHtml(err.message)}</span>`;
  }
}

/* ────────────────────────────────────────────────────────
 * 이벤트
 * ──────────────────────────────────────────────────────── */
function bindEvents() {
  $('presetGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    state.preset = btn.dataset.preset;
    document.querySelectorAll('#presetGroup .chip').forEach((c) => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    $('customRange').classList.toggle('hidden', state.preset !== 'custom');
    refreshRange();
  });

  $('compareMode').addEventListener('change', (e) => {
    state.compareMode = e.target.value;
    refreshRange();
  });

  ['startDate', 'endDate'].forEach((id) => {
    $(id).addEventListener('change', () => {
      if (state.preset === 'custom') refreshRange();
    });
  });

  $('propertySearch').addEventListener('input', (e) => renderPropertyOptions(e.target.value));
  $('propertySelect').addEventListener('change', (e) => selectProperty(e.target.value));

  $('sectionList').addEventListener('change', () => {
    state.sectionKeys = Array.from(
      document.querySelectorAll('#sectionList input:checked')
    ).map((i) => i.value);
  });

  $('previewBtn').addEventListener('click', runPreview);
  $('downloadBtn').addEventListener('click', downloadPptx);

  const demoBtn = $('demoBtn');
  if (demoBtn) demoBtn.addEventListener('click', runDemo);
}

/** GA4 연동 전 결과 형태 확인용 (모의 데이터) */
async function runDemo() {
  setBusy(true, '샘플 데이터를 불러오는 중입니다…');
  try {
    const data = await apiJson('/api/report/demo');
    renderReport(data);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

function currentRequestBody() {
  return {
    propertyId: state.property?.propertyId,
    preset: state.preset,
    startDate: $('startDate').value,
    endDate: $('endDate').value,
    compareMode: state.compareMode,
    sectionKeys: state.sectionKeys,
  };
}

function validate() {
  if (!state.property) {
    setStatus('GA4 속성을 선택해 주세요.', 'error');
    return false;
  }
  if (state.sectionKeys.length === 0) {
    setStatus('분석 항목을 1개 이상 선택해 주세요.', 'error');
    return false;
  }
  return true;
}

async function runPreview() {
  if (!validate()) return;
  setBusy(true, 'GA4 데이터를 수집하고 분석하는 중입니다…');
  setStatus('');
  try {
    const data = await apiJson('/api/report/preview', {
      method: 'POST',
      body: JSON.stringify(currentRequestBody()),
    });
    renderReport(data);
    setStatus('데이터 미리보기를 생성했습니다. 내용 확인 후 PPT를 생성하세요.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function downloadPptx() {
  if (!validate()) return;
  setBusy(true, 'GA4 데이터를 수집하고 PPT 보고서를 생성하는 중입니다…');
  setStatus('');
  try {
    const res = await api('/api/report/pptx', {
      method: 'POST',
      body: JSON.stringify(currentRequestBody()),
    });
    const blob = await res.blob();
    const fileName = parseFileName(res.headers.get('Content-Disposition')) || 'GA4_report.pptx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus(`PPT 보고서를 생성했습니다. (${fileName})`, 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

function parseFileName(disposition) {
  if (!disposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : null;
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  location.href = '/';
}

/* ────────────────────────────────────────────────────────
 * 렌더링 · 결과 영역
 * ──────────────────────────────────────────────────────── */
function renderReport(data) {
  $('emptyState').classList.add('hidden');

  const head = $('reportHead');
  head.classList.remove('hidden');
  head.innerHTML = `
    <div>
      <h2>${escapeHtml(data.property.propertyName)}
        ${data.isSample ? '<span class="badge sample-flag">샘플 데이터</span>' : ''}</h2>
      <div class="sub">
        분석 기간 ${data.range.startDate} ~ ${data.range.endDate} (${data.range.days}일)
        ${
          data.compareRange
            ? ` · 비교 ${data.compareRange.startDate} ~ ${data.compareRange.endDate} (${escapeHtml(data.compareRange.label)})`
            : ''
        }
      </div>
    </div>
    ${
      data.isSample
        ? '<a class="btn btn--primary btn--sm" href="/api/report/demo.pptx">샘플 PPT 다운로드</a>'
        : '<button class="btn btn--primary btn--sm" id="headDownload">PPT 다운로드</button>'
    }`;
  if (!data.isSample) $('headDownload').addEventListener('click', downloadPptx);

  $('reportBody').innerHTML =
    data.sections.map((s) => renderSectionCard(s, data)).join('') + renderSummaryCard(data);
}

function renderSectionCard(section, data) {
  const badge =
    section.status === 'empty'
      ? '<span class="badge badge--empty">데이터 없음</span>'
      : section.status === 'error'
      ? '<span class="badge badge--error">조회 실패</span>'
      : '';

  const primary = section.totals?.[section.primaryMetric];
  const delta = primary ? fmtDelta(primary.deltaRate) : null;

  const kpi =
    section.status === 'ok' && primary
      ? `<div class="card__kpi">
           <span class="label">${escapeHtml(primary.label)} 합계</span>
           <span class="value">${fmtNum(primary.value)}</span>
           ${
             data.compareRange
               ? `<div class="delta ${delta.cls}">${escapeHtml(data.compareRange.label)} 대비 ${delta.text}</div>`
               : ''
           }
         </div>`
      : '';

  const criteria = `측정 기준: ${section.dimensions.map((d) => d.label).join(', ')} · 측정 항목: ${section.metrics
    .map((m) => m.label)
    .join(', ')} · 필터: ${section.filterDescription}`;

  const body =
    section.status === 'ok'
      ? renderSectionTable(section, data)
      : `<div class="notice">${escapeHtml(section.message)}<br /><small>적용 필터: ${escapeHtml(
          section.filterDescription
        )}</small></div>`;

  const insights = (section.insights || [])
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join('');

  return `
    <article class="card">
      <div class="card__head">
        <div>
          <div class="card__title">${escapeHtml(section.title)} ${badge}</div>
          <div class="card__criteria">${escapeHtml(criteria)}</div>
        </div>
        ${kpi}
      </div>
      ${body}
      <div class="insights">
        <h4>분석 내용</h4>
        <ul>${insights}</ul>
      </div>
    </article>`;
}

function renderSectionTable(section, data) {
  const dims = section.dimensions;
  const showDelta = section.compareAvailable;
  const maxValue = section.rows.reduce(
    (m, r) => Math.max(m, r.metrics[section.primaryMetric] || 0),
    0
  );

  const header = `
    <tr>
      <th class="num">No.</th>
      ${dims.map((d) => `<th>${escapeHtml(d.label)}</th>`).join('')}
      ${section.metrics.map((m) => `<th class="num">${escapeHtml(m.label)}</th>`).join('')}
      <th class="num">비중</th>
      ${showDelta ? '<th class="num">증감</th><th class="num">증감률</th>' : ''}
    </tr>`;

  const rows = section.rows
    .map((row) => {
      const d = fmtDelta(row.deltaRate);
      const value = row.metrics[section.primaryMetric] || 0;
      const width = maxValue ? (value / maxValue) * 100 : 0;
      return `
      <tr>
        <td class="num">${row.rank}</td>
        ${row.labels
          .map((l, i) => `<td class="name" title="${escapeHtml(l)}">${escapeHtml(l)}</td>`)
          .join('')}
        ${section.metrics
          .map((m, i) =>
            i === 0
              ? `<td class="num">
                   <span class="bar-cell">
                     <span class="bar-cell__track"><span class="bar-cell__fill" style="width:${width.toFixed(1)}%"></span></span>
                     <span>${fmtNum(row.metrics[m.name] || 0)}</span>
                   </span>
                 </td>`
              : `<td class="num">${fmtNum(row.metrics[m.name] || 0)}</td>`
          )
          .join('')}
        <td class="num">${fmtPct(row.share)}</td>
        ${
          showDelta
            ? `<td class="num">${row.diff === null ? (row.isNew ? '신규' : '-') : fmtNum(row.diff)}</td>
               <td class="num delta ${d.cls}">${d.text}</td>`
            : ''
        }
      </tr>`;
    })
    .join('');

  const colSpanBefore = 1 + dims.length;
  const rest = section.restRow
    ? `<tr class="rest">
         <td class="num">-</td>
         <td colspan="${dims.length}">${escapeHtml(section.restRow.label)}</td>
         <td class="num">${fmtNum(section.restRow.value)}</td>
         ${section.metrics.slice(1).map(() => '<td class="num">-</td>').join('')}
         <td class="num">${fmtPct(section.restRow.share)}</td>
         ${showDelta ? '<td class="num">-</td><td class="num">-</td>' : ''}
       </tr>`
    : '';

  const totalDelta = fmtDelta(section.totals[section.primaryMetric]?.deltaRate);
  const total = `
    <tr class="total">
      <td class="num">-</td>
      <td colspan="${dims.length}">합계 (전체 ${fmtNum(section.rowCount)}행)</td>
      ${section.metrics
        .map((m) => `<td class="num">${fmtNum(section.totals[m.name]?.value || 0)}</td>`)
        .join('')}
      <td class="num">100.0%</td>
      ${
        showDelta
          ? `<td class="num">${
              section.totals[section.primaryMetric]?.diff === null
                ? '-'
                : fmtNum(section.totals[section.primaryMetric]?.diff)
            }</td>
             <td class="num delta ${totalDelta.cls}">${totalDelta.text}</td>`
          : ''
      }
    </tr>`;

  return `<div class="table-wrap"><table class="data">
      <thead>${header}</thead>
      <tbody>${rows}${rest}${total}</tbody>
    </table></div>`;
}

function renderSummaryCard(data) {
  const rows = data.summary.items
    .map((item) => {
      const d = fmtDelta(item.deltaRate);
      return `
        <tr>
          <td><strong>${escapeHtml(item.title)}</strong></td>
          <td>${escapeHtml(item.metricLabel)}</td>
          <td class="num">${item.value === null ? '-' : fmtNum(item.value)}</td>
          <td class="num delta ${d.cls}">${d.text}</td>
          <td class="name" title="${escapeHtml(item.topLabel)}">${escapeHtml(item.topLabel)}</td>
          <td class="num">${item.topShare === null || item.topShare === undefined ? '-' : fmtPct(item.topShare)}</td>
        </tr>`;
    })
    .join('');

  return `
    <article class="card">
      <div class="card__head">
        <div>
          <div class="card__title">주요 데이터 요약</div>
          <div class="card__criteria">PPT 마지막 장에 삽입되는 요약 데이터입니다.</div>
        </div>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr>
          <th>분석 항목</th><th>측정 항목</th><th class="num">합계</th>
          <th class="num">증감률</th><th>최상위 항목</th><th class="num">비중</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </article>`;
}

init().catch((err) => {
  console.error(err);
  setStatus(`초기화 실패: ${err.message}`, 'error');
});
