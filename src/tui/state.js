// 편집 화면 상태 — 순수 함수: update(상태, 키) → 새 상태. 파일·터미널은 만지지 않는다.
// 저장은 상태에 effect: 'save'를 남기고, 실행기(app.js)가 쓰고 나서 saveDone()으로 결과를 돌려준다.
// 언어도 같다: 고르면(선택 화면 Enter · 편집 화면 L) effect: 'language' → 실행기가 language만 쓰고 languageDone().
//
// 고르기 모델: 화면의 고를 자리를 행(row) × 칸(col)으로 본다. 행 = 설정의 줄(칸 = 항목들 + 줄 끝 [+] 'add'),
// 그리고 맨 아래 행 하나 = 새 줄 [+] 'newline'. [+]에서 Enter → 카테고리 → 하위 항목 → 아이콘 → 그 줄 끝에 더한다.
// 새 줄은 항목을 고른 순간에 항목과 함께 생긴다 — 도중에 Esc로 나오면 줄이 생기지 않아 빈 줄이 남지 않는다.
//
// 언어: s.lang(en|ko)이 화면 문구(src/i18n)를 고른다. s.langPick이 있으면 언어 선택 화면(첫 실행 = first).
// 설정의 language는 s.config.language에 같이 두어 s 저장이 지우지 않게 한다. 저장 안 한 변경(isDirty)은 language를 빼고 본다.
import { categories, getCategory, getItem } from '../items/index.js';
import { categoryName, itemName, LANGUAGES, localized, messages } from '../i18n/index.js';
import { actionOf } from './keys.js';

/** 임계값 단을 새로 만들 때 색(지금 첫 설정과 같게: 1단 빨강, 2단 주황) */
const TIER_COLORS = [203, 215];
const TIER_COUNT = 2; // 기본 색 + 2단 = 3단

/** 지금 언어의 문구 표 */
const M = (s) => messages(s.lang);

// ── 만들기·조회 ──

function startMessage(lang, source, reason) {
  const m = messages(lang);
  if (source === 'file') return m.loaded;
  if (reason === 'missing') return m.startMissing;
  return m.startBroken(String(reason ?? '').slice(0, 80));
}

/** 저장 안 한 변경 비교용 글자(language 빼고) */
const linesJson = (cfg) => JSON.stringify({ ...cfg, language: undefined });

/**
 * @param {object} o
 * @param {object} o.config 그릴 수 있는 설정(loadConfig 결과)
 * @param {string} o.configPath 저장할 자리(화면 표시용)
 * @param {'file'|'default'} [o.configSource]
 * @param {string|{en: string, ko: string}|null} [o.configReason] 언어별 글자도 된다
 * @param {string|{en: string, ko: string}} [o.inputSource] 미리보기 입력 출처(화면 표시용, 언어별 글자도 된다)
 * @param {'en'|'ko'} [o.language] 화면 언어(선택 화면이면 커서가 처음 서는 언어)
 * @param {boolean} [o.pickLanguage] 언어 선택 화면으로 시작
 * @param {boolean} [o.firstRun] 설정에 언어가 없어 고르는 첫 실행(Esc로 건너뛸 수 없다)
 */
export function createState({
  config, configPath = '', configSource = 'file', configReason = null, inputSource = '',
  language = 'ko', pickLanguage = false, firstRun = false,
}) {
  const cfg = structuredClone(config);
  const lang = LANGUAGES.includes(language) ? language : 'ko';
  return {
    config: cfg,
    savedJson: configSource === 'file' ? linesJson(cfg) : null,
    initialJson: linesJson(cfg),
    configPath,
    configSource,
    configReason,
    inputSource,
    lang,
    langPick: pickLanguage ? { cursor: LANGUAGES.indexOf(lang), first: Boolean(firstRun) } : null,
    cursor: { row: 0, col: 0 },
    stack: [], // 편집 메뉴 틀 — 맨 뒤가 지금 보이는 것
    message: startMessage(lang, configSource, localized(configReason, lang)),
    quitArmed: false,
    effect: null,
    quit: false,
    saves: 0,
  };
}

/** 고를 자리: 행마다 칸 목록 — 줄마다 항목들 + 줄 끝 [+], 맨 아래에 새 줄 [+] 행 */
export function rowsOf(config) {
  const rows = config.lines.map((line, li) => [
    ...line.items.map((_, ii) => ({ kind: 'item', line: li, index: ii })),
    { kind: 'add', line: li },
  ]);
  rows.push([{ kind: 'newline', line: config.lines.length }]);
  return rows;
}

