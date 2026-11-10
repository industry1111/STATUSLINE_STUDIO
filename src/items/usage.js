// 카테고리 usage — 사용량 API 캐시(statusline.sh:205-298, 373-437)와 입력 JSON `rate_limits`.
// 5h·7d는 두 출처에 다 있어 목록에 둘 다 둔다(첫 설정은 API 쪽 — statusline.sh와 같게).
import { isUInt, moneyText, percentText, PERCENT_SHOWS, resetText, RESET_SHOWS } from './formats.js';
import { item, pickNum, pickText } from './common.js';

export const category = {
  id: 'usage',
  name: '사용 한도',
  nameEn: 'Usage limits',
  icons: ['\u{1F4CA}', '\u{1F4C6}', '\u{1F4C5}', '\u{231B}', '\u{26A1}', '\u{1F525}', '\u{1F4B3}', '\u{1F6A6}'],
};

/** sess_limit_color: 80 이상 빨강, 50 이상 주황, 아니면 민트, 숫자가 아니면 회색 */
export const LIMIT_COLOR = Object.freeze({ fg: 158, thresholds: [[80, 203], [50, 215]], na: 249 });

const numOf = (pct) => (isUInt(pct) ? Number(pct) : null);

/** 출처별로 pick에 줄 값: usage → 사용량 캐시, input → 입력 JSON */
const fromSource = (ctx, source) => (source === 'usage' ? ctx.usage : ctx.input);

function percentItem(id, name, icon, label, pick, source = 'usage') {
  return {
    id, name, icon, label,
    color: LIMIT_COLOR,
    format: { show: 'both', width: 10 },
    shows: PERCENT_SHOWS,
    sources: [source],
    value(ctx, fmt) {
      const p = pick(fromSource(ctx, source));
      if (!p) return null;
      return { text: percentText(p.pct, fmt), num: numOf(p.pct), parts: { pct: p.pct, ...(p.parts ?? {}) } };
    },
  };
}

function resetItem(id, name, icon, label, units, pick, source = 'usage') {
  return {
    id, name, icon, label,
    color: LIMIT_COLOR,
    format: { show: 'both', units },
    shows: RESET_SHOWS,
    formatOptions: { units: ['hm', 'dh'] },
    sources: [source],
    value(ctx, fmt) {
      const p = pick(fromSource(ctx, source));
      if (!p || p.epoch === null) return null;
      const remaining = p.epoch - ctx.now;
      if (remaining <= 0) return null;
      return { text: resetText(remaining, p.epoch, fmt), num: numOf(p.pct), parts: { ...(p.parts ?? {}) } };
    },
  };
}

/** 금액 글자 — USD는 `$`, 그 밖은 통화 코드를 앞에. */
const moneyOf = (m, fmt) => (m.currency === 'USD' ? moneyText(m.amount, fmt) : `${m.currency} ${moneyText(m.amount, { ...fmt, symbol: '' })}`);

/** 입력 JSON `rate_limits.<창>`의 % — 정수로 버림(API 쪽 jq floor와 같다) */
const rlPct = (win) => (input) => {
  const v = pickNum(input, ['rate_limits', win, 'used_percentage']);
  return v === null ? null : { pct: String(Math.floor(v)) };
};
/** 입력 JSON `rate_limits.<창>.resets_at`(epoch 초) */
const rlReset = (win) => (input) => {
  const e = pickNum(input, ['rate_limits', win, 'resets_at']);
  if (e === null) return null;
  const v = pickNum(input, ['rate_limits', win, 'used_percentage']);
  return { epoch: Math.floor(e), pct: v === null ? null : String(Math.floor(v)) };
};

/** 항목 영어 이름(편집 화면 en) — 한국어 이름은 항목 정의의 name */
export const namesEn = {
  'usage.five_hour.percent': '5-hour usage',
  'usage.seven_day.percent': 'Weekly usage (all)',
  'usage.weekly_scoped.percent': 'Per-model weekly usage',
  'usage.five_hour.reset': '5-hour reset',
  'usage.seven_day.reset': 'Weekly reset (all)',
  'usage.weekly_scoped.reset': 'Per-model weekly reset',
  'usage.spend.percent': 'Credits used %',
  'usage.spend.used': 'Credits used amount',
  'usage.rate_limits.five_hour.percent': '5-hour usage (input JSON)',
  'usage.rate_limits.five_hour.reset': '5-hour reset (input JSON)',
  'usage.rate_limits.seven_day.percent': 'Weekly usage (input JSON)',
  'usage.rate_limits.seven_day.reset': 'Weekly reset (input JSON)',
  'usage.rate_limits.spend_limit.percent': 'Spend limit %',
  'usage.rate_limits.spend_limit.reset': 'Spend limit reset',
  'usage.rate_limits.spend_limit.usd': 'Spend limit amount',
};

