// 편집 화면 실행기 — 설정·미리보기 입력을 읽고(쓰지 않는다), 키 → 상태 → 화면을 잇는다.
// 터미널은 만지지 않는다(studio.js가 한다). 시험·덤프는 이것에 키 바이트를 넣는다.
//
// 미리보기의 부수 효과 없음: render.js의 renderItemTexts(그리기만)를 쓰고 afterRender(비용 파일·
// last-input.json 저장·사용량 받기)는 부르지 않는다. 사용량 캐시·git은 읽기만 한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configPath, loadConfig, studioDir, validateConfig, writeLanguage } from '../config.js';
import { isLanguage, messages, systemLanguage } from '../i18n/index.js';
import { createContext, LAST_INPUT_NAME, renderItemTexts } from '../render.js';
import { parseInput } from '../sources/input.js';
import { createKeyDecoder } from './keys.js';
import { drawScreen, plainScreen } from './draw.js';
import { createState, languageDone, update, saveDone } from './state.js';

export const SAMPLE_INPUT = fileURLToPath(new URL('./sample-input.json', import.meta.url));

/**
 * 미리보기 입력: 설정 폴더의 last-input.json(렌더러가 받은 마지막 입력), 없거나 읽을 수 없으면 견본.
 * 견본은 폴더 자리가 비어 있어 지금 폴더(cwd)를 넣는다.
 * @returns {{raw: string, input: object, source: string, file: string}}
 */
export function loadPreviewInput({ env = process.env, cwd = process.cwd() } = {}) {
  const file = path.join(studioDir(env), LAST_INPUT_NAME);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const input = parseInput(raw);
    if (Object.keys(input).length) return { raw, input, source: LAST_INPUT_NAME, file };
  } catch {
    // 없으면 견본
  }
  const input = parseInput(fs.readFileSync(SAMPLE_INPUT, 'utf8'));
  input.cwd ??= cwd;
  input.workspace = { ...(input.workspace ?? {}) };
  input.workspace.current_dir ??= cwd;
  input.workspace.project_dir ??= cwd;
  return { raw: JSON.stringify(input, null, 2), input, source: messages('ko').sampleInput, file: SAMPLE_INPUT, sample: true };
}

/**
 * 화면 언어 정하기.
 * - 설정의 language(en|ko)가 있으면 그것.
 * - 없거나 틀리면 STATUSLINE_STUDIO_LANG(en|ko — 시험용: 앞 목표의 키 각본이 선택 화면 없이 편집 화면에서 시작하게).
 * - 그것도 없으면 첫 실행: 선택 화면, 커서는 시스템 로캘(systemLanguage).
 * @returns {{language: string, firstRun: boolean}}
 */
export function resolveLanguage(loaded, env = process.env) {
  const known = loaded.language ?? (isLanguage(env.STATUSLINE_STUDIO_LANG) ? env.STATUSLINE_STUDIO_LANG : null);
  return known ? { language: known, firstRun: false } : { language: systemLanguage(env), firstRun: true };
}

/** 깨진 설정의 이유 글자를 언어별로(모양 오류 목록은 그 언어로 다시 만든다) */
function reasonByLanguage(loaded) {
  if (!loaded.reason || loaded.reason === 'missing' || !loaded.reason.startsWith('invalid: ') || loaded.parsed === undefined) return loaded.reason;
  return Object.fromEntries(['en', 'ko'].map((l) => [l, `invalid: ${validateConfig(loaded.parsed, l).join('; ')}`]));
}

/**
 * 편집 세션.
 * @param {object} o
 * @param {object} [o.env]
 * @param {string} [o.cwd] git을 볼 폴더(렌더러와 같게 프로세스 현재 폴더)
 * @param {string} [o.usageFile] 사용량 캐시(기본: %TEMP% — 렌더러와 같다)
 * @param {(config: object, lang: string) => string} o.save 설정 쓰기(자리를 돌려준다)
 * @param {(language: string) => {path: string}} [o.saveLanguage] 언어만 쓰기(기본: config.js writeLanguage — lines는 그대로)
 * @param {boolean} [o.chooseLanguage] 언어 선택 화면으로 시작(`studio.js --language`)
 * @param {number} [o.cols] @param {number} [o.rows]
 * @param {() => string} [o.clock] 저장 시각 글자(시험용)
 */
export function createSession({
  env = process.env, cwd = process.cwd(), usageFile, save, saveLanguage, chooseLanguage = false, cols = 100, rows = 0, clock,
} = {}) {
  const loaded = loadConfig({ env });
  const preview = loadPreviewInput({ env, cwd });
  const ctx = createContext({ input: preview.input, env, cwd, usageFile });
  const { language, firstRun } = resolveLanguage(loaded, env);
  const config = loaded.config;
  // 줄 모양이 깨져 첫 설정으로 시작해도 파일의 언어는 지닌다(s 저장이 language를 지우지 않게)
  if (loaded.language && config.language !== loaded.language) config.language = loaded.language;
  const writeLang = saveLanguage ?? ((lang) => writeLanguage(lang, { env }));
  let state = createState({
    config,
    configPath: configPath(env),
    configSource: loaded.source,
    configReason: reasonByLanguage(loaded),
    inputSource: preview.sample ? { en: messages('en').sampleInput, ko: messages('ko').sampleInput } : preview.source,
    language,
    pickLanguage: chooseLanguage || firstRun,
    firstRun,
  });
  const decoder = createKeyDecoder();
  const size = { cols, rows };
  const color = !env.NO_COLOR;
  const now = clock ?? (() => new Date().toTimeString().slice(0, 8));

  function apply(keys) {
    for (const key of keys) {
      if (state.quit) break;
      state = update(state, key);
      if (state.effect === 'save') {
        try {
          const p = save(state.config, state.lang);
          state = saveDone(state, { ok: true, path: p, at: now() });
        } catch (e) {
          state = saveDone(state, { ok: false, error: e.message });
        }
      } else if (state.effect === 'language') {
        try {
          const r = writeLang(state.lang);
          state = languageDone(state, { ok: true, path: r?.path ?? r });
        } catch (e) {
          state = languageDone(state, { ok: false, error: e.message });
        }
      }
    }
    return state;
  }

  const session = {
    preview,
    loaded,
    ctx,
    get state() { return state; },
    /** 키 바이트 덩어리 하나 */
    feed(chunk) { return apply(decoder.feed(chunk)); },
    /** 기다리던 글자(끝의 Esc 단독 등)를 키로 */
    flush() { return apply(decoder.flush()); },
    get pending() { return decoder.pending; },
    resize(c, r) { size.cols = c; size.rows = r; },
    /** 지금 화면 {lines, preview} */
    draw() {
      return drawScreen(state, { itemTexts: renderItemTexts(state.config, ctx), cols: size.cols, rows: size.rows, color });
    },
    /** 덤프용(반전 »«, 색 코드 뺌) */
    plain() { return plainScreen(session.draw().lines); },
  };
  return session;
}
