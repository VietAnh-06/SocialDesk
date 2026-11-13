import { test, expect, type Page } from '@playwright/test';

const permissions = [
  ['pages_show_list', 'Tìm Fanpage bạn quản lý', 'connect'],
  ['pages_read_engagement', 'Đọc bài viết của Fanpage', 'posts'],
  ['pages_manage_posts', 'Đăng, sửa và xóa bài viết', 'posts'],
  ['pages_read_user_content', 'Đọc bình luận của người theo dõi', 'comments'],
  ['pages_manage_engagement', 'Trả lời, ẩn và xóa bình luận', 'comments'],
];

test('new users see the guide automatically and can reopen it from the dashboard or menu', async ({
  page,
}) => {
  await mockWizard(page, true, 'none');
  await page.goto('/');
  const wizard = page.getByRole('dialog', {
    name: 'Hướng dẫn kết nối Facebook',
  });
  await expect(wizard).toBeVisible();
  await expect(
    wizard.getByRole('heading', { name: 'Bắt đầu kết nối Fanpage' }),
  ).toBeVisible();
  await expect(
    wizard.getByText('Mã ứng dụng Facebook', { exact: true }),
  ).not.toBeVisible();
  await expect(
    wizard.locator('code').filter({ hasText: 'http://localhost' }),
  ).not.toBeVisible();
  await page.screenshot({ path: 'artifacts/friendly-guide-auto-open.png' });
  await wizard.getByRole('button', { name: 'Để sau', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
  await expect(wizard).not.toBeVisible();
  await page
    .getByRole('button', { name: 'Bắt đầu hướng dẫn', exact: false })
    .click();
  await expect(wizard).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Hướng dẫn kết nối', exact: true })
    .click();
  await expect(wizard).toBeVisible();
});

test('signing in with only a personal profile still opens the Fanpage guide', async ({
  page,
}) => {
  await mockWizard(page, true, 'profile', false);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('demo@example.com');
  await page.locator('input[name="password"]').fill('Local-password-123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const wizard = page.getByRole('dialog', {
    name: 'Hướng dẫn kết nối Facebook',
  });
  await expect(wizard).toBeVisible();
  await expect(
    wizard.getByRole('heading', { name: 'Bắt đầu kết nối Fanpage' }),
  ).toBeVisible();
  await expect(
    wizard.getByText('Dành cho người cài đặt', { exact: true }),
  ).toBeVisible();
  await expect(
    wizard.getByText('Mã ứng dụng Facebook', { exact: true }),
  ).not.toBeVisible();
});
async function mockWizard(
  page: Page,
  ready = true,
  connectionKind: 'page' | 'profile' | 'none' = 'page',
  signedIn = true,
) {
  let status = 'limited';
  const requests: string[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/', '');
    const send = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    if (path === 'auth/me' && !signedIn)
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Vui lòng đăng nhập để tiếp tục.' }),
      });
    if (path === 'auth/login') {
      signedIn = true;
      return send({
        user: { id: 'test', name: 'An Gold', email: 'demo@example.com' },
      });
    }
    if (path === 'auth/me')
      return send({
        user: { id: 'test', name: 'An Gold', email: 'demo@example.com' },
      });
    if (path === 'bootstrap')
      return send({
        user: { id: 'test', name: 'An Gold', email: 'demo@example.com' },
        connections:
          connectionKind === 'none'
            ? []
            : [
                {
                  id: 'page-one',
                  name: 'Fanpage của An',
                  kind: connectionKind,
                  remote_id: '101',
                  url: 'https://www.facebook.com/101',
                },
              ],
        posts: [],
        targets: [],
        activity: [],
        config: {
          oauthReady: ready,
          callbackUrl: 'http://localhost:8787/api/facebook/callback',
          graphVersion: 'v25.0',
        },
      });
    if (path === 'facebook/setup')
      return send({
        ready,
        appId: '1496006092516967',
        callbackUrl: 'http://localhost:8787/api/facebook/callback',
        callbackVerified: false,
        checks: [
          {
            key: 'appId',
            label: 'Mã ứng dụng Facebook',
            ok: true,
            message: 'Đã có mã ứng dụng.',
          },
          {
            key: 'appSecret',
            label: 'Thông tin xác thực ứng dụng',
            ok: ready,
            message: ready
              ? 'Đã lưu thông tin trên máy.'
              : 'Máy này chưa có App Secret. Chạy CAU-HINH.cmd để nhập, sau đó mở lại CHAY-LOCAL.cmd.',
          },
          {
            key: 'encryption',
            label: 'Bảo vệ thông tin kết nối',
            ok: true,
            message: 'Khóa mã hóa đã sẵn sàng.',
          },
          {
            key: 'callback',
            label: 'Địa chỉ quay lại ứng dụng',
            ok: true,
            message: 'Cần đăng ký đúng địa chỉ trong Meta App.',
          },
        ],
      });
    if (path === 'connections/page-one/check') {
      requests.push(path);
      return send({
        connectionId: 'page-one',
        checkedAt: Date.now(),
        status,
        title:
          status === 'ready'
            ? 'Đã xác minh kết nối'
            : status === 'unknown'
              ? 'Chưa xác minh được kết nối'
              : 'Cần cấp thêm quyền',
        message:
          status === 'ready'
            ? 'Đã được cấp các quyền cần dùng.'
            : status === 'unknown'
              ? 'Facebook chưa trả đủ thông tin. Hãy kiểm tra lại.'
              : 'Facebook chưa cấp đủ quyền quản lý bình luận. Kết nối lại để cấp thêm quyền.',
        identityVerified: true,
        expiresAt: null,
        postingReady: status === 'unknown' ? null : true,
        commentsReady: status === 'unknown' ? null : status === 'ready',
        permissions: permissions.map(([key, label, group]) => ({
          key,
          label,
          group,
          granted:
            status === 'unknown'
              ? null
              : status === 'ready' || group !== 'comments',
        })),
      });
    }
    if (path === 'facebook/connect') {
      requests.push(req.url());
      return route.fulfill({
        status: 302,
        headers: {
          location: '/?connect=success&wizard=1&connectionId=page-one',
        },
        body: '',
      });
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: path }),
    });
  });
  return {
    requests,
    setStatus: (value: string) => {
      status = value;
    },
  };
}

