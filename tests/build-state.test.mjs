import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import {
  buildNeeded,
  writeBuildStamp,
  sourceFingerprint,
} from '../scripts/build-state.mjs';

await test('local launcher detects stale source without treating secrets or user data as build inputs', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'socialdesk-build-'));
  try {
    await mkdir(resolve(root, 'app'));
    await writeFile(resolve(root, 'app/page.tsx'), 'old interface');
    assert.equal(await buildNeeded(root), true);
    await mkdir(resolve(root, 'dist/server'), { recursive: true });
    await writeFile(resolve(root, 'dist/server/wrangler.json'), '{}');
    assert.equal(await buildNeeded(root), true);
    await writeBuildStamp(root);
    assert.equal(await buildNeeded(root), false);
    const hash = await sourceFingerprint(root);
    await writeFile(
      resolve(root, '.dev.vars'),
      'LOCAL_TEST_SECRET=never-read-this',
    );
    await mkdir(resolve(root, '.socialdesk/data'), { recursive: true });
    await writeFile(
      resolve(root, '.socialdesk/data/private.json'),
      'private data',
    );
    assert.equal(await sourceFingerprint(root), hash);
    assert.equal(await buildNeeded(root), false);
    await writeFile(resolve(root, 'app/page.tsx'), 'new interface');
    assert.equal(await buildNeeded(root), true);
    await writeBuildStamp(root);
    assert.equal(await buildNeeded(root), false);
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('socialdesk-build-'));
    await rm(root, { recursive: true, force: true });
  }
});
