// Release gate: pack the package, install the exact tarball into clean consumers outside the repo,
// and run them in fresh processes with all outbound network blocked. Usage: node test/smoke/run.mjs
// SMOKE_PACK_DIR=<dir> keeps the tarball there (CI uploads that exact file).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sh = (cmd, args, cwd, extra = {}) => execFileSync(cmd, args, { cwd, stdio: 'inherit', ...extra });
const temp = (name) => mkdtempSync(join(tmpdir(), `vietqr-smoke-${name}-`));

sh(npm, ['run', 'build'], root);
const packDir = process.env.SMOKE_PACK_DIR ? resolve(process.env.SMOKE_PACK_DIR) : temp('pack');
mkdirSync(packDir, { recursive: true });
const [{ filename }] = JSON.parse(execFileSync(npm, ['pack', '--json', '--pack-destination', packDir], { cwd: root, encoding: 'utf8' }));
const tarball = join(packDir, filename);
console.log(`SMOKE_TARBALL=${tarball}`);

const blockNet = join(here, 'block-net.cjs');
const runCwd = temp('cwd'); // unrelated working directory for every consumer process

function consumer(name, extraDeps = []) {
  const dir = temp(name);
  cpSync(join(here, `consumer-${name}`), dir, { recursive: true });
  cpSync(join(here, 'scenario.cjs'), join(dir, 'scenario.cjs'));
  sh(npm, ['install', '--no-audit', '--ignore-scripts', '--no-fund', '--include=dev', tarball, ...extraDeps], dir);
  return dir;
}

const typesDeps = ['typescript@5.9.3', '@types/node@20'];
for (const [name, entry] of [['esm', 'index.mjs'], ['cjs', 'index.cjs']]) {
  const dir = consumer(name, typesDeps);
  sh(process.execPath, ['--require', blockNet, join(dir, entry)], runCwd);
  sh(process.execPath, [join(dir, 'node_modules/typescript/bin/tsc'), '-p', join(dir, 'tsconfig.json')], dir);
  console.log(`${name}: declarations resolve under node16`);
}

const nest = consumer('nest', ['@nestjs/common@11', '@nestjs/core@11', 'reflect-metadata@0.2', 'rxjs@7']);
sh(process.execPath, ['--require', blockNet, join(nest, 'index.cjs')], runCwd);

console.log(`SMOKE PASSED — tarball ${tarball}`);
