import { env } from 'cloudflare:workers';
import {
  decrypt,
  encrypt,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from './security';
import { graph, GraphError } from './facebook';
import { publicOrigin, requestOrigin } from './origin';
import {
  commentFields,
  commentView,
  listComments,
  safeFacebookLink,
} from './comments';
import {
  facebookSetup,
  commentPermissionsEnabled,
  requestedFacebookPermissions,
  inspectConnection,
  unknownHealth,
  encodeIntent,
  decodeIntent,
} from './connection-status';

type User = { id: string; email: string; name: string };
type Connection = {
  id: string;
  name: string;
  kind: string;
  remote_id: string;
  url: string;
  credential: string | null;
};
type Post = {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  media_id: string | null;
  version: number;
};
type Target = {
  id: string;
  status: string;
  remote_id: string | null;
  connection_id: string;
  published_version: number | null;
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const db = () => env.DB;
const id = () => crypto.randomUUID();
const json = (data: unknown, status = 200, headers: HeadersInit = {}) => {
  const result = new Headers(headers);
  result.set('Cache-Control', 'no-store');
  result.set('X-Content-Type-Options', 'nosniff');
  return Response.json(data, { status, headers: result });
};
function check(ok: unknown, message: string, status = 400): asserts ok {
  if (!ok) throw new HttpError(status, message);
}
function text(value: unknown, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
async function body(req: Request): Promise<Record<string, unknown>> {
  check(
    req.headers.get('content-type')?.includes('application/json'),
    'Yêu cầu cần có định dạng JSON.',
  );
  const raw = await req.text();
  check(raw.length < 100000, 'Nội dung quá lớn.');
  try {
    const data = JSON.parse(raw);
    check(
      data && typeof data === 'object' && !Array.isArray(data),
      'Dữ liệu không hợp lệ.',
    );
    return data;
  } catch {
    throw new HttpError(400, 'Dữ liệu không hợp lệ.');
  }
}
function facebookUrl(value: unknown) {
  try {
    const u = new URL(text(value, 2000));
    check(
      u.protocol === 'https:' &&
        /^(www\.|m\.)?facebook\.com$/.test(u.hostname) &&
        !u.username &&
        !u.password,
      'Liên kết cần là https://www.facebook.com/…',
    );
    return u.href;
  } catch {
    throw new HttpError(400, 'Liên kết cần là https://www.facebook.com/…');
  }
}
function imageUrl(value: unknown) {
  if (!value) return null;
  try {
    const u = new URL(text(value, 2000));
    check(
      u.protocol === 'https:' && !u.username && !u.password,
      'Ảnh cần dùng đường dẫn HTTPS công khai.',
    );
    return u.href;
  } catch {
    throw new HttpError(400, 'Ảnh cần dùng đường dẫn HTTPS công khai.');
  }
}
function cookie(req: Request, token: string, age: number) {
  return `socialdesk_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${publicOrigin(req.url, env.PUBLIC_APP_URL).startsWith('https:') ? '; Secure' : ''}`;
}
async function sessionHash(req: Request) {
  const token = req.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)socialdesk_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token ? sha256(token) : '';
}
async function user(req: Request): Promise<User> {
  const u = await db()
    .prepare(
      'SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
    )
    .bind(await sessionHash(req), Date.now())
    .first<User>();
  check(u, 'Vui lòng đăng nhập để tiếp tục.', 401);
  return u;
}
async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = await db()
    .prepare(
      'INSERT INTO auth_attempts(key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END RETURNING count',
    )
    .bind(key, now, now - windowMs, now - windowMs, now)
    .first<{ count: number }>();
  check(
    row && row.count <= limit,
    'Có quá nhiều lần thử. Vui lòng đợi 15 phút.',
    429,
  );
}
async function log(u: User, message: string) {
  await db()
    .prepare(
      'INSERT INTO activity(id,user_id,message,created_at) VALUES (?,?,?,?)',
    )
    .bind(id(), u.id, message.slice(0, 500), Date.now())
    .run();
}
async function ownedPost(u: User, postId: string) {
  const p = await db()
    .prepare('SELECT * FROM posts WHERE id=? AND user_id=?')
    .bind(postId, u.id)
    .first<Post>();
  check(p, 'Không tìm thấy bài viết.', 404);
  return p;
}
async function selectedConnections(u: User, values: unknown) {
  check(
    Array.isArray(values) &&
      values.length <= 20 &&
      values.every((v) => typeof v === 'string'),
    'Chọn tối đa 20 nơi đăng.',
  );
  const ids = [...new Set(values)] as string[];
  if (!ids.length) return [];
  const { results } = await db()
    .prepare(
      `SELECT id FROM connections WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`,
    )
    .bind(u.id, ...ids)
    .all<{ id: string }>();
  check(
    results.length === ids.length,
    'Một trong các tài khoản không còn khả dụng.',
  );
  return ids;
}
async function upsertConnection(
  u: User,
  remoteId: string,
  name: string,
  token: string,
) {
  check(env.TOKEN_ENCRYPTION_KEY, 'Chưa cấu hình khoá mã hoá kết nối.', 503);
  const credential = await encrypt(token, env.TOKEN_ENCRYPTION_KEY);
  await db()
    .prepare(
      "INSERT INTO connections(id,user_id,name,kind,remote_id,url,credential,created_at) VALUES (?,?,?,'page',?,?,?,?) ON CONFLICT(user_id,kind,remote_id) DO UPDATE SET name=excluded.name,credential=excluded.credential",
    )
    .bind(
      id(),
      u.id,
      name,
      remoteId,
      `https://www.facebook.com/${remoteId}`,
      credential,
      Date.now(),
    )
    .run();
}
async function oauth(req: Request, u: User, path: string, url: URL) {
  const origin = publicOrigin(url.href, env.PUBLIC_APP_URL);
  const redirectUri = `${origin}/api/facebook/callback`;
  check(
    facebookSetup(env, req.url).ready &&
      env.META_APP_ID &&
      env.META_APP_SECRET &&
      env.TOKEN_ENCRYPTION_KEY,
    'Cần cấu hình Meta App ID và App Secret trước khi kết nối.',
    503,
  );
  if (path === 'facebook/connect') {
    const includeComments = url.searchParams.get('permissions') === 'comments';
    check(
      !includeComments || commentPermissionsEnabled(env),
      'Chức năng bình luận chưa được bật. Người cài đặt cần thêm quyền trong Meta App trước. Bạn vẫn có thể kết nối Fanpage để đăng bài.',
      409,
    );
    const connectionId = url.searchParams.get('connectionId') || '';
    if (connectionId) {
      const target = await db()
        .prepare(
          "SELECT id FROM connections WHERE id=? AND user_id=? AND kind='page'",
        )
        .bind(connectionId, u.id)
        .first();
      check(target, 'Không tìm thấy Fanpage cần kết nối lại.', 404);
    }
    const state = encodeIntent(randomToken(), {
      guided: url.searchParams.get('guided') === '1',
      ...(connectionId ? { connectionId } : {}),
    });
    await db()
      .prepare(
        'UPDATE sessions SET oauth_state=?,oauth_expires=? WHERE token_hash=?',
      )
      .bind(await sha256(state), Date.now() + 600000, await sessionHash(req))
      .run();
    const params = new URLSearchParams({
      client_id: env.META_APP_ID,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: requestedFacebookPermissions(includeComments),
    });
    if (connectionId || includeComments) params.set('auth_type', 'rerequest');
    return Response.redirect(
      `https://www.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/dialog/oauth?${params}`,
      302,
    );
  }
  const stored = await db()
    .prepare(
      'SELECT oauth_state,oauth_expires FROM sessions WHERE token_hash=?',
    )
    .bind(await sessionHash(req))
    .first<{ oauth_state: string | null; oauth_expires: number | null }>();
  const state = url.searchParams.get('state');
  check(
    state &&
      stored?.oauth_state &&
      stored.oauth_expires &&
      stored.oauth_expires > Date.now() &&
      (await sha256(state)) === stored.oauth_state,
    'Phiên kết nối đã hết hạn. Hãy bấm Kết nối Facebook lại.',
    400,
  );
  // Atomically consume the state to reject replayed and simultaneous callbacks.
  const consumed = await db()
    .prepare(
      'UPDATE sessions SET oauth_state=NULL,oauth_expires=NULL WHERE token_hash=? AND oauth_state=?',
    )
    .bind(await sessionHash(req), stored.oauth_state)
    .run();
  check(consumed.meta.changes === 1, 'Phiên kết nối đã được sử dụng.', 400);
  const intent = decodeIntent(state);
  const target = intent.connectionId
    ? await db()
        .prepare(
          "SELECT id,remote_id FROM connections WHERE id=? AND user_id=? AND kind='page'",
        )
        .bind(intent.connectionId, u.id)
        .first<{ id: string; remote_id: string }>()
    : null;
  function returnToApp(outcome: string) {
    const query = new URLSearchParams({ connect: outcome });
    if (intent.guided) query.set('wizard', '1');
    if (target) query.set('connectionId', target.id);
    return Response.redirect(`${origin}/?${query}`, 302);
  }
  if (intent.connectionId && !target) return returnToApp('page_missing');
  if (url.searchParams.has('error')) return returnToApp('cancelled');
  const code = url.searchParams.get('code');
  check(code, 'Facebook chưa trả về mã kết nối.');
  try {
    const params = new URLSearchParams({
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    });
    const response = await fetch(
      `https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/oauth/access_token?${params}`,
      { signal: AbortSignal.timeout(20000) },
    );
    const data = (await response.json()) as { access_token?: string };
    check(
      response.ok && data.access_token,
      'Facebook chưa cấp quyền kết nối. Hãy thử lại.',
      400,
    );
    // Exchange the initial token for a long-lived user token before getting Page tokens.
    const longParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: data.access_token,
    });
    const longResponse = await fetch(
      `https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/oauth/access_token?${longParams}`,
      { signal: AbortSignal.timeout(20000) },
    );
    const longData = (await longResponse.json()) as { access_token?: string };
    check(
      longResponse.ok && longData.access_token,
      'Chưa thể hoàn tất phiên Facebook. Hãy kết nối lại.',
      400,
    );
    let nextPath = 'me/accounts?fields=id,name,access_token&limit=100';
    let count = 0;
    for (let page = 0; page < 10; page++) {
      const pages = (await graph(nextPath, longData.access_token, {
        version: env.META_GRAPH_VERSION,
      })) as {
        data?: { id: string; name: string; access_token?: string }[];
        paging?: { cursors?: { after?: string }; next?: string };
      };
      for (const p of pages.data || []) {
        if (p.access_token && (!target || p.id === target.remote_id)) {
          await upsertConnection(u, p.id, p.name, p.access_token);
          count++;
        }
      }
      if (!pages.paging?.next || !pages.paging.cursors?.after) break;
      nextPath = `me/accounts?fields=id,name,access_token&limit=100&after=${encodeURIComponent(pages.paging.cursors.after)}`;
    }
    await log(u, `Kết nối Facebook: ${count} Fanpage.`);
    return returnToApp(count ? 'success' : target ? 'page_missing' : 'empty');
  } catch {
    return returnToApp('failed');
  }
}

