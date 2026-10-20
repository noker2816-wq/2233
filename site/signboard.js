// 광장 전광판에 그릴 LED 화면 (2048x1024 캔버스 → three.js 텍스처)
import * as THREE from 'three';
import { ddayLabel, dateLabel, level, longDate } from './logic.js';

const W = 2048;
const H = 1024;
const TICKER_Y = 920;
const ROWS = 6;
const PAGE_MS = 8000;
const COLORS = { amber: '#ffb000', red: '#ff3b30', green: '#3dff7a', cyan: '#38e1ff', gray: '#8a8a8a', dim: '#444' };
const LV_COLOR = { over: COLORS.red, today: COLORS.amber, soon: COLORS.green, later: COLORS.gray };
const KR = '"Noto Sans KR", sans-serif';
const NUM = '"Orbitron", "Noto Sans KR", monospace';

const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function dotPattern(ctx) {
  const c = document.createElement('canvas');
  c.width = c.height = 6;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0, 0, 6, 6);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(3, 3, 2.2, 0, Math.PI * 2);
  g.fill();
  return ctx.createPattern(c, 'repeat');
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxW) lo = mid; else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

function glowText(ctx, text, x, y, color, blur = 14) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export class Signboard {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.dots = dotPattern(this.ctx);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.summary = null;
    this.syncLabel = '';
    this.page = 0;
    this.pageAt = 0;
    this.lastSecond = '';
    this.tickerText = '';
    this.tickerW = 0;
    this.tickerX = W;
  }

  setData(summary, syncLabel) {
    this.summary = summary;
    this.syncLabel = syncLabel;
    this.buildTicker();
    this.lastSecond = ''; // 다음 프레임에 전체 다시 그림
  }

  buildTicker() {
    const s = this.summary;
    const parts = [];
    if (s.stats.overdue > 0) parts.push(`날짜 지난 업무 ${s.stats.overdue}건 — 실제 처리 여부 확인`);
    s.events.filter((e) => e.diff >= 0).slice(0, 12).forEach((e) => {
      parts.push(`[${e.kind === 'collect' ? '수합' : '제출'}] ${e.task.title} ${dateLabel(e)}${e.time ? ` ${e.time}` : ''} ${ddayLabel(e)}`);
    });
    s.pending.slice(0, 5).forEach((t) => parts.push(`미제출 · ${t.title}: ${t.pending}`));
    if (parts.length === 0) parts.push('남은 기한 업무가 없습니다. 오늘도 수고 많으셨습니다');
    this.tickerText = parts.join('   ◆   ');
    this.ctx.font = `900 54px ${KR}`;
    this.tickerW = this.ctx.measureText(this.tickerText).width;
    this.tickerX = W;
  }

  // 매 프레임 호출. 초가 바뀌면 전체, 아니면 자막 띠만 다시 그린다.
  update(now, dt) {
    if (!this.summary) return;
    const sec = clockFmt.format(now);
    if (now.getTime() - this.pageAt > PAGE_MS) {
      this.pageAt = now.getTime();
      this.page += 1;
      this.lastSecond = '';
    }
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.drawAll(now, sec);
    }
    this.tickerX -= dt * 260;
    if (this.tickerX < -this.tickerW) this.tickerX = W - 220;
    this.drawTicker();
    this.texture.needsUpdate = true;
  }

  drawAll(now, sec) {
    const ctx = this.ctx;
    const s = this.summary;
    ctx.fillStyle = '#040404';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    // 머리 줄
    ctx.font = `900 66px ${KR}`;
    ctx.textAlign = 'left';
    glowText(ctx, '경제진흥팀 서무 전광판', 56, 80, COLORS.amber);
    ctx.font = `700 38px ${KR}`;
    ctx.fillStyle = COLORS.gray;
    ctx.fillText(`${longDate(s.today)}  ·  ${this.syncLabel}`, 58, 146);
    ctx.font = `800 120px ${NUM}`;
    ctx.textAlign = 'right';
    glowText(ctx, sec, W - 56, 100, COLORS.green, 18);

    // 숫자 카드
    const stats = [
      ['남은 일', s.stats.open, COLORS.amber],
      ['오늘 기한', s.stats.today, COLORS.red],
      ['날짜 지남', s.stats.overdue, COLORS.red],
      ['7일 이내', s.stats.week, COLORS.green],
      ['7일 해낸 일', s.stats.doneWeek, COLORS.cyan],
    ];
    const gap = 22;
    const bw = (W - 112 - gap * 4) / 5;
    stats.forEach(([label, n, color], i) => {
      const x = 56 + i * (bw + gap);
      ctx.fillStyle = '#0d0d0d';
      roundRect(ctx, x, 190, bw, 150, 14);
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = `700 38px ${KR}`;
      ctx.fillStyle = COLORS.gray;
      ctx.fillText(label, x + 26, 300);
      ctx.textAlign = 'right';
      ctx.font = `800 104px ${NUM}`;
      if (n === 0) { ctx.fillStyle = '#2a2a2a'; ctx.fillText('0', x + bw - 24, 262); } else glowText(ctx, String(n), x + bw - 24, 262, color);
    });

    // 기한 목록
    const evs = s.events;
    const pages = Math.max(1, Math.ceil(evs.length / ROWS));
    const page = this.page % pages;
    ctx.textAlign = 'left';
    ctx.font = `900 44px ${KR}`;
    glowText(ctx, '기한 현황', 56, 392, COLORS.amber, 10);
    ctx.textAlign = 'right';
    ctx.font = `700 34px ${NUM}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(evs.length ? `${page + 1} / ${pages}` : '', W - 56, 392);

    const top = 432;
    const rh = 78;
    if (evs.length === 0) {
      ctx.textAlign = 'left';
      ctx.font = `700 48px ${KR}`;
      ctx.fillStyle = COLORS.gray;
      ctx.fillText('날짜가 잡힌 남은 업무가 없습니다.', 56, top + 120);
    }
    evs.slice(page * ROWS, page * ROWS + ROWS).forEach((ev, i) => {
      const y = top + i * rh;
      const cy = y + rh / 2;
      const lv = level(ev);
      const color = LV_COLOR[lv];
      // D-day 상자
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      roundRect(ctx, 56, y + 8, 250, rh - 16, 10);
      if (lv === 'over' || lv === 'today') { ctx.fillStyle = lv === 'over' ? 'rgba(255,59,48,.16)' : 'rgba(255,176,0,.16)'; ctx.fill(); }
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.font = `800 40px ${NUM}`;
      glowText(ctx, ddayLabel(ev), 181, cy + 2, color, 10);
      // 수합/제출
      const isCollect = ev.kind === 'collect';
      ctx.fillStyle = isCollect ? 'rgba(56,225,255,.14)' : 'rgba(255,176,0,.14)';
      roundRect(ctx, 330, y + 14, 120, rh - 28, 8);
      ctx.fill();
      ctx.font = `900 36px ${KR}`;
      ctx.fillStyle = isCollect ? COLORS.cyan : COLORS.amber;
      ctx.fillText(isCollect ? '수합' : '제출', 390, cy + 2);
      // 중요도 램프
      const lamp = { 상: COLORS.red, 중: COLORS.amber, 하: '#555' }[ev.task.importance] || '#333';
      ctx.fillStyle = lamp;
      ctx.shadowColor = lamp;
      ctx.shadowBlur = ev.task.importance === '하' ? 0 : 12;
      ctx.beginPath();
      ctx.arc(492, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // 제목
      ctx.textAlign = 'left';
      ctx.font = `700 50px ${KR}`;
      ctx.fillStyle = '#f2efe6';
      ctx.fillText(fit(ctx, ev.task.title, 1010), 524, cy + 2);
      // 날짜
      ctx.textAlign = 'right';
      ctx.font = `700 42px ${KR}`;
      ctx.fillStyle = '#d8d4ca';
      ctx.fillText(`${dateLabel(ev)}${ev.time ? ` ${ev.time}` : ''}`, W - 56, cy + 2);
      // 구분선
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(56, y + rh);
      ctx.lineTo(W - 56, y + rh);
      ctx.stroke();
    });

    ctx.fillStyle = this.dots;
    ctx.fillRect(0, 0, W, TICKER_Y);
  }

  drawTicker() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, TICKER_Y, W, H - TICKER_Y);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `900 54px ${KR}`;
    ctx.save();
    ctx.beginPath();
    ctx.rect(220, TICKER_Y, W - 220, H - TICKER_Y);
    ctx.clip();
    glowText(ctx, this.tickerText, this.tickerX, TICKER_Y + 52, COLORS.amber, 10);
    ctx.restore();
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(0, TICKER_Y + 6, 200, H - TICKER_Y - 12);
    ctx.fillStyle = '#000';
    ctx.font = `800 48px ${NUM}`;
    ctx.textAlign = 'center';
    ctx.fillText('NEXT', 100, TICKER_Y + 54);
    ctx.fillStyle = this.dots;
    ctx.fillRect(0, TICKER_Y, W, H - TICKER_Y);
  }
}
