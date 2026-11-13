import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function mockWorkspace(page: Page, connected = true) {
  const now = Date.now();
  const operations: {
    method: string;
    path: string;
    body: Record<string, unknown>;
  }[] = [];
  let comments = [
    {
      id: '500_1',
      author: 'Nguyễn Lan',
      authorId: '901',
      message: 'Mình muốn tìm hiểu thêm thông tin.',
      createdTime: '2026-11-12T07:00:00Z',
      hidden: false,
      canHide: true,
      canDelete: true,
      canReply: true,
      canEdit: false,
      replyCount: 1,
      likeCount: 3,
      url: '',
    },
    {
      id: '500_2',
      author: 'SocialDesk Demo',
      authorId: '101',
      message: 'Chào bạn, Fanpage luôn sẵn sàng hỗ trợ.',
      createdTime: '2026-11-12T07:05:00Z',
      hidden: false,
      canHide: true,
      canDelete: true,
      canReply: true,
      canEdit: true,
      replyCount: 0,
      likeCount: 1,
      url: '',
    },
    {
      id: '500_3',
      author: 'Bình luận ẩn',
      authorId: '903',
      message: 'Nội dung cần kiểm duyệt.',
      createdTime: '2026-11-12T07:06:00Z',
      hidden: true,
      canHide: true,
      canDelete: true,
      canReply: true,
      canEdit: false,
      replyCount: 0,
      likeCount: 0,
      url: '',
    },
  ];
  const data = {
    user: { id: 'ui-user', name: 'An Gold', email: 'demo@example.com' },
    connections: connected
      ? [
          {
            id: 'page-one',
            name: 'SocialDesk Demo',
            kind: 'page',
            remote_id: '101',
            url: 'https://www.facebook.com/101',
          },
        ]
      : [],
    posts: connected
      ? [
          {
            id: 'local-post',
            title: 'Câu chuyện tháng Mười Một',
            message: 'Mỗi cuộc trò chuyện đều bắt đầu từ một lời chào.',
            image_url: null,
            media_id: null,
            version: 1,
            created_at: now,
            updated_at: now,
          },
        ]
      : [],
    targets: connected
      ? [
          {
            id: 'target-one',
            post_id: 'local-post',
            connection_id: 'page-one',
            status: 'published',
            name: 'SocialDesk Demo',
            kind: 'page',
            url: 'https://www.facebook.com/101',
            remote_id: '101_500',
            remote_url: 'https://www.facebook.com/101_500',
            published_version: 1,
            error: null,
          },
        ]
      : [],
    activity: [
      {
        id: 'activity-one',
        message: 'Đã lưu nội dung “Câu chuyện tháng Mười Một”.',
        created_at: now,
      },
    ],
    config: {
      oauthReady: false,
      callbackUrl: 'http://localhost:8787/api/facebook/callback',
      graphVersion: 'v25.0',
    },
  };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/', '');
    const method = req.method();
    const body = req.postDataJSON() as Record<string, unknown> | null;
    const send = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    if (path === 'auth/me') return send({ user: data.user });
    if (path === 'bootstrap') return send(data);
    if (path === 'connections/page-one/facebook-posts')
      return send({
        items: [
          {
            id: '101_500',
            message: data.posts[0]?.message,
            createdTime: '2026-11-12T07:00:00Z',
            url: 'https://www.facebook.com/101_500',
          },
        ],
        nextCursor: null,
      });
    if (path === 'connections/page-one/comments' && method === 'GET')
      return send({
        items: comments,
        nextCursor: url.searchParams.has('after') ? null : 'next-comments',
      });
    if (
      path === 'connections/page-one/comments/500_1/replies' &&
      method === 'GET'
    )
      return send({
        items: [
          { ...comments[1], id: '500_9', message: 'Cảm ơn bạn đã quan tâm.' },
        ],
        nextCursor: null,
      });
    if (path.startsWith('connections/page-one/comments') && method !== 'GET') {
      operations.push({ method, path, body: body || {} });
      const commentId = path.split('/')[3];
      if (method === 'DELETE')
        comments = comments.filter((c) => c.id !== commentId);
      if (method === 'PATCH')
        comments = comments.map((c) =>
          c.id === commentId
            ? {
                ...c,
                ...(typeof body?.isHidden === 'boolean'
                  ? { hidden: body.isHidden }
                  : { message: String(body?.message) }),
              }
            : c,
        );
      return send({ ok: true, message: 'Đã cập nhật bình luận.' });
    }
    if (path === 'auth/logout') return send({ ok: true });
    return send({ error: 'Unexpected test request: ' + path }, 404);
  });
  return { operations };
}

