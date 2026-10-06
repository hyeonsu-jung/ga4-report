# 마케팅 리포트 자동화 솔루션

상단 탭으로 두 기능을 제공합니다.

| 탭 | 기능 |
|---|---|
| **GA4 PPT 분석 보고서** | GA4 OAuth 로그인 → 속성/기간 선택 → GA4 Data API 조회 → 가공·분석 → PPT 자동 생성·다운로드 |
| **매체별 엑셀 데이터 취합** | 매체별 RAW(네이버·메타·카카오·구글·엑스·크리테오·틱톡·당근 등) 업로드 → 표준 스키마 자동 취합 → GA4 데이터와 통합 분석 → PPT·엑셀 |

서비스 소개 페이지: [`/intro.html`](public/intro.html) · 제품 소개서: [`introduction/마케팅_리포트_자동화_소개서.pptx`](introduction/마케팅_리포트_자동화_소개서.pptx)

기획서: [`GA4_PPT_분석_보고서_자동_생성_솔루션_기획.md`](GA4_PPT_분석_보고서_자동_생성_솔루션_기획.md)

| 문서 | 내용 |
|---|---|
| [docs/01_데이터_정의서.md](docs/01_데이터_정의서.md) | 분석 항목 · Dimension/Metric · Filter · 가공 기준 · PPT 구성 · 문구 생성 · 예외 처리 |
| [docs/02_API_명세.md](docs/02_API_명세.md) | REST API 명세 및 보고서 데이터 구조(JSON Schema) |
| [docs/03_매체_데이터_취합_정의서.md](docs/03_매체_데이터_취합_정의서.md) | 매체 RAW 표준 스키마 · 자동 인식 규칙 · GA4 매칭 규칙 · 통합 보고서 구성 · API |

---

## 1. 빠른 시작

```bash
npm install
cp .env.example .env    # Windows PowerShell: Copy-Item .env.example .env
npm start
```

`http://localhost:3000` 접속 → **Google 계정으로 GA4 로그인**.

GA4 연동 전에 결과 형태만 보려면 로그인 화면의 **샘플 데이터로 미리보기** 를 누르거나,

```bash
node scripts/sample-report.js
```

를 실행해 `sample_GA4_report.pptx` 를 생성해 확인할 수 있습니다.
`--empty region,demographics` 처럼 옵션을 주면 데이터 없음 레이아웃도 함께 확인할 수 있습니다.

매체 취합 기능은 **매체별 엑셀 데이터 취합** 탭의 **샘플 RAW 파일로 체험** 또는 아래 명령으로 확인할 수 있습니다.

```bash
node scripts/make-media-samples.js
```

```bash
node scripts/sample-integrated.js --with-ga4-sections
```

`samples/media/` 에 매체별 RAW 샘플 4종이 만들어지고, 모의 GA4 데이터와 통합한 `sample_integrated_report.pptx` · `sample_integrated_data.xlsx` 가 생성됩니다.

---

## 2. Google Cloud 설정

