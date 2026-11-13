import { spawn, execFile } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { readFile, rename, chmod } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createServer } from 'node:net';
import {
  ensureConfig,
  validatePublicUrl,
  writeConfig,
} from './local-config.mjs';
import { createGateway } from './gateway.mjs';
import { buildNeeded } from './build-state.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const share = process.argv[2] === 'share';
const noOpen = process.argv.includes('--no-open');
const children = new Set();
let gateway;
let stopping = false;

async function stopChild(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32')
    await new Promise((done) =>
      execFile(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true },
        () => done(),
      ),
    );
  else child.kill('SIGTERM');
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  gateway?.closeAllConnections();
  gateway?.close();
  await Promise.all([...children].map(stopChild));
  process.exit(code);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

function child(command, args, options = {}) {
  const spawned = spawn(command, args, {
    cwd: root,
    windowsHide: true,
    ...options,
  });
  children.add(spawned);
  spawned.on('close', () => children.delete(spawned));
  return spawned;
}
async function run(command, args, env = {}) {
  await new Promise((done, reject) => {
    const p = child(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    p.on('error', reject);
    p.on('exit', (code) =>
      code === 0
        ? done()
        : reject(new Error(`Tac vu ket thuc voi ma ${code}.`)),
    );
  });
}
function npm(args) {
  const env = {
    npm_config_cache: resolve('.cache/npm'),
    WRANGLER_SEND_METRICS: 'false',
  };
  return process.platform === 'win32'
    ? run(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`],
        env,
      )
    : run('npm', args, env);
}
async function freePort(port) {
  await new Promise((done, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(
        new Error(
          `Cong ${port} dang duoc su dung. Dong phien SocialDesk cu truoc khi mo lai.`,
        ),
      ),
    );
    server.listen(port, '127.0.0.1', () => server.close(done));
  });
}
async function downloadTunnel() {
  const destination = resolve('.tools/cloudflared.exe');
  if (existsSync(destination)) return destination;
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error(
      'Ban dong goi nay dung Windows 64-bit. Cai cloudflared phu hop va dat duong dan SOCIALDESK_CLOUDFLARED neu dung he dieu hanh khac.',
    );
  console.log(
    'Dang tai cloudflared tu ban phat hanh chinh thuc cua Cloudflare...',
  );
  mkdirSync('.tools', { recursive: true });
  const releaseResponse = await fetch(
    'https://api.github.com/repos/cloudflare/cloudflared/releases/latest',
    {
      headers: { 'User-Agent': 'SocialDesk-Local-Setup' },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!releaseResponse.ok)
    throw new Error(
      'Chua tai duoc thong tin cloudflared. Kiem tra ket noi Internet va thu lai.',
    );
  const release = await releaseResponse.json();
  const asset = release.assets.find(
    (a) => a.name === 'cloudflared-windows-amd64.exe',
  );
  if (
    !asset ||
    !asset.browser_download_url.startsWith(
      'https://github.com/cloudflare/cloudflared/releases/download/',
    )
  )
    throw new Error('Khong tim thay cloudflared Windows tu nguon chinh thuc.');
  const response = await fetch(asset.browser_download_url, {
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok || !response.body)
    throw new Error('Chua tai duoc cloudflared. Hay thu lai.');
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(`${destination}.tmp`),
  );
  const digest = createHash('sha256')
    .update(await readFile(`${destination}.tmp`))
    .digest('hex');
  if (asset.digest && asset.digest !== `sha256:${digest}`)
    throw new Error('Tep cloudflared khong khop ma kiem tra cua GitHub.');
  await rename(`${destination}.tmp`, destination);
  await chmod(destination, 0o700);
  writeFileSync(
    '.tools/cloudflared.json',
    JSON.stringify(
      {
        version: release.tag_name,
        sha256: digest,
        source: asset.browser_download_url,
      },
      null,
      2,
    ),
  );
  return destination;
}
async function tunnel(config, port) {
  const binary = process.env.SOCIALDESK_CLOUDFLARED || (await downloadTunnel());
  const fixed = validatePublicUrl(config.PUBLIC_APP_URL);
  if (fixed && !config.TUNNEL_TOKEN)
    throw new Error(
      'Da dat dia chi co dinh nhung chua co TUNNEL_TOKEN. Chay CAU-HINH.cmd de them token, hoac nhap - o dia chi de dung link tam.',
    );
  const args = fixed
    ? ['--no-autoupdate', 'tunnel', '--protocol', 'http2', 'run']
    : [
        '--no-autoupdate',
        'tunnel',
        '--url',
        `http://127.0.0.1:${port}`,
        '--protocol',
        'http2',
      ];
  const p = child(binary, args, {
    env: {
      ...process.env,
      ...(fixed ? { TUNNEL_TOKEN: config.TUNNEL_TOKEN } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = createWriteStream('.socialdesk/tunnel.log', {
    flags: 'a',
    mode: 0o600,
  });
  return new Promise((done, reject) => {
    let resolved = false,
      buffer = '';
    const timer = setTimeout(() => {
      if (!resolved)
        reject(
          new Error(
            'Chua tao duoc duong dan Internet. Xem .socialdesk/tunnel.log hoac thu lai.',
          ),
        );
    }, 55000);
    const consume = (chunk) => {
      let line = chunk.toString();
      if (config.TUNNEL_TOKEN)
        line = line.replaceAll(config.TUNNEL_TOKEN, '[redacted]');
      log.write(line);
      buffer = `${buffer}${line}`.slice(-16000);
      const generated = buffer.match(
        /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
      )?.[0];
      if (
        !resolved &&
        (fixed ? buffer.includes('Registered tunnel connection') : generated)
      ) {
        resolved = true;
        clearTimeout(timer);
        done(fixed || generated);
      }
    };
    p.stdout.on('data', consume);
    p.stderr.on('data', consume);
    p.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    p.on('exit', (code) => {
      log.end();
      clearTimeout(timer);
      if (!resolved)
        reject(
          new Error(
            `Duong ham ket thuc (${code}). Xem .socialdesk/tunnel.log.`,
          ),
        );
      else if (!stopping) {
        console.error(
          'Duong dan Internet da ngat. Hay dong va khoi dong lai SocialDesk.',
        );
        void stop(1);
      }
    });
  });
}
async function waitForWorker(port, processHandle) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null)
      throw new Error(
        'May chu khong khoi dong duoc. Xem .socialdesk/server.log.',
      );
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) return;
    } catch {
      /* Server is starting. */
    }
    await new Promise((done) => setTimeout(done, 400));
  }
  throw new Error('May chu chua san sang. Xem .socialdesk/server.log.');
}
function openBrowser(url) {
  if (noOpen) return;
  if (process.platform === 'win32')
    child(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', `start "" "${url}"`],
      { stdio: 'ignore' },
    );
}

