# Statusline Studio

Claude Code 상태줄을 Windows Terminal 새 탭의 편집 화면에서 고치는 도구입니다.

참고 프로젝트: [ccstatusline](https://github.com/sirmalloc/ccstatusline) (MIT)

## 설치

Node.js가 있으면 (PowerShell·Git Bash 어디서든):

```
npx github:industry1111/STATUSLINE_STUDIO
```

앱과 `/create-statusline` 스킬이 함께 설치됩니다. 그다음 Claude Code에서 `/create-statusline`.

### Node.js가 없으면 — 스킬만 받기

PowerShell에서 한 줄:

```powershell
$R='https://raw.githubusercontent.com/industry1111/STATUSLINE_STUDIO/master/skill/create-statusline'; $D="$HOME\.claude\skills\create-statusline"; New-Item -ItemType Directory -Force $D | Out-Null; 'SKILL.md','check.sh' | % { Invoke-WebRequest "$R/$_" -OutFile "$D\$_" -UseBasicParsing }
```

Git Bash라면:

```bash
R=https://raw.githubusercontent.com/industry1111/STATUSLINE_STUDIO/master/skill/create-statusline; mkdir -p ~/.claude/skills/create-statusline && curl -fsSL $R/SKILL.md -o ~/.claude/skills/create-statusline/SKILL.md && curl -fsSL $R/check.sh -o ~/.claude/skills/create-statusline/check.sh
```

그다음 Claude Code에서 `/create-statusline`을 실행하면 Node.js·앱 설치부터 편집 화면 열기까지 알아서 진행합니다(설치 전에 승인을 묻습니다).

필요한 것: Windows Terminal, Git for Windows. 사용량 항목은 Claude 계정 로그인이 필요합니다.

## 사용

| 키 | 동작 |
|---|---|
| ← → / ↑ ↓ | 항목 / 줄 선택 |
| Enter | 항목 편집, `[+]`에서는 추가 |
| Del | 삭제 |
| Shift+방향키 | 항목 이동 |
| s | 저장 (다음 상태줄 갱신 때 반영) |
| L | 언어 전환 (English ↔ 한국어) |
| q | 종료 |

## 되돌리기

```
node "$HOME/.claude/statusline-studio/app/src/install.js" --restore
```
