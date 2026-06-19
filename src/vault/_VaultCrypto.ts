import * as ExpoCrypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

interface QuickCryptoLike {
  pbkdf2Sync?: (
    password: string | Uint8Array,
    salt: Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ) => Uint8Array;
  randomBytes?: (size: number) => Uint8Array;
}

let quickCryptoCache: QuickCryptoLike | null | undefined;
let isExpoGoCache: boolean | undefined;

const isInExpoGo = (): boolean => {
  if (isExpoGoCache !== undefined) return isExpoGoCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constants = require('expo-constants');
    const resolved = constants?.default ?? constants;
    isExpoGoCache = resolved?.appOwnership === 'expo';
  } catch {
    isExpoGoCache = false;
  }
  return isExpoGoCache;
};

const getQuickCrypto = (): QuickCryptoLike | null => {
  if (quickCryptoCache !== undefined) return quickCryptoCache;
  if (isInExpoGo()) {
    quickCryptoCache = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-quick-crypto');
    quickCryptoCache = (mod?.default ?? mod) as QuickCryptoLike;
  } catch {
    quickCryptoCache = null;
  }
  return quickCryptoCache;
};

export const CRYPTO_VERSION = 1;
export const SALT_BYTES = 16;
export const IV_BYTES = 16;
export const MAC_BYTES = 32;
const KEY_BYTES = 32;

const envIters = (() => {
  const raw =
    typeof process !== 'undefined' ? process.env?.VAULT_PBKDF2_ITERATIONS : undefined;
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
})();

// Trade-off: low iter count keeps pure-JS PBKDF2 (Expo Go fallback) under
// ~50ms per unlock attempt so password-shaped calculations don't freeze the UI.
// This weakens offline brute-force resistance — acceptable here because the
// vault is on-device, gated by OS keychain, and protected by an exponential
// lockout. Raise via VAULT_PBKDF2_ITERATIONS once on a native dev client.
export const PBKDF2_ITERATIONS = envIters ?? 300;

export interface DerivedKeys {
  encKey: CryptoJS.lib.WordArray;
  macKey: CryptoJS.lib.WordArray;
}

const bytesToWordArray = (bytes: Uint8Array): CryptoJS.lib.WordArray => {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
};

const wordArrayToBytes = (wa: CryptoJS.lib.WordArray): Uint8Array => {
  const { words, sigBytes } = wa;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
};

export const VaultCryptoInternals = { bytesToWordArray, wordArrayToBytes };

export const randomBytes = (length: number): Uint8Array => {
  try {
    const qc = getQuickCrypto();
    if (qc?.randomBytes) {
      const buf = qc.randomBytes(length);
      if (buf && buf.length === length) return Uint8Array.from(buf);
    }
  } catch {
    // fall through to next source
  }

  try {
    const fn = (ExpoCrypto as { getRandomBytes?: (n: number) => Uint8Array }).getRandomBytes;
    if (typeof fn === 'function') {
      const bytes = fn(length);
      if (bytes && bytes.length === length) return Uint8Array.from(bytes);
    }
  } catch {
    // fall through to next source
  }

  const g: { crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array } } =
    globalThis as never;
  if (g.crypto?.getRandomValues) {
    const out = new Uint8Array(length);
    g.crypto.getRandomValues(out);
    return out;
  }

  const wa = CryptoJS.lib.WordArray.random(length);
  return wordArrayToBytes(wa);
};

export const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

