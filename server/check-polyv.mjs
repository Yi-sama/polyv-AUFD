import { createPolyv } from './polyv.mjs';
import { loadConfig } from './config.mjs';
import { ApiError, VID_PATTERN } from './model.mjs';
import { pathToFileURL } from 'node:url';

export async function checkAccount(env, fetchImpl = fetch) {
  const vid = env.POLYV_TEST_VID?.trim() || '';
  if (vid && !VID_PATTERN.test(vid)) throw new ApiError(400, 'POLYV_TEST_VID_INVALID', '测试 VID 格式不正确');
  const api = createPolyv(env, fetchImpl);
  const result = await api.search({ keyword: vid, pageSize: 50 });
  const selected = vid ? result.items.find(video => video.videoId === vid) : undefined;
  if (vid && !selected) throw new ApiError(404, 'POLYV_VIDEO_NOT_FOUND', '当前账号中未找到指定测试 VID');
  if (selected && !selected.playable) throw new ApiError(409, 'POLYV_VIDEO_NOT_READY', '指定测试视频尚未转码或审核完成');
  return {
    apiVerified: true, selectedVideoPublished: Boolean(selected), playbackVerified: false, total: result.total,
    videos: result.items.map(v => ({
      videoId: v.videoId, status: v.status, playable: v.playable, encrypted: v.encrypted
    })),
    nextStep: selected ? 'Test this exact video in the frontend browser.'
      : result.total ? 'Select an owned VID, then verify frontend playback.'
        : 'Account API works but the library is empty. Prepare an authorized test video.'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await checkAccount(loadConfig()), null, 2));
  } catch (error) {
    console.error(error instanceof ApiError
      ? `${error.code}: ${error.message}` : 'CONFIG_ERROR: check the local environment file.');
    process.exitCode = 1;
  }
}
