/**
 * 테스트용 Upstash REST 호환 서버(POST / 와 POST /pipeline, Bearer 토큰). 실제 Upstash에는 연결하지 않는다.
 *
 * - backend 'memory': 이 앱이 쓰는 Redis 명령을 메모리에서 흉내 낸다. EVAL은 이 앱의 WRITE_SCRIPT만,
 *   같은 동작의 JavaScript로 실행한다(redis-server가 없는 환경에서도 저장소 로직을 검사하기 위한 것).
 * - backend 'redis': 로컬 redis-server를 임시 폴더·유닉스 소켓으로 띄워, 실제 Redis가 실제 Lua 스크립트를 실행한다.
 *   redis-server가 설치된 환경에서만 쓸 수 있다(redisServerAvailable()).
 */
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WRITE_SCRIPT } from '../redis-store.mjs';

/** Redis가 돌려준 오류 응답(-ERR …) */
class RedisReplyError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function redisServerAvailable() {
  return spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;
}

/* ---------- 메모리 흉내 ---------- */

function createMemoryBackend() {
  /** @type {Map<string, { type: 'string', value: string } | { type: 'hash', value: Map<string, string> }>} */
  const db = new Map();
  const wrongType = () => new RedisReplyError('WRONGTYPE Operation against a key holding the wrong kind of value');

  /** @returns {Map<string, string> | null} */
  function hash(key, create) {
    const entry = db.get(key);
    if (!entry) {
      if (!create) return null;
      const value = new Map();
      db.set(key, { type: 'hash', value });
      return value;
    }
    if (entry.type !== 'hash') throw wrongType();
    return entry.value;
  }

  const commands = {
    PING: () => 'PONG',
    GET: (key) => {
      const entry = db.get(key);
      if (!entry) return null;
      if (entry.type !== 'string') throw wrongType();
      return entry.value;
    },
    SET: (key, value) => {
      db.set(key, { type: 'string', value });
      return 'OK';
    },
    HGET: (key, field) => hash(key, false)?.get(field) ?? null,
    HSET: (key, ...pairs) => {
      const h = hash(key, true);
      let added = 0;
      for (let i = 0; i + 1 < pairs.length; i += 2) {
        if (!h.has(pairs[i])) added++;
        h.set(pairs[i], pairs[i + 1]);
      }
      return added;
    },
    HDEL: (key, ...fields) => {
      const h = hash(key, false);
      if (!h) return 0;
      let removed = 0;
      for (const field of fields) if (h.delete(field)) removed++;
      // 실제 Redis처럼 비어 버린 해시는 키째 사라진다.
      if (h.size === 0) db.delete(key);
      return removed;
    },
    HGETALL: (key) => [...(hash(key, false) ?? new Map())].flat(),
    HLEN: (key) => hash(key, false)?.size ?? 0,
    KEYS: (pattern) => {
      if (pattern !== '*') throw new RedisReplyError('ERR test fake supports KEYS * only');
      return [...db.keys()];
    },
    // WRITE_SCRIPT와 같은 동작(테스트 대역에서는 Lua 대신 JavaScript로 실행)
    EVAL: (script, numkeys, ...rest) => {
      if (script !== WRITE_SCRIPT) throw new RedisReplyError('ERR test fake runs only WRITE_SCRIPT');
      const count = Number(numkeys);
      const [listKey, trashKey] = rest.slice(0, count);
      const [id, expected, target, json, limitText] = rest.slice(count);
      const current = commands.HGET(listKey, id) ?? commands.HGET(trashKey, id) ?? '';
      if (current !== expected) return 0;
      const limit = Number(limitText);
      if (current === '' && limit > 0 && commands.HLEN(listKey) + commands.HLEN(trashKey) >= limit) return -1;
      commands.HDEL(listKey, id);
      commands.HDEL(trashKey, id);
      if (target === 'scenarios') commands.HSET(listKey, id, json);
      else if (target === 'trash') commands.HSET(trashKey, id, json);
      return 1;
    },
  };

  return {
    async execute(args) {
      const [name, ...rest] = args.map(String);
      const run = commands[name.toUpperCase()];
      if (!run) throw new RedisReplyError(`ERR unknown command '${name}' (test fake)`);
      return run(...rest);
    },
    async close() {},
  };
}

