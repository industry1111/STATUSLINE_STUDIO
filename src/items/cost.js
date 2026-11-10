// 카테고리 cost — 비용·토큰(statusline.sh:155, 422-430), 시간당 비용·분당 토큰·입출력 토큰·경과·API 대기·추가·삭제 줄.
import { jqAlt, jqGet, jqRaw } from '../sources/input.js';
import { compactNumber, cFixed, durationText, moneyText } from './formats.js';
import { decorate, inputCount, inputTokens, item, pickNum } from './common.js';

export const category = {
  id: 'cost',
  name: '비용·토큰',
  nameEn: 'Cost · tokens',
  icons: ['\u{1F4AC}', '\u{1F4B0}', '\u{1F4B5}', '\u{1FA99}', '\u{23F1}\u{FE0F}', '\u{23F3}', '\u{1F4E5}', '\u{1F4E4}',
    '\u{2795}', '\u{2796}', '\u{1F680}'],
};

/** 세션 경과 시간(ms). 0 이하·없음이면 null. */
const durationMs = (input) => {
  const d = pickNum(input, 'cost.total_duration_ms');
  return d !== null && d > 0 ? d : null;
};

function durationItem(id, name, icon, path) {
  return item({
    id, name, icon, color: { fg: 250 }, sources: ['input'],
    value(ctx, fmt) {
      const ms = pickNum(ctx.input, path);
      if (ms === null) return null;
      const s = durationText(ms / 1000);
      return { text: decorate(s, fmt), num: ms, parts: { value: s } };
    },
  });
}

/** 항목 영어 이름(편집 화면 en) — 한국어 이름은 항목 정의의 name */
export const namesEn = {
  'cost.session_usd': 'Session cost',
  'cost.per_hour': 'Cost per hour',
  'cost.tokens_per_minute': 'Tokens per minute',
  'cost.input_tokens': 'Input tokens',
  'cost.output_tokens': 'Output tokens',
  'cost.duration': 'Elapsed time',
  'cost.api_duration': 'API wait time',
  'cost.lines_added': 'Lines added',
  'cost.lines_removed': 'Lines removed',
  'cost.lines_changed': 'Lines added·removed',
};

export const items = [
  {
    id: 'cost.session_usd',
    name: '세션 비용',
    icon: '\u{1F4AC}',
    label: 'Session:',
    color: { fg: 222 },
    format: { decimals: 2 },
    shows: ['money'],
    sources: ['input'],
    value(ctx, fmt) {
      const v = jqAlt(jqGet(ctx.input, ['cost', 'total_cost_usd']), undefined);
      if (v === undefined) return null;
      const raw = jqRaw(v);
      if (!/^[0-9.]+$/.test(raw) || Number.isNaN(Number(raw))) return null;
      const text = moneyText(raw, fmt);
      return { text, num: Number(raw), parts: { value: text } };
    },
  },
  item({
    id: 'cost.per_hour',
    name: '시간당 비용',
    icon: '\u{1F4B5}',
    color: { fg: 222 },
    format: { decimals: 2, suffix: '/h' },
    shows: ['money'],
    sources: ['input'],
    value(ctx, fmt) {
      const usd = pickNum(ctx.input, 'cost.total_cost_usd');
      const ms = durationMs(ctx.input);
      if (usd === null || ms === null) return null;
      const perHour = usd / (ms / 3600000);
      const s = moneyText(perHour, fmt);
      return { text: `${s}${fmt.suffix ?? ''}`, num: perHour, parts: { value: s } };
    },
  }),
  item({
    id: 'cost.tokens_per_minute',
    name: '분당 토큰',
    icon: '\u{1F680}',
    color: { fg: 159 },
    format: { decimals: 1, suffix: '/m' },
    sources: ['input'],
    value(ctx, fmt) {
      // (context_window.total_input_tokens + total_output_tokens) ÷ 세션 경과 분
      const inT = pickNum(ctx.input, 'context_window.total_input_tokens');
      const outT = pickNum(ctx.input, 'context_window.total_output_tokens');
      const ms = durationMs(ctx.input);
      if (inT === null || outT === null || ms === null) return null;
      const tpm = (inT + outT) / (ms / 60000);
      const s = tpm >= 1000 ? compactNumber(tpm, fmt.decimals ?? 1) : cFixed(tpm, 0);
      return { text: decorate(s, fmt), num: tpm, parts: { value: s } };
    },
  }),
  inputTokens('cost.input_tokens', '입력 토큰', '\u{1F4E5}', { fg: 152 }, 'context_window.total_input_tokens', { label: 'in' }),
  inputTokens('cost.output_tokens', '출력 토큰', '\u{1F4E4}', { fg: 152 }, 'context_window.total_output_tokens', { label: 'out' }),
  durationItem('cost.duration', '경과 시간', '\u{23F1}\u{FE0F}', 'cost.total_duration_ms'),
  durationItem('cost.api_duration', 'API 대기 시간', '\u{23F3}', 'cost.total_api_duration_ms'),
  inputCount('cost.lines_added', '추가 줄', '\u{2795}', { fg: 114 }, 'cost.total_lines_added', { prefix: '+' }),
  inputCount('cost.lines_removed', '삭제 줄', '\u{2796}', { fg: 210 }, 'cost.total_lines_removed', { prefix: '-' }),
  item({
    id: 'cost.lines_changed',
    name: '추가·삭제 줄',
    icon: '\u{1F4DD}',
    color: { fg: 222 },
    sources: ['input'],
    value(ctx, fmt) {
      const a = pickNum(ctx.input, 'cost.total_lines_added');
      const r = pickNum(ctx.input, 'cost.total_lines_removed');
      if (a === null && r === null) return null;
      if ((a ?? 0) + (r ?? 0) === 0 && !fmt.zero) return null;
      const s = `+${a ?? 0} -${r ?? 0}`;
      return { text: decorate(s, fmt), parts: { value: s, added: a ?? 0, removed: r ?? 0 } };
    },
  }),
];
