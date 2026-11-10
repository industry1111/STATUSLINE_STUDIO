#!/usr/bin/env node
// 설치·되돌리기: `node src/install.js [--home <폴더>] [--restore]` (npx github:industry1111/STATUSLINE_STUDIO 도 이것을 부른다)
//   설치: <홈>/.claude/statusline-studio/app/에 앱(package.json·src/) 복사 → 복사본 render.js를 1회 돌려 확인 →
//         스킬 폴더 skill/create-statusline/(SKILL.md + check.sh)를 <홈>/.claude/skills/create-statusline/에 그대로 복사
//         (경로 채우기 없음 — check.sh가 실행 때 홈을 구한다) → settings.json `statusLine.command` 교체(이전 값 백업)
//   --restore: 백업한 statusLine으로 되돌린다(백업이 없으면 `bash ~/.claude/statusline.sh`).
//         설정(config.json)·app·스킬은 지우지 않는다 — 다시 설치할 수 있게.
//   --home: 홈 폴더(기본 os.homedir()). 시험은 임시 홈을 준다.
// 출력 언어: <홈>/.claude/statusline-studio/config.json의 `language`(en|ko), 없거나 읽지 못하면 English.
//
// settings.json은 statusLine 값 자리의 글자만 바꾼다(다른 키·순서·들여쓰기·줄바꿈 그대로).
// 앱 폴더는 새 폴더에 복사·확인한 뒤 이름 바꾸기 두 번으로 바꿔 넣는다 — 다른 세션이 수시로 render.js를 부르므로
// 반쯤 복사된 폴더를 부르는 일이 없게. 이름 바꾸기가 EPERM·EBUSY·EACCES면 20ms씩 다시.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CONFIG_NAME, loadConfig, writeFileAtomic } from './config.js';
import { isStudioCommand, renderCommand, slashPath } from './commands.js';
import { messages } from './i18n/index.js';

export const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const SKILL_NAME = 'create-statusline';
export const BACKUP_NAME = 'statusline-backup.json';
export const DEFAULT_STATUS_LINE = Object.freeze({ type: 'command', command: 'bash ~/.claude/statusline.sh', padding: 0 });

/** 홈 기준 자리 */
export function installPaths(home = os.homedir()) {
  const claude = path.join(home, '.claude');
  const studio = path.join(claude, 'statusline-studio');
  return {
    home,
    claude,
    studio,
    app: path.join(studio, 'app'),
    backup: path.join(studio, BACKUP_NAME),
    settings: path.join(claude, 'settings.json'),
    skillDir: path.join(claude, 'skills', SKILL_NAME),
    skill: path.join(claude, 'skills', SKILL_NAME, 'SKILL.md'),
  };
}

/**
 * 오류 — 글자는 English, main이 설정 언어 글자로 다시 만든다(i18n의 install.err 키).
 */
function installError(key, ...args) {
  const text = (lang) => {
    const v = messages(lang).install.err[key];
    return typeof v === 'function' ? v(...args) : v;
  };
  return Object.assign(new Error(text('en')), { localize: text });
}

/** 설치 출력 언어: <홈>의 config.json `language`, 없으면 en */
export function installLanguage(home = os.homedir()) {
  return loadConfig({ file: path.join(installPaths(home).studio, CONFIG_NAME) }).language ?? 'en';
}

// ── settings.json 글자 자리 찾기(JSON.parse로 검증한 뒤 쓴다) ──