try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13))
    throw new Error('Can Node.js 22.13 tro len.');
  const port = Number(process.env.SOCIALDESK_PORT || 8787),
    workerPort = port + 1;
  if (!Number.isInteger(port) || port < 1024 || port > 65534)
    throw new Error('SOCIALDESK_PORT phai tu 1024 den 65534.');
  await freePort(port);
  await freePort(workerPort);
  const config = ensureConfig();
  mkdirSync('.socialdesk', { recursive: true });
  if (!existsSync('node_modules/wrangler/bin/wrangler.js')) {
    console.log('Lan dau: dang cai cac thanh phan can thiet...');
    await npm(['ci']);
  }
  if (process.argv.includes('--rebuild') || (await buildNeeded(root))) {
    console.log('Dang cap nhat giao dien va tao ban chay moi...');
    await npm(['run', 'build']);
  }
  const env = {
    ...process.env,
    SOCIALDESK_DATA_DIR: resolve(
      process.env.SOCIALDESK_DATA_DIR || '.socialdesk/data',
    ),
    SOCIALDESK_WORKER_PORT: String(workerPort),
  };
  console.log('Dang chuan bi co so du lieu tren may nay...');
  await run(process.execPath, ['scripts/local.mjs', 'migrate'], env);
  const url = share ? await tunnel(config, port) : `http://localhost:${port}`;
  const runtimeEnv = resolve('.socialdesk/runtime.env');
  const gatewayToken = randomBytes(32).toString('hex');
  writeConfig(runtimeEnv, {
    ...config,
    PUBLIC_APP_URL: url,
    TUNNEL_TOKEN: '',
    LOCAL_GATEWAY_TOKEN: gatewayToken,
  });
  env.SOCIALDESK_RUNTIME_ENV = runtimeEnv;
  const log = createWriteStream('.socialdesk/server.log', {
    flags: 'a',
    mode: 0o600,
  });
  const worker = child(process.execPath, ['scripts/local.mjs', 'serve'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  worker.stdout.pipe(log, { end: false });
  worker.stderr.pipe(log, { end: false });
  worker.on('error', (error) => {
    console.error(error.message);
    void stop(1);
  });
  worker.on('exit', () => {
    log.end();
    if (!stopping) void stop(1);
  });
  await waitForWorker(workerPort, worker);
  gateway = createGateway({
    upstreamPort: workerPort,
    publicUrl: url,
    gatewayToken,
  });
  await new Promise((done, reject) => {
    gateway.once('error', reject);
    gateway.listen(port, '127.0.0.1', done);
  });
  const callback = `${url}/api/facebook/callback`;
  writeFileSync(
    '.socialdesk/server.json',
    JSON.stringify(
      {
        pid: process.pid,
        url,
        callback,
        port,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  writeFileSync(
    'DIA-CHI-WEBSITE.txt',
    `SocialDesk\n\nWebsite: ${url}\nCallback URL: ${callback}\nApp Domains: ${new URL(url).hostname}\n\nThem callback vao Facebook Login > Settings > Valid OAuth Redirect URIs.\nGiu cua so may chu nay mo khi nguoi khac dang su dung.\n`,
  );
  console.log(
    `\nSOCIALDESK DA SAN SANG\n\nWebsite:  ${url}\nCallback: ${callback}\nApp Domains: ${new URL(url).hostname}\n`,
  );
  console.log(
    config.META_APP_SECRET
      ? 'Da co cau hinh Meta. Them callback moi trong Meta App truoc khi ket noi Facebook.'
      : 'Chua co Meta App Secret tren may nay. Chay CAU-HINH.cmd de nhap khoa roi khoi dong lai.',
  );
  if (share && !config.PUBLIC_APP_URL)
    console.log(
      'Day la duong dan tam; doi sau moi lan khoi dong. Dung ten mien va Cloudflare Tunnel co dinh khi van hanh lau dai.',
    );
  console.log(
    share
      ? '\nNguoi khac mo Website, tao tai khoan rieng, sau do bam Ket noi Facebook.\nNhan Ctrl+C de dung may chu va duong dan Internet.\n'
      : '\nChi truy cap tren may nay. Mo Website, dang nhap va ket noi Fanpage.\nChon Binh luan de quan ly binh luan. Nhan Ctrl+C de dung.\n',
  );
  openBrowser(url);
} catch (error) {
  console.error(`\nKhong the khoi dong: ${error.message}`);
  await stop(1);
}
