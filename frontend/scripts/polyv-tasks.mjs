// Lists Polyv URL-upload (grab) tasks for the competition account. Prints no secrets.
import { loadConfig } from '../../server/config.mjs';
import { signSearch } from '../../server/polyv.mjs';
const env = loadConfig();
const params = { ptime: String(Date.now()), page: '1', pageSize: '10' };
params.sign = signSearch(params, env.POLYV_VOD_SECRET_KEY);
const res = await fetch(`https://api.polyv.net/v2/video/grab/${env.POLYV_VOD_USER_ID}/list?${new URLSearchParams(params)}`);
const body = await res.json();
console.log(res.status, body.code, body.message);
for (const t of body.data?.contents ?? []) console.log(t.taskid, t.status, 'ok', t.seccesscount, 'fail', t.failcount, 'total', t.totalcount, new Date(t.createtime).toISOString(), t.endtime ? 'ended' : '');
