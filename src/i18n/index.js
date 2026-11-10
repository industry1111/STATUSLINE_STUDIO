// 편집 화면 문구 — en·ko 한 곳. 문구 표는 en.js·ko.js(같은 키), 항목·카테고리 이름은 src/items/*.js(name·nameEn).
// 상태줄 출력(render.js)은 언어와 무관하다 — 여기 문구를 쓰지 않는다(설정 검증 오류 글자만 config.js가 쓴다).
import en from './en.js';
import ko from './ko.js';

/** 언어 코드(선택 화면 순서) */
export const LANGUAGES = Object.freeze(['en', 'ko']);
/** 선택 화면에 보이는 언어 이름(그 언어로) */
export const LANGUAGE_NAMES = Object.freeze({ en: 'English', ko: '한국어' });

const TABLES = Object.freeze({ en, ko });

export const isLanguage = (v) => typeof v === 'string' && Object.hasOwn(TABLES, v);

/** 언어의 문구 표(모르는 언어면 ko — 지금까지의 화면) */
export function messages(lang) {
  return TABLES[lang] ?? ko;
}

/**
 * 시스템 로캘로 고른 기본 언어(선택 화면 커서 자리): ko로 시작하면 ko, 아니면 en.
 * STATUSLINE_STUDIO_LOCALE가 있으면 그것을 로캘로 본다(시험이 커서 자리를 고정할 때).
 */
export function systemLanguage(env = process.env) {
  let loc = env.STATUSLINE_STUDIO_LOCALE;
  if (!loc) {
    try { loc = Intl.DateTimeFormat().resolvedOptions().locale; } catch { loc = ''; }
  }
  return /^ko(\b|[-_])/i.test(String(loc ?? '')) ? 'ko' : 'en';
}

/** 항목 이름(그 언어 — 없으면 ko 이름) */
export function itemName(def, lang) {
  if (!def) return null;
  return (lang === 'en' ? def.nameEn : def.name) || def.name;
}

/** 카테고리 이름 */
export const categoryName = itemName;

/** 언어별 값({en, ko})이면 그 언어 것, 글자면 그대로 */
export function localized(v, lang) {
  if (v && typeof v === 'object') return v[lang] ?? v.ko ?? '';
  return v;
}

/** 한글 글자 수(음절·자모·호환 자모) — en 화면 검사용 */
export function countHangul(s) {
  return (String(s).match(/[ᄀ-ᇿ㄰-㆏가-힯]/g) ?? []).length;
}
