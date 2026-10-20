import { decryptJSON } from './crypto.js';
import { store, fetchEnvelope, PW_KEY, makeDemo } from './shared.js';
import { summarize, ddayLabel, dateLabel, level, kstToday, kstDay, kstTime, longDate, shortDate } from './logic.js';

const REFRESH_MS = 3 * 60 * 1000;   // 데이터 다시 받기
const PAGE_MS = 10 * 1000;          // 기한 목록 페이지 넘김
const STALE_MIN = 40;               // 이 시간 넘게 동기화가 없으면 경고

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isDemo = params.has('demo');

const state = { tasks: [], generatedAt: null, password: null, page: 0, pageTimer: null, lastJson: '' };

/* ---------- DOM 도우미 ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/* ---------- 데이터 받기 ---------- */
async function loadWith(password) {
  const env = await fetchEnvelope();
  const data = await decryptJSON(env, password);
  apply(data);
}

function apply(data) {
  const json = JSON.stringify(data);
  const changed = json !== state.lastJson;
  state.lastJson = json;
  state.tasks = data.tasks || [];
  state.generatedAt = data.generatedAt || null;
  render(changed);
}

/* ---------- 잠금 화면 ---------- */
function showLock(msg = '') {
  $('board').hidden = true;
  $('lock').hidden = false;
  $('lockMsg').textContent = msg;
  $('pw').value = '';
  $('pw').focus();
}

function showBoard() {
  $('lock').hidden = true;
  $('board').hidden = false;
}