const WS = ' \t\r\n';
function skipWs(t, i) {
  while (i < t.length && WS.includes(t[i])) i++;
  return i;
}
function scanString(t, i) {
  for (i++; i < t.length; i++) {
    if (t[i] === '\\') i++;
    else if (t[i] === '"') return i + 1;
  }
  throw installError('unclosedString');
}
function scanValue(t, i) {
  const c = t[i];
  if (c === '"') return scanString(t, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (; i < t.length; i++) {
      const d = t[i];
      if (d === '"') { i = scanString(t, i) - 1; continue; }
      if (d === '{' || d === '[') depth++;
      else if (d === '}' || d === ']') { depth--; if (depth === 0) return i + 1; }
    }
    throw installError('unclosedBracket');
  }
  while (i < t.length && !',}] \t\r\n'.includes(t[i])) i++;
  return i;
}
/** `{`에서 시작하는 객체의 멤버 자리 */
function objectMembers(t, start) {
  const members = [];
  let i = skipWs(t, start + 1);
  if (t[i] === '}') return { members, close: i };
  for (;;) {
    const keyStart = i;
    const keyEnd = scanString(t, i);
    i = skipWs(t, keyEnd);
    if (t[i] !== ':') throw installError('noColon');
    const valueStart = skipWs(t, i + 1);
    const valueEnd = scanValue(t, valueStart);
    members.push({ key: JSON.parse(t.slice(keyStart, keyEnd)), keyStart, valueStart, valueEnd });
    i = skipWs(t, valueEnd);
    if (t[i] === ',') { i = skipWs(t, i + 1); continue; }
    if (t[i] === '}') return { members, close: i };
    throw installError('noComma');
  }
}
const lineIndent = (t, pos) => {
  const ls = t.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(t.slice(ls, pos))[0];
};
function pretty(value, base, unit, eol) {
  return JSON.stringify(value, null, unit).split('\n').join(`${eol}${base}`);
}

/**
 * settings.json 글자의 statusLine을 target으로. 바뀌는 글자는 statusLine 값 자리뿐 —
 * 지금 값과 target이 command만 다르면 command 글자만 바꾼다(type·padding·들여쓰기 그대로).
 * @returns {{text: string, previous: object|undefined}}
 */
export function setStatusLine(text, target) {
  const bom = text.startsWith('﻿') ? 1 : 0;
  const parsed = JSON.parse(text.slice(bom));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw installError('notObject');
  const rootStart = skipWs(text, bom);
  const root = objectMembers(text, rootStart);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const unitIndent = root.members.length ? lineIndent(text, root.members[0].keyStart) || '  ' : '  ';
  const sl = root.members.filter((m) => m.key === 'statusLine').pop(); // JSON.parse처럼 마지막 것
  const previous = parsed.statusLine;

  if (sl) {
    if (previous && typeof previous === 'object' && !Array.isArray(previous) && typeof previous.command === 'string'
      && isDeepStrictEqual({ ...previous, command: target.command }, target)) {
      const cmd = objectMembers(text, sl.valueStart).members.filter((m) => m.key === 'command').pop();
      return { text: text.slice(0, cmd.valueStart) + JSON.stringify(target.command) + text.slice(cmd.valueEnd), previous };
    }
    const base = lineIndent(text, sl.keyStart);
    return { text: text.slice(0, sl.valueStart) + pretty(target, base, unitIndent, eol) + text.slice(sl.valueEnd), previous };
  }
  const member = `"statusLine": ${pretty(target, unitIndent, unitIndent, eol)}`;
  if (root.members.length) {
    const last = root.members[root.members.length - 1];
    return { text: `${text.slice(0, last.valueEnd)},${eol}${unitIndent}${member}${text.slice(last.valueEnd)}`, previous };
  }
  return { text: `${text.slice(0, rootStart + 1)}${eol}${unitIndent}${member}${eol}${text.slice(root.close)}`, previous };
}

// ── 파일 ──

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);
const RETRY_MS = 20;
const RETRY_COUNT = 50; // 1초 — 렌더 1회(약 130ms)가 파일을 쥐고 있는 동안을 넘게

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
export function retry(fn, count = RETRY_COUNT) {
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (e) {
      if (!RETRY_CODES.has(e.code) || attempt >= count) throw e;
      sleepSync(RETRY_MS);
    }
  }
}

