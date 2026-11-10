// 그리기 — 상태 + 항목 글자(render.js renderItemTexts) → 화면 줄. 파일·터미널은 만지지 않는다.
// 미리보기는 render.js와 같은 항목 글자·같은 잇기(joinLine)를 쓰고, 고른 항목만 SGR 반전으로 감싼다
// (반전은 칸 계산에 기대지 않는다 — 이모지 폭 2칸이 어긋나지 않게).
// 줄 끝 [+]는 미리보기 줄 뒤에 흐리게(SGR 2/22) 붙는 고정 꼬리 ADD_TAIL — stripHighlight가 반전과 함께 떼어
// render.js 출력과 바이트로 맞댈 수 있다. 새 줄 [+]는 미리보기 줄 아래 따로 한 줄(미리보기 줄 수에 안 든다).
// 고정 문구는 s.lang(src/i18n). 언어 선택 화면(s.langPick)은 두 언어를 같이 쓴다(아직 언어를 모르므로).
import { getItem } from '../items/index.js';
import { itemName, LANGUAGE_NAMES, LANGUAGES, localized, messages } from '../i18n/index.js';
import { joinLine } from '../render.js';
import { effectiveIcon, frameView, isDirty, modeOf, rowsOf, sameSlot, selectedSlot } from './state.js';
import { screenRows, textWidth } from './width.js';

export const REV_ON = '\x1b[7m';
export const REV_OFF = '\x1b[27m';
const DIM_ON = '\x1b[2m';
const DIM_OFF = '\x1b[22m';
const rev = (s) => `${REV_ON}${s}${REV_OFF}`;

/** 미리보기 줄 끝 [+] 꼬리(고르면 [+]만 반전 — 반전을 빼면 이 글자 그대로) */
export const ADD_TAIL = `  ${DIM_ON}[+]${DIM_OFF}`;
const addTail = (selected) => (selected ? `  ${DIM_ON}${rev('[+]')}${DIM_OFF}` : ADD_TAIL);
/** 미리보기 아래 새 줄 [+] 글자 */
export const newlineMark = (lang) => messages(lang).newlineMark;

/** 강조·[+] 꼬리 빼기 — 미리보기 줄을 render.js 출력과 바이트로 맞대 볼 때 */
export function stripHighlight(s) {
  const t = String(s).split(REV_ON).join('').split(REV_OFF).join('');
  return t.endsWith(ADD_TAIL) ? t.slice(0, -ADD_TAIL.length) : t;
}

/** 미리보기 줄: 줄마다 항목 글자를 render.js와 같게 잇고(숨김 빼기·두 칸·다 숨으면 줄 빼기) 끝에 [+] 꼬리 */
export function previewLines(itemTexts, slot) {
  const out = [];
  itemTexts.forEach((texts, li) => {
    const marked = texts.map((t, ii) => (t !== null && sameSlot(slot, { kind: 'item', line: li, index: ii }) ? rev(t) : t));
    const line = joinLine(marked);
    if (line !== null) out.push(`${line}${addTail(sameSlot(slot, { kind: 'add', line: li }))}`);
  });
  return out;
}

/** 미리보기 아래 새 줄 [+] 줄 */
export function newlinePreview(slot, lang = 'ko') {
  const mark = newlineMark(lang);
  return `${DIM_ON}${slot?.kind === 'newline' ? rev(mark) : mark}${DIM_OFF}`;
}

/** 줄·항목 칸 목록(숨은 항목·빈 줄도 보인다 — 미리보기에 안 나와도 고를 수 있게) */
function structureLines(s, itemTexts, cols) {
  const m = messages(s.lang);
  const slot = selectedSlot(s);
  const out = [];
  let focus = 0;
  rowsOf(s.config).forEach((row, ri) => {
    const isNewline = row[0]?.kind === 'newline';
    const head = `${isNewline ? ' +' : String(ri + 1).padStart(2)}│ `;
    if (ri === s.cursor.row) focus = out.length;
    let cur = head;
    let curW = textWidth(head);
    row.forEach((sl, ci) => {
      let chip;
      if (sl.kind === 'newline') chip = m.newlineMark;
      else if (sl.kind === 'add') chip = s.config.lines[sl.line].items.length ? '[+]' : m.emptyLine;
      else {
        const conf = s.config.lines[sl.line].items[sl.index];
        const def = getItem(conf.id);
        const icon = effectiveIcon(conf, def);
        const hidden = itemTexts[sl.line]?.[sl.index] === null;
        chip = `[${icon ? `${icon} ` : ''}${itemName(def, s.lang) ?? `? ${conf.id}`}${hidden ? m.hiddenMark : ''}]`;
      }
      const w = textWidth(chip) + 1;
      if (ci > 0 && cols && curW + w > cols) {
        out.push(cur);
        cur = ' '.repeat(head.length);
        curW = head.length;
      }
      const isSel = sameSlot(slot, sl);
      cur += `${ci > 0 && cur.trim() ? ' ' : ''}${isSel ? rev(chip) : chip}`;
      curW += w;
    });
    out.push(cur);
  });
  return { lines: out, focus };
}

const swatch = (n, color) => (color && Number.isInteger(n) ? ` \x1b[38;5;${n}m██\x1b[0m` : '');

