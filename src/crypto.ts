/**
 * Crypto helpers for DL HMAC signing.
 *
 * DL uses RSA-OAEP with SHA-256 outer hash and SHA-1 MGF1 to wrap the HMAC
 * secret.  The Web Crypto API only supports same-hash OAEP, so we implement
 * RSA private-key decryption via BigInt modular exponentiation and manually
 * apply the OAEP unpadding.
 *
 * HMAC signing (HMAC-SHA256) is handled by the native Web Crypto API.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

export function u8ToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64ToU8(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function b64UrlToU8(b64url: string): Uint8Array {
  return b64ToU8(b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '='));
}

function u8ToBigInt(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function bigIntToU8(n: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function xorU8(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

// ── BigInt modular exponentiation ────────────────────────────────────────────

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

// CRT for faster decryption
function rsaCrtDecrypt(c: bigint, p: bigint, q: bigint, dp: bigint, dq: bigint, qi: bigint): bigint {
  const m1 = modPow(c, dp, p);
  const m2 = modPow(c, dq, q);
  const h = (qi * ((m1 - m2 + 2n * p) % p)) % p;
  return m2 + q * h;
}

// ── MGF1-SHA1 ────────────────────────────────────────────────────────────────

async function mgf1SHA1(seed: Uint8Array, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  let offset = 0;
  for (let counter = 0; offset < length; counter++) {
    const C = new Uint8Array(seed.length + 4);
    C.set(seed);
    const dv = new DataView(C.buffer, seed.length);
    dv.setUint32(0, counter);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', C));
    const toCopy = Math.min(hash.length, length - offset);
    out.set(hash.slice(0, toCopy), offset);
    offset += toCopy;
  }
  return out;
}

// ── RSA-OAEP-SHA256/MGF1-SHA1 decrypt ───────────────────────────────────────

/**
 * Decrypt a ciphertext produced by Java's OAEPWithSHA-256AndMGF1Padding.
 * privateJwk must have keys: n, p, q, dp, dq, qi (standard RSA-CRT JWK).
 */
export async function rsaOaepSHA256MGF1SHA1Decrypt(
  ciphertext: Uint8Array,
  privateJwk: JsonWebKey
): Promise<Uint8Array> {
  // Extract CRT components
  const p  = u8ToBigInt(b64UrlToU8(privateJwk.p!));
  const q  = u8ToBigInt(b64UrlToU8(privateJwk.q!));
  const dp = u8ToBigInt(b64UrlToU8(privateJwk.dp!));
  const dq = u8ToBigInt(b64UrlToU8(privateJwk.dq!));
  const qi = u8ToBigInt(b64UrlToU8(privateJwk.qi!));

  const n  = u8ToBigInt(b64UrlToU8(privateJwk.n!));
  const k  = Math.ceil(n.toString(16).length / 2);  // byte length of modulus

  if (ciphertext.length !== k) {
    throw new Error(`Ciphertext length ${ciphertext.length} != key length ${k}`);
  }

  // RSA decrypt
  const c = u8ToBigInt(ciphertext);
  const m = rsaCrtDecrypt(c, p, q, dp, dq, qi);
  const em = bigIntToU8(m, k);

  // OAEP unpadding: outer hash = SHA-256 (hLen=32), MGF1 hash = SHA-1
  const hLen = 32;
  if (em[0] !== 0x00) throw new Error('RSA-OAEP: em[0] !== 0');

  const maskedSeed = em.slice(1, 1 + hLen);
  const maskedDB   = em.slice(1 + hLen);

  const seedMask = await mgf1SHA1(maskedDB, hLen);
  const seed     = xorU8(maskedSeed, seedMask);

  const dbMask = await mgf1SHA1(seed, maskedDB.length);
  const db     = xorU8(maskedDB, dbMask);

  // Verify lHash = SHA-256("")
  const lHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(0)));
  for (let i = 0; i < hLen; i++) {
    if (db[i] !== lHash[i]) throw new Error('RSA-OAEP: lHash mismatch — wrong padding scheme?');
  }

  // Find 0x01 separator after PS
  let msgStart = hLen;
  while (msgStart < db.length && db[msgStart] === 0x00) msgStart++;
  if (db[msgStart] !== 0x01) throw new Error('RSA-OAEP: no 0x01 separator');

  return db.slice(msgStart + 1);
}

// ── RSA key generation ───────────────────────────────────────────────────────

export interface KeyMaterial {
  privateJwk: JsonWebKey;   // Stored encrypted in D1
  publicSpkiB64: string;    // Sent to /hmac/key
  keyId: string;            // First 12 chars of publicSpkiB64 — always "MIIBIjANBgkq"
  deviceId: string;         // 16 hex chars
}

