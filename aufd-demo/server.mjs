import http from 'node:http';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { seedPortfolio, validatePortfolio } from './model.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const FILE = path.join(DATA, 'portfolio.json');
const PUBLIC = path.join(ROOT, 'public');
const HOST = '127.0.0.1';
const MAX_BODY = 9 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

await mkdir(path.join(DATA, 'uploads'), { recursive: true });
try { await stat(FILE); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(FILE, JSON.stringify(seedPortfolio(), null, 2), 'utf8');
}
let portfolio = JSON.parse(await readFile(FILE, 'utf8'));
let saving = false;

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error('上传内容过大');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function imageBytes(input) {
  if (!input || !['image/jpeg', 'image/png', 'image/webp'].includes(input.type) ||
      typeof input.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) {
    throw new Error('请选择 JPG、PNG 或 WebP 图片');
  }
  const bytes = Buffer.from(input.base64, 'base64');
  if (!bytes.length || bytes.length > 6 * 1024 * 1024) throw new Error('图片大小不能超过 6MB');
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(input.type === 'image/jpeg' && jpg || input.type === 'image/png' && png || input.type === 'image/webp' && webp)) {
    throw new Error('图片内容与文件格式不匹配');
  }
  return { bytes, extension: jpg ? 'jpg' : png ? 'png' : 'webp' };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  const expectedHost = `${HOST}:${server.address().port}`;
  if (![expectedHost, `localhost:${server.address().port}`].includes(req.headers.host)) {
    return json(res, 403, { error: '不允许的访问地址' });
  }
  try {
    const url = new URL(req.url, `http://${expectedHost}`);
    const pathname = decodeURIComponent(url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const allowedOrigins = [`http://${expectedHost}`, `http://localhost:${server.address().port}`];
      if (!allowedOrigins.includes(req.headers.origin) ||
          !req.headers['content-type']?.startsWith('application/json')) {
        return json(res, 403, { error: '只允许作品集页面提交修改' });
      }
    }
    if (pathname === '/api/portfolio' && req.method === 'GET') return json(res, 200, portfolio);
    if (pathname === '/api/portfolio' && req.method === 'PUT') {
      const input = validatePortfolio(await body(req));
      if (saving || input.revision !== portfolio.revision) {
        return json(res, 409, { error: '内容已在其他页面更新，请重新加载后再保存' });
      }
      saving = true;
      try {
        input.revision++;
        await writeFile(`${FILE}.tmp`, JSON.stringify(input, null, 2), 'utf8');
        await rename(`${FILE}.tmp`, FILE);
        portfolio = input;
        return json(res, 200, portfolio);
      } finally { saving = false; }
    }
    if (pathname === '/api/uploads' && req.method === 'POST') {
      const { bytes, extension } = imageBytes(await body(req));
      const filename = `${randomUUID()}.${extension}`;
      await writeFile(path.join(DATA, 'uploads', filename), bytes);
      return json(res, 201, { url: `/uploads/${filename}` });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: '不支持的操作' });
    let filename;
    if (pathname === '/vendor/lucide.js') {
      filename = path.join(ROOT, 'node_modules/lucide/dist/umd/lucide.min.js');
    } else if (/^\/uploads\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(pathname)) {
      filename = path.join(DATA, pathname);
    } else {
      filename = path.resolve(PUBLIC, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(`${PUBLIC}${path.sep}`)) return json(res, 403, { error: '不允许的路径' });
    }
    const content = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/uploads/') || pathname.startsWith('/assets/') ? 'public, max-age=86400' : 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    const code = error.code === 'ENOENT' ? 404 : error.status || (error instanceof SyntaxError || !error.code ? 400 : 500);
    if (code === 500) console.error(error);
    json(res, code, { error: code === 404 ? '内容不存在' : code === 500 ? '保存失败，请稍后重试' : error.message });
  }
});

let port = Number(process.env.PORT || 4317);
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && port < 4340) server.listen(++port, HOST);
  else { console.error(error); process.exitCode = 1; }
});
server.listen(port, HOST, () => console.log(`AUFD ready: http://${HOST}:${server.address().port}`));
