# API 명세 및 데이터 구조

기획서 10장 "이후 해당 MD 문서를 기준으로 실제 개발에 필요한 API 명세 및 데이터 구조(JSON Schema 등)를 구체화" 에 해당하는 문서입니다.

Base URL: `http://localhost:3000`
인증: 서버 세션 쿠키 (`ga4report.sid`). OAuth 액세스 토큰은 **서버 세션에만** 저장되며 브라우저로 전달되지 않습니다.

---

## 1. 인증

### `GET /auth/google`
Google OAuth 동의 화면으로 리디렉션합니다. 요청 scope 는 `analytics.readonly`, `openid`, `email`, `profile` 입니다.

### `GET /auth/google/callback`
OAuth 콜백. `state` 검증 후 토큰을 세션에 저장하고 `/?auth=success` 로 리디렉션합니다.
실패 시 `/?auth_error=<사유>` 로 리디렉션합니다.

### `POST /auth/logout`
토큰을 revoke 하고 세션을 파기합니다.

```json
{ "ok": true }
```

---

## 2. 조회 API

### `GET /api/auth/status`

화면 초기화용. 인증 여부 · 기간 프리셋 · 분석 항목 정의를 함께 반환합니다.

```json
{
  "authenticated": true,
  "user": { "email": "user@example.com", "name": "…", "picture": "…" },
  "configured": true,
  "presets": [{ "value": "last30", "label": "최근 30일" }],
  "compareModes": [{ "value": "previous", "label": "직전 기간 대비" }],
  "sections": [
    {
      "key": "natural_inflow",
      "title": "자연 유입 분석",
      "shortTitle": "자연 유입",
      "description": "광고성 CPC 유입을 제외한 자연 유입 성과",
      "dimensions": ["sessionCampaignName", "sessionSourceMedium"],
      "metrics": ["sessions"],
      "filter": "세션 캠페인에 '(' 포함 · 세션 소스/매체에 'cpc' 포함 제외"
    }
  ]
}
```

### `GET /api/properties`

로그인 계정이 접근 가능한 GA4 계정 및 속성 목록. (Admin API `accountSummaries.list`)

```json
{
  "accounts": [
    {
      "accountId": "123456",
      "accountName": "사내 계정",
      "properties": [{ "propertyId": "987654321", "propertyName": "웹사이트 속성" }]
    }
  ]
}
```

### `GET /api/properties/:propertyId`

속성 상세 및 데이터 조회 권한 확인.

```json
{
  "property": {
    "propertyId": "987654321",
    "propertyName": "웹사이트 속성",
    "timeZone": "Asia/Seoul",
    "currencyCode": "KRW",
    "createTime": "2023-04-01T00:00:00Z"
  },
  "access": { "ok": true }
}
```

권한이 없을 경우:

```json
{ "property": { … }, "access": { "ok": false, "message": "User does not have sufficient permissions…" } }
```

### `POST /api/date-range/resolve`

프리셋을 실제 날짜로 변환합니다. (속성 타임존 기준)

**Request**

```json
{
  "preset": "lastMonth",
  "startDate": "2026-08-01",
  "endDate": "2026-08-31",
  "compareMode": "previous",
  "timeZone": "Asia/Seoul"
}
```

| 필드 | 값 |
|---|---|
| `preset` | `last7` `last30` `last90` `lastMonth` `thisMonth` `custom` |
| `compareMode` | `none` `previous` `previousYear` |
| `startDate` / `endDate` | `preset = custom` 일 때 필수 (`YYYY-MM-DD`) |

**Response**

```json
{
  "today": "2026-09-21",
  "range":        { "startDate": "2026-08-01", "endDate": "2026-08-31", "label": "전월", "days": 31 },
  "compareRange": { "startDate": "2026-07-01", "endDate": "2026-07-31", "label": "전월", "days": 31 }
}
```

---

## 3. 보고서 API

### `POST /api/report/preview`

GA4 데이터를 수집·가공하여 **보고서 데이터(JSON)** 를 반환합니다. PPT 생성 전 화면 확인용이며, PPT 와 동일한 데이터를 사용합니다.

**Request**

