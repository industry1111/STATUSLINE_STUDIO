// 카테고리 context — 컨텍스트 창 사용률(statusline.sh:117-148, 377-381), 남은 %·전체 크기·현재 토큰·200k 초과.
import { jqAlt, jqGet } from '../sources/input.js';
import { bar, compactNumber, percentText, PERCENT_SHOWS } from './formats.js';
import { inputBool, item, pickNum, tokenResult } from './common.js';

export const category = {
  id: 'context',
  name: '컨텍스트',
  nameEn: 'Context',
  icons: ['\u{1F9E0}', '\u{1F4CF}', '\u{1FA9F}', '\u{1F4C8}', '\u{1F50B}', '\u{26A0}\u{FE0F}', '\u{1F9EE}'],
};

/** statusline.sh와 같은 계산. 보일 값이 없으면 null. */
export function contextUsage(input) {
  const cw = jqGet(input, ['context_window']);
  if (!cw.ok) return null;
  const sizeV = jqAlt(jqGet(input, ['context_window', 'context_window_size']), 200000);
  const usage = jqGet(input, ['context_window', 'current_usage']);
  if (!usage.ok || usage.v === null) return null;
  const u = usage.v;
  if (typeof u !== 'object' || Array.isArray(u)) return null;
  const num = (k) => jqAlt(jqGet(u, [k]), 0);
  const parts = [num('input_tokens'), num('cache_creation_input_tokens'), num('cache_read_input_tokens')];
  if (!parts.every((p) => typeof p === 'number')) return null;
  const tokens = parts[0] + parts[1] + parts[2];
  if (!Number.isInteger(tokens) || tokens <= 0) return null;
  const size = Number(sizeV);
  if (!Number.isInteger(size) || size === 0) return null; // bash 산술 오류 → 안 보임
  const used = Math.trunc((tokens * 100) / size);
  return { used, size, tokens };
}

/** 항목 영어 이름(편집 화면 en) — 한국어 이름은 항목 정의의 name */
export const namesEn = {
  'context.used_percent': 'Context used %',
  'context.remaining_percent': 'Context left %',
  'context.size': 'Context window size',
  'context.tokens': 'Context current tokens',
  'context.exceeds_200k': 'Over 200k',
};

export const items = [
  {
    id: 'context.used_percent',
    name: '컨텍스트 사용 %',
    icon: '\u{1F9E0}',
    label: '',
    // 남은 % ≤20 빨강, ≤40 주황 = 사용 % ≥80, ≥60
    color: { fg: 158, thresholds: [[80, 203], [60, 215]] },
    format: { show: 'both', width: 10 },
    shows: PERCENT_SHOWS,
    sources: ['input'],
    value(ctx, fmt) {
      const c = contextUsage(ctx.input);
      if (!c) return null;
      return {
        text: percentText(c.used, fmt),
        num: c.used,
        parts: {
          pct: c.used,
          bar: bar(c.used, fmt.width ?? 10, fmt.fill ?? '=', fmt.empty ?? '-'),
          size: compactNumber(c.size),
          tokens: compactNumber(c.tokens),
        },
      };
    },
  },
  item({
    id: 'context.remaining_percent',
    name: '컨텍스트 남은 %',
    icon: '\u{1F50B}',
    // 남은 % 40 이상 민트, 20 이상 주황, 아래는 빨강
    color: { fg: 203, thresholds: [[40, 158], [20, 215]] },
    format: { show: 'percent', width: 10 },
    shows: PERCENT_SHOWS,
    sources: ['input'],
    value(ctx, fmt) {
      let p = pickNum(ctx.input, 'context_window.remaining_percentage');
      if (p === null) {
        const c = contextUsage(ctx.input);
        if (!c) return null;
        p = Math.max(0, 100 - c.used);
      }
      const pct = Math.floor(p);
      return { text: percentText(pct, fmt), num: pct, parts: { pct, bar: bar(pct, fmt.width ?? 10, fmt.fill ?? '=', fmt.empty ?? '-') } };
    },
  }),
  item({
    id: 'context.size',
    name: '컨텍스트 전체 크기',
    icon: '\u{1F4CF}',
    color: { fg: 249 },
    format: { decimals: 0 },
    sources: ['input'],
    value: (ctx, fmt) => tokenResult(pickNum(ctx.input, 'context_window.context_window_size'), fmt),
  }),
  item({
    id: 'context.tokens',
    name: '컨텍스트 현재 토큰',
    icon: '\u{1F9EE}',
    color: { fg: 158 },
    format: { decimals: 1 },
    sources: ['input'],
    value(ctx, fmt) {
      // current_usage 합(사용 %와 같은 식), 없으면 total_input_tokens
      const c = contextUsage(ctx.input);
      return tokenResult(c ? c.tokens : pickNum(ctx.input, 'context_window.total_input_tokens'), fmt);
    },
  }),
  inputBool('context.exceeds_200k', '200k 초과', '\u{26A0}\u{FE0F}', { fg: 203 }, 'exceeds_200k_tokens', { on: '>200k', off: '' }),
];
