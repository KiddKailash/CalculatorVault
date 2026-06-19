import {
  base64ToBytes,
  buildVerifier,
  bytesToBase64,
  bytesToHex,
  bytesToUtf8,
  checkVerifier,
  constantTimeEqual,
  CRYPTO_VERSION,
  decryptBytes,
  deriveKeys,
  encryptBytes,
  generateOpaqueId,
  hexToBytes,
  IntegrityError,
  IV_BYTES,
  MAC_BYTES,
  randomBytes,
  utf8ToBytes,
} from '../src/vault/_VaultCrypto';

const PASSWORD = '1+2×3';
const SALT = new Uint8Array(16).fill(7);

describe('randomBytes', () => {
  it('returns the requested length', () => {
    expect(randomBytes(16)).toHaveLength(16);
    expect(randomBytes(32)).toHaveLength(32);
  });

  it('does not return all zeros for reasonable lengths', () => {
    const b = randomBytes(32);
    expect(b.some((x) => x !== 0)).toBe(true);
  });

  it('produces different values across calls', () => {
    const a = bytesToHex(randomBytes(32));
    const b = bytesToHex(randomBytes(32));
    expect(a).not.toBe(b);
  });
});

describe('constantTimeEqual', () => {
  it('returns true for identical arrays', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });
  it('returns false for different content', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });
  it('returns false for different lengths', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('hex / base64 / utf8 round-trips', () => {
  it('hex round-trips', () => {
    const b = new Uint8Array([0, 1, 15, 16, 254, 255]);
    expect(hexToBytes(bytesToHex(b))).toEqual(b);
  });
  it('base64 round-trips', () => {
    const b = new Uint8Array([0, 1, 2, 3, 4, 5, 250, 251, 252, 253, 254, 255]);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
  });
  it('utf8 round-trips', () => {
    const s = 'héllo, wörld 🔐';
    expect(bytesToUtf8(utf8ToBytes(s))).toBe(s);
  });
});

describe('deriveKeys', () => {
  it('produces stable keys for same password+salt', () => {
    const a = deriveKeys(PASSWORD, SALT);
    const b = deriveKeys(PASSWORD, SALT);
    expect(a.encKey.toString()).toBe(b.encKey.toString());
    expect(a.macKey.toString()).toBe(b.macKey.toString());
  });

  it('produces different keys for different passwords', () => {
    const a = deriveKeys(PASSWORD, SALT);
    const b = deriveKeys(PASSWORD + 'x', SALT);
    expect(a.encKey.toString()).not.toBe(b.encKey.toString());
  });

  it('produces different keys for different salts', () => {
    const s2 = new Uint8Array(16).fill(8);
    const a = deriveKeys(PASSWORD, SALT);
    const b = deriveKeys(PASSWORD, s2);
    expect(a.encKey.toString()).not.toBe(b.encKey.toString());
  });

  it('enc and mac keys are not identical', () => {
    const a = deriveKeys(PASSWORD, SALT);
    expect(a.encKey.toString()).not.toBe(a.macKey.toString());
  });
});

describe('encrypt / decrypt', () => {
  const keys = deriveKeys(PASSWORD, SALT);

  it('round-trips empty plaintext', () => {
    const ct = encryptBytes(keys, new Uint8Array());
    expect(decryptBytes(keys, ct)).toEqual(new Uint8Array());
  });

  it('round-trips ascii text', () => {
    const pt = utf8ToBytes('hello world');
    const ct = encryptBytes(keys, pt);
    expect(decryptBytes(keys, ct)).toEqual(pt);
  });

  it('round-trips binary blob', () => {
    const pt = new Uint8Array(1024);
    for (let i = 0; i < pt.length; i++) pt[i] = (i * 7) & 0xff;
    const ct = encryptBytes(keys, pt);
    expect(decryptBytes(keys, ct)).toEqual(pt);
  });

  it('emits version byte', () => {
    const ct = encryptBytes(keys, utf8ToBytes('x'));
    expect(ct[0]).toBe(CRYPTO_VERSION);
  });

  it('includes IV and MAC of declared sizes', () => {
    const pt = utf8ToBytes('x');
    const ct = encryptBytes(keys, pt);
    expect(ct.length).toBeGreaterThan(1 + IV_BYTES + MAC_BYTES);
  });

  it('different ciphertexts for same plaintext (random IV)', () => {
    const pt = utf8ToBytes('same');
    const a = bytesToHex(encryptBytes(keys, pt));
    const b = bytesToHex(encryptBytes(keys, pt));
    expect(a).not.toBe(b);
  });

  it('throws IntegrityError when ciphertext tampered', () => {
    const ct = encryptBytes(keys, utf8ToBytes('hello'));
    const tampered = new Uint8Array(ct);
    tampered[1 + IV_BYTES + 1] ^= 0x01;
    expect(() => decryptBytes(keys, tampered)).toThrow(IntegrityError);
  });

  it('throws IntegrityError when MAC tampered', () => {
    const ct = encryptBytes(keys, utf8ToBytes('hello'));
    const tampered = new Uint8Array(ct);
    tampered[tampered.length - 1] ^= 0x80;
    expect(() => decryptBytes(keys, tampered)).toThrow(IntegrityError);
  });

  it('throws IntegrityError when IV swapped', () => {
    const ct = encryptBytes(keys, utf8ToBytes('hello'));
    const tampered = new Uint8Array(ct);
    tampered[2] ^= 0xff;
    expect(() => decryptBytes(keys, tampered)).toThrow(IntegrityError);
  });

  it('rejects wrong version byte', () => {
    const ct = encryptBytes(keys, utf8ToBytes('hi'));
    const tampered = new Uint8Array(ct);
    tampered[0] = 99;
    expect(() => decryptBytes(keys, tampered)).toThrow(IntegrityError);
  });

  it('rejects too-short ciphertext', () => {
    expect(() => decryptBytes(keys, new Uint8Array([1, 2, 3]))).toThrow(IntegrityError);
  });

  it('rejects when wrong key used', () => {
    const otherKeys = deriveKeys(PASSWORD + 'oops', SALT);
    const ct = encryptBytes(keys, utf8ToBytes('secret'));
    expect(() => decryptBytes(otherKeys, ct)).toThrow(IntegrityError);
  });
});

describe('verifier', () => {
  const keys = deriveKeys(PASSWORD, SALT);

  it('checks correct verifier', () => {
    const v = buildVerifier(keys);
    expect(checkVerifier(keys, v)).toBe(true);
  });

  it('rejects verifier with wrong keys', () => {
    const v = buildVerifier(keys);
    const other = deriveKeys(PASSWORD + '!', SALT);
    expect(checkVerifier(other, v)).toBe(false);
  });

  it('rejects garbage verifier', () => {
    expect(checkVerifier(keys, new Uint8Array(8))).toBe(false);
  });
});

describe('generateOpaqueId', () => {
  it('produces 32-character hex IDs', () => {
    const id = generateOpaqueId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(generateOpaqueId());
    expect(ids.size).toBe(1000);
  });
});
