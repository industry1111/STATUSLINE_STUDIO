// 카테고리 cache — 입력 JSON `prompt_cache`(code.claude.com/docs/en/statusline#prompt-cache-fields).
// warm·적중률·만료까지·TTL·요청·miss·쓴 토큰·식으면 다시 쓸 토큰·마지막 miss 원인.
import { percentText, PERCENT_SHOWS, remainingText } from './formats.js';
import { boolResult, decorate, inputCount, inputText, inputTokens, item, pick, pickBool, pickNum } from './common.js';

export const category = {
  id: 'cache',
  name: '프롬프트 캐시',
  nameEn: 'Prompt cache',
  icons: ['\u{1F9CA}', '\u{2668}\u{FE0F}', '\u{1F3AF}', '\u{23F2}\u{FE0F}', '\u{1F4BE}', '\u{1F501}', '\u{274C}', '\u{1F5C3}\u{FE0F}'],
};

/** 항목 영어 이름(편집 화면 en) — 한국어 이름은 항목 정의의 name */
export const namesEn = {
  'cache.warm': 'Cache warm',
  'cache.hit_ratio': 'Cache hit ratio',
  'cache.expires_in': 'Cache expires in',
  'cache.ttl': 'Cache TTL',
  'cache.requests': 'Cache requests',
  'cache.misses': 'Cache misses',
  'cache.write_tokens': 'Tokens written to cache',
  'cache.recache_if_cold': 'Tokens to rewrite if cold',
  'cache.last_miss_cause': 'Last miss cause',
};

export const items = [
  item({
    id: 'cache.warm',
    name: '캐시 warm',
    icon: '\u{2668}\u{FE0F}',
    color: { fg: 215 },
    format: { on: 'warm', off: 'cold' },
    sources: ['input'],
    value: (ctx, fmt) => boolResult(pickBool(ctx.input, 'prompt_cache.warm'), fmt),
  }),
  item({
    id: 'cache.hit_ratio',
    name: '캐시 적중률',
    icon: '\u{1F3AF}',
    label: 'hit',
    // 80 이상 민트, 50 이상 주황, 아래는 빨강
    color: { fg: 203, thresholds: [[80, 158], [50, 215]] },
    format: { show: 'percent', width: 10 },
    shows: PERCENT_SHOWS,
    sources: ['input'],
    value(ctx, fmt) {
      const r = pickNum(ctx.input, 'prompt_cache.hit_ratio');
      if (r === null) return null;
      const pct = Math.floor(r * 100);
      return { text: percentText(pct, fmt), num: pct, parts: { pct } };
    },
  }),
  item({
    id: 'cache.expires_in',
    name: '캐시 만료까지',
    icon: '\u{23F2}\u{FE0F}',
    color: { fg: 159 },
    format: { units: 'ms' },
    formatOptions: { units: ['ms', 'hm'] },
    sources: ['input'],
    value(ctx, fmt) {
      const e = pickNum(ctx.input, 'prompt_cache.expires_at');
      if (e === null) return null;
      const rem = Math.floor(e) - ctx.now;
      if (rem <= 0) return null;
      const s = remainingText(rem, fmt.units ?? 'ms');
      return { text: decorate(s, fmt), num: rem, parts: { value: s } };
    },
  }),
  inputText('cache.ttl', '캐시 TTL', '\u{1F9CA}', { fg: 152 }, 'prompt_cache.ttl'),
  inputCount('cache.requests', '캐시 요청 수', '\u{1F501}', { fg: 250 }, 'prompt_cache.requests', { suffix: ' req' }),
  inputCount('cache.misses', '캐시 miss 수', '\u{274C}', { fg: 210 }, 'prompt_cache.misses', { suffix: ' miss' }),
  inputTokens('cache.write_tokens', '캐시에 쓴 토큰', '\u{1F4BE}', { fg: 152 }, 'prompt_cache.cache_write_tokens'),
  inputTokens('cache.recache_if_cold', '식으면 다시 쓸 토큰', '\u{1F5C3}\u{FE0F}', { fg: 152 }, 'prompt_cache.recache_tokens_if_cold'),
  item({
    id: 'cache.last_miss_cause',
    name: '마지막 miss 원인',
    icon: '\u{274C}',
    color: { fg: 210 },
    sources: ['input'],
    value(ctx, fmt) {
      const c = pick(ctx.input, 'prompt_cache.last_miss_cause.causes');
      if (!Array.isArray(c)) return null;
      const s = c.filter((x) => typeof x === 'string' && x).join(',');
      return s ? { text: decorate(s, fmt), parts: { value: s } } : null;
    },
  }),
];