/** 같은 칸인가 */
export const sameSlot = (a, b) => Boolean(a && b && a.kind === b.kind && a.line === b.line && a.index === b.index);

/** [+] 칸인가(줄 끝 또는 새 줄) */
export const isAddSlot = (slot) => slot?.kind === 'add' || slot?.kind === 'newline';

/** 지금 고른 칸(없으면 null) */
export function selectedSlot(s) {
  return rowsOf(s.config)[s.cursor.row]?.[s.cursor.col] ?? null;
}

/** 지금 고른 항목 {line, index, conf, def} (항목 칸이 아니면 null) */
export function selectedItem(s) {
  const slot = selectedSlot(s);
  if (!slot || slot.kind !== 'item') return null;
  const conf = s.config.lines[slot.line].items[slot.index];
  return { line: slot.line, index: slot.index, conf, def: getItem(conf.id) };
}

/** 저장 안 한 변경이 있나(설정 파일이 없던 경우: 첫 설정에서 바뀌었나). language는 따로 바로 저장하므로 보지 않는다. */
export function isDirty(s) {
  return linesJson(s.config) !== (s.savedJson ?? s.initialJson);
}

export function modeOf(s) {
  if (s.langPick) return 'language';
  if (!s.stack.length) return 'browse';
  return s.stack[s.stack.length - 1].type === 'input' ? 'input' : 'menu';
}

/** 항목의 지금 값(설정 + 항목 기본값) */
export function effectiveIcon(conf, def) { return conf.icon ?? def?.icon ?? ''; }
export function effectiveLabel(conf, def) { return conf.label ?? def?.label ?? ''; }
export function effectiveColor(conf, def) {
  if (conf.color === null) return {};
  return structuredClone({ ...(def?.color ?? {}), ...(conf.color ?? {}) });
}
export function effectiveFormat(conf, def) { return { ...(def?.format ?? {}), ...(conf.format ?? {}) }; }

const sortTiers = (t) => t.map((x) => [...x]).sort((a, b) => b[0] - a[0]);
export const tiersOf = (color) => sortTiers(Array.isArray(color.thresholds) ? color.thresholds : []);

// ── 상태 고치기 도구 ──

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function clampCursor(s) {
  const rows = rowsOf(s.config);
  const row = clamp(s.cursor.row, 0, Math.max(0, rows.length - 1));
  const col = clamp(s.cursor.col, 0, Math.max(0, (rows[row]?.length ?? 0) - 1));
  return { ...s, cursor: { row, col } };
}

/** 설정 사본을 고친다 */
function withConfig(s, fn) {
  const config = structuredClone(s.config);
  const r = fn(config);
  return { ...s, config, ...(r ?? {}) };
}

/** 고른 항목 사본을 고친다 — fn(conf, def)이 글자를 돌려주면 메시지 */
function withItem(s, fn) {
  const sel = selectedItem(s);
  if (!sel) return { ...s, message: M(s).noItem };
  let msg;
  const next = withConfig(s, (config) => {
    msg = fn(config.lines[sel.line].items[sel.index], sel.def);
  });
  return { ...next, message: msg ?? next.message };
}

const top = (s) => s.stack[s.stack.length - 1];
const push = (s, frame) => ({ ...s, stack: [...s.stack, { cursor: 0, ...frame }] });
const pop = (s, n = 1) => ({ ...s, stack: s.stack.slice(0, Math.max(0, s.stack.length - n)) });
const setTop = (s, patch) => ({ ...s, stack: [...s.stack.slice(0, -1), { ...top(s), ...patch }] });

const nameOf = (s, conf, def) => itemName(def, s.lang) ?? conf.id;
const show = (s, v) => (v === '' ? M(s).none : v);

// ── 편집 메뉴 틀 ──
// frameView(상태, 틀) → { title, help, rows: [{ label, value, ok?(s), step?(s, ±1) }] }

