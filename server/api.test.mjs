import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createApp } from './app.mjs';
import { REDIS_ENV_NAMES, createRestClient, resolveRedisConfig } from './redis.mjs';
import { KEY_PREFIX, openRedisStore, redisKeys, unconfiguredStore } from './redis-store.mjs';
import { openStore } from './store.mjs';
import { redisServerAvailable, startUpstashTestServer } from './testing/upstash-test-server.mjs';

/*
 * 같은 API 테스트를 세 저장소로 실행한다.
 * - file: 로컬 파일 저장소(store.mjs)
 * - redis-memory: Redis 저장소 + 메모리 Upstash 대역
 * - redis-server: Redis 저장소 + 실제 redis-server(실제 Lua 스크립트). redis-server가 없으면 건너뛴다.
 * Redis 테스트는 서버(start)마다 다른 키 접두사를 써서 서로 섞이지 않게 한다(실제 앱은 KEY_PREFIX로 고정).
 */
const HAS_REDIS_SERVER = redisServerAvailable();
const backends = {
  'redis-memory': await startUpstashTestServer({ backend: 'memory' }),
  'redis-server': HAS_REDIS_SERVER ? await startUpstashTestServer({ backend: 'redis' }) : null,
};
after(async () => {
  for (const backend of Object.values(backends)) await backend?.close();
});

const KINDS = ['file', 'redis-memory', 'redis-server'];
const REDIS_KINDS = ['redis-memory', 'redis-server'];
/** describe 옵션: redis-server가 없으면 건너뛴다. */
const kindOptions = (kind) => ({ skip: kind === 'redis-server' && !HAS_REDIS_SERVER && 'redis-server가 설치되어 있지 않아 건너뜀' });

const validInput = {
  name: '저택의 밤',
  stages: [
    { id: 'a1', name: '사건 소개', durationSec: 300 },
    { id: 'a2', name: '1차 조사', durationSec: 1200 },
  ],
};

/**
 * @param {{
 *   now?: () => number, staticDir?: string, kind?: string, backend?: object,
 *   prefix?: string, maxItems?: number, store?: object, listener?: (handle: Function) => http.RequestListener,
 * }} [options]
 */
