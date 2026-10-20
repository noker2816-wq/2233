// 노션 "할 일 메모" DB를 읽어서 전광판용 데이터로 줄이고 암호화해 저장한다.
// 필요한 환경변수: NOTION_TOKEN, BOARD_PASSWORD (GitHub Actions 시크릿)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encryptJSON } from '../site/crypto.js';

const API = 'https://api.notion.com/v1';
const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID || 'd77d6e6b-1df9-4ab8-b3b6-2136d994db7f';
const DATABASE_ID = process.env.NOTION_DATABASE_ID || 'cb70a80b-15fb-40df-b09e-1137905447dd';
const OUT = process.env.OUT || 'site/data.enc.json';
const DONE_LOOKBACK_DAYS = 7;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function notion(path, body, version, token) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': version,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1500 * attempt;
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    const err = new Error(`Notion API ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
}

function lookbackDate(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

// 새 API(data source)를 먼저 쓰고, 안 되면 예전 database 쿼리로 내려간다.
async function queryAll(token) {
  const filter = {
    or: [
      { property: '완료', checkbox: { equals: false } },
      { property: '완료일', date: { on_or_after: lookbackDate(DONE_LOOKBACK_DAYS) } },
    ],
  };
  const routes = [
    { path: `/data_sources/${DATA_SOURCE_ID}/query`, version: '2025-09-03' },
    { path: `/databases/${DATABASE_ID}/query`, version: '2022-06-28' },
  ];
  let lastErr;
  for (const route of routes) {
    try {
      const pages = [];
      let cursor;
      do {
        const body = { filter, page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const data = await notion(route.path, body, route.version, token);
        pages.push(...data.results);
        cursor = data.has_more ? data.next_cursor : undefined;
      } while (cursor);
      return pages;
    } catch (e) {
      lastErr = e;
      if (e.status !== 400 && e.status !== 404) throw e;
      console.log(`${route.path} 실패(${e.status}), 다음 방식 시도`);
    }
  }
  throw lastErr;
}

const plain = (arr) => (arr || []).map((t) => t.plain_text).join('').trim();

function prop(page, name) {
  return page.properties ? page.properties[name] : undefined;
}

function dateOf(p) {
  if (!p || p.type !== 'date' || !p.date) return null;
  return { start: p.date.start, end: p.date.end || null };
}

export function toTask(page) {
  const title = plain(prop(page, '할 일')?.title);
  return {
    id: page.id,
    title: title || '(제목 없음)',
    collect: dateOf(prop(page, '수합일')),
    due: dateOf(prop(page, '제출마감일')),
    collectDone: Boolean(prop(page, '수합 완료')?.checkbox),
    done: Boolean(prop(page, '완료')?.checkbox),
    doneAt: dateOf(prop(page, '완료일'))?.start || null,
    importance: prop(page, '중요도')?.select?.name || null,
    type: prop(page, '업무유형')?.select?.name || null,
    methods: (prop(page, '제출방법')?.multi_select || []).map((o) => o.name),
    repeat: prop(page, '반복')?.select?.name || null,
    pending: plain(prop(page, '미제출')?.rich_text).slice(0, 120) || null,
  };
}

export function buildPayload(pages, now = new Date()) {
  const tasks = pages
    .filter((p) => !p.archived && !p.in_trash)
    .map(toTask)
    .filter((t) => t.title !== '(제목 없음)' || t.collect || t.due);
  return { generatedAt: now.toISOString(), tasks };
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  const password = process.env.BOARD_PASSWORD;
  if (!token || !password) {
    console.log('::warning::NOTION_TOKEN 또는 BOARD_PASSWORD 시크릿이 없어 데이터 없이 배포합니다.');
    return;
  }
  const pages = await queryAll(token);
  const payload = buildPayload(pages);
  const envelope = await encryptJSON(payload, password);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(envelope));
  const open = payload.tasks.filter((t) => !t.done).length;
  console.log(`동기화 완료: 전체 ${payload.tasks.length}건 (남은 일 ${open}건) → ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
