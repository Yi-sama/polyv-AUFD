import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import sharp from 'sharp';
import { createApp } from './app.mjs';
import { createStore } from './store.mjs';
import { createPolyv, signSearch, signToken } from './polyv.mjs';
import { DEMO_VID, SLUG, POSTER, seedPortfolio, validatePortfolio } from './model.mjs';
import { createSessions } from './auth.mjs';
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
  let cookie = '';
  async function api(route, { json, headers = {}, ...options } = {}) {
    const res = await fetch(base + route, {
      ...options,
      headers: { Origin: 'http://localhost:5173', Cookie: cookie, ...(json === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(json === undefined ? {} : { body: JSON.stringify(json) })
    });
    const content = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.arrayBuffer();
    return { res, content };
  }
  async function login(slug = SLUG) {
    const credentials = JSON.parse(await readFile(path.join(dataDir, 'creators', slug, 'demo-login.local.json'), 'utf8'));
    const result = await api('/api/auth/login', { method: 'POST', json: credentials });
    assert.equal(result.res.status, 200);
    cookie = result.res.headers.get('set-cookie').split(';')[0];
    return result;
  }
  if (overrides.authenticated !== false) await login();
  return { api, base, dataDir, app, login };
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
  assert.equal(p.profile.name, '林墨');
  assert.equal(p.works.length, 4);
  assert.ok(p.media[POSTER].width > 0 && p.media[POSTER].height > 0);
  assert.deepEqual((await api(`/api/creators/${SLUG}`)).content, p);
  assert.equal((await api('/api/creators')).content.items.length, 3);
  assert.equal((await api('/api/creators/liurunsen')).res.status, 404);
  assert.equal((await api('/assets/poster.jpg')).res.status, 404);
  assert.equal((await api('/api/creators/other')).res.status, 404);
  const image = await api(POSTER, { method: 'HEAD' });
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
    api(`/api/creators/${SLUG}`, { method: 'PUT', json: p })
  ]);
  assert.deepEqual(results.map(r => r.res.status).sort(), [200, 409]);
  const conflict = results.find(r => r.res.status === 409);
  assert.equal(conflict.content.code, 'REVISION_CONFLICT');
  const disk = JSON.parse(await readFile(path.join(dataDir, 'creators', SLUG, 'creator.json'), 'utf8'));
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
  assert.equal(JSON.parse(await readFile(path.join(dir, 'creators', SLUG, 'creator.json'), 'utf8')).revision, 0);
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

test('legacy admin credential never bypasses user authentication', async t => {
  const token = 'test-admin-token-with-at-least-32-characters';
  const { api } = await running(t, { env: { ADMIN_TOKEN: token }, authenticated: false });
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: seedPortfolio() })).res.status, 401);
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: seedPortfolio(), headers: { Authorization: `Bearer ${token}` } })).res.status, 401);
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
  await createStore(dir, assetDir);
  const target = path.join(dir, 'creators', SLUG, 'creator.json');
  await writeFile(target, '{broken', 'utf8');
  await assert.rejects(createStore(dir, assetDir), /DATA_INVALID/);
  assert.equal(await readFile(target, 'utf8'), '{broken');
  const missingSlug = seedPortfolio();
  delete missingSlug.slug;
  await writeFile(target, JSON.stringify(missingSlug), 'utf8');
  await assert.rejects(createStore(dir, assetDir), /DATA_INVALID/);
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
  p.works.find(w => w.type === 'video').videoId = ownVid;
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

test('anonymous reads stay public but all management routes require a session', async t => {
  const { api } = await running(t, { authenticated: false });
  assert.equal((await api('/api/creators')).res.status, 200);
  assert.equal((await api('/api/auth/me')).res.status, 401);
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: seedPortfolio() })).res.status, 401);
  assert.equal((await api('/api/upload', { method: 'POST' })).res.status, 401);
  assert.equal((await api('/api/uploads', { method: 'POST' })).res.status, 401);
  assert.equal((await api('/api/polyv/videos')).res.status, 401);
  const invalid = await api('/api/auth/login', { method: 'POST', json: { slug: SLUG, password: 'wrong-password' } });
  const absent = await api('/api/auth/login', { method: 'POST', json: { slug: 'absent', password: 'wrong-password' } });
  assert.equal(invalid.res.status, 401);
  assert.deepEqual(invalid.content, absent.content);
});

