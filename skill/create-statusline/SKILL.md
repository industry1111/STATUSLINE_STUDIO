---
name: create-statusline
description: Opens Statusline Studio, a terminal editor for the Claude Code status line, in a new Windows Terminal tab, installing Node.js or the app first when they are missing. Use it for /create-statusline, or when the user wants to change how the status line looks or what it shows ("edit my status line", "add an item to the status line", "상태줄 바꾸고 싶어", "상태줄에 항목 추가"). `/create-statusline language` opens the language picker; `/create-statusline language en|ko` sets the editor language without opening a tab. Editing happens in the new tab; this skill only checks, installs and opens it
argument-hint: "[language [en|ko]]"
allowed-tools: Bash(bash ~/.claude/skills/create-statusline/check.sh), Bash(bash ~/.claude/skills/create-statusline/check.sh *), Bash(wt.exe -w 0 nt *), Bash(node "*/.claude/statusline-studio/app/src/studio.js" --set-language *)
---

Answer the user in the language they write in. Run each command as one Bash call, exactly as written or printed: do not chain commands, add `cd`, or change paths.

## 1. Check

Run:

```
bash ~/.claude/skills/create-statusline/check.sh $ARGUMENTS
```

It prints `key=value` lines. `next=` says what to do. `run=` lines are commands to run in that order, one Bash call each. A `show=` line is a command for the user to run.

## 2. `next=install-node`: Node.js is missing

Tell the user that Statusline Studio needs Node.js and show the `run=` command (`winget install --id OpenJS.NodeJS.LTS -e`). Then run it. Claude Code asks the user for permission first; if they decline, stop. When it finishes, tell the user to open a new terminal, start a new Claude Code session and run `/create-statusline` again (the current shell does not see the new PATH). Stop.

## 3. `next=install-app`: the app is not installed

Tell the user Statusline Studio will be downloaded from `repo=` and installed (it changes `statusLine` in `~/.claude/settings.json` and backs up the old value). Run the `run=` lines in order: download, install, delete the download. If one fails, show its error and stop. When all three succeed, go back to step 1 once. If the check still says `install-app`, show its output and stop.

## 4. `next=direct`: not inside Windows Terminal

Do not open a tab. Tell the user that a new tab can only be opened inside Windows Terminal (`WT_SESSION` is not set), and show the `show=` command to run in a terminal. Stop.

## 5. `next=tab` or `next=set-language`

Run the `run=` command. If it fails, show the error and the command, and stop. Do not retry or try another way.

## 6. Finish

Reply with one line:

- `tab`: the editor is open in a new tab (with `language`, it starts on the language picker); press s to save, and the status line picks it up on its next refresh.
- `set-language`: the editor language is now en or ko; it applies the next time the editor opens.

To undo the install, the user runs `node "<app_dir>/src/install.js" --restore` (`app_dir=` from the check). Mention it only if they ask.

`next=usage`: show the `usage=` line and stop.