test('missing setup is actionable and cannot advance; wizard fits a small viewport', async ({
  page,
}) => {
  await mockWizard(page, false);
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Tài khoản kết nối', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Kết nối Facebook', exact: false })
    .click();
  const wizard = page.getByRole('dialog', {
    name: 'Hướng dẫn kết nối Facebook',
  });
  await expect(
    wizard.getByRole('heading', { name: 'Bắt đầu kết nối Fanpage' }),
  ).toBeVisible();
  await expect(
    wizard.getByText('Máy này cần được người cài đặt thiết lập', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    wizard.getByRole('button', { name: 'Bắt đầu kết nối' }),
  ).toBeDisabled();
  await expect(
    wizard.getByRole('button', { name: 'Bắt đầu kết nối' }),
  ).toBeInViewport();
  await wizard.getByText('Dành cho người cài đặt', { exact: true }).click();
  await expect(wizard.locator('.copy-field')).toContainText(
    'http://localhost:8787/api/facebook/callback',
  );
  const box = (await wizard.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(640);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'artifacts/wizard-missing-config-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(wizard).not.toBeVisible();
});

test('wizard completes OAuth round trip, explains missing permissions and reconnects the selected Page', async ({
  page,
}) => {
  const mock = await mockWizard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Tài khoản kết nối', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Kết nối Facebook', exact: false })
    .click();
  const wizard = page.getByRole('dialog', {
    name: 'Hướng dẫn kết nối Facebook',
  });
  await expect(
    wizard.getByText('Đã sẵn sàng để bắt đầu', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/wizard-step-one.png' });
  await wizard.getByRole('button', { name: 'Bắt đầu kết nối' }).click();
  await expect(
    wizard.getByRole('heading', { name: 'Chọn Fanpage bạn muốn quản lý' }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/wizard-step-two.png' });
  await wizard
    .getByRole('link', { name: 'Mở Facebook và chọn Fanpage' })
    .click();
  await expect(
    wizard.getByRole('heading', { name: 'Hoàn tất kết nối' }),
  ).toBeVisible();
  await expect(
    wizard.getByText('Cho phép thêm chức năng', { exact: true }),
  ).toBeVisible();
  await expect(wizard.getByText('Chưa cấp', { exact: true })).toHaveCount(2);
  await page.screenshot({
    path: 'artifacts/wizard-step-three-permissions.png',
  });
  await wizard
    .getByRole('button', { name: 'Cho phép thêm quyền', exact: true })
    .click();
  await expect(
    wizard.getByRole('heading', { name: 'Kết nối lại Fanpage của An' }),
  ).toBeVisible();
  const reconnect = wizard.getByRole('link', {
    name: 'Đăng nhập lại trên Facebook',
  });
  await expect(reconnect).toHaveAttribute(
    'href',
    '/api/facebook/connect?guided=1&connectionId=page-one',
  );
  mock.setStatus('ready');
  await reconnect.click();
  await expect(
    wizard.getByText('Fanpage đã sẵn sàng', { exact: true }),
  ).toBeVisible();
  await wizard
    .getByRole('button', { name: 'Bắt đầu sử dụng', exact: true })
    .click();
  await expect(wizard).not.toBeVisible();
  await expect(page.locator('.account-card .pill')).toContainText(
    'Đã xác minh kết nối',
  );
  expect(
    mock.requests.filter((path) => path.includes('facebook/connect')),
  ).toHaveLength(2);
});

test('unverified permissions remain unknown; checking and reconnecting are available from a Page card', async ({
  page,
}) => {
  const mock = await mockWizard(page);
  mock.setStatus('unknown');
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Tài khoản kết nối', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Kiểm tra kết nối', exact: true })
    .click();
  const wizard = page.getByRole('dialog', {
    name: 'Hướng dẫn kết nối Facebook',
  });
  await expect(
    wizard.getByText('Chưa kiểm tra được kết nối', { exact: true }),
  ).toBeVisible();
  await expect(wizard.getByText('Chưa cấp', { exact: true })).toHaveCount(0);
  await expect(wizard.getByText('Chưa xác minh', { exact: true })).toHaveCount(
    5,
  );
  mock.setStatus('ready');
  await wizard
    .getByRole('button', { name: 'Kiểm tra lại Fanpage', exact: true })
    .click();
  await expect(
    wizard.getByText('Fanpage đã sẵn sàng', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Kết nối lại', exact: true }).click();
  await expect(
    wizard.getByRole('heading', { name: 'Bắt đầu kết nối Fanpage' }),
  ).toBeVisible();
});

test('cancelled Facebook authorization returns to step two with recovery guidance', async ({
  page,
}) => {
  await mockWizard(page);
  await page.goto('/?connect=cancelled&wizard=1&connectionId=page-one');
  const wizard = page.getByRole('dialog', {
    name: 'Hướng dẫn kết nối Facebook',
  });
  await expect(
    wizard.getByRole('alert').filter({ hasText: 'Bạn đã hủy' }),
  ).toContainText('Bạn đã hủy hoặc chưa đồng ý cấp quyền');
  await expect(
    wizard.getByRole('link', { name: 'Đăng nhập lại trên Facebook' }),
  ).toBeVisible();
  await wizard.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(
    wizard.getByRole('heading', { name: 'Bắt đầu kết nối Fanpage' }),
  ).toBeVisible();
});
