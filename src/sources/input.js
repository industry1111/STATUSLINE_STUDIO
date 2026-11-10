// 입력 JSON(Claude Code가 stdin으로 주는 값) 읽기와 jq식 꺼내기.
// statusline.sh가 jq로 읽던 규칙(`.a.b // 기본값`, `-r` 출력)을 그대로 따른다.

/** stdin 글자를 객체로. 깨졌으면 빈 객체. */
export function parseInput(text) {
  if (!text) return {};
  try {
    const v = JSON.parse(String(text).replace(/^﻿/, ''));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/**
 * jq 경로 `.k1.k2…`. null 위의 키는 null, 객체가 아닌 값 위의 키는 오류(jq와 같다).
 * @returns {{ok: true, v: any} | {ok: false}}
 */
export function jqGet(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur === null || cur === undefined) { cur = null; continue; }
    if (typeof cur !== 'object' || Array.isArray(cur)) return { ok: false };
    cur = Object.hasOwn(cur, k) ? cur[k] : null;
  }
  return { ok: true, v: cur === undefined ? null : cur };
}

/** jq `a // b`: 오류·null·false면 b. */
export function jqAlt(result, fallback) {
  if (!result.ok || result.v === null || result.v === false) return fallback;
  return result.v;
}

/** `jq -r` 출력 글자(끝 줄바꿈 없이). */
export function jqRaw(v) {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v, null, 2);
}

/** `.path // "기본"`을 `jq -r`로 읽은 글자. */
export function inputString(input, path, fallback = '') {
  const keys = typeof path === 'string' ? path.split('.') : path;
  const v = jqAlt(jqGet(input, keys), undefined);
  return v === undefined ? fallback : jqRaw(v);
}