export async function generateKeyMaterial(): Promise<KeyMaterial> {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  ) as CryptoKeyPair;

  const privateJwk   = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey;
  const publicSpkiAb = await crypto.subtle.exportKey('spki', kp.publicKey) as ArrayBuffer;
  const publicSpkiB64 = u8ToB64(new Uint8Array(publicSpkiAb));
  const keyId = publicSpkiB64.substring(0, 12); // always "MIIBIjANBgkq" for RSA-2048

  const deviceBytes = crypto.getRandomValues(new Uint8Array(8));
  const deviceId = Array.from(deviceBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  return { privateJwk, publicSpkiB64, keyId, deviceId };
}

// ── DL HMAC key exchange ─────────────────────────────────────────────────────

export interface HmacSecret {
  hmacKey: Uint8Array;   // 44 raw bytes — used directly as HMAC-SHA256 key
  keyId: string;
  deviceId: string;
  expiration: number;    // unix seconds
}

const DL_BASE = 'https://mobile-app-back.davidlloyd.co.uk';
const NATIVE_UA = 'OneApp/150.0.3 (co.uk.davidlloyd.mobileapp; build:515117598; Android SDK 30) OkHttp/4.12.0';

export async function mintHmacSecret(km: KeyMaterial): Promise<HmacSecret> {
  const body = JSON.stringify({ publicKey: km.publicSpkiB64 });
  const resp = await fetch(`${DL_BASE}/hmac/key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': km.deviceId,
      'x-request-id': crypto.randomUUID(),
      'x-session-id': crypto.randomUUID(),
      'User-Agent': NATIVE_UA,
      'Accept-Encoding': 'gzip',
    },
    body,
  });

  if (!resp.ok) throw new Error(`/hmac/key returned ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { key: string; expirationTimestamp: number };

  const ciphertext = b64ToU8(data.key);
  const hmacKey = await rsaOaepSHA256MGF1SHA1Decrypt(ciphertext, km.privateJwk);

  return {
    hmacKey,
    keyId: km.keyId,
    deviceId: km.deviceId,
    expiration: data.expirationTimestamp,
  };
}

// ── HMAC-SHA256 request signing ──────────────────────────────────────────────

async function md5Hex(data: Uint8Array): Promise<string> {
  // MD5 not in Web Crypto; compute manually
  return md5(data);
}

export async function signRequest(
  method: string,
  uri: string,
  body: string,
  secret: HmacSecret
): Promise<{ 'x-device-id': string; 'x-signature': string; 'x-timestamp': string }> {
  const ts = String(Math.floor(Date.now() / 1000));
  const parts = [method.toUpperCase(), uri, 'application/json'];
  if (body.length > 0) parts.push(await md5Hex(new TextEncoder().encode(body)));
  parts.push(secret.deviceId);
  parts.push(ts);
  const canonical = parts.join('\n');

  const hmacKey = await crypto.subtle.importKey(
    'raw', secret.hmacKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(canonical));
  const sigB64 = u8ToB64(new Uint8Array(sigBytes));

  return {
    'x-device-id': secret.deviceId,
    'x-signature': `v1 ${secret.keyId}:${sigB64}`,
    'x-timestamp': ts,
  };
}

// ── AES-256-GCM encryption (for storing credentials in D1) ──────────────────

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const out = new Uint8Array(iv.length + enc.byteLength);
  out.set(iv);
  out.set(new Uint8Array(enc), iv.length);
  return u8ToB64(out);
}

export async function decrypt(ciphertext: string, secret: string): Promise<string> {
  const key  = await deriveKey(secret);
  const data = b64ToU8(ciphertext);
  const iv   = data.slice(0, 12);
  const enc  = data.slice(12);
  const dec  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc);
  return new TextDecoder().decode(dec);
}

// ── Minimal MD5 (needed for HMAC canonical body MD5 field) ──────────────────
// Pure-JS MD5 — no external dependency needed

