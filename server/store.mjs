import { readFile, writeFile, mkdir, rename, unlink, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { ApiError, SLUG, IMAGE_PATTERN, seedCreators, emptyCreator, validatePortfolio, validateSlug } from './model.mjs';
import { hashPassword, verifyPassword, validatePassword } from './auth.mjs';

export async function createStore(dataDir, assetDir) {
  const root = path.resolve(dataDir, 'creators');
  await mkdir(root, { recursive: true });
  await mkdir(path.join(dataDir, 'uploads'), { recursive: true });
  const creators = new Map();
  const accounts = new Map();
  const channels = new Set();
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) throw new Error('DATA_INVALID: Unexpected creator entry.');
    try {
      const p = JSON.parse(await readFile(path.join(root, entry.name, 'creator.json'), 'utf8'));
      const account = JSON.parse(await readFile(path.join(root, entry.name, 'account.json'), 'utf8'));
      const checked = validatePortfolio(p, entry.name);
      if (p.slug !== entry.name || !Number.isSafeInteger(p.channel) || p.channel < 1 || p.channel >= Number.MAX_SAFE_INTEGER ||
          channels.has(p.channel) || typeof p.isSample !== 'boolean' ||
          !/^[a-f0-9]{32}$/.test(account.salt) || !/^[a-f0-9]{128}$/.test(account.hash)) throw new Error('Invalid data');
      channels.add(p.channel);
      creators.set(p.slug, { ...checked, channel: p.channel, isSample: p.isSample,
        profile: { ...checked.profile, updatedAt: p.profile.updatedAt } });
      accounts.set(p.slug, { salt: account.salt, hash: account.hash });
    } catch {
      throw new Error('DATA_INVALID: Creator data or account cannot be validated.');
    }
  }
  const dimensions = new Map();
  function resolveImage(url) {
    if (typeof url !== 'string' || !IMAGE_PATTERN.test(url)) throw new ApiError(404, 'NOT_FOUND', '图片不存在');
    return url.startsWith('/assets/samples/')
      ? path.join(assetDir, 'samples', path.basename(url))
      : path.join(dataDir, 'uploads', path.basename(url));
  }
  async function withMedia(portfolio) {
    const urls = new Set([portfolio.profile.avatar, portfolio.profile.cover].filter(Boolean));
    for (const w of portfolio.works) {
      urls.add(w.cover);
      for (const url of w.images) urls.add(url);
    }
    const media = {};
    for (const url of urls) {
      if (!dimensions.has(url)) {
        let meta;
        try { meta = await sharp(resolveImage(url), { limitInputPixels: 40_000_000 }).metadata(); }
        catch { throw new ApiError(400, 'IMAGE_MISSING', '图片不存在或不可读取，请先上传图片'); }
        if (!meta.width || !meta.height) throw new ApiError(400, 'IMAGE_INVALID', '无法读取图片尺寸');
        dimensions.set(url, { width: meta.width, height: meta.height });
      }
      media[url] = dimensions.get(url);
    }
    return { ...structuredClone(portfolio), media };
  }
  async function create(creator, password, demo = false) {
    const account = await hashPassword(password);
    const checked = validatePortfolio(creator, creator.slug);
    const doc = { ...checked, channel: creator.channel, isSample: creator.isSample };
    await withMedia(doc);
    const staging = path.join(root, `.pending-${randomUUID()}`);
    await mkdir(staging);
    try {
      await writeFile(path.join(staging, 'creator.json'), JSON.stringify(doc, null, 2), { encoding: 'utf8', flag: 'wx' });
      await writeFile(path.join(staging, 'account.json'), JSON.stringify(account), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      if (demo) await writeFile(path.join(staging, 'demo-login.local.json'),
        JSON.stringify({ slug: doc.slug, password }, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      // The directory rename publishes account and document together, or neither.
      await rename(staging, path.join(root, doc.slug));
      creators.set(doc.slug, doc);
      accounts.set(doc.slug, account);
      return withMedia(doc);
    } finally {
      if (path.dirname(path.resolve(staging)) !== root || !path.basename(staging).startsWith('.pending-')) {
        throw new Error('DATA_INVALID: Unsafe staging cleanup.');
      }
      await rm(staging, { recursive: true, force: true });
    }
  }
  // Resume an interrupted first initialization without overwriting any existing creator.
  // Legacy portfolio.json is deliberately left private and untouched.
  for (const creator of seedCreators()) {
    if (creators.has(creator.slug)) continue;
    if (channels.has(creator.channel)) throw new Error('DATA_INVALID: Sample channel is already in use.');
    await create(creator, randomBytes(18).toString('base64url'), true);
    channels.add(creator.channel);
  }
  for (const creator of creators.values()) await withMedia(creator);
  const dummyAccount = await hashPassword(randomBytes(18).toString('hex'));
  const saving = new Set();
  let joining = false;
  function current(slug) {
    const p = creators.get(slug);
    if (!p) throw new ApiError(404, 'NOT_FOUND', '创作者不存在');
    return p;
  }
  return {
    read: (slug = SLUG) => withMedia(current(slug)),
    async list({ q = '', tag = '' } = {}) {
      const matches = [...creators.values()].sort((a, b) => a.channel - b.channel)
        .filter(p => (!q || [p.profile.name, p.profile.alias, p.profile.title].some(s => s.toLowerCase().includes(q.toLowerCase()))) &&
          (!tag || p.profile.tags.includes(tag)));
      return Promise.all(matches.map(async p => {
        const { media } = await withMedia(p);
        const video = p.works.find(w => w.type === 'video');
        const ordered = [...p.works.filter(w => w.featured), ...p.works.filter(w => !w.featured)];
        return {
          slug: p.slug, channel: p.channel, isSample: p.isSample, profile: structuredClone(p.profile),
          worksCount: p.works.filter(w => !w.isDemo).length,
          featured: structuredClone(ordered[0] ?? null),
          previews: ordered.slice(0, 6).map(w => ({ workId: w.id, type: w.type, cover: w.cover, ...media[w.cover] })),
          previewVideo: video ? { workId: video.id, videoId: video.videoId, seconds: video.highlights[0]?.seconds ?? 0, isDemo: video.isDemo } : null
        };
      }));
    },
    tags() {
      const counts = new Map();
      for (const p of creators.values()) for (const tag of p.profile.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      return [...counts].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([tag, count]) => ({ tag, count }));
    },
    async login(slug, password) {
      const valid = typeof password === 'string' && password.length >= 8 && password.length <= 128;
      const account = accounts.get(slug);
      const matches = await verifyPassword(valid ? password : '', account ?? dummyAccount);
      if (!valid || !account || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS', '账号或密码不正确');
      return withMedia(current(slug));
    },
    async join(input) {
      validateSlug(input?.slug);
      validatePassword(input?.password);
      if (typeof input?.name !== 'string' || !input.name.trim() || input.name.length > 40) {
        throw new ApiError(400, 'VALIDATION_ERROR', '姓名格式不正确');
      }
      if (joining) throw new ApiError(429, 'JOIN_BUSY', '其他账号正在入驻，请稍后再试');
      if (creators.has(input.slug)) throw new ApiError(409, 'SLUG_EXISTS', '这个标识已被使用');
      joining = true;
      try {
        const channel = Math.max(...[...creators.values()].map(p => p.channel)) + 1;
        if (!Number.isSafeInteger(channel) || channel === Number.MAX_SAFE_INTEGER) throw new ApiError(503, 'CHANNEL_LIMIT', '频道号已耗尽');
        return await create(emptyCreator(input.slug, input.name.trim(), channel), input.password);
      } finally { joining = false; }
    },
    hasVideo: vid => [...creators.values()].some(p => p.works.some(w => w.type === 'video' && w.videoId === vid)),
    resolveImage,
    async save(input, slug = SLUG) {
      const previous = current(slug);
      const next = { ...validatePortfolio(input, slug), channel: previous.channel, isSample: previous.isSample };
      if (saving.has(slug) || next.revision !== previous.revision) {
        throw new ApiError(409, 'REVISION_CONFLICT', '内容已更新，请重新加载并合并修改', { currentRevision: previous.revision });
      }
      saving.add(slug);
      const file = path.join(root, slug, 'creator.json');
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        const result = await withMedia(next);
        next.revision++;
        await writeFile(temp, JSON.stringify(next, null, 2), { encoding: 'utf8', flag: 'wx' });
        await rename(temp, file);
        creators.set(slug, next);
        return { ...result, revision: next.revision };
      } finally {
        saving.delete(slug);
        await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    },
    async upload(bytes, mime) {
      const allowed = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
      if (!allowed[mime]) throw new ApiError(415, 'UNSUPPORTED_IMAGE', '请选择 JPG、PNG 或 WebP 图片');
      let converted;
      try {
        const decoder = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
        const meta = await decoder.metadata();
        if (meta.format !== allowed[mime] || (meta.pages ?? 1) > 1) throw new Error('Invalid format');
        converted = await decoder.rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
      } catch { throw new ApiError(400, 'INVALID_IMAGE', '图片损坏、格式不符、像素过大或为动图'); }
      const name = `${randomUUID()}.webp`;
      const target = path.join(dataDir, 'uploads', name);
      const temp = `${target}.tmp`;
      try {
        await writeFile(temp, converted.data, { flag: 'wx' });
        await rename(temp, target);
      } finally {
        await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
      const url = `/uploads/${name}`;
      const size = { width: converted.info.width, height: converted.info.height };
      // Bound metadata cache growth; uploads have not yet become portfolio entries.
      if (dimensions.size > 1024) dimensions.clear();
      dimensions.set(url, size);
      return { url, ...size };
    }
  };
}