1. [Google Cloud Console](https://console.cloud.google.com/) 에서 프로젝트 생성
2. **API 및 서비스 > 라이브러리** 에서 아래 2개 API 사용 설정
   - Google Analytics Data API
   - Google Analytics Admin API
3. **OAuth 동의 화면** 구성 (외부 / 내부). 테스트 상태라면 사용할 계정을 테스트 사용자에 추가
4. **사용자 인증 정보 > OAuth 클라이언트 ID > 웹 애플리케이션** 생성
   - 승인된 리디렉션 URI: `http://localhost:3000/auth/google/callback`
5. 발급된 클라이언트 ID/보안 비밀을 `.env` 에 입력

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
SESSION_SECRET=충분히-긴-임의-문자열
```

요청 권한은 읽기 전용(`analytics.readonly`)이며, 토큰은 서버 세션에만 저장됩니다.

---

## 3. 사용 흐름

```
1. 솔루션 접속
2. "GA4 로그인" 클릭 → Google OAuth 인증
3. GA4 속성 선택          (계정별 그룹 · 검색 지원, 데이터 조회 권한 자동 확인)
4. 분석 기간 선택          (최근 7/30/90일, 전월, 당월, 직접 설정 + 비교 기간)
5. 분석 항목 선택          (7개 영역, 기본 전체)
6. "데이터 미리보기"       → 표·비중·증감·분석 문구를 화면에서 확인
7. "PPT 보고서 생성·다운로드"
```

---

## 4. 생성되는 보고서

다크 테마 기반 16:9 슬라이드로 생성됩니다.

| 슬라이드 | 내용 |
|---|---|
| 1 | 표지 — 좌측 메타 패널(기간·비교 기간·속성 ID·생성일시) + 대표 지표 3종 |
| 2 | 핵심 요약 — 대표 KPI 4장 · 영역별 요약 표 · 주요 인사이트 3카드 |
| 3 | 분석 개요 — 속성 정보 · 분석 항목 구성 · 보고서 읽는 법 |
| 4~10 | 페이지 경로 / 자연 유입 / 캠페인 유입 / 맞춤 이벤트 / 성연령 / 기기 / 지역 |

각 분석 슬라이드 구성

```
헤더(번호 배지 · 영문 레이블 · 제목 · 측정 기준/항목/필터)
  → KPI 카드 4장 (합계 · 비교 기간 · 섹션별 대표 비중 · 집중도)
  → 상위 N 상세 테이블 (기타 / 합계 행 포함)
  → 차트 (비교 Top 5 · 연령×성별 · 기기 도넛)
  → 분석 인사이트
  → 푸터(속성 · 기간 · 페이지 번호)
```

예외 상황도 레이아웃이 깨지지 않습니다.

- 데이터 0건 · 조회 실패 → `NO DATA` 패널 + 적용 필터 표기
- 표본 과소(행 3개 이하 또는 합계 20 미만) → 차트 대신 수치 비교 바 + 점검 체크리스트
- Dimension 조합 합계가 GA4 원본 합계를 초과 → 표 하단 각주 표기

---

## 5. 매체별 엑셀 데이터 취합

```
1. 매체 RAW 파일 업로드 (여러 개 · 드래그 앤 드롭 · .xlsx/.csv, CP949 CSV 포함)
2. 자동 인식 확인 · 보정     헤더 행 / 매체 / 컬럼 매핑 / 광고비 VAT — 틀린 부분은 화면에서 바로 수정
3. 표준 통합 결과 확인        매체별 요약 · 표준 데이터 미리보기 · 표준 데이터 엑셀(전체 기간) 다운로드
4. GA4 연동 (선택)            GA4 속성 선택 → 같은 기간의 GA4 유료 유입과 매체 · 일자 · 캠페인 기준 매칭
5. 통합 분석 미리보기 → 통합 보고서 PPT / GA4 통합 분석 엑셀(선택 기간 · GA4 연동 시)
```

| 구분 | 내용 |
|---|---|
| 표준 스키마 | 일자 · 매체 · 캠페인 · 광고그룹 · 소재/키워드 · 기기 · 노출 · 클릭 · 광고비 · 전환 · 전환매출 · 도달 · 동영상 조회 |
| 자동 인식 | 제목/조회기간 행 건너뛰기, 합계·요약 행 제외, 날짜 형식 7종, VAT포함 헤더 인식 후 VAT 기준 통일 |
| 통합 지표 | 매체별 클릭→세션 도달률 · 세션당 비용 · GA4 CPA · GA4 ROAS · 유료 유입 비중 |
| 통합 보고서 | 표지 → 매체 성과 요약 → 일별 추이 → (GA4 연동 시) 매체 × GA4 통합 지표 → (선택) GA4 기본 분석 7개 영역. GA4 미연동 시에만 캠페인 성과 포함 |

설정은 `src/config/mediaConfig.js` 한 곳에서 관리합니다 (헤더 동의어, 매체 판별 키워드, GA4 소스 매칭, 유료 utm_medium 정규식). 상세 규칙은 [docs/03_매체_데이터_취합_정의서.md](docs/03_매체_데이터_취합_정의서.md) 를 참고하세요.

---

## 6. 수집 데이터 정의

| 분석 항목 | Dimension | Metric | 필터 |
|---|---|---|---|
| 페이지 경로 | `unifiedPagePathScreen` | `screenPageViews` | - |
| 자연 유입 | `sessionCampaignName`, `sessionSourceMedium` | `sessions` | 캠페인에 `(` 포함 / 소스·매체 `cpc` 제외 |
| 캠페인 유입 | `sessionManualCampaignName`, `sessionManualSourceMedium`, `sessionManualAdContent` | `sessions` | 수동 캠페인명에 `(` 제외 |
| 맞춤 이벤트 | `eventName` | `eventCount`, `totalUsers` | 기본/자동수집 이벤트 제외 |
| 성연령 | `userGender`, `userAgeBracket` | `sessions` | `unknown` 제외 |
| 기기 | `deviceCategory`, `operatingSystem` | `sessions` | - |
| 지역 | `region`, `city` | `sessions` | - |

상세 기준은 [docs/01_데이터_정의서.md](docs/01_데이터_정의서.md) 를 참고하세요.

---

## 7. 설정 변경

| 대상 | 파일 |
|---|---|
| 필터 조건 (제외 이벤트, 정규식, 캠페인 조건 등) | `src/config/filters.json` |
| 분석 항목 · Dimension/Metric · 상위 N · 차트 유형 | `src/config/analysisConfig.js` |
| PPT 색상 · 폰트 · 브랜드 · 좌표 | `src/config/theme.js` |
| PPT 슬라이드/컴포넌트 구현 | `src/services/pptBuilder.js` |
| KPI 카드 산출 로직 | `src/services/dataProcessor.js` (`buildSectionKpis`) |
| 분석 문구 규칙 | `src/services/insightGenerator.js` |
| API 동시 호출 수 · 조회 행 수 | `.env` (`GA4_API_CONCURRENCY`, `GA4_ROW_LIMIT`) |

브랜딩·폰트는 `.env` 로도 바꿀 수 있습니다 (모두 선택 항목).

```env
REPORT_FONT=Pretendard            # PPT 폰트 (미설치 환경은 Malgun Gothic 등으로 대체)
REPORT_LOGO_PATH=D:/assets/logo.png   # 지정 시 워드마크 대신 로고 이미지 사용
REPORT_BRAND_PREFIX=kt
REPORT_BRAND_NAME=nasmedia
```

필터는 JSON 만 수정하면 반영됩니다. 예를 들어 제외 이벤트를 추가하려면:

```jsonc
"custom_event": {
  "conditions": [
    { "dimension": "eventName", "operator": "not_in_list",
      "values": ["page_view", "session_start", "…", "추가_이벤트"] }
  ]
}
```

---

## 8. 프로젝트 구조

```
src/
  server.js                  Express 진입점
  config/
    index.js                 환경 변수
    analysisConfig.js        7개 분석 영역 정의 (단일 정의 지점)
    theme.js                 PPT 디자인 토큰 (색상·폰트·브랜드·좌표)
    mediaConfig.js           매체 RAW 표준 스키마 · 헤더 동의어 · 매체/GA4 매칭 규칙
    filters.json             필터 조건
  routes/
    auth.js                  OAuth 라우트
    api.js                   조회/보고서 API
    media.js                 매체 업로드 · 표준화 · 통합 분석 API
  services/
    googleAuth.js            OAuth 클라이언트 · 토큰 관리
    ga4Client.js             Admin/Data API 호출 · 필터 컴파일
    dataProcessor.js         정렬/상위N/비중/기간비교/차트 데이터
    insightGenerator.js      규칙 기반 분석 문구
    pptBuilder.js            PPT 슬라이드 생성 (다크 테마 디자인 시스템)
    sampleData.js            데모용 모의 데이터
    media/                   매체 RAW 읽기 · 정규화 · 작업 공간 · 집계 · 엑셀
    integration/             GA4 유료 유입 조회 · 매체×GA4 매칭 · 통합 PPT
  utils/
    dateRange.js             기간/비교기간 계산
    format.js                숫자·증감률 포맷
public/                      프런트엔드 (app.js: GA4 탭 · media.js: 매체 취합 탭)
scripts/sample-report.js     샘플 PPT 생성 CLI
scripts/make-media-samples.js    매체 RAW 샘플 생성
scripts/sample-integrated.js     매체 × GA4 통합 샘플 생성
samples/media/               매체 RAW 샘플 (네이버 CSV · 메타 · 카카오 · 구글)
docs/                        데이터 정의서 · API 명세
```

---

## 9. 운영 시 확인 사항

- **세션 저장소** — 기본값은 메모리 스토어입니다. 다중 인스턴스 배포 시 Redis 등 외부 스토어로 교체하세요.
- **HTTPS 배포** — `src/server.js` 의 `cookie.secure` 를 `true` 로 변경하고, OAuth 리디렉션 URI 를 배포 도메인으로 등록하세요.
- **GA4 API 할당량** — 항목 7개 × 기간 2개 = 최대 14회 요청이 발생합니다. 동시 호출 수는 `GA4_API_CONCURRENCY` 로 조절합니다.
- **PPT 한글 폰트** — 슬라이드는 `Pretendard` 로 지정됩니다. 보고서를 열 PC에 폰트가 없으면 시스템 대체 폰트로 표시되므로, 배포 대상이 정해져 있다면 `REPORT_FONT` 를 사내 표준 폰트로 지정하는 것을 권장합니다.
- **매체 작업 공간** — 업로드한 매체 데이터는 서버 메모리에 세션 단위로 보관되며 8시간 미사용 시 정리됩니다. 서버를 재시작하면 다시 업로드해야 합니다.
- **데이터 지연** — GA4 는 최근 24~48시간 데이터가 확정되지 않을 수 있어, 기간 프리셋의 종료일은 **어제**로 설정됩니다.
