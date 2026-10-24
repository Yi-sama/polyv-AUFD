// Lists the shared Polyv library through the backend as a logged-in demo creator.
import { readFile } from 'node:fs/promises';
const BASE = 'http://127.0.0.1:5175';
const { password } = JSON.parse(await readFile(new URL('../../server/data/creators/lin-mo/demo-login.local.json', import.meta.url), 'utf8'));
const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: BASE }, body: JSON.stringify({ slug: 'lin-mo', password }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const res = await fetch(BASE + '/api/polyv/videos?keyword=&page=1&pageSize=20', { headers: { cookie, origin: BASE } });
console.log(res.status, JSON.stringify(await res.json(), null, 1).slice(0, 1500));