```json
{
  "propertyId": "987654321",
  "preset": "lastMonth",
  "startDate": "2026-08-01",
  "endDate": "2026-08-31",
  "compareMode": "previous",
  "sectionKeys": ["page_path", "natural_inflow", "campaign_inflow",
                  "custom_event", "demographics", "device", "region"]
}
```

`sectionKeys` 생략 또는 빈 배열이면 7개 항목 전체를 조회합니다.

**Response** — 아래 4장 스키마 참조.

### `POST /api/report/pptx`

동일 Request 로 PPT 파일을 생성해 바이너리로 반환합니다.

```
Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation
Content-Disposition: attachment; filename="report.pptx";
                     filename*=UTF-8''GA4_%EB%B6%84%EC%84%9D%EB%B3%B4%EA%B3%A0%EC%84%9C_...pptx
```

### `GET /api/report/demo` · `GET /api/report/demo.pptx`

GA4 연동 없이 레이아웃을 확인하기 위한 **모의 데이터** 응답입니다. 운영 데이터와 무관합니다.
응답에는 `"isSample": true` 플래그가 포함됩니다.

---

## 4. 보고서 데이터 구조 (JSON Schema)

```jsonc
{
  "property":     { "propertyId": "…", "propertyName": "…", "timeZone": "Asia/Seoul", "currencyCode": "KRW" },
  "range":        { "startDate": "2026-08-01", "endDate": "2026-08-31", "label": "전월", "days": 31 },
  "compareRange": { "startDate": "2026-07-01", "endDate": "2026-07-31", "label": "전월", "days": 31 },
  "generatedAt":  "2026-09-21T09:00:00.000Z",
  "sections": [ /* Section */ ],
  "overallSessions": 3620,      // 세션 기준 섹션 중 최대 합계 (캠페인 유입 비중 산출용)
  "summary": {
    "items": [                  // 핵심 요약 슬라이드의 '영역별 요약' 표
      {
        "title": "자연 유입",
        "metricLabel": "세션수",
        "value": 4459,
        "deltaRate": 11.7,
        "topLabel": "(direct) / (direct) / (none)",
        "topShare": 23.4,
        "note": ""
      }
    ],
    "headline": [               // 표지 · 요약 슬라이드 상단 대표 지표 (최대 4개)
      { "key": "page_path", "label": "페이지 경로 조회수", "value": "5,428",
        "unit": "회", "deltaRate": 28.7 }
    ],
    "highlights": [             // 요약 슬라이드 '주요 인사이트' 카드 (최대 3개)
      { "title": "전 지표 상승", "lines": ["전주 대비 페이지 경로 ▲ 28.7% · 자연 유입 ▲ 36.8%"] }
    ],
    "context": { "compare": true }
  }
}
```

### Section

```jsonc
{
  "key": "natural_inflow",
  "no": "02",                   // PPT 헤더 번호 배지
  "en": "ORGANIC TRAFFIC",      // PPT 헤더 영문 레이블
  "title": "자연 유입 분석",
  "shortTitle": "자연 유입",
  "description": "광고성 CPC 유입을 제외한 자연 유입 성과",

  "status": "ok",               // ok | empty | error
  "message": "",                // empty/error 사유

  "dimensions": [{ "name": "sessionCampaignName", "label": "세션 캠페인" }],
  "metrics":    [{ "name": "sessions", "label": "세션수", "unit": "세션" }],
  "primaryMetric": "sessions",  // 정렬·비중 기준 지표
  "unit": "세션",
  "filterDescription": "세션 캠페인에 '(' 포함 · 세션 소스/매체에 'cpc' 포함 제외",
  "topN": 10,

  "compareAvailable": true,     // 비교 기간 데이터 확보 여부
  "compareError": null,         // 비교 기간만 실패한 경우 사유
  "fallbackApplied": false,     // 대체 지표 사용 여부
  "fallbackReason": null,

  "grandTotal": 4459,           // primaryMetric 전체 합계 (limit 초과분 포함)
  "rowCount": 132,              // API 가 보고한 전체 행 수
  "topShare": 95.9,             // 상위 N 집중도 (%, 최대 100)
  "lowData": false,             // 표본 과소 (행 3개 이하 또는 합계 20 미만)
  "footnote": null,             // Dimension 조합 합계가 원본 합계를 초과할 때의 안내 문구
  "checklist": null,            // 표본 과소 캠페인 섹션의 점검 항목

  "totals": {
    "sessions": {
      "label": "세션수",
      "unit": "세션",
      "value": 4459,
      "prevValue": 3991,        // 비교 없음 → null
      "diff": 468,              // 비교 없음 → null
      "deltaRate": 11.7         // 비교값 0 또는 없음 → null
    }
  },

  "kpis": [                     // PPT 상단 카드 4장 (status=ok 일 때만)
    { "label": "세션수 합계", "value": "4,459", "unit": "세션",
      "delta": 11.7, "deltaLabel": "vs 전주" },
    { "label": "전주 세션수", "value": "3,991", "unit": "세션",
      "cap": "+468 세션", "capTone": "up" },
    { "label": "(direct) 비중", "value": "44.5", "unit": "%",
      "cap": "(direct) / (direct) / (none)" },
    { "label": "상위 10 집중도", "value": "95.9", "unit": "%",
      "cap": "기타 55건 4.1%" }
  ],

  "rows": [ /* Row, 상위 topN */ ],

  "restRow": {                  // 상위 N 이외 합계. 없으면 null
    "label": "기타 (55건)",
    "count": 55,
    "value": 196,
    "share": 4.4
  },

  "groupSummary": [             // 도넛/묶은막대 항목만. 그 외 null
    { "label": "모바일", "value": 2900, "share": 65.0 }
  ],

  "chart": { /* Chart */ },
  "insights": ["(direct) 1,609세션(44.5%)로 1위", "…"]
}
```

