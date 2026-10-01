import type { Scenario, ScenarioInput } from './types';

/** 프론트엔드와 서버를 다른 주소에 올릴 때는 빌드 시 VITE_API_BASE에 서버 주소를 넣는다. */
const API_BASE = `${(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')}/api`;
const TIMEOUT_MS = 12_000;

export type ApiErrorKind = 'offline' | 'timeout' | 'http';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly fields?: Record<string, string>,
    /** 충돌(409) 때 서버에 있는 최신 시나리오 */
    readonly item?: Scenario,
  ) {
    super(message);
  }
}

interface ErrorPayload {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
  item?: Scenario;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError('timeout', '서버 응답이 너무 늦어요. 잠시 후 다시 시도해주세요.');
    }
    throw new ApiError('offline', '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.');
  } finally {
    window.clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  let payload: ErrorPayload | null = null;
  try {
    payload = (await res.json()) as ErrorPayload;
  } catch {
    // 서버가 JSON이 아닌 응답(예: 프록시 오류 페이지)을 보낸 경우
  }
  if (!res.ok) {
    const fallback =
      res.status >= 500 ? '서버에서 문제가 생겼어요. 잠시 후 다시 시도해주세요.' : '요청을 처리하지 못했어요.';
    throw new ApiError(
      'http',
      payload?.error?.message ?? fallback,
      res.status,
      payload?.error?.code,
      payload?.error?.fields,
      payload?.item,
    );
  }
  if (payload === null) throw new ApiError('http', '서버 응답을 읽지 못했어요.', res.status);
  return payload as T;
}

const enc = encodeURIComponent;

export const api = {
  listScenarios: () => request<{ items: Scenario[]; retentionDays: number }>('GET', '/scenarios'),
  createScenario: (input: ScenarioInput) => request<{ item: Scenario }>('POST', '/scenarios', input),
  updateScenario: (id: string, input: ScenarioInput, rev: number) =>
    request<{ item: Scenario }>('PUT', `/scenarios/${enc(id)}`, { ...input, rev }),
  renameScenario: (id: string, name: string) => request<{ item: Scenario }>('PATCH', `/scenarios/${enc(id)}`, { name }),
  duplicateScenario: (id: string) => request<{ item: Scenario }>('POST', `/scenarios/${enc(id)}/duplicate`),
  trashScenario: (id: string) => request<{ item: Scenario }>('DELETE', `/scenarios/${enc(id)}`),
  listTrash: () => request<{ items: Scenario[]; retentionDays: number }>('GET', '/trash'),
  restoreScenario: (id: string) => request<{ item: Scenario }>('POST', `/trash/${enc(id)}/restore`),
  purgeScenario: (id: string) => request<void>('DELETE', `/trash/${enc(id)}`),
};

/** 화면에 보여 줄 오류 문장 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return '알 수 없는 문제가 생겼어요. 다시 시도해주세요.';
}
