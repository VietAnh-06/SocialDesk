import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

await test(
  'live HTTPS tunnel serves the app, preserves login origin and blocks development tools',
  { timeout: 60000 },
  async () => {
    const { url } = JSON.parse(
      await readFile('.socialdesk/server.json', 'utf8'),
    );
    assert.equal(new URL(url).protocol, 'https:');
    const homepage = await fetch(url, { signal: AbortSignal.timeout(15000) });
    assert.equal(homepage.status, 200);
    assert.ok((await homepage.text()).includes('SocialDesk'));
    const health = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(15000),
    });
    assert.deepEqual(await health.json(), { ok: true, origin: url });
    const body = JSON.stringify({
      email: `nonexistent-${randomUUID()}@example.com`,
      password: 'Nonexistent-account-12345',
    });
    const same = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { origin: url, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(
      same.status,
      401,
      'same-origin login must reach password validation, not fail the proxy origin check',
    );
    const foreign = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: {
        origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(foreign.status, 403);
    for (const path of [
      '/cdn-cgi/local/explorer/api',
      '/.dev.vars',
      '/.socialdesk/runtime.env',
    ])
      assert.equal(
        (await fetch(url + path, { signal: AbortSignal.timeout(15000) }))
          .status,
        404,
        path,
      );
  },
);
