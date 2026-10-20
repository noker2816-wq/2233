// 중구청 광장 대형 전광판. 노션 대시보드처럼 한 면에 전체 현황을 그린다.
// 텍스처 3장: 본 화면(데이터 바뀔 때·분 단위), 시계(초 단위), 하단 자막(매 프레임).
import * as THREE from 'three';
import { ddayLabel, dateLabel, level, longDate, shortDate, eventsOf } from './logic.js';

export const MAIN_W = 4096;
export const MAIN_H = 1840;
const CLOCK_W = 1024;
const CLOCK_H = 220;
const TICK_W = 2048;
const TICK_H = 96;
const PAGE_MS = 10000;

const C = { amber: '#ffb000', red: '#ff3b30', green: '#3dff7a', cyan: '#38e1ff', gray: '#8f8f8f', dim: '#4a4a4a', text: '#f2efe6', sub: '#cfcac0' };
const LV = { over: C.red, today: C.amber, soon: C.green, later: C.gray };
const KR = '"Noto Sans KR", sans-serif';
const NUM = '"Orbitron", "Noto Sans KR", monospace';
export const TYPES = [
  ['수합·제출', '#4c9bd6'], ['지출·회계', '#5fb86b'], ['급여·인사', '#9b6fd1'], ['정보공개', '#e5534b'],
  ['감사·점검', '#f29b38'], ['행사·차출', '#f06fa4'], ['공람·참고', '#9aa0a8'],
];

const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { c, g: c.getContext('2d'), tex };
}

function dots(g, size = 6) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const d = c.getContext('2d');
  d.fillStyle = 'rgba(0,0,0,0.5)';
  d.fillRect(0, 0, size, size);
  d.globalCompositeOperation = 'destination-out';
  d.beginPath();
  d.arc(size / 2, size / 2, size * 0.37, 0, Math.PI * 2);
  d.fill();
  return g.createPattern(c, 'repeat');
}

function fit(g, text, maxW) {
  if (maxW <= 0) return '';
  if (g.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.measureText(`${text.slice(0, mid)}…`).width <= maxW) lo = mid; else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

// 글자 크기를 줄여가며 맞추고, 최소 크기에서도 넘치면 말줄임
function fitShrink(g, text, maxW, size, minSize, weight = 700) {
  let fs = size;
  g.font = `${weight} ${fs}px ${KR}`;
  while (fs > minSize && g.measureText(text).width > maxW) {
    fs -= 2;
    g.font = `${weight} ${fs}px ${KR}`;
  }
  return fit(g, text, maxW);
}

function glow(g, text, x, y, color, blur = 16) {
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
}

function box(g, x, y, w, h, r, fill, stroke) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
}

function section(g, title, x, y, color, right = '') {
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `900 58px ${KR}`;
  glow(g, title, x, y, color, 10);
  if (right) {
    g.font = `700 40px ${NUM}`;
    g.fillStyle = C.dim;
    g.textAlign = 'right';
    g.fillText(right, x + (g.__colW || 0), y);
  }
}

export class Signboard {
  constructor() {
    this.main = canvas(MAIN_W, MAIN_H);
    this.clock = canvas(CLOCK_W, CLOCK_H);
    this.tick = canvas(TICK_W, TICK_H);
    this.mainDots = dots(this.main.g);
    this.tickDots = dots(this.tick.g, 4);
    this.summary = null;
    this.tasks = [];
    this.sync = '';
    this.page = 0;
    this.pageAt = 0;
    this.lastSec = '';
    this.tickText = '';
    this.tickW = 0;
    this.tickX = TICK_W;
    this.tickAcc = 0;
  }

  setData(summary, tasks, sync) {
    this.summary = summary;
    this.tasks = tasks;
    this.sync = sync;
    this.buildTicker();
    this.drawMain();
  }

  update(now, dt) {
    if (!this.summary) return;
    const sec = clockFmt.format(now);
    if (sec !== this.lastSec) { this.lastSec = sec; this.drawClock(sec); }
    if (this.pages > 1 && now.getTime() - this.pageAt > PAGE_MS) {
      this.pageAt = now.getTime();
      this.page += 1;
      this.drawMain();
    }
    // 자막은 30fps 정도로만 다시 그린다
    this.tickX -= dt * 150;
    if (this.tickX < -this.tickW) this.tickX = TICK_W;
    this.tickAcc += dt;
    if (this.tickAcc > 1 / 30) { this.tickAcc = 0; this.drawTicker(); }
  }

