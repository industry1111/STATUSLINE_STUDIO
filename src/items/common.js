// 항목 정의를 짧게 쓰는 도구 — 입력 JSON 값 꺼내기와 글자·숫자·참거짓·개수·토큰 결과.
// 값 꺼내기는 jq `.a.b // empty`와 같다(null·false·없음 → 없음). 참거짓만 false도 값으로 본다.
import { jqAlt, jqGet, jqRaw } from '../sources/input.js';
import { compactNumber } from './formats.js';

const keysOf = (path) => (Array.isArray(path) ? path : path.split('.'));

/** `.path // empty` 값(없으면 undefined) */
export function pick(obj, path) {
  return jqAlt(jqGet(obj, keysOf(path)), undefined);
}

/** 글자 값. 없음·빈 글자·객체·배열이면 null. */
export function pickText(obj, path) {
  const v = pick(obj, path);
  if (v === undefined || typeof v === 'object') return null;
  const s = jqRaw(v);
  return s === '' ? null : s;
}

/** 유한한 숫자면 그 값, 아니면 null. */
export function pickNum(obj, path) {
  const v = pick(obj, path);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 참거짓 값(false도 값). 아니면 null. */
export function pickBool(obj, path) {
  const r = jqGet(obj, keysOf(path));
  return r.ok && typeof r.v === 'boolean' ? r.v : null;
}

/** 앞 글자 수 자르기(chars)·앞뒤 붙이기(prefix·suffix). */
export function decorate(s, fmt = {}) {
  let t = String(s);
  if (Number.isInteger(fmt.chars) && fmt.chars > 0) t = t.slice(0, fmt.chars);
  return `${fmt.prefix ?? ''}${t}${fmt.suffix ?? ''}`;
}

export function textResult(s, fmt) {
  if (s === null || s === undefined || s === '') return null;
  return { text: decorate(s, fmt), parts: { value: String(s) } };
}

/** 참이면 fmt.on, 거짓이면 fmt.off — 빈 글자면 숨김. */
export function boolResult(b, fmt) {
  if (b === null) return null;
  const s = b ? (fmt.on ?? 'on') : (fmt.off ?? '');
  return s ? { text: decorate(s, fmt), parts: { value: s } } : null;
}

/** 개수. 0이면 숨김(fmt.zero가 참이면 보임). */
export function countResult(n, fmt) {
  if (n === null || n === undefined) return null;
  if (n === 0 && !fmt.zero) return null;
  return { text: decorate(String(n), fmt), num: n, parts: { value: n } };
}

/** 토큰 수 K/M(fmt.decimals 자리). */
export function tokenResult(n, fmt) {
  if (n === null || n === undefined) return null;
  const s = compactNumber(n, fmt.decimals ?? 1);
  return { text: decorate(s, fmt), num: n, parts: { value: s } };
}

/** 항목 정의 기본값: label '' · format {} · shows ['text']. */
export function item(def) {
  return { label: '', format: {}, shows: ['text'], ...def };
}

/** 입력 JSON 글자 항목 */
export function inputText(id, name, icon, color, path, extra = {}) {
  return item({
    id, name, icon, color, sources: ['input'], ...extra,
    value: (ctx, fmt) => textResult(pickText(ctx.input, path), fmt),
  });
}

/** 입력 JSON 참거짓 항목 */
export function inputBool(id, name, icon, color, path, format) {
  return item({
    id, name, icon, color, format, sources: ['input'],
    value: (ctx, fmt) => boolResult(pickBool(ctx.input, path), fmt),
  });
}

/** 입력 JSON 토큰 수 항목 */
export function inputTokens(id, name, icon, color, path, extra = {}) {
  return item({
    id, name, icon, color, format: { decimals: 1 }, sources: ['input'], ...extra,
    value: (ctx, fmt) => tokenResult(pickNum(ctx.input, path), fmt),
  });
}

/** 입력 JSON 개수 항목 */
export function inputCount(id, name, icon, color, path, format = {}) {
  return item({
    id, name, icon, color, format, sources: ['input'],
    value: (ctx, fmt) => countResult(pickNum(ctx.input, path), fmt),
  });
}