function editFrame(s) {
  const m = M(s);
  const { conf, def } = selectedItem(s);
  const c = effectiveColor(conf, def);
  return {
    title: m.editTitle(effectiveIcon(conf, def), nameOf(s, conf, def)),
    help: 'menu',
    rows: [
      { label: m.editIcon, value: show(s, effectiveIcon(conf, def)), ok: (x) => openIcon(x) },
      { label: m.editLabel, value: show(s, effectiveLabel(conf, def)), ok: (x) => openInput(x, 'label', m.labelInput, effectiveLabel(conf, def)) },
      { label: m.editColor, value: colorSummary(c, s.lang), ok: (x) => push(x, { type: 'color' }) },
      { label: m.editFormat, value: formatSummary(s, conf, def), ok: (x) => push(x, { type: 'format' }) },
    ],
  };
}

export function colorSummary(c, lang = 'ko') {
  const m = messages(lang);
  if (c.fg === undefined && !c.thresholds?.length && !c.bold) return m.colorNone;
  const parts = [`${c.fg ?? '-'}`];
  for (const [v, col] of tiersOf(c)) parts.push(`≥${v}→${col}`);
  if (c.bold) parts.push(m.boldWord);
  return parts.join(' ');
}

function formatChoices(def) {
  const out = [];
  if ((def?.shows?.length ?? 0) > 1) out.push({ key: 'show', options: def.shows });
  for (const [key, options] of Object.entries(def?.formatOptions ?? {})) out.push({ key, options });
  return out;
}

function formatSummary(s, conf, def) {
  const fmt = effectiveFormat(conf, def);
  const ch = formatChoices(def);
  if (!ch.length && !fmt.template) return M(s).formatNone;
  const parts = ch.map(({ key, options }) => `${key}=${fmt[key] ?? options[0]}`);
  if (fmt.template) parts.push(`template="${fmt.template}"`);
  return parts.join(' ');
}

function openIcon(s) {
  const { conf, def } = selectedItem(s);
  const icons = getCategory(def?.category)?.icons ?? [];
  const cur = effectiveIcon(conf, def);
  const at = icons.indexOf(cur);
  return push(s, { type: 'icon', cursor: at >= 0 ? at : cur === '' ? icons.length + 1 : 0 });
}

function iconFrame(s) {
  const m = M(s);
  const { conf, def } = selectedItem(s);
  const cat = getCategory(def?.category);
  const cur = effectiveIcon(conf, def);
  const pick = (icon) => (x) => pop(withItem(x, (it) => { it.icon = icon; return M(x).iconSet(show(x, icon)); }));
  return {
    title: m.iconTitle(categoryName(cat, s.lang) ?? m.noCategory),
    help: 'menu',
    rows: [
      ...(cat?.icons ?? []).map((icon) => ({ label: icon, value: icon === cur ? m.current : '', ok: pick(icon) })),
      { label: m.customIcon, value: '', ok: (x) => openInput(x, 'icon', m.customIconInput, cur) },
      { label: m.iconNone, value: cur === '' ? m.current : '', ok: pick('') },
    ],
  };
}

function colorFrame(s) {
  const m = M(s);
  const { conf, def } = selectedItem(s);
  const c = effectiveColor(conf, def);
  const t = tiersOf(c);
  const rows = [
    {
      label: m.fgLabel, value: c.fg ?? m.none, swatch: c.fg,
      ok: (x) => openInput(x, 'fg', m.fgInput, c.fg ?? ''),
      step: (x, d) => setColor(x, (cc) => { cc.fg = wrap255((cc.fg ?? 15) + d); return m.fgSet(cc.fg); }),
    },
  ];
  for (let k = 0; k < TIER_COUNT; k++) {
    const tier = t[k];
    rows.push({
      label: m.tierValue(k + 1), value: tier ? tier[0] : m.none,
      ok: (x) => openInput(x, `t${k}v`, m.tierValueInput(k + 1), tier ? tier[0] : ''),
      step: (x, d) => setTier(x, k, 'v', Math.max(0, (tier ? tier[0] : 0) + d)),
    });
    rows.push({
      label: m.tierColor(k + 1), value: tier ? tier[1] : m.none, swatch: tier?.[1],
      ok: (x) => (tier ? openInput(x, `t${k}c`, m.tierColorInput(k + 1), tier[1]) : { ...x, message: m.tierNeedValue(k + 1) }),
      step: (x, d) => (tier ? setTier(x, k, 'c', wrap255(tier[1] + d)) : { ...x, message: m.tierNeedValue(k + 1) }),
    });
  }
  const toggleBold = (x) => setColor(x, (cc) => { cc.bold = !cc.bold; return m.boldSet(cc.bold ? m.on : m.off); });
  rows.push({ label: m.boldLabel, value: c.bold ? m.on : m.off, ok: toggleBold, step: toggleBold });
  rows.push({
    label: m.colorDefault, value: colorSummary(effectiveColor({}, def), s.lang),
    ok: (x) => withItem(x, (it) => { delete it.color; return m.colorDefaultSet; }),
  });
  return { title: m.colorTitle(nameOf(s, conf, def)), help: 'menuNumber', rows };
}

