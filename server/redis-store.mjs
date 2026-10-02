import { randomUUID } from 'node:crypto';
import { StoreError, makeCopyName, storeErrors } from './store.mjs';
import { LIMITS } from './validate.mjs';

/**
 * Upstash Redis에 시나리오 목록·휴지통을 저장하는 저장소(Vercel 배포용). 파일 저장소(store.mjs)와 같은 기능을 제공한다.
 *
 * 같은 Upstash DB를 다른 앱과 함께 쓰므로, 이 앱은 아래 두 키만 쓴다.
 *   murder-mystery-timer:scenarios  해시  시나리오 id → 시나리오 JSON(목록)
 *   murder-mystery-timer:trash      해시  시나리오 id → 시나리오 JSON(휴지통, deletedAt 있음)
 * 시나리오 JSON의 모양은 scenarios.json의 항목과 같다: { id, name, stages, createdAt, updatedAt, rev, deletedAt }
 *
 * - 다른 키는 읽지도 쓰지도 지우지도 않는다(KEYS·SCAN·FLUSHDB·FLUSHALL·DEL을 쓰지 않는다).
 * - 요청에 들어온 시나리오 id는 해시 안의 필드 이름으로만 쓰이므로 이 두 키 밖의 데이터에 닿을 수 없다.
 * - 모든 쓰기는 WRITE_SCRIPT 하나로 한다. 읽은 값이 그대로일 때만 쓰는 compare-and-set이라
 *   여러 사람이 동시에 저장해도 서로의 변경을 덮어쓰지 않는다(겹치면 최신 값을 다시 읽어 처리한다).
 */

/**
 * 이 앱 전용 Redis 키 접두사(namespace). 저장소 이름과 같게 정했다.
 * 바꾸면 저장된 데이터를 찾지 못하므로 고정한다(환경 변수로 바꿀 수 없다).
 */
export const KEY_PREFIX = 'murder-mystery-timer';

/** @param {string} [prefix] 테스트에서만 다른 값을 쓴다. */
export function redisKeys(prefix = KEY_PREFIX) {
  return {
    scenarios: `${prefix}:scenarios`,
    trash: `${prefix}:trash`,
  };
}

/**
 * 시나리오 하나를 원자적으로 바꾸는 Lua 스크립트(compare-and-set). Redis 안에서 한 번에 실행되므로 중간에 다른 요청이 끼어들지 않는다.
 * KEYS[1] 목록 해시, KEYS[2] 휴지통 해시
 * ARGV[1] 시나리오 id
 * ARGV[2] 읽어 둔 현재 JSON('' = 아직 없어야 함)
 * ARGV[3] 쓴 뒤 있을 곳: 'scenarios' | 'trash' | 'none'(영구 삭제)
 * ARGV[4] 새 JSON
 * ARGV[5] 새로 만들 때 목록+휴지통 개수 한도(0 = 확인 안 함)
 * 반환: 1 저장함, 0 그사이 다른 요청이 바꿈(아무것도 쓰지 않음), -1 개수 한도에 걸림
 */
export const WRITE_SCRIPT = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if not current then current = redis.call('HGET', KEYS[2], ARGV[1]) end
if not current then current = '' end
if current ~= ARGV[2] then return 0 end
local limit = tonumber(ARGV[5])
if current == '' and limit > 0 and redis.call('HLEN', KEYS[1]) + redis.call('HLEN', KEYS[2]) >= limit then return -1 end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[2], ARGV[1])
if ARGV[3] == 'scenarios' then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
elseif ARGV[3] == 'trash' then
  redis.call('HSET', KEYS[2], ARGV[1], ARGV[4])
