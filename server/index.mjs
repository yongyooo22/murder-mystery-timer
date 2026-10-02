import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { createRestClient, resolveRedisConfig } from './redis.mjs';
import { KEY_PREFIX, openRedisStore } from './redis-store.mjs';
import { openStore } from './store.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  dataFile: path.resolve(process.env.DATA_DIR ?? path.join(projectRoot, 'data'), 'scenarios.json'),
  staticDir: path.resolve(process.env.STATIC_DIR ?? path.join(projectRoot, 'dist')),
  retentionDays: Number(process.env.TRASH_RETENTION_DAYS ?? 30),
  corsOrigin: process.env.CORS_ORIGIN ?? '',
};

// Upstash Redis 환경 변수가 있으면 Redis에, 없으면 로컬 파일(data/scenarios.json)에 저장한다.
// (Vercel 배포는 이 파일이 아니라 api/index.js를 쓰며, 그곳에서는 Redis만 쓴다.)
const redis = resolveRedisConfig();
const store = redis
  ? openRedisStore({ client: createRestClient(redis), retentionDays: config.retentionDays })
  : await openStore({ file: config.dataFile, retentionDays: config.retentionDays });
const server = http.createServer(createApp({ store, ...config }));

server.listen(config.port, config.host, () => {
  const storage = redis
    ? `Upstash Redis(${redis.source}, 키 접두사 ${KEY_PREFIX}:)`
    : `파일 ${config.dataFile}`;
  console.log(`[server] http://localhost:${config.port} (저장소: ${storage})`);
});

async function shutdown(signal) {
  console.log(`[server] ${signal} 받음, 종료합니다.`);
  server.close();
  await store.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
