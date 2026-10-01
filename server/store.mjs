import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { LIMITS } from './validate.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const COPY_SUFFIX = ' (복사본)';

export class StoreError extends Error {
  /**
   * @param {'not_found' | 'conflict' | 'trashed' | 'not_in_trash' | 'limit'} code
   * @param {string} message
   * @param {object} [item] 충돌 시 서버에 있는 최신 시나리오
   */
  constructor(code, message, item) {
    super(message);
    this.code = code;
    this.item = item;
  }
}

/**
 * @typedef {{ id: string, name: string, durationSec: number }} Stage
 * @typedef {{
 *   id: string, name: string, stages: Stage[],
 *   createdAt: string, updatedAt: string, rev: number, deletedAt: string | null
 * }} Scenario
 */

/** 파일을 통째로 다시 쓰되, 임시 파일에 먼저 쓰고 이름을 바꿔서 중간에 깨진 파일이 남지 않게 한다. */
async function writeFileAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, file);
}

const byUpdatedDesc = (a, b) => b.updatedAt.localeCompare(a.updatedAt);
const byDeletedDesc = (a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '');

/**
 * JSON 파일 하나에 모든 시나리오를 저장하는 단순한 저장소.
 * 변경 작업은 한 번에 하나씩 실행되고, 파일 저장에 실패하면 메모리 상태도 되돌린다.
 *
 * @param {{ file: string, retentionDays: number, now?: () => number }} options
 */
