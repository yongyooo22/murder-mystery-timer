// E2E 테스트용 서버: 매번 빈 데이터 폴더로 시작한다.
// 테스트는 시작할 때마다 시나리오를 모두 지우므로, 셸에 Upstash Redis 환경 변수가 있어도 쓰지 않고
// 반드시 임시 파일 저장소로 띄운다(운영 Redis 데이터를 지우지 않게).
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REDIS_ENV_NAMES } from '../server/redis.mjs';

for (const name of REDIS_ENV_NAMES) delete process.env[name];

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-results/e2e-data');
await rm(dataDir, { recursive: true, force: true });
process.env.DATA_DIR = dataDir;
await import('../server/index.mjs');
