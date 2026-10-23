import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import Busboy from 'busboy';
import { ApiError, DEMO_VID, SLUG, POSTER, IMAGE_PATTERN, VID_PATTERN, validatePortfolio } from './model.mjs';
import { createStore } from './store.mjs';
import { createPolyv } from './polyv.mjs';
import { createSessions } from './auth.mjs';

const MAX_IMAGE = 10 * 1024 * 1024;
const loopback = host => ['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'].includes(host);
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function rawBody(req, max) {
  if (Number(req.headers['content-length']) > max) {
    req.resume();
    fail(413, 'BODY_TOO_LARGE', '提交内容过大');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > max) {
      req.resume();
      fail(413, 'BODY_TOO_LARGE', '提交内容过大');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req, max = 1024 * 1024) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    fail(415, 'CONTENT_TYPE', '请使用 application/json');
  }
  const bytes = await rawBody(req, max);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(400, 'INVALID_JSON', 'JSON 数据格式不正确'); }
}
async function uploadedImage(req, legacy) {
  const type = req.headers['content-type'] ?? '';
  if (legacy && type.startsWith('application/json')) {
    const body = await jsonBody(req, 14 * 1024 * 1024);
    if (typeof body?.base64 !== 'string' || !body.base64 ||
        body.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(body.base64)) {
      fail(400, 'INVALID_IMAGE', '图片 base64 格式不正确');
    }
    const bytes = Buffer.from(body.base64, 'base64');
    if (bytes.length > MAX_IMAGE) fail(413, 'IMAGE_TOO_LARGE', '图片不能超过 10 MiB');
    if (bytes.toString('base64') !== body.base64) fail(400, 'INVALID_IMAGE', '图片 base64 格式不正确');
    return { bytes, mime: body.type };
  }
  if (!type.startsWith('multipart/form-data;')) fail(415, 'CONTENT_TYPE', '请使用 multipart/form-data');
  const raw = await rawBody(req, MAX_IMAGE + 64 * 1024);
  return new Promise((resolve, reject) => {
    let parser;
    let result;
    let invalid = false;
    let limited = false;
    // Busboy emits partsLimit upon reaching the limit, not only exceeding it.
    try { parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 0, parts: 2, fileSize: MAX_IMAGE + 1 } }); }
    catch { return reject(new ApiError(400, 'INVALID_MULTIPART', '上传表单格式不正确')); }
    parser.on('file', (name, stream, info) => {
      if (name !== 'file') invalid = true;
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('limit', () => { limited = true; });
      stream.on('error', () => { invalid = true; });
      stream.on('end', () => { result = { bytes: Buffer.concat(chunks), mime: info.mimeType }; });
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => { invalid = true; });
    parser.on('error', () => reject(new ApiError(400, 'INVALID_MULTIPART', '上传表单不完整')));
    parser.on('close', () => {
      if (limited || result?.bytes.length > MAX_IMAGE) return reject(new ApiError(413, 'IMAGE_TOO_LARGE', '图片不能超过 10 MiB'));
      if (invalid || !result?.bytes.length) return reject(new ApiError(400, 'INVALID_UPLOAD', '请提交一个名为 file 的图片文件'));
      resolve(result);
    });
    parser.end(raw);
  });
}

