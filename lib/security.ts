const encoder = new TextEncoder();
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: encoder.encode(salt),
          iterations: 100000,
          hash: 'SHA-256',
        },
        key,
        256,
      ),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function hashPassword(password: string) {
  const salt = randomToken();
  return `pbkdf2-sha256$100000$${salt}$${await derive(password, salt)}`;
}
export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$');
  if (
    parts.length !== 4 ||
    parts[0] !== 'pbkdf2-sha256' ||
    parts[1] !== '100000'
  )
    return false;
  const actual = await derive(password, parts[2]);
  let diff = actual.length ^ parts[3].length;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return diff === 0;
}
async function encryptionKey(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret))
    throw new Error('Khoá mã hoá kết nối chưa được cấu hình.');
  return crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret.match(/../g)!, (x) => parseInt(x, 16)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await encryptionKey(secret),
      encoder.encode(value),
    ),
  );
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...data))}`;
}
export async function decrypt(value: string, secret: string) {
  const [iv, data] = value.split('.');
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)),
      },
      await encryptionKey(secret),
      Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
    ),
  );
}
