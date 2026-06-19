import SecureSession, {
  BACKOFF_BASE_MS,
  MAX_FAILURES_BEFORE_BACKOFF,
  PasswordTooWeakError,
  validatePasswordStrength,
  VaultLockedOutError,
} from '../app/_vault/_SecureSession';
import * as MockStore from './mocks/expo-secure-store';

const GOOD_PASSWORD = '1+2×3=';

beforeEach(() => {
  MockStore.__reset();
});

describe('validatePasswordStrength', () => {
  it('rejects too-short passwords', () => {
    expect(() => validatePasswordStrength('1+2')).toThrow(PasswordTooWeakError);
  });

  it('rejects passwords with no operator', () => {
    expect(() => validatePasswordStrength('123456')).toThrow(PasswordTooWeakError);
  });

  it('accepts strong password', () => {
    expect(() => validatePasswordStrength('1+2×3=4')).not.toThrow();
  });
});

describe('SecureSession init / unlock', () => {
  it('reports not initialized fresh', async () => {
    const s = new SecureSession();
    expect(await s.isInitialized()).toBe(false);
    expect(s.isUnlocked()).toBe(false);
  });

  it('initialize stores salt and verifier and unlocks', async () => {
    const s = new SecureSession();
    await s.initialize(GOOD_PASSWORD);
    expect(s.isUnlocked()).toBe(true);
    expect(await s.isInitialized()).toBe(true);
  });

  it('locks on lock()', async () => {
    const s = new SecureSession();
    await s.initialize(GOOD_PASSWORD);
    s.lock();
    expect(s.isUnlocked()).toBe(false);
    expect(() => s.getKeys()).toThrow();
  });

  it('rejects weak password on init', async () => {
    const s = new SecureSession();
    await expect(s.initialize('123')).rejects.toBeInstanceOf(PasswordTooWeakError);
  });

  it('unlocks again with correct password', async () => {
    const s = new SecureSession();
    await s.initialize(GOOD_PASSWORD);
    s.lock();

    const s2 = new SecureSession();
    const ok = await s2.unlock(GOOD_PASSWORD);
    expect(ok).toBe(true);
    expect(s2.isUnlocked()).toBe(true);
  });

  it('fails to unlock with wrong password', async () => {
    const s = new SecureSession();
    await s.initialize(GOOD_PASSWORD);
    s.lock();

    const s2 = new SecureSession();
    expect(await s2.unlock('9-9×9')).toBe(false);
    expect(s2.isUnlocked()).toBe(false);
  });

  it('derives the same keys across sessions for the same password', async () => {
    const s = new SecureSession();
    await s.initialize(GOOD_PASSWORD);
    const enc1 = s.getKeys().encKey.toString();
    s.lock();

    const s2 = new SecureSession();
    expect(await s2.unlock(GOOD_PASSWORD)).toBe(true);
    expect(s2.getKeys().encKey.toString()).toBe(enc1);
  });
});

describe('SecureSession lockout backoff', () => {
  it('does not lock out before threshold', async () => {
    const s = new SecureSession();
    await s.initialize(GOOD_PASSWORD);
    s.lock();
    const s2 = new SecureSession();
    for (let i = 0; i < MAX_FAILURES_BEFORE_BACKOFF - 1; i++) {
      expect(await s2.unlock('9-9×9')).toBe(false);
    }
    expect(await s2.getRetryAfterMs()).toBe(0);
  });

  it('locks out after threshold and unlocks after backoff', async () => {
    let now = 1_000_000;
    const fixedNow = () => now;
    const init = new SecureSession();
    await init.initialize(GOOD_PASSWORD);
    init.lock();

    const s2 = new SecureSession(undefined, fixedNow);
    for (let i = 0; i < MAX_FAILURES_BEFORE_BACKOFF; i++) {
      expect(await s2.unlock('9-9×9')).toBe(false);
    }
    const retry = await s2.getRetryAfterMs();
    expect(retry).toBeGreaterThan(0);
    await expect(s2.unlock('9-9×9')).rejects.toBeInstanceOf(VaultLockedOutError);

    now += retry + 1000;
    expect(await s2.unlock(GOOD_PASSWORD)).toBe(true);
  });

  it('successful unlock clears failure counter', async () => {
    const s = new SecureSession();
    await s.initialize(GOOD_PASSWORD);
    s.lock();

    const s2 = new SecureSession();
    expect(await s2.unlock('9-9×9')).toBe(false);
    expect(await s2.unlock(GOOD_PASSWORD)).toBe(true);
    s2.lock();

    const s3 = new SecureSession();
    expect(await s3.getRetryAfterMs()).toBe(0);
  });

  it('reset wipes salt, verifier, and counters', async () => {
    const s = new SecureSession();
    await s.initialize(GOOD_PASSWORD);
    await s.reset();
    expect(await s.isInitialized()).toBe(false);
    expect(s.isUnlocked()).toBe(false);
  });

  it('backoff scales exponentially up to cap', async () => {
    const now = 1_000_000;
    const init = new SecureSession();
    await init.initialize(GOOD_PASSWORD);
    init.lock();

    const s = new SecureSession(undefined, () => now);
    for (let i = 0; i < MAX_FAILURES_BEFORE_BACKOFF; i++) {
      await s.unlock('9-9×9');
    }
    expect(await s.getRetryAfterMs()).toBe(BACKOFF_BASE_MS);
  });
});
