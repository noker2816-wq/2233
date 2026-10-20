import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptJSON, decryptJSON } from '../site/crypto.js';
import { summarize, eventsOf, ddayLabel, kstDay, shortDate } from '../site/logic.js';
import { buildPayload, toTask } from './sync.mjs';

// 2026-10-20(화) 10:00 KST
const NOW = new Date('2026-10-20T01:00:00Z');

const t = (o) => ({ id: o.id || Math.random().toString(36).slice(2), title: 'x', collect: null, due: null, collectDone: false, done: false, doneAt: null, ...o });

test('암호화 왕복 + 틀린 비밀번호 거부', async () => {
  const data = { hello: '서무', n: [1, 2, 3] };
  const env = await encryptJSON(data, 'pw-1234', 1000);
  assert.deepEqual(await decryptJSON(env, 'pw-1234'), data);
  await assert.rejects(() => decryptJSON(env, 'wrong'));
});

test('UTC 저녁 시각은 한국 다음날로 계산', () => {
  assert.equal(kstDay('2026-10-20T16:30:00.000Z'), '2026-10-21');
  assert.equal(kstDay('2026-10-21T09:00:00.000+09:00'), '2026-10-21');
  assert.equal(shortDate('2026-10-21'), '10/21(수)');
});

test('수합·제출을 따로 판정하고 수합 완료면 수합은 뺀다', () => {
  const a = t({ collect: { start: '2026-10-19' }, due: { start: '2026-10-22' } });
  const evs = eventsOf(a, NOW);
  assert.deepEqual(evs.map((e) => [e.kind, e.diff]), [['collect', -1], ['due', 2]]);
  const b = t({ ...a, collectDone: true });
  assert.deepEqual(eventsOf(b, NOW).map((e) => e.kind), ['due']);
});

test('오늘 지난 시각은 시각경과, 남은 시각은 D-DAY', () => {
  const past = eventsOf(t({ due: { start: '2026-10-20T09:00:00.000+09:00' } }), NOW)[0];
  const later = eventsOf(t({ due: { start: '2026-10-20T14:00:00.000+09:00' } }), NOW)[0];
  assert.equal(ddayLabel(past), '시각경과');
  assert.equal(ddayLabel(later), 'D-DAY');
  assert.equal(later.time, '14:00');
});

test('기간 기한은 끝나는 날 기준, 기간 중 표시', () => {
  const e = eventsOf(t({ due: { start: '2026-10-15', end: '2026-10-23' } }), NOW)[0];
  assert.equal(e.diff, 3);
  assert.equal(e.inRange, true);
});

test('요약 건수는 고유 업무 수로 센다', () => {
  const tasks = [
    t({ id: 'a', collect: { start: '2026-10-20' }, due: { start: '2026-10-20' } }),
    t({ id: 'b', due: { start: '2026-10-18' } }),
    t({ id: 'c', due: { start: '2026-10-25' } }),
    t({ id: 'd' }),
    t({ id: 'e', done: true, doneAt: '2026-10-20T00:30:00.000Z' }),
    t({ id: 'f', done: true, doneAt: '2026-10-01' }),
  ];
  const s = summarize(tasks, NOW);
  assert.equal(s.stats.open, 4);
  assert.equal(s.stats.today, 1);
  assert.equal(s.stats.overdue, 1);
  assert.equal(s.stats.week, 1);
  assert.equal(s.stats.doneWeek, 1);
  assert.equal(s.stats.doneToday, 1);
  assert.equal(s.undated.length, 1);
  assert.equal(s.events[0].task.id, 'b');
});

test('노션 응답 → 전광판 데이터 변환 (메모는 싣지 않음)', () => {
  const page = {
    id: 'p1',
    properties: {
      '할 일': { type: 'title', title: [{ plain_text: '위원회 명단 ' }, { plain_text: '제출' }] },
      수합일: { type: 'date', date: { start: '2026-10-21', end: null } },
      제출마감일: { type: 'date', date: null },
      '수합 완료': { type: 'checkbox', checkbox: false },
      완료: { type: 'checkbox', checkbox: false },
      완료일: { type: 'date', date: null },
      중요도: { type: 'select', select: { name: '상' } },
      업무유형: { type: 'select', select: { name: '수합·제출' } },
      제출방법: { type: 'multi_select', multi_select: [{ name: '공문' }] },
      반복: { type: 'select', select: null },
      미제출: { type: 'rich_text', rich_text: [{ plain_text: '기업지원팀' }] },
      메모: { type: 'rich_text', rich_text: [{ plain_text: '비공개 메모' }] },
    },
  };
  const task = toTask(page);
  assert.equal(task.title, '위원회 명단 제출');
  assert.deepEqual(task.collect, { start: '2026-10-21', end: null });
  assert.equal(task.due, null);
  assert.equal(task.importance, '상');
  assert.equal(task.pending, '기업지원팀');
  assert.ok(!JSON.stringify(task).includes('비공개 메모'));
  const payload = buildPayload([page, { ...page, id: 'gone', in_trash: true }], NOW);
  assert.equal(payload.tasks.length, 1);
});
