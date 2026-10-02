/**
 * Vercel 서버리스 함수: /api/* 요청을 모두 이 함수가 받는다(vercel.json의 rewrites).
 * 화면 파일(dist/)은 Vercel이 직접 제공하고, 이 함수는 API만 처리한다.
 *
 * 시나리오 목록·휴지통은 Upstash Redis에만 저장한다(키 접두사 murder-mystery-timer:).
 * 배포 환경에서는 로컬 파일(data/scenarios.json)을 쓰지 않는다. Redis 환경 변수가 없으면
 * 파일로 바꿔 저장하지 않고, 모든 API 요청에 설정 방법을 알려 주는 503 오류를 돌려준다.
 */
import { createApp } from '../server/app.mjs';
import { createRestClient, resolveRedisConfig } from '../server/redis.mjs';
import { openRedisStore, unconfiguredStore } from '../server/redis-store.mjs';

const retentionDays = Number(process.env.TRASH_RETENTION_DAYS ?? 30);
const redis = resolveRedisConfig();

// 함수 인스턴스가 살아 있는 동안 재사용한다. 저장소는 데이터를 메모리에 들고 있지 않으므로
// 인스턴스가 여러 개 떠도 모두 같은 Redis 데이터를 본다.
const store = redis
  ? openRedisStore({ client: createRestClient(redis), retentionDays })
  : unconfiguredStore(
      '서버 저장소(Upstash Redis)가 연결되지 않았어요. Vercel 프로젝트 환경 변수에 KV_REST_API_URL, KV_REST_API_TOKEN이 있는지 확인한 뒤 다시 배포해 주세요.',
    );

const handle = createApp({ store, retentionDays, corsOrigin: process.env.CORS_ORIGIN ?? '' });

export default function handler(req, res) {
  return handle(req, res);
}
