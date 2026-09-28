'use strict';

/* ══════════════════════════════════════════════════════════
 * 상단 탭 전환
 * ══════════════════════════════════════════════════════════ */

const VIEW_META = {
  ga4: { sub: 'OAuth 로그인 → 속성/기간 선택 → 데이터 수집 → PPT 다운로드' },
  media: { sub: '매체 RAW 업로드 → 표준 스키마 자동 취합 → GA4 연동 통합 분석' },
};

function showView(view) {
  const target = VIEW_META[view] ? view : 'ga4';
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('hidden', el.id !== `view-${target}`));
  document.querySelectorAll('.tabs .tab').forEach((tab) => {
    const active = tab.dataset.view === target;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $('brandSub').textContent = VIEW_META[target].sub;
  if (location.hash !== `#${target}`) history.replaceState(null, '', `#${target}`);
  if (target === 'media') Media.onShow();
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) showView(tab.dataset.view);
});

/* ══════════════════════════════════════════════════════════
 * 매체별 엑셀 데이터 취합
 * ══════════════════════════════════════════════════════════ */

const Media = (() => {
  const st = {
    loaded: false,
    config: null,
    workspace: null,
    ga4Mode: 'none',
    rangeTouched: false,
    propertiesLoaded: false,
    openMapping: new Set(),
  };

  const won = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : `₩${fmtNum(Math.round(v))}`);
  const num = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : fmtNum(Math.round(v)));
  const pct = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : fmtPct(v, d));
  const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

  function status(message, type = '') {
    const bar = $('mediaStatus');
    bar.textContent = message;
    bar.className = `status ${type ? `is-${type}` : ''}`;
    bar.classList.toggle('hidden', !message);
  }

  async function request(path, options = {}) {
    const res = await fetch(path, options);
    if (!res.ok) {
      let message = `요청 실패 (${res.status})`;
      try {
        const data = await res.json();
        message = data.message || message;
      } catch (e) { /* JSON 아님 */ }
      throw new Error(message);
    }
    return res;
  }

  const json = (path, method = 'GET', body) =>
    request(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => r.json());

  async function withBusy(text, fn) {
    setBusy(true, text);
    try {
      return await fn();
    } catch (err) {
      status(err.message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }

  /* ── 초기화 ─────────────────────────────────────────── */

  async function onShow() {
    if (st.loaded) return;
    st.loaded = true;
    bind();
    syncXlsxButtons();
    try {
      st.config = await json('/api/media/config');
      $('dropHint').textContent = `${st.config.media
        .filter((m) => m.id !== 'etc')
        .map((m) => m.label)
        .join(' · ')} 등 매체 다운로드 파일 (${st.config.limits.allowedExt.join(' ')}, 최대 ${st.config.limits.maxFileSizeMB}MB)`;
      render(await json('/api/media/workspace'));
    } catch (err) {
      status(err.message, 'error');
    }
  }

  function bind() {
    const input = $('mediaFiles');
    input.addEventListener('change', () => {
      if (input.files.length) upload(input.files);
      input.value = '';
    });

    const zone = $('dropzone');
    ['dragenter', 'dragover'].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.add('is-over');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.remove('is-over');
      })
    );
    zone.addEventListener('drop', (e) => {
      if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files);
    });

    $('mediaDemoBtn').addEventListener('click', () =>
      withBusy('샘플 RAW 파일을 불러오는 중입니다…', async () => {
        render(await json('/api/media/demo', 'POST'));
        status('샘플 RAW 파일 4개(네이버·메타·카카오·구글)를 불러왔습니다.', 'success');
      })
    );

    $('costBasis').addEventListener('change', (e) =>
      withBusy('광고비 기준을 변경하는 중입니다…', async () => {
        render(await json('/api/media/basis', 'PUT', { basis: e.target.value }));
      })
    );

    $('ga4ModeGroup').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-mode]');
      if (chip) setGa4Mode(chip.dataset.mode);
    });

    ['mediaStart', 'mediaEnd'].forEach((id) =>
      $(id).addEventListener('change', () => {
        st.rangeTouched = true;
      })
    );

    $('includeGa4Sections').addEventListener('change', syncCompareField);

    $('integratedPreviewBtn').addEventListener('click', preview);
    $('integratedPptBtn').addEventListener('click', () =>
      download('/api/integrated/pptx', 'POST', '통합 보고서 PPT를 생성하는 중입니다…')
    );
    $('integratedXlsxBtn').addEventListener('click', () =>
      download('/api/integrated/xlsx', 'POST', 'GA4 통합 분석 엑셀을 생성하는 중입니다…')
    );
    $('standardXlsxBtn').addEventListener('click', () =>
      download('/api/media/export.xlsx', 'GET', '표준 데이터 엑셀(전체 기간)을 생성하는 중입니다…')
    );

    // 파일 카드 이벤트 (위임)
    const files = $('mediaFilesCard');
    files.addEventListener('change', onFileControlChange);
    files.addEventListener('click', onFileControlClick);
  }

  /* ── 업로드 · 보정 ──────────────────────────────────── */

  function upload(fileList) {
    const form = new FormData();
    Array.from(fileList).forEach((f) => form.append('files', f, f.name));
    return withBusy(`파일 ${fileList.length}개를 읽고 표준화하는 중입니다…`, async () => {
      const res = await request('/api/media/files', { method: 'POST', body: form });
      const ws = await res.json();
      render(ws);
      const failed = ws.files.filter((f) => f.status === 'error').length;
      status(
        failed ? `업로드 완료 — ${failed}개 파일은 처리하지 못했습니다. 파일 목록을 확인해 주세요.` : '업로드한 파일을 표준 스키마로 취합했습니다.',
        failed ? 'error' : 'success'
      );
    });
  }

  function patchFile(id, patch) {
    return withBusy('변경 사항을 반영하는 중입니다…', async () => {
      render(await json(`/api/media/files/${id}`, 'PATCH', patch));
    });
  }

  function onFileControlChange(e) {
    const el = e.target;
    const id = el.closest('[data-file]')?.dataset.file;
    if (!id) return;
    if (el.matches('.js-media')) patchFile(id, { media: el.value });
    else if (el.matches('.js-vat')) patchFile(id, { vatIncluded: el.checked });
    else if (el.matches('.js-header')) {
      const n = Number(el.value);
      if (Number.isInteger(n) && n >= 1) patchFile(id, { headerRowIndex: n - 1 });
    } else if (el.matches('.js-map')) {
      patchFile(id, { mapping: { [el.dataset.field]: Number(el.value) } });
    }
  }

  function onFileControlClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.closest('[data-file]')?.dataset.file;
    if (btn.matches('.js-toggle-map') && id) {
      if (st.openMapping.has(id)) st.openMapping.delete(id);
      else st.openMapping.add(id);
      renderFiles(st.workspace);
    } else if (btn.matches('.js-remove') && id) {
      withBusy('파일을 삭제하는 중입니다…', async () => {
        st.openMapping.delete(id);
        render(await json(`/api/media/files/${id}`, 'DELETE'));
      });
    } else if (btn.matches('.js-clear')) {
      if (!confirm('업로드한 파일을 모두 비울까요?')) return;
      withBusy('작업 공간을 비우는 중입니다…', async () => {
        st.openMapping.clear();
        st.rangeTouched = false;
        render(await json('/api/media/workspace', 'DELETE'));
        $('integratedResult').innerHTML = '';
      });
    }
  }

  /* ── GA4 연동 설정 ──────────────────────────────────── */

  async function setGa4Mode(mode) {
    st.ga4Mode = mode;
    document.querySelectorAll('#ga4ModeGroup .chip').forEach((c) => c.classList.toggle('is-active', c.dataset.mode === mode));
    $('ga4PropertyBox').classList.toggle('hidden', mode !== 'ga4');
    $('includeGa4Sections').disabled = mode === 'none';
    if (mode === 'none') $('includeGa4Sections').checked = false;
    syncCompareField();
    syncXlsxButtons();
    if (mode === 'ga4') await loadProperties();
  }

  /** GA4 통합 분석 엑셀은 GA4 를 연동했을 때만 표준 데이터 엑셀과 내용이 달라지므로 그때만 활성화한다. */
  function syncXlsxButtons() {
    const enabled = st.ga4Mode !== 'none';
    const btn = $('integratedXlsxBtn');
    btn.disabled = !enabled;
    btn.title = enabled ? '' : 'GA4 연동(속성 연동 또는 샘플 GA4) 시 사용할 수 있습니다.';
    $('xlsxHint').textContent = enabled
      ? '표준 데이터 엑셀: 업로드한 전체 기간 · 매체 데이터만 / GA4 통합 분석 엑셀: 선택 기간 · 매체×GA4 시트 3개 추가'
      : 'GA4 통합 분석 엑셀은 2단계에서 GA4를 연동하면 사용할 수 있습니다. (매체×GA4 · 캠페인 매칭 · 미매칭 유입 시트 추가)';
  }

  function syncCompareField() {
    $('mediaCompareField').classList.toggle('hidden', !$('includeGa4Sections').checked || st.ga4Mode !== 'ga4');
  }

  async function loadProperties() {
    const auth = await json('/api/auth/status');
    $('mediaLoginNote').classList.toggle('hidden', auth.authenticated);
    $('mediaPropertyField').classList.toggle('hidden', !auth.authenticated);
    if (!auth.authenticated || st.propertiesLoaded) return;
    const select = $('mediaPropertySelect');
    select.innerHTML = '<option value="">불러오는 중…</option>';
    try {
      const { accounts } = await json('/api/properties');
      select.innerHTML = accounts
        .map(
          (a) =>
            `<optgroup label="${escapeHtml(a.accountName)}">${a.properties
              .map((p) => `<option value="${p.propertyId}">${escapeHtml(p.propertyName)} (${p.propertyId})</option>`)
              .join('')}</optgroup>`
        )
        .join('') || '<option value="">접근 가능한 속성이 없습니다</option>';
      // GA4 탭에서 선택한 속성이 있으면 그대로 사용
      if (typeof state !== 'undefined' && state.property?.propertyId) select.value = state.property.propertyId;
      st.propertiesLoaded = true;
    } catch (err) {
      select.innerHTML = '<option value="">속성 조회 실패</option>';
      status(err.message, 'error');
    }
  }

  function requestBody() {
    const body = {
      startDate: $('mediaStart').value || undefined,
      endDate: $('mediaEnd').value || undefined,
      includeGa4Sections: $('includeGa4Sections').checked,
    };
    if (st.ga4Mode === 'demo') body.demoGa4 = true;
    if (st.ga4Mode === 'ga4') {
      body.propertyId = $('mediaPropertySelect').value;
      if (body.includeGa4Sections) {
        const cmp = $('mediaCompare').value;
        body.compareMode = cmp === 'none' ? undefined : cmp;
      }
    }
    return body;
  }

  function validate() {
    if (!st.workspace?.summary.rowCount) {
      status('먼저 매체 RAW 파일을 업로드해 주세요.', 'error');
      return false;
    }
    if (st.ga4Mode === 'ga4' && !$('mediaPropertySelect').value) {
      status('GA4 속성을 선택하거나, GA4 연동 방식을 “연동 안 함”으로 바꿔 주세요.', 'error');
      return false;
    }
    return true;
  }

  async function preview() {
    if (!validate()) return;
    await withBusy('매체 데이터와 GA4 데이터를 통합 분석하는 중입니다…', async () => {
      const data = await json('/api/integrated/preview', 'POST', requestBody());
      renderIntegrated(data);
      status(`${data.hasGa4 ? '매체 × GA4' : '매체'} 통합 분석을 완료했습니다.`, 'success');
      $('integratedResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function download(path, method, text) {
    if (path !== '/api/media/export.xlsx' && !validate()) return;
    if (path === '/api/media/export.xlsx' && !st.workspace?.summary.rowCount) {
      status('내보낼 매체 데이터가 없습니다.', 'error');
      return;
    }
    await withBusy(text, async () => {
      const res = await request(path, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify(requestBody()) : undefined,
      });
      const blob = await res.blob();
      const name = parseFileName(res.headers.get('Content-Disposition')) || 'download';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      status(`다운로드했습니다. (${name})`, 'success');
    });
  }

  /* ── 렌더링 ─────────────────────────────────────────── */

  function render(ws) {
    st.workspace = ws;
    $('costBasis').value = ws.basis;
    const has = ws.files.length > 0;
    $('mediaEmpty').classList.toggle('hidden', has);

    const range = ws.summary.dateRange;
    if (range && !st.rangeTouched) {
      $('mediaStart').value = range.startDate;
      $('mediaEnd').value = range.endDate;
    }
    $('mediaRangeHint').textContent = range
      ? `매체 데이터 기간: ${range.startDate} ~ ${range.endDate} (${range.days}일)${
          ws.summary.undatedRows ? ` · 일자 없는 행 ${ws.summary.undatedRows}건 포함` : ''
        }`
      : '업로드한 매체 데이터의 기간이 기본값으로 채워집니다.';

    renderFiles(ws);
    renderSummary(ws);
    renderPreview(ws);
  }

  function mediaOptions(selected) {
    return st.config.media
      .map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${escapeHtml(m.label)}</option>`)
      .join('');
  }

  function renderFiles(ws) {
    if (!ws.files.length) {
      $('mediaFilesCard').innerHTML = '';
      return;
    }
    const rows = ws.files
      .map((f) => {
        if (f.status === 'error') {
          return `
          <div class="file-row is-error" data-file="${f.id}">
            <div class="file-row__main">
              <div class="file-row__name">${escapeHtml(f.name)}</div>
              <div class="file-row__meta warn">${escapeHtml(f.error)}</div>
            </div>
            <div class="file-row__actions"><button type="button" class="btn btn--ghost btn--sm js-remove">삭제</button></div>
          </div>`;
        }
        const s = f.stats || {};
        const conf = f.detectedMedia?.confidence;
        const confLabel = { high: '자동 인식', medium: '추정', low: '확인 필요' }[conf] || '';
        const excluded = Object.entries(f.excluded || {})
          .map(([k, v]) => `${k} ${v}건`)
          .join(' · ');
        const period = s.dateMin ? `${s.dateMin} ~ ${s.dateMax}` : f.periodRange ? f.periodRange.join(' ~ ') : '일자 없음';
        const warnings = (f.warnings || [])
          .map((w) => `<li>${escapeHtml(w)}</li>`)
          .join('');
        return `
        <div class="file-row" data-file="${f.id}">
          <div class="file-row__main">
            <div class="file-row__name">
              <span class="media-dot" style="background:#${f.mediaColor}"></span>${escapeHtml(f.name)}
              <span class="file-row__size">${kb(f.size)}</span>
            </div>
            <div class="file-row__meta">
              ${escapeHtml(f.format.toUpperCase())}${f.encoding ? ` · ${escapeHtml(f.encoding)}` : ''} · 시트 ${escapeHtml(f.sheetName)}
              · 헤더 <input class="js-header mini-input" type="number" min="1" max="${f.totalSheetRows}" value="${f.headerRowIndex + 1}" />행
              · ${period} · ${fmtNum(s.rowCount || 0)}행${excluded ? ` <span class="muted">(제외: ${escapeHtml(excluded)})</span>` : ''}
            </div>
            ${warnings ? `<ul class="file-row__warn">${warnings}</ul>` : ''}
          </div>
          <div class="file-row__side">
            <label class="mini-field">매체
              <select class="js-media">${mediaOptions(f.media)}</select>
              ${confLabel ? `<span class="badge ${conf === 'low' ? 'badge--empty' : 'badge--note'}" title="${escapeHtml(f.detectedMedia.reason)}">${confLabel}</span>` : ''}
            </label>
            <label class="mini-check" title="${f.vatDetected === null ? '헤더에 VAT 표기가 없어 직접 지정' : '광고비 헤더에서 자동 인식'}">
              <input type="checkbox" class="js-vat" ${f.vatIncluded ? 'checked' : ''} /> 원본 광고비 VAT 포함
            </label>
            <div class="file-row__cost">광고비 ${won(s.cost)}</div>
          </div>
          <div class="file-row__actions">
            <button type="button" class="btn btn--ghost btn--sm js-toggle-map">${st.openMapping.has(f.id) ? '매핑 닫기' : '컬럼 매핑'}</button>
            <button type="button" class="btn btn--ghost btn--sm js-remove">삭제</button>
          </div>
          ${st.openMapping.has(f.id) ? renderMapping(f) : ''}
        </div>`;
      })
      .join('');

    $('mediaFilesCard').innerHTML = `
      <article class="card">
        <div class="card__head">
          <div>
            <div class="card__title">업로드 파일 <span class="badge badge--note">${ws.files.length}개</span></div>
            <div class="card__criteria">매체 · 헤더 행 · VAT · 컬럼 매핑을 자동 인식했습니다. 틀린 부분은 바로 수정하면 다시 계산됩니다.</div>
          </div>
          <button type="button" class="btn btn--ghost btn--sm js-clear">모두 비우기</button>
        </div>
        <div class="file-list">${rows}</div>
      </article>`;
  }

  function renderMapping(f) {
    const options = (selected) =>
      `<option value="-1">— 사용 안 함 —</option>${f.headers
        .map(
          (h) =>
            `<option value="${h.index}" ${h.index === selected ? 'selected' : ''}>${escapeHtml(h.label)}${
              h.sample ? ` · 예: ${escapeHtml(String(h.sample).slice(0, 18))}` : ''
            }</option>`
        )
        .join('')}`;
    const cells = st.config.fields
      .map((field) => {
        const col = f.mapping[field.key];
        const auto = f.autoMapping?.[field.key];
        const changed = col !== auto;
        return `
          <label class="map-cell ${col === undefined ? 'is-empty' : ''}">
            <span>${escapeHtml(field.label)}${changed ? ' <em>수정됨</em>' : ''}</span>
            <select class="js-map" data-field="${field.key}">${options(col === undefined ? -1 : col)}</select>
          </label>`;
      })
      .join('');
    return `<div class="map-grid">${cells}</div>`;
  }

  function renderSummary(ws) {
    const s = ws.summary;
    if (!s.rowCount) {
      $('mediaSummaryCard').innerHTML = '';
      return;
    }
    const basis = ws.basis === 'incl' ? 'VAT 포함' : 'VAT 별도';
    const t = s.totals;
    const rows = s.byMedia
      .map(
        (m) => `
        <tr>
          <td><span class="media-dot" style="background:#${m.color}"></span>${escapeHtml(m.label)}</td>
          <td class="num">${won(m.cost)}</td>
          <td class="num">${pct(m.costShare)}</td>
          <td class="num">${num(m.impressions)}</td>
          <td class="num">${num(m.clicks)}</td>
          <td class="num">${pct(m.ctr, 2)}</td>
          <td class="num">${won(m.cpc)}</td>
          <td class="num">${num(m.conversions)}</td>
          <td class="num">${won(m.cpa)}</td>
          <td class="num">${pct(m.roas, 0)}</td>
        </tr>`
      )
      .join('');
    $('mediaSummaryCard').innerHTML = `
      <article class="card">
        <div class="card__head">
          <div>
            <div class="card__title">표준 통합 요약</div>
            <div class="card__criteria">
              ${s.dateRange ? `${s.dateRange.startDate} ~ ${s.dateRange.endDate} (${s.dateRange.days}일)` : '일자 정보 없음'}
              · 표준 행 ${fmtNum(s.rowCount)} · 캠페인 ${fmtNum(s.campaignCount)}개 · 광고비 ${basis}
            </div>
          </div>
          <div class="card__kpi">
            <span class="label">총 광고비</span>
            <span class="value">${won(t.cost)}</span>
          </div>
        </div>
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>매체</th><th class="num">광고비</th><th class="num">비중</th><th class="num">노출</th>
            <th class="num">클릭</th><th class="num">CTR</th><th class="num">CPC</th>
            <th class="num">전환</th><th class="num">CPA</th><th class="num">ROAS</th>
          </tr></thead>
          <tbody>${rows}
            <tr class="total">
              <td>합계</td><td class="num">${won(t.cost)}</td><td class="num">100.0%</td>
              <td class="num">${num(t.impressions)}</td><td class="num">${num(t.clicks)}</td>
              <td class="num">${pct(t.ctr, 2)}</td><td class="num">${won(t.cpc)}</td>
              <td class="num">${num(t.conversions)}</td><td class="num">${won(t.cpa)}</td><td class="num">${pct(t.roas, 0)}</td>
            </tr>
          </tbody>
        </table></div>
      </article>`;
  }

  function renderPreview(ws) {
    if (!ws.preview.length) {
      $('mediaPreviewCard').innerHTML = '';
      return;
    }
    const mediaLabel = Object.fromEntries(st.config.media.map((m) => [m.id, m.label]));
    const rows = ws.preview
      .map(
        (r) => `
        <tr>
          <td>${r.date || '-'}</td>
          <td>${escapeHtml(mediaLabel[r.media] || r.media)}</td>
          <td class="name" title="${escapeHtml(r.campaign)}">${escapeHtml(r.campaign)}</td>
          <td class="name" title="${escapeHtml(r.adGroup)}">${escapeHtml(r.adGroup || '-')}</td>
          <td class="name" title="${escapeHtml(r.creative)}">${escapeHtml(r.creative || '-')}</td>
          <td class="num">${num(r.impressions)}</td>
          <td class="num">${num(r.clicks)}</td>
          <td class="num">${num(r.cost)}</td>
          <td class="num">${num(r.conversions)}</td>
          <td class="num">${num(r.conversionValue)}</td>
        </tr>`
      )
      .join('');
    $('mediaPreviewCard').innerHTML = `
      <article class="card">
        <div class="card__head">
          <div>
            <div class="card__title">표준 데이터 미리보기</div>
            <div class="card__criteria">전체 ${fmtNum(ws.summary.rowCount)}행 중 앞 ${ws.preview.length}행 · 전체 데이터는 “표준 데이터 엑셀 (전체 기간)”으로 받을 수 있습니다.</div>
          </div>
        </div>
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>일자</th><th>매체</th><th>캠페인</th><th>광고그룹</th><th>소재/키워드</th>
            <th class="num">노출</th><th class="num">클릭</th><th class="num">광고비</th><th class="num">전환</th><th class="num">전환매출</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </article>`;
  }

  function insightList(title, lines) {
    if (!lines || !lines.length) return '';
    return `<div class="insights"><h4>${escapeHtml(title)}</h4><ul>${lines
      .map((l) => `<li>${escapeHtml(l)}</li>`)
      .join('')}</ul></div>`;
  }

  function renderIntegrated(d) {
    const t = d.totals;
    const ga4 = d.hasGa4;
    const kpis = [
      ['총 광고비', won(t.cost)],
      ['클릭', num(t.clicks)],
      ...(ga4
        ? [
            ['GA4 유료 세션', num(t.sessions)],
            ['클릭→세션 도달률', pct(t.arrivalRate)],
            ['세션당 비용', won(t.costPerSession)],
            [d.hasRevenue ? 'GA4 ROAS' : 'GA4 CPA', d.hasRevenue ? pct(t.ga4Roas, 0) : won(t.ga4Cpa)],
          ]
        : [
            ['CTR', pct(t.ctr, 2)],
            ['CPC', won(t.cpc)],
            ['전환 (매체 보고)', num(t.conversions)],
          ]),
    ]
      .map(([l, v]) => `<div class="kpi-tile"><span>${escapeHtml(l)}</span><strong>${v}</strong></div>`)
      .join('');

    const mediaRows = d.byMedia
      .map(
        (m) => `
        <tr>
          <td><span class="media-dot" style="background:#${m.color}"></span>${escapeHtml(m.label)}</td>
          <td class="num">${won(m.cost)}</td>
          <td class="num">${num(m.clicks)}</td>
          ${
            ga4
              ? `<td class="num">${num(m.sessions)}</td>
                 <td class="num">${pct(m.arrivalRate)}</td>
                 <td class="num">${won(m.costPerSession)}</td>
                 <td class="num">${num(m.keyEvents)}</td>
                 <td class="num">${d.hasRevenue ? pct(m.ga4Roas, 0) : won(m.ga4Cpa)}</td>`
              : `<td class="num">${pct(m.ctr, 2)}</td><td class="num">${won(m.cpc)}</td><td class="num">${num(m.conversions)}</td><td class="num">${won(m.cpa)}</td>`
          }
        </tr>`
      )
      .join('');

    const campaignRows = d.byCampaign
      .slice(0, 15)
      .map(
        (c) => `
        <tr>
          <td>${escapeHtml(c.mediaLabel)}</td>
          <td class="name" title="${escapeHtml(c.campaign)}">${escapeHtml(c.campaign)}</td>
          <td class="num">${won(c.cost)}</td>
          <td class="num">${num(c.clicks)}</td>
          ${
            ga4
              ? `<td class="num">${c.matched ? num(c.sessions) : '-'}</td>
                 <td class="num">${c.matched ? (d.hasRevenue ? pct(c.ga4Roas, 0) : num(c.keyEvents)) : '-'}</td>
                 <td><span class="badge ${c.matched ? 'badge--ok' : 'badge--error'}">${c.matched ? '매칭' : '미매칭'}</span></td>`
              : `<td class="num">${pct(c.ctr, 2)}</td><td class="num">${won(c.cpa)}</td>`
          }
        </tr>`
      )
      .join('');

    const unmatched = ga4 && d.unmatchedGa4.length
      ? `
        <h4 class="sub-title">GA4 미매칭 유료 유입</h4>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>소스 / 매체</th><th>GA4 캠페인</th><th>사유</th><th class="num">세션</th><th class="num">전환</th></tr></thead>
          <tbody>${d.unmatchedGa4
            .slice(0, 8)
            .map(
              (u) => `<tr><td>${escapeHtml(u.source)} / ${escapeHtml(u.medium)}</td><td class="name">${escapeHtml(u.campaign)}</td>
                <td>${escapeHtml(u.reason)}</td><td class="num">${num(u.sessions)}</td><td class="num">${num(u.keyEvents)}</td></tr>`
            )
            .join('')}</tbody>
        </table></div>`
      : '';

    $('integratedResult').innerHTML = `
      <article class="card card--accent">
        <div class="card__head">
          <div>
            <div class="card__title">${ga4 ? '매체 × GA4 통합 분석' : '매체 통합 분석'}
              ${d.isSample ? '<span class="badge sample-flag">샘플 GA4</span>' : ''}</div>
            <div class="card__criteria">
              ${d.range.startDate} ~ ${d.range.endDate} (${d.range.days}일)
              ${ga4 ? ` · GA4 속성 ${escapeHtml(d.property.propertyName)}` : ' · GA4 미연동'}
              ${d.ga4SectionsIncluded ? ' · GA4 기본 분석 포함' : ''}
            </div>
          </div>
        </div>
        <div class="kpi-tiles">${kpis}</div>

        <h4 class="sub-title">매체별 ${ga4 ? '통합 지표' : '효율'}</h4>
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>매체</th><th class="num">광고비</th><th class="num">클릭</th>
            ${
              ga4
                ? `<th class="num">GA4 세션</th><th class="num">도달률</th><th class="num">세션당 비용</th><th class="num">GA4 전환</th><th class="num">${d.hasRevenue ? 'GA4 ROAS' : 'GA4 CPA'}</th>`
                : '<th class="num">CTR</th><th class="num">CPC</th><th class="num">전환</th><th class="num">CPA</th>'
            }
          </tr></thead>
          <tbody>${mediaRows}</tbody>
        </table></div>
        ${insightList('매체 성과', d.insights.media)}
        ${insightList('일별 추이', d.insights.daily)}
        ${ga4 ? insightList('매체 × GA4', d.insights.integration) : ''}

        <h4 class="sub-title">캠페인 ${ga4 ? `매칭 (${d.matchStats.matched}/${d.matchStats.campaigns} · 광고비 기준 ${pct(d.matchStats.matchedCostShare)})` : '성과'}</h4>
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>매체</th><th>캠페인</th><th class="num">광고비</th><th class="num">클릭</th>
            ${ga4 ? `<th class="num">GA4 세션</th><th class="num">${d.hasRevenue ? 'ROAS' : '전환'}</th><th>매칭</th>` : '<th class="num">CTR</th><th class="num">CPA</th>'}
          </tr></thead>
          <tbody>${campaignRows}</tbody>
        </table></div>
        ${insightList('캠페인', d.insights.campaign)}
        ${unmatched}
      </article>`;
  }

  return { onShow };
})();

// 매체 탭에서 로그인하면 OAuth 복귀 후에도 매체 탭으로 돌아온다.
document.addEventListener('click', (e) => {
  if (e.target.closest('#mediaLoginNote a')) {
    try {
      sessionStorage.setItem('returnView', 'media');
    } catch (err) { /* 저장소 사용 불가 */ }
  }
});

(function initView() {
  let saved = null;
  try {
    saved = sessionStorage.getItem('returnView');
    sessionStorage.removeItem('returnView');
  } catch (err) { /* 저장소 사용 불가 */ }
  showView(saved || (location.hash || '').replace('#', '') || 'ga4');
})();
