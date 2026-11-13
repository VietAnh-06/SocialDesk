/** The configured public origin is authoritative behind the local HTTPS tunnel. */
export function publicOrigin(requestUrl: string, configured?: string) {
  if (!configured?.trim()) return new URL(requestUrl).origin;
  const url = new URL(configured.trim());
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'PUBLIC_APP_URL phải là địa chỉ HTTPS của website, không có đường dẫn.',
    );
  }
  return url.origin;
}

/** Wrangler rewrites URL-valued headers. The local gateway preserves Origin as encoded data. */
export function requestOrigin(request: Request, gatewayToken?: string) {
  if (!gatewayToken) return request.headers.get('origin');
  if (request.headers.get('x-socialdesk-gateway') !== gatewayToken) return null;
  const encoded = request.headers.get('x-socialdesk-origin-b64') || '';
  if (encoded.length > 4096 || !/^[a-zA-Z0-9_-]*$/.test(encoded)) return null;
  try {
    return atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
}
