// 편집 화면 진입점: `node src/studio.js`
//   터미널에서: 대체 화면·커서 숨김·raw 모드로 띄운다. 끝(q·Ctrl+C)·예외·신호에 반드시 되돌린다.
//   `--dump`: 터미널 없이 첫 화면을 그대로(색 코드 포함) stdout에 쓰고 끝(시험·확인용).
//   `--smoke <표시 파일>`: 실제 터미널에 첫 화면을 그리고 표시 파일을 남긴 뒤 되돌리고 exit 0(새 탭 스모크용, 키 안 받음).
//   `--language`: 언어 선택 화면으로 시작(설정에 language가 있어도). --dump·--smoke와 같이 쓸 수 있다.
//   `--set-language en|ko`: 화면 없이 설정의 language만 쓰고 exit 0(lines는 그대로). 틀린 값·쓰기 실패면 exit 1.
// 설정 쓰기는 s를 눌렀을 때와 언어를 정했을 때만(src/config.js 원자 쓰기). 비용 파일·last-input.json은 쓰지 않는다.
// 설정에 language가 없으면(첫 실행) 첫 화면이 언어 선택 화면이다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeConfig, writeFileAtomic, writeLanguage } from './config.js';
import { isLanguage, messages } from './i18n/index.js';
import { createSession } from './tui/app.js';
import { screenText } from './tui/draw.js';

/**
 * `--set-language en|ko` — 화면 없이 언어만 저장. 성공 exit 0, 틀린 값·쓰기 실패 exit 1.
 * @returns {number} exit 코드
 */
export function setLanguageCommand(value, { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  if (!isLanguage(value)) {
    stderr.write(`statusline-studio: --set-language en|ko — ${messages('en').cfg.badLanguage(value ?? '')} / ${messages('ko').cfg.badLanguage(value ?? '')}\n`);
    return 1;
  }
  try {
    const r = writeLanguage(value, { env });
    stdout.write(`${messages(value).cliLanguageSaved(r.path)}\n`);
    return 0;
  } catch (e) {
    stderr.write(`statusline-studio: ${messages(value).cliLanguageFailed(e.message)}\n`);
    return 1;
  }
}

const ESC_WAIT_MS = 40; // 끝의 Esc 하나를 Esc로 볼 때까지 기다리는 시간(순서의 앞머리와 구분)
const ENTER = '\x1b[?1049h\x1b[?25l'; // 대체 화면, 커서 숨김
const LEAVE = '\x1b[0m\x1b[?25h\x1b[?1049l'; // 색 끄기, 커서 보이기, 원래 화면

export function main({ argv = process.argv.slice(2), env = process.env } = {}) {
  const { stdin, stdout } = process;
  const setAt = argv.indexOf('--set-language');
  if (setAt >= 0) {
    process.exitCode = setLanguageCommand(argv[setAt + 1], { env });
    return;
  }
  const session = createSession({
    env,
    cwd: process.cwd(),
    save: (cfg, lang) => writeConfig(cfg, { env, lang }),
    chooseLanguage: argv.includes('--language'),
    cols: stdout.columns || 100,
    rows: stdout.rows || 0,
  });

  if (argv.includes('--dump')) {
    stdout.write(`${session.draw().lines.join('\n')}\n`);
    return;
  }
  const smokeAt = argv.indexOf('--smoke');
  if (smokeAt >= 0) {
    const holdAt = argv.indexOf('--smoke-hold');
    smoke(session, { file: argv[smokeAt + 1], holdMs: holdAt >= 0 ? Number(argv[holdAt + 1]) || SMOKE_HOLD_MS : SMOKE_HOLD_MS });
    return;
  }
  if (!stdin.isTTY || !stdout.isTTY) {
    process.stderr.write(`${messages(session.state.lang).needTty}\n`);
    process.exitCode = 1;
    return;
  }

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try { stdin.setRawMode(false); } catch { /* 이미 닫힘 */ }
    try { fs.writeSync(stdout.fd, LEAVE); } catch { /* 출력이 닫힘 */ }
  };
  const fail = (e) => {
    restore();
    process.stderr.write(`${messages(session.state.lang).crashed}: ${e?.stack ?? e}\n`);
    process.exit(1);
  };
  process.on('exit', restore);
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => { restore(); process.exit(130); });
  }

  const draw = () => stdout.write(screenText(session.draw().lines));
  let escTimer = null;
  const finish = () => {
    clearTimeout(escTimer);
    stdin.off('data', onData);
    stdout.off('resize', onResize);
    stdin.pause();
    restore();
  };
  const after = () => {
    if (session.state.quit) { finish(); return; }
    draw();
  };
  function onData(chunk) {
    clearTimeout(escTimer);
    session.feed(chunk);
    if (session.pending && !session.state.quit) {
      escTimer = setTimeout(() => { session.flush(); after(); }, ESC_WAIT_MS);
    }
    after();
  }
  function onResize() {
    session.resize(stdout.columns, stdout.rows);
    draw();
  }

  stdout.write(ENTER);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.on('data', onData);
  stdout.on('resize', onResize);
  stdin.resume();
  draw();
}

