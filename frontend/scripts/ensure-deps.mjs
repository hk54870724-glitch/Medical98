import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, '..');
const viteBin = resolve(frontend, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');

if (!existsSync(viteBin)) {
  console.log('Frontend dependencies are not installed. Running npm install...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['install'], { cwd: frontend, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
