// git 읽기. 항목이 처음 물을 때만 git을 부른다(안 쓰면 0회).
// statusline.sh:111-115와 같은 규칙 — 렌더러 프로세스의 현재 폴더 기준,
// `git branch --show-current`가 실패할 때만 `git rev-parse --short HEAD`.
// 변경 파일 수·ahead/behind·마지막 커밋은 `git status --porcelain=v2 --branch` 한 번으로 읽는다(status).
// 설정에 status 항목이 있으면 렌더러가 status를 먼저 읽어(prefetch) 브랜치도 거기서 꺼낸다 — git 1회.
import { spawnSync } from 'node:child_process';

function git(cwd, args) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 3000 });
    if (r.error || r.status !== 0) return null;
    return r.stdout.replace(/\n+$/, ''); // bash $(...)처럼 끝 줄바꿈만 뗀다
  } catch {
    return null;
  }
}

/**
 * `git status --porcelain=v2 --branch` 출력 → 값.
 * @returns {{head: string|null, oid: string|null, upstream: string|null, ahead: number|null, behind: number|null,
 *   staged: number, unstaged: number, untracked: number, conflicted: number}}
 */
export function parsePorcelainV2(text) {
  const s = { head: null, oid: null, upstream: null, ahead: null, behind: null, staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };
  for (const line of String(text).split('\n')) {
    if (line.startsWith('# branch.oid ')) {
      const v = line.slice(13).trim();
      s.oid = v === '(initial)' ? null : v;
    } else if (line.startsWith('# branch.head ')) {
      const v = line.slice(14).trim();
      s.head = v === '(detached)' ? null : v;
    } else if (line.startsWith('# branch.upstream ')) {
      s.upstream = line.slice(18).trim();
    } else if (line.startsWith('# branch.ab ')) {
      const m = /^\+(\d+) -(\d+)$/.exec(line.slice(12).trim());
      if (m) { s.ahead = Number(m[1]); s.behind = Number(m[2]); }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.slice(2, 4);
      if (xy[0] !== '.') s.staged++;
      if (xy[1] !== '.') s.unstaged++;
    } else if (line.startsWith('u ')) {
      s.conflicted++;
      s.unstaged++;
    } else if (line.startsWith('? ')) {
      s.untracked++;
    }
  }
  return s;
}

export function createGitSource(cwd = process.cwd()) {
  const memo = new Map();
  const once = (key, fn) => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key);
  };
  const src = {
    cwd,
    /** git 호출 횟수(시험용) */
    calls: 0,
    /**
     * 브랜치 이름. git 폴더가 아니거나 분리된 HEAD면 ''.
     * status를 이미 읽었으면 거기서 꺼낸다(`branch --show-current`와 같은 값: 이름 / 분리된 HEAD '' / git 아님 '').
     */
    get branch() {
      return once('branch', () => {
        if (memo.has('status')) {
          const st = memo.get('status');
          return st ? (st.head ?? '') : '';
        }
        src.calls++;
        const b = git(cwd, ['branch', '--show-current']);
        if (b !== null) return b;
        src.calls++;
        return git(cwd, ['rev-parse', '--short', 'HEAD']) ?? '';
      });
    },
    /** status를 먼저 읽는다(설정에 status 항목이 있을 때 렌더러가 부른다). */
    prefetchStatus() {
      return src.status;
    },
    /** 변경 파일 수·ahead/behind·커밋 — git 폴더가 아니면 null. */
    get status() {
      return once('status', () => {
        src.calls++;
        const out = git(cwd, ['--no-optional-locks', 'status', '--porcelain=v2', '--branch']);
        return out === null ? null : parsePorcelainV2(out);
      });
    },
  };
  return src;
}
