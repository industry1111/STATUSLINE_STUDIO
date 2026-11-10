// 사용량 API 캐시 읽기 — statusline.sh와 같은 파일 `%TEMP%\claude-usage-cache.json`.
// 값 꺼내는 규칙은 statusline.sh:240-282의 jq 식과 같다.
// 여기는 읽기만 한다. 낡은 캐시를 뒤에서 받는 일(분리된 자식 프로세스)은 usage-fetch.js —
// 렌더러가 `isStale()`을 보고 부른다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jqGet, jqAlt, jqRaw } from './input.js';

export const USAGE_CACHE_NAME = 'claude-usage-cache.json';
export const USAGE_CACHE_MAX_AGE = 30; // 초 — statusline.sh:207

/** 캐시 경로. Git Bash `/tmp`가 가리키는 `%TEMP%`와 같은 자리. */
export function usageCachePath() {
  return path.join(os.tmpdir(), USAGE_CACHE_NAME);
}

/** jq `floor` 결과 글자. 숫자가 아니면 null(= jq 오류). */
function jqFloor(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return String(Math.floor(v));
}

/** jq 값 비교 순서(null < false < true < 숫자 < 글자 < 배열 < 객체) — max_by용. */
function jqRank(v) {
  if (v === null || v === undefined) return 0;
  if (v === false) return 1;
  if (v === true) return 2;
  if (typeof v === 'number') return 3;
  if (typeof v === 'string') return 4;
  if (Array.isArray(v)) return 5;
  return 6;
}
function jqCmp(a, b) {
  const ra = jqRank(a), rb = jqRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 3) return a - b;
  if (ra === 4) return a < b ? -1 : a > b ? 1 : 0;
  if (ra === 5) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = jqCmp(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  return 0;
}

/** `.limits[]?` */
function iterate(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}
const isObjOrNull = (e) => e === null || (typeof e === 'object' && !Array.isArray(e));
const field = (e, k) => (e && Object.hasOwn(e, k) ? e[k] : null);

/**
 * 모델별 주간 한도(예: Fable) — 지금 걸린 것, 없으면 percent가 가장 큰 것(같으면 뒤의 것).
 * `first(.limits[]? | select(.kind == "weekly_scoped" and .is_active == true))
 *   // ([.limits[]? | select(.kind == "weekly_scoped")] | max_by(.percent)) // empty`
 */
export function pickScopedLimit(data) {
  const lim = jqGet(data, ['limits']);
  if (!lim.ok) return null;
  const elems = iterate(lim.v);
  for (const e of elems) {
    if (!isObjOrNull(e)) break; // jq 오류 → `//` 오른쪽으로
    if (field(e, 'kind') === 'weekly_scoped' && field(e, 'is_active') === true) return e;
  }
  if (elems.some((e) => !isObjOrNull(e))) return null;
  const sel = elems.filter((e) => field(e, 'kind') === 'weekly_scoped');
  let best = null;
  for (const e of sel) {
    if (best === null || jqCmp(field(e, 'percent'), field(best, 'percent')) >= 0) best = e;
  }
  return best;
}

/**
 * ISO 시각 → epoch 초(소수 버림). 시간대가 없으면 현지 시각(GNU date와 같다).
 * 못 읽으면 null.
 */
export function toEpoch(ts) {
  if (typeof ts !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?$/.exec(ts.trim());
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', s = '0', tz] = m;
    if (tz === undefined) {
      return Math.floor(new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime() / 1000);
    }
    let off = 0;
    if (tz !== 'Z' && tz !== 'z') {
      const sign = tz[0] === '-' ? -1 : 1;
      const digits = tz.slice(1).replace(':', '');
      off = sign * (Number(digits.slice(0, 2)) * 3600 + Number(digits.slice(2, 4) || 0) * 60);
    }
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 1000 - off;
  }
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

/** 금액 객체 `{amount_minor, currency, exponent}` → {amount, currency}. 아니면 null. */
function money(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const minor = v.amount_minor;
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return null;
  const exp = Number.isInteger(v.exponent) ? v.exponent : 2;
  return { amount: minor / 10 ** exp, currency: typeof v.currency === 'string' ? v.currency : 'USD' };
}

/**
 * 사용 크레딧(spend) — `.spend.percent`·`.spend.used`·`.spend.limit`.
 * @returns {null | {pct: string|null, used: {amount, currency}|null, limit: {amount, currency}|null, enabled: boolean}}
 */
export function readSpend(data) {
  const sp = jqGet(data, ['spend']);
  if (!sp.ok || !sp.v || typeof sp.v !== 'object' || Array.isArray(sp.v)) return null;
  const p = sp.v.percent;
  return {
    pct: typeof p === 'number' && Number.isFinite(p) ? String(Math.floor(p)) : null,
    used: money(sp.v.used),
    limit: money(sp.v.limit),
    enabled: sp.v.enabled === true,
  };
}

/**
 * 캐시 파일을 읽어 statusline.sh가 쓰던 값으로.
 * @returns {{file, exists, mtimeMs, ok, sessionPct, weekPct, fiveHourReset, scoped}}
 *   sessionPct·weekPct: 정수 글자 또는 '?'. fiveHourReset: epoch 초 또는 null.
 *   scoped: null 또는 {pct: 정수 글자|'?', name, resetEpoch|null}.
 *   sevenDayReset: epoch 초 또는 null. spend: readSpend() 결과.
 */
export function readUsage(file = usageCachePath()) {
  const out = {
    file, exists: false, mtimeMs: null, ok: false, sessionPct: '?', weekPct: '?', fiveHourReset: null, scoped: null,
    sevenDayReset: null, spend: null,
  };
  let text;
  try {
    const st = fs.statSync(file);
    out.exists = true;
    out.mtimeMs = st.mtimeMs;
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return out; // jq가 못 읽으면 statusline.sh도 '?'
  }
  out.ok = true;

  const pctOf = (keys) => {
    const r = jqGet(data, keys);
    if (!r.ok) return '?';
    return jqFloor(jqAlt(r, 0)) ?? '?';
  };
  out.sessionPct = pctOf(['five_hour', 'utilization']);
  out.weekPct = pctOf(['seven_day', 'utilization']);

  const reset = jqGet(data, ['five_hour', 'resets_at']);
  const resetV = jqAlt(reset, undefined);
  if (resetV !== undefined) out.fiveHourReset = toEpoch(jqRaw(resetV));

  const reset7 = jqAlt(jqGet(data, ['seven_day', 'resets_at']), undefined);
  if (reset7 !== undefined) out.sevenDayReset = toEpoch(jqRaw(reset7));
  out.spend = readSpend(data);

  const s = pickScopedLimit(data);
  if (s) {
    const p = jqAlt(jqGet(s, ['percent']), 0);
    const nameV = jqAlt(jqGet(s, ['scope', 'model', 'display_name']), 'Model');
    const r = jqAlt(jqGet(s, ['resets_at']), undefined);
    out.scoped = {
      pct: jqFloor(p) ?? '?',
      name: jqRaw(nameV) || 'Model',
      resetEpoch: r === undefined ? null : toEpoch(jqRaw(r)),
    };
  }
  return out;
}

/** 캐시가 30초보다 낡았나(없으면 낡음) — statusline.sh:214-220. 렌더러의 뒤에서 받기가 쓴다. */
export function isStale(usage, nowSec) {
  if (!usage.exists || usage.mtimeMs === null) return true;
  return nowSec - Math.floor(usage.mtimeMs / 1000) > USAGE_CACHE_MAX_AGE;
}