end
return 1
`.trim();

const DAY_MS = 24 * 60 * 60 * 1000;
/** 동시에 같은 시나리오를 저장해 compare-and-set이 실패했을 때 다시 시도하는 횟수 */
const MAX_ATTEMPTS = 8;

const byUpdatedDesc = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
const byDeletedDesc = (a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const busy = () =>
  new StoreError('busy', '다른 사용자가 같은 시나리오를 동시에 저장하고 있어요. 잠시 후 다시 시도해주세요.');

/**
 * @typedef {import('./redis.mjs').RedisClient} RedisClient
 * @typedef {{
 *   id: string, name: string, stages: { id: string, name: string, durationSec: number }[],
 *   createdAt: string, updatedAt: string, rev: number, deletedAt: string | null
 * }} Scenario
 */

/**
 * @param {{
 *   client: RedisClient,
 *   retentionDays: number,
 *   now?: () => number,
 *   prefix?: string,
 *   maxItems?: number,
 * }} options prefix·maxItems는 테스트에서만 바꾼다.
 */
export function openRedisStore({ client, retentionDays, now = () => Date.now(), prefix = KEY_PREFIX, maxItems = LIMITS.maxScenarios }) {
  const keys = redisKeys(prefix);
  const isoNow = () => new Date(now()).toISOString();
  const isExpired = (item) => item.deletedAt !== null && now() - Date.parse(item.deletedAt) > retentionDays * DAY_MS;

  /** 해시 하나의 시나리오 전체 @returns {Promise<{ id: string, json: string, item: Scenario }[]>} */
  async function readHash(key) {
    const flat = /** @type {string[] | null} */ (await client.command('HGETALL', key)) ?? [];
    const entries = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      entries.push({ id: flat[i], json: flat[i + 1], item: JSON.parse(flat[i + 1]) });
    }
    return entries;
  }

  /** 시나리오 하나의 지금 값(목록·휴지통 중 있는 곳). json은 compare-and-set의 기준값이다. */
  async function readOne(id) {
    const [active, trashed] = await client.pipeline([
      ['HGET', keys.scenarios, id],
      ['HGET', keys.trash, id],
    ]);
    const json = /** @type {string | null} */ (active ?? trashed ?? null);
    return { json: json ?? '', item: json === null ? null : /** @type {Scenario} */ (JSON.parse(json)) };
  }

  /**
   * @param {string} id
   * @param {string} expectedJson 읽어 둔 현재 값('' = 없어야 함)
   * @param {'scenarios' | 'trash' | 'none'} target
   * @param {Scenario | null} item
   * @param {number} [limit]
   * @returns {Promise<number>} 1 저장함, 0 그사이 바뀜, -1 개수 한도
   */
  async function writeIfUnchanged(id, expectedJson, target, item, limit = 0) {
    const result = await client.command(
      'EVAL',
      WRITE_SCRIPT,
      2,
      keys.scenarios,
      keys.trash,
      id,
      expectedJson,
      target,
      item ? JSON.stringify(item) : '',
      limit,
    );
    return Number(result);
  }

  /** 겹친 요청끼리 다시 부딪히지 않도록 조금씩 다른 시간만큼 기다린다. */
  const backoff = (attempt) => Math.min(200, 15 * attempt) * (0.5 + Math.random());

  /**
   * 읽기 → 바꾸기 → 그사이 아무도 안 바꿨을 때만 쓰기. 다른 요청이 먼저 바꿨으면 최신 값으로 처음부터 다시 한다.
   * decide(item)는 쓸 내용 { target, item, result }를, 쓸 것이 없으면 { result }만 돌려준다.
   * @template T
   * @param {string} id
   * @param {(item: Scenario | null) => { target?: 'scenarios' | 'trash' | 'none', item?: Scenario | null, result: T }} decide
   * @returns {Promise<T>}
   */
  async function change(id, decide) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const current = await readOne(id);
      const plan = decide(current.item);
      if (!plan.target) return plan.result;
      if ((await writeIfUnchanged(id, current.json, plan.target, plan.item ?? null)) === 1) return plan.result;
      await sleep(backoff(attempt));
    }
    throw busy();
  }

  /** 새 시나리오를 넣는다. 목록과 휴지통을 합친 개수 한도는 스크립트 안에서 함께 확인한다. @param {Scenario} item */
  async function insert(item) {
    let next = item;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const outcome = await writeIfUnchanged(next.id, '', 'scenarios', next, maxItems);
      if (outcome === 1) return next;
      if (outcome === -1) throw storeErrors.limit();
      // 같은 id가 이미 있는 경우(사실상 일어나지 않음)에는 새 id로 다시 넣는다.
      next = { ...next, id: randomUUID() };
    }
    throw busy();
  }

  return {
    /** 저장소 종류(상태 확인용) */
    kind: 'redis',

    /** Redis가 응답하는지 확인한다(키는 건드리지 않는다). */
    async ping() {
      await client.command('PING');
    },

    /** 휴지통 보관 기간이 지난 항목을 지운다. 그사이 복원·삭제된 항목은 건드리지 않는다. */
    async purgeExpired() {
      let removed = 0;
      for (const entry of await readHash(keys.trash)) {
        if (!isExpired(entry.item)) continue;
        if ((await writeIfUnchanged(entry.id, entry.json, 'none', null)) === 1) removed++;
      }
      return removed;
    },

    async listActive() {
      return (await readHash(keys.scenarios)).map((entry) => entry.item).sort(byUpdatedDesc);
    },

    async listTrash() {
      return (await readHash(keys.trash))
        .map((entry) => entry.item)
        .filter((item) => !isExpired(item))
        .sort(byDeletedDesc);
    },

    /** @param {string} id */
    async get(id) {
      return (await readOne(id)).item;
    },

    /** @param {{ name: string, stages: Scenario['stages'] }} input */
    create(input) {
      const at = isoNow();
      return insert({ id: randomUUID(), ...input, createdAt: at, updatedAt: at, rev: 1, deletedAt: null });
    },

    /**
     * @param {string} id
     * @param {{ name: string, stages: Scenario['stages'] }} input
     * @param {number} baseRev 클라이언트가 편집을 시작한 버전
     */
    update(id, input, baseRev) {
      return change(id, (item) => {
        if (!item) throw storeErrors.notFound();
        if (item.deletedAt) throw storeErrors.trashed(item);
        if (item.rev !== baseRev) throw storeErrors.conflict(item);
        const next = { ...item, ...input, updatedAt: isoNow(), rev: item.rev + 1 };
        return { target: 'scenarios', item: next, result: next };
      });
    },

    /** @param {string} id @param {string} name */
    rename(id, name) {
      return change(id, (item) => {
        if (!item) throw storeErrors.notFound();
        if (item.deletedAt) throw storeErrors.trashed(item);
        const next = { ...item, name, updatedAt: isoNow(), rev: item.rev + 1 };
        return { target: 'scenarios', item: next, result: next };
      });
    },

    /** @param {string} id */
    async duplicate(id) {
      const { item: source } = await readOne(id);
      if (!source) throw storeErrors.notFound();
      if (source.deletedAt) throw storeErrors.trashed(source);
      const at = isoNow();
      return insert({
        id: randomUUID(),
        name: makeCopyName(source.name),
        stages: source.stages.map((stage) => ({ ...stage, id: randomUUID() })),
        createdAt: at,
        updatedAt: at,
        rev: 1,
        deletedAt: null,
      });
    },

    /** 휴지통으로 이동. 이미 휴지통에 있으면 그대로 돌려준다. @param {string} id */
    trash(id) {
      return change(id, (item) => {
        if (!item) throw storeErrors.notFound();
        if (item.deletedAt) return { result: item };
        const next = { ...item, deletedAt: isoNow(), rev: item.rev + 1 };
        return { target: 'trash', item: next, result: next };
      });
    },

    /** 휴지통에서 복원. 이미 목록에 있으면 그대로 돌려준다. @param {string} id */
    restore(id) {
      return change(id, (item) => {
        if (!item) throw storeErrors.notFound();
        if (!item.deletedAt) return { result: item };
        const next = { ...item, deletedAt: null, updatedAt: isoNow(), rev: item.rev + 1 };
        return { target: 'scenarios', item: next, result: next };
      });
    },

    /** 휴지통에 있는 항목만 영구 삭제한다. @param {string} id */
    purge(id) {
      return change(id, (item) => {
        if (!item) throw storeErrors.notFound();
        if (!item.deletedAt) throw storeErrors.notInTrash(item);
        return { target: 'none', item: null, result: undefined };
      });
    },

    /** 파일 저장소와 같은 모양을 위해 둔다(Redis는 기다릴 저장 작업이 없다). */
    async flush() {},
  };
}

/**
 * Redis 연결 정보가 없을 때 쓰는 자리 표시 저장소. 모든 요청에 설정 방법을 알려 주는 503 오류를 돌려준다.
 * (배포 환경에서 파일 저장소로 몰래 바뀌어 데이터가 사라지는 일이 없도록 한다.)
 * @param {string} message
 */
export function unconfiguredStore(message) {
  const fail = async () => {
    throw new StoreError('unavailable', message);
  };
  return {
    kind: 'redis',
    ping: fail,
    purgeExpired: fail,
    listActive: fail,
    listTrash: fail,
    get: fail,
    create: fail,
    update: fail,
    rename: fail,
    duplicate: fail,
    trash: fail,
    restore: fail,
    purge: fail,
    async flush() {},
  };
}
