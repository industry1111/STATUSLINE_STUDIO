// Claude Code가 부르는 렌더러: stdin 입력 JSON → 설정대로 그린 status line → stdout.
// 언제나 exit 0. 설정이 없거나 깨졌으면 첫 설정으로 그린다.
// 그린 뒤 하는 일(실패해도 출력·exit 0은 그대로): 비용 파일, last-input.json 저장, 낡은 사용량 캐시 뒤에서 받기.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, studioDir, writeFileAtomic } from './config.js';
import { defaultConfig } from './default-config.js';
import { getItem, needsGitStatus } from './items/index.js';
import { expand } from './items/formats.js';
import { jqAlt, jqGet, jqRaw, parseInput } from './sources/input.js';
import { createGitSource } from './sources/git.js';
import { isStale, readUsage, usageCachePath } from './sources/usage.js';
import { startBackgroundRefresh } from './sources/usage-fetch.js';

export const ITEM_SEPARATOR = '  ';

/**
 * 출처 묶음. git·사용량은 항목이 처음 물을 때 읽는다.
 * @param {object} o
 * @param {object} o.input 입력 JSON 객체
 * @param {object} [o.env]
 * @param {string} [o.cwd] git을 볼 폴더(기본: 렌더러 프로세스의 현재 폴더 — statusline.sh와 같다)
 * @param {number} [o.now] epoch 초
 */
export function createContext({ input, env = process.env, cwd = process.cwd(), now, usageFile } = {}) {
  let git, usage;
  const nowSec = now ?? (env.STATUSLINE_STUDIO_NOW ? Number(env.STATUSLINE_STUDIO_NOW) : Math.floor(Date.now() / 1000));
  return {
    input: input ?? {},
    env,
    now: nowSec,
    home: env.HOME || os.homedir(),
    noColor: Boolean(env.NO_COLOR),
    get git() { return (git ??= createGitSource(cwd)); },
    get usage() { return (usage ??= readUsage(usageFile)); },
  };
}

/** 색 시작·끝 글자. thresholds는 큰 기준부터, 숫자가 아니면(null) na. */
export function colorCodes(color, num, noColor) {
  if (noColor || !color) return ['', ''];
  let fg = color.fg;
  if (num === null && color.na !== undefined && color.na !== null) {
    fg = color.na;
  } else if (typeof num === 'number' && Array.isArray(color.thresholds)) {
    const sorted = [...color.thresholds].sort((a, b) => b[0] - a[0]);
    const hit = sorted.find(([t]) => num >= t);
    if (hit) fg = hit[1];
  }
  const codes = [];
  if (color.bold) codes.push('1');
  if (Number.isInteger(fg)) codes.push(`38;5;${fg}`);
  if (!codes.length) return ['', ''];
  return [`\x1b[${codes.join(';')}m`, '\x1b[0m'];
}

/** 항목 하나 → 글자(숨김이면 null). 형식: `아이콘 ␠ 색 라벨 ␠ 값 색끝` */
export function renderItem(conf, ctx) {
  const def = getItem(conf.id);
  if (!def) return null;
  const fmt = { ...def.format, ...(conf.format ?? {}) };
  const v = def.value(ctx, fmt);
  if (!v) return null;
  const parts = v.parts ?? {};
  const body = fmt.template ? expand(fmt.template, parts) : v.text;
  const label = expand(conf.label ?? def.label ?? '', parts);
  const icon = conf.icon ?? def.icon ?? '';
  const color = conf.color === null ? null : { ...(def.color ?? {}), ...(conf.color ?? {}) };
  const [on, off] = colorCodes(color, v.num === undefined ? undefined : v.num, ctx.noColor);
  return `${icon ? `${icon} ` : ''}${on}${label ? `${label} ` : ''}${body}${off}`;
}

/**
 * 설정 → 줄마다 항목 글자(숨김·깨진 항목은 null). 부수 효과 없음 —
 * renderLines와 편집 화면 미리보기(src/tui/)가 같이 쓴다.
 * @returns {(string|null)[][]}
 */
export function renderItemTexts(config, ctx) {
  // git status 항목이 있으면 status를 먼저 읽어 브랜치도 거기서 꺼낸다(git 1회). 없으면 지금처럼 브랜치만.
  if (needsGitStatus(config)) {
    try { ctx.git.prefetchStatus?.(); } catch { /* 항목이 각자 숨는다 */ }
  }
  return config.lines.map((line) => line.items.map((it) => {
    try {
      return renderItem(it, ctx);
    } catch {
      return null; // 항목 하나가 깨져도 나머지는 그린다
    }
  }));
}

/** 항목 글자 → 줄 글자(숨김은 빼고 두 칸으로 잇는다, 다 숨으면 null). */
export function joinLine(texts) {
  const parts = texts.filter((s) => s !== null);
  return parts.length ? parts.join(ITEM_SEPARATOR) : null;
}

/** 설정 → 줄 목록(빈 줄은 뺀다). */
export function renderLines(config, ctx) {
  return renderItemTexts(config, ctx).map(joinLine).filter((s) => s !== null);
}

