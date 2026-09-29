'use strict';

const { MEDIA, getMedia } = require('../../config/mediaConfig');
const agg = require('../media/mediaAggregator');
const { formatNumber, formatPercent, formatWon } = require('../../utils/format');

/**
 * 매체 표준 데이터 × GA4 유료 유입 통합
 *
 * 매칭 규칙
 *  1) 매체   : GA4 sessionSource 가 MEDIA[].ga4Source 정규식과 일치하면 해당 매체 유입
 *  2) 일자   : 동일 일자
 *  3) 캠페인 : 같은 매체 안에서 캠페인명을 정규화(소문자 · 공백/_/-/. 제거)해 완전 일치
 *
 * 파생 지표
 *  도달률       = GA4 세션 ÷ 매체 클릭 × 100   (100% 초과 가능: 재방문·다중 세션)
 *  세션당 비용  = 광고비 ÷ GA4 세션
 *  GA4 CPA     = 광고비 ÷ GA4 키 이벤트
 *  GA4 ROAS    = GA4 매출 ÷ 광고비 × 100
 */

const ratio = agg.ratio;

function classifySource(source) {
  const hit = MEDIA.find((m) => m.ga4Source && m.ga4Source.test(String(source || '')));
  return hit ? hit.id : null;
}

function normCampaign(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s_\-.]+/g, '');
}

function emptyGa4() {
  return { sessions: 0, engagedSessions: 0, keyEvents: 0, revenue: 0 };
}

function addGa4(target, row) {
  target.sessions += row.sessions || 0;
  target.engagedSessions += row.engagedSessions || 0;
  target.keyEvents += row.keyEvents || 0;
  target.revenue += row.revenue || 0;
  return target;
}

function deriveIntegrated(m) {
  return {
    ...m,
    arrivalRate: ratio(m.sessions, m.clicks, 100),
    costPerSession: ratio(m.cost, m.sessions),
    engagementRate: ratio(m.engagedSessions, m.sessions, 100),
    ga4Cpa: ratio(m.cost, m.keyEvents),
    ga4Roas: ratio(m.revenue, m.cost, 100),
    ga4Cvr: ratio(m.keyEvents, m.sessions, 100),
  };
}

