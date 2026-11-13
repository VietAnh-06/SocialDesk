import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import {
  ensureConfig,
  writeConfig,
  validatePublicUrl,
} from './local-config.mjs';

let hidden = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!hidden) process.stdout.write(chunk, encoding);
    done();
  },
});
const terminal = !!process.stdin.isTTY;
const reader = createInterface({ input: process.stdin, output, terminal });
async function ask(prompt, secret = false) {
  const question = reader.question(prompt);
  hidden = secret;
  try {
    return (await question).trim();
  } finally {
    hidden = false;
    if (secret) process.stdout.write('\n');
  }
}
try {
  const config = ensureConfig();
  console.log(
    '\nCAU HINH SOCIALDESK LOCAL\nNhan Enter de giu nguyen gia tri da luu.\n',
  );
  const appId = await ask(`Meta App ID [${config.META_APP_ID}]: `);
  if (appId) {
    if (!/^\d+$/.test(appId)) throw new Error('App ID chi gom chu so.');
    config.META_APP_ID = appId;
  }
  const secret = await ask(
    `Meta App Secret [${config.META_APP_SECRET ? 'da luu' : 'chua co'}] (an khi nhap): `,
    true,
  );
  if (secret) config.META_APP_SECRET = secret;
  console.log(
    'Chi bat binh luan sau khi da them pages_read_user_content va pages_manage_engagement trong Meta App.',
  );
  const comments = await ask(
    `Bat xin quyen quan ly binh luan? y/n [${/^(true|1)$/i.test(config.META_COMMENTS_ENABLED) ? 'y' : 'n'}]: `,
  );
  if (comments) {
    if (!/^(y|n)$/i.test(comments)) throw new Error('Chi nhap y hoac n.');
    config.META_COMMENTS_ENABLED =
      comments.toLowerCase() === 'y' ? 'true' : 'false';
  }
  const fixed = await ask(
    `Dia chi HTTPS co dinh [${config.PUBLIC_APP_URL || 'dang dung link tam'}] (nhap - de dung link tam): `,
  );
  if (fixed === '-') {
    config.PUBLIC_APP_URL = '';
    config.TUNNEL_TOKEN = '';
  } else if (fixed) config.PUBLIC_APP_URL = validatePublicUrl(fixed);
  if (config.PUBLIC_APP_URL) {
    const token = await ask(
      `Cloudflare Tunnel token [${config.TUNNEL_TOKEN ? 'da luu' : 'chua co'}] (an khi nhap): `,
      true,
    );
    if (token) config.TUNNEL_TOKEN = token;
  }
  writeConfig(resolve('.dev.vars'), config);
  console.log(
    '\nDa luu cau hinh. Dong va mo lai CHAY-LOCAL.cmd (hoac CHIA-SE-INTERNET.cmd) de ap dung.',
  );
  console.log(
    'App Secret chi duoc luu tren may chu, khong hien cho nguoi dung website.',
  );
} catch (error) {
  console.error(`\nKhong the luu: ${error.message}`);
  process.exitCode = 1;
} finally {
  reader.close();
}
