import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const knownKeys = [
  'TOKEN_ENCRYPTION_KEY',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_GRAPH_VERSION',
  'PUBLIC_APP_URL',
  'TUNNEL_TOKEN',
  'LOCAL_GATEWAY_TOKEN',
];

export function parseConfig(contents) {
  const config = {};
  for (const line of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !knownKeys.includes(match[1])) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    config[match[1]] = value;
  }
  return config;
}

export function writeConfig(file, config) {
  const lines = knownKeys.map((key) => `${key}=${config[key] || ''}`);
  if (lines.some((line) => /[\r\n]/.test(line)))
    throw new Error('Giá trị cấu hình phải nằm trên một dòng.');
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${lines.join('\n')}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

export function ensureConfig(root = process.cwd()) {
  const file = resolve(root, '.dev.vars');
  const config = existsSync(file)
    ? parseConfig(readFileSync(file, 'utf8'))
    : {};
  if (
    !config.TOKEN_ENCRYPTION_KEY ||
    config.TOKEN_ENCRYPTION_KEY === 'GENERATE_A_RANDOM_64_CHARACTER_HEX_KEY'
  )
    config.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  if (!/^[a-f0-9]{64}$/i.test(config.TOKEN_ENCRYPTION_KEY))
    throw new Error(
      'Khoá TOKEN_ENCRYPTION_KEY hiện có không hợp lệ. Giữ lại tệp cấu hình để kiểm tra, không tạo lại khoá khi đã lưu kết nối.',
    );
  config.META_APP_ID ||= '1496006092516967';
  config.META_APP_SECRET ||= '';
  config.META_GRAPH_VERSION ||= 'v25.0';
  config.PUBLIC_APP_URL ||= '';
  config.TUNNEL_TOKEN ||= '';
  writeConfig(file, config);
  return config;
}

export function validatePublicUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(
      'Địa chỉ Internet cố định phải có dạng https://ten-mien-cua-ban, không có đường dẫn.',
    );
  return url.origin;
}
