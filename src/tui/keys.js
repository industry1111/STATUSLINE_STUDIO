// 키 해석과 키 표. 키를 바꾸려면 여기 KEYMAP과 도움말 줄(src/i18n/en.js·ko.js의 help)을 같이 고친다.
// 입력은 Windows Terminal(xterm) 순서: ←→↑↓ `\x1b[D` `\x1b[C` `\x1b[A` `\x1b[B`, Shift+화살표 `\x1b[1;2D` …,
// Del `\x1b[3~`, Enter `\r`, Backspace `\x7f`(libuv는 `\b`도), Esc 단독 `\x1b`, Ctrl+C `\x03`.
// 한 덩어리에 키 여러 개가 붙어 와도, 순서 하나가 두 덩어리로 갈라져 와도 같게 읽는다 —
// 덩어리 끝에서 끝나지 않은 순서는 다음 덩어리를 기다리고, 끝의 Esc 하나는 flush()(짧은 시간 뒤)에 Esc로 낸다.

/** 화면 상태별 키 → 동작 이름. 키 이름은 decode가 내는 name(글자 키는 그 글자). */
export const KEYMAP = Object.freeze({
  browse: Object.freeze({
    left: 'prev',
    right: 'next',
    up: 'lineUp',
    down: 'lineDown',
    enter: 'edit',
    delete: 'remove',
    'shift+left': 'moveLeft',
    'shift+right': 'moveRight',
    'shift+up': 'moveUp',
    'shift+down': 'moveDown',
    s: 'save',
    L: 'language', // 한 번에 en ↔ ko 바꾸고 바로 저장(lines는 그대로)
    l: 'language',
    q: 'quit',
    'ctrl+c': 'abort',
  }),
  // 언어 선택 화면(첫 실행 · --language)
  language: Object.freeze({
    up: 'up',
    down: 'down',
    enter: 'ok',
    escape: 'back',
    q: 'quit',
    'ctrl+c': 'abort',
  }),
  menu: Object.freeze({
    up: 'up',
    down: 'down',
    left: 'dec',
    right: 'inc',
    enter: 'ok',
    escape: 'back',
    backspace: 'back',
    'ctrl+c': 'abort',
  }),
  // 글자 입력 칸: 여기 없는 글자 키는 칸에 들어간다
  input: Object.freeze({
    enter: 'ok',
    escape: 'cancel',
    backspace: 'erase',
    'ctrl+u': 'clear',
    'ctrl+c': 'abort',
  }),
});

const ESC = '\x1b';
const ARROWS = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end' };
const TILDES = { 1: 'home', 2: 'insert', 3: 'delete', 4: 'end', 5: 'pageup', 6: 'pagedown', 7: 'home', 8: 'end' };

/** xterm 수식 번호(1 + shift 1 · alt 2 · ctrl 4) → 이름 앞머리 */
function modPrefix(m) {
  const bits = (Number(m) || 1) - 1;
  return `${bits & 4 ? 'ctrl+' : ''}${bits & 2 ? 'alt+' : ''}${bits & 1 ? 'shift+' : ''}`;
}

/** CSI·SS3 순서 → 키 */
function seqKey(seq) {
  if (seq[1] === 'O') {
    const n = ARROWS[seq[2]];
    return { name: n ?? 'unknown', seq };
  }
  const body = seq.slice(2, -1);
  const fin = seq[seq.length - 1];
  const params = body.split(';');
  if (ARROWS[fin]) return { name: `${modPrefix(params[1])}${ARROWS[fin]}`, seq };
  if (fin === '~' && TILDES[params[0]]) return { name: `${modPrefix(params[1])}${TILDES[params[0]]}`, seq };
  if (fin === 'Z') return { name: 'shift+tab', seq };
  return { name: 'unknown', seq };
}

/** 제어 글자 하나 → 키 */
function controlKey(ch) {
  switch (ch) {
    case '\r':
    case '\n': return { name: 'enter', seq: ch };
    case '\x7f':
    case '\b': return { name: 'backspace', seq: ch };
    case '\t': return { name: 'tab', seq: ch };
    case '\x03': return { name: 'ctrl+c', seq: ch };
    default: {
      const c = ch.charCodeAt(0);
      if (c >= 1 && c <= 26) return { name: `ctrl+${String.fromCharCode(c + 96)}`, seq: ch };
      return { name: 'unknown', seq: ch };
    }
  }
}

const isFinalByte = (c) => c >= 0x40 && c <= 0x7e;

/**
 * 키 해석기. feed(덩어리) → 키 목록, flush() → 기다리던 것까지 낸다(끝의 Esc 단독 등).
 * 키 = { name, seq, ch? } — 보이는 글자 키는 name = ch = 그 글자(이모지·한글 포함, 코드 포인트 하나).
 */
export function createKeyDecoder() {
  let buf = '';

  function parse(final) {
    const out = [];
    let i = 0;
    while (i < buf.length) {
      const c = buf[i];
      if (c === ESC) {
        if (i + 1 >= buf.length) {
          if (!final) break; // 다음 덩어리에 순서의 나머지가 올 수 있다
          out.push({ name: 'escape', seq: ESC });
          i += 1;
          continue;
        }
        const n = buf[i + 1];
        if (n === '[') {
          let j = i + 2;
          while (j < buf.length && !isFinalByte(buf.charCodeAt(j))) j++;
          if (j >= buf.length) {
            if (!final) break;
            out.push({ name: 'escape', seq: ESC }); // 끝나지 않은 순서: Esc로 보고 나머지는 글자로
            i += 1;
            continue;
          }
          out.push(seqKey(buf.slice(i, j + 1)));
          i = j + 1;
          continue;
        }
        if (n === 'O') {
          if (i + 2 >= buf.length) {
            if (!final) break;
            out.push({ name: 'escape', seq: ESC });
            i += 1;
            continue;
          }
          out.push(seqKey(buf.slice(i, i + 3)));
          i += 3;
          continue;
        }
        // Esc 뒤에 순서가 아닌 글자(Esc 두 번 포함): Esc 하나, 다음 글자는 따로
        out.push({ name: 'escape', seq: ESC });
        i += 1;
        continue;
      }
      const cp = buf.codePointAt(i);
      if (cp >= 0xd800 && cp <= 0xdbff && i + 1 >= buf.length && !final) break; // 반쪽 서로게이트
      const ch = String.fromCodePoint(cp);
      i += ch.length;
      if (cp < 0x20 || cp === 0x7f) out.push(controlKey(ch));
      else out.push({ name: ch, ch, seq: ch });
    }
    buf = buf.slice(i);
    return out;
  }

  return {
    feed(chunk) {
      buf += String(chunk);
      return parse(false);
    },
    flush() {
      return parse(true);
    },
    /** 다음 덩어리를 기다리는 글자가 있나(실제 터미널은 짧은 시간 뒤 flush) */
    get pending() {
      return buf.length > 0;
    },
  };
}

/** 키 이름 → 동작(그 화면 상태의 키 표에 없으면 null) */
export function actionOf(mode, key) {
  return KEYMAP[mode]?.[key.name] ?? null;
}

/** 키 바이트를 보이게(각본·덤프용): ESC → \e, 제어 글자 → \xNN */
export function visibleKeys(s) {
  return Array.from(String(s), (ch) => {
    const c = ch.codePointAt(0);
    if (ch === ESC) return '\\e';
    if (ch === '\r') return '\\r';
    if (ch === '\\') return '\\\\';
    if (c < 0x20 || c === 0x7f) return `\\x${c.toString(16).padStart(2, '0')}`;
    return ch;
  }).join('');
}
