export class GraphError extends Error {
  ambiguous: boolean;
  code?: number;
  constructor(message: string, ambiguous = false, code?: number) {
    super(message);
    this.ambiguous = ambiguous;
    this.code = code;
  }
}
export async function graph(
  path: string,
  token: string,
  options: {
    method?: string;
    body?: URLSearchParams | FormData;
    version?: string;
    resource?: 'comment' | 'connection';
  } = {},
) {
  const version = /^v\d+\.\d+$/.test(options.version || '')
    ? options.version
    : 'v25.0';
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
      method: options.method || 'GET',
      body: options.body,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new GraphError(
      options.resource === 'connection'
        ? 'Chưa liên hệ được với Facebook. Kiểm tra Internet rồi thử kiểm tra lại.'
        : options.resource === 'comment'
          ? 'Mất kết nối với Facebook. Tải lại bình luận và kiểm tra trên Facebook trước khi gửi lại để tránh trùng phản hồi.'
          : 'Mất kết nối với Facebook. Kiểm tra bài trên Facebook trước khi thử lại để tránh đăng trùng.',
      true,
    );
  }
  let data;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new GraphError(
      'Facebook trả về phản hồi chưa xác định. Vui lòng kiểm tra trên Facebook trước khi thử lại.',
      true,
    );
  }
  if (!response.ok || data.error) {
    const code = Number((data.error as { code?: number } | undefined)?.code);
    const message =
      code === 190
        ? 'Kết nối Facebook hết hạn. Hãy kết nối lại Fanpage.'
        : code === 10 || code === 200
          ? options.resource === 'connection'
            ? 'Facebook chưa cho phép kiểm tra quyền của kết nối này. Kiểm tra Meta App hoặc kết nối lại Fanpage.'
            : options.resource === 'comment'
              ? 'Chưa đủ quyền quản lý bình luận. Mở Kiểm tra kết nối và chọn Cho phép thêm quyền. Nếu Facebook báo quyền chưa được hỗ trợ, người cài đặt cần kiểm tra Meta App.'
              : 'Chưa đủ quyền quản lý bài viết trên Fanpage này.'
          : code === 4 || code === 17 || code === 32 || code === 613
            ? 'Facebook đang giới hạn yêu cầu. Hãy thử lại sau.'
            : `Facebook chưa chấp nhận thao tác${Number.isFinite(code) ? ` (mã ${code})` : ''}. Kiểm tra quyền và nội dung bài viết.`;
    throw new GraphError(
      message,
      response.status >= 500,
      Number.isFinite(code) ? code : undefined,
    );
  }
  return data;
}
