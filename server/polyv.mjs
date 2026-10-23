import { createHash, randomBytes } from 'node:crypto';
import { ApiError, VID_PATTERN } from './model.mjs';

const entries = params => Object.keys(params).sort()
  .filter(key => key !== 'sign' && params[key] != null && params[key] !== '');

export function signSearch(params, secret) {
  const raw = entries(params).map(key => `${key}=${params[key]}`).join('&');
  return createHash('sha1').update(raw + secret, 'utf8').digest('hex').toUpperCase();
}
export function signToken(params, secret) {
  const raw = entries(params).map(key => `${key}${params[key]}`).join('');
  return createHash('md5').update(secret + raw + secret, 'utf8').digest('hex').toUpperCase();
}

function badResponse() {
  return new ApiError(502, 'POLYV_RESPONSE_INVALID', '保利威返回了无法识别的数据');
}
function previewUrl(value) {
  try {
    const url = new URL(value);
    const allowed = ['videocc.net', 'polyv.net'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return allowed && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.port
      ? url.href.replace(/^http:/, 'https:') : '';
  } catch { return ''; }
}
export function normalizeSearch(data) {
  if (!data || !Array.isArray(data.contents) ||
      !['pageNumber', 'pageSize', 'totalItems', 'totalPages'].every(key => Number.isSafeInteger(data[key]) && data[key] >= 0)) {
    throw badResponse();
  }
  const items = data.contents.map(item => {
    const info = item?.basicInfo;
    if (!VID_PATTERN.test(item?.vid ?? '') || !info || typeof info.title !== 'string' ||
        !Number.isInteger(info.status) || !Number.isFinite(info.duration) || info.duration < 0) throw badResponse();
    const streams = item.transcodeInfos;
    const encrypted = Array.isArray(streams) && streams.length > 0 &&
      streams.every(s => typeof s?.encrypt === 'boolean')
      ? streams.some(s => s.encrypt) : null;
    return {
      videoId: item.vid, title: info.title, cover: previewUrl(info.coverURL || info.thumbnailURL),
      duration: info.duration, status: info.status, playable: [60, 61].includes(info.status),
      encrypted, createdAt: typeof info.creationTime === 'string' ? info.creationTime : ''
    };
  });
  return { items, page: data.pageNumber, pageSize: data.pageSize, total: data.totalItems, totalPages: data.totalPages };
}

export function createPolyv(env = process.env, fetchImpl = fetch) {
  const userId = env.POLYV_VOD_USER_ID?.trim();
  const secret = env.POLYV_VOD_SECRET_KEY?.trim();
  const configured = Boolean(userId && secret);
  function requireConfig() {
    if (!configured) throw new ApiError(503, 'POLYV_NOT_CONFIGURED', '保利威点播账号尚未配置');
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
      throw new ApiError(503, 'TLS_DISABLED', '请启用 TLS 证书校验后再连接保利威');
    }
  }
  async function request(url, options = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/json', ...options.headers }
      });
    } catch (error) {
      const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
      throw new ApiError(timeout ? 504 : 502, timeout ? 'POLYV_TIMEOUT' : 'POLYV_NETWORK_ERROR',
        timeout ? '保利威请求超时，请稍后再试' : '无法连接保利威，请检查网络和证书');
    }
    if (!response.ok) throw new ApiError(502, 'POLYV_HTTP_ERROR', '保利威服务拒绝了请求，请检查账号状态');
    let payload;
    try { payload = await response.json(); } catch { throw badResponse(); }
    if (payload?.code !== 200) throw new ApiError(502, 'POLYV_API_ERROR', '保利威接口校验失败，请检查密钥、权限和系统时间');
    return payload.data;
  }
  async function search({ keyword = '', page = 1, pageSize = 20 } = {}) {
    requireConfig();
    const params = {
      userid: userId, ptime: String(Date.now()), filters: 'basicInfo,transcodeInfo',
      page: String(page), pageSize: String(pageSize)
    };
    if (keyword) params.title = keyword;
    const url = new URL('https://api.polyv.net/v2/video/search-videos');
    url.search = new URLSearchParams({ ...params, sign: signSearch(params, secret) }).toString();
    return normalizeSearch(await request(url));
  }
  async function ownedVideo(videoId) {
    // Polyv documents "title" as title-or-VID fuzzy search; still require an exact VID match.
    const result = await search({ keyword: videoId, pageSize: 50 });
    const video = result.items.find(v => v.videoId === videoId);
    if (!video) throw new ApiError(404, 'POLYV_VIDEO_NOT_FOUND', '当前账号中未找到这个视频');
    if (!video.playable) throw new ApiError(409, 'POLYV_VIDEO_NOT_READY', '视频尚未转码或审核完成');
    return video;
  }
  return {
    configured, search,
    async cover(videoId, requestedUrl) {
      const video = await ownedVideo(videoId);
      if (!video.cover || previewUrl(requestedUrl) !== video.cover) {
        throw new ApiError(400, 'POLYV_COVER_INVALID', '封面必须来自所选保利威视频');
      }
      let response;
      const chunks = [];
      let size = 0;
      try {
        response = await fetchImpl(video.cover, { redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok || !response.body) throw new Error('Invalid response');
        const max = 10 * 1024 * 1024;
        if (Number(response.headers.get('content-length')) > max) throw new Error('Cover too large');
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > max) throw new Error('Cover too large');
          chunks.push(chunk);
        }
      } catch {
        if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
        throw new ApiError(502, 'POLYV_COVER_FAILED', '视频封面下载失败，请上传本地封面');
      }
      return { bytes: Buffer.concat(chunks), mime: response.headers.get('content-type')?.split(';')[0], duration: video.duration };
    },
    async playback(videoId) {
      const video = await ownedVideo(videoId);
      if (video.encrypted === null) throw new ApiError(503, 'POLYV_ENCRYPTION_UNKNOWN', '尚不能确认视频加密状态');
      if (!video.encrypted) return { videoId, token: null, required: false, expiresAt: null, reason: 'unencrypted' };
      const params = {
        userid: userId, videoId, ts: String(Date.now()), viewerId: randomBytes(16).toString('hex'),
        expires: '600', disposable: 'false', iswxa: '0', type: 'WEB'
      };
      const data = await request('https://hls.videocc.net/service/v1/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...params, sign: signToken(params, secret) }).toString()
      });
      if (!data || typeof data.token !== 'string' || !data.token || data.videoId !== videoId ||
          !Number.isFinite(data.expiredTime) || data.expiredTime <= Date.now()) throw badResponse();
      return { videoId, token: data.token, required: true, expiresAt: data.expiredTime, reason: 'encrypted' };
    }
  };
}