const SMOKE_HOLD_MS = 2000;

/**
 * `--smoke <표시 파일> [--smoke-hold <ms>]` — 새 탭 스모크용.
 * 실제 터미널에서 대체 화면·raw 모드로 첫 화면을 그리고, 표시 파일에 첫 화면 글자·창 크기·isTTY·raw 성공 여부를 쓴 뒤
 * holdMs(캡처할 틈) 기다렸다가 터미널을 되돌리고 exit 0. 키는 받지 않는다(저장이 일어날 수 없다).
 * 쓰는 파일은 표시 파일뿐(설정·last-input.json·사용량 캐시는 읽기만).
 */
function smoke(session, { file, holdMs }) {
  const { stdin, stdout } = process;
  if (!file) {
    process.stderr.write(`${messages(session.state.lang).smokeUsage}\n`);
    process.exitCode = 2;
    return;
  }
  const t0 = new Date();
  const mark = { pid: process.pid, node: process.version, argv: process.argv.slice(1), cwd: process.cwd(), startedAt: t0.toISOString(),
    isTTY: { stdin: Boolean(stdin.isTTY), stdout: Boolean(stdout.isTTY) }, cols: stdout.columns ?? null, rows: stdout.rows ?? null,
    wtSession: Boolean(process.env.WT_SESSION), studioDirEnv: process.env.STATUSLINE_STUDIO_DIR ?? null };
  const put = (o) => { Object.assign(mark, o); writeFileAtomic(file, `${JSON.stringify(mark, null, 2)}\n`); };
  if (!stdin.isTTY || !stdout.isTTY) {
    put({ phase: 'no-tty', raw: false });
    process.exitCode = 1;
    return;
  }
  let raw = false;
  let rawError = null;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try { if (raw) stdin.setRawMode(false); } catch { /* 이미 닫힘 */ }
    try { fs.writeSync(stdout.fd, LEAVE); } catch { /* 출력이 닫힘 */ }
  };
  process.on('exit', restore);
  try {
    // stdout.write로 쓴다: Windows 콘솔 TTY는 libuv가 UTF-16으로 넘긴다. fs.writeSync(fd)는 UTF-8 바이트를
    // 콘솔 코드 페이지(이 PC 949)로 읽혀 한글·이모지가 깨진다(2026-11-09 첫 스모크 캡처에서 확인).
    stdout.write(ENTER);
    try { stdin.setRawMode(true); raw = stdin.isRaw === true; } catch (e) { rawError = String(e?.message ?? e); }
    session.resize(stdout.columns, stdout.rows);
    stdout.write(screenText(session.draw().lines));
    put({ phase: 'drawn', raw, rawError, drawnAt: new Date().toISOString(), configSource: session.loaded.source,
      configPath: session.state.configPath, inputSource: session.preview.source, screen: session.plain().split('\n') });
  } catch (e) {
    restore();
    try { put({ phase: 'error', raw, error: String(e?.stack ?? e) }); } catch { /* 표시 파일도 못 씀 */ }
    process.exit(1);
  }
  setTimeout(() => {
    restore();
    let rawAfter = null;
    try { rawAfter = stdin.isRaw; } catch { /* 없음 */ }
    put({ phase: 'done', raw, rawError, restoredAt: new Date().toISOString(), rawAfterRestore: rawAfter });
    process.exit(0);
  }, holdMs);
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  main();
}
