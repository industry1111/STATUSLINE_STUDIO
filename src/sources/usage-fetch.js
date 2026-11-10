// 낡은 사용량 캐시를 뒤에서 받기 — statusline.sh:205-235와 같은 받기를 분리된 자식 프로세스가 한다.
// 렌더러는 잠금을 잡고 자식을 띄운 뒤 있는 캐시로 그리고 바로 끝난다(자식을 기다리지 않는다).
//
// - 토큰: `$HOME/.claude/.credentials.json`의 `.claudeAiOauth.accessToken`(statusline.sh:223-226).
//   토큰은 아래 USAGE_URL로만 보낸다. 주소를 바꾸는 환경 변수·인자는 두지 않는다. 토큰은 어디에도 찍지 않는다.
// - 받기: 3초 안(curl --max-time 3), 응답에 `.five_hour`가 있을 때만 캐시를 고쳐 쓴다.
//   쓰는 모양은 `echo "$_RESP" > 캐시`와 같다(응답 끝 줄바꿈을 떼고 줄바꿈 1개). 쓰기는 임시 파일 → rename.
// - 잠금: 캐시 옆 `<캐시>.lock`을 배타 생성(wx)으로 잡는다. 여러 세션이 동시에 그려도 받기는 하나.
//   자식이 끝나면 지운다. 죽은 자식이 남긴 잠금은 LOCK_STALE_MS가 지나면 다음 렌더가 거둬 간다.
// - 결과: 자식은 무엇을 했는지 캐시 옆 `<캐시>.fetch.json`에 남긴다. 넣는 것은 결과·HTTP 상태·API 오류 type·
//   오류 code·걸린 ms·시각뿐(토큰·응답 본문은 넣지 않는다). 예: {"result":"rejected","http":429,"errorType":"rate_limit_error",…}
// - 미루기: 마지막 받기가 실패했으면(written 아님) RETRY_AFTER_FAIL_MS 동안 다시 띄우지 않는다.
//   statusline.sh는 실패하면 다음 렌더마다 다시 부른다 — 그보다 자주 부르지 않는다.
// - STATUSLINE_STUDIO_NO_FETCH가 있으면 받지 않는다(시험용 — 실제 토큰을 보내지 않게).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from '../config.js';
import { jqAlt, jqGet } from './input.js';

export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
export const FETCH_TIMEOUT_MS = 3000; // statusline.sh:229 curl --max-time 3
export const LOCK_STALE_MS = 15000; // 받기 3초 + 프로세스 띄우기보다 넉넉히
export const RETRY_AFTER_FAIL_MS = 30000; // 실패 뒤 다시 받기까지(캐시 30초와 같은 간격)
const WORKER_LIMIT_MS = 10000; // 자식이 어떤 이유로든 이보다 오래 살지 않게

const WORKER = fileURLToPath(import.meta.url);

export const lockPathFor = (cacheFile) => `${cacheFile}.lock`;
export const statusPathFor = (cacheFile) => `${cacheFile}.fetch.json`;

/** 상태 파일에 넣을 이름 글자만(영문·숫자·_.-, 64자 이내) — 응답 본문이 새어 나가지 않게. */
const safeName = (v) => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(v) ? v : null);

/** 토큰 파일 자리 — statusline.sh의 `$HOME/.claude/.credentials.json`. */
export function credentialsPath(env = process.env) {
  return path.join(env.HOME || os.homedir(), '.claude', '.credentials.json');
}

