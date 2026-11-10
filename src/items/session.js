// 카테고리 session — 입력 JSON의 모델·effort·버전(statusline.sh:91-95, 362-371),
// thinking·fast mode·출력 스타일·세션 이름·ID·vim 모드·agent 이름(code.claude.com/docs/en/statusline).
import { inputString } from '../sources/input.js';
import { inputBool, inputText } from './common.js';

/** ''·'null'이면 숨김 */
const shown = (s) => (s === '' || s === 'null' ? null : s);
const prefixed = (s, fmt) => `${fmt.prefix ?? ''}${s}${fmt.suffix ?? ''}`;

export const category = {
  id: 'session',
  name: '세션',
  nameEn: 'Session',
  // 아이콘 고르기 후보(편집 화면이 그대로 쓴다)
  icons: ['\u{1F916}', '\u{1F3AF}', '\u{1F3F7}\u{FE0F}', '\u{1F4DF}', '\u{1F9E0}', '\u{26A1}', '\u{1F3A8}', '\u{1F4A1}',
    '\u{1F194}', '\u{2328}\u{FE0F}', '\u{1F575}\u{FE0F}', '\u{2728}', '\u{1F52E}'],
};

/** 항목 영어 이름(편집 화면 en) — 한국어 이름은 항목 정의의 name */
export const namesEn = {
  'session.model_name': 'Model name',
  'session.effort': 'Effort',
  'session.model_version': 'Model version',
  'session.cc_version': 'Claude Code version',
  'session.model_id': 'Model ID',
  'session.thinking': 'Thinking',
  'session.fast_mode': 'Fast mode',
  'session.output_style': 'Output style',
  'session.name': 'Session name',
  'session.id': 'Session ID',
  'session.vim_mode': 'Vim mode',
  'session.agent_name': 'Agent name',
};

export const items = [
  {
    id: 'session.model_name',
    name: '모델 이름',
    icon: '\u{1F916}',
    label: '',
    color: { fg: 147 },
    format: {},
    shows: ['text'],
    sources: ['input'],
    value(ctx, fmt) {
      const v = inputString(ctx.input, 'model.display_name', 'Claude');
      return { text: prefixed(v, fmt), parts: { value: v } };
    },
  },
  {
    id: 'session.effort',
    name: 'effort',
    icon: '\u{1F3AF}',
    label: '',
    color: { fg: 216 },
    format: {},
    shows: ['text'],
    sources: ['input'],
    value(ctx, fmt) {
      const v = shown(inputString(ctx.input, 'effort.level', '').replace(/\r/g, ''));
      return v === null ? null : { text: prefixed(v, fmt), parts: { value: v } };
    },
  },
  {
    id: 'session.model_version',
    name: '모델 버전',
    icon: '\u{1F3F7}\u{FE0F}',
    label: '',
    color: { fg: 180 },
    format: {},
    shows: ['text'],
    sources: ['input'],
    value(ctx, fmt) {
      const v = shown(inputString(ctx.input, 'model.version', ''));
      return v === null ? null : { text: prefixed(v, fmt), parts: { value: v } };
    },
  },
  {
    id: 'session.cc_version',
    name: 'Claude Code 버전',
    icon: '\u{1F4DF}',
    label: '',
    color: { fg: 249 },
    format: { prefix: 'v' },
    shows: ['text'],
    sources: ['input'],
    value(ctx, fmt) {
      const v = shown(inputString(ctx.input, 'version', ''));
      return v === null ? null : { text: prefixed(v, fmt), parts: { value: v } };
    },
  },
  inputText('session.model_id', '모델 ID', '\u{1F52E}', { fg: 147 }, 'model.id'),
  inputBool('session.thinking', 'thinking', '\u{1F4A1}', { fg: 183 }, 'thinking.enabled', { on: 'thinking', off: '' }),
  inputBool('session.fast_mode', 'fast mode', '\u{26A1}', { fg: 214 }, 'fast_mode', { on: 'fast', off: '' }),
  inputText('session.output_style', '출력 스타일', '\u{1F3A8}', { fg: 176 }, 'output_style.name'),
  inputText('session.name', '세션 이름', '\u{2728}', { fg: 223 }, 'session_name'),
  inputText('session.id', '세션 ID', '\u{1F194}', { fg: 245 }, 'session_id', { format: { chars: 8 } }),
  inputText('session.vim_mode', 'vim 모드', '\u{2328}\u{FE0F}', { fg: 114 }, 'vim.mode'),
  inputText('session.agent_name', 'agent 이름', '\u{1F575}\u{FE0F}', { fg: 180 }, 'agent.name'),
];