$('lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('pw').value;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  $('lockMsg').textContent = '';
  try {
    await loadWith(pw);
    state.password = pw;
    if ($('remember').checked) store.set(PW_KEY, pw); else store.del(PW_KEY);
    showBoard();
    startLoops();
  } catch (err) {
    $('lockMsg').textContent = err.code === 'no-data'
      ? '아직 동기화된 데이터가 없습니다. GitHub 시크릿과 Actions 실행을 확인하세요.'
      : err.name === 'OperationError' ? '비밀번호가 맞지 않습니다.' : err.message;
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 렌더링 ---------- */
let summary = null;

function render(dataChanged = true) {
  summary = summarize(state.tasks);
  renderStats();
  renderSide();
  renderTicker();
  renderSync();
  if (dataChanged) state.page = 0;
  renderRows(dataChanged);
}

function renderStats() {
  const s = summary.stats;
  const items = [
    ['남은 일', s.open, 'led-amber'],
    ['오늘 기한', s.today, 'led-red'],
    ['날짜 지남 · 확인', s.overdue, 'led-red'],
    ['7일 이내', s.week, 'led-green'],
    ['7일간 해낸 일', s.doneWeek, 'led-cyan'],
  ];
  const box = $('stats');
  box.replaceChildren(...items.map(([label, n, cls]) => {
    const card = el('div', `stat${n === 0 ? ' zero' : ''}`);
    card.append(el('span', 'stat-label', label), el('span', `stat-num ${cls}`, String(n)));
    return card;
  }));
}

function kindTag(kind) {
  return kind === 'collect' ? ['수합', 'kind kind-collect'] : ['제출', 'kind kind-due'];
}

function whenNode(ev) {
  const node = el('span', 'when', dateLabel(ev));
  if (ev.time) {
    const t = ev.startTime && ev.endDay !== ev.startDay ? `${ev.startTime}~${ev.time}` : ev.time;
    node.append(el('small', '', t));
  }
  if (ev.inRange && ev.diff > 0) node.append(el('small', 'note', '기간 중'));
  return node;
}

function rowNode(ev) {
  const row = el('div', `row lv-${level(ev)}`);
  const [kLabel, kCls] = kindTag(ev.kind);
  const title = el('span', 'title');
  title.append(el('span', `lamp lamp-${ev.task.importance || 'none'}`), el('span', 'title-text', ev.task.title));
  row.append(el('span', 'dday', ddayLabel(ev)), el('span', kCls, kLabel), title, whenNode(ev), el('span', 'type', ev.task.type || ''));
  return row;
}

function rowsPerPage() {
  const box = $('rows');
  const probe = el('div', 'row');
  probe.style.visibility = 'hidden';
  box.append(probe);
  const h = probe.getBoundingClientRect().height || 48;
  probe.remove();
  return Math.max(3, Math.floor(box.clientHeight / h));
}

function renderRows(animate) {
  const box = $('rows');
  const evs = summary.events;
  if (evs.length === 0) {
    box.replaceChildren(el('div', 'empty', '날짜가 잡힌 남은 업무가 없습니다.'));
    $('pageInfo').textContent = '';
    return;
  }
  const per = rowsPerPage();
  const pages = Math.ceil(evs.length / per);
  if (state.page >= pages) state.page = 0;
  const slice = evs.slice(state.page * per, state.page * per + per);
  box.replaceChildren(...slice.map(rowNode));
  if (animate) { box.classList.remove('fade'); void box.offsetWidth; box.classList.add('fade'); }
  $('pageInfo').textContent = pages > 1 ? `${state.page + 1} / ${pages}` : `${evs.length}건`;
}

// 칸에 들어가는 만큼만 보여주고 나머지는 "외 n건"으로 줄인다.
function fillList(listId, items, emptyText) {
  const ul = $(listId);
  if (items.length === 0) { ul.replaceChildren(el('li', 'more', emptyText)); return; }
  ul.replaceChildren(...items);
  if (ul.clientHeight === 0) return; // 세로 화면 등 높이 제한이 없을 때
  let shown = items.length;
  const more = el('li', 'more');
  while (shown > 0 && ul.scrollHeight > ul.clientHeight + 1) {
    shown -= 1;
    items[shown].remove();
    more.textContent = `외 ${items.length - shown}건`;
    if (!more.isConnected) ul.append(more);
  }
}

function renderSide() {
  $('todayDate').textContent = longDate(summary.today);
  fillList('todayList', summary.todayEv.map((ev) => {
    const li = el('li');
    const [kLabel] = kindTag(ev.kind);
    const tag = el('span', 'tag', kLabel);
    tag.style.cssText = ev.kind === 'collect' ? 'color:#000;background:var(--cyan)' : 'color:#000;background:var(--amber)';
    let sub = ev.time || '';
    if (ev.timePassed) sub = `${ev.time} 경과`;
    else if (ev.inRange && ev.diff > 0) sub = `~${shortDate(ev.endDay)}`;
    li.append(tag, el('span', 'txt', ev.task.title), el('span', 'sub', sub));
    return li;
  }), '오늘 기한 업무 없음');

  $('undatedCount').textContent = `${summary.undated.length}건`;
  fillList('undatedList', summary.undated.map((t) => {
    const li = el('li');
    li.append(el('span', 'txt', t.title));
    return li;
  }), '없음');

  $('doneCount').textContent = `오늘 ${summary.stats.doneToday} · 7일 ${summary.stats.doneWeek}`;
  fillList('doneList', summary.doneRecent.map(({ task, day }) => {
    const li = el('li');
    li.append(el('span', 'txt', task.title), el('span', 'sub', day === summary.today ? '오늘' : shortDate(day)));
    return li;
  }), '최근 완료 기록 없음');
}

function renderTicker() {
  const parts = [];
  if (summary.stats.overdue > 0) parts.push(`날짜 지난 업무 ${summary.stats.overdue}건 — 실제 처리 여부 확인`);
  summary.events.filter((e) => e.diff >= 0).slice(0, 12).forEach((e) => {
    const [k] = kindTag(e.kind);
    parts.push(`[${k}] ${e.task.title} ${dateLabel(e)}${e.time ? ` ${e.time}` : ''} ${ddayLabel(e)}`);
  });
  summary.pending.slice(0, 5).forEach((t) => parts.push(`미제출 · ${t.title}: ${t.pending}`));
  if (parts.length === 0) parts.push('남은 기한 업무가 없습니다. 오늘도 수고 많으셨습니다');

  const node = $('ticker');
  node.replaceChildren();
  parts.forEach((p, i) => {
    if (i) node.append(el('span', 'sep', '◆'));
    node.append(document.createTextNode(p));
  });
  const len = parts.join('   ').length;
  node.style.setProperty('--dur', `${Math.max(25, Math.round(len * 0.28))}s`);
}

function renderSync() {
  const node = $('sync');
  if (isDemo) { node.textContent = '예시 데이터 (노션 아님)'; return; }
  if (!state.generatedAt) { node.textContent = '동기화 -'; return; }
  const day = kstDay(state.generatedAt);
  const label = `${day === kstToday() ? '' : `${shortDate(day)} `}${kstTime(state.generatedAt)}`;
  const ageMin = (Date.now() - new Date(state.generatedAt).getTime()) / 60000;
  node.classList.toggle('stale', ageMin > STALE_MIN);
  node.textContent = ageMin > STALE_MIN ? `동기화 지연 · 마지막 ${label}` : `노션 동기화 ${label}`;
}

/* ---------- 시계·주기 작업 ---------- */
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
let lastMinute = '';

function tick() {
  const now = new Date();
  $('clock').textContent = clockFmt.format(now);
  $('date').textContent = longDate(kstToday(now));
  const minute = clockFmt.format(now).slice(0, 5);
  if (summary && minute !== lastMinute) {
    lastMinute = minute;
    // 분이 바뀌면 D-day·시각경과를 다시 계산 (페이지는 유지)
    const page = state.page;
    render(false);
    state.page = page;
  }
}

let loopsStarted = false;
function startLoops() {
  if (loopsStarted) return;
  loopsStarted = true;
  tick();
  setInterval(tick, 1000);
  state.pageTimer = setInterval(() => { state.page += 1; renderRows(true); }, PAGE_MS);
  if (!isDemo) setInterval(refresh, REFRESH_MS);
  addEventListener('resize', () => renderRows(false));
  keepAwake();
}

async function refresh() {
  try {
    await loadWith(state.password);
  } catch (err) {
    if (err.name === 'OperationError') { store.del(PW_KEY); showLock('비밀번호가 바뀌었습니다. 다시 입력하세요.'); return; }
    // 네트워크 오류는 이전 화면 유지, 동기화 표시만 갱신
    renderSync();
  }
}

/* ---------- 화면 켜둠·전체 화면·커서 숨김 ---------- */
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 지원 안 함 */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && loopsStarted) { keepAwake(); if (!isDemo) refresh(); }
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
$('fsBtn').addEventListener('click', toggleFullscreen);
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if ((e.key === 'l' || e.key === 'L') && !isDemo) { store.del(PW_KEY); location.reload(); }
});

let idleTimer;
addEventListener('mousemove', () => {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
});

/* ---------- 시작 ---------- */
async function boot() {
  if (isDemo) {
    $('demoBadge').hidden = false;
    apply(makeDemo());
    showBoard();
    startLoops();
    return;
  }
  const saved = store.get(PW_KEY);
  if (!saved) { showLock(); return; }
  try {
    await loadWith(saved);
    state.password = saved;
    showBoard();
    startLoops();
  } catch (err) {
    if (err.name === 'OperationError') store.del(PW_KEY);
    showLock(err.code === 'no-data' ? '아직 동기화된 데이터가 없습니다.' : '');
  }
}

boot();
