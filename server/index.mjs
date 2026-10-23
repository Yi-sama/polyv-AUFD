import path from 'node:path';
import { createApp } from './app.mjs';
import { ROOT, loadConfig } from './config.mjs';

try {
  const env = loadConfig();
  const port = Number(env.PORT || 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CONFIG_INVALID: Invalid PORT.');
  const host = env.HOST || '127.0.0.1';
  const server = await createApp({
    dataDir: path.join(ROOT, 'data'), assetDir: path.join(ROOT, 'assets'), env
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'PORT_IN_USE: choose another PORT and update frontend proxy.' : 'SERVER_START_FAILED');
    process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`Portfolio backend: http://${host}:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
} catch (error) {
  const safe = ['CONFIG_INVALID:', 'DATA_INVALID:'].some(prefix => error.message.startsWith(prefix));
  console.error(safe ? error.message : 'STARTUP_FAILED: check local configuration and data permissions.');
  process.exitCode = 1;
}