/** 편집 메뉴 줄 */
function panelLines(s, color) {
  if (!s.stack.length) return { lines: [], focus: 0, help: 'browse' };
  const frame = s.stack[s.stack.length - 1];
  const view = frameView(s, frame);
  if (!view) return { lines: [], focus: 0, help: 'browse' };
  const trail = s.stack.map((f) => frameView(s, f)?.title.split(' — ')[0]).join(' › ');
  const lines = [`── ${trail} ──`];
  if (frame.type === 'input') {
    lines.push(`  ${view.title}`);
    lines.push(`  > ${frame.value}${REV_ON} ${REV_OFF}`);
    return { lines, focus: 2, help: 'input' };
  }
  if (view.title !== trail) lines.push(`  ${view.title}`);
  const first = lines.length;
  view.rows.forEach((r, i) => {
    const text = `${r.label}${r.value !== '' ? `  ${r.value}` : ''}`;
    lines.push(`${i === frame.cursor ? ' › ' : '   '}${i === frame.cursor ? rev(text) : text}${swatch(r.swatch, color)}`);
  });
  return { lines, focus: first + frame.cursor, help: view.help };
}

/** 넘치면 focus 둘레만 남긴다 */
function windowAround(lines, focus, max) {
  if (lines.length <= max) return lines;
  const n = Math.max(1, max);
  const start = Math.max(0, Math.min(focus - Math.floor(n / 2), lines.length - n));
  return lines.slice(start, start + n);
}

const physical = (lines, cols) => lines.reduce((a, l) => a + screenRows(l, cols), 0);

/**
 * 화면 줄 만들기.
 * @param {object} s 상태
 * @param {object} view
 * @param {(string|null)[][]} view.itemTexts renderItemTexts(s.config, ctx)
 * @param {number} [view.cols] 터미널 칸 수
 * @param {number} [view.rows] 터미널 줄 수(넘치면 줄·항목과 메뉴를 고른 자리 둘레로 줄인다)
 * @param {boolean} [view.color] 메뉴 색 견본(NO_COLOR면 끔)
 * @returns {{lines: string[], preview: {start: number, count: number}}}
 */
export function drawScreen(s, { itemTexts, cols = 100, rows = 0, color = true } = {}) {
  if (s.langPick) return { lines: languageLines(s, cols), preview: { start: 0, count: 0 } };
  const m = messages(s.lang);
  const dirty = isDirty(s);
  const head = [`Statusline Studio — ${s.configPath}${dirty ? m.dirty : ''}`];
  const slot = selectedSlot(s);
  const preview = previewLines(itemTexts, slot);
  const top = [
    ...head,
    m.previewHead(localized(s.inputSource, s.lang)),
    ...preview,
    newlinePreview(slot, s.lang),
    m.structHead,
  ];
  const struct = structureLines(s, itemTexts, cols);
  const panel = panelLines(s, color);
  const helpKey = modeOf(s) === 'browse' ? 'browse' : panel.help;
  const foot = ['─'.repeat(Math.min(cols || 60, 60)), s.message ?? '', m.help[helpKey] ?? m.help.browse];

  let structLines = struct.lines;
  let panelL = panel.lines;
  if (rows > 0) {
    const budget = rows - physical(top, cols) - physical(foot, cols);
    if (physical(structLines, cols) + physical(panelL, cols) > budget) {
      panelL = windowAround(panelL, panel.focus, Math.max(3, budget - physical(structLines, cols)));
      if (physical(structLines, cols) + physical(panelL, cols) > budget) {
        structLines = windowAround(structLines, struct.focus, Math.max(1, budget - physical(panelL, cols)));
      }
    }
  }
  return {
    lines: [...top, ...structLines, ...panelL, ...foot],
    preview: { start: 2, count: preview.length },
  };
}

/** 언어 선택 화면에 쓰는 두 언어 문구(아직 언어를 모르므로 함께 보인다) */
export const LANGUAGE_SCREEN = Object.freeze({
  title: '── Language / 언어 ──',
  intro: 'Choose the language of this editor. / 편집 화면 언어를 고른다.',
  later: 'Change it later with L in the editor. / 나중에 편집 화면에서 L로 바꾼다.',
  current: '(current / 지금)',
  help: '↑↓ Select / 고르기   Enter OK / 정하기   q Quit / 끝',
  helpBack: '↑↓ Select / 고르기   Enter OK / 정하기   Esc Back / 뒤로   q Quit / 끝',
});

/** 언어 선택 화면 줄 — 첫 실행(설정에 language 없음)·--language */
export function languageLines(s, cols = 100) {
  const p = s.langPick;
  const cur = p.first ? null : s.lang;
  return [
    'Statusline Studio',
    LANGUAGE_SCREEN.title,
    LANGUAGE_SCREEN.intro,
    '',
    ...LANGUAGES.map((code, i) => {
      const text = `${LANGUAGE_NAMES[code]}${code === cur ? `  ${LANGUAGE_SCREEN.current}` : ''}`;
      return `${i === p.cursor ? ' › ' : '   '}${i === p.cursor ? rev(text) : text}`;
    }),
    '',
    LANGUAGE_SCREEN.later,
    '─'.repeat(Math.min(cols || 60, 60)),
    p.first ? LANGUAGE_SCREEN.help : LANGUAGE_SCREEN.helpBack,
  ];
}

/** 터미널에 쓸 글자: 맨 위로 가서 줄마다 끝 지우기, 남은 아래 지우기(깜빡임 없이 덮어쓰기) */
export function screenText(lines) {
  return `\x1b[H${lines.map((l) => `${l}\x1b[K`).join('\r\n')}\x1b[J`;
}

/** 덤프용 글자: 반전 → »…«, 그 밖의 색 코드는 뺀다 */
export function plainScreen(lines) {
  return lines.map((l) => String(l).split(REV_ON).join('»').split(REV_OFF).join('«').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')).join('\n');
}
