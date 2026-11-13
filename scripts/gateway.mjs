import { createServer, request } from 'node:http';

const apiPaths =
  /^\/api\/(?:health|bootstrap|auth\/(?:me|login|register|logout)|facebook\/(?:setup|connect|callback)|connections(?:\/[a-zA-Z0-9_-]+(?:\/(?:check|facebook-posts|comments(?:\/\d+(?:_\d+)?(?:\/replies)?)?))?)?|posts(?:\/[a-zA-Z0-9_-]+(?:\/(?:publish|sync|remove|manual|reconcile))?)?|media(?:\/[a-zA-Z0-9_-]+)?)$/;
export function allowedPath(path) {
  if (/%(?:2f|5c|2e|25)/i.test(path) || path.includes('\\')) return false;
  return (
    path === '/' ||
    path === '/favicon.svg' ||
    path === '/screenshot.jpeg' ||
    apiPaths.test(path) ||
    (/^\/_next\/static\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|png|jpe?g|svg|webp)$/.test(
      path,
    ) &&
      !path.includes('..'))
  );
}

/** Only application routes reach Wrangler. Its local explorer/inspector stay private. */
export function createGateway({ upstreamPort, publicUrl, gatewayToken }) {
  const origin = new URL(publicUrl);
  const server = createServer((req, res) => {
    const headers = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "frame-ancestors 'none'",
    };
    const fail = (status, message) => {
      if (!res.headersSent)
        res.writeHead(status, {
          ...headers,
          'Content-Type': 'text/plain; charset=utf-8',
        });
      res.end(message);
    };
    let parsed;
    try {
      parsed = new URL(req.url, publicUrl);
    } catch {
      fail(400, 'Invalid URL');
      return;
    }
    if (
      !['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].includes(
        req.method,
      ) ||
      !allowedPath(req.url.split('?')[0]) ||
      !allowedPath(parsed.pathname)
    ) {
      fail(404, 'Not found');
      return;
    }
    if (req.headers.host !== origin.host && parsed.pathname !== '/api/health') {
      if (['GET', 'HEAD'].includes(req.method) && parsed.pathname === '/') {
        res.writeHead(302, { ...headers, Location: origin.href });
        res.end();
      } else
        fail(421, 'Mo website bang dia chi duoc hien trong cua so SocialDesk.');
      return;
    }
    if (Number(req.headers['content-length'] || 0) > 9 * 1024 * 1024) {
      fail(413, 'Anh toi da 8 MB.');
      return;
    }
    const forwarded = {
      ...req.headers,
      host: origin.host,
      'x-forwarded-proto': origin.protocol.slice(0, -1),
      'x-forwarded-host': origin.host,
    };
    for (const key of Object.keys(forwarded))
      if (
        key.startsWith('oai-') ||
        key.startsWith('x-socialdesk-') ||
        [
          'connection',
          'upgrade',
          'proxy-authorization',
          'proxy-connection',
        ].includes(key)
      )
        delete forwarded[key];
    if (gatewayToken) {
      forwarded['x-socialdesk-gateway'] = gatewayToken;
      forwarded['x-socialdesk-origin-b64'] = Buffer.from(
        req.headers.origin || '',
        'utf8',
      ).toString('base64url');
    }
    const proxy = request(
      {
        hostname: '127.0.0.1',
        port: upstreamPort,
        path: `${parsed.pathname}${parsed.search}`,
        method: req.method,
        headers: forwarded,
        timeout: 90000,
      },
      (response) => {
        res.writeHead(response.statusCode || 502, {
          ...response.headers,
          ...headers,
        });
        response.pipe(res);
      },
    );
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 9 * 1024 * 1024) {
        req.unpipe(proxy);
        proxy.destroy();
        fail(413, 'Anh toi da 8 MB.');
      }
    });
    req.on('aborted', () => proxy.destroy());
    res.on('close', () => {
      if (!res.writableEnded) proxy.destroy();
    });
    proxy.on('timeout', () => {
      proxy.destroy();
      fail(
        504,
        'Yeu cau mat nhieu thoi gian. Kiem tra trang thai bai truoc khi thu lai.',
      );
    });
    proxy.on('error', () => {
      if (!res.writableEnded)
        fail(502, 'May chu dang khoi dong. Vui long tai lai sau.');
    });
    req.pipe(proxy);
  });
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.requestTimeout = 95000;
  server.headersTimeout = 15000;
  return server;
}
