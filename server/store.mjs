import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ApiError, POSTER, IMAGE_PATTERN, seedPortfolio, validatePortfolio } from './model.mjs';

export async function createStore(dataDir, assetDir) {
  const file = path.join(dataDir, 'portfolio.json');
  await mkdir(path.join(dataDir, 'uploads'), { recursive: true });
  let current;
  try {
    current = JSON.parse(await readFile(file, 'utf8'));
    const checked = validatePortfolio(current);
    current = { ...checked, profile: { ...checked.profile, updatedAt: current.profile.updatedAt } };
  } catch (error) {
    // Existing corrupt data must never be silently replaced with demo content.
    if (error.code !== 'ENOENT') throw new Error('DATA_INVALID: portfolio.json cannot be read or validated.');
    current = seedPortfolio();
    await writeFile(file, JSON.stringify(current, null, 2), { encoding: 'utf8', flag: 'wx' });
  }
  const dimensions = new Map();
  function resolveImage(url) {
    if (typeof url !== 'string' || !IMAGE_PATTERN.test(url)) throw new ApiError(404, 'NOT_FOUND', '图片不存在');
    return url === POSTER ? path.join(assetDir, 'poster.jpg') : path.join(dataDir, 'uploads', path.basename(url));
  }
  async function withMedia(portfolio) {
    const urls = new Set([portfolio.profile.avatar, portfolio.profile.cover]);
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
  await withMedia(current);
  let saving = false;
  return {
    read: () => withMedia(current),
    hasVideo: vid => current.works.some(w => w.videoId === vid),
    resolveImage,
    async save(input) {
      const next = validatePortfolio(input);
      if (saving || next.revision !== current.revision) {
        throw new ApiError(409, 'REVISION_CONFLICT', '内容已更新，请重新加载并合并修改', { currentRevision: current.revision });
      }
      saving = true;
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        const result = await withMedia(next);
        next.revision++;
        await writeFile(temp, JSON.stringify(next, null, 2), { encoding: 'utf8', flag: 'wx' });
        await rename(temp, file);
        current = next;
        return { ...result, revision: next.revision };
      } finally {
        saving = false;
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