test('sidebar and existing dialogs fit short desktop viewports; dashboard shortcuts and CSV work', async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 1280, height: 620 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
  const userMenu = page.locator('.sidebar .user-menu');
  await expect(userMenu).toBeInViewport();
  expect(
    (await userMenu.boundingBox())!.y + (await userMenu.boundingBox())!.height,
  ).toBeLessThanOrEqual(620);
  await page.getByRole('button', { name: 'Xem tổng bài viết' }).click();
  await expect(
    page.getByRole('heading', { name: 'Thư viện bài viết' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Tạo bài viết', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThan(10);
  expect(box.x + box.width).toBeLessThan(1280);
  expect(box.y).toBeGreaterThanOrEqual(0);
  await page.getByRole('button', { name: 'Đóng cửa sổ', exact: true }).click();
  await page
    .getByRole('button', { name: 'Nhật ký hoạt động', exact: true })
    .click();
  await page.getByLabel('Tìm hoạt động').fill('không tồn tại');
  await expect(
    page.getByRole('heading', { name: 'Không tìm thấy hoạt động' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất nhật ký CSV' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    'socialdesk-nhat-ky.csv',
  );
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({
    path: 'artifacts/sidebar-short-screen.png',
    fullPage: true,
  });
});

test('comments UI searches, filters, loads replies, adds, replies, edits, hides and deletes with confirmation', async ({
  page,
}) => {
  const { operations } = await mockWorkspace(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Bình luận Câu chuyện tháng Mười Một',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Hộp thư bình luận' }),
  ).toBeVisible();
  await expect(
    page.getByText('Mình muốn tìm hiểu thêm thông tin.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Đã ẩn', exact: true }).click();
  await expect(
    page.getByText('Nội dung cần kiểm duyệt.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Mình muốn tìm hiểu thêm thông tin.', { exact: true }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'Tất cả', exact: true }).click();
  await page.getByLabel('Tìm bình luận', { exact: true }).fill('Nguyễn Lan');
  const visitor = page.getByRole('article', {
    name: 'Bình luận của Nguyễn Lan',
    exact: true,
  });
  await expect(visitor).toBeVisible();
  await expect(
    visitor.getByRole('button', { name: 'Sửa', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Tìm bình luận', { exact: true }).fill('');
  await visitor.getByRole('button', { name: 'Xem 1 phản hồi' }).click();
  await expect(
    page.getByText('Cảm ơn bạn đã quan tâm.', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'artifacts/comments-desktop.png',
    fullPage: true,
  });
  await visitor
    .getByRole('button', { name: 'Trả lời', exact: true })
    .first()
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Nội dung bình luận')
    .fill('Fanpage xin chào bạn.');
  await page
    .getByRole('button', { name: 'Gửi bình luận', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(operations.at(-1)?.path).toContain('/500_1/replies');
  await page
    .getByRole('button', { name: 'Viết bình luận', exact: false })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Nội dung bình luận')
    .fill('Bình luận mới của Fanpage.');
  await page
    .getByRole('button', { name: 'Gửi bình luận', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const own = page.getByRole('article', {
    name: 'Bình luận của SocialDesk Demo',
    exact: true,
  });
  await own.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Nội dung bình luận')
    .fill('Nội dung Fanpage đã sửa.');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(
    own.getByText('Nội dung Fanpage đã sửa.', { exact: true }),
  ).toBeVisible();
  await visitor
    .getByRole('button', { name: 'Ẩn bình luận', exact: true })
    .click();
  await expect(visitor.getByText('Đã ẩn', { exact: true })).toBeVisible();
  await visitor.getByRole('button', { name: 'Hiện lại', exact: true }).click();
  await expect(visitor.getByText('Đã ẩn', { exact: true })).not.toBeVisible();
  await visitor.getByRole('button', { name: 'Xóa', exact: true }).click();
  const beforeDelete = operations.length;
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  expect(operations.length).toBe(beforeDelete);
  await visitor.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page
    .getByRole('button', { name: 'Xóa trên Facebook', exact: true })
    .click();
  await expect(visitor).not.toBeVisible();
  expect(operations.at(-1)?.method).toBe('DELETE');
  await page
    .getByRole('button', { name: 'Tải thêm bình luận', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Tải thêm bình luận', exact: true }),
  ).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 700 });
  await page.screenshot({
    path: 'artifacts/comments-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await own.getByRole('button', { name: 'Sửa', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  const box = (await modal.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(
    modal.getByRole('button', { name: 'Lưu thay đổi' }),
  ).toBeInViewport();
  await page.screenshot({ path: 'artifacts/comment-editor-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('comments onboarding opens account connection and permission errors can be retried', async ({
  page,
}) => {
  await mockWorkspace(page, false);
  await page.goto('/');
  await expect(
    page.getByRole('dialog', { name: 'Hướng dẫn kết nối Facebook' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Để sau', exact: true }).click();
  await page.getByRole('button', { name: 'Bình luận', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Mọi cuộc trò chuyện, một nơi quản lý' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Kết nối Fanpage', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tài khoản kết nối', exact: true }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await mockWorkspace(page);
  let fail = true;
  await page.route('**/api/connections/page-one/comments?*', (route) =>
    route.fulfill({
      status: fail ? 400 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        fail
          ? {
              error:
                'Chưa đủ quyền quản lý bình luận. Hãy kết nối lại Fanpage.',
            }
          : { items: [], nextCursor: null },
      ),
    }),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Bình luận', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Chưa tải được bình luận' }),
  ).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Chưa có bình luận', exact: true }),
  ).toBeVisible();
});