/* ---------- 실제 redis-server ---------- */

/** RESP2 응답 하나를 읽는다. 아직 다 받지 못했으면 null */
function parseReply(buf, start) {
  const lineEnd = buf.indexOf('\r\n', start);
  if (lineEnd === -1) return null;
  const type = String.fromCharCode(buf[start]);
  const line = buf.toString('utf8', start + 1, lineEnd);
  const next = lineEnd + 2;
  switch (type) {
    case '+':
      return { value: line, end: next };
    case '-':
      return { error: line, end: next };
    case ':':
      return { value: Number(line), end: next };
    case '$': {
      const length = Number(line);
      if (length === -1) return { value: null, end: next };
      if (buf.length < next + length + 2) return null;
      return { value: buf.toString('utf8', next, next + length), end: next + length + 2 };
    }
    case '*': {
      const count = Number(line);
      if (count === -1) return { value: null, end: next };
      const items = [];
      let position = next;
      for (let i = 0; i < count; i++) {
        const item = parseReply(buf, position);
        if (!item) return null;
        items.push(item.value);
        position = item.end;
      }
      return { value: items, end: position };
    }
    default:
      throw new Error(`알 수 없는 RESP 응답: ${type}`);
  }
}

async function createRedisServerBackend() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mt-redis-'));
  const socketPath = path.join(dir, 'redis.sock');
  const child = spawn(
    'redis-server',
    ['--port', '0', '--unixsocket', socketPath, '--unixsocketperm', '700', '--save', '', '--appendonly', 'no', '--dir', dir],
    { stdio: 'ignore' },
  );
  // 테스트 프로세스가 어떤 이유로 끝나든 임시 redis-server를 남기지 않는다.
  const stopChild = () => child.kill();
  process.once('exit', stopChild);
  for (let i = 0; i < 200; i++) {
    if (await fs.stat(socketPath).catch(() => null)) break;
    await sleep(25);
  }
  const connection = net.createConnection(socketPath);
  await once(connection, 'connect');

  // 한 연결에서 Redis는 받은 순서대로 응답하므로, 기다리는 요청을 순서대로 꺼내 맞춘다.
  const waiting = [];
  let buffer = Buffer.alloc(0);
  connection.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const reply = parseReply(buffer, 0);
      if (!reply) break;
      buffer = buffer.subarray(reply.end);
      const waiter = waiting.shift();
      if (reply.error !== undefined) waiter.reject(new RedisReplyError(reply.error));
      else waiter.resolve(reply.value);
    }
  });

  return {
    execute(args) {
      const parts = [`*${args.length}\r\n`];
      for (const arg of args) {
        const text = String(arg);
        parts.push(`$${Buffer.byteLength(text)}\r\n${text}\r\n`);
      }
      return new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
        connection.write(parts.join(''));
      });
    },
    async close() {
      process.removeListener('exit', stopChild);
      connection.destroy();
      child.kill();
      await once(child, 'exit').catch(() => {});
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/* ---------- Upstash REST 흉내 HTTP 서버 ---------- */

async function readText(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {{ backend?: 'memory' | 'redis', token?: string }} [options]
 */
export async function startUpstashTestServer({ backend = 'memory', token = 'test-token' } = {}) {
  const redis = backend === 'redis' ? await createRedisServerBackend() : createMemoryBackend();

  const run = async (args) => {
    try {
      return { result: await redis.execute(args) };
    } catch (error) {
      if (error instanceof RedisReplyError) return { error: error.message };
      throw error;
    }
  };

  const server = http.createServer(async (req, res) => {
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'Unauthorized' });
    let body;
    try {
      body = JSON.parse(await readText(req));
    } catch {
      return send(400, { error: 'ERR failed to parse command' });
    }
    if (req.url === '/pipeline') {
      const results = [];
      for (const command of body) results.push(await run(command));
      return send(200, results);
    }
    const result = await run(body);
    return send('error' in result ? 400 : 200, result);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    backend,
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    /** 테스트에서 HTTP를 거치지 않고 직접 명령을 실행한다(다른 앱 데이터 심기·검사용). */
    execute: (args) => redis.execute(args),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await redis.close();
    },
  };
}
