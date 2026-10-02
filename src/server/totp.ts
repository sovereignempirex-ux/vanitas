// RFC 6238 TOTP (SHA-1, 6 digits, 30s step) implemented with node:crypto so
// two-factor authentication is REAL without adding any dependency.
// The secret never leaves the server except during setup, and codes are
// verified against ±1 time-step drift to tolerate clock skew.
import crypto from 'crypto';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32 input');
    value = (value << 5) | idx;
    bits += 5;
    while (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** New random base32 secret (160 bits) for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function totpAt(secretB32: string, counter: number): string {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter < 0 ? 0 : counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Current honest 6-digit code for a secret (used by tests/tooling). */
export function currentTotp(secretB32: string): string {
  return totpAt(secretB32, Math.floor(Date.now() / 30_000));
}

/** Verify a user-supplied 6-digit code (±1 time step drift). */
export function verifyTotp(secretB32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 30_000);
  return (
    totpAt(secretB32, counter - 1) === code ||
    totpAt(secretB32, counter) === code ||
    totpAt(secretB32, counter + 1) === code
  );
}

/** otpauth:// URL so authenticator apps can add the account (scan or manual key). */
export function totpOtpauthUrl(email: string, secret: string): string {
  const label = `Vanitas:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=Vanitas&algorithm=SHA1&digits=6&period=30`;
}
