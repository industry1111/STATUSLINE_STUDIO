// 첫 설정 = ~/.claude/statusline.sh(2026-11-09)의 5줄 모양. 아이콘·색 번호·라벨까지 그대로.
// 설정이 없거나 깨졌을 때도 이것으로 그린다.

const LIMIT = { fg: 158, thresholds: [[80, 203], [50, 215]], na: 249 };

const DEFAULT = {
  version: 1,
  lines: [
    // ① 폴더·브랜치·모델·effort·모델 버전·CC 버전 (statusline.sh:358-371)
    {
      items: [
        { id: 'folder.current_dir', icon: '\u{1F4C1}', label: '', color: { fg: 117 }, format: { tilde: 'posix' } },
        { id: 'git.branch', icon: '\u{1F33F}', label: '', color: { fg: 150 }, format: {} },
        { id: 'session.model_name', icon: '\u{1F916}', label: '', color: { fg: 147 }, format: {} },
        { id: 'session.effort', icon: '\u{1F3AF}', label: '', color: { fg: 216 }, format: {} },
        { id: 'session.model_version', icon: '\u{1F3F7}\u{FE0F}', label: '', color: { fg: 180 }, format: {} },
        { id: 'session.cc_version', icon: '\u{1F4DF}', label: '', color: { fg: 249 }, format: { prefix: 'v' } },
      ],
    },
    // ② Session 사용률 막대·Context (statusline.sh:374-381)
    {
      items: [
        { id: 'usage.five_hour.percent', icon: '\u{1F4CA}', label: 'Session:', color: LIMIT, format: { show: 'both', width: 10 } },
        {
          id: 'context.used_percent', icon: '\u{1F9E0}', label: '',
          color: { fg: 158, thresholds: [[80, 203], [60, 215]] },
          format: { show: 'both', width: 10, template: '{pct}% Context [{bar}] of {size}' },
        },
      ],
    },
    // ③ 5h 리셋·주간 리셋 (statusline.sh:384-396)
    {
      items: [
        { id: 'usage.five_hour.reset', icon: '\u{231B}', label: '5h 리셋:', color: LIMIT, format: { show: 'both', units: 'hm' } },
        { id: 'usage.weekly_scoped.reset', icon: '\u{1F4C5}', label: '주간 리셋:', color: LIMIT, format: { show: 'both', units: 'dh' } },
      ],
    },
    // ④ 모델별 주간·세션 비용 (statusline.sh:399-430)
    {
      items: [
        { id: 'usage.weekly_scoped.percent', icon: '\u{26A1}', label: '{name}:', color: LIMIT, format: { show: 'both', width: 10 } },
        { id: 'cost.session_usd', icon: '\u{1F4AC}', label: 'Session:', color: { fg: 222 }, format: { decimals: 2 } },
      ],
    },
    // ⑤ Week (statusline.sh:433-437)
    {
      items: [
        { id: 'usage.seven_day.percent', icon: '\u{1F4C6}', label: 'Week:', color: LIMIT, format: { show: 'both', width: 10 } },
      ],
    },
  ],
};

/** 첫 설정의 새 사본(고쳐도 원본은 안 바뀐다). */
export function defaultConfig() {
  return structuredClone(DEFAULT);
}
