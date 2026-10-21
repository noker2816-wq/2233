// 광장 대형 전광판 — 귀엽고 멀리서도 잘 보이게.
// 남색 바탕 + 큰 흰 글씨 + 색 타일·둥근 칩. 텍스처 3장: 본 화면 / 시계(초 단위) / 하단 자막.
import * as THREE from 'three';
import { ddayLabel, dateLabel, level, longDate, shortDate, eventsOf } from './logic.js';

export const MAIN_W = 4096;
export const MAIN_H = 1840;
const CLOCK_W = 1024;
const CLOCK_H = 220;
const TICK_W = 2048;
const TICK_H = 96;
const PAGE_MS = 10000;

const BG = '#121a46';
const PANEL = '#1d2763';
const PANEL_LINE = '#2c3a86';
const WHITE = '#ffffff';
const SUB = '#c8d0ff';
const DIM = '#8b95cf';
const C = { orange: '#ff9f43', pink: '#ff6b8b', red: '#ff4757', green: '#2ed47a', sky: '#4dabf7', purple: '#a77bff', yellow: '#ffd43b', mint: '#5ef2c8' };
const LV = { over: C.red, today: C.orange, soon: C.green, later: '#5b679f' };
const KR = '"Noto Sans KR", sans-serif';
const NUM = '"Orbitron", "Noto Sans KR", monospace';
export const TYPES = [
  ['수합·제출', '#4dabf7'], ['지출·회계', '#2ed47a'], ['급여·인사', '#a77bff'], ['정보공개', '#ff6b8b'],
  ['감사·점검', '#ff9f43'], ['행사·차출', '#f783ac'], ['공람·참고', '#adb5bd'],
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
// 글자를 줄여가며 맞추고, 최소 크기에서도 넘치면 말줄임
function fitShrink(g, text, maxW, size, minSize, weight = 800) {
  let fs = size;
  g.font = `${weight} ${fs}px ${KR}`;
  while (fs > minSize && g.measureText(text).width > maxW) { fs -= 2; g.font = `${weight} ${fs}px ${KR}`; }
  return fit(g, text, maxW);
}
function rr(g, x, y, w, h, r, fill, stroke, lw = 4) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function text(g, s, x, y, { size = 50, weight = 800, color = WHITE, align = 'left', font = KR, shadow = false } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  if (shadow) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText(s, x + 4, y + 5); }
  g.fillStyle = color;
  g.fillText(s, x, y);
}
// 귀여운 고양이 얼굴 아이콘
function catIcon(g, x, y, r, color = '#ffe8a3') {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - r * 0.85, y - r * 0.2); g.lineTo(x - r * 0.65, y - r * 1.05); g.lineTo(x - r * 0.2, y - r * 0.7);
  g.moveTo(x + r * 0.85, y - r * 0.2); g.lineTo(x + r * 0.65, y - r * 1.05); g.lineTo(x + r * 0.2, y - r * 0.7);
  g.fill();
  g.beginPath(); g.arc(x, y, r * 0.85, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b2b3a';
  g.beginPath(); g.arc(x - r * 0.32, y - r * 0.05, r * 0.11, 0, Math.PI * 2); g.arc(x + r * 0.32, y - r * 0.05, r * 0.11, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff8fab';
  g.beginPath(); g.arc(x, y + r * 0.18, r * 0.09, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,143,171,.6)';
  g.beginPath(); g.arc(x - r * 0.55, y + r * 0.25, r * 0.14, 0, Math.PI * 2); g.arc(x + r * 0.55, y + r * 0.25, r * 0.14, 0, Math.PI * 2); g.fill();
}
function star(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}
// 패널 제목: 동그란 색 점 + 굵은 글씨 + 오른쪽 건수
function header(g, title, x, y, w, color, right = '') {
  g.fillStyle = color;
  g.beginPath(); g.arc(x + 22, y, 18, 0, Math.PI * 2); g.fill();
  text(g, title, x + 56, y, { size: 64, weight: 900, color: WHITE });
  if (right) text(g, right, x + w, y, { size: 48, weight: 800, color: SUB, align: 'right' });
}

export class Signboard {
  constructor() {
    this.main = canvas(MAIN_W, MAIN_H);
    this.clock = canvas(CLOCK_W, CLOCK_H);
    this.tick = canvas(TICK_W, TICK_H);
    this.summary = null;
    this.tasks = [];
    this.sync = '';
    this.page = 0;
    this.pageAt = 0;
    this.pages = 1;
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
    this.tickX -= dt * 150;
    if (this.tickX < -this.tickW) this.tickX = TICK_W;
    this.tickAcc += dt;
    if (this.tickAcc > 1 / 30) { this.tickAcc = 0; this.drawTicker(); }
  }

  buildTicker() {
    const s = this.summary;
    const parts = [];
    if (s.stats.overdue > 0) parts.push(`날짜 지난 업무 ${s.stats.overdue}건 — 처리했는지 확인!`);
    s.events.filter((e) => e.diff >= 0).slice(0, 15).forEach((e) => {
      parts.push(`[${e.kind === 'collect' ? '수합' : '제출'}] ${e.task.title} ${dateLabel(e)}${e.time ? ` ${e.time}` : ''} ${ddayLabel(e)}`);
    });
    s.pending.slice(0, 6).forEach((t) => parts.push(`미제출 · ${t.title}: ${t.pending}`));
    if (parts.length === 0) parts.push('남은 기한 업무가 없어요. 오늘도 수고 많았어요!');
    this.tickText = parts.join('   ★   ');
    this.tick.g.font = `900 60px ${KR}`;
    this.tickW = this.tick.g.measureText(this.tickText).width;
    this.tickX = TICK_W;
  }

  drawClock(sec) {
    const { g, tex } = this.clock;
    g.fillStyle = BG;
    g.fillRect(0, 0, CLOCK_W, CLOCK_H);
    rr(g, 24, 22, CLOCK_W - 48, CLOCK_H - 44, 80, PANEL, PANEL_LINE, 6);
    text(g, sec, CLOCK_W / 2, CLOCK_H / 2 + 6, { size: 132, weight: 800, color: C.mint, align: 'center', font: NUM });
    tex.needsUpdate = true;
  }

  drawTicker() {
    const { g, tex } = this.tick;
    g.fillStyle = '#fff3c4';
    g.fillRect(0, 0, TICK_W, TICK_H);
    g.save();
    g.beginPath(); g.rect(190, 0, TICK_W - 190, TICK_H); g.clip();
    text(g, this.tickText, this.tickX, TICK_H / 2 + 3, { size: 60, weight: 900, color: '#22285c' });
    g.restore();
    rr(g, 10, 10, 168, TICK_H - 20, 38, C.pink);
    text(g, 'NEXT', 94, TICK_H / 2 + 3, { size: 40, weight: 800, color: WHITE, align: 'center', font: NUM });
    tex.needsUpdate = true;
  }

  drawMain() {
    const { g, tex } = this.main;
    const s = this.summary;
    g.fillStyle = BG;
    g.fillRect(0, 0, MAIN_W, MAIN_H);
    // 반짝이 별 장식
    [[2620, 60, 22], [2700, 150, 14], [2560, 170, 12], [1880, 50, 16], [1960, 160, 11]].forEach(([x, y, r]) => star(g, x, y, r, 'rgba(255,212,59,.85)'));

    // 머리 줄 (오른쪽 위 시계 자리는 비움)
    catIcon(g, 140, 112, 76);
    text(g, '경제진흥팀 서무 전광판', 250, 92, { size: 118, weight: 900, color: WHITE, shadow: true });
    text(g, `${longDate(s.today)}   ·   ${this.sync}`, 256, 192, { size: 52, weight: 700, color: SUB });

    // 숫자 타일 6개 (색 타일 + 큰 흰 숫자)
    const stats = [
      ['남은 일', s.stats.open, C.orange], ['오늘 기한', s.stats.today, C.pink], ['날짜 지남', s.stats.overdue, C.red],
      ['7일 이내', s.stats.week, C.green], ['날짜 미정', s.undated.length, C.sky], ['7일 해낸 일', s.stats.doneWeek, C.purple],
    ];
    const gap = 34;
    const cw = (MAIN_W - 120 - gap * 5) / 6;
    stats.forEach(([label, n, color], i) => {
      const x = 60 + i * (cw + gap);
      const zero = n === 0;
      rr(g, x, 262, cw, 230, 44, 'rgba(0,0,0,.28)');
      rr(g, x, 250, cw, 228, 44, zero ? '#2a3474' : color);
      text(g, label, x + 40, 312, { size: 58, weight: 900, color: zero ? DIM : WHITE });
      text(g, String(n), x + cw - 40, 400, { size: 168, weight: 800, color: zero ? '#46518f' : WHITE, align: 'right', font: NUM, shadow: !zero });
    });

    this.drawDeadlines(g, 60, 530, 2010, MAIN_H - 30);
    this.drawToday(g, 2110, 530, 950);
    this.drawRight(g, 3100, 530, 936);
    tex.needsUpdate = true;
  }

  // 왼쪽: 기한 현황 (넘치면 페이지 넘김)
  drawDeadlines(g, x0, y0, w, y1) {
    const evs = this.summary.events;
    rr(g, x0, y0, w, y1 - y0, 40, PANEL, PANEL_LINE, 4);
    const rowH = 116;
    const top = y0 + 120;
    const rows = Math.floor((y1 - 20 - top) / rowH);
    this.pages = Math.max(1, Math.ceil(evs.length / rows));
    const page = this.page % this.pages;
    header(g, '기한 현황', x0 + 36, y0 + 64, w - 72, C.yellow, evs.length ? `${evs.length}건${this.pages > 1 ? `  ·  ${page + 1}/${this.pages}쪽` : ''}` : '');
    if (!evs.length) {
      text(g, '날짜가 잡힌 남은 업무가 없어요 ☺', x0 + 60, top + 100, { size: 60, color: SUB });
      return;
    }
    evs.slice(page * rows, page * rows + rows).forEach((ev, i) => {
      const y = top + i * rowH;
      const cy = y + rowH / 2;
      const lv = level(ev);
      if (i % 2 === 0) rr(g, x0 + 20, y + 4, w - 40, rowH - 8, 26, 'rgba(255,255,255,.04)');
      // D-day 알약
      rr(g, x0 + 40, y + 16, 250, rowH - 32, 42, LV[lv]);
      text(g, ddayLabel(ev), x0 + 165, cy + 2, { size: ev.timePassed ? 40 : 50, weight: 800, color: WHITE, align: 'center', font: NUM });
      // 수합/제출 칩
      const col = ev.kind === 'collect';
      rr(g, x0 + 310, y + 22, 128, rowH - 44, 30, col ? C.sky : C.yellow);
      text(g, col ? '수합' : '제출', x0 + 374, cy + 2, { size: 46, weight: 900, color: '#16204f', align: 'center' });
      // 중요도 점
      const imp = { 상: C.red, 중: C.orange, 하: '#7a84b8' }[ev.task.importance];
      if (imp) { g.fillStyle = imp; g.beginPath(); g.arc(x0 + 478, cy, 16, 0, Math.PI * 2); g.fill(); }
      // 날짜
      g.font = `700 48px ${KR}`;
      const date = `${dateLabel(ev)}${ev.time ? ` ${ev.time}` : ''}`;
      const dw = g.measureText(date).width;
      text(g, date, x0 + w - 44, cy + 2, { size: 48, weight: 700, color: SUB, align: 'right' });
      // 제목 (크게, 길면 줄여서 끝까지)
      g.fillStyle = WHITE;
      const t = fitShrink(g, ev.task.title, w - 520 - dw - 70, 66, 46, 800);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(t, x0 + 512, cy + 3);
    });
  }

  list(g, items, x0, y0, w, rowH, max, empty) {
    if (!items.length) { text(g, empty, x0, y0 + rowH / 2, { size: 50, weight: 700, color: DIM }); return; }
    const shown = items.length > max ? items.slice(0, max - 1) : items;
    shown.forEach((it, i) => {
      const cy = y0 + i * rowH + rowH / 2;
      let x = x0;
      if (it.tag) {
        g.font = `900 40px ${KR}`;
        const tw = g.measureText(it.tag).width + 36;
        rr(g, x, cy - 32, tw, 64, 30, it.tagColor);
        text(g, it.tag, x + tw / 2, cy + 2, { size: 40, weight: 900, color: '#16204f', align: 'center' });
        x += tw + 20;
      }
      let sw = 0;
      if (it.sub) {
        g.font = `800 44px ${KR}`;
        sw = g.measureText(it.sub).width;
        text(g, it.sub, x0 + w, cy + 2, { size: 44, weight: 800, color: it.subColor || SUB, align: 'right' });
      }
      g.fillStyle = WHITE;
      const t = fitShrink(g, it.text, x0 + w - x - sw - 28, 54, 38, 800);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(t, x, cy + 3);
    });
    if (items.length > max) text(g, `외 ${items.length - max + 1}건 더`, x0, y0 + (max - 1) * rowH + rowH / 2, { size: 46, weight: 800, color: SUB });
  }

  // 가운데: 오늘 / 날짜 지남
  drawToday(g, x0, y0, w) {
    const s = this.summary;
    rr(g, x0, y0, w, 610, 40, PANEL, PANEL_LINE, 4);
    header(g, '오늘', x0 + 36, y0 + 64, w - 72, C.pink, `${s.todayEv.length}건`);
    this.list(g, s.todayEv.map((e) => ({
      tag: e.kind === 'collect' ? '수합' : '제출',
      tagColor: e.kind === 'collect' ? C.sky : C.yellow,
      text: e.task.title,
      sub: e.timePassed ? `${e.time} 지남` : e.inRange && e.diff > 0 ? `~${shortDate(e.endDay)}` : e.time || '',
      subColor: e.timePassed ? C.red : SUB,
    })), x0 + 36, y0 + 120, w - 72, 94, 5, '오늘 기한 업무 없음 ☺');

    const y2 = y0 + 640;
    rr(g, x0, y2, w, MAIN_H - 30 - y2, 40, '#3a1d4f', '#6b2f7d', 4);
    header(g, '날짜 지남 · 처리 확인', x0 + 36, y2 + 64, w - 72, C.red, `${s.overdue.length}건`);
    this.list(g, s.overdue.map((e) => ({
      tag: e.kind === 'collect' ? '수합' : '제출', tagColor: '#ff8a95', text: e.task.title, sub: ddayLabel(e), subColor: '#ffb3bb',
    })), x0 + 36, y2 + 120, w - 72, 94, 5, '날짜 지난 업무 없음 ☺');
  }

  // 오른쪽: 유형별 / 날짜 미정 / 최근 해낸 일
  drawRight(g, x0, y0, w) {
    const s = this.summary;
    const open = this.tasks.filter((t) => !t.done);
    rr(g, x0, y0, w, 640, 40, PANEL, PANEL_LINE, 4);
    header(g, '업무유형별', x0 + 36, y0 + 64, w - 72, C.mint);
    const counts = TYPES.map(([type, color]) => {
      const ts = open.filter((t) => t.type === type);
      return { type, color, n: ts.length, over: ts.filter((t) => eventsOf(t).some((e) => e.diff < 0)).length };
    });
    const max = Math.max(1, ...counts.map((c) => c.n));
    counts.forEach((c, i) => {
      const cy = y0 + 140 + i * 72;
      text(g, c.type, x0 + 40, cy, { size: 42, weight: 800, color: SUB });
      const bx = x0 + 250;
      const bw = w - 250 - 150;
      rr(g, bx, cy - 22, bw, 44, 22, '#2a3474');
      if (c.n) rr(g, bx, cy - 22, Math.max(44, (bw * c.n) / max), 44, 22, c.color);
      text(g, String(c.n), x0 + w - 70, cy + 2, { size: 50, weight: 800, color: c.n ? WHITE : DIM, align: 'right', font: NUM });
      if (c.over) { g.fillStyle = C.red; g.beginPath(); g.arc(x0 + w - 36, cy - 16, 13, 0, Math.PI * 2); g.fill(); }
    });

    const y2 = y0 + 660;
    rr(g, x0, y2, w, 290, 40, PANEL, PANEL_LINE, 4);
    header(g, '날짜 미정', x0 + 36, y2 + 60, w - 72, C.sky, `${s.undated.length}건`);
    this.list(g, s.undated.map((t) => ({ text: t.title })), x0 + 36, y2 + 104, w - 72, 64, 3, '없음 ☺');

    const y3 = y2 + 310;
    rr(g, x0, y3, w, MAIN_H - 30 - y3, 40, '#173d3a', '#1f6b5f', 4);
    header(g, '최근 7일 해낸 일', x0 + 36, y3 + 60, w - 72, C.green, `오늘 ${s.stats.doneToday}`);
    this.list(g, s.doneRecent.map(({ task, day }) => ({ text: task.title, sub: day === s.today ? '오늘' : shortDate(day) })), x0 + 36, y3 + 104, w - 72, 64, 3, '최근 완료 기록 없음');
  }
}
