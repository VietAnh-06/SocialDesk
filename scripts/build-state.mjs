import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Only source/build inputs are hashed. Secrets and local user data are never read.
export async function sourceFingerprint(root = process.cwd()) {
  const names = [];
  async function visit(relative) {
    const entries = await readdir(resolve(root, relative), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) names.push(name);
    }
  }
  for (const directory of ['app', 'lib', 'db', 'drizzle', 'public'])
    if (existsSync(resolve(root, directory))) await visit(directory);
  for (const file of [
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'next.config.ts',
    'tsconfig.json',
    '.openai/hosting.json',
  ])
    if (existsSync(resolve(root, file))) names.push(file);
  const digest = createHash('sha256');
  for (const name of names.sort()) {
    digest.update(name + '\0');
    digest.update(await readFile(resolve(root, name)));
    digest.update('\0');
  }
  return digest.digest('hex');
}
export async function writeBuildStamp(root = process.cwd()) {
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(
    resolve(root, 'dist/socialdesk-build.json'),
    JSON.stringify({
      sourceHash: await sourceFingerprint(root),
      builtAt: new Date().toISOString(),
    }) + '\n',
  );
}
export async function buildNeeded(root = process.cwd()) {
  if (!existsSync(resolve(root, 'dist/server/wrangler.json'))) return true;
  try {
    const stamp = JSON.parse(
      await readFile(resolve(root, 'dist/socialdesk-build.json'), 'utf8'),
    );
    return stamp.sourceHash !== (await sourceFingerprint(root));
  } catch {
    return true;
  }
}
if (process.argv[2] === 'stamp') await writeBuildStamp();