/** 줄 목록 → stdout 글자(끝 줄바꿈 1개 — statusline.sh와 같다). */
export function renderText(config, ctx) {
  return `${renderLines(config, ctx).join('\n')}\n`;
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

export const LAST_INPUT_NAME = 'last-input.json';

/** Git Bash 꼴 `/c/x` → `C:\x`(cygpath -u의 반대 — node가 쓸 수 있게). 나머지는 그대로. */
function nativeDir(dir) {
  if (process.platform !== 'win32') return dir;
  const m = /^\/([a-zA-Z])(?:\/(.*))?$/.exec(dir);
  return m ? `${m[1].toUpperCase()}:\\${(m[2] ?? '').replace(/\//g, '\\')}` : dir;
}

/** jq `join("\t")`의 원소 글자. 객체·배열은 jq 오류 → null. */
function joinPart(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return null;
  return jqRaw(v);
}

/**
 * 비용 파일 자리와 내용 — statusline.sh:196-203과 같은 조건.
 * builder 세션이고 session_id·폴더(project_dir // current_dir)·`.cost.total_cost_usd`가 있을 때만.
 * 내용은 `printf '%s\n' "$cost_usd"` = jq -r 글자 + 줄바꿈.
 * @returns {{file: string, text: string} | null}
 */
export function costFileTarget(input) {
  const ws = (k) => jqAlt(jqGet(input, ['workspace', k]), undefined);
  const parts = [
    jqAlt(jqGet(input, ['session_id']), ''),
    jqAlt(jqGet(input, ['output_style', 'name']), ''),
    ws('project_dir') ?? ws('current_dir') ?? '',
  ].map(joinPart);
  if (parts.includes(null)) return null;
  // `IFS=$'\t' read -r sid style dir < <(… | tr -d '\r')`: 첫 줄만, 앞뒤 탭은 떼고 이어진 탭은 하나로
  const line = parts.join('\t').replace(/\r/g, '').split('\n')[0].replace(/^\t+|\t+$/g, '');
  const m = /^([^\t]*)(?:\t+([^\t]*)(?:\t+(.*))?)?$/s.exec(line);
  const [sid = '', style = '', dir = ''] = m ? [m[1], m[2], m[3]] : [];
  if (style !== 'builder' || !sid || !dir) return null;

  const cost = jqAlt(jqGet(input, ['cost', 'total_cost_usd']), undefined);
  if (cost === undefined) return null;
  const costText = jqRaw(cost).replace(/\n+$/, '').replace(/\r$/, ''); // $(…)가 끝 줄바꿈을, ${%\r}가 CR 하나를 뗀다
  if (!costText) return null;
  return { file: path.join(nativeDir(dir), '.claude', `cost-${sid}.txt`), text: `${costText}\n` };
}

export function writeCostFile(input) {
  const t = costFileTarget(input);
  if (!t) return null;
  writeFileAtomic(t.file, t.text);
  return t.file;
}

/** 편집 화면 미리보기용 — 받은 입력 글자를 그대로. 읽을 수 없는 입력이면 이전 것을 둔다. */
export function writeLastInput(raw, input, env = process.env) {
  if (!raw || !Object.keys(input).length) return null;
  const file = path.join(studioDir(env), LAST_INPUT_NAME);
  writeFileAtomic(file, raw);
  return file;
}

/** 그린 뒤 하는 일. 하나가 실패해도 나머지는 한다. 무엇을 했는지 돌려준다(시험용). */
export function afterRender({ raw, input, ctx, env = process.env }) {
  const done = {};
  const step = (name, fn) => {
    try { done[name] = fn(); } catch (e) { done[name] = `error: ${e.code ?? e.message}`; }
  };
  step('cost', () => writeCostFile(input));
  step('lastInput', () => writeLastInput(raw, input, env));
  step('refresh', () => {
    // 낡음은 실제 시각으로 본다(캐시 수정 시각이 실제 시각이라서 — STATUSLINE_STUDIO_NOW는 그리기용)
    const usage = ctx?.usage ?? readUsage();
    if (!isStale(usage, Math.floor(Date.now() / 1000))) return 'fresh';
    return startBackgroundRefresh({ cacheFile: usage.file ?? usageCachePath(), env });
  });
  return done;
}

export function main({ env = process.env } = {}) {
  let text;
  let raw = '';
  let input = {};
  let ctx;
  try {
    raw = readStdin();
    input = parseInput(raw);
    ctx = createContext({ input, env });
    const { config } = loadConfig({ env });
    try {
      text = renderText(config, ctx);
    } catch {
      text = renderText(defaultConfig(), ctx);
    }
  } catch {
    text = '\n';
  }
  process.stdout.on('error', () => {}); // 받는 쪽이 먼저 닫아도 exit 0
  process.stdout.write(text);
  process.exitCode = 0;
  try {
    afterRender({ raw, input, ctx, env });
  } catch {
    // 출력·exit 0은 이미 정해졌다
  }
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  main();
}