test('owner session is required even with forged document ownership or admin headers', async t => {
  const { api, login } = await running(t);
  const other = (await api('/api/creators/chen-yu')).content;
  const original = structuredClone(other);
  other.profile.bio = 'forbidden';
  assert.equal((await api('/api/creators/chen-yu', { method: 'PUT', json: other })).res.status, 403);
  other.slug = SLUG;
  assert.equal((await api('/api/creators/chen-yu', { method: 'PUT', json: other })).res.status, 403);
  assert.deepEqual((await api('/api/creators/chen-yu')).content, original);
  const own = (await api('/api/portfolio')).content;
  own.channel = 999;
  own.isSample = false;
  own.profile.bio = 'Owner update';
  const saved = await api('/api/portfolio', { method: 'PUT', json: own });
  assert.equal(saved.res.status, 200);
  assert.equal(saved.content.channel, 1);
  assert.equal(saved.content.isSample, true);
  assert.equal(saved.content.profile.bio, 'Owner update');
  await login('chen-yu');
  original.profile.bio = 'Second owner';
  assert.equal((await api('/api/creators/chen-yu', { method: 'PUT', json: original })).res.status, 200);
  assert.equal((await api('/api/portfolio')).content.revision, 1);
  assert.equal((await api('/api/creators/chen-yu')).content.revision, 1);
});

test('join creates an empty independent creator, salts passwords and survives restart', async t => {
  const { api, dataDir } = await running(t, { authenticated: false });
  const input = { slug: 'new-creator', name: 'New Creator', password: 'a-strong-test-password' };
  const joined = await api('/api/auth/join', { method: 'POST', json: input });
  assert.equal(joined.res.status, 201, JSON.stringify(joined.content));
  const p = joined.content.creator;
  assert.equal(p.channel, 4);
  assert.equal(p.revision, 0);
  assert.equal(p.isSample, false);
  assert.deepEqual(p.works, []);
  assert.deepEqual(p.media, {});
  const cookie = joined.res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const headers = { Cookie: cookie.split(';')[0] };
  assert.equal((await api('/api/auth/me', { headers })).content.creator.slug, input.slug);
  p.profile.bio = 'Saved empty creator';
  assert.equal((await api(`/api/creators/${input.slug}`, { method: 'PUT', json: p, headers })).res.status, 200);
  assert.equal((await api('/api/auth/join', { method: 'POST', json: input })).res.status, 409);
  const second = await api('/api/auth/join', { method: 'POST', json: { ...input, slug: 'another-creator' } });
  assert.equal(second.content.creator.channel, 5);
  const account = JSON.parse(await readFile(path.join(dataDir, 'creators', input.slug, 'account.json'), 'utf8'));
  const other = JSON.parse(await readFile(path.join(dataDir, 'creators', 'another-creator', 'account.json'), 'utf8'));
  assert.notEqual(account.salt, other.salt);
  assert.notEqual(account.hash, other.hash);
  assert.equal(JSON.stringify(account).includes(input.password), false);
  const restarted = await createStore(dataDir, assetDir);
  assert.equal((await restarted.login(input.slug, input.password)).revision, 1);
  assert.equal((await restarted.read(input.slug)).channel, 4);
  await assert.rejects(restarted.login(input.slug, 'wrong-password'), { status: 401 });
  for (const route of ['/api/creators', `/api/creators/${input.slug}`, '/api/tags', '/api/auth/me']) {
    const body = JSON.stringify((await api(route, { headers })).content);
    for (const secret of [account.salt, account.hash, input.password, '"password"', '"hash"', '"salt"']) {
      assert.equal(body.includes(secret), false, route);
    }
  }
  for (const route of ['/data/creators/new-creator/account.json', '/creators/new-creator/account.json', '/data/creators/lin-mo/demo-login.local.json']) {
    assert.equal((await api(route)).res.status, 404);
  }
});

