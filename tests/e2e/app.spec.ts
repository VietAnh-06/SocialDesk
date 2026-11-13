import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('authentication, ownership, draft CRUD, manual workflow and upload permissions', async ({
  playwright,
}) => {
  const baseURL = 'http://localhost:8787';
  const a = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  const b = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
  });
  const guest = await playwright.request.newContext({ baseURL });
  const nonce = `${Date.now()}-api`;
  expect((await guest.get('/api/bootstrap')).status()).toBe(401);
  expect((await guest.get('/api/facebook/setup')).status()).toBe(401);
  expect(
    (
      await guest.post('/api/auth/register', {
        data: {
          name: 'Blocked',
          email: `${nonce}-csrf@example.com`,
          password: 'Test-password-12345',
        },
      })
    ).status(),
  ).toBe(403);
  for (const [ctx, label] of [
    [a, 'a'],
    [b, 'b'],
  ] as const) {
    const r = await ctx.post('/api/auth/register', {
      data: {
        name: `Tester ${label}`,
        email: `${nonce}-${label}@example.com`,
        password: 'Test-password-12345',
      },
    });
    expect(r.status()).toBe(200);
    const cookie = r.headers()['set-cookie'];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  }
  expect(
    (await a.get('/api/facebook/connect', { maxRedirects: 0 })).status(),
  ).toBe(503);
  const setup = await (await a.get('/api/facebook/setup')).json();
  expect(setup.ready).toBe(false);
  expect(
    setup.checks.find((check: { key: string }) => check.key === 'appSecret').ok,
  ).toBe(false);
  expect(setup.callbackVerified).toBe(false);
  expect(setup.callbackUrl).toBe('http://localhost:8787/api/facebook/callback');
  const csrf = await a.get(
    '/api/facebook/callback?code=untrusted&state=wrong',
    { maxRedirects: 0 },
  );
  expect([400, 503]).toContain(csrf.status());
  expect(
    (
      await a.post('/api/connections', {
        data: {
          name: 'Unsafe',
          kind: 'profile',
          url: 'https://facebook.com.evil.example/',
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await a.post('/api/connections', {
        data: {
          name: 'Cá nhân thử',
          kind: 'profile',
          url: `https://www.facebook.com/test-${nonce}`,
        },
      })
    ).status(),
  ).toBe(201);
  const data = await (await a.get('/api/bootstrap')).json();
  const cid = data.connections[0].id;
  expect(data.connections[0].credential).toBeUndefined();
  expect(
    (
      await b.post('/api/posts', {
        data: { title: 'Forbidden', message: 'test', connectionIds: [cid] },
      })
    ).status(),
  ).toBe(400);
  const created = await a.post('/api/posts', {
    data: {
      title: 'Bản nháp kiểm tra',
      message: 'Nội dung thử nghiệm cục bộ',
      connectionIds: [cid],
    },
  });
  expect(created.status()).toBe(201);
  const pid = (await created.json()).id;
  expect(
    (
      await b.patch(`/api/posts/${pid}`, {
        data: { title: 'Hacked', message: 'No', version: 1 },
      })
    ).status(),
  ).toBe(404);
  expect((await b.delete(`/api/posts/${pid}`)).status()).toBe(404);
  expect(
    (
      await a.patch(`/api/posts/${pid}`, {
        data: {
          title: 'Đã sửa',
          message: 'Bản mới',
          version: 1,
          connectionIds: [cid],
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await a.patch(`/api/posts/${pid}`, {
        data: {
          title: 'Sửa cũ',
          message: 'Không được ghi đè',
          version: 1,
          connectionIds: [cid],
        },
      })
    ).status(),
  ).toBe(409);
  const after = await (await a.get('/api/bootstrap')).json();
  const tid = after.targets.find(
    (t: { post_id: string }) => t.post_id === pid,
  ).id;
  const result = await a.post(`/api/posts/${pid}/publish`, {
    data: { targetIds: [tid] },
  });
  expect((await result.json()).outcomes[0].status).toBe('manual');
  expect(
    (
      await a.post(`/api/posts/${pid}/manual`, {
        data: {
          targetId: tid,
          action: 'published',
          url: 'https://www.facebook.com/test/posts/123',
        },
      })
    ).status(),
  ).toBe(200);
  expect((await a.delete(`/api/posts/${pid}`)).status()).toBe(409);
  expect(
    (
      await a.post(`/api/posts/${pid}/manual`, {
        data: { targetId: tid, action: 'deleted' },
      })
    ).status(),
  ).toBe(200);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDaQAAAAASUVORK5CYII=',
    'base64',
  );
  const upload = await a.post('/api/media', {
    multipart: {
      file: { name: 'image.png', mimeType: 'image/png', buffer: png },
    },
  });
  expect(upload.status()).toBe(201);
  const mid = (await upload.json()).id;
  expect((await a.get(`/api/media/${mid}`)).headers()['content-type']).toBe(
    'image/png',
  );
  expect((await b.get(`/api/media/${mid}`)).status()).toBe(404);
  expect(
    (
      await a.post('/api/media', {
        multipart: {
          file: {
            name: 'bad.png',
            mimeType: 'image/png',
            buffer: Buffer.from('<script>alert(1)</script>'),
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect((await a.delete(`/api/posts/${pid}`)).status()).toBe(200);
  expect((await a.delete(`/api/connections/${cid}`)).status()).toBe(200);
  await a.post('/api/auth/logout');
  expect((await a.get('/api/bootstrap')).status()).toBe(401);
  expect(
    (
      await a.post('/api/auth/login', {
        data: {
          email: `${nonce}-a@example.com`,
          password: 'incorrect-password-123',
        },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await a.post('/api/auth/login', {
        data: {
          email: `${nonce}-a@example.com`,
          password: 'Test-password-12345',
        },
      })
    ).status(),
  ).toBe(200);
  const isolated = await (await b.get('/api/bootstrap')).json();
  expect(isolated.posts).toEqual([]);
  expect(isolated.connections).toEqual([]);
  await Promise.all([a.dispose(), b.dispose(), guest.dispose()]);
});

test('desktop and mobile UI: registration, compose, search, settings and logout', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mkdir('artifacts', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Rất vui được gặp lại bạn' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.screenshot({
    path: 'public/screenshot.jpeg',
    type: 'jpeg',
    quality: 90,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'artifacts/login-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Tạo tài khoản mới', exact: true })
    .click();
  await page.getByLabel('Tên của bạn').fill('Nguyễn An');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`${Date.now()}-ui@example.com`);
  await page.locator('input[name="password"]').fill('Local-UI-password-123');
  await page
    .getByRole('button', { name: 'Tạo tài khoản', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Hướng dẫn kết nối Facebook' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Để sau', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
  await page.screenshot({
    path: 'artifacts/dashboard-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Tạo bài viết', exact: true })
    .first()
    .click();
  await page
    .getByPlaceholder('Đặt tên cho ý tưởng của bạn…')
    .fill('Chào ngày mới');
  await page
    .getByPlaceholder('Bạn muốn chia sẻ điều gì hôm nay?')
    .fill('Một ý tưởng nhỏ cho một ngày đầy cảm hứng.');
  await page.screenshot({
    path: 'artifacts/composer-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Chào ngày mới' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Bài viết', exact: false })
    .filter({ hasText: /^Bài viết/ })
    .first()
    .click();
  await page
    .getByRole('textbox', { name: 'Tìm bài viết' })
    .fill('không tồn tại');
  await expect(
    page.getByRole('heading', { name: 'Chưa có bài viết phù hợp' }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Tìm bài viết' }).fill('Chào');
  await expect(
    page.getByRole('heading', { name: 'Chào ngày mới' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Cài đặt kết nối', exact: true })
    .first()
    .click();
  await expect(page.locator('.copy-field')).toContainText(
    '/api/facebook/callback',
  );
  await page.screenshot({
    path: 'artifacts/settings-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Tổng quan', exact: true }).click();
  await page.screenshot({
    path: 'artifacts/dashboard-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Tạo bài viết', exact: true })
    .last()
    .click();
  await page
    .getByPlaceholder('Đặt tên cho ý tưởng của bạn…')
    .fill('Bài trên điện thoại');
  await page
    .getByPlaceholder('Bạn muốn chia sẻ điều gì hôm nay?')
    .fill('Nội dung từ điện thoại.');
  await page.screenshot({
    path: 'artifacts/composer-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Bài trên điện thoại' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Đăng xuất', exact: true })
    .last()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Rất vui được gặp lại bạn' }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/login-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
