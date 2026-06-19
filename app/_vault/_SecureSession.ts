import {
  base64ToBytes,
  buildVerifier,
  bytesToBase64,
  checkVerifier,
  deriveKeys,
  DerivedKeys,
  randomBytes,
  SALT_BYTES,
} from './_VaultCrypto';

export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const KEY_SALT = 'vault.salt.v1';
const KEY_VERIFIER = 'vault.verifier.v1';
const KEY_FAILURES = 'vault.failures.v1';
const KEY_LOCKED_UNTIL = 'vault.lockedUntil.v1';

export const MAX_FAILURES_BEFORE_BACKOFF = 5;
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 60 * 60 * 1000;
export const MIN_PASSWORD_TOKENS = 6;
export const PASSWORD_OPERATORS = ['+', '-', '×', '÷', '%', '±'] as const;

export class PasswordTooWeakError extends Error {
  constructor(message = 'Password must include at least 6 inputs and one operator') {
    super(message);
    this.name = 'PasswordTooWeakError';
  }
}

export class VaultLockedOutError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Vault is locked. Retry in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'VaultLockedOutError';
    this.retryAfterMs = retryAfterMs;
  }
}

export const validatePasswordStrength = (password: string): void => {
  if (password.length < MIN_PASSWORD_TOKENS) throw new PasswordTooWeakError();
  const hasOperator = PASSWORD_OPERATORS.some((op) => password.includes(op));
  if (!hasOperator) throw new PasswordTooWeakError();
};

export default class SecureSession {
  private keys: DerivedKeys | null = null;
  private readonly store: SecureStoreLike;
  private readonly now: () => number;

  constructor(store?: SecureStoreLike, now: () => number = Date.now) {
    if (store) {
      this.store = store;
    } else {
      // Lazy import to keep the module test-friendly (web vs native split)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const adapter = require('./_PlatformSecureStore').default as SecureStoreLike;
      this.store = adapter;
    }
    this.now = now;
  }

  isUnlocked(): boolean {
    return this.keys !== null;
  }

  getKeys(): DerivedKeys {
    if (!this.keys) throw new Error('Vault is locked');
    return this.keys;
  }

  lock(): void {
    this.keys = null;
  }

  async isInitialized(): Promise<boolean> {
    const salt = await this.store.getItemAsync(KEY_SALT);
    const verifier = await this.store.getItemAsync(KEY_VERIFIER);
    return salt !== null && verifier !== null;
  }

  async initialize(password: string): Promise<void> {
    validatePasswordStrength(password);
    const salt = randomBytes(SALT_BYTES);
    const keys = deriveKeys(password, salt);
    const verifier = buildVerifier(keys);
    await this.store.setItemAsync(KEY_SALT, bytesToBase64(salt));
    await this.store.setItemAsync(KEY_VERIFIER, bytesToBase64(verifier));
    await this.store.deleteItemAsync(KEY_FAILURES);
    await this.store.deleteItemAsync(KEY_LOCKED_UNTIL);
    this.keys = keys;
  }

  async getRetryAfterMs(): Promise<number> {
    const lockedUntilStr = await this.store.getItemAsync(KEY_LOCKED_UNTIL);
    if (!lockedUntilStr) return 0;
    const lockedUntil = parseInt(lockedUntilStr, 10);
    if (!Number.isFinite(lockedUntil)) return 0;
    return Math.max(0, lockedUntil - this.now());
  }

  async unlock(password: string): Promise<boolean> {
    const retryAfter = await this.getRetryAfterMs();
    if (retryAfter > 0) throw new VaultLockedOutError(retryAfter);

    const saltB64 = await this.store.getItemAsync(KEY_SALT);
    const verifierB64 = await this.store.getItemAsync(KEY_VERIFIER);
    if (!saltB64 || !verifierB64) return false;

    const keys = deriveKeys(password, base64ToBytes(saltB64));
    const ok = checkVerifier(keys, base64ToBytes(verifierB64));

    if (ok) {
      this.keys = keys;
      await this.store.deleteItemAsync(KEY_FAILURES);
      await this.store.deleteItemAsync(KEY_LOCKED_UNTIL);
      return true;
    }

    await this.recordFailure();
    return false;
  }

  private async recordFailure(): Promise<void> {
    const prev = parseInt((await this.store.getItemAsync(KEY_FAILURES)) ?? '0', 10) || 0;
    const next = prev + 1;
    await this.store.setItemAsync(KEY_FAILURES, String(next));
    if (next >= MAX_FAILURES_BEFORE_BACKOFF) {
      const over = next - MAX_FAILURES_BEFORE_BACKOFF;
      const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** over);
      await this.store.setItemAsync(KEY_LOCKED_UNTIL, String(this.now() + delay));
    }
  }

  async reset(): Promise<void> {
    this.keys = null;
    await this.store.deleteItemAsync(KEY_SALT);
    await this.store.deleteItemAsync(KEY_VERIFIER);
    await this.store.deleteItemAsync(KEY_FAILURES);
    await this.store.deleteItemAsync(KEY_LOCKED_UNTIL);
  }
}
