// 전광판(board.html)과 3D 마을(index.html)이 같이 쓰는 데이터·저장소 도우미.
import { kstToday } from './logic.js';

export const DATA_URL = 'data.enc.json';
export const PW_KEY = 'seomu-board-pw';

// 사생활 모드 등에서 저장소가 막혀도 동작하게 감싼다.
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

export async function fetchEnvelope() {
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (res.status === 404) { const e = new Error('no-data'); e.code = 'no-data'; throw e; }
  if (!res.ok) throw new Error(`데이터를 받지 못했습니다 (${res.status})`);
  return res.json();
}

// 예시 데이터 (가상의 업무, 오늘 기준 상대 날짜)
export function makeDemo() {
  const base = kstToday();
  const [y, m, d] = base.split('-').map(Number);
  const day = (n) => new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  const at = (n, hm) => `${day(n)}T${hm}:00.000+09:00`;
  let i = 0;
  const T = (o) => ({ id: `demo-${i++}`, collect: null, due: null, collectDone: false, done: false, doneAt: null, importance: '중', type: '수합·제출', methods: [], repeat: null, pending: null, ...o });
  return {
    generatedAt: new Date().toISOString(),
    tasks: [
      T({ title: '분기 위원회 운영현황 제출', collect: { start: day(-1) }, due: { start: day(1) }, importance: '중', repeat: '분기' }),
      T({ title: '부서 급여 변동사항 확인 및 통보', due: { start: at(0, '11:00') }, importance: '상', type: '급여·인사' }),
      T({ title: '정보공개청구 자료 회신', due: { start: day(0) }, importance: '상', type: '정보공개' }),
      T({ title: '하반기 업무계획 자료 수합', collect: { start: day(0) }, due: { start: day(2) }, pending: 'A팀, C팀' }),
      T({ title: '물품 정기 재물조사 결과 입력', due: { start: day(-15), end: day(3) }, importance: '상', type: '감사·점검' }),
      T({ title: '월간 구매실적 시스템 입력', due: { start: day(2) }, type: '수합·제출', repeat: '매월' }),
      T({ title: '카드 승인내역 등록', due: { start: day(3) }, type: '지출·회계' }),
      T({ title: '직원 단합행사 계획 제출', due: { start: day(5) }, type: '행사·차출' }),
      T({ title: '차년도 예산 협의자료 작성', collect: { start: day(6) }, due: { start: day(9) }, importance: '상', type: '지출·회계' }),
      T({ title: '구정 소식지 게재자료 제출', due: { start: day(8) } }),
      T({ title: '행사 지원인력 차출 명단 회신', due: { start: at(12, '14:00') }, type: '행사·차출' }),
      T({ title: '홈페이지 자료 일제 정비', due: { start: day(14) }, importance: '하', type: '공람·참고' }),
      T({ title: '연말 시설 안전점검 결과 제출', due: { start: day(20) }, importance: '상', type: '감사·점검' }),
      T({ title: '부서 비상연락망 현행화', importance: '하', type: '공람·참고' }),
      T({ title: '사무용품 수요조사', importance: '하' }),
      T({ title: '공공구매 실태조사표 제출', done: true, doneAt: at(0, '09:20') }),
      T({ title: '전기요금 지출 처리', done: true, doneAt: at(-1, '16:05'), type: '지출·회계' }),
      T({ title: '근무실적 입력', done: true, doneAt: at(-3, '10:40'), type: '급여·인사' }),
    ],
  };
}
