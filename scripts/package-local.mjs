import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (!existsSync('dist/server/index.js'))
  throw new Error('Chay npm run build truoc khi dong goi.');
const stage = resolve('outputs', `local-release-${Date.now()}`);
const destination = resolve(stage, 'SocialDesk-Local');
await mkdir(destination, { recursive: true });
const include = [
  'app',
  'lib',
  'db',
  'drizzle',
  'public',
  'scripts',
  'tests',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'next.config.ts',
  'tsconfig.json',
  'env.d.ts',
  'drizzle.config.ts',
  'playwright.config.ts',
  '.oxlintrc.json',
  '.oxfmtrc.json',
  '.gitignore',
  '.dev.vars.example',
  'LOCAL-RUN.md',
  'BINH-LUAN.md',
  'KET-NOI-FACEBOOK.md',
  'HUONG-DAN-LOCAL.txt',
  'CAU-HINH.cmd',
  'CHAY-LOCAL.cmd',
  'CHIA-SE-INTERNET.cmd',
];
for (const name of include) {
  if (name.endsWith('.cmd'))
    await writeFile(
      resolve(destination, name),
      (await readFile(name, 'utf8')).replace(/\r?\n/g, '\r\n'),
    );
  else await cp(resolve(name), resolve(destination, name), { recursive: true });
}
await cp(resolve('dist'), resolve(destination, 'dist'), {
  recursive: true,
  filter: (source) =>
    !source
      .split(/[\\/]/)
      .some((segment) =>
        ['.openai', '.wrangler', '.dev.vars'].includes(segment),
      ),
});
await mkdir(resolve(destination, '.openai'));
// A local copy never inherits the hosted Site's identity or source linkage.
await writeFile(
  resolve(destination, '.openai/hosting.json'),
  JSON.stringify({ d1: 'DB', r2: 'FILES' }, null, 2) + '\n',
);
await writeFile(
  resolve(destination, 'README.md'),
  await readFile('LOCAL-RUN.md', 'utf8'),
);
const archive = resolve('outputs/SocialDesk-Local.zip');
execFileSync('tar', ['-a', '-cf', archive, '-C', stage, 'SocialDesk-Local']);
console.log(JSON.stringify({ directory: destination, archive }, null, 2));
