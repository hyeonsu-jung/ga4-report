'use strict';

/**
 * 샘플 보고서 생성기 (GA4 연동 없이 파이프라인 검증용)
 *
 *   node scripts/sample-report.js [출력경로.pptx]
 *
 * 모의 GA4 응답으로 가공 → 분석 문구 → PPT 생성 흐름을 확인한다.
 */

const fs = require('fs');
const path = require('path');
const { buildSampleReport } = require('../src/services/sampleData');
const pptBuilder = require('../src/services/pptBuilder');

async function main() {
  const args = process.argv.slice(2);
  const emptyIdx = args.indexOf('--empty');
  const emptyKeys = emptyIdx >= 0 ? (args[emptyIdx + 1] || '').split(',').filter(Boolean) : [];
  const target = args.find((a) => !a.startsWith('--') && a !== args[emptyIdx + 1]);

  const outPath = path.resolve(target || path.join(__dirname, '..', 'sample_GA4_report.pptx'));

  const data = buildSampleReport({ emptyKeys });
  const buffer = await pptBuilder.buildPresentation(data);
  fs.writeFileSync(outPath, buffer);

  console.log('샘플 보고서를 생성했습니다.');
  console.log(`  파일: ${outPath}`);
  console.log(`  크기: ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`  슬라이드: 표지 + 개요 + ${data.sections.length}개 분석 + 요약`);
  data.sections.forEach((s) => {
    console.log(
      `   - ${s.shortTitle.padEnd(8)} ${s.status.padEnd(6)} rows=${s.rows.length} insights=${s.insights.length}`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
