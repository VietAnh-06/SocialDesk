import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  randomToken,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  sha256,
} from '../lib/security.ts';

await test('passwords are salted and verified without storing plaintext', async () => {
  const password = 'Correct-horse-VietNam-123';
  const first = await hashPassword(password),
    second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect-password', first), false);
  assert.equal(await verifyPassword(password, 'malformed'), false);
});
await test('tokens use authenticated encryption and reject wrong keys or tampering', async () => {
  const key = randomToken(),
    token = 'not-a-real-facebook-token';
  const a = await encrypt(token, key),
    b = await encrypt(token, key);
  assert.notEqual(a, b);
  assert.equal(a.includes(token), false);
  assert.equal(await decrypt(a, key), token);
  await assert.rejects(decrypt(a, randomToken()));
  const [iv, data] = a.split('.');
  await assert.rejects(
    decrypt(`${iv}.${data[0] === 'A' ? 'B' : 'A'}${data.slice(1)}`, key),
  );
  await assert.rejects(encrypt(token, 'invalid-key'));
  assert.notEqual(await sha256(randomToken()), await sha256(randomToken()));
});
