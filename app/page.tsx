'use client';
/* oxlint-disable next/no-img-element -- Private media requires the user's session cookie; public URLs are intentionally loaded without an image proxy. */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CommentsPanel from './comments';
import ConnectionWizard, { type WizardRequest } from './connection-wizard';
import type { ConnectionHealth } from '../lib/connection-status';

type User = { id: string; name: string; email: string };
type Connection = {
  id: string;
  name: string;
  kind: 'page' | 'profile';
  remote_id: string;
  url: string;
};
type Post = {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  media_id: string | null;
  version: number;
  created_at: number;
  updated_at: number;
};
type Target = {
  id: string;
  post_id: string;
  connection_id: string;
  status: string;
  name: string;
  kind: string;
  url: string;
  error: string | null;
  remote_url: string | null;
  remote_id: string | null;
  published_version: number | null;
};
type Data = {
  user: User;
  connections: Connection[];
  posts: Post[];
  targets: Target[];
  activity: { id: string; message: string; created_at: number }[];
  config: { oauthReady: boolean; callbackUrl: string; graphVersion: string };
};
type Section =
  | 'overview'
  | 'posts'
  | 'comments'
  | 'accounts'
  | 'activity'
  | 'settings';
type IconName =
  | 'grid'
  | 'posts'
  | 'users'
  | 'clock'
  | 'settings'
  | 'plus'
  | 'arrow'
  | 'logout'
  | 'search'
  | 'check'
  | 'close'
  | 'image'
  | 'link'
  | 'edit'
  | 'trash'
  | 'send'
  | 'external'
  | 'copy'
  | 'lock'
  | 'refresh'
  | 'eye'
  | 'chevron'
  | 'comments'
  | 'alert';
const paths: Record<IconName, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  posts:
    'M8 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 7v12 M10 8h7 M10 12h7 M10 16h4',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M5 12h14 M14 7l5 5-5 5',
  logout: 'M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4',
  search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12 M18 6 6 18',
  image:
    'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1 M3 17l5-5 4 4 4-6 5 7 M8 7h.01',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  edit: 'M14 5l5 5 M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  send: 'M22 2 9 15 M22 2l-8 20-5-7-7-5z',
  external: 'M15 3h6v6 M21 3l-9 9 M10 3H3v18h18v-7',
  copy: 'M9 9h12v12H9z M15 9V3H3v12h6',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
  refresh: 'M20 7a9 9 0 1 0 1 9 M20 3v5h-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  chevron: 'M9 5l7 7-7 7',
  alert: 'M12 3 2 21h20z M12 9v5 M12 17h.01',
  comments: 'M21 11a8 8 0 0 1-8 8H8l-5 3 1.5-5A8 8 0 1 1 21 11 M8 9h8 M8 13h5',
};
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
const date = (time: number) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(time);
const statuses: Record<string, string> = {
  draft: 'Bản nháp',
  published: 'Đã đăng',
  manual: 'Chờ thao tác',
  manual_done: 'Đã xác nhận thủ công',
  failed: 'Đăng lỗi',
  processing: 'Đang xử lý',
  unknown: 'Cần đối chiếu',
  deleted: 'Đã xoá',
};
const published = (t: Target) =>
  ['published', 'manual_done'].includes(t.status);
async function api<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const options: RequestInit = {
    method,
    credentials: 'same-origin',
    headers:
      data instanceof FormData ? {} : { 'Content-Type': 'application/json' },
  };
  if (method !== 'GET' && method !== 'HEAD' && data !== undefined)
    options.body = data instanceof FormData ? data : JSON.stringify(data);
  const response = await fetch(`/api/${path}`, options);
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(
      result.error || 'Kết nối chưa thành công. Vui lòng thử lại.',
    );
  return result;
}
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span className={`avatar${small ? ' small' : ''}`}>
      {name
        .trim()
        .split(/\s+/)
        .slice(-2)
        .map((s) => s[0])
        .join('')
        .toUpperCase()}
    </span>
  );
}

