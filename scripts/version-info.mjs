import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

try {
  const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  let commit = 'dev';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: fileURLToPath(root),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || 'dev';
  } catch {
    // Una copia sin Git también debe poder compilarse.
  }

  mkdirSync(new URL('public/', root), { recursive: true });
  writeFileSync(new URL('public/version.json', root), `${JSON.stringify({
    version,
    commit,
    builtAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
} catch (error) {
  console.warn(`No se pudo generar public/version.json: ${error.message}`);
}

process.exitCode = 0;
