// 화면 칸 수 — 줄 감싸기·넘침 계산에만 쓴다(강조는 칸에 기대지 않는 SGR 반전).
// 이모지·한글·CJK는 2칸, 결합 문자·ZWJ·이모지 변형 선택자는 0칸, 색 코드는 0칸.

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export const stripAnsi = (s) => String(s).replace(ANSI, '');

const ZERO = /[\p{Mn}\p{Me}​-‏︀-️\u{E0100}-\u{E01EF}]/u;
const EMOJI_WIDE = /\p{Emoji_Presentation}/u;
const PICTO = /\p{Extended_Pictographic}/u;

function wideCJK(cp) {
  return (cp >= 0x1100 && cp <= 0x115f)
    || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff)
    || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff)
    || (cp >= 0xa000 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f)
    || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x20000 && cp <= 0x3fffd);
}

/** 글자의 화면 칸 수(색 코드 제외) */
export function textWidth(s) {
  const chars = Array.from(stripAnsi(s));
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || ZERO.test(ch)) continue;
    if (chars[i - 1] === '‍') continue; // ZWJ로 이어진 이모지는 앞 글자 칸에 붙는다
    if (EMOJI_WIDE.test(ch) || wideCJK(cp) || (PICTO.test(ch) && chars[i + 1] === '️')) w += 2;
    else w += 1;
  }
  return w;
}

/** 한 줄이 cols 칸 화면에서 차지하는 행 수 */
export function screenRows(line, cols) {
  if (!cols || cols < 1) return 1;
  return Math.max(1, Math.ceil(textWidth(line) / cols));
}
