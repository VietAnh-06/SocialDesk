import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import {
  ensureConfig,
  parseConfig,
  writeConfig,
  validatePublicUrl,
} from '../scripts/local-config.mjs';
import { createGateway, allowedPath } from '../scripts/gateway.mjs';
import { publicOrigin, requestOrigin } from '../lib/origin.ts';

await test('local setup keeps encryption keys and previously configured secrets on repeat runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'socialdesk-local-'));
  try {
    const first = ensureConfig(dir);
    assert.match(first.TOKEN_ENCRYPTION_KEY, /^[a-f0-9]{64}$/);
    assert.equal(first.META_COMMENTS_ENABLED, 'false');
    writeConfig(join(dir, '.dev.vars'), {
      ...first,
      META_APP_SECRET: 'local-test-secret',
      META_COMMENTS_ENABLED: 'true',
    });
    const second = ensureConfig(dir);
    assert.equal(second.TOKEN_ENCRYPTION_KEY, first.TOKEN_ENCRYPTION_KEY);
    assert.equal(second.META_APP_SECRET, 'local-test-secret');
    assert.equal(second.META_COMMENTS_ENABLED, 'true');
    assert.deepEqual(parseConfig('META_APP_ID="123"\nMETA_APP_SECRET=abc\n'), {
      META_APP_ID: '123',
      META_APP_SECRET: 'abc',
    });
    assert.equal(
      (await readFile(join(dir, '.dev.vars'), 'utf8')).includes(
        'local-test-secret',
      ),
      true,
    );
    assert.equal(
      validatePublicUrl('https://social.example.com/'),
      'https://social.example.com',
    );
    assert.throws(() => validatePublicUrl('http://social.example.com'));
    assert.throws(() =>
      writeConfig(join(dir, '.dev.vars'), {
        ...first,
        META_APP_SECRET: 'injected\nMETA_APP_ID=999',
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
await test('public HTTPS origin controls callbacks and cookies instead of internal HTTP address', () => {
  assert.equal(
    publicOrigin(
      'http://127.0.0.1:8788/api/facebook/connect',
      'https://social.example.com',
    ),
    'https://social.example.com',
  );
  assert.equal(
    publicOrigin('http://localhost:8787/api/health'),
    'http://localhost:8787',
  );
  assert.throws(() =>
    publicOrigin(
      'http://localhost/',
      'https://user:password@social.example.com',
    ),
  );
  assert.throws(() =>
    publicOrigin('http://localhost/', 'https://social.example.com/wrong-path'),
  );
  const forwarded = new Request('http://localhost:8788/', {
    headers: {
      origin: 'http://localhost:8788',
      'x-socialdesk-gateway': 'local-test-token',
      'x-socialdesk-origin-b64': Buffer.from(
        'https://social.example.com',
      ).toString('base64url'),
    },
  });
  assert.equal(
    requestOrigin(forwarded, 'local-test-token'),
    'https://social.example.com',
  );
  assert.equal(requestOrigin(forwarded, 'wrong-token'), null);
});
await test('Internet gateway blocks local runtime administration and forwards only application routes', async () => {
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        path: req.url,
        host: req.headers.host,
        proto: req.headers['x-forwarded-proto'],
        body,
      }),
    );
  });
  await new Promise((done) => upstream.listen(0, '127.0.0.1', done));
  const proxy = createGateway({
    upstreamPort: upstream.address().port,
    publicUrl: 'https://social.example.com',
  });
  await new Promise((done) => proxy.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${proxy.address().port}`;
  const send = (path, options = {}) =>
    new Promise((done, reject) => {
      const req = request(
        url + path,
        { method: options.method || 'GET', headers: options.headers },
        (response) => {
          let contents = '';
          response.on('data', (part) => {
            contents += part;
          });
          response.on('end', () =>
            done({
              status: response.statusCode,
              headers: new Headers(
                Object.entries(response.headers).map(([key, value]) => [
                  key,
                  Array.isArray(value) ? value.join(',') : String(value),
                ]),
              ),
              json: async () => JSON.parse(contents),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(options.body);
    });
  try {
    for (const path of [
      '/cdn-cgi/local/explorer/api',
      '/cdn-cgi/local/explorer/api/d1/database',
      '/.dev.vars',
      '/@fs/package.json',
      '/_next/static/server.js.map',
    ])
      assert.equal(
        (await send(path, { headers: { host: 'social.example.com' } })).status,
        404,
        path,
      );
    assert.equal(allowedPath('/api/%252e%252e/.dev.vars'), false);
    assert.equal(allowedPath('/api/facebook/setup'), true);
    assert.equal(allowedPath('/api/connections/local-page/check'), true);
    assert.equal(
      allowedPath('/api/connections/local-page/comments/123_456/replies'),
      true,
    );
    assert.equal(
      allowedPath('/api/connections/local-page/facebook-posts'),
      true,
    );
    assert.equal(
      allowedPath('/api/connections/local-page/comments/invalid/token'),
      false,
    );
    const result = await send('/api/posts', {
      method: 'POST',
      headers: {
        host: 'social.example.com',
        origin: 'https://social.example.com',
        'Content-Type': 'application/json',
        'x-forwarded-proto': 'http',
      },
      body: JSON.stringify({ title: 'local test' }),
    });
    assert.equal(result.status, 200);
    assert.equal(
      result.headers.get('content-security-policy'),
      "frame-ancestors 'none'",
    );
    const data = await result.json();
    assert.equal(data.proto, 'https');
    assert.equal(data.host, 'social.example.com');
    assert.equal(data.path, '/api/posts');
    assert.equal(
      (
        await send('/api/posts', {
          headers: { host: 'untrusted.example' },
        })
      ).status,
      421,
    );
    assert.equal(
      (await send('/')).headers.get('location'),
      'https://social.example.com/',
    );
  } finally {
    proxy.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise((done) => proxy.close(done)),
      new Promise((done) => upstream.close(done)),
    ]);
  }
});