### Row

```jsonc
{
  "rank": 1,
  "key": "(direct)(direct) / (none)",   // Dimension 값 조합 키
  "raw": ["(direct)", "(direct) / (none)"],   // GA4 원본 값
  "labels": ["(direct)", "(direct) / (none)"],// 표기용(한글 치환 적용)
  "label": "(direct) / (direct) / (none)",
  "chartLabel": "(direct) / (none)",          // 길이 제한 적용
  "metrics": { "sessions": 1042 },
  "share": 23.4,
  "prevMetrics": { "sessions": 781 },         // 비교 없음 → null
  "diff": 261,                                // 비교 없음 → null
  "deltaRate": 33.4,                          // 비교값 0/없음 → null
  "isNew": false                              // 비교 기간에 없던 항목
}
```

### Chart

```jsonc
// 1) cmp — 비교 기간 대비 Top 5 가로 막대
{
  "type": "cmp",
  "title": "전주 대비 Top 5",
  "hasCompare": true,
  "items": [{ "label": "google", "current": 1380, "previous": 1322 }]
}

// 2) demo — 연령 × 성별 묶은 세로 막대
{
  "type": "demo",
  "title": "연령대별 성별 세션수",
  "cats": ["18-24", "25-34", "35-44"],
  "series": [{ "name": "여성", "values": [477, 429, 64] },
             { "name": "남성", "values": [125, 228, 80] }]
}

// 3) donut — 1번째 Dimension 구성비
{
  "type": "donut",
  "title": "기기 카테고리 구성",
  "cats": ["데스크톱", "모바일", "태블릿"],
  "values": [3262, 378, 27],
  "shares": [90.1, 10.4, 0.7],
  "center": { "value": "90.1%", "label": "데스크톱" }
}

// 데이터가 없을 때
{ "type": "cmp", "title": "…", "empty": true }
```

---

## 5. 오류 응답

모든 API 오류는 동일 형식입니다.

```json
{ "error": "GA4_API_ERROR", "message": "User does not have sufficient permissions for this property." }
```

| HTTP | `error` | 상황 |
|---|---|---|
| 400 | `INTERNAL_ERROR` | 잘못된 기간/속성 파라미터 |
| 401 | `NOT_AUTHENTICATED` | 미로그인 또는 토큰 만료 |
| 403 | `GA4_API_ERROR` | 속성 접근 권한 없음 |
| 429 | `GA4_API_ERROR` | GA4 API 할당량 초과 |
| 500 | `INTERNAL_ERROR` | 그 외 서버 오류 |

섹션 단위 오류는 HTTP 오류가 아니라 응답 본문의 `sections[].status = "error"` 로 전달됩니다.
일부 섹션이 실패해도 보고서 생성은 계속됩니다.
