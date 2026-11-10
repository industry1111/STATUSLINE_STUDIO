// 표시 형식 — 퍼센트·막대·남은 시간·시각·금액·K/M·경로.
// 반올림·자르기는 statusline.sh가 쓰던 bash 정수 나눗셈·printf/awk(%.Nf, 짝수 반올림)와 같다.

/** bash `[[ $v =~ ^[0-9]+$ ]]` */
export const isUInt = (v) => /^[0-9]+$/.test(String(v));

/** 막대 — statusline.sh progress_bar. */
export function bar(pct, width = 10, fill = '=', empty = '-') {
  let p = isUInt(pct) ? Number(pct) : 0;
  if (p > 100) p = 100;
  const w = Number.isInteger(width) && width >= 0 ? width : 10;
  const filled = Math.floor((p * w) / 100);
  return fill.repeat(filled) + empty.repeat(w - filled);
}

/** 퍼센트 항목 글자. show: percent | bar | both */
export function percentText(pct, fmt = {}) {
  const b = () => `[${bar(pct, fmt.width ?? 10, fmt.fill ?? '=', fmt.empty ?? '-')}]`;
  switch (fmt.show) {
    case 'percent': return `${pct}%`;
    case 'bar': return b();
    default: return `${pct}% ${b()}`;
  }
}
export const PERCENT_SHOWS = ['both', 'percent', 'bar'];

/**
 * C printf `%.Nf` — double의 정확한 십진 값을 짝수 반올림.
 * (bash printf·awk printf와 같다. 0.125 → 0.12, 0.375 → 0.38)
 */
export function cFixed(x, digits = 2) {
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan';
  const neg = x < 0;
  const exact = Math.abs(x).toFixed(100); // 2^-47 이상이면 정확한 전개
  const [ip, fp] = exact.split('.');
  const keep = fp.slice(0, digits);
  const rest = fp.slice(digits);
  let n = BigInt(ip + keep);
  const first = rest[0] ?? '0';
  const tail = rest.slice(1);
  if (first > '5' || (first === '5' && /[1-9]/.test(tail))) n += 1n;
  else if (first === '5' && n % 2n === 1n) n += 1n;
  let s = n.toString().padStart(digits + 1, '0');
  if (digits > 0) s = `${s.slice(0, -digits)}.${s.slice(-digits)}`;
  return (neg ? '-' : '') + s; // C처럼 -0.001 → -0.00
}

/** 금액 `$1.23` */
export function moneyText(v, fmt = {}) {
  return `${fmt.symbol ?? '$'}${cFixed(Number(v), fmt.decimals ?? 2)}`;
}

/** awk `%.Nf`K/M (statusline.sh:379). 1000 미만은 awk `%d`(버림). */
export function compactNumber(n, decimals = 0) {
  if (n >= 1000000) return `${cFixed(n / 1000000, decimals)}M`;
  if (n >= 1000) return `${cFixed(n / 1000, decimals)}K`;
  return String(Math.trunc(n));
}

/** 남은 시간. units: hm → `3h 5m`, dh → `2d 4h`, ms → `4m 30s` */
export function remainingText(sec, units = 'hm') {
  if (units === 'dh') return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
  if (units === 'ms') return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

/** 걸린 시간(초) — 1시간 이상 `1h 5m`, 1분 이상 `30m 34s`, 아니면 `42s` */
export function durationText(sec) {
  const t = Math.max(0, Math.floor(sec));
  if (t >= 3600) return `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`;
  if (t >= 60) return `${Math.floor(t / 60)}m ${t % 60}s`;
  return `${t}s`;
}

const pad2 = (n) => String(n).padStart(2, '0');
/** 현지 시각. 패턴 글자 YYYY MM DD HH mm ss (date +"%m/%d %H:%M" = 'MM/DD HH:mm') */
export function clockText(epochSec, pattern = 'MM/DD HH:mm') {
  const d = new Date(epochSec * 1000);
  const map = {
    YYYY: String(d.getFullYear()), MM: pad2(d.getMonth() + 1), DD: pad2(d.getDate()),
    HH: pad2(d.getHours()), mm: pad2(d.getMinutes()), ss: pad2(d.getSeconds()),
  };
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => map[t]);
}

/** 리셋 항목 글자. show: both → `3h 5m (11/09 16:00)` | remaining | time */
export function resetText(remainingSec, epochSec, fmt = {}) {
  const rem = remainingText(remainingSec, fmt.units);
  const at = clockText(epochSec, fmt.clock ?? 'MM/DD HH:mm');
  switch (fmt.show) {
    case 'remaining': return rem;
    case 'time': return at;
    default: return `${rem} (${at})`;
  }
}
export const RESET_SHOWS = ['both', 'remaining', 'time'];

/** Windows 홈 `C:\Users\x` → Git Bash 꼴 `/c/Users/x` */
export function posixHome(home) {
  const m = /^([A-Za-z]):[\\/]?(.*)$/.exec(home ?? '');
  if (!m) return home ?? '';
  const rest = m[2].replace(/\\/g, '/').replace(/\/+$/, '');
  return `/${m[1].toLowerCase()}${rest ? `/${rest}` : ''}`;
}

/**
 * 경로. tilde: posix → Git Bash 꼴 홈(`/c/Users/x…`)으로 시작할 때만 `~`(statusline.sh:90의 sed와 같다),
 * none → 그대로.
 */
export function pathText(dir, fmt = {}, home = '') {
  if ((fmt.tilde ?? 'posix') === 'posix') {
    const h = posixHome(home);
    if (h && dir.startsWith(h)) return `~${dir.slice(h.length)}`;
  }
  return dir;
}

/** `{이름}` 자리 채우기. 모르는 이름은 그대로 둔다. */
export function expand(tpl, parts = {}) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(parts, k) ? String(parts[k]) : m));
}
