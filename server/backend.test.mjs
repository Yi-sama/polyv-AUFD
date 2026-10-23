import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import sharp from 'sharp';
import { createApp } from './app.mjs';
import { createStore } from './store.mjs';
import { createPolyv, signSearch, signToken } from './polyv.mjs';
import { DEMO_VID, seedPortfolio, validatePortfolio } from './model.mjs';
import { loadConfig } from './config.mjs';
import { checkAccount } from './check-polyv.mjs';

const assetDir = fileURLToPath(new URL('assets/', import.meta.url));
const ownVid = 'abcdef1234567890_1';
const env = { POLYV_VOD_USER_ID: 'test-user', POLYV_VOD_SECRET_KEY: 'test-secret' };
async function temporary(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'polyv-backend-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith('polyv-backend-test-'));
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}
async function running(t, overrides = {}) {
  const dataDir = overrides.dataDir || await temporary(t);
  const app = await createApp({ dataDir, assetDir, env: {}, ...overrides });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  async function api(route, { json, headers = {}, ...options } = {}) {
    const res = await fetch(base + route, {
      ...options,
      headers: { Origin: 'http://localhost:5173', ...(json === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(json === undefined ? {} : { body: JSON.stringify(json) })
    });
    const content = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.arrayBuffer();
    return { res, content };
  }
  return { api, base, dataDir, app };
}
function upstreamVideo({ encrypted = false, status = 61, vid = ownVid } = {}) {
  return {
    code: 200, data: {
      pageNumber: 1, pageSize: 20, totalItems: 1, totalPages: 1,
      contents: [{
        vid, basicInfo: { title: 'Test video', duration: 12, status, coverURL: 'https://img.videocc.net/test.jpg' },
        ...(encrypted === null ? {} : { transcodeInfos: [{ encrypt: encrypted }] })
      }]
    }
  };
}

test('public document, creator aliases, poster dimensions and HEAD', async t => {
  const { api } = await running(t);
  const { content: p } = await api('/api/portfolio');
  assert.equal(p.profile.name, '刘润森');
  assert.equal(p.works.length, 2);
  assert.deepEqual(p.media['/assets/poster.jpg'], { width: 1280, height: 2276 });
  assert.deepEqual((await api('/api/creators/liurunsen')).content, p);
  assert.equal((await api('/api/creators')).content.items.length, 1);
  assert.equal((await api('/api/creators/other')).res.status, 404);
  const image = await api('/assets/poster.jpg', { method: 'HEAD' });
  assert.equal(image.res.status, 200);
  assert.ok(Number(image.res.headers.get('content-length')) > 0);
  assert.equal(image.content.byteLength, 0);
});

test('atomic save, concurrent revision conflict and restart persistence', async t => {
  const { api, dataDir } = await running(t);
  const { content: p } = await api('/api/portfolio');
  p.profile.bio = 'Updated';
  const results = await Promise.all([
    api('/api/portfolio', { method: 'PUT', json: p }),
    api('/api/creators/liurunsen', { method: 'PUT', json: p })
  ]);
  assert.deepEqual(results.map(r => r.res.status).sort(), [200, 409]);
  const conflict = results.find(r => r.res.status === 409);
  assert.equal(conflict.content.code, 'REVISION_CONFLICT');
  const disk = JSON.parse(await readFile(path.join(dataDir, 'portfolio.json'), 'utf8'));
  assert.equal(disk.revision, 1);
  assert.equal(disk.profile.bio, 'Updated');
  const restarted = await createStore(dataDir, assetDir);
  assert.equal((await restarted.read()).revision, 1);
  assert.equal((await readdir(dataDir)).some(name => name.endsWith('.tmp')), false);
});

test('failed write never advances revision or overwrites previous content', async t => {
  const dir = await temporary(t);
  const store = await createStore(dir, assetDir);
  const p = await store.read();
  p.works[0].cover = '/uploads/00000000-0000-0000-0000-000000000000.webp';
  await assert.rejects(store.save(p), { code: 'IMAGE_MISSING' });
  assert.equal((await store.read()).revision, 0);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'portfolio.json'), 'utf8')).revision, 0);
});

test('validation rejects unsafe types, duplicate IDs, impossible dates and missing video IDs', () => {
  for (const change of [
    p => { p.works[0].featured = 'false'; },
    p => { p.works.push(p.works[0]); },
    p => { p.works[0].date = '2026-02-30'; },
    p => { p.works[1].videoId = ''; },
    p => { p.works[0].cover = 'javascript:alert(1)'; },
    p => { p.profile.avatar = '/uploads/../../.env'; },
    p => { p.works[1].highlights = [{ title: 'x', seconds: -1 }]; }
  ]) {
    const p = seedPortfolio();
    change(p);
    assert.throws(() => validatePortfolio(p), { code: 'VALIDATION_ERROR' });
  }
  const p = seedPortfolio();
  delete p.profile.cover;
  p.works[1].isDemo = false;
  assert.equal(validatePortfolio(p).works[1].isDemo, true);
  assert.equal(validatePortfolio(p).profile.cover, p.profile.avatar);
});

