#!/usr/bin/env bash
# /create-statusline 확인 — node·앱·Windows Terminal을 보고 다음에 할 일을 key=value 줄로 낸다. SKILL.md가 이 출력대로 한다.
#   bash ~/.claude/skills/create-statusline/check.sh [language [en|ko]]
# node가 없어도 돌아야 하므로 bash만 쓴다. 파일을 쓰지 않는다(읽기만). 홈은 실행 때 $HOME에서 구한다(절대 경로를 박지 않는다).
#
# 출력 키(순서대로):
#   home      홈(Windows 경로·슬래시)          node   버전 또는 none
#   app       yes|no(<홈>/.claude/statusline-studio/app/src/studio.js)
#   app_dir   앱 자리                          wt     yes|no(WT_SESSION)
#   args      받은 인자(소문자)
#   next      install-node | install-app | set-language | tab | direct | usage
#   repo      (install-app) 앱 받는 주소
#   run       차례대로 실행할 명령(install-app은 3줄: 받기 → 설치 → 받은 폴더 지움)
#   show      (direct) 사람이 직접 칠 명령        usage  (usage) 쓰는 법
# 명령의 경로는 Windows 경로·슬래시·따옴표(C:/Users/…) — wt.exe는 셸 없이 프로세스를 띄워 ~·/c/… 를 모른다.
# 탭·직접·언어 명령의 모양은 src/commands.js의 tabCommand·directCommand·setLanguageCommand와 같다.

# 앱 받는 주소(공개 저장소를 만들면 이 한 줄만 바꾼다). 시험은 STATUSLINE_STUDIO_REPO_URL로 로컬 저장소(file://…)를 준다.
REPO_URL='https://github.com/industry1111/STATUSLINE_STUDIO.git'
NODE_INSTALL='winget install --id OpenJS.NodeJS.LTS -e'
TITLE='Statusline Studio'

# $1 → REPLY(Windows 경로·슬래시): /c/x → C:/x, C:\x → C:/x, 그 밖(/tmp·/home 등)은 cygpath -m
winpath() {
  local p=$1 d
  case $p in
    [A-Za-z]:[\\/]*) REPLY=${p//\\//} ;;
    /[A-Za-z]) d=${p:1:1}; REPLY="${d^^}:/" ;;
    /[A-Za-z]/*) d=${p:1:1}; REPLY="${d^^}:${p:2}" ;;
    *) REPLY=$(cygpath -m "$p" 2>/dev/null) || REPLY=$p ;;
  esac
}

# 인자: Claude Code가 $ARGUMENTS를 한 덩어리로 줄 수도 있어 다시 나눈다
set -f
set -- $*
set +f
args="${*,,}"
mode=open
lang=
if [ $# -gt 0 ]; then
  if [ "${1,,}" = language ] && [ $# -eq 1 ]; then
    mode=pick
  elif [ "${1,,}" = language ] && [ $# -eq 2 ] && { [ "${2,,}" = en ] || [ "${2,,}" = ko ]; }; then
    mode=set
    lang=${2,,}
  else
    mode=usage
  fi
fi

winpath "${HOME:-${USERPROFILE:-}}"
home=$REPLY
app_dir="$home/.claude/statusline-studio/app"
studio="$app_dir/src/studio.js"

node_v=none
if command -v node >/dev/null 2>&1; then
  node_v=$(node --version 2>/dev/null) || node_v=none
  [ -n "$node_v" ] || node_v=none
fi
app=no
[ -f "$studio" ] && app=yes
wt=no
[ -n "${WT_SESSION:-}" ] && wt=yes

printf 'home=%s\nnode=%s\napp=%s\napp_dir=%s\nwt=%s\nargs=%s\n' "$home" "$node_v" "$app" "$app_dir" "$wt" "$args"

extra=
[ "$mode" = pick ] && extra=' --language'

if [ "$mode" = usage ]; then
  printf 'next=usage\nusage=/create-statusline [language [en|ko]]\n'
elif [ "$node_v" = none ]; then
  printf 'next=install-node\nrun=%s\n' "$NODE_INSTALL"
elif [ "$app" = no ]; then
  repo=${STATUSLINE_STUDIO_REPO_URL:-$REPO_URL}
  winpath "${TEMP:-${TMP:-/tmp}}"
  get="$REPLY/statusline-studio-get-$$-$RANDOM"
  printf 'next=install-app\nrepo=%s\n' "$repo"
  printf 'run=git clone --depth 1 "%s" "%s"\n' "$repo" "$get"
  printf 'run=node "%s/src/install.js" --home "%s"\n' "$get" "$home"
  printf 'run=rm -rf "%s"\n' "$get"
elif [ "$mode" = set ]; then
  printf 'next=set-language\nrun=node "%s" --set-language %s\n' "$studio" "$lang"
elif [ "$wt" = no ]; then
  printf 'next=direct\nshow=node "%s"%s\n' "$studio" "$extra"
else
  printf 'next=tab\nrun=wt.exe -w 0 nt --title "%s" node "%s"%s\n' "$TITLE" "$studio" "$extra"
fi
