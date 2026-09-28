'use strict';

/**
 * 매체 × GA4 통합 보고서 샘플 생성 (GA4 연동 없이 전체 흐름 검증)
 *
 *   node scripts/sample-integrated.js [--no-ga4] [--with-ga4-sections]
 *
 * samples/media 의 RAW 파일을 표준화 → 모의 GA4 유료 유입과 통합 →
 * sample_integrated_report.pptx / sample_integrated_data.xlsx 생성
 */

const fs = require('fs');
const path = require('path');
const { readFile } = require('../src/services/media/fileReader');
const normalizer = require('../src/services/media/normalizer');
const agg = require('../src/services/media/mediaAggregator');
const { integrate } = require('../src/services/integration/integrator');
const { buildSampleTraffic } = require('../src/services/integration/sampleTraffic');
const { buildIntegratedPresentation } = require('../src/services/integration/integratedPpt');
const { buildWorkbook } = require('../src/services/media/excelExporter');
const { buildSampleReport } = require('../src/services/sampleData');

const SAMPLE_DIR = path.join(__dirname, '..', 'samples', 'media');

async function loadSampleFiles(basis = 'excl') {
  const files = [];
  for (const name of fs.readdirSync(SAMPLE_DIR)) {
    const analyzed = normalizer.analyzeWorkbook(await readFile(fs.readFileSync(path.join(SAMPLE_DIR, name)), name), name);
    const file = { ...analyzed, id: name, name };
    const result = normalizer.normalizeFile(file, basis);
    files.push({ file, result });
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  const withGa4 = !args.includes('--no-ga4');
  const withSections = args.includes('--with-ga4-sections');

  const loaded = await loadSampleFiles();
  const rows = loaded.flatMap((f) => f.result.rows);
  const range = agg.dateRangeOf(rows);
  const integration = integrate(rows, withGa4 ? buildSampleTraffic(rows) : null);

  const property = { propertyId: '000000000', propertyName: '샘플 속성 (Sample Property)', timeZone: 'Asia/Seoul' };
  const pptBuffer = await buildIntegratedPresentation({
    property,
    range,
    basis: 'excl',
    fileCount: loaded.length,
    integration,
    ga4Report: withSections ? buildSampleReport() : null,
  });
  const pptPath = path.join(__dirname, '..', 'sample_integrated_report.pptx');
  fs.writeFileSync(pptPath, pptBuffer);

  const xlsx = await buildWorkbook({
    rows,
    basis: 'excl',
    summary: integration.summary,
    files: loaded.map(({ file, result }) => ({
      name: file.name,
      status: 'ok',
      format: file.format,
      encoding: file.encoding,
      sheetName: file.sheetName,
      headerRowIndex: file.headerRowIndex,
      mediaLabel: normalizer.getMedia(file.media).label,
      stats: normalizer.summarizeFile(result.rows),
      excluded: result.excluded,
      vatIncluded: file.vatIncluded,
      mapping: file.mapping,
      headers: file.headers.map((h) => ({ label: h })),
      warnings: normalizer.buildWarnings(file, result),
    })),
    integration: withGa4 ? integration : null,
  });
  const xlsxPath = path.join(__dirname, '..', 'sample_integrated_data.xlsx');
  fs.writeFileSync(xlsxPath, xlsx);

  console.log('통합 샘플을 생성했습니다.');
  console.log(`  PPT  : ${pptPath} (${(pptBuffer.length / 1024).toFixed(0)} KB)`);
  console.log(`  XLSX : ${xlsxPath} (${(xlsx.length / 1024).toFixed(0)} KB)`);
  console.log(`  기간 : ${range.startDate} ~ ${range.endDate} · 매체 ${integration.byMedia.length}개 · GA4 ${withGa4 ? '연동(모의)' : '미연동'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
