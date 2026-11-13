import { publicOrigin } from './origin';
import { graph, GraphError } from './facebook';

type Config = {
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  META_GRAPH_VERSION?: string;
  META_COMMENTS_ENABLED?: string;
  PUBLIC_APP_URL?: string;
};
export const facebookPermissions = [
  {
    key: 'pages_show_list',
    label: 'Tìm Fanpage bạn quản lý',
    group: 'connect',
  },
  {
    key: 'pages_read_engagement',
    label: 'Đọc bài viết của Fanpage',
    group: 'posts',
  },
  {
    key: 'pages_manage_posts',
    label: 'Đăng, sửa và xóa bài viết',
    group: 'posts',
  },
  {
    key: 'pages_read_user_content',
    label: 'Đọc bình luận của người theo dõi',
    group: 'comments',
  },
  {
    key: 'pages_manage_engagement',
    label: 'Trả lời, ẩn và xóa bình luận',
    group: 'comments',
  },
] as const;
export function commentPermissionsEnabled(config: Config) {
  return /^(true|1)$/i.test(config.META_COMMENTS_ENABLED?.trim() || '');
}

export function requestedFacebookPermissions(includeComments = false) {
  return facebookPermissions
    .filter((p) => includeComments || p.group !== 'comments')
    .map((p) => p.key)
    .join(',');
}
export type SetupCheck = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
};
export type FacebookSetup = {
  ready: boolean;
  checks: SetupCheck[];
  callbackUrl: string | null;
  appId: string | null;
  callbackVerified: false;
  commentsPermissionRequestEnabled: boolean;
};
export function facebookSetup(
  config: Config,
  requestUrl: string,
): FacebookSetup {
  let callbackUrl: string | null = null;
  try {
    callbackUrl = `${publicOrigin(requestUrl, config.PUBLIC_APP_URL)}/api/facebook/callback`;
  } catch {
    /* Report invalid origins without exposing their contents. */
  }
  const appIdOk = /^\d+$/.test(config.META_APP_ID || '');
  const secretOk =
    !!config.META_APP_SECRET?.trim() &&
    !/^(YOUR_|PASTE_|CHANGE_|REPLACE_)/i.test(config.META_APP_SECRET.trim());
  const keyOk = /^[a-f\d]{64}$/i.test(config.TOKEN_ENCRYPTION_KEY || '');
  const versionOk =
    !config.META_GRAPH_VERSION || /^v\d+\.\d+$/.test(config.META_GRAPH_VERSION);
  const checks: SetupCheck[] = [
    {
      key: 'appId',
      label: 'Mã ứng dụng Facebook',
      ok: appIdOk,
      message: appIdOk
        ? 'Đã có mã ứng dụng hợp lệ về định dạng.'
        : 'Chưa có mã ứng dụng hợp lệ. Người cài đặt cần nhập Meta App ID.',
    },
    {
      key: 'appSecret',
      label: 'Thông tin xác thực ứng dụng',
      ok: secretOk,
      message: secretOk
        ? 'Đã lưu App Secret trên máy. Facebook sẽ xác minh khi bạn đăng nhập.'
        : 'Máy này chưa có App Secret. Chạy CAU-HINH.cmd để nhập, sau đó mở lại CHAY-LOCAL.cmd.',
    },
    {
      key: 'encryption',
      label: 'Bảo vệ thông tin kết nối',
      ok: keyOk,
      message: keyOk
        ? 'Khóa mã hóa đã sẵn sàng.'
        : 'Khóa mã hóa bị thiếu hoặc sai định dạng. Kiểm tra bản sao cấu hình; giữ nguyên khóa khi đã có kết nối.',
    },
    {
      key: 'version',
      label: 'Phiên bản kết nối Facebook',
      ok: versionOk,
      message: versionOk
        ? 'Định dạng phiên bản API hợp lệ.'
        : 'META_GRAPH_VERSION cần có dạng v25.0. Người cài đặt cần sửa cấu hình.',
    },
    {
      key: 'callback',
      label: 'Địa chỉ quay lại ứng dụng',
      ok: !!callbackUrl,
      message: callbackUrl
        ? 'Đã tạo địa chỉ quay lại. Người cài đặt cần đăng ký đúng địa chỉ này trong Meta App.'
        : 'Địa chỉ website không hợp lệ. Kiểm tra PUBLIC_APP_URL trong cấu hình.',
    },
  ];
  return {
    ready: checks.every((c) => c.ok),
    checks,
    callbackUrl,
    appId: appIdOk ? config.META_APP_ID!.trim() : null,
    callbackVerified: false,
    commentsPermissionRequestEnabled: commentPermissionsEnabled(config),
  };
}
export type ConnectionHealth = {
  connectionId: string;
  checkedAt: number;
  status:
    | 'ready'
    | 'limited'
    | 'expired'
    | 'unavailable'
    | 'unknown'
    | 'configuration_required';
  title: string;
  message: string;
  identityVerified: boolean;
  expiresAt: number | null;
  postingReady: boolean | null;
  commentsReady: boolean | null;
  permissions: {
    key: string;
    label: string;
    group: string;
    granted: boolean | null;
  }[];
};
export function unknownHealth(connectionId: string): ConnectionHealth {
  return {
    connectionId,
    checkedAt: Date.now(),
    status: 'unknown',
    title: 'Chưa xác minh được kết nối',
    message:
      'Hãy kiểm tra lại. Chưa có đủ dữ liệu để kết luận quyền nào còn thiếu.',
    identityVerified: false,
    expiresAt: null,
    postingReady: null,
    commentsReady: null,
    permissions: facebookPermissions.map((p) => ({ ...p, granted: null })),
  };
}
export async function inspectConnection(
  config: Config,
  connectionId: string,
  pageId: string,
  token: string,
): Promise<ConnectionHealth> {
  const result = unknownHealth(connectionId);
  let stage: 'debug' | 'identity' = 'debug';
  try {
    const debug = (await graph(
      `debug_token?${new URLSearchParams({ input_token: token })}`,
      `${config.META_APP_ID}|${config.META_APP_SECRET}`,
      { version: config.META_GRAPH_VERSION, resource: 'connection' },
    )) as {
      data?: {
        is_valid?: boolean;
        app_id?: string;
        expires_at?: number;
        data_access_expires_at?: number;
        scopes?: string[];
        granular_scopes?: { scope: string; target_ids?: string[] }[];
      };
    };
    const data = debug.data;
    if (!data || typeof data.is_valid !== 'boolean') return result;
    const expiries = [data.expires_at, data.data_access_expires_at].filter(
      (v): v is number => typeof v === 'number' && v > 0,
    );
    result.expiresAt = expiries.length ? Math.min(...expiries) * 1000 : null;
    if (
      !data.is_valid ||
      (result.expiresAt !== null && result.expiresAt <= Date.now())
    )
      return {
        ...result,
        status: 'expired',
        title: 'Cần kết nối lại',
        message:
          'Phiên Facebook đã hết hạn hoặc quyền truy cập đã bị thu hồi. Kết nối lại để tiếp tục sử dụng.',
      };
    if (String(data.app_id) !== config.META_APP_ID)
      return {
        ...result,
        status: 'unavailable',
        title: 'Kết nối thuộc ứng dụng khác',
        message:
          'Fanpage được kết nối qua Meta App khác. Kết nối lại bằng ứng dụng đang được cấu hình trên máy này.',
      };
    stage = 'identity';
    const identity = await graph('me?fields=id,name', token, {
      version: config.META_GRAPH_VERSION,
      resource: 'connection',
    });
    if (identity.id !== pageId)
      return {
        ...result,
        status: 'unavailable',
        title: 'Thông tin Fanpage không khớp',
        message:
          'Facebook trả về Fanpage khác với kết nối đã lưu. Kết nối lại và chọn đúng Fanpage.',
      };
    result.identityVerified = true;
    if (
      !Array.isArray(data.scopes) ||
      !data.scopes.every((s) => typeof s === 'string')
    )
      return {
        ...result,
        message:
          'Đã xác minh Fanpage, nhưng Facebook chưa trả danh sách quyền. Hãy kiểm tra lại; chưa thể kết luận quyền còn thiếu.',
      };
    result.permissions = facebookPermissions.map((p) => {
      const granular = data.granular_scopes?.find((g) => g.scope === p.key);
      return {
        ...p,
        granted:
          data.scopes!.includes(p.key) &&
          (!Array.isArray(granular?.target_ids) ||
            granular.target_ids.includes(pageId)),
      };
    });
    result.postingReady = result.permissions
      .filter((p) => p.group === 'posts')
      .every((p) => p.granted);
    result.commentsReady = result.permissions
      .filter(
        (p) => p.key === 'pages_read_engagement' || p.group === 'comments',
      )
      .every((p) => p.granted);
    // Comment permissions are optional; their absence must not block posting.
    const missing = result.permissions.filter(
      (p) => p.group !== 'comments' && !p.granted,
    );
    return {
      ...result,
      status: missing.length ? 'limited' : 'ready',
      title: missing.length ? 'Cần cấp thêm quyền' : 'Đã xác minh kết nối',
      message: missing.length
        ? 'Facebook chưa cấp đủ các quyền bên dưới cho Fanpage này. Bấm Kết nối lại và đồng ý các quyền cần dùng.'
        : result.commentsReady
          ? 'Phiên Facebook còn hiệu lực; đã có quyền quản lý bài viết và bình luận. Từng thao tác vẫn phụ thuộc quyền quản trị Fanpage của bạn.'
          : 'Phiên Facebook còn hiệu lực và đã có quyền đăng bài. Quyền bình luận chưa đủ; bạn vẫn có thể quản lý bài viết.',
    };
  } catch (error) {
    if (error instanceof GraphError && error.code === 190 && stage === 'debug')
      return {
        ...result,
        status: 'configuration_required',
        title: 'Kiểm tra lại thông tin Meta App',
        message:
          'Facebook chưa xác thực được yêu cầu kiểm tra. Người cài đặt cần đối chiếu App ID và App Secret. Chưa thể kết luận phiên Fanpage đã hết hạn.',
      };
    if (error instanceof GraphError && error.code === 190)
      return {
        ...result,
        status: 'expired',
        title: 'Cần kết nối lại',
        message:
          'Phiên Facebook không còn hợp lệ. Kết nối lại để cấp quyền mới.',
      };
    return {
      ...result,
      message:
        error instanceof GraphError
          ? error.message
          : 'Chưa kiểm tra được kết nối. Thử lại sau; chưa thể xác định quyền còn thiếu.',
    };
  }
}

export type OAuthIntent = { guided: boolean; connectionId?: string };
export function encodeIntent(random: string, intent: OAuthIntent) {
  return `${random}.${btoa(JSON.stringify(intent)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
// Read only after the full state hash has been verified and consumed for this session.
export function decodeIntent(state: string): OAuthIntent {
  try {
    const encoded = state.split('.')[1];
    if (!encoded || encoded.length > 1024 || !/^[a-zA-Z\d_-]+$/.test(encoded))
      return { guided: false };
    const value = JSON.parse(
      atob(encoded.replace(/-/g, '+').replace(/_/g, '/')),
    );
    return {
      guided: value.guided === true,
      ...(typeof value.connectionId === 'string' &&
      /^[a-zA-Z\d_-]{1,100}$/.test(value.connectionId)
        ? { connectionId: value.connectionId }
        : {}),
    };
  } catch {
    return { guided: false };
  }
}