test('invalid registration is bounded and reserved routes cannot be claimed', async t => {
  const { api } = await running(t, { authenticated: false });
  for (const slug of ['../escape', 'UPPER', 'x', 'a'.repeat(41), 'studio', 'liurunsen', 'api']) {
    const result = await api('/api/auth/join', { method: 'POST', json: { slug, name: 'Test', password: 'password-123' } });
    assert.equal(result.res.status, 400, slug);
  }
  for (const password of ['', 'short', 'a'.repeat(129)]) {
    assert.equal((await api('/api/auth/join', { method: 'POST', json: { slug: 'valid-user', name: 'Test', password } })).res.status, 400);
  }
  assert.equal((await api('/api/auth/join', { method: 'POST', json: null })).res.status, 400);
  assert.equal((await api('/api/creators')).content.items.length, 3);
});

test('logout invalidates tokens, sessions expire, rotation invalidates previous token', async t => {
  const { api, login } = await running(t);
  const logged = await login();
  const old = logged.res.headers.get('set-cookie').split(';')[0];
  await login();
  assert.equal((await api('/api/auth/me', { headers: { Cookie: old } })).res.status, 401);
  assert.equal((await api('/api/auth/logout', { method: 'POST' })).res.status, 200);
  assert.equal((await api('/api/auth/me')).res.status, 401);
  assert.equal((await api('/api/upload', { method: 'POST' })).res.status, 401);
  let now = 0, issued;
  const sessions = createSessions({ secure: true, now: () => now });
  const req = { headers: {} };
  sessions.issue(req, { setHeader: (_, value) => { issued = value; } }, SLUG);
  assert.match(issued, /; Secure/);
  req.headers.cookie = issued.split(';')[0];
  assert.equal(sessions.require(req), SLUG);
  now = 12 * 60 * 60 * 1000;
  assert.throws(() => sessions.require(req), { status: 401 });
});

test('creator index supports channels, previews, search and exact tags without private identity', async t => {
  const { api } = await running(t, { authenticated: false });
  const items = (await api('/api/creators')).content.items;
  assert.deepEqual(items.map(p => p.channel), [1, 2, 3]);
  for (const item of items) {
    assert.equal(item.isSample, true);
    assert.equal(item.worksCount, 3);
    assert.ok(item.previews.length >= 3 && item.previews.length <= 6);
    assert.ok(item.previews.every(p => p.width > 0 && p.height > 0));
    assert.equal(item.previews[0].workId, item.featured.id);
  }
  assert.equal(items[0].previewVideo.videoId, DEMO_VID);
  assert.equal(items[0].previewVideo.isDemo, true);
  assert.equal(items[1].previewVideo, null);
  assert.equal((await api('/api/creators?q=LIN%20MO')).content.items.length, 1);
  assert.equal((await api(`/api/creators?q=${encodeURIComponent('职业教育')}`)).content.items[0].slug, 'chen-yu');
  assert.equal((await api(`/api/creators?tag=${encodeURIComponent('摄影')}`)).content.items.length, 1);
  assert.equal((await api(`/api/creators?tag=${encodeURIComponent('摄')}`)).content.items.length, 0);
  assert.equal((await api('/api/tags')).content.items.find(i => i.tag === '摄影').count, 1);
  const serialized = JSON.stringify(items);
  for (const privateIdentity of ['liurunsen', '刘润森', 'Yisama', '/assets/poster.jpg']) assert.equal(serialized.includes(privateIdentity), false);
});

test('legacy personal portfolio is never imported or rewritten', async t => {
  const dataDir = await temporary(t);
  const legacy = JSON.stringify({ slug: 'liurunsen', profile: { name: '刘润森' }, revision: 7 });
  await writeFile(path.join(dataDir, 'portfolio.json'), legacy, 'utf8');
  const store = await createStore(dataDir, assetDir);
  assert.equal((await store.list()).length, 3);
  assert.throws(() => store.read('liurunsen'), { status: 404 });
  assert.equal(await readFile(path.join(dataDir, 'portfolio.json'), 'utf8'), legacy);
});

