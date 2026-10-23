import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './model.mjs';

const derive = promisify(scrypt);
const TTL = 12 * 60 * 60 * 1000;
const cookieName = 'aufd_session';
const digest = token => createHash('sha256').update(token).digest('hex');

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new ApiError(400, 'VALIDATION_ERROR', '密码需为 8 至 128 个字符');
  }
  return password;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(validatePassword(password), salt, 64);
  return { salt, hash: hash.toString('hex') };
}

export async function verifyPassword(password, account) {
  const candidate = await derive(password, account.salt, 64);
  const expected = Buffer.from(account.hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createSessions({ secure = false, now = Date.now } = {}) {
  // One-process demo: restart invalidates sessions; use shared storage for multiple instances.
  const sessions = new Map();
  const attempts = new Map();
  let hashing = 0;
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function token(req) {
    const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '');
    if (bearer) return bearer[1];
    const values = (req.headers.cookie ?? '').split(';').map(s => s.trim())
      .filter(s => s.startsWith(`${cookieName}=`));
    if (values.length !== 1) return '';
    const value = values[0].slice(cookieName.length + 1);
    return /^[a-f0-9]{64}$/.test(value) ? value : '';
  }
  function prune() {
    for (const [key, entry] of sessions) if (entry.expires <= now()) sessions.delete(key);
    for (const [key, entry] of attempts) if (entry.expires <= now()) attempts.delete(key);
  }
  return {
    async limited(req, action) {
      prune();
      const key = req.socket.remoteAddress;
      const entry = attempts.get(key) ?? { count: 0, expires: now() + 5 * 60 * 1000 };
      if (entry.count >= 30 || hashing >= 4 || (!attempts.has(key) && attempts.size >= 1024)) {
        throw new ApiError(429, 'AUTH_RATE_LIMIT', '登录或注册过于频繁，请稍后再试');
      }
      entry.count++;
      attempts.set(key, entry);
      hashing++;
      try { return await action(); } finally { hashing--; }
    },
    issue(req, res, slug) {
      prune();
      if (sessions.size >= 10000) throw new ApiError(429, 'SESSION_LIMIT', '会话过多，请稍后再试');
      const value = randomBytes(32).toString('hex');
      sessions.delete(digest(token(req)));
      sessions.set(digest(value), { slug, expires: now() + TTL });
      res.setHeader('Set-Cookie', cookie(value, TTL / 1000));
    },
    require(req) {
      const key = digest(token(req));
      const entry = sessions.get(key);
      if (!entry || entry.expires <= now()) {
        sessions.delete(key);
        throw new ApiError(401, 'AUTH_REQUIRED', '请先登录');
      }
      return entry.slug;
    },
    logout(req, res) {
      sessions.delete(digest(token(req)));
      res.setHeader('Set-Cookie', cookie('', 0));
    }
  };
}
