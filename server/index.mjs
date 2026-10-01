import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
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

const store = await openStore({ file: config.dataFile, retentionDays: config.retentionDays });
const server = http.createServer(createApp({ store, ...config }));

server.listen(config.port, config.host, () => {
  console.log(`[server] http://localhost:${config.port} (데이터: ${config.dataFile})`);
});

async function shutdown(signal) {
  console.log(`[server] ${signal} 받음, 종료합니다.`);
  server.close();
  await store.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