/** `.claudeAiOauth.accessToken // empty`, 없거나 "null"이면 null. */
export function readToken(env = process.env) {
  try {
    const data = JSON.parse(fs.readFileSync(credentialsPath(env), 'utf8').replace(/^﻿/, ''));
    const v = jqAlt(jqGet(data, ['claudeAiOauth', 'accessToken']), undefined);
    if (typeof v !== 'string' || !v || v === 'null') return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * 잠금 잡기. 이미 있으면 낡았을 때만 거둬 가고 한 번 더 잡아 본다.
 * @returns {string|null} 잡았으면 잠금 표(자식이 자기 잠금인지 확인할 때 쓴다), 못 잡았으면 null
 */
export function acquireLock(lockFile, nowMs = Date.now()) {
  const tag = `${process.pid}-${nowMs}-${crypto.randomBytes(4).toString('hex')}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      try { fs.writeSync(fd, tag); } finally { fs.closeSync(fd); }
      return tag;
    } catch (e) {
      if (e.code !== 'EEXIST' || attempt > 0) return null;
      let st;
      try { st = fs.statSync(lockFile); } catch { continue; } // 그새 지워졌다 → 다시
      if (nowMs - st.mtimeMs <= LOCK_STALE_MS) return null; // 다른 렌더가 받는 중
      // 낡은 잠금: 이름을 바꿔 하나만 거둬 가게 한 뒤 지운다
      const grave = `${lockFile}.${tag}.stale`;
      try { fs.renameSync(lockFile, grave); } catch { return null; }
      try { fs.rmSync(grave, { force: true }); } catch { /* 남아도 다음에 덮인다 */ }
    }
  }
  return null;
}

/** 내 잠금일 때만 지운다(낡았다고 거둬 간 뒤 다른 렌더가 잡은 잠금은 두기). */
export function releaseLock(lockFile, tag) {
  try {
    if (fs.readFileSync(lockFile, 'utf8') === tag) fs.rmSync(lockFile, { force: true });
  } catch {
    // 없으면 그만
  }
}

/** 응답 글자가 `jq -e '.five_hour'`를 통과하나(JSON이고 .five_hour가 null·false가 아님). */
export function hasFiveHour(text) {
  try {
    const data = JSON.parse(String(text).replace(/^﻿/, ''));
    return jqAlt(jqGet(data, ['five_hour']), undefined) !== undefined;
  } catch {
    return false;
  }
}

/** `echo "$(curl …)"` 모양: 끝 줄바꿈을 모두 떼고 줄바꿈 1개. */
export const cacheText = (body) => `${String(body).replace(/\n+$/, '')}\n`;

/**
 * 실제 받기 — 고정 주소로만. 네트워크 오류·시간 초과는 던진다.
 * @returns {Promise<{status: number, body: string}>} curl -s처럼 상태 코드와 상관없이 본문을 본다
 */
export async function fetchUsageBody(token) {
  const res = await fetch(USAGE_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return { status: res.status, body: await res.text() };
}

/** 응답 본문의 `.error.type`(예: rate_limit_error). 오류가 없으면 null, JSON이 아니면 'not-json'. */
export function apiErrorType(body) {
  let data;
  try {
    data = JSON.parse(String(body).replace(/^﻿/, ''));
  } catch {
    return 'not-json';
  }
  const err = data && typeof data === 'object' ? data.error : undefined;
  if (err === undefined || err === null) return null;
  return safeName(err?.type) ?? 'other';
}

/** 던져진 받기 오류 → {result, code}. 시간 초과는 'timeout', 나머지는 'network'(+ ENOTFOUND 같은 code). */
export function classifyFetchError(e) {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return { result: 'timeout' };
  return { result: 'network', code: safeName(e?.cause?.code) ?? safeName(e?.code) ?? safeName(e?.name) };
}

/** 상태 파일 쓰기(실패해도 그만). 넣는 키는 아래 것뿐 — 토큰·응답 본문은 들어갈 자리가 없다. */
export function writeFetchStatus(cacheFile, st, nowMs = Date.now()) {
  const keep = {
    result: safeName(st.result) ?? 'error',
    http: Number.isInteger(st.http) ? st.http : null,
    errorType: safeName(st.errorType),
    code: safeName(st.code),
    ms: Number.isFinite(st.ms) ? st.ms : null,
  };
  try {
    writeFileAtomic(statusPathFor(cacheFile), `${JSON.stringify({ ...keep, atMs: nowMs, at: new Date(nowMs).toISOString() })}\n`);
  } catch {
    // 상태를 못 남겨도 받기 자체와는 상관없다
  }
}

/** 상태 파일 읽기. 없거나 깨졌으면 null. */
export function readFetchStatus(cacheFile) {
  try {
    const v = JSON.parse(fs.readFileSync(statusPathFor(cacheFile), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const RESULT_TEXT = {
  written: '캐시 씀',
  'no-token': '안 씀(토큰 없음)',
  timeout: '안 씀(시간 초과 3초)',
  network: '안 씀(네트워크 오류)',
  rejected: '안 씀(.five_hour 없음)',
  'write-failed': '안 씀(캐시 쓰기 실패)',
  'worker-timeout': '안 씀(자식 10초 초과)',
};

/** 사람이 읽는 한 줄 — bench·evidence용. 예: "안 씀(rate_limit_error) — HTTP 429, 230ms". */
export function describeFetchStatus(st) {
  if (!st) return '결과 없음(자식이 상태를 남기지 않음)';
  let head = RESULT_TEXT[st.result] ?? `안 씀(${st.result})`;
  if (st.result === 'rejected' && st.errorType) head = `안 씀(${st.errorType})`;
  const bits = [];
  if (st.code) bits.push(st.code);
  if (st.http !== undefined && st.http !== null) bits.push(`HTTP ${st.http}`);
  if (st.ms !== undefined && st.ms !== null) bits.push(`${st.ms}ms`);
  return bits.length ? `${head} — ${bits.join(', ')}` : head;
}

/**
 * 자식 프로세스가 하는 일: 토큰 읽기 → 받기 → `.five_hour`가 있으면 캐시 쓰기 → 상태 남기기 → 잠금 풀기.
 * 시험은 readTokenFn·fetchFn을 바꿔 네트워크 없이 돈다(fetchFn은 {status, body}를 돌려주거나 던진다).
 * @returns {Promise<{result: 'written'|'no-token'|'timeout'|'network'|'rejected'|'write-failed'|'error', http?, errorType?, code?, ms: number}>}
 */
export async function refreshUsage({ cacheFile, lockFile, tag, env = process.env, readTokenFn = readToken, fetchFn = fetchUsageBody }) {
  const t0 = Date.now();
  const attempt = async () => {
    const token = readTokenFn(env);
    if (!token) return { result: 'no-token' };
    let res;
    try {
      res = await fetchFn(token);
    } catch (e) {
      return classifyFetchError(e);
    }
    const http = Number.isInteger(res?.status) ? res.status : null;
    const body = res?.body ?? '';
    if (!hasFiveHour(body)) return { result: 'rejected', http, errorType: apiErrorType(body) };
    try {
      writeFileAtomic(cacheFile, cacheText(body));
    } catch (e) {
      return { result: 'write-failed', http, code: safeName(e?.code) };
    }
    return { result: 'written', http };
  };
  let st;
  try {
    st = await attempt();
  } catch (e) {
    st = { result: 'error', code: safeName(e?.code) ?? safeName(e?.name) };
  } finally {
    st ??= { result: 'error' };
    st.ms = Date.now() - t0;
    if (cacheFile) writeFetchStatus(cacheFile, st);
    if (lockFile && tag) releaseLock(lockFile, tag);
  }
  return st;
}

/** 마지막 받기가 실패했고 RETRY_AFTER_FAIL_MS가 안 지났나(이때는 다시 띄우지 않는다). */
export function inBackoff(cacheFile, nowMs = Date.now()) {
  const st = readFetchStatus(cacheFile);
  if (!st || st.result === 'written' || typeof st.atMs !== 'number') return false;
  const age = nowMs - st.atMs;
  return age >= 0 && age < RETRY_AFTER_FAIL_MS;
}

/**
 * 렌더러가 부른다: 받기가 꺼져 있지 않고 실패 뒤 미루는 중도 아니면, 잠금을 잡고 분리된 자식을 띄운다.
 * 자식은 부모의 stdin·stdout·stderr를 물지 않는다(stdio ignore) — Claude Code가 기다리는 stdout은 부모가 끝나면 바로 닫힌다.
 * @returns {'disabled'|'backoff'|'locked'|'spawned'|'spawn-failed'}
 */
export function startBackgroundRefresh({ cacheFile, env = process.env }) {
  if (env.STATUSLINE_STUDIO_NO_FETCH) return 'disabled';
  if (inBackoff(cacheFile)) return 'backoff';
  const lockFile = lockPathFor(cacheFile);
  const tag = acquireLock(lockFile);
  if (!tag) return 'locked';
  try {
    const child = spawn(process.execPath, [WORKER, cacheFile, lockFile, tag], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
    });
    child.on('error', () => releaseLock(lockFile, tag));
    child.unref();
    return 'spawned';
  } catch {
    releaseLock(lockFile, tag);
    return 'spawn-failed';
  }
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(path.resolve(process.argv[1]), WORKER)) {
  const [cacheFile, lockFile, tag] = process.argv.slice(2);
  setTimeout(() => {
    if (cacheFile) writeFetchStatus(cacheFile, { result: 'worker-timeout', ms: WORKER_LIMIT_MS });
    if (lockFile && tag) releaseLock(lockFile, tag);
    process.exit(0);
  }, WORKER_LIMIT_MS).unref();
  if (cacheFile && lockFile && tag) {
    refreshUsage({ cacheFile, lockFile, tag }).catch(() => {}).finally(() => { process.exitCode = 0; });
  }
}