function readSettings(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** 복사본 render.js를 1회 돌려 본다(빈 입력·받기 끔·임시 설정 폴더 — 아무것도 쓰지 않는다). */
export function checkApp(appDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-install-check-'));
  try {
    const env = { ...process.env, STATUSLINE_STUDIO_DIR: path.join(tmp, 'studio'), STATUSLINE_STUDIO_NO_FETCH: '1' };
    const r = spawnSync(process.execPath, [path.join(appDir, 'src', 'render.js')], { input: '{}', cwd: tmp, env, timeout: 20000, windowsHide: true });
    const out = String(r.stdout ?? '');
    if (r.status !== 0 || !out.trim()) {
      throw installError('renderCheck', r.status, String(r.stderr ?? r.error ?? '').trim().slice(0, 400));
    }
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 앱 복사: 새 폴더에 복사·확인 → 이름 바꾸기 두 번으로 바꿔 넣기 → 옛 폴더 지우기(못 지우면 다음 설치 때) */
export function copyApp(appDir, { from = ROOT } = {}) {
  const parent = path.dirname(appDir);
  const base = path.basename(appDir);
  fs.mkdirSync(parent, { recursive: true });
  for (const name of fs.readdirSync(parent)) {
    if (name.startsWith(`${base}.new-`) || name.startsWith(`${base}.old-`)) {
      try { fs.rmSync(path.join(parent, name), { recursive: true, force: true }); } catch { /* 다음에 */ }
    }
  }
  const tag = `${process.pid}-${Date.now().toString(36)}`;
  const stage = path.join(parent, `${base}.new-${tag}`);
  fs.mkdirSync(stage);
  try {
    fs.copyFileSync(path.join(from, 'package.json'), path.join(stage, 'package.json'));
    fs.cpSync(path.join(from, 'src'), path.join(stage, 'src'), { recursive: true });
    fs.cpSync(path.join(from, 'skill'), path.join(stage, 'skill'), { recursive: true }); // 설치본에서도 다시 설치·되돌리기가 되게
    checkApp(stage);
  } catch (e) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw e;
  }
  let old = null;
  let waitedMs = 0;
  if (fs.existsSync(appDir)) {
    old = path.join(parent, `${base}.old-${tag}`);
    const t0 = Date.now();
    retry(() => fs.renameSync(appDir, old));
    waitedMs = Date.now() - t0;
  }
  try {
    retry(() => fs.renameSync(stage, appDir));
  } catch (e) {
    if (old) retry(() => fs.renameSync(old, appDir));
    fs.rmSync(stage, { recursive: true, force: true });
    throw e;
  }
  let leftover = null;
  if (old) {
    try { retry(() => fs.rmSync(old, { recursive: true, force: true })); } catch { leftover = old; }
  }
  return { app: appDir, leftover, waitedMs };
}

/**
 * 스킬 폴더를 그대로 복사(파일마다 원자 쓰기, 바이트 그대로 — 경로를 채우지 않는다).
 * @returns {string[]} 복사한 파일 이름
 */
export function copySkill(skillDir, { from = ROOT } = {}) {
  const src = path.join(from, 'skill', SKILL_NAME);
  const names = fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
  for (const name of names) writeFileAtomic(path.join(skillDir, name), fs.readFileSync(path.join(src, name)));
  return names;
}

/** PATH의 node가 보이는가(상태줄 명령이 `node`로 부른다) */
export function nodeOnPath() {
  const r = spawnSync('node', ['-e', 'process.stdout.write(process.version)'], { timeout: 10000, windowsHide: true });
  return r.status === 0 ? String(r.stdout) : null;
}

export function install({ home = os.homedir(), from = ROOT, now = new Date() } = {}) {
  const p = installPaths(home);
  const nodeVersion = nodeOnPath();
  if (!nodeVersion) throw installError('noNode');
  const settingsText = readSettings(p.settings) ?? '{}\n';
  const target0 = JSON.parse(settingsText.replace(/^﻿/, '')); // 깨진 settings.json이면 아무것도 바꾸기 전에 멈춘다
  const before = target0?.statusLine;

  const app = copyApp(p.app, { from });
  copySkill(p.skillDir, { from });

  const command = renderCommand(p.app);
  const base = before && typeof before === 'object' && !Array.isArray(before) ? before : { type: 'command' };
  const target = { ...base, type: 'command', command };
  let backup = 'kept';
  if (!isStudioCommand(before?.command)) {
    // 이전 값이 이 앱의 명령이면 백업을 덮지 않는다(두 번 설치해도 restore가 처음 값으로)
    writeFileAtomic(p.backup, `${JSON.stringify({ savedAt: now.toISOString(), settings: p.settings, statusLine: before ?? null }, null, 2)}\n`);
    backup = 'written';
  } else if (!fs.existsSync(p.backup)) {
    backup = 'none';
  }
  const { text } = setStatusLine(settingsText, target);
  writeFileAtomic(p.settings, text);
  return { paths: p, before: before ?? null, after: target, backup, leftover: app.leftover, waitedMs: app.waitedMs, nodeVersion };
}

export function restore({ home = os.homedir() } = {}) {
  const p = installPaths(home);
  let target = { ...DEFAULT_STATUS_LINE };
  let source = 'default';
  try {
    const b = JSON.parse(fs.readFileSync(p.backup, 'utf8'));
    if (b && b.statusLine && typeof b.statusLine === 'object' && !Array.isArray(b.statusLine) && !isStudioCommand(b.statusLine.command)) {
      target = b.statusLine;
      source = 'backup';
    }
  } catch {
    // 백업 없음·깨짐 → bash ~/.claude/statusline.sh
  }
  const settingsText = readSettings(p.settings) ?? '{}\n';
  const { text, previous } = setStatusLine(settingsText, target);
  writeFileAtomic(p.settings, text);
  return { paths: p, before: previous ?? null, after: target, source };
}

function parseArgs(argv) {
  const o = { restore: false, home: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--restore') o.restore = true;
    else if (a === '--home') o.home = path.resolve(argv[++i] ?? '');
    else throw installError('unknownArg', a);
  }
  return o;
}

/** 설치본으로 되돌리는 명령(받은 폴더를 지운 뒤에도 돈다) */
export const restoreCommand = (appDir) => `node "${slashPath(path.join(appDir, 'src', 'install.js'))}" --restore`;

export function main(argv = process.argv.slice(2)) {
  let lang = 'en';
  try {
    const o = parseArgs(argv);
    const home = o.home ?? os.homedir();
    lang = installLanguage(home);
    const m = messages(lang).install;
    if (o.restore) {
      const r = restore({ home });
      console.log(m.restored(r.paths.settings));
      console.log(m.before(JSON.stringify(r.before)));
      console.log(m.restoreAfter(JSON.stringify(r.after), r.source === 'backup' ? m.fromBackup(r.paths.backup) : m.noBackup));
      console.log(m.keptFiles);
      return 0;
    }
    const r = install({ home });
    console.log(m.installed(r.paths.app));
    console.log(m.skill(r.paths.skillDir));
    console.log(m.settings(r.paths.settings));
    console.log(m.before(JSON.stringify(r.before)));
    console.log(m.after(JSON.stringify(r.after)));
    console.log(m.backup(r.paths.backup, { written: m.backupWritten, kept: m.backupKept, none: m.backupNone }[r.backup]));
    console.log(m.swap(r.waitedMs));
    if (r.leftover) console.log(m.leftover(r.leftover));
    console.log(m.node(r.nodeVersion, restoreCommand(r.paths.app)));
    return 0;
  } catch (e) {
    process.stderr.write(`${messages(lang).install.failed(e.localize ? e.localize(lang) : e.message)}\n`);
    return 1;
  }
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
// npx는 node_modules/.bin 링크로 부르므로 실제 경로로 비교한다
const realArgv = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && same(realArgv(process.argv[1]), fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
