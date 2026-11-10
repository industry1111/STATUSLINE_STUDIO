// 설치본을 부르는 명령 글자 — install.js(settings.json)와 시험·스모크가 쓴다.
// 스킬의 명령은 skill/create-statusline/check.sh(bash — node가 없어도 돌아야 한다)가 실행 때 홈으로 같은 모양을 만든다.
//
// 경로는 절대 경로·슬래시·따옴표: Claude Code가 상태줄 명령을 어느 셸(Git Bash·cmd·PowerShell)로 부르든
// `~`·백슬래시 해석에 기대지 않게. wt.exe는 셸 없이 프로세스를 띄워 `~`가 펴지지 않는다.
// node는 PATH의 `node`: 절대 경로(`C:/Program Files/nodejs/node.exe`)는 빈칸 때문에 따옴표가 필요한데,
// 따옴표로 시작하는 명령은 PowerShell에서 `&` 없이는 구문 오류, `cmd /c`에서는 바깥 따옴표가 벗겨진다.
import path from 'node:path';

export const TAB_TITLE = 'Statusline Studio';

/** 백슬래시 → 슬래시 */
export const slashPath = (p) => String(p).replace(/\\/g, '/');

export const renderScript = (appDir) => slashPath(path.join(appDir, 'src', 'render.js'));
export const studioScript = (appDir) => slashPath(path.join(appDir, 'src', 'studio.js'));

/** settings.json `statusLine.command` */
export function renderCommand(appDir) {
  return `node "${renderScript(appDir)}"`;
}

/** 새 탭 wt.exe 인자(스모크는 끝에 extra만 붙인다) */
export function tabArgs(appDir, extra = []) {
  return ['-w', '0', 'nt', '--title', TAB_TITLE, 'node', studioScript(appDir), ...extra];
}

const quote = (a) => (/^[-\w.]+$/.test(a) ? a : `"${a}"`);

/** 스킬이 Bash로 실행할 한 줄 = `wt.exe` + tabArgs(appDir, extra) — `/create-statusline language`면 extra = ['--language'] */
export function tabCommand(appDir, extra = []) {
  return ['wt.exe', ...tabArgs(appDir, extra)].map(quote).join(' ');
}

/** Windows Terminal 밖에서 직접 띄울 명령 */
export function directCommand(appDir, extra = []) {
  return [`node "${studioScript(appDir)}"`, ...extra.map(quote)].join(' ');
}

/** `/create-statusline language en|ko` — 탭 없이 언어만 저장 */
export function setLanguageCommand(appDir, lang) {
  return `node "${studioScript(appDir)}" --set-language ${lang}`;
}

/** node가 없을 때 스킬이 보이고(승인 뒤) 실행하는 명령 */
export const NODE_INSTALL_COMMAND = 'winget install --id OpenJS.NodeJS.LTS -e';

/** 이 앱이 설치한 상태줄 명령인가(백업이 studio 명령으로 덮이지 않게) */
export function isStudioCommand(cmd) {
  return typeof cmd === 'string' && /statusline-studio\/app\/src\/render\.js/i.test(slashPath(cmd));
}
