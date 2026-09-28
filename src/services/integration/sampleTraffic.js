'use strict';

/**
 * 데모용 GA4 유료 유입 모의 데이터.
 * 업로드된 매체 표준 행을 바탕으로 fetchPaidTraffic() 과 같은 구조를 만든다.
 * 일부 캠페인은 utm_campaign 을 다르게 두어 '미매칭' 케이스도 함께 확인할 수 있게 한다.
 */

const PROFILE = {
  naver: { sources: [['naver', 'cpc']], arrival: 0.88, cvr: 0.035, aov: 52000 },
  meta: { sources: [['facebook', 'paid_social'], ['instagram', 'paid_social']], arrival: 0.52, cvr: 0.018, aov: 61000 },
  kakao: { sources: [['kakao', 'display']], arrival: 0.63, cvr: 0.014, aov: 44000 },
  google: { sources: [['google', 'cpc'], ['youtube', 'cpv']], arrival: 0.81, cvr: 0.03, aov: 55000 },
  x: { sources: [['twitter', 'cpc']], arrival: 0.55, cvr: 0.008, aov: 47000 },
  criteo: { sources: [['criteo', 'display']], arrival: 0.7, cvr: 0.025, aov: 58000 },
  tiktok: { sources: [['tiktok', 'paid_social']], arrival: 0.45, cvr: 0.009, aov: 42000 },
  daangn: { sources: [['daangn', 'cpc']], arrival: 0.74, cvr: 0.012, aov: 39000 },
  etc: { sources: [['etc', 'cpc']], arrival: 0.6, cvr: 0.01, aov: 40000 },
};

/** utm_campaign 이 매체 캠페인명과 다르게 운영된 경우 (미매칭 데모) */
const RENAMED = {
  '파워링크_가을프로모션': 'powerlink_fall_promo',
  '디스플레이_리마케팅': 'kakao_rmkt_sep',
};

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildSampleTraffic(mediaRows) {
  const rand = seeded(97);
  const grouped = new Map();
  mediaRows
    .filter((r) => r.date)
    .forEach((r) => {
      const key = `${r.date}${r.media}${r.campaign}`;
      if (!grouped.has(key)) grouped.set(key, { date: r.date, media: r.media, campaign: r.campaign, clicks: 0 });
      grouped.get(key).clicks += r.clicks || 0;
    });

  const rows = [];
  grouped.forEach((g) => {
    const p = PROFILE[g.media] || PROFILE.etc;
    const campaign = RENAMED[g.campaign] || g.campaign.toLowerCase();
    const sessionsTotal = Math.round(g.clicks * p.arrival * (0.85 + rand() * 0.3));
    let sourceList = [p.sources[0]];
    if (g.media === 'meta') sourceList = p.sources; // facebook + instagram
    if (g.media === 'google' && /youtube/i.test(g.campaign)) sourceList = [['youtube', 'cpv']];
    sourceList.forEach(([source, medium], i) => {
      const share = sourceList.length === 1 ? 1 : i === 0 ? 0.64 : 0.36;
      const sessions = Math.round(sessionsTotal * share);
      const keyEvents = Math.round(sessions * p.cvr * (0.7 + rand() * 0.6));
      rows.push({
        date: g.date,
        source,
        medium,
        campaign,
        sessions,
        engagedSessions: Math.round(sessions * (0.45 + rand() * 0.25)),
        keyEvents,
        revenue: keyEvents * Math.round(p.aov * (0.8 + rand() * 0.4)),
      });
    });
  });

  // 매체 규칙에 없는 소스의 유료 유입 (미매칭 데모)
  const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
  dates.forEach((date) => {
    const sessions = Math.round(120 + rand() * 60);
    rows.push({
      date,
      source: 'mobon',
      medium: 'display',
      campaign: 'retargeting_sep',
      sessions,
      engagedSessions: Math.round(sessions * 0.4),
      keyEvents: Math.round(sessions * 0.012),
      revenue: Math.round(sessions * 0.012) * 48000,
    });
  });

  const paid = rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      engagedSessions: acc.engagedSessions + r.engagedSessions,
      keyEvents: acc.keyEvents + r.keyEvents,
      revenue: acc.revenue + r.revenue,
    }),
    { sessions: 0, engagedSessions: 0, keyEvents: 0, revenue: 0 }
  );

  return {
    rows,
    metricsUsed: ['sessions', 'engagedSessions', 'keyEvents', 'totalRevenue'],
    siteTotals: {
      sessions: Math.round(paid.sessions * 2.9),
      engagedSessions: Math.round(paid.engagedSessions * 3.1),
      keyEvents: Math.round(paid.keyEvents * 2.2),
      revenue: Math.round(paid.revenue * 2.4),
    },
    paidMediumPattern: 'sample',
    isSample: true,
  };
}

module.exports = { buildSampleTraffic };
