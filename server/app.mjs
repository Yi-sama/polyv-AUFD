import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import Busboy from 'busboy';
import { ApiError, DEMO_VID, SLUG, IMAGE_PATTERN, VID_PATTERN } from './model.mjs';
import { createStore } from './store.mjs';
import { createPolyv } from './polyv.mjs';

const MAX_IMAGE = 10 * 1024 * 1024;
const loopback = host => ['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'].includes(host);
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
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
  const adminToken = env.ADMIN_TOKEN || '';
  if (adminToken && adminToken.length < 32) throw new Error('CONFIG_INVALID: ADMIN_TOKEN must have at least 32 characters.');
  if (!loopback(host) && !readOnly && !adminToken) throw new Error('CONFIG_INVALID: Public binding requires READ_ONLY=true or ADMIN_TOKEN.');
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
  function authorize(req) {
    if (readOnly) fail(403, 'READ_ONLY', '公开展示模式不允许编辑或查询账号素材');
    if (req.headers.origin && !allowedOrigin(req.headers.origin)) fail(403, 'ORIGIN_DENIED', '不允许的请求来源');
    if (req.headers['sec-fetch-site'] === 'cross-site' && !allowedOrigin(req.headers.origin)) {
      fail(403, 'ORIGIN_DENIED', '不允许的请求来源');
    }
    if (adminToken) {
      if (!safeEqual(req.headers.authorization ?? '', `Bearer ${adminToken}`)) fail(403, 'ADMIN_REQUIRED', '需要管理凭证');
    } else if (!loopback(req.socket.remoteAddress) || Object.keys(req.headers).some(h => h === 'forwarded' || h.startsWith('x-forwarded-'))) {
      fail(403, 'LOCAL_ONLY', '编辑功能仅供本机使用');
    }
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
      if (pathname === '/api/portfolio' || pathname === `/api/creators/${SLUG}`) {
        if (req.method === 'GET') return json(res, 200, await store.read());
        if (req.method === 'PUT') {
          authorize(req);
          return json(res, 200, await store.save(await jsonBody(req)));
        }
        fail(405, 'METHOD_NOT_ALLOWED', '不支持的操作');
      }
      if (pathname === '/api/creators' && req.method === 'GET') {
        const p = await store.read();
        const { name, alias, role, avatar } = p.profile;
        return json(res, 200, { items: [{ slug: SLUG, profile: { name, alias, role, avatar }, featured: p.works.find(w => w.featured) ?? null }] });
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
