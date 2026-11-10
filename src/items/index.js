// 항목 목록. 카테고리 모듈 하나 = { category: {id, name, icons}, items: [항목 정의] }.
// 이름은 en·ko 둘: name(한국어) · nameEn(영어 — 카테고리는 category.nameEn, 항목은 모듈의 namesEn 표). 화면은 src/i18n의 itemName으로 고른다.
// 카테고리: id · name(화면 이름) · icons(아이콘 고르기 후보 이모지 — 편집 화면의 아이콘 고르기·[+] 추가가 쓴다)
// 항목 정의: id · category · name(화면 이름) · icon/label/color/format(기본값) ·
//   shows(지원 표시 형식) · formatOptions(그 밖의 형식 선택지) · sources(쓰는 출처 — SOURCES의 키, 비면 '없음') ·
//   gitStatus(참이면 `git status` 한 번으로 읽는 git 항목) ·
//   value(ctx, format) → null(숨김) | {text, num?, parts?}
import * as session from './session.js';
import * as folder from './folder.js';
import * as git from './git.js';
import * as context from './context.js';
import * as cost from './cost.js';
import * as usage from './usage.js';
import * as cache from './cache.js';
import * as misc from './misc.js';

const MODULES = [session, folder, git, context, cost, usage, cache, misc];

/** 출처 — 항목 정의 sources의 값 */
export const SOURCES = Object.freeze({ input: '입력 JSON', git: 'git', usage: '사용량 API', none: '없음' });

export const categories = MODULES.map((m) => ({
  ...m.category,
  icons: [...(m.category.icons ?? [])],
  items: m.items.map((it) => ({ ...it, nameEn: it.nameEn ?? m.namesEn?.[it.id] ?? '', category: m.category.id })),
}));

const byId = new Map(categories.flatMap((c) => c.items).map((it) => [it.id, it]));

export function getItem(id) {
  return byId.get(id) ?? null;
}

export function listItems() {
  return [...byId.values()];
}

export function getCategory(id) {
  return categories.find((c) => c.id === id) ?? null;
}

/** 항목의 출처 키 목록(없으면 ['none']) */
export function itemSources(def) {
  return def.sources?.length ? def.sources : ['none'];
}

/** 출처별 항목 수 {input, git, usage, none} */
export function countBySource(list = listItems()) {
  const out = Object.fromEntries(Object.keys(SOURCES).map((k) => [k, 0]));
  for (const def of list) for (const s of itemSources(def)) out[s] = (out[s] ?? 0) + 1;
  return out;
}

/** 설정에 `git status`로 읽는 항목이 있나 */
export function needsGitStatus(config) {
  return (config?.lines ?? []).some((l) => (l?.items ?? []).some((it) => getItem(it?.id)?.gitStatus));
}