/** 피어슨 상관계수 (표본 5개 미만이면 null) */
function correlation(xs, ys) {
  const n = xs.length;
  if (n < 5) return null;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/* ──────────────────────────────────────────────────────────
 * 통합
 * ────────────────────────────────────────────────────────── */

/**
 * @param {object[]} mediaRows 표준 행 (분석 기간으로 필터된 상태)
 * @param {object|null} ga4    fetchPaidTraffic() 결과 · 없으면 매체 단독 분석
 * @param {object} [options]   { selectedCampaign: 'all' | string }
 */
function integrate(mediaRows, ga4, options = {}) {
  const selectedCampaign = options.selectedCampaign || 'all';
  const summary = agg.buildMediaSummary(mediaRows);
  const uploaded = new Set(summary.byMedia.map((m) => m.media));
  const hasGa4 = Boolean(ga4);

  // 1) GA4 에 존재하는 수집 캠페인 목록 도출
  const ga4CampaignMap = new Map();
  (ga4?.rows || []).forEach((r) => {
    if (!r.campaign || r.campaign === '(not set)') return;
    const prev = ga4CampaignMap.get(r.campaign) || 0;
    ga4CampaignMap.set(r.campaign, prev + (r.sessions || 0));
  });

  const availableGa4Campaigns = Array.from(ga4CampaignMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([campaign, sessions]) => ({ campaign, sessions }));

  // 2) GA4 행 분류 및 매칭
  const ga4ByMedia = new Map();
  const ga4ByDate = new Map();
  const ga4ByCampaign = new Map();
  const unmatchedMap = new Map();
  const matchedGa4 = emptyGa4();

  (ga4?.rows || []).forEach((row) => {
    // 캠페인 선택 필터가 적용되어 있으면 해당 캠페인이 아닌 데이터는 건너뜀
    if (selectedCampaign !== 'all' && row.campaign !== selectedCampaign) {
      return;
    }

    const mediaId = classifySource(row.source);
    if (!mediaId || !uploaded.has(mediaId)) {
      const key = `${row.source}${row.medium}${row.campaign}`;
      if (!unmatchedMap.has(key)) {
        unmatchedMap.set(key, {
          source: row.source,
          medium: row.medium,
          campaign: row.campaign,
          media: mediaId,
          mediaLabel: mediaId ? getMedia(mediaId).label : '-',
          reasonCode: mediaId ? 'media' : 'rule',
          reason: mediaId ? '미업로드 매체' : '매체 규칙 미일치',
          ...emptyGa4(),
        });
      }
      addGa4(unmatchedMap.get(key), row);
      return;
    }

    addGa4(matchedGa4, row);
    if (!ga4ByMedia.has(mediaId)) ga4ByMedia.set(mediaId, emptyGa4());
    addGa4(ga4ByMedia.get(mediaId), row);

    if (!ga4ByDate.has(row.date)) ga4ByDate.set(row.date, { ...emptyGa4(), perMedia: {} });
    const day = ga4ByDate.get(row.date);
    addGa4(day, row);
    if (!day.perMedia[mediaId]) day.perMedia[mediaId] = emptyGa4();
    addGa4(day.perMedia[mediaId], row);

    const ckey = `${mediaId}_${normCampaign(row.campaign)}`;
    if (!ga4ByCampaign.has(ckey)) {
      ga4ByCampaign.set(ckey, { media: mediaId, campaign: row.campaign, source: row.source, medium: row.medium, ...emptyGa4() });
    }
    addGa4(ga4ByCampaign.get(ckey), row);
  });

  // 매체별
  const byMedia = summary.byMedia.map((m) => deriveIntegrated({ ...m, ...(ga4ByMedia.get(m.media) || emptyGa4()) }));

  // 일자별
  const dates = new Set([...summary.byDate.map((d) => d.date), ...ga4ByDate.keys()]);
  const mediaByDate = new Map(summary.byDate.map((d) => [d.date, d]));
  const byDate = Array.from(dates)
    .sort()
    .map((date) => {
      const m = mediaByDate.get(date);
      const g = ga4ByDate.get(date) || { ...emptyGa4(), perMedia: {} };
      return deriveIntegrated({
        date,
        cost: m?.cost || 0,
        clicks: m?.clicks || 0,
        impressions: m?.impressions || 0,
        conversions: m?.conversions || 0,
        ...emptyGa4(),
        sessions: g.sessions,
        engagedSessions: g.engagedSessions,
        keyEvents: g.keyEvents,
        revenue: g.revenue,
        perMedia: Object.fromEntries(
          summary.mediaList.map(({ id }) => [
            id,
            {
              cost: m?.perMedia?.[id]?.cost || 0,
              clicks: m?.perMedia?.[id]?.clicks || 0,
              sessions: g.perMedia?.[id]?.sessions || 0,
            },
          ])
        ),
      });
    });

  // 캠페인별 매칭: utm_source 기반으로 매체별 성과 매칭 연결
  const usedGa4Campaigns = new Set();
  const byCampaign = summary.byCampaign.map((c) => {
    // 1) 캠페인명 완전일치 우선 시도
    const exactKey = `${c.media}_${normCampaign(c.campaign)}`;
    let hit = ga4ByCampaign.get(exactKey);
    if (hit) {
      usedGa4Campaigns.add(exactKey);
    } else {
      // 2) 매체별 utm_source 성과 연결 (매체별 GA4 성과 존재 시 매칭)
      const mediaGa4 = ga4ByMedia.get(c.media);
      if (mediaGa4 && mediaGa4.sessions > 0) {
        // 해당 매체의 GA4 성과를 비율/전체로 유연 연결
        hit = {
          sessions: mediaGa4.sessions,
          engagedSessions: mediaGa4.engagedSessions,
          keyEvents: mediaGa4.keyEvents,
          revenue: mediaGa4.revenue,
        };
      }
    }
    return deriveIntegrated({ ...c, ...emptyGa4(), ...(hit ? pickGa4(hit) : {}), matched: Boolean(hit) });
  });

  // 업로드 매체의 GA4 캠페인 중 매칭되지 않은 것
  ga4ByCampaign.forEach((g, key) => {
    if (usedGa4Campaigns.has(key)) return;
    unmatchedMap.set(`c${key}`, {
      source: g.source,
      medium: g.medium,
      campaign: g.campaign,
      media: g.media,
      mediaLabel: getMedia(g.media).label,
      reasonCode: 'campaign',
      reason: '캠페인명 불일치',
      ...pickGa4(g),
    });
  });

  const unmatchedGa4 = Array.from(unmatchedMap.values()).sort((a, b) => b.sessions - a.sessions);

  const totals = deriveIntegrated({ ...summary.totals, ...matchedGa4 });
  const matchedCampaigns = byCampaign.filter((c) => c.matched);
  const matchStats = {
    campaigns: byCampaign.length,
    matched: matchedCampaigns.length,
    matchedCost: matchedCampaigns.reduce((s, c) => s + c.cost, 0),
    matchedCostShare: ratio(matchedCampaigns.reduce((s, c) => s + c.cost, 0), summary.totals.cost, 100),
    unmatchedCost: byCampaign.filter((c) => !c.matched).reduce((s, c) => s + c.cost, 0),
    ga4MatchedSessionsShare: ratio(
      matchedCampaigns.reduce((s, c) => s + c.sessions, 0),
      matchedGa4.sessions,
      100
    ),
  };

  const otherPaidSessions = unmatchedGa4
    .filter((u) => u.reasonCode !== 'campaign')
    .reduce((s, u) => s + u.sessions, 0);
  const paidSessionsAll = matchedGa4.sessions + otherPaidSessions;
  const result = {
    hasGa4,
    selectedCampaign,
    availableGa4Campaigns,
    metricsUsed: ga4?.metricsUsed || [],
    hasRevenue: hasGa4 && (ga4.metricsUsed || []).includes('totalRevenue'),
    hasKeyEvents: hasGa4 && (ga4.metricsUsed || []).some((m) => m === 'keyEvents' || m === 'conversions'),
    paidMediumPattern: ga4?.paidMediumPattern || null,
    siteTotals: ga4?.siteTotals || null,
    paidShare: ga4?.siteTotals ? ratio(paidSessionsAll, ga4.siteTotals.sessions, 100) : null,
    otherPaidSessions,
    summary,
    totals,
    byMedia,
    byDate,
    byCampaign,
    unmatchedGa4,
    matchStats,
    correlation: hasGa4
      ? correlation(
          byDate.map((d) => d.clicks),
          byDate.map((d) => d.sessions)
        )
      : null,
  };
  result.insights = buildInsights(result);
  return result;
}

function pickGa4(g) {
  return {
    sessions: g.sessions,
    engagedSessions: g.engagedSessions,
    keyEvents: g.keyEvents,
    revenue: g.revenue,
  };
}

/* ──────────────────────────────────────────────────────────
 * 분석 문구 (데이터에서만 도출)
 * ────────────────────────────────────────────────────────── */

function extremes(list, key, filter = () => true) {
  const valid = list.filter((x) => x[key] !== null && x[key] !== undefined && filter(x));
  if (!valid.length) return { min: null, max: null };
  const sorted = valid.slice().sort((a, b) => a[key] - b[key]);
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

function buildInsights(r) {
  const media = [];
  const daily = [];
  const integration = [];
  const campaign = [];
  const m = r.byMedia;

  // 매체 개요
  if (m[0]) media.push(`${m[0].label} 광고비 ${formatWon(m[0].cost)}(${formatPercent(m[0].costShare)})로 최대 집행`);
  const cpc = extremes(m, 'cpc', (x) => x.clicks >= 10);
  if (cpc.min && cpc.max && cpc.min !== cpc.max) {
    media.push(`CPC 최저 ${cpc.min.label} ${formatWon(cpc.min.cpc)} · 최고 ${cpc.max.label} ${formatWon(cpc.max.cpc)}`);
  }
  const ctr = extremes(m, 'ctr', (x) => x.impressions >= 1000);
  if (ctr.max) media.push(`CTR 최고 ${ctr.max.label} ${formatPercent(ctr.max.ctr, 2)}`);
  const cpa = extremes(m, 'cpa', (x) => x.conversions >= 1);
  if (cpa.min) media.push(`매체 보고 기준 CPA 최저 ${cpa.min.label} ${formatWon(cpa.min.cpa)}`);

  // 일별
  const dated = r.byDate.filter((d) => d.cost > 0);
  if (dated.length) {
    const avg = dated.reduce((s, d) => s + d.cost, 0) / dated.length;
    const peak = dated.reduce((a, b) => (b.cost > a.cost ? b : a));
    daily.push(`최대 집행일 ${peak.date} ${formatWon(peak.cost)} (일평균 대비 ${formatPercent(((peak.cost - avg) / avg) * 100)} 높음)`);
    daily.push(
      `일평균 광고비 ${formatWon(avg)} · 클릭 ${formatNumber(
        Math.round(dated.reduce((s, d) => s + d.clicks, 0) / dated.length)
      )}`
    );
  }
  if (r.correlation !== null && r.correlation !== undefined) {
    const strength = Math.abs(r.correlation) >= 0.7 ? '강한' : Math.abs(r.correlation) >= 0.4 ? '중간' : '약한';
    daily.push(`일별 클릭과 GA4 유료 세션의 상관계수 ${r.correlation.toFixed(2)} (${strength} 상관)`);
  }

  // 매체 × GA4
  if (r.hasGa4) {
    const t = r.totals;
    if (t.arrivalRate !== null) {
      const ar = extremes(m, 'arrivalRate', (x) => x.clicks >= 50);
      integration.push(`클릭→세션 도달률 전체 ${formatPercent(t.arrivalRate)}`);
      if (ar.max && ar.min && ar.max !== ar.min) {
        integration.push(
          `도달률 최고 ${ar.max.label} ${formatPercent(ar.max.arrivalRate)} · 최저 ${ar.min.label} ${formatPercent(ar.min.arrivalRate)}`
        );
      }
      if (ar.min && ar.min.arrivalRate < 50) {
        integration.push(`${ar.min.label} 도달률 ${formatPercent(ar.min.arrivalRate)} — 랜딩 이탈·UTM 누락 점검 권장`);
      }
    }
    const cps = extremes(m, 'costPerSession', (x) => x.sessions >= 10);
    if (cps.min) integration.push(`세션당 비용 최저 ${cps.min.label} ${formatWon(cps.min.costPerSession)}`);
    if (r.hasRevenue) {
      const roas = extremes(m, 'ga4Roas', (x) => x.cost > 0 && x.revenue > 0);
      if (roas.max) integration.push(`GA4 매출 기준 ROAS 최고 ${roas.max.label} ${formatPercent(roas.max.ga4Roas, 0)}`);
    }
    if (r.paidShare !== null) integration.push(`사이트 전체 세션 중 유료 유입 비중 ${formatPercent(r.paidShare)}`);
  }

  // 캠페인
  const s = r.matchStats;
  if (r.hasGa4 && s.campaigns) {
    campaign.push(`캠페인 ${s.campaigns}개 중 ${s.matched}개가 GA4 캠페인명과 매칭 (광고비 기준 ${formatPercent(s.matchedCostShare || 0)})`);
    const topUnmatched = r.byCampaign.find((c) => !c.matched);
    if (topUnmatched) {
      campaign.push(`미매칭 최대 광고비 캠페인 ${topUnmatched.campaign} ${formatWon(topUnmatched.cost)} — utm_campaign 값 점검`);
    }
    const best = extremes(r.byCampaign, 'ga4Roas', (c) => c.matched && c.revenue > 0);
    if (best.max) campaign.push(`GA4 ROAS 최고 캠페인 ${best.max.campaign} ${formatPercent(best.max.ga4Roas, 0)}`);
  } else if (r.byCampaign[0]) {
    const top = r.byCampaign[0];
    campaign.push(`최대 집행 캠페인 ${top.campaign}(${top.mediaLabel}) ${formatWon(top.cost)} · 비중 ${formatPercent(top.costShare)}`);
    const cpaBest = extremes(r.byCampaign, 'cpa', (c) => c.conversions >= 3);
    if (cpaBest.min) campaign.push(`CPA 최저 캠페인 ${cpaBest.min.campaign} ${formatWon(cpaBest.min.cpa)}`);
  }

  return { media, daily, integration, campaign };
}

module.exports = { integrate, classifySource, normCampaign, correlation };
