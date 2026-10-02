/**
 * Upstash Redis REST API 클라이언트(의존성 없음, fetch 사용).
 *
 * 연결 정보는 환경 변수에서 읽는다. 아래 두 쌍 중 하나만 있으면 된다(앞의 쌍을 먼저 쓴다).
 * - KV_REST_API_URL, KV_REST_API_TOKEN: Vercel Storage에서 Upstash Redis를 연결하면 들어오는 이름
 * - UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: Upstash 콘솔에서 직접 복사해 넣는 이름
 * 이름 앞에 앱 이름을 붙인 변수(예: MYAPP_KV_REST_API_URL)는 쓰지 않는다. 앱 구분은 Redis 키 접두사로 한다(redis-store.mjs).
 * 읽기 전용 토큰(KV_REST_API_READ_ONLY_TOKEN)은 쓰기가 필요해 쓰지 않는다.
 */

const ENV_PAIRS = [
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
];

/** Redis 연결 정보를 담는 환경 변수 이름 전체(테스트 서버가 실수로 운영 데이터를 쓰지 않게 지울 때도 쓴다). */
export const REDIS_ENV_NAMES = ENV_PAIRS.flat();

const DEFAULT_TIMEOUT_MS = 8_000;

/** Redis에 닿지 못했거나 Redis가 명령을 거절했을 때 */
export class RedisError extends Error {
  /** @param {string} message @param {{ cause?: unknown, status?: number }} [options] */
  constructor(message, { cause, status } = {}) {
    super(message, { cause });
    this.status = status;
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ url: string, token: string, source: string } | null} 설정이 없으면 null
 */
export function resolveRedisConfig(env = process.env) {
  for (const [urlName, tokenName] of ENV_PAIRS) {
    const url = env[urlName]?.trim();
    const token = env[tokenName]?.trim();
    // URL과 토큰은 같은 쌍에서만 가져온다(서로 다른 DB의 주소와 토큰이 섞이지 않게).
    if (url && token) return { url: url.replace(/\/+$/, ''), token, source: `${urlName}, ${tokenName}` };
  }
  return null;
}

/**
 * @typedef {string | number | null | RedisReply[]} RedisReply
 * @typedef {{
 *   command: (...args: (string | number)[]) => Promise<RedisReply>,
 *   pipeline: (commands: (string | number)[][]) => Promise<RedisReply[]>,
 * }} RedisClient
 */

/**
 * @param {{ url: string, token: string, fetch?: typeof fetch, timeoutMs?: number }} options
 * @returns {RedisClient}
 */
export function createRestClient({ url, token, fetch: fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  async function post(path, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(`${url}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new RedisError('Upstash Redis에 연결하지 못했어요.', { cause });
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new RedisError(`Upstash Redis가 요청을 거절했어요(${res.status}): ${data?.error ?? '응답 없음'}`, {
        status: res.status,
      });
    }
    return data;
  }

  /** @param {any} entry Upstash 응답 한 건: { result } 또는 { error } */
  function unwrap(entry) {
    if (!entry || typeof entry !== 'object') throw new RedisError('Upstash Redis 응답 형식이 올바르지 않아요.');
    if ('error' in entry) throw new RedisError(`Upstash Redis 명령 오류: ${entry.error}`);
    return entry.result;
  }

  // 인자는 모두 문자열로 보낸다(숫자·문자열을 Redis가 같은 값으로 받도록).
  const encode = (args) => args.map((arg) => String(arg));

  return {
    async command(...args) {
      return unwrap(await post('', encode(args)));
    },
    async pipeline(commands) {
      const data = await post('/pipeline', commands.map(encode));
      if (!Array.isArray(data)) throw new RedisError('Upstash Redis 응답 형식이 올바르지 않아요.');
      return data.map(unwrap);
    },
  };
}
