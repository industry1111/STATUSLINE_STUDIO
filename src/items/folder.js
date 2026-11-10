// 카테고리 folder — 입력 JSON의 폴더(statusline.sh:90, 358), 프로젝트 폴더·추가 폴더 수·worktree·저장소
// (code.claude.com/docs/en/statusline).
import { jqAlt, jqGet, jqRaw } from '../sources/input.js';
import { pathText } from './formats.js';
import { countResult, inputText, item, pick, pickText, textResult } from './common.js';

export const category = {
  id: 'folder',
  name: '폴더',
  nameEn: 'Folder',
  icons: ['\u{1F4C1}', '\u{1F4C2}', '\u{1F5C2}\u{FE0F}', '\u{1F3E0}', '\u{1F333}', '\u{1F4E6}', '\u{1F517}', '\u{2795}'],
};

/** `.workspace.current_dir // .cwd // "unknown"` (statusline.sh:90) */
function currentDir(input) {
  let v = jqAlt(jqGet(input, ['workspace', 'current_dir']), undefined);
  if (v === undefined) v = jqAlt(jqGet(input, ['cwd']), 'unknown');
  return jqRaw(v);
}

const REPO_SHOWS = ['owner/name', 'name', 'host/owner/name'];

/** 항목 영어 이름(편집 화면 en) — 한국어 이름은 항목 정의의 name */
export const namesEn = {
  'folder.current_dir': 'Current folder',
  'folder.current_name': 'Current folder name',
  'folder.project_dir': 'Project folder',
  'folder.added_dirs': 'Added folders count',
  'folder.worktree_name': 'Worktree name',
  'folder.worktree_branch': 'Worktree branch',
  'folder.worktree_original_branch': 'Branch before the worktree',
  'folder.git_worktree': 'Git worktree name',
  'folder.repo': 'Repository owner/name',
};

export const items = [
  {
    id: 'folder.current_dir',
    name: '현재 폴더',
    icon: '\u{1F4C1}',
    label: '',
    color: { fg: 117 },
    format: { tilde: 'posix' },
    shows: ['path'],
    formatOptions: { tilde: ['posix', 'none'] },
    sources: ['input'],
    value(ctx, fmt) {
      const dir = pathText(currentDir(ctx.input), fmt, ctx.home);
      return { text: dir, parts: { value: dir } };
    },
  },
  item({
    id: 'folder.current_name',
    name: '현재 폴더 이름',
    icon: '\u{1F4C2}',
    color: { fg: 117 },
    sources: ['input'],
    value(ctx, fmt) {
      const name = currentDir(ctx.input).split(/[\\/]+/).filter(Boolean).pop() ?? '';
      return textResult(name, fmt);
    },
  }),
  item({
    id: 'folder.project_dir',
    name: '프로젝트 폴더',
    icon: '\u{1F3E0}',
    color: { fg: 110 },
    format: { tilde: 'posix' },
    shows: ['path'],
    formatOptions: { tilde: ['posix', 'none'] },
    sources: ['input'],
    value(ctx, fmt) {
      const d = pickText(ctx.input, 'workspace.project_dir');
      return d === null ? null : textResult(pathText(d, fmt, ctx.home), fmt);
    },
  }),
  item({
    id: 'folder.added_dirs',
    name: '추가 폴더 수',
    icon: '\u{2795}',
    color: { fg: 110 },
    format: { prefix: '+', suffix: ' dirs' },
    sources: ['input'],
    value(ctx, fmt) {
      const v = pick(ctx.input, 'workspace.added_dirs');
      return Array.isArray(v) ? countResult(v.length, fmt) : null;
    },
  }),
  inputText('folder.worktree_name', 'worktree 이름', '\u{1F333}', { fg: 151 }, 'worktree.name'),
  inputText('folder.worktree_branch', 'worktree 브랜치', '\u{1F333}', { fg: 150 }, 'worktree.branch'),
  inputText('folder.worktree_original_branch', 'worktree 들어오기 전 브랜치', '\u{1F333}', { fg: 108 }, 'worktree.original_branch'),
  inputText('folder.git_worktree', 'git worktree 이름', '\u{1F333}', { fg: 151 }, 'workspace.git_worktree'),
  item({
    id: 'folder.repo',
    name: '저장소 owner/name',
    icon: '\u{1F4E6}',
    color: { fg: 153 },
    format: { show: 'owner/name' },
    shows: REPO_SHOWS,
    sources: ['input'],
    value(ctx, fmt) {
      const host = pickText(ctx.input, 'workspace.repo.host');
      const owner = pickText(ctx.input, 'workspace.repo.owner');
      const name = pickText(ctx.input, 'workspace.repo.name');
      if (name === null) return null;
      let s;
      if (fmt.show === 'name') s = name;
      else if (fmt.show === 'host/owner/name') s = [host, owner, name].filter(Boolean).join('/');
      else s = [owner, name].filter(Boolean).join('/');
      return { text: s, parts: { value: s, host: host ?? '', owner: owner ?? '', name } };
    },
  }),
];