const wrap255 = (n) => ((Math.round(n) % 256) + 256) % 256;

function setColor(s, fn) {
  return withItem(s, (it, def) => {
    const c = effectiveColor(it, def);
    const msg = fn(c);
    if (Array.isArray(c.thresholds)) c.thresholds = sortTiers(c.thresholds);
    it.color = c;
    return msg;
  });
}

/** k단(0부터, 큰 기준부터 센다)의 기준 값(v)·색(c). v가 null이면 그 단을 없앤다. */
function setTier(s, k, field, val) {
  const m = M(s);
  return setColor(s, (c) => {
    const t = tiersOf(c);
    if (field === 'v') {
      if (val === null) {
        if (t[k]) t.splice(k, 1);
        c.thresholds = t;
        return m.tierRemoved(k + 1);
      }
      if (t[k]) t[k][0] = val;
      else t.push([val, TIER_COLORS[Math.min(k, TIER_COLORS.length - 1)]]);
      c.thresholds = t;
      return m.tierValueSet(k + 1, val);
    }
    if (!t[k]) return m.tierNeedValue(k + 1);
    t[k][1] = val;
    c.thresholds = t;
    return m.tierColorSet(k + 1, val);
  });
}

function formatFrame(s) {
  const m = M(s);
  const { conf, def } = selectedItem(s);
  const fmt = effectiveFormat(conf, def);
  const set = (key, value) => (x) => withItem(x, (it) => { it.format = { ...(it.format ?? {}), [key]: value }; return `${key} → ${value}`; });
  const rows = formatChoices(def).map(({ key, options }) => {
    const cur = fmt[key] ?? options[0];
    return {
      label: m.formatKeys[key] ?? key,
      value: `${cur}${m.formatValues[cur] ? ` (${m.formatValues[cur]})` : ''}`,
      ok: (x) => push(x, { type: 'choice', key, cursor: Math.max(0, options.indexOf(cur)) }),
      step: (x, d) => set(key, options[(options.indexOf(cur) + d + options.length) % options.length])(x),
    };
  });
  if (fmt.template !== undefined && fmt.template !== '') {
    rows.push({
      label: m.formatKeys.template, value: m.templateValue(fmt.template),
      ok: (x) => openInput(x, 'template', m.templateInput, fmt.template),
    });
  }
  if (!rows.length) rows.push({ label: m.formatEmpty, value: '' });
  return { title: m.formatTitle(nameOf(s, conf, def)), help: 'menuCycle', rows };
}

function choiceFrame(s, frame) {
  const m = M(s);
  const { conf, def } = selectedItem(s);
  const options = formatChoices(def).find((c) => c.key === frame.key)?.options ?? [];
  const cur = effectiveFormat(conf, def)[frame.key] ?? options[0];
  return {
    title: m.choiceTitle(m.formatKeys[frame.key] ?? frame.key),
    help: 'menu',
    rows: options.map((v) => ({
      label: v,
      value: `${m.formatValues[v] ?? ''}${v === cur ? m.nowMark : ''}`,
      ok: (x) => pop(withItem(x, (it) => { it.format = { ...(it.format ?? {}), [frame.key]: v }; return `${frame.key} → ${v}`; })),
    })),
  };
}

// ── [+] 추가: 카테고리 → 하위 항목 → 아이콘 ──
// 더할 자리는 커서 칸(메뉴가 열린 동안 커서는 안 움직인다). 라벨·색·표시 형식은 항목 기본값(설정에 안 적는다).

function addWhere(s) {
  const slot = selectedSlot(s);
  return slot?.kind === 'newline' ? M(s).addWhereNew : M(s).addWhereLine((slot?.line ?? 0) + 1);
}

function openAdd(s) {
  return { ...push(s, { type: 'addCategory' }), message: M(s).addStart(addWhere(s)) };
}

function addCategoryFrame(s) {
  const m = M(s);
  return {
    title: m.addCategoryTitle(addWhere(s)),
    help: 'menuAdd',
    rows: categories.map((c) => ({
      label: categoryName(c, s.lang),
      value: m.itemCount(c.items.length),
      ok: (x) => push(x, { type: 'addItem', category: c.id }),
    })),
  };
}

