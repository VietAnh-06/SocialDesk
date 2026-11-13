import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graph, GraphError } from '../lib/facebook.ts';

await test('Graph adapter sends credentials only as authorization and parses IDs', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://graph.facebook.com/v25.0/123/feed');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.method, 'POST');
      const payload = options.body;
      if (!(payload instanceof URLSearchParams))
        throw new Error('Expected URLSearchParams');
      assert.equal(payload.toString(), 'message=Hello');
      return Response.json({ id: '123_456' });
    };
    assert.deepEqual(
      await graph('123/feed', 'test-token', {
        method: 'POST',
        body: new URLSearchParams({ message: 'Hello' }),
      }),
      { id: '123_456' },
    );
  } finally {
    globalThis.fetch = original;
  }
});
await test('provider error messages do not disclose credentials', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        { error: { code: 190, message: 'SECRET_TOKEN' } },
        { status: 400 },
      );
    await assert.rejects(
      graph('123', 'SECRET_TOKEN'),
      (e) =>
        e instanceof GraphError &&
        !e.message.includes('SECRET_TOKEN') &&
        !e.ambiguous,
    );
    globalThis.fetch = async () => {
      throw new Error('SECRET_TOKEN');
    };
    await assert.rejects(
      graph('123', 'SECRET_TOKEN', { method: 'POST' }),
      (e) =>
        e instanceof GraphError &&
        e.ambiguous &&
        !e.message.includes('SECRET_TOKEN'),
    );
    globalThis.fetch = async () => new Response('not-json', { status: 502 });
    await assert.rejects(graph('123', 'test'), (e) => e.ambiguous);
  } finally {
    globalThis.fetch = original;
  }
});