export async function createApp({
  dataDir, assetDir, env = process.env, fetchImpl = fetch
}) {
  const readOnly = env.READ_ONLY === 'true';
  const host = env.HOST || '127.0.0.1';
  let publicOrigin = '';
  if (env.PUBLIC_ORIGIN) {
    const parsed = new URL(env.PUBLIC_ORIGIN);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.origin !== env.PUBLIC_ORIGIN) {
      throw new Error('CONFIG_INVALID: PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash.');
    }
    publicOrigin = parsed.origin;
  }
  if (!loopback(host) && !publicOrigin) throw new Error('CONFIG_INVALID: Public binding requires PUBLIC_ORIGIN.');
  const extraOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  function allowedOrigin(origin) {
    if (origin === publicOrigin || extraOrigins.includes(origin)) return true;
    try {
      const url = new URL(origin);
      return url.origin === origin && url.protocol === 'http:' && loopback(url.hostname);
    } catch { return false; }
  }
  function checkOrigin(req) {
    if (Object.keys(req.headers).some(h => h === 'forwarded' || h.startsWith('x-forwarded-'))) {
      fail(403, 'FORWARDED_DENIED', '请使用不添加转发头的同源代理');
    }
    if (req.headers.origin && !allowedOrigin(req.headers.origin)) fail(403, 'ORIGIN_DENIED', '不允许的请求来源');
    if (req.headers['sec-fetch-site'] === 'cross-site' && !allowedOrigin(req.headers.origin)) {
      fail(403, 'ORIGIN_DENIED', '不允许的请求来源');
    }
  }
  const sessions = createSessions({ secure: Boolean(publicOrigin) });
  function authorize(req, slug) {
    if (readOnly) fail(403, 'READ_ONLY', '公开展示模式不允许编辑或查询账号素材');
    checkOrigin(req);
    const owner = sessions.require(req);
    if (slug !== undefined && owner !== slug) fail(403, 'OWNER_REQUIRED', '只能编辑自己的主页');
    return owner;
  }
  const store = await createStore(dataDir, assetDir);
  const polyv = createPolyv(env, fetchImpl);
  let uploads = 0, upstream = 0, requestCount = 0, windowStart = Date.now();
  async function polyvCall(action) {
    if (Date.now() - windowStart >= 60000) { requestCount = 0; windowStart = Date.now(); }
    if (requestCount >= 120 || upstream >= 4) fail(429, 'POLYV_RATE_LIMIT', '视频请求过于频繁，请稍后再试');
    requestCount++;
    upstream++;
    try { return await action(); } finally { upstream--; }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    try {
      let requestHost;
      try { requestHost = new URL(`http://${req.headers.host}`).host; }
      catch { fail(403, 'HOST_DENIED', '不允许的访问地址'); }
      const port = server.address().port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
      if (publicOrigin) hosts.push(new URL(publicOrigin).host);
      if (!hosts.includes(requestHost)) fail(403, 'HOST_DENIED', '不允许的访问地址');
      if (req.headers.origin && allowedOrigin(req.headers.origin)) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        if (!allowedOrigin(req.headers.origin)) fail(403, 'ORIGIN_DENIED', '不允许的请求来源');
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600'
        });
        return res.end();
      }
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      if (pathname === '/api/health' && req.method === 'GET') {
        return json(res, 200, { status: 'ok', readOnly, polyvConfigured: polyv.configured });
      }
      if (pathname === '/api/auth/join' && req.method === 'POST') {
        if (readOnly) fail(403, 'READ_ONLY', '公开展示模式不允许入驻');
        checkOrigin(req);
        const input = await jsonBody(req, 8192);
        const creator = await sessions.limited(req, () => store.join(input));
        sessions.issue(req, res, creator.slug);
        return json(res, 201, { creator });
      }
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        checkOrigin(req);
        const input = await jsonBody(req, 8192);
        const creator = await sessions.limited(req, () => store.login(input?.slug, input?.password));
        sessions.issue(req, res, creator.slug);
        return json(res, 200, { creator });
      }
      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        checkOrigin(req);
        sessions.logout(req, res);
        return json(res, 200, { ok: true });
      }
      if (pathname === '/api/auth/me' && req.method === 'GET') {
        return json(res, 200, { creator: await store.read(sessions.require(req)) });
      }
      const creatorMatch = /^\/api\/creators\/([a-z0-9-]{2,40})$/.exec(pathname);
      if (pathname === '/api/portfolio' || creatorMatch) {
        const slug = creatorMatch?.[1] ?? SLUG;
        if (req.method === 'GET') return json(res, 200, await store.read(slug));
        if (req.method === 'PUT') {
          authorize(req, slug);
          const input = await jsonBody(req);
          const remoteCover = w => w?.type === 'video' && typeof w.cover === 'string' && /^https?:\/\//.test(w.cover);
          const pending = Array.isArray(input?.works) ? input.works.filter(remoteCover) : [];
          if (pending.length) {
            // Validate all ordinary fields before contacting the account or fetching media.
            validatePortfolio({ ...input, works: input.works.map(w => remoteCover(w) ? { ...w, cover: POSTER } : w) }, slug);
            const current = await store.read(slug);
            if (input.revision !== current.revision) {
              throw new ApiError(409, 'REVISION_CONFLICT', '内容已更新，请重新加载并合并修改', { currentRevision: current.revision });
            }
            if (uploads >= 2) fail(429, 'UPLOAD_BUSY', '正在处理其他图片，请稍后再试');
            uploads++;
            try {
              for (const work of pending) {
                const cover = await polyvCall(() => polyv.cover(work.videoId, work.cover));
                work.cover = (await store.upload(cover.bytes, cover.mime)).url;
                work.duration = cover.duration;
              }
            } finally { uploads--; }
          }
          return json(res, 200, await store.save(input, slug));
        }
        fail(405, 'METHOD_NOT_ALLOWED', '不支持的操作');
      }
      if (pathname === '/api/creators' && req.method === 'GET') {
        const q = (url.searchParams.get('q') ?? '').trim();
        const tag = (url.searchParams.get('tag') ?? '').trim();
        if (q.length > 100 || tag.length > 30) fail(400, 'INVALID_QUERY', '搜索条件不正确');
        return json(res, 200, { items: await store.list({ q, tag }) });
      }
      if (pathname === '/api/tags' && req.method === 'GET') {
        return json(res, 200, { items: store.tags() });
      }
      if (['/api/upload', '/api/uploads'].includes(pathname) && req.method === 'POST') {
        authorize(req);
        if (uploads >= 2) fail(429, 'UPLOAD_BUSY', '正在处理其他图片，请稍后再试');
        uploads++;
        try {
          const { bytes, mime } = await uploadedImage(req, pathname === '/api/uploads');
          return json(res, 201, await store.upload(bytes, mime));
        } finally { uploads--; }
      }
      if (pathname === '/api/polyv/videos' && req.method === 'GET') {
        authorize(req);
        const keyword = (url.searchParams.get('keyword') ?? '').trim();
        const page = Number(url.searchParams.get('page') ?? '1');
        const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
        if (keyword.length > 100 || !Number.isSafeInteger(page) || page < 1 || page > 100000 ||
            !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) fail(400, 'INVALID_QUERY', '搜索条件不正确');
        return json(res, 200, await polyvCall(() => polyv.search({ keyword, page, pageSize })));
      }
      if (pathname === '/api/polyv/play-token' && req.method === 'GET') {
        const vid = url.searchParams.get('vid') ?? '';
        if (!VID_PATTERN.test(vid)) fail(400, 'INVALID_VID', '视频 VID 格式不正确');
        if (!store.hasVideo(vid)) fail(404, 'VIDEO_NOT_PUBLISHED', '该视频未包含在公开作品集中');
        if (vid === DEMO_VID) return json(res, 200, { videoId: vid, token: null, required: false, expiresAt: null, reason: 'official-demo' });
        return json(res, 200, await polyvCall(() => polyv.playback(vid)));
      }
      if (IMAGE_PATTERN.test(pathname) && ['GET', 'HEAD'].includes(req.method)) {
        const file = store.resolveImage(pathname);
        const info = await stat(file);
        res.writeHead(200, {
          'Content-Type': pathname.endsWith('.jpg') ? 'image/jpeg' : 'image/webp',
          'Content-Length': info.size, 'Cache-Control': 'public, max-age=86400'
        });
        return res.end(req.method === 'HEAD' ? undefined : await readFile(file));
      }
      fail(404, 'NOT_FOUND', '内容不存在');
    } catch (error) {
      req.resume();
      if (res.headersSent) return res.destroy();
      if (error instanceof ApiError) return json(res, error.status, { error: error.message, code: error.code, ...error.extra });
      if (error.code === 'ENOENT') return json(res, 404, { error: '内容不存在', code: 'NOT_FOUND' });
      // Do not log request URLs, bodies, secrets, or raw upstream exceptions.
      console.error('BACKEND_INTERNAL_ERROR');
      json(res, 500, { error: '服务处理失败，请检查后端状态', code: 'INTERNAL_ERROR' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.maxConnections = 128;
  server.setTimeout(30000, socket => socket.destroy());
  return server;
}
