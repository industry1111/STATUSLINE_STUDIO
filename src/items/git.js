// 카테고리 git — 렌더러가 도는 폴더의 git(statusline.sh:111-115, 359-361).
// 브랜치 말고는 `git status --porcelain=v2 --branch` 한 번(gitStatus: true인 항목이 있으면 렌더러가 먼저 읽는다).
// PR 번호·상태·주소는 입력 JSON `pr.*`.
import { countResult, decorate, inputText, item, pickNum, textResult } from './common.js';

export const category = {
  id: 'git',
  name: 'git',
  nameEn: 'Git',
  icons: ['\u{1F33F}', '\u{1F500}', '\u{2705}', '\u{270F}\u{FE0F}', '\u{2753}', '\u{2B06}\u{FE0F}', '\u{2B07}\u{FE0F}',
    '\u{1F516}', '\u{1F419}', '\u{1F4DD}'],
};

/** git status 값 하나로 그리는 항목 */
function statusItem(id, name, icon, color, format, pickValue) {
  return item({
    id, name, icon, color, format, sources: ['git'], gitStatus: true,
    value(ctx, fmt) {
      const st = ctx.git.status;
      return st ? pickValue(st, fmt) : null;
    },
  });
}

const count = (key) => (st, fmt) => countResult(st[key], fmt);

/** 항목 영어 이름(편집 화면 en) — 한국어 이름은 항목 정의의 name */
export const namesEn = {
  'git.branch': 'Branch',
  'git.staged': 'Changed files (staged)',
  'git.unstaged': 'Changed files (unstaged)',
  'git.untracked': 'Changed files (untracked)',
  'git.changed': 'Changed files (all)',
  'git.ahead': 'Ahead (commits to push)',
  'git.behind': 'Behind (commits to pull)',
  'git.commit': 'Last commit hash',
  'git.pr_number': 'PR number',
  'git.pr_state': 'PR state',
  'git.pr_url': 'PR URL',
};

export const items = [
  {
    id: 'git.branch',
    name: '브랜치',
    icon: '\u{1F33F}',
    label: '',
    color: { fg: 150 },
    format: {},
    shows: ['text'],
    sources: ['git'],
    value(ctx) {
      const b = ctx.git.branch;
      return b ? { text: b, parts: { value: b } } : null;
    },
  },
  statusItem('git.staged', '변경 파일 수(staged)', '\u{2705}', { fg: 114 }, { prefix: '+' }, count('staged')),
  statusItem('git.unstaged', '변경 파일 수(unstaged)', '\u{270F}\u{FE0F}', { fg: 215 }, { prefix: '~' }, count('unstaged')),
  statusItem('git.untracked', '변경 파일 수(untracked)', '\u{2753}', { fg: 245 }, { prefix: '?' }, count('untracked')),
  statusItem('git.changed', '변경 파일 수(전체)', '\u{1F4DD}', { fg: 222 }, { suffix: ' files' },
    (st, fmt) => countResult(st.staged + st.unstaged + st.untracked, fmt)),
  statusItem('git.ahead', 'ahead(올릴 커밋)', '\u{2B06}\u{FE0F}', { fg: 117 }, { prefix: '↑' }, count('ahead')),
  statusItem('git.behind', 'behind(받을 커밋)', '\u{2B07}\u{FE0F}', { fg: 210 }, { prefix: '↓' }, count('behind')),
  statusItem('git.commit', '마지막 커밋 해시', '\u{1F516}', { fg: 180 }, { chars: 7 },
    (st, fmt) => textResult(st.oid, fmt)),
  item({
    id: 'git.pr_number',
    name: 'PR 번호',
    icon: '\u{1F419}',
    color: { fg: 141 },
    format: { prefix: '#' },
    sources: ['input'],
    value(ctx, fmt) {
      const n = pickNum(ctx.input, 'pr.number');
      return n === null ? null : { text: decorate(n, fmt), num: n, parts: { value: n } };
    },
  }),
  inputText('git.pr_state', 'PR 상태', '\u{1F500}', { fg: 141 }, 'pr.review_state'),
  inputText('git.pr_url', 'PR 주소', '\u{1F517}', { fg: 111 }, 'pr.url'),
];
