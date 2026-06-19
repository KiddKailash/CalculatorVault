import { pbkdf2Sync as nodePbkdf2Sync, randomBytes as nodeRandomBytes } from 'crypto';

const QuickCrypto = {
  pbkdf2Sync(
    password: string | Uint8Array,
    salt: Uint8Array,
    iterations: number,
    keylen: number,
    digest: string,
  ): Uint8Array {
    const pw = typeof password === 'string' ? password : Buffer.from(password);
    const out = nodePbkdf2Sync(pw, Buffer.from(salt), iterations, keylen, digest);
    return Uint8Array.from(out);
  },
  randomBytes(size: number): Uint8Array {
    return Uint8Array.from(nodeRandomBytes(size));
  },
};

export default QuickCrypto;
export const pbkdf2Sync = QuickCrypto.pbkdf2Sync;
export const randomBytes = QuickCrypto.randomBytes;