async function startServer({ now, staticDir, kind = 'file', backend, prefix, maxItems, store: givenStore, listener } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-api-'));
  const file = path.join(dir, 'data', 'scenarios.json');
  const redisBackend = kind === 'file' ? null : (backend ?? backends[kind]);
  const keyPrefix = prefix ?? `mmt-test-${randomUUID()}`;
  const client = redisBackend ? createRestClient({ url: redisBackend.url, token: redisBackend.token }) : null;
  const open = () =>
    client
      ? openRedisStore({ client, retentionDays: 30, now, prefix: keyPrefix, maxItems })
      : openStore({ file, retentionDays: 30, now });
  const store = givenStore ?? (await open());
  const handle = createApp({ store, staticDir: staticDir ?? path.join(dir, 'dist'), retentionDays: 30 });
  const server = http.createServer(listener ? listener(handle) : handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return {
    dir,
    file,
    store,
    base,
    call,
    keys: redisKeys(keyPrefix),
    backend: redisBackend,
    /** 같은 데이터를 새 저장소 인스턴스로 다시 연다(재시작·다른 서버리스 인스턴스 흉내). */
    reopen: open,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

for (const kind of KINDS) describe(`scenarios API · ${kind}`, kindOptions(kind), () => {
  let ctx;
  beforeEach(async () => {
    if (ctx) await ctx.close();
    ctx = await startServer({ kind });
  });
  after(async () => ctx?.close());

  test('health and empty list', async () => {
    const health = await ctx.call('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { ok: true, storage: kind === 'file' ? 'file' : 'redis' });
    const list = await ctx.call('GET', '/api/scenarios');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.items, []);
    assert.equal(list.body.retentionDays, 30);
  });

  test('create keeps valid stage ids and starts at rev 1', async () => {
    const res = await ctx.call('POST', '/api/scenarios', validInput);
    assert.equal(res.status, 201);
    assert.equal(res.body.item.rev, 1);
    assert.equal(res.body.item.deletedAt, null);
    assert.deepEqual(
      res.body.item.stages.map((s) => s.id),
      ['a1', 'a2'],
    );
    const list = await ctx.call('GET', '/api/scenarios');
    assert.equal(list.body.items.length, 1);
  });

  test('create trims names and replaces duplicate or invalid stage ids', async () => {
    const res = await ctx.call('POST', '/api/scenarios', {
      name: '  이름\n ',
      stages: [
        { id: 'same', name: ' 하나 ', durationSec: 60 },
        { id: 'same', name: '둘', durationSec: 60 },
        { id: '../bad', name: '셋', durationSec: 60 },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.item.name, '이름');
    assert.equal(res.body.item.stages[0].name, '하나');
    const ids = res.body.item.stages.map((s) => s.id);
    assert.equal(new Set(ids).size, 3);
    assert.equal(ids[0], 'same');
    assert.notEqual(ids[2], '../bad');
  });

  test('create rejects invalid input with field errors', async () => {
    const res = await ctx.call('POST', '/api/scenarios', {
      name: '   ',
      stages: [
        { name: '', durationSec: 60 },
        { name: '시간 없음', durationSec: 0 },
        { name: '소수', durationSec: 1.5 },
        { name: '너무 김', durationSec: 999 * 60 + 60 },
      ],
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation');
    const { fields } = res.body.error;
    assert.ok(fields.name);
    assert.ok(fields['stages.0.name']);
    assert.ok(fields['stages.1.durationSec']);
    assert.ok(fields['stages.2.durationSec']);
    assert.ok(fields['stages.3.durationSec']);

    const empty = await ctx.call('POST', '/api/scenarios', { name: '빈 시나리오', stages: [] });
    assert.equal(empty.status, 400);
    assert.ok(empty.body.error.fields.stages);

    const longName = await ctx.call('POST', '/api/scenarios', { ...validInput, name: '가'.repeat(61) });
    assert.equal(longName.status, 400);
    assert.ok(longName.body.error.fields.name);
  });

  test('update requires the current rev and reports conflicts with the server copy', async () => {
    const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;
    const ok = await ctx.call('PUT', `/api/scenarios/${item.id}`, { ...validInput, name: '수정됨', rev: 1 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.item.rev, 2);
    assert.equal(ok.body.item.name, '수정됨');

    const stale = await ctx.call('PUT', `/api/scenarios/${item.id}`, { ...validInput, name: '늦은 수정', rev: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'conflict');
    assert.equal(stale.body.item.name, '수정됨');
    assert.equal(stale.body.item.rev, 2);

    const missingRev = await ctx.call('PUT', `/api/scenarios/${item.id}`, validInput);
    assert.equal(missingRev.status, 400);

    const missing = await ctx.call('PUT', '/api/scenarios/nope', { ...validInput, rev: 1 });
    assert.equal(missing.status, 404);
  });

  test('rename and duplicate', async () => {
    const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;
    const renamed = await ctx.call('PATCH', `/api/scenarios/${item.id}`, { name: '새 이름' });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.item.name, '새 이름');
    assert.equal(renamed.body.item.rev, 2);

    const badRename = await ctx.call('PATCH', `/api/scenarios/${item.id}`, { name: '' });
    assert.equal(badRename.status, 400);

    const copy = await ctx.call('POST', `/api/scenarios/${item.id}/duplicate`);
    assert.equal(copy.status, 201);
    assert.equal(copy.body.item.name, '새 이름 (복사본)');
    assert.notEqual(copy.body.item.id, item.id);
    assert.equal(copy.body.item.stages.length, 2);
    assert.notDeepEqual(
      copy.body.item.stages.map((s) => s.id),
      item.stages.map((s) => s.id),
    );
  });

  test('duplicate keeps the name within the length limit', async () => {
    const { item } = (await ctx.call('POST', '/api/scenarios', { ...validInput, name: '가'.repeat(60) })).body;
    const copy = await ctx.call('POST', `/api/scenarios/${item.id}/duplicate`);
    assert.equal(copy.status, 201);
    assert.equal([...copy.body.item.name].length, 60);
    assert.ok(copy.body.item.name.endsWith(' (복사본)'));
  });

  test('trash, restore and permanent delete', async () => {
    const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;

    const trashed = await ctx.call('DELETE', `/api/scenarios/${item.id}`);
    assert.equal(trashed.status, 200);
    assert.ok(trashed.body.item.deletedAt);
    assert.equal((await ctx.call('GET', '/api/scenarios')).body.items.length, 0);
    assert.equal((await ctx.call('GET', '/api/trash')).body.items.length, 1);

    const editTrashed = await ctx.call('PUT', `/api/scenarios/${item.id}`, { ...validInput, rev: trashed.body.item.rev });
    assert.equal(editTrashed.status, 409);
    assert.equal(editTrashed.body.error.code, 'trashed');

    const restored = await ctx.call('POST', `/api/trash/${item.id}/restore`);
    assert.equal(restored.status, 200);
    assert.equal(restored.body.item.deletedAt, null);
    assert.equal((await ctx.call('GET', '/api/scenarios')).body.items.length, 1);

    const purgeActive = await ctx.call('DELETE', `/api/trash/${item.id}`);
    assert.equal(purgeActive.status, 409);
    assert.equal(purgeActive.body.error.code, 'not_in_trash');

    await ctx.call('DELETE', `/api/scenarios/${item.id}`);
    const purged = await ctx.call('DELETE', `/api/trash/${item.id}`);
    assert.equal(purged.status, 204);
    assert.equal((await ctx.call('GET', '/api/trash')).body.items.length, 0);
    assert.equal((await ctx.call('DELETE', `/api/trash/${item.id}`)).status, 404);
  });

  test('data survives a restart', async () => {
    const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;
    const reopened = await ctx.reopen();
    assert.deepEqual(await reopened.get(item.id), item);
    assert.deepEqual(await reopened.listActive(), [item]);
  });

  test('unknown routes, wrong methods, bad bodies', async () => {
    assert.equal((await ctx.call('GET', '/api/unknown')).status, 404);
    const wrong = await ctx.call('PUT', '/api/scenarios');
    assert.equal(wrong.status, 405);
    assert.match(wrong.headers.get('allow'), /GET/);
    assert.equal((await ctx.call('POST', '/api/scenarios', '{bad json')).status, 400);
    const huge = await ctx.call('POST', '/api/scenarios', JSON.stringify({ name: 'x'.repeat(300 * 1024) }));
    assert.equal(huge.status, 413);
  });
});

for (const kind of KINDS) describe(`trash retention · ${kind}`, kindOptions(kind), () => {
  test('items deleted longer ago than the retention period are purged', async () => {
    let clock = Date.parse('2026-01-01T00:00:00Z');
    const ctx = await startServer({ kind, now: () => clock });
    try {
      const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;
      await ctx.call('DELETE', `/api/scenarios/${item.id}`);
      clock += 29 * 24 * 60 * 60 * 1000;
      assert.equal((await ctx.call('GET', '/api/trash')).body.items.length, 1);
      clock += 2 * 24 * 60 * 60 * 1000;
      assert.equal((await ctx.call('GET', '/api/trash')).body.items.length, 0);
      assert.equal(await ctx.store.get(item.id), null);
    } finally {
      await ctx.close();
    }
  });
});

describe('store write failures · file', () => {
  test('a failed write rolls the change back', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-store-'));
    const file = path.join(dir, 'sub', 'scenarios.json');
    const store = await openStore({ file, retentionDays: 30 });
    await store.create(validInput);
    await fs.rm(path.join(dir, 'sub'), { recursive: true });
    await assert.rejects(store.create(validInput));
    assert.equal(store.listActive().length, 1);
  });
});

describe('static files · file', () => {
  let ctx;
  before(async () => {
    const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-static-'));
    await fs.mkdir(path.join(staticDir, 'assets'));
    await fs.writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>t</title>');
    await fs.writeFile(path.join(staticDir, 'assets', 'app-123.js'), 'console.log(1)');
    ctx = await startServer({ staticDir });
  });
  after(async () => ctx.close());

  test('serves index and hashed assets with cache headers', async () => {
    const index = await fetch(ctx.base + '/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.equal(index.headers.get('cache-control'), 'no-cache');

    const asset = await fetch(ctx.base + '/assets/app-123.js');
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('cache-control'), /immutable/);

    assert.equal((await fetch(ctx.base + '/missing.js')).status, 404);
  });

  test('blocks path traversal', async () => {
    // fetch는 경로를 정규화하므로 원본 경로 그대로 보내기 위해 http.request를 쓴다.
    const { status, body } = await new Promise((resolve, reject) => {
      const req = http.request(`${ctx.base}/..%2f..%2f..%2fetc%2fpasswd`, (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: text }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
    assert.doesNotMatch(body, /root:/);
  });
});

for (const kind of KINDS) describe(`malformed requests · ${kind}`, kindOptions(kind), () => {
  let ctx;
  before(async () => {
    if (kind === 'redis-server' && !HAS_REDIS_SERVER) return;
    ctx = await startServer({ kind });
  });
  after(async () => ctx?.close());

  test('bad path encoding and non-object bodies return 400', async () => {
    const badPath = await new Promise((resolve, reject) => {
      const req = http.request(`${ctx.base}/api/scenarios/%E0%A4%A`, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(badPath, 400);
    const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;
    assert.equal((await ctx.call('PATCH', `/api/scenarios/${item.id}`, 'null')).status, 400);
    assert.equal((await ctx.call('POST', '/api/scenarios', '[1,2]')).status, 400);
  });
});

describe('store consistency · file', () => {
  test('a write that fails is never visible to readers', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-store-'));
    const file = path.join(dir, 'sub', 'scenarios.json');
    const store = await openStore({ file, retentionDays: 30 });
    await fs.rm(path.join(dir, 'sub'), { recursive: true });
    const pending = store.create(validInput);
    assert.equal(store.listActive().length, 0);
    await assert.rejects(pending);
    assert.equal(store.listActive().length, 0);
  });
});

describe('static file errors · file', () => {
  test('a file that cannot be opened does not crash the server', { timeout: 10_000 }, async () => {
    const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-static-'));
    await fs.writeFile(path.join(staticDir, 'index.html'), '<!doctype html>');
    // 소켓 파일은 stat은 통과하지만 열 때 실패한다(파일이 확인 직후 사라진 경우와 같은 상황).
    const socketServer = net.createServer();
    await new Promise((resolve) => socketServer.listen(path.join(staticDir, 'broken.js'), resolve));
    const ctx = await startServer({ staticDir });
    try {
      await fetch(`${ctx.base}/broken.js`).catch(() => null);
      assert.equal((await fetch(`${ctx.base}/api/health`)).status, 200);
    } finally {
      await ctx.close();
      socketServer.close();
    }
  });
});

/* ---------- Redis 저장소 전용 검사 ---------- */

const DAY = 24 * 60 * 60 * 1000;

/** 처리기 하나를 임시 HTTP 서버로 띄운다. */
async function serve(listener) {
  const server = http.createServer(listener);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    call: async (method, url, body) => {
      const res = await fetch(base + url, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: res.status, body: parsed };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** console.error로 남기는 예상된 오류 기록을 테스트 출력에서 감춘다. */
async function quietly(run) {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

describe('Redis 연결 환경 변수', () => {
  test('KV_REST_API_* 를 먼저, 없으면 UPSTASH_REDIS_REST_* 를 쓰고, 앱 이름을 붙인 변수는 쓰지 않는다', () => {
    assert.deepEqual(resolveRedisConfig({ KV_REST_API_URL: 'https://a.upstash.io/', KV_REST_API_TOKEN: 't1' }), {
      url: 'https://a.upstash.io',
      token: 't1',
      source: 'KV_REST_API_URL, KV_REST_API_TOKEN',
    });
    assert.deepEqual(
      resolveRedisConfig({ UPSTASH_REDIS_REST_URL: 'https://b.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't2' }),
      { url: 'https://b.upstash.io', token: 't2', source: 'UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN' },
    );
    // 둘 다 있으면 Vercel Storage가 넣어 주는 KV_* 를 쓴다.
    const both = resolveRedisConfig({
      KV_REST_API_URL: 'https://a.upstash.io',
      KV_REST_API_TOKEN: 't1',
      UPSTASH_REDIS_REST_URL: 'https://b.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 't2',
    });
    assert.equal(both.url, 'https://a.upstash.io');
    // 주소와 토큰은 같은 쌍에서만 가져온다.
    assert.equal(resolveRedisConfig({ KV_REST_API_URL: 'https://a.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't2' }), null);
    // 이름 앞에 앱 이름을 붙인 변수는 읽지 않는다.
    assert.equal(resolveRedisConfig({ MYAPP_KV_REST_API_URL: 'https://a.upstash.io', MYAPP_KV_REST_API_TOKEN: 't' }), null);
    assert.equal(resolveRedisConfig({ KV_REST_API_URL: '  ', KV_REST_API_TOKEN: 't' }), null);
    assert.equal(resolveRedisConfig({}), null);
    assert.deepEqual(REDIS_ENV_NAMES, [
      'KV_REST_API_URL',
      'KV_REST_API_TOKEN',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
    ]);
  });
});

for (const kind of REDIS_KINDS) describe(`Redis 키 격리 · ${kind}`, kindOptions(kind), () => {
  test('같은 DB의 다른 앱 키는 읽지도 바꾸지도 지우지도 않고, 이 앱은 접두사 아래 키만 쓴다', async () => {
    // 이 테스트만 쓰는 깨끗한 DB에서 실제 앱과 같은 접두사(KEY_PREFIX)로 검사한다.
    const backend = await startUpstashTestServer({ backend: kind === 'redis-server' ? 'redis' : 'memory' });
    let clock = Date.parse('2026-01-01T00:00:00Z');
    const ctx = await startServer({ kind, backend, prefix: KEY_PREFIX, now: () => clock });
    try {
      // 같은 Upstash DB를 쓰는 다른 두 앱의 데이터(이 앱 키와 이름이 비슷한 것 포함)
      const others = [
        ['SET', 'scenarios', '다른 앱 A의 값'],
        ['HSET', 'trash', 'x', '다른 앱 A의 휴지통'],
        ['HSET', 'other-app:scenarios', 'abc', '{"id":"abc"}'],
        ['SET', 'murder-mystery-timer', '접두사와 이름이 같은 다른 키'],
        ['HSET', 'murder-mystery-timer-v2:scenarios', 'id-1', '접두사가 비슷한 다른 앱'],
        ['SET', 'app-b:session:123', 'token'],
      ];
      for (const command of others) await backend.execute(command);
      const snapshot = async () => {
        const values = {};
        for (const [type, key] of others) values[key] = await backend.execute([type === 'SET' ? 'GET' : 'HGETALL', key]);
        return values;
      };
      const before = await snapshot();

      // 이 앱의 모든 저장 기능을 한 번씩 실행한다.
      const a = (await ctx.call('POST', '/api/scenarios', validInput)).body.item;
      const b = (await ctx.call('POST', '/api/scenarios', { ...validInput, name: '두 번째' })).body.item;
      assert.equal((await ctx.call('PUT', `/api/scenarios/${a.id}`, { ...validInput, name: '수정', rev: 1 })).status, 200);
      assert.equal((await ctx.call('PATCH', `/api/scenarios/${a.id}`, { name: '이름 변경' })).status, 200);
      const copy = (await ctx.call('POST', `/api/scenarios/${a.id}/duplicate`)).body.item;
      assert.equal((await ctx.call('DELETE', `/api/scenarios/${a.id}`)).status, 200);
      assert.equal((await ctx.call('POST', `/api/trash/${a.id}/restore`)).status, 200);
      assert.equal((await ctx.call('DELETE', `/api/scenarios/${b.id}`)).status, 200);
      assert.equal((await ctx.call('DELETE', `/api/trash/${b.id}`)).status, 204);
      assert.equal((await ctx.call('DELETE', `/api/scenarios/${copy.id}`)).status, 200);
      clock += 31 * DAY;
      assert.equal((await ctx.call('GET', '/api/trash')).body.items.length, 0); // 보관 기간이 지난 항목 정리
      assert.equal((await ctx.call('GET', '/api/scenarios')).body.items.length, 1);
      // 다른 키 이름을 흉내 낸 id로 요청해도 이 앱의 해시 필드로만 쓰인다.
      assert.equal((await ctx.call('GET', `/api/scenarios/${encodeURIComponent('../scenarios')}`)).status, 404);
      assert.equal((await ctx.call('DELETE', '/api/trash/x')).status, 404);

      // 다른 앱의 데이터는 그대로다.
      assert.deepEqual(await snapshot(), before);
      // DB 전체 키 = 다른 앱의 키 + 이 앱의 목록 해시 하나(휴지통은 비어 키가 사라짐)
      const keys = await backend.execute(['KEYS', '*']);
      assert.deepEqual(keys.sort(), [...others.map(([, key]) => key), `${KEY_PREFIX}:scenarios`].sort());
      const stored = await backend.execute(['HGETALL', `${KEY_PREFIX}:scenarios`]);
      assert.equal(stored[0], a.id);
      assert.equal(JSON.parse(stored[1]).name, '이름 변경');
    } finally {
      await ctx.close();
      await backend.close();
    }
  });
});

for (const kind of KINDS) describe(`동시 저장 · ${kind}`, kindOptions(kind), () => {
  test('여러 명이 동시에 저장해도 서로의 변경을 덮어쓰지 않는다', async () => {
    const ctx = await startServer({ kind });
    try {
      const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;

      // 이름 바꾸기 8건이 동시에 와도 모두 반영되고 버전이 8번 오른다.
      const names = Array.from({ length: 8 }, (_, i) => `동시 ${i + 1}`);
      const renames = await Promise.all(names.map((name) => ctx.call('PATCH', `/api/scenarios/${item.id}`, { name })));
      assert.deepEqual(
        renames.map((r) => r.status),
        names.map(() => 200),
      );
      assert.deepEqual(
        renames.map((r) => r.body.item.rev).sort((x, y) => x - y),
        [2, 3, 4, 5, 6, 7, 8, 9],
      );
      const latest = (await ctx.call('GET', `/api/scenarios/${item.id}`)).body.item;
      assert.equal(latest.rev, 9);
      assert.ok(names.includes(latest.name));
      assert.deepEqual(latest.stages, item.stages);

      // 같은 버전을 보고 6명이 동시에 편집을 저장하면 하나만 저장되고 나머지는 충돌(409)을 받는다.
      const edits = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          ctx.call('PUT', `/api/scenarios/${item.id}`, { ...validInput, name: `편집 ${i}`, rev: 9 }),
        ),
      );
      assert.equal(edits.filter((r) => r.status === 200).length, 1);
      assert.equal(edits.filter((r) => r.status === 409 && r.body.error.code === 'conflict').length, 5);
      assert.equal((await ctx.call('GET', `/api/scenarios/${item.id}`)).body.item.rev, 10);

      // 휴지통 이동과 복원이 겹쳐도 항목이 사라지거나 두 곳에 생기지 않는다.
      await Promise.all([
        ctx.call('DELETE', `/api/scenarios/${item.id}`),
        ctx.call('DELETE', `/api/scenarios/${item.id}`),
        ctx.call('POST', `/api/trash/${item.id}/restore`),
      ]);
      const active = (await ctx.call('GET', '/api/scenarios')).body.items.length;
      const trashed = (await ctx.call('GET', '/api/trash')).body.items.length;
      assert.equal(active + trashed, 1);
    } finally {
      await ctx.close();
    }
  });
});

for (const kind of REDIS_KINDS) describe(`개수 한도 · ${kind}`, kindOptions(kind), () => {
  test('동시에 만들어도 목록과 휴지통을 합친 한도를 넘지 않는다', async () => {
    const ctx = await startServer({ kind, maxItems: 3 });
    try {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => ctx.call('POST', '/api/scenarios', { ...validInput, name: `만들기 ${i}` })),
      );
      assert.equal(results.filter((r) => r.status === 201).length, 3);
      assert.equal(results.filter((r) => r.status === 409 && r.body.error.code === 'limit').length, 3);

      const first = results.find((r) => r.status === 201).body.item;
      await ctx.call('DELETE', `/api/scenarios/${first.id}`);
      // 휴지통에 있는 것도 한도에 포함된다.
      assert.equal((await ctx.call('POST', '/api/scenarios', validInput)).body.error.code, 'limit');
      assert.equal((await ctx.call('POST', `/api/trash/${first.id}/restore`)).status, 200);
      assert.equal((await ctx.call('POST', `/api/scenarios/${first.id}/duplicate`)).body.error.code, 'limit');
    } finally {
      await ctx.close();
    }
  });
});

describe('Vercel 요청 본문(req.body)', () => {
  test('Vercel처럼 본문을 미리 읽어 req.body로 넘겨도 똑같이 처리한다', async () => {
    // Vercel Node.js 함수의 도우미처럼: JSON 요청이면 본문을 미리 읽고 req.body를 읽을 때 해석한다.
    const vercelLike = (handle) => async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = req.headers['content-type'];
      if (type) {
        Object.defineProperty(req, 'body', {
          configurable: true,
          get() {
            if (!type.includes('application/json')) return raw;
            if (!raw) return {};
            try {
              return JSON.parse(raw);
            } catch {
              throw new Error('Invalid JSON');
            }
          },
        });
      }
      return handle(req, res);
    };
    const ctx = await startServer({ kind: 'redis-memory', listener: vercelLike });
    try {
      const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;
      assert.equal(item.rev, 1);
      const updated = await ctx.call('PUT', `/api/scenarios/${item.id}`, { ...validInput, name: '수정', rev: 1 });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.item.name, '수정');
      assert.equal((await ctx.call('PATCH', `/api/scenarios/${item.id}`, { name: '이름' })).status, 200);
      // 본문 없는 요청(Content-Type 없음)
      assert.equal((await ctx.call('POST', `/api/scenarios/${item.id}/duplicate`)).status, 201);
      assert.equal((await ctx.call('DELETE', `/api/scenarios/${item.id}`)).status, 200);
      // 잘못된 본문
      assert.equal((await ctx.call('POST', '/api/scenarios', '{bad json')).status, 400);
      assert.equal((await ctx.call('POST', '/api/scenarios', '[1,2]')).status, 400);
      assert.equal((await ctx.call('PATCH', `/api/scenarios/${item.id}`, 'null')).status, 400);
      const huge = await ctx.call('POST', '/api/scenarios', JSON.stringify({ name: 'x'.repeat(300 * 1024) }));
      assert.equal(huge.status, 413);
    } finally {
      await ctx.close();
    }
  });
});

describe('Redis 미설정·연결 실패', () => {
  test('연결 정보가 없으면 파일로 바꿔 저장하지 않고 모든 API가 설정 방법을 알려 주는 503을 돌려준다', async () => {
    const message = '서버 저장소(Upstash Redis)가 연결되지 않았어요. KV_REST_API_URL, KV_REST_API_TOKEN을 확인해 주세요.';
    const server = await serve(createApp({ store: unconfiguredStore(message), retentionDays: 30 }));
    try {
      for (const [method, url, body] of [
        ['GET', '/api/health'],
        ['GET', '/api/scenarios'],
        ['POST', '/api/scenarios', validInput],
        ['GET', '/api/trash'],
      ]) {
        const res = await server.call(method, url, body);
        assert.equal(res.status, 503, `${method} ${url}`);
        assert.equal(res.body.error.code, 'unavailable');
        assert.match(res.body.error.message, /KV_REST_API_URL/);
      }
      // 화면 파일 폴더가 없으면(Vercel) 화면은 제공하지 않는다.
      assert.equal((await server.call('GET', '/')).status, 404);
    } finally {
      await server.close();
    }
  });

  test('토큰이 틀리거나 Redis에 닿지 않으면 503으로 알린다', async () => {
    const backend = backends['redis-memory'];
    for (const client of [
      createRestClient({ url: backend.url, token: 'wrong-token' }),
      createRestClient({ url: 'http://127.0.0.1:9', token: 'x', timeoutMs: 2_000 }),
    ]) {
      const server = await serve(createApp({ store: openRedisStore({ client, retentionDays: 30 }), retentionDays: 30 }));
      try {
        await quietly(async () => {
          const list = await server.call('GET', '/api/scenarios');
          assert.equal(list.status, 503);
          assert.equal(list.body.error.code, 'storage_unavailable');
          assert.equal((await server.call('GET', '/api/health')).status, 503);
        });
      } finally {
        await server.close();
      }
    }
  });
});

describe('Vercel 함수(api/index.js)', () => {
  /** 환경 변수를 바꿔 함수 파일을 새로 불러온다(파일은 불러올 때 환경 변수를 읽는다). */
  async function loadFunction(env) {
    const saved = Object.fromEntries(REDIS_ENV_NAMES.map((name) => [name, process.env[name]]));
    for (const name of REDIS_ENV_NAMES) delete process.env[name];
    Object.assign(process.env, env);
    try {
      const url = new URL(`../api/index.js?case=${randomUUID()}`, import.meta.url);
      return (await import(url.href)).default;
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }

  test('KV_REST_API_URL·TOKEN의 Upstash에 이 앱 접두사로만 저장하고, 화면 파일은 제공하지 않는다', async () => {
    const backend = await startUpstashTestServer({ backend: 'memory' });
    const handler = await loadFunction({ KV_REST_API_URL: backend.url, KV_REST_API_TOKEN: backend.token });
    const server = await serve(handler);
    try {
      assert.deepEqual((await server.call('GET', '/api/health')).body, { ok: true, storage: 'redis' });
      const created = await server.call('POST', '/api/scenarios', validInput);
      assert.equal(created.status, 201);
      const list = await server.call('GET', '/api/scenarios');
      assert.deepEqual(
        list.body.items.map((it) => it.id),
        [created.body.item.id],
      );
      assert.deepEqual(await backend.execute(['KEYS', '*']), [`${KEY_PREFIX}:scenarios`]);
      assert.equal((await server.call('GET', '/')).status, 404);
    } finally {
      await server.close();
      await backend.close();
    }
  });

  test('UPSTASH_REDIS_REST_URL·TOKEN 이름도 쓸 수 있다', async () => {
    const backend = await startUpstashTestServer({ backend: 'memory' });
    const handler = await loadFunction({ UPSTASH_REDIS_REST_URL: backend.url, UPSTASH_REDIS_REST_TOKEN: backend.token });
    const server = await serve(handler);
    try {
      assert.equal((await server.call('POST', '/api/scenarios', validInput)).status, 201);
      assert.deepEqual(await backend.execute(['KEYS', '*']), [`${KEY_PREFIX}:scenarios`]);
    } finally {
      await server.close();
      await backend.close();
    }
  });

  test('환경 변수가 없으면 503으로 설정 방법을 알린다(로컬 파일에 저장하지 않음)', async () => {
    const handler = await loadFunction({});
    const server = await serve(handler);
    try {
      const health = await server.call('GET', '/api/health');
      assert.equal(health.status, 503);
      assert.match(health.body.error.message, /KV_REST_API_URL/);
      assert.equal((await server.call('POST', '/api/scenarios', validInput)).status, 503);
    } finally {
      await server.close();
    }
  });
});