export default function Home() {
  const [data, setData] = useState<Data | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [initialError, setInitialError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [toast, setToast] = useState('');
  const [compose, setCompose] = useState<Post | 'new' | null>(null);
  const [addAccount, setAddAccount] = useState(false);
  const [action, setAction] = useState<{
    post: Post;
    kind: 'publish' | 'sync' | 'remove' | 'delete';
  } | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [commentSelection, setCommentSelection] = useState<{
    connectionId: string;
    postId: string;
  } | null>(null);
  const [activitySearch, setActivitySearch] = useState('');
  const [removingConnection, setRemovingConnection] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [wizard, setWizard] = useState<WizardRequest | null>(null);
  const [connectionReports, setConnectionReports] = useState<
    Record<string, ConnectionHealth>
  >({});
  const offeredGuideTo = useRef('');
  function offerConnectionGuide(workspace: Data, signedIn = false) {
    if (workspace.connections.some((c) => c.kind === 'page')) return;
    const key = `socialdesk:connection-guide-v2:${workspace.user.id}`;
    let seen = offeredGuideTo.current === workspace.user.id;
    try {
      seen ||= sessionStorage.getItem(key) === 'seen';
    } catch {
      /* A guide still works when browser storage is unavailable. */
    }
    if (!signedIn && seen) return;
    offeredGuideTo.current = workspace.user.id;
    try {
      sessionStorage.setItem(key, 'seen');
    } catch {
      /* Keep the in-memory dismissal. */
    }
    setWizard((current) => current || { mode: 'connect' });
  }
  const onConnectionChecked = useCallback((report: ConnectionHealth) => {
    setConnectionReports((current) => ({
      ...current,
      [report.connectionId]: report,
    }));
  }, []);
  async function reload() {
    const result = await api<Data>('bootstrap');
    setData(result);
    return result;
  }
  useEffect(() => {
    const returningFromFacebook = new URLSearchParams(
      window.location.search,
    ).has('connect');
    api<{ user: User }>('auth/me')
      .then(async () => {
        const workspace = await reload();
        if (!returningFromFacebook) offerConnectionGuide(workspace);
      })
      .catch((e) => {
        if (!String(e.message).includes('đăng nhập'))
          setInitialError(e.message);
      })
      .finally(() => setLoaded(true));
    queueMicrotask(() => {
      const query = new URLSearchParams(window.location.search);
      const connection = query.get('connect');
      if (connection) {
        setSection('accounts');
        if (query.get('wizard') === '1')
          setWizard({
            mode: query.get('connectionId') ? 'reconnect' : 'connect',
            outcome: connection,
            reason: query.get('reason') || undefined,
            connectionId: query.get('connectionId') || undefined,
          });
        setToast(
          (
            {
              success: 'Đã kết nối các Fanpage được cấp quyền.',
              cancelled: 'Bạn đã huỷ kết nối Facebook.',
              empty:
                'Facebook chưa trả về Fanpage nào. Kiểm tra tài khoản và quyền được cấp.',
              failed: 'Chưa hoàn tất kết nối. Kiểm tra Meta App và thử lại.',
              page_missing:
                'Chưa cấp quyền cho đúng Fanpage. Kết nối cũ vẫn được giữ.',
            } as Record<string, string>
          )[connection] || 'Vui lòng kiểm tra kết nối.',
        );
        window.history.replaceState(null, '', '/');
      }
    });
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  async function refresh() {
    setRefreshing(true);
    try {
      await reload();
      setRefreshVersion((v) => v + 1);
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  async function logout() {
    setLoggingOut(true);
    try {
      await api('auth/logout', 'POST');
      setData(null);
      setCompose(null);
      setAction(null);
      setAddAccount(false);
      setWizard(null);
      setConnectionReports({});
      offeredGuideTo.current = '';
      setSection('overview');
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setLoggingOut(false);
    }
  }
  function openComments(t: Target) {
    if (!t.remote_id) return;
    setCommentSelection({ connectionId: t.connection_id, postId: t.remote_id });
    setSection('comments');
  }
  function exportActivity() {
    const rows = [
      ['Thời gian', 'Hoạt động'],
      ...(data?.activity || []).map((a) => [date(a.created_at), a.message]),
    ];
    const csv =
      '\uFEFF' +
      rows
        .map((row) =>
          row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','),
        )
        .join('\r\n');
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'socialdesk-nhat-ky.csv';
    link.click();
    URL.revokeObjectURL(url);
    setToast('Đã xuất các hoạt động hiện có ra CSV.');
  }
  const notice = toast && (
    <output className="toast">
      <Icon name="alert" size={18} />
      <span>{toast}</span>
      <button
        className="icon-button"
        aria-label="Đóng thông báo"
        onClick={() => setToast('')}
      >
        <Icon name="close" size={16} />
      </button>
    </output>
  );
  if (!loaded)
    return (
      <div className="loading">
        <span className="brand-mark">s.</span>
        <span>Đang mở không gian của bạn…</span>
      </div>
    );
  if (!data)
    return (
      <>
        {notice}
        <Auth
          onLogin={async () => {
            setInitialError('');
            const workspace = await reload();
            offerConnectionGuide(workspace, true);
          }}
          initialError={initialError}
        />
      </>
    );
  const targets = (p: Post) => data.targets.filter((t) => t.post_id === p.id);
  const stats = [
    {
      label: 'Tổng bài viết',
      value: data.posts.length,
      icon: 'posts' as IconName,
      color: 'purple',
      note: 'Nội dung trong không gian của bạn',
    },
    {
      label: 'Bản đã đăng',
      value: data.targets.filter(published).length,
      icon: 'send' as IconName,
      color: 'green',
      note: 'Tính riêng cho từng nơi đăng',
    },
    {
      label: 'Bản nháp',
      value: data.posts.filter((p) => !targets(p).some(published)).length,
      icon: 'edit' as IconName,
      color: 'orange',
      note: 'Sẵn sàng cho ý tưởng tiếp theo',
    },
    {
      label: 'Tài khoản & Fanpage',
      value: data.connections.length,
      icon: 'users' as IconName,
      color: 'blue',
      note: `${data.connections.filter((c) => c.kind === 'page').length} Fanpage · ${data.connections.filter((c) => c.kind === 'profile').length} cá nhân`,
    },
  ];
  const nav: { key: Section; icon: IconName; label: string }[] = [
    { key: 'overview', icon: 'grid', label: 'Tổng quan' },
    { key: 'posts', icon: 'posts', label: 'Bài viết' },
    { key: 'comments', icon: 'comments', label: 'Bình luận' },
    { key: 'accounts', icon: 'users', label: 'Tài khoản kết nối' },
    { key: 'activity', icon: 'clock', label: 'Nhật ký hoạt động' },
  ];
  const filtered = data.posts.filter(
    (p) =>
      (!search ||
        `${p.title} ${p.message}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filter === 'all' ||
        (filter === 'published' && targets(p).some(published)) ||
        (filter === 'draft' && !targets(p).some(published)) ||
        (filter === 'attention' &&
          targets(p).some((t) =>
            ['failed', 'manual', 'unknown', 'processing'].includes(t.status),
          ))),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="SocialDesk trang chủ">
          <span className="brand-mark">s.</span>
          <span>
            socialdesk<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">
            <Icon name="grid" size={18} />
          </span>
          <div>
            <strong>Không gian của tôi</strong>
            <span>Quản lý Facebook</span>
          </div>
          <span className="workspace-dot" />
        </div>
        <p className="nav-caption">KHÔNG GIAN LÀM VIỆC</p>
        <nav>
          {nav.map((n) => (
            <button
              key={n.key}
              className={`nav-item ${section === n.key ? 'active' : ''}`}
              aria-current={section === n.key ? 'page' : undefined}
              onClick={() => setSection(n.key)}
            >
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.key === 'posts' && (
                <span className="nav-count">{data.posts.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Icon name="send" size={20} />
            </span>
            <strong>
              Một ý tưởng.
              <br />
              Nhiều nơi lan toả.
            </strong>
            <p>Viết một lần, quản lý các bản đăng ngay tại đây.</p>
            <button onClick={() => setCompose('new')}>
              Tạo bài viết <Icon name="arrow" size={16} />
            </button>
          </div>
          <button
            className="nav-item connection-help-link"
            onClick={() => setWizard({ mode: 'connect' })}
          >
            <Icon name="link" />
            <span>Hướng dẫn kết nối</span>
          </button>
          <button
            className={`nav-item ${section === 'settings' ? 'active' : ''}`}
            onClick={() => setSection('settings')}
          >
            <Icon name="settings" />
            <span>Cài đặt kết nối</span>
          </button>
          <div className="user-menu">
            <Avatar name={data.user.name} small />
            <div>
              <strong>{data.user.name}</strong>
              <span title={data.user.email}>{data.user.email}</span>
            </div>
            <button
              className="icon-button"
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={logout}
              disabled={loggingOut}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Không gian làm việc <Icon name="chevron" size={13} />
            <strong>
              {
                [...nav, { key: 'settings', label: 'Cài đặt kết nối' }].find(
                  (n) => n.key === section,
                )?.label
              }
            </strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Mở hướng dẫn kết nối"
              title="Hướng dẫn kết nối Fanpage"
              onClick={() => setWizard({ mode: 'connect' })}
            >
              <Icon name="link" size={19} />
            </button>
            <button
              className="private-label"
              onClick={() => setSection('settings')}
              title="Cài đặt kết nối"
            >
              <Icon name="lock" size={13} />
              Chạy trên máy của bạn
            </button>
            <button
              className={`icon-button ${refreshing ? 'spinning' : ''}`}
              onClick={refresh}
              disabled={refreshing}
              title="Làm mới dữ liệu"
              aria-label="Làm mới dữ liệu"
            >
              <Icon name="refresh" size={18} />
            </button>
            <button
              className="icon-button mobile-settings"
              onClick={() => setSection('settings')}
              aria-label="Cài đặt kết nối"
            >
              <Icon name="settings" size={18} />
            </button>
            <button
              className="icon-button mobile-settings"
              onClick={logout}
              disabled={loggingOut}
              aria-label="Đăng xuất"
            >
              <Icon name="logout" size={18} />
            </button>
            <button
              className="profile-button"
              aria-label="Xem tài khoản"
              onClick={() => setSection('settings')}
            >
              <Avatar name={data.user.name} small />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {section === 'overview'
                  ? 'MỌI NỘI DUNG, MỘT NƠI'
                  : 'SOCIALDESK / FACEBOOK'}
              </p>
              <h1>
                {section === 'overview'
                  ? `Xin chào, ${data.user.name.split(' ').slice(-1)[0]} 👋`
                  : section === 'posts'
                    ? 'Thư viện bài viết'
                    : section === 'comments'
                      ? 'Hộp thư bình luận'
                      : section === 'accounts'
                        ? 'Tài khoản kết nối'
                        : section === 'activity'
                          ? 'Nhật ký hoạt động'
                          : 'Cài đặt kết nối'}
              </h1>
              <p className="subheading">
                {section === 'overview'
                  ? 'Biến ý tưởng thành những bài đăng tiếp theo của bạn.'
                  : section === 'posts'
                    ? 'Soạn nội dung và theo dõi từng bản đăng trên Facebook.'
                    : section === 'comments'
                      ? 'Kết nối với người theo dõi. Quản lý từng cuộc trò chuyện.'
                      : section === 'accounts'
                        ? 'Kết nối Fanpage và sắp xếp các trang cá nhân bạn quản lý.'
                        : section === 'activity'
                          ? 'Theo dõi các thay đổi trong không gian làm việc của bạn.'
                          : 'Thiết lập OAuth để kết nối Fanpage bằng tài khoản Facebook.'}
              </p>
            </div>
            {['overview', 'posts'].includes(section) && (
              <button
                className="button primary"
                onClick={() => setCompose('new')}
              >
                <Icon name="plus" size={18} />
                Tạo bài viết
              </button>
            )}
            {section === 'accounts' && (
              <button
                className="button primary"
                onClick={() => setAddAccount(true)}
              >
                <Icon name="plus" size={18} />
                Thêm tài khoản
              </button>
            )}
            {section === 'activity' && (
              <button
                className="button secondary"
                onClick={exportActivity}
                disabled={!data.activity.length}
              >
                <Icon name="copy" size={16} />
                Xuất nhật ký CSV
              </button>
            )}
          </div>
          {section === 'overview' && (
            <>
              <div className="stats">
                {stats.map((s, index) => (
                  <button
                    className="stat"
                    key={s.label}
                    onClick={() => {
                      setSection(index === 3 ? 'accounts' : 'posts');
                      setFilter(
                        index === 1
                          ? 'published'
                          : index === 2
                            ? 'draft'
                            : 'all',
                      );
                      setSearch('');
                    }}
                    aria-label={`Xem ${s.label.toLowerCase()}`}
                  >
                    <div className="stat-top">
                      <span>{s.label}</span>
                      <span className={`stat-icon ${s.color}`}>
                        <Icon name={s.icon} size={19} />
                      </span>
                    </div>
                    <strong>{String(s.value).padStart(2, '0')}</strong>
                    <p>{s.note}</p>
                  </button>
                ))}
              </div>
              {!data.connections.some((c) => c.kind === 'page') && (
                <div className="onboarding">
                  <div className="onboarding-copy">
                    <span className="pill light">BẮT ĐẦU CÙNG SOCIALDESK</span>
                    <h2>Kết nối Fanpage trong 3 bước</h2>
                    <p>
                      Đăng nhập Facebook, chọn Fanpage bạn quản lý
                      <br className="desktop-break" /> rồi bắt đầu đăng bài và
                      trả lời bình luận.
                    </p>
                    <ol className="onboarding-steps">
                      <li>
                        <span>1</span>Bắt đầu
                      </li>
                      <li>
                        <span>2</span>Chọn Fanpage
                      </li>
                      <li>
                        <span>3</span>Hoàn tất
                      </li>
                    </ol>
                    <button
                      className="button dark"
                      onClick={() => setWizard({ mode: 'connect' })}
                    >
                      Bắt đầu hướng dẫn <Icon name="arrow" size={17} />
                    </button>
                  </div>
                  <div className="channel-illustration" aria-hidden="true">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="illustration-center">
                      <span className="brand-mark">s.</span>
                    </div>
                    <div className="floating-channel channel-one">
                      <span className="fb-mark">f</span>
                      <span>
                        Fanpage của bạn
                        <i />
                      </span>
                      <span className="tiny-check">✓</span>
                    </div>
                    <div className="floating-channel channel-two">
                      <Avatar name="Facebook cá nhân" small />
                      <span>
                        Trang cá nhân
                        <i />
                      </span>
                    </div>
                    <div className="floating-note">
                      <Icon name="posts" size={17} />
                      Một nội dung, nhiều kết nối
                    </div>
                  </div>
                </div>
              )}
              <div className="section-title">
                <div>
                  <h2>
                    Bài viết gần đây{' '}
                    <span className="count-badge">{data.posts.length}</span>
                  </h2>
                  <p>Tiếp tục câu chuyện bạn đang viết.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setSection('posts')}
                >
                  Xem tất cả <Icon name="arrow" size={16} />
                </button>
              </div>
              {data.posts.length ? (
                <div className="post-grid">
                  {data.posts.slice(0, 3).map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      targets={targets(p)}
                      onEdit={() => setCompose(p)}
                      onAction={(kind) => setAction({ post: p, kind })}
                      onComments={openComments}
                      onManual={async (t) => {
                        await manual(t, p);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  icon="posts"
                  title="Bài viết đầu tiên bắt đầu từ một ý tưởng"
                  description="Lưu bản nháp, chọn nơi đăng và biến ý tưởng thành nội dung."
                  action="Soạn bài viết đầu tiên"
                  onClick={() => setCompose('new')}
                />
              )}
              <div className="overview-footer">
                <Icon name="lock" size={15} />
                <span>
                  Nội dung được lưu riêng theo tài khoản đăng nhập của bạn.
                </span>
                <span className="footer-brand">Made for your next post.</span>
              </div>
            </>
          )}
          {section === 'posts' && (
            <>
              <div className="library-toolbar">
                <div className="tabs">
                  {[
                    ['all', 'Tất cả'],
                    ['draft', 'Bản nháp'],
                    ['published', 'Đã đăng'],
                    ['attention', 'Cần xử lý'],
                  ].map(([key, label]) => (
                    <button
                      className={filter === key ? 'selected' : ''}
                      key={key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Icon name="search" size={17} />
                  <input
                    aria-label="Tìm bài viết"
                    placeholder="Tìm tên hoặc nội dung bài…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {filtered.length ? (
                <div className="post-grid">
                  {filtered.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      targets={targets(p)}
                      onEdit={() => setCompose(p)}
                      onAction={(kind) => setAction({ post: p, kind })}
                      onComments={openComments}
                      onManual={async (t) => {
                        await manual(t, p);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Empty
                  icon="posts"
                  title={
                    search || filter !== 'all'
                      ? 'Chưa có bài viết phù hợp'
                      : 'Một nơi cho mọi bài viết'
                  }
                  description={
                    search || filter !== 'all'
                      ? 'Thử thay đổi từ khoá hoặc bộ lọc.'
                      : 'Soạn và lưu bài viết đầu tiên của bạn ngay tại đây.'
                  }
                  action="Tạo bài viết"
                  onClick={() => setCompose('new')}
                />
              )}
            </>
          )}
          {section === 'comments' && (
            <CommentsPanel
              connections={data.connections}
              initial={commentSelection}
              refreshVersion={refreshVersion}
              onConnect={() => setSection('accounts')}
              onChanged={reload}
            />
          )}
          {section === 'accounts' && (
            <>
              <div className="connect-banner">
                <span className="fb-mark">f</span>
                <div>
                  <h2>Kết nối Fanpage trong 3 bước</h2>
                  <p>
                    Kiểm tra ứng dụng, đăng nhập Facebook và xác minh quyền
                    Fanpage.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setWizard({ mode: 'connect' })}
                >
                  Kết nối Facebook <Icon name="external" size={16} />
                </button>
              </div>
              <div className="info-banner">
                <Icon name="alert" size={18} />
                <p>
                  <strong>
                    Fanpage và trang cá nhân có cách hoạt động khác nhau.
                  </strong>{' '}
                  Fanpage có thể đăng, sửa và xoá qua API. Trang cá nhân dùng để
                  chuẩn bị nội dung, mở Facebook và xác nhận thao tác thủ công.
                </p>
              </div>
              {data.connections.length ? (
                <div className="account-grid">
                  {data.connections.map((c) => (
                    <div className="account-card" key={c.id}>
                      <div className="account-card-top">
                        <span
                          className={
                            c.kind === 'page' ? 'fb-mark' : 'profile-mark'
                          }
                        >
                          {c.kind === 'page' ? 'f' : <Icon name="users" />}
                        </span>
                        <span
                          className={`pill ${c.kind === 'page' ? (connectionReports[c.id]?.status === 'ready' ? 'green' : 'neutral') : 'orange'}`}
                        >
                          {c.kind === 'page'
                            ? connectionReports[c.id]?.title || 'Chưa kiểm tra'
                            : 'Thao tác thủ công'}
                        </span>
                      </div>
                      <h3>{c.name}</h3>
                      <p>
                        {c.kind === 'page'
                          ? `Fanpage · ID ${c.remote_id}`
                          : 'Facebook cá nhân'}
                      </p>
                      <div className="account-card-footer">
                        {c.kind === 'page' && (
                          <div className="account-health-actions">
                            <button
                              className="text-button"
                              onClick={() =>
                                setWizard({ mode: 'check', connectionId: c.id })
                              }
                            >
                              Kiểm tra kết nối
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                setWizard({
                                  mode: 'reconnect',
                                  connectionId: c.id,
                                })
                              }
                            >
                              Kết nối lại
                            </button>
                          </div>
                        )}
                        <a
                          href={c.url}
                          className="text-button"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Mở Facebook <Icon name="external" size={14} />
                        </a>
                        <button
                          className="icon-button danger-text"
                          aria-label={`Gỡ ${c.name}`}
                          title="Gỡ kết nối"
                          disabled={!!removingConnection}
                          onClick={async () => {
                            if (
                              !confirm(`Gỡ kết nối “${c.name}” khỏi phần mềm?`)
                            )
                              return;
                            try {
                              setRemovingConnection(c.id);
                              await api(`connections/${c.id}`, 'DELETE');
                              await reload();
                              setToast('Đã gỡ kết nối.');
                            } catch (e) {
                              setToast((e as Error).message);
                            } finally {
                              setRemovingConnection('');
                            }
                          }}
                        >
                          <Icon name="trash" size={17} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  icon="users"
                  title="Những kết nối đầu tiên của bạn"
                  description="Thêm các Fanpage và trang cá nhân để chọn nơi đăng cho từng bài."
                  action="Thêm tài khoản"
                  onClick={() => setAddAccount(true)}
                />
              )}
            </>
          )}
          {section === 'activity' && (
            <div className="activity-panel">
              <label className="search activity-search">
                <Icon name="search" size={17} />
                <input
                  aria-label="Tìm hoạt động"
                  placeholder="Tìm trong nhật ký hoạt động…"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                />
              </label>
              {data.activity.length ? (
                data.activity
                  .filter((a) =>
                    a.message
                      .toLocaleLowerCase('vi')
                      .includes(activitySearch.toLocaleLowerCase('vi')),
                  )
                  .map((a) => (
                    <div className="activity-row" key={a.id}>
                      <span className="activity-icon">
                        <Icon name="clock" size={17} />
                      </span>
                      <p>{a.message}</p>
                      <time>{date(a.created_at)}</time>
                    </div>
                  ))
              ) : (
                <Empty
                  icon="clock"
                  title="Chưa có hoạt động"
                  description="Các lần tạo, sửa bài và kết nối tài khoản sẽ xuất hiện ở đây."
                />
              )}
              {!!data.activity.length &&
                !data.activity.some((a) =>
                  a.message
                    .toLocaleLowerCase('vi')
                    .includes(activitySearch.toLocaleLowerCase('vi')),
                ) && (
                  <Empty
                    icon="search"
                    title="Không tìm thấy hoạt động"
                    description="Thử từ khóa khác hoặc xóa bộ lọc."
                    action="Xóa bộ lọc"
                    onClick={() => setActivitySearch('')}
                  />
                )}
            </div>
          )}
          {section === 'settings' && (
            <div className="settings-grid">
              <section className="panel">
                <div className="panel-heading">
                  <span className="fb-mark">f</span>
                  <div>
                    <h2>Facebook Login & callback URL</h2>
                    <p>Kết nối Fanpage bằng luồng OAuth của Meta.</p>
                  </div>
                </div>
                <div
                  className={`setup-status ${data.config.oauthReady ? 'ready' : ''}`}
                >
                  <span className="status-dot" />
                  {data.config.oauthReady
                    ? 'Đã cấu hình · Sẵn sàng kết nối'
                    : 'Cần cấu hình Meta App'}
                </div>
                <span className="field-label">Valid OAuth Redirect URI</span>
                <div className="copy-field">
                  <code>{data.config.callbackUrl}</code>
                  <button
                    className="icon-button"
                    aria-label="Sao chép callback URL"
                    title="Sao chép callback URL"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          data.config.callbackUrl,
                        );
                        setToast('Đã sao chép callback URL.');
                      } catch {
                        setToast(
                          'Chọn và sao chép đường dẫn hiển thị trong ô.',
                        );
                      }
                    }}
                  >
                    <Icon name="copy" size={18} />
                  </button>
                </div>
                <p className="field-hint">
                  Thêm chính xác đường dẫn này trong Facebook Login → Settings →
                  Valid OAuth Redirect URIs của Meta App.
                </p>
                <ol className="setup-steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Tạo hoặc mở Meta App</strong>
                      <p>
                        Thiết lập Facebook Login và thêm tên miền website vào
                        App Domains.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Thêm callback URL và cấp quyền</strong>
                      <p>
                        Yêu cầu pages_show_list, pages_read_engagement,
                        pages_manage_posts. Để quản lý bình luận, thêm
                        pages_read_user_content và pages_manage_engagement rồi
                        kết nối lại. Meta có thể yêu cầu xét duyệt khi mở rộng
                        người sử dụng.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Thiết lập thông tin ứng dụng</strong>
                      <p>
                        Chạy CAU-HINH.cmd trong thư mục SocialDesk-Local để nhập
                        Meta App ID và App Secret, sau đó mở lại CHAY-LOCAL.cmd.
                        Giữ trống địa chỉ Internet khi chỉ dùng trên máy.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>4</span>
                    <div>
                      <strong>Kết nối Facebook</strong>
                      <p>
                        Đăng nhập trên Facebook và chọn những Fanpage muốn quản
                        lý.
                      </p>
                    </div>
                  </li>
                </ol>
                <div className="button-row">
                  <a
                    className="button secondary"
                    href="https://developers.facebook.com/apps/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở Meta for Developers <Icon name="external" size={15} />
                  </a>
                  <button
                    className="button primary"
                    onClick={() => setWizard({ mode: 'connect' })}
                  >
                    Hướng dẫn kết nối
                  </button>
                </div>
              </section>
              <aside className="panel settings-note">
                <span className="stat-icon purple">
                  <Icon name="lock" />
                </span>
                <h3>Đăng nhập qua Facebook</h3>
                <p>
                  Bạn nhập mật khẩu trực tiếp trên Facebook. SocialDesk nhận
                  quyền truy cập Fanpage sau khi bạn đồng ý.
                </p>
                <hr />
                <h3>Tài khoản của phần mềm</h3>
                <p>
                  {data.user.name}
                  <br />
                  {data.user.email}
                </p>
                <p>
                  Tài khoản này dùng để đăng nhập SocialDesk và giữ riêng nội
                  dung của bạn.
                </p>
                <hr />
                <p className="field-hint">
                  Facebook API: {data.config.graphVersion}
                  <br />
                  Múi giờ hiển thị: Việt Nam (UTC+7)
                </p>
              </aside>
            </div>
          )}
        </main>
      </div>
      {compose && (
        <Composer
          post={compose === 'new' ? null : compose}
          data={data}
          onClose={() => setCompose(null)}
          onSaved={async () => {
            await reload();
            setCompose(null);
            setToast(
              'Đã lưu nội dung. Chọn “Đăng bài” để đăng lên các nơi đã chọn.',
            );
          }}
        />
      )}
      {addAccount && (
        <AccountDialog
          onClose={() => setAddAccount(false)}
          onSaved={async () => {
            await reload();
            setAddAccount(false);
            setToast('Đã thêm kết nối.');
          }}
          onConnect={() => {
            setAddAccount(false);
            setWizard({ mode: 'connect' });
          }}
        />
      )}
      {action && (
        <ActionDialog
          post={action.post}
          kind={action.kind}
          targets={targets(action.post)}
          onClose={() => setAction(null)}
          onDone={async (message) => {
            await reload();
            setAction(null);
            setToast(message);
          }}
        />
      )}
      {notice}
      {wizard && (
        <ConnectionWizard
          request={wizard}
          connections={data.connections}
          reports={connectionReports}
          onChecked={onConnectionChecked}
          onClose={() => setWizard(null)}
        />
      )}
    </div>
  );
  async function manual(t: Target, p: Post) {
    try {
      if (t.status === 'unknown' && t.kind === 'page') {
        const remoteId = prompt(
          'Nhập Post ID đã kiểm tra trên Fanpage (dạng PageID_PostID):',
        );
        if (!remoteId) return;
        await api(`posts/${p.id}/reconcile`, 'POST', {
          targetIds: [t.id],
          remoteId,
        });
        setToast(
          'Đã xác minh bài tồn tại trên Facebook. Bạn có thể cập nhật lại nội dung.',
        );
      } else if (t.status === 'manual_done') {
        if (
          !confirm(
            'Bạn đã xoá bài này trên Facebook? Xác nhận để cập nhật bản ghi trong SocialDesk.',
          )
        )
          return;
        await api(`posts/${p.id}/manual`, 'POST', {
          targetId: t.id,
          action: 'deleted',
        });
        setToast('Đã ghi nhận bạn xoá bài thủ công.');
      } else {
        const link = prompt(
          'Sau khi đăng bài trên Facebook, dán liên kết bài viết để xác nhận:',
        );
        if (!link) return;
        await api(`posts/${p.id}/manual`, 'POST', {
          targetId: t.id,
          action: 'published',
          url: link,
        });
        setToast('Đã ghi nhận bạn đăng bài thủ công.');
      }
      await reload();
    } catch (e) {
      setToast((e as Error).message);
    }
  }
}

function Empty({
  icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={27} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button secondary" onClick={onClick}>
          <Icon name="plus" size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
function Auth({
  onLogin,
  initialError,
}: {
  onLogin: () => Promise<void>;
  initialError: string;
}) {
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setPending(true);
    const b = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(register ? 'auth/register' : 'auth/login', 'POST', b);
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-shell">
      <div className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-mark">s.</span>
          <span>socialdesk.</span>
        </Link>
        <div className="auth-story-content">
          <span className="pill light">KHÔNG GIAN SÁNG TẠO CỦA BẠN</span>
          <h1>
            Ý tưởng của bạn.
            <br />
            Kết nối rộng hơn.
          </h1>
          <p>
            Soạn một bài viết, quản lý nhiều Fanpage.
            <br />
            Mọi nội dung gọn gàng trong một nơi.
          </p>
          <div className="auth-art">
            <div className="auth-art-card">
              <span className="fb-mark">f</span>
              <span>
                <strong>Bài viết tiếp theo của bạn</strong>
                <small>Sẵn sàng để lan toả</small>
              </span>
              <span className="tiny-check">✓</span>
              <div className="art-line" />
              <div className="art-line short" />
              <div className="art-channel-row">
                <span>Fanpage</span>
                <span>Trang cá nhân</span>
                <span>+ Kết nối</span>
              </div>
            </div>
            <div className="auth-art-tag">
              <Icon name="check" size={17} />
              Viết một lần. Quản lý tại một nơi.
            </div>
          </div>
        </div>
        <p className="auth-bottom">
          Một công cụ nhỏ. Nhiều thời gian hơn cho sáng tạo.
        </p>
      </div>
      <div className="auth-main">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand">
            <span className="brand-mark">s.</span>socialdesk.
          </div>
          <span className="eyebrow">CHÀO MỪNG ĐẾN SOCIALDESK</span>
          <h2>
            {register ? 'Tạo không gian của bạn' : 'Rất vui được gặp lại bạn'}
          </h2>
          <p>
            {register
              ? 'Đăng ký tài khoản để bắt đầu quản lý nội dung.'
              : 'Đăng nhập để tiếp tục những ý tưởng đang chờ.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label className="field">
                Tên của bạn
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={80}
                  required
                  placeholder="Nguyễn An"
                />
              </label>
            )}
            <label className="field">
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder="ban@example.com"
              />
            </label>
            <label className="field">
              Mật khẩu
              <div className="password-input">
                <input
                  name="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  minLength={10}
                  maxLength={128}
                  required
                  placeholder="Ít nhất 10 ký tự"
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <Icon name="eye" size={18} />
                </button>
              </div>
            </label>
            {(error || initialError) && (
              <div className="form-error" role="alert">
                {error || initialError}
              </div>
            )}
            <button className="button primary auth-submit" disabled={pending}>
              {pending
                ? 'Đang xử lý…'
                : register
                  ? 'Tạo tài khoản'
                  : 'Đăng nhập'}
              {!pending && <Icon name="arrow" size={18} />}
            </button>
          </form>
          <p className="auth-switch">
            {register ? 'Bạn đã có tài khoản?' : 'Bạn chưa có tài khoản?'}{' '}
            <button
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register ? 'Đăng nhập' : 'Tạo tài khoản mới'}
            </button>
          </p>
          <div className="auth-note">
            <Icon name="lock" size={17} />
            <p>
              Đây là tài khoản SocialDesk. Bạn có thể kết nối Facebook sau khi
              đăng nhập.
            </p>
          </div>
        </div>
        <p className="auth-copyright">
          © {new Date().getFullYear()} SocialDesk · Không gian cho nội dung của
          bạn
        </p>
      </div>
    </div>
  );
}

function PostCard({
  post: p,
  targets,
  onEdit,
  onAction,
  onManual,
  onComments,
}: {
  post: Post;
  targets: Target[];
  onEdit: () => void;
  onAction: (kind: 'publish' | 'sync' | 'remove' | 'delete') => void;
  onManual: (t: Target) => Promise<void>;
  onComments: (t: Target) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const count = targets.filter(published).length;
  const attention = targets.some((t) =>
    ['failed', 'unknown', 'processing'].includes(t.status),
  );
  return (
    <article className="post-card">
      <div className="post-card-top">
        <span
          className={`pill ${attention ? 'orange' : count ? 'green' : 'neutral'}`}
        >
          <span className="status-dot" />
          {attention
            ? 'Cần xử lý'
            : count
              ? `Đã đăng ${count}/${targets.length}`
              : 'Bản nháp'}
        </span>
        <button
          className="icon-button"
          title="Sửa nội dung"
          aria-label={`Sửa ${p.title}`}
          onClick={onEdit}
        >
          <Icon name="edit" size={17} />
        </button>
      </div>
      {(p.media_id || p.image_url) && (
        <img
          className="post-image"
          src={p.media_id ? `/api/media/${p.media_id}` : p.image_url!}
          alt="Ảnh bài viết"
          loading="lazy"
        />
      )}
      <h3>{p.title}</h3>
      <p className="post-excerpt">{p.message}</p>
      <div className="post-meta">
        <Icon name="clock" size={13} />
        <time>{date(p.updated_at)}</time>
        <span>·</span>
        <span>{targets.length} nơi đăng</span>
      </div>
      <button
        className="target-summary"
        onClick={() => (targets.length ? setExpanded(!expanded) : onEdit())}
        aria-expanded={expanded}
      >
        <span className="mini-avatars">
          {targets.slice(0, 4).map((t) => (
            <span
              key={t.id}
              className={t.kind === 'page' ? 'mini-fb' : 'mini-profile'}
            >
              {t.kind === 'page' ? 'f' : t.name[0]}
            </span>
          ))}
        </span>
        <span>
          {targets.length ? 'Chi tiết từng nơi đăng' : 'Chưa chọn nơi đăng'}
        </span>
        <Icon name="chevron" size={14} />
      </button>
      {expanded && (
        <div className="target-details">
          {targets.map((t) => (
            <div className="target-row" key={t.id}>
              <strong>{t.name}</strong>
              <span className={`target-status ${t.status}`}>
                {statuses[t.status]}
              </span>
              {t.status === 'published' &&
                t.published_version !== p.version && (
                  <small>Nội dung đã thay đổi. Cần cập nhật bản đăng.</small>
                )}
              {t.error && <small className="danger-text">{t.error}</small>}
              <div className="target-links">
                {(t.remote_url || t.kind === 'profile') && (
                  <a
                    className="text-button"
                    href={t.remote_url || t.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở Facebook <Icon name="external" size={12} />
                  </a>
                )}
                {t.kind === 'profile' && (
                  <button
                    className="text-button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(p.message)
                        .then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 3000);
                        })
                        .catch(() =>
                          setCopyError(
                            'Trình duyệt chưa cho phép sao chép. Bạn có thể chọn nội dung bài và sao chép thủ công.',
                          ),
                        );
                    }}
                  >
                    {copied ? 'Đã sao chép' : 'Chép nội dung'}
                  </button>
                )}
                {(t.kind === 'profile' || t.status === 'unknown') && (
                  <button className="text-button" onClick={() => onManual(t)}>
                    {t.status === 'unknown'
                      ? 'Đối chiếu Post ID'
                      : t.status === 'manual_done'
                        ? 'Xác nhận đã xoá'
                        : 'Xác nhận đã đăng'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="post-actions">
        <button
          className="button secondary small-button"
          onClick={() =>
            targets.some((t) =>
              ['draft', 'failed', 'deleted', 'manual'].includes(t.status),
            )
              ? onAction('publish')
              : onEdit()
          }
        >
          <Icon name="send" size={15} />
          {targets.some((t) =>
            ['draft', 'failed', 'deleted', 'manual'].includes(t.status),
          )
            ? 'Đăng bài'
            : targets.some(published)
              ? 'Sửa bài viết'
              : 'Chọn nơi đăng'}
        </button>
        {targets.some(
          (t) => t.kind === 'page' && t.status === 'published' && t.remote_id,
        ) && (
          <button
            className="icon-button"
            title="Quản lý bình luận"
            aria-label={`Bình luận ${p.title}`}
            onClick={() =>
              onComments(
                targets.find(
                  (t) =>
                    t.kind === 'page' &&
                    t.status === 'published' &&
                    t.remote_id,
                )!,
              )
            }
          >
            <Icon name="comments" size={18} />
          </button>
        )}
        {targets.some((t) => t.status === 'published') && (
          <button
            className="icon-button"
            title="Cập nhật nội dung trên Fanpage"
            aria-label="Cập nhật bản đã đăng"
            onClick={() => onAction('sync')}
          >
            <Icon name="refresh" size={17} />
          </button>
        )}
        <button
          className="icon-button danger-text"
          title={targets.some(published) ? 'Xoá bản đã đăng' : 'Xoá bản nháp'}
          aria-label={`Xoá ${p.title}`}
          onClick={() =>
            onAction(targets.some(published) ? 'remove' : 'delete')
          }
        >
          <Icon name="trash" size={17} />
        </button>
      </div>
      {copyError && (
        <p className="form-error" role="alert">
          {copyError}
        </p>
      )}
    </article>
  );
}
function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = ref.current;
    root?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && root) {
        const focusable = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],select:not(:disabled)',
          ),
        ).filter((el) => el.getClientRects().length > 0);
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === root)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <dialog
        open
        className={`modal ${wide ? 'wide' : ''}`}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Đóng cửa sổ"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}
function Composer({
  post,
  data,
  onClose,
  onSaved,
}: {
  post: Post | null;
  data: Data;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(post?.title || '');
  const [message, setMessage] = useState(post?.message || '');
  const [image, setImage] = useState(post?.image_url || '');
  const [mediaId, setMediaId] = useState(post?.media_id || '');
  const [selected, setSelected] = useState(
    data.targets
      .filter((t) => t.post_id === post?.id)
      .map((t) => t.connection_id),
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState(false);
  const hasPublished = data.targets.some(
    (t) =>
      t.post_id === post?.id &&
      ['published', 'manual_done', 'unknown', 'processing'].includes(t.status),
  );
  async function save(e: React.SyntheticEvent) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      await api(post ? `posts/${post.id}` : 'posts', post ? 'PATCH' : 'POST', {
        title,
        message,
        imageUrl: image,
        mediaId,
        connectionIds: selected,
        version: post?.version,
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('Ảnh tối đa 8 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const b = new FormData();
      b.set('file', file);
      const result = await api<{ id: string }>('media', 'POST', b);
      setMediaId(result.id);
      setImage('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  const preview = mediaId ? `/api/media/${mediaId}` : image;
  return (
    <Modal
      title={post ? 'Chỉnh sửa bài viết' : 'Bài viết mới'}
      eyebrow="TỪ Ý TƯỞNG ĐẾN BÀI ĐĂNG"
      onClose={() => {
        if (pending || uploading) return;
        if (
          (title !== (post?.title || '') ||
            message !== (post?.message || '') ||
            mediaId !== (post?.media_id || '') ||
            image !== (post?.image_url || '')) &&
          !confirm('Đóng cửa sổ và bỏ các thay đổi chưa lưu?')
        )
          return;
        onClose();
      }}
      wide
    >
      <form onSubmit={save}>
        <div className="composer-grid">
          <div className="composer-fields">
            <label className="field">
              Tên bài viết{' '}
              <span className="field-hint">Chỉ hiển thị trong SocialDesk</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
                placeholder="Đặt tên cho ý tưởng của bạn…"
              />
            </label>
            <label className="field">
              Nội dung bài viết
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={20000}
                rows={8}
                required
                placeholder="Bạn muốn chia sẻ điều gì hôm nay?"
              />
              <span className="character-count">
                {message.length.toLocaleString('vi-VN')} / 20.000
              </span>
            </label>
            <div className="media-toolbar">
              <label className="button secondary small-button upload-button">
                <Icon name="image" size={16} />
                {uploading ? 'Đang tải ảnh…' : 'Thêm ảnh'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading || pending}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
              <button
                className="text-button"
                type="button"
                onClick={() => setUrlInput(!urlInput)}
              >
                <Icon name="link" size={16} />
                Dùng link ảnh
              </button>
              {preview && (
                <button
                  className="text-button danger-text"
                  type="button"
                  onClick={() => {
                    setImage('');
                    setMediaId('');
                  }}
                >
                  Bỏ ảnh
                </button>
              )}
            </div>
            {urlInput && (
              <label className="field">
                Đường dẫn ảnh công khai
                <input
                  type="url"
                  value={image}
                  placeholder="https://…"
                  onChange={(e) => {
                    setImage(e.target.value);
                    setMediaId('');
                  }}
                />
              </label>
            )}
            <p className="field-hint">
              Một ảnh JPG, PNG hoặc WebP · tối đa 8 MB.
            </p>
            <div className="field">
              <div className="field-label-row">
                <strong>Nơi đăng</strong>
                <span>{selected.length} đã chọn</span>
              </div>
              {data.connections.length ? (
                <div className="connection-picker">
                  {data.connections.map((c) => {
                    const locked = data.targets.some(
                      (t) =>
                        t.post_id === post?.id &&
                        t.connection_id === c.id &&
                        [
                          'published',
                          'manual_done',
                          'unknown',
                          'processing',
                        ].includes(t.status),
                    );
                    return (
                      <label
                        className={`connection-choice ${selected.includes(c.id) ? 'chosen' : ''}`}
                        key={c.id}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(c.id)}
                          disabled={locked || pending}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, c.id]
                                : selected.filter((v) => v !== c.id),
                            )
                          }
                        />
                        <span
                          className={
                            c.kind === 'page' ? 'mini-fb' : 'mini-profile'
                          }
                        >
                          {c.kind === 'page' ? 'f' : c.name[0]}
                        </span>
                        <span>
                          <strong>{c.name}</strong>
                          <small>
                            {c.kind === 'page'
                              ? 'Fanpage · Đăng qua API'
                              : 'Cá nhân · Thao tác thủ công'}
                          </small>
                        </span>
                        {locked && <Icon name="lock" size={14} />}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="inline-empty">
                  Bạn có thể lưu bản nháp trước rồi thêm tài khoản ở mục “Tài
                  khoản kết nối”.
                </div>
              )}
            </div>
            {hasPublished && (
              <div className="info-banner compact">
                <Icon name="alert" size={17} />
                <p>
                  Lưu nội dung sẽ cập nhật bản trong SocialDesk. Dùng “Cập nhật
                  bản đã đăng” để sửa nội dung văn bản trên Fanpage. Ảnh của bài
                  đã đăng cần được xử lý riêng trên Facebook.
                </p>
              </div>
            )}
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
          </div>
          <aside className="composer-preview">
            <span className="eyebrow">XEM TRƯỚC NỘI DUNG</span>
            <div className="facebook-preview">
              <div className="preview-author">
                <Avatar
                  name={
                    data.connections.find((c) => selected.includes(c.id))
                      ?.name || data.user.name
                  }
                  small
                />
                <span>
                  <strong>
                    {data.connections.find((c) => selected.includes(c.id))
                      ?.name || data.user.name}
                  </strong>
                  <small>Vừa xong · 🌐</small>
                </span>
                <span className="preview-dots">···</span>
              </div>
              <p className={!message ? 'placeholder' : ''}>
                {message || 'Nội dung bài viết của bạn sẽ xuất hiện tại đây…'}
              </p>
              {preview ? (
                <img src={preview} alt="Xem trước ảnh bài viết" />
              ) : (
                <div className="preview-image-placeholder">
                  <Icon name="image" size={32} />
                  <span>Thêm ảnh để kể câu chuyện của bạn</span>
                </div>
              )}
              <div className="preview-reactions">
                <span>♡ Thích</span>
                <span>▢ Bình luận</span>
                <span>↗ Chia sẻ</span>
              </div>
            </div>
            <p className="preview-note">
              Bản xem trước minh hoạ bố cục nội dung. Facebook có thể hiển thị
              khác.
            </p>
          </aside>
        </div>
        <div className="modal-footer">
          <span className="field-hint">
            <Icon name="lock" size={13} />
            Nội dung được lưu riêng tư
          </span>
          <div className="button-row">
            <button
              type="button"
              className="button secondary"
              disabled={pending || uploading}
              onClick={onClose}
            >
              Huỷ
            </button>
            <button className="button primary" disabled={pending || uploading}>
              {pending ? 'Đang lưu…' : post ? 'Lưu nội dung' : 'Lưu bản nháp'}
              <Icon name="check" size={17} />
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
function AccountDialog({
  onClose,
  onSaved,
  onConnect,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  onConnect: () => void;
}) {
  const [kind, setKind] = useState('profile');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      await api('connections', 'POST', {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        kind,
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title="Thêm kết nối"
      eyebrow="MỞ RỘNG KHÔNG GIAN CỦA BẠN"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="account-modal-body">
        <button className="oauth-option" onClick={onConnect}>
          <span className="fb-mark">f</span>
          <span>
            <strong>Kết nối bằng Facebook</strong>
            <small>Đăng nhập và chọn Fanpage qua OAuth</small>
          </span>
          <Icon name="arrow" size={18} />
        </button>
        <div className="or-divider">
          <span>hoặc thêm kết nối trực tiếp</span>
        </div>
        <div className="tabs account-tabs">
          <button
            className={kind === 'profile' ? 'selected' : ''}
            onClick={() => setKind('profile')}
          >
            Trang cá nhân
          </button>
          <button
            className={kind === 'page' ? 'selected' : ''}
            onClick={() => setKind('page')}
          >
            Fanpage bằng token
          </button>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            Tên hiển thị
            <input
              name="name"
              required
              maxLength={80}
              placeholder={
                kind === 'profile' ? 'Ví dụ: Facebook của An' : 'Tên Fanpage'
              }
            />
          </label>
          {kind === 'profile' ? (
            <>
              <label className="field">
                Liên kết trang cá nhân
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="https://www.facebook.com/…"
                />
              </label>
              <div className="info-banner compact">
                <Icon name="alert" size={17} />
                <p>
                  Kết nối này lưu tên và liên kết để bạn chuẩn bị nội dung. Bạn
                  đăng nhập, đăng, sửa và xoá trực tiếp trên Facebook.
                </p>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                Page ID
                <input
                  name="pageId"
                  required
                  inputMode="numeric"
                  pattern="[0-9]+"
                  placeholder="ID dạng số của Fanpage"
                />
              </label>
              <label className="field">
                Page Access Token
                <input
                  name="token"
                  type="password"
                  autoComplete="off"
                  required
                  placeholder="Token có quyền pages_manage_posts"
                />
              </label>
              <p className="field-hint">
                Dùng Page Access Token do Meta cấp. Kết nối được kiểm tra trước
                khi lưu; token được mã hoá trên máy chủ.
              </p>
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="button-row account-submit">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={pending}
            >
              Huỷ
            </button>
            <button className="button primary" disabled={pending}>
              {pending ? 'Đang kiểm tra…' : 'Thêm kết nối'}
              <Icon name="plus" size={16} />
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
function ActionDialog({
  post,
  kind,
  targets,
  onClose,
  onDone,
}: {
  post: Post;
  kind: 'publish' | 'sync' | 'remove' | 'delete';
  targets: Target[];
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const eligible = targets.filter((t) =>
    kind === 'publish'
      ? ['draft', 'failed', 'deleted', 'manual'].includes(t.status)
      : t.kind === 'page' && t.status === 'published',
  );
  const [selected, setSelected] = useState(eligible.map((t) => t.id));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const title =
    kind === 'publish'
      ? 'Đăng bài viết'
      : kind === 'sync'
        ? 'Cập nhật bản đã đăng'
        : kind === 'delete'
          ? 'Xoá bản nháp'
          : 'Xoá bài trên Fanpage';
  async function submit() {
    setPending(true);
    setError('');
    try {
      const r = await api<{ outcomes?: { status: string; error?: string }[] }>(
        `posts/${post.id}${kind === 'delete' ? '' : `/${kind}`}`,
        kind === 'delete' ? 'DELETE' : 'POST',
        kind === 'delete' ? undefined : { targetIds: selected },
      );
      const errors = r.outcomes?.filter((t) => t.error).length || 0;
      const manual =
        r.outcomes?.filter((t) => t.status === 'manual').length || 0;
      await onDone(
        kind === 'delete'
          ? 'Đã xoá bản nháp.'
          : errors
            ? `Đã xử lý. Có ${errors} nơi cần kiểm tra; mở chi tiết bài để xem lỗi.`
            : manual
              ? `Đã xử lý. Có ${manual} trang cá nhân cần bạn mở Facebook để hoàn tất.`
              : 'Đã hoàn tất thao tác.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div className="action-body">
        <p className="action-post-title">{post.title}</p>
        <p className="subheading">
          {kind === 'publish'
            ? 'Chọn các nơi bạn muốn đăng nội dung này.'
            : kind === 'sync'
              ? 'Cập nhật nội dung văn bản lên các Fanpage đã đăng. Ảnh của bài đã đăng sẽ giữ nguyên.'
              : kind === 'delete'
                ? 'Bản nháp sẽ bị xoá khỏi SocialDesk. Thao tác này không thể hoàn tác.'
                : 'Các bài trên Fanpage được chọn sẽ bị xoá trên Facebook. Thao tác này không thể hoàn tác.'}
        </p>
        {kind !== 'delete' && (
          <div className="connection-picker">
            {eligible.length ? (
              eligible.map((t) => (
                <label
                  className={`connection-choice ${selected.includes(t.id) ? 'chosen' : ''}`}
                  key={t.id}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    disabled={pending}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, t.id]
                          : selected.filter((v) => v !== t.id),
                      )
                    }
                  />
                  <span
                    className={t.kind === 'page' ? 'mini-fb' : 'mini-profile'}
                  >
                    {t.kind === 'page' ? 'f' : t.name[0]}
                  </span>
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {t.kind === 'page'
                        ? statuses[t.status]
                        : 'Cần hoàn tất thủ công trên Facebook'}
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <div className="inline-empty">
                {kind === 'publish'
                  ? 'Chưa có nơi phù hợp để đăng. Thêm nơi đăng trong phần sửa bài hoặc kiểm tra các bản đã đăng.'
                  : 'Không có bản đăng Fanpage phù hợp. Với trang cá nhân, hãy mở Facebook để thực hiện.'}
              </div>
            )}
          </div>
        )}
        {kind === 'publish' && (
          <p className="field-hint">
            Mỗi nơi có một bản riêng. Các nơi đã đăng thành công sẽ không được
            đăng lại trong lần này.
          </p>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button
          className="button secondary"
          onClick={onClose}
          disabled={pending}
        >
          Huỷ
        </button>
        <button
          className={`button ${['remove', 'delete'].includes(kind) ? 'danger' : 'primary'}`}
          disabled={pending || (kind !== 'delete' && !selected.length)}
          onClick={submit}
        >
          {pending
            ? 'Đang xử lý, vui lòng đợi…'
            : kind === 'delete'
              ? 'Xoá bản nháp'
              : `${kind === 'publish' ? 'Đăng' : kind === 'sync' ? 'Cập nhật' : 'Xoá'} tại ${selected.length} nơi`}
          <Icon
            name={kind === 'delete' || kind === 'remove' ? 'trash' : 'send'}
            size={16}
          />
        </button>
      </div>
    </Modal>
  );
}
