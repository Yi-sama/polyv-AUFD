// One-off: ask Polyv to fetch a licensed public video into the competition account (URL upload, async).
// Uses the backend's private config and signing helper; prints no secrets.
import { loadConfig } from '../../server/config.mjs';
import { signSearch } from '../../server/polyv.mjs';

const env = loadConfig();
const userid = env.POLYV_VOD_USER_ID, secret = env.POLYV_VOD_SECRET_KEY;
if (!userid || !secret) throw new Error('Polyv credentials not configured');
// Arguments: url title [url title ...]
const args = process.argv.slice(2);
const uploadInfos = [];
for (let i = 0; i < args.length; i += 2) uploadInfos.push({ fileUrl: args[i], title: args[i + 1], tag: 'AUFD,demo' });
const params = { ptime: String(Date.now()), uploadInfos: JSON.stringify(uploadInfos) };
params.sign = signSearch(params, secret);
const res = await fetch(`https://api.polyv.net/v2/video/grab/${userid}/upload/multi`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params),
});
console.log(res.status, (await res.text()).slice(0, 300));