function addItemFrame(s, frame) {
  const cat = getCategory(frame.category);
  return {
    title: M(s).addItemTitle(categoryName(cat, s.lang) ?? frame.category),
    help: 'menuAdd',
    rows: (cat?.items ?? []).map((it) => ({ label: itemName(it, s.lang), value: it.id, ok: (x) => openAddIcon(x, cat, it) })),
  };
}

/** 아이콘 목록 — 커서는 항목 기본 아이콘(목록에 없으면 첫 후보, 기본이 없으면 '없음') */
function openAddIcon(s, cat, def) {
  const icons = cat?.icons ?? [];
  const at = icons.indexOf(def.icon ?? '');
  return push(s, { type: 'addIcon', category: cat?.id, item: def.id, cursor: at >= 0 ? at : def.icon ? 0 : icons.length + 1 });
}

function addIconFrame(s, frame) {
  const m = M(s);
  const def = getItem(frame.item);
  const cat = getCategory(frame.category);
  const base = def?.icon ?? '';
  return {
    title: m.addIconTitle(itemName(def, s.lang) ?? frame.item, categoryName(cat, s.lang) ?? ''),
    help: 'menuAdd',
    rows: [
      ...(cat?.icons ?? []).map((icon) => ({ label: icon, value: icon === base ? m.itemDefault : '', ok: (x) => addItem(x, frame.item, icon) })),
      { label: m.customIcon, value: '', ok: (x) => openInput(x, 'addIcon', m.customIconInput, '') },
      { label: m.iconNone, value: base === '' ? m.itemDefault : '', ok: (x) => addItem(x, frame.item, '') },
    ],
  };
}

/** 커서의 [+] 자리에 항목을 더하고 메뉴를 닫는다. 새 줄 [+]면 이 항목과 함께 줄을 만든다. */
function addItem(s, id, icon) {
  const slot = selectedSlot(s);
  const closed = { ...s, stack: [] };
  if (!isAddSlot(slot) || !getItem(id)) return { ...closed, message: M(s).addNothing };
  const def = getItem(id);
  return withConfig(closed, (config) => {
    if (slot.kind === 'newline') config.lines.push({ items: [] });
    const line = slot.kind === 'newline' ? config.lines.length - 1 : slot.line;
    const items = config.lines[line].items;
    items.push({ id, icon });
    return {
      cursor: { row: line, col: items.length - 1 },
      message: M(s).added(icon, itemName(def, s.lang), line + 1, items.length, slot.kind === 'newline'),
    };
  });
}

/** 지금 틀의 화면 모양(그리기·키 처리가 같이 쓴다) */
export function frameView(s, frame = top(s)) {
  if (!frame) return null;
  if (frame.type === 'input') return { title: frame.title, help: 'input', rows: [] };
  if (frame.type === 'addCategory') return addCategoryFrame(s);
  if (frame.type === 'addItem') return addItemFrame(s, frame);
  if (frame.type === 'addIcon') return addIconFrame(s, frame);
  if (!selectedItem(s)) return null;
  switch (frame.type) {
    case 'edit': return editFrame(s);
    case 'icon': return iconFrame(s);
    case 'color': return colorFrame(s);
    case 'format': return formatFrame(s);
    case 'choice': return choiceFrame(s, frame);
    default: return null;
  }
}

// ── 글자 입력 칸 ──

const NUMERIC = new Set(['fg', 't0v', 't0c', 't1v', 't1c']);

function openInput(s, field, title, value) {
  return push(s, { type: 'input', field, title, value: String(value ?? ''), numeric: NUMERIC.has(field) });
}

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const dropLast = (v) => {
  const g = Array.from(segmenter.segment(v), (x) => x.segment);
  return g.slice(0, -1).join('');
};