export const items = [
  // ── 사용량 API(캐시) ──
  percentItem('usage.five_hour.percent', '5시간 사용률', '\u{1F4CA}', 'Session:', (u) => ({ pct: u.sessionPct })),
  percentItem('usage.seven_day.percent', '주간 사용률(전체)', '\u{1F4C6}', 'Week:', (u) => ({ pct: u.weekPct })),
  percentItem('usage.weekly_scoped.percent', '모델별 주간 사용률', '\u{26A1}', '{name}:',
    (u) => (u.scoped ? { pct: u.scoped.pct, parts: { name: u.scoped.name } } : null)),
  resetItem('usage.five_hour.reset', '5시간 리셋', '\u{231B}', '5h 리셋:', 'hm',
    (u) => (u.fiveHourReset === null ? null : { epoch: u.fiveHourReset, pct: u.sessionPct })),
  resetItem('usage.seven_day.reset', '주간 리셋(전체)', '\u{1F4C5}', 'Week 리셋:', 'dh',
    (u) => (u.sevenDayReset === null ? null : { epoch: u.sevenDayReset, pct: u.weekPct })),
  resetItem('usage.weekly_scoped.reset', '모델별 주간 리셋', '\u{1F4C5}', '주간 리셋:', 'dh',
    (u) => (u.scoped ? { epoch: u.scoped.resetEpoch, pct: u.scoped.pct, parts: { name: u.scoped.name } } : null)),
  percentItem('usage.spend.percent', '사용 크레딧 %', '\u{1F4B3}', 'Credits:',
    (u) => (u.spend && u.spend.pct !== null ? { pct: u.spend.pct } : null)),
  item({
    id: 'usage.spend.used',
    name: '사용 크레딧 금액',
    icon: '\u{1F4B3}',
    color: { fg: 222 },
    format: { decimals: 2 },
    shows: ['money'],
    sources: ['usage'],
    value(ctx, fmt) {
      const sp = ctx.usage.spend;
      if (!sp || !sp.used) return null;
      const used = moneyOf(sp.used, fmt);
      const text = sp.limit ? `${used} / ${moneyOf(sp.limit, fmt)}` : used;
      return { text, num: sp.used.amount, parts: { used, limit: sp.limit ? moneyOf(sp.limit, fmt) : '' } };
    },
  }),

  // ── 입력 JSON rate_limits ──
  percentItem('usage.rate_limits.five_hour.percent', '5시간 사용률(입력 JSON)', '\u{1F4CA}', '5h:', rlPct('five_hour'), 'input'),
  resetItem('usage.rate_limits.five_hour.reset', '5시간 리셋(입력 JSON)', '\u{231B}', '5h 리셋:', 'hm', rlReset('five_hour'), 'input'),
  percentItem('usage.rate_limits.seven_day.percent', '주간 사용률(입력 JSON)', '\u{1F4C6}', '7d:', rlPct('seven_day'), 'input'),
  resetItem('usage.rate_limits.seven_day.reset', '주간 리셋(입력 JSON)', '\u{1F4C5}', '7d 리셋:', 'dh', rlReset('seven_day'), 'input'),
  percentItem('usage.rate_limits.spend_limit.percent', 'spend limit %', '\u{1F6A6}', 'Spend:', rlPct('spend_limit'), 'input'),
  resetItem('usage.rate_limits.spend_limit.reset', 'spend limit 리셋', '\u{1F6A6}', 'Spend 리셋:', 'dh', rlReset('spend_limit'), 'input'),
  item({
    id: 'usage.rate_limits.spend_limit.usd',
    name: 'spend limit 금액',
    icon: '\u{1F4B0}',
    color: { fg: 222 },
    format: { decimals: 2 },
    shows: ['money'],
    sources: ['input'],
    value(ctx, fmt) {
      const used = pickNum(ctx.input, 'rate_limits.spend_limit.used_usd');
      if (used === null) return null;
      const limit = pickNum(ctx.input, 'rate_limits.spend_limit.limit_usd');
      const period = pickText(ctx.input, 'rate_limits.spend_limit.period');
      let text = moneyText(used, fmt);
      if (limit !== null) text += ` / ${moneyText(limit, fmt)}`;
      if (period !== null) text += ` (${period})`;
      return { text, num: used, parts: { used: moneyText(used, fmt), limit: limit === null ? '' : moneyText(limit, fmt), period: period ?? '' } };
    },
  }),
];