test('published video membership spans creators but excludes nonvideo VID fields', async t => {
  const store = await createStore(await temporary(t), assetDir);
  const p = await store.read('chen-yu');
  p.works[0].videoId = ownVid;
  await store.save(p, p.slug);
  assert.equal(store.hasVideo(ownVid), false);
  const next = await store.read(p.slug);
  next.works.push({ ...seedPortfolio().works[1], videoId: ownVid });
  await store.save(next, next.slug);
  assert.equal(store.hasVideo(ownVid), true);
});

test('auth rate limit bounds repeated failures and cross-site auth is rejected', async t => {
  const { api } = await running(t, { authenticated: false });
  const json = { slug: SLUG, password: 'wrong-password' };
  assert.equal((await api('/api/auth/login', { method: 'POST', json, headers: { Origin: 'https://evil.example' } })).res.status, 403);
  assert.equal((await api('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://evil.example' } })).res.status, 403);
  for (let i = 0; i < 30; i++) assert.equal((await api('/api/auth/login', { method: 'POST', json })).res.status, 401);
  assert.equal((await api('/api/auth/login', { method: 'POST', json })).res.status, 429);
});

test('selected Polyv video saves its verified cover locally with real dimensions', async t => {
  const image = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#102030' } }).png().toBuffer();
  const downloads = [];
  const { api } = await running(t, { env, fetchImpl: async (url, options) => {
    if (String(url).includes('/search-videos')) {
      assert.equal(new URL(url).searchParams.get('title'), ownVid);
      return Response.json(upstreamVideo());
    }
    downloads.push(String(url));
    assert.equal(options.redirect, 'error');
    return new Response(image, { headers: { 'Content-Type': 'image/png' } });
  } });
  const p = (await api('/api/portfolio')).content;
  const video = p.works.find(w => w.type === 'video');
  video.videoId = ownVid;
  video.cover = 'https://img.videocc.net/test.jpg';
  const saved = await api('/api/portfolio', { method: 'PUT', json: p });
  assert.equal(saved.res.status, 200, JSON.stringify(saved.content));
  const result = saved.content.works.find(w => w.type === 'video');
  assert.match(result.cover, /^\/uploads\/[a-f0-9-]+\.webp$/);
  assert.deepEqual(saved.content.media[result.cover], { width: 20, height: 10 });
  assert.equal(result.duration, 12);
  assert.equal(result.isDemo, false);
  assert.deepEqual(downloads, ['https://img.videocc.net/test.jpg']);
  assert.equal((await api('/api/portfolio', { method: 'PUT', json: p })).res.status, 409);
  assert.equal(downloads.length, 1);
});

test('remote video covers never become an arbitrary URL fetch or bypass ownership', async t => {
  let calls = 0;
  const { api } = await running(t, { env, fetchImpl: async url => {
    calls++;
    assert.ok(String(url).startsWith('https://api.polyv.net/v2/video/search-videos?'));
    return Response.json(upstreamVideo());
  } });
  for (const cover of ['http://127.0.0.1/private', 'https://evil.example/a.jpg', 'https://img.videocc.net:8443/test.jpg']) {
    const p = (await api('/api/portfolio')).content;
    Object.assign(p.works.find(w => w.type === 'video'), { videoId: ownVid, cover });
    assert.equal((await api('/api/portfolio', { method: 'PUT', json: p })).res.status, 400);
    assert.equal((await api('/api/portfolio')).content.revision, 0);
  }
  assert.equal(calls, 3);
  const other = (await api('/api/creators/chen-yu')).content;
  other.works.push({ ...seedPortfolio().works[1], videoId: ownVid, cover: 'https://img.videocc.net/test.jpg' });
  assert.equal((await api('/api/creators/chen-yu', { method: 'PUT', json: other })).res.status, 403);
  assert.equal(calls, 3);
});