function md5(data: Uint8Array): string {
  // Based on RFC 1321 reference implementation
  const msg = new Uint8Array(data);
  const msgLen = msg.length;
  const bitLen = msgLen * 8;

  // Pre-processing: pad message
  const padded = new Uint8Array(Math.ceil((msgLen + 9) / 64) * 64);
  padded.set(msg);
  padded[msgLen] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  // Initial hash values
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  const T: number[] = [];
  for (let i = 1; i <= 64; i++) T[i] = Math.floor(Math.abs(Math.sin(i)) * 0x100000000) >>> 0;

  const rol = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  const u32 = (x: number) => x >>> 0;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(offset + j * 4, true);

    let aa = a, bb = b, cc = c, dd = d;

    const F = (x: number, y: number, z: number) => u32((x & y) | (~x & z));
    const G = (x: number, y: number, z: number) => u32((x & z) | (y & ~z));
    const H = (x: number, y: number, z: number) => u32(x ^ y ^ z);
    const I = (x: number, y: number, z: number) => u32(y ^ (x | ~z));

    const round = (fn: (x: number, y: number, z: number) => number,
                   v: number, w: number, x: number, y: number,
                   k: number, s: number, ti: number) =>
      u32(w + rol(u32(v + fn(w, x, y) + M[k] + T[ti]), s));

    // Round 1
    a = round(F, a, b, c, d, 0, 7, 1);   d = round(F, d, a, b, c, 1, 12, 2);
    c = round(F, c, d, a, b, 2, 17, 3);  b = round(F, b, c, d, a, 3, 22, 4);
    a = round(F, a, b, c, d, 4, 7, 5);   d = round(F, d, a, b, c, 5, 12, 6);
    c = round(F, c, d, a, b, 6, 17, 7);  b = round(F, b, c, d, a, 7, 22, 8);
    a = round(F, a, b, c, d, 8, 7, 9);   d = round(F, d, a, b, c, 9, 12, 10);
    c = round(F, c, d, a, b, 10, 17, 11); b = round(F, b, c, d, a, 11, 22, 12);
    a = round(F, a, b, c, d, 12, 7, 13); d = round(F, d, a, b, c, 13, 12, 14);
    c = round(F, c, d, a, b, 14, 17, 15); b = round(F, b, c, d, a, 15, 22, 16);
    // Round 2
    a = round(G, a, b, c, d, 1, 5, 17);  d = round(G, d, a, b, c, 6, 9, 18);
    c = round(G, c, d, a, b, 11, 14, 19); b = round(G, b, c, d, a, 0, 20, 20);
    a = round(G, a, b, c, d, 5, 5, 21);  d = round(G, d, a, b, c, 10, 9, 22);
    c = round(G, c, d, a, b, 15, 14, 23); b = round(G, b, c, d, a, 4, 20, 24);
    a = round(G, a, b, c, d, 9, 5, 25);  d = round(G, d, a, b, c, 14, 9, 26);
    c = round(G, c, d, a, b, 3, 14, 27); b = round(G, b, c, d, a, 8, 20, 28);
    a = round(G, a, b, c, d, 13, 5, 29); d = round(G, d, a, b, c, 2, 9, 30);
    c = round(G, c, d, a, b, 7, 14, 31); b = round(G, b, c, d, a, 12, 20, 32);
    // Round 3
    a = round(H, a, b, c, d, 5, 4, 33);  d = round(H, d, a, b, c, 8, 11, 34);
    c = round(H, c, d, a, b, 11, 16, 35); b = round(H, b, c, d, a, 14, 23, 36);
    a = round(H, a, b, c, d, 1, 4, 37);  d = round(H, d, a, b, c, 4, 11, 38);
    c = round(H, c, d, a, b, 7, 16, 39); b = round(H, b, c, d, a, 10, 23, 40);
    a = round(H, a, b, c, d, 13, 4, 41); d = round(H, d, a, b, c, 0, 11, 42);
    c = round(H, c, d, a, b, 3, 16, 43); b = round(H, b, c, d, a, 6, 23, 44);
    a = round(H, a, b, c, d, 9, 4, 45);  d = round(H, d, a, b, c, 12, 11, 46);
    c = round(H, c, d, a, b, 15, 16, 47); b = round(H, b, c, d, a, 2, 23, 48);
    // Round 4
    a = round(I, a, b, c, d, 0, 6, 49);  d = round(I, d, a, b, c, 7, 10, 50);
    c = round(I, c, d, a, b, 14, 15, 51); b = round(I, b, c, d, a, 5, 21, 52);
    a = round(I, a, b, c, d, 12, 6, 53); d = round(I, d, a, b, c, 3, 10, 54);
    c = round(I, c, d, a, b, 10, 15, 55); b = round(I, b, c, d, a, 1, 21, 56);
    a = round(I, a, b, c, d, 8, 6, 57);  d = round(I, d, a, b, c, 15, 10, 58);
    c = round(I, c, d, a, b, 6, 15, 59); b = round(I, b, c, d, a, 13, 21, 60);
    a = round(I, a, b, c, d, 4, 6, 61);  d = round(I, d, a, b, c, 11, 10, 62);
    c = round(I, c, d, a, b, 2, 15, 63); b = round(I, b, c, d, a, 9, 21, 64);

    a = u32(a + aa); b = u32(b + bb); c = u32(c + cc); d = u32(d + dd);
  }

  const result = new Uint8Array(16);
  const rdv = new DataView(result.buffer);
  rdv.setUint32(0, a, true); rdv.setUint32(4, b, true);
  rdv.setUint32(8, c, true); rdv.setUint32(12, d, true);
  return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
}
