import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { randomToken } from '../lib/security.ts';

await test(
  'comment permissions require operator setup and explicit user selection',
  { timeout: 30000 },
  async () => {
    const files = await readdir('dist/server', { recursive: true });
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modulesRoot: resolve('dist/server'),
        modules: [
          { type: 'ESModule', path: resolve('dist/server/index.js') },
          ...files
            .filter((f) => f.endsWith('.js') && f !== 'index.js')
            .map((f) => ({
              type: 'ESModule',
              path: resolve('dist/server', f),
            })),
        ],
        compatibilityDate: '2026-11-03',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['FILES'],
        bindings: {
          TOKEN_ENCRYPTION_KEY: randomToken(),
          META_APP_ID: '1496006092516967',
          META_APP_SECRET: 'local-test-secret',
          META_COMMENTS_ENABLED: 'true',
        },
        outboundService: () => {
          throw new Error('OAuth redirect must not call Facebook');
        },
      }),
    );
    try {
      const database = await mf.getD1Database('DB');
      const sql = await readFile(
        'drizzle/0000_blushing_madame_hydra.sql',
        'utf8',
      );
      await database.batch(
        sql
          .split('--> statement-breakpoint')
          .filter((s) => s.trim())
          .map((s) => database.prepare(s)),
      );
      const register = await mf.dispatchFetch(
        'http://localhost/api/auth/register',
        {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Optional grants',
            email: 'optional@example.com',
            password: 'Local-test-password-123',
          }),
        },
      );
      assert.equal(register.status, 200);
      const headers = {
        cookie: register.headers.get('set-cookie').split(';')[0],
      };
      const setup = await (
        await mf.dispatchFetch('http://localhost/api/facebook/setup', {
          headers,
        })
      ).json();
      assert.equal(setup.commentsPermissionRequestEnabled, true);
      for (const includeComments of [false, true]) {
        const response = await mf.dispatchFetch(
          `http://localhost/api/facebook/connect${includeComments ? '?permissions=comments' : ''}`,
          { headers, redirect: 'manual' },
        );
        assert.equal(response.status, 302);
        const oauth = new URL(response.headers.get('location'));
        assert.equal(
          oauth.searchParams.get('scope'),
          [
            'pages_show_list',
            'pages_read_engagement',
            'pages_manage_posts',
            ...(includeComments
              ? ['pages_read_user_content', 'pages_manage_engagement']
              : []),
          ].join(','),
        );
        assert.equal(
          oauth.searchParams.get('auth_type'),
          includeComments ? 'rerequest' : null,
        );
      }
    } finally {
      await mf.dispose();
    }
  },
);