/** 입력 칸 값 확정 — 성공하면 입력 칸(아이콘 직접 입력이면 아이콘 목록까지) 닫힘 */
function commitInput(s, frame) {
  const m = M(s);
  const v = frame.value;
  const num = (lo, hi) => {
    if (!/^\d+$/.test(v)) return null;
    const n = Number(v);
    return n >= lo && n <= hi ? n : null;
  };
  switch (frame.field) {
    case 'addIcon':
      return addItem(s, s.stack[s.stack.length - 2]?.item, v);
    case 'icon':
      return pop(withItem(s, (it) => { it.icon = v; return m.iconSet(show(s, v)); }), 2);
    case 'label':
      return pop(withItem(s, (it) => { it.label = v; return m.labelSet(show(s, v)); }));
    case 'template':
      return pop(withItem(s, (it, def) => {
        const f = { ...(it.format ?? {}) };
        if (v === '') {
          if (def?.format?.template) f.template = '';
          else delete f.template;
        } else f.template = v;
        it.format = f;
        return m.templateSet(show(s, v));
      }));
    case 'fg': {
      const n = num(0, 255);
      if (n === null) return { ...s, message: m.fgNumber };
      return pop(setColor(s, (c) => { c.fg = n; return m.fgSet(n); }));
    }
    default: {
      const mt = /^t(\d)([vc])$/.exec(frame.field);
      if (!mt) return pop(s);
      const k = Number(mt[1]);
      if (mt[2] === 'v') {
        if (v === '') return pop(setTier(s, k, 'v', null));
        const n = num(0, 1e9);
        if (n === null) return { ...s, message: m.tierValueNumber };
        return pop(setTier(s, k, 'v', n));
      }
      const n = num(0, 255);
      if (n === null) return { ...s, message: m.colorNumber };
      return pop(setTier(s, k, 'c', n));
    }
  }
}

function inputKey(s, key) {
  const frame = top(s);
  const act = actionOf('input', key);
  switch (act) {
    case 'ok': return commitInput(s, frame);
    case 'cancel': return { ...pop(s), message: M(s).inputCancel };
    case 'erase': return setTop(s, { value: dropLast(frame.value) });
    case 'clear': return setTop(s, { value: '' });
    default:
      if (!key.ch) return s;
      if (frame.numeric && !/^[0-9]$/.test(key.ch)) return { ...s, message: M(s).digitsOnly };
      return setTop(s, { value: frame.value + key.ch });
  }
}

// ── 메뉴 키 ──

function menuKey(s, act) {
  const frame = top(s);
  const view = frameView(s, frame);
  if (!view) return { ...s, stack: [] };
  const row = view.rows[frame.cursor];
  switch (act) {
    case 'up': return setTop(s, { cursor: clamp(frame.cursor - 1, 0, Math.max(0, view.rows.length - 1)) });
    case 'down': return setTop(s, { cursor: clamp(frame.cursor + 1, 0, Math.max(0, view.rows.length - 1)) });
    case 'back': return frame.type === 'addCategory' ? { ...pop(s), message: M(s).addCancel } : pop(s);
    case 'ok': return row?.ok ? row.ok(s) : s;
    case 'inc': return row?.step ? row.step(s, 1) : s;
    case 'dec': return row?.step ? row.step(s, -1) : s;
    default: return s;
  }
}

// ── 언어 ──

/**
 * 언어를 정한다: 화면 언어·설정의 language를 바꾸고 선택 화면을 닫는다. 파일 쓰기는 실행기가(effect 'language').
 * lines는 건드리지 않는다.
 */
function chooseLanguage(s, lang) {
  const config = { ...s.config, language: lang };
  return { ...s, config, lang, langPick: null, effect: 'language' };
}

function languageKey(s, act) {
  const p = s.langPick;
  switch (act) {
    case 'up': return { ...s, langPick: { ...p, cursor: clamp(p.cursor - 1, 0, LANGUAGES.length - 1) } };
    case 'down': return { ...s, langPick: { ...p, cursor: clamp(p.cursor + 1, 0, LANGUAGES.length - 1) } };
    case 'ok': return chooseLanguage(s, LANGUAGES[p.cursor]);
    case 'back': return p.first ? s : { ...s, langPick: null }; // 첫 실행은 골라야 넘어간다
    case 'quit': return { ...s, quit: true, message: M(s).quitDone };
    default: return s;
  }
}

/** 실행기가 언어를 쓴 뒤 결과를 넣는다 */
export function languageDone(s, { ok, path, error }) {
  const m = M(s);
  return { ...s, effect: null, message: ok ? m.languageSaved(path) : m.languageNotSaved(error) };
}

// ── 고르기·옮기기·지우기 ──