test('malformed JSON, oversized requests and path traversal return controlled errors', async t => {
  const { api } = await running(t);
  assert.equal((await api('/api/portfolio', { method: 'PUT', body: '{', headers: { 'Content-Type': 'application/json' } })).res.status, 400);
  assert.equal((await api('/api/portfolio', { method: 'PUT', body: 'x'.repeat(1024 * 1024 + 1), headers: { 'Content-Type': 'application/json' } })).res.status, 413);
  assert.equal((await api('/uploads/%2e%2e/.env')).res.status, 404);
  assert.equal((await api('/.env')).res.status, 404);
});

test('local editor origin, host and forwarded request boundaries', async t => {
  const { api, base } = await running(t);
  const p = seedPortfolio();
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: p, headers: { Origin: 'https://evil.example' } })).res.status, 403);
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: p, headers: { 'X-Forwarded-For': '1.2.3.4' } })).res.status, 403);
  // Node fetch rewrites Host; use the lower-level transport to exercise this guard.
  const badHost = await new Promise((resolve, reject) => {
    http.get(`${base}/api/portfolio`, { headers: { Host: 'evil.example' } }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
  assert.equal(badHost, 403);
  const options = await api('/api/portfolio', { method: 'OPTIONS' });
  assert.equal(options.res.status, 204);
  assert.equal(options.res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('read-only mode blocks management but not anonymous portfolio or sample playback', async t => {
  const { api } = await running(t, { env: { READ_ONLY: 'true' } });
  assert.equal((await api('/api/portfolio')).res.status, 200);
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: seedPortfolio() })).content.code, 'READ_ONLY');
  assert.equal((await api('/api/polyv/videos')).res.status, 403);
  assert.equal((await api('/api/upload', { method: 'POST' })).res.status, 403);
  const token = await api(`/api/polyv/play-token?vid=${DEMO_VID}`);
  assert.equal(token.res.status, 200);
  assert.equal(token.content.token, null);
  assert.equal(token.content.reason, 'official-demo');
});

test('configured admin credential is required even from loopback', async t => {
  const token = 'test-admin-token-with-at-least-32-characters';
  const { api } = await running(t, { env: { ADMIN_TOKEN: token } });
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: seedPortfolio() })).res.status, 403);
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: seedPortfolio(), headers: { Authorization: `Bearer ${token}` } })).res.status, 200);
  await assert.rejects(createApp({ dataDir: await temporary(t), assetDir, env: { HOST: '0.0.0.0' } }), /CONFIG_INVALID/);
});