export const deriveKeys = (password: string, salt: Uint8Array): DerivedKeys => {
  try {
    const qc = getQuickCrypto();
    if (qc?.pbkdf2Sync) {
      const derived = qc.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_BYTES * 2, 'sha256');
      const bytes = Uint8Array.from(derived);
      return {
        encKey: bytesToWordArray(bytes.subarray(0, KEY_BYTES)),
        macKey: bytesToWordArray(bytes.subarray(KEY_BYTES, KEY_BYTES * 2)),
      };
    }
  } catch (error) {
    console.warn('quick-crypto pbkdf2 failed, falling back to CryptoJS:', error);
  }

  const material = CryptoJS.PBKDF2(password, bytesToWordArray(salt), {
    keySize: (KEY_BYTES * 2) / 4,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
  const encWords = material.words.slice(0, KEY_BYTES / 4);
  const macWords = material.words.slice(KEY_BYTES / 4, (KEY_BYTES * 2) / 4);
  return {
    encKey: CryptoJS.lib.WordArray.create(encWords, KEY_BYTES),
    macKey: CryptoJS.lib.WordArray.create(macWords, KEY_BYTES),
  };
};

export const encryptBytes = (keys: DerivedKeys, plaintext: Uint8Array): Uint8Array => {
  const iv = randomBytes(IV_BYTES);
  const ivWa = bytesToWordArray(iv);
  const cipherParams = CryptoJS.AES.encrypt(bytesToWordArray(plaintext), keys.encKey, {
    iv: ivWa,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const ciphertext = wordArrayToBytes(cipherParams.ciphertext);

  const header = new Uint8Array(1);
  header[0] = CRYPTO_VERSION;

  const macInput = new Uint8Array(header.length + iv.length + ciphertext.length);
  macInput.set(header, 0);
  macInput.set(iv, header.length);
  macInput.set(ciphertext, header.length + iv.length);

  const tag = wordArrayToBytes(
    CryptoJS.HmacSHA256(bytesToWordArray(macInput), keys.macKey),
  );

  const out = new Uint8Array(macInput.length + tag.length);
  out.set(macInput, 0);
  out.set(tag, macInput.length);
  return out;
};

export class IntegrityError extends Error {
  constructor(message = 'Vault integrity check failed') {
    super(message);
    this.name = 'IntegrityError';
  }
}

export const decryptBytes = (keys: DerivedKeys, blob: Uint8Array): Uint8Array => {
  const headerLen = 1;
  const minLen = headerLen + IV_BYTES + MAC_BYTES;
  if (blob.length < minLen) throw new IntegrityError('Ciphertext too short');
  if (blob[0] !== CRYPTO_VERSION) throw new IntegrityError('Unsupported vault version');

  const tagOffset = blob.length - MAC_BYTES;
  const macInput = blob.subarray(0, tagOffset);
  const tag = blob.subarray(tagOffset);

  const expected = wordArrayToBytes(
    CryptoJS.HmacSHA256(bytesToWordArray(macInput), keys.macKey),
  );
  if (!constantTimeEqual(tag, expected)) throw new IntegrityError();

  const iv = blob.subarray(headerLen, headerLen + IV_BYTES);
  const ciphertext = blob.subarray(headerLen + IV_BYTES, tagOffset);

  const plaintext = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: bytesToWordArray(ciphertext) }),
    keys.encKey,
    { iv: bytesToWordArray(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
  );
  return wordArrayToBytes(plaintext);
};

const VERIFIER_PLAINTEXT = new TextEncoder().encode('vault-verifier-v1');

export const buildVerifier = (keys: DerivedKeys): Uint8Array =>
  encryptBytes(keys, VERIFIER_PLAINTEXT);

export const checkVerifier = (keys: DerivedKeys, verifier: Uint8Array): boolean => {
  try {
    const decoded = decryptBytes(keys, verifier);
    return constantTimeEqual(decoded, VERIFIER_PLAINTEXT);
  } catch {
    return false;
  }
};

const HEX_TABLE = '0123456789abcdef';
export const bytesToHex = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += HEX_TABLE[bytes[i] >>> 4] + HEX_TABLE[bytes[i] & 0x0f];
  }
  return out;
};

export const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
};

export const bytesToBase64 = (bytes: Uint8Array): string =>
  CryptoJS.enc.Base64.stringify(bytesToWordArray(bytes));

export const base64ToBytes = (b64: string): Uint8Array =>
  wordArrayToBytes(CryptoJS.enc.Base64.parse(b64));

export const utf8ToBytes = (s: string): Uint8Array => new TextEncoder().encode(s);
export const bytesToUtf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

export const generateOpaqueId = (): string => bytesToHex(randomBytes(16));