  buildTicker() {
    const s = this.summary;
    const parts = [];
    if (s.stats.overdue > 0) parts.push(`날짜 지난 업무 ${s.stats.overdue}건 — 실제 처리 여부 확인`);
    s.events.filter((e) => e.diff >= 0).slice(0, 15).forEach((e) => {
      parts.push(`[${e.kind === 'collect' ? '수합' : '제출'}] ${e.task.title} ${dateLabel(e)}${e.time ? ` ${e.time}` : ''} ${ddayLabel(e)}`);
    });
    s.pending.slice(0, 6).forEach((t) => parts.push(`미제출 · ${t.title}: ${t.pending}`));
    if (parts.length === 0) parts.push('남은 기한 업무가 없습니다. 오늘도 수고 많으셨습니다');
    this.tickText = parts.join('    ◆    ');
    this.tick.g.font = `900 58px ${KR}`;
    this.tickW = this.tick.g.measureText(this.tickText).width;
    this.tickX = TICK_W;
  }

  drawClock(sec) {
    const { g, tex } = this.clock;
    g.fillStyle = '#040404';
    g.fillRect(0, 0, CLOCK_W, CLOCK_H);
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    g.font = `800 168px ${NUM}`;
    glow(g, sec, CLOCK_W - 30, CLOCK_H / 2 + 6, C.green, 22);
    g.fillStyle = this.mainDots;
    g.fillRect(0, 0, CLOCK_W, CLOCK_H);
    tex.needsUpdate = true;
  }

  drawTicker() {
    const { g, tex } = this.tick;
    g.fillStyle = '#000';
    g.fillRect(0, 0, TICK_W, TICK_H);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = `900 58px ${KR}`;
    g.save();
    g.beginPath();
    g.rect(170, 0, TICK_W - 170, TICK_H);
    g.clip();
    glow(g, this.tickText, this.tickX, TICK_H / 2 + 3, C.amber, 8);
    g.restore();
    g.fillStyle = C.red;
    g.fillRect(0, 6, 150, TICK_H - 12);
    g.fillStyle = '#000';
    g.font = `800 40px ${NUM}`;
    g.textAlign = 'center';
    g.fillText('NEXT', 75, TICK_H / 2 + 3);
    g.fillStyle = this.tickDots;
    g.fillRect(0, 0, TICK_W, TICK_H);
    tex.needsUpdate = true;
  }

  drawMain() {
    const { g, tex } = this.main;
    const s = this.summary;
    g.fillStyle = '#040404';
    g.fillRect(0, 0, MAIN_W, MAIN_H);
    g.textBaseline = 'middle';

    // 머리 줄 (오른쪽 위 시계 자리는 비워둠)
    g.textAlign = 'left';
    g.font = `900 110px ${KR}`;
    glow(g, '경제진흥팀 서무 전광판', 70, 92, C.amber, 18);
    g.font = `700 50px ${KR}`;
    g.fillStyle = C.gray;
    g.fillText(`${longDate(s.today)}   ·   ${this.sync}`, 74, 186);

    // 숫자 카드 6개
    const stats = [
      ['남은 일', s.stats.open, C.amber], ['오늘 기한', s.stats.today, C.red], ['날짜 지남', s.stats.overdue, C.red],
      ['7일 이내', s.stats.week, C.green], ['날짜 미정', s.undated.length, C.cyan], ['7일 해낸 일', s.stats.doneWeek, C.cyan],
    ];
    const gap = 30;
    const cw = (MAIN_W - 140 - gap * 5) / 6;
    stats.forEach(([label, n, color], i) => {
      const x = 70 + i * (cw + gap);
      box(g, x, 240, cw, 210, 18, '#0d0d0d', '#232323');
      g.textAlign = 'left';
      g.font = `700 50px ${KR}`;
      g.fillStyle = C.gray;
      g.fillText(label, x + 36, 395);
      g.textAlign = 'right';
      g.font = `800 150px ${NUM}`;
      if (n === 0) { g.fillStyle = '#262626'; g.fillText('0', x + cw - 34, 335); } else glow(g, String(n), x + cw - 34, 335, color, 18);
    });

    this.drawDeadlines(g, 70, 1990);
    this.drawToday(g, 2120, 960);
    this.drawRight(g, 3140, 886);

    g.fillStyle = this.mainDots;
    g.fillRect(0, 0, MAIN_W, MAIN_H);
    tex.needsUpdate = true;
  }