export async function openStore({ file, retentionDays, now = () => Date.now() }) {
  await fs.mkdir(path.dirname(file), { recursive: true });

  /** @type {Scenario[]} */
  let items = [];
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    items = Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`저장 파일을 읽을 수 없습니다: ${file}\n${error.message}`);
  }

  let queue = Promise.resolve();

  /**
   * 변경 작업을 직렬로 실행한다. 사본에서 고친 뒤 파일 저장에 성공했을 때만 반영하므로,
   * mutate가 throw하거나 저장이 실패하면 아무것도 바뀌지 않고, 저장 전의 상태가 읽히지도 않는다.
   * @template T
   * @param {(draft: Scenario[]) => T} mutate
   * @returns {Promise<T>}
   */
  function transact(mutate) {
    const run = async () => {
      const draft = structuredClone(items);
      const result = mutate(draft);
      await writeFileAtomic(file, JSON.stringify({ version: 1, items: draft }, null, 1));
      items = draft;
      return result;
    };
    const next = queue.then(run, run);
    queue = next.catch(() => {});
    return next;
  }

  const isoNow = () => new Date(now()).toISOString();

  function isExpired(item) {
    return item.deletedAt !== null && now() - Date.parse(item.deletedAt) > retentionDays * DAY_MS;
  }

  /** @param {Scenario[]} draft @param {string} id */
  function findOrThrow(draft, id) {
    const item = draft.find((it) => it.id === id);
    if (!item) throw new StoreError('not_found', '시나리오를 찾을 수 없어요. 이미 영구 삭제되었을 수 있어요.');
    return item;
  }

  /** @param {Scenario[]} draft @param {string} id */
  function findActiveOrThrow(draft, id) {
    const item = findOrThrow(draft, id);
    if (item.deletedAt) throw new StoreError('trashed', '이 시나리오는 휴지통으로 이동되었어요.', structuredClone(item));
    return item;
  }

  /** @param {Scenario[]} draft */
  function assertCapacity(draft) {
    if (draft.length >= LIMITS.maxScenarios) {
      throw new StoreError(
        'limit',
        `시나리오는 휴지통을 포함해 최대 ${LIMITS.maxScenarios}개까지 저장할 수 있어요. 휴지통의 시나리오를 영구 삭제한 뒤 다시 시도해주세요.`,
      );
    }
  }

  function makeCopyName(name) {
    const base = [...name].slice(0, LIMITS.scenarioNameMax - [...COPY_SUFFIX].length).join('');
    return `${base}${COPY_SUFFIX}`;
  }

  return {
    /** 휴지통 보관 기간이 지난 항목을 지운다. */
    async purgeExpired() {
      if (!items.some(isExpired)) return 0;
      return transact((draft) => {
        const keep = draft.filter((it) => !isExpired(it));
        const removed = draft.length - keep.length;
        draft.splice(0, draft.length, ...keep);
        return removed;
      });
    },

    listActive() {
      return structuredClone(items.filter((it) => !it.deletedAt).sort(byUpdatedDesc));
    },

    listTrash() {
      return structuredClone(items.filter((it) => it.deletedAt && !isExpired(it)).sort(byDeletedDesc));
    },

    /** @param {string} id */
    get(id) {
      const item = items.find((it) => it.id === id);
      return item ? structuredClone(item) : null;
    },

    /** @param {{ name: string, stages: Stage[] }} input */
    create(input) {
      return transact((draft) => {
        assertCapacity(draft);
        const at = isoNow();
        /** @type {Scenario} */
        const item = { id: randomUUID(), ...input, createdAt: at, updatedAt: at, rev: 1, deletedAt: null };
        draft.push(item);
        return structuredClone(item);
      });
    },

    /**
     * @param {string} id
     * @param {{ name: string, stages: Stage[] }} input
     * @param {number} baseRev 클라이언트가 편집을 시작한 버전
     */
    update(id, input, baseRev) {
      return transact((draft) => {
        const item = findActiveOrThrow(draft, id);
        if (item.rev !== baseRev) {
          throw new StoreError('conflict', '다른 기기에서 이 시나리오를 먼저 수정했어요.', structuredClone(item));
        }
        Object.assign(item, input, { updatedAt: isoNow(), rev: item.rev + 1 });
        return structuredClone(item);
      });
    },

    /** @param {string} id @param {string} name */
    rename(id, name) {
      return transact((draft) => {
        const item = findActiveOrThrow(draft, id);
        Object.assign(item, { name, updatedAt: isoNow(), rev: item.rev + 1 });
        return structuredClone(item);
      });
    },

    /** @param {string} id */
    duplicate(id) {
      return transact((draft) => {
        const source = findActiveOrThrow(draft, id);
        assertCapacity(draft);
        const at = isoNow();
        /** @type {Scenario} */
        const item = {
          id: randomUUID(),
          name: makeCopyName(source.name),
          stages: source.stages.map((stage) => ({ ...stage, id: randomUUID() })),
          createdAt: at,
          updatedAt: at,
          rev: 1,
          deletedAt: null,
        };
        draft.push(item);
        return structuredClone(item);
      });
    },

    /** 휴지통으로 이동. 이미 휴지통에 있으면 그대로 돌려준다. @param {string} id */
    trash(id) {
      return transact((draft) => {
        const item = findOrThrow(draft, id);
        if (!item.deletedAt) Object.assign(item, { deletedAt: isoNow(), rev: item.rev + 1 });
        return structuredClone(item);
      });
    },

    /** 휴지통에서 복원. 이미 목록에 있으면 그대로 돌려준다. @param {string} id */
    restore(id) {
      return transact((draft) => {
        const item = findOrThrow(draft, id);
        if (item.deletedAt) Object.assign(item, { deletedAt: null, updatedAt: isoNow(), rev: item.rev + 1 });
        return structuredClone(item);
      });
    },

    /** 휴지통에 있는 항목만 영구 삭제한다. @param {string} id */
    purge(id) {
      return transact((draft) => {
        const index = draft.findIndex((it) => it.id === id);
        if (index === -1) throw new StoreError('not_found', '시나리오를 찾을 수 없어요. 이미 영구 삭제되었을 수 있어요.');
        if (!draft[index].deletedAt) {
          throw new StoreError('not_in_trash', '휴지통에 있는 시나리오만 영구 삭제할 수 있어요.', structuredClone(draft[index]));
        }
        draft.splice(index, 1);
      });
    },

    /** 진행 중인 저장 작업이 끝날 때까지 기다린다(종료 시 사용). */
    flush() {
      return queue;
    },
  };
}
