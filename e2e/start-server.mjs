// E2E 테스트용 서버: 매번 빈 데이터 폴더로 시작한다.
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-results/e2e-data');
await rm(dataDir, { recursive: true, force: true });
process.env.DATA_DIR = dataDir;
await import('../server/index.mjs');