  // 왼쪽: 기한 현황 전체 목록 (넘치면 페이지)
  drawDeadlines(g, x0, w) {
    const evs = this.summary.events;
    const rowH = 92;
    const top = 590;
    const rows = Math.floor((MAIN_H - 30 - top) / rowH);
    this.pages = Math.max(1, Math.ceil(evs.length / rows));
    const page = this.page % this.pages;
    g.__colW = w;
    section(g, '기한 현황', x0, 530, C.amber, evs.length ? `${evs.length}건${this.pages > 1 ? `  ${page + 1}/${this.pages}` : ''}` : '');
    g.__colW = 0;
    if (!evs.length) {
      g.font = `700 54px ${KR}`;
      g.fillStyle = C.gray;
      g.textAlign = 'left';
      g.fillText('날짜가 잡힌 남은 업무가 없습니다.', x0, top + 80);
      return;
    }
    evs.slice(page * rows, page * rows + rows).forEach((ev, i) => {
      const y = top + i * rowH;
      const cy = y + rowH / 2;
      const color = LV[level(ev)];
      const lv = level(ev);
      box(g, x0, y + 10, 230, rowH - 20, 12, lv === 'over' ? 'rgba(255,59,48,.16)' : lv === 'today' ? 'rgba(255,176,0,.16)' : null, color);
      g.textAlign = 'center';
      g.font = `800 44px ${NUM}`;
      glow(g, ddayLabel(ev), x0 + 115, cy + 2, color, 10);
      const col = ev.kind === 'collect';
      box(g, x0 + 250, y + 18, 110, rowH - 36, 8, col ? 'rgba(56,225,255,.14)' : 'rgba(255,176,0,.14)');
      g.font = `900 40px ${KR}`;
      g.fillStyle = col ? C.cyan : C.amber;
      g.fillText(col ? '수합' : '제출', x0 + 305, cy + 2);
      const lamp = { 상: C.red, 중: C.amber, 하: '#555' }[ev.task.importance] || '#333';
      g.fillStyle = lamp;
      g.shadowColor = lamp;
      g.shadowBlur = ev.task.importance === '하' ? 0 : 12;
      g.beginPath();
      g.arc(x0 + 395, cy, 14, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.font = `700 44px ${KR}`;
      const date = `${dateLabel(ev)}${ev.time ? ` ${ev.time}` : ''}`;
      const dw = g.measureText(date).width;
      g.textAlign = 'right';
      g.fillStyle = C.sub;
      g.fillText(date, x0 + w, cy + 2);
      g.textAlign = 'left';
      g.fillStyle = C.text;
      g.fillText(fitShrink(g, ev.task.title, w - 425 - dw - 36, 54, 38), x0 + 425, cy + 2);
      g.strokeStyle = '#1a1a1a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, y + rowH);
      g.lineTo(x0 + w, y + rowH);
      g.stroke();
    });
  }

  list(g, items, x0, y0, w, rowH, max, empty) {
    if (!items.length) {
      g.font = `700 46px ${KR}`;
      g.fillStyle = C.dim;
      g.textAlign = 'left';
      g.fillText(empty, x0, y0 + rowH / 2);
      return;
    }
    const shown = items.length > max ? items.slice(0, max - 1) : items;
    shown.forEach((it, i) => {
      const cy = y0 + i * rowH + rowH / 2;
      let x = x0;
      if (it.tag) {
        g.font = `900 36px ${KR}`;
        const tw = g.measureText(it.tag).width + 28;
        box(g, x, cy - 26, tw, 52, 8, it.tagColor);
        g.fillStyle = '#000';
        g.textAlign = 'center';
        g.fillText(it.tag, x + tw / 2, cy + 2);
        x += tw + 18;
      }
      g.font = `700 40px ${KR}`;
      let sw = 0;
      if (it.sub) {
        sw = g.measureText(it.sub).width;
        g.textAlign = 'right';
        g.fillStyle = it.subColor || C.gray;
        g.fillText(it.sub, x0 + w, cy + 2);
      }
      g.textAlign = 'left';
      g.fillStyle = C.text;
      g.fillText(fitShrink(g, it.text, x0 + w - x - sw - 26, 46, 34), x, cy + 2);
    });
    if (items.length > max) {
      g.font = `700 42px ${KR}`;
      g.fillStyle = C.gray;
      g.textAlign = 'left';
      g.fillText(`외 ${items.length - max + 1}건`, x0, y0 + (max - 1) * rowH + rowH / 2);
    }
  }

  // 가운데: 오늘 / 날짜 지남
  drawToday(g, x0, w) {
    const s = this.summary;
    g.__colW = w;
    section(g, '오늘', x0, 530, C.red, `${s.todayEv.length}건`);
    const today = s.todayEv.map((e) => ({
      tag: e.kind === 'collect' ? '수합' : '제출',
      tagColor: e.kind === 'collect' ? C.cyan : C.amber,
      text: e.task.title,
      sub: e.timePassed ? `${e.time} 경과` : e.inRange && e.diff > 0 ? `~${shortDate(e.endDay)}` : e.time || '',
      subColor: e.timePassed ? C.red : C.gray,
    }));
    this.list(g, today, x0, 580, w, 86, 6, '오늘 기한 업무 없음');

    section(g, '날짜 지남 · 처리 확인', x0, 1150, C.red, `${s.overdue.length}건`);
    g.__colW = 0;
    const over = s.overdue.map((e) => ({
      tag: e.kind === 'collect' ? '수합' : '제출',
      tagColor: '#ff6b61',
      text: e.task.title,
      sub: ddayLabel(e),
      subColor: C.red,
    }));
    this.list(g, over, x0, 1200, w, 86, 7, '날짜 지난 업무 없음');
  }

  // 오른쪽: 유형별 / 날짜 미정 / 최근 해낸 일
  drawRight(g, x0, w) {
    const s = this.summary;
    const open = this.tasks.filter((t) => !t.done);
    section(g, '업무유형별', x0, 530, C.cyan);
    const counts = TYPES.map(([type, color]) => {
      const ts = open.filter((t) => t.type === type);
      const over = ts.filter((t) => eventsOf(t).some((e) => e.diff < 0)).length;
      return { type, color, n: ts.length, over };
    });
    const max = Math.max(1, ...counts.map((c) => c.n));
    counts.forEach((c, i) => {
      const cy = 600 + i * 78;
      g.textAlign = 'left';
      g.font = `700 38px ${KR}`;
      g.fillStyle = C.sub;
      g.fillText(c.type, x0, cy);
      const bx = x0 + 200;
      const bw = w - 200 - 240;
      box(g, bx, cy - 20, bw, 40, 8, '#141414');
      if (c.n) box(g, bx, cy - 20, Math.max(16, (bw * c.n) / max), 40, 8, c.color);
      g.textAlign = 'right';
      g.font = `800 44px ${NUM}`;
      g.fillStyle = c.n ? C.text : C.dim;
      g.fillText(String(c.n), x0 + w - 130, cy + 2);
      if (c.over) {
        g.font = `900 30px ${KR}`;
        g.fillStyle = C.red;
        g.fillText(`지남 ${c.over}`, x0 + w, cy + 2);
      }
    });

    g.__colW = w;
    section(g, '날짜 미정', x0, 1200, C.cyan, `${s.undated.length}건`);
    this.list(g, s.undated.map((t) => ({ text: t.title })), x0, 1240, w, 70, 4, '없음');
    section(g, '최근 7일 해낸 일', x0, 1560, C.green, `오늘 ${s.stats.doneToday}`);
    g.__colW = 0;
    this.list(g, s.doneRecent.map(({ task, day }) => ({ text: task.title, sub: day === s.today ? '오늘' : shortDate(day) })), x0, 1600, w, 70, 3, '최근 완료 기록 없음');
  }
}