test('multipart and legacy uploads decode real images, persist dimensions and reject corruption', async t => {
  const { api } = await running(t);
  const bytes = await sharp({ create: { width: 8, height: 5, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/png' }), '../../unsafe.png');
  const upload = await api('/api/upload', { method: 'POST', body: form });
  assert.equal(upload.res.status, 201, JSON.stringify(upload.content));
  assert.match(upload.content.url, /^\/uploads\/[a-f0-9-]{36}\.webp$/);
  assert.equal(upload.content.width, 8);
  assert.equal(upload.content.height, 5);
  const served = await api(upload.content.url);
  assert.equal(served.res.headers.get('content-type'), 'image/webp');
  assert.equal((await sharp(Buffer.from(served.content)).metadata()).width, 8);
  const legacy = await api('/api/uploads', { method: 'POST', json: { type: 'image/png', base64: bytes.toString('base64') } });
  assert.equal(legacy.res.status, 201);
  const p = (await api('/api/portfolio')).content;
  p.works[0].images.push(upload.content.url);
  const saved = await api('/api/portfolio', { method: 'PUT', json: p });
  assert.deepEqual(saved.content.media[upload.content.url], { width: 8, height: 5 });
  assert.equal((await api('/api/uploads', { method: 'POST', json: { type: 'image/png', base64: Buffer.from('not an image').toString('base64') } })).res.status, 400);
  assert.equal((await api('/api/uploads', { method: 'POST', json: { type: 'image/svg+xml', base64: bytes.toString('base64') } })).res.status, 415);
  const extra = new FormData();
  extra.append('file', new Blob([bytes], { type: 'image/png' }), '1.png');
  extra.append('file', new Blob([bytes], { type: 'image/png' }), '2.png');
  assert.equal((await api('/api/upload', { method: 'POST', body: extra })).res.status, 400);
});

test('upload size bound and malformed multipart produce HTTP errors', async t => {
  const { api } = await running(t);
  const form = new FormData();
  form.append('file', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
  assert.equal((await api('/api/upload', { method: 'POST', body: form })).res.status, 413);
  assert.equal((await api('/api/upload', { method: 'POST', body: '--x\r\nbroken', headers: { 'Content-Type': 'multipart/form-data; boundary=x' } })).res.status, 400);
});

test('multi-megabyte legacy image upload stays within the documented limit', async t => {
  const { api } = await running(t);
  const bytes = await sharp(randomBytes(1500 * 1500 * 3), {
    raw: { width: 1500, height: 1500, channels: 3 }
  }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(bytes.length > 6 * 1024 * 1024 && bytes.length < 10 * 1024 * 1024);
  const result = await api('/api/uploads', { method: 'POST', json: { type: 'image/png', base64: bytes.toString('base64') } });
  assert.equal(result.res.status, 201, JSON.stringify(result.content));
  assert.equal(result.content.width, 1500);
  for (const base64 of ['YQ=', 'YQ===', 'Y=Q=', 'YQ==\n', 'YQ__', 'Zh==']) {
    assert.equal((await api('/api/uploads', { method: 'POST', json: { type: 'image/png', base64 } })).res.status, 400);
  }
});

test('external env overrides template defaults but not explicit process environment', async t => {
  const dir = await temporary(t);
  const localFile = path.join(dir, 'local.env');
  const externalFile = path.join(dir, 'external.env');
  await writeFile(localFile, 'READ_ONLY=false\nPOLYV_VOD_USER_ID=\nPOLYV_VOD_SECRET_KEY=\n', 'utf8');
  await writeFile(externalFile, 'READ_ONLY=true\nPOLYV_VOD_USER_ID=test-user\nPOLYV_VOD_SECRET_KEY=test-secret\n', 'utf8');
  const result = loadConfig({ localFile, env: { POLYV_ENV_FILE: externalFile } });
  assert.equal(result.READ_ONLY, 'true');
  assert.equal(result.POLYV_VOD_USER_ID, 'test-user');
  assert.equal(result.POLYV_VOD_SECRET_KEY, 'test-secret');
  assert.equal(loadConfig({ localFile, env: { POLYV_ENV_FILE: externalFile, READ_ONLY: 'false' } }).READ_ONLY, 'false');
});

test('a corrupt existing portfolio is not reset to seed data', async t => {
  const dir = await temporary(t);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, 'portfolio.json');
  await writeFile(target, '{broken', 'utf8');
  await assert.rejects(createStore(dir, assetDir), /DATA_INVALID/);
  assert.equal(await readFile(target, 'utf8'), '{broken');
});

test('search SHA1 and token MD5 use different raw-value signing rules', () => {
  const params = { z: '中文 &', a: '1', empty: '', nil: null, sign: 'ignored' };
  assert.equal(signSearch(params, 'secret'), createHash('sha1').update('a=1&z=中文 &secret', 'utf8').digest('hex').toUpperCase());
  assert.equal(signToken(params, 'secret'), createHash('md5').update('secreta1z中文 &secret', 'utf8').digest('hex').toUpperCase());
});

test('Polyv search encodes after signing and exposes only safe fields', async () => {
  const api = createPolyv(env, async (url, options) => {
    const params = Object.fromEntries(new URL(url).searchParams);
    assert.equal(params.title, '中文 &');
    assert.equal(params.sign, signSearch(params, env.POLYV_VOD_SECRET_KEY));
    assert.equal(params.filters, 'basicInfo,transcodeInfo');
    assert.equal(options.redirect, 'error');
    return Response.json(upstreamVideo());
  });
  const result = await api.search({ keyword: '中文 &' });
  assert.equal(result.items[0].videoId, ownVid);
  assert.equal(result.items[0].encrypted, false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('Polyv search reports unknown encryption as null for empty or incomplete stream metadata', async () => {
  for (const transcodeInfos of [[], [{ encrypt: true }, {}]]) {
    const api = createPolyv(env, async () => Response.json({
      code: 200,
      data: {
        pageNumber: 1, pageSize: 20, totalItems: 1, totalPages: 1,
        contents: [{ vid: ownVid, basicInfo: { title: 'Test', duration: 1, status: 61 }, transcodeInfos }]
      }
    }));
    assert.equal((await api.search()).items[0].encrypted, null);
  }
});

test('Polyv failures never expose upstream secrets or turn into mock success', async () => {
  await assert.rejects(createPolyv({}, () => { throw new Error('should not call'); }).search(), { code: 'POLYV_NOT_CONFIGURED' });
  for (const impl of [
    async () => { throw new Error('secret signed url'); },
    async () => Response.json({ code: 403, message: 'secret signed url' }),
    async () => new Response('not json'),
    async () => Response.json({ code: 200, data: { contents: [] } })
  ]) {
    await assert.rejects(createPolyv(env, impl).search(), error => error.status === 502 && !error.message.includes('secret'));
  }
  await assert.rejects(createPolyv(env, async () => { throw new DOMException('timeout', 'TimeoutError'); }).search(), { status: 504 });
});

test('playback distinguishes encrypted, unencrypted, missing, unpublished and unknown', async () => {
  const calls = [];
  const api = createPolyv(env, async (url, options) => {
    calls.push(String(url));
    if (String(url).includes('search-videos')) return Response.json(upstreamVideo({ encrypted: true }));
    const params = Object.fromEntries(new URLSearchParams(options.body));
    assert.equal(params.videoId, ownVid);
    assert.equal(params.sign, signToken(params, env.POLYV_VOD_SECRET_KEY));
    assert.match(params.viewerId, /^[a-z0-9]+$/);
    assert.equal(params.expires, '600');
    return Response.json({ code: 200, data: { token: 'test-token', videoId: ownVid, expiredTime: Date.now() + 600000 } });
  });
  assert.equal((await api.playback(ownVid)).token, 'test-token');
  assert.equal(calls.length, 2);
  const noToken = await createPolyv(env, async () => Response.json(upstreamVideo())).playback(ownVid);
  assert.equal(noToken.required, false);
  for (const [video, code] of [
    [{ encrypted: null }, 'POLYV_ENCRYPTION_UNKNOWN'],
    [{ status: 20 }, 'POLYV_VIDEO_NOT_READY'],
    [{ vid: 'another1234_1' }, 'POLYV_VIDEO_NOT_FOUND']
  ]) await assert.rejects(createPolyv(env, async () => Response.json(upstreamVideo(video))).playback(ownVid), { code });
});

test('public token endpoint cannot mint arbitrary account video tokens', async t => {
  let calls = 0;
  const { api } = await running(t, { env, fetchImpl: async () => { calls++; return Response.json(upstreamVideo()); } });
  assert.equal((await api(`/api/polyv/play-token?vid=${ownVid}`)).res.status, 404);
  assert.equal(calls, 0);
  const p = (await api('/api/portfolio')).content;
  p.works[1].videoId = ownVid;
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: p })).res.status, 200);
  const response = await api(`/api/polyv/play-token?vid=${ownVid}`);
  assert.equal(response.res.status, 200);
  assert.equal(response.content.reason, 'unencrypted');
  assert.equal(calls, 1);
});

test('library query validation and missing configuration are explicit', async t => {
  const { api } = await running(t);
  assert.equal((await api('/api/polyv/videos?pageSize=51')).res.status, 400);
  assert.equal((await api('/api/polyv/videos?page=0')).res.status, 400);
  assert.equal((await api('/api/polyv/videos')).content.code, 'POLYV_NOT_CONFIGURED');
  assert.equal((await api('/api/health')).content.polyvConfigured, false);
});

test('account diagnostic separates empty library, exact VID readiness and actual playback', async () => {
  const empty = await checkAccount(env, async () => Response.json({
    code: 200, data: { contents: [], pageNumber: 1, pageSize: 50, totalItems: 0, totalPages: 0 }
  }));
  assert.equal(empty.apiVerified, true);
  assert.equal(empty.selectedVideoPublished, false);
  assert.equal(empty.playbackVerified, false);
  assert.equal(empty.total, 0);
  const configured = { ...env, POLYV_TEST_VID: ownVid };
  const ready = await checkAccount(configured, async () => Response.json(upstreamVideo()));
  assert.equal(ready.selectedVideoPublished, true);
  assert.equal(ready.playbackVerified, false);
  await assert.rejects(checkAccount(configured, async () => Response.json(upstreamVideo({ vid: 'other12345_1' }))), {
    code: 'POLYV_VIDEO_NOT_FOUND'
  });
  await assert.rejects(checkAccount(configured, async () => Response.json(upstreamVideo({ status: 20 }))), {
    code: 'POLYV_VIDEO_NOT_READY'
  });
  await assert.rejects(checkAccount({ ...env, POLYV_TEST_VID: 'not a VID' }, () => { throw new Error('should not call'); }), {
    code: 'POLYV_TEST_VID_INVALID'
  });
});
