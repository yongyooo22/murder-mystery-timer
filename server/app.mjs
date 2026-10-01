import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { StoreError } from './store.mjs';
import { ValidationError, validateName, validateRev, validateScenarioInput } from './validate.mjs';

const MAX_BODY_BYTES = 256 * 1024;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const STORE_ERROR_STATUS = { not_found: 404, conflict: 409, trashed: 409, not_in_trash: 409, limit: 409 };

class HttpError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, status, code, message, extra = {}) {
  sendJson(res, status, { error: { code, message, ...extra.error }, ...extra.payload });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', '요청 내용이 너무 커요.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json', '요청 형식이 올바르지 않아요.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'bad_json', '요청 형식이 올바르지 않아요.');
  }
  return body;
}

/**
 * @param {{
 *   store: Awaited<ReturnType<typeof import('./store.mjs').openStore>>,
 *   staticDir: string,
 *   retentionDays: number,
 *   corsOrigin?: string,
 * }} options
 */
export function createApp({ store, staticDir, retentionDays, corsOrigin = '' }) {
  const routes = [
    ['GET', /^\/api\/health$/, () => ({ status: 200, body: { ok: true } })],
    [
      'GET',
      /^\/api\/scenarios$/,
      async () => {
        await store.purgeExpired();
        return { status: 200, body: { items: store.listActive(), retentionDays } };
      },
    ],
    [
      'POST',
      /^\/api\/scenarios$/,
      async (req) => {
        const input = validateScenarioInput(await readJsonBody(req));
        return { status: 201, body: { item: await store.create(input) } };
      },
    ],
    [
      'GET',
      /^\/api\/scenarios\/([^/]+)$/,
      (_req, id) => {
        const item = store.get(id);
        if (!item) throw new StoreError('not_found', '시나리오를 찾을 수 없어요.');
        return { status: 200, body: { item } };
      },
    ],
    [
      'PUT',
      /^\/api\/scenarios\/([^/]+)$/,
      async (req, id) => {
        const body = await readJsonBody(req);
        const input = validateScenarioInput(body);
        const rev = validateRev(body.rev);
        return { status: 200, body: { item: await store.update(id, input, rev) } };
      },
    ],
    [
      'PATCH',
      /^\/api\/scenarios\/([^/]+)$/,
      async (req, id) => {
        const body = await readJsonBody(req);
        return { status: 200, body: { item: await store.rename(id, validateName(body.name)) } };
      },
    ],
    [
      'DELETE',
      /^\/api\/scenarios\/([^/]+)$/,
      async (_req, id) => ({ status: 200, body: { item: await store.trash(id) } }),
    ],
    [
      'POST',
      /^\/api\/scenarios\/([^/]+)\/duplicate$/,
      async (_req, id) => ({ status: 201, body: { item: await store.duplicate(id) } }),
    ],
    [
      'GET',
      /^\/api\/trash$/,
      async () => {
        await store.purgeExpired();
        return { status: 200, body: { items: store.listTrash(), retentionDays } };
      },
    ],
    [
      'POST',
      /^\/api\/trash\/([^/]+)\/restore$/,
      async (_req, id) => ({ status: 200, body: { item: await store.restore(id) } }),
    ],
    [
      'DELETE',
      /^\/api\/trash\/([^/]+)$/,
      async (_req, id) => {
        await store.purge(id);
        return { status: 204 };
      },
    ],
  ];

  async function handleApi(req, res, pathname) {
    const matches = routes.filter(([, pattern]) => pattern.test(pathname));
    if (matches.length === 0) return sendError(res, 404, 'not_found', '요청한 주소를 찾을 수 없어요.');
    const route = matches.find(([method]) => method === req.method);
    if (!route) {
      res.setHeader('Allow', matches.map(([method]) => method).join(', '));
      return sendError(res, 405, 'method_not_allowed', '지원하지 않는 요청이에요.');
    }
    const [, pattern, handler] = route;
    try {
      let params;
      try {
        params = pathname.match(pattern).slice(1).map(decodeURIComponent);
      } catch {
        throw new HttpError(400, 'bad_path', '요청 주소가 올바르지 않아요.');
      }
      const { status, body } = await handler(req, ...params);
      if (status === 204) {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        return res.end();
      }
      return sendJson(res, status, body);
    } catch (error) {
      if (error instanceof ValidationError) {
        return sendError(res, 400, 'validation', error.message, { error: { fields: error.fields } });
      }
      if (error instanceof StoreError) {
        return sendError(res, STORE_ERROR_STATUS[error.code], error.code, error.message, {
          payload: error.item ? { item: error.item } : {},
        });
      }
      if (error instanceof HttpError) return sendError(res, error.status, error.code, error.message);
      console.error('[api] 처리 중 오류', error);
      return sendError(res, 500, 'server_error', '서버에서 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
    }
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    const root = path.resolve(staticDir);
    let relative;
    try {
      relative = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    let file = path.resolve(root, `.${relative}`);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end();
    }

    let stat = await fs.stat(file).catch(() => null);
    if (stat?.isDirectory()) {
      file = path.join(file, 'index.html');
      stat = await fs.stat(file).catch(() => null);
    }
    if (!stat && !path.extname(file)) {
      // 해시 라우팅을 쓰므로 거의 쓰이지 않지만, 알 수 없는 경로는 앱 첫 화면으로 보낸다.
      file = path.join(root, 'index.html');
      stat = await fs.stat(file).catch(() => null);
    }
    if (!stat) {
      const indexExists = await fs.stat(path.join(root, 'index.html')).catch(() => null);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(indexExists ? 'Not found' : '프론트엔드 빌드가 없습니다. `npm run build` 후 다시 실행해주세요.');
    }

    const ext = path.extname(file).toLowerCase();
    const isHashedAsset = file.startsWith(path.join(root, 'assets') + path.sep);
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    // 확인한 뒤 파일이 사라지는 경우(배포 중 다시 빌드 등)에도 서버가 멈추지 않게 오류를 처리한다.
    pipeline(createReadStream(file), res, (error) => {
      if (error) res.destroy();
    });
  }

  return async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    const url = new URL(req.url ?? '/', 'http://localhost');
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');

    if (isApi && corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600',
        });
        return res.end();
      }
    }

    try {
      if (isApi) return await handleApi(req, res, url.pathname);
      return await serveStatic(req, res, url.pathname);
    } catch (error) {
      console.error('[server] 요청 처리 실패', error);
      if (!res.headersSent) sendError(res, 500, 'server_error', '서버에서 문제가 생겼어요.');
      else res.destroy();
    }
  };
}
