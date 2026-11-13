import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const task = process.argv[2];
const args =
  task === 'migrate'
    ? [
        'd1',
        'migrations',
        'apply',
        'DB',
        '--local',
        '--config',
        'dist/server/wrangler.json',
      ]
    : [
        'dev',
        '--config',
        'dist/server/wrangler.json',
        '--ip',
        '127.0.0.1',
        '--port',
        process.env.SOCIALDESK_WORKER_PORT || '8787',
        '--log-level',
        'error',
      ];
args.push(
  '--persist-to',
  resolve(process.env.SOCIALDESK_DATA_DIR || '.wrangler/state'),
);
if (process.env.SOCIALDESK_RUNTIME_ENV)
  args.push('--env-file', resolve(process.env.SOCIALDESK_RUNTIME_ENV));
else if (existsSync('.dev.vars')) args.push('--env-file', resolve('.dev.vars'));
const localEnv = {
  ...process.env,
  WRANGLER_WRITE_LOGS: 'false',
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_LOG_PATH: resolve('.wrangler/logs'),
  WRANGLER_REGISTRY_PATH: resolve('.wrangler/registry'),
  MINIFLARE_REGISTRY_PATH: resolve('.wrangler/registry'),
};
const child = spawn(
  process.execPath,
  [resolve('node_modules/wrangler/bin/wrangler.js'), ...args],
  { stdio: 'inherit', env: localEnv },
);
child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