await test(
  'OAuth callback imports four Pages and publish/edit/delete keeps per-Page results',
  { timeout: 60000 },
  async () => {
    const writes = [];
    const commentWrites = [];
    let commentHidden = false;
    let rejectPage = false;
    let diagnosticMode = 'ready';
    let oauthFailure = '';
    const files = await readdir('dist/server', { recursive: true });
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modulesRoot: resolve('dist/server'),
        modules: [
          { type: 'ESModule', path: resolve('dist/server/index.js') },
          ...files
            .filter((f) => f.endsWith('.js') && f !== 'index.js')
            .map((f) => ({
              type: 'ESModule',
              path: resolve('dist/server', f),
            })),
        ],
        compatibilityDate: '2026-11-03',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        r2Buckets: ['FILES'],
        bindings: {
          TOKEN_ENCRYPTION_KEY: randomToken(),
          META_APP_ID: '1496006092516967',
          META_APP_SECRET: 'local-test-secret',
          PUBLIC_APP_URL: 'https://local.test',
          LOCAL_GATEWAY_TOKEN: 'worker-gateway-test-only',
        },
        outboundService: async (request) => {
          const u = new URL(request.url);
          assert.equal(u.hostname, 'graph.facebook.com');
          if (u.pathname.endsWith('/debug_token')) {
            if (diagnosticMode === 'bad-app')
              return Response.json({ error: { code: 190 } }, { status: 400 });
            assert.equal(
              request.headers.get('authorization'),
              'Bearer 1496006092516967|local-test-secret',
            );
            assert.equal(u.searchParams.get('input_token'), 'page-token-101');
            if (diagnosticMode === 'denied')
              return Response.json(
                { error: { code: 200, message: 'NEVER_ECHO_THIS_TOKEN' } },
                { status: 400 },
              );
            return Response.json({
              data: {
                app_id:
                  diagnosticMode === 'wrong-app' ? '999' : '1496006092516967',
                is_valid: diagnosticMode !== 'expired',
                expires_at:
                  diagnosticMode === 'expired'
                    ? Math.floor(Date.now() / 1000) - 60
                    : 0,
                ...(diagnosticMode === 'no-scopes'
                  ? {}
                  : {
                      scopes: [
                        'pages_show_list',
                        'pages_read_engagement',
                        ...(diagnosticMode === 'posting-denied'
                          ? []
                          : ['pages_manage_posts']),
                        ...(diagnosticMode === 'limited'
                          ? []
                          : [
                              'pages_read_user_content',
                              'pages_manage_engagement',
                            ]),
                      ],
                    }),
                ...(diagnosticMode === 'granular'
                  ? {
                      granular_scopes: [
                        {
                          scope: 'pages_manage_engagement',
                          target_ids: ['999'],
                        },
                      ],
                    }
                  : {}),
              },
            });
          }
          if (u.pathname.endsWith('/me'))
            return Response.json({
              id: diagnosticMode === 'wrong-page' ? '999' : '101',
              name: 'Test Page 101',
            });
          if (u.pathname.endsWith('/oauth/access_token')) {
            if (
              oauthFailure ===
              (u.searchParams.has('grant_type')
                ? 'token_refresh_failed'
                : 'token_exchange_failed')
            )
              return Response.json(
                { error: { code: 190, message: 'NEVER_ECHO_THIS_TOKEN' } },
                { status: 400 },
              );
            return Response.json({
              access_token: u.searchParams.has('grant_type')
                ? u.searchParams.get('fb_exchange_token')?.endsWith('-b')
                  ? 'long-user-token-b'
                  : 'long-user-token'
                : u.searchParams.get('code') === 'second-user'
                  ? 'short-user-token-b'
                  : 'short-user-token',
            });
          }
          if (u.pathname.endsWith('/me/accounts')) {
            if (oauthFailure === 'pages_fetch_failed')
              return Response.json(
                { error: { code: 200, message: 'NEVER_ECHO_THIS_TOKEN' } },
                { status: 400 },
              );
            return Response.json({
              data: (request.headers.get('authorization') ===
              'Bearer long-user-token-b'
                ? ['201', '202']
                : ['101', '102', '103', '104']
              ).map((id) => ({
                id,
                name: `Test Page ${id}`,
                access_token: `page-token-${id}`,
              })),
            });
          }
          const path = u.pathname.replace('/v25.0/', '');
          if (path === '101/posts')
            return Response.json({
              data: [
                {
                  id: '101_777',
                  message: 'Page post',
                  created_time: '2026-11-12T02:00:00Z',
                  permalink_url: 'https://www.facebook.com/101_777',
                },
              ],
              paging: {
                next: 'https://graph.facebook.com/?access_token=DO_NOT_DISCLOSE',
                cursors: { after: 'posts-next' },
              },
            });
          if (path === '101_777')
            return Response.json({
              id: '101_777',
              from: { id: '101' },
              object_id: '777',
            });
          if (path === '101_777/comments' || path === '777_501/comments') {
            if (request.method === 'GET')
              return Response.json({
                data: [
                  {
                    id: '777_501',
                    message: 'Customer question',
                    from: { id: '999', name: 'Visitor' },
                    is_hidden: commentHidden,
                    can_hide: true,
                    can_remove: true,
                    can_comment: true,
                    comment_count: 1,
                  },
                ],
                paging: {
                  next: 'https://graph.facebook.com/?access_token=DO_NOT_DISCLOSE',
                  cursors: { after: 'comments-next' },
                },
              });
            commentWrites.push({
              path,
              method: request.method,
              values: Object.fromEntries(
                new URLSearchParams(await request.text()),
              ),
            });
            return Response.json({ id: '777_600' });
          }
          if (['777_501', '777_502', '777_503', '888_501'].includes(path)) {
            if (request.method === 'GET')
              return Response.json({
                id: path,
                message: 'Comment',
                object: { id: path === '888_501' ? '101_888' : '101_777' },
                from: { id: path === '777_502' ? '101' : '999' },
                can_hide: path !== '777_503',
                can_remove: path !== '777_503',
                can_comment: path !== '777_503',
              });
            const values = Object.fromEntries(
              new URLSearchParams(await request.text()),
            );
            commentWrites.push({ path, method: request.method, values });
            if ('is_hidden' in values)
              commentHidden = values.is_hidden === 'true';
            return Response.json(true);
          }
          if (request.method === 'GET') return Response.json({ id: path });
          const message =
            request.method === 'POST'
              ? new URLSearchParams(await request.text()).get('message')
              : null;
          writes.push({ path, method: request.method, message });
          if (rejectPage && path.startsWith('103/'))
            return Response.json({ error: { code: 190 } }, { status: 400 });
          if (rejectPage && path.startsWith('104/'))
            return Response.json({ error: { code: 2 } }, { status: 503 });
          return Response.json(
            request.method === 'DELETE'
              ? { success: true }
              : { id: path.includes('/') ? `${path.split('/')[0]}_900` : path },
          );
        },
      }),
    );
    let cookie = '';
    async function call(path, method = 'GET', value) {
      const response = await mf.dispatchFetch(
        `http://127.0.0.1:8788/api/${path}`,
        {
          method,
          redirect: 'manual',
          headers: {
            origin: 'http://127.0.0.1:8788',
            'x-socialdesk-gateway': 'worker-gateway-test-only',
            'x-socialdesk-origin-b64':
              Buffer.from('https://local.test').toString('base64url'),
            cookie,
            ...(value === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          ...(value === undefined ? {} : { body: JSON.stringify(value) }),
        },
      );
      if (response.headers.has('set-cookie')) {
        assert.match(response.headers.get('set-cookie'), /; Secure/);
        cookie = response.headers.get('set-cookie').split(';')[0];
      }
      return response;
    }
    try {
      const database = await mf.getD1Database('DB');
      const sql = await readFile(
        'drizzle/0000_blushing_madame_hydra.sql',
        'utf8',
      );
      await database.batch(
        sql
          .split('--> statement-breakpoint')
          .filter((s) => s.trim())
          .map((s) => database.prepare(s)),
      );
      assert.equal(
        (
          await call('auth/register', 'POST', {
            name: 'OAuth Tester',
            email: 'oauth@example.com',
            password: 'Local-test-password-123',
          })
        ).status,
        200,
      );
      assert.equal(
        (await call('facebook/callback?state=invalid&code=invalid')).status,
        400,
      );
      const connect = await call('facebook/connect');
      assert.equal(connect.status, 302);
      const location = new URL(connect.headers.get('location'));
      assert.equal(location.hostname, 'www.facebook.com');
      assert.equal(
        location.searchParams.get('scope'),
        'pages_show_list,pages_read_engagement,pages_manage_posts',
      );
      assert.equal(
        (await call('facebook/connect?permissions=comments')).status,
        409,
      );
      assert.equal(
        location.searchParams.get('redirect_uri'),
        'https://local.test/api/facebook/callback',
      );
      const callbackPath = `facebook/callback?state=${location.searchParams.get('state')}&code=local-test-code`;
      const callback = await call(callbackPath);
      assert.equal(callback.status, 302);
      assert.equal(
        callback.headers.get('location'),
        'https://local.test/?connect=success',
      );
      assert.equal((await call(callbackPath)).status, 400);
      const data = await (await call('bootstrap')).json();
      const setup = await (await call('facebook/setup')).json();
      assert.equal(setup.ready, true);
      assert.equal(setup.commentsPermissionRequestEnabled, false);
      assert.equal(setup.callbackVerified, false);
      assert.equal(
        setup.callbackUrl,
        'https://local.test/api/facebook/callback',
      );
      assert.equal(JSON.stringify(setup).includes('local-test-secret'), false);
      assert.equal(data.connections.length, 4);
      assert.equal(JSON.stringify(data).includes('page-token-'), false);
      const connectionIds = data.connections.map((c) => c.id);
      async function createPost(title) {
        const created = await (
          await call('posts', 'POST', {
            title,
            message: 'First content',
            connectionIds,
          })
        ).json();
        const state = await (await call('bootstrap')).json();
        return {
          id: created.id,
          targetIds: state.targets
            .filter((t) => t.post_id === created.id)
            .map((t) => t.id),
        };
      }
      const post = await createPost('Four Pages');
      const first = await (
        await call(`posts/${post.id}/publish`, 'POST', {
          targetIds: post.targetIds,
        })
      ).json();
      assert.equal(
        first.outcomes.filter((t) => t.status === 'published').length,
        4,
      );
      assert.equal(writes.length, 4);
      await call(`posts/${post.id}/publish`, 'POST', {
        targetIds: post.targetIds,
      });
      assert.equal(
        writes.length,
        4,
        'successful targets must not be published twice',
      );
      assert.equal(
        (
          await call(`posts/${post.id}`, 'PATCH', {
            title: 'Four Pages',
            message: 'Updated content',
            version: 1,
            connectionIds,
          })
        ).status,
        200,
      );
      const synced = await (
        await call(`posts/${post.id}/sync`, 'POST', {
          targetIds: post.targetIds.slice(0, 2),
        })
      ).json();
      assert.equal(synced.outcomes.length, 2);
      assert.equal(writes.length, 6);
      assert.equal(writes[4].message, 'Updated content');
      const removed = await (
        await call(`posts/${post.id}/remove`, 'POST', {
          targetIds: post.targetIds,
        })
      ).json();
      assert.equal(
        removed.outcomes.filter((t) => t.status === 'deleted').length,
        4,
      );
      assert.equal(writes.length, 10);
      assert.equal((await call(`posts/${post.id}`, 'DELETE')).status, 200);
      rejectPage = true;
      const partial = await createPost('Partial result');
      const result = await (
        await call(`posts/${partial.id}/publish`, 'POST', {
          targetIds: partial.targetIds,
        })
      ).json();
      assert.equal(
        result.outcomes.filter((t) => t.status === 'published').length,
        2,
      );
      assert.equal(
        result.outcomes.filter((t) => t.status === 'failed').length,
        1,
      );
      assert.equal(
        result.outcomes.filter((t) => t.status === 'unknown').length,
        1,
      );
      const beforeRetry = writes.length;
      rejectPage = false;
      await call(`posts/${partial.id}/publish`, 'POST', {
        targetIds: partial.targetIds,
      });
      assert.equal(
        writes.length,
        beforeRetry + 1,
        'retry only the definite failure; do not retry successful or uncertain targets',
      );
      const uncertain = result.outcomes.find((t) => t.status === 'unknown');
      assert.equal(
        (
          await call(`posts/${partial.id}/reconcile`, 'POST', {
            targetIds: [uncertain.id],
            remoteId: '104_900',
          })
        ).status,
        200,
      );
      const ownerCookie = cookie;
      assert.equal(
        (
          await call('auth/register', 'POST', {
            name: 'Second user',
            email: 'second@example.com',
            password: 'Second-user-password-123',
          })
        ).status,
        200,
      );
      const empty = await (await call('bootstrap')).json();
      assert.equal(empty.connections.length, 0);
      assert.equal(empty.posts.length, 0);
      assert.equal(
        (
          await call(`posts/${partial.id}`, 'PATCH', {
            title: 'Forbidden',
            message: 'Forbidden',
            version: 1,
            connectionIds: [],
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await call('posts', 'POST', {
            title: 'Forbidden',
            message: 'Forbidden',
            connectionIds: [connectionIds[0]],
          })
        ).status,
        400,
      );
      const secondConnect = await call('facebook/connect');
      const secondLocation = new URL(secondConnect.headers.get('location'));
      const secondCallback = await call(
        `facebook/callback?state=${secondLocation.searchParams.get('state')}&code=second-user`,
      );
      assert.equal(
        secondCallback.headers.get('location'),
        'https://local.test/?connect=success',
      );
      const secondData = await (await call('bootstrap')).json();
      const firstPage = data.connections.find((c) => c.remote_id === '101');
      const commentsBase = `connections/${firstPage.id}`;
      assert.equal((await call(`${commentsBase}/facebook-posts`)).status, 404);
      assert.equal((await call(`${commentsBase}/check`, 'POST')).status, 404);
      assert.equal(
        (await call(`facebook/connect?guided=1&connectionId=${firstPage.id}`))
          .status,
        404,
      );
      assert.equal(
        (await call(`${commentsBase}/comments?postId=101_777`)).status,
        404,
      );
      assert.equal(
        (
          await call(`${commentsBase}/comments/777_501`, 'PATCH', {
            postId: '101_777',
            isHidden: true,
          })
        ).status,
        404,
      );
      assert.deepEqual(secondData.connections.map((c) => c.remote_id).sort(), [
        '201',
        '202',
      ]);
      assert.equal(
        (
          await call('posts', 'POST', {
            title: 'Second user draft',
            message: 'Private content',
            connectionIds: secondData.connections.map((c) => c.id),
          })
        ).status,
        201,
      );
      cookie = ownerCookie;
      const ownerData = await (await call('bootstrap')).json();
      assert.equal(ownerData.connections.length, 4);
      assert.equal(
        ownerData.posts.some((p) => p.title === 'Second user draft'),
        false,
      );
      const fbPosts = await (
        await call(`${commentsBase}/facebook-posts`)
      ).json();
      assert.equal(fbPosts.items[0].id, '101_777');
      assert.equal(fbPosts.nextCursor, 'posts-next');
      assert.equal(JSON.stringify(fbPosts).includes('DO_NOT_DISCLOSE'), false);
      const commentList = await (
        await call(`${commentsBase}/comments?postId=101_777`)
      ).json();
      assert.equal(commentList.items[0].message, 'Customer question');
      assert.equal(commentList.items[0].canEdit, false);
      assert.equal(commentList.nextCursor, 'comments-next');
      assert.equal(
        JSON.stringify(commentList).includes('DO_NOT_DISCLOSE'),
        false,
      );
      assert.equal(
        (await call(`${commentsBase}/comments?postId=201_777`)).status,
        400,
      );
      assert.equal(
        (await call(`${commentsBase}/comments/888_501`, 'DELETE', undefined))
          .status,
        400,
      );
      assert.equal(
        (
          await call(
            `${commentsBase}/comments/888_501?postId=101_777`,
            'DELETE',
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await call(`${commentsBase}/comments/777_501`, 'PATCH', {
            postId: '101_777',
            message: 'Cannot edit visitor',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            `${commentsBase}/comments/777_503?postId=101_777`,
            'DELETE',
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(`${commentsBase}/comments/777_503/replies`, 'POST', {
            postId: '101_777',
            message: 'No reply permission',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call(`${commentsBase}/comments`, 'POST', {
            postId: '101_777',
            message: '   ',
          })
        ).status,
        400,
      );
      assert.equal(
        commentWrites.length,
        0,
        'invalid and unauthorized operations must never write to Facebook',
      );
      assert.equal(
        (await call(`${commentsBase}/comments/777_501/replies?postId=101_777`))
          .status,
        200,
      );
      assert.equal(
        (
          await call(`${commentsBase}/comments`, 'POST', {
            postId: '101_777',
            message: 'Page comment',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(`${commentsBase}/comments/777_501/replies`, 'POST', {
            postId: '101_777',
            message: 'Page reply',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(`${commentsBase}/comments/777_502`, 'PATCH', {
            postId: '101_777',
            message: 'Edited by Page',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(`${commentsBase}/comments/777_501`, 'PATCH', {
            postId: '101_777',
            isHidden: true,
          })
        ).status,
        200,
      );
      const hiddenList = await (
        await call(
          `${commentsBase}/comments?postId=101_777&after=comments-next`,
        )
      ).json();
      assert.equal(hiddenList.items[0].hidden, true);
      assert.equal(
        (
          await call(`${commentsBase}/comments/777_501`, 'PATCH', {
            postId: '101_777',
            isHidden: false,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            `${commentsBase}/comments/777_501?postId=101_777`,
            'DELETE',
          )
        ).status,
        200,
      );
      assert.deepEqual(
        commentWrites.map((w) => [w.method, w.values]),
        [
          ['POST', { message: 'Page comment' }],
          ['POST', { message: 'Page reply' }],
          ['POST', { message: 'Edited by Page' }],
          ['POST', { is_hidden: 'true' }],
          ['POST', { is_hidden: 'false' }],
          ['DELETE', {}],
        ],
      );
      const activityAfter = await (await call('bootstrap')).json();
      assert.equal(
        activityAfter.activity.some((a) =>
          a.message.includes('Đã xóa bình luận'),
        ),
        true,
      );
      for (const [mode, status] of [
        ['ready', 'ready'],
        ['limited', 'ready'],
        ['posting-denied', 'limited'],
        ['expired', 'expired'],
        ['denied', 'unknown'],
        ['wrong-app', 'unavailable'],
        ['wrong-page', 'unavailable'],
        ['no-scopes', 'unknown'],
        ['granular', 'ready'],
        ['bad-app', 'configuration_required'],
      ]) {
        diagnosticMode = mode;
        const checked = await (
          await call(`${commentsBase}/check`, 'POST')
        ).json();
        assert.equal(checked.status, status, mode);
        assert.equal(checked.connectionId, firstPage.id);
        assert.equal(JSON.stringify(checked).includes('page-token-'), false);
        assert.equal(
          JSON.stringify(checked).includes('local-test-secret'),
          false,
        );
        assert.equal(
          JSON.stringify(checked).includes('NEVER_ECHO_THIS_TOKEN'),
          false,
        );
        if (mode === 'limited') {
          assert.equal(checked.postingReady, true);
          assert.equal(checked.commentsReady, false);
        }
        if (mode === 'posting-denied')
          assert.equal(checked.postingReady, false);
        if (mode === 'no-scopes' || mode === 'denied')
          assert.equal(
            checked.permissions.every((p) => p.granted === null),
            true,
            'unverified permissions must not be labeled missing',
          );
        if (mode === 'granular')
          assert.equal(
            checked.permissions.find((p) => p.key === 'pages_manage_engagement')
              .granted,
            false,
          );
      }
      diagnosticMode = 'ready';
      const beforeReconnect = await (await call('bootstrap')).json();
      const guided = await call(
        `facebook/connect?guided=1&connectionId=${firstPage.id}`,
      );
      const guidedLocation = new URL(guided.headers.get('location'));
      assert.equal(guidedLocation.searchParams.get('auth_type'), 'rerequest');
      const guidedState = guidedLocation.searchParams.get('state');
      const tampered =
        guidedState.slice(0, -1) + (guidedState.endsWith('A') ? 'B' : 'A');
      assert.equal(
        (await call(`facebook/callback?state=${tampered}&code=local-test-code`))
          .status,
        400,
      );
      const guidedCallback = await call(
        `facebook/callback?state=${guidedState}&code=local-test-code`,
      );
      const guidedReturn = new URL(guidedCallback.headers.get('location'));
      assert.equal(guidedReturn.searchParams.get('connect'), 'success');
      assert.equal(guidedReturn.searchParams.get('wizard'), '1');
      assert.equal(guidedReturn.searchParams.get('connectionId'), firstPage.id);
      const afterReconnect = await (await call('bootstrap')).json();
      assert.equal(
        afterReconnect.connections.find((c) => c.remote_id === '101').id,
        firstPage.id,
      );
      assert.deepEqual(afterReconnect.posts, beforeReconnect.posts);
      const missingConnect = await call(
        `facebook/connect?guided=1&connectionId=${firstPage.id}`,
      );
      const missingState = new URL(
        missingConnect.headers.get('location'),
      ).searchParams.get('state');
      const missingReturn = await call(
        `facebook/callback?state=${missingState}&code=second-user`,
      );
      assert.equal(
        new URL(missingReturn.headers.get('location')).searchParams.get(
          'connect',
        ),
        'page_missing',
      );
      assert.equal(
        (await (await call('bootstrap')).json()).connections.length,
        4,
      );
      for (const reason of [
        'token_exchange_failed',
        'token_refresh_failed',
        'pages_fetch_failed',
      ]) {
        oauthFailure = reason;
        const retry = await call(
          `facebook/connect?guided=1&connectionId=${firstPage.id}`,
        );
        const retryState = new URL(
          retry.headers.get('location'),
        ).searchParams.get('state');
        const failed = await call(
          `facebook/callback?state=${retryState}&code=local-test-code`,
        );
        assert.equal(failed.status, 302);
        const result = new URL(failed.headers.get('location'));
        assert.equal(result.searchParams.get('connect'), 'failed');
        assert.equal(result.searchParams.get('reason'), reason);
        assert.equal(result.searchParams.get('wizard'), '1');
        assert.equal(result.searchParams.get('connectionId'), firstPage.id);
        assert.equal(result.href.includes('NEVER_ECHO_THIS_TOKEN'), false);
        assert.equal(
          (
            await call(
              `facebook/callback?state=${retryState}&code=local-test-code`,
            )
          ).status,
          400,
        );
        const preserved = await (await call('bootstrap')).json();
        assert.deepEqual(preserved.connections, afterReconnect.connections);
        assert.deepEqual(preserved.posts, afterReconnect.posts);
      }
    } finally {
      await mf.dispose();
    }
  },
);