export async function handleApi(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
    const method = req.method;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      check(
        requestOrigin(req, env.LOCAL_GATEWAY_TOKEN) ===
          publicOrigin(req.url, env.PUBLIC_APP_URL),
        'Phiên thao tác không hợp lệ. Hãy tải lại trang.',
        403,
      );
    }
    if (path === 'health' && method === 'GET')
      return json({
        ok: true,
        origin: publicOrigin(req.url, env.PUBLIC_APP_URL),
      });
    if (['auth/login', 'auth/register'].includes(path) && method === 'POST') {
      const b = await body(req);
      const email = text(b.email, 254).toLowerCase();
      const password = typeof b.password === 'string' ? b.password : '';
      check(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
          password.length >= 10 &&
          password.length <= 128,
        'Nhập email hợp lệ và mật khẩu từ 10 đến 128 ký tự.',
      );
      const ip = req.headers.get('cf-connecting-ip') || 'local';
      await rateLimit(`auth:ip:${await sha256(ip)}`, 40, 900000);
      await rateLimit(`auth:email:${await sha256(email)}`, 8, 900000);
      let u: User;
      if (path === 'auth/register') {
        const name = text(b.name, 80);
        check(name, 'Vui lòng nhập tên của bạn.');
        check(
          !(await db()
            .prepare('SELECT id FROM users WHERE email=?')
            .bind(email)
            .first()),
          'Không thể đăng ký email này. Hãy đăng nhập hoặc dùng email khác.',
          409,
        );
        u = { id: id(), name, email };
        try {
          await db()
            .prepare(
              'INSERT INTO users(id,name,email,password_hash,created_at) VALUES (?,?,?,?,?)',
            )
            .bind(u.id, name, email, await hashPassword(password), Date.now())
            .run();
        } catch {
          throw new HttpError(
            409,
            'Không thể đăng ký email này. Hãy thử đăng nhập.',
          );
        }
      } else {
        const row = await db()
          .prepare(
            'SELECT id,email,name,password_hash FROM users WHERE email=?',
          )
          .bind(email)
          .first<User & { password_hash: string }>();
        // Use the same password derivation even if the email does not exist.
        const dummy =
          'pbkdf2-sha256$100000$0000000000000000000000000000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
        const valid = await verifyPassword(
          password,
          row?.password_hash || dummy,
        );
        check(row && valid, 'Email hoặc mật khẩu chưa đúng.', 401);
        u = { id: row.id, email: row.email, name: row.name };
      }
      const token = randomToken();
      await db()
        .prepare(
          'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)',
        )
        .bind(await sha256(token), u.id, Date.now() + 7 * 86400000)
        .run();
      return json({ user: u }, 200, {
        'Set-Cookie': cookie(req, token, 7 * 86400),
      });
    }
    if (path === 'auth/logout' && method === 'POST') {
      await db()
        .prepare('DELETE FROM sessions WHERE token_hash=?')
        .bind(await sessionHash(req))
        .run();
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, '', 0) });
    }
    const u = await user(req);
    if (path === 'auth/me') return json({ user: u });
    if (path === 'facebook/setup' && method === 'GET')
      return json(facebookSetup(env, req.url));
    const connectionCheck = path.match(/^connections\/([^/]+)\/check$/);
    if (connectionCheck && method === 'POST') {
      const connection = await db()
        .prepare(
          "SELECT * FROM connections WHERE id=? AND user_id=? AND kind='page'",
        )
        .bind(connectionCheck[1], u.id)
        .first<Connection>();
      check(connection, 'Không tìm thấy Fanpage.', 404);
      const result = unknownHealth(connection.id);
      if (!facebookSetup(env, req.url).ready)
        return json({
          ...result,
          status: 'configuration_required',
          title: 'Máy này chưa đủ cấu hình',
          message:
            'Hoàn tất bước Kiểm tra cấu hình trước khi xác minh quyền Facebook.',
        });
      if (!connection.credential)
        return json({
          ...result,
          status: 'unavailable',
          title: 'Cần kết nối lại',
          message:
            'Fanpage chưa có thông tin xác thực. Kết nối lại để nhận quyền truy cập.',
        });
      let token: string;
      try {
        token = await decrypt(connection.credential, env.TOKEN_ENCRYPTION_KEY!);
      } catch {
        return json({
          ...result,
          status: 'unavailable',
          title: 'Chưa đọc được kết nối đã lưu',
          message:
            'Khóa mã hóa hiện tại không khớp. Kiểm tra bản sao cấu hình hoặc kết nối lại Fanpage; giữ nguyên dữ liệu hiện có.',
        });
      }
      return json(
        await inspectConnection(
          env,
          connection.id,
          connection.remote_id,
          token,
        ),
      );
    }
    if (path === 'bootstrap' && method === 'GET') {
      await db()
        .prepare(
          "UPDATE targets SET status='unknown',error='Phiên xử lý bị gián đoạn. Kiểm tra bài trên Facebook trước khi tiếp tục.' WHERE status='processing' AND updated_at<? AND post_id IN (SELECT id FROM posts WHERE user_id=?)",
        )
        .bind(Date.now() - 120000, u.id)
        .run();
      const [connectionRows, postRows, targetRows, activities] =
        await Promise.all([
          db()
            .prepare(
              'SELECT id,name,kind,remote_id,url,created_at FROM connections WHERE user_id=? ORDER BY created_at DESC',
            )
            .bind(u.id)
            .all(),
          db()
            .prepare(
              'SELECT * FROM posts WHERE user_id=? ORDER BY updated_at DESC LIMIT 200',
            )
            .bind(u.id)
            .all(),
          db()
            .prepare(
              'SELECT t.*,c.name,c.kind,c.url FROM targets t JOIN posts p ON p.id=t.post_id JOIN connections c ON c.id=t.connection_id WHERE p.user_id=?',
            )
            .bind(u.id)
            .all(),
          db()
            .prepare(
              'SELECT id,message,created_at FROM activity WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
            )
            .bind(u.id)
            .all(),
        ]);
      return json({
        user: u,
        connections: connectionRows.results,
        posts: postRows.results,
        targets: targetRows.results,
        activity: activities.results,
        config: {
          oauthReady: facebookSetup(env, req.url).ready,
          callbackUrl: `${publicOrigin(req.url, env.PUBLIC_APP_URL)}/api/facebook/callback`,
          graphVersion: env.META_GRAPH_VERSION || 'v25.0',
        },
      });
    }
    if (
      ['facebook/connect', 'facebook/callback'].includes(path) &&
      method === 'GET'
    )
      return await oauth(req, u, path, url);
    const commentRoute = path.match(
      /^connections\/([^/]+)\/(facebook-posts|comments)(?:\/(\d+(?:_\d+)?)(\/replies)?)?$/,
    );
    if (commentRoute) {
      const [, connectionId, resource, commentId, replies] = commentRoute;
      const c = await db()
        .prepare('SELECT * FROM connections WHERE id=? AND user_id=?')
        .bind(connectionId, u.id)
        .first<Connection>();
      check(c, 'Không tìm thấy kết nối.', 404);
      check(
        c.kind === 'page',
        'Quản lý bình luận tự động chỉ áp dụng cho Fanpage.',
      );
      check(
        c.credential && env.TOKEN_ENCRYPTION_KEY,
        'Hãy kết nối lại Fanpage.',
      );
      const token = await decrypt(c.credential, env.TOKEN_ENCRYPTION_KEY);
      const after = url.searchParams.get('after') || '';
      check(after.length <= 2048, 'Mã phân trang không hợp lệ.');
      const version = env.META_GRAPH_VERSION;
      const options = { version, resource: 'comment' as const };
      if (resource === 'facebook-posts') {
        check(method === 'GET' && !commentId, 'Không tìm thấy chức năng.', 404);
        const query = new URLSearchParams({
          fields: 'id,message,created_time,permalink_url',
          limit: '25',
        });
        if (after) query.set('after', after);
        const result = (await graph(
          `${c.remote_id}/posts?${query}`,
          token,
          options,
        )) as {
          data?: {
            id: string;
            message?: string;
            created_time?: string;
            permalink_url?: string;
          }[];
          paging?: { next?: string; cursors?: { after?: string } };
        };
        check(
          Array.isArray(result.data),
          'Chưa tải được danh sách bài viết từ Facebook.',
          502,
        );
        return json({
          items: result.data
            .filter(
              (p) =>
                p.id.startsWith(`${c.remote_id}_`) && /^\d+_\d+$/.test(p.id),
            )
            .map((p) => ({
              id: p.id,
              message: p.message || '',
              createdTime: p.created_time || '',
              url: safeFacebookLink(
                p.permalink_url,
                `https://www.facebook.com/${p.id}`,
              ),
            })),
          nextCursor: result.paging?.next
            ? result.paging.cursors?.after || null
            : null,
        });
      }
      const b = ['POST', 'PATCH'].includes(method) ? await body(req) : {};
      const postId =
        typeof b.postId === 'string'
          ? b.postId
          : url.searchParams.get('postId') || '';
      check(
        /^\d+_\d+$/.test(postId) && postId.startsWith(`${c.remote_id}_`),
        'Bài viết không thuộc Fanpage này.',
        400,
      );
      // Verify the parent with Facebook before accessing any comment node.
      const post = (await graph(
        `${postId}?fields=id,from,object_id`,
        token,
        options,
      )) as { id?: string; from?: { id?: string }; object_id?: string };
      check(
        post.id === postId && post.from?.id === c.remote_id,
        'Không tìm thấy bài viết của Fanpage.',
        404,
      );
      let remoteComment: Parameters<typeof commentView>[0] | undefined;
      if (commentId) {
        remoteComment = (await graph(
          `${commentId}?fields=${commentFields},object`,
          token,
          options,
        )) as Parameters<typeof commentView>[0];
        check(
          remoteComment.id === commentId &&
            remoteComment.object?.id &&
            [postId, postId.split('_')[1], post.object_id].includes(
              remoteComment.object.id,
            ),
          'Bình luận không thuộc bài viết đã chọn.',
          404,
        );
      }
      if (method === 'GET') {
        check(!commentId || replies, 'Không tìm thấy chức năng.', 404);
        return json(
          await listComments(
            commentId || postId,
            token,
            c.remote_id,
            after,
            version,
          ),
        );
      }
      let result: Record<string, unknown>;
      let actionLabel = '';
      if (method === 'POST' && (!commentId || replies)) {
        const message = typeof b.message === 'string' ? b.message.trim() : '';
        check(
          message.length > 0 && message.length <= 8000,
          'Nội dung bình luận cần từ 1 đến 8.000 ký tự.',
        );
        if (remoteComment)
          check(
            remoteComment.can_comment === true,
            'Facebook chưa cho phép trả lời bình luận này.',
            403,
          );
        result = await graph(`${commentId || postId}/comments`, token, {
          ...options,
          method: 'POST',
          body: new URLSearchParams({ message }),
        });
        check(
          typeof result.id === 'string',
          'Chưa xác nhận được bình luận đã gửi. Tải lại trước khi gửi lại.',
          502,
        );
        actionLabel = commentId ? 'Đã trả lời bình luận' : 'Đã thêm bình luận';
      } else if (method === 'PATCH' && remoteComment && !replies) {
        check(
          'message' in b !== 'isHidden' in b,
          'Chọn một thao tác sửa hoặc ẩn/hiện bình luận.',
        );
        const params = new URLSearchParams();
        if ('message' in b) {
          check(
            remoteComment.from?.id === c.remote_id,
            'Chỉ sửa được bình luận do Fanpage này viết.',
            403,
          );
          const message = typeof b.message === 'string' ? b.message.trim() : '';
          check(
            message.length > 0 && message.length <= 8000,
            'Nội dung bình luận cần từ 1 đến 8.000 ký tự.',
          );
          params.set('message', message);
          actionLabel = 'Đã sửa bình luận';
        } else {
          check(
            typeof b.isHidden === 'boolean',
            'Trạng thái ẩn/hiện không hợp lệ.',
          );
          check(
            remoteComment.can_hide === true,
            'Facebook chưa cho phép ẩn/hiện bình luận này.',
            403,
          );
          params.set('is_hidden', String(b.isHidden));
          actionLabel = b.isHidden
            ? 'Đã ẩn bình luận'
            : 'Đã hiện lại bình luận';
        }
        result = await graph(commentId!, token, {
          ...options,
          method: 'POST',
          body: params,
        });
      } else if (method === 'DELETE' && remoteComment && !replies) {
        check(
          remoteComment.can_remove === true,
          'Facebook chưa cho phép xóa bình luận này.',
          403,
        );
        result = await graph(commentId!, token, {
          ...options,
          method: 'DELETE',
        });
        actionLabel = 'Đã xóa bình luận';
      } else throw new HttpError(404, 'Không tìm thấy chức năng.');
      check(
        (result as unknown) === true ||
          result.success === true ||
          typeof result.id === 'string',
        'Facebook chưa xác nhận thao tác. Hãy tải lại bình luận trước khi thử lại.',
        502,
      );
      await log(u, `${actionLabel} trên ${c.name} (bài ${postId}).`);
      return json({
        ok: true,
        id: typeof result.id === 'string' ? result.id : undefined,
        message: actionLabel,
      });
    }
    if (path === 'connections' && method === 'POST') {
      const b = await body(req);
      const name = text(b.name, 80);
      check(name, 'Vui lòng nhập tên tài khoản.');
      check(
        ['page', 'profile'].includes(String(b.kind)),
        'Loại tài khoản không hợp lệ.',
      );
      if (b.kind === 'profile') {
        const profile = facebookUrl(b.url);
        await db()
          .prepare(
            "INSERT INTO connections(id,user_id,name,kind,remote_id,url,created_at) VALUES (?,?,?,'profile',?,?,?) ON CONFLICT(user_id,kind,remote_id) DO UPDATE SET name=excluded.name,url=excluded.url",
          )
          .bind(id(), u.id, name, profile, profile, Date.now())
          .run();
      } else {
        const pageId = text(b.pageId, 50);
        const token = text(b.token, 4096);
        check(
          /^\d+$/.test(pageId) && token,
          'Vui lòng nhập Page ID và Page Access Token.',
        );
        const page = await graph(`${pageId}?fields=id,name`, token, {
          version: env.META_GRAPH_VERSION,
        });
        check(page.id === pageId, 'Token không thuộc Fanpage đã chọn.');
        await upsertConnection(
          u,
          pageId,
          typeof page.name === 'string' ? page.name : name,
          token,
        );
      }
      await log(u, `Đã thêm kết nối ${name}.`);
      return json({ ok: true }, 201);
    }
    const connectionMatch = path.match(/^connections\/([^/]+)$/);
    if (connectionMatch && method === 'DELETE') {
      const connection = await db()
        .prepare('SELECT id,name FROM connections WHERE id=? AND user_id=?')
        .bind(connectionMatch[1], u.id)
        .first<{ id: string; name: string }>();
      check(connection, 'Không tìm thấy kết nối.', 404);
      const used = await db()
        .prepare('SELECT id FROM targets WHERE connection_id=? LIMIT 1')
        .bind(connection.id)
        .first();
      check(
        !used,
        'Kết nối đang gắn với bài viết. Hãy xoá bản nháp hoặc các bản ghi liên quan trước.',
        409,
      );
      await db()
        .prepare('DELETE FROM connections WHERE id=? AND user_id=?')
        .bind(connection.id, u.id)
        .run();
      await log(u, `Đã gỡ kết nối ${connection.name}.`);
      return json({ ok: true });
    }
    if (path === 'media' && method === 'POST') {
      check(
        Number(req.headers.get('content-length') || 0) <= 9 * 1024 * 1024,
        'Ảnh tối đa 8 MB.',
      );
      const form = await req.formData();
      const file = form.get('file');
      check(
        file instanceof File && file.size > 0 && file.size <= 8 * 1024 * 1024,
        'Chọn ảnh JPG, PNG hoặc WebP tối đa 8 MB.',
      );
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
        (b, i) => bytes[i] === b,
      );
      const webp =
        new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
        new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
      check(jpg || png || webp, 'Tệp cần là ảnh JPG, PNG hoặc WebP hợp lệ.');
      const mime = jpg ? 'image/jpeg' : png ? 'image/png' : 'image/webp';
      const mediaId = id();
      const key = `${u.id}/${mediaId}`;
      await env.FILES.put(key, file.stream(), {
        httpMetadata: { contentType: mime },
      });
      await db()
        .prepare(
          'INSERT INTO media(id,user_id,object_key,mime,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(mediaId, u.id, key, mime, Date.now())
        .run();
      return json({ id: mediaId, url: `/api/media/${mediaId}` }, 201);
    }
    const mediaMatch = path.match(/^media\/([^/]+)$/);
    if (mediaMatch && method === 'GET') {
      const m = await db()
        .prepare('SELECT object_key,mime FROM media WHERE id=? AND user_id=?')
        .bind(mediaMatch[1], u.id)
        .first<{ object_key: string; mime: string }>();
      check(m, 'Không tìm thấy ảnh.', 404);
      const object = await env.FILES.get(m.object_key);
      check(object, 'Không tìm thấy ảnh.', 404);
      return new Response(object.body, {
        headers: {
          'Content-Type': m.mime,
          'Cache-Control': 'private,max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (path === 'posts' && method === 'POST') {
      const b = await body(req);
      const title = text(b.title, 160);
      const message = text(b.message, 20000);
      check(title && message, 'Vui lòng nhập tên bài và nội dung.');
      const ids = await selectedConnections(u, b.connectionIds || []);
      const mediaId = text(b.mediaId, 80) || null;
      if (mediaId)
        check(
          await db()
            .prepare('SELECT id FROM media WHERE id=? AND user_id=?')
            .bind(mediaId, u.id)
            .first(),
          'Ảnh không thuộc tài khoản này.',
        );
      const postId = id(),
        now = Date.now();
      await db().batch([
        db()
          .prepare(
            'INSERT INTO posts(id,user_id,title,message,image_url,media_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
          )
          .bind(
            postId,
            u.id,
            title,
            message,
            imageUrl(b.imageUrl),
            mediaId,
            now,
            now,
          ),
        ...ids.map((cid) =>
          db()
            .prepare(
              "INSERT INTO targets(id,post_id,connection_id,status,updated_at) VALUES (?,?,?,'draft',?)",
            )
            .bind(id(), postId, cid, now),
        ),
      ]);
      await log(u, `Đã tạo bản nháp “${title}”.`);
      return json({ id: postId }, 201);
    }
    const postMatch = path.match(
      /^posts\/([^/]+)(?:\/(publish|sync|remove|manual|reconcile))?$/,
    );
    if (postMatch) {
      const p = await ownedPost(u, postMatch[1]);
      const action = postMatch[2];
      if (method === 'DELETE' && !action) {
        const active = await db()
          .prepare(
            "SELECT id FROM targets WHERE post_id=? AND status IN ('published','processing','unknown','manual_done') LIMIT 1",
          )
          .bind(p.id)
          .first();
        check(
          !active,
          'Bài còn bản đã đăng hoặc chưa xác định trên Facebook. Hãy xử lý các bản đó trước khi xoá bản nháp.',
          409,
        );
        const removed = await db()
          .prepare(
            "DELETE FROM posts WHERE id=? AND user_id=? AND NOT EXISTS (SELECT 1 FROM targets WHERE post_id=? AND status IN ('published','processing','unknown','manual_done'))",
          )
          .bind(p.id, u.id, p.id)
          .run();
        check(
          removed.meta.changes > 0,
          'Trạng thái bài đã thay đổi. Hãy tải lại.',
          409,
        );
        await log(u, `Đã xoá bản nháp “${p.title}”.`);
        return json({ ok: true });
      }
      if (method === 'PATCH' && !action) {
        const b = await body(req);
        const title = text(b.title, 160);
        const message = text(b.message, 20000);
        check(title && message, 'Vui lòng nhập tên bài và nội dung.');
        const ids = await selectedConnections(u, b.connectionIds || []);
        const mediaId = text(b.mediaId, 80) || null;
        if (mediaId)
          check(
            await db()
              .prepare('SELECT id FROM media WHERE id=? AND user_id=?')
              .bind(mediaId, u.id)
              .first(),
            'Ảnh không thuộc tài khoản này.',
          );
        const locked = await db()
          .prepare(
            "SELECT id FROM targets WHERE post_id=? AND status='processing'",
          )
          .bind(p.id)
          .first();
        check(!locked, 'Bài đang được xử lý. Hãy đợi hoàn tất.', 409);
        const changed = await db()
          .prepare(
            "UPDATE posts SET title=?,message=?,image_url=?,media_id=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND NOT EXISTS (SELECT 1 FROM targets WHERE post_id=? AND status='processing')",
          )
          .bind(
            title,
            message,
            imageUrl(b.imageUrl),
            mediaId,
            Date.now(),
            p.id,
            u.id,
            Number(b.version),
            p.id,
          )
          .run();
        check(
          changed.meta.changes === 1,
          'Bài đã thay đổi ở cửa sổ khác. Hãy tải lại trước khi sửa.',
          409,
        );
        const { results: current } = await db()
          .prepare('SELECT * FROM targets WHERE post_id=?')
          .bind(p.id)
          .all<Target>();
        await db().batch([
          ...current
            .filter(
              (t) =>
                !ids.includes(t.connection_id) &&
                ['draft', 'failed', 'deleted', 'manual'].includes(t.status),
            )
            .map((t) =>
              db()
                .prepare(
                  "DELETE FROM targets WHERE id=? AND status IN ('draft','failed','deleted','manual')",
                )
                .bind(t.id),
            ),
          ...ids
            .filter((cid) => !current.some((t) => t.connection_id === cid))
            .map((cid) =>
              db()
                .prepare(
                  "INSERT INTO targets(id,post_id,connection_id,status,updated_at) VALUES (?,?,?,'draft',?)",
                )
                .bind(id(), p.id, cid, Date.now()),
            ),
          db()
            .prepare(
              'INSERT INTO activity(id,user_id,message,created_at) VALUES (?,?,?,?)',
            )
            .bind(id(), u.id, `Đã lưu nội dung “${title}”.`, Date.now()),
        ]);
        return json({ ok: true });
      }
      if (method === 'POST' && action) {
        const b = await body(req);
        if (action === 'manual') {
          const target = await db()
            .prepare(
              "SELECT t.id,t.status FROM targets t JOIN connections c ON c.id=t.connection_id WHERE t.post_id=? AND t.id=? AND c.kind='profile' AND c.user_id=?",
            )
            .bind(p.id, text(b.targetId), u.id)
            .first<Target>();
          check(target, 'Không tìm thấy tài khoản cá nhân trong bài.', 404);
          check(
            ['published', 'deleted'].includes(String(b.action)),
            'Thao tác không hợp lệ.',
          );
          check(
            b.action === 'deleted'
              ? target.status === 'manual_done'
              : ['draft', 'manual', 'deleted'].includes(target.status),
            'Trạng thái bài không phù hợp với thao tác này.',
            409,
          );
          const remoteUrl =
            b.action === 'published' ? facebookUrl(b.url) : null;
          await db()
            .prepare(
              'UPDATE targets SET status=?,remote_url=?,published_version=?,updated_at=? WHERE id=?',
            )
            .bind(
              b.action === 'published' ? 'manual_done' : 'deleted',
              remoteUrl,
              p.version,
              Date.now(),
              target.id,
            )
            .run();
          await log(u, `Đã xác nhận thao tác thủ công cho “${p.title}”.`);
          return json({ ok: true });
        }
        const { results: allTargets } = await db()
          .prepare(
            'SELECT t.* FROM targets t JOIN connections c ON c.id=t.connection_id WHERE t.post_id=? AND c.user_id=?',
          )
          .bind(p.id, u.id)
          .all<Target>();
        const targetIds = Array.isArray(b.targetIds)
          ? (b.targetIds.filter((v) => typeof v === 'string') as string[])
          : [];
        check(
          targetIds.length > 0 &&
            targetIds.length <= 20 &&
            targetIds.every((tid) => allTargets.some((t) => t.id === tid)),
          'Chọn nơi đăng hợp lệ.',
        );
        if (action === 'reconcile') {
          check(targetIds.length === 1, 'Đối chiếu từng bản đăng.');
          const target = allTargets.find((t) => t.id === targetIds[0])!;
          check(target.status === 'unknown', 'Bản này không cần đối chiếu.');
          const c = await db()
            .prepare('SELECT * FROM connections WHERE id=? AND user_id=?')
            .bind(target.connection_id, u.id)
            .first<Connection>();
          check(
            c?.kind === 'page' && c.credential && env.TOKEN_ENCRYPTION_KEY,
            'Cần kết nối lại Fanpage.',
          );
          const remoteId = text(b.remoteId, 100);
          check(
            /^\d+_\d+$/.test(remoteId) &&
              remoteId.startsWith(`${c.remote_id}_`),
            'Nhập Post ID dạng PageID_PostID của đúng Fanpage.',
          );
          const data = await graph(
            `${remoteId}?fields=id`,
            await decrypt(c.credential, env.TOKEN_ENCRYPTION_KEY),
            { version: env.META_GRAPH_VERSION },
          );
          check(data.id === remoteId, 'Chưa xác minh được bài viết.');
          await db()
            .prepare(
              "UPDATE targets SET status='published',remote_id=?,remote_url=?,published_version=NULL,error=NULL,updated_at=? WHERE id=? AND status='unknown'",
            )
            .bind(
              remoteId,
              `https://www.facebook.com/${remoteId}`,
              Date.now(),
              target.id,
            )
            .run();
          return json({ ok: true });
        }
        check(
          ['publish', 'sync', 'remove'].includes(action),
          'Thao tác không hợp lệ.',
        );
        const outcomes: { id: string; status: string; error?: string }[] = [];
        for (const t of allTargets.filter((t) => targetIds.includes(t.id))) {
          const c = await db()
            .prepare('SELECT * FROM connections WHERE id=? AND user_id=?')
            .bind(t.connection_id, u.id)
            .first<Connection>();
          check(c, 'Kết nối không còn tồn tại.', 404);
          if (c.kind === 'profile') {
            if (
              action === 'publish' &&
              ['draft', 'manual', 'deleted'].includes(t.status)
            ) {
              await db()
                .prepare(
                  "UPDATE targets SET status='manual',updated_at=? WHERE id=?",
                )
                .bind(Date.now(), t.id)
                .run();
              outcomes.push({ id: t.id, status: 'manual' });
            } else
              outcomes.push({
                id: t.id,
                status: t.status,
                error: 'Mở Facebook để hoàn tất thao tác trên trang cá nhân.',
              });
            continue;
          }
          const allowed =
            action === 'publish'
              ? ['draft', 'failed', 'deleted']
              : ['published'];
          if (!allowed.includes(t.status)) {
            outcomes.push({
              id: t.id,
              status: t.status,
              error: 'Trạng thái không phù hợp. Tải lại để kiểm tra.',
            });
            continue;
          }
          check(
            c.credential && env.TOKEN_ENCRYPTION_KEY,
            'Cần kết nối lại Fanpage.',
          );
          const claim = await db()
            .prepare(
              "UPDATE targets SET status='processing',updated_at=? WHERE id=? AND status=?",
            )
            .bind(Date.now(), t.id, t.status)
            .run();
          if (!claim.meta.changes) continue;
          try {
            const token = await decrypt(c.credential, env.TOKEN_ENCRYPTION_KEY);
            let remoteId = t.remote_id;
            if (action === 'publish') {
              let result;
              if (p.media_id || p.image_url) {
                const form = new FormData();
                form.set('caption', p.message);
                if (p.media_id) {
                  const m = await db()
                    .prepare(
                      'SELECT object_key,mime FROM media WHERE id=? AND user_id=?',
                    )
                    .bind(p.media_id, u.id)
                    .first<{ object_key: string; mime: string }>();
                  check(m, 'Không tìm thấy ảnh.');
                  const object = await env.FILES.get(m.object_key);
                  check(object, 'Không tìm thấy ảnh.');
                  form.set(
                    'source',
                    new Blob([await object.arrayBuffer()], { type: m.mime }),
                    'image',
                  );
                } else form.set('url', p.image_url!);
                result = await graph(`${c.remote_id}/photos`, token, {
                  method: 'POST',
                  body: form,
                  version: env.META_GRAPH_VERSION,
                });
                remoteId =
                  typeof result.post_id === 'string' ? result.post_id : null;
              } else {
                result = await graph(`${c.remote_id}/feed`, token, {
                  method: 'POST',
                  body: new URLSearchParams({ message: p.message }),
                  version: env.META_GRAPH_VERSION,
                });
                remoteId = typeof result.id === 'string' ? result.id : null;
              }
              if (!remoteId)
                throw new GraphError(
                  'Facebook đã nhận yêu cầu nhưng chưa trả Post ID. Kiểm tra bài trước khi thử lại.',
                  true,
                );
            } else {
              check(
                remoteId && /^\d+(?:_\d+)?$/.test(remoteId),
                'Bài chưa có mã Facebook hợp lệ.',
              );
              await graph(remoteId, token, {
                method: action === 'remove' ? 'DELETE' : 'POST',
                body:
                  action === 'sync'
                    ? new URLSearchParams({ message: p.message })
                    : undefined,
                version: env.META_GRAPH_VERSION,
              });
            }
            const status = action === 'remove' ? 'deleted' : 'published';
            await db()
              .prepare(
                'UPDATE targets SET status=?,remote_id=?,remote_url=?,error=NULL,published_version=?,updated_at=? WHERE id=?',
              )
              .bind(
                status,
                remoteId,
                remoteId ? `https://www.facebook.com/${remoteId}` : null,
                p.version,
                Date.now(),
                t.id,
              )
              .run();
            outcomes.push({ id: t.id, status });
          } catch (error) {
            const status =
              error instanceof GraphError && error.ambiguous
                ? 'unknown'
                : action === 'publish'
                  ? 'failed'
                  : 'published';
            const message =
              error instanceof GraphError || error instanceof HttpError
                ? error.message
                : 'Chưa thể hoàn tất thao tác. Hãy kết nối lại Fanpage.';
            await db()
              .prepare(
                'UPDATE targets SET status=?,error=?,updated_at=? WHERE id=?',
              )
              .bind(status, message, Date.now(), t.id)
              .run();
            outcomes.push({ id: t.id, status, error: message });
          }
        }
        await log(
          u,
          `${action === 'publish' ? 'Đăng bài' : action === 'sync' ? 'Cập nhật nội dung' : 'Xoá bản đăng'} “${p.title}”: ${outcomes.length} nơi được xử lý.`,
        );
        return json({ outcomes });
      }
    }
    throw new HttpError(404, 'Không tìm thấy chức năng.');
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof GraphError) return json({ error: error.message }, 400);
    // Do not return raw provider/SQL exceptions: they can contain private data.
    return json(
      { error: 'Chưa thể xử lý yêu cầu. Vui lòng thử lại sau.' },
      500,
    );
  }
}