function browseKey(s, act, armed) {
  const m = M(s);
  const { row, col } = s.cursor;
  const rows = rowsOf(s.config);
  switch (act) {
    case 'prev': return clampCursor({ ...s, cursor: { row, col: col - 1 } });
    case 'next': return clampCursor({ ...s, cursor: { row, col: col + 1 } });
    case 'lineUp': return clampCursor({ ...s, cursor: { row: row - 1, col } });
    case 'lineDown': return clampCursor({ ...s, cursor: { row: row + 1, col } });
    case 'edit': {
      if (isAddSlot(selectedSlot(s))) return openAdd(s);
      const sel = selectedItem(s);
      if (!sel) return { ...s, message: m.noItem };
      if (!sel.def) return { ...s, message: m.unknownId(sel.conf.id) };
      return push(s, { type: 'edit' });
    }
    case 'remove': {
      const sel = selectedItem(s);
      if (sel) {
        return withConfig(s, (config) => {
          const items = config.lines[sel.line].items;
          items.splice(sel.index, 1);
          // 줄 끝 항목을 지웠으면 새 끝 항목으로(줄이 비면 그 줄의 [+])
          return { cursor: { row, col: Math.max(0, Math.min(sel.index, items.length - 1)) }, message: m.removed(nameOf(s, sel.conf, sel.def), sel.line + 1) };
        });
      }
      // 빈 줄은 그 줄의 [+]에서 Del로 지운다(줄이 하나뿐이면 남긴다)
      const slot = rows[row]?.[col];
      if (slot?.kind === 'add' && s.config.lines[slot.line].items.length === 0 && s.config.lines.length > 1) {
        return withConfig(s, (config) => {
          config.lines.splice(slot.line, 1);
          return { cursor: { row: Math.min(slot.line, config.lines.length - 1), col: 0 }, message: m.emptyLineRemoved(slot.line + 1) };
        });
      }
      if (isAddSlot(slot)) return { ...s, message: m.addNotDeletable };
      return s;
    }
    case 'moveLeft':
    case 'moveRight': {
      const sel = selectedItem(s);
      if (!sel) return s;
      const to = sel.index + (act === 'moveLeft' ? -1 : 1);
      if (to < 0 || to >= s.config.lines[sel.line].items.length) return { ...s, message: m.noMoreRoom };
      return withConfig(s, (config) => {
        const items = config.lines[sel.line].items;
        [items[sel.index], items[to]] = [items[to], items[sel.index]];
        return { cursor: { row, col: to }, message: m.moved(nameOf(s, sel.conf, sel.def), sel.line + 1, to + 1) };
      });
    }
    case 'moveUp':
    case 'moveDown': {
      const sel = selectedItem(s);
      if (!sel) return s;
      const toLine = sel.line + (act === 'moveUp' ? -1 : 1);
      if (toLine < 0 || toLine >= s.config.lines.length) return { ...s, message: m.noLineThere };
      return withConfig(s, (config) => {
        const [it] = config.lines[sel.line].items.splice(sel.index, 1);
        const dest = config.lines[toLine].items;
        const at = Math.min(sel.index, dest.length);
        dest.splice(at, 0, it);
        return { cursor: { row: toLine, col: at }, message: m.moved(nameOf(s, sel.conf, sel.def), toLine + 1, at + 1) };
      });
    }
    case 'save': return { ...s, effect: 'save' };
    case 'language': return chooseLanguage(s, s.lang === 'en' ? 'ko' : 'en');
    case 'quit':
      if (!isDirty(s) || armed) return { ...s, quit: true, message: m.quitDone };
      return { ...s, quitArmed: true, message: m.quitWarn };
    default: return s;
  }
}

/** 상태 + 키 → 새 상태 */
export function update(prev, key) {
  const s = { ...prev, effect: null };
  if (s.quit) return s;
  const mode = modeOf(s);
  const act = actionOf(mode, key);
  if (act === 'abort') return { ...s, quit: true, message: M(s).abort };
  const armed = s.quitArmed;
  const next = { ...s, quitArmed: false };
  if (mode === 'language') return languageKey(next, act);
  if (mode === 'browse') return browseKey(next, act, armed);
  if (mode === 'menu') return menuKey(next, act);
  return inputKey(next, key);
}

/** 실행기가 저장을 마친 뒤 결과를 넣는다 */
export function saveDone(s, { ok, path, error, at }) {
  if (!ok) return { ...s, effect: null, message: M(s).saveFailed(error) };
  return { ...s, effect: null, savedJson: linesJson(s.config), saves: s.saves + 1, message: M(s).saved(at, path) };
}
