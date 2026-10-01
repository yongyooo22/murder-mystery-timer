import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createApp } from './app.mjs';
import { openStore } from './store.mjs';

const validInput = {
  name: '저택의 밤',
  stages: [
    { id: 'a1', name: '사건 소개', durationSec: 300 },
    { id: 'a2', name: '1차 조사', durationSec: 1200 },
  ],
};

async function startServer({ now, staticDir } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-api-'));
  const file = path.join(dir, 'data', 'scenarios.json');
  const store = await openStore({ file, retentionDays: 30, now });
  const server = http.createServer(createApp({ store, staticDir: staticDir ?? path.join(dir, 'dist'), retentionDays: 30 }));
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
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('scenarios API', () => {
  let ctx;
  beforeEach(async () => {
    if (ctx) await ctx.close();
    ctx = await startServer();
  });
  after(async () => ctx?.close());

  test('health and empty list', async () => {
    assert.deepEqual((await ctx.call('GET', '/api/health')).body, { ok: true });
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
    const reopened = await openStore({ file: ctx.file, retentionDays: 30 });
    assert.deepEqual(reopened.get(item.id), item);
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

describe('trash retention', () => {
  test('items deleted longer ago than the retention period are purged', async () => {
    let clock = Date.parse('2026-01-01T00:00:00Z');
    const ctx = await startServer({ now: () => clock });
    try {
      const { item } = (await ctx.call('POST', '/api/scenarios', validInput)).body;
      await ctx.call('DELETE', `/api/scenarios/${item.id}`);
      clock += 29 * 24 * 60 * 60 * 1000;
      assert.equal((await ctx.call('GET', '/api/trash')).body.items.length, 1);
      clock += 2 * 24 * 60 * 60 * 1000;
      assert.equal((await ctx.call('GET', '/api/trash')).body.items.length, 0);
      assert.equal(ctx.store.get(item.id), null);
    } finally {
      await ctx.close();
    }
  });
});

describe('store write failures', () => {
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

describe('static files', () => {
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
