// 날짜 판정 로직 (DOM 없음, Node 테스트 가능). 기준 시간대는 한국시간.
const TZ = 'Asia/Seoul';
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export const isDateTime = (iso) => typeof iso === 'string' && iso.includes('T');

// ISO 문자열 → 한국 날짜 'YYYY-MM-DD'
export function kstDay(iso) {
  if (!iso) return null;
  if (!isDateTime(iso)) return iso.slice(0, 10);
  return ymdFmt.format(new Date(iso));
}

export function kstToday(now = new Date()) {
  return ymdFmt.format(now);
}

export function kstTime(iso) {
  return isDateTime(iso) ? hmFmt.format(new Date(iso)) : null;
}

const dayNum = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

export const diffDays = (ymd, todayYmd) => dayNum(ymd) - dayNum(todayYmd);

export function weekday(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function shortDate(ymd) {
  const [, m, d] = ymd.split('-');
  return `${m}/${d}(${weekday(ymd)})`;
}

export function longDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${y}. ${Number(m)}. ${Number(d)}.(${weekday(ymd)})`;
}

// 업무 하나에서 수합/제출 이벤트를 각각 만든다. 수합 완료면 수합 이벤트는 뺀다.
export function eventsOf(task, now = new Date()) {
  if (task.done) return [];
  const today = kstToday(now);
  const out = [];
  const add = (kind, d) => {
    if (!d || !d.start) return;
    const startDay = kstDay(d.start);
    const endDay = d.end ? kstDay(d.end) : null;
    const keyIso = d.end || d.start; // 기간이면 끝나는 날이 기한
    const keyDay = endDay || startDay;
    const diff = diffDays(keyDay, today);
    const inRange = Boolean(endDay) && diffDays(startDay, today) <= 0 && diff >= 0;
    const timePassed = diff === 0 && isDateTime(keyIso) && new Date(keyIso).getTime() < now.getTime();
    out.push({
      task,
      kind, // 'collect' | 'due'
      startDay,
      endDay,
      keyDay,
      time: kstTime(keyIso),
      startTime: endDay ? kstTime(d.start) : null,
      diff,
      inRange,
      timePassed,
      sortKey: dayNum(keyDay) * 1440 + (isDateTime(keyIso) ? toMinutes(kstTime(keyIso)) : 1439) + (kind === 'collect' ? 0 : 0.5),
    });
  };
  if (!task.collectDone) add('collect', task.collect);
  add('due', task.due);
  return out;
}

function toMinutes(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function ddayLabel(ev) {
  if (ev.diff < 0) return `D+${-ev.diff}`;
  if (ev.diff === 0) return ev.timePassed ? '시각경과' : 'D-DAY';
  return `D-${ev.diff}`;
}

export function dateLabel(ev) {
  if (ev.endDay && ev.endDay !== ev.startDay) {
    return `${shortDate(ev.startDay)}~${shortDate(ev.endDay)}`;
  }
  return shortDate(ev.keyDay);
}

export function level(ev) {
  if (ev.diff < 0 || ev.timePassed) return 'over';
  if (ev.diff === 0) return 'today';
  if (ev.diff <= 3) return 'soon';
  return 'later';
}

// 화면에 필요한 묶음을 한 번에 계산한다.
export function summarize(tasks, now = new Date()) {
  const today = kstToday(now);
  const open = tasks.filter((t) => !t.done);
  const events = open.flatMap((t) => eventsOf(t, now)).sort((a, b) => a.sortKey - b.sortKey);
  const uniq = (evs) => new Set(evs.map((e) => e.task.id)).size;

  const overdue = events.filter((e) => e.diff < 0);
  const todayEv = events.filter((e) => e.diff === 0 || e.inRange);
  const todayDue = events.filter((e) => e.diff === 0);
  const week = events.filter((e) => e.diff >= 1 && e.diff <= 7);
  const undated = open.filter((t) => !(t.collect && t.collect.start) && !(t.due && t.due.start));

  const doneRecent = tasks
    .filter((t) => t.done && t.doneAt)
    .map((t) => ({ task: t, day: kstDay(t.doneAt) }))
    .filter((x) => diffDays(x.day, today) >= -6 && diffDays(x.day, today) <= 0)
    .sort((a, b) => (a.task.doneAt < b.task.doneAt ? 1 : -1));

  return {
    today,
    openCount: open.length,
    events, // 날짜 지남 → 오늘 → 미래 순 (시간순)
    overdue,
    todayEv,
    stats: {
      open: open.length,
      today: uniq(todayDue),
      overdue: uniq(overdue),
      week: uniq(week),
      doneWeek: doneRecent.length,
      doneToday: doneRecent.filter((x) => x.day === today).length,
    },
    undated,
    doneRecent,
    pending: open.filter((t) => t.pending && !t.collectDone),
  };
}
