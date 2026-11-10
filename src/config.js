// 설정 읽기·검증·쓰기. 설정 = `~/.claude/statusline-studio/config.json`.
// 자리는 환경 변수 STATUSLINE_STUDIO_DIR로 바꿀 수 있다(시험·임시 홈용).
// 없거나 깨졌으면 내장 첫 설정(default-config.js)으로.
// 최상위 `language`(en|ko)는 편집 화면 언어 — 렌더(상태줄 출력)와 검증에는 영향이 없다(틀린 값이면 편집 화면이 선택 화면을 띄운다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultConfig } from './default-config.js';
import { isLanguage, messages } from './i18n/index.js';

export const CONFIG_VERSION = 1;
export const CONFIG_NAME = 'config.json';

/** 설정 폴더 — STATUSLINE_STUDIO_DIR가 있으면 그것, 아니면 ~/.claude/statusline-studio */
export function studioDir(env = process.env) {
  return env.STATUSLINE_STUDIO_DIR || path.join(os.homedir(), '.claude', 'statusline-studio');
}

export function configPath(env = process.env) {
  return path.join(studioDir(env), CONFIG_NAME);
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isColorNum = (v) => Number.isInteger(v) && v >= 0 && v <= 255;

/**
 * 모양 검사. 모르는 항목 id는 통과(렌더 때 건너뛴다), 타입이 틀리면 실패. `language`는 보지 않는다.
 * @param {string} [lang] 오류 글자 언어(en|ko, 기본 ko)
 * @returns {string[]} 오류 목록(비면 통과)
 */
export function validateConfig(cfg, lang = 'ko') {
  const m = messages(lang).cfg;
  const errs = [];
  if (!isObj(cfg)) return [m.notObject];
  if (cfg.version !== CONFIG_VERSION) errs.push(m.version(CONFIG_VERSION));
  if (!Array.isArray(cfg.lines)) return [...errs, m.linesNotArray];
  cfg.lines.forEach((line, li) => {
    const at = `lines[${li}]`;
    if (!isObj(line) || !Array.isArray(line.items)) { errs.push(m.itemsNotArray(at)); return; }
    line.items.forEach((it, ii) => {
      const p = `${at}.items[${ii}]`;
      if (!isObj(it)) { errs.push(m.itemNotObject(p)); return; }
      if (typeof it.id !== 'string' || !it.id) errs.push(m.idNotText(p));
      for (const k of ['icon', 'label']) {
        if (it[k] !== undefined && typeof it[k] !== 'string') errs.push(m.keyNotText(p, k));
      }
      if (it.format !== undefined && !isObj(it.format)) errs.push(m.formatNotObject(p));
      if (it.color !== undefined && it.color !== null) {
        const c = it.color;
        if (!isObj(c)) { errs.push(m.colorNotObject(p)); return; }
        if (c.fg !== undefined && c.fg !== null && !isColorNum(c.fg)) errs.push(m.fgRange(p));
        if (c.na !== undefined && c.na !== null && !isColorNum(c.na)) errs.push(m.naRange(p));
        if (c.bold !== undefined && typeof c.bold !== 'boolean') errs.push(m.boldNotBool(p));
        if (c.thresholds !== undefined) {
          const ok = Array.isArray(c.thresholds) && c.thresholds.every(
            (t) => Array.isArray(t) && t.length === 2 && typeof t[0] === 'number' && isColorNum(t[1]));
          if (!ok) errs.push(m.thresholdsShape(p));
        }
      }
    });
  });
  return errs;
}

/** 설정 객체의 언어(en|ko — 없거나 틀리면 null) */
export function languageOf(cfg) {
  return isObj(cfg) && isLanguage(cfg.language) ? cfg.language : null;
}

/**
 * 설정 읽기. 언제나 그릴 수 있는 설정을 돌려준다.
 * language = 파일의 언어(줄 모양이 틀려도 JSON 객체면 읽는다, 없거나 틀리면 null),
 * parsed = 모양이 틀린 경우 읽은 JSON(편집 화면이 오류 글자를 그 언어로 다시 만든다).
 * @returns {{config: object, source: 'file'|'default', reason: string|null, path: string, language: string|null, parsed?: any}}
 */
export function loadConfig({ file, env = process.env } = {}) {
  const p = file ?? configPath(env);
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch {
    return { config: defaultConfig(), source: 'default', reason: 'missing', path: p, language: null };
  }
  let cfg;
  try {
    cfg = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { config: defaultConfig(), source: 'default', reason: `invalid-json: ${e.message}`, path: p, language: null };
  }
  const language = languageOf(cfg);
  const errs = validateConfig(cfg);
  if (errs.length) return { config: defaultConfig(), source: 'default', reason: `invalid: ${errs.join('; ')}`, path: p, language, parsed: cfg };
  return { config: cfg, source: 'file', reason: null, path: p, language };
}

const RETRY_CODES = new Set(['EPERM', 'EBUSY']);
const RETRY_COUNT = 5;
const RETRY_MS = 20;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 임시 파일에 쓰고 rename. Windows에서 덮어쓰기 rename이 EPERM·EBUSY면 20ms 쉬고 5번까지 다시.
 */
export function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (!RETRY_CODES.has(e.code) || attempt >= RETRY_COUNT) {
        try { fs.rmSync(tmp, { force: true }); } catch { /* 남은 임시 파일은 무시 */ }
        throw e;
      }
      sleepSync(RETRY_MS);
    }
  }
}

/** 검증해서 쓴다. 틀린 설정이면 쓰지 않고 오류(lang = 오류 글자 언어). 설정의 language도 그대로 쓴다. */
export function writeConfig(cfg, { file, env = process.env, lang = 'ko' } = {}) {
  const errs = validateConfig(cfg, lang);
  if (errs.length) throw new Error(messages(lang).cfg.invalid(errs.join('; ')));
  const p = file ?? configPath(env);
  writeFileAtomic(p, `${JSON.stringify(cfg, null, 2)}\n`);
  return p;
}

/**
 * 언어만 바꿔 쓴다(lines·그 밖의 키는 파일 그대로). 파일이 없으면 첫 설정 + language로 만든다.
 * 파일이 JSON 객체가 아니면(깨진 JSON 등) 덮어쓰지 않고 오류 — 사람이 고칠 글자를 지우지 않는다.
 * 줄 모양만 틀린 객체는 그 모양 그대로 두고 language만 넣는다(렌더는 지금처럼 첫 설정으로 그린다).
 * @returns {{path: string, created: boolean}}
 */
export function writeLanguage(language, { file, env = process.env } = {}) {
  if (!isLanguage(language)) throw new Error(messages('en').cfg.badLanguage(language));
  const m = messages(language).cfg;
  const p = file ?? configPath(env);
  let text = null;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  let cfg;
  if (text === null) {
    cfg = defaultConfig();
  } else {
    try {
      cfg = JSON.parse(text.replace(/^﻿/, ''));
    } catch {
      throw new Error(m.notJson);
    }
    if (!isObj(cfg)) throw new Error(m.notJson);
  }
  cfg.language = language;
  writeFileAtomic(p, `${JSON.stringify(cfg, null, 2)}\n`);
  return { path: p, created: text === null };
}
