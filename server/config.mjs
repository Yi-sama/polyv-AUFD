import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('.', import.meta.url));
export function loadConfig({ localFile = path.join(ROOT, '.env'), env = process.env } = {}) {
  const local = existsSync(localFile) ? parseEnv(readFileSync(localFile, 'utf8')) : {};
  const externalPath = env.POLYV_ENV_FILE ?? local.POLYV_ENV_FILE;
  const external = externalPath ? parseEnv(readFileSync(path.resolve(externalPath), 'utf8')) : {};
  // Explicit shell variables win; external account settings beat template defaults.
  return { ...local, ...external, ...env };
}
