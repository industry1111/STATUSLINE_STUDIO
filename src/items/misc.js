// 카테고리 misc — 출처 없는 항목: 고정 글자, 현재 시각.
import { clockText } from './formats.js';
import { decorate, item } from './common.js';

export const category = {
  id: 'misc',
  name: '기타',
  nameEn: 'Other',
  icons: ['\u{1F552}', '\u{1F4CC}', '\u{2B50}', '\u{1F539}', '\u{25B6}\u{FE0F}', '\u{1F4A0}', '\u{1F4AD}'],
};

export const CLOCK_PATTERNS = ['HH:mm', 'HH:mm:ss', 'MM/DD HH:mm', 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm'];

/** 항목 영어 이름(편집 화면 en) — 한국어 이름은 항목 정의의 name */
export const namesEn = {
  'misc.text': 'Fixed text',
  'misc.clock': 'Current time',
};

export const items = [
  item({
    id: 'misc.text',
    name: '고정 글자',
    icon: '',
    color: { fg: 245 },
    format: { text: '|' },
    sources: [],
    value(ctx, fmt) {
      const s = typeof fmt.text === 'string' ? fmt.text : '';
      return s ? { text: s, parts: { value: s } } : null;
    },
  }),
  item({
    id: 'misc.clock',
    name: '현재 시각',
    icon: '\u{1F552}',
    color: { fg: 250 },
    format: { clock: 'HH:mm' },
    formatOptions: { clock: CLOCK_PATTERNS },
    sources: [],
    value(ctx, fmt) {
      const s = clockText(ctx.now, fmt.clock ?? 'HH:mm');
      return { text: decorate(s, fmt), parts: { value: s } };
    },
  }),
];
